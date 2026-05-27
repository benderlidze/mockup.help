import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// ИЗМЕНЕНИЕ: Добавлен загрузчик для HDRI
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'; 

const canvas            = document.getElementById('canvas');
const fileInput         = document.getElementById('fileInput');
const screenInput       = document.getElementById('screenInput');
const bgImageInput      = document.getElementById('bgImageInput');
// ИЗМЕНЕНИЯ: новые элементы DOM
const hdriInput         = document.getElementById('hdriInput');      
const hdriBgToggle      = document.getElementById('hdriBgToggle');   
const envIntSlider      = document.getElementById('envIntSlider');   
const envIntVal         = document.getElementById('envIntVal');      

const meshNameInput     = document.getElementById('meshName');
const materialNameInput = document.getElementById('materialName');
const resetBtn          = document.getElementById('resetBtn');
const fitBtn            = document.getElementById('fitBtn');
const centerBtn         = document.getElementById('centerBtn');
const clearScreenBtn    = document.getElementById('clearScreenBtn');
const bgModeEl          = document.getElementById('bgMode');
const bgColor1          = document.getElementById('bgColor1');
const bgColor2          = document.getElementById('bgColor2');
const gradientDir       = document.getElementById('gradientDir');
const pickModeBtn       = document.getElementById('pickModeBtn');
const highlightBtn      = document.getElementById('highlightBtn');
const applyScreenBtn    = document.getElementById('applyScreenBtn');
const fitCoverBtn       = document.getElementById('fitCoverBtn');
const fitContainBtn     = document.getElementById('fitContainBtn');
const fitStretchBtn     = document.getElementById('fitStretchBtn');
const preset1Btn        = document.getElementById('preset1Btn');
const preset2Btn        = document.getElementById('preset2Btn');
const preset4Btn        = document.getElementById('preset4Btn');
const exportBtn         = document.getElementById('exportBtn');
const exportWidth       = document.getElementById('exportWidth');
const exportHeight      = document.getElementById('exportHeight');
const transparentExport = document.getElementById('transparentExport');
const meshListEl        = document.getElementById('meshList');
const exposureSlider    = document.getElementById('exposureSlider');
const exposureVal       = document.getElementById('exposureVal');
const ambientSlider     = document.getElementById('ambientSlider');
const ambientVal        = document.getElementById('ambientVal');
const envPreset         = document.getElementById('envPreset');
const autoRotateToggle  = document.getElementById('autoRotateToggle');
const toastsEl          = document.getElementById('toasts');

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0b0f');

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.8, 3.2);

const pmrem = new THREE.PMREMGenerator(renderer);
const defaultEnvironment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environment = defaultEnvironment;
scene.environmentIntensity = 1.0;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3, 4, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.setScalar(2048);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x89a8ff, 0.85);
fillLight.position.set(-4, 1.5, -2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.65);
rimLight.position.set(0, 2, -4);
scene.add(rimLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 10;

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
loader.setDRACOLoader(draco);
const textureLoader = new THREE.TextureLoader();

let modelRoot           = null;
let currentObjectURL    = null;
let currentScreenTex    = null;
let currentBgTex        = null;
let currentHdriEnv      = null; // ИЗМЕНЕНИЕ: Хранилище для HDRI
let currentFit          = 'cover';
let pickMode            = false;
let highlightOn         = true;
let selectedMesh        = null;
let selectionOutline    = null;
const originalMaterials = new Map();

const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();
const clock     = new THREE.Clock();

function toast(msg, type = 'inf', ms = 2800) {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg; toastsEl.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms);
}

function applyBackground() {
  // ИЗМЕНЕНИЕ: Логика отображения HDRI на фоне
  if (hdriBgToggle.checked && currentHdriEnv) {
    scene.background = currentHdriEnv;
    renderer.setClearColor(0x000000, 1);
    return;
  }

  if (bgModeEl.value === 'transparent') {
    scene.background = null; renderer.setClearColor(0x000000, 0); return;
  }
  if (currentBgTex) {
    scene.background = currentBgTex; renderer.setClearColor(0x000000, 1); return;
  }
  if (bgModeEl.value === 'gradient') {
    scene.background = new THREE.CanvasTexture(makeGradCanvas(bgColor1.value.replace('#', ''), bgColor2.value.replace('#', '')));
    renderer.setClearColor(0x000000, 1);
  } else {
    const c = new THREE.Color(bgColor1.value); scene.background = c; renderer.setClearColor(c, 1);
  }
}

