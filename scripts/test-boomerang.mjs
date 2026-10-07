import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/ui/CardBoomerang.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {CardSwing,boomerangOffset,boomerangTiming,boomerangVelocity}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

for(const width of [135,300])for(const axis of ['x','y'])for(const sign of [-1,1]){
  const swing=new CardSwing(0,0,0,width);
  const move=(v,t)=>swing.move(axis==='x'?v:0,axis==='y'?v:0,t);
  assert.equal(move(sign*60,100),false);
  assert.equal(move(0,230),false);
  assert.equal(move(sign*60,360),false,'One and a half sways cannot fire');
  assert.equal(move(0,490),true,'Two back-and-forth swings arm mouse and touch widths');
  const spin=swing.release(530);
  assert.equal(spin.kind,'boomerang');assert.equal(spin.turns,2);
  assert.equal(Math.sign(spin.z),-sign,'Follow the last completed swing direction');
  assert(Math.abs(Math.hypot(spin.x,spin.y,spin.z)-1)<1e-9);
  move(sign*60,620);move(0,750);
  assert.equal(swing.release(820).turns,3,'Three swings add one full spin');
  assert.equal(swing.release(1700),undefined,'A held stale charge expires');
}
const tremor=new CardSwing(0,0,0,250);
for(let i=1;i<=80;i++)assert.equal(tremor.move(i%2?9:-9,i%3?5:-5,i*12),false);
assert.equal(tremor.release(970),undefined,'Pointer jitter cannot charge a boomerang');
const straight=new CardSwing(0,0,0,160);
for(let i=1;i<=30;i++)assert.equal(straight.move(i*20,0,i*30),false,'A long ordinary drag is one stroke');
const paused=new CardSwing(0,0,0,160);
paused.move(60,0,100);paused.move(0,0,220);paused.move(60,0,1000);paused.move(0,0,1120);
assert.equal(paused.release(1130),undefined,'Paused unrelated movements cannot combine');
const slow=new CardSwing(0,0,0,160);
for(let i=1;i<=8;i++)slow.move(i%2?60:0,0,i*600);
assert.equal(slow.release(4850),undefined,'Long casual swaying resets the charge window');
const hold=new CardSwing(0,0,0,160);
hold.move(60,0,500);hold.move(0,0,620);hold.move(60,0,740);hold.move(0,0,860);
assert.equal(hold.release(870).turns,2,'Inspecting first does not prevent a later intentional throw');
const restart=new CardSwing(0,0,0,160);
restart.move(60,0,100);restart.move(0,0,200);
assert.equal(new CardSwing(0,0,300,160).release(310),undefined,'Separate pointer holds cannot share charge');

for(const direction of [-1,1]){
  assert.deepEqual(boomerangOffset(0,direction),{x:0,y:0});
  assert.deepEqual(boomerangOffset(1,direction),{x:0,y:0});
  for(let i=0;i<=200;i++){
    const p=boomerangOffset(i/200,direction);
    assert(Number.isFinite(p.x)&&Number.isFinite(p.y));
    assert(Math.abs(p.x)<=1+1e-9&&Math.abs(p.y)<=1+1e-9,'Loop stays within its responsive camera budget');
    assert(Math.abs(p.x+boomerangOffset(i/200,-direction).x)<1e-9,'Left and right curves mirror');
  }
  assert(boomerangOffset(.25,direction).y>0&&boomerangOffset(.75,direction).y<0,'Arc rises out and curls back to the pile');
  assert(Math.abs(boomerangOffset(.0001,direction).x)<1e-6,'No sideways position jump at release');
  assert(Math.abs(boomerangOffset(.9999,direction).x)<1e-6,'Exact continuous landing into the existing pile fit');
}
// Test physical continuity in screen space, including vertical and diagonal release.
const epsilon=1e-6,duration=920;
for(const velocity of [{x:-.7,y:.1},{x:.8,y:-.2},{x:0,y:-.9},{x:0,y:0}]){
  const impulse=boomerangVelocity({x:0,y:0,z:1,turns:2,kind:'boomerang',velocity});
  assert.deepEqual(impulse,velocity);
  const point=t=>{
    const w=boomerangTiming(t),loop=boomerangOffset(t,1);
    return {x:170*w.arrival+impulse.x*duration*w.momentum+loop.x*120,
      y:-250*w.arrival+impulse.y*duration*w.momentum-w.lift*35-loop.y*75};
  };
  const begin=point(0),after=point(epsilon),end=point(1),before=point(1-epsilon);
  assert(begin.x===0&&begin.y===0);assert.deepEqual(end,{x:170,y:-250});
  for(const axis of ['x','y']){
    assert(Math.abs((after[axis]-begin[axis])/(epsilon*duration)-velocity[axis])<.00001,'Release continues the actual pointer velocity');
    assert(Math.abs((end[axis]-before[axis])/(epsilon*duration))<.00001,'No jump when the card joins the pile');
  }
}
assert.equal(boomerangTiming(0).spin,0);assert.equal(boomerangTiming(1).spin,1);
assert(boomerangTiming(epsilon).spin/epsilon>.99,'Spin begins immediately instead of easing from a standstill');
for(let i=1;i<1000;i++)assert(boomerangTiming(i/1000).spin>boomerangTiming((i-1)/1000).spin,'No mid-flight spin pause or early landing plateau');
assert(Math.hypot(...Object.values(boomerangVelocity({z:1,velocity:{x:80,y:60}})))<=1.6+1e-9,'Extreme pointer spikes stay bounded');

const preparedBundle=await build({entryPoints:['src/render/PreparedCardFlight.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {PreparedCardFlight}=await import(`data:text/javascript;base64,${Buffer.from(preparedBundle.outputFiles[0].text).toString('base64')}`);
const builders=[],disposed=[];
const prepared=new PreparedCardFlight(key=>new Promise((resolve,reject)=>builders.push({key,resolve,reject})),value=>disposed.push(value));
prepared.warm('held');prepared.warm('held');assert.equal(builders.length,1);
builders[0].resolve('held mesh');await Promise.resolve();
assert.equal(await prepared.take('held'),'held mesh');assert.equal(builders.length,1,'Release uses geometry prepared while holding, with no second decode/build');
prepared.clear();assert.deepEqual(disposed,[],'Consuming never disposes the live flight');
prepared.warm('canceled');prepared.clear();builders[1].resolve('late canceled mesh');await Promise.resolve();
assert.deepEqual(disposed,['late canceled mesh'],'Late canceled preparations are removed exactly once');
prepared.warm('old');prepared.warm('new');builders[2].resolve('old mesh');builders[3].resolve('new mesh');await Promise.resolve();
assert.equal(await prepared.take('new'),'new mesh');assert.deepEqual(disposed,['late canceled mesh','old mesh']);
prepared.warm('failed');builders[4].reject(new Error('decode'));await Promise.resolve();prepared.warm('failed');
builders[5].resolve('retry');assert.equal(await prepared.take('failed'),'retry','Failed warming can retry safely');
console.log('Boomerang checks passed: charge/cancel detection, bounded loops, continuous release velocity, immediate uninterrupted spin, exact settled landing, and prepared-flight reuse/cancellation/retry.');
