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
/* ---------- Atelier R&D : vues écorchées, pièces internes, rayons X ----------
   Boîtes exprimées en (x, y, |z|) dans le repère de la voiture (x = avant, y = haut, roues avant x≈1,50, arrière x≈-1,96).
   cut : zone de carrosserie retirée (le « capot » s'efface et flotte au-dessus, translucide)
   glow : zone mise en surbrillance (le reste de la voiture passe en mode rayons X)
   inner : pièce interne qui ressort de la voiture · bay : autres pièces de la même baie (contexte)
   lift : déplacement du capot retiré · cam : [cible x, y, z, décalage caméra dx, dy, dz] */
const BOX = {
  hood: [[-1.62, 0.42, 0], [-0.42, 1.2, 0.5]],
  sidepod: [[-0.45, 0.12, 0.24], [0.75, 0.64, 0.8]],
  gearbox: [[-2.18, 0.12, 0], [-1.42, 0.9, 0.42]],
  exhaust: [[-2.32, 0.42, 0], [-1.3, 0.92, 0.32]],
  fwheel: [[1.08, -0.05, 0.5], [1.92, 0.8, 1.0]],
  rwheel: [[-2.4, -0.05, 0.44], [-1.52, 0.8, 1.0]],
  tank: [[-0.62, 0.12, 0], [0.02, 0.92, 0.32]],
  floor: [[-1.6, -0.02, 0.25], [1.15, 0.12, 0.98]],
};
const HOODCAM = [-1.0, 0.62, 0.05, 1.7, 1.55, 2.0], PODCAM = [0.15, 0.42, 0.5, 1.4, 1.1, 1.9], BOXCAM = [-1.8, 0.5, 0.1, -1.4, 1.2, 1.9];
const FWCAM = [1.42, 0.38, 0.55, 2.1, 1.3, 0.9], RWCAM = [-1.9, 0.4, 0.5, -2.0, 1.3, 0.95];
const PART3D = {
  // Aérodynamique
  fw_main: { glow: [[2.1, -0.02, 0], [2.76, 0.16, 0.97]], cam: [2.35, 0.12, 0.3, 1.5, 0.8, 1.6] },
  fw_gurney: { glow: [[2.02, 0.1, 0], [2.6, 0.32, 0.97]], cam: [2.3, 0.2, 0.45, 1.1, 0.6, 1.3] },
  fw_end: { glow: [[2.1, -0.02, 0.74], [2.76, 0.36, 0.98]], cam: [2.4, 0.16, 0.85, 1.0, 0.5, 1.2] },
  floor: { glow: BOX.floor, cam: [-0.2, 0.05, 0.7, 0.6, 0.55, 2.4] },
  diffuser: { glow: [[-2.76, -0.02, 0], [-1.92, 0.42, 0.64]], cam: [-2.35, 0.2, 0.3, -1.7, 0.45, 1.3] },
  mirrors: { glow: [[0.05, 0.6, 0.22], [0.8, 0.98, 0.64]], cam: [0.45, 0.78, 0.42, 1.0, 0.45, 1.3] },
  rims: { glow: [[1.1, 0, 0.56], [1.9, 0.74, 0.98]], cam: FWCAM },
  sidepods: { glow: BOX.sidepod, cam: PODCAM },
  rw: { glow: [[-2.76, 0.55, 0], [-2.08, 1.1, 0.64]], cam: [-2.4, 0.85, 0.2, -1.8, 0.85, 1.9] },
  active: { glow: [[-2.76, 0.78, 0], [-2.08, 1.1, 0.64]], cam: [-2.4, 0.92, 0.2, -1.3, 0.95, 1.4] },
  // Châssis
  susp_f: { cut: BOX.fwheel, lift: [0, 0.12, 1.45], glow: [[0.8, 0.12, 0.18], [1.75, 0.62, 0.62]], bay: ['brakeF'], cam: FWCAM },
  susp_r: { cut: BOX.rwheel, lift: [0, 0.12, 1.45], glow: [[-2.35, 0.12, 0.16], [-1.45, 0.66, 0.56]], bay: ['brakeR'], cam: RWCAM },
  brakes: { cut: BOX.fwheel, lift: [0, 0.12, 1.45], inner: 'brakeF', cam: FWCAM },
  balance: { glow: [[-1.6, -0.02, 0], [1.4, 0.2, 0.98]], inner: 'ballast', cam: [0.0, 0.1, 0.5, 0.4, 1.4, 2.6] },
  mono: { glow: [[-0.1, 0.05, 0], [1.45, 0.95, 0.3]], cam: [0.7, 0.55, 0.15, 1.1, 1.3, 1.9] },
  halo: { glow: [[-0.15, 0.78, 0], [0.78, 1.04, 0.34]], cam: [0.3, 0.9, 0.1, 1.1, 0.75, 1.4] },
  ballast: { cut: BOX.floor, lift: [0, -0.35, 0], inner: 'ballast', cam: [0.4, 0.15, 0.3, 0.6, 1.2, 1.9] },
  // Chaîne motrice
  ice: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'engine', bay: ['turbo', 'mguk', 'hydraulics'], cam: HOODCAM },
  turbo: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'turbo', bay: ['engine', 'mguk', 'hydraulics'], cam: [-1.45, 0.62, 0.05, -0.2, 1.3, 1.7] },
  airbox: { glow: [[-0.9, 0.82, 0], [-0.3, 1.16, 0.2]], cam: [-0.6, 0.95, 0.05, 0.9, 0.55, 1.2] },
  exhaust: { cut: BOX.exhaust, lift: [0, 0.65, 0], inner: 'exhaust', bay: ['gearbox'], cam: BOXCAM },
  mguk: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'mguk', bay: ['engine', 'turbo', 'hydraulics'], cam: [-0.7, 0.45, 0.2, 1.1, 1.0, 1.7] },
  battery: { cut: BOX.tank, lift: [0, 0.75, 0], inner: 'battery', cam: [-0.3, 0.45, 0.05, 1.3, 1.25, 1.6] },
  maps: { cut: BOX.sidepod, lift: [0, 0.6, 0.15], inner: 'ecu', bay: ['radiators'], cam: PODCAM },
  gearbox_p: { cut: BOX.gearbox, lift: [0, 0.7, 0], inner: 'gearbox', bay: ['exhaust'], cam: BOXCAM },
  // Durabilité
  radiators: { cut: BOX.sidepod, lift: [0, 0.6, 0.15], inner: 'radiators', bay: ['ecu'], cam: PODCAM },
  cooling: { glow: [[-1.55, 0.6, 0.06], [-0.5, 1.02, 0.46]], cam: [-1.0, 0.8, 0.2, 0.9, 1.1, 1.6] },
  hydraulics: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'hydraulics', bay: ['engine', 'turbo', 'mguk'], cam: HOODCAM },
  electronics: { cut: BOX.sidepod, lift: [0, 0.6, 0.15], inner: 'ecu', bay: ['radiators'], cam: PODCAM },
  gearbox_rel: { cut: BOX.gearbox, lift: [0, 0.7, 0], inner: 'gearbox', bay: ['exhaust'], cam: BOXCAM },
  engine_life: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'engine', bay: ['turbo', 'mguk', 'hydraulics'], cam: HOODCAM },
  brake_life: { cut: BOX.fwheel, lift: [0, 0.12, 1.45], inner: 'brakeF', cam: FWCAM },
};

