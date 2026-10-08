import { emptyAccountStats, type AccountStats } from '../src/account/model';
import type { GameState } from '../src/game/types';
export interface RoundAccounts { id:string; accounts:Record<number,string>; actions:Record<number,AccountStats>; previous:number|null; setup:number|null; committed:boolean }
export function newRoundAccounts(accounts:Record<number,string>):RoundAccounts {return {id:crypto.randomUUID(),accounts:{...accounts},actions:{},previous:null,setup:null,committed:false};}
export function recordPlayed(record:RoundAccounts,before:GameState,after:GameState):void {
  const top=after.played.at(-1);if(!top||top.id===before.played.at(-1)?.id)return;
  const actor=before.current,stats=record.actions[actor]??=emptyAccountStats();stats.cards++;
  const special={'7':'sevens','8':'eights','9':'nines','10':'tens'} as const;
  const key=special[top.rank as keyof typeof special];if(key)stats[key]++;
  if(after.phase==='ended')record.setup=record.previous!==actor?record.previous:null;
  record.previous=actor;
}
export function roundDelta(record:RoundAccounts,state:GameState,seat:number):AccountStats {
  const alreadyOut=(state.match?.dead.includes(seat)&&!state.match.newlyDead.includes(seat))||(state.match?.freed?.includes(seat)&&!state.match.newlyFreed?.includes(seat));
  return {...emptyAccountStats(),...record.actions[seat],rounds:alreadyOut?0:1,exacts:state.players[seat].exacts,survives:alreadyOut||state.bust===seat?0:1,busts:state.bust===seat?1:0,setups:record.setup===seat?1:0,deaths:state.match?.newlyDead.includes(seat)?1:0,freedoms:state.match?.newlyFreed?.includes(seat)?1:0};
}
