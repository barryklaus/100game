/** Visual danger is independent of game rules (negative totals are legal). */
export const totalDanger=(total:number):number=>Math.max(0,Math.min(1,total/100));
export function totalMarkup(total:number):string {
  return `<span class="total-value">${total}</span>${total>100?Array.from({length:6},(_,i)=>`<span class="total-shard shard-${i}" aria-hidden="true">${total}</span>`).join(''):''}`;
}
/** Bounded, decaying earthquake; never leaves the camera displaced. */
export function overflowQuake(age:number,reduced:boolean):{x:number;y:number;z:number;roll:number} {
  if(reduced||age<0||age>=2.4)return {x:0,y:0,z:0,roll:0};
  const force=Math.pow(1-age/2.4,2);
  return {x:(Math.cos(age*57)+Math.sin(age*91)*.45)*.23*force,y:Math.sin(age*73)*.17*force,z:Math.cos(age*49)*.13*force,roll:Math.sin(age*63)*.023*force};
}
