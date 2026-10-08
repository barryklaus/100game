import type { GameState } from './types';
export const FREEDOM_POINTS=30;
export const DEATH_POINTS=-16;
export function isOut(state:GameState,seat:number):boolean {
  return !!(state.match?.dead.includes(seat)||state.match?.freed?.includes(seat));
}
/** Keep stable rule/account IDs; presentation packs only the remaining seats. */
export function tableSeats(state:GameState,settled=true):number[] {
  return state.players.filter(player=>!isOut(state,player.id)||(!settled&&state.phase==='ended'&&(state.match?.newlyDead.includes(player.id)||state.match?.newlyFreed?.includes(player.id)))).map(player=>player.id);
}
export type Condition=0|1|2|3|4;
/** Evaluate only settled match scores. Zero is healthy; positive scores recover. */
export function conditionForScore(score:number):Condition {
  return score<=DEATH_POINTS?4:score<=-11?3:score<=-6?2:score<0?1:0;
}
export const conditionName=(stage:Condition):string=>['Healthy','Bruised','Battered','Held together by bandages','Dead'][stage];
