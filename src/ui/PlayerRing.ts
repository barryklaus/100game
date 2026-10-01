import { faceFrame, nearestCenter, ringSeat, type CharacterFrame } from './PlayerRingModel';

type RingState = { roundKey: string; count: number; active: number; total: number; overflow: boolean; reducedMotion: boolean; target: boolean };
/** Event-driven sprite frames; the ring has no idle animation loop. */
export class PlayerRing {
  private state: RingState = { roundKey: '', count: 0, active: 0, total: 0, overflow: false, reducedMotion: false, target: false };
  private center = .5;
  private targetCenter = .5;
  private raf = 0;
  private moving?: Promise<void>;
  private finishMove?: () => void;
  private dragging?: { id: number; x: number; center: number; element: HTMLElement; moved: boolean };
  private deferredFocus: number | undefined;
  private dragReleased?: Promise<void>;
  private finishDrag?: () => void;
  private suppressClickUntil = 0;
  private throws = new Map<number, CharacterFrame>();
  private preparing = new Set<number>();
  private recoverTimers = new Map<number, number>();
  private drawWaiters = new Map<number, { promise: Promise<void>; resolve: () => void }>();
  private relieved = -1;
  private reliefTimer = 0;
  private epoch = 0;
  private loaded = new Map<string, Promise<void>>();
  private readyUrls = new Set<string>();

