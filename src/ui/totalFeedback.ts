/** Visual danger is independent of game rules (negative totals are legal). */
export const totalDanger=(total:number):number=>Math.max(0,Math.min(1,total/100));
export function totalMarkup(total:number):string {
  return `<span class="total-value">${total}</span>${total>100?Array.from({length:6},(_,i)=>`<span class="total-shard shard-${i}" aria-hidden="true">${total}</span>`).join(''):''}`;
}
