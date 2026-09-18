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

const lifecycle = await build({
  entryPoints: ['src/game/online.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  define: { 'import.meta.env.BASE_URL': '"/100game/"' },
  plugins: [{ name: 'fake-peer', setup(builder) {
    builder.onResolve({ filter: /^peerjs$/ }, () => ({ path: 'fake-peer', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      export default class FakePeer {
        constructor() { this.handlers = {}; this.destroyed = false; globalThis.__fakePeers.push(this); }
        on(name, fn) { this.handlers[name] = fn; }
        emit(name, value) { this.handlers[name]?.(value); }
        destroy() { this.destroyed = true; }
      }
    `, loader: 'js' }));
  } }],
});
const { OnlineRoom } = await import(`data:text/javascript;base64,${Buffer.from(lifecycle.outputFiles[0].text).toString('base64')}`);
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const timers = new Map();
globalThis.__fakePeers = [];
globalThis.setTimeout = (fn, delay) => { const id = timers.size + 1; timers.set(id, { fn, delay }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
try {
  const profile = { name: 'Guest', avatar: 2, mood: 'Normal' };
  let updates = 0;
  const guestRoom = new OnlineRoom('guest', '100-123456789abc', profile, () => updates++);
  assert.equal(guestRoom.status, 'connecting');
  const timeout = [...timers.values()].find(timer => timer.delay === 20_000);
  assert(timeout, 'a stalled connection should have a deadline');
  timeout.fn();
  assert.equal(guestRoom.status, 'disconnected');
  assert.match(guestRoom.error, /direct browser connections can fail/i);
  assert.equal(globalThis.__fakePeers[0].destroyed, true);
  assert.equal(updates, 1);

  const hostRoom = new OnlineRoom('host', '100-abcdefghijkl', profile, () => updates++);
  const hostPeer = globalThis.__fakePeers[1];
  hostPeer.emit('open');
  assert.equal(hostRoom.status, 'lobby');
  assert.equal(timers.size, 0, 'a ready room must clear its connection deadline');
  hostRoom.close();

  const rejectedRoom = new OnlineRoom('guest', '100-123456789abc', profile, () => updates++);
  rejectedRoom.receiveHost({ type: 'error', message: 'A round is already underway.', fatal: true });
  assert.equal(rejectedRoom.status, 'disconnected');
  assert.equal(rejectedRoom.error, 'A round is already underway.');

  const playingGuest = new OnlineRoom('guest', '100-123456789abc', profile, () => updates++);
  playingGuest.receiveHost({ type: 'snapshot', seat: 1, seats: [], state: structuredClone(full), roomId: '100-123456789abc', cpuCount: 0 });
  playingGuest.hostConnection = { open: true, send() {} };
  playingGuest.play('guest-one');
  const moveTimeout = [...timers.values()].find(timer => timer.delay === 10_000);
  assert(moveTimeout, 'an unconfirmed move should have a deadline');
  moveTimeout.fn();
  assert.match(playingGuest.error, /not confirmed/i);
  playingGuest.receiveHost({ type: 'error', message: 'That move was rejected.' });
  assert.equal(playingGuest.status, 'playing');
  assert.equal(playingGuest.error, 'That move was rejected.');
  playingGuest.close();
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  delete globalThis.__fakePeers;
}
console.log('Online connection checks passed: stalled and rejected rooms end with clear errors.');