function makeGradCanvas(c1, c2) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const ctx = cv.getContext('2d');
  const dir = gradientDir.value;
  const g = dir === 'horizontal' ? ctx.createLinearGradient(0,0,64,0) : dir === 'diagonal' ? ctx.createLinearGradient(0,0,64,64) : ctx.createLinearGradient(0,0,0,64);
  g.addColorStop(0, '#' + c1); g.addColorStop(1, '#' + c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return cv;
}

function disposeMat(mat) {
  if (!mat) return;
  for (const k in mat) { const v = mat[k]; if (v?.isTexture) v.dispose?.(); }
  mat.dispose?.();
}

function clearModel() {
  if (!modelRoot) return;
  clearOutline(); scene.remove(modelRoot);
  modelRoot.traverse((obj) => {
    obj.geometry?.dispose?.();
    if (obj.material) { (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(disposeMat); }
  });
  modelRoot = null; selectedMesh = null; originalMaterials.clear();
  meshListEl.innerHTML = '<div class="mi" style="color:var(--text-dim)">No model loaded</div>';
}

function normalizeModel(root) {
  const box  = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const cen  = box.getCenter(new THREE.Vector3());
  root.position.sub(cen);
  root.scale.setScalar(2 / (Math.max(size.x, size.y, size.z) || 1));
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
}

function fitCamera(obj3d) {
  const box  = new THREE.Box3().setFromObject(obj3d);
  const size = box.getSize(new THREE.Vector3());
  const cen  = box.getCenter(new THREE.Vector3());
  const maxD = Math.max(size.x, size.y, size.z);
  const fov  = camera.fov * (Math.PI / 180);
  const z    = Math.abs(maxD / 2 / Math.tan(fov / 2)) * 1.7;
  camera.position.set(cen.x, cen.y + maxD * 0.12, cen.z + z);
  camera.near = Math.max(maxD / 100, 0.01); camera.far  = Math.max(maxD * 20, 100);
  camera.updateProjectionMatrix(); controls.target.copy(cen); controls.update();
}

function loadModel(url) {
  toast('Loading model…', 'inf');
  loader.load(url, (gltf) => {
    clearModel(); modelRoot = gltf.scene; normalizeModel(modelRoot); scene.add(modelRoot); fitCamera(modelRoot);
    modelRoot.traverse((obj) => {
      if (!obj.isMesh) return;
      originalMaterials.set(obj, Array.isArray(obj.material) ? obj.material.map(m => m.clone()) : obj.material.clone());
    });
    refreshMeshList(); if (currentScreenTex) applyScreenTex(currentScreenTex);
    toast('Model loaded!', 'ok');
  }, undefined, (err) => { console.error(err); toast('Failed to load — use GLB/GLTF.', 'err'); });
}

function refreshMeshList() {
  if (!modelRoot) return;
  const meshes = []; modelRoot.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) { meshListEl.innerHTML = '<div class="mi" style="color:var(--text-dim)">No meshes</div>'; return; }
  meshListEl.innerHTML = '';
  meshes.forEach((m) => {
    const el  = document.createElement('div');
    el.className = 'mi' + (m === selectedMesh ? ' sel' : '');
    el.innerHTML = `<span class="mn">${esc(m.name || '(unnamed)')}</span><span class="mm">${esc(m.material?.name || '—')}</span>`;
    el.addEventListener('click', () => {
      selectedMesh = m; meshNameInput.value = m.name || meshNameInput.value; materialNameInput.value = m.material?.name || materialNameInput.value;
      updateOutline(); refreshMeshList(); toast(`Selected: ${m.name || '(unnamed)'}`, 'inf');
    });
    meshListEl.appendChild(el);
  });
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function clearOutline() {
  if (!selectionOutline) return;
  selectionOutline.parent?.remove(selectionOutline);
  selectionOutline.geometry?.dispose?.(); selectionOutline.material?.dispose?.(); selectionOutline = null;
}

function updateOutline() {
  clearOutline(); if (!selectedMesh || !highlightOn) return;
  try {
    const edges = new THREE.EdgesGeometry(selectedMesh.geometry, 12);
    selectionOutline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xe8a020 }));
    selectedMesh.add(selectionOutline);
  } catch (_) { }
}

