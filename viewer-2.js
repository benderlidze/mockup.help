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
const iconDropZone = document.getElementById('iconDropZone');
const iconFileInput = document.getElementById('iconFileInput');
const iconList = document.getElementById('iconList');
const iconCount = document.getElementById('iconCount');
const iconActions = document.getElementById('iconActions');
const applyIconToScreenBtn = document.getElementById('applyIconToScreenBtn');
const clearIconSelBtn = document.getElementById('clearIconSelBtn');
const hsToggleBtn = document.getElementById('hsToggleBtn');
const hsPanel = document.getElementById('hsPanel');
const hsPanelClose = document.getElementById('hsPanelClose');
const hsGrid = document.getElementById('hsGrid');
const hsDock = document.getElementById('hsDock');
const hsTime = document.getElementById('hsTime');

const DEVICES = {
  iphone: { file: '/iphone17pro_max.glb', label: 'iPhone' },
  watch: { file: '/apple_watch_ultra_-_orange.glb', label: 'Watch' },
  macbook: { file: '/macbook_pro_m3_16_inch_2024.glb', label: 'MacBook' },
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
let currentFit = 'cover';
let screenRot = 0;
let bgMode = 'transparent';

const ICONS = [];
let activeIconId = null;
let currentHomescreenTex = null;
const ICON_CFG = {
  cols: 4, rows: 6, wallpaper: '#10131a', topPadRatio: 0.14, leftPadRatio: 0.09, rightPadRatio: 0.09, dockHeightRatio: 0.12, iconGapRatio: 0.032, iconRadiusRatio: 0.22, labelGapRatio: 0.12, labelSizeRatio: 0.08, safeTopRatio: 0.065, safeBottomRatio: 0.045,
};

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
    if (currentHomescreenTex) applyScreenTex(currentHomescreenTex);
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
  // UI screenshots are already display-ready sRGB images. Applying the
  // renderer's ACES tone mapping to them lowers contrast and saturation, so
  // keep tone mapping for the phone body but bypass it for the display.
  screenMesh.material = new THREE.MeshBasicMaterial({
    name: 'Uploaded screen',
    map: tex,
    side: THREE.FrontSide,
    toneMapped: false,
  });
  screenMesh.material.needsUpdate = true;
  currentTex = tex;
  return true;
}

function clearScreen() {
  if (!screenMesh || !originalMat) return;
  screenMesh.material = originalMat;
  currentTex?.dispose?.();
  currentTex = null;
  toast('Screen cleared');
}

async function exportPNG() {
  const w = Math.max(256, parseInt(exportW.value, 10) || 2048);
  const h = Math.max(256, parseInt(exportH.value, 10) || 2048);
  const oldSz = new THREE.Vector2(); renderer.getSize(oldSz);
  const oldPR = renderer.getPixelRatio();
  const oldAsp = camera.aspect;
  const oldBg = scene.background;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(canvas, 0, 0, w, h);
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

function updateClock() { hsTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
updateClock(); setInterval(updateClock, 10000);

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * .5, h * .5);
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

function loadImage(url) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; }); }

async function resizeToSquarePng(file, size = 1024) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  const s = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - s) / 2);
  const sy = Math.floor((img.height - s) / 2);
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  return { dataUrl: cvs.toDataURL('image/png') };
}

function updateIconCount() { iconCount.textContent = `${ICONS.length} icon${ICONS.length === 1 ? '' : 's'}`; }
function updateIconActions() { iconActions.style.display = activeIconId ? 'flex' : 'none'; }

function renderIconList() {
  iconList.innerHTML = '';
  ICONS.forEach(icon => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `icon-item${icon.id === activeIconId ? ' active' : ''}`;
    const img = document.createElement('img'); img.src = icon.dataUrl; img.alt = icon.name;
    const del = document.createElement('span'); del.className = 'icon-del'; del.textContent = '×';
    const label = document.createElement('span'); label.className = 'icon-name'; label.textContent = icon.name;
    item.append(img, del, label);
    item.addEventListener('click', () => { activeIconId = activeIconId === icon.id ? null : icon.id; renderIconList(); updateIconActions(); });
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = ICONS.findIndex(x => x.id === icon.id);
      if (idx >= 0) ICONS.splice(idx, 1);
      if (activeIconId === icon.id) activeIconId = null;
      renderIconList(); updateIconCount(); updateIconActions(); renderHomescreenPreview();
      toast('Icon removed');
    });
    iconList.appendChild(item);
  });
}

