import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{
 const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const {AudioManager}=await load('src/audio/AudioManager.ts');
const {RemoteCardAudio}=await load('src/audio/RemoteCardAudio.ts');
const {bindAudioLifecycle}=await load('src/audio/AudioLifecycle.ts');
const {PlaybackAudioSession}=await load('src/audio/PlaybackAudioSession.ts');

const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const session={type:'auto'};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{audioSession:session}});
const routing=new PlaybackAudioSession();
routing.setActive(true);assert.equal(session.type,'playback');
session.type='transient';routing.setActive(false);
assert.equal(session.type,'transient','Releasing our override does not overwrite an external session change');
routing.setActive(true);routing.setActive(false);assert.equal(session.type,'transient','The prior session type is restored');
session.type='auto';

const original={setTimeout,clearTimeout,performance,fetch,AudioContext:globalThis.AudioContext};
let wall=0,nextTimer=1;const timers=new Map();
globalThis.setTimeout=(fn,delay)=>{const id=nextTimer++;timers.set(id,{fn,at:wall+delay});return id;};
globalThis.clearTimeout=id=>timers.delete(id);
globalThis.performance={now:()=>wall};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const tick=async ms=>{
 const end=wall+ms;
 while(true){const pending=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;
  wall=pending[1].at;timers.delete(pending[0]);pending[1].fn();await flush();
 }
 wall=end;await flush();
};
class Param{value=0;setValueAtTime(v){this.value=v;}setTargetAtTime(v){this.value=v;}cancelAndHoldAtTime(){}linearRampToValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}}
class Node{connect(n){return n;}disconnect(){this.disconnected=true;}}
class Context extends EventTarget{
 static instances=[];static defaultResume='normal';
 _state='suspended';fixed=0;started=wall;frozen=false;resumeCalls=0;resumeMode=Context.defaultResume;destination=new Node();sources=[];gains=[];
 constructor(){super();this.sessionAtCreation=globalThis.navigator.audioSession?.type;Context.instances.push(this);}
 get state(){return this._state;}
 get currentTime(){return this.fixed+(this._state==='running'&&!this.frozen?(wall-this.started)/1000:0);}
 transition(state){this.fixed=this.currentTime;this.started=wall;this._state=state;this.dispatchEvent(new Event('statechange'));}
 createGain(){const gain=new Node();gain.gain=new Param();this.gains.push(gain);return gain;}
 createBufferSource(){const source=new Node();source.playbackRate=new Param();source.start=(time=this.currentTime)=>{source.started=time;};source.stop=(time=this.currentTime)=>{source.stopped=time;};this.sources.push(source);return source;}
 createOscillator(){const source=this.createBufferSource();source.frequency=new Param();return source;}
 createBiquadFilter(){const node=new Node();node.frequency=new Param();return node;}
 createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:i=>data[i]};}
 decodeAudioData(name){const buffer=this.createBuffer(1,2000,1000);buffer.name=name;return Promise.resolve(buffer);}
 resume(){this.resumeCalls++;if(this.resumeMode==='hang')return new Promise(()=>{});if(this.resumeMode==='reject')return Promise.reject(new Error('activation required'));this.transition('running');return Promise.resolve();}
 close(){this.transition('closed');return Promise.resolve();}
}
let downloads=0;
globalThis.AudioContext=Context;
globalThis.fetch=async url=>{downloads++;return {ok:true,arrayBuffer:async()=>url.split('/').at(-1)};};
const settings={volume:.55,sfxVolume:.8,musicVolume:.45,ambienceVolume:.3,muted:false};
const audio=new AudioManager();audio.configure(settings);audio.unlock(true);await flush();await tick(800);
let context=Context.instances.at(-1);
assert.equal(context.state,'running');
assert.equal(context.sessionAtCreation,'playback','Silent-mode media routing is selected before creating Web Audio');
assert.equal(session.type,'playback');
await audio.registerClip('card-impact','/impact.wav');await audio.registerClip('card-flick','/flick.wav');
const host=new RemoteCardAudio(cue=>audio.play(cue));
const start=context.sources.length;
host.throw('human-1');host.land('human-1');host.land('human-1');
assert.equal(context.sources.length,start+2,'Host hears one throw and one impact for another human, without acknowledgment duplicates');
assert.equal(context.sources.at(-2).buffer.name,'flick.wav');assert.equal(context.sources.at(-1).buffer.name,'impact.wav');
const impact=context.sources.at(-1),cached=impact.buffer;
context.transition('interrupted');await flush();
assert.equal(context.state,'running','A visible iOS interrupted state is resumed, not left silent');
assert(context.resumeCalls>=2);await tick(800);
host.throw('human-2');host.land('human-2');assert.equal(context.sources.at(-1).buffer,cached);

