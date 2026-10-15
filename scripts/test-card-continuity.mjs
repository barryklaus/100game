import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Group,Scene,PerspectiveCamera,Vector3,Quaternion} from 'three';

const load=async path=>{
  const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.MODE':'"100next"'}});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const {CardPile}=await load('src/render/CardPile.ts');
const texture={image:{width:511,height:711},isTexture:true};
const waiting=new Map();
let fail=false;
const pile=new CardPile(false,url=>{
  if(url.startsWith('delayed'))return new Promise(resolve=>waiting.set(url,resolve));
  if(url==='retry'&&fail)return Promise.reject(new Error('Temporary texture failure'));
  return Promise.resolve(texture);
});
await pile.setCards(Array.from({length:35},(_,i)=>`old-${i}`),'back');
const old=[...pile.group.children];
const recycling=pile.setCards(['delayed-top'],'back');
await Promise.resolve();
assert.deepEqual(pile.group.children,old,'Reshuffling keeps every painted layer until the retained top face is ready');
waiting.get('delayed-top')(texture);await recycling;
assert.equal(pile.group.children.length,1,'A reshuffle retains one physical top card, never an empty intermediate pile');
const retained=pile.group.children[0];
const stale=pile.setCards(['delayed-obsolete'],'back');await Promise.resolve();
assert.equal(pile.group.children[0],retained);
await pile.setCards(['current'],'back');
const current=pile.group.children[0];
waiting.get('delayed-obsolete')(texture);await stale;
assert.equal(pile.group.children[0],current,'An older texture completion cannot replace the current pile');
fail=true;await assert.rejects(pile.setCards(['retry'],'back'));
assert.equal(pile.group.children[0],current,'A failed face preserves the visible pile');
fail=false;await pile.setCards(['retry'],'back');
assert.notEqual(pile.group.children[0],current,'The same failed update can retry successfully');
pile.dispose();

// Drive the actual flight implementation with a deterministic animation clock.
// No renderer or DOM is needed: the assertions cover movement and paint order.
const {ObservatoryScene}=await load('src/render/ObservatoryScene.ts');
const {CardHandoff}=await load('src/render/CardHandoff.ts');
const saved={performance:globalThis.performance,requestAnimationFrame:globalThis.requestAnimationFrame,innerHeight:globalThis.innerHeight};
let now=0,queue=[];
globalThis.performance={now:()=>now};
globalThis.requestAnimationFrame=callback=>{queue.push(callback);return queue.length;};
globalThis.innerHeight=800;
try {
  for(const draw of [false,true]){
    now=0;queue=[];
    const events=[],subject=Object.create(ObservatoryScene.prototype);
    const root=new Group(),visual=new Group();root.add(visual);
    visual.userData.flightFlex=()=>{};
    const camera=new PerspectiveCamera(42,1.5,.1,80);camera.position.z=5;
    Object.assign(subject,{
      camera,reducedMotion:false,activeFlights:0,flightTicks:new Set(),flightFrame:0,flightPacer:{step:()=>true,reset(){}},active:true,contextLost:false,quality:'high',lastEventKey:'old',
      scene:new Scene(),handoff:new CardHandoff(),hand:{update:()=>{}},
      renderer:{shadowMap:{needsUpdate:false},render:()=>events.push('pile-painted')},
      foreground:{scene:new Scene(),render:()=>{events.push('foreground-painted');painted.push(root.position.clone());}},
      disposeFlyingCard:card=>{events.push('flight-removed');card.removeFromParent();},pruneTextureCache:()=>{},
    });
    const painted=[];
    subject.foreground.scene.add(root);
    const start=new Vector3(1,-1,0),end=new Vector3(-1,0,-2);
    const flight=subject.animateCardFlight({root,visual,start,end,startQuaternion:new Quaternion(),endQuaternion:new Quaternion(),startScale:1,endScale:1,draw,releaseVelocity:draw?undefined:{x:.6,y:-.4}});
    assert.equal(events[0],'foreground-painted','The flying card is painted as the hand card is hidden');
    const duration=draw?520:440;
    const tick=elapsed=>{now=elapsed;const callback=queue.shift();assert(callback);callback(now);};
    if(!draw){
      tick(.01);
      assert(painted.at(-1).distanceTo(root.position)<1e-12,'The updated flight is painted in its own frame, without waiting for the next world loop');
      const worldPerPixel=2*5*Math.tan(42*Math.PI/360)/800;
      assert(Math.abs((root.position.x-start.x)/.01/worldPerPixel-.6)<.001,'Release starts with the held card horizontal velocity');
      assert(Math.abs((root.position.y-start.y)/.01/worldPerPixel-.4)<.001,'Release starts with the held card upward velocity');
    }
    tick(duration*.86);const before=root.position.clone();
    tick(duration*.95);
    assert(root.position.distanceTo(before)>.001,'The flight continues toward the pile through its last frames');
    tick(duration);await flight;
    if(draw){
      assert.equal(root.visible,false,'Receiving cards disappear immediately after reaching the hand');
      assert.equal(root.parent,null);
    }else{
      assert(root.position.distanceTo(end)<1e-9,'The moving card settles exactly onto the destination');
      assert.equal(root.parent,subject.foreground.scene,'The landed card stays in its original canvas until the pile is painted');
      assert.equal(root.visible,true);
      await subject.handoff.sync('new',false,Promise.resolve());
      assert(events.indexOf('pile-painted')<events.indexOf('flight-removed'),'The real discard is painted before its foreground cover is removed');
      assert.equal(root.parent,null);
      assert.equal(root.visible,false);
    }
  }
} finally {Object.assign(globalThis,saved);}

// Visible-image readiness and pointer input may spell the same URL differently.
const urls=Object.create(ObservatoryScene.prototype),built=[];
globalThis.document={baseURI:'https://100next.pages.dev/'};
Object.assign(urls,{active:true,contextLost:false,roundEnded:false,reducedMotion:false,preparedThrow:{warm:url=>built.push(url)}});
urls.warmCardThrow('/assets/cards/midnight-v1/fire-4.webp');
assert.equal(built[0],urls.cardSource('https://100next.pages.dev/assets/cards/midnight-v1/fire-4.webp'),'Ready artwork and release use one preparation key');

const {CardReleaseCarry}=await load('src/ui/CardReleaseCarry.ts');
let carryFrames,carryOptions,canceled=0;
document.timeline={currentTime:500};
globalThis.getComputedStyle=()=>({transform:'matrix(1, 0, 0, 1, 22, -31)'});
const carryAnimation={cancel:()=>canceled++};
const carryCard={animate:(frames,options)=>{carryFrames=frames;carryOptions=options;return carryAnimation;}};
const carry=new CardReleaseCarry(carryCard,{x:.5,y:-.8});
assert.equal(carryOptions.easing,'linear');assert.equal(carryFrames[0].transform,'matrix(1, 0, 0, 1, 22, -31)');
assert(carryFrames[1].transform.startsWith('translate3d(500px,-800px,0)'),'An uncached release immediately continues its real velocity instead of parking the held card');
assert.equal(carryAnimation.startTime,500,'The carry starts on the current compositor timeline, with no pending-start frame');
carry.stop();assert.equal(canceled,1,'The incoming flight cancels the bridge at its pose snapshot');

// All concurrent flights update before one paint, including the first moved frame.
const batch=Object.create(ObservatoryScene.prototype),order=[];
Object.assign(batch,{flightTicks:new Set(),flightFrame:9,flightPacer:{step:()=>true},foreground:{render:()=>order.push('paint')}});
for(const key of ['a','b'])batch.flightTicks.add(()=>order.push(key));
const oldRaf=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>1;
batch.tickFlights(20);assert.deepEqual(order,['a','b','paint'],'Concurrent dealing/throws do not multiply GPU draws or add a frame of latency');
globalThis.requestAnimationFrame=oldRaf;
console.log('Card continuity passed: same-frame flight paint, bounded hand prewarming, canonical URLs, immediate cold-release carry, release velocity, exact landing, draw cleanup and discard paint order.');
