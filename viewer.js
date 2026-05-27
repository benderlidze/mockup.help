import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// DOM Elements
const canvas = document.getElementById('canvas');
const fileInput = document.getElementById('fileInput');
const screenInput = document.getElementById('screenInput');
const meshNameInput = document.getElementById('meshName');
const materialNameInput = document.getElementById('materialName');
const resetBtn = document.getElementById('resetBtn');
const fitBtn = document.getElementById('fitBtn');
const clearScreenBtn = document.getElementById('clearScreenBtn');
const bgModeEl = document.getElementById('bgMode');
const bgColor1 = document.getElementById('bgColor1');
const colorRow = document.getElementById('colorRow');
const pickModeBtn = document.getElementById('pickModeBtn');
const highlightBtn = document.getElementById('highlightBtn');
const applyScreenBtn = document.getElementById('applyScreenBtn');
const fitCoverBtn = document.getElementById('fitCoverBtn');
const fitContainBtn = document.getElementById('fitContainBtn');
const fitStretchBtn = document.getElementById('fitStretchBtn');
const exportBtn = document.getElementById('exportBtn');
const exportWidth = document.getElementById('exportWidth');
const exportHeight = document.getElementById('exportHeight');
const meshListEl = document.getElementById('meshList');
const exposureSlider = document.getElementById('exposureSlider');
const exposureVal = document.getElementById('exposureVal');
const ambientSlider = document.getElementById('ambientSlider');
const ambientVal = document.getElementById('ambientVal');
const autoRotateToggle = document.getElementById('autoRotateToggle');
const screenRotation = document.getElementById('screenRotation');
const screenRotVal = document.getElementById('screenRotVal');
const toastsEl = document.getElementById('toasts');

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Scene & Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.8, 3.2);

// Environment & Lights
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3, 4, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x89a8ff, 0.85);
fillLight.position.set(-4, 1.5, -2);
scene.add(fillLight);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 10;

// Loaders
const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
loader.setDRACOLoader(draco);
const textureLoader = new THREE.TextureLoader();

// State
let modelRoot = null;
let currentScreenTex = null;
let currentFit = 'cover';
let pickMode = false;
let highlightOn = true;
let selectedMesh = null;
let selectionOutline = null;
const originalMaterials = new Map();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

// UI Utils
function toast(msg, type = 'inf') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastsEl.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// Background logic
function applyBackground() {
  if (bgModeEl.value === 'transparent') {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    colorRow.style.display = 'none';
  } else {
    const c = new THREE.Color(bgColor1.value);
    scene.background = c;
    renderer.setClearColor(c, 1);
    colorRow.style.display = 'block';
  }
}
bgModeEl.addEventListener('change', applyBackground);
bgColor1.addEventListener('input', applyBackground);

// Model Logic
function clearModel() {
  if (!modelRoot) return;
  clearOutline();
  scene.remove(modelRoot);
  modelRoot.traverse((obj) => {
    obj.geometry?.dispose?.();
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose?.());
  });
  modelRoot = null;
  selectedMesh = null;
  originalMaterials.clear();
  meshListEl.innerHTML = '<div class="mi">No model loaded</div>';
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

function fitCamera(obj3d) {
  const box = new THREE.Box3().setFromObject(obj3d);
  const size = box.getSize(new THREE.Vector3());
  const cen = box.getCenter(new THREE.Vector3());
  const maxD = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const z = Math.abs(maxD / 2 / Math.tan(fov / 2)) * 1.7;
  camera.position.set(cen.x, cen.y + maxD * 0.12, cen.z + z);
  controls.target.copy(cen);
  controls.update();
}

function loadModel(url) {
  loader.load(url, (gltf) => {
    clearModel();
    modelRoot = gltf.scene;
    normalizeModel(modelRoot);
    scene.add(modelRoot);
    fitCamera(modelRoot);

    modelRoot.traverse((obj) => {
      if (obj.isMesh) originalMaterials.set(obj, Array.isArray(obj.material) ? obj.material.map(m => m.clone()) : obj.material.clone());
    });

    refreshMeshList();
    if (currentScreenTex) applyScreenTex(currentScreenTex);
  });
}

