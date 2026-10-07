export type CardGrip = {x:number;y:number};
export type CardSpin = {x:number;y:number;z:number;turns:number;kind?:'boomerang'};
export type CardGesture = {dx:number;dy:number;duration:number;canceled:boolean;inspecting:boolean;canPlay:boolean;grip?:CardGrip;releaseVX?:number};
/** Short upward gestures and deliberate inward edge flicks play; slow sways do not. */
export function isPlayGesture(gesture:CardGesture):boolean {
  const {dx,dy,duration,canceled,inspecting,canPlay,grip,releaseVX=0}=gesture;
  if(canceled||inspecting||!canPlay)return false;
  const distance=Math.hypot(dx,dy);
  const upward=(dy<=-18&&distance>=18&&Math.abs(dy)>Math.abs(dx)*.32)||(dy<=-10&&distance>=14&&distance/Math.max(1,duration)>.35&&Math.abs(dy)>Math.abs(dx)*.2);
  const inward=grip&&Math.abs(grip.x)>.56&&grip.x*dx<0&&Math.abs(dx)>=24&&Math.abs(dx)>Math.abs(dy)*.9&&Math.abs(releaseVX)>=.3&&releaseVX*dx>0;
  return upward||!!inward;
}

export type CardTap = {id:string;x:number;y:number;time:number;grip?:CardGrip};
/** Works across mouse and touch even when the selected card's DOM node changes. */
export function isDoubleCardTap(previous:CardTap|null, current:CardTap):boolean {
  return !!previous && previous.id===current.id && current.time-previous.time<=340
    && current.time>=previous.time && Math.hypot(current.x-previous.x,current.y-previous.y)<=32;
}

/** Capture the initial contact; never infer the grip from the moved card. */
export function cardGrip(rect:{left:number;top:number;width:number;height:number},x:number,y:number):CardGrip {
  if(rect.width<=0||rect.height<=0)return {x:0,y:0};
  const u=(x-rect.left)/rect.width,v=(y-rect.top)/rect.height;
  if(u<0||u>1||v<0||v>1)return {x:0,y:0};
  return {x:u*2-1,y:v*2-1};
}
export function isCardEdgeGrip(rect:{left:number;top:number;width:number;height:number},x:number,y:number):boolean {
  const grip=cardGrip(rect,x,y);
  return Math.abs(grip.x)>.56||Math.abs(grip.y)>.64;
}

/** Controlled angular impulse: edge flips, corner torque, and whole turns for a clean landing.
 * x/y use the card's local axes; screen-y is downward. No heavy physics simulation.
 */
export function cardFlickSpin(grip:CardGrip,dx:number,dy:number,speed=0):CardSpin|undefined {
  const side=Math.abs(grip.x)>.56, end=Math.abs(grip.y)>.64;
  if(!side&&!end)return;
  let x=0,y=0,z=0;
  if(side)y=Math.abs(dx)>3?Math.sign(dx):-Math.sign(grip.x);
  if(end)x=Math.abs(dy)>3?Math.sign(dy):Math.sign(grip.y);
  if(side&&end){
    const length=Math.max(1,Math.hypot(dx,dy));
    z=(grip.y*dx-grip.x*dy)/length*.45;
  }
  const length=Math.hypot(x,y,z);
  return {x:x/length,y:y/length,z:z/length,turns:speed>1.25?2:1};
}
