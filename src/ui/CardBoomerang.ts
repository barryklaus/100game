import type { CardSpin } from './cardGesture';

/** One held pointer, two deliberate round trips. Small hand tremors never charge it. */
export class CardSwing {
  private axis: 'x' | 'y' | undefined;
  private direction=0;
  private extreme=0;
  private legs=0;
  private began=0;
  private lastTime:number;
  private lastX:number;
  private lastY:number;
  private originX:number;
  private originY:number;
  private span:number;

  constructor(x:number,y:number,time:number,cardWidth:number){
    this.originX=this.lastX=x;this.originY=this.lastY=y;this.lastTime=time;
    this.span=Math.max(22,Math.min(42,cardWidth*.16));
  }
  move(x:number,y:number,time:number):boolean{
    if(time<this.lastTime)return this.ready(this.lastTime);
    if(time-this.lastTime>650||(this.legs&&time-this.began>2400)){
      this.axis=undefined;this.direction=0;this.legs=0;
      this.originX=this.lastX;this.originY=this.lastY;
    }
    const dx=x-this.originX,dy=y-this.originY;
    if(!this.axis&&Math.max(Math.abs(dx),Math.abs(dy))>=this.span){
      this.axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';
      this.direction=Math.sign(this.axis==='x'?dx:dy);
      this.extreme=this.axis==='x'?x:y;this.legs=1;this.began=time;
    }else if(this.axis){
      const value=this.axis==='x'?x:y,travel=(value-this.extreme)*this.direction;
      if(travel>=0)this.extreme=value;
      else if(travel<=-this.span){this.direction*=-1;this.extreme=value;this.legs=Math.min(6,this.legs+1);}
    }
    this.lastX=x;this.lastY=y;this.lastTime=time;
    return this.ready(time);
  }
  ready(time:number):boolean{return this.legs>=4&&time>=this.lastTime&&time-this.lastTime<=900&&time-this.began<=3300;}
  release(time:number,velocity?:{x:number;y:number}):CardSpin|undefined{
    if(!this.ready(time))return;
    const direction=this.direction||1;
    return {x:.12,y:.08,z:direction*Math.sqrt(1-.12**2-.08**2),turns:this.legs>=6?3:2,kind:'boomerang',velocity};
  }
}

/** Hermite travel: retain release velocity, then settle exactly into the pile.
 * Unlike smoothstep alone, momentum has derivative 1 at release and 0 at landing.
 * Spin also starts immediately and decelerates only as the card lands.
 */
export function boomerangTiming(progress:number):{arrival:number;momentum:number;lift:number;spin:number}{
  const t=Math.max(0,Math.min(1,progress));
  return {arrival:t*t*(3-2*t),momentum:t*(1-t)*(1-t),lift:16*t*t*(1-t)*(1-t),spin:t+t*t-t*t*t};
}
/** Screen pixels per millisecond; cap only extreme pointer spikes. */
export function boomerangVelocity(spin:CardSpin):{x:number;y:number}{
  const velocity=spin.velocity??{x:Math.sign(spin.z||1)*.45,y:-.08};
  const x=Number.isFinite(velocity.x)?velocity.x:0,y=Number.isFinite(velocity.y)?velocity.y:0;
  const scale=Math.min(1,1.6/Math.max(.001,Math.hypot(x,y)));
  return {x:x*scale,y:y*scale};
}

/** A bounded loop, returning exactly to the normal pile-fitting curve at both ends. */
export function boomerangOffset(progress:number,direction:number):{x:number;y:number}{
  const t=Math.max(0,Math.min(1,progress));
  if(t===0||t===1)return {x:0,y:0};
  const envelope=Math.sin(Math.PI*t);
  return {x:Math.sign(direction||1)*(1-Math.cos(Math.PI*2*t))*envelope*.5,y:Math.sin(Math.PI*2*t)*envelope};
}
