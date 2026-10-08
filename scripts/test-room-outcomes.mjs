import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.MODE':'"100next"'}});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);};
const {createRoom,joinRoom,applyCommand,sweepDisconnected,seatForToken,snapshotForSeat,roomParticipants,advanceCpu,scheduleCpuAction}=await load('src/game/hostedCore.ts');
const {tableSeats}=await load('src/game/conditions.ts');
const {newRoundAccounts,roundDelta}=await load('worker/roundAccounts.ts');
const profile=id=>({name:`P${id}`,avatar:id,mood:'Normal',lifetimePoints:0});
for(let count=2;count<=8;count++)for(const kind of ['death','freedom'])for(const leaving of count===2?[0,1]:[0,1,2]){
  const room=createRoom('100-test-outcomes',profile(0),'host');room.nextRules=true;
  joinRoom(room,profile(1),null,'guest');
  room.members.forEach(member=>member.accountId=`account-${member.seat}`);
  applyCommand(room,0,{type:'cpu-count',count:count-2});applyCommand(room,0,{type:'start'});
  const record=newRoundAccounts(Object.fromEntries(room.members.map(member=>[member.seat,member.accountId])));
  const state=room.state,actor=kind==='death'?leaving:(leaving+1)%count;
  state.current=state.rootTurn=actor;state.total=100;state.match.scores[leaving]=kind==='death'?-12:29;
  state.players[actor].hand=[{id:'overflow',rank:'A',suit:'fire'},{id:'spare',rank:'2',suit:'water'}];
  if(actor<2)applyCommand(room,actor,{type:'play',cardId:'overflow'});
  else {scheduleCpuAction(room,0);assert(advanceCpu(room,room.cpuAction.dueAt),'The real CPU scheduler settles and retires its actor');}
  assert(!tableSeats(state).includes(leaving),'The departed player is absent from the table');
  assert(tableSeats(state,false).includes(leaving),'Their final round animation can finish before removal');
  assert.equal(state.players[leaving].hand.length,0,'No cards remain in the departed hand');
  assert.equal(room.members.some(member=>member.seat===leaving),false,'Departed humans are removed from active room membership');
  assert.equal(room.cpuCount,room.seats.filter((player,id)=>player.kind==='cpu'&&id!==leaving).length,'CPU room count excludes retired CPU seats');
  if(leaving<2){
    assert.equal(roomParticipants(room).find(member=>member.seat===leaving).accountId,`account-${leaving}`,'Account identity remains available to settle final statistics');
    const delta=roundDelta(record,state,leaving);
    assert.equal(delta[kind==='death'?'deaths':'freedoms'],1,'Final outcome statistics still pay exactly once');
    const token=leaving===0?'host':'guest';
    assert.throws(()=>joinRoom(room,profile(leaving),token,'new'),/Freedom or Death/,'An old invite token cannot rejoin the same game');
    for(const command of [{type:'start'},{type:'mood',mood:'Happy'},{type:'play',cardId:'spare'},{type:'target',seat:actor}])assert.throws(()=>applyCommand(room,leaving,command),/Freedom or Death/);
    assert.equal(seatForToken(room,token),leaving,'The departing browser can finish receiving its final outcome');
    applyCommand(room,leaving,{type:'leave'});
    assert.equal(seatForToken(room,token),null,'Leaving after the animation invalidates room access');
    assert.equal(sweepDisconnected(room,Date.now()+60_000),false,'A departed human is never replaced by a CPU');
  }
  assert.equal(room.hostSeat,leaving===0?1:0,'The remaining human inherits hosting when needed');
  const view=snapshotForSeat(room,room.hostSeat);
  assert(!JSON.stringify(view).includes('account-'),'Archived identities and tokens stay private');
  if(count===2){assert.equal(state.match.complete,true);assert.throws(()=>applyCommand(room,room.hostSeat,{type:'start'}),/finished/);}
  else {
    applyCommand(room,room.hostSeat,{type:'start'});
    assert.equal(room.state.players[leaving].hand.length,0);
    assert(!tableSeats(room.state,false).includes(leaving),'They remain absent in later rounds');
    assert.equal(room.state.players[actor].id,actor,'Remaining seat IDs and accounts are not reassigned');
    assert.equal(roundDelta(record,room.state,leaving).rounds,0,'No later-round awards go to departed players');
  }
}

// Check the actual ring painter with sparse original seat IDs in both layouts.
const {PlayerRing}=await load('src/ui/PlayerRing.ts');
const originalHeight=globalThis.innerHeight,originalWidth=globalThis.innerWidth;
try{
 for(const portrait of [false,true]){
  globalThis.innerHeight=portrait?844:800;globalThis.innerWidth=portrait?390:1200;
  const values=[],nodes=[1,3,7].map(id=>({dataset:{seat:String(id)},style:{setProperty:(key,value)=>{if(key==='--ring-x')values.push(parseFloat(value));}},classList:{contains:()=>true},setAttribute:()=>{}}));
  const ring=Object.create(PlayerRing.prototype);
  Object.assign(ring,{state:{count:3,seats:[1,3,7]},center:1,overflowStage:'idle',traditional:{has:()=>false},root:{querySelectorAll:selector=>selector==='.seat'?nodes:[]},spriteReady:()=>Promise.resolve(),paintFrames:()=>{}});
  ring.paint();
  assert(values[0]<50&&values[1]===50&&values[2]>50,'Remaining characters pack around the center instead of keeping empty old slots');
  assert(nodes.every(node=>node.hidden===false&&node.inert===false));
 }
}finally{globalThis.innerHeight=originalHeight;globalThis.innerWidth=originalWidth;}
console.log('Room outcomes passed: 2–8 players, CPU/human Freedom and Death, roster removal, host transfer, retired access, no CPU replacement/revival, account settlement and compact portrait/desktop seats.');
