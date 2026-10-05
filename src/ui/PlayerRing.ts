import { faceFrame, nearestCenter, ringSeat, traditionalRingSeat, seatDistance, type CharacterFrame } from './PlayerRingModel';
import { characterHandAnchors } from './CharacterSpriteLayout';
import { TraditionalCharacters } from './TraditionalCharacters';
import { masterHandRect } from './MasterCharacters';

type RingState = { roundKey: string; count: number; active: number; total: number; overflow: boolean; overflowSeat?: number; reducedMotion: boolean; target: boolean };
type OverflowStage = 'idle' | 'focus' | 'fall' | 'complete';
/** Event-driven sprite frames; the ring has no idle animation loop. */
export class PlayerRing {
  private traditional: TraditionalCharacters;
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
  private overflowStage: OverflowStage = 'idle';
  private overflowSeat = -1;
  private tumbleFrame = 0;
  private tumbleDrop = 0;
  private tumbleUsesSheet = false;
  private tumbleRaf = 0;
  private overflowTimer = 0;

  constructor(private root: HTMLElement, private projectLayout?: () => void, private onOverflowComplete?: () => void) {
    this.traditional = new TraditionalCharacters(root);
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
      this.traditional.reset();
      this.epoch++;
      cancelAnimationFrame(this.tumbleRaf); clearTimeout(this.overflowTimer);
      this.overflowStage = 'idle'; this.overflowSeat = -1; this.tumbleDrop = 0;
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
    } else if (actorChanged && !next.overflow) {
      if (this.dragging || this.throws.size) this.deferredFocus = next.active;
      else void this.focus(next.active);
    }
    if (next.overflow) {
      this.throws.clear(); this.recoverTimers.forEach(clearTimeout); this.recoverTimers.clear();
      this.drawWaiters.forEach(waiter => waiter.resolve()); this.drawWaiters.clear();
      if (this.overflowStage === 'idle') this.beginOverflow(next.overflowSeat ?? next.active);
    }
    // Warm only the current player's fall near danger, never all sixteen atlases.
    if (!next.overflow && next.total >= 90) void this.tumbleReady(next.active);
    this.paint();
  }

  scoresReady(roundKey: string): boolean { return this.state.roundKey === roundKey && this.overflowStage === 'complete'; }

  private tumbleReady(index: number): Promise<void> {
    const url = this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .character-tumble`)?.dataset.tumbleUrl;
    return url ? this.imageReady(url) : Promise.resolve();
  }
  private beginOverflow(index: number): void {
    const epoch = this.epoch;
    const current = () => epoch === this.epoch && this.state.overflow;
    this.cancelMove(); this.deferredFocus = undefined; this.preparing.clear();
    if (this.dragging?.element.hasPointerCapture(this.dragging.id)) this.dragging.element.releasePointerCapture(this.dragging.id);
    this.dragging = undefined; this.finishDrag?.(); this.finishDrag = undefined; this.dragReleased = undefined;
    this.overflowSeat = index; this.overflowStage = 'focus'; this.tumbleFrame = 0; this.tumbleDrop = 0;
    if (this.state.count <= 4) this.center = (this.state.count - 1) / 2;
    const center = this.state.count <= 4 ? index : this.center + seatDistance(index, this.center, this.state.count);
    const finish = () => {
      if (!current()) return;
      this.overflowStage = 'complete'; this.paint();
      queueMicrotask(() => { if (current()) this.onOverflowComplete?.(); });
    };
    if (this.state.reducedMotion) {
      this.center = this.targetCenter = center; finish(); return;
    }
    const ready = this.tumbleReady(index);
    // Let the existing number explosion land before centering the culprit.
    this.overflowTimer = window.setTimeout(() => {
      if (!current()) return;
      void (async () => {
        await this.rotate(center, true);
        if (!current()) return;
        // A slow or missing sheet must never prevent scores or the next round.
        await Promise.race([ready, new Promise(resolve => setTimeout(resolve, 450))]);
        if (!current()) return;
        if(this.traditional.has(index)) {
          this.overflowStage='fall';this.paintFrames();
          try {await this.traditional.tumble(index);}catch {/* Scores remain available if an asset fails. */}
          if(current())finish();return;
        }
        const url = this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .character-tumble`)?.dataset.tumbleUrl;
        this.tumbleUsesSheet = !!url && this.readyUrls.has(url);
        this.overflowStage = 'fall';
        const started = performance.now();
        const step = (now: number) => {
          if (!current()) return;
          const elapsed = now - started;
          this.tumbleFrame = Math.min(8, Math.floor(elapsed / 145));
          this.tumbleDrop = Math.max(0, Math.min(1, (elapsed - 1160) / 380));
          this.paintFrames();
          if (elapsed < 1540) this.tumbleRaf = requestAnimationFrame(step);
          else { this.tumbleRaf = 0; finish(); }
        };
        this.tumbleRaf = requestAnimationFrame(step);
      })();
    }, 350);
  }

  private cancelMove(): void {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.finishMove?.(); this.finishMove = undefined; this.moving = undefined;
  }
  private rotate(center: number, includeSmall = false): Promise<void> {
    this.cancelMove();
    this.targetCenter = center;
    if ((!includeSmall && this.state.count <= 4) || this.state.reducedMotion || Math.abs(center - this.center) < .001) { this.center = center; this.paint(); return Promise.resolve(); }
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
    if (this.overflowStage !== 'idle') return Promise.resolve();
    if (!this.state.count || this.state.count <= 4) return Promise.resolve();
    return this.rotate(nearestCenter(index, this.center, this.state.count));
  }
  /** Keep the throwing hand and replacement-card destination still during a flight. */
  show(index: number): void { if (!this.busy) void this.focus(index); }
  browse(direction: number): void { if (!this.busy) void this.rotate(Math.round(this.center - .5) + .5 + direction); }
  private get busy(): boolean { return !!(this.preparing.size || this.throws.size || this.dragging || this.overflowStage !== 'idle'); }
  get swiping(): boolean { return !!this.dragging; }
  private down = (event: PointerEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.seat-layer');
    if (!target || this.state.count <= 4 || event.button !== 0 || this.busy) return;
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
    if(this.traditional.has(index))return this.traditional.warm(index).then(()=>undefined).catch(()=>undefined);
    const master = this.root.querySelector<HTMLImageElement>(`.seat[data-seat="${index}"] .master-sprite`);
    if (master) return this.imageReady(master.src);
    const sprite = this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .character-sprite`);
    const url = sprite?.dataset.spriteUrl;
    return url ? this.imageReady(url) : Promise.resolve();
  }
  private imageReady(url: string): Promise<void> {
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
      await Promise.all([...this.drawWaiters.entries()].filter(([seat]) => seat !== index || this.traditional.has(index)).map(([,waiter]) => waiter.promise));
      if (epoch !== this.epoch) throw new Error('The table changed before the throw.');
      await this.focus(index);
      await this.spriteReady(index);
      if (epoch !== this.epoch) throw new Error('The table changed before the throw.');
      clearTimeout(this.recoverTimers.get(index)); this.recoverTimers.delete(index);
      if(this.traditional.has(index))return await this.traditional.prepareThrow(index);
      if (!this.state.reducedMotion) {
        this.throws.set(index, 6); this.paintFrames();
        await new Promise(resolve => setTimeout(resolve, 110));
      }
      if (epoch !== this.epoch) throw new Error('The table changed during the throw.');
      return masterHandRect(this.root,index) ?? this.handRect(index);
    } finally {
      if (epoch === this.epoch) this.preparing.delete(index);
      this.paintFrames();
    }
  }
  release(index: number): void {
    if (this.state.reducedMotion) return;
    if(this.traditional.has(index))this.traditional.release(index);
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
    if(this.traditional.has(index))this.traditional.cancel(index);
    this.received(index);
  }
  received(index: number): void {
    if(this.traditional.has(index)){
      const epoch=this.epoch;
      void this.traditional.received(index).finally(()=>{if(epoch===this.epoch)this.finishReceived(index);});
      return;
    }
    this.finishReceived(index);
  }
  private finishReceived(index:number):void {
    clearTimeout(this.recoverTimers.get(index)); this.recoverTimers.delete(index); this.throws.delete(index);
    this.drawWaiters.get(index)?.resolve(); this.drawWaiters.delete(index); this.paintFrames();
    if (!this.throws.size && !this.dragging && this.deferredFocus !== undefined) {
      const next = this.deferredFocus; this.deferredFocus = undefined; void this.focus(next);
    }
  }
  played(index: number, special: boolean): void {
    if(special&&this.traditional.has(index))this.traditional.relieved(index);
    clearTimeout(this.reliefTimer); this.relieved = special ? index : -1;
    this.reliefTimer = window.setTimeout(() => { this.relieved = -1; this.paintFrames(); }, 1500);
  }
  handRect(index: number): DOMRect | undefined {
    const master=masterHandRect(this.root,index,true);if(master)return master;
    if(this.traditional.has(index))return this.traditional.handRect(index,true);
    return this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .sprite-hand-anchor`)?.getBoundingClientRect();
  }
  prepareDraw(index:number):Promise<DOMRect|undefined>{return this.traditional.has(index)?this.traditional.prepareDraw(index):Promise.resolve(this.handRect(index));}
  chosen(index:number,target:number):void{if(this.traditional.has(index))this.traditional.chosen(index,target);}
  private paintFrames(): void {
    this.traditional.sync(this.state);
    const page = this.root.querySelector<HTMLElement>('.game-page');
    if (page) page.dataset.overflowStage = this.overflowStage;
    this.root.querySelectorAll<HTMLButtonElement>('[data-ring-focus], [data-ring-step]').forEach(button => { button.disabled = this.busy; });
    this.root.querySelectorAll<HTMLElement>('.seat').forEach(seat => {
      const index = Number(seat.dataset.seat);
      const culprit = this.overflowStage !== 'idle' && index === this.overflowSeat;
      seat.classList.toggle('overflow-culprit', culprit);
      seat.classList.toggle('overflow-support', this.overflowStage !== 'idle' && !culprit);
      const tumble = seat.querySelector<HTMLElement>('.character-tumble');
      const falling = culprit && ['fall', 'complete'].includes(this.overflowStage) && !this.state.reducedMotion;
      if (tumble) {
        const useSheet = falling && this.tumbleUsesSheet;
        tumble.style.backgroundImage = useSheet ? `url('${tumble.dataset.tumbleUrl}')` : '';
        seat.classList.toggle('tumbling', useSheet);
        seat.classList.toggle('tumble-fallback', falling && !useSheet);
        tumble.style.backgroundPosition = `${this.tumbleFrame % 3 * 50}% ${Math.floor(this.tumbleFrame / 3) * 50}%`;
        tumble.dataset.frame = String(this.tumbleFrame);
        seat.style.setProperty('--tumble-drop', String(this.tumbleDrop));
        seat.style.setProperty('--tumble-progress', String(this.tumbleFrame / 8));
      }
      const frame = this.throws.get(index) ?? faceFrame(this.state.total, index === this.state.active, index === this.relieved, this.state.overflow, seat.dataset.mood);
      const sprite = seat.querySelector<HTMLElement>('.character-sprite');
      if (sprite) {
        sprite.style.backgroundPosition = `${frame % 3 * 50}% ${Math.floor(frame / 3) * 50}%`;
        sprite.dataset.frame = String(frame);
        const avatar = Number(sprite.dataset.avatar ?? 0);
        const anchor = seat.querySelector<HTMLElement>('.sprite-hand-anchor');
        const hand = characterHandAnchors[(avatar % 16 + 16) % 16]?.[frame];
        if (anchor && hand) {
          const [left, top, width, height] = hand;
          anchor.style.left = `${left * 100}%`;
          anchor.style.top = `${top * 100}%`;
          anchor.style.width = `${width * 100}%`;
          anchor.style.height = `${height * 100}%`;
        }
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
      const index = Number(seat.dataset.seat), layout=this.traditional.has(index)||seat.classList.contains('master-seat')?traditionalRingSeat:ringSeat;
      const pose = layout(index, this.center, this.state.count, portrait, this.overflowStage !== 'idle');
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
      const pose = ringSeat(Number(marker.dataset.ringFocus), this.center, this.state.count, portrait, this.overflowStage !== 'idle');
      marker.classList.toggle('in-view', pose.visible);
      marker.setAttribute('aria-pressed', String(pose.visible));
    });
    this.paintFrames();
    this.projectLayout?.();
  }
}