// Uniforms partagés par tous les matériaux d'une voiture (découpe, surbrillance, rayons X)
function xrayUniforms() {
  return {
    uCutMin: { value: new THREE.Vector3() }, uCutMax: { value: new THREE.Vector3() }, uCutT: { value: 0 },
    uGlowMin: { value: new THREE.Vector3() }, uGlowMax: { value: new THREE.Vector3() }, uGlowT: { value: 0 },
    uDim: { value: 0 }, uTime: { value: 0 }, uGlowCol: { value: new THREE.Color(0x38d9ff) },
  };
}
const XRAY_FRAG = `
uniform vec3 uCutMin, uCutMax, uGlowMin, uGlowMax, uGlowCol; uniform float uCutT, uGlowT, uDim, uTime;
varying vec3 vXP;
float xBox(vec3 p, vec3 mn, vec3 mx, float t) { vec3 c = (mn + mx) * 0.5; vec3 h = (mx - mn) * 0.5 * t; vec3 q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
`;
function patchXray(sh, U) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vXP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXP = position;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + XRAY_FRAG)
    .replace('void main() {', `void main() {
  vec3 xp = vec3(vXP.x, vXP.y, abs(vXP.z));
  float cutD = uCutT > 0.001 ? xBox(xp, uCutMin, uCutMax, uCutT) : 1.0;
  if (cutD < 0.0) discard;`)
    .replace('#include <dithering_fragment>', `
  float gD = uGlowT > 0.001 ? xBox(xp, uGlowMin, uGlowMax, 1.0) : 1.0;
  float g = (1.0 - smoothstep(0.0, 0.05, gD)) * uGlowT;
  float pulse = 0.6 + 0.4 * sin(uTime * 3.2);
  vec3 lum = vec3(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, lum * vec3(0.32, 0.38, 0.46), uDim * (1.0 - g));
  float fr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.55 + uGlowCol * 0.35, g * 0.6);
  gl_FragColor.rgb += uGlowCol * g * (0.3 + 0.9 * fr) * pulse;
  float rim = (1.0 - smoothstep(0.0, 0.022, cutD)) * step(0.001, uCutT);
  gl_FragColor.rgb += vec3(1.0, 0.5, 0.12) * rim * 1.6;
  #include <dithering_fragment>`);
}
function applyXray(mat, U) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev.call(mat, sh, r); patchXray(sh, U); };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => key + '|xray';
  mat.needsUpdate = true;
}

