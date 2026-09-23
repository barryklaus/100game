// Feeds pointer position into the DOM fallback's border-only foil. The 3D
// cards have their own matching border shader that follows their real tilt.
export class HoloShader {
  private isEnabled = true;
  private active: HTMLElement | null = null;

  constructor() {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
  }

  get enabled(): boolean { return this.isEnabled; }
  set enabled(value: boolean) {
    this.isEnabled = value;
    document.documentElement.classList.toggle('card-effects-on', value);
    if (!value) this.clearActive();
  }

  private clearActive(): void {
    if (!this.active) return;
    this.active.style.removeProperty('--card-tilt-x');
    this.active.style.removeProperty('--card-tilt-y');
    this.active.style.removeProperty('--holo-x');
    this.active.style.removeProperty('--holo-y');
    this.active.removeAttribute('data-card-hover');
    this.active.removeAttribute('data-card-pressed');
    this.active = null;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.isEnabled) return;
    const card = (event.target as Element | null)?.closest<HTMLElement>('.playing-card:not(.waiting-hand)') ?? null;
    if (card !== this.active) {
      this.clearActive();
      this.active = card;
    }
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
    card.style.setProperty('--card-tilt-x', `${((.5 - y) * 7).toFixed(2)}deg`);
    card.style.setProperty('--card-tilt-y', `${((x - .5) * 9).toFixed(2)}deg`);
    card.style.setProperty('--holo-x', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--holo-y', `${(y * 100).toFixed(1)}%`);
    card.dataset.cardHover = 'true';
  };

  private onPointerDown = (event: PointerEvent): void => {
    const card = (event.target as Element | null)?.closest<HTMLElement>('.playing-card:not(.waiting-hand)');
    if (this.isEnabled && card) card.dataset.cardPressed = 'true';
  };

  private onPointerUp = (): void => {
    this.active?.removeAttribute('data-card-pressed');
  };

  dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.clearActive();
    document.documentElement.classList.remove('card-effects-on');
  }
}
