import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const load=async path=>{
  const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const {SuspenseTrack,suspenseLevel,anxietyLevel,makeSeamlessLoop}=await load('src/audio/SuspenseTrack.ts');
const {TotalPresentation}=await load('src/ui/TotalPresentation.ts');
const {CardImpactFlow}=await load('src/render/CardImpactFlow.ts');

class Param {
  value=0;calls=[];
  setValueAtTime(value,time){this.value=value;this.calls.push({value,time,kind:'set'});}
  setTargetAtTime(value,time,constant){this.value=value;this.calls.push({value,time,constant,kind:'target'});}
  cancelAndHoldAtTime(time){this.calls.push({time,kind:'hold'});}
  linearRampToValueAtTime(value,time){this.value=value;this.calls.push({value,time,kind:'ramp'});}
}
class Node {
  connect(node){return node;}
  disconnect(){this.disconnected=true;}
}
class Context {
  static instances=[];
  currentTime=10;state='running';destination=new Node();sources=[];gains=[];
  constructor(){Context.instances.push(this);}
  createGain(){const node=new Node();node.gain=new Param();this.gains.push(node);return node;}
  createBufferSource(){
    const node=new Node();node.playbackRate=new Param();
    node.start=time=>{node.startTime=time??this.currentTime;};node.stop=time=>{node.stopTime=time;};
    this.sources.push(node);return node;
  }
  createBuffer(numberOfChannels,length,sampleRate){
    const channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));
    return {numberOfChannels,length,sampleRate,duration:length/sampleRate,getChannelData:i=>channels[i]};
  }
  decodeAudioData(file){return this.decoding??Promise.resolve(recordings.get(file)??recording);}
  resume(){this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
}
// Exercise the real supplied recording, not only an idealized tone.
const ctx=new Context();
async function readRecording(file){
  const wav=await readFile('public/assets/sfx/'+file);
  assert.equal(wav.toString('ascii',0,4),'RIFF');
  let format,data;
  for(let offset=12;offset+8<=wav.length;){
    const size=wav.readUInt32LE(offset+4),kind=wav.toString('ascii',offset,offset+4);
    if(kind==='fmt ')format=wav.subarray(offset+8,offset+8+size);
    if(kind==='data')data=wav.subarray(offset+8,offset+8+size);
    offset+=8+size+(size%2);
  }
  assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(14),16);
  const channels=format.readUInt16LE(2),rate=format.readUInt32LE(4);
  const buffer=ctx.createBuffer(channels,data.length/(channels*2),rate);
  for(let i=0;i<buffer.length;i++)for(let c=0;c<channels;c++)buffer.getChannelData(c)[i]=data.readInt16LE((i*channels+c)*2)/32768;
  return buffer;
}
const recordings=new Map(await Promise.all(['Cartoon-Suspense-X.wav','Anxiety-Repeat.wav','Explosion.wav'].map(async file=>[file,await readRecording(file)])));
const recording=recordings.get('Cartoon-Suspense-X.wav'),anxietyRecording=recordings.get('Anxiety-Repeat.wav'),explosionRecording=recordings.get('Explosion.wav');
for(const total of [null,0,69,100,101,Infinity,NaN])assert.equal(suspenseLevel(total),null);
assert.equal(suspenseLevel(70).rate,.72);assert.equal(suspenseLevel(99).rate,1.45);
for(let total=71;total<=99;total++){
  assert(suspenseLevel(total).rate>suspenseLevel(total-1).rate);
  assert(suspenseLevel(total).gain>suspenseLevel(total-1).gain);
}

