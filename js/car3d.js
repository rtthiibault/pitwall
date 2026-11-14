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
  ice: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'engine', bay: ['turbo', 'mguk', 'manifolds', 'plenum'], cam: HOODCAM },
  turbo: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'turbo', bay: ['engine', 'manifolds', 'plenum'], cam: [-1.5, 0.62, 0.05, -0.2, 1.3, 1.7] },
  airbox: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'plenum', bay: ['engine', 'manifolds'], cam: [-0.8, 0.9, 0.05, 1.2, 0.9, 1.6] },
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
  engine_life: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'engine', bay: ['turbo', 'mguk', 'manifolds', 'plenum'], cam: HOODCAM },
  brake_life: { cut: BOX.fwheel, lift: [0, 0.12, 1.45], inner: 'brakeF', cam: FWCAM },
  // Stratégie & équipe
  launch: { cut: BOX.gearbox, lift: [0, 0.7, 0], inner: 'gearbox', bay: ['exhaust'], cam: BOXCAM },
  tyres: { glow: [[-2.4, 0, 0.55], [-1.5, 0.74, 0.99]], cam: RWCAM },
  push: { cut: BOX.tank, lift: [0, 0.75, 0], inner: 'battery', cam: [-0.3, 0.45, 0.05, 1.3, 1.25, 1.6] },
  pitcrew: { cut: BOX.fwheel, lift: [0, 0.12, 1.45], inner: 'brakeF', cam: FWCAM },
  radio: { glow: [[-0.15, 0.6, 0], [0.78, 1.04, 0.34]], cam: [0.3, 0.9, 0.1, 1.1, 0.75, 1.4] },
  simu: { glow: [[-0.1, 0.05, 0], [1.45, 0.95, 0.3]], cam: [0.7, 0.55, 0.15, 1.1, 1.3, 1.9] },
  // Efficacité des flux
  nose: { glow: [[1.75, 0.05, 0], [2.76, 0.5, 0.3]], cam: [2.2, 0.3, 0.1, 1.5, 0.8, 1.5] },
  floor_edge: { glow: [[-1.6, -0.02, 0.62], [1.15, 0.14, 0.99]], cam: [-0.2, 0.05, 0.8, 0.6, 0.55, 2.4] },
  brake_ducts: { cut: BOX.fwheel, lift: [0, 0.12, 1.45], inner: 'brakeF', cam: FWCAM },
  engine_cover: { glow: [[-1.9, 0.4, 0], [-0.5, 1.12, 0.42]], cam: [-1.2, 0.7, 0.2, 0.2, 1.1, 2.3] },
  beam_wing: { glow: [[-2.76, 0.3, 0], [-2.1, 0.62, 0.64]], cam: [-2.4, 0.45, 0.2, -1.6, 0.7, 1.5] },
  // Liaisons au sol
  dampers: { cut: [[0.95, 0.38, 0], [1.6, 0.8, 0.34]], lift: [0, 0.6, 0], inner: 'dampers', bay: ['steering'], cam: [1.25, 0.52, 0.05, 1.3, 1.1, 1.3] },
  arb: { cut: [[0.95, 0.38, 0], [1.6, 0.8, 0.34]], lift: [0, 0.6, 0], inner: 'dampers', bay: ['steering'], cam: [1.35, 0.5, 0.05, 1.1, 1.1, 1.2] },
  steering: { cut: [[0.95, 0.24, 0], [1.6, 0.8, 0.34]], lift: [0, 0.6, 0], inner: 'steering', bay: ['dampers'], cam: [1.4, 0.4, 0.1, 1.4, 1.0, 1.3] },
  hubs: { cut: BOX.rwheel, lift: [0, 0.12, 1.45], inner: 'brakeR', bay: ['diff'], cam: RWCAM },
  diff: { cut: BOX.gearbox, lift: [0, 0.7, 0], inner: 'diff', bay: ['gearbox'], cam: BOXCAM },
  // Admission & suralimentation
  plenum: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'plenum', bay: ['engine', 'manifolds', 'turbo'], cam: HOODCAM },
  intercooler: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'intercooler', bay: ['engine', 'plenum', 'turbo'], cam: [-0.9, 0.6, 0.3, 1.2, 1.3, 2.0] },
  injection: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'engine', bay: ['manifolds', 'turbo', 'mguk'], cam: HOODCAM },
  manifolds: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'manifolds', bay: ['engine', 'turbo'], cam: [-1.2, 0.5, 0.25, 0.9, 1.2, 2.0] },
  wastegate: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'wastegate', bay: ['engine', 'turbo', 'exhaust'], cam: [-1.6, 0.6, -0.1, -0.2, 1.3, -1.7] },
  // Transmission
  clutch: { cut: BOX.gearbox, lift: [0, 0.7, 0], inner: 'clutch', bay: ['gearbox', 'engine'], cam: [-1.5, 0.42, 0.05, -0.6, 1.0, 1.7] },
  ratios: { cut: BOX.gearbox, lift: [0, 0.7, 0], inner: 'gearbox', bay: ['diff'], cam: BOXCAM },
  driveshafts: { cut: BOX.gearbox, lift: [0, 0.7, 0], inner: 'diff', bay: ['gearbox'], cam: BOXCAM },
  oil: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'oiltank', bay: ['engine', 'plenum'], cam: [-0.7, 0.6, 0.05, 1.5, 1.3, 1.6] },
  // Récupération d'énergie
  regen: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'mguk', bay: ['engine', 'battery'], cam: [-0.9, 0.4, 0.25, 1.1, 1.0, 1.7] },
  inverter: { cut: BOX.tank, lift: [0, 0.75, 0], inner: 'battery', cam: [-0.3, 0.45, 0.05, 1.3, 1.25, 1.6] },
  hv: { cut: [[-1.1, 0.12, 0], [0.02, 0.92, 0.42]], lift: [0, 0.75, 0], inner: 'battery', bay: ['mguk'], cam: [-0.5, 0.4, 0.15, 1.3, 1.2, 1.7] },
  // Fluides & sécurité
  oiltank: { cut: BOX.hood, lift: [0, 0.75, 0], inner: 'oiltank', bay: ['engine', 'plenum'], cam: [-0.7, 0.6, 0.05, 1.5, 1.3, 1.6] },
  fuel: { cut: BOX.tank, lift: [0, 0.75, 0], inner: 'fuel', bay: ['battery'], cam: [-0.3, 0.6, 0.05, 1.3, 1.25, 1.6] },
  wiring: { cut: BOX.sidepod, lift: [0, 0.6, 0.15], inner: 'ecu', bay: ['radiators'], cam: PODCAM },
  sensors: { glow: [[-2.76, -0.02, 0], [2.76, 1.2, 0.99]], cam: [0, 0.4, 0, 3.4, 2.2, 4.2] },
  heatshield: { cut: BOX.exhaust, lift: [0, 0.65, 0], inner: 'exhaust', bay: ['gearbox', 'turbo'], cam: BOXCAM },
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
  const metal = (c = 0x9aa3ad, rough = 0.32, met = 0.85) => new THREE.MeshStandardMaterial({ color: c, metalness: met, roughness: rough, emissive: 0x38d9ff, emissiveIntensity: 0 });
  // tissage carbone (sergé 2×2) pour les pièces composites
  const wc = document.createElement('canvas'); wc.width = wc.height = 32; const wx = wc.getContext('2d');
  wx.fillStyle = '#17191d'; wx.fillRect(0, 0, 32, 32);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { wx.fillStyle = (x + y) % 4 < 2 ? '#2b2e35' : '#101216'; wx.fillRect(x * 8, y * 8, 8, 8); wx.fillStyle = 'rgba(255,255,255,.05)'; wx.fillRect(x * 8, y * 8, 8, 1); }
  const weave = new THREE.CanvasTexture(wc); weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(14, 14); weave.colorSpace = THREE.SRGBColorSpace;
  const carbon = () => new THREE.MeshStandardMaterial({ map: weave, color: 0xffffff, metalness: 0.35, roughness: 0.38, emissive: 0x38d9ff, emissiveIntensity: 0 });
  const V = (a) => new THREE.Vector3(...a);
  const tube = (pts, r, seg = 48) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V)), seg, r, 12);
  const mk = (id, build) => {
    const g = new THREE.Group(); g.userData = { id, mats: [] };
    const add = (geo, mat, f, parent = g) => { const m = new THREE.Mesh(geo, mat); if (f) f(m); m.castShadow = true; parent.add(m); if (!g.userData.mats.includes(mat)) g.userData.mats.push(mat); return m; };
    build(g, add); g.visible = false; groups[id] = g; return g;
  };
  const sym = (add, geo, mat, x, y, z, f, parent) => [1, -1].forEach((s) => add(geo, mat, (m) => { m.position.set(x, y, z * s); if (f) f(m, s); }, parent));
  const EX = -1.07, CY = 0.36;           // centre du moteur, hauteur du vilebrequin
  const BANK = Math.PI / 4;              // V à 90°
  const bank = (s, d, o = 0) => [CY + Math.cos(BANK) * d - Math.sin(BANK) * o, s * (Math.sin(BANK) * d + Math.cos(BANK) * o)]; // d : le long du banc, o : vers l'extérieur

  mk('engine', (g, add) => { // V6 1,6 L turbo à 90° : carter, bancs, culasses, couvre-culasses, bobines, rampe d'injection
    const alu = metal(0xa9b0b9, 0.42), cast = metal(0x7d848d, 0.55), dark = metal(0x2a2d33, 0.5), red = metal(0xc8231b, 0.38), steel = metal(0xd3d8de, 0.2);
    add(new THREE.BoxGeometry(0.6, 0.15, 0.3), cast, (m) => m.position.set(EX, CY - 0.05, 0));                    // carter-cylindres
    add(new THREE.BoxGeometry(0.56, 0.06, 0.24), dark, (m) => m.position.set(EX, CY - 0.15, 0));                  // carter sec
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.012, 0.13, 0.31), alu, (m) => m.position.set(EX - 0.24 + i * 0.12, CY - 0.05, 0)); // nervures
    add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 28), cast, (m) => { m.rotation.z = Math.PI / 2; m.position.set(EX - 0.32, CY + 0.02, 0); }); // cloche arrière
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 28), alu, (m) => { m.rotation.z = Math.PI / 2; m.position.set(EX + 0.315, CY + 0.02, 0); }); // carter de distribution
    [[0.0, 0.05], [0.09, 0.035], [-0.09, 0.035]].forEach(([dz, r]) => add(new THREE.CylinderGeometry(r, r, 0.03, 20), steel, (m) => { m.rotation.z = Math.PI / 2; m.position.set(EX + 0.345, CY + 0.02 + (dz ? 0.07 : -0.03), dz); })); // poulies
    [1, -1].forEach((s) => {
      const [y1, z1] = bank(s, 0.16), [y2, z2] = bank(s, 0.26), [y3, z3] = bank(s, 0.315);
      add(new THREE.BoxGeometry(0.58, 0.13, 0.17), alu, (m) => { m.position.set(EX, y1, z1); m.rotation.x = s * BANK; });       // banc de cylindres
      add(new THREE.BoxGeometry(0.58, 0.09, 0.19), cast, (m) => { m.position.set(EX, y2, z2); m.rotation.x = s * BANK; });      // culasse
      add(new THREE.CylinderGeometry(0.095, 0.095, 0.58, 20, 1, false, 0, Math.PI), red, (m) => { m.position.set(EX, y3 - 0.012, z3 - s * 0.012); m.rotation.z = Math.PI / 2; m.rotation.x = s * BANK + Math.PI / 2; m.scale.set(1, 1, 0.45); }); // couvre-culasse
      for (let i = 0; i < 3; i++) {
        const x = EX - 0.19 + i * 0.19, [yc, zc] = bank(s, 0.37);
        add(new THREE.CylinderGeometry(0.022, 0.026, 0.07, 12), dark, (m) => { m.position.set(x, yc, zc); m.rotation.x = s * BANK; });     // bobines d'allumage
        const [yi, zi] = bank(s, 0.27, -0.1);
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), steel, (m) => { m.position.set(x, yi, zi); m.rotation.x = s * (BANK - 0.9); }); // injecteurs
      }
      const [yr, zr] = bank(s, 0.3, -0.115);
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 10), steel, (m) => { m.position.set(EX, yr, zr); m.rotation.z = Math.PI / 2; });  // rampe d'injection
    });
    sym(add, new THREE.BoxGeometry(0.06, 0.05, 0.04), dark, EX + 0.2, CY - 0.1, 0.17);   // supports moteur
    sym(add, new THREE.BoxGeometry(0.06, 0.05, 0.04), dark, EX - 0.2, CY - 0.1, 0.17);
  });
  mk('plenum', (g, add) => { // boîte à air carbone + 6 trompettes + conduit d'admission
    const cf = carbon(), alu = metal(0xc9ced6, 0.25);
    add(new THREE.CapsuleGeometry(0.12, 0.34, 8, 20), cf, (m) => { m.rotation.z = Math.PI / 2; m.position.set(EX, 0.83, 0); m.scale.set(1, 1, 1.25); });
    add(new THREE.BoxGeometry(0.5, 0.05, 0.3), cf, (m) => m.position.set(EX, 0.745, 0));
    [1, -1].forEach((s) => { for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.036, 0.024, 0.11, 14), alu, (m) => { m.position.set(EX - 0.19 + i * 0.19, 0.68, s * 0.085); m.rotation.x = -s * 0.55; }); });
    add(tube([[EX + 0.2, 0.86, 0], [EX + 0.36, 0.9, 0], [EX + 0.52, 0.98, 0], [EX + 0.62, 1.02, 0]], 0.062), cf);
    add(new THREE.TorusGeometry(0.066, 0.012, 8, 24), alu, (m) => { m.rotation.y = Math.PI / 2; m.position.set(EX + 0.62, 1.02, 0); m.rotation.z = 0.35; });
  });
  mk('manifolds', (g, add) => { // collecteurs 3-en-1 en Inconel, un par banc
    const inc = metal(0xb98a4a, 0.3), blue = metal(0x6b78a8, 0.28), band = metal(0x4a4d55, 0.4);
    [1, -1].forEach((s) => {
      const sub = new THREE.Group(); sub.userData.ex = [0, -0.04, s * 0.26]; g.add(sub);
      const [yp, zp] = bank(s, 0.25, 0.1);
      const col = [EX - 0.42, 0.4, s * 0.3];
      for (let i = 0; i < 3; i++) {
        const x = EX - 0.19 + i * 0.19;
        add(tube([[x, yp, zp], [x - 0.02, yp - 0.04, zp + s * 0.07], [x - 0.12 - i * 0.04, 0.4 + (i - 1) * 0.03, s * (0.34 + (1 - i) * 0.02)], [col[0] + 0.06, col[1] + (i - 1) * 0.022, col[2] + s * (1 - i) * 0.012], col], 0.021, 40), i === 1 ? blue : inc, null, sub);
        add(new THREE.BoxGeometry(0.05, 0.012, 0.055), band, (m) => { m.position.set(x, yp, zp); m.rotation.x = s * BANK; }, sub);   // brides
      }
      add(tube([col, [col[0] - 0.08, 0.44, s * 0.24], [EX - 0.56, 0.52, s * 0.13], [EX - 0.585, 0.56, s * 0.075]], 0.034, 30), inc, null, sub); // 3-en-1 vers la turbine
      add(new THREE.TorusGeometry(0.036, 0.008, 8, 20), band, (m) => { m.position.set(...col); m.rotation.y = Math.PI / 2; }, sub);
    });
  });
  mk('turbo', (g, add) => { // turbine (fonte) + carter central + compresseur (aluminium) et sa roue
    const iron = metal(0x4b4138, 0.6), alu = metal(0xcfd4db, 0.22), mid = metal(0x8b929c, 0.35), blade = metal(0xe6e9ee, 0.15);
    const x0 = EX - 0.56, y0 = 0.58;
    const volute = (x, R, r, mat, out) => {
      add(new THREE.TorusGeometry(R, r, 14, 36), mat, (m) => { m.rotation.y = Math.PI / 2; m.position.set(x, y0, 0); });
      add(new THREE.CylinderGeometry(R * 0.82, R * 0.82, r * 1.5, 24), mat, (m) => { m.rotation.z = Math.PI / 2; m.position.set(x, y0, 0); });
      add(new THREE.CylinderGeometry(r * 0.95, r * 1.15, 0.12, 16), mat, (m) => { m.position.set(x, y0 + out[0], out[1]); m.rotation.x = out[2]; });
    };
    volute(x0 - 0.075, 0.082, 0.04, iron, [0.02, -0.12, Math.PI / 2]);      // turbine : entrée tangentielle
    volute(x0 + 0.085, 0.078, 0.034, alu, [0.11, 0.06, 0.35]);              // compresseur : sortie vers l'échangeur
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 18), mid, (m) => { m.rotation.z = Math.PI / 2; m.position.set(x0, y0, 0); });
    add(new THREE.CylinderGeometry(0.05, 0.058, 0.05, 20), alu, (m) => { m.rotation.z = Math.PI / 2; m.position.set(x0 + 0.135, y0, 0); }); // bouche d'aspiration
    add(new THREE.ConeGeometry(0.03, 0.05, 14), blade, (m) => { m.rotation.z = -Math.PI / 2; m.position.set(x0 + 0.14, y0, 0); });
    for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.035, 0.036, 0.004), blade, (m) => { const a = (i / 9) * Math.PI * 2; m.position.set(x0 + 0.128, y0 + Math.cos(a) * 0.024, Math.sin(a) * 0.024); m.rotation.x = a + 0.5; });
    add(new THREE.CylinderGeometry(0.046, 0.04, 0.05, 18), iron, (m) => { m.rotation.z = Math.PI / 2; m.position.set(x0 - 0.13, y0, 0); }); // sortie turbine
    add(tube([[x0 - 0.03, y0 - 0.03, 0.03], [x0 - 0.02, y0 - 0.1, 0.07], [x0 + 0.05, y0 - 0.16, 0.09]], 0.009, 16), metal(0xd8a23a, 0.4)); // graissage
  });
  mk('wastegate', (g, add) => { // soupape de décharge et sa conduite
    const st = metal(0xb7bec7, 0.25), act = metal(0xd6a531, 0.35);
    add(tube([[EX - 0.62, 0.5, -0.1], [EX - 0.72, 0.52, -0.16], [EX - 0.95, 0.6, -0.13], [EX - 1.2, 0.62, -0.09]], 0.02, 30), st);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16), act, (m) => { m.position.set(EX - 0.7, 0.56, -0.17); });
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), st, (m) => { m.position.set(EX - 0.7, 0.5, -0.17); });
  });
  mk('intercooler', (g, add) => { // échangeur air-air et ses conduits (compresseur → échangeur → plenum)
    const fins = document.createElement('canvas'); fins.width = 64; fins.height = 8; const fx = fins.getContext('2d');
    for (let i = 0; i < 64; i += 4) { fx.fillStyle = i % 8 ? '#cfd4db' : '#6f7680'; fx.fillRect(i, 0, 4, 8); }
    const tex = new THREE.CanvasTexture(fins); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(5, 1);
    const core = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.7, roughness: 0.4, emissive: 0x38d9ff, emissiveIntensity: 0 });
    const alu = metal(0xbfc5cd, 0.3), cf = carbon();
    add(new THREE.BoxGeometry(0.34, 0.2, 0.07), core, (m) => { m.position.set(EX + 0.25, 0.52, 0.42); m.rotation.y = 0.3; });
    [0.19, -0.19].forEach((dx) => add(new THREE.BoxGeometry(0.04, 0.21, 0.08), alu, (m) => { m.position.set(EX + 0.25 + dx * 0.95, 0.52, 0.42 - dx * 0.3); m.rotation.y = 0.3; }));
    add(tube([[EX - 0.47, 0.7, 0.07], [EX - 0.38, 0.74, 0.22], [EX - 0.1, 0.62, 0.4], [EX + 0.07, 0.56, 0.47]], 0.03, 40), cf);
    add(tube([[EX + 0.43, 0.56, 0.37], [EX + 0.5, 0.7, 0.26], [EX + 0.36, 0.82, 0.14], [EX + 0.22, 0.84, 0.08]], 0.03, 40), cf);
  });
  mk('mguk', (g, add) => { // MGU-K 350 kW : stator, flasques, renvoi vers le vilebrequin, connecteurs haute tension
    const body = metal(0x3f4652, 0.38), cap = metal(0xc9ced6, 0.22), hv = metal(0xff7a14, 0.5, 0.2);
    const p = [EX + 0.1, CY - 0.08, 0.235];
    add(new THREE.CylinderGeometry(0.068, 0.068, 0.24, 24), body, (m) => { m.rotation.z = Math.PI / 2; m.position.set(...p); });
    for (let i = 0; i < 7; i++) add(new THREE.TorusGeometry(0.069, 0.004, 6, 24), cap, (m) => { m.rotation.y = Math.PI / 2; m.position.set(p[0] - 0.09 + i * 0.03, p[1], p[2]); }); // ailettes
    [0.125, -0.125].forEach((dx) => add(new THREE.CylinderGeometry(0.072, 0.072, 0.02, 24), cap, (m) => { m.rotation.z = Math.PI / 2; m.position.set(p[0] + dx, p[1], p[2]); }));
    add(new THREE.BoxGeometry(0.05, 0.1, 0.12), cap, (m) => m.position.set(p[0] - 0.16, p[1] + 0.02, p[2] - 0.05));  // carter de renvoi
    [0.03, 0, -0.03].forEach((dz) => add(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 10), hv, (m) => m.position.set(p[0] + 0.07, p[1] + 0.085, p[2] + dz)));
  });
  mk('battery', (g, add) => { // « Energy Store » : bac carbone, modules de cellules, boîtiers de contrôle, câbles orange 800 V
    const cf = carbon(), cell = metal(0xb9a56a, 0.45, 0.6), box = metal(0x8f969f, 0.4), hv = metal(0xff7a14, 0.5, 0.2), dark = metal(0x22252b, 0.5);
    add(new THREE.BoxGeometry(0.44, 0.17, 0.44), cf, (m) => m.position.set(-0.3, 0.215, 0));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) add(new THREE.BoxGeometry(0.09, 0.04, 0.19), cell, (m) => m.position.set(-0.45 + i * 0.1, 0.32, -0.1 + j * 0.2));
    add(new THREE.BoxGeometry(0.16, 0.07, 0.2), box, (m) => m.position.set(-0.21, 0.375, 0.09));       // contrôle MGU-K
    add(new THREE.BoxGeometry(0.14, 0.06, 0.16), box, (m) => m.position.set(-0.4, 0.37, -0.1));
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.02, 0.02, 0.03), dark, (m) => m.position.set(-0.27 + i * 0.035, 0.42, 0.18));
    [0.03, 0, -0.03].forEach((d, i) => add(tube([[-0.5, 0.33, 0.14 + d], [-0.62, 0.36, 0.2 + d], [-0.8, 0.34 + i * 0.01, 0.235 + d], [EX + 0.17, CY + 0.03, 0.235 + d]], 0.011, 30), hv));
    add(tube([[-0.32, 0.41, -0.1], [-0.2, 0.47, 0.0], [-0.14, 0.42, 0.09]], 0.008, 20), hv);
  });
  mk('ecu', (g, add) => { // électronique de contrôle (dans les pontons)
    sym(add, new THREE.BoxGeometry(0.26, 0.07, 0.17), metal(0x1f6b4a, 0.5), 0.12, 0.42, 0.46);
    for (let i = 0; i < 3; i++) sym(add, new THREE.BoxGeometry(0.05, 0.02, 0.05), metal(0x1a1c20, 0.5), 0.05 + i * 0.07, 0.465, 0.46);
    sym(add, tube([[0.0, 0.44, 0.44], [-0.15, 0.4, 0.38], [-0.3, 0.42, 0.26]], 0.008, 16), metal(0x222222, 0.6, 0.2), 0, 0, 0, (m, s) => { m.position.set(0, 0, 0); m.scale.z = s; });
  });
  mk('hydraulics', (g, add) => { // circuits hydrauliques (accumulateur + durites tressées)
    const mat = metal(0xffb020, 0.4), st = metal(0xb7bec7, 0.25);
    [[[-1.5, 0.3, 0.12], [-1.2, 0.26, 0.2], [-0.8, 0.24, 0.22], [-0.5, 0.3, 0.12]], [[-1.55, 0.35, -0.1], [-1.1, 0.25, -0.22], [-0.6, 0.3, -0.18]]].forEach((pts) => add(tube(pts, 0.012, 40), mat));
    add(new THREE.CapsuleGeometry(0.03, 0.09, 6, 14), st, (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.52, 0.3, -0.12); });
  });
  mk('oiltank', (g, add) => { // réservoir d'huile (carter sec) logé devant le moteur
    const alu = metal(0xaeb5be, 0.3), cap = metal(0xd8261c, 0.4), hose = metal(0x3b6fd0, 0.45, 0.4);
    add(new THREE.CapsuleGeometry(0.075, 0.2, 8, 20), alu, (m) => m.position.set(EX + 0.43, 0.5, 0));
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 14), cap, (m) => m.position.set(EX + 0.43, 0.69, 0));
    add(tube([[EX + 0.43, 0.34, 0.03], [EX + 0.36, 0.26, 0.08], [EX + 0.2, 0.24, 0.12]], 0.014, 20), hose);
    add(tube([[EX + 0.45, 0.6, -0.07], [EX + 0.36, 0.62, -0.14], [EX + 0.2, 0.52, -0.2]], 0.012, 20), hose);
  });
  mk('fuel', (g, add) => { // cellule carburant souple + pompes de gavage
    const kev = metal(0x3a3524, 0.75, 0.1), st = metal(0xb7bec7, 0.25);
    add(new THREE.BoxGeometry(0.4, 0.34, 0.5), kev, (m) => m.position.set(-0.3, 0.62, 0));
    sym(add, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), st, -0.44, 0.83, 0.12);
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), metal(0xd8261c, 0.4), (m) => m.position.set(-0.2, 0.8, 0));
  });
  mk('radiators', (g, add) => { // radiateurs (faisceaux à ailettes)
    const fins = document.createElement('canvas'); fins.width = 64; fins.height = 8; const fx = fins.getContext('2d');
    for (let i = 0; i < 64; i += 4) { fx.fillStyle = i % 8 ? '#c6ccd4' : '#7c838d'; fx.fillRect(i, 0, 4, 8); }
    const tex = new THREE.CanvasTexture(fins); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(4, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.7, roughness: 0.4, emissive: 0x38d9ff, emissiveIntensity: 0 });
    sym(add, new THREE.BoxGeometry(0.55, 0.32, 0.05), mat, 0.12, 0.36, 0.52, (m, s) => { m.rotation.y = s * 0.35; m.rotation.x = s * -0.25; });
    sym(add, new THREE.BoxGeometry(0.05, 0.33, 0.06), metal(0xaeb5be, 0.3), 0.4, 0.36, 0.43, (m, s) => { m.rotation.y = s * 0.35; m.rotation.x = s * -0.25; });
  });
  mk('clutch', (g, add) => { // embrayage multidisque carbone
    const cf = metal(0x1b1d21, 0.6, 0.3), ti = metal(0xc9ced6, 0.22);
    for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.052, 0.052, 0.008, 28), i % 2 ? ti : cf, (m) => { m.rotation.z = Math.PI / 2; m.position.set(EX - 0.36 - i * 0.012, CY + 0.02, 0); });
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 28), ti, (m) => { m.rotation.z = Math.PI / 2; m.position.set(EX - 0.43, CY + 0.02, 0); });
    for (let i = 0; i < 8; i++) add(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), ti, (m) => { const a = (i / 8) * Math.PI * 2; m.rotation.z = Math.PI / 2; m.position.set(EX - 0.39, CY + 0.02 + Math.cos(a) * 0.047, Math.sin(a) * 0.047); });
  });
  mk('gearbox', (g, add) => { // carter carbone ouvert, 8 rapports sur deux arbres, tambour de sélection
    const cf = carbon(), gear = metal(0xc8ccd2, 0.22), shaft = metal(0x8b929c, 0.3), ti = metal(0x9aa3ad, 0.35);
    add(new THREE.CylinderGeometry(0.14, 0.19, 0.56, 10, 1, true, Math.PI * 0.5, Math.PI), cf, (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.85, 0.36, 0); m.material.side = THREE.DoubleSide; });
    add(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 10), ti, (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.565, 0.36, 0); });
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.54, 10), shaft, (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.85, 0.43, 0); });
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.54, 10), shaft, (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.85, 0.31, 0); });
    for (let i = 0; i < 8; i++) {
      const x = -1.62 - i * 0.058, r1 = 0.036 + i * 0.004, r2 = 0.118 - r1;
      add(new THREE.CylinderGeometry(r1, r1, 0.022, 22), gear, (m) => { m.rotation.z = Math.PI / 2; m.position.set(x, 0.43, 0); });
      add(new THREE.CylinderGeometry(r2, r2, 0.022, 22), gear, (m) => { m.rotation.z = Math.PI / 2; m.position.set(x, 0.31, 0); });
    }
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.4, 14), metal(0xd6a531, 0.35), (m) => { m.rotation.z = Math.PI / 2; m.position.set(-1.82, 0.37, 0.11); }); // barillet
  });
  mk('diff', (g, add) => { // différentiel, arbres de transmission et joints tripodes
    const gear = metal(0xc8ccd2, 0.22), shaft = metal(0x3a3d44, 0.4), boot = metal(0x16171a, 0.8, 0.1);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 26), gear, (m) => { m.rotation.x = Math.PI / 2; m.position.set(-1.98, 0.36, 0.03); });
    add(new THREE.SphereGeometry(0.075, 18, 14), metal(0x7d848d, 0.5), (m) => { m.position.set(-1.98, 0.36, -0.02); m.scale.set(1, 1, 0.8); });
    sym(add, new THREE.CylinderGeometry(0.02, 0.02, 0.42, 12), shaft, -1.97, 0.362, 0.33, (m) => { m.rotation.x = Math.PI / 2; });
    sym(add, new THREE.ConeGeometry(0.045, 0.08, 16), boot, -1.97, 0.362, 0.13, (m, s) => { m.rotation.x = s * Math.PI / 2; });
    sym(add, new THREE.ConeGeometry(0.045, 0.08, 16), boot, -1.965, 0.362, 0.52, (m, s) => { m.rotation.x = -s * Math.PI / 2; });
  });
  mk('exhaust', (g, add) => { // ligne d'échappement et écran thermique
    const inc = metal(0xc9a55a, 0.25), tip = metal(0x2a2d33, 0.5), gold = metal(0xe2b84a, 0.18);
    add(tube([[EX - 0.7, 0.58, 0], [EX - 0.82, 0.6, 0], [EX - 1.0, 0.66, 0], [EX - 1.18, 0.64, 0], [EX - 1.3, 0.61, 0]], 0.05, 40), inc);
    add(new THREE.CylinderGeometry(0.062, 0.054, 0.07, 18), tip, (m) => { m.rotation.z = Math.PI / 2; m.position.set(EX - 1.32, 0.61, 0); });
    add(new THREE.CylinderGeometry(0.058, 0.058, 0.2, 18, 1, true, 0, Math.PI), gold, (m) => { m.rotation.z = Math.PI / 2; m.position.set(EX - 1.0, 0.655, 0); m.material.side = THREE.DoubleSide; });
  });
  const brake = (id, x, z) => mk(id, (g, add) => { // disque carbone ventilé incandescent, étrier 6 pistons, écope
    const disc = new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.7, roughness: 0.45, emissive: 0xff5a14, emissiveIntensity: 0.6 });
    disc.userData.keepEmissive = true;
    sym(add, new THREE.CylinderGeometry(0.2, 0.2, 0.035, 40), disc, x, 0.362, z, (m) => { m.rotation.x = Math.PI / 2; });
    for (let i = 0; i < 18; i++) sym(add, new THREE.CylinderGeometry(0.006, 0.006, 0.04, 6), metal(0x111214, 0.6), x, 0.362, z, (m) => { const a = (i / 18) * Math.PI * 2; m.rotation.x = Math.PI / 2; m.position.x = x + Math.cos(a) * 0.16; m.position.y = 0.362 + Math.sin(a) * 0.16; });
    sym(add, new THREE.CylinderGeometry(0.07, 0.07, 0.06, 20), metal(0x9aa3ad, 0.3), x, 0.362, z, (m) => { m.rotation.x = Math.PI / 2; });
    sym(add, new THREE.TorusGeometry(0.19, 0.035, 8, 18, 1.15), metal(0xd8261c, 0.35), x, 0.362, z, (m) => { m.rotation.z = 1.0; m.scale.z = 1.6; });
    sym(add, new THREE.BoxGeometry(0.26, 0.2, 0.03), carbon(), x + 0.02, 0.37, z - 0.07, (m, s) => { m.position.z = (z - 0.07) * s; });
  });
  brake('brakeF', 1.498, 0.66); brake('brakeR', -1.959, 0.6);
  mk('dampers', (g, add) => { // amortisseurs inboard, basculeurs, ressort central et barre anti-roulis
    const body = metal(0xd6a531, 0.3), spring = metal(0xd8261c, 0.4), ti = metal(0xb7bec7, 0.25);
    sym(add, new THREE.CylinderGeometry(0.02, 0.02, 0.2, 12), body, 1.2, 0.52, 0.09, (m, s) => { m.rotation.z = Math.PI / 2; m.rotation.y = s * 0.25; });
    sym(add, new THREE.TorusGeometry(0.024, 0.005, 6, 14), spring, 1.2, 0.52, 0.09, (m) => { m.rotation.y = Math.PI / 2; });
    for (let i = 0; i < 6; i++) add(new THREE.TorusGeometry(0.026, 0.005, 6, 14), spring, (m) => { m.rotation.y = Math.PI / 2; m.position.set(1.13 + i * 0.022, 0.56, 0); });
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 10), ti, (m) => { m.rotation.z = Math.PI / 2; m.position.set(1.19, 0.56, 0); });
    sym(add, new THREE.BoxGeometry(0.07, 0.015, 0.07), ti, 1.33, 0.52, 0.14);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 10), metal(0x3b6fd0, 0.4), (m) => { m.rotation.x = Math.PI / 2; m.position.set(1.4, 0.5, 0); });
  });
  mk('steering', (g, add) => { // crémaillère de direction et biellettes
    const ti = metal(0xb7bec7, 0.25);
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 14), metal(0x8b929c, 0.35), (m) => { m.rotation.x = Math.PI / 2; m.position.set(1.46, 0.36, 0); });
    sym(add, new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8), ti, 1.47, 0.36, 0.33, (m) => { m.rotation.x = Math.PI / 2; });
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 10), ti, (m) => { m.rotation.z = Math.PI / 2 - 0.5; m.position.set(1.25, 0.47, 0); });
  });
  mk('ballast', (g, add) => { for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.16, 0.05, 0.14), metal(0x6b6f76, 0.5), (m) => m.position.set(0.15 + i * 0.2, 0.05, 0)); });
  return groups;
}