function renderHomescreenPreview() {
  hsGrid.innerHTML = '';
  hsDock.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const wrap = document.createElement('div'); wrap.className = 'hs-icon-wrap';
    const iconDiv = document.createElement('div'); iconDiv.className = 'hs-icon';
    if (ICONS[i]) {
      const img = document.createElement('img'); img.src = ICONS[i].dataUrl; img.alt = ICONS[i].name; iconDiv.appendChild(img);
      const lbl = document.createElement('div'); lbl.className = 'hs-icon-lbl'; lbl.textContent = ICONS[i].name;
      wrap.append(iconDiv, lbl);
    } else { iconDiv.className = 'hs-icon-empty'; wrap.appendChild(iconDiv); }
    hsGrid.appendChild(wrap);
  }
  for (let i = 0; i < 3; i++) {
    const iconDiv = document.createElement('div'); iconDiv.className = 'hs-icon'; iconDiv.style.width = '32px'; iconDiv.style.height = '32px';
    if (ICONS[i]) { const img = document.createElement('img'); img.src = ICONS[i].dataUrl; img.alt = ICONS[i].name; iconDiv.appendChild(img); }
    hsDock.appendChild(iconDiv);
  }
}

async function renderHomescreenCanvas(width = 1170, height = 2532) {
  const canvas2 = document.createElement('canvas'); canvas2.width = width; canvas2.height = height;
  const ctx = canvas2.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, ICON_CFG.wallpaper); bg.addColorStop(.5, '#0f1624'); bg.addColorStop(1, '#1b1224');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  const safeTop = Math.round(height * ICON_CFG.safeTopRatio);
  const safeBottom = Math.round(height * ICON_CFG.safeBottomRatio);
  const left = Math.round(width * ICON_CFG.leftPadRatio);
  const right = Math.round(width * ICON_CFG.rightPadRatio);
  const top = Math.round(height * ICON_CFG.topPadRatio) + safeTop;
  const dockH = Math.round(height * ICON_CFG.dockHeightRatio);
  const bottom = height - safeBottom - dockH;
  const gapX = Math.round(width * ICON_CFG.iconGapRatio);
  const gapY = Math.round(height * ICON_CFG.iconGapRatio);
  const slotW = width - left - right;
  const iconSize = Math.floor((slotW - gapX * (ICON_CFG.cols - 1)) / ICON_CFG.cols);
  const radius = Math.round(iconSize * ICON_CFG.iconRadiusRatio);
  const labelSize = Math.max(12, Math.round(iconSize * ICON_CFG.labelSizeRatio));
  const rowStep = iconSize + Math.round(iconSize * ICON_CFG.labelGapRatio) + gapY + labelSize;
  const totalGridH = ICON_CFG.rows * rowStep;
  const startY = Math.max(top, Math.floor((bottom - totalGridH) * .42));
  let idx = 0;
  for (let row = 0; row < ICON_CFG.rows; row++) for (let col = 0; col < ICON_CFG.cols; col++) {
    if (!ICONS[idx]) break;
    const x = left + col * (iconSize + gapX), y = startY + row * rowStep;
    const img = await loadImage(ICONS[idx].dataUrl);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.max(8, Math.round(iconSize * .08)); ctx.shadowOffsetY = Math.max(4, Math.round(iconSize * .05)); roundedRectPath(ctx, x, y, iconSize, iconSize, radius); ctx.fillStyle = 'rgba(255,255,255,.02)'; ctx.fill(); ctx.clip(); ctx.drawImage(img, x, y, iconSize, iconSize); ctx.restore();
    ctx.save(); ctx.globalAlpha = .12; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; roundedRectPath(ctx, x + .5, y + .5, iconSize - 1, iconSize - 1, radius - 1); ctx.stroke(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = `${labelSize}px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(ICONS[idx].name, x + iconSize / 2, y + iconSize + Math.round(iconSize * ICON_CFG.labelGapRatio));
    idx++;
  }
  const dockY = height - safeBottom - dockH + Math.round(dockH * .18);
  const dockPadX = Math.round(width * .09);
  const dockInnerW = width - dockPadX * 2;
  const dockItemSize = Math.floor(Math.min(iconSize * .88, (dockInnerW - gapX * 3) / 4));
  const dockX0 = Math.round((width - (dockItemSize * 4 + gapX * 3)) / 2);
  const dockRadius = Math.round(dockItemSize * ICON_CFG.iconRadiusRatio);
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.11)'; roundedRectPath(ctx, dockPadX, dockY - Math.round(dockItemSize * .18), width - dockPadX * 2, dockH - Math.round(dockItemSize * .08), 26); ctx.fill(); ctx.restore();
  for (let i = 0; i < 4; i++) {
    const icon = ICONS[i], x = dockX0 + i * (dockItemSize + gapX), y = dockY;
    if (!icon) { ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.08)'; roundedRectPath(ctx, x, y, dockItemSize, dockItemSize, dockRadius); ctx.fill(); ctx.restore(); continue; }
    const img = await loadImage(icon.dataUrl);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.max(7, Math.round(dockItemSize * .08)); ctx.shadowOffsetY = 3; roundedRectPath(ctx, x, y, dockItemSize, dockItemSize, dockRadius); ctx.fillStyle = 'rgba(255,255,255,.02)'; ctx.fill(); ctx.clip(); ctx.drawImage(img, x, y, dockItemSize, dockItemSize); ctx.restore();
  }
  return canvas2;
}

async function applyHomescreenToScreen() {
  const canvas2 = await renderHomescreenCanvas();
  const dataUrl = canvas2.toDataURL('image/png');
  texLoader.load(dataUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    currentHomescreenTex?.dispose?.(); currentHomescreenTex = tex;
    currentTex?.dispose?.(); currentTex = tex;
    applyScreenTex(tex);
    toast('Homescreen baked to screen', 'ok');
  }, undefined, () => toast('Failed to bake homescreen', 'err'));
}

function bindIconUI() {
  iconDropZone.addEventListener('dragover', e => { e.preventDefault(); iconDropZone.classList.add('over'); });
  iconDropZone.addEventListener('dragleave', () => iconDropZone.classList.remove('over'));
  iconDropZone.addEventListener('drop', async e => { e.preventDefault(); iconDropZone.classList.remove('over'); await addIconsFromFiles(e.dataTransfer.files); });
  iconFileInput.addEventListener('change', async e => { await addIconsFromFiles(e.target.files); e.target.value = ''; });
  applyIconToScreenBtn.addEventListener('click', applyHomescreenToScreen);
  clearIconSelBtn.addEventListener('click', () => { activeIconId = null; renderIconList(); updateIconActions(); });
}

async function addIconsFromFiles(files) {
  const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
  for (const file of arr) {
    try {
      const { dataUrl } = await resizeToSquarePng(file, 1024);
      ICONS.push({ id: `icon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: file.name.replace(/\.[^.]+$/, ''), dataUrl });
    } catch { toast(`Failed: ${file.name}`, 'err'); }
  }
  renderIconList(); updateIconCount(); renderHomescreenPreview(); toast(`Added ${arr.length} icon${arr.length === 1 ? '' : 's'}`, 'ok');
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
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); });

