const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../three.local.js');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}
const specsCode = section('      const VEHICLES = {', '      /* 路面类型表');
const modelCode = section('      function createSuperCar(spec)', '      /* ---------------------- 6.');
function build(mobile, id) {
  const texture = new THREE.Texture(); texture.userData.shared = true;
  const WHEEL_RADIUS = Number(source.match(/const WHEEL_RADIUS = ([0-9.]+)/)[1]);
  const context = vm.createContext({ THREE, scene: new THREE.Scene(), isMobileDevice: mobile, TAIL_COLOR_IDLE: new THREE.Color(0x7a0026), generateCarbonTexture: () => texture, generateRimTexture: () => texture, generateTireTexture: () => texture });
  context.WHEEL_RADIUS = WHEEL_RADIUS;
  vm.runInContext(specsCode + modelCode + ';globalThis.car=createSuperCar(VEHICLES[' + JSON.stringify(id) + ']);', context);
  return context.car;
}
for (const mobile of [false, true]) for (const id of ['veneno', 'gt3']) {
  test(id + (mobile ? ' mobile' : ' desktop') + ' geometry and animation contract', () => {
    const car = build(mobile, id);
    assert.equal(car.wheels.length, 4);
    let triangles = 0, meshes = 0;
    car.mesh.traverse(obj => {
      if (!obj.isMesh) return;
      meshes++;
      const g = obj.geometry, p = g.getAttribute('position');
      assert.ok(p && p.count > 0);
      for (const name of ['position', 'normal', 'uv']) {
        const attr = g.getAttribute(name);
        if (attr) { assert.equal(attr.count, p.count, obj.name + ' attribute count ' + name); for (const v of attr.array) assert.ok(Number.isFinite(v)); }
      }
      if (g.index) for (const index of g.index.array) assert.ok(index < p.count);
      triangles += (g.index ? g.index.count : p.count) / 3;
      g.computeBoundingSphere(); assert.ok(Number.isFinite(g.boundingSphere.radius));
    });
    assert.ok(meshes <= 47, 'Mesh budget: ' + meshes);
    assert.ok(triangles < (mobile ? 12000 : 15000), 'Triangle budget: ' + triangles);
    const box = new THREE.Box3().setFromObject(car.mesh), size = box.getSize(new THREE.Vector3());
    assert.ok(size.x > 2 && size.x < 3.5); assert.ok(size.y > .8 && size.y < 3); assert.ok(size.z > 4 && size.z < 7);
    for (const wheel of car.wheels) {
      assert.ok(wheel.children[0].isMesh); assert.ok(wheel.userData.spinner);
      const point = wheel.position.clone(); wheel.userData.spinner.rotation.x += 1;
      assert.ok(wheel.position.equals(point));
    }
    assert.ok(car.tailMat.isMaterial && car.paintMat.isMaterial);
    assert.equal(car.nitroGroup.children.length, 4);
    console.log(id, mobile ? 'mobile' : 'desktop', { meshes, triangles, size: size.toArray() });
  });
}
function modelParts(car) {
  const parts = new Map();
  car.mesh.traverse(mesh => {
    if (!mesh.isMesh) return;
    const ranges = mesh.geometry.userData.parts || [{name:mesh.name,start:0,count:mesh.geometry.attributes.position.count}];
    for (const range of ranges) parts.set(range.name, {mesh,...range});
  });
  return parts;
}
for (const mobile of [false,true]) for (const id of ['veneno','gt3']) {
  test(id + (mobile ? ' mobile' : ' desktop') + ' continuous deck seams and material separation', () => {
    const car=build(mobile,id),parts=modelParts(car);
    const vector=(part,attr,i)=>new THREE.Vector3().fromBufferAttribute(part.mesh.geometry.attributes[attr],part.start+i);
    for (const name of ['continuous hood','rear engine deck']) {
      const deck=parts.get(name);
      for (const side of [-1,1]) {
        const shoulder=parts.get('sculpted fender shoulder '+side);
        let matched=0;
        for(let i=0;i<deck.count;i++) {
          const p=vector(deck,'position',i);
          if(Math.abs(p.x-side*.69)>1e-5) continue;
          for(let j=0;j<shoulder.count;j++) {
            if(p.distanceTo(vector(shoulder,'position',j))>1e-5) continue;
            assert.ok(vector(deck,'normal',i).dot(vector(shoulder,'normal',j))>.9999,'deck shading seam');
            matched++; break;
          }
        }
        assert.ok(matched>10,'shared longitudinal samples');
      }
    }
    const glass=parts.get('curved windshield'),rear=parts.get('fastback rear glass'),roof=parts.get('arched carbon roof');
    for(let i=0;i<=10;i++) {
      assert.ok(vector(glass,'position',55+i).distanceTo(vector(roof,'position',i))<1e-5,'windshield meets roof');
      assert.ok(vector(rear,'position',i).distanceTo(vector(roof,'position',66+i))<1e-5,'rear glass meets roof');
    }
    assert.ok(parts.has('sculpted rear bumper bridge'));
    assert.ok(parts.has('closed wing edge 0') && parts.has('closed wing edge 1'));
    assert.ok(parts.has('tapered diffuser strake'));
    assert.ok(parts.get('central undertray').mesh.material.metalness<.15);
    assert.equal(parts.get('recessed rear lamp surround').mesh.material.metalness,0);
    assert.equal(car.wheels[0].children[0].material.metalness,0);
    assert.equal(car.tailMat.transparent,false);
    const before=car.mesh.userData.modelStats.meshes;
    car.tailMat.emissiveIntensity=1.1;
    assert.equal(car.mesh.userData.modelStats.meshes,before);
  });
}
function visibleBudget(car) {
  let meshes=0,triangles=0;
  car.mesh.traverseVisible(obj=>{
    if(!obj.isMesh)return;
    const g=obj.geometry,count=g.index?g.index.count:g.attributes.position.count;
    const drawn=Math.min(count,g.drawRange.count);
    if(drawn>0){meshes++;triangles+=drawn/3;}
  });
  return {meshes,triangles};
}
for(const mobile of [false,true]) for(const id of ['veneno','gt3']) {
  test(id+(mobile?' mobile':' desktop')+' distance detail is reversible and preserves animation hooks',()=>{
    const car=build(mobile,id),parts=modelParts(car),near=visibleBudget(car);
    const glass=parts.get('curved windshield').mesh.material;
    const enter=mobile?36:48,exit=mobile?28:38;
    const resources=[];
    car.mesh.traverse(m=>{if(m.isMesh)resources.push([m,m.geometry,m.material]);});
    car.updateDetail(enter*enter);
    assert.equal(car.mesh.userData.detailLevel,'near');
    car.updateDetail((enter+1)**2);
    assert.equal(car.mesh.userData.detailLevel,'far');
    const far=visibleBudget(car);
    assert.ok(far.meshes<=near.meshes-12);
    assert.ok(far.triangles<near.triangles*.85);
    assert.equal(glass.transparent,false);assert.equal(glass.depthWrite,true);assert.equal(glass.opacity,1);
    const version=glass.version;
    for(let i=0;i<30;i++)car.updateDetail(((enter+exit)/2)**2);
    assert.equal(car.mesh.userData.detailLevel,'far');assert.equal(glass.version,version);
    for(const wheel of car.wheels){
      assert.equal(wheel.children[0].visible,true);
      wheel.children[0].rotation.x=.6;wheel.userData.spinner.rotation.x=.6;
      assert.equal(wheel.userData.caliper.parent,wheel);
    }
    assert.equal(parts.get('sculpted rear bumper bridge').mesh.visible,true);
    assert.equal(parts.get('recessed rear lamp surround').mesh.visible,true);
    car.updateDetail(exit*exit);
    assert.equal(car.mesh.userData.detailLevel,'near');assert.deepEqual(visibleBudget(car),near);
    assert.equal(glass.transparent,true);assert.equal(glass.depthWrite,false);assert.equal(glass.opacity,.62);
    for(const [mesh,geometry,material] of resources){assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);}
    for(const wheel of car.wheels)assert.equal(wheel.userData.spinner.rotation.x,.6);
    car.updateDetail(10000);car.updateDetail(10000,true);
    assert.equal(car.mesh.userData.detailLevel,'near');assert.deepEqual(visibleBudget(car),near);
    console.log(id,mobile?'mobile':'desktop',{near,far});
  });
}
test('detail update keeps player near and measures only visible opponents from camera',()=>{
  const calls=[],camera={position:new THREE.Vector3(5,0,0)};
  const car=(name,x,visible)=>({mesh:{visible,position:new THREE.Vector3(x,0,0)},updateDetail:(...args)=>calls.push([name,...args])});
  const playerCar=car('player',100,true),visible=car('opponent',55,true),hidden=car('hidden',60,false);
  const ctx=vm.createContext({playerCar,camera,AI_CARS:[{car:visible},{car:hidden}]});
  vm.runInContext(section('      function updateCarModelDetails()', '      function renderFrame('),ctx);
  ctx.updateCarModelDetails();
  assert.deepEqual(calls,[['player',0,true],['opponent',2500]]);
});
test('far-detail model disposal releases hidden geometry and materials exactly once',()=>{
  const car=build(false,'gt3'),counts=new Map();
  car.mesh.traverse(m=>{if(m.isMesh)for(const resource of [m.geometry,m.material])counts.set(resource,0);});
  for(const resource of counts.keys())resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
  car.updateDetail(10000);
  const ctx=vm.createContext({});
  vm.runInContext(section('      const CAR_TEXTURE_SLOTS =','      function selectVehicle(type)'),ctx);
  ctx.disposeCarModel(car.mesh);
  for(const count of counts.values())assert.equal(count,1);
});
test('shared textures survive deduplicated model disposal', () => {
  const code = section('      const CAR_TEXTURE_SLOTS =', '      function selectVehicle(type)');
  const ctx = vm.createContext({}); vm.runInContext(code, ctx);
  const geometry = new THREE.BoxGeometry();
  const shared = new THREE.Texture(); shared.userData.shared = true;
  const own = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({map:shared,normalMap:own});
  const counts = {geometry:0,material:0,shared:0,own:0};
  for (const [key,object] of Object.entries({geometry,material,shared,own})) object.addEventListener('dispose',()=>counts[key]++);
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,[material,material]));
  ctx.disposeCarModel(root);
  assert.deepEqual(counts,{geometry:1,material:1,shared:0,own:1});
});
