import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{
  const bundle=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
};
const {LocalSession,validLocalState}=await load('src/game/LocalSession.ts');
const {createGame,playCard,selectTarget}=await load('src/game/rules.ts');
const {chooseCpuCard,chooseCpuTarget}=await load('src/game/cpu.ts');
const {newRoundAccounts,recordPlayed}=await load('worker/roundAccounts.ts');
const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
let moves=0,rounds=0,targets=0,outcomes=0;
let seed=19;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(let count=2;count<=8;count++){
  const configs=Array.from({length:count},(_,id)=>({name:`Seat ${id}`,kind:id?'cpu':'human',avatar:id,mood:'Normal'}));
  let state=createGame(configs,1,random,true),practice=newRoundAccounts({0:'test-owner'});
  for(let round=1;round<=25;round++){
    while(state.phase!=='ended'){
      assert(++moves<20000,'CPU tables must continue to finish rounds');
      const before=structuredClone(state);
      if(state.phase==='target'){selectTarget(state,chooseCpuTarget(state,'normal'));targets++;}
      else {playCard(state,chooseCpuCard(state,'normal').id);recordPlayed(practice,before,state);}
      assert(validLocalState(state),'Every accepted move is recoverable, including CHOOSE chains');
      const checkpoint={state,cast:'midnight',practice,dismissed:[]};
      new LocalSession(storage).save(checkpoint);
      const recovered=new LocalSession(storage).restore('midnight');
      assert.deepEqual(recovered,checkpoint,'Reload restores the exact turn, both hands, piles, scores and practice event ID');
      state=recovered.state;practice=recovered.practice;
    }
    rounds++;outcomes+=state.match.newlyDead.length+state.match.newlyFreed.length;
    practice.committed=true;
    const dismissed=[...state.match.newlyDead.map(seat=>`${state.round}:${seat}:death`),...state.match.newlyFreed.map(seat=>`${state.round}:${seat}:freedom`)];
    const session=new LocalSession(storage);session.save({state,cast:'midnight',practice,dismissed});
    const ended=session.restore('midnight');
    assert(ended.practice.committed,'Reloading round results cannot resubmit an already committed account round');
    assert.deepEqual(ended.dismissed,dismissed,'Dismissed outcomes stay dismissed after reload');
    assert.equal(session.restore('observatory'),null,'Cast previews cannot consume a different table');
    if(state.match.complete)break;
    state=createGame(configs,state.round+1,random,state.match);practice=newRoundAccounts({0:'test-owner'});
  }
}
assert(targets>0&&outcomes>0);
const valid=createGame([{name:'A',kind:'human',avatar:0,mood:'Normal'},{name:'B',kind:'cpu',avatar:1,mood:'Normal'}],1,random,true);
for(const corrupt of [s=>s.players[0].hand.push(s.players[1].hand[0]),s=>s.current=99,s=>s.players[1].hand=[],s=>s.phase='target',s=>s.match.scores=[0],s=>s.match.dead=[99]]){
 const broken=structuredClone(valid);corrupt(broken);assert.equal(validLocalState(broken),false);
}
const session=new LocalSession(storage);session.save({state:valid,cast:'midnight',practice:null,dismissed:[]});session.save(null);assert.equal(session.restore('midnight'),null,'Leaving the table deletes recovery data');
const blocked=new LocalSession({getItem(){throw Error('Blocked');},setItem(){throw Error('Full');},removeItem(){throw Error('Blocked');}});
blocked.save({state:valid,cast:'midnight',practice:null,dismissed:[]});blocked.save(null);assert.equal(blocked.restore('midnight'),null);

const {DecodeQueue}=await load('src/ui/DecodeQueue.ts');
let active=0,peak=0;const gates=[];const queue=new DecodeQueue();
const jobs=Array.from({length:30},(_,index)=>queue.run(async()=>{
 active++;peak=Math.max(peak,active);await new Promise(resolve=>gates.push(resolve));active--;
 if(index===4)throw Error('Missing sprite');return index;
}));
const completed=Promise.allSettled(jobs);
for(let i=0;i<100&&gates.length<2;i++)await Promise.resolve();
assert.equal(active,2,'Only two full resolution sprites decode at once');
for(let i=0;i<30;i++){
 while(!gates.length)await Promise.resolve();gates.shift()();for(let k=0;k<20;k++)await Promise.resolve();
}
const results=await completed;assert.equal(peak,2);assert.equal(active,0);assert.equal(results.filter(r=>r.status==='rejected').length,1,'A decode failure releases its slot');

const {MasterAnimations}=await load('src/ui/MasterAnimations.ts');
globalThis.Image=class{decode(){return Promise.resolve();}};
const names=['finn','june','vince','bianca','edgar','roxie','otis','paloma'];
const nodes=names.map(character=>({dataset:{character},querySelector:()=>({isConnected:true,style:{}})}));
const root={querySelector:s=>nodes[Number(s.match(/data-seat="(\d+)"/)?.[1])],querySelectorAll:()=>[]};
const cast=new MasterAnimations(root);
await Promise.all(names.map((_,i)=>cast.warm(i,'throw')));
assert([...cast.assetBytes.values()].reduce((a,b)=>a+b,0)<=24*1024*1024,'Idle prewarming obeys a decoded-byte budget, not just an image count');
assert(cast.assets.size<=24);
assert([...cast.assets.keys()].every(url=>url.endsWith('.webp')),'Native character artwork remains unchanged');
cast.reset();assert.equal(cast.assetBytes.size,0);assert.equal(cast.assets.size,0);
console.log(`Local stability passed: ${moves} recoverable moves, ${rounds} CPU rounds across 2–8 seats, CHOOSE/outcomes, account deduplication, corrupt/blocked storage, bounded decoding and bitmap cache.`);
