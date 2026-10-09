import assert from 'node:assert/strict';
import {readFileSync,existsSync,openSync,readSync,closeSync} from 'node:fs';
import {build} from 'esbuild';
const master=JSON.parse(readFileSync('public/assets/social-club/master-animation-v2/manifest.json'));
const conditions=JSON.parse(readFileSync('public/assets/social-club/condition-animation-v1/manifest.json'));
const audit=JSON.parse(readFileSync('public/assets/social-club/animation-quality-checks.json'));
function webpSize(file){
 const fd=openSync(file,'r'),bytes=Buffer.alloc(64);readSync(fd,bytes,0,64,0);closeSync(fd);
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 const kind=bytes.toString('ascii',12,16);
 if(kind==='VP8L'){assert.equal(bytes[20],47);const bits=bytes.readUInt32LE(21);return[(bits&16383)+1,((bits>>>14)&16383)+1];}
 if(kind==='VP8X')return[bytes.readUIntLE(24,3)+1,bytes.readUIntLE(27,3)+1];
 throw new Error('Sprite must remain lossless WebP: '+file);
}
assert.equal(new Set(audit.map(x=>`${x.id}/${x.stage}`)).size,64,'Every character and condition was reviewed');
for(const check of audit){
 if(check.method==='whole-drawing head-scale registration'){
  assert(check.inliers>=8);assert(Math.abs(check.sourceHeadScale*check.correction-1)<.001);
 }else assert(check.protectedPixelsIdentical&&check.alphaIdentical,'Eyes never change a mouth, torso, hand or alpha');
}
assert.equal(audit.filter(c=>c.method==='whole-drawing head-scale registration').length,24);
const visual=JSON.parse(readFileSync('public/assets/social-club/animation-visual-audit-v2.json'));
assert.equal(visual.sets,64);
assert.equal(visual.keyPoseMeasurements.length,448,'All seven key poses were measured for each set');
assert.equal(new Set(visual.keyPoseMeasurements.map(x=>`${x.id}/${x.stage}`)).size,64);
assert.equal(visual.conditionTransitions.length,48,'Every healthy-to-injured transition was measured');
for(const check of visual.repairs){
 if(['whole pose registration','whole-condition display registration','residual whole-pose display registration'].includes(check.method)){
  assert(check.inliers>=12);assert(Math.abs(check.sourceScale*check.correction-1)<.001);
 }else if(check.method==='visually reviewed whole-pose display registration'){
  assert.equal(check.inliers,11);assert(check.review);assert(Math.abs(check.sourceScale*check.correction-1)<.001);
 }else if('closed' in check)assert(check.alphaIdentical&&check.protectedPixelsIdentical);
}
const bundle=await build({entryPoints:['src/ui/MasterAnimations.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
const {MasterAnimations,masterFrameBounds}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const anchorBundle=await build({entryPoints:['src/ui/MasterCharacters.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
const {masterAnchors,masterCharacter}=await import(`data:text/javascript;base64,${Buffer.from(anchorBundle.outputFiles[0].text).toString('base64')}`);
let time=0,key=0;const timers=new Map();
globalThis.performance={now:()=>time};globalThis.window=globalThis;globalThis.document={hidden:true};
globalThis.setTimeout=(fn,ms)=>{timers.set(++key,{fn,at:time+ms});return key;};globalThis.clearTimeout=k=>timers.delete(k);
globalThis.Image=class{decode(){return Promise.resolve();}};
const image={isConnected:true,style:{cssText:''}},element={dataset:{character:'finn'},querySelector:()=>image};
const node={dataset:{seat:'0',mood:'Normal'},element,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})};
const root={querySelector:s=>s.includes('master-hand')?node:s.includes('master-sprite')?element:node,querySelectorAll:()=>[node]};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const advance=async ms=>{const end=time+ms;while(true){const next=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}time=end;await flush();};
const state={active:0,total:95,overflow:false,target:false,reducedMotion:false};
const cast=new MasterAnimations(root);let sets=0;
for(const [id,healthy] of Object.entries(master.characters))for(let stage=0;stage<4;stage++){
 const data=stage?conditions.characters[id][stage]:healthy;
 for(const [key,blink] of Object.entries(data.clips).filter(([key])=>key.startsWith('blink-'))){
  assert.equal(blink.frames.length,3,`${id}/${stage}/${key}: no incomplete half-eye drawings`);
  assert.equal(blink.frames[0],blink.frames[2],`${id}/${stage}/${key}: returns to its own complete pose`);
  assert.deepEqual(blink.durations,[40,80,60]);
  assert.deepEqual(data.poseRegistration?.[blink.frames[0]]??[1,0,0],data.poseRegistration?.[blink.frames[1]]??[1,0,0],`${id}/${stage}/${key}: blink and base share one display unit`);
 }
 if(!stage&&data.bounds['whole-throw-6']){
  assert.equal(data.clips.throw.frames[0],'rest');
  assert.equal(data.clips['receive-ready'].frames[0],'whole-throw-6');
  assert.equal(data.clips.pickup.frames.at(-1),'rest');
  assert.equal(data.clips.tumble.frames[0],'whole-throw-6');
 }
 for(const anchor of ['release','catch']){
  const [x,y,w,h]=data.handoff[anchor];assert(x>=0&&y>=0&&x<=512&&y<=512&&w>0&&h>0,`${id}/${stage}: valid ${anchor} handoff`);
 }
 const characterIndex=Array.from({length:16},(_,i)=>i).find(i=>masterCharacter(i).id===id);
 const anchors=masterAnchors(characterIndex,stage),[displayScale,displayX,displayY]=data.registration??[1,0,0];
 const [anchorX,anchorY,anchorW,anchorH]=data.handoff.release;
 assert(anchors.includes(`left:${((anchorX-anchorW/2)*displayScale+displayX/4)/512*100}%`),'Flying cards follow the same whole-condition registration');
 element.dataset.character=id;element.dataset.condition=String(stage);node.dataset.condition=String(stage);
 cast.sync(state);await flush();
 const tense=data.emotions.panicked;assert.equal(element.dataset.frame,tense);
 cast.sync({...state,active:1});await flush();
 assert.equal(element.dataset.animation,`look-right@${tense}`,'Turn reaction keeps the tense face');
 await advance(500);assert.equal(element.dataset.frame,tense);
 const prepare=cast.prepareThrow(0);await flush();await advance(data.handoff.releaseMs+1);await prepare;
 assert.equal(element.dataset.cards,'2','Reduced or normal preparation must not remove a card early');
 cast.release(0);assert.equal(element.dataset.cards,'1');await flush();await advance(800);
 const held=data.clips.throw.frames.at(-1);assert.equal(element.dataset.frame,held,'One-card idle uses the approved final throw pose');
 const blink=data.clips['blink-'+held];
 if(blink){const p=cast.play(0,'blink-'+held);await flush();await advance(300);await p;assert.equal(element.dataset.frame,held);assert.equal(element.dataset.cards,'1');}
 const draw=cast.prepareDraw(0);await flush();await advance(200);await draw;assert.equal(element.dataset.cards,'1');
 const caught=cast.received(0);assert.equal(element.dataset.frame,data.handoff.caught);assert.equal(element.dataset.cards,'2');await flush();await advance(500);await caught;
 // Browser timers may be throttled while switching apps: skip directly beyond
 // the whole fall. The landing must still be painted, never a suspended pose.
 const fall=cast.tumble(0);await flush();time+=5000;
 for(const [key,timer] of [...timers.entries()].filter(([,v])=>v.at<=time).sort((a,b)=>a[1].at-b[1].at)){timers.delete(key);timer.fn();await flush();}
 await advance(2000);await fall;assert.equal(element.dataset.frame,'floor');
 cast.reset();assert.equal(timers.size,0);
 cast.sync({...state,reducedMotion:true});await flush();await cast.prepareThrow(0);
 assert.equal(element.dataset.cards,'2');assert.notEqual(element.dataset.frame,data.clips.throw.frames.at(-1),'Reduced motion preparation holds the working card');
 cast.release(0);await flush();assert.equal(element.dataset.cards,'1');assert.equal(element.dataset.frame,held);
 await cast.tumble(0);assert.equal(element.dataset.frame,'floor');cast.reset();assert.equal(timers.size,0);
 for(const [frame,[x,y,w,h]] of Object.entries(data.bounds)){
  assert(x>=100&&y>=100&&x+w<=1948&&y+h<=1948,`${id}/${stage}/${frame} padding`);
  const path=`public/assets/social-club/${stage?`condition-animation-v1/${id}/${stage}`:`master-animation-v2/${id}`}/${frame}.webp`;
  assert(existsSync(path));assert.deepEqual(webpSize(path),[w,h],`${id}/${stage}/${frame}: stale bounds would stretch the body`);
  const [scale,dx,dy]=data.poseRegistration?.[frame]??[1,0,0];
  const expected=[(x*scale+dx)*displayScale+displayX,(y*scale+dy)*displayScale+displayY,w*scale*displayScale,h*scale*displayScale];
  assert.deepEqual(masterFrameBounds(id,frame,stage),expected,'Every pose is one uniform whole-drawing transform');
 }
 sets++;
}
console.log(`Animation quality passed: ${sets} sets, expression-preserving glances, pose-specific blinks, one/two-card continuity, throttled timers, reduced motion, fixed floor landings and uniform tumble scale.`);
