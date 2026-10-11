import { isOut } from './conditions';
import type { GameState } from './types';

export type AutoRoundStep = {key:string;delay:number;outcome?:{seat:number;kind:'death'|'freedom'}};
/** Only the table's controlling human can advance it. Never restart a finished match. */
export function autoRoundStep(state:GameState|null,owner:number,dismissed:ReadonlySet<string>,ready:boolean):AutoRoundStep|null {
  if(!ready||!state||state.phase!=='ended'||state.match?.complete||state.players[owner]?.kind!=='human'||!state.players[owner].autopilot||isOut(state,owner))return null;
  const outcomes=[...(state.match?.newlyDead??[]).map(seat=>({seat,kind:'death' as const})),...(state.match?.newlyFreed??[]).map(seat=>({seat,kind:'freedom' as const}))];
  const outcome=outcomes.find(item=>!dismissed.has(`${state.round}:${item.seat}:${item.kind}`));
  return outcome?{key:`${state.round}:${outcome.seat}:${outcome.kind}`,delay:8000,outcome}:{key:`${state.round}:${state.turn}:next`,delay:3000};
}

/** One cancellable timer; ordinary renders must not restart the score-reading pause. */
export class AutoRoundAdvance {
  private key='';
  private epoch=0;
  private timer:unknown;
  constructor(private later=(action:()=>void,delay:number):unknown=>setTimeout(action,delay),private cancel=(timer:unknown)=>clearTimeout(timer as ReturnType<typeof setTimeout>)){}
  sync(step:AutoRoundStep|null,fire:(step:AutoRoundStep)=>void):void {
    if(this.key===(step?.key??''))return;
    const epoch=++this.epoch;
    if(this.timer!==undefined)this.cancel(this.timer);
    this.timer=undefined;this.key=step?.key??'';
    if(!step)return;
    this.timer=this.later(()=>{if(this.epoch!==epoch||this.key!==step.key)return;this.key='';this.timer=undefined;fire(step);},step.delay);
  }
}
