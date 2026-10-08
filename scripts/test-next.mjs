import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['worker/next-pages.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { default: pages } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
let assets = 0;
let selectedRoom;
let forwardedRequest;
const env = {
  ACCOUNTS:{getByName:id=>{assert.equal(id,'accounts-v1');return {fetch:async()=>new Response('account')};}},
  ASSETS: { fetch: async () => { assets++; return new Response('asset'); } },
  ROOMS: { getByName: id => { selectedRoom = id; return { fetch: async request => { forwardedRequest = request; return new Response('room'); } }; } },
};
const request = new Request('https://100next.pages.dev/api/rooms/100-123456789abc/connect', { headers: { Upgrade: 'websocket' } });
assert.equal(await (await pages.fetch(request, env)).text(), 'room');
assert.equal(forwardedRequest, request, 'The WebSocket upgrade request must reach the room unchanged');
assert.equal(selectedRoom, '100-123456789abc');
assert.equal(assets, 0);
assert.equal((await pages.fetch(new Request('https://100next.pages.dev/api/rooms/invalid/create'), env)).status, 404);
assert.equal(assets, 0, 'Invalid API URLs must not return the game HTML');
assert.equal(await (await pages.fetch(new Request('https://100next.pages.dev/assets/card.png'), env)).text(), 'asset');
assert.equal(await(await pages.fetch(new Request('https://100next.pages.dev/api/account/me'),env)).text(),'account');
assert.notEqual(await(await pages.fetch(new Request('https://100next.pages.dev/api/account/internal/record'),env)).text(),'account');
const next = JSON.parse(readFileSync('wrangler.next-rooms.jsonc', 'utf8'));
const stable = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const frontend = JSON.parse(readFileSync('hosting/next/wrangler.jsonc', 'utf8'));
assert.notEqual(next.name, stable.name, '100next must have a separate Durable Object script and namespace');
assert.equal(frontend.durable_objects.bindings[0].script_name, next.name);
assert.equal(next.workers_dev, false);
console.log('100next checks passed: separate storage, same-origin WebSockets, static assets, invalid API routes.');
