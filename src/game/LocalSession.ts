import { MOODS } from '../data/config';
import { makeDeck } from './deckCore';
import type { GameState } from './types';
import type { RoundAccounts } from '../../worker/roundAccounts';
import { cleanStatDelta } from '../account/model';

type Storage = { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem(key:string):void };
export interface LocalCheckpoint { state:GameState; cast:string; practice:RoundAccounts|null; dismissed:string[] }
const KEY='100next.local-table.v1';
const integer=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&Math.abs(value)<=1e9;
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** Reject incomplete saves before they can enter the CPU or presentation code. */
export function validLocalState(value:unknown):value is GameState {
  if(!object(value)||!Array.isArray(value.players)||value.players.length<2||value.players.length>8)return false;
  const count=value.players.length,seat=(n:unknown)=>integer(n)&&Number(n)>=0&&Number(n)<count;
  const seats=(v:unknown):v is number[]=>Array.isArray(v)&&v.every(seat);
  if(!seat(value.current)||!seat(value.rootTurn)||!integer(value.turn)||value.turn<0||!integer(value.round)||value.round<1||!integer(value.total))return false;
  if(![1,-1].includes(value.direction)||!['playing','target','ended'].includes(value.phase)||typeof value.forced!=='boolean')return false;
  if(!['none','exact','bust','seven','reverse','zero','minus'].includes(value.event)||!seats(value.pendingSevens)||value.pendingSevens.length>10000)return false;
  if(value.phase==='target'&&!value.pendingSevens.length)return false;
  if(value.phase==='ended'?!seat(value.bust):value.bust!==null)return false;
  if(!Array.isArray(value.log)||value.log.length>24||!value.log.every((s:unknown)=>typeof s==='string'&&s.length<1000))return false;
  if(!Array.isArray(value.exactEvents)||value.exactEvents.length>10000||!value.exactEvents.every((v:unknown)=>object(v)&&seat(v.player)&&v.total===100))return false;
  const cards=makeDeck(),expected=new Map(cards.map(card=>[card.id,card])),seen=new Set<string>();
  const pile=(v:unknown)=>Array.isArray(v)&&v.every(card=>{
    if(!object(card))return false;
    const original=expected.get(card.id);
    if(!original||original.rank!==card.rank||original.suit!==card.suit||seen.has(card.id))return false;
    seen.add(card.id);return true;
  });
  for(const [id,player] of value.players.entries()){
    if(!object(player)||player.id!==id||typeof player.name!=='string'||player.name.length>120||!['human','cpu'].includes(player.kind)||!MOODS.includes(player.mood)||!integer(player.avatar)||player.avatar<0||player.avatar>15||!integer(player.ratingDelta)||!integer(player.exacts)||player.exacts<0||!Array.isArray(player.hand)||player.hand.length>2||!pile(player.hand))return false;
    for(const field of ['freedoms','deaths','lifetimePoints'])if(player[field]!==undefined&&!integer(player[field]))return false;
  }
  if(!pile(value.drawPile)||!pile(value.played)||seen.size!==cards.length)return false;
  const match=value.match;
  if(!object(match)||!Array.isArray(match.scores)||match.scores.length!==count||!match.scores.every(integer)||typeof match.complete!=='boolean')return false;
  for(const field of ['dead','newlyDead','freed','newlyFreed'])if(!seats(match[field])||new Set(match[field]).size!==match[field].length)return false;
  if(match.dead.some((id:number)=>match.freed.includes(id))||match.newlyDead.some((id:number)=>!match.dead.includes(id))||match.newlyFreed.some((id:number)=>!match.freed.includes(id)))return false;
  for(const field of ['previous','setup'])if(match[field]!==null&&!seat(match[field]))return false;
  if(match.outcomePoints!==undefined&&(!object(match.outcomePoints)||!Object.entries(match.outcomePoints).every(([key,score])=>seat(Number(key))&&integer(score))))return false;
  const out=[...match.dead,...match.freed];
  if(value.phase!=='ended'&&(out.includes(value.current)||value.players.some((p:any)=>out.includes(p.id)?p.hand.length!==0:p.hand.length!==2)))return false;
  return true;
}

/** Tab-local recovery only: online rooms remain owned by their server. */
export class LocalSession {
  private written='';
  constructor(private storage:Storage){}
  save(checkpoint:LocalCheckpoint|null):void {
    try {
      if(!checkpoint){this.storage.removeItem(KEY);this.written='';return;}
      const text=JSON.stringify({version:1,...checkpoint});
      if(text===this.written)return;
      this.storage.setItem(KEY,text);this.written=text;
    }catch {/* Storage restrictions must never stop a turn. */}
  }
  restore(cast:string):LocalCheckpoint|null {
    try {
      const text=this.storage.getItem(KEY);if(!text)return null;
      const saved=JSON.parse(text);
      if(saved.version!==1||saved.cast!==cast||!validLocalState(saved.state))return null;
      let practice:RoundAccounts|null=null;
      const record=saved.practice;
      if(object(record)&&typeof record.id==='string'&&record.id.length<=80&&object(record.accounts)&&object(record.actions)&&typeof record.committed==='boolean'){
        const count=saved.state.players.length,seat=(n:unknown)=>integer(n)&&Number(n)>=0&&Number(n)<count;
        if(Object.entries(record.accounts).every(([key,id])=>seat(Number(key))&&typeof id==='string'&&id.length<=80)&&[record.previous,record.setup].every(n=>n===null||seat(n))){
          practice={id:record.id,accounts:record.accounts,actions:Object.fromEntries(Object.entries(record.actions).filter(([key])=>seat(Number(key))).map(([key,value])=>[key,cleanStatDelta(value,true)])),previous:record.previous,setup:record.setup,committed:record.committed};
        }
      }
      this.written=text;
      return {state:saved.state,cast,practice,dismissed:Array.isArray(saved.dismissed)?saved.dismissed.filter((s:unknown)=>typeof s==='string'&&/^\d+:\d+:(death|freedom)$/.test(s)):[]};
    }catch {return null;}
  }
}