function refreshMeshList() {
  if (!modelRoot) return;
  const meshes = [];
  modelRoot.traverse((o) => { if (o.isMesh) meshes.push(o); });
  meshListEl.innerHTML = '';
  meshes.forEach((m) => {
    const el = document.createElement('div');
    el.className = 'mi' + (m === selectedMesh ? ' sel' : '');
    el.innerHTML = `<span>${esc(m.name || 'Unnamed')}</span><span style="opacity:0.5">${esc(m.material?.name || '')}</span>`;
    el.onclick = () => {
      selectedMesh = m;
      meshNameInput.value = m.name || meshNameInput.value;
      materialNameInput.value = m.material?.name || materialNameInput.value;
      updateOutline(); refreshMeshList();
    };
    meshListEl.appendChild(el);
  });
}

// Outline
function clearOutline() {
  if (!selectionOutline) return;
  selectionOutline.parent?.remove(selectionOutline);
  selectionOutline.geometry?.dispose?.();
  selectionOutline.material?.dispose?.();
  selectionOutline = null;
}

function updateOutline() {
  clearOutline();
  if (!selectedMesh || !highlightOn) return;
  try {
    const edges = new THREE.EdgesGeometry(selectedMesh.geometry, 12);
    selectionOutline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
    selectedMesh.add(selectionOutline);
  } catch (_) {}
}

// Screen Logic
function findTarget(root) {
  if (selectedMesh) return selectedMesh;
  let exact = null;
  const q1 = meshNameInput.value.toLowerCase(), q2 = materialNameInput.value.toLowerCase();
  root.traverse((obj) => {
    if (!obj.isMesh || exact) return;
    const names = [obj.name, obj.parent?.name].filter(Boolean).map(s => s.toLowerCase());
    const matName = (obj.material?.name || '').toLowerCase();
    if (names.includes(q1) || matName === q2) exact = obj;
  });
  return exact;
}

function updateTextureTransform() {
  if (!currentScreenTex) return;
  const tex = currentScreenTex;
  tex.center.set(0.5, 0.5); // Center origin for rotation/scale
  
  // Rotation
  const rotDeg = parseFloat(screenRotation.value);
  tex.rotation = THREE.MathUtils.degToRad(rotDeg);
  
  // Fit calculation
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  if (currentFit === 'stretch') {
    tex.repeat.set(1, 1);
  } else {
    const img = tex.image;
    if (img?.width && img?.height) {
      const ia = img.width / img.height;
      const sa = 1; // Assuming 1:1 UV mapping
      if (currentFit === 'cover') {
        if (ia > sa) tex.repeat.set(1, sa / ia);
        else tex.repeat.set(ia / sa, 1);
      } else { // contain
        if (ia > sa) tex.repeat.set(ia / sa, 1);
        else tex.repeat.set(1, sa / ia);
      }
    }
  }
  tex.needsUpdate = true;
}

function applyScreenTex(tex) {
  if (!modelRoot || !tex) return false;
  const target = findTarget(modelRoot);
  if (!target) return false;
  
  updateTextureTransform();
  tex.colorSpace = THREE.SRGBColorSpace;
  
  target.material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
  target.material.needsUpdate = true;
  selectedMesh = target;
  updateOutline(); refreshMeshList();
  return true;
}

function clearScreen() {
  if (!modelRoot) return;
  originalMaterials.forEach((mat, mesh) => {
    if (mesh.parent || mesh === modelRoot) mesh.material = Array.isArray(mat) ? mat : mat;
  });
  currentScreenTex?.dispose?.();
  currentScreenTex = null;
  clearOutline(); selectedMesh = null; refreshMeshList();
}

// Rotation listener
screenRotation.addEventListener('input', () => {
  screenRotVal.textContent = `${screenRotation.value}°`;
  if (currentScreenTex) updateTextureTransform();
});

// UI Events
function setFit(mode) {
  currentFit = mode;
  [fitCoverBtn, fitContainBtn, fitStretchBtn].forEach(b => b.classList.remove('act'));
  ({ cover: fitCoverBtn, contain: fitContainBtn, stretch: fitStretchBtn })[mode].classList.add('act');
  if (currentScreenTex) updateTextureTransform();
}
fitCoverBtn.onclick = () => setFit('cover');
fitContainBtn.onclick = () => setFit('contain');
fitStretchBtn.onclick = () => setFit('stretch');

