import assert from 'node:assert/strict';
import { build } from 'esbuild';
const load=async path=>{
  const bundle=await build({entryPoints:[path],bundle:true,format:'esm',platform:'node',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
};
const {normalizeMatchLimits,validMatchLimits}=await load('src/game/matchLimits.ts');
const {createGame,playCard}=await load('src/game/rules.ts');
const {conditionForScore}=await load('src/game/conditions.ts');
const {createRoom,joinRoom,applyCommand,snapshotForSeat}=await load('src/game/hostedCore.ts');
const {normalizeSettings}=await load('src/data/storage.ts');
const {LocalSession,validLocalState}=await load('src/game/LocalSession.ts');
const defaults={freedom:15,death:-15};
for(const value of [undefined,null,[],{},'30',{freedom:0,death:-15},{freedom:15,death:0},{freedom:1.5,death:-6},{freedom:10,death:-5.5},{freedom:1001,death:-15},{freedom:15,death:-1001},{freedom:Infinity,death:-6}]){
  assert.equal(validMatchLimits(value),false);
  assert.deepEqual(normalizeMatchLimits(value),defaults);
}
assert(validMatchLimits({freedom:1,death:-3}));
assert(!validMatchLimits({freedom:15,death:-20}),'Death limits must divide evenly into three injury stages');
assert.deepEqual(normalizeSettings({}).matchLimits,defaults,'Old preferences use +15/−15');
assert.deepEqual(normalizeSettings({matchLimits:{freedom:30,death:-24}}).matchLimits,{freedom:30,death:-24});
const seats=Array.from({length:4},(_,id)=>({name:`Seat ${id}`,kind:id?'cpu':'human',avatar:id,mood:'Normal'}));
const overflow=(game)=>{
  game.current=game.rootTurn=1;game.total=100;
  game.players[1].hand=[{id:'boundary',rank:'1',suit:'fire'}];
  playCard(game,'boundary');
};
for(const limits of [{freedom:3,death:-6},{freedom:30,death:-24},{freedom:1000,death:-999}]){
  for(const offset of [-1,0,1]){
    const game=createGame(seats,1,()=>.4,true,limits);
    game.match.scores[0]=limits.freedom-1+offset;
    game.match.scores[1]=limits.death+5+offset;
    overflow(game);
    assert.equal(game.match.newlyFreed.includes(0),offset>=0,'Freedom includes the chosen boundary');
    assert.equal(game.match.newlyDead.includes(1),offset<=0,'Death includes the chosen boundary');
    assert.deepEqual(game.match.limits,limits);
  }
  const game=createGame(seats,1,()=>.4,true,limits);
  const copied={...limits};limits.freedom++;assert.deepEqual(game.match.limits,copied,'New-match settings are copied');limits.freedom--;
  overflow(game);
  const next=createGame(seats,2,()=>.4,game.match,{freedom:1,death:-3});
  assert.deepEqual(next.match.limits,limits,'A later round cannot replace the table rules');
  assert.deepEqual(next.match.scores,game.match.scores);
  assert.equal(conditionForScore(limits.death,limits.death),4);
  assert.notEqual(conditionForScore(limits.death+1,limits.death),4,'Only the selected Death limit shows the dead pose');
}
assert.deepEqual([-1,-10,-11,-20,-21,-29,-30].map(score=>conditionForScore(score,-30)),[1,1,2,2,3,3,4]);
const legacy=createGame(seats,1,()=>.4,true);delete legacy.match.limits;
assert(validLocalState(legacy),'Pre-update local tables remain recoverable');
assert.deepEqual(createGame(seats,2,()=>.4,legacy.match,{freedom:30,death:-30}).match.limits,defaults,'Old tables retain their original rules');
const saved=createGame(seats,1,()=>.4,true,{freedom:30,death:-24});
const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
new LocalSession(storage).save({state:saved,cast:'midnight',practice:null,dismissed:[]});
assert.deepEqual(new LocalSession(storage).restore('midnight').state.match.limits,{freedom:30,death:-24},'Reload preserves the match rules');
saved.match.limits.death=0;assert.equal(validLocalState(saved),false,'Corrupt limits cannot restore a table');

const host={name:'Host',avatar:0,mood:'Normal'},guest={name:'Guest',avatar:1,mood:'Normal'};
assert.throws(()=>createRoom('invalid',host,'h',1,{freedom:0,death:-15}),/whole points/);
const room=createRoom('100-limits-test',host,'h',1,{freedom:30,death:-24});room.nextRules=true;
joinRoom(room,guest,null,'g',2);
assert.deepEqual(snapshotForSeat(room,1).matchLimits,{freedom:30,death:-24},'Guests see the initial host-selected limits');
assert.throws(()=>applyCommand(room,1,{type:'match-limits',limits:defaults},3),/Only the host/);
for(const limits of [{freedom:0,death:-15},{freedom:30,death:15},{freedom:2.5,death:-10},null]){
  const revision=room.revision;
  assert.throws(()=>applyCommand(room,0,{type:'match-limits',limits},4),/whole points/);
  assert.equal(room.revision,revision,'Invalid input cannot mutate room rules');
}
applyCommand(room,0,{type:'match-limits',limits:{freedom:25,death:-30}},5);
applyCommand(room,0,{type:'cpu-count',count:2},6);
assert.deepEqual(snapshotForSeat(room,1).matchLimits,{freedom:25,death:-30},'CPU changes preserve agreed rules');
joinRoom(room,guest,'g','unused',7);
applyCommand(room,0,{type:'start'},8);
assert.deepEqual(room.state.match.limits,{freedom:25,death:-30});
assert.throws(()=>applyCommand(room,0,{type:'match-limits',limits:defaults},9),/before the table starts/);
overflow(room.state);
const recovered=structuredClone(room);
applyCommand(recovered,0,{type:'start'},10);
assert.equal(recovered.state.round,2);
assert.deepEqual(recovered.state.match.limits,{freedom:25,death:-30},'Worker recovery and next rounds retain limits');
assert.deepEqual(snapshotForSeat(recovered,1).state.match.limits,{freedom:25,death:-30});
const oldRoom=createRoom('100-old-room',host,'h',1);oldRoom.nextRules=true;delete oldRoom.matchLimits;
assert.deepEqual(snapshotForSeat(oldRoom,0).matchLimits,defaults,'Old lobbies remain compatible');
console.log('Match limit checks passed: configurable outcomes, inclusive boundaries, injury stages, reload/legacy compatibility, private room snapshots, host-only validation and locked rules across rounds.');
