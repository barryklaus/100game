export type CardGesture = {dx:number;dy:number;duration:number;canceled:boolean;inspecting:boolean;canPlay:boolean};
/** A short upward gesture plays; sideways sways, inspection and cancellation never do. */
export function isPlayGesture(gesture:CardGesture):boolean {
  const {dx,dy,duration,canceled,inspecting,canPlay}=gesture;
  if(canceled||inspecting||!canPlay)return false;
  const distance=Math.hypot(dx,dy);
  return (dy<=-18&&distance>=18&&Math.abs(dy)>Math.abs(dx)*.32)||(dy<=-10&&distance>=14&&distance/Math.max(1,duration)>.35&&Math.abs(dy)>Math.abs(dx)*.2);
}
