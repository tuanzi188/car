const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 8780);
function preview() {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const section = (start, end) => {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    if (a < 0 || b < 0) throw new Error('Missing model section: ' + start);
    return source.slice(a, b);
  };
  const code = section('      const VEHICLES = {', '      /* 路面类型表') +
    section('      const _texCache = {};', '      function createTracksideProps()') +
    section('      function createSuperCar(spec)', '      /* ---------------------- 6.') +
    section('      function createSkyTexture()', '      function initSceneEnvironment()') +
    section('      const CAR_TEXTURE_SLOTS =', '      function selectVehicle(type)');
  const radius = source.match(/const WHEEL_RADIUS = ([0-9.]+)/)[1];
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vehicle model regression preview</title>
<style>body{margin:0;background:#ddd;font:14px system-ui}canvas{display:block;width:100vw;height:100vh}nav{position:fixed;top:12px;left:12px;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100vw - 24px)}button,select{padding:8px;border:1px solid #555;border-radius:3px;background:white;color:#161616}output{position:fixed;bottom:10px;left:12px;background:#fff;padding:6px}</style>
<nav><select aria-label="Vehicle"><option value="veneno">Spectre S1</option><option value="gt3">Inferno GT3</option></select><button id="detail">Near detail</button><button id="quality">Desktop geometry</button><button id="angle">Rear view</button><button id="motion">Animate</button></nav><output></output><canvas></canvas>
<script src="/three.local.js"></script><script>
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.1,100);
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const WHEEL_RADIUS=${radius},TAIL_COLOR_IDLE=new THREE.Color(0x7a0026),SUN_OFFSET=new THREE.Vector3(-20,40,25);
let isMobileDevice=false;
${code}
const sky=createSkyTexture(),pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(sky);
scene.background=new THREE.Color(0xdce6eb);scene.environment=environment.texture;pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0x667568,2));
const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(-4,8,6);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0xadb5b7,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);
let car,far=false,rear=true,moving=false,frames=0;
function budget(){let meshes=0,triangles=0;car.mesh.traverseVisible(m=>{if(!m.isMesh)return;const g=m.geometry,n=Math.min(g.drawRange.count,g.index?g.index.count:g.attributes.position.count);if(n){meshes++;triangles+=n/3;}});return {meshes,triangles,level:car.mesh.userData.detailLevel,frames};}
function draw(){camera.position.set(6.4,3.6,rear?7.4:-7.4);camera.lookAt(0,.65,0);renderer.render(scene,camera);document.querySelector('output').textContent=JSON.stringify(budget());}
function rebuild(){if(car){scene.remove(car.mesh);disposeCarModel(car.mesh);}car=createSuperCar(VEHICLES[document.querySelector('select').value]);car.updateDetail(far?10000:0);draw();}
document.querySelector('select').onchange=rebuild;
document.querySelector('#detail').onclick=e=>{far=!far;car.updateDetail(far?10000:0);e.target.textContent=far?'Far detail':'Near detail';draw();};
document.querySelector('#quality').onclick=e=>{isMobileDevice=!isMobileDevice;e.target.textContent=isMobileDevice?'Mobile geometry':'Desktop geometry';rebuild();};
document.querySelector('#angle').onclick=e=>{rear=!rear;e.target.textContent=rear?'Rear view':'Front view';draw();};
document.querySelector('#motion').onclick=e=>{moving=!moving;e.target.textContent=moving?'Stop':'Animate';draw();};
window.onresize=()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();draw();};
function tick(){requestAnimationFrame(tick);if(!moving)return;frames++;car.mesh.rotation.y+=.012;for(const w of car.wheels){w.children[0].rotation.x+=.08;w.userData.spinner.rotation.x+=.08;}draw();}
window.__modelPreview={budget,render:draw};rebuild();tick();
</script></html>`;
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/model-preview') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(preview()); return;
  }
  const files = {'/':'index.html','/index.html':'index.html','/three.local.js':'three.local.js'};
  const file = files[url.pathname];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(path.join(root, file)).pipe(res);
});
server.listen(port, '127.0.0.1', () => console.log('Model preview: http://127.0.0.1:' + port + '/model-preview'));
