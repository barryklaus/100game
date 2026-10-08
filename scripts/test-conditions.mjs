import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result=await build({entryPoints:['src/game/rules.ts','src/game/conditions.ts','src/game/cpu.ts'],bundle:true,format:'esm',platform:'node',write:false,outdir:'/tmp/conditions-test'});
const modules=await Promise.all(result.outputFiles.map(file=>import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)));
const {createGame,playCard,selectTarget,nextSeat}=modules.find(m=>m.createGame);
const {conditionForScore}=modules.find(m=>m.conditionForScore);
const {chooseCpuTarget}=modules.find(m=>m.chooseCpuTarget);
const seats=Array.from({length:4},(_,i)=>({name:`P${i}`,kind:'cpu',avatar:i,mood:'Normal'}));
const card=(rank,id='test')=>({id,rank,suit:'fire'});
for(const [score,stage] of [[1,0],[0,0],[-1,1],[-5,1],[-6,2],[-10,2],[-11,3],[-15,3],[-16,4],[-20,4]])assert.equal(conditionForScore(score),stage);
const game=createGame(seats,1,()=>0,true);game.current=0;game.rootTurn=0;game.total=99;game.players[0].hand=[card('A')];playCard(game,'test');assert.equal(game.players[0].ratingDelta,1);
game.current=0;game.rootTurn=0;game.total=99;game.players[0].hand=[card('A','again')];playCard(game,'again');assert.equal(game.players[0].ratingDelta,1,'Exact 100 pays at most once per player per round');
game.current=1;game.players[1].hand=[card('A','bust')];game.match.scores[1]=-12;playCard(game,'bust');
assert.equal(game.match.scores[0],3,'Exact + survive + setup settle together');assert.equal(game.match.scores[1],-17);assert.deepEqual(game.match.newlyDead,[1]);assert.equal(game.match.setup,0);
const next=createGame(seats,2,()=>0,game.match);assert.deepEqual(next.match.scores,game.match.scores);assert.deepEqual(next.match.newlyDead,[]);assert.equal(next.players[1].hand.length,0);assert.equal(nextSeat(next,0),2);next.direction=-1;assert.equal(nextSeat(next,2),0);
next.phase='target';next.pendingSevens=[0];assert.throws(()=>selectTarget(next,1));assert.notEqual(chooseCpuTarget(next,'easy',()=>0),1);
// A previously dead seat gains no further awards; the last living opponent
// closes the match and a fresh match restores all seats at score zero.
const last=createGame(seats,3,()=>0,true);last.match.dead=[1,2];last.match.scores=[-15,-20,-20,8];last.players[1].hand=[];last.players[2].hand=[];last.current=0;last.rootTurn=0;last.total=100;last.players[0].hand=[card('A','last')];last.match.previous=3;playCard(last,'last');
assert.equal(last.match.complete,true);assert.deepEqual(last.match.scores,[-20,-20,-20,10]);assert.deepEqual(last.match.newlyDead,[0]);assert.throws(()=>createGame(seats,4,()=>0,last.match));
const fresh=createGame(seats,1,()=>0,true);assert.deepEqual(fresh.match.scores,[0,0,0,0]);assert.deepEqual(fresh.match.dead,[]);assert(fresh.players.every(p=>p.hand.length===2));
// Either balance can qualify at 30. Current-game points remain independent.
for(const [overall,score,expected] of [[28,0,false],[29,0,true],[-20,29,true],[29,29,true]]){
 const freed=createGame(seats.map((seat,id)=>({...seat,lifetimePoints:id===0?overall:0})),1,()=>0,true);
 freed.match.scores[0]=score;freed.current=1;freed.rootTurn=1;freed.total=100;freed.players[1].hand=[card('A','free')];playCard(freed,'free');
 assert.equal(freed.match.newlyFreed.includes(0),expected,`Overall ${overall}, game ${score}`);
 assert.equal(freed.match.scores[0],score+1,'Overall history never replaces the current-game score');
 if(expected){
  assert.equal(freed.match.newlyFreed.length,1);
  const resumed=createGame(seats,2,()=>0,freed.match);assert.equal(resumed.players[0].hand.length,0);
  assert.equal(nextSeat(resumed,3),1,'Freed seats are skipped');
  resumed.phase='target';resumed.pendingSevens=[2];assert.throws(()=>selectTarget(resumed,0));assert.notEqual(chooseCpuTarget(resumed,'normal',()=>0),0);
 }
}
const together=createGame(seats.map((seat,id)=>({...seat,lifetimePoints:id===0?28:0})),1,()=>0,true);
together.match.scores=[28,-12,0,0];together.match.previous=0;together.total=100;together.current=1;together.players[1].hand=[card('A','together')];playCard(together,'together');
assert.deepEqual(together.match.newlyFreed,[0]);assert.deepEqual(together.match.newlyDead,[1]);assert.equal(together.match.outcomePoints[0],30);assert.equal(together.match.outcomePoints[1],-17);
assert.equal(nextSeat(createGame(seats,2,()=>0,together.match),3),2,'Freed and dead seats are both skipped');
const completed=createGame(seats,1,()=>0,true);completed.match.dead=[2,3];completed.match.scores=[29,0,-20,-20];completed.current=1;completed.total=100;completed.players[1].hand=[card('A','finish')];playCard(completed,'finish');
assert.equal(completed.match.complete,true);assert.deepEqual(completed.match.newlyFreed,[0]);
assert.deepEqual(createGame(seats,1,()=>0,true).match.freed,[],'A new game restores all seats');
const legacy=createGame(seats,1,()=>0);legacy.total=99;legacy.players[0].hand=[card('A')];playCard(legacy,'test');assert.equal(legacy.players[0].ratingDelta,3,'Stable build retains its scoring');
console.log('Condition checks passed: score boundaries, capped exact bonus, setup attribution, settled death, persistent scores, dead-seat skipping, target exclusion and stable compatibility.');
