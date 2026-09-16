const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function fn(name) {
  const start = source.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}
function element() {
  const listeners = {};
  return {
    classList: { values: new Set(), add(x) { this.values.add(x); }, remove(x) { this.values.delete(x); }, toggle(x, force) { if (force === undefined ? !this.values.has(x) : force) this.values.add(x); else this.values.delete(x); } },
    style: {}, offsetWidth: 20,
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    dispatch(type, event = {}) { for (const handler of listeners[type] || []) handler({ button: 0, preventDefault() {}, ...event }); },
    setPointerCapture(id) { this.capture = id; }, hasPointerCapture(id) { return this.capture === id; }, releasePointerCapture(id) { if (this.capture === id) this.capture = null; },
    getBoundingClientRect() { return { left: 0, width: 100 }; }, focus() { this.focused = true; }, querySelector() { return { innerText: '' }; },
  };
}
function make(extra = {}) {
  const els = {};
  const document = { hidden: false, hasFocus: () => true, querySelectorAll: () => [], getElementById: id => (els[id] ||= element()) };
  const window = { innerWidth: 1000, innerHeight: 600, matchMedia: () => ({ matches: false }) };
  const context = vm.createContext({ document, window, navigator: { getGamepads: () => [] }, performance: { now: () => 1 }, console, Math, Array, Object, DRIFT_SIM_MIN: .55, countdownTime: 0, isRacing: true, isPaused: false, ...extra });
  const declarations = `
    var inputs = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, drift: false };
    var keys = {};
    var touchState = { brake: false, nitro: false, steerValue: 0 };
    var padState = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, active: false };
    var touchReleases = []; var gamepadPresent = false; var resetSteerPadVisual = null; var isTouchUI = false;
    var DRIFT_SIM_MIN = 0.55; var isRacing = true; var isPaused = false; var countdownTime = 0;
    ${['clearPadState', 'refreshGamepads', 'pollControllerInputs', 'resetAllInputs', 'bindSteerPad', 'bindTouchControl'].map(fn).join('\n')}`;
  vm.runInContext(declarations, context);
  const state = vm.runInContext('({ inputs, keys, touchState, padState })', context);
  return { context, els, inputs: state.inputs, keys: state.keys, touch: state.touchState, pad: state.padState };
}

test('pause resets controls and refuses hidden or portrait resume', () => {
  const h = make();
  h.context.dom = { 'pause-overlay': element(), 'resume-btn': element(), 'pause-btn': element() };
  let resets = 0;
  h.context.AudioFX = { silence() {} };
  h.context.resetSimulationClock = () => resets++;
  vm.runInContext(fn('isPortraitBlocked') + fn('togglePause'), h.context);
  h.inputs.throttle = 1;
  h.context.togglePause();
  assert.equal(h.context.isPaused, true);
  assert.equal(h.inputs.throttle, 0);
  h.context.document.hidden = true;
  h.context.togglePause();
  assert.equal(h.context.isPaused, true);
  h.context.document.hidden = false;
  h.context.isPortraitBlocked = () => true;
  h.context.togglePause();
  assert.equal(h.context.isPaused, true);
  h.context.isPortraitBlocked = () => false;
  h.context.togglePause();
  assert.equal(h.context.isPaused, false);
  assert.equal(resets, 1);
});

test('resetAllInputs clears keyboard, touch, pad and aggregate state', () => {
  const h = make();
  Object.assign(h.inputs, { throttle: 1, brake: 1, steer: 1, handbrake: true, nitro: true, drift: true });
  Object.assign(h.pad, { throttle: 1, brake: 1, steer: 1, handbrake: true, nitro: true, active: true });
  Object.assign(h.touch, { brake: true, nitro: true, steerValue: .8 }); h.keys.KeyW = true;
  h.context.resetAllInputs();
  assert.deepEqual({ ...h.inputs }, { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, drift: false });
  assert.deepEqual({ ...h.pad }, { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, active: false });
  assert.deepEqual({ ...h.touch }, { brake: false, nitro: false, steerValue: 0 }); assert.equal(h.keys.KeyW, false);
});
test('refreshGamepads detects slot 1 and disconnect clears state', () => {
  const h = make(); const pad = { connected: true, axes: [.4], buttons: [] }; h.context.navigator.getGamepads = () => [null, pad];
  h.context.refreshGamepads(); h.context.pollControllerInputs(); assert.equal(h.pad.active, true); assert.equal(h.pad.steer, .4);
  h.context.navigator.getGamepads = () => [null, { connected: false }]; h.context.refreshGamepads(); assert.equal(h.pad.active, false); assert.equal(h.pad.throttle, 0);
});
test('pollControllerInputs drops throttle after connected pad disappears', () => {
  const h = make(); const pad = { connected: true, axes: [0], buttons: [] }; pad.buttons[7] = { value: .8 }; let pads = [pad]; h.context.navigator.getGamepads = () => pads;
  h.context.refreshGamepads(); h.context.pollControllerInputs(); assert.equal(h.inputs.throttle, .8); pads = [{ connected: false }]; h.context.pollControllerInputs(); assert.equal(h.inputs.throttle, 0); assert.equal(h.pad.active, false);
});
test('steer pad cancel, lost capture and unrelated pointer guard work', () => {
  const h = make({ TOUCH_STEER_DEAD_ZONE: 0, TOUCH_STEER_GAIN: 1, Haptics: { tap() {} } }); h.els.pad = element(); h.els.knob = element(); h.context.dom = { 'steer-pad': h.els.pad, 'steer-knob': h.els.knob }; h.context.bindSteerPad();
  h.els.pad.dispatch('pointerdown', { pointerId: 1, clientX: 90 }); const value = h.touch.steerValue; h.els.pad.dispatch('pointermove', { pointerId: 2, clientX: 0 }); assert.equal(h.touch.steerValue, value);
  h.els.pad.dispatch('pointercancel', { pointerId: 1 }); assert.equal(h.touch.steerValue, 0); h.els.pad.dispatch('pointerdown', { pointerId: 3, clientX: 90 }); h.els.pad.dispatch('lostpointercapture', { pointerId: 3 }); assert.equal(h.touch.steerValue, 0); h.context.resetAllInputs(); assert.equal(h.touch.steerValue, 0);
});
test('pedal ignores unrelated release and reset releases active pointer', () => {
  const h = make({ isRacing: true, isPaused: false }); h.els.pedal = element(); h.context.dom = { pedal: h.els.pedal }; let releases = 0; h.context.bindTouchControl('pedal', () => {}, () => releases++);
  h.els.pedal.dispatch('pointerdown', { pointerId: 1, button: 0 }); h.els.pedal.dispatch('pointerup', { pointerId: 2 }); assert.equal(releases, 0); h.els.pedal.dispatch('pointercancel', { pointerId: 1 }); assert.equal(releases, 1); h.els.pedal.dispatch('pointerdown', { pointerId: 3, button: 0 }); h.context.resetAllInputs(); assert.equal(releases, 2);
});
