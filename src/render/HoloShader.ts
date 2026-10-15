import { LatestFrame } from '../ui/LatestFrame';
// Feeds pointer motion into the DOM fallback's suit foil. Midnight reflects
// inside the artwork; its printed border matches the deck preview.
export class HoloShader {
  private isEnabled = true;
  private active: HTMLElement | null = null;
  private lastPointer: {x:number;y:number}|null = null;
  private stillTimer = 0;
  private pointerFrame=new LatestFrame<PointerEvent>(event=>this.paintPointer(event));

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
    this.pointerFrame.cancel();
    clearTimeout(this.stillTimer);
    if (!this.active) return;
    this.active.style.removeProperty('--card-tilt-x');
    this.active.style.removeProperty('--card-tilt-y');
    this.active.style.removeProperty('--holo-x');
    this.active.style.removeProperty('--holo-y');
    this.active.style.removeProperty('--foil-angle');
    this.active.style.removeProperty('--foil-motion');
    this.active.removeAttribute('data-card-hover');
    this.active.removeAttribute('data-card-pressed');
    this.active.removeAttribute('data-foil-moving');
    this.active = null;
    this.lastPointer = null;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if(this.isEnabled)this.pointerFrame.schedule(event);
  };

  private paintPointer(event:PointerEvent):void {
    if (!this.isEnabled) return;
    const card = (event.target as Element | null)?.closest<HTMLElement>('.playing-card:not(.waiting-hand)') ?? null;
    if (card !== this.active) {
      this.clearActive();
      this.active = card;
    }
    if (!card) return;
    const clamp=(value:number)=>Math.max(0,Math.min(1,value));
    // Drag already supplies tilt. Reading its bounds after writing the transform
    // would force Safari to lay out the card again for every touch sample.
    const dragging=card.classList.contains('dragging');
    const rect=dragging?undefined:card.getBoundingClientRect();
    const x=dragging?clamp(.5+Number(card.dataset.tiltY||0)*1.25):clamp((event.clientX-rect!.left)/Math.max(1,rect!.width));
    const y=dragging?clamp(.5-Number(card.dataset.tiltX||0)*1.25):clamp((event.clientY-rect!.top)/Math.max(1,rect!.height));
    card.style.setProperty('--card-tilt-x', `${((.5 - y) * 7).toFixed(2)}deg`);
    card.style.setProperty('--card-tilt-y', `${((x - .5) * 9).toFixed(2)}deg`);
    card.style.setProperty('--holo-x', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--holo-y', `${(y * 100).toFixed(1)}%`);
    card.style.setProperty('--foil-angle',`${(35+(x-.5)*90+(y-.5)*36).toFixed(1)}deg`);
    const travel=this.lastPointer ? Math.hypot(event.clientX-this.lastPointer.x,event.clientY-this.lastPointer.y) : 0;
    this.lastPointer={x:event.clientX,y:event.clientY};
    const motion=Math.min(.9,travel/18);
    card.style.setProperty('--foil-motion',motion.toFixed(2));
    card.toggleAttribute('data-foil-moving',motion>.08);
    clearTimeout(this.stillTimer);
    this.stillTimer=window.setTimeout(()=>{
      card.style.setProperty('--foil-motion','0');
      card.removeAttribute('data-foil-moving');
    },90);
    card.dataset.cardHover = 'true';
  }

  private onPointerDown = (event: PointerEvent): void => {
    const card = (event.target as Element | null)?.closest<HTMLElement>('.playing-card:not(.waiting-hand)');
    if (this.isEnabled && card) {
      if(card!==this.active){this.clearActive();this.active=card;}
      card.dataset.cardPressed = 'true';
    }
  };

  private onPointerUp = (): void => {
    this.pointerFrame.cancel();
    clearTimeout(this.stillTimer);
    this.active?.removeAttribute('data-card-pressed');
    this.active?.style.setProperty('--foil-motion','0');
    this.active?.removeAttribute('data-foil-moving');
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
