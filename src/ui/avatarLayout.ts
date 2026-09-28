/** Stable, symmetric screen-space seats; the local hand always stays at the bottom. */
export function avatarAnchor(playerIndex:number,localSeat:number,count:number,portrait:boolean):{x:number;y:number}{
  const relative=(playerIndex-localSeat+count)%count;
  const others=count-1;
  const angle=others===1?0:-Math.PI*.76+(relative-1)/(others-1)*Math.PI*1.52;
  return {x:.5+Math.sin(angle)*(portrait?.38:.365),y:portrait?.26+(1-Math.cos(angle))*.105:.205+(1-Math.cos(angle))*.16};
}
