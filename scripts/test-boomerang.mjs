import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/ui/CardBoomerang.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {CardSwing,boomerangOffset}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

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
console.log('Boomerang checks passed: two/three swings, left/right and vertical holds, jitter, pauses, slow sways, independent holds, normalized spin, bounded mirrored loop, and exact landing.');