// Carrosserie retirée : copie translucide de la zone découpée, qui s'écarte de la voiture
function ghostMaterial(cutMin, cutMax, liftU) {
  const m = new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uCutMin: cutMin, uCutMax: cutMax, uLift: liftU });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLift; varying vec3 vXP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXP = position; transformed += vec3(uLift.x, uLift.y, uLift.z * sign(position.z));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCutMin, uCutMax; varying vec3 vXP;')
      .replace('void main() {', 'void main() {\n  vec3 xp = vec3(vXP.x, vXP.y, abs(vXP.z));\n  if (any(lessThan(xp, uCutMin)) || any(greaterThan(xp, uCutMax))) discard;');
  };
  m.customProgramCacheKey = () => 'pitwall-ghost';
  return m;
}

// Pièces internes (modélisées en code, en coordonnées voiture)
function buildInner() {
  const groups = {};
  const metal = (c = 0x9aa3ad, rough = 0.32) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: rough, emissive: 0x38d9ff, emissiveIntensity: 0 });
  const mk = (id, build) => { const g = new THREE.Group(); g.userData = { id, mats: [] }; build(g, (geo, mat, f) => { const m = new THREE.Mesh(geo, mat); if (f) f(m); m.castShadow = true; g.add(m); g.userData.mats.push(mat); return m; }); g.visible = false; groups[id] = g; return g; };
  const sym = (add, geo, mat, x, y, z, f) => [1, -1].forEach((s) => add(geo, mat, (m) => { m.position.set(x, y, z * s); if (f) f(m, s); }));
  mk('engine', (g, add) => { // V6 turbo à 90° : carter, deux bancs de cylindres, plenum
    const blk = metal(0x8b929c); const head = metal(0x5d636d, 0.4); const red = metal(0xd8261c, 0.35);
    add(new THREE.BoxGeometry(0.62, 0.2, 0.26), blk, (m) => m.position.set(-1.05, 0.38, 0));
    sym(add, new THREE.BoxGeometry(0.6, 0.11, 0.16), head, -1.05, 0.55, 0.13, (m, s) => { m.rotation.x = s * 0.7; });
    sym(add, new THREE.BoxGeometry(0.62, 0.035, 0.1), red, -1.05, 0.62, 0.17, (m, s) => { m.rotation.x = s * 0.7; });
    for (let i = 0; i < 3; i++) sym(add, new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), metal(0x2a2d33, 0.5), -1.25 + i * 0.2, 0.68, 0.2, (m, s) => { m.rotation.x = s * 0.7; });
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 16), metal(0xb7bec7, 0.25), (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.05, 0.66, 0); });
  });
  mk('turbo', (g, add) => { // turbocompresseur : volute + axe + compresseur
    add(new THREE.TorusGeometry(0.075, 0.035, 12, 24), metal(0xc58a3e, 0.3), (m) => { m.rotation.y = Math.PI / 2; m.position.set(-1.46, 0.56, 0); });
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 14), metal(0x8b929c), (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.53, 0.56, 0); });
    add(new THREE.TorusGeometry(0.07, 0.032, 12, 24), metal(0xb7bec7), (m) => { m.rotation.y = Math.PI / 2; m.position.set(-1.62, 0.56, 0); });
  });
  mk('mguk', (g, add) => { // moteur électrique MGU-K (350 kW)
    add(new THREE.CylinderGeometry(0.085, 0.085, 0.22, 20), metal(0x4a6fd0, 0.3), (m) => { m.rotation.x = Math.PI / 2; m.position.set(-0.66, 0.34, 0.16); });
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 16), metal(0xd6dbe2, 0.25), (m) => { m.rotation.x = Math.PI / 2; m.position.set(-0.66, 0.34, 0.16); });
  });
  mk('hydraulics', (g, add) => { // circuits hydrauliques
    const mat = metal(0xffb020, 0.4);
    [[[-1.5, 0.3, 0.12], [-1.2, 0.5, 0.2], [-0.8, 0.45, 0.22], [-0.5, 0.3, 0.12]], [[-1.55, 0.35, -0.1], [-1.1, 0.28, -0.22], [-0.6, 0.36, -0.18]]].forEach((pts) =>
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, 0.014, 8), mat));
  });
  mk('battery', (g, add) => { // batterie (cellules + boîtier)
    add(new THREE.BoxGeometry(0.42, 0.22, 0.42), metal(0x2c3340, 0.45), (m) => m.position.set(-0.3, 0.3, 0));
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.06, 0.03, 0.4), metal(0xf2c230, 0.4), (m) => m.position.set(-0.46 + i * 0.08, 0.425, 0));
  });
  mk('ecu', (g, add) => { // électronique de contrôle
    sym(add, new THREE.BoxGeometry(0.26, 0.07, 0.17), metal(0x1f6b4a, 0.5), 0.12, 0.42, 0.46);
    for (let i = 0; i < 3; i++) sym(add, new THREE.BoxGeometry(0.05, 0.02, 0.05), metal(0x1a1c20, 0.5), 0.05 + i * 0.07, 0.465, 0.46);
  });
  mk('radiators', (g, add) => { // radiateurs (faisceaux à ailettes)
    const fins = document.createElement('canvas'); fins.width = 64; fins.height = 8; const fx = fins.getContext('2d');
    for (let i = 0; i < 64; i += 4) { fx.fillStyle = i % 8 ? '#c6ccd4' : '#7c838d'; fx.fillRect(i, 0, 4, 8); }
    const tex = new THREE.CanvasTexture(fins); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(4, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.7, roughness: 0.4, emissive: 0x38d9ff, emissiveIntensity: 0 });
    sym(add, new THREE.BoxGeometry(0.55, 0.32, 0.05), mat, 0.12, 0.36, 0.52, (m, s) => { m.rotation.y = s * 0.35; m.rotation.x = s * -0.25; });
  });
  mk('gearbox', (g, add) => { // boîte de vitesses (carter + arbres)
    add(new THREE.CylinderGeometry(0.13, 0.19, 0.6, 6), metal(0x6f7680, 0.4), (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.8, 0.36, 0); });
    sym(add, new THREE.CylinderGeometry(0.03, 0.03, 0.48, 10), metal(0xb7bec7), -1.96, 0.36, 0.25, (m) => { m.rotation.x = Math.PI / 2; });
  });
  mk('exhaust', (g, add) => { // échappement
    const mat = metal(0xc9a55a, 0.25);
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-1.3, 0.6, 0], [-1.7, 0.66, 0], [-2.1, 0.63, 0], [-2.36, 0.6, 0]].map((p) => new THREE.Vector3(...p))), 40, 0.045, 12), mat);
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.08, 16), metal(0x2a2d33, 0.5), (m) => { m.rotation.z = Math.PI / 2; m.position.set(-2.38, 0.6, 0); });
  });
  const brake = (id, x, z) => mk(id, (g, add) => { // disque ventilé incandescent + étrier
    const disc = new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.7, roughness: 0.45, emissive: 0xff5a14, emissiveIntensity: 0.6 });
    sym(add, new THREE.CylinderGeometry(0.2, 0.2, 0.035, 36), disc, x, 0.362, z, (m) => { m.rotation.x = Math.PI / 2; });
    sym(add, new THREE.BoxGeometry(0.16, 0.1, 0.06), metal(0xd8261c, 0.35), x - 0.02, 0.52, z, null);
  });
  brake('brakeF', 1.498, 0.66); brake('brakeR', -1.959, 0.6);
  mk('ballast', (g, add) => { for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.16, 0.05, 0.14), metal(0x6b6f76, 0.5), (m) => m.position.set(0.15 + i * 0.2, 0.05, 0)); });
  return groups;
}

