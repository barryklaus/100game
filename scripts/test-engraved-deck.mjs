import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {build} from 'esbuild';
const load=async(path,mode='100next')=>{
  const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.MODE':JSON.stringify(mode),'import.meta.env.BASE_URL':'"/"'}});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const {makeDeck}=await load('src/game/deckCore.ts');
const {engravedCardPath,engravedFoilMaskPath}=await load('src/game/engravedDeck.ts');
const {cardImage,cardImageLossless}=await load('src/game/deck.ts');
const {cardFaceFromUrl}=await load('src/game/cardFace.ts');
const manifest=JSON.parse(readFileSync('public/assets/cards/engraved-v1/manifest.json','utf8'));
const deck=makeDeck(),paths=new Set(),labels={'7':'CHOOSE','8':'REVERSE','9':'ZERO','10':'DEDUCT'};
assert.equal(deck.length,52);assert.equal(manifest.artworks.length,44);
for(const card of deck){
  const path=engravedCardPath(card);paths.add(path);
  assert.equal(cardImage(card),'/'+path);assert.equal(cardImageLossless(card),cardImage(card));
  const face=cardFaceFromUrl(path);
  assert.equal(face.theme,'engraved');assert.equal(face.suit,card.suit);
  assert.equal(face.special,Boolean(labels[card.rank]));
  assert.equal(face.index,labels[card.rank]??(card.rank==='A'?'1':['J','Q','K'].includes(card.rank)?'10':card.rank));
  const bytes=readFileSync('public/'+path);
  assert.equal(bytes.toString('ascii',12,16),'VP8L','No lossy conversion of the engraved artwork');
  const bits=bytes.readUInt32LE(21);
  assert.equal((bits&0x3fff)+1,1064);assert.equal(((bits>>>14)&0x3fff)+1,1486,'Pile, hand and flight silhouettes use one aspect ratio');
  const mask='public/'+engravedFoilMaskPath(card);
  assert.equal(existsSync(mask),face.special,'Only special cards load a suit/glitter mask');
  if(face.special){
    const png=readFileSync(mask);assert.equal(png.readUInt32BE(16),532);assert.equal(png.readUInt32BE(20),743);
  }
}
assert.equal(paths.size,44);
assert.equal(cardFaceFromUrl('/assets/cards/engraved-v1/sun-9.webp').detail,'Keep the total unchanged.');
assert.equal(cardFaceFromUrl('/assets/cards/engraved-v1/sun-10.webp').detail,'Subtract 10 from the total.');
assert.equal(cardFaceFromUrl('/assets/cards/back.webp'),null);
const stable=await load('src/game/deck.ts','cloudflare');
assert.equal(stable.cardImage(deck[0]),`/assets/cards/${deck[0].suit}-${deck[0].rank.toLowerCase()}.webp`);

// Engraved textures may only mask the outside silhouette; no old print overlay.
const {cardFaceTexture}=await load('src/render/CardFaceTexture.ts');
const calls=[],ctx={beginPath(){},moveTo(){},arcTo(){},closePath(){},clip(){calls.push('clip');},drawImage(...args){calls.push(args);}};
const previousDocument=globalThis.document;
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const source={image:{width:1064,height:1486}},face=cardFaceFromUrl('/assets/cards/engraved-v1/fire-10.webp');
const texture=await cardFaceTexture(source,face);
assert.equal(texture.image.width,1064);assert.equal(texture.image.height,1486);
assert.deepEqual(calls,['clip',[source.image,0,0,1064,1486]],'Complete approved artwork is printed once, with no generated borders, numbers or rule bands');
assert.equal(texture.userData.cardFace,face);texture.dispose();

const {createCardMesh,disposeCardMesh}=await load('src/render/CardMesh.ts');
let stamp=0,reduced=false;
globalThis.document={documentElement:{classList:{contains:()=>reduced}}};
const savedPerformance=globalThis.performance;globalThis.performance={now:()=>stamp};
const camera={matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}};
const back={image:{width:1064,height:1478},isTexture:true};
const deckMesh=createCardMesh(back,back);assert.equal(deckMesh.children.some(child=>child.userData.cardFoil),false);disposeCardMesh(deckMesh);
for(const suit of ['fire','water','leaf','sun'])for(const rank of ['4','K','7','8','9','10']){
  const info=cardFaceFromUrl('/'+engravedCardPath({suit,rank}));
  const front={image:{width:1064,height:1486},isTexture:true,userData:{cardFace:info}};
  const mesh=createCardMesh(front,back),foil=mesh.getObjectByName('card-suit-foil');
  for(const name of ['card-front','card-back'])mesh.getObjectByName(name).geometry.computeBoundingBox();
  assert.deepEqual(mesh.getObjectByName('card-front').geometry.boundingBox,mesh.getObjectByName('card-back').geometry.boundingBox,'The unchanged back cannot protrude beyond the new face silhouette');
  assert.equal(Boolean(foil),info.special,'Only engraved specials allocate a foil mesh');
  assert.equal(mesh.getObjectByName('card-border-foil'),undefined);
  if(foil){
    assert.equal(foil.material.uniforms.uPrint.value,front,'Foil reuses the print rather than allocating another full-size map');
    assert.equal(foil.material.uniforms.uRainbow.value,0,'Reflections use the suit palette');
    assert.equal(foil.material.depthWrite,false);
    mesh.updateMatrixWorld(true);foil.onBeforeRender(null,null,camera,null,foil.material);
    assert.equal(foil.material.uniforms.uMotion.value,0);
    mesh.rotation.y=.25;mesh.updateMatrixWorld(true);stamp+=16;foil.onBeforeRender(null,null,camera,null,foil.material);
    assert(foil.material.uniforms.uMotion.value>0,'Tilt activates shine');
    stamp+=1000;foil.onBeforeRender(null,null,camera,null,foil.material);
    assert.equal(foil.material.uniforms.uMotion.value,0,'Holding still extinguishes shine');
    reduced=true;mesh.rotation.y=.5;mesh.updateMatrixWorld(true);stamp+=16;foil.onBeforeRender(null,null,camera,null,foil.material);
    assert.equal(foil.material.uniforms.uMotion.value,0);reduced=false;
  }
  disposeCardMesh(mesh);
}
globalThis.document=previousDocument;globalThis.performance=savedPerformance;
console.log('Engraved deck passed: 52 cards, 44 lossless faces, DEDUCT and unchanged rules, one silhouette, no old overlays/parallax, suit-only special foil, stationary/reduced-motion cleanup, stable build preserved.');