applyScreenBtn.onclick = () => applyScreenTex(currentScreenTex);
clearScreenBtn.onclick = clearScreen;
resetBtn.onclick = () => { camera.position.set(0, 0.8, 3.2); controls.target.set(0,0,0); };
fitBtn.onclick = () => { if (modelRoot) { normalizeModel(modelRoot); fitCamera(modelRoot); } };

fileInput.onchange = (e) => {
  const f = e.target.files?.[0];
  if (f) loadModel(URL.createObjectURL(f));
};

screenInput.onchange = (e) => {
  const f = e.target.files?.[0];
  if (!f || !modelRoot) return;
  textureLoader.load(URL.createObjectURL(f), (tex) => {
    currentScreenTex?.dispose?.();
    currentScreenTex = tex;
    applyScreenTex(tex);
  });
};

// Drag & Drop
['modelDZ', 'screenDZ'].forEach(id => {
  const el = document.getElementById(id);
  el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = (e) => {
    e.preventDefault(); el.classList.remove('over');
    const f = e.dataTransfer.files?.[0];
    if (f) {
      if (id === 'modelDZ') loadModel(URL.createObjectURL(f));
      else {
        textureLoader.load(URL.createObjectURL(f), (tex) => {
          currentScreenTex = tex; applyScreenTex(tex);
        });
      }
    }
  };
});

// Pick / Outline
pickModeBtn.onclick = () => {
  pickMode = !pickMode;
  pickModeBtn.textContent = `Pick: ${pickMode ? 'ON' : 'OFF'}`;
  pickModeBtn.classList.toggle('act', pickMode);
};
highlightBtn.onclick = () => {
  highlightOn = !highlightOn;
  highlightBtn.textContent = `Outline: ${highlightOn ? 'ON' : 'OFF'}`;
  highlightBtn.classList.toggle('act', highlightOn);
  highlightOn ? updateOutline() : clearOutline();
};

renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (!pickMode || ev.button !== 0 || !modelRoot) return;
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  
  const meshes = []; modelRoot.traverse(o => { if (o.isMesh) meshes.push(o); });
  const hit = raycaster.intersectObjects(meshes, true);
  if (hit.length) {
    selectedMesh = hit[0].object;
    meshNameInput.value = selectedMesh.name;
    materialNameInput.value = selectedMesh.material?.name || '';
    updateOutline(); refreshMeshList();
    toast('Mesh selected');
  }
});

// Settings
exposureSlider.oninput = () => { renderer.toneMappingExposure = parseFloat(exposureSlider.value); exposureVal.textContent = exposureSlider.value; };
ambientSlider.oninput = () => { ambientLight.intensity = parseFloat(ambientSlider.value); ambientVal.textContent = ambientSlider.value; };

// Export PNG (Always transparent)
exportBtn.onclick = () => {
  toast('Rendering...');
  const w = parseInt(exportWidth.value || '2048');
  const h = parseInt(exportHeight.value || '2048');
  
  const oldSz = new THREE.Vector2(); renderer.getSize(oldSz);
  const oldPR = renderer.getPixelRatio();
  const oldAsp = camera.aspect;
  const oldBg = scene.background;

  // Force transparent render
  scene.background = null;
  renderer.setClearColor(0x000000, 0);

  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  renderer.render(scene, camera);

  const link = document.createElement('a');
  link.href = renderer.domElement.toDataURL('image/png');
  link.download = `mockup-${w}x${h}.png`;
  link.click();

  // Restore
  camera.aspect = oldAsp; camera.updateProjectionMatrix();
  renderer.setPixelRatio(oldPR); renderer.setSize(oldSz.x, oldSz.y, false);
  scene.background = oldBg;
  applyBackground();
};

window.onresize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

applyBackground();

(function animate() {
  requestAnimationFrame(animate);
  if (autoRotateToggle.checked && modelRoot) modelRoot.rotation.y += clock.getDelta() * 0.5;
  controls.update();
  renderer.render(scene, camera);
})();