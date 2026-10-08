import type { GameState } from './types';
export const FREEDOM_POINTS=30;
export const DEATH_POINTS=-16;
export function isOut(state:GameState,seat:number):boolean {
  return !!(state.match?.dead.includes(seat)||state.match?.freed?.includes(seat));
}
export type Condition=0|1|2|3|4;
/** Evaluate only settled match scores. Zero is healthy; positive scores recover. */
export function conditionForScore(score:number):Condition {
  return score<=DEATH_POINTS?4:score<=-11?3:score<=-6?2:score<0?1:0;
}
export const conditionName=(stage:Condition):string=>['Healthy','Bruised','Battered','Held together by bandages','Dead'][stage];
