import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {build} from 'esbuild';
const load=async(path,mode='100next',extras='')=>{
  const result=await build({stdin:{contents:`export * from './${path}';${extras}`,resolveDir:process.cwd(),sourcefile:'parallax-test-entry.ts'},bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.MODE':JSON.stringify(mode),'import.meta.env.BASE_URL':'"/"'}});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const {normalizeSettings}=await load('src/data/storage.ts');
assert.equal(normalizeSettings({}).parallaxEffect,false,'Existing devices keep their mobile render budget until they opt in');
assert.equal(normalizeSettings({parallaxEffect:true}).parallaxEffect,true);
assert.equal(normalizeSettings({parallaxEffect:false}).parallaxEffect,false);
assert.equal(normalizeSettings({parallaxEffect:'true'}).parallaxEffect,false);
const flags=new Set();
globalThis.document={documentElement:{classList:{contains:name=>flags.has(name)}}};
const {cardImage,cardImageLossless}=await load('src/game/deck.ts');
const card={suit:'sun',rank:'A'};
assert.equal(cardImage(card),'/assets/cards/engraved-v1/sun-a.webp');
assert.equal(cardImageLossless(card),cardImage(card),'The engraved print is already lossless');
flags.add('parallax-effect-on');
assert.equal(cardImage(card),'/assets/cards/engraved-v1/sun-a.webp','A stale parallax preference cannot restore the retired art');
assert.equal(cardImageLossless(card),cardImage(card),'Desktop, touch and throw paths use the same approved print');
const stable=await load('src/game/deck.ts','cloudflare');
assert.equal(stable.cardImage(card),'/assets/cards/sun-a.webp','The stable build does not select new artwork');
const {parallaxKey,parallaxOffsets,ParallaxHand,parallaxLayersFor}=await load('src/ui/ParallaxHand.ts');
assert.equal(parallaxKey({suit:'fire',rank:'J'}),'fire-k');assert.equal(parallaxKey({suit:'fire',rank:'Q'}),'fire-k');
const offsets=parallaxOffsets(2,-2);
assert.deepEqual(offsets,{background:{x:-.024,y:.018},object:{x:.036,y:-.028}},'The bounded layers move in opposing directions');
assert(Object.values(parallaxOffsets(NaN,Infinity)).flatMap(Object.values).every(value=>value===0));

let observer;
globalThis.MutationObserver=class{constructor(callback){observer=this;this.callback=callback;}observe(){}disconnect(){this.disconnected=true;}};
const gate=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function heldCard(key='fire-4'){
  const bg=gate(),fg=gate(),classes=new Set();
  const print={},face={append:node=>{face.print=node;delete selectors[':scope > .card-print'];}};
  const selectors={'.parallax-background img':{decode:()=>bg.promise},'.parallax-object':{decode:()=>fg.promise},'.parallax-face':face,':scope > .card-print':print,':scope > img':{src:`/assets/cards/midnight-v1/parallax-v1/flat/${key}.webp`}};
  return {bg,fg,face,print,card:{isConnected:true,dataset:{parallaxKey:key},classList:{add:name=>classes.add(name),contains:name=>classes.has(name)},querySelector:key=>selectors[key]}};
}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const first=heldCard(),ready=[];let visible=[first.card];
const hand=new ParallaxHand({querySelectorAll:()=>visible},url=>ready.push(url));
first.bg.resolve();await flush();assert.equal(first.card.classList.contains('parallax-ready'),false,'One decoded layer cannot hide the fallback print');
first.fg.resolve();await flush();assert(first.card.classList.contains('parallax-ready'));assert.equal(first.face.print,first.print);assert.equal(ready.length,1);
assert(parallaxLayersFor('/assets/cards/midnight-v1/parallax-v1/flat/fire-4.webp'));
first.card.isConnected=false;visible=[];observer.callback();assert.equal(parallaxLayersFor('/assets/cards/midnight-v1/parallax-v1/flat/fire-4.webp'),undefined,'Removed cards cannot supply stale throw layers');
const failed=heldCard('water-5');visible=[failed.card];observer.callback();failed.bg.resolve();failed.fg.reject(Error('offline'));await flush();assert.equal(failed.card.classList.contains('parallax-ready'),false,'A failed optional layer retains a readable card');
const stale=heldCard('leaf-6');visible=[stale.card];observer.callback();hand.dispose();stale.bg.resolve();stale.fg.resolve();await flush();assert.equal(stale.card.classList.contains('parallax-ready'),false,'Disposed work cannot reappear');

const flight=await load('src/render/ParallaxFlight.ts','100next',"export {Group,Mesh,MeshBasicMaterial,PlaneGeometry,Texture} from 'three';");
const mesh=new flight.Group(),previous=new flight.MeshBasicMaterial();
const face=new flight.Mesh(new flight.PlaneGeometry(1,1.4),previous);face.name='card-front';mesh.add(face);
const print=new flight.Texture({width:1064,height:1486});let disposed=0;print.addEventListener('dispose',()=>disposed++);
const controller=flight.installParallaxFlight(mesh,print,{width:1064,height:1486},{width:1064,height:1486});
const uniforms=face.material.uniforms;
controller.pose(.5,-.5);assert.equal(uniforms.uAmount.value,1);assert.equal(uniforms.uFg.value.x,.018);assert.equal(uniforms.uFg.value.y,.014);
controller.progress(.5);assert.equal(uniforms.uAmount.value,.25);controller.progress(1);assert.equal(uniforms.uAmount.value,0,'The held depth settles exactly into the flat discard artwork');
for(const key of ['uBackground','uObject'])uniforms[key].value.addEventListener('dispose',()=>disposed++);
face.material.dispose();assert.equal(disposed,3,'Canceled/completed flights release all owned layer textures');

const base='public/assets/cards/midnight-v1/parallax-v1/';
const manifest=JSON.parse(readFileSync(base+'manifest.json','utf8'));
const expected=new Set(['fire','water','leaf','sun'].flatMap(suit=>['a','2','3','4','5','6','7','8','9','10','k'].map(rank=>`${suit}-${rank}`)));
assert.equal(manifest.cards.length,44);
for(const entry of manifest.cards){
  assert(expected.delete(entry.key),'Every unique deck artwork has one layer set');
  for(const name of ['background','object','flat']){
    const path=base+entry[name];assert(existsSync(path));const data=readFileSync(path);
    assert.equal(data.toString('ascii',12,16),'VP8L','Use lossless encoded source pixels');
    const bits=data.readUInt32LE(21);assert.equal((bits&0x3fff)+1,1064);assert.equal(((bits>>>14)&0x3fff)+1,1486);
    if(name==='object')assert.equal((bits>>>28)&1,1,'Every foreground has a genuine alpha channel');
  }
}
assert.equal(expected.size,0);
const {makeDeck}=await load('src/game/deckCore.ts');
const deck=makeDeck(),available=new Set(manifest.cards.map(card=>card.key));
assert.equal(deck.length,52);assert(deck.every(card=>available.has(parallaxKey(card))),'All 52 physical cards are covered by the 44 unique artwork sets');

// Drive the held-pointer path itself, including its first movement and release.
const events=new Map(),frames=new Map();let nextFrame=0;
globalThis.window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name)=>events.delete(name),setTimeout};
globalThis.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
document.documentElement.classList={contains:name=>flags.has(name),toggle:(name,on)=>on?flags.add(name):flags.delete(name),remove:name=>flags.delete(name)};
const {HoloShader}=await load('src/render/HoloShader.ts');
const effects=new HoloShader(),values=new Map(),attributes=new Set();
const held={dataset:{parallaxKey:'fire-4'},isConnected:true,classList:{contains:name=>name==='dragging'},style:{setProperty:(name,value)=>values.set(name,value),removeProperty:name=>values.delete(name)},removeAttribute:name=>attributes.delete(name),toggleAttribute:(name,on)=>on?attributes.add(name):attributes.delete(name),getBoundingClientRect(){throw Error('Held motion must not trigger a layout read');}};
const target={closest:()=>held};
events.get('pointerdown')({target,clientX:100,clientY:100});
effects.paintDrag(held,-8.5,10,150,120);
assert.equal(held.dataset.parallaxX,'0.5');assert.equal(held.dataset.parallaxY,'0.5','Held translation drives opposing layers through the actual tilt');
assert(Math.abs(parseFloat(values.get('--parallax-object-x'))-1.8)<.0001);
assert(Number(values.get('--foil-motion'))>0,'The first mouse/touch movement must light the foil');
events.get('pointermove')({target,clientX:160,clientY:130});
assert.equal(frames.size,0,'Held cards do not schedule an independent, stale foil RAF');
effects.paintDrag(held,17,-20,160,130);effects.releaseDrag(held,true);
assert.equal(held.dataset.parallaxX,'-1');assert.equal(held.dataset.parallaxY,'-1','Release keeps the last pose for uninterrupted flight');
events.get('pointerup')();assert.equal(values.get('--foil-motion'),'0');
effects.releaseDrag(held,false);assert.equal(held.dataset.parallaxX,'0');assert.equal(held.dataset.parallaxY,'0','Canceled and returned cards settle to neutral');
effects.enabled=false;effects.paintDrag(held,17,20,200,200);assert.equal(held.dataset.parallaxX,'0','Reduced motion cannot restart depth or shine');
effects.dispose();assert.equal(events.size,0);assert.equal(frames.size,0);
console.log('Parallax passed: opt-in migration, 52-card coverage, lossless alpha layers, atomic readiness, first-move mouse/touch shine, synchronized held depth, release continuity, cancellation, reduced motion and texture cleanup.');