const track=new SuspenseTrack(ctx,ctx.destination),score=new TotalPresentation(),wave=new CardImpactFlow();
track.setBuffer(recording);
const render=(key,total,animate=true,round='round-1')=>{
  score.sync(round,key,{total,caption:''},animate);
  track.setTotal(score.visible.total);wave.setCard(key);
};
const advance=(key,delta)=>{
  ctx.currentTime+=delta;
  if(wave.update(delta,false).arrival&&score.arrive(key))track.setTotal(score.visible.total);
};
render('',69);render('card-1',75);
assert.equal(ctx.sources.length,0,'Authoritative 75 must not start suspense while visible total is 69');
advance('card-1',.8);assert.equal(ctx.sources.length,0);
advance('card-1',.02);
const source=ctx.sources.at(-1),envelope=ctx.gains.at(-1);
assert.equal(source.startTime,ctx.currentTime,'Start shares the wave arrival clock instant');
assert.equal(source.playbackRate.value,suspenseLevel(75).rate);
assert.equal(source.loop,false,'70–99 cue is never looped');
assert.equal(source.buffer,recording,'One-shot uses the original complete recording without a manufactured loop');
const count=source.playbackRate.calls.length;
render('card-1',75);assert.equal(source.playbackRate.calls.length,count,'Rerenders do not restart or reschedule the cue');
render('card-2',95);assert.equal(ctx.sources.length,1,'Next cue waits for the visible score');
advance('card-2',.83);const high=ctx.sources.at(-1),highEnvelope=ctx.gains.at(-1);
assert.equal(high.playbackRate.value,suspenseLevel(95).rate);
assert.equal(high.startTime,ctx.currentTime);
assert.equal(highEnvelope.gain.calls.at(-1).time,ctx.currentTime,'Pitch, gain and number commit share the same instant');
assert.equal(source.stopTime,ctx.currentTime+.025,'New shot fades the previous tail instead of stacking recordings');
assert.equal(ctx.sources.length,2,'Every increase plays one fresh shot');
source.onended();assert(source.disconnected&&envelope.disconnected);
render('card-3',85);assert.equal(ctx.sources.length,2,'Decreases also wait for the wave');
advance('card-3',.83);const lower=ctx.sources.at(-1);
assert.equal(lower.playbackRate.value,suspenseLevel(85).rate,'Minus ten gets a lower-pitched shot on arrival');
assert(lower.playbackRate.value<high.playbackRate.value);
assert.equal(lower.loop,false);
lower.onended();assert(lower.disconnected,'Natural end cleans up the one-shot');
render('card-4',99);advance('card-4',.83);
assert.equal(ctx.sources.length,4,'A later score change plays even after the previous shot finished');
render('card-5',99);advance('card-5',.83);render('card-5',99);
assert.equal(ctx.sources.length,4,'Zero and unchanged UI renders cannot duplicate a shot');
render('card-6',89);advance('card-6',.83);
assert.equal(ctx.sources.length,5,'Falling numbers continue getting fresh one-shots');
assert(ctx.sources.every(node=>!node.loop),'All 70–99 shots are non-looping');
render('card-7',69);advance('card-7',.83);
render('card-8',75);assert.equal(ctx.sources.length,5,'Range re-entry waits for arrival');
advance('card-8',.83);const reentered=ctx.sources.at(-1);
assert.equal(ctx.sources.length,6);
render('card-9',105);assert.equal(reentered.stopTime,undefined,'Overflow waits for the number update');
advance('card-9',.83);assert.equal(reentered.stopTime,ctx.currentTime+.006,'Overflow interrupts the cue with a short anti-click fade');
render('card-10',80,false);assert.equal(ctx.sources.length,7,'Fallback gets its shot with the immediate number');
render('',0,true,'round-2');assert(ctx.sources.at(-1).stopTime,'New round stops the cue');
assert.equal(score.arrive('card-10'),false);
track.dispose();track.setTotal(95);assert.equal(ctx.sources.length,7);