  constructor(private root: HTMLElement) {
    root.addEventListener('pointerdown', this.down);
    root.addEventListener('pointermove', this.move);
    root.addEventListener('pointerup', this.up);
    root.addEventListener('pointercancel', this.up);
    root.addEventListener('click', event => {
      if (performance.now() < this.suppressClickUntil && (event.target as HTMLElement).closest('.seat-layer')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('resize', () => this.paint());
  }

  sync(next: RingState): void {
    const roundChanged = this.state.roundKey !== next.roundKey;
    const actorChanged = this.state.active !== next.active;
    this.state = next;
    if (roundChanged) {
      this.epoch++;
      this.cancelMove();
      this.dragging = undefined;
      this.finishDrag?.(); this.finishDrag = undefined; this.dragReleased = undefined;
      this.deferredFocus = undefined;
      this.throws.clear();
      this.preparing.clear();
      this.drawWaiters.forEach(waiter => waiter.resolve()); this.drawWaiters.clear();
      this.recoverTimers.forEach(clearTimeout); this.recoverTimers.clear();
      clearTimeout(this.reliefTimer); this.relieved = -1;
      this.center = this.targetCenter = next.active + .5;
    } else if (actorChanged) {
      if (this.dragging || this.throws.size) this.deferredFocus = next.active;
      else void this.focus(next.active);
    }
    if (next.overflow) {
      this.throws.clear(); this.recoverTimers.forEach(clearTimeout); this.recoverTimers.clear();
      this.drawWaiters.forEach(waiter => waiter.resolve()); this.drawWaiters.clear();
    }
    this.paint();
  }

  private cancelMove(): void {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.finishMove?.(); this.finishMove = undefined; this.moving = undefined;
  }
  private rotate(center: number): Promise<void> {
    this.cancelMove();
    this.targetCenter = center;
    if (this.state.count <= 4 || this.state.reducedMotion || Math.abs(center - this.center) < .001) { this.center = center; this.paint(); return Promise.resolve(); }
    const start = this.center, started = performance.now();
    this.moving = new Promise(resolve => { this.finishMove = resolve; });
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / 260);
      this.center = start + (center - start) * (1 - Math.pow(1 - t, 3)); this.paint();
      if (t < 1) this.raf = requestAnimationFrame(step);
      else { this.raf = 0; this.finishMove?.(); this.finishMove = undefined; this.moving = undefined; }
    };
    this.raf = requestAnimationFrame(step);
    return this.moving;
  }
  focus(index: number): Promise<void> {
    if (!this.state.count || this.state.count <= 4) return Promise.resolve();
    return this.rotate(nearestCenter(index, this.center, this.state.count));
  }
  /** Keep the throwing hand and replacement-card destination still during a flight. */
  show(index: number): void { if (!this.busy) void this.focus(index); }
  browse(direction: number): void { if (!this.busy) void this.rotate(Math.round(this.center - .5) + .5 + direction); }
  private get busy(): boolean { return !!(this.preparing.size || this.throws.size || this.dragging); }
  get swiping(): boolean { return !!this.dragging; }
  private down = (event: PointerEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.seat-layer');
    if (!target || this.state.count <= 4 || event.button !== 0 || this.preparing.size || this.throws.size) return;
    this.cancelMove();
    this.dragging = { id: event.pointerId, x: event.clientX, center: this.center, element: target, moved: false };
    this.dragReleased = new Promise(resolve => { this.finishDrag = resolve; });
  };
  private move = (event: PointerEvent): void => {
    const drag = this.dragging;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) < 8 && !drag.moved) return;
    if (!drag.moved) drag.element.setPointerCapture(event.pointerId);
    drag.moved = true;
    this.center = drag.center - dx / (innerWidth * .25); this.paint();
  };
  private up = (event: PointerEvent): void => {
    const drag = this.dragging;
    if (!drag || event.pointerId !== drag.id) return;
    this.dragging = undefined;
    this.finishDrag?.(); this.finishDrag = undefined; this.dragReleased = undefined;
    if (drag.element.hasPointerCapture(event.pointerId)) drag.element.releasePointerCapture(event.pointerId);
    if (drag.moved) this.suppressClickUntil = performance.now() + 350;
    const pending = this.deferredFocus; this.deferredFocus = undefined;
    if (pending !== undefined) void this.focus(pending);
    else void this.rotate(Math.round(this.center - .5) + .5);
  };

  private spriteReady(index: number): Promise<void> {
    const sprite = this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .character-sprite`);
    const url = sprite?.dataset.spriteUrl;
    if (!url) return Promise.resolve();
    let ready = this.loaded.get(url);
    if (!ready) {
      const image = new Image(); image.src = url;
      ready = image.decode().then(() => { this.readyUrls.add(url); this.paintFrames(); }).catch(() => undefined);
      this.loaded.set(url, ready);
    }
    return ready;
  }
  async prepareThrow(index: number): Promise<DOMRect | undefined> {
    const epoch = this.epoch;
    this.preparing.add(index); this.paintFrames();
    try {
      await this.dragReleased;
      await Promise.all([...this.drawWaiters.entries()].filter(([seat]) => seat !== index).map(([,waiter]) => waiter.promise));
      if (epoch !== this.epoch) throw new Error('The table changed before the throw.');
      await this.focus(index);
      await this.spriteReady(index);
      if (epoch !== this.epoch) throw new Error('The table changed before the throw.');
      clearTimeout(this.recoverTimers.get(index)); this.recoverTimers.delete(index);
      if (!this.state.reducedMotion) {
        this.throws.set(index, 6); this.paintFrames();
        await new Promise(resolve => setTimeout(resolve, 110));
      }
      if (epoch !== this.epoch) throw new Error('The table changed during the throw.');
      return this.handRect(index);
    } finally {
      if (epoch === this.epoch) this.preparing.delete(index);
      this.paintFrames();
    }
  }
  release(index: number): void {
    if (this.state.reducedMotion) return;
    this.throws.set(index, 7); this.paintFrames();
    this.drawWaiters.get(index)?.resolve();
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    this.drawWaiters.set(index, { promise, resolve });
    clearTimeout(this.recoverTimers.get(index));
    const epoch = this.epoch;
    this.recoverTimers.set(index, window.setTimeout(() => {
      if (epoch !== this.epoch) return;
      this.throws.set(index, 8); this.paintFrames();
      // An interrupted draw must never leave a stuck pose or block a later turn.
      this.recoverTimers.set(index, window.setTimeout(() => this.received(index), 1800));
    }, 180));
  }
  cancelThrow(index: number): void {
    this.received(index);
  }
  received(index: number): void {
    clearTimeout(this.recoverTimers.get(index)); this.recoverTimers.delete(index); this.throws.delete(index);
    this.drawWaiters.get(index)?.resolve(); this.drawWaiters.delete(index); this.paintFrames();
    if (!this.throws.size && !this.dragging && this.deferredFocus !== undefined) {
      const next = this.deferredFocus; this.deferredFocus = undefined; void this.focus(next);
    }
  }
  played(index: number, special: boolean): void {
    clearTimeout(this.reliefTimer); this.relieved = special ? index : -1;
    this.reliefTimer = window.setTimeout(() => { this.relieved = -1; this.paintFrames(); }, 1500);
  }
  handRect(index: number): DOMRect | undefined {
    return this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .sprite-hand-anchor`)?.getBoundingClientRect();
  }
  private paintFrames(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-ring-focus], [data-ring-step]').forEach(button => { button.disabled = this.busy; });
    this.root.querySelectorAll<HTMLElement>('.seat').forEach(seat => {
      const index = Number(seat.dataset.seat);
      const frame = this.throws.get(index) ?? faceFrame(this.state.total, index === this.state.active, index === this.relieved, this.state.overflow, seat.dataset.mood);
      const sprite = seat.querySelector<HTMLElement>('.character-sprite');
      if (sprite) {
        sprite.style.backgroundPosition = `${frame % 3 * 50}% ${Math.floor(frame / 3) * 50}%`;
        sprite.dataset.frame = String(frame);
        const url = sprite.dataset.spriteUrl;
        sprite.classList.toggle('sprite-ready', !!url && this.readyUrls.has(url));
      }
      seat.classList.toggle('throwing', this.throws.has(index));
    });
  }
  private paint(): void {
    if (!this.state.count) return;
    const portrait = innerHeight > innerWidth * 1.08;
    this.root.querySelectorAll<HTMLElement>('.seat').forEach(seat => {
      const index = Number(seat.dataset.seat), pose = ringSeat(index, this.center, this.state.count, portrait);
      seat.style.setProperty('--ring-x', `${pose.x * 100}vw`);
      seat.style.setProperty('--ring-y', `${pose.y * 100}svh`);
      seat.style.setProperty('--ring-scale', String(pose.scale));
      seat.style.opacity = String(pose.opacity);
      seat.style.zIndex = String(4 - Math.round(Math.abs(pose.distance)));
      seat.hidden = !pose.visible;
      seat.setAttribute('aria-hidden', String(!pose.visible));
      seat.inert = !pose.visible;
      // Decode only seats actually brought into view; cached atlases cost no new request.
      if (pose.visible) void this.spriteReady(index);
    });
    this.root.querySelectorAll<HTMLElement>('[data-ring-focus]').forEach(marker => {
      const pose = ringSeat(Number(marker.dataset.ringFocus), this.center, this.state.count, portrait);
      marker.classList.toggle('in-view', pose.visible);
      marker.setAttribute('aria-pressed', String(pose.visible));
    });
    this.paintFrames();
  }
}
