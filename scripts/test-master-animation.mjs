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
const nodes=names.map((id,index)=>{const history=[];const image={isConnected:true,style:{cssText:''},get src(){return this.url;},set src(url){this.url=url;paints++;history.push({url,time});}};const element={dataset:{character:id},querySelector:()=>image};return {dataset:{seat:String(index),mood:'Normal'},hidden:false,history,element,image,getBoundingClientRect:()=>({left:index*200,top:100,width:100,height:100})};});
const root={querySelector(selector){const n=nodes[Number(selector.match(/data-seat="(\d+)"/)?.[1])];if(selector.includes('master-hand'))return {getBoundingClientRect:n.getBoundingClientRect};return selector.includes('master-sprite')?n.element:n;},querySelectorAll(){return nodes.filter(n=>!n.hidden);}};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const advance=async ms=>{const end=time+ms;while(true){const next=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}time=end;await flush();};
const state={active:0,total:0,overflow:false,target:false,reducedMotion:false};const cast=new MasterAnimations(root);
cast.sync(state);await flush();const initial=paints;cast.sync(state);await flush();assert.equal(paints,initial,'Unchanged renders keep the same drawing');
for(let index=0;index<8;index++){
 const throwing=cast.prepareThrow(index);await flush();await advance(216);assert((await throwing).width>0);
 assert.equal(nodes[index].element.dataset.frame,'whole-throw-3','Flight waits for the prepared working card');
 cast.sync(state);await flush();await advance(1600);
 assert.equal(nodes[index].element.dataset.frame,'whole-throw-3','Renders and idle clocks cannot reset the hand while a flight is being prepared');
 cast.release(index);assert.equal(nodes[index].element.dataset.cards,'1');assert.equal(nodes[index].element.dataset.frame,'whole-throw-4','Card disappears synchronously in the flight start callback');await flush();await advance(300);
 const reaching=cast.prepareDraw(index);await flush();await advance(161);await reaching;
 assert.equal(nodes[index].element.dataset.frame,'whole-receive-3');assert.equal(nodes[index].element.dataset.cards,'1','No second painted card before the actual flight arrives');
 cast.sync({...state,active:(index+1)%8});await flush();await advance(4000);
 assert.equal(nodes[index].element.dataset.frame,'whole-receive-3','Slow replacement flights keep the receiving hand held without blinking or turn reactions replacing it');
 const received=cast.received(index);assert.equal(nodes[index].element.dataset.cards,'2');assert.equal(nodes[index].element.dataset.frame,'whole-receive-4','The card is caught at the matching grip synchronously');await flush();await advance(1000);await received;
 assert(!nodes[index].element.dataset.animation||nodes[index].element.dataset.animation.startsWith('blink-'),'Draw settles; only an independent short blink may follow');
}
cast.chosen(4,1);await flush();assert.equal(nodes[4].element.dataset.animation,'choose-left');await advance(1000);cast.chosen(1,4);await flush();assert.equal(nodes[1].element.dataset.animation,'choose-right');await advance(1000);
const fall=cast.tumble(3);await flush();await advance(1800);await fall;assert.equal(nodes[3].element.dataset.frame,'floor');cast.sync({...state,overflow:true});await flush();assert.equal(nodes[3].element.dataset.frame,'floor','Score rendering keeps the fallen pose');
cast.reset();assert.equal(timers.size,0,'A new round cancels old timers');
cast.sync(state);await flush();nodes[0].element.dataset.character='bianca';cast.sync(state);await flush();assert(nodes[0].image.src.includes('/bianca/'),'Changing a selected avatar updates its drawing despite stable DOM identity');cast.reset();nodes[0].element.dataset.character='vince';
// Cancellation while a whole clip is still decoding cannot overwrite the next round.
waitDecode=true;const interrupted=cast.prepareThrow(1);await flush();cast.reset();await interrupted;waitDecode=false;pending.splice(0).forEach(resolve=>resolve());await flush();assert.equal(timers.size,0);
cast.sync({...state,reducedMotion:true});await flush();await cast.tumble(2);assert.equal(nodes[2].element.dataset.frame,'floor');assert.equal(timers.size,0,'Reduced motion completes immediately');cast.reset();
// A quiet human turn must keep every visible character alive, without more sync calls.
const random=Math.random;Math.random=()=>.5;globalThis.document={hidden:false};
nodes.forEach((n,i)=>{n.hidden=i>=4;n.history.length=0;});
cast.sync({...state,total:85});await flush();await advance(15000);
const blinkCounts=nodes.map(n=>n.history.filter(h=>h.url.endsWith('/nervous-blink.webp')).length);
assert(blinkCounts.slice(0,4).every(n=>n>=3),'All four visible seats blink repeatedly during one unchanged turn');
assert(blinkCounts.slice(4).every(n=>n===0),'Offscreen characters never request or paint idle blinks');
assert.equal(new Set(nodes.slice(0,4).map(n=>n.history.find(h=>h.url.endsWith('/nervous-blink.webp')).time)).size,4,'Characters blink at separate times');
await advance(300);assert(nodes.slice(0,4).every(n=>n.element.dataset.frame==='nervous'),'Blink keeps the nervous expression');
const play=cast.prepareThrow(0);await flush();await advance(216);await play;cast.release(0);await flush();await advance(6000);
assert(nodes[0].history.some(h=>h.url.endsWith('/release-blink.webp')),'The one-card pose can blink without adding a card');
assert.equal(nodes[0].element.dataset.cards,'1');
document.hidden=true;await advance(300);const beforeHidden=paints;await advance(12000);assert.equal(paints,beforeHidden,'Background tabs do not paint blink frames');document.hidden=false;
await advance(6000);assert(paints>beforeHidden,'Blinking resumes on returning to the tab');
cast.sync({...state,reducedMotion:true});await flush();assert.equal(timers.size,0,'Reduced motion cancels every idle clock');
cast.reset();nodes.forEach(n=>{n.hidden=false;n.history.length=0;});Math.random=random;
// A slow blink decode must yield to a real gesture and must not reappear later.
cast.sync(state);await flush();waitDecode=true;await advance(5000);
const duringBlink=cast.prepareThrow(0);await flush();cast.release(0);await flush();waitDecode=false;pending.splice(0).forEach(resolve=>resolve());await flush();await advance(600);await duringBlink;
assert.equal(nodes[0].element.dataset.cards,'1');assert.equal(nodes[0].element.dataset.frame,'release');cast.reset();assert.equal(timers.size,0);
const cardAudit=JSON.parse(readFileSync('public/assets/social-club/master-animation-v2/card-back-checks.json'));assert.equal(new Set(cardAudit.map(x=>x.character)).size,8);assert(cardAudit.every(x=>x.handsPreserved&&x.facesAndBodyOutsideCardsUnchanged&&x.cornerRadiusRatio===.055));
const actionAudit=JSON.parse(readFileSync('public/assets/social-club/master-animation-v2/whole-action-checks.json'));assert.equal(actionAudit.length,96);assert(actionAudit.every(x=>x.nativePixelsIdentical));
const data=JSON.parse(readFileSync('public/assets/social-club/master-animation-v2/manifest.json'));assert.equal(data.nativeCanvas,2048);assert.equal(data.resampled,false);
for(const [id,set] of Object.entries(data.characters))for(const [frame,[x,y,w,h]] of Object.entries(set.bounds)){assert(x>=0&&y>=0&&x+w<=2048&&y+h<=2048);assert(existsSync(`public/assets/social-club/master-animation-v2/${id}/${frame}.webp`));}
console.log('Master animation checks passed: all eight cast actions, held release/catch poses through delayed flights, synchronous card removal/arrival, faster gestures, staggered blinks, expression/card preservation, pauses, reactions, floor landing, cancellation, reduced motion and native assets.');
