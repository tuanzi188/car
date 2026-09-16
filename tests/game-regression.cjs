const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const newline = String.fromCharCode(10);

class Attribute {
  constructor(array, itemSize) { Object.assign(this, { array, itemSize }); }
}
class InstancedAttribute extends Attribute {}
class Geometry {
  constructor() { this.attributes = {}; }
  setAttribute(name, attr) { this.attributes[name] = attr; }
  rotateX() {}
}
class Mesh {
  constructor(geometry, material) { Object.assign(this, { geometry, material, instanceMatrix: {} }); }
  setMatrixAt() {}
}
const three = { BufferGeometry: Geometry, PlaneGeometry: Geometry, BufferAttribute: Attribute,
  InstancedBufferAttribute: InstancedAttribute, ShaderMaterial: class { constructor(v) { Object.assign(this, v); } },
  Points: Mesh, InstancedMesh: Mesh };

test('minimap road, obstacle, AI dot and distance label share one rotation', () => {
  for (const heading of [0, Math.PI / 2, -0.8]) {
    const arcs = [], lines = [], labels = [], stack = [];
    let transform = { x: 0, y: 0, h: 0 };
    const screen = (x, y) => ({
      x: transform.x + x * Math.cos(transform.h) - y * Math.sin(transform.h),
      y: transform.y + x * Math.sin(transform.h) + y * Math.cos(transform.h),
    });
    const canvas = {
      save() { stack.push({ ...transform }); }, restore() { transform = stack.pop(); },
      translate(x, y) { transform.x += x; transform.y += y; }, rotate(h) { transform.h += h; },
      arc(x, y, radius) { arcs.push({ ...screen(x, y), radius, color: this.fillStyle }); },
      moveTo(x, y) { lines.push(screen(x, y)); }, lineTo(x, y) { lines.push(screen(x, y)); },
      fillText(text, x, y) { labels.push({ ...screen(x, y), text }); },
      clearRect() {}, beginPath() {}, closePath() {}, stroke() {}, fill() {}, strokeText() {},
    };
    const { forward } = basis(heading);
    const pos = new Vector(10, 0, 20);
    const ahead = new Vector().copy(pos).addScaledVector(forward, 100);
    const n = 40, points = [], tangents = [];
    for (let i = 0; i < n; i++) {
      points.push(pos.x + forward.x * i * 50, 0, pos.z + forward.z * i * 50);
      tangents.push(forward.x, 0, forward.z);
    }
    const c = context(['updateMinimap'], {
      minimapCtx: canvas, minimapLast: 0, dom: { 'hud-minimap': {} }, isRacing: true,
      MM_SIZE: 256, MINIMAP_VIEW_AHEAD: 420, MINIMAP_VIEW_BEHIND: 130,
      playerCar: { heading, pos, lutIndex: 0 },
      trackLut: { count: n, spacing: 50, length: n * 50, pos: points, tan: tangents, radius: new Array(n).fill(5000) },
      activeObstacles: [{ visible: true, userData: {}, position: ahead }],
      AI_CARS: [{ car: { mesh: { visible: true, position: ahead }, lutIndex: 2 } }], AI_COLORS: [0x0012ab],
    });
    c.updateMinimap(200);
    assert.equal(arcs.length, 2);
    const expectedY = 138 - 100 * 110 / 420;
    for (const dot of arcs) { near(dot.x, 128); near(dot.y, expectedY); }
    assert.equal(arcs[1].color, '#0012ab');
    assert.ok(lines.some(p => Math.abs(p.x - 128) < 1e-6 && Math.abs(p.y - expectedY) < 1e-6));
    near(labels[0].x, arcs[1].x); near(labels[0].y + 8, arcs[1].y);
    c.updateMinimap(250);
    assert.equal(arcs.length, 2, 'throttle is preserved');
  }
});

