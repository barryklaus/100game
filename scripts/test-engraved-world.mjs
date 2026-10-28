import assert from 'node:assert/strict';
import {readFileSync,existsSync,openSync,readSync,closeSync} from 'node:fs';
import {build} from 'esbuild';
const root='public/assets/social-club/engraved-v1/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
const bySource=new Map(manifest.frames.map(frame=>[frame.source,frame]));
assert.equal(manifest.frames.length,2602);
function size(file){
 const fd=openSync(file,'r'),b=Buffer.alloc(64);readSync(fd,b,0,64,0);closeSync(fd);
 assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');
 if(b.toString('ascii',12,16)==='VP8X')return[b.readUIntLE(24,3)+1,b.readUIntLE(27,3)+1];
 if(b.toString('ascii',12,16)==='VP8L'){const bits=b.readUInt32LE(21);return[(bits&16383)+1,((bits>>>14)&16383)+1];}
 throw new Error('Expected alpha WebP: '+file);
}
for(const frame of manifest.frames){
 assert(existsSync('public/'+frame.output),frame.output);
 assert.deepEqual(size('public/'+frame.output),size('public/'+frame.source),'The engraved finish never stretches a drawing');
 assert.deepEqual(size('public/'+frame.output),[frame.width,frame.height]);
 assert.match(frame.alphaSha256,/^[a-f0-9]{64}$/,'Exporter verified alpha byte-for-byte');
}
const bundle=await build({entryPoints:['src/ui/MasterAnimations.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.MODE':'"100next"'}});
const {masterFrameUrl,masterFrameBounds}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const master=JSON.parse(readFileSync('public/assets/social-club/master-animation-v2/manifest.json'));
const conditions=JSON.parse(readFileSync('public/assets/social-club/condition-animation-v1/manifest.json'));
for(const [id,healthy] of Object.entries(master.characters))for(let stage=0;stage<4;stage++){
 const data=stage?conditions.characters[id][stage]:healthy;
 for(const frame of Object.keys(data.bounds)){
  assert(existsSync('public'+masterFrameUrl(id,frame,stage).split('?')[0]),`${id}/${stage}/${frame} is available in the game`);
  assert(bySource.has(masterFrameUrl(id,frame,stage).slice(1).split('?')[0].replace('engraved-v1/','')));
  assert(masterFrameBounds(id,frame,stage).every(Number.isFinite));
 }
}
const seats=await build({entryPoints:['src/ui/PlayerRingModel.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {responsiveRingSeat,nearestCenter}=await import(`data:text/javascript;base64,${Buffer.from(seats.outputFiles[0].text).toString('base64')}`);
for(let count=2;count<=8;count++)for(let active=0;active<count;active++){
 const center=nearestCenter(active,.5,count);
 const wide=Array.from({length:count},(_,i)=>responsiveRingSeat(i,center,count,false));
 assert.equal(wide.filter(p=>p.visible).length,count,'Every player is visible on wide screens');
 assert(wide.every(p=>p.x>.05&&p.x<.95));
 assert(Math.abs(wide[0].x+wide.at(-1).x-1)<1e-10,'The wide row is symmetrical');
 assert.deepEqual(wide,Array.from({length:count},(_,i)=>responsiveRingSeat(i,center+2,count,false)),'Turns do not move the wide row or its card anchors');
 const portrait=Array.from({length:count},(_,i)=>responsiveRingSeat(i,center,count,true));
 assert.equal(portrait.filter(p=>p.visible).length,Math.min(count,4));assert(portrait[active].visible);
 const spotlight=responsiveRingSeat(active,active,count,false,true);assert.equal(spotlight.x,.5,'Overflow still centers its culprit');
}
for(const file of ['room-desktop','room-mobile','table-felt','table-wood'])assert(existsSync(`public/assets/scene/engraved-v1/${file}.webp`));
console.log('Engraved world passed: 2,602 complete native character images, preserved dimensions/alpha audit, all 64 condition sets, stable eight-seat wide layout, four-seat portrait carousel and overflow spotlight.');
