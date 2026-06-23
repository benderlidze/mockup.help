import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const bgTransBtn = document.getElementById('bgTransBtn');
const bgSolidBtn = document.getElementById('bgSolidBtn');
const bgColorWrap = document.getElementById('bgColorWrap');
const bgColorPick = document.getElementById('bgColorPick');
const screenDZ = document.getElementById('screenDZ');
const screenInput = document.getElementById('screenInput');
const fitSeg = document.getElementById('fitSeg');
const rotSlider = document.getElementById('rotSlider');
const rotVal = document.getElementById('rotVal');
const exportW = document.getElementById('exportW');
const exportH = document.getElementById('exportH');
const exportBtn = document.getElementById('exportBtn');
const orbitBtn = document.getElementById('orbitBtn');
const panel = document.getElementById('panel');
const toastsEl = document.getElementById('toasts');
const devRow = document.getElementById('devRow');

const getPreviewPixelRatio = () => Math.min(
  Math.max(window.devicePixelRatio || 1, 1.25),
  2.5,
);

const DEVICES = {
  iphone: { file: '/iphone17pro_max.glb', label: 'iPhone' },
  watch: { file: '/apple_watch_ultra_-_orange.glb', label: 'Watch' },
  macbook: { file: '/macbook_pro_m3_16_inch_2024.glb', label: 'MacBook' },
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(getPreviewPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.005, 100);
camera.position.set(0, 0.8, 3.2);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
pmrem.dispose();

scene.add(new THREE.AmbientLight(0xffffff, 1.35));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); keyLight.position.set(3, 4, 5); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x89a8ff, 0.85); fillLight.position.set(-4, 1.5, -2); scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.65); rimLight.position.set(0, 2, -4); scene.add(rimLight);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.minDistance = 0.5;
controls.maxDistance = 12;
controls.panSpeed = 0.8;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.0;

const gltfLoader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
gltfLoader.setDRACOLoader(draco);
const texLoader = new THREE.TextureLoader();

let modelRoot = null;
let screenMesh = null;
let originalMat = null;
let currentTex = null;
let currentScreenMaterial = null;
let currentFit = 'cover';
let screenRot = 0;
let bgMode = 'transparent';

function toast(msg, type = '', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastsEl.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 280); }, ms);
}

function setStatus(text, cls = '') { statusEl.textContent = text; statusEl.className = cls; }

function applyBg() {
  if (bgMode === 'transparent') { scene.background = null; renderer.setClearColor(0x000000, 0); }
  else { const c = new THREE.Color(bgColorPick.value); scene.background = c; renderer.setClearColor(c, 1); }
}

function normalizeModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const cen = box.getCenter(new THREE.Vector3());
  root.position.sub(cen);
  root.scale.setScalar(2 / (Math.max(size.x, size.y, size.z) || 1));
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
}

function fitCamera(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const cen = box.getCenter(new THREE.Vector3());
  const maxD = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * Math.PI / 180;
  const z = (maxD / 2 / Math.tan(fov / 2)) * 1.7;
  camera.position.set(cen.x, cen.y + maxD * 0.12, cen.z + z);
  camera.near = Math.max(maxD / 100, 0.005);
  camera.far = Math.max(maxD * 20, 100);
  camera.updateProjectionMatrix();
  controls.target.copy(cen);
}

function findScreenMesh(root) {
  let found = null;
  const keys = ['screen', 'display', 'monitor'];
  root.traverse((obj) => {
    if (!obj.isMesh || found) return;
    const name = (obj.name || '').toLowerCase();
    const mat = (obj.material?.name || '').toLowerCase();
    const par = (obj.parent?.name || '').toLowerCase();
    if (keys.some(k => name.includes(k) || mat.includes(k) || par.includes(k))) found = obj;
  });
  return found;
}

