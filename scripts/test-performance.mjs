import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{
  const entry=path==='src/render/ObservatoryScene.ts'?{stdin:{contents:`export * from './${path}'; export {Scene,Texture,Mesh,MeshBasicMaterial,PlaneGeometry} from 'three';`,resolveDir:process.cwd(),sourcefile:'performance-test-entry.ts'}}:{entryPoints:[path]};
  const result=await build({...entry,bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.MODE':'"100next"'}});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const {FramePacer,RenderInvalidation}=await load('src/render/RenderBudget.ts');
for(const refresh of [60,120,144]){
  const clock=new FramePacer(),frames=[];
  for(let i=0;i<=refresh*10;i++)if(clock.step(i*1000/refresh))frames.push(i*1000/refresh);
  assert(frames.length>=595&&frames.length<=610,`${refresh} Hz keeps approximately 60 updates per second`);
  assert(Math.max(...frames.slice(1).map((time,i)=>time-frames[i]))<35,'Pacing must not insert avoidable stalls');
}
const early=new FramePacer();
assert(Array.from({length:600},(_,i)=>early.step(i*16)).every(Boolean),'Early 60 Hz ticks consume their budget instead of retaining a near-full remainder');
early.reset(10000);assert.equal(early.step(10008),false);assert.equal(early.step(10017),true,'Resuming from another app starts with a fresh frame budget');
const paints=new RenderInvalidation();
assert(paints.consume(false),'The initial table must be painted');
for(let i=0;i<600;i++)assert.equal(paints.consume(false),false,'Idle table frames must not submit GPU draws');
for(let i=0;i<65;i++)assert(paints.consume(true),'Gameplay effects retain every animated update');
assert.equal(paints.consume(false),false,'Finished effects stop redrawing');
paints.request();assert(paints.consume(false),'A new pile texture, resize, state or restored context repaints');
assert.equal(paints.consume(false),false);assert(paints.consume(false,true),'A dirty enabled shadow map is painted once');

const {LatestFrame}=await load('src/ui/LatestFrame.ts');
let id=0;const callbacks=new Map(),painted=[];
globalThis.requestAnimationFrame=fn=>{callbacks.set(++id,fn);return id;};
globalThis.cancelAnimationFrame=key=>callbacks.delete(key);
const visual=new LatestFrame(value=>painted.push(value));
for(let i=0;i<30;i++)visual.schedule(i);
assert.equal(callbacks.size,1,'Many touch/foil samples schedule one visual update');
callbacks.values().next().value();assert.deepEqual(painted,[29]);assert.equal(callbacks.size,0);
visual.schedule('release pose');visual.flush();assert.deepEqual(painted,[29,'release pose'],'Release paints the latest held pose immediately before flight ownership');
assert.equal(callbacks.size,0);visual.schedule('stale');visual.cancel();assert.equal(callbacks.size,0);assert.equal(painted.length,2,'Canceled input cannot repaint after release');

const {DecodeQueue}=await load('src/ui/DecodeQueue.ts');
const decodes=new DecodeQueue(1),order=[];let unlock;
const blocker=decodes.run(()=>new Promise(resolve=>{unlock=resolve;}));
await Promise.resolve();
const background=decodes.run(async()=>order.push('background'),0,'prefetch');
const promoted=decodes.run(async()=>order.push('promoted'),0,'now-visible');
const action=decodes.run(async()=>order.push('action'),2,'receive');
decodes.promote('now-visible',2);unlock();await Promise.all([blocker,background,promoted,action]);
assert.deepEqual(order,['action','promoted','background'],'Visible/action frames and promoted prefetches take priority over unused warming');

const {ForegroundCards}=await load('src/render/ForegroundCards.ts');
const calls=[],foreground=Object.create(ForegroundCards.prototype);
Object.assign(foreground,{size:{width:0,height:0,pixelRatio:0},renderer:{setPixelRatio:value=>calls.push(value),setSize:(w,h)=>calls.push([w,h])}});
foreground.resize(390,844,2);foreground.resize(390,844,2);assert.equal(calls.length,2,'Table resolution adaptation must not reallocate the unchanged crisp foreground canvas');
foreground.resize(844,390,2);assert.equal(calls.length,4,'A real orientation change still resizes the foreground');

const {cardTextureDimensions}=await load('src/render/CardFaceTexture.ts');
assert.deepEqual(cardTextureDimensions(1064,1486),{width:1064,height:1486},'Full-resolution hand/flight textures keep every native pixel');
assert.deepEqual(cardTextureDimensions(1064,1486,768),{width:550,height:768},'Small phone piles use a separate texture sized well above their displayed pixels');
assert(550*768/(1064*1486)<.27,'Pile pixel storage is reduced by more than 73%');
assert.deepEqual(cardTextureDimensions(200,300,768),{width:200,height:300},'Small sources are never enlarged');

const {ObservatoryScene,Scene,Texture,Mesh,MeshBasicMaterial,PlaneGeometry}=await load('src/render/ObservatoryScene.ts');
const textureScene=Object.create(ObservatoryScene.prototype),tableScene=new Scene();
const retainedPile=new Texture(),backTexture=new Texture(),oldWarm=new Texture(),warmA=new Texture(),warmB=new Texture();
tableScene.add(new Mesh(new PlaneGeometry(),new MeshBasicMaterial({map:retainedPile})),new Mesh(new PlaneGeometry(),new MeshBasicMaterial({map:new Texture()})));
const entries=[['pile',retainedPile],['back',backTexture],['old',oldWarm],['a',warmA],['b',warmB]];
Object.assign(textureScene,{pileTextureLimit:768,drawCardUrl:'back',scene:tableScene,foreground:{scene:new Scene()},loadedTextures:new Map(entries),textureCache:new Map(entries.map(([key,t])=>[key,Promise.resolve(t)])),textureLastUsed:new Map(entries.map(([key],i)=>[key,i]))});
textureScene.pruneTextureCache();
assert.equal(textureScene.loadedTextures.size,4,'Mobile retains active cards and only two unused warm faces; unrelated table maps do not inflate the budget');
assert(textureScene.loadedTextures.has('pile'));assert(textureScene.loadedTextures.has('back'));assert.equal(textureScene.loadedTextures.has('old'),false,'The common full-resolution back and visible piles survive eviction');

const {ArcaneTotalRing}=await load('src/render/ObservatoryTable.ts');
// The ring's optional glow texture needs only a tiny drawing surface in this test.
globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
const ring=new ArcaneTotalRing();
for(const name of ['total-ring-sectors','total-ring-markers']){
  const group=ring.group.getObjectByName(name);
  assert.equal(group.children.length,1);assert(group.children[0].isInstancedMesh);assert.equal(group.children[0].count,12,'All twelve engravings remain, batched into a single draw');
}
assert.equal(ring.active,false);ring.trigger('reverse');assert(ring.active);ring.update(1.1,false);assert.equal(ring.active,false,'The table settles after its event');
ring.receiveCard();assert(ring.active);ring.update(1,false);assert.equal(ring.active,false);

const {HoloShader}=await load('src/render/HoloShader.ts');
const foil=Object.create(HoloShader.prototype),foilValues=new Map();
const heldCard={classList:{contains:name=>name==='dragging'},dataset:{tiltX:'.1',tiltY:'.2'},style:{setProperty:(key,value)=>foilValues.set(key,value)},toggleAttribute(){},removeAttribute(){},getBoundingClientRect(){throw Error('Dragging foil must not force layout');}};
globalThis.window=globalThis;
Object.assign(foil,{isEnabled:true,active:heldCard,lastPointer:{x:0,y:0},stillTimer:0,pointerFrame:{cancel(){}}});
foil.paintPointer({target:{closest:()=>heldCard},clientX:20,clientY:10});
assert.equal(foilValues.get('--holo-x'),'75.0%');assert.equal(foilValues.get('--holo-y'),'37.5%');clearTimeout(foil.stillTimer);
console.log('Performance passed: 60/120/144 Hz pacing, idle GPU invalidation, live effects and context/resize refresh, coalesced inputs, immediate release, priority decodes, and stable foreground buffers.');
