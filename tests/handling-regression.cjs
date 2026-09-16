const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const between = (a,b) => source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const ctx = vm.createContext({Math});
vm.runInContext(between('      const VEHICLES = {','      /* 路面类型表') + between('      function integrateDriveSpeed(','      function updateCarPhysics(') + ';globalThis.specs=VEHICLES;',ctx);
const drive = ctx.integrateDriveSpeed;
test('handbrake stops forward and reverse motion without reversing direction',()=>{
  for (const start of [-12,30]) {
    let speed=start;
    for(let i=0;i<600;i++) speed=drive(speed,20,54,0,1,true,false,.02,1/120);
    assert.equal(speed,0);
  }
});
test('service brake wins over throttle and nitro; reverse needs brake without throttle',()=>{
  assert.ok(drive(20,100,34,1,1,false,false,.02,1/120)<20);
  assert.equal(drive(0,100,34,1,1,false,false,.02,1/120),0);
  assert.ok(drive(0,0,34,1,0,false,false,.02,1/120)<0);
  assert.equal(drive(.01,0,34,1,0,false,false,0,1/120),0);
  assert.ok(drive(-10,13,0,0,1,false,false,0,1/120)>-10);
});
function accelerate(spec,seconds,boost=false) {
  let speed=0;
  for(let t=0;t<seconds;t+=1/120) {
    const power=spec.accelRate*(boost?1.38*spec.nitroPower:1)*(1-(boost?spec.powerTaper*.7:spec.powerTaper)*Math.abs(speed)/spec.maxSpeed);
    speed=drive(speed,power,0,0,1,false,false,.02,1/120);
    speed=Math.min(speed,spec.maxSpeed*(boost?1.15*spec.nitroTop:1));
  }
  return speed;
}
test('GT3 launches faster but Spectre retains top-speed and boosted-straight advantage',()=>{
  const {veneno,gt3}=ctx.specs;
  assert.ok(accelerate(gt3,2)>accelerate(veneno,2));
  assert.ok(accelerate(veneno,90)>accelerate(gt3,90));
  assert.ok(accelerate(veneno,12,true)>accelerate(gt3,12,true));
  assert.ok(gt3.brakeRate>veneno.brakeRate);
  assert.ok(gt3.latGripBase>veneno.latGripBase);
  assert.ok(gt3.steerResponse>veneno.steerResponse);
  assert.ok(gt3.driftCharge>veneno.driftCharge && gt3.exitBoost>veneno.exitBoost);
});
test('longitudinal integration stays consistent at 30/60/120 Hz',()=>{
  const results=[30,60,120].map(hz=>{
    let speed=0;
    for(let i=0;i<hz*3;i++) speed=drive(speed,12,0,0,1,false,false,.02,1/hz);
    return speed;
  });
  assert.ok(Math.max(...results)-Math.min(...results)<.02);
});
test('nitro cannot consume bottles while braking, reversing or before start',()=>{
  const c=vm.createContext({inputs:{brake:0,handbrake:false},countdownTime:0});
  vm.runInContext(between('      function requestNitroBurst(car)','      /** 氮气气泡'),c);
  for(const mode of ['brake','handbrake','reverse','countdown']) {
    c.inputs.brake=mode==='brake'?1:0;c.inputs.handbrake=mode==='handbrake';c.countdownTime=mode==='countdown'?1:0;
    const car={vLong:mode==='reverse'?-5:10,nitroBottles:2};
    c.requestNitroBurst(car);assert.equal(car.nitroBottles,2);
  }
});
