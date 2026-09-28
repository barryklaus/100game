/** All portraits share one shallow, symmetric arc. The local hand stays below. */
export function avatarAnchor(playerIndex:number,localSeat:number,count:number,portrait:boolean):{x:number;y:number}{
  // Put the local portrait near the middle without changing clockwise seat order.
  const slot=(playerIndex-localSeat+Math.floor((count-1)/2)+count)%count;
  const u=count===1?0:slot/(count-1)*2-1;
  return {x:.5+u*(portrait?.43:.40),y:(portrait?.295:.205)+u*u*(portrait?.026:.065)};
}
