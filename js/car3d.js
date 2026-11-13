/* Monoplace F1 2026 en 3D (Three.js) : modèle fourni (« F1 2026 concept polygon model », converti en GLB),
   segmenté en zones de livrée et peint aux couleurs de chaque écurie.
   - snapshot(teamId, opts) : image PNG (data URL) mise en cache, utilisée partout sur le site
   - mount(el, teamId, opts) : visionneuse interactive (rotation à la souris / au doigt)
   Repère : x = avant de la voiture, y = haut, z = côté. Unités = mètres (roue de 0,36 m de rayon). */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const F1 = (globalThis.F1 = globalThis.F1 || {});
const MODEL_URL = new URL('../assets/f1-2026.glb', import.meta.url).href;

/* ---------- Modèle : chargé une seule fois, géométries partagées entre toutes les voitures ---------- */
let PARTS = null; // [{ name, geometry }]
let BOUNDS = null;
async function loadModel() {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL);
  const parts = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    // positions quantifiées (meshopt) -> flottants avant d'appliquer la transformation du nœud
    const src = o.geometry.attributes.position;
    const arr = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) { arr[i * 3] = src.getX(i); arr[i * 3 + 1] = src.getY(i); arr[i * 3 + 2] = src.getZ(i); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(o.matrixWorld);
    // normales recalculées avec arêtes vives (ailerons nets, carrosserie lisse)
    // puis ré-indexation : moins de sommets -> couleurs de livrée moins coûteuses à calculer
    const cg = mergeVertices(toCreasedNormals(g, Math.PI / 3.6), 1e-4);
    cg.computeBoundingBox();
    parts.push({ name: o.name, geometry: cg });
  });
  // centrage longitudinal (entre les deux essieux)
  const box = new THREE.Box3();
  parts.forEach((p) => box.union(p.geometry.boundingBox));
  const cx = (box.min.x + box.max.x) / 2;
  parts.forEach((p) => p.geometry.translate(-cx, 0, 0));
  BOUNDS = { x0: box.min.x - cx, x1: box.max.x - cx, y1: box.max.y, z1: Math.max(-box.min.z, box.max.z) };
  PARTS = parts;
}

/* ---------- Livrées ---------- */
const livery = (id) => (F1.visuals && F1.visuals.livery ? F1.visuals.livery(id) : { body: '#e10600', accent: '#111', detail: '#222', helmet: '#fff' });
// Couleur de chaque sommet selon la livrée 2026 de l'écurie (zones, dégradés, filets)
function paintGeometry(part, fn) {
  const pos = part.geometry.attributes.position, nrm = part.geometry.attributes.normal;
  const col = new Uint8Array(pos.count * 3);
  const { x0, x1, y1, z1 } = BOUNDS;
  const c = new THREE.Color();
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - x0) / (x1 - x0), v = pos.getY(i) / y1, s = Math.abs(pos.getZ(i)) / z1;
    const hex = fn(u, v, s, part.name, nrm.getY(i)) || '#101114';
    let rgb = cache.get(hex);
    if (!rgb) { c.set(hex); rgb = [c.r, c.g, c.b].map((x) => Math.round(x * 255)); cache.set(hex, rgb); } // espace linéaire
    col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos);
  g.setAttribute('normal', part.geometry.attributes.normal);
  g.setIndex(part.geometry.index);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  g.boundingSphere = part.geometry.boundingSphere; g.boundingBox = part.geometry.boundingBox;
  return g;
}
function materials(teamId) {
  const L = livery(teamId);
  const LV = F1.visuals && F1.visuals.liveryPaint ? F1.visuals.liveryPaint(teamId) : null;
  const fin = (LV && LV.finish) || { rough: 0.3, clear: 1 };
  const paint = (c, rough = 0.3) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.3, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.05 });
  return {
    LV,
    livery: new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.25, roughness: fin.rough, clearcoat: fin.clear, clearcoatRoughness: 0.06 }),
    body: paint(L.body),
    accent: paint(L.accent, 0.3),
    lower: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(L.body).lerp(new THREE.Color(0x0b0b0e), 0.9), metalness: 0.2, roughness: 0.5, clearcoat: 0.6 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x101114, metalness: 0.2, roughness: 0.55, envMapIntensity: 0.5 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x151517, metalness: 0, roughness: 0.82 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xa9adb5, metalness: 0.75, roughness: 0.3 }),
  };
}
function buildCar(teamId) {
  const M = materials(teamId);
  const car = new THREE.Group();
  for (const p of PARTS) {
    const painted = M.LV && ['body', 'accent', 'lower', 'carbon'].includes(p.name);
    const geo = painted ? paintGeometry(p, M.LV.paint) : p.geometry;
    const m = new THREE.Mesh(geo, painted ? M.livery : (M[p.name] || M.body));
    if (painted) m.userData.ownGeometry = true;
    m.castShadow = true; m.receiveShadow = true;
    car.add(m);
  }
  return car;
}

/* ---------- Scène ---------- */
function makeScene(renderer, teamId, { ground = true } = {}) {
  const scene = new THREE.Scene();
  if (!renderer.__env) renderer.__env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = renderer.__env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202028, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 7, 4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  key.shadow.radius = 6; key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(-5, 3, -4); scene.add(rim);
  if (ground) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.32 }));
    plane.rotation.x = -Math.PI / 2; plane.receiveShadow = true; scene.add(plane);
    // ombre de contact douce sous la voiture
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d'); const gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.002; scene.add(blob);
  }
  const car = buildCar(teamId);
  scene.add(car);
  return { scene, car };
}
const VIEWS = {
  '34': { pos: [5.0, 2.0, -4.9], target: [0.2, 0.2, 0.1], fov: 26 },
  side: { pos: [0, 0.6, 8.2], target: [0, 0.45, 0], fov: 24 },
  front: { pos: [6.6, 1.6, -2.4], target: [0.2, 0.4, 0], fov: 30 },
};
function newRenderer(canvas, w, h) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!canvas.__snap });
  r.setPixelRatio(1); r.setSize(w, h, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setClearColor(0x000000, 0);
  return r;
}

