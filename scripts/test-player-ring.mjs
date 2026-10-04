import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({entryPoints:['src/ui/PlayerRingModel.ts'],bundle:true,platform:'node',format:'esm',write:false});
const { wrapSeat, nearestCenter, ringSeat, traditionalRingSeat, faceFrame } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
for(const portrait of [false,true]){
 const two=[0,1].map(i=>traditionalRingSeat(i,.5,2,portrait));
 const four=[0,1,2,3].map(i=>traditionalRingSeat(i,1.5,4,portrait));
 assert.equal(two[0].x,four[1].x);assert.equal(two[1].x,four[2].x,'Two characters retain the central four-seat positions');
 for(const count of [2,3,4,8])for(let active=0;active<count;active++){
  const center=nearestCenter(active,.5,count);
  const poses=Array.from({length:count},(_,i)=>traditionalRingSeat(i,center,count,portrait));
  assert.equal(poses.filter(p=>p.visible).length,Math.min(count,4));
  assert(poses.filter(p=>p.visible).every(p=>p.x>0&&p.x<1));
 }
}
for (const count of [2,3,4,5,6,7,8]) for (const portrait of [false,true]) {
  for (let active=0; active<count; active++) {
    const center = nearestCenter(active, 97.5, count);
    const poses = Array.from({length:count},(_,i)=>ringSeat(i,center,count,portrait));
    assert.equal(poses.filter(p=>p.visible).length,Math.min(count,4),'Exactly four seats at rest, or every seat for smaller tables');
    assert(poses[active].visible,'Auto focus always includes the active player');
    for (let step=0;step<20;step++) {
      const between = Array.from({length:count},(_,i)=>ringSeat(i,center+step/20,count,portrait));
      assert(between.filter(p=>p.visible).length<=4,'Rotation cannot reveal an overlapping fifth bust');
      assert(between.filter(p=>p.visible).every(p=>p.x>=0&&p.x<=1),'Visible seats remain inside the viewport');
    }
  }
  const ordered=Array.from({length:count},(_,i)=>({i,...ringSeat(i,.5,count,portrait)})).filter(p=>p.visible).sort((a,b)=>a.x-b.x);
  ordered.slice(1).forEach((p,i)=>assert.equal(p.i,wrapSeat(ordered[i].i+1,count),'Clockwise logical order survives wrapping'));
  for(let culprit=0;culprit<count;culprit++){
    const poses=Array.from({length:count},(_,i)=>ringSeat(i,culprit,count,portrait,true));
    assert.equal(poses[culprit].x,.5,'Every overflowing player centers exactly, including small tables');
    assert(poses[culprit].visible);
    assert(poses.filter(p=>p.visible).length<=4);
  }
}
assert.equal(faceFrame(69,false,false,false),0);
assert.equal(faceFrame(69,true,false,false),1);
assert.equal(faceFrame(70,false,false,false),2);
assert.equal(faceFrame(89,true,false,false),2);
assert.equal(faceFrame(90,true,false,false),3);
assert.equal(faceFrame(100,true,false,false),3);
assert.equal(faceFrame(98,false,true,false),4);
assert.equal(faceFrame(101,true,true,true),5,'Overflow takes precedence over smug reactions');
assert.equal(faceFrame(60,false,false,false,'Scared'),2);
console.log('Player ring checks passed: 2–8 seats, four visible, wrap order, active focus, safe rotation and score reactions.');
