import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const load=async path=>{
  const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const {SuspenseTrack,suspenseLevel,makeSuspenseLoop}=await load('src/audio/SuspenseTrack.ts');
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
    node.start=time=>{node.startTime=time;};node.stop=time=>{node.stopTime=time;};
    this.sources.push(node);return node;
  }
  createBuffer(numberOfChannels,length,sampleRate){
    const channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));
    return {numberOfChannels,length,sampleRate,duration:length/sampleRate,getChannelData:i=>channels[i]};
  }
  decodeAudioData(){return this.decoding??Promise.resolve(recording);}
  resume(){this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
}
// Exercise the real supplied recording, not only an idealized tone.
const wav=await readFile('public/assets/sfx/Cartoon-Suspense-X.wav');
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
const ctx=new Context();
const recording=ctx.createBuffer(channels,data.length/(channels*2),rate);
for(let i=0;i<recording.length;i++)for(let c=0;c<channels;c++)recording.getChannelData(c)[i]=data.readInt16LE((i*channels+c)*2)/32768;
const loop=makeSuspenseLoop(ctx,recording);
assert.equal(loop.numberOfChannels,2);assert(loop.duration>.58&&loop.duration<.60,'Short loop excludes the attack and silent tail');
for(let c=0;c<channels;c++){
  const samples=loop.getChannelData(c);
  assert(samples.every(s=>Number.isFinite(s)&&Math.abs(s)<=.951),'Loop cannot clip or contain invalid samples');
  assert(Math.abs(samples.at(-1)-samples[0])<.1,'Crossfade joins the actual recording without a discontinuous hit');
  const rms=Math.sqrt(samples.reduce((sum,s)=>sum+s*s,0)/samples.length);
  assert(rms>.07&&rms<.22,'Sustained body remains audible without excessive gain');
}
for(const total of [null,0,69,101,Infinity,NaN])assert.equal(suspenseLevel(total),null);
assert.equal(suspenseLevel(70).rate,.72);assert.equal(suspenseLevel(100).rate,1.45);
for(let total=71;total<=100;total++){
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
assert.equal(source.loop,true);
const count=source.playbackRate.calls.length;
render('card-1',75);assert.equal(source.playbackRate.calls.length,count,'Rerenders do not restart or reschedule music');
render('card-2',100);assert.equal(source.playbackRate.value,suspenseLevel(75).rate);
advance('card-2',.83);
assert.equal(source.playbackRate.value,suspenseLevel(100).rate);
assert.equal(source.playbackRate.calls.at(-1).time,ctx.currentTime);
assert.equal(envelope.gain.calls.at(-1).time,ctx.currentTime,'Pitch, gain, and number commit share the same instant');
assert.equal(ctx.sources.length,1,'Increasing scores reuse one loop');
render('card-3',90);assert.equal(source.playbackRate.value,suspenseLevel(100).rate);
advance('card-3',.83);assert.equal(source.playbackRate.value,suspenseLevel(90).rate,'Minus ten eases down at arrival');
const beforeZero=source.playbackRate.calls.length;
render('card-4',90);advance('card-4',.83);
assert.equal(source.playbackRate.calls.length,beforeZero,'Zero holds the sound continuously');
render('card-5',105);assert.equal(source.stopTime,undefined,'Overflow sound holds while displayed 90 awaits its wave');
advance('card-5',.83);assert.equal(source.stopTime,ctx.currentTime+.006,'Overflow cuts at the number explosion with a 6 ms anti-click fade');
source.onended();assert(source.disconnected&&envelope.disconnected,'Stopped loop cleans up its nodes');
render('card-6',80,false);assert.equal(ctx.sources.length,2,'Reduced motion / no-WebGL fallback starts with immediate number update');
render('',0,true,'round-2');assert(ctx.sources.at(-1).stopTime,'New round stops suspense');
assert.equal(score.arrive('card-6'),false);
track.dispose();track.setTotal(100);assert.equal(ctx.sources.length,2);

// Loading late, preferences, tab visibility, and cleanup must use the latest displayed total.
globalThis.AudioContext=Context;
let requests=0,resolveDownload;
globalThis.fetch=()=>{requests++;return new Promise(resolve=>{resolveDownload=()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});});};
const {AudioManager}=await load('src/audio/AudioManager.ts');
const manager=new AudioManager();
const settings={volume:.55,sfxVolume:.8,musicVolume:.45,ambienceVolume:.3,muted:false};
manager.configure(settings);manager.setSuspenseTotal(90);manager.unlock();manager.unlock();
const managed=Context.instances.at(-1);assert.equal(requests,1,'Recording fetches once on first interaction');
manager.setSuspenseTotal(0);resolveDownload();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(managed.sources.length,0,'Late download cannot resurrect a reset round');
manager.setSuspenseTotal(80);assert.equal(managed.sources.length,1);
manager.configure({...settings,muted:true});assert(managed.sources.at(-1).stopTime,'Mute stops processing');
manager.setSuspenseTotal(95);manager.configure(settings);
assert.equal(managed.sources.at(-1).playbackRate.value,suspenseLevel(95).rate,'Unmute uses current presented total');
manager.configure({...settings,musicVolume:0});assert(managed.sources.at(-1).stopTime,'Music volume controls suspense');
manager.configure(settings);manager.setBackgrounded(true);assert(managed.sources.at(-1).stopTime,'Background tabs stop the loop');
manager.setSuspenseTotal(70);manager.setBackgrounded(false);
assert.equal(managed.sources.at(-1).playbackRate.value,.72);
manager.setSuspenseTotal(null);assert(managed.sources.at(-1).stopTime,'Leaving the table stops suspense');
manager.dispose();
const late=new AudioManager();late.setSuspenseTotal(100);late.unlock();
const closed=Context.instances.at(-1);late.dispose();resolveDownload();
await new Promise(resolve=>setImmediate(resolve));assert.equal(closed.sources.length,0,'Decode after disposal cannot start a loop');
console.log('Suspense checks passed: real WAV loop, 70–100 pitch/intensity, exact wave/score/audio arrival, decreases, zero, overflow, fallback, resets, late loading, mute/music volume, background tabs, and cleanup.');
