import { totalMarkup } from './totalFeedback';

/** A short, composited impact at the same instant the table light commits the total. */
export class TotalImpact {
  private animations: Animation[] = [];
  private ghost?: HTMLElement;
  private generation = 0;

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
    // Grow upward from the baseline, keeping the hand controls clear on short screens.
    const arriving = value.animate([
      { transform: 'translateY(.025em) scale(.86,.94)', opacity: 0 },
      { transform: 'translateY(-.035em) scale(1.12,1.05)', opacity: 1, offset: .44 },
      { transform: 'translateY(0) scale(.985,1.02)', opacity: 1, offset: .76 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ], { duration: 380, easing: 'cubic-bezier(.2,.75,.25,1)' });
    this.animations = [departing, arriving];
    void departing.finished.then(() => ghost.remove(), () => ghost.remove());
    const finish = () => { if (this.generation === generation) this.cancel(); };
    void arriving.finished.then(finish, finish);
  }
}
