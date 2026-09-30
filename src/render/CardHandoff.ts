/** Keep landed animation cards visible until the authoritative pile is ready. */
export class CardHandoff {
  private held = new Map<() => void, string>();
  private revision = 0;
  retain(eventKey: string, release: () => void): void { this.held.set(release, eventKey); }
  async sync(eventKey: string, pending: boolean, ready: Promise<unknown>): Promise<void> {
    const revision = ++this.revision;
    const held=[...this.held];
    await ready;
    if (revision !== this.revision) return;
    for (const [release, previousKey] of held) {
      if (pending && previousKey === eventKey) continue;
      this.held.delete(release);
      release();
    }
  }
  clear(): void {
    this.revision++;
    for (const release of this.held.keys()) release();
    this.held.clear();
  }
}
