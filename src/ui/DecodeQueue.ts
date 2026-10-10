/** Native image decoding allocates outside the JS heap. Bound simultaneous work. */
export class DecodeQueue {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private readonly limit = 2) {}
  async run<T>(task: () => Promise<T>): Promise<T> {
    await new Promise<void>(resolve => {
      if (this.active < this.limit) { this.active++; resolve(); }
      else this.waiting.push(resolve);
    });
    try { return await task(); }
    finally {
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }
}
