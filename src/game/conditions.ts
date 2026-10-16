import type { GameState } from './types';
import { DEFAULT_MATCH_LIMITS } from './matchLimits';
export const FREEDOM_POINTS=DEFAULT_MATCH_LIMITS.freedom;
export const DEATH_POINTS=DEFAULT_MATCH_LIMITS.death;
export function isOut(state:GameState,seat:number):boolean {
  return !!(state.match?.dead.includes(seat)||state.match?.freed?.includes(seat));
}
/** Keep stable rule/account IDs; presentation packs only the remaining seats. */
export function tableSeats(state:GameState,settled=true):number[] {
  return state.players.filter(player=>!isOut(state,player.id)||(!settled&&state.phase==='ended'&&(state.match?.newlyDead.includes(player.id)||state.match?.newlyFreed?.includes(player.id)))).map(player=>player.id);
}
export type Condition=0|1|2|3|4;
/** Evaluate only settled match scores. Zero is healthy; positive scores recover. */
export function conditionForScore(score:number,death=DEATH_POINTS):Condition {
  const depth=-score,limit=Math.abs(death);
  return score>=0?0:depth>=limit?4:depth<=Math.ceil(limit/3)?1:depth<=Math.ceil(limit*2/3)?2:3;
}
export const conditionName=(stage:Condition):string=>['Healthy','Bruised','Battered','Held together by bandages','Dead'][stage];
