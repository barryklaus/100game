import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/game/online.ts'], bundle: true, platform: 'node', format: 'esm', write: false, define: { 'import.meta.env.BASE_URL': '"/100game/"' } });
const { projectForSeat } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const card = (id, suit = 'sun') => ({ id, rank: '7', suit });
const full = {
  players: [
    { id: 0, name: 'Host', kind: 'human', avatar: 0, mood: 'Normal', hand: [card('host-secret-one'), card('host-secret-two')], exacts: 0, ratingDelta: 0 },
    { id: 1, name: 'Guest', kind: 'human', avatar: 1, mood: 'Happy', hand: [card('guest-one'), card('guest-two')], exacts: 0, ratingDelta: 0 },
  ],
  drawPile: [card('deck-secret-one'), card('deck-secret-two')], played: [card('public-card')], total: 0, direction: 1,
  current: 1, phase: 'playing', pendingSevens: [], rootTurn: 1, forced: false, round: 1,
  exactEvents: [], bust: null, log: [], event: 'none',
};
const guest = projectForSeat(full, 1);
assert.deepEqual(guest.players[1].hand.map(c => c.id), ['guest-one', 'guest-two']);
assert.equal(guest.players[0].hand.length, 2);
assert.equal(guest.drawPile.length, 2);
assert.equal(guest.played[0].id, 'public-card');
const payload = JSON.stringify(guest);
for (const secret of ['host-secret-one', 'host-secret-two', 'deck-secret-one', 'deck-secret-two']) assert(!payload.includes(secret));
guest.players[1].hand.pop();
assert.equal(full.players[1].hand.length, 2);
console.log('Online privacy checks passed: only the recipient hand is exposed.');
