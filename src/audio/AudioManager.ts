export class AudioManager {
  private context?: AudioContext;
  volume = .55;
  private tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = .18, slide = 1): void {
    if (!this.volume) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + duration);
    envelope.gain.setValueAtTime(gain * this.volume, now);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(envelope).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
  play(name: 'pickup' | 'slap' | 'draw' | 'target' | 'reverse' | 'zero' | 'minus' | 'exact' | 'bust' | 'click'): void {
    if (name === 'pickup') this.tone(390, .07, 'sine', .11, 1.2);
    if (name === 'slap') { this.tone(125, .12, 'triangle', .32, .35); this.tone(420, .035, 'square', .05, .5); }
    if (name === 'draw') this.tone(290, .1, 'sine', .1, 1.45);
    if (name === 'target') this.tone(600, .22, 'triangle', .14, .65);
    if (name === 'reverse') { this.tone(340, .15, 'sine', .13, 1.7); setTimeout(() => this.tone(540, .17, 'sine', .11, .75), 110); }
    if (name === 'zero') this.tone(490, .3, 'sine', .12, 1);
    if (name === 'minus') this.tone(420, .32, 'triangle', .15, .42);
    if (name === 'exact') { [523,659,784,1047].forEach((f,i) => setTimeout(() => this.tone(f,.24,'sine',.15), i*75)); }
    if (name === 'bust') this.tone(240, .5, 'sawtooth', .2, .25);
    if (name === 'click') this.tone(560, .055, 'sine', .07, 1.1);
  }
}