function findTarget(root, mq, matq) {
  const q1 = (mq || '').trim().toLowerCase(); const q2 = (matq || '').trim().toLowerCase();
  if (selectedMesh) { let found = false; root.traverse((o) => { if (o === selectedMesh) found = true; }); if (found) return selectedMesh; }
  let exact = null, partial = null;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const names  = [obj.name, obj.parent?.name].filter(Boolean).map(s => s.toLowerCase());
    const matName = (obj.material?.name || '').toLowerCase();
    if (!exact && q1 && names.some(n => n === q1)) exact = obj;
    if (!exact && q2 && matName === q2) exact = obj;
    if (!partial && q1 && (names.some(n => n.includes(q1)) || matName.includes(q1))) partial = obj;
    if (!partial && q2 && matName.includes(q2)) partial = obj;
  });
  return exact || partial;
}

function fitTexToTarget(tex, mode) {
  tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  if (mode === 'stretch') { tex.repeat.set(1, 1); tex.offset.set(0, 0); return; }
  const img = tex.image; if (!img?.width || !img?.height) return;
  const ia = img.width / img.height; const sa = 1; 
  if (mode === 'cover') {
    if (ia > sa) { const s = sa / ia; tex.repeat.set(1, s); tex.offset.set(0, (1 - s) / 2); }
    else { const s = ia / sa; tex.repeat.set(s, 1); tex.offset.set((1 - s) / 2, 0); }
  } else { 
    if (ia > sa) { const s = ia / sa; tex.repeat.set(1 / s, 1); tex.offset.set((1 - 1/s) / 2, 0); }
    else { const s = sa / ia; tex.repeat.set(1, 1 / s); tex.offset.set(0, (1 - 1/s) / 2); }
  }
}

function applyScreenTex(tex) {
  if (!modelRoot || !tex) return false;
  const target = findTarget(modelRoot, meshNameInput.value, materialNameInput.value);
  if (!target) return false;
  fitTexToTarget(tex, currentFit);
  target.material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
  target.material.needsUpdate = true; selectedMesh = target; updateOutline(); refreshMeshList(); return true;
}

function clearScreen() {
  if (!modelRoot) return;
  originalMaterials.forEach((mat, mesh) => { if (mesh.parent || mesh === modelRoot) { mesh.material = Array.isArray(mat) ? mat : mat; } });
  currentScreenTex?.dispose?.(); currentScreenTex = null; clearOutline(); selectedMesh = null; refreshMeshList(); toast('Screen cleared', 'inf');
}

async function exportPNG() {
  const w  = Math.max(256, parseInt(exportWidth.value  || '2048', 10));
  const h  = Math.max(256, parseInt(exportHeight.value || '2048', 10));
  const tp = transparentExport.checked;
  toast('Rendering…', 'inf', 3500);

  const oldSz = new THREE.Vector2(); renderer.getSize(oldSz);
  const oldPR = renderer.getPixelRatio(); const oldAsp = camera.aspect; const oldBg = scene.background;

  scene.background = tp ? null : scene.background;
  if (tp) renderer.setClearColor(0x000000, 0); else applyBackground();

  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); controls.update(); renderer.render(scene, camera);

  const url  = renderer.domElement.toDataURL('image/png');
  const link = document.createElement('a'); link.href = url; link.download = `mockup-${w}x${h}${tp ? '-transparent' : ''}.png`; link.click();

  camera.aspect = oldAsp; camera.updateProjectionMatrix(); renderer.setPixelRatio(oldPR); renderer.setSize(oldSz.x, oldSz.y, false);
  scene.background = oldBg; applyBackground();
  toast(`Exported ${w}×${h}`, 'ok');
}

