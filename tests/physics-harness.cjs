const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../three.local.js');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = Array.from(source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g), m => m[1]).find(s => s.includes('function updateCarPhysics('));
const bootMarker = "      if (document.readyState === 'loading') {";
const expose = `
      globalThis.sim = {
        specs: VEHICLES, inputs,
        create(id) {
          scene = new THREE.Scene();
          const texture = new THREE.Texture(); texture.userData.shared = true;
          generateCarbonTexture = generateRimTexture = generateTireTexture = () => texture;
          locateOnTrack = car => {
            car.lateral = this.surface === 'grass' ? 16 : this.surface === 'kerb' ? 13 : 0;
            car.trackCx = car.pos.x - car.lateral; car.trackCz = car.pos.z;
            car.trackBx = 1; car.trackBz = 0;
            return 0;
          };
          updateLapProgress = () => {};
          checkObstacleCollisions = () => false;
          emitNitroJet = recordSkidPair = emitSmoke = () => {};
          playerCar = createSuperCar(VEHICLES[id]);
          resetCarKinematics(playerCar, 0, new THREE.Vector3());
          isRacing = true; countdownTime = 0; nitroWasHeld = false; nitroAutoTimer = 0;
          Object.assign(inputs, {throttle:0,brake:0,steer:0,nitro:false,handbrake:false,drift:false});
          return playerCar;
        },
        speed(car, forward, lateral = 0) {
          car.vLong = car.speed = forward; car.vLat = lateral;
          car.velocity.set(lateral, 0, -forward).applyAxisAngle(S.axisY, car.heading);
        },
        step(seconds, controls = {}, hz = 120) {
          Object.assign(inputs, controls);
          for (let i = 0; i < Math.round(seconds * hz); i++) updateCarPhysics(playerCar, 1 / hz);
          return playerCar;
        },
        reset(car) { resetCarKinematics(car, 0, new THREE.Vector3()); },
        dispose(car) { disposeCarModel(car.mesh); },
        corneringSpeed, burst: requestNitroBurst
      };
`;
module.exports = function createSimulation(id) {
  const context = vm.createContext({
    THREE, console, performance: {now: () => 1000}, navigator: {userAgent:'test'},
    window: {innerWidth:1280, innerHeight:720, matchMedia: () => ({matches:false})},
    localStorage: {getItem: () => null}, document: {readyState:'loading', addEventListener(){}},
    setTimeout, clearTimeout
  });
  if (!script || !script.includes(bootMarker)) throw new Error('Game physics entry not found');
  vm.runInContext(script.replace(bootMarker, expose + bootMarker), context);
  const sim = context.sim;
  sim.car = sim.create(id);
  return sim;
};
