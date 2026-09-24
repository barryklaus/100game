import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/ui/GyroHand.ts'], bundle: true, platform: 'browser', format: 'esm', define: { 'import.meta.env.BASE_URL': '"/"' }, write: false });
const { GyroHand } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const listeners = new Map();
const frames = [];
const values = new Map();
const card = { classList: { contains: () => false }, style: { setProperty: (key, value) => values.set(key, value) }, toggleAttribute: () => {} };
globalThis.window = globalThis;
globalThis.isSecureContext = true;
globalThis.matchMedia = () => ({ matches: true });
globalThis.screen = { orientation: { angle: 0 } };
globalThis.DeviceOrientationEvent = class { static requestPermission() { return Promise.resolve('granted'); } };
globalThis.addEventListener = (name, fn) => listeners.set(name, fn);
globalThis.removeEventListener = name => listeners.delete(name);
globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.document = {
  hidden: false,
  documentElement: { style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) } },
  querySelectorAll: () => [card],
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: name => listeners.delete(name),
};

const gyro = new GyroHand();
assert(gyro.available);
await gyro.enable();
assert.equal(gyro.status, 'waiting');
listeners.get('deviceorientation')({ beta: 20, gamma: 10 });
assert.equal(gyro.status, 'on');
listeners.get('deviceorientation')({ beta: 30, gamma: 20 });
frames.shift()();
assert(parseFloat(values.get('--gyro-x')) < 0, 'Pitch tilts the hand toward the player');
assert(parseFloat(values.get('--gyro-y')) > 0, 'Roll tilts the hand sideways');
assert(parseFloat(values.get('--foil-motion')) > 0, 'Moving the phone lights the foil');
gyro.recenter();
listeners.get('deviceorientation')({ beta: 30, gamma: 20 });
gyro.stop();
assert.equal(gyro.status, 'off');
assert.equal(listeners.has('deviceorientation'), false);

DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied');
await gyro.enable();
assert.equal(gyro.status, 'denied');
assert.equal(listeners.has('deviceorientation'), false);
console.log('Gyro hand checks passed: permission, calibration, tilt, foil motion, cleanup, and denial.');
