import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/game/hostedCore.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createRoom, joinRoom, setConnected, sweepDisconnected, applyCommand, snapshotForSeat, DISCONNECT_GRACE_MS } =
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

const host = { name: 'Host', avatar: 0, mood: 'Normal' };
const guest = { name: 'Guest', avatar: 1, mood: 'Happy' };
const room = createRoom('100-123456789abc', host, 'host-secret', 1000);
assert.equal(room.hostSeat, 0);
applyCommand(room, 0, { type: 'cpu-count', count: 2 }, 1100);
assert.equal(room.seats.length, 3);
const joined = joinRoom(room, guest, null, 'guest-secret', 1200);
assert.equal(joined.seat, 1);
assert.equal(room.seats.length, 4);
assert.equal(room.seats[1].name, 'Guest');
assert.throws(() => applyCommand(room, 1, { type: 'start' }), /Only the host/);
applyCommand(room, 0, { type: 'cpu-count', count: 0 }, 1250);

applyCommand(room, 0, { type: 'start' }, 1300);
assert.equal(room.state.players.length, 2);
assert.throws(() => applyCommand(room, 0, { type: 'start', round: room.state.round }), /Finish the current round/);
const actor = room.state.current;
const cardId = room.state.players[actor].hand[0].id;
assert.throws(() => applyCommand(room, actor === 0 ? 1 : 0, { type: 'play', cardId }), /not your turn/);
applyCommand(room, actor, { type: 'play', cardId }, 1400);
const privateView = snapshotForSeat(room, 1);
assert.equal(privateView.state.players[1].hand.length, 2);
assert(!JSON.stringify(privateView).includes(room.state.players[0].hand[0].id));
assert(!JSON.stringify(privateView).includes(room.state.drawPile[0].id));

const round = room.state.round;
setConnected(room, 0, false, 2000);
const resumed = joinRoom(room, host, 'host-secret', 'unused-new-token', 2100);
assert.deepEqual(resumed, { seat: 0, token: 'host-secret' });
assert.equal(room.state.round, round);
assert.equal(room.state.players[0].kind, 'human');

setConnected(room, 0, false, 3000);
assert.equal(sweepDisconnected(room, 3000 + DISCONNECT_GRACE_MS - 1), false);
assert.equal(sweepDisconnected(room, 3000 + DISCONNECT_GRACE_MS), true);
assert.equal(room.seats[0].kind, 'cpu');
assert.equal(room.hostSeat, 1);
const reclaimed = joinRoom(room, host, 'host-secret', 'unused', 35000);
assert.equal(reclaimed.seat, 0);
assert.equal(room.seats[0].kind, 'human');
console.log('Hosted room checks passed: private cards, server turns, host refresh, CPU takeover, and seat recovery.');
