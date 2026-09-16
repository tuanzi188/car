const test = require('node:test');
const assert = require('node:assert/strict');
const make = require('./physics-harness.cjs');

test('actual physics: GT3 accelerates and brakes sooner; Spectre has higher top speed', () => {
  const metrics = {};
  for (const id of ['veneno','gt3']) {
    const s = make(id); let time = 0;
    while (s.car.speed < 100/3.6 && time < 10) { s.step(1/120,{throttle:1}); time += 1/120; }
    const launch = time;
    s.speed(s.car,100/3.6); s.car.pos.set(0,0,0); time = 0;
    while (s.car.speed > .01 && time < 10) { s.step(1/120,{throttle:0,brake:1}); time += 1/120; }
    const brakeDistance = s.car.pos.length();
    s.reset(s.car); s.step(90,{throttle:1,brake:0});
    metrics[id] = {launch,brakeDistance,top:s.car.speed*3.6}; s.dispose(s.car);
  }
  assert.ok(metrics.gt3.launch < metrics.veneno.launch);
  assert.ok(metrics.gt3.brakeDistance < metrics.veneno.brakeDistance);
  assert.ok(metrics.veneno.top > metrics.gt3.top + 20);
  console.log('Actual physics metrics:', metrics);
});

test('actual physics: sustained drift retains motion and GT3 earns stronger exit boost', () => {
  const metrics = {};
  for (const id of ['veneno','gt3']) {
    const s=make(id);s.speed(s.car,50);
    s.step(2,{throttle:1,steer:.8,drift:true});
    assert.ok(s.car.speed>25);assert.ok(s.car._driftHoldT>1.2);
    const charge=s.car.nitroAmount;
    s.step(1/120,{steer:0,drift:false});
    assert.ok(s.car._miniBoostT>0);
    metrics[id]={charge,exit:s.car._miniBoostA};s.dispose(s.car);
  }
  assert.ok(metrics.gt3.charge>metrics.veneno.charge);
  assert.ok(metrics.gt3.exit>metrics.veneno.exit);
});

test('actual physics: low speed, reversing and grass cannot build drift rewards', () => {
  for (const mode of ['low','reverse','grass']) {
    const s=make('gt3'); s.speed(s.car,mode==='low'?2:mode==='reverse'?-10:40);
    s.surface=mode==='grass'?'grass':'tarmac';
    s.step(.5,{throttle:0,steer:.8,drift:true});
    assert.equal(s.car._driftHoldT,0);
    s.step(1/120,{drift:false,steer:0});assert.equal(s.car._miniBoostT,0);
    assert.ok(s.car.nitroAmount<1);s.dispose(s.car);
  }
});

test('actual physics: boost expiry does not instantly clamp overspeed and brakes win', () => {
  const s=make('veneno');s.speed(s.car,110);
  s.car.nitroBurst=.001;s.car.nitroChain=1;
  s.step(2/120,{throttle:1});assert.ok(s.car.speed>108);
  s.car.nitroBurst=1;s.car.nitroChain=1;
  const before=s.car.speed;s.step(.2,{throttle:1,brake:1});assert.ok(s.car.speed<before);
  s.reset(s.car);s.speed(s.car,-10);s.step(2,{throttle:1,handbrake:true,brake:0});
  assert.equal(s.car.speed,0);s.dispose(s.car);
});

test('actual physics: nitro can chain during intentional keyboard drift without brake exploits', () => {
  const s=make('gt3');s.speed(s.car,40);
  s.step(1/120,{throttle:1,brake:1,drift:true,steer:.8,nitro:true});
  assert.equal(s.car.nitroBottles,0);assert.equal(s.car.isNitroActive,true);
  s.reset(s.car);s.speed(s.car,40);s.step(1/120,{nitro:false,drift:false});
  s.step(1/120,{nitro:true});assert.equal(s.car.nitroBottles,1);
  s.dispose(s.car);
});