// Loading late, preferences, tab visibility, and cleanup must use the latest displayed total.
globalThis.AudioContext=Context;
let requests=0,downloads=[];
const resolveDownload=()=>{for(const resolve of downloads.splice(0))resolve();};
globalThis.fetch=url=>{requests++;return new Promise(resolve=>{downloads.push(()=>resolve({ok:true,arrayBuffer:async()=>url.split('/').at(-1)}));});};
const {AudioManager}=await load('src/audio/AudioManager.ts');
const manager=new AudioManager();
const settings={volume:.55,sfxVolume:.8,musicVolume:.45,ambienceVolume:.3,muted:false};
manager.configure(settings);manager.setPresentedTotal(90);manager.unlock();manager.unlock();
const managed=Context.instances.at(-1);assert.equal(requests,3,'Each of the three recordings fetches once on first interaction');
manager.setPresentedTotal(0);resolveDownload();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(managed.sources.length,0,'Late download cannot resurrect a reset round');
manager.setPresentedTotal(80);assert.equal(managed.sources.length,1);
manager.configure({...settings,muted:true});assert(managed.sources.at(-1).stopTime,'Mute stops processing');
manager.setPresentedTotal(95);manager.configure(settings);
assert.equal(managed.sources.length,1,'Unmute cannot replay a consumed 70–99 cue');
manager.configure({...settings,musicVolume:0});manager.configure(settings);
assert.equal(managed.sources.length,1,'Music volume changes cannot replay the cue');
manager.setBackgrounded(true);manager.setPresentedTotal(70);manager.setBackgrounded(false);
assert.equal(managed.sources.length,1,'Returning from a background tab cannot replay it within the range');
manager.setPresentedTotal(null);manager.setPresentedTotal(70);
assert.equal(managed.sources.length,2,'A new game can play the one-shot again');
manager.setPresentedTotal(85);assert.equal(managed.sources.length,3,'Changes after returning to the tab still play a new shot');
manager.setPresentedTotal(null);assert(managed.sources.at(-1).stopTime,'Leaving the table stops the cue');
manager.dispose();
const late=new AudioManager();late.setPresentedTotal(100);late.unlock();
const closed=Context.instances.at(-1);late.dispose();resolveDownload();
await new Promise(resolve=>setImmediate(resolve));assert.equal(closed.sources.length,0,'Decode after disposal cannot start a loop');
console.log('Suspense checks passed: one original-WAV shot per visible change from 70–99, rising/falling pitch and intensity, exact arrival, short tail handoff, no duplicate shots for unchanged values/settings, re-entry, overflow, fallback, late loading and cleanup.');

const anxietyLoop=makeSeamlessLoop(ctx,anxietyRecording);
assert(anxietyLoop.duration>.85&&anxietyLoop.duration<.86,'Anxiety retains its rhythm with a short 40 ms seam crossfade');
for(let c=0;c<anxietyLoop.numberOfChannels;c++){
  const samples=anxietyLoop.getChannelData(c),input=anxietyRecording.getChannelData(c),overlap=anxietyRecording.length-anxietyLoop.length;
  assert.equal(samples.at(-1),input[overlap-1]);assert.equal(samples[0],input[overlap],'Loop boundary continues across adjacent original samples');
  assert(Math.abs(samples.at(-1)-samples[0])<.03,'No click at the actual Anxiety loop boundary');
  assert(samples.every(s=>Number.isFinite(s)&&Math.abs(s)<1),'Crossfade stays within original audio headroom');
  const tail=samples.subarray(samples.length-1000);
  assert(Math.sqrt(tail.reduce((sum,s)=>sum+s*s,0)/tail.length)>.03,'Loop seam cannot introduce a silent gap');
}
for(const total of [null,0,70,99,101])assert.equal(anxietyLevel(total),null);
assert.deepEqual(anxietyLevel(100),{rate:1,gain:.8},'Anxiety plays only at 100, at original pitch');