const calls=context.resumeCalls;audio.setBackgrounded(true);context.transition('interrupted');
assert.equal(session.type,'auto','Backgrounding releases the exclusive playback session');
assert.equal(context.resumeCalls,calls,'Audio never tries to resume while another app is foreground');
assert.equal(context.gains[0].gain.value,0);assert(impact.disconnected,'Backgrounding drops active effects instead of letting them freeze and replay later');
const hiddenCount=context.sources.length;host.throw('hidden-card');host.land('hidden-card');audio.setPresentedTotal(105);
assert.equal(context.sources.length,hiddenCount,'Hidden network events and explosions do not build a playback backlog');
audio.setBackgrounded(false);await flush();
assert.equal(session.type,'playback','Returning from another app reselects the media channel');
assert.equal(context.state,'running');assert.equal(context.sources.length,hiddenCount,'Return does not replay missed cards');
host.land('hidden-card');assert.equal(context.sources.length,hiddenCount);
host.throw('human-3');host.land('human-3');assert.equal(context.sources.length,hiddenCount+2,'Human turns are audible again after returning');
await tick(800);

// Safari can claim running while its audio clock no longer advances.
audio.setPresentedTotal(80);const beforeRestart=context.sources.length;
context.frozen=true;const beforeDownloads=downloads,beforeContexts=Context.instances.length;
audio.setBackgrounded(true);audio.setBackgrounded(false);await tick(800);
const replacement=Context.instances.at(-1);
assert.equal(Context.instances.length,beforeContexts+1,'A frozen clock gets one new audio graph');
assert.equal(context.state,'closed');assert.equal(replacement.state,'running');assert.equal(downloads,beforeDownloads,'Rebuild reuses decoded recordings and card clips');
assert.equal(replacement.sources.length,0,'The old 70–99 one-shot is consumed, not replayed by rebuilding');
audio.play('card-impact');assert.equal(replacement.sources.at(-1).buffer,cached,'Card audio immediately uses the same clip on the new graph');
audio.setPresentedTotal(81);assert.equal(replacement.sources.at(-1).buffer.name,'Cartoon-Suspense-X.wav','The next visible total still plays fresh suspense');
audio.setPresentedTotal(100);const anxiety=replacement.sources.at(-1);assert.equal(anxiety.loop,true);
audio.setBackgrounded(true);assert(anxiety.stopped!==undefined);replacement.transition('interrupted');audio.setBackgrounded(false);await flush();
assert.equal(replacement.sources.at(-1).loop,true,'Anxiety resumes at the currently presented 100');
audio.configure({...settings,muted:true});const mutedCount=replacement.sources.length;audio.play('card-impact');audio.setBackgrounded(true);audio.setBackgrounded(false);await flush();
assert.equal(replacement.sources.length,mutedCount,'Recovery preserves mute and channel preferences');
assert.equal(session.type,'auto','In-game mute stays silent and releases playback routing');
audio.configure({...settings,volume:0});assert.equal(session.type,'auto');
audio.configure(settings);assert.equal(session.type,'playback','Unmuting restores media routing');
const unmutedCount=replacement.sources.length;
audio.dispose();host.throw('after-dispose');assert.equal(replacement.sources.length,unmutedCount);await tick(800);
assert.equal(session.type,'auto','Disposal restores the original session type');

// A gesture must retry synchronously even if an earlier resume promise hangs.
const gestureAudio=new AudioManager();gestureAudio.unlock(true);await flush();await tick(800);
context=Context.instances.at(-1);gestureAudio.setBackgrounded(true);context.resumeMode='hang';context.transition('interrupted');gestureAudio.setBackgrounded(false);
const hangingCalls=context.resumeCalls;context.resumeMode='normal';gestureAudio.unlock(true);await flush();
assert.equal(context.resumeCalls,hangingCalls+1);assert.equal(context.state,'running','A later real tap is never trapped behind an unresolved resume promise');
gestureAudio.dispose();

