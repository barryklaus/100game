import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';

const bundle=await build({entryPoints:['src/ui/TraditionalCharacters.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
const {TraditionalCharacters}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
let time=0,id=0;
const raf=new Map();
globalThis.performance={now:()=>time};
globalThis.requestAnimationFrame=callback=>{raf.set(++id,callback);return id;};
globalThis.cancelAnimationFrame=key=>raf.delete(key);
globalThis.window=globalThis;
globalThis.Image=class{decode(){return Promise.resolve();}};
globalThis.DOMRect=class{constructor(x,y,width,height){Object.assign(this,{x,y,left:x,top:y,width,height});}};
const draws=[];
const canvases=['finn','june'].map((character,index)=>({isConnected:true,dataset:{character},getContext:()=>({clearRect(){},drawImage(...args){draws.push(args);}}),getBoundingClientRect:()=>({left:index*500,top:0,width:512,height:512})}));
const nodes=canvases.map((canvas,index)=>({dataset:{seat:String(index),mood:'Normal'},getBoundingClientRect:canvas.getBoundingClientRect}));
const root={querySelector(selector){const index=Number(selector.match(/data-seat="(\d+)"/)?.[1]);return selector.includes('traditional-sprite')?canvases[index]:nodes[index];},querySelectorAll(){return nodes;}};
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const advance=async ms=>{time+=ms;const callbacks=[...raf.values()];raf.clear();callbacks.forEach(cb=>cb(time));await flush();};
const cast=new TraditionalCharacters(root);
const state={active:0,total:0,overflow:false,target:false,reducedMotion:false};
cast.sync(state);await flush();
assert(canvases.every(c=>c.dataset.cards==='2'));
const count=draws.length;cast.sync(state);await flush();assert.equal(draws.length,count,'Resting drawings do not repaint');
for(let seat=0;seat<2;seat++){
 const prepared=cast.prepareThrow(seat);await flush();await advance(321);const release=await prepared;
 assert(release.width>0);cast.release(seat);await flush();await advance(2000);
 assert.equal(canvases[seat].dataset.cards,'1','A released card is removed from the drawn hand');
 const catchRect=await cast.prepareDraw(seat);assert(catchRect.width>0);
 const caught=cast.received(seat);await flush();await advance(2000);await caught;
 assert.equal(canvases[seat].dataset.cards,'2','The actual arrival restores two held cards');
 assert.equal(canvases[seat].dataset.animation,undefined,'No animation remains running at rest');
}
const canceled=cast.prepareThrow(0);await flush();cast.reset();await canceled;await advance(2000);
assert.equal(raf.size,0,'Changing rounds cancels stale sprite callbacks');
cast.sync({...state,reducedMotion:true});await flush();await cast.tumble(1);
const fallenFrame=canvases[1].dataset.frame;cast.sync({...state,overflow:true,reducedMotion:true});await flush();
assert.equal(canvases[1].dataset.frame,fallenFrame,'Showing scores must not restore the fallen culprit to their chair');
assert.equal(raf.size,0,'Reduced motion completes without a continuous animation loop');cast.reset();
for(const name of ['finn','june']){
 const manifest=JSON.parse(await fs.readFile(`public/assets/social-club/${name}-manifest.json`));
 assert.equal(manifest.cellSize,512);assert(manifest.verification.minimumPadding>=128);
 assert.equal(manifest.verification.changedChairPixels,0,'Ordinary frames keep the same exposed chair');
 assert(manifest.verification.exactTumbleReturnBoundary);
 const byId=Object.fromEntries(manifest.clips.map(c=>[c.id,c]));
 assert.equal(byId.throw.frames.at(-1).cards,1);assert.equal(byId.pickup.frames.at(-1).cards,2);
 assert(byId.tumble.frames.slice(1).every(f=>f.combinedChair),'The moving tumble drawings contain the chair after the shared seated start');
 assert.equal(byId.throw.frames[0].index,byId.idle.frames[0].index,'Shared rest prevents action seams');
 assert.equal(byId.throw.frames.at(-1).index,byId.pickup.frames[0].index);
}
console.log('Traditional character checks passed: release/catch hands, idle redraw budget, round cancellation, reduced motion, fixed chairs, protected padding and shared rest poses.');

// Gameplay uses the repaired eight-character drawings, without the legacy chair layer.
const names=['vince','finn','june','edgar','roxie','otis','paloma','bianca'];
const simpleCanvases=names.map((character,index)=>({isConnected:true,dataset:{character,spriteSet:'simple-v2'},getContext:()=>({clearRect(){},drawImage(...args){simpleDraws.push(args);}}),getBoundingClientRect:()=>({left:index*500,top:0,width:512,height:512})}));
const simpleDraws=[];
const simpleNodes=simpleCanvases.map((canvas,index)=>({dataset:{seat:String(index),mood:'Normal'},getBoundingClientRect:canvas.getBoundingClientRect}));
const simpleRoot={querySelector(selector){const index=Number(selector.match(/data-seat="(\d+)"/)?.[1]);return selector.includes('traditional-sprite')?simpleCanvases[index]:simpleNodes[index];},querySelectorAll(){return simpleNodes;}};
const simpleCast=new TraditionalCharacters(simpleRoot);
simpleCast.sync(state);await flush();
assert(simpleCanvases.every(canvas=>canvas.dataset.ready==='true'),'All eight selectable characters decode in gameplay');
assert(simpleDraws.every(args=>args.length===9),'Chair-free cast draws just the padded atlas cell');
for(let index=0;index<8;index++){
 const thrown=simpleCast.prepareThrow(index);await flush();await advance(321);const hand=await thrown;
 assert(hand.left>index*500+270&&hand.left<index*500+320,'Flight starts at the working image-right card');
 simpleCast.release(index);await flush();
 assert.equal(simpleCanvases[index].dataset.cards,'1','The drawn card vanishes exactly at release');
 await advance(2000);
 await simpleCast.prepareDraw(index);
 assert.equal(simpleCanvases[index].dataset.cards,'1','An approaching deck card does not duplicate early');
 const pickup=simpleCast.received(index);await flush();
 assert.equal(simpleCanvases[index].dataset.cards,'2','Two cards return at the actual catch callback');
 await advance(2000);await pickup;
}
const falling=simpleCast.tumble(3);await flush();await advance(300);await advance(2000);await falling;
assert.equal(simpleCanvases[3].dataset.frame,'30','Overflow ends on the feet-up floor drawing');
simpleCast.sync({...state,overflow:true});await flush();
assert.equal(simpleCanvases[3].dataset.frame,'30','Scores hold the landing instead of resetting or enlarging the culprit');
simpleCast.reset();assert.equal(raf.size,0);
console.log('Midnight gameplay checks passed: eight casts, chair-free draw, release/catch timing and held tumble landing.');
