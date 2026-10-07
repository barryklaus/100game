import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';
const bundled = await build({entryPoints:['src/ui/MasterCharacters.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
const {masterNames,masterCharacter,masterImage,masterAnchors,masterHandRect} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
assert.equal(masterNames.length,9);
assert.equal(new Set(masterNames).size,9,'All seats have unique named artwork');
assert.equal(masterCharacter(9).id,masterCharacter(0).id);
assert.equal(masterCharacter(-1).name,'Vera','Migrated avatar numbers wrap safely');
const manifest = JSON.parse(readFileSync('public/assets/social-club/masters-v1/manifest.json','utf8'));
assert.equal(manifest.characters.length,8);
for(let i=0;i<8;i++) {
  const record = manifest.characters[i];
  assert.equal(masterCharacter(i).id,record.id);
  for(const portrait of [false,true])assert.ok(existsSync(`public${masterImage(i,portrait)}`),'Every character has runtime art and a picker portrait');
  assert.ok(record.padding.every(n=>n>=512),'All four sides retain the protected animation margin');
  for(const kind of ['release','catch']) {
    const [x,y,w,h]=masterCharacter(i)[kind];
    const [left,top,right,bottom]=record.alphaBounds.map(n=>n/4);
    assert.ok(x>=left&&x<=right&&y>=top&&y<=bottom,`${record.name} ${kind} lands inside its drawing`);
    assert.ok(w>0&&h>0);
  }
  assert.equal((masterAnchors(i).match(/aria-hidden="true"/g)||[]).length,2);
}
assert.equal(masterCharacter(8).id,'vera');
for(const portrait of [false,true])assert.ok(existsSync('public'+masterImage(8,portrait)),'Vera has full art and picker portrait');
let requested;
const rectangle={left:200,top:100,width:20,height:30};
const root={querySelector(selector){requested=selector;return {getBoundingClientRect:()=>rectangle};}};
assert.equal(masterHandRect(root,4,true),rectangle);
assert.ok(requested.includes('data-seat="4"')&&requested.includes('master-hand-catch'),'Replacement flights use the selected character catching hand');
assert.equal(masterHandRect(root,4,false),rectangle);
assert.ok(requested.includes('master-hand-release'),'Throws start at the retained card fan');
assert.equal(masterHandRect({querySelector:()=>null},4),undefined,'Non-master seats retain the existing handoff path');
console.log('Master cast checks passed: nine unique characters, safe avatar wrapping, protected padding, and independent throw/catch anchors.');