function loadModel(url) {
  setStatus('Loading…');
  gltfLoader.load(url, (gltf) => {
    disposeCurrentScreenMaterial();
    if (modelRoot) { scene.remove(modelRoot); modelRoot.traverse((o) => o.geometry?.dispose?.()); }
    modelRoot = gltf.scene;
    normalizeModel(modelRoot);
    scene.add(modelRoot);
    fitCamera(modelRoot);
    screenMesh = findScreenMesh(modelRoot);
    if (screenMesh) {
      originalMat = Array.isArray(screenMesh.material) ? screenMesh.material.map((m) => m.clone()) : screenMesh.material.clone();
      setStatus('Ready', 'ok');
    } else {
      setStatus('No "screen" mesh', 'err');
      toast('Mesh "screen" not found in model', 'err', 5000);
    }
    if (currentTex) applyScreenTex(currentTex);
  }, undefined, (err) => {
    console.error(err);
    setStatus('Load failed', 'err');
    toast('Failed to load model', 'err', 5000);
  });
}

function fitTex(tex, mode, rotDeg) {
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.rotation = rotDeg * Math.PI / 180;
  tex.center.set(0.5, 0.5);
  tex.offset.set(0, 0);
  if (mode === 'stretch') { tex.repeat.set(-1, 1); return; }
  const img = tex.image;
  if (!img?.width || !img?.height) { tex.repeat.set(-1, 1); return; }
  const swapped = Math.abs(rotDeg) === 90 || Math.abs(rotDeg) === 270;
  const iw = swapped ? img.height : img.width;
  const ih = swapped ? img.width : img.height;
  const ia = iw / ih;
  if (mode === 'cover') { if (ia > 1) tex.repeat.set(-1, 1 / ia); else tex.repeat.set(-ia, 1); }
  else { if (ia > 1) tex.repeat.set(-1 / ia, 1); else tex.repeat.set(-1, ia); }
}

function applyScreenTex(tex) {
  if (!screenMesh) { toast('Mesh "screen" not found', 'err'); return false; }
  fitTex(tex, currentFit, screenRot);
  disposeCurrentScreenMaterial();

  // const makeMaterial = (source) => {
  //   // Preserve the model's glass response (roughness, clearcoat and
  //   // reflections), while the screenshot supplies the display's own light.
  //   if (source?.isMeshStandardMaterial) {
  //     const mat = source.clone();
  //     mat.name = 'Uploaded screen with glass';
  //     mat.map = null;
  //     mat.color.set(0x000000);
  //     mat.emissiveMap = tex;
  //     mat.emissive.set(0xffffff);
  //     mat.emissiveIntensity = 1;
  //     mat.transparent = false;
  //     mat.opacity = 1;
  //     mat.depthWrite = true;
  //     mat.side = THREE.FrontSide;
  //     // ACES remains enabled for the device body, but would fade UI colors.
  //     mat.toneMapped = false;
  //     mat.needsUpdate = true;
  //     return mat;
  //   }

  //   return new THREE.MeshBasicMaterial({
  //     name: 'Uploaded screen',
  //     map: tex,
  //     side: THREE.FrontSide,
  //     toneMapped: false,
  //   });
  // };
  const makeMaterial = (_source) => new THREE.MeshBasicMaterial({
    name: 'Uploaded screen',
    map: tex,
    side: THREE.FrontSide,
    toneMapped: false,
  });

  currentScreenMaterial = Array.isArray(originalMat)
    ? originalMat.map(makeMaterial)
    : makeMaterial(originalMat);
  screenMesh.material = currentScreenMaterial;
  currentTex = tex;
  return true;
}

function disposeCurrentScreenMaterial() {
  if (Array.isArray(currentScreenMaterial)) currentScreenMaterial.forEach((mat) => mat.dispose());
  else currentScreenMaterial?.dispose?.();
  currentScreenMaterial = null;
}

function clearScreen() {
  if (!screenMesh || !originalMat) return;
  disposeCurrentScreenMaterial();
  screenMesh.material = originalMat;
  currentTex?.dispose?.();
  currentTex = null;
  toast('Screen cleared');
}