/* ---------- API : images ---------- */
let snapR = null;
const cache = new Map();
function snapshot(teamId, { view = '34', w = 960, h = 520 } = {}) {
  const key = `${teamId}|${view}|${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  if (!snapR) { const c = document.createElement('canvas'); c.__snap = true; snapR = newRenderer(c, w, h); }
  snapR.setSize(w, h, false);
  const { scene, car } = makeScene(snapR, teamId);
  const v = VIEWS[view] || VIEWS['34'];
  const cam = new THREE.PerspectiveCamera(v.fov, w / h, 0.1, 60);
  cam.position.set(...v.pos); cam.lookAt(...v.target);
  snapR.render(scene, cam);
  const url = snapR.domElement.toDataURL('image/png');
  cache.set(key, url);
  scene.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); });
  void car;
  return url;
}

/* ---------- API : visionneuse interactive ---------- */
const viewers = new Set();
function mount(el, teamId, { autoRotate = true, view = '34', speed = 1.2, focus = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'car3d-canvas';
  el.innerHTML = ''; el.appendChild(canvas);
  const size = () => [Math.max(200, el.clientWidth), Math.max(120, el.clientHeight || el.clientWidth * 0.52)];
  let [w, h] = size();
  const r = newRenderer(canvas, w, h);
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(w, h, false);
  const { scene, car } = makeScene(r, teamId);
  const v = VIEWS[view] || VIEWS['34'];
  const cam = new THREE.PerspectiveCamera(v.fov, w / h, 0.1, 60);
  // écran étroit (mobile) : on recule la caméra pour que la voiture tienne en entier
  const fit = (pos, target, k = Math.max(1, Math.min(2, Math.pow(1.9 / (w / h), 0.85)))) => pos.map((p, i) => target[i] + (p - target[i]) * k);
  cam.position.set(...fit(v.pos, v.target));
  const ctl = new OrbitControls(cam, canvas);
  ctl.target.set(...v.target); ctl.enableZoom = false; ctl.enablePan = false; ctl.enableDamping = true;
  ctl.minPolarAngle = 0.6; ctl.maxPolarAngle = 1.45; ctl.autoRotate = autoRotate; ctl.autoRotateSpeed = speed;
  ctl.update();
  // repère lumineux (pièce sélectionnée en R&D)
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const cx = cv.getContext('2d'); const gr = cx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(120,220,255,.95)'); gr.addColorStop(0.45, 'rgba(39,180,244,.35)'); gr.addColorStop(1, 'rgba(39,180,244,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
  marker.visible = false; marker.renderOrder = 10; scene.add(marker);
  let tween = null;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function flyTo(pos, target, ms = 1100) {
    tween = { p0: cam.position.clone(), t0: ctl.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...target), start: performance.now(), ms };
  }
  let alive = true, raf = 0, visible = true;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((e) => { visible = e[0].isIntersecting; }) : null;
  if (io) io.observe(el);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { [w, h] = size(); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }) : null;
  if (ro) ro.observe(el);
  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.start) / tween.ms), e = ease(k);
      cam.position.lerpVectors(tween.p0, tween.p1, e); ctl.target.lerpVectors(tween.t0, tween.t1, e);
      if (k >= 1) tween = null;
    }
    if (marker.visible) { const ph = performance.now() / 500; const sc = 0.32 + Math.sin(ph) * 0.06; marker.scale.set(sc, sc, sc); }
    ctl.update();
    r.render(scene, cam);
  };
  loop();
  const api = {
    // zoom animé sur une pièce : f = { t: [x, y, z] (point visé), d: [dx, dy, dz] (position de la caméra relative) }
    focus(f) {
      if (!f) return api.reset();
      ctl.autoRotate = false; ctl.minPolarAngle = 0.05; ctl.maxPolarAngle = 1.53;
      const t = f.t, d = f.d.map((x) => x * 1.35); // recul léger pour garder la pièce dans son contexte
      flyTo(fit([t[0] + d[0], t[1] + d[1], t[2] + d[2]], t, Math.max(1, Math.min(1.6, Math.pow(1.9 / (w / h), 0.6)))), t);
      marker.position.set(...t); marker.visible = true;
    },
    reset() {
      marker.visible = false;
      flyTo(fit(v.pos, v.target), v.target);
      setTimeout(() => { ctl.minPolarAngle = 0.6; ctl.maxPolarAngle = 1.45; ctl.autoRotate = autoRotate; }, 1150);
    },
    dispose() {
      alive = false; cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect(); ctl.dispose();
      scene.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); });
      r.dispose(); r.forceContextLoss && r.forceContextLoss(); viewers.delete(api);
    },
  };
  viewers.add(api);
  if (focus) setTimeout(() => api.focus(focus), 300);
  return api;
}
function disposeAll() { [...viewers].forEach((v) => v.dispose()); }
function supported() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}

F1.car3d = { snapshot, mount, disposeAll, supported: supported(), ready: false };
if (F1.car3d.supported) {
  loadModel()
    .then(() => { F1.car3d.ready = true; window.dispatchEvent(new Event('car3d-ready')); })
    .catch((e) => { F1.car3d.supported = false; console.warn('[PITWALL] modèle 3D indisponible :', e); });
}
