import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Group,Scene,PerspectiveCamera,Vector3,Quaternion} from 'three';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.MODE':'"100next"'}});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);};
const {ObservatoryScene}=await load('src/render/ObservatoryScene.ts');
const {CardImpactFlow}=await load('src/render/CardImpactFlow.ts');
const {CardHandoff}=await load('src/render/CardHandoff.ts');
const {TotalPresentation}=await load('src/ui/TotalPresentation.ts');
const {RenderInvalidation}=await load('src/render/RenderBudget.ts');
const original={performance:globalThis.performance,requestAnimationFrame:globalThis.requestAnimationFrame,innerHeight:globalThis.innerHeight,document:globalThis.document};
let now=0,queue=[];
globalThis.performance={now:()=>now};
globalThis.requestAnimationFrame=callback=>{queue.push(callback);return queue.length;};
globalThis.innerHeight=800;
globalThis.document={querySelector:()=>null,documentElement:{classList:{contains:()=>true}}};
try {
  const spins=[undefined,{x:0,y:1,z:0,turns:1},{x:0,y:1,z:0,turns:2},{x:0,y:0,z:1,turns:2,kind:'boomerang'},{x:0,y:0,z:1,turns:3,kind:'boomerang'}];
  for(const [index,spin] of spins.entries()){
    now=0;queue=[];
    const duration=[440,560,720,920,1080][index],key='1:fire-4:1';
    const score=new TotalPresentation(),wave=new CardImpactFlow(),arrivals=[],sweeps=[];
    score.sync('round-1','',{total:96,caption:''},true);
    const subject=Object.create(ObservatoryScene.prototype),root=new Group(),visual=new Group();root.add(visual);
    visual.userData.flightFlex=()=>{};
    const camera=new PerspectiveCamera(42,1.5,.1,80);camera.position.z=5;
    Object.assign(subject,{
      camera,reducedMotion:false,activeFlights:0,flightTicks:new Set(),flightFrame:0,flightPacer:{step:()=>true,reset(){}},active:true,contextLost:false,quality:'high',lastEventKey:'old',
      cardFlow:wave,table:{setFlow:(progress,strength)=>sweeps.push({now,progress,strength})},worldPaint:new RenderInvalidation(),worldRenders:0,windowRenders:0,
      scene:new Scene(),handoff:new CardHandoff(),hand:{update(){}},ring:{receiveCard(){}},pendingOverflow:false,
      renderer:{shadowMap:{enabled:false,needsUpdate:false},render(){}},foreground:{scene:new Scene(),render(){}},
      disposeFlyingCard:card=>card.removeFromParent(),pruneTextureCache(){},
      onCardArrival:accepted=>{assert(score.arrive(accepted));arrivals.push({now,total:score.visible.total,position:root.position.clone()});},
    });
    subject.foreground.scene.add(root);
    const start=new Vector3(1,-1,0),end=new Vector3(-1,0,-2);
    const flight=subject.animateCardFlight({root,visual,start,end,startQuaternion:new Quaternion(),endQuaternion:new Quaternion(),startScale:1,endScale:1,draw:false,spin,impactCardId:'fire-4'});
    const tick=time=>{now=time;const callback=queue.shift();assert(callback);callback(now);};
    tick(duration*.2);
    // Server confirmation is allowed during a throw, but can never reveal the number early.
    score.sync('round-1',key,{total:100,caption:'EXACT 100'},true);subject.playKey=key;wave.setCard(key);
    for(const progress of [.3,.6,.95,.999]){
      tick(duration*progress);
      const before=wave.update(0,false).progress;
      assert(Math.abs(before-progress*.78)<1e-10,'The table light uses the actual normal/spin/boomerang throw clock');
      assert.equal(wave.update(10,false).progress,before,'An independent world tick cannot race ahead of the flight');
      wave.setCard(key);subject.applyImpactFlow(wave.update(0,false));
      assert.equal(score.visible.total,96);assert.equal(arrivals.length,0,'No number, sound or danger arrival before physical contact');
    }
    tick(duration);await flight;
    subject.applyImpactFlow(wave.update(0,false));
    assert.equal(arrivals.length,1);assert.equal(arrivals[0].now,duration,'The landing and total update have exactly the same timestamp');
    assert.equal(arrivals[0].total,100);assert(arrivals[0].position.distanceTo(end)<1e-9);
    assert(Math.abs(sweeps.at(-1).progress-.78)<1e-10,'Light reaches the center at that same landing');
    subject.applyImpactFlow(wave.update(.01,false));assert.equal(arrivals.length,1,'Rerenders never repeat the arrival');
    await subject.handoff.sync('new',false,Promise.resolve());assert.equal(root.parent,null,'The synchronized landing still hands off without a duplicate card');
    wave.update(.3,false);assert.equal(wave.active,false,'Only a short tail remains after landing');
  }
  const late=new CardImpactFlow();late.beginFlight('water-10');late.seekFlight(1);late.landFlight();
  assert.equal(late.update(2,false).arrival,false,'A missing server acknowledgment cannot invent an accepted move');
  late.setCard('1:water-10:5');const accepted=late.update(0,false);
  assert.equal(accepted.arrival,true);assert.equal(accepted.progress,1,'A delayed acknowledgment never replays the entire sweep');
  assert.equal(late.update(0,false).arrival,false);
  late.beginFlight('leaf-7');late.seekFlight(.4);late.cancelFlight();
  assert.equal(late.update(10,false).arrival,false);assert.equal(late.active,false,'Rejected/canceled throws stop the light without a false total');
  late.beginFlight('sun-3');late.clear();assert.equal(late.inFlight,false);assert.equal(late.update(1,false).strength,0,'Leaving the table cancels even its very first throw');
} finally {Object.assign(globalThis,original);}
console.log('Throw/light synchronization passed: exact landing frame for normal, one/two spins and both boomerangs; no early totals, single arrival, late acknowledgment, cancellation, pile continuity and idle cleanup.');
