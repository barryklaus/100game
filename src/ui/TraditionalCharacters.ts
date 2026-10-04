import { traditionalSprites, type TraditionalCharacter, type SpriteDrawing, type SpriteClip } from './TraditionalSpriteData';

interface CastState { active: number; total: number; overflow: boolean; overflowSeat?: number; target: boolean; reducedMotion: boolean }
interface SeatSprite {
  canvas: HTMLCanvasElement; character: TraditionalCharacter; held: 1 | 2;
  frame?: SpriteDrawing; animation?: { clip: SpriteClip; start: number; from: number; end: number; resolve: () => void };
  raf: number; epoch: number; mood: string; fallen?: boolean;
}
/** Complete drawings only. Redraw on pose changes, rather than on every display frame. */
export class TraditionalCharacters {
  private seats = new Map<number, SeatSprite>();
  private assets = new Map<TraditionalCharacter, Promise<{atlas: HTMLImageElement; chair: HTMLImageElement}>>();
  private decoded = new Map<TraditionalCharacter, {atlas: HTMLImageElement; chair: HTMLImageElement}>();
  private state: CastState = { active: 0, total: 0, overflow: false, target: false, reducedMotion: false };
  private blinkTimer = 0;
  constructor(private root: HTMLElement) {}

  has(index: number): boolean { return !!this.root.querySelector(`.seat[data-seat="${index}"][data-traditional]`); }
  private seat(index: number): SeatSprite | undefined {
    const canvas=this.root.querySelector<HTMLCanvasElement>(`.seat[data-seat="${index}"] .traditional-sprite`);
    const character=canvas?.dataset.character as TraditionalCharacter | undefined;
    if (!canvas || !character || !(character in traditionalSprites)) return;
    let seat=this.seats.get(index);
    if (!seat || seat.canvas!==canvas || seat.character!==character) {
      if (seat) this.stop(seat);
      seat={canvas,character,held:2,raf:0,epoch:0,mood:''};this.seats.set(index,seat);
    }
    return seat;
  }
  private ready(character: TraditionalCharacter) {
    let promise=this.assets.get(character);
    if (!promise) {
      const load=async (file:string) => {const im=new Image();im.src=`${import.meta.env.BASE_URL}assets/social-club/${file}`;await im.decode();return im;};
      promise=Promise.all([load(character==='june'?'june-atlas-v2.webp':'finn-atlas.webp'),load('chair.webp')]).then(([atlas,chair])=>{const result={atlas,chair};this.decoded.set(character,result);return result;});
      this.assets.set(character,promise);
    }
    return promise;
  }
  private paint(seat: SeatSprite, frame: SpriteDrawing): void {
    if (seat.frame===frame && seat.canvas.dataset.ready==='true') return;
    const assets=this.decoded.get(seat.character),ctx=seat.canvas.getContext('2d');if(!assets||!ctx)return;
    ctx.clearRect(0,0,512,512);
    if(!frame.combinedChair)ctx.drawImage(assets.chair,0,0,512,512);
    // Runtime cells omit empty padding. Reapply the exact protected 128px margin here.
    ctx.drawImage(assets.atlas,frame.index%8*256,Math.floor(frame.index/8)*256,256,256,128,128,256,256);
    seat.frame=frame;seat.canvas.dataset.ready='true';seat.canvas.dataset.frame=String(frame.index);seat.canvas.dataset.cards=String(frame.cards);
  }
  private stop(seat: SeatSprite): void {seat.epoch++;cancelAnimationFrame(seat.raf);seat.raf=0;seat.animation?.resolve();seat.animation=undefined;delete seat.canvas.dataset.animation;}
  reset(): void {clearTimeout(this.blinkTimer);this.seats.forEach(seat=>this.stop(seat));this.seats.clear();}
  private rest(index: number): void {
    const seat=this.seat(index);if(!seat||seat.animation||seat.fallen)return;
    const data=traditionalSprites[seat.character];
    let frame=seat.held===1?data.clips.throw.frames.at(-1)!:data.clips.idle.frames[0];
    if(seat.held===2){
      const emotion=this.state.overflow?'shocked':this.state.total>=90?'panicked':this.state.total>=70?'nervous':index===this.state.active?'focused':({Happy:'amused',Smug:'smug',Angry:'frustrated',Sad:'defeated',Confident:'confident',Scared:'nervous'}[seat.mood]||'calm');
      frame=data.emotions[emotion]??frame;
    }
    this.paint(seat,frame);
  }
  sync(state: CastState): void {
    const previous=this.state;this.state=state;
    this.root.querySelectorAll<HTMLElement>('.seat[data-traditional]:not([hidden])').forEach(node=>{
      const index=Number(node.dataset.seat),seat=this.seat(index);if(!seat)return;
      seat.mood=node.dataset.mood??'Normal';
      void this.ready(seat.character).then(()=>{
        if(state!==this.state)return;
        this.rest(index);
        if(!state.reducedMotion && !state.overflow && previous.active!==state.active && !seat.animation && seat.held===2){
          void this.play(index,index===state.active?'study':this.direction(index,state.active)==='left'?'look-left':'look-right');
        }
      }).catch(()=>undefined);
    });
    if(state.reducedMotion||state.overflow){clearTimeout(this.blinkTimer);this.blinkTimer=0;}
    else if(!this.blinkTimer){this.blinkTimer=window.setTimeout(()=>{this.blinkTimer=0;const seat=this.seat(this.state.active);if(seat&&!seat.animation&&seat.held===2)void this.play(this.state.active,'idle');},4500);}
  }
  private direction(index:number,other:number):'left'|'right' {
    const a=this.root.querySelector<HTMLElement>(`.seat[data-seat="${index}"]`)?.getBoundingClientRect(),b=this.root.querySelector<HTMLElement>(`.seat[data-seat="${other}"]`)?.getBoundingClientRect();
    return a&&b&&b.left<a.left?'left':'right';
  }
  async play(index:number,id:string,from=0,end?:number):Promise<void> {
    const seat=this.seat(index);if(!seat)return;
    this.stop(seat);const epoch=seat.epoch;
    await this.ready(seat.character).catch(()=>undefined);if(!seat.canvas.isConnected||this.seats.get(index)!==seat||seat.epoch!==epoch)return;
    const clip=traditionalSprites[seat.character].clips[id];if(!clip)return;
    const total=clip.durations.reduce((a,b)=>a+b,0),until=end??total;
    if(this.state.reducedMotion){this.paint(seat,clip.frames.at(-1)!);return;}
    return new Promise(resolve=>{
      seat.animation={clip,start:performance.now(),from,end:until,resolve};seat.canvas.dataset.animation=id;
      const step=(now:number)=>{
        if(epoch!==seat.epoch||!seat.canvas.isConnected){resolve();return;}
        const elapsed=Math.min(until-1,from+now-seat.animation!.start);let boundary=0,i=0;
        for(;i<clip.durations.length-1;i++){boundary+=clip.durations[i];if(elapsed<boundary)break;}
        this.paint(seat,clip.frames[i]);
        if(from+now-seat.animation!.start<until){seat.raf=requestAnimationFrame(step);}
        else{seat.raf=0;seat.animation=undefined;delete seat.canvas.dataset.animation;resolve();if(until===total&&id!=='tumble'&&id!=='defeat')this.rest(index);}
      };
      step(performance.now());
    });
  }
  async prepareThrow(index:number):Promise<DOMRect|undefined>{
    const seat=this.seat(index);if(!seat)return;
    seat.held=2;await this.play(index,'throw',0,320);return this.handRect(index,false);
  }
  release(index:number):void{const seat=this.seat(index);if(!seat)return;seat.held=1;void this.play(index,'throw',320);}
  async prepareDraw(index:number):Promise<DOMRect|undefined>{
    const seat=this.seat(index);if(!seat)return;
    if(seat.held===1){const epoch=seat.epoch;await this.ready(seat.character).catch(()=>undefined);if(this.seats.get(index)!==seat||epoch!==seat.epoch)return;this.stop(seat);this.paint(seat,traditionalSprites[seat.character].clips.pickup.frames[2]);}
    return this.handRect(index,true);
  }
  async received(index:number):Promise<void>{const seat=this.seat(index);if(!seat||seat.held===2)return;seat.held=2;await this.play(index,'pickup',340);}
  cancel(index:number):void{const seat=this.seat(index);if(!seat)return;this.stop(seat);seat.held=2;this.rest(index);}
  chosen(index:number,target:number):void{const seat=this.seat(index);if(seat?.held===2)void this.play(index,`choose-${this.direction(index,target)}`);}
  relieved(index:number):void{const seat=this.seat(index);if(seat?.held===2&&!seat.animation)void this.play(index,'celebrate');}
  async tumble(index:number):Promise<void>{const seat=this.seat(index);if(!seat)return;seat.held=1;await this.play(index,'startle');if(this.seats.get(index)!==seat)return;seat.fallen=true;await this.play(index,'tumble');}
  handRect(index:number,catching=false):DOMRect|undefined{
    const seat=this.seat(index);if(!seat)return;
    // Calibrated to the selected card and open receiving palm in each padded drawing.
    const [x,y,w,h]=seat.character==='june'?(catching?[315,237,18,25]:[264,223,18,25]):(catching?[293,233,24,34]:[300,232,24,34]);
    const r=seat.canvas.getBoundingClientRect();
    return new DOMRect(r.left+(x-w/2)/512*r.width,r.top+(y-h/2)/512*r.height,w/512*r.width,h/512*r.height);
  }
}