devRow.querySelectorAll('.dev-btn').forEach((btn) => btn.addEventListener('click', () => { const dev = DEVICES[btn.dataset.dev]; if (!dev) return; devRow.querySelectorAll('.dev-btn').forEach((b) => b.classList.remove('active')); btn.classList.add('active'); currentTex?.dispose?.(); currentTex = null; screenRot = 0; rotSlider.value = 0; rotVal.textContent = '0°'; loadModel(dev.file); }));
orbitBtn.addEventListener('click', () => { const on = orbitBtn.classList.toggle('active'); panel.style.pointerEvents = on ? 'none' : ''; document.body.classList.toggle('orbit-mode', on); toast(on ? 'Orbit mode — panel disabled' : 'Panel re-enabled'); });

hsToggleBtn.addEventListener('click', () => { const visible = hsPanel.classList.toggle('visible'); hsToggleBtn.classList.toggle('active', visible); });
hsPanelClose.addEventListener('click', () => { hsPanel.classList.remove('visible'); hsToggleBtn.classList.remove('active'); });
let dragging = false, dx = 0, dy = 0;
document.getElementById('hsPanelHeader').addEventListener('mousedown', (e) => { dragging = true; const rect = hsPanel.getBoundingClientRect(); dx = e.clientX - rect.left; dy = e.clientY - rect.top; });
document.addEventListener('mousemove', (e) => { if (!dragging) return; hsPanel.style.left = (e.clientX - dx) + 'px'; hsPanel.style.top = (e.clientY - dy) + 'px'; hsPanel.style.right = 'auto'; });
document.addEventListener('mouseup', () => { dragging = false; });

window.addEventListener('applyIconToScreen', (e) => { const { dataUrl, name } = e.detail; texLoader.load(dataUrl, (tex) => { currentHomescreenTex?.dispose?.(); currentHomescreenTex = tex; currentTex?.dispose?.(); currentTex = tex; applyScreenTex(tex); toast(`Homescreen applied from ${name}`, 'ok'); }); });

bindIconUI(); updateIconCount(); renderHomescreenPreview(); applyBg(); loadModel(DEVICES.iphone.file);
(function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();
