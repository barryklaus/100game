import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,existsSync} from 'node:fs';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);};
const {createGame,playCard,selectTarget,nextSeat}=await load('src/game/rules.ts');
const {createRoom,joinRoom,applyCommand,snapshotForSeat,advanceCpu,scheduleCpuAction}=await load('src/game/hostedCore.ts');
const {newRoundAccounts,recordPlayed,roundDelta}=await load('worker/roundAccounts.ts');
const {accountPoints}=await load('src/game/points.ts');
const {chooseCpuSpecialThrow}=await load('src/game/cpu.ts');
const {LocalSession}=await load('src/game/LocalSession.ts');
const configs=n=>Array.from({length:n},(_,id)=>({name:`P${id}`,kind:'human',avatar:id,mood:'Normal'}));
let serial=0;const card=rank=>({rank,id:`test-${++serial}`,suit:'fire'});
function game(count=4){const s=createGame(configs(count),1,()=>0,true);s.current=s.rootTurn=0;s.total=99;return s;}
function play(s,rank,special=false,record){const c=card(rank);s.players[s.current].hand=[c,card('9')];const before=structuredClone(s);playCard(s,c.id,special);if(record)recordPlayed(record,before,s);}

for(let n=2;n<=8;n++)for(const direction of [1,-1])for(const special of [false,true]){
 const s=game(n),r=newRoundAccounts({});s.direction=direction;const responder=nextSeat(s,0);
 play(s,'9',special,r);assert.equal(s.current,responder);play(s,'2',false,r);
 assert.equal(s.match.setup,0);assert.equal(s.match.setupBonus,special?2:1);
 assert.equal(s.players[0].ratingDelta,special?3:2,'Special Throw upgrades the setup reward, without stacking +1 and +2');
 assert.equal(s.players[responder].ratingDelta,-5);
 for(const p of s.players)assert.equal(accountPoints(roundDelta(r,s,p.id)),p.ratingDelta,'Account history and table scores agree');
 const fresh=createGame(configs(n),2,()=>0,s.match);
 assert(fresh.players.every(p=>p.specialThrowUsed===false));assert.equal(fresh.match.previousSpecialThrow,false);assert.equal(fresh.match.retaliation,undefined);
}
for(const reply of ['9','7','8'])for(const n of reply==='9'?[2]:[2,4,8]){
 const s=game(n),r=newRoundAccounts({});play(s,'9',true,r);const responder=s.current;play(s,reply,false,r);
 if(reply==='7')selectTarget(s,0);
 assert.equal(s.current,0,'The counterplay comes directly back to the thrower');
 assert.deepEqual(s.match.retaliation,{thrower:0,responder});play(s,'2',false,r);
 assert.equal(s.match.backfire,0);assert.equal(s.players[0].ratingDelta,-7);assert.equal(s.players[responder].ratingDelta,2);
 for(const p of s.players)assert.equal(accountPoints(roundDelta(r,s,p.id)),p.ratingDelta);
 assert.equal(roundDelta(r,s,0).specialBackfires,1);
}
{
 const s=game(2);play(s,'9',true);play(s,'9',true);play(s,'2');
 assert.equal(s.players[0].ratingDelta,-7);assert.equal(s.players[1].ratingDelta,3,'A counter Special Throw can earn its own +2');
}
{
 const s=game(4);play(s,'9',true);play(s,'9');play(s,'2');
 assert.equal(s.match.backfire,null);assert.equal(s.players[0].ratingDelta,1,'An unrelated later Overflow has no Special Throw award or penalty');
 assert.equal(s.players[2].ratingDelta,-5);
}
{
 const s=game(4);play(s,'7',true);selectTarget(s,3);play(s,'2');
 assert.equal(s.match.setup,0);assert.equal(s.match.setupBonus,2,'The chosen seat is the immediate next player');
}
{
 const s=game(2);play(s,'9',true);play(s,'9');const c=card('9');s.players[0].hand=[c];
 const before=JSON.stringify(s);assert.throws(()=>playCard(s,c.id,true),/once/);assert.equal(JSON.stringify(s),before,'A repeated use is rejected before changing any cards or scores');
 playCard(s,c.id);assert.equal(s.players[0].specialThrowUsed,true);assert.equal(s.match.retaliation,undefined,'Surviving the reply ends the backfire window');
 play(s,'2');assert.equal(s.players[1].ratingDelta,-5);
}
{
 const s=game(2);const before=JSON.stringify(s);
 assert.throws(()=>playCard(s,'missing',true),/active hand/);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>playCard(s,s.players[0].hand[0].id,'yes'),/Invalid/);assert.equal(JSON.stringify(s),before);
 play(s,'2',true);assert.equal(s.players[0].ratingDelta,-5,'Using Special Throw on your own Overflow does not create a backfire');
}
{
 const s=game(2),r=newRoundAccounts({});play(s,'1',true,r);play(s,'2',false,r);
 assert.equal(s.players[0].ratingDelta,4,'Exact 100, survival and successful Special Throw retain their separate rewards');
 assert.equal(accountPoints(roundDelta(r,s,0)),4);
}
{
 const s=game(2);s.match.scores[0]=-8;play(s,'9',true);play(s,'9');play(s,'2');
 assert(s.match.newlyDead.includes(0),'The −7 backfire can reach the existing Death threshold');
 const f=game(2);f.match.scores[0]=12;play(f,'9',true);play(f,'2');assert(f.match.newlyFreed.includes(0));
}
{
 const room=createRoom('special-check',configs(2)[0],'host',0);room.nextRules=true;joinRoom(room,configs(2)[1],null,'guest',0);applyCommand(room,0,{type:'start'},0);
 const s=room.state;s.current=s.rootTurn=0;s.total=99;const c=card('9');s.players[0].hand=[c,card('2')];
 applyCommand(room,0,{type:'play',cardId:c.id,turn:s.turn,specialThrow:true},1);
 assert.equal(snapshotForSeat(room,1).state.players[0].specialThrowUsed,true);assert.equal(snapshotForSeat(room,1).state.lastSpecialThrow.cardId,c.id);
 const before=JSON.stringify(s);assert.throws(()=>applyCommand(room,0,{type:'play',cardId:c.id,turn:0,specialThrow:true},2),/turn/);assert.equal(JSON.stringify(s),before);
 const reply=card('9');s.players[1].hand=[reply,card('2')];applyCommand(room,1,{type:'play',cardId:reply.id,turn:s.turn},3);
 const again=s.players[0].hand[0],unchanged=JSON.stringify(s);assert.throws(()=>applyCommand(room,0,{type:'play',cardId:again.id,turn:s.turn,specialThrow:true},4),/once/);assert.equal(JSON.stringify(s),unchanged);
 s.players[0].kind='cpu';s.players[0].specialThrowUsed=false;s.players[0].hand=[card('9'),card('9')];
 assert.equal(chooseCpuSpecialThrow(s,s.players[0].hand[0]),true);scheduleCpuAction(room,1000);assert.equal(advanceCpu(room,room.cpuAction.dueAt),true);assert.equal(s.players[0].specialThrowUsed,true);
 assert.equal(chooseCpuSpecialThrow({...s,current:0},s.players[0].hand[0]),false,'An already-spent throw is never selected again');
}
{
 const s=createGame(configs(2),1,()=>0,true);s.players[0].specialThrowUsed=true;s.match.previous=0;s.match.previousSpecialThrow=true;s.match.retaliation={thrower:0,responder:1};
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},session=new LocalSession(storage);
 session.save({state:s,cast:'midnight',practice:null,dismissed:[]});const restored=session.restore('midnight');
 assert(restored);assert.equal(restored.state.players[0].specialThrowUsed,true);assert.deepEqual(restored.state.match.retaliation,s.match.retaliation,'A reload cannot restore a spent use or erase pending retaliation');
}
const art=JSON.parse(readFileSync('public/assets/social-club/special-throw-v1/manifest.json'));
assert.equal(Object.keys(art.characters).length,16);
for(const [id,c] of Object.entries(art.characters)){
 assert.equal(c.frames.length,8);assert.equal(c.cards[4].length,1,'Release retains exactly one card placeholder/back');
 for(const name of c.frames){const b=c.bounds[name];assert.equal(b.length,4);assert(b.every(Number.isFinite));assert(b[2]>0&&b[3]>0);assert(existsSync(`public/assets/social-club/special-throw-v1/${id}/${name}.webp`));}
}
console.log('Special Throw passed: 2–8 players, +2 setup, −7 direct retaliation, CHOOSE/REVERSE, once per round, no stale awards, CPU/online/reload, account totals and 128 whole-character poses.');

