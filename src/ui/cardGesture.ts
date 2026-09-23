export type CardGesture = {dx:number;dy:number;duration:number;canceled:boolean;inspecting:boolean;canPlay:boolean};
/** A short upward gesture plays; sideways sways, inspection and cancellation never do. */
export function isPlayGesture(gesture:CardGesture):boolean {
  const {dx,dy,duration,canceled,inspecting,canPlay}=gesture;
  if(canceled||inspecting||!canPlay)return false;
  const distance=Math.hypot(dx,dy);
  return (dy<=-18&&distance>=18&&Math.abs(dy)>Math.abs(dx)*.32)||(dy<=-10&&distance>=14&&distance/Math.max(1,duration)>.35&&Math.abs(dy)>Math.abs(dx)*.2);
}

export type CardTap = {id:string;x:number;y:number;time:number};
/** Works across mouse and touch even when the selected card's DOM node changes. */
export function isDoubleCardTap(previous:CardTap|null, current:CardTap):boolean {
  return !!previous && previous.id===current.id && current.time-previous.time<=340
    && current.time>=previous.time && Math.hypot(current.x-previous.x,current.y-previous.y)<=32;
}

/** Starting at a card's edge gives a flick enough leverage to spin it. */
export function isCardEdgeGrip(rect:{left:number;top:number;width:number;height:number},x:number,y:number):boolean {
  if(rect.width<=0||rect.height<=0)return false;
  const u=(x-rect.left)/rect.width,v=(y-rect.top)/rect.height;
  return u>=0&&u<=1&&v>=0&&v<=1&&(u<.22||u>.78||v<.18||v>.82);
}
