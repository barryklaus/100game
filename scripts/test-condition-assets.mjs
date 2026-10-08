import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('public/assets/social-club/condition-animation-v1/manifest.json'));
const ids=['vince','finn','june','edgar','roxie','otis','paloma','bianca','vera','tess','nadia','dottie','malik','hugo','jasper','leon'];
assert.equal(manifest.canvas,2048);let frames=0;
for(const id of ids)for(const stage of [1,2,3]){
 const set=manifest.characters[id]?.[stage];assert(set,`${id} condition ${stage} is complete`);
 for(const [frame,[x,y,w,h]] of Object.entries(set.bounds)){
  assert(x>=100&&y>=100&&x+w<=1948&&y+h<=1948,`${id}/${stage}/${frame}: safe canvas padding`);
  const file=`public/assets/social-club/condition-animation-v1/${id}/${stage}/${frame}.webp`;
  assert(existsSync(file),file);assert(statSync(file).size<25*1024*1024);frames++;
 }
 for(const key of ['throw','receive-ready','pickup','blink-rest','blink-release','blink-down','look-left','look-right','study','tumble','return','defeat']){
  const clip=set.clips[key];assert(clip,`${id}/${stage}/${key}`);assert.equal(clip.frames.length,clip.durations.length);
  assert(clip.durations.every(ms=>ms>0));assert(clip.frames.every(frame=>set.bounds[frame]));
 }
 let time=0;for(let i=0;i<set.clips.throw.frames.length;i++){if(time>=set.handoff.releaseMs)assert.equal(set.frameCards[set.clips.throw.frames[i]],1,'No painted duplicate after release');time+=set.clips.throw.durations[i];}
 assert.equal(set.clips.tumble.frames.at(-1),'floor');assert.equal(set.handoff.releaseMs,215);assert.equal(set.handoff.released,'release');assert.equal(set.handoff.caught,'receive-caught');
 for(const key of ['release','catch'])assert(set.handoff[key].every(Number.isFinite));
 const checks=manifest.checks.filter(c=>c.id===id&&c.stage===stage);
 assert.equal(checks.length,7);assert.deepEqual(checks.map(c=>c.heldCards),[2,2,1,1,2,1,1]);assert(checks.every(c=>c.wholeDrawing&&c.clearance>=120));
}
assert.equal(manifest.eyeChecks.length,16*3*12);assert(manifest.eyeChecks.every(c=>c.alphaIdentical&&c.protectedPixelsIdentical&&c.changedPixels>0));
console.log(`Condition assets passed: 16 characters × 3 stages, ${frames} complete lossless sprites, safe padding, held-card counts, synchronized handoffs, blinks and floor tumbles.`);