async function exportPNG() {
  const w = Math.max(256, parseInt(exportW.value, 10) || 2048);
  const h = Math.max(256, parseInt(exportH.value, 10) || 2048);
  const maxSide = Math.max(w, h);
  const renderScale = maxSide <= 2048 ? 2 : maxSide <= 3072 ? 1.5 : 1;
  const renderW = Math.round(w * renderScale);
  const renderH = Math.round(h * renderScale);
  const oldSz = new THREE.Vector2(); renderer.getSize(oldSz);
  const oldPR = renderer.getPixelRatio();
  const oldAsp = camera.aspect;
  const oldBg = scene.background;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  camera.aspect = renderW / renderH;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(1);
  renderer.setSize(renderW, renderH, false);
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const outCtx = out.getContext('2d');
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(canvas, 0, 0, w, h);
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = `mockup-${w}x${h}.png`;
  a.click();
  camera.aspect = oldAsp; camera.updateProjectionMatrix();
  renderer.setPixelRatio(oldPR);
  renderer.setSize(oldSz.x, oldSz.y, false);
  scene.background = oldBg;
  applyBg();
  toast(`Exported ${w}×${h}`, 'ok');
}

function handleScreenFile(file) {
  if (!file) return;
  texLoader.load(URL.createObjectURL(file), (tex) => {
    currentTex?.dispose?.();
    currentTex = tex;
    const ok = applyScreenTex(tex);
    if (ok) toast('Screen applied', 'ok');
  }, undefined, () => toast('Failed to load image', 'err'));
}

function fitSegInit() {
  fitSeg.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => { fitSeg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); btn.classList.add('on'); currentFit = btn.dataset.v; if (currentTex) applyScreenTex(currentTex); }));
}

const SNAP_PTS = [-180, -90, 0, 90, 180]; const SNAP_DIST = 8;
function nearestSnap(v) { for (const s of SNAP_PTS) if (Math.abs(v - s) <= SNAP_DIST) return s; return v; }

bgTransBtn.addEventListener('click', () => { bgMode = 'transparent'; bgTransBtn.classList.add('on'); bgSolidBtn.classList.remove('on'); bgColorWrap.style.display = 'none'; applyBg(); });
bgSolidBtn.addEventListener('click', () => { bgMode = 'solid'; bgSolidBtn.classList.add('on'); bgTransBtn.classList.remove('on'); bgColorWrap.style.display = 'block'; applyBg(); });
bgColorPick.addEventListener('input', applyBg);

screenInput.addEventListener('change', (e) => handleScreenFile(e.target.files?.[0]));
screenDZ.addEventListener('dragover', (e) => { e.preventDefault(); screenDZ.classList.add('over'); });
screenDZ.addEventListener('dragleave', () => screenDZ.classList.remove('over'));
screenDZ.addEventListener('drop', (e) => { e.preventDefault(); screenDZ.classList.remove('over'); handleScreenFile(e.dataTransfer.files?.[0]); });
canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && /\.(png|jpe?g|webp)$/i.test(f.name)) handleScreenFile(f); });

fitSegInit();
rotSlider.addEventListener('input', () => { let val = parseInt(rotSlider.value, 10); const snapped = nearestSnap(val); if (snapped !== val) { val = snapped; rotSlider.value = snapped; } screenRot = val; rotVal.textContent = val + '°'; if (currentTex) applyScreenTex(currentTex); });

document.getElementById('p1k').addEventListener('click', () => { exportW.value = 1024; exportH.value = 1024; });
document.getElementById('p2k').addEventListener('click', () => { exportW.value = 2048; exportH.value = 2048; });
document.getElementById('p4k').addEventListener('click', () => { exportW.value = 4096; exportH.value = 4096; });
exportBtn.addEventListener('click', exportPNG);
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(getPreviewPixelRatio()); });

devRow.querySelectorAll('.dev-btn').forEach((btn) => btn.addEventListener('click', () => { const dev = DEVICES[btn.dataset.dev]; if (!dev) return; devRow.querySelectorAll('.dev-btn').forEach((b) => b.classList.remove('active')); btn.classList.add('active'); currentTex?.dispose?.(); currentTex = null; screenRot = 0; rotSlider.value = 0; rotVal.textContent = '0°'; loadModel(dev.file); }));
orbitBtn.addEventListener('click', () => { const on = orbitBtn.classList.toggle('active'); panel.style.pointerEvents = on ? 'none' : ''; document.body.classList.toggle('orbit-mode', on); toast(on ? 'Orbit mode — panel disabled' : 'Panel re-enabled'); });

applyBg(); loadModel(DEVICES.iphone.file);
(function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();
