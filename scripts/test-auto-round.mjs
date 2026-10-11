import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);};
const {AutoRoundAdvance,autoRoundStep}=await load('src/game/AutoRoundAdvance.ts');
const {createGame,playCard,selectTarget}=await load('src/game/rules.ts');
const {chooseCpuCard,chooseCpuTarget}=await load('src/game/cpu.ts');
const {scoreTransition}=await load('src/ui/ScoreTransition.ts');
const configs=n=>Array.from({length:n},(_,id)=>({name:`P${id}`,avatar:id,kind:id===0?'human':'cpu',mood:'Normal',autopilot:id===0}));
let advanced=0;
for(let count=2;count<=8;count++){
  let state=createGame(configs(count),1,Math.random,true);
  const dismissed=new Set();
  for(let round=1;round<=30;round++){
    for(let guard=0;state.phase!=='ended';guard++){
      assert(guard<5000,'A round must finish');
      if(state.phase==='target')selectTarget(state,chooseCpuTarget(state,'normal'));
      else playCard(state,chooseCpuCard(state,'normal').id);
    }
    assert.equal(autoRoundStep(state,0,dismissed,false),null,'Do not skip the Overflow animation');
    let step=autoRoundStep(state,0,dismissed,true);
    if(state.match.complete||state.match.dead.includes(0)||state.match.freed.includes(0)){
      assert.equal(step,null,'Own Death/Freedom and finished tables stop Auto');break;
    }
    while(step?.outcome){
      assert.equal(step.delay,8000,'Show each full-screen outcome before returning');
      dismissed.add(step.key);step=autoRoundStep(state,0,dismissed,true);
    }
    assert.equal(step.delay,3000,'Leave time to read scores');
    assert.equal(step.outcome,undefined);
    const markup=scoreTransition(state,true,false,s=>s,false,true,0);
    assert(markup.includes('AUTO · Next round shortly.'));
    assert(markup.includes('data-auto-seat="0"'),'Scores offer a working cancel control');
    state=createGame(configs(count),round+1,Math.random,state.match);advanced++;
    assert.equal(state.players[0].autopilot,true);
    assert.equal(state.phase,'playing');assert.equal(state.total,0);
    assert.equal(autoRoundStep(state,0,dismissed,true),null,'Never restart a running round');
  }
}
assert(advanced>=7);
const state=createGame(configs(4),1,()=>0,true);state.phase='ended';state.bust=1;
state.match.newlyDead=[1];state.match.dead=[1];state.match.newlyFreed=[2];state.match.freed=[2];
const dismissed=new Set();
assert.equal(autoRoundStep(state,0,dismissed,true).outcome.kind,'death');dismissed.add('1:1:death');
assert.equal(autoRoundStep(state,0,dismissed,true).outcome.kind,'freedom');dismissed.add('1:2:freedom');
const next=autoRoundStep(state,0,dismissed,true);assert.equal(next.outcome,undefined);
state.players[0].autopilot=false;assert.equal(autoRoundStep(state,0,dismissed,true),null);
state.players[0].autopilot=true;assert.equal(autoRoundStep(state,3,dismissed,true),null,'CPU is never a next-round owner');
let jobs=new Map(),serial=0,fired=[];
const scheduler=new AutoRoundAdvance((action,delay)=>{const id=++serial;jobs.set(id,{action,delay});return id;},id=>jobs.delete(id));
const fire=step=>fired.push(step.key);
scheduler.sync(next,fire);scheduler.sync(next,fire);scheduler.sync({...next},fire);
assert.equal(jobs.size,1);assert.equal(serial,1,'Repeated renders do not postpone progression');
const stale=jobs.get(1).action;scheduler.sync(null,fire);assert.equal(jobs.size,0);
stale();assert.deepEqual(fired,[],'Canceled callbacks cannot advance the table');
scheduler.sync(next,fire);stale();assert.deepEqual(fired,[],'A canceled callback cannot consume a restarted pause');const job=jobs.get(2);assert.equal(job.delay,3000);job.action();
assert.deepEqual(fired,[next.key]);
scheduler.sync(null,fire);
const onlineMarkup=scoreTransition(state,true,true,s=>s,false,true,3);
assert(onlineMarkup.includes('data-auto-seat="3"'),'Cancel uses the actual host, not the first auto player');
console.log(`Auto round checks passed: ${advanced} automatic rounds across 2–8 seats, score pause, outcome scenes, cancellation, stale callbacks, host ownership and terminal outcomes.`);