function handleModel(file) {
  if (!file) return; if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
  currentObjectURL = URL.createObjectURL(file); loadModel(currentObjectURL);
}

function handleScreen(file) {
  if (!file) return; if (!modelRoot) { toast('Load a model first.', 'err'); return; }
  textureLoader.load(URL.createObjectURL(file), (tex) => {
    currentScreenTex?.dispose?.(); currentScreenTex = tex; const ok = applyScreenTex(tex);
    toast(ok ? 'Screen texture applied!' : 'Target mesh not found.', ok ? 'ok' : 'err');
  }, undefined, () => toast('Failed to load image.', 'err'));
}

function handleBg(file) {
  if (!file) return;
  textureLoader.load(URL.createObjectURL(file), (tex) => {
    currentBgTex?.dispose?.(); currentBgTex = tex; currentBgTex.colorSpace = THREE.SRGBColorSpace; currentBgTex.needsUpdate = true; applyBackground();
  });
}

// ИЗМЕНЕНИЕ: Функция для загрузки HDRI
function handleHDRI(file) {
  if (!file) return;
  toast('Loading HDRI…', 'inf');
  const url = URL.createObjectURL(file);
  new RGBELoader().load(url, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    currentHdriEnv = texture;
    scene.environment = texture;
    applyBackground(); // Обновит фон, если активна нужная галочка
    toast('HDRI lighting applied!', 'ok');
  }, undefined, (err) => {
    console.error(err);
    toast('Failed to load HDRI.', 'err');
  });
}

function makeDZ(id, handler) {
  const el = document.getElementById(id); if (!el) return;
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) handler(f); });
}

makeDZ('modelDZ',  handleModel);
makeDZ('screenDZ', handleScreen);
makeDZ('bgDZ',     handleBg);
makeDZ('hdriDZ',   handleHDRI); // Привязка HDRI-зоны

canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', (e) => {
  e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (!f) return;
  const ext = f.name.split('.').pop().toLowerCase();
  if (['glb','gltf'].includes(ext)) handleModel(f);
  else if (['png','jpg','jpeg','webp'].includes(ext)) handleScreen(f);
  else if (ext === 'hdr') handleHDRI(f); // Обработка HDRI на холсте
});

fileInput.addEventListener('change',   (e) => handleModel(e.target.files?.[0]));
screenInput.addEventListener('change', (e) => handleScreen(e.target.files?.[0]));
bgImageInput.addEventListener('change',(e) => handleBg(e.target.files?.[0]));
hdriInput.addEventListener('change',   (e) => handleHDRI(e.target.files?.[0]));
hdriBgToggle.addEventListener('change', applyBackground);

applyScreenBtn.addEventListener('click', () => {
  if (!currentScreenTex || !modelRoot) return toast('Load a model and a screen image first.', 'err');
  const ok = applyScreenTex(currentScreenTex); toast(ok ? 'Screen texture applied!' : 'Target not found.', ok ? 'ok' : 'err');
});
clearScreenBtn.addEventListener('click', clearScreen);
resetBtn.addEventListener('click', () => { camera.position.set(0, 0.8, 3.2); controls.target.set(0, 0, 0); controls.update(); });
fitBtn.addEventListener('click', () => { if (modelRoot) fitCamera(modelRoot); });
centerBtn.addEventListener('click', () => { if (modelRoot) { normalizeModel(modelRoot); fitCamera(modelRoot); } });

bgModeEl.addEventListener('change', applyBackground);
bgColor1.addEventListener('input', () => { currentBgTex = null; applyBackground(); });
bgColor2.addEventListener('input', () => { currentBgTex = null; applyBackground(); });
gradientDir.addEventListener('change', () => { currentBgTex = null; applyBackground(); });

meshNameInput.addEventListener('change', () => { if (currentScreenTex && modelRoot) { const ok = applyScreenTex(currentScreenTex); toast(ok ? 'Reapplied.' : 'Mesh not found.', ok ? 'ok' : 'err'); } });
materialNameInput.addEventListener('change', () => { if (currentScreenTex && modelRoot) { const ok = applyScreenTex(currentScreenTex); toast(ok ? 'Reapplied.' : 'Material not found.', ok ? 'ok' : 'err'); } });