function section(start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `Missing section: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `Missing end: ${end}`);
  return source.slice(from, to);
}
function fn(name) {
  return section(`      function ${name}(`, newline + '      }') + newline + '      }';
}
function context(names, stubs = {}) {
  const ctx = vm.createContext(stubs);
  vm.runInContext(names.map(fn).join(newline), ctx);
  return ctx;
}
function near(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
}
class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  add(v) { return this.addScaledVector(v, 1); }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  normalize() { return this.multiplyScalar(1 / (Math.hypot(this.x, this.y, this.z) || 1)); }
}
function basis(h) {
  return { forward: new Vector(-Math.sin(h), 0, -Math.cos(h)),
    right: new Vector(Math.cos(h), 0, -Math.sin(h)) };
}

test('wall projection keeps world and body velocity consistent on both sides', () => {
  const wall = section('        const barrierLimit = grassOuter', '        const vMag = Math.sqrt(car.vLong');
  for (const h of [0, 0.7, Math.PI / 2, -2.1]) {
    for (const side of [-1, 1]) {
      for (const direction of [-1, 1]) {
        const { forward, right } = basis(h);
        const car = { pos: new Vector(side * 12, 0, 0), velocity: new Vector(side * direction * 7, 0, -20),
          trackCx: 0, trackCz: 0, trackBx: 1, trackBz: 0, vLong: 99, vLat: 99 };
        const c = context(['decomposeVelocity'], { car, forward, right, grassOuter: 11, delta: 1,
          GAMEPLAY: { BARRIER_HALF_WIDTH: 1, BARRIER_SPEED_KEEP: 0.5, BARRIER_DAMAGE_RATE: 1 },
          applyDamage() {}, flashDangerAlert() {}, AudioFX: { crash() {} }, Haptics: { crash() {} }, emitSparks() {},
        });
        vm.runInContext(wall, c);
        near(car.pos.x, side * 10);
        near(car.velocity.x, direction > 0 ? 0 : -side * 3.5);
        near(car.velocity.z, -10);
        near(car.vLong, car.velocity.dot(forward));
        near(car.vLat, car.velocity.dot(right));
        const rebuilt = new Vector().copy(forward).multiplyScalar(car.vLong).addScaledVector(right, car.vLat);
        near(rebuilt.x, car.velocity.x); near(rebuilt.z, car.velocity.z);
        near(car.speed, car.vLong); near(car.lateralSlip, car.vLat);
      }
    }
  }
});
test('AI impact immediately rebuilds player world velocity using the current heading', () => {
  const impact = section('          if (ai.cooldown <= 0) {', '          ai.cooldown = Math.max(0, ai.cooldown - delta);');
  for (const h of [0, Math.PI / 2, -1.2]) {
    for (const cooldown of [0, 1]) {
      const playerCar = { heading: h, pos: new Vector(), velocity: new Vector(), vLong: 30, vLat: -5 };
      const ai = { cooldown, v: 20, lat: 0, car: { mesh: { position: new Vector(1, 0, 0) } } };
      vm.runInNewContext(impact, { ai, playerCar, AudioFX: { crash() {} }, Haptics: { crash() {} }, emitImpactFx() {} });
      near(playerCar.vLong, cooldown ? 30 : 25.2);
      near(playerCar.vLat, cooldown ? -5 : -3.5);
      if (cooldown) continue;
      const { forward, right } = basis(h);
      near(playerCar.velocity.dot(forward), playerCar.vLong);
      near(playerCar.velocity.dot(right), playerCar.vLat);
      near(playerCar.speed, playerCar.vLong);
      near(playerCar.lateralSlip, playerCar.vLat);
      near(ai.v, 14.4);
    }
  }
});
test('AI visual uses interpolated elevation and updates shadow heading and speed', () => {
  const c = context(['placeAIVisual'], {
    trackLut: { count: 2, pos: [0, 10, 0, -10, 20, 0], tan: [-1, 0, 0, -1, 0, 0], bin: [0, 0, -1, 0, 0, -1] },
    aiTmpA: new Vector(), aiTmpB: new Vector(), S: { v7: new Vector(), axisZneg: new Vector(0, 0, -1) },
    WHEEL_RADIUS: 0.3,
  });
  const facing = new Vector();
  const ai = { t: 0.25, lat: 2, yawBias: 0.3, v: 42, car: {
    mesh: { position: new Vector(), quaternion: { setFromUnitVectors: (_, to) => facing.copy(to) } },
    pos: new Vector(), wheels: [], heading: 0, speed: 0,
  } };
  c.placeAIVisual(ai, 0.1);
  near(ai.car.pos.x, -5); near(ai.car.pos.y, 15.25); near(ai.car.pos.z, -2);
  near(ai.car.heading, Math.atan2(-facing.x, -facing.z));
  near(ai.car.speed, 42);
  ai.t = 0.75; ai.v = 18;
  c.placeAIVisual(ai, 0.1);
  near(ai.car.pos.y, 15.25); near(ai.car.speed, 18);
});
function obstacleContext(roll) {
  const randoms = [0.1, roll, 0.5];
  const ctx = context(['findEventStart', 'planDangerEvent', 'populateTrackObstaclesPass'], {
    Math: Object.assign(Object.create(Math), { random: () => randoms.shift() ?? 0.5 }),
    trackLut: { count: 1000, spacing: 1, length: 1000, radius: new Float32Array(1000).fill(5000) },
    lapCount: 2, isMobileDevice: false, VEHICLES: { test: { maxSpeed: 50 } },
    selectedVehicleType: 'test', TRACK_CONFIG: { trackWidth: 26 },
    obstaclePool: Array.from({ length: 40 }, () => ({})),
    corneringSpeed: () => 50, FAIR_LANE_OFFSETS: [-7, 0, 7],
    GAMEPLAY: { COMBO_SPEED_REF: 50, COMBO_WINDOW_GAPS: 1 },
    clampComboGap: x => x, activeObstacles: [],
  });
  ctx.clearActiveObstacleLayout = () => { ctx.activeObstacles = []; };
  ctx.placeObstacle = (obs, t, lat) => { obs.userData = { t, lat }; ctx.activeObstacles.push(obs); };
  return ctx;
}

test('event search rejects short ranges and checks the final radius probe', () => {
  const c = obstacleContext(0.9);
  assert.equal(c.findEventStart(1000, 900, 950, 85, 60), -1);
  c.Math.random = () => 0;
  c.trackLut.radius[10] = 0;
  assert.equal(c.findEventStart(1000, 0, 11, 85, 10), -1);
  c.trackLut.radius[10] = 5000;
  assert.equal(c.findEventStart(1000, 0, 11, 85, 10), 0);
  assert.equal(c.findEventStart(1000, 995, 1100, 85, 10), -1);
});
for (const [label, roll, groupSize] of [['paired', 0.9, 2], ['corridor', 0.1, 1]]) {
  test(`${label} event keeps offsets, end guard and ordinary boundary gaps`, () => {
    const c = obstacleContext(roll);
    const plan = c.planDangerEvent;
    let event;
    c.planDangerEvent = (...args) => (event = plan(...args));
    c.populateTrackObstaclesPass(false);
    assert.equal(event.groupSize, groupSize);
    const eventObs = c.activeObstacles.slice(0, event.lanes.length);
    eventObs.forEach((obs, i) => {
      near(obs.userData.t, event.t + Math.floor(i / groupSize) * event.stepT);
      assert.equal(obs.userData.lat, event.lanes[i]);
    });
    const last = eventObs.at(-1).userData.t * 1000;
    near(event.endIdx - last, event.separation);
    assert.ok(event.endIdx < 970);
    const ordinary = c.activeObstacles.slice(event.lanes.length).map(o => o.userData.t * 1000);
    assert.ok(ordinary.some(i => i < event.startIdx), 'ordinary obstacles before event');
    assert.ok(ordinary.some(i => i >= event.endIdx), 'ordinary obstacles after event');
    for (const i of ordinary) {
      assert.ok(i <= event.startIdx - event.separation || i >= event.endIdx);
      assert.ok(i >= 40 && i < 970);
    }
    for (let i = 1; i < ordinary.length; i++) assert.ok(ordinary[i] - ordinary[i - 1] >= 56 - 1e-6);
    assert.ok(c.activeObstacles.length <= 30);
  });
}
test('late event fits inside the finish guard and fallback has no event', () => {
  const c = obstacleContext(0.9);
  const values = [0.1, 0.9];
  c.Math.random = () => values.shift() ?? 0.999999;
  const evt = c.planDangerEvent({ maxSpeed: 50 }, 1000, 30, 60, 970);
  assert.ok(evt.endIdx < 970);
  c.planDangerEvent = () => { throw new Error('fallback must not plan events'); };
  c.populateTrackObstaclesPass(true);
  near(c.activeObstacles[0].userData.t, 0.04);
});

test('particle pools hide on expiry and show when spawned again', () => {
  const c = context(['createFxPool', 'fxSpawn', 'fxUpdatePool'], {
    THREE: three, scene: { add() {} }, FX_POINT_VERT: '',
  });
  const p = c.createFxPool(2, '', null, false);
  assert.equal(p.points.visible, false);
  const spawn = () => c.fxSpawn(p, 0, 1, 0, 1, 2, 3, 1, 1, 0.2, 1, 0.5, 0);
  spawn();
  c.fxUpdatePool(p, 0.1, 0, 0);
  assert.equal(p.points.visible, true);
  near(p.pos[0], 0.1);
  c.fxUpdatePool(p, 0.2, 0, 0);
  assert.equal(p.aliveCount, 0);
  assert.equal(p.points.visible, false);
  assert.ok(p.attrs.aAlpha.array.every(x => x === 0));
  p.points.visible = true;
  c.fxUpdatePool(p, 0.1, 0, 0);
  assert.equal(p.points.visible, false);
  spawn();
  assert.equal(p.points.visible, true);
});
test('skid attributes are instanced; newest mark controls expiry and ring reuse', () => {
  const noop = () => {};
  const c = context(['initSkidmarksAndSmoke', 'pushSkidQuad', 'updateSkidFades', 'clearSkidmarks'], {
    THREE: three, scene: { add: noop }, makeFxTexture: noop, createFxPool: noop,
    paintSoftCircle: noop, paintStarSparks: noop, paintFlameColumn: noop,
    FX_SMOKE_MAX: 1, FX_SPARK_MAX: 1, FX_JET_MAX: 1,
    FX_SMOKE_FRAG: '', FX_SPARK_FRAG: '', FX_JET_FRAG: '',
    MAX_SKID_SEGMENTS: 3, SKID_FADE_SEC: 10, WHEEL_RADIUS: 0.3,
    skidIndex: 0, skidDirty: false, fxClock: 0,
    skidEuler: { set: noop }, skidQuat: { setFromEuler: noop },
    skidPos: new Vector(), skidScale: new Vector(), skidMat4: { compose: noop },
  });
  c.initSkidmarksAndSmoke();
  const attrs = c.skidMesh.geometry.attributes;
  assert.ok(attrs.aFade instanceof InstancedAttribute);
  assert.ok(attrs.aDark instanceof InstancedAttribute);
  const push = time => { c.fxClock = time; c.pushSkidQuad(new Vector(), new Vector(0, 0, 1), 0.5); };
  push(0); push(8);
  c.fxClock = 11;
  c.updateSkidFades();
  near(attrs.aFade.array[0], 0); near(attrs.aFade.array[1], 0.7);
  assert.equal(c.skidDirty, true);
  push(12); push(15);
  c.fxClock = 23;
  c.updateSkidFades();
  near(attrs.aFade.array[0], 0.2);
  c.fxClock = 25;
  attrs.aFade.needsUpdate = false;
  c.updateSkidFades();
  assert.ok(attrs.aFade.array.every(x => x === 0));
  assert.equal(attrs.aFade.needsUpdate, true);
  assert.equal(c.skidDirty, false);
  push(26); c.updateSkidFades();
  near(attrs.aFade.array[1], 1);
  c.clearSkidmarks();
  assert.equal(c.skidIndex, 0);
  assert.ok(attrs.aFade.array.every(x => x === 0));
});
