/** Only the presented score drives this track; authoritative game state may be ahead. */
export function suspenseLevel(total: number | null): {rate: number; gain: number} | null {
  if (total === null || !Number.isFinite(total) || total < 70 || total > 100) return null;
  const tension = (total - 70) / 30;
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

/** Sustain the body of the short recording, excluding its attack and silent tail. */
export function makeSuspenseLoop(context: AudioContext, original: AudioBuffer): AudioBuffer {
  const start = Math.floor(original.sampleRate * .1);
  const end = Math.min(original.length, Math.floor(original.sampleRate * .75));
  const length = end - start;
  const overlap = Math.min(Math.floor(original.sampleRate * .06), Math.floor(length / 4));
  if (length < 2 || overlap < 2) return original;
  const channels = Array.from({length:original.numberOfChannels},(_,i)=>original.getChannelData(i));
  const energy = new Float64Array(length + 1);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let channel = 0; channel < original.numberOfChannels; channel++) {
      const sample = channels[channel][start + i];
      sum += sample * sample;
    }
    energy[i + 1] = energy[i] + sum / original.numberOfChannels;
  }
  const radius = Math.floor(original.sampleRate * .02);
  const gains = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const left = Math.max(0, i - radius), right = Math.min(length, i + radius + 1);
    const rms = Math.sqrt((energy[right] - energy[left]) / (right - left));
    gains[i] = Math.min(8, .16 / Math.max(.02, rms));
  }
  const loop = context.createBuffer(original.numberOfChannels, length - overlap, original.sampleRate);
  for (let channel = 0; channel < original.numberOfChannels; channel++) {
    const input = channels[channel], output = loop.getChannelData(channel);
    const sample = (i: number): number => Math.max(-.95, Math.min(.95, input[start + i] * gains[i]));
    for (let i = 0; i < output.length; i++) output[i] = sample(i + overlap);
    for (let i = 0; i < overlap; i++) {
      const mix = (1 - Math.cos(Math.PI * i / (overlap - 1))) / 2;
      output[output.length - overlap + i] = sample(length - overlap + i) * (1 - mix) + sample(i) * mix;
    }
  }
  return loop;
}

/** One loop, no frame polling and no restart when the displayed score changes. */
export class SuspenseTrack {
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private envelope?: GainNode;
  private total: number | null = null;
  private disposed = false;

  constructor(
    private context: AudioContext,
    private output: AudioNode,
    private level = suspenseLevel,
    private prepare = makeSuspenseLoop,
  ) {}

  setBuffer(buffer: AudioBuffer): void {
    if (this.disposed) return;
    this.buffer = this.prepare(this.context, buffer);
    this.apply(); // A late decode must use the latest presented score.
  }

  setTotal(total: number | null): void {
    if (this.disposed || total === this.total) return;
    this.total = total;
    this.apply();
  }

  private apply(): void {
    const level = this.level(this.total);
    if (!level) {
      this.stop(this.total !== null && this.total > 100 ? .006 : .08);
      return;
    }
    if (!this.buffer) return;
    const now = this.context.currentTime;
    if (!this.source) {
      const source = this.context.createBufferSource(), envelope = this.context.createGain();
      source.buffer = this.buffer;
      source.loop = true;
      envelope.gain.setValueAtTime(0, now);
      source.connect(envelope).connect(this.output);
      source.onended = () => {source.disconnect(); envelope.disconnect();};
      source.playbackRate.setValueAtTime(level.rate, now);
      source.start(now);
      this.source = source;
      this.envelope = envelope;
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
