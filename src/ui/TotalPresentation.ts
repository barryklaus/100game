export type TotalDisplay = { total: number; caption: string };

/** Holds only presentation; authoritative game totals and turn rules stay immediate. */
export class TotalPresentation {
  private round = '';
  private key = '';
  private next: TotalDisplay = { total: 0, caption: '' };
  visible: TotalDisplay = this.next;
  pending = false;

  sync(round: string, key: string, next: TotalDisplay, animate: boolean): void {
    const reset = !round || round !== this.round;
    const newCard = !!key && key !== this.key;
    this.round = round;
    this.key = key;
    this.next = next;
    if (reset || !animate || !key) {
      this.pending = false;
      this.visible = next;
    } else if (newCard) {
      this.pending = true;
    } else if (!this.pending) {
      this.visible = next;
    }
  }

  arrive(key: string): boolean {
    if (!this.pending || key !== this.key) return false;
    this.visible = this.next;
    this.pending = false;
    return true;
  }
}
