import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/ui/MasterAnimations.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
const {MasterAnimations}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
let time=0,key=0,waitDecode=false,pending=[];const timers=new Map();
globalThis.performance={now:()=>time};globalThis.window=globalThis;
globalThis.setTimeout=(fn,ms)=>{timers.set(++key,{fn,at:time+ms});return key;};globalThis.clearTimeout=k=>timers.delete(k);
globalThis.Image=class{decode(){return waitDecode?new Promise(resolve=>pending.push(resolve)):Promise.resolve();}};
const names=['vince','finn','june','edgar','roxie','otis','paloma','bianca'];let paints=0;
const nodes=names.map((id,index)=>{const image={isConnected:true,style:{cssText:''},get src(){return this.url;},set src(url){this.url=url;paints++;}};const element={dataset:{character:id},querySelector:()=>image};return {dataset:{seat:String(index),mood:'Normal'},element,image,getBoundingClientRect:()=>({left:index*200,top:100,width:100,height:100})};});
const root={querySelector(selector){const n=nodes[Number(selector.match(/data-seat="(\d+)"/)?.[1])];if(selector.includes('master-hand'))return {getBoundingClientRect:n.getBoundingClientRect};return selector.includes('master-sprite')?n.element:n;},querySelectorAll(){return nodes;}};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const advance=async ms=>{const end=time+ms;while(true){const next=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}time=end;await flush();};
const state={active:0,total:0,overflow:false,target:false,reducedMotion:false};const cast=new MasterAnimations(root);
cast.sync(state);await flush();const initial=paints;cast.sync(state);await flush();assert.equal(paints,initial,'Unchanged renders keep the same drawing');
for(let index=0;index<8;index++){
 const throwing=cast.prepareThrow(index);await flush();await advance(321);assert((await throwing).width>0);
 assert.equal(nodes[index].element.dataset.frame,'throw-edge','Flight waits for the prepared working card');
 cast.release(index);await flush();assert.equal(nodes[index].element.dataset.cards,'1');assert.equal(nodes[index].element.dataset.frame,'release','Card disappears from the working hand at release');await advance(300);
 await cast.prepareDraw(index);assert.equal(nodes[index].element.dataset.cards,'1','No second painted card before the actual flight arrives');
 const received=cast.received(index);await flush();assert.equal(nodes[index].element.dataset.cards,'2');await advance(1000);await received;
 assert(!nodes[index].element.dataset.animation,'Draw settles without a perpetual animation loop');
}
cast.chosen(4,1);await flush();assert.equal(nodes[4].element.dataset.animation,'choose-left');await advance(1000);cast.chosen(1,4);await flush();assert.equal(nodes[1].element.dataset.animation,'choose-right');await advance(1000);
const fall=cast.tumble(3);await flush();await advance(1800);await fall;assert.equal(nodes[3].element.dataset.frame,'floor');cast.sync({...state,overflow:true});await flush();assert.equal(nodes[3].element.dataset.frame,'floor','Score rendering keeps the fallen pose');
cast.reset();assert.equal(timers.size,0,'A new round cancels old timers');
cast.sync(state);await flush();nodes[0].element.dataset.character='bianca';cast.sync(state);await flush();assert(nodes[0].image.src.includes('/bianca/'),'Changing a selected avatar updates its drawing despite stable DOM identity');cast.reset();nodes[0].element.dataset.character='vince';
// Cancellation while a whole clip is still decoding cannot overwrite the next round.
waitDecode=true;const interrupted=cast.prepareThrow(1);await flush();cast.reset();await interrupted;waitDecode=false;pending.splice(0).forEach(resolve=>resolve());await flush();assert.equal(timers.size,0);
cast.sync({...state,reducedMotion:true});await flush();await cast.tumble(2);assert.equal(nodes[2].element.dataset.frame,'floor');assert.equal(timers.size,0,'Reduced motion completes immediately');cast.reset();
const data=JSON.parse(readFileSync('public/assets/social-club/master-animation-v2/manifest.json'));assert.equal(data.nativeCanvas,2048);assert.equal(data.resampled,false);
for(const [id,set] of Object.entries(data.characters))for(const [frame,[x,y,w,h]] of Object.entries(set.bounds)){assert(x>=0&&y>=0&&x+w<=2048&&y+h<=2048);assert(existsSync(`public/assets/social-club/master-animation-v2/${id}/${frame}.webp`));}
console.log('Master animation checks passed: all eight cast actions, release/arrival timing, left/right reactions, stable rerenders, held floor landing, late decode cancellation, reduced motion and native assets.');