function setFit(mode) {
  currentFit = mode; [fitCoverBtn, fitContainBtn, fitStretchBtn].forEach(b => b.classList.remove('active'));
  ({ cover: fitCoverBtn, contain: fitContainBtn, stretch: fitStretchBtn })[mode].classList.add('active');
  if (currentScreenTex && modelRoot) applyScreenTex(currentScreenTex);
}
fitCoverBtn.addEventListener('click', () => setFit('cover')); fitContainBtn.addEventListener('click', () => setFit('contain')); fitStretchBtn.addEventListener('click', () => setFit('stretch'));

preset1Btn.addEventListener('click', () => { exportWidth.value = 1920; exportHeight.value = 1080; });
preset2Btn.addEventListener('click', () => { exportWidth.value = 2560; exportHeight.value = 1440; });
preset4Btn.addEventListener('click', () => { exportWidth.value = 3840; exportHeight.value = 2160; });
exportBtn.addEventListener('click', exportPNG);

pickModeBtn.addEventListener('click', () => { pickMode = !pickMode; pickModeBtn.textContent = `◎ Pick: ${pickMode ? 'ON' : 'OFF'}`; pickModeBtn.classList.toggle('act', pickMode); if (pickMode) toast('Click a mesh in the viewport', 'inf'); });
highlightBtn.addEventListener('click', () => { highlightOn = !highlightOn; highlightBtn.textContent = `⬡ Outline: ${highlightOn ? 'ON' : 'OFF'}`; highlightBtn.classList.toggle('act', highlightOn); highlightOn ? updateOutline() : clearOutline(); });

exposureSlider.addEventListener('input', () => { const v = parseFloat(exposureSlider.value); renderer.toneMappingExposure = v; exposureVal.textContent = v.toFixed(2); });
ambientSlider.addEventListener('input', () => { const v = parseFloat(ambientSlider.value); ambientLight.intensity = v; ambientVal.textContent = v.toFixed(2); });

// ИЗМЕНЕНИЕ: Слушатель для ползунка интенсивности HDRI
envIntSlider.addEventListener('input', () => {
  const v = parseFloat(envIntSlider.value);
  scene.environmentIntensity = v;
  envIntVal.textContent = v.toFixed(2);
});

envPreset.addEventListener('change', () => {
  const p = envPreset.value;
  if (p === 'room') { keyLight.intensity = 2.2; fillLight.intensity = 0.85; rimLight.intensity = 0.65; keyLight.color.set(0xffffff); fillLight.color.set(0x89a8ff); }
  else if (p === 'neutral') { keyLight.intensity = 1.8; fillLight.intensity = 1.2; rimLight.intensity = 0.4; keyLight.color.set(0xfff8f0); fillLight.color.set(0xe0eeff); }
  else if (p === 'dramatic') { keyLight.intensity = 3.8; fillLight.intensity = 0.15; rimLight.intensity = 1.4; keyLight.color.set(0xffffff); fillLight.color.set(0x101030); }
});

function updatePtr(ev) {
  const r = renderer.domElement.getBoundingClientRect(); pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1; pointer.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);
}
function allMeshes(root) { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; }

renderer.domElement.addEventListener('pointermove', (ev) => { if (!pickMode || !modelRoot) return; updatePtr(ev); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(allMeshes(modelRoot), true); renderer.domElement.style.cursor = hit.length ? 'crosshair' : 'default'; });
renderer.domElement.addEventListener('pointerdown', (ev) => { if (!pickMode || ev.button !== 0 || !modelRoot) return; updatePtr(ev); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(allMeshes(modelRoot), true); if (!hit.length) return; selectedMesh = hit[0].object; meshNameInput.value = selectedMesh.name || meshNameInput.value; materialNameInput.value = selectedMesh.material?.name || materialNameInput.value; updateOutline(); refreshMeshList(); toast(`Picked: ${selectedMesh.name || '(unnamed)'}`, 'ok'); });

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); });

applyBackground();
(function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (autoRotateToggle.checked && modelRoot) { modelRoot.rotation.y += delta * 0.5; }
  controls.update(); renderer.render(scene, camera);
})();