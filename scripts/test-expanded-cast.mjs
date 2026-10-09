import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/ui/MasterAnimations.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
const {MasterAnimations}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const names=['vera','tess','nadia','dottie','malik','hugo','jasper','leon'];
let time=0,key=0,waiting=false,pending=[];const timers=new Map();
globalThis.performance={now:()=>time};globalThis.window=globalThis;globalThis.document={hidden:false};
globalThis.setTimeout=(fn,ms)=>{timers.set(++key,{fn,at:time+ms});return key;};globalThis.clearTimeout=k=>timers.delete(k);
globalThis.Image=class{decode(){return waiting?new Promise(resolve=>pending.push(resolve)):Promise.resolve();}};
const nodes=names.map((id,index)=>{const history=[];const image={isConnected:true,style:{cssText:''},set src(url){history.push({url,time});}};const element={dataset:{character:id},querySelector:()=>image};return {dataset:{seat:String(index),mood:'Normal'},hidden:false,history,element,image,getBoundingClientRect:()=>({left:index*200,top:100,width:100,height:100})};});
const root={querySelector(selector){const n=nodes[Number(selector.match(/data-seat="(\d+)"/)?.[1])];return selector.includes('master-hand')?{getBoundingClientRect:n.getBoundingClientRect}:selector.includes('master-sprite')?n.element:n;},querySelectorAll(){return nodes.filter(n=>!n.hidden);}};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const advance=async ms=>{const end=time+ms;while(true){const next=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}time=end;await flush();};
const cast=new MasterAnimations(root),state={active:0,total:0,overflow:false,target:false,reducedMotion:false};
cast.sync(state);await flush();
for(let i=0;i<names.length;i++){
 const prepared=cast.prepareThrow(i);await flush();await advance(201);assert((await prepared).width>0);
 assert.equal(nodes[i].element.dataset.frame,'prepare',names[i]+' prepares its working card');
 cast.sync(state);await flush();await advance(2500);assert.equal(nodes[i].element.dataset.frame,'prepare','Delayed launch does not reset the hand');
 cast.release(i);assert.equal(nodes[i].element.dataset.frame,'throw-release');assert.equal(nodes[i].element.dataset.cards,'1');await flush();await advance(350);
 const reach=cast.prepareDraw(i);await flush();await advance(161);await reach;
 assert.equal(nodes[i].element.dataset.frame,'grip');
 cast.sync({...state,total:95});await flush();await advance(4000);assert.equal(nodes[i].element.dataset.frame,'grip','Blink or turn changes cannot paint an early replacement card');
 const catchCard=cast.received(i);assert.equal(nodes[i].element.dataset.frame,'caught');assert.equal(nodes[i].element.dataset.cards,'2');await flush();await advance(500);await catchCard;
 await advance(6000);assert(nodes[i].history.some(h=>h.url.endsWith('/shocked-blink.webp')),names[i]+' keeps blinking during tension');
 const fall=cast.tumble(i);await flush();await advance(1600);await fall;assert.equal(nodes[i].element.dataset.frame,'floor');
 cast.sync({...state,overflow:true});await flush();assert.equal(nodes[i].element.dataset.frame,'floor','Scores keep the landed pose');
 cast.reset();assert.equal(timers.size,0);cast.sync(state);await flush();
}
waiting=true;const canceled=cast.prepareThrow(7);await flush();cast.reset();await canceled;waiting=false;pending.splice(0).forEach(resolve=>resolve());await flush();assert.equal(timers.size,0,'A canceled decode cannot restore a previous round');
cast.sync({...state,reducedMotion:true});await flush();await cast.tumble(7);assert.equal(nodes[7].element.dataset.frame,'floor');cast.reset();assert.equal(timers.size,0);
for(const id of names){
 const dir=id==='vera'?'public/vera-animation/assets':'public/new-cast-animation/assets/'+id;
 const data=JSON.parse(readFileSync(dir+'/manifest.json'));assert.equal(data.nativeCanvas,2048);
 assert(data.checks.every(c=>c.nativePixelsIdentical&&c.clearance>=250),'Shared generous padding and lossless export');
 assert(data.cards.every(c=>c.fingersPreserved&&c.placeholderPixelsRemaining===0&&c.roundedRadiusRatio===.055),'Real rounded backs retain finger occlusion without placeholder residue');
 for(const check of data.checks){assert(existsSync(dir+'/'+check.frame+'.webp'));assert(existsSync('public/assets/social-club/master-animation-v2/'+id+'/'+check.frame+'.webp'));}
 for(const [key,clip] of Object.entries(data.clips)){assert.equal(clip.frames.length,clip.durations.length);assert(clip.durations.every(ms=>ms>0));for(const frame of clip.frames)assert(existsSync(dir+'/'+frame+'.webp'),id+' '+key+' has complete drawings');}
 const one=data.cards.filter(c=>['release','grip','floor','midfall','fall-start'].includes(c.frame));assert(one.every(c=>c.cardCount===1));assert(data.cards.filter(c=>['prepare','caught'].includes(c.frame)).every(c=>c.cardCount===2));
}
console.log('Eight new characters passed: synchronized handoffs, delayed flights, tension blinks, held floor tumbles, cancellation, reduced motion, padding and lossless rounded-card assets.');
