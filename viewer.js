import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader }   from 'three/addons/loaders/DRACOLoader.js';

// ── DOM ───────────────────────────────────────────────────────────────
const canvas      = document.getElementById('canvas');
const statusEl    = document.getElementById('status');
const bgTransBtn  = document.getElementById('bgTransBtn');
const bgSolidBtn  = document.getElementById('bgSolidBtn');
const bgColorWrap = document.getElementById('bgColorWrap');
const bgColorPick = document.getElementById('bgColorPick');
const screenDZ    = document.getElementById('screenDZ');
const screenInput = document.getElementById('screenInput');
const fitSeg      = document.getElementById('fitSeg');
const rotSeg      = document.getElementById('rotSeg');
const applyBtn    = document.getElementById('applyBtn');
const clearBtn    = document.getElementById('clearBtn');
const exportW     = document.getElementById('exportW');
const exportH     = document.getElementById('exportH');
const exportBtn   = document.getElementById('exportBtn');
const toastsEl    = document.getElementById('toasts');

// ── Renderer ──────────────────────────────────────────────────────────
// NOTE: no preserveDrawingBuffer — we render right before toDataURL instead.
// Removing it avoids the GPU stall that made orbit feel sluggish.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// ── Scene / Camera ────────────────────────────────────────────────────
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  45, window.innerWidth / window.innerHeight, 0.005, 100
);
camera.position.set(0, 0.8, 3.2);

// ── Environment ───────────────────────────────────────────────────────
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
pmrem.dispose();

// ── Lights ────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 1.35));
const keyLight  = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x89a8ff, 0.85);
fillLight.position.set(-4, 1.5, -2);
scene.add(fillLight);
const rimLight  = new THREE.DirectionalLight(0xffffff, 0.65);
rimLight.position.set(0, 2, -4);
scene.add(rimLight);

// ── Controls ──────────────────────────────────────────────────────────
// enableDamping = false  →  no input lag / sluggishness
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.minDistance   = 0.5;
controls.maxDistance   = 12;
controls.panSpeed      = 0.8;
controls.rotateSpeed   = 0.8;
controls.zoomSpeed     = 1.0;

// ── Loaders ───────────────────────────────────────────────────────────
const gltfLoader = new GLTFLoader();
const draco      = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
gltfLoader.setDRACOLoader(draco);
const texLoader = new THREE.TextureLoader();

// ── State ─────────────────────────────────────────────────────────────
let modelRoot   = null;
let screenMesh  = null;   // mesh named "screen"
let originalMat = null;   // saved original material
let currentTex  = null;
let currentFit  = 'cover';
let screenRot   = 0;      // texture rotation degrees: 0 | 90 | 180 | 270
let bgMode      = 'transparent';

// ── Helpers ───────────────────────────────────────────────────────────
function toast(msg, type = '', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastsEl.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 280);
  }, ms);
}

function setStatus(text, cls = '') {
  statusEl.textContent = text;
  statusEl.className   = cls;
}

// ── Background ────────────────────────────────────────────────────────
function applyBg() {
  if (bgMode === 'transparent') {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
  } else {
    const c = new THREE.Color(bgColorPick.value);
    scene.background = c;
    renderer.setClearColor(c, 1);
  }
}

// ── Model helpers ─────────────────────────────────────────────────────
function normalizeModel(root) {
  const box  = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const cen  = box.getCenter(new THREE.Vector3());
  root.position.sub(cen);
  root.scale.setScalar(2 / (Math.max(size.x, size.y, size.z) || 1));
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
}

function fitCamera(obj) {
  const box  = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const cen  = box.getCenter(new THREE.Vector3());
  const maxD = Math.max(size.x, size.y, size.z);
  const fov  = camera.fov * (Math.PI / 180);
  const z    = (maxD / 2 / Math.tan(fov / 2)) * 1.7;
  camera.position.set(cen.x, cen.y + maxD * 0.12, cen.z + z);
  camera.near = Math.max(maxD / 100, 0.005);
  camera.far  = Math.max(maxD * 20, 100);
  camera.updateProjectionMatrix();
  controls.target.copy(cen);
}

