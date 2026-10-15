import type { Card } from '../game/types';
import { cardFaceFromUrl } from '../game/cardFace';

export function parallaxKey(card:Pick<Card,'suit'|'rank'>):string {
  return `${card.suit}-${['J','Q','K'].includes(card.rank)?'k':card.rank.toLowerCase()}`;
}
export function parallaxEnabled():boolean {
  return typeof document!=='undefined'&&document.documentElement.classList.contains('parallax-effect-on');
}
export function parallaxFlatPath(card:Pick<Card,'suit'|'rank'>):string {
  return `assets/cards/midnight-v1/parallax-v1/flat/${parallaxKey(card)}.webp`;
}
export function parallaxMarkup(card:Pick<Card,'suit'|'rank'>):string {
  const path=`${import.meta.env.BASE_URL}assets/cards/midnight-v1/parallax-v1/${parallaxKey(card)}`;
  return `<span class="parallax-face" aria-hidden="true"><span class="parallax-art"><span class="parallax-background"><img src="${path}/background.webp" alt="" draggable="false" decoding="async"></span><img class="parallax-object" src="${path}/object.webp" alt="" draggable="false" decoding="async"></span></span>`;
}
export function parallaxOffsets(x:number,y:number):{background:{x:number;y:number};object:{x:number;y:number}} {
  x=Number.isFinite(x)?Math.max(-1,Math.min(1,x)):0;y=Number.isFinite(y)?Math.max(-1,Math.min(1,y)):0;
  return {background:{x:-x*.024,y:-y*.018},object:{x:x*.036,y:y*.028}};
}
export function setParallaxPosition(card:HTMLElement,x:number,y:number):void {
  if(!card.dataset?.parallaxKey)return;
  x=Number.isFinite(x)?Math.max(-1,Math.min(1,x)):0;y=Number.isFinite(y)?Math.max(-1,Math.min(1,y)):0;
  const pose=parallaxOffsets(x,y);
  card.dataset.parallaxX=String(x);card.dataset.parallaxY=String(y);
  card.style.setProperty('--parallax-bg-x',`${pose.background.x*100}%`);card.style.setProperty('--parallax-bg-y',`${pose.background.y*100}%`);
  card.style.setProperty('--parallax-object-x',`${pose.object.x*100}%`);card.style.setProperty('--parallax-object-y',`${pose.object.y*100}%`);
}
/** The HTML fallback uses the same uninterrupted depth-to-flat handoff. */
export function settleParallaxClone(card:HTMLElement,duration:number):void {
  setParallaxPosition(card,Number(card.dataset.parallaxX??0),Number(card.dataset.parallaxY??0));
  for(const [selector,end] of [['.parallax-background','translate(0,0) scale(1.06)'],['.parallax-object','translate(0,0)']] as const){
    const layer=card.querySelector<HTMLElement>(selector);if(!layer)continue;
    layer.animate([{transform:getComputedStyle(layer).transform},{transform:end}],{duration,easing:'linear',fill:'forwards'});
  }
}
type Layers={key:string;background:HTMLImageElement;object:HTMLImageElement};
const visibleLayers=new Map<HTMLElement,Layers>();
/** Only ready, currently visible hand layers may be reused by a throw. */
export function parallaxLayersFor(url:string):Layers|undefined {
  if(!parallaxEnabled())return;
  const face=cardFaceFromUrl(url);if(!face)return;
  const key=parallaxKey(face);
  return [...visibleLayers.entries()].find(([card,layers])=>card.isConnected&&card.classList.contains('parallax-ready')&&layers.key===key)?.[1];
}

/** Decode just the visible hand; keep the ordinary print until both layers are ready. */
export class ParallaxHand {
  private pending=new WeakSet<HTMLElement>();
  private observer:MutationObserver;
  private disposed=false;
  constructor(private root:HTMLElement,private ready?:(url:string)=>void){
    this.observer=new MutationObserver(()=>this.sync());
    this.observer.observe(root,{childList:true,subtree:true});this.sync();
  }
  private sync():void {
    if(this.disposed)return;
    for(const card of visibleLayers.keys())if(!card.isConnected){visibleLayers.delete(card);}
    for(const card of Array.from(this.root.querySelectorAll<HTMLElement>('.local-hand .hand-card[data-parallax-key],.shared-hand .hand-card[data-parallax-key]'))){
      if(this.pending.has(card))continue;
      const background=card.querySelector<HTMLImageElement>('.parallax-background img'),object=card.querySelector<HTMLImageElement>('.parallax-object'),face=card.querySelector<HTMLElement>('.parallax-face');
      if(!background||!object||!face)continue;
      this.pending.add(card);
      void Promise.all([background.decode(),object.decode()]).then(()=>{
        if(this.disposed||!card.isConnected||!parallaxEnabled())return;
        const print=card.querySelector<HTMLElement>(':scope > .card-print');
        if(print)face.append(print);
        visibleLayers.set(card,{key:card.dataset.parallaxKey!,background,object});
        card.classList.add('parallax-ready');
        const source=card.querySelector<HTMLImageElement>(':scope > img');if(source)this.ready?.(source.src);
      }).catch(()=>{/* Retain the sharp ordinary print if either optional asset fails. */});
    }
  }
  dispose():void {this.disposed=true;this.observer.disconnect();visibleLayers.clear();}
}
