import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const origin = 'https://100next.pages.dev';
const room = `100-${randomBytes(6).toString('hex')}`;
const profile = name => ({ name, avatar: 0, mood: 'Normal' });
async function post(action, body) {
  const response = await fetch(`${origin}/api/rooms/${room}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, `Room ${action} failed (${response.status})`);
  return response.json();
}
function connect(token) {
  const socket = new WebSocket(`${origin.replace('https:', 'wss:')}/api/rooms/${room}/connect`);
  const messages = [];
  const listeners = new Set();
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'hello', token })));
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    messages.push(message);
    for (const listener of listeners) listener(message);
  });
  return {
    socket, messages,
    send: command => socket.send(JSON.stringify(command)),
    wait(predicate) {
      const existing = messages.findLast(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('Timed out waiting for the live room.')); }, 15000);
        const listener = message => { if (predicate(message)) { clearTimeout(timer); listeners.delete(listener); resolve(message); } };
        listeners.add(listener);
      });
    },
  };
}

const expected = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
let release;
// The production alias may take a moment to follow a successful Pages upload.
for (let attempt = 0; attempt < 12; attempt++) {
  release = await (await fetch(`${origin}/release.json?commit=${expected}&check=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })).json();
  if (release.commit === expected) break;
  await new Promise(resolve => setTimeout(resolve, 2000));
}
assert.equal(release.version, '100next');
assert.equal(release.commit, expected, 'The live game must match the published commit');
const hostSeat = await post('create', { profile: profile('Release check host') });
const guestSeat = await post('join', { profile: profile('Release check guest') });
const host = connect(hostSeat.token);
const guest = connect(guestSeat.token);
try {
  await host.wait(m => m.type === 'snapshot' && m.seats.length === 2);
  await guest.wait(m => m.type === 'snapshot' && m.seat === guestSeat.seat);
  host.send({ type: 'cpu-count', count: 1 });
  await host.wait(m => m.type === 'snapshot' && m.cpuCount === 1);
  host.send({ type: 'start' });
  const h = await host.wait(m => m.type === 'snapshot' && m.state);
  const g = await guest.wait(m => m.type === 'snapshot' && m.state);
  assert.equal(h.state.players.length, 3);
  assert.equal(h.state.players[hostSeat.seat].hand.length, 2);
  assert.equal(g.state.players[guestSeat.seat].hand.length, 2);
  const hostCard = h.state.players[hostSeat.seat].hand[0].id;
  assert(!JSON.stringify(g).includes(hostCard), 'Other hands must stay private');
  const resumed = await post('join', { profile: profile('Release check host'), token: hostSeat.token });
  assert.equal(resumed.seat, hostSeat.seat);
  assert.equal(resumed.token, hostSeat.token);
  const isolated = await fetch(`https://100game.100game.workers.dev/api/rooms/${room}/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: profile('Isolation check') }), signal: AbortSignal.timeout(15000),
  });
  assert.equal(isolated.status, 404, 'The stable game must not contain the 100next room');
  console.log(`Verified live 100next (${release.commit.slice(0, 7)}): two human WebSockets, CPU seat, private hands, seat recovery, and separate stable storage.`);
} finally {
  host.socket.close(); guest.socket.close();
}