// Exercise the actual controller at the handoff boundaries, not just asset names.
const bundled=await build({entryPoints:['src/ui/MasterAnimations.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
const {MasterAnimations}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
let clock=0,timerId=0;const timers=new Map();
globalThis.window=globalThis;globalThis.document={hidden:true};globalThis.performance={now:()=>clock};
globalThis.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,at:clock+ms});return timerId;};globalThis.clearTimeout=id=>timers.delete(id);
globalThis.Image=class {naturalWidth=400;naturalHeight=400;decode(){return Promise.resolve();}};
globalThis.DOMRect=class {constructor(x=0,y=0,width=100,height=100){Object.assign(this,{x,y,left:x,top:y,width,height,right:x+width,bottom:y+height});}};
const image={isConnected:true,style:{},src:''},element={dataset:{},querySelector:()=>image,getBoundingClientRect:()=>new DOMRect(0,0,512,512)};
const node={dataset:{},getBoundingClientRect:()=>new DOMRect(0,0,256,256)};
const root={querySelector:selector=>selector.includes('master-sprite')?element:node,querySelectorAll:()=>[node]};
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const advance=async ms=>{const end=clock+ms;for(;;){const next=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;clock=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}clock=end;await flush();};
const controller=new MasterAnimations(root),presentation={active:0,total:99,overflow:false,target:false,reducedMotion:false};
for(const id of Object.keys(art.characters)){
 element.dataset={character:id,condition:'0'};node.dataset={seat:'0',condition:'0'};controller.sync(presentation);await flush();
 controller.armSpecialThrow(0);await flush();await advance(391);
 assert.equal(element.dataset.frame,'special-04');assert.equal(element.dataset.cards,'2','Arming retains both cards until the actual flight starts');
 controller.release(0,true);assert.equal(element.dataset.frame,'special-05');assert.equal(element.dataset.cards,'1','The release pose and flying card switch in one task');
 let drawFinished=false;const draw=controller.prepareDraw(0).then(()=>{drawFinished=true;});await flush();await advance(100);
 assert.equal(drawFinished,false,'A draw cannot interrupt the wacky follow-through');await advance(700);await draw;
 const received=controller.received(0);await flush();await advance(400);await received;assert.equal(element.dataset.cards,'2');
 controller.armSpecialThrow(0);await flush();controller.cancelSpecialThrow(0);await advance(1000);
 assert(!element.dataset.frame.startsWith('special-'),'Unarming cancels pending special frames');assert.equal(element.dataset.cards,'2');controller.reset();
}
console.log('Special Throw animation handoffs passed for all sixteen characters: armed hold, synchronous release, complete follow-through, normal receive, and canceled stance.');
