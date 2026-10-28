import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';

const review=JSON.parse(readFileSync('public/assets/social-club/special-throw-registration-v2.json'));
const art=JSON.parse(readFileSync('public/assets/social-club/special-throw-v1/manifest.json')).characters;
const finish=JSON.parse(readFileSync('public/assets/social-club/engraved-v1/manifest.json'));
const bundle=await build({entryPoints:['src/ui/MasterAnimations.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.MODE':'"100next"'}});
const {masterFrameBounds,masterFrameUrl}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const close=(a,b,message)=>assert(Math.abs(a-b)<.01,`${message}: ${a} vs ${b}`);
function webp(file){
 const bytes=readFileSync(file);let lossless=false,size;
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 for(let offset=12;offset+8<=bytes.length;){
  const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4);
  if(kind==='VP8L'){lossless=true;const bits=bytes.readUInt32LE(offset+9);size=[(bits&16383)+1,((bits>>>14)&16383)+1];}
  offset+=8+length+(length%2);
 }
 return {lossless,size};
}
assert.equal(Object.keys(review.characters).length,16);
let count=0;
for(const [id,data] of Object.entries(review.characters)){
 const [scale,dx,dy]=data.registration;
 assert(scale>0&&scale<=1,'Calibration does not magnify the small native drawings further');
 for(let axis=0;axis<2;axis++)close(data['special-01'].eyeMidpoint[axis]*scale+[dx,dy][axis],data.rest.eyeMidpoint[axis],`${id}: entering the standing pose preserves facial alignment`);
 for(const frame of art[id].frames){
  const bounds=masterFrameBounds(id,frame),raw=art[id].bounds[frame];
  close(bounds[0],raw[0]*scale+dx,`${id}/${frame}: stable horizontal root`);
  close(bounds[1],raw[1]*scale+dy,`${id}/${frame}: stable vertical root`);
  close(bounds[2]/raw[2],scale,`${id}/${frame}: constant drawing scale`);
  close(bounds[3]/raw[3],scale,`${id}/${frame}: uniform aspect ratio`);
  assert(bounds[0]>64&&bounds[1]>64&&bounds[0]+bounds[2]<1984&&bounds[1]+bounds[3]<1984,`${id}/${frame}: retain expanded padding`);
  const url=masterFrameUrl(id,frame);assert(url.endsWith('?v=2'),'New lossless exports invalidate old browser image caches');
  const source=`assets/social-club/special-throw-v1/${id}/${frame}.webp`,entry=finish.frames.find(item=>item.source===source);
  const original=webp('public/'+source),exported=webp('public/'+entry.output);
  assert.equal(exported.lossless,true,`${id}/${frame}: no extra lossy generation`);
  assert.deepEqual(exported.size,original.size,'Preserve native pixel dimensions; do not fake resolution by enlarging bitmaps');
  assert.deepEqual(exported.size,[entry.width,entry.height]);assert.equal(entry.encoding,'lossless');
  close(bounds[2]/bounds[3],exported.size[0]/exported.size[1],`${id}/${frame}: never stretch anatomy`);
  count++;
 }
}
assert.equal(count,128);
console.log('Special Throw visuals passed: all 128 whole drawings, calibrated entry alignment, constant scale/aspect/padding, native lossless exports and cache revision.');
