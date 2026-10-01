/** Only the presented score drives this track; authoritative game state may be ahead. */
export function suspenseLevel(total: number | null): {rate: number; gain: number} | null {
  if (total === null || !Number.isFinite(total) || total < 70 || total >= 100) return null;
  const tension = (total - 70) / 29;
  return {rate: .72 + .73 * tension, gain: .22 + .58 * tension ** 1.4};
}

export function anxietyLevel(total: number | null): {rate: number; gain: number} | null {
  return total === 100 ? {rate: 1, gain: .8} : null;
}

/** Join the recording's tail into its head once; native looping has no timer gaps. */
export function makeSeamlessLoop(context: AudioContext, original: AudioBuffer): AudioBuffer {
  const overlap = Math.min(Math.floor(original.sampleRate * .04), Math.floor(original.length / 4));
  if (overlap < 2) return original;
  const loop = context.createBuffer(original.numberOfChannels, original.length - overlap, original.sampleRate);
  for (let channel = 0; channel < original.numberOfChannels; channel++) {
    const input = original.getChannelData(channel), output = loop.getChannelData(channel);
    output.set(input.subarray(overlap));
    for (let i = 0; i < overlap; i++) {
      const mix = (1 - Math.cos(Math.PI * i / (overlap - 1))) / 2;
      output[output.length - overlap + i] = input[original.length - overlap + i] * (1 - mix) + input[i] * mix;
    }
  }
  return loop;
}

/** One source per entry into the cue range; only Anxiety loops continuously. */
export class SuspenseTrack {
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private envelope?: GainNode;
  private total: number | null = null;
  private disposed = false;
  private spent = false;
  private enabled = true;

  constructor(
    private context: AudioContext,
    private output: AudioNode,
    private level = suspenseLevel,
    private prepare = (_context: AudioContext, buffer: AudioBuffer): AudioBuffer => buffer,
    private loop = false,
  ) {}

  setBuffer(buffer: AudioBuffer): void {
    if (this.disposed) return;
    this.buffer = this.prepare(this.context, buffer);
    this.apply(); // A late decode must use the latest presented score.
  }

  setTotal(total: number | null, enabled = true): void {
    if (this.disposed || (total === this.total && enabled === this.enabled)) return;
    if (!this.level(total)) this.spent = false;
    this.total = total;
    this.enabled = enabled;
    this.apply();
  }

  private apply(): void {
    const level = this.level(this.total);
    if (!level) {
      this.stop(this.total !== null && this.total > 100 ? .006 : .08);
      return;
    }
    if (!this.enabled) {
      this.stop(.08);
      if (!this.loop) this.spent = true; // Unmute/visibility changes must not replay a consumed cue.
      return;
    }
    if (!this.buffer) return;
    const now = this.context.currentTime;
    if (!this.source) {
      if (!this.loop && this.spent) return;
      const source = this.context.createBufferSource(), envelope = this.context.createGain();
      source.buffer = this.buffer;
      source.loop = this.loop;
      envelope.gain.setValueAtTime(0, now);
      source.connect(envelope).connect(this.output);
      source.onended = () => {
        source.disconnect(); envelope.disconnect();
        if (this.source === source) {this.source = undefined; this.envelope = undefined;}
      };
      source.playbackRate.setValueAtTime(level.rate, now);
      source.start(now);
      this.source = source;
      this.envelope = envelope;
      this.spent = true;
    }
    // Both changes begin on the exact audio clock instant of the visible score commit.
    this.source.playbackRate.setTargetAtTime(level.rate, now, .025);
    this.envelope!.gain.setTargetAtTime(level.gain, now, .015);
  }

  private stop(fade: number): void {
    if (!this.source || !this.envelope) return;
    const now = this.context.currentTime;
    this.envelope.gain.cancelAndHoldAtTime(now);
    this.envelope.gain.linearRampToValueAtTime(0, now + fade);
    this.source.stop(now + fade);
    this.source = undefined;
    this.envelope = undefined;
  }

  dispose(): void {this.disposed = true; this.stop(0); this.buffer = undefined;}
}
