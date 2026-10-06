import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';

const load = async path => {
  const result = await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const { makeDeck } = await load('src/game/deckCore.ts');
const { midnightCardPath } = await load('src/game/midnightDeck.ts');
const { cardFaceFromUrl } = await load('src/game/cardFace.ts');
const deck = makeDeck();
assert.equal(deck.length, 52);
const urls = new Set();
for (const card of deck) {
  const path = midnightCardPath(card);
  urls.add(path);
  const original = midnightCardPath(card, true);
  assert(existsSync(`public/${path}`), `Missing playable artwork: ${path}`);
  assert(existsSync(`public/${original}`), `Missing full-bleed original: ${original}`);
  const face = cardFaceFromUrl(path);
  const fullFace = cardFaceFromUrl(original);
  assert.equal(face?.theme, 'midnight');
  assert.deepEqual(fullFace, face, 'Mobile PNG and desktop WebP must print identical labels and rules');
  assert.equal(face.suit, card.suit);
  if (['J', 'Q', 'K'].includes(card.rank)) {
    assert.equal(face.index, '10');
    assert.equal(face.special, false, 'Positive tens must never become the -10 action');
  }
  if (card.rank === '10') {
    assert.equal(face.index, '-10');
    assert.equal(face.special, true);
  }
  if (card.rank === '9') assert.equal(face.detail, 'Keep the total unchanged.');
  const png = readFileSync(`public/${original}`);
  assert.equal(png.readUInt32BE(16), 1064);
  assert.equal(png.readUInt32BE(20), 1486);
  const webp = readFileSync(`public/${path}`);
  assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
  assert.equal(webp.toString('ascii', 12, 16), 'VP8L', 'Game textures must use lossless WebP');
}
assert.equal(urls.size, 44, 'All four suits have 11 illustrations, including the shared J/Q/K +10 face');
const manifest = JSON.parse(readFileSync('public/assets/cards/midnight-v1/manifest.json', 'utf8'));
assert.equal(manifest.artworks.length, 44);
assert.equal(cardFaceFromUrl('/assets/cards/back.webp'), null);
assert.equal(cardFaceFromUrl('/assets/cards/water-9.webp')?.theme, undefined, 'Stable art keeps its existing print style');
const { createCardMesh, disposeCardMesh } = await load('src/render/CardMesh.ts');
const savedDocument = globalThis.document, savedPerformance = globalThis.performance;
let frameStamp = 0, reduceMotion = false;
globalThis.document = {documentElement:{classList:{contains:()=>reduceMotion}}};
globalThis.performance = {now:()=>frameStamp};
const testCamera = {matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}};
for (const suit of ['fire', 'water', 'leaf', 'sun']) for (const rank of ['4', '7', '10']) {
  const face = cardFaceFromUrl(midnightCardPath({suit, rank}));
  const texture = {image:{width:1064,height:1486},isTexture:true,userData:{cardFace:face}};
  const mesh = createCardMesh(texture, texture);
  const foil = mesh.getObjectByName('card-artwork-foil');
  assert(foil, 'Midnight must use artwork foil instead of replacing the preview border');
  assert.equal(mesh.getObjectByName('card-border-foil'), undefined);
  assert.equal(foil.material.transparent, true, 'Still artwork remains visible through the zero-alpha laminate');
  assert.equal(foil.material.depthWrite, false, 'Laminate must not occlude the print');
  assert.equal(foil.material.uniforms.uMotion.value, 0, 'Stationary cards have no shine');
  foil.geometry.computeBoundingBox();
  const bounds = foil.geometry.boundingBox;
  const {cardWidth:w,cardHeight:h} = mesh.userData;
  const inset = w * 54 / 1064;
  assert(bounds.min.x >= -w/2+inset-1e-6 && bounds.max.x <= w/2-inset+1e-6, 'Shine must stay off both borders');
  assert(bounds.max.y <= h/2-inset+1e-6, 'Shine must stay off the top border');
  assert(Math.abs(bounds.min.y - (-h/2+inset+(face.special?h*.185:0))) < 1e-6, 'Special instructions and bottom border are outside the hologram');
  mesh.updateMatrixWorld(true);
  foil.onBeforeRender(null,null,testCamera,null,foil.material,null);
  assert.equal(foil.material.uniforms.uMotion.value,0);
  mesh.rotation.y=.25; mesh.updateMatrixWorld(true);frameStamp+=16;
  foil.onBeforeRender(null,null,testCamera,null,foil.material,null);
  assert(foil.material.uniforms.uMotion.value>0,'Tilting activates the artwork reflection');
  frameStamp+=1000;
  foil.onBeforeRender(null,null,testCamera,null,foil.material,null);
  assert.equal(foil.material.uniforms.uMotion.value,0,'A held tilted card must settle to clean artwork');
  reduceMotion=true;mesh.rotation.y=.5;mesh.updateMatrixWorld(true);frameStamp+=16;
  foil.onBeforeRender(null,null,testCamera,null,foil.material,null);
  assert.equal(foil.material.uniforms.uMotion.value,0,'Reduced motion suppresses the reflection');
  reduceMotion=false;
  disposeCardMesh(mesh);
}
globalThis.document=savedDocument;globalThis.performance=savedPerformance;
console.log('Midnight deck passed: 52 cards, 44 lossless illustrations, label/rule parity, and artwork-only holography with protected frames and instructions.');