function findScreenMesh(root) {
  let found = null;
  root.traverse((obj) => {
    if (!obj.isMesh || found) return;
    const name = (obj.name           || '').toLowerCase();
    const mat  = (obj.material?.name || '').toLowerCase();
    const par  = (obj.parent?.name   || '').toLowerCase();
    if (name.includes('screen') || mat.includes('screen') || par.includes('screen')) {
      found = obj;
    }
  });
  return found;
}

// ── Load model ────────────────────────────────────────────────────────
function loadModel(url) {
  setStatus('Loading…');
  gltfLoader.load(
    url,
    (gltf) => {
      if (modelRoot) {
        scene.remove(modelRoot);
        modelRoot.traverse((o) => { o.geometry?.dispose?.(); });
      }
      modelRoot = gltf.scene;
      normalizeModel(modelRoot);
      scene.add(modelRoot);
      fitCamera(modelRoot);

      screenMesh = findScreenMesh(modelRoot);
      if (screenMesh) {
        originalMat = Array.isArray(screenMesh.material)
          ? screenMesh.material.map((m) => m.clone())
          : screenMesh.material.clone();
        setStatus('Ready', 'ok');
      } else {
        setStatus('No "screen" mesh', 'err');
        toast('Mesh "screen" not found in model', 'err', 5000);
      }

      if (currentTex) applyScreenTex(currentTex);
    },
    undefined,
    (err) => {
      console.error(err);
      setStatus('Load failed', 'err');
      toast('Failed to load iphone17pro_max.glb', 'err', 5000);
    }
  );
}

// ── Screen texture ────────────────────────────────────────────────────
function fitTex(tex, mode, rotDeg) {
  tex.needsUpdate = true;
  tex.colorSpace  = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  // Rotate the texture around its center
  tex.rotation = rotDeg * (Math.PI / 180);
  tex.center.set(0.5, 0.5);

  if (mode === 'stretch') {
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    return;
  }

  const img = tex.image;
  if (!img?.width || !img?.height) return;

  // For 90°/270° the image visually swaps dimensions
  const swapped = rotDeg === 90 || rotDeg === 270;
  const iw = swapped ? img.height : img.width;
  const ih = swapped ? img.width  : img.height;
  const ia = iw / ih;     // effective image aspect
  const sa = 1;           // screen UV aspect (1:1 assumed)

  if (mode === 'cover') {
    if (ia > sa) {
      const s = sa / ia;
      tex.repeat.set(1, s);
      tex.offset.set(0, (1 - s) / 2);
    } else {
      const s = ia / sa;
      tex.repeat.set(s, 1);
      tex.offset.set((1 - s) / 2, 0);
    }
  } else {
    // contain
    if (ia > sa) {
      const s = ia / sa;
      tex.repeat.set(1 / s, 1);
      tex.offset.set((1 - 1/s) / 2, 0);
    } else {
      const s = sa / ia;
      tex.repeat.set(1, 1 / s);
      tex.offset.set(0, (1 - 1/s) / 2);
    }
  }
}

function applyScreenTex(tex) {
  if (!screenMesh) { toast('Mesh "screen" not found', 'err'); return false; }
  fitTex(tex, currentFit, screenRot);
  screenMesh.material = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.FrontSide,
  });
  screenMesh.material.needsUpdate = true;
  return true;
}

function clearScreen() {
  if (!screenMesh || !originalMat) return;
  screenMesh.material = originalMat;
  currentTex?.dispose?.();
  currentTex = null;
  toast('Screen cleared');
}

