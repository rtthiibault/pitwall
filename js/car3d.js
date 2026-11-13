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
/* ---------- Peinture des livrées au pixel près (shader) ----------
   Chaque pixel de la carrosserie évalue la liste de règles de l'écurie (zones nettes, dégradés),
   puis un filet fin (≈1,5 px) est tracé à chaque frontière de zone : plus aucune « bavure ». */
const MAXR = 20;
const PART_BIT = { body: 1, accent: 2, lower: 4, carbon: 8 };
const LIVERY_GLSL = `
uniform int uN; uniform float uPart; uniform vec4 uB; uniform vec3 uBase; uniform vec3 uLineCol;
uniform vec4 uR0[${MAXR}]; uniform vec4 uR1[${MAXR}]; uniform vec4 uR2[${MAXR}];
uniform vec4 uR3[${MAXR}]; uniform vec4 uR4[${MAXR}]; uniform vec4 uR5[${MAXR}];
varying vec3 vLP; varying float vNY;
float lvBit(float m, float b) { return mod(floor(m / b + 0.5), 2.0); }
vec3 liveryColor(out float lineA) {
  float u = (vLP.x - uB.x) / (uB.y - uB.x), v = vLP.y / uB.z, s = abs(vLP.z) / uB.w, ny = vNY;
  float fu = max(fwidth(u), 1e-6), fv = max(fwidth(v), 1e-6), fs = max(fwidth(s), 1e-6);
  lineA = 0.0;
  for (int i = 0; i < ${MAXR}; i++) {
    if (i >= uN) break;
    vec4 a = uR0[i], b = uR1[i], h = uR2[i], c1 = uR3[i], c2 = uR4[i], g = uR5[i];
    if (lvBit(c2.w, uPart) < 0.5) continue;
    if (u < a.x || u > a.y || v < a.z || v > a.w || s < b.x || s > b.y || ny < b.z || ny > b.w) continue;
    float hv = h.x * u + h.y * v + h.z;
    if (h.w > 0.5 && hv < 0.0) continue;
    vec3 col = c1.rgb;
    if (g.x > 0.5) { float t = g.x < 1.5 ? u : v; col = mix(c1.rgb, c2.rgb, smoothstep(g.y, g.z, t)); }
    if (c1.w > 0.5) {
      float e = 1e3;
      if (a.x > -5.0) e = min(e, (u - a.x) / fu);
      if (a.y < 5.0) e = min(e, (a.y - u) / fu);
      if (a.z > -5.0) e = min(e, (v - a.z) / fv);
      if (a.w < 5.0) e = min(e, (a.w - v) / fv);
      if (b.x > -5.0) e = min(e, (s - b.x) / fs);
      if (b.y < 5.0) e = min(e, (b.y - s) / fs);
      if (h.w > 0.5) e = min(e, hv / max(abs(h.x) * fu + abs(h.y) * fv, 1e-6));
      lineA = 1.0 - smoothstep(0.6, 1.7, e);
    }
    return col;
  }
  return uBase;
}
`;
function ruleUniforms(rules) {
  const z = () => Array.from({ length: MAXR }, () => new THREE.Vector4());
  const R0 = z(), R1 = z(), R2 = z(), R3 = z(), R4 = z(), R5 = z();
  const lin = (hex) => new THREE.Color(hex);
  rules.slice(0, MAXR).forEach((r, i) => {
    const rg = (k) => r[k] || [-9, 9];
    const [ul, uh] = rg('u'), [vl, vh] = rg('v'), [sl, sh] = rg('s'), [nl, nh] = rg('ny');
    R0[i].set(ul, uh, vl, vh); R1[i].set(sl, sh, nl, nh);
    if (r.h) R2[i].set(r.h[0], r.h[1], r.h[2], 1); else R2[i].set(0, 0, 0, 0);
    const c1 = lin(r.c), c2 = lin(r.c2 || r.c);
    const mask = (r.parts || ['body']).reduce((m, p) => m + (PART_BIT[p] || 0), 0);
    const hasBounds = ['u', 'v', 's'].some((k) => r[k]) || !!r.h;
    R3[i].set(c1.r, c1.g, c1.b, r.line !== false && hasBounds ? 1 : 0);
    R4[i].set(c2.r, c2.g, c2.b, mask);
    R5[i].set(r.g === 'u' ? 1 : r.g === 'v' ? 2 : 0, r.a || 0, r.b || 1, 0);
  });
  return { uN: { value: Math.min(rules.length, MAXR) }, uR0: { value: R0 }, uR1: { value: R1 }, uR2: { value: R2 }, uR3: { value: R3 }, uR4: { value: R4 }, uR5: { value: R5 } };
}
function liveryMaterial(def, part, fin) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.25, roughness: fin.rough, clearcoat: fin.clear, clearcoatRoughness: 0.06 });
  m.extensions = { derivatives: true };
  const ru = ruleUniforms(def.rules);
  const extra = {
    ...ru, uPart: { value: PART_BIT[part] }, uB: { value: new THREE.Vector4(BOUNDS.x0, BOUNDS.x1, BOUNDS.y1, BOUNDS.z1) },
    uBase: { value: new THREE.Color(part === 'carbon' ? 0x101114 : 0x111114) }, uLineCol: { value: new THREE.Color(def.line || '#0b0b0d') },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, extra);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLP; varying float vNY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position; vNY = normal.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LIVERY_GLSL)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float lvLine; vec3 lvCol = liveryColor(lvLine); lvCol = mix(lvCol, uLineCol, lvLine * 0.92); vec4 diffuseColor = vec4( lvCol, opacity );');
  };
  m.customProgramCacheKey = () => 'pitwall-livery';
  return m;
}
function materials(teamId) {
  const L = livery(teamId);
  const def = F1.visuals && F1.visuals.liveryRules ? F1.visuals.liveryRules(teamId) : null;
  const fin = (def && def.finish) || { rough: 0.3, clear: 1 };
  const paint = (c, rough = 0.3) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.3, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.05 });
  const M = {
    body: paint(L.body),
    accent: paint(L.accent, 0.3),
    lower: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(L.body).lerp(new THREE.Color(0x0b0b0e), 0.9), metalness: 0.2, roughness: 0.5, clearcoat: 0.6 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x101114, metalness: 0.2, roughness: 0.55, envMapIntensity: 0.5 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x151517, metalness: 0, roughness: 0.82 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xa9adb5, metalness: 0.75, roughness: 0.3 }),
  };
  if (def) for (const p of ['body', 'accent', 'lower', 'carbon']) M[p] = liveryMaterial(def, p, p === 'carbon' ? { rough: 0.5, clear: 0.4 } : fin);
  return M;
}
function buildCar(teamId) {
  const M = materials(teamId);
  const car = new THREE.Group();
  for (const p of PARTS) {
    const m = new THREE.Mesh(p.geometry, M[p.name] || M.body);
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
/* ---------- Scène « drift » pilotée par le scroll ----------
   Un virage vu de haut : la monoplace entre en glisse (angle de dérive + contre-braquage),
   fume des pneus arrière et laisse des traces de gomme. getP() renvoie la progression 0 -> 1. */
function mountDrift(el, teamId, getP) {
  const canvas = document.createElement('canvas');
  canvas.className = 'car3d-canvas';
  el.innerHTML = ''; el.appendChild(canvas);
  const size = () => [Math.max(240, el.clientWidth), Math.max(200, el.clientHeight)];
  let [w, h] = size();
  const r = newRenderer(canvas, w, h);
  r.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1)); r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  const { scene, car } = makeScene(r, teamId, { ground: false });
  scene.fog = new THREE.Fog(0x0f1115, 18, 46); // le sol se fond dans le fond de la section
  // le plateau d'ombre doit suivre la voiture : on ajoute un sol d'ombre large
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.38 }));
  shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.position.y = 0.004; shadowFloor.receiveShadow = true; scene.add(shadowFloor);
  const key = scene.children.find((o) => o.isDirectionalLight && o.castShadow);
  if (key) { Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); key.shadow.camera.updateProjectionMatrix(); scene.add(key.target); }

  // tracé du virage (épingle large)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-34, 0, 14), new THREE.Vector3(-14, 0, 12), new THREE.Vector3(2, 0, 7),
    new THREE.Vector3(10, 0, -3), new THREE.Vector3(7, 0, -14), new THREE.Vector3(-6, 0, -20), new THREE.Vector3(-28, 0, -22),
  ], false, 'catmullrom', 0.5);
  const N = 240, HW = 6.2;
  const pos = [], idx = [], uv = [];
  const pts = curve.getSpacedPoints(N), up = new THREE.Vector3(0, 1, 0);
  const side = (i) => { const t = curve.getTangentAt(i / N); return new THREE.Vector3().crossVectors(up, t).normalize(); };
  for (let i = 0; i <= N; i++) {
    const n = side(i), p = pts[i];
    pos.push(p.x + n.x * HW, 0.001, p.z + n.z * HW, p.x - n.x * HW, 0.001, p.z - n.z * HW);
    uv.push(0, i / 8, 1, i / 8);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const road = new THREE.BufferGeometry();
  road.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); road.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); road.setIndex(idx); road.computeVertexNormals();
  // asphalte (texture de grain procédurale)
  const tc = document.createElement('canvas'); tc.width = tc.height = 256;
  const tx = tc.getContext('2d'); tx.fillStyle = '#3a3d44'; tx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const g = 30 + Math.random() * 40; tx.fillStyle = `rgba(${g},${g},${g + 4},${0.35 + Math.random() * 0.4})`; tx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  const asphaltTex = new THREE.CanvasTexture(tc); asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping; asphaltTex.colorSpace = THREE.SRGBColorSpace;
  const roadMesh = new THREE.Mesh(road, new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
  roadMesh.receiveShadow = true; scene.add(roadMesh);
  // lignes blanches de bord et vibreurs rouge/blanc à la corde et à l'extérieur
  const strip = (offset, width, y, from, to, mat) => {
    const P = [], I = [];
    for (let i = from; i <= to; i++) {
      const n = side(i), p = pts[i];
      P.push(p.x + n.x * (offset + width / 2), y, p.z + n.z * (offset + width / 2), p.x + n.x * (offset - width / 2), y, p.z + n.z * (offset - width / 2));
      if (i < to) { const a = (i - from) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  };
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e9ea, roughness: 0.7, side: THREE.DoubleSide }), red = new THREE.MeshStandardMaterial({ color: 0xd8191f, roughness: 0.6, side: THREE.DoubleSide });
  strip(HW - 0.35, 0.3, 0.003, 0, N, white); strip(-HW + 0.35, 0.3, 0.003, 0, N, white);
  const kerb = (offset, from, to) => { for (let i = from; i < to; i += 3) strip(offset, 1.3, 0.006, i, Math.min(i + 3, to), ((i - from) / 3) % 2 ? white : red); };
  kerb(-HW - 0.65, 70, 170); kerb(HW + 0.65, 40, 90); kerb(HW + 0.65, 150, 200);
  // herbe autour du circuit (assombrie, pour rester dans la palette du site)
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x0c1410, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.01; grass.receiveShadow = true; scene.add(grass);

  // fumée des pneus
  const sc = document.createElement('canvas'); sc.width = sc.height = 64;
  const sx = sc.getContext('2d'); const sg = sx.createRadialGradient(32, 32, 2, 32, 32, 31);
  sg.addColorStop(0, 'rgba(235,235,240,.55)'); sg.addColorStop(1, 'rgba(235,235,240,0)'); sx.fillStyle = sg; sx.fillRect(0, 0, 64, 64);
  const smokeTex = new THREE.CanvasTexture(sc);
  const smoke = Array.from({ length: 140 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false; sp.userData = { life: 0 }; scene.add(sp); return sp;
  });
  let smokeI = 0;
  // traces de gomme (marques sombres laissées par les roues arrière)
  const skidMat = new THREE.MeshBasicMaterial({ color: 0x08080a, transparent: true, opacity: 0.4, depthWrite: false });
  const skidGeo = new THREE.PlaneGeometry(0.34, 0.26); skidGeo.rotateX(-Math.PI / 2);
  const skids = Array.from({ length: 1400 }, () => { const m = new THREE.Mesh(skidGeo, skidMat); m.visible = false; m.position.y = 0.008; scene.add(m); return m; });
  let skidI = 0;
  const lastSkid = [null, null];

  scene.add(car);
  car.position.set(0, 0, 0);
  const cam = new THREE.PerspectiveCamera(38, w / h, 0.3, 400);
  let alive = true, raf = 0, visible = true, sp = 0, prevP = -1, prevT = performance.now();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((e) => { visible = e[0].isIntersecting; }) : null;
  if (io) io.observe(el);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { [w, h] = size(); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }) : null;
  if (ro) ro.observe(el);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const rearL = new THREE.Vector3(-1.7, 0.02, 0.78), rearR = new THREE.Vector3(-1.7, 0.02, -0.78);
  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - prevT) / 1000); prevT = now;
    if (!visible || document.hidden) return;
    const target = Math.max(0, Math.min(1, getP()));
    sp += (target - sp) * Math.min(1, dt * 6);               // inertie
    const t = 0.03 + sp * 0.94;
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const heading = Math.atan2(-tan.z, tan.x);
    // courbure locale -> intensité du drift
    const t2 = Math.min(1, t + 0.02), tan2 = curve.getTangentAt(t2);
    let turn = Math.atan2(-tan2.z, tan2.x) - heading; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const drift = Math.max(-0.75, Math.min(0.75, turn * 9));
    car.position.set(p.x, 0, p.z);
    car.rotation.y = heading + drift;
    // caméra : 3/4 haut, légèrement à l'extérieur du virage, qui suit la voiture
    const kz = Math.max(1, Math.min(2.2, 1.5 / (w / h))); // écran étroit : caméra plus éloignée
    camPos.set(p.x + (-tan.x * 6 + 5) * kz, 6.2 * kz, p.z + (-tan.z * 6 + 6) * kz);
    if (prevP < 0) cam.position.copy(camPos); else cam.position.lerp(camPos, Math.min(1, dt * 3));
    camLook.set(p.x + tan.x * 3, 0.4, p.z + tan.z * 3);
    cam.lookAt(camLook);
    if (key) { key.position.set(p.x + 3, 9, p.z + 4); key.target.position.set(p.x, 0, p.z); }
    // fumée et gomme quand la voiture glisse
    const speed = Math.abs(target - prevP) / Math.max(dt, 1e-3);
    if (Math.abs(drift) <= 0.18) { lastSkid[0] = lastSkid[1] = null; }
    if (prevP >= 0 && Math.abs(drift) > 0.18 && speed > 0.02) {
      car.updateMatrixWorld();
      [rearL, rearR].forEach((wpt, k) => {
        tmp.copy(wpt).applyMatrix4(car.matrixWorld);
        const s = smoke[smokeI++ % smoke.length];
        s.position.set(tmp.x + (Math.random() - 0.5) * 0.4, 0.35, tmp.z + (Math.random() - 0.5) * 0.4);
        s.userData.life = 1; s.userData.v = 0.6 + Math.random() * 0.8; s.visible = true;
        const last = lastSkid[k];
        if (!last) lastSkid[k] = tmp.clone();
        else if (last.distanceTo(tmp) > 0.12) {
          // trace continue : un segment étiré entre la position précédente et l'actuelle
          const d = last.distanceTo(tmp);
          if (d < 4) {
            const m = skids[skidI++ % skids.length];
            m.position.set((last.x + tmp.x) / 2, 0.008 + (skidI % 7) * 0.0002, (last.z + tmp.z) / 2);
            m.rotation.y = Math.atan2(-(tmp.z - last.z), tmp.x - last.x);
            m.scale.set((d + 0.08) / 0.34, 1, 1); m.visible = true;
          }
          lastSkid[k] = tmp.clone();
        }
      });
    }
    smoke.forEach((s) => {
      if (!s.visible) return;
      const d = s.userData; d.life -= dt * 0.7;
      if (d.life <= 0) { s.visible = false; return; }
      const sc2 = 1.2 + (1 - d.life) * 4.5; s.scale.set(sc2, sc2, 1);
      s.position.y += dt * d.v; s.material.opacity = d.life * 0.55;
    });
    prevP = target;
    r.render(scene, cam);
  };
  loop();
  const api = {
    dispose() {
      alive = false; cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect();
      scene.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry !== skidGeo && !PARTS.some((pp) => pp.geometry === o.geometry)) o.geometry.dispose(); });
      r.dispose(); r.forceContextLoss && r.forceContextLoss(); viewers.delete(api);
    },
  };
  viewers.add(api);
  return api;
}
function disposeAll() { [...viewers].forEach((v) => v.dispose()); }
function supported() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}

F1.car3d = { snapshot, mount, mountDrift, disposeAll, supported: supported(), ready: false };
if (F1.car3d.supported) {
  loadModel()
    .then(() => { F1.car3d.ready = true; window.dispatchEvent(new Event('car3d-ready')); })
    .catch((e) => { F1.car3d.supported = false; console.warn('[PITWALL] modèle 3D indisponible :', e); });
}