function buildCar(teamId, { xray = false } = {}) {
  const M = materials(teamId);
  const car = new THREE.Group();
  const U = xray ? xrayUniforms() : null;
  if (U) Object.values(M).forEach((m) => applyXray(m, U));
  for (const p of PARTS) {
    const m = new THREE.Mesh(p.geometry, M[p.name] || M.body);
    m.castShadow = true; m.receiveShadow = true;
    car.add(m);
  }
  car.userData.xray = U;
  return car;
}

/* ---------- Scène ---------- */
function makeScene(renderer, teamId, { ground = true, xray = false } = {}) {
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
  const car = buildCar(teamId, { xray });
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
function mount(el, teamId, { autoRotate = true, view = '34', speed = 1.2, focus = null, part = null, workshop = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'car3d-canvas';
  el.innerHTML = ''; el.appendChild(canvas);
  const size = () => [Math.max(200, el.clientWidth), Math.max(120, el.clientHeight || el.clientWidth * 0.52)];
  let [w, h] = size();
  const r = newRenderer(canvas, w, h);
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(w, h, false);
  const { scene, car } = makeScene(r, teamId, { xray: workshop });
  const v = VIEWS[view] || VIEWS['34'];
  const cam = new THREE.PerspectiveCamera(v.fov, w / h, 0.1, 60);
  // atelier : pièces internes + carrosserie fantôme
  const U = car.userData.xray;
  const inner = workshop ? buildInner() : {};
  Object.values(inner).forEach((g) => { g.userData.base = g.position.clone(); car.add(g); });
  const ghostCut = { min: { value: new THREE.Vector3() }, max: { value: new THREE.Vector3() }, lift: { value: new THREE.Vector3() } };
  const ghosts = [];
  if (workshop) {
    const gm = ghostMaterial(ghostCut.min, ghostCut.max, ghostCut.lift);
    for (const p of PARTS) { const m = new THREE.Mesh(p.geometry, gm); m.visible = false; m.renderOrder = 5; car.add(m); ghosts.push(m); }
  }
  let anim = null; // animation de la pièce affichée
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
    if (U) {
      const now = performance.now();
      U.uTime.value = now / 1000;
      if (anim) {
        const k = Math.min(1, (now - anim.start) / 900), e = ease(k), e2 = ease(Math.min(1, Math.max(0, (now - anim.start - 350) / 900)));
        const S = anim.spec;
        U.uCutT.value = S && S.cut ? e : 0;
        U.uGlowT.value = S && (S.glow || S.inner) ? e : 0;
        U.uDim.value = S ? 0.78 * e : 0;
        if (S && S.lift) ghostCut.lift.value.set(S.lift[0] * e2, S.lift[1] * e2, S.lift[2] * e2);
        ghosts.forEach((m) => { m.visible = !!(S && S.cut); });
        Object.values(inner).forEach((g) => {
          const main = S && S.inner === g.userData.id, ctx = S && S.bay && S.bay.includes(g.userData.id);
          g.visible = !!(main || ctx);
          if (!g.visible) return;
          const rise = main && S.cut ? 0.32 * e2 : 0;
          g.position.set(g.userData.base.x, g.userData.base.y + rise, g.userData.base.z);
          const pulse = 0.55 + 0.45 * Math.sin(now / 1000 * 3.2);
          g.userData.mats.forEach((m) => { if (m.emissive && m.userData.keepEmissive === undefined) m.emissiveIntensity = main ? 0.12 + 0.28 * pulse * e : 0; });
          g.traverse((o) => { if (o.material) o.material.opacity = 1; });
        });
        if (!S && k >= 1) { anim = null; U.uCutT.value = 0; U.uGlowT.value = 0; U.uDim.value = 0; }
      }
    }
    ctl.update();
    r.render(scene, cam);
  };
  loop();
  const api = {
    // atelier R&D : ouvre la carrosserie / met la pièce en surbrillance / la fait ressortir, puis cadre la caméra
    part(id) {
      const S = id ? PART3D[id] : null;
      if (!U) return S ? api.focus({ t: S.cam.slice(0, 3), d: S.cam.slice(3) }) : api.reset();
      if (S) {
        if (S.cut) { U.uCutMin.value.set(...S.cut[0]); U.uCutMax.value.set(...S.cut[1]); ghostCut.min.value.set(...S.cut[0]); ghostCut.max.value.set(...S.cut[1]); ghostCut.lift.value.set(0, 0, 0); }
        const gb = S.glow || (S.cut && [[S.cut[0][0], S.cut[0][1], S.cut[0][2]], [S.cut[1][0], S.cut[1][1], S.cut[1][2]]]);
        if (S.glow) { U.uGlowMin.value.set(...S.glow[0]); U.uGlowMax.value.set(...S.glow[1]); } else if (gb) { U.uGlowMin.value.set(0, -9, 0); U.uGlowMax.value.set(0, -9, 0); }
        anim = { spec: S, start: performance.now() };
        ctl.autoRotate = false; ctl.minPolarAngle = 0.05; ctl.maxPolarAngle = 1.53;
        const t = S.cam.slice(0, 3), d = S.cam.slice(3);
        flyTo(fit([t[0] + d[0], t[1] + d[1], t[2] + d[2]], t, Math.max(1, Math.min(1.6, Math.pow(1.9 / (w / h), 0.6)))), t);
        marker.visible = false;
      } else {
        anim = { spec: null, start: performance.now() };
        api.reset();
      }
    },
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
  if (part) setTimeout(() => api.part(part), 300);
  else if (focus) setTimeout(() => api.focus(focus), 300);
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