const endgame=new AudioManager(),endScore=new TotalPresentation(),endWave=new CardImpactFlow();
endgame.configure(settings);endgame.unlock();resolveDownload();await new Promise(resolve=>setImmediate(resolve));
const endContext=Context.instances.at(-1);let explosions=0;
endgame.addEventListener('cue',event=>{if(event.detail.name==='loss')explosions++;});
const present=(key,total,animate=true,round='endgame')=>{
  endScore.sync(round,key,{total,caption:''},animate);endWave.setCard(key);endgame.setPresentedTotal(endScore.visible.total);
};
const arrive=(key,delta=.83)=>{
  endContext.currentTime+=delta;
  if(endWave.update(delta,false).arrival&&endScore.arrive(key))endgame.setPresentedTotal(endScore.visible.total);
};
present('',95);const rising=endContext.sources.at(-1);
present('exact',100);assert.equal(endContext.sources.length,1,'Pending 100 cannot start Anxiety early');
arrive('obsolete',.8);assert.equal(endContext.sources.length,1);
arrive('exact',.03);const anxiety=endContext.sources.at(-1);
assert.equal(endScore.visible.total,100);assert(rising.stopTime,'100 replaces the rising track');
assert.equal(anxiety.playbackRate.value,1);assert(anxiety.buffer.duration<.86);
assert.equal(anxiety.startTime,endContext.currentTime,'Anxiety starts with the number commit');
assert.equal(anxiety.loop,true,'Native audio looping has no timer gaps');
present('zero',100);arrive('zero');present('zero',100);
assert.equal(endContext.sources.length,2,'Zero, targets and repeated renders cannot restart Anxiety at 100');
present('minus',90);assert.equal(anxiety.stopTime,undefined,'Anxiety holds while minus-ten waits');
arrive('minus');assert(anxiety.stopTime,'Dropping below 100 stops Anxiety');
assert.equal(endContext.sources.at(-1).playbackRate.value,suspenseLevel(90).rate,'Rising suspense resumes at lower tension');
present('exact-again',100);arrive('exact-again');const lastAnxiety=endContext.sources.at(-1);
present('overflow',110);assert.equal(explosions,0,'Authoritative overflow cannot play the recording before the wave');
arrive('overflow');const blast=endContext.sources.at(-1);
assert.equal(blast.buffer,explosionRecording,'Overflow uses the supplied Explosion WAV');
assert.equal(blast.startTime,endContext.currentTime,'Explosion starts on the number explosion clock instant');
assert.equal(lastAnxiety.stopTime,endContext.currentTime+.006,'Anxiety cuts on overflow with a short anti-click fade');
assert.equal(blast.loop,false,'Explosion is a one-shot');
present('overflow',110);endgame.setPresentedTotal(110);assert.equal(explosions,1,'End-game renders cannot replay Explosion');
blast.onended();assert(blast.disconnected,'Explosion node cleans up after playback');
present('',0,true,'next-round');present('fallback-bust',105,false,'next-round');
assert.equal(explosions,2,'Reduced motion / HTML fallback plays Explosion with its immediate score');
endgame.setPresentedTotal(null);endgame.setPresentedTotal(110);
assert.equal(explosions,2,'Opening an already-ended game does not replay its old Explosion');
endgame.setPresentedTotal(100);const mutedAnxiety=endContext.sources.at(-1);
endgame.configure({...settings,muted:true});assert(mutedAnxiety.stopTime);
endgame.setPresentedTotal(110);assert.equal(explosions,3,'Muted overflow is consumed once');
const nodesBeforeUnmute=endContext.sources.length;
endgame.configure(settings);assert.equal(endContext.sources.length,nodesBeforeUnmute,'Unmuting cannot play a stale Explosion');
endgame.setPresentedTotal(100);endgame.configure({...settings,musicVolume:0});
assert(endContext.sources.at(-1).stopTime,'Anxiety obeys Music volume');
endgame.configure(settings);endgame.setBackgrounded(true);assert(endContext.sources.at(-1).stopTime,'Hidden tabs stop Anxiety');
endgame.setPresentedTotal(110);assert.equal(explosions,3,'Hidden overflow does not play');
endgame.setBackgrounded(false);assert.equal(explosions,3,'Returning to a tab cannot replay its old Explosion');
endgame.dispose();
console.log('End-game audio checks passed: real Anxiety seam, exact-100 switch, continuous Zero, minus-ten relief, synchronized one-shot Explosion, fallback, no duplicate/late explosions, music/mute/visibility and cleanup.');
