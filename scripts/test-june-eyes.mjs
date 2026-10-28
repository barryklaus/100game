import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';

const assets='assets/social-club/',audit=JSON.parse(readFileSync('public/'+assets+'june-eye-repair-v1.json'));
const healthy=JSON.parse(readFileSync('public/'+assets+'master-animation-v2/manifest.json')).characters.june;
const conditions=JSON.parse(readFileSync('public/'+assets+'condition-animation-v1/manifest.json')).characters.june;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>assert.match(value,/^[0-9a-f]{64}$/,'A pixel/file proof requires a complete SHA256');
function equalProof(proof,label){
 assert(proof,`${label}: missing protected pixel proof`);hash(proof.beforeSha256);hash(proof.afterSha256);
 assert.equal(proof.beforeSha256,proof.afterSha256,`${label}: protected pixels changed`);
}
function webpDimensions(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 const kind=bytes.toString('ascii',12,16);
 if(kind==='VP8X')return[bytes.readUIntLE(24,3)+1,bytes.readUIntLE(27,3)+1];
 assert.equal(kind,'VP8L','The repaired drawings remain lossless alpha WebP');
 assert.equal(bytes[20],47);const bits=bytes.readUInt32LE(21);return[(bits&16383)+1,((bits>>>14)&16383)+1];
}
function verifiedFile(file,expected,label){
 assert.equal(file.path.replace(/^public\//,''),expected,`${label}: audit names the actual game asset`);
 const bytes=readFileSync('public/'+expected);hash(file.beforeSha256);hash(file.sha256);hash(file.alphaSha256);
 assert.equal(sha(bytes),file.sha256,`${label}: current artwork differs from the reviewed export; regenerate the matching engraved image too`);
 assert.deepEqual(webpDimensions(bytes),[file.width,file.height],`${label}: stale crop dimensions would resize the character`);
 return file;
}

assert.equal(audit.version,1);assert.equal(audit.character,'june');assert(Array.isArray(audit.records));
const reviewed=new Map();
for(const record of audit.records){
 const {condition,frame}=record;assert(Number.isInteger(condition)&&condition>=0&&condition<=3);assert.equal(typeof frame,'string');
 const key=`${condition}/${frame}`;assert(!reviewed.has(key),`${key}: duplicate audit record`);reviewed.set(key,record);
 const data=condition?conditions[condition]:healthy;assert(data.bounds[frame],`${key}: the repaired frame must exist in runtime data`);
 const family=condition?`condition-animation-v1/june/${condition}/`:'master-animation-v2/june/';
 const source=verifiedFile(record.source,assets+family+frame+'.webp',key+' native');
 const engraved=verifiedFile(record.engraved,assets+'engraved-v1/'+family+frame+'.webp',key+' engraved');
 assert.deepEqual([source.width,source.height],data.bounds[frame].slice(2),`${key}: the original cropped drawing dimensions stay fixed`);
 assert.deepEqual([engraved.width,engraved.height],[source.width,source.height]);
 assert.equal(source.alphaSha256,engraved.alphaSha256,`${key}: native and engraved silhouettes must stay identical`);
 for(const field of ['alphaIdentical','protectedPixelsIdentical','browsIdentical','templeIdentical'])assert.equal(record[field],true,`${key}: ${field}`);
 for(const field of ['protected','brows','temple','engravedProtected'])equalProof(record[field],`${key}/${field}`);
 for(const field of ['changedPixels','engravedChangedPixels'])assert(Number.isInteger(record[field])&&record[field]>=0&&record[field]<=source.width*source.height,`${key}: valid ${field}`);
 if(record.changedPixels>0)assert.notEqual(source.beforeSha256,source.sha256,`${key}: an audited native repair must reach the actual output file`);
 if(record.engravedChangedPixels>0)assert.notEqual(engraved.beforeSha256,engraved.sha256,`${key}: an audited engraved repair must reach the actual output file`);
 assert.equal(typeof record.donor,'string');assert(record.donor.length>0);
 assert(Array.isArray(record.allowedRegions)&&record.allowedRegions.length>=2,`${key}: eye regions must be explicit`);
 for(const region of record.allowedRegions){assert(region.length>=3);for(const point of region)assert(point.length===2&&point.every(n=>Number.isFinite(n)&&n>=0&&n<=2048),`${key}: bounded local edit polygon`);}
}

const expectedHealthy=['smug','frustrated','relieved','delighted','blink','blink-half',
 ...['down','nervous','panicked','amused','smug','frustrated','defeated','release'].flatMap(pose=>[pose+'-blink',pose+'-blink-half']),
 'whole-throw-6-blink-half','whole-throw-6-blink-closed'];
for(const frame of expectedHealthy)assert(reviewed.has('0/'+frame),`Healthy ${frame} needs its repaired eye and lash contours`);
for(let condition=1;condition<=3;condition++)for(const pose of ['rest','down','release'])for(const suffix of ['blink','blink-half'])assert(reviewed.has(`${condition}/${pose}-${suffix}`),`${condition}/${pose}-${suffix}: every injury condition keeps its own reviewed eye artwork`);
for(let condition=0;condition<=3;condition++){
 const data=condition?conditions[condition]:healthy;
 for(const [name,clip] of Object.entries(data.clips).filter(([name])=>name.startsWith('blink-'))){
  assert(reviewed.has(`${condition}/${clip.frames[1]}`),`${condition}/${name}: live closed-eye frame is covered by the current-file audit`);
 }
}

async function runtime(mode,base){
 const result=await build({entryPoints:['src/ui/MasterAnimations.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':JSON.stringify(base),'import.meta.env.MODE':JSON.stringify(mode)}});
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const production=await runtime('100next','/'),legacy=await runtime('cloudflare','/100game/');
for(let condition=0;condition<=3;condition++){
 const data=condition?conditions[condition]:healthy;
 for(const frame of Object.keys(data.bounds)){
  const url=production.masterFrameUrl('june',frame,condition);
  assert.equal(url.split('?')[1],'v=june-eyes-1','Every ordinary June frame receives the eye-repair browser cache revision');
  assert(url.startsWith('/'+assets+'engraved-v1/'));
  assert(!legacy.masterFrameUrl('june',frame,condition).includes('?'),'The stable game paths retain their existing cache behavior');
 }
 for(const id of ['finn','bianca','vince','edgar','roxie','otis','paloma','vera','tess','nadia','leon','dottie','malik','hugo','jasper'])assert(!production.masterFrameUrl(id,'rest',condition).includes('?'),`${id}: June repair does not change other character URLs`);
}
for(const id of ['june','finn','bianca']){
 assert.equal(production.masterFrameUrl(id,'special-01',0),`/${assets}engraved-v1/special-throw-v1/${id}/special-01.webp?v=2`,'Special Throw keeps its separate existing asset revision');
 assert.equal(legacy.masterFrameUrl(id,'special-01',0),`/100game/${assets}special-throw-v1/${id}/special-01.webp`);
}
console.log(`June eyes passed: ${reviewed.size} native/engraved pairs match the current reviewed file hashes, all healthy expression/blink and injury families, preserved brows/temple/alpha/protected pixels, and isolated production cache revision.`);