// Both automatic recovery and activation fallback are bounded, with no silent retry loop.
Context.defaultResume='hang';const stalled=new AudioManager();stalled.unlock(true);await flush();
const beforeAuto=Context.instances.length;await tick(1600);
assert.equal(Context.instances.length,beforeAuto+1,'Only one automatic replacement is allowed per return');
await tick(10000);assert.equal(Context.instances.length,beforeAuto+1,'A blocked session cannot create contexts indefinitely');
Context.defaultResume='normal';stalled.unlock(true);await flush();
assert.equal(Context.instances.at(-1).state,'running','The next user interaction can repair a completely stuck mobile session');
stalled.dispose();
const denied=new AudioManager();Context.defaultResume='reject';denied.unlock(true);await flush();denied.setBackgrounded(true);await tick(1000);
Context.defaultResume='normal';Context.instances.at(-1).resumeMode='normal';denied.setBackgrounded(false);await flush();
assert.equal(Context.instances.at(-1).state,'running','Rejected resume is handled and later return can retry');denied.dispose();

// Visibility, bfcache, touch-end and lobby clicks all reach the same recovery path.
class Surface{
 hidden=false;handlers=new Map();
 addEventListener(type,fn,options){assert(options.capture&&options.passive);this.handlers.set(type,fn);}
 removeEventListener(type,fn,capture){assert(capture);assert.equal(this.handlers.get(type),fn);this.handlers.delete(type);}
 emit(type,event={isTrusted:true}){this.handlers.get(type)?.(event);}
}
const doc=new Surface(),page=new Surface(),signals=[];
const cleanup=bindAudioLifecycle({setBackgrounded:hidden=>signals.push(['hidden',hidden]),unlock:gesture=>signals.push(['unlock',gesture]),loadCardClips:()=>{signals.push(['load']);return Promise.resolve();}},doc,page);
doc.hidden=true;doc.emit('visibilitychange');page.emit('pagehide');doc.hidden=false;page.emit('pageshow');page.emit('focus');doc.emit('resume');
assert.deepEqual(signals.slice(0,6),[['hidden',false],['hidden',true],['hidden',true],['hidden',false],['hidden',false],['hidden',false]]);
for(const type of ['pointerdown','pointerup','touchend','click','keydown']){doc.emit(type);assert.deepEqual(signals.at(-2),['unlock',true]);}
const signalCount=signals.length;doc.emit('click',{isTrusted:false});assert.equal(signals.length,signalCount,'Synthetic clicks do not claim user activation');
cleanup();assert.equal(doc.handlers.size,0);assert.equal(page.handlers.size,0);assert.equal(timers.size,0,'All recovery timers are removed on disposal');
host.reset();const cues=[];const guest=new RemoteCardAudio(cue=>cues.push(cue));guest.land('fallback');guest.land('fallback');guest.reset();guest.land('fallback');assert.deepEqual(cues,['card-impact','card-impact'],'Fallback sound deduplicates snapshots and resets with the room');
// Browsers with no API or restricted getters/setters still start ordinary audio.
for(const navigatorValue of [{},{get audioSession(){throw new Error('unavailable');}},{audioSession:{get type(){return 'auto';},set type(value){throw new Error('restricted');}}}]){
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:navigatorValue});
 const safe=new PlaybackAudioSession();assert.doesNotThrow(()=>{safe.setActive(true);safe.setActive(false);});
}
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
const unsupported=new AudioManager();unsupported.unlock(true);await flush();
assert.equal(Context.instances.at(-1).state,'running','Unsupported browsers retain functional Web Audio');unsupported.dispose();await tick(800);
if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
Object.assign(globalThis,original);
console.log('Mobile audio checks passed: Silent Mode playback routing before activation, app return, mute/volume/session release, unsupported APIs, human-host throw/impact, interrupted/suspended states, frozen clocks, cached clips, bounded rebuilding, hung/rejected resumes, activation fallback, hidden-event suppression, current Anxiety loop, lifecycle bindings and disposal.');