/* ---------- Groupe propulseur en vue éclatée (onglet R&D → Chaîne motrice) ---------- */
const PU_VIEW = {
  engine: { ex: [0, 0, 0], label: 'V6 turbo 1,6 L', at: [-1.07, 0.5, 0.2] },
  plenum: { ex: [0.02, 0.42, 0], label: 'Plenum d\'admission', at: [-1.07, 0.9, 0] },
  manifolds: { ex: [0, 0, 0], label: 'Collecteurs d\'échappement', at: [-1.2, 0.36, 0.36] },
  turbo: { ex: [-0.42, 0.14, 0], label: 'Turbocompresseur', at: [-1.63, 0.66, 0] },
  wastegate: { ex: [-0.5, 0.2, -0.22], label: 'Soupape de décharge', at: [-1.9, 0.62, -0.14] },
  intercooler: { ex: [0.12, 0.08, 0.5], label: 'Échangeur air-air', at: [-0.82, 0.64, 0.42] },
  mguk: { ex: [0.08, -0.16, 0.42], label: 'MGU-K 350 kW', at: [-0.97, 0.34, 0.235] },
  battery: { ex: [0.42, -0.08, 0], label: 'Batterie (Energy Store)', at: [-0.3, 0.42, 0] },
  oiltank: { ex: [0.22, 0.34, -0.3], label: 'Réservoir d\'huile', at: [-0.64, 0.66, 0] },
  clutch: { ex: [-0.2, -0.22, 0], label: 'Embrayage', at: [-1.47, 0.42, 0] },
  gearbox: { ex: [-0.62, -0.2, 0], label: 'Boîte 8 rapports', at: [-1.85, 0.5, 0] },
  diff: { ex: [-0.78, -0.2, 0], label: 'Différentiel', at: [-1.98, 0.46, 0.2] },
  exhaust: { ex: [-0.86, 0.34, 0], label: 'Échappement', at: [-2.1, 0.72, 0] },
};
// pièce de R&D → organe du groupe propulseur
const PU_OF = {
  ice: 'engine', engine_life: 'engine', injection: 'engine', turbo: 'turbo', wastegate: 'wastegate', airbox: 'plenum', plenum: 'plenum',
  exhaust: 'exhaust', heatshield: 'exhaust', manifolds: 'manifolds', intercooler: 'intercooler', mguk: 'mguk', regen: 'mguk',
  battery: 'battery', push: 'battery', hv: 'battery', inverter: 'battery', maps: 'battery', gearbox_p: 'gearbox', gearbox_rel: 'gearbox', ratios: 'gearbox', launch: 'gearbox',
  clutch: 'clutch', diff: 'diff', driveshafts: 'diff', oil: 'oiltank', oiltank: 'oiltank',
};
function mountPU(el, { part = null } = {}) {
  const canvas = document.createElement('canvas'); canvas.className = 'car3d-canvas';
  const tags = document.createElement('div'); tags.className = 'pu-tags';
  el.innerHTML = ''; el.appendChild(canvas); el.appendChild(tags);
  const size = () => [Math.max(200, el.clientWidth), Math.max(160, el.clientHeight)];
  let [w, h] = size();
  const r = newRenderer(canvas, w, h); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(w, h, false);
  const scene = new THREE.Scene();
  if (!r.__env) r.__env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = r.__env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202028, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1, 5, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 0.5, far: 14 }); key.shadow.radius = 5; key.shadow.bias = -0.0005; scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.1); rim.position.set(-4, 2, -3); scene.add(rim);
  const C = new THREE.Vector3(-1.32, 0.5, 0);
  key.target.position.copy(C); scene.add(key.target); key.position.add(C);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.35 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.22; floor.receiveShadow = true; scene.add(floor);
  const inner = buildInner();
  const items = Object.keys(PU_VIEW).map((id) => {
    const g = inner[id], v = PU_VIEW[id]; g.visible = true; scene.add(g);
    const tag = document.createElement('button'); tag.className = 'pu-tag'; tag.type = 'button'; tag.textContent = v.label; tag.dataset.pu = id; tags.appendChild(tag);
    g.userData.mats.forEach((m) => { m.transparent = true; });
    return { id, g, v, tag, ex: new THREE.Vector3(...v.ex), at: new THREE.Vector3(...v.at) };
  });
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 60);
  const fitK = () => Math.max(1, Math.min(2.1, Math.pow(1.75 / (w / h), 0.9)));
  const home = () => [C.x + 1.75 * fitK(), C.y + 1.25 * fitK(), C.z + 2.55 * fitK()];
  cam.position.set(...home());
  const ctl = new OrbitControls(cam, canvas); ctl.target.copy(C); ctl.enableZoom = false; ctl.enablePan = false; ctl.enableDamping = true; ctl.autoRotate = true; ctl.autoRotateSpeed = 0.7; ctl.minPolarAngle = 0.3; ctl.maxPolarAngle = 1.5; ctl.update();
  let tween = null, alive = true, raf = 0, visible = true, exT = 0, exGoal = 1, sel = null, selT = 0;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const flyTo = (pos, target, ms = 1000) => { tween = { p0: cam.position.clone(), t0: ctl.target.clone(), p1: new THREE.Vector3(...pos), t1: target.clone(), start: performance.now(), ms }; };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((e) => { visible = e[0].isIntersecting; }) : null; if (io) io.observe(el);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { [w, h] = size(); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }) : null; if (ro) ro.observe(el);
  const P = new THREE.Vector3(); let prev = performance.now();
  const loop = () => {
    if (!alive) return; raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (!visible || document.hidden) return;
    if (tween) { const k = Math.min(1, (now - tween.start) / tween.ms), e = ease(k); cam.position.lerpVectors(tween.p0, tween.p1, e); ctl.target.lerpVectors(tween.t0, tween.t1, e); if (k >= 1) tween = null; }
    exT += (exGoal - exT) * Math.min(1, dt * 3.2);
    selT += ((sel ? 1 : 0) - selT) * Math.min(1, dt * 5);
    const pulse = 0.55 + 0.45 * Math.sin(now / 1000 * 3.2);
    items.forEach((it) => {
      it.g.position.copy(it.ex).multiplyScalar(exT);
      it.g.children.forEach((c) => { if (c.userData.ex) c.position.set(c.userData.ex[0] * exT, c.userData.ex[1] * exT, c.userData.ex[2] * exT); });
      const on = sel === it.id;
      it.g.userData.mats.forEach((m) => { if (!m.userData.keepEmissive) m.emissiveIntensity = on ? 0.05 * pulse : 0; m.opacity = sel && !on ? 1 - 0.8 * selT : 1; m.depthWrite = !(sel && !on); });
      P.copy(it.at).addScaledVector(it.ex, exT).project(cam);
      const show = P.z < 1 && exT > 0.5 && (!sel || on);
      it.show = show; it.sx = (P.x + 1) / 2 * w; it.sy = (1 - P.y) / 2 * h; it.ty = it.sy - 14;
      it.tag.classList.toggle('on', on);
    });
    // étiquettes : on les écarte verticalement pour qu'elles ne se chevauchent pas
    const placed = [];
    items.filter((it) => it.show).sort((a, b) => b.sy - a.sy).forEach((it) => {
      const hw = it.v.label.length * 4.2 + 14;
      for (let guard = 0; guard < 12; guard++) { const hit = placed.find((q) => Math.abs(q.sx - it.sx) < q.hw + hw && Math.abs(q.ty - it.ty) < 24); if (!hit) break; it.ty = hit.ty - 25; }
      it.ty = Math.max(26, it.ty); it.hw = hw; placed.push(it);
    });
    items.forEach((it) => {
      it.tag.style.opacity = it.show ? 1 : 0; it.tag.style.pointerEvents = it.show ? 'auto' : 'none';
      it.tag.style.transform = `translate(-50%, -100%) translate(${it.sx.toFixed(1)}px, ${it.ty.toFixed(1)}px)`;
      it.tag.style.setProperty('--ll', Math.max(6, it.sy - it.ty).toFixed(0) + 'px');
    });
    ctl.update(); r.render(scene, cam);
  };
  loop();
  const api = {
    // met en avant l'organe lié à une pièce de R&D (ou revient à la vue d'ensemble)
    part(id) {
      const gid = id ? PU_OF[id] || (PU_VIEW[id] ? id : null) : null;
      sel = gid; const it = items.find((x) => x.id === gid);
      if (it) { const t = it.at.clone().add(it.ex); const k = fitK(); ctl.autoRotate = false; flyTo([t.x + 0.95 * k, t.y + 0.6 * k, t.z + 1.25 * k], t); }
      else { ctl.autoRotate = true; flyTo(home(), C); }
      return !!it;
    },
    explode(v) { exGoal = v ? 1 : 0; },
    has: (id) => !!PU_OF[id],
    dispose() { alive = false; cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect(); ctl.dispose(); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); r.dispose(); r.forceContextLoss && r.forceContextLoss(); viewers.delete(api); },
  };
  viewers.add(api);
  if (part) setTimeout(() => api.part(part), 400);
  return api;
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
/* ---------- Circuit de fond : la F1 enchaîne les virages en glisse au fil du défilement de la page ---------- */
function mountTrack(el, teamId, getP, { onTel } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'car3d-canvas';
  el.innerHTML = ''; el.appendChild(canvas);
  const size = () => [Math.max(240, el.clientWidth), Math.max(200, el.clientHeight)];
  let [w, h] = size();
  const r = newRenderer(canvas, w, h);
  r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  const { scene, car } = makeScene(r, teamId, { ground: false });
  scene.fog = new THREE.Fog(0x05060a, 16, 44);
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.4 }));
  shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.position.y = 0.004; shadowFloor.receiveShadow = true; scene.add(shadowFloor);
  const key = scene.children.find((o) => o.isDirectionalLight && o.castShadow);
  if (key) { Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); key.shadow.mapSize.set(1024, 1024); key.shadow.camera.updateProjectionMatrix(); scene.add(key.target); }

  // tracé : une succession de virages gauche/droite, une épingle et une chicane
  const curve = new THREE.CatmullRomCurve3([
    [-40, 12], [-18, 12], [-2, 9], [8, 0], [6, -12], [-6, -20], [-14, -32], [-8, -46], [8, -52], [22, -60], [24, -74],
    [12, -84], [-6, -86], [-22, -92], [-30, -106], [-22, -120], [-4, -124], [8, -134], [4, -148], [-10, -156], [-30, -160], [-46, -168],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.5);
  const N = 1100, HW = 6.2;
  const pts = curve.getSpacedPoints(N), up = new THREE.Vector3(0, 1, 0);
  const tans = pts.map((_, i) => curve.getTangentAt(i / N));
  const side = (i) => new THREE.Vector3().crossVectors(up, tans[i]).normalize();
  const sides = pts.map((_, i) => side(i));
  const head = (t) => Math.atan2(-t.z, t.x);
  const turnAt = (i) => { const j = Math.min(N, i + 8); let d = head(tans[j]) - head(tans[i]); return Math.atan2(Math.sin(d), Math.cos(d)); };
  // asphalte
  const pos = [], idx = [], uv = [];
  for (let i = 0; i <= N; i++) {
    const n = sides[i], p = pts[i];
    pos.push(p.x + n.x * HW, 0.001, p.z + n.z * HW, p.x - n.x * HW, 0.001, p.z - n.z * HW);
    uv.push(0, i / 8, 1, i / 8);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const road = new THREE.BufferGeometry();
  road.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); road.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); road.setIndex(idx); road.computeVertexNormals();
  const tc = document.createElement('canvas'); tc.width = tc.height = 256;
  const tx = tc.getContext('2d'); tx.fillStyle = '#34373e'; tx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const g = 28 + Math.random() * 40; tx.fillStyle = `rgba(${g},${g},${g + 4},${0.35 + Math.random() * 0.4})`; tx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  const asphaltTex = new THREE.CanvasTexture(tc); asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping; asphaltTex.colorSpace = THREE.SRGBColorSpace;
  const roadMesh = new THREE.Mesh(road, new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
  roadMesh.receiveShadow = true; scene.add(roadMesh);
  // bandes (lignes, vibreurs, bacs à graviers) regroupées par matériau : peu d'appels de dessin
  const bufs = new Map();
  const strip = (mat, offset, width, y, from, to) => {
    if (!bufs.has(mat)) bufs.set(mat, { P: [], I: [] });
    const b = bufs.get(mat), base = b.P.length / 3;
    for (let i = from; i <= to; i++) {
      const n = sides[i], p = pts[i];
      b.P.push(p.x + n.x * (offset + width / 2), y, p.z + n.z * (offset + width / 2), p.x + n.x * (offset - width / 2), y, p.z + n.z * (offset - width / 2));
      if (i < to) { const a = base + (i - from) * 2; b.I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  };
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e9ea, roughness: 0.7, side: THREE.DoubleSide });
  const red = new THREE.MeshStandardMaterial({ color: 0xd8191f, roughness: 0.6, side: THREE.DoubleSide });
  const gravel = new THREE.MeshStandardMaterial({ color: 0x3b3428, roughness: 1, side: THREE.DoubleSide });
  strip(white, HW - 0.35, 0.3, 0.003, 0, N); strip(white, -HW + 0.35, 0.3, 0.003, 0, N);
  // vibreurs à la corde et à la sortie de chaque virage, graviers à l'extérieur
  const runs = []; let cur = null;
  for (let i = 0; i < N - 8; i++) {
    const tr = turnAt(i), s = Math.sign(tr);
    if (Math.abs(tr) > 0.09) { if (!cur || cur.s !== s) { cur = { s, a: i, b: i }; runs.push(cur); } else cur.b = i; } else cur = null;
  }
  runs.filter((u) => u.b - u.a > 12).forEach((u) => {
    const inner = u.s * (HW + 0.65), outer = -u.s * (HW + 0.65);
    const a = Math.max(0, u.a), b = Math.min(N, u.b + 8);
    for (let i = a; i < b; i += 3) strip(((i - a) / 3) % 2 ? white : red, inner, 1.3, 0.006, i, Math.min(i + 3, b));
    const oa = Math.min(N - 1, u.a + Math.round((u.b - u.a) * 0.55)), ob = Math.min(N, u.b + 34);
    for (let i = oa; i < ob; i += 3) strip(((i - oa) / 3) % 2 ? white : red, outer, 1.3, 0.006, i, Math.min(i + 3, ob));
    strip(gravel, -u.s * (HW + 5.2), 7.4, 0.002, Math.max(0, u.a - 10), Math.min(N, u.b + 40));
  });
  // grille de départ : ligne à damier et emplacements
  const sl = 72;
  for (let k = 0; k < 10; k++) strip(k % 2 ? white : new THREE.MeshBasicMaterial({ color: 0x111111 }), -HW + (k + 0.5) * (2 * HW / 10), 2 * HW / 10, 0.004, sl, sl + 2);
  for (let k = 0; k < 4; k++) strip(white, (k % 2 ? 1 : -1) * 2.6, 2.2, 0.004, sl - 12 - k * 12, sl - 11 - k * 12);
  bufs.forEach((b, mat) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.P, 3)); g.setIndex(b.I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x0b120e, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.01, -80); grass.receiveShadow = true; scene.add(grass);
  // murs de pneus derrière les graviers
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.8 });
  const tyreGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.55, 12);
  const tyrePos = [];
  runs.filter((u) => u.b - u.a > 12).forEach((u) => {
    for (let i = Math.max(0, u.a - 6); i < Math.min(N, u.b + 36); i += 2) {
      const n = sides[i], p = pts[i], o = -u.s * (HW + 9.6); tyrePos.push([p.x + n.x * o, p.z + n.z * o]);
    }
  });
  const tyres = new THREE.InstancedMesh(tyreGeo, tyreMat, tyrePos.length), mx = new THREE.Matrix4();
  tyrePos.forEach(([x, z], k) => tyres.setMatrixAt(k, mx.makeTranslation(x, 0.28, z)));
  scene.add(tyres);

  // fumée des pneus
  const sc = document.createElement('canvas'); sc.width = sc.height = 64;
  const sx = sc.getContext('2d'); const sg = sx.createRadialGradient(32, 32, 2, 32, 32, 31);
  sg.addColorStop(0, 'rgba(235,235,240,.55)'); sg.addColorStop(1, 'rgba(235,235,240,0)'); sx.fillStyle = sg; sx.fillRect(0, 0, 64, 64);
  const smokeTex = new THREE.CanvasTexture(sc);
  const smoke = Array.from({ length: 160 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false; sp.userData = { life: 0 }; scene.add(sp); return sp;
  });
  let smokeI = 0, smokeAlive = 0;
  const skidMat = new THREE.MeshBasicMaterial({ color: 0x050506, transparent: true, opacity: 0.45, depthWrite: false });
  const skidGeo = new THREE.PlaneGeometry(0.34, 0.26); skidGeo.rotateX(-Math.PI / 2);
  const skids = Array.from({ length: 2400 }, () => { const m = new THREE.Mesh(skidGeo, skidMat); m.visible = false; m.position.y = 0.008; scene.add(m); return m; });
  let skidI = 0;
  const lastSkid = [null, null];

  scene.add(car);
  const cam = new THREE.PerspectiveCamera(36, w / h, 0.3, 400);
  const frame = () => {
    cam.aspect = w / h;
    // grand écran : la voiture glisse dans le tiers droit, à côté du contenu
    if (w / h > 1.25) cam.setViewOffset(w, h, -w * 0.17, -h * 0.05, w, h); else cam.setViewOffset(w, h, 0, -h * 0.08, w, h);
    cam.updateProjectionMatrix();
  };
  frame();
  let alive = true, paused = false, raf = 0, sp = -1, prevP = -1, prevT = performance.now(), dirty = true, vel = 0, drift = 0;
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { [w, h] = size(); r.setSize(w, h, false); frame(); dirty = true; }) : null;
  if (ro) ro.observe(el);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  const rearL = new THREE.Vector3(-1.7, 0.02, 0.78), rearR = new THREE.Vector3(-1.7, 0.02, -0.78);
  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - prevT) / 1000); prevT = now;
    if (document.hidden || paused) return;
    const target = Math.max(0, Math.min(1, getP()));
    if (sp < 0) sp = target;
    const moving = Math.abs(target - sp) > 2e-5;
    if (!moving && !smokeAlive && !dirty && Math.abs(vel) < 0.5) return;
    dirty = false;
    const step = (target - sp) * Math.min(1, dt * 5);
    sp += step;
    const t = 0.052 + sp * 0.94;
    // vitesse « affichée » : suit le défilement (unités de circuit / s)
    vel += ((step / Math.max(dt, 1e-3)) * 300 - vel) * Math.min(1, dt * 4);
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const heading = head(tan);
    const tan2 = curve.getTangentAt(Math.min(1, t + 0.008));
    let turn = head(tan2) - heading; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    // la glisse n'existe qu'en mouvement ; marche arrière = glisse inversée, plus douce
    const goal = Math.max(-0.8, Math.min(0.8, turn * 7)) * Math.min(1, Math.abs(vel) / 40) * (vel < 0 ? -0.5 : 1);
    drift += (goal - drift) * Math.min(1, dt * 5);
    car.position.set(p.x, 0, p.z);
    car.rotation.y = heading + drift;
    const kz = Math.max(1, Math.min(2.1, 1.45 / (w / h)));
    camPos.set(p.x + (-tan.x * 5.6 + 3.9) * kz, 4.7 * kz, p.z + (-tan.z * 5.6 + 4.9) * kz);
    if (prevP < 0) cam.position.copy(camPos); else cam.position.lerp(camPos, Math.min(1, dt * 9));
    camLook.set(p.x + tan.x * 3, 0.4, p.z + tan.z * 3);
    cam.lookAt(camLook);
    if (key) { key.position.set(p.x + 3, 9, p.z + 4); key.target.position.set(p.x, 0, p.z); }
    if (Math.abs(drift) <= 0.16) { lastSkid[0] = lastSkid[1] = null; }
    if (prevP >= 0 && Math.abs(drift) > 0.16 && Math.abs(vel) > 25) {
      car.updateMatrixWorld();
      [rearL, rearR].forEach((wpt, k) => {
        tmp.copy(wpt).applyMatrix4(car.matrixWorld);
        const s = smoke[smokeI++ % smoke.length];
        s.position.set(tmp.x + (Math.random() - 0.5) * 0.4, 0.35, tmp.z + (Math.random() - 0.5) * 0.4);
        s.userData.life = 1; s.userData.v = 0.6 + Math.random() * 0.8; s.visible = true;
        const last = lastSkid[k];
        if (!last) lastSkid[k] = tmp.clone();
        else if (last.distanceTo(tmp) > 0.12) {
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
    smokeAlive = 0;
    smoke.forEach((s) => {
      if (!s.visible) return;
      const d = s.userData; d.life -= dt * 0.7;
      if (d.life <= 0) { s.visible = false; return; }
      smokeAlive++;
      const sc2 = 1.2 + (1 - d.life) * 4.5; s.scale.set(sc2, sc2, 1);
      s.position.y += dt * d.v; s.material.opacity = d.life * 0.55;
    });
    prevP = target;
    r.render(scene, cam);
    if (onTel) onTel({ speed: Math.abs(vel), drift: drift * 57.3, p: sp });
  };
  loop();
  return {
    // téléportation (pendant le drapeau à damier) : pas de marche arrière visible
    pause(v) { paused = !!v; if (!paused) { sp = -1; prevP = -1; vel = 0; drift = 0; lastSkid[0] = lastSkid[1] = null; dirty = true; } },
    jump() { sp = -1; prevP = -1; vel = 0; drift = 0; lastSkid[0] = lastSkid[1] = null; dirty = true; },
    dispose() {
      alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect();
      scene.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry !== skidGeo && !PARTS.some((pp) => pp.geometry === o.geometry)) o.geometry.dispose(); });
      r.dispose(); r.forceContextLoss && r.forceContextLoss();
    },
  };
}
function disposeAll() { [...viewers].forEach((v) => v.dispose()); }
function supported() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}

F1.car3d = { snapshot, mount, mountPU, PU_OF, mountTrack, disposeAll, supported: supported(), ready: false };
if (F1.car3d.supported) {
  loadModel()
    .then(() => { F1.car3d.ready = true; window.dispatchEvent(new Event('car3d-ready')); })
    .catch((e) => { F1.car3d.supported = false; console.warn('[PITWALL] modèle 3D indisponible :', e); });
}
