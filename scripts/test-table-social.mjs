import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);};
const {createGame,playCard,selectTarget}=await load('src/game/rules.ts');
const {createRoom,joinRoom,applyCommand,snapshotForSeat}=await load('src/game/hostedCore.ts');
const {LocalOutcomes,localPointsKey,gamePoints}=await load('src/game/points.ts');
const {createCardMesh,disposeCardMesh}=await load('src/render/CardMesh.ts');
const {REACTIONS,reactionPhrase}=await load('src/data/reactions.ts');
const configs=n=>Array.from({length:n},(_,id)=>({name:`P${id}`,avatar:id,kind:'human',mood:'Normal',lifetimePoints:999999}));
const card=(rank,id)=>({rank,id,suit:'fire'});
for(let count=2;count<=8;count++)for(const direction of [1,-1])for(let target=1;target<count;target++)for(const reverse of [false,true]){
  const state=createGame(configs(count),1,()=>0,true);
  assert(state.match.scores.every(score=>score===0),'Every new table ignores historical points');
  state.current=state.rootTurn=0;state.direction=direction;
  state.players[0].hand=[card('7','choose')];state.players[target].hand=[card(reverse?'8':'2','chosen')];
  playCard(state,'choose');selectTarget(state,target);playCard(state,'chosen');
  const nextDirection=reverse?-direction:direction;
  assert.equal(state.direction,nextDirection);
  assert.equal(state.current,(target+nextDirection+count)%count,'CHOOSE and REVERSE continue from the final actor');
  assert.notEqual(state.current,target,'No accidental second play');
}
const historyValues=new Map(),storage={getItem:key=>historyValues.get(key)??null,setItem:(key,value)=>historyValues.set(key,value)};
const outcomes=new LocalOutcomes(storage),state=createGame(configs(4),1,()=>0,true);
state.phase='ended';state.match.newlyFreed=[0];state.match.newlyDead=[1];state.match.scores=[30,-17,1,1];
outcomes.settle(state,'midnight');outcomes.settle(state,'midnight');
assert.deepEqual(state.players.slice(0,2).map(({freedoms,deaths})=>({freedoms,deaths})),[{freedoms:1,deaths:0},{freedoms:0,deaths:1}]);
const reopened=new LocalOutcomes(storage),fresh=createGame(configs(4),1,()=>0,true);
assert.deepEqual(reopened.get(localPointsKey(fresh.players[0],'midnight')),{freedoms:1,deaths:0});
assert.equal(gamePoints(fresh,0),0,'Saved Freedom never restores old table points');
const room=createRoom('test','P0','host',0);room.nextRules=true;joinRoom(room,configs(2)[1],null,'guest',0);
applyCommand(room,0,{type:'cpu-count',count:1},0);applyCommand(room,0,{type:'start'},0);
room.state.current=2; // A reaction must not delay the pending CPU action.
const turn=room.state.turn,hands=JSON.stringify(room.state.players.map(player=>player.hand));
for(const [index,phrase] of REACTIONS.entries()){
  const now=1000+index*1000;applyCommand(room,0,{type:'reaction',phrase:phrase.id},now);
  const deadline=room.cpuAction?.dueAt;
  assert.equal(snapshotForSeat(room,1).reaction.phrase,phrase.id,'Other humans receive the phrase');
  assert.equal(reactionPhrase(phrase.id),phrase.text);
  assert.throws(()=>applyCommand(room,0,{type:'reaction',phrase:phrase.id},now+100),/moment/);
  assert.equal(room.cpuAction?.dueAt,deadline,'Repeated reactions preserve CPU timing');
}
assert.throws(()=>applyCommand(room,1,{type:'reaction',phrase:'<script>'},20000),/reaction/);
assert.throws(()=>applyCommand(room,2,{type:'reaction',phrase:'rip'},20000),/active/);
assert.equal(room.state.turn,turn);assert.equal(JSON.stringify(room.state.players.map(player=>player.hand)),hands,'Reactions never change cards');
assert(snapshotForSeat(room,1).state.players[0].hand.every(card=>card.id.startsWith('hidden-')),'Reactions preserve private opponent hands');
const back={image:{width:1064,height:1478},isTexture:true};
const deck=createCardMesh(back,back),face=createCardMesh({...back},back);
assert.equal(deck.children.some(child=>child.userData.cardFoil),false,'Draw pile has no added frame');
assert.equal(face.children.some(child=>child.userData.cardFoil),true,'Face-card holograms remain available');
disposeCardMesh(deck);disposeCardMesh(face);
console.log('Table update passed: 2–8-seat CHOOSE/REVERSE flow, zero starting points, lifetime outcomes, shared whitelisted reactions, privacy, CPU timing and border-free draw cards.');
