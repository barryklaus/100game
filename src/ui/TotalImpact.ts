import { totalMarkup } from './totalFeedback';

/** A short, composited impact at the same instant the table light commits the total. */
export class TotalImpact {
  private animations: Animation[] = [];
  private ghost?: HTMLElement;
  private generation = 0;
  private round = '';
  private total?: number;
  private element?: HTMLElement;

  /** Follow the displayed total, including HTML fallback, without replaying on turn/UI renders. */
  sync(element: HTMLElement | null, round: string, total: number, reducedMotion: boolean): void {
    const reset = !element || !round || round !== this.round;
    const previous = this.total;
    const replaced = element !== this.element;
    this.round = round;
    this.total = element && round ? total : undefined;
    this.element = element ?? undefined;
    if (reset) {
      this.cancel();
      return;
    }
    if (previous !== undefined && previous !== total) {
      this.show(element, previous, total, reducedMotion);
    } else if (reducedMotion || replaced) {
      this.cancel();
    }
  }

  cancel(): void {
    ++this.generation;
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    this.ghost?.remove();
    this.ghost = undefined;
  }

  show(element: HTMLElement, previous: number, total: number, reducedMotion: boolean): void {
    this.cancel();
    element.innerHTML = totalMarkup(total);
    // Overflow keeps its existing explosion. Zero and reverse don't invent a number change.
    if (reducedMotion || previous === total || total > 100 || !element.animate) return;
    const value = element.querySelector<HTMLElement>('.total-value');
    if (!value) return;
    const generation = this.generation;
    const ghost = document.createElement('span');
    ghost.className = 'total-impact-ghost';
    ghost.textContent = String(previous);
    ghost.setAttribute('aria-hidden', 'true');
    element.append(ghost);
    this.ghost = ghost;
    const departing = ghost.animate([
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(-.12em) scale(.95)', opacity: 0 },
    ], { duration: 130, easing: 'ease-out', fill: 'forwards' });
    // The approved Impact settle: rise in, overshoot, then compress onto the baseline.
    const arriving = value.animate([
      { transform: 'translateY(.12em) scale(.86,.94)', opacity: 0 },
      { transform: 'translateY(-.035em) scale(1.12,1.05)', opacity: 1, offset: .44 },
      { transform: 'translateY(.01em) scale(.985,1.02)', opacity: 1, offset: .76 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ], { duration: 380, easing: 'cubic-bezier(.2,.75,.25,1)' });
    this.animations = [departing, arriving];
    void departing.finished.then(() => ghost.remove(), () => ghost.remove());
    const finish = () => { if (this.generation === generation) this.cancel(); };
    void arriving.finished.then(finish, finish);
  }
}