// ── Export PNG (always transparent) ───────────────────────────────────
async function exportPNG() {
  const w = Math.max(256, parseInt(exportW.value, 10) || 2048);
  const h = Math.max(256, parseInt(exportH.value, 10) || 2048);

  // Save state
  const oldSz  = new THREE.Vector2(); renderer.getSize(oldSz);
  const oldPR  = renderer.getPixelRatio();
  const oldAsp = camera.aspect;
  const oldBg  = scene.background;

  // Render transparent at target size
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.render(scene, camera);   // render right before capture — no preserveDrawingBuffer needed

  // Copy to output canvas (single synchronous call — buffer still valid)
  const out = document.createElement('canvas');
  out.width  = w;
  out.height = h;
  out.getContext('2d').drawImage(canvas, 0, 0, w, h);

  const a = document.createElement('a');
  a.href     = out.toDataURL('image/png');
  a.download = `mockup-${w}x${h}.png`;
  a.click();

  // Restore
  camera.aspect = oldAsp;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(oldPR);
  renderer.setSize(oldSz.x, oldSz.y, false);
  scene.background = oldBg;
  applyBg();

  toast(`Exported ${w}×${h}`, 'ok');
}

// ── File handler ──────────────────────────────────────────────────────
function handleScreenFile(file) {
  if (!file) return;
  texLoader.load(
    URL.createObjectURL(file),
    (tex) => {
      currentTex?.dispose?.();
      currentTex = tex;
      const ok = applyScreenTex(tex);
      if (ok) toast('Screen applied', 'ok');
    },
    undefined,
    () => toast('Failed to load image', 'err')
  );
}

// ── Events ────────────────────────────────────────────────────────────

// Background
bgTransBtn.addEventListener('click', () => {
  bgMode = 'transparent';
  bgTransBtn.classList.add('on');
  bgSolidBtn.classList.remove('on');
  bgColorWrap.style.display = 'none';
  applyBg();
});
bgSolidBtn.addEventListener('click', () => {
  bgMode = 'solid';
  bgSolidBtn.classList.add('on');
  bgTransBtn.classList.remove('on');
  bgColorWrap.style.display = 'block';
  applyBg();
});
bgColorPick.addEventListener('input', applyBg);

// Screen drop
screenInput.addEventListener('change', (e) => handleScreenFile(e.target.files?.[0]));
screenDZ.addEventListener('dragover',  (e) => { e.preventDefault(); screenDZ.classList.add('over'); });
screenDZ.addEventListener('dragleave', ()  => screenDZ.classList.remove('over'));
screenDZ.addEventListener('drop', (e) => {
  e.preventDefault();
  screenDZ.classList.remove('over');
  handleScreenFile(e.dataTransfer.files?.[0]);
});
canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files?.[0];
  if (f && /\.(png|jpe?g|webp)$/i.test(f.name)) handleScreenFile(f);
});

// Fit
fitSeg.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    fitSeg.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    currentFit = btn.dataset.v;
    if (currentTex) applyScreenTex(currentTex);
  });
});

// Screen rotation
rotSeg.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    rotSeg.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    screenRot = parseInt(btn.dataset.v, 10);
    if (currentTex) applyScreenTex(currentTex);
  });
});

// Apply / Clear
applyBtn.addEventListener('click', () => {
  if (!currentTex) { toast('No image loaded', 'err'); return; }
  const ok = applyScreenTex(currentTex);
  if (ok) toast('Applied', 'ok');
});
clearBtn.addEventListener('click', clearScreen);

// Size presets
document.getElementById('p1k').addEventListener('click', () => { exportW.value = 1024; exportH.value = 1024; });
document.getElementById('p2k').addEventListener('click', () => { exportW.value = 2048; exportH.value = 2048; });
document.getElementById('p4k').addEventListener('click', () => { exportW.value = 4096; exportH.value = 4096; });

// Export
exportBtn.addEventListener('click', exportPNG);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ── Init ──────────────────────────────────────────────────────────────
applyBg();
loadModel('/iphone17pro_max.glb');

// ── Render loop ───────────────────────────────────────────────────────
(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();