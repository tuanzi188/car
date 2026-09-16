const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const newline = String.fromCharCode(10);
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function fn(name) {
  return section('      function ' + name + '(', newline + '      }') + newline + '      }';
}
function fixture() {
  const calls = {}, steps = [];
  let clock = 0;
  const count = name => () => { calls[name] = (calls[name] || 0) + 1; };
  const c = vm.createContext({
    window: { devicePixelRatio: 2 }, preferences: { quality: 'auto' },
    performance: { now: () => clock }, requestAnimationFrame: count('raf'),
    isRacing: true, isPaused: false, isMobileDevice: false, countdownTime: 0,
    playerCar: { speed: 0, mesh: { rotation: { y: 0 } } },
    inputs: { throttle: 1, brake: 1, steer: 1, nitro: true, handbrake: true, drift: true },
    camera: { position: { set() {} }, lookAt() {} }, scene: {}, engineExtra: {},
    renderer: { shadowMap: {}, render: count('draw'), setPixelRatio: count('dpr') },
    sunLight: { shadow: { mapSize: {}, map: { dispose: count('dispose') } } },
    postfx: { lowFpsMs: 0, degraded: false, syncResolution() {}, degrade() { this.degraded = true; } },
    POSTFX: { enabled: false, fpsDropThreshold: 30, fpsDropWindowMs: 2000 },
    AudioFX: { setQuality() {}, blip: count('blip'), updateListener() {}, updateEngine() {} },
    pollControllerInputs: count('poll'),
    updateCarModelDetails: count('modelDetails'),
    updateCarPhysics(car, dt) { steps.push(['player', dt]); clock += 0.1; },
    updateAICars(dt) { steps.push(['ai', dt]); clock += 0.1; },
  });
  for (const name of ['updateStartLights', 'updateCountdownDisplay', 'updateObstacleKnockdown',
    'updateCamera', 'updateParticles', 'updateDashboardHud', 'updateScoreHud', 'updateRadar',
    'updateMinimap', 'updateGroundShadows', 'updateClouds', 'updateSpeedFx']) c[name] = count(name);
  vm.runInContext(section('      let lastFrameTime = 0;', '      function togglePause(') +
    section('      const PerfMon = {', '      /* 微信内置浏览器检测') + fn('renderFrame'), c);
  c.read = code => vm.runInContext(code, c);
  c.frame = now => { clock = now; c.gameLoop(now); };
  c.setClock = now => { clock = now; };
  return { c, calls, steps };
}
test('clock reset and paused frames discard accumulated simulation and quality history', () => {
  const { c, steps } = fixture();
  c.frame(5);
  c.read('fpsAccumMs = 400; resolutionLowMs = 900; shadowLowMs = 1800;');
  c.resetSimulationClock(5000);
  for (const key of ['simulationAccumulator', 'fpsAccumMs', 'resolutionLowMs', 'shadowLowMs']) assert.equal(c.read(key), 0);
  c.frame(5005); assert.equal(steps.length, 0);
  c.isPaused = true; c.frame(10000);
  c.isPaused = false; c.frame(10005); assert.equal(steps.length, 0);
});
test('lobby renders near 30fps at different display rates and retains rotation speed', () => {
  for (const fps of [30, 60, 120, 144]) {
    const { c, calls, steps } = fixture(); c.isRacing = false;
    for (let i = 1; i <= fps; i++) c.frame(i * 1000 / fps);
    assert.ok(calls.draw >= 30 && calls.draw <= 31, fps + 'Hz: ' + calls.draw);
    assert.ok(Math.abs(c.playerCar.mesh.rotation.y - 0.48) < 1e-8);
    assert.equal(steps.length, 0); assert.equal(calls.poll, undefined);
  }
});
test('performance samples use elapsed timestamps, expire through gaps, and wrap the ring', () => {
  const { c } = fixture();
  for (let i = 1; i <= 100; i++) c.recordFrame(100, i * 100);
  c.setClock(10000);
  assert.equal(c.window.__perf.sample(2).frames, 20);
  assert.equal(c.window.__perf.sample(2).avgFps, 10);
  c.setClock(15000); assert.equal(c.window.__perf.sample(2).frames, 0);
  c.window.__perf.reset();
  for (let i = 1; i <= 700; i++) c.recordFrame(10, 15000 + i * 10);
  c.setClock(22000);
  assert.equal(c.window.__perf.sample().frames, 600);
  assert.equal(c.window.__perf.sample(2).frames, 200);
});
test('visible performance HUD throttles sampling to 250ms while physics timing updates each frame', () => {
  const { c, steps } = fixture();
  c.read('PerfMon.visible = true; PerfMon.el = { textContent: null };');
  const sample = c.window.__perf.sample;
  let samples = 0;
  c.window.__perf.sample = sec => { samples++; return sample(sec); };
  const frame = now => {
    const before = steps.length;
    c.frame(now);
    const expectedMs = (steps.length - before) * 0.1;
    assert.ok(Math.abs(c.read('PerfMon.physicsMs') - expectedMs) < 1e-8);
  };
  frame(1000 / 60);
  assert.ok(c.read('PerfMon.physicsMs') > 0);
  assert.equal(samples, 0);
  assert.equal(c.read('PerfMon.el.textContent'), null);
  assert.equal(c.read('PerfMon.lastHud'), 0);
  frame(250);
  assert.equal(samples, 1);
  assert.equal(c.read('PerfMon.lastHud'), 250);
  const text = c.read('PerfMon.el.textContent');
  assert.ok(text.includes('phys ' + c.read('PerfMon.physicsMs').toFixed(1) + 'ms'));
  const displayedPhysicsMs = c.read('PerfMon.physicsMs');
  frame(250 + 1000 / 60);
  assert.ok(c.read('PerfMon.physicsMs') < displayedPhysicsMs);
  frame(499);
  assert.equal(samples, 1);
  assert.equal(c.read('PerfMon.lastHud'), 250);
  assert.equal(c.read('PerfMon.el.textContent'), text);
  frame(500);
  assert.equal(samples, 2);
  assert.equal(c.read('PerfMon.lastHud'), 500);
  assert.ok(c.read('PerfMon.el.textContent').includes('phys ' + c.read('PerfMon.physicsMs').toFixed(1) + 'ms'));
});
test('adaptive DPR requires sustained load and shadows degrade only after time at minimum', () => {
  const { c, calls } = fixture();
  const feed = n => { for (let i = 0; i < n; i++) c.adaptResolution(25); };
  feed(20); assert.equal(c.read('renderScale'), 1);
  feed(20); assert.equal(c.read('renderScale'), 0.85);
  assert.equal(c.read('shadowMapRes'), 512);
  feed(60); assert.equal(c.read('shadowMapRes'), 512);
  feed(20); assert.equal(c.read('shadowMapRes'), 256);
  assert.equal(calls.dispose, 1);
  for (let i = 0; i < 100; i++) c.adaptResolution(10);
  assert.equal(c.read('renderScale'), 0.85);
  for (let i = 0; i < 200; i++) c.adaptResolution(10);
  assert.equal(c.read('renderScale'), 0.95);
});
test('manual quality fixes DPR and disables automatic degradation', () => {
  const { c } = fixture();
  for (const [quality, expected] of [['performance', 0.85], ['high', 2]]) {
    c.preferences.quality = quality; assert.equal(c.computePixelRatio(), expected);
    for (let i = 0; i < 200; i++) c.adaptResolution(100);
    assert.equal(c.read('renderScale'), 1);
    assert.equal(c.read('shadowMapRes'), 512);
    assert.equal(c.postfx.degraded, false);
  }
});
test('fixed steps are display-rate independent and frame work stays single-pass', () => {
  for (const fps of [30, 60, 120, 144]) {
    const { c, calls, steps } = fixture();
    for (let i = 1; i <= fps; i++) c.frame(i * 1000 / fps);
    assert.equal(steps.length, 240);
    steps.forEach(([name, dt], i) => {
      assert.equal(name, i % 2 ? 'ai' : 'player');
      assert.equal(dt, 1 / 120);
    });
    for (const name of ['poll', 'draw', 'modelDetails', 'updateCamera', 'updateParticles']) assert.equal(calls[name], fps);
  }
});
test('long frames are bounded and negative time does not advance physics', () => {
  const { c, steps } = fixture();
  c.frame(5000);
  assert.equal(steps.length, 24);
  c.frame(4999);
  assert.equal(steps.length, 24);
  assert.ok(c.read('simulationAccumulator') < 1 / 120);
});
test('countdown freezes every input and both cars including the GO frame', () => {
  const { c, calls, steps } = fixture();
  c.countdownTime = 0.01; c.frame(100);
  assert.equal(c.countdownTime, 0);
  assert.equal(steps.length, 0);
  assert.ok(Object.values(c.inputs).every(value => !value));
  assert.equal(calls.poll, 1); assert.equal(calls.draw, 1); assert.equal(calls.blip, 1);
  c.frame(100 + 1000 / 120); assert.equal(steps.length, 2);
});
test('race termination stops immediately after either simulation participant', () => {
  for (const stopInPlayer of [true, false]) {
    const { c, steps, calls } = fixture();
    const name = stopInPlayer ? 'updateCarPhysics' : 'updateAICars';
    const original = c[name];
    c[name] = (...args) => { original(...args); c.isRacing = false; };
    c.frame(100);
    assert.equal(steps.length, stopInPlayer ? 1 : 2);
    assert.equal(c.read('simulationAccumulator'), 0);
    assert.equal(calls.draw, 1);
  }
});
