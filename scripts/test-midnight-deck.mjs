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
console.log('Midnight deck passed: 52 playable cards, 44 complete lossless illustrations, mobile/desktop parity, correct +10/-10 and Zero rules.');
