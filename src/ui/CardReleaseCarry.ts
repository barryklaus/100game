/** Keep the held card moving while an uncached flight finishes preparing. */
export class CardReleaseCarry {
  private animation:Animation;
  constructor(private card:HTMLElement,velocity:{x:number;y:number}){
    const length=Math.hypot(velocity.x,velocity.y),limit=length>1.6?1.6/length:1;
    const transform=getComputedStyle(card).transform;
    const from=transform==='none'?'':transform;
    this.animation=card.animate([
      {transform:from||'none'},
      {transform:`translate3d(${velocity.x*limit*1000}px,${velocity.y*limit*1000}px,0) ${from}`},
    ],{duration:1000,easing:'linear',fill:'forwards'});
    // Anchor to the current compositor timeline instead of waiting a frame
    // for Web Animations to resolve its default pending start time.
    const stamp=document.timeline?.currentTime;
    if(typeof stamp==='number')this.animation.startTime=stamp;
  }
  stop():void{this.animation.cancel();}
}
