/* PITWALL — course manager en 3D : circuit, 20 monoplaces, météo en direct, accidents et pannes.
   Le tracé est stylisé (généré à partir du profil du circuit), pas une reproduction du vrai circuit. */
import * as THREE from 'three';

const F1 = (window.F1 = window.F1 || {});
const LT = 90; // durée d'un tour « simulé » en secondes (sert à convertir les écarts en distance)

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Tracé ---------- */
function makeTrack(seedStr, profile) {
  const r = rng(hash('track-' + seedStr));
  const n = Math.round(8 + (profile.df || 0.4) * 9);
  const stretch = 1.25 + (profile.speed || 0.35) * 1.1;
  const pts = [];
  for (let i = 0; i < n; i++) {
    // la ligne droite des stands : les points voisins du départ (i = 0) sont alignés
    const straight = i <= 1 || i === n - 1;
    const a = Math.PI / 2 + (i / n) * Math.PI * 2 + (straight ? 0 : (r() - 0.5) * (Math.PI * 2 / n) * 0.55);
    const rad = straight ? 1 : 0.55 + r() * 0.62;
    pts.push(new THREE.Vector3(Math.cos(a) * 62 * rad * stretch, 0, straight ? 58 : Math.sin(a) * 62 * rad));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const N = 720, P = curve.getSpacedPoints(N), up = new THREE.Vector3(0, 1, 0);
  const T = [], S = [], K = [];
  for (let i = 0; i <= N; i++) { const t = curve.getTangentAt((i % N) / N); T.push(t); S.push(new THREE.Vector3().crossVectors(up, t).normalize()); }
  const head = (t) => Math.atan2(-t.z, t.x);
  for (let i = 0; i <= N; i++) { let d = head(T[(i + 6) % N]) - head(T[i]); K.push(Math.atan2(Math.sin(d), Math.cos(d))); }
  return { curve, N, P, T, S, K, head, HW: 4.6 };
}

/* ---------- Monoplace basse définition (20 voitures à l'écran) ---------- */
function makeCar(color, { sc = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.3, roughness: 0.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
  const add = (geo, mat, x, y, z, f) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (f) f(m); g.add(m); return m; };
  if (sc) { // voiture de sécurité : berline
    add(new THREE.BoxGeometry(4.2, 0.7, 1.8), body, 0, 0.6, 0);
    add(new THREE.BoxGeometry(2.2, 0.55, 1.6), dark, -0.2, 1.2, 0);
    g.userData.light = add(new THREE.BoxGeometry(0.9, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff8a00, emissiveIntensity: 2 }), -0.2, 1.56, 0);
    [[1.3, 0.9], [1.3, -0.9], [-1.3, 0.9], [-1.3, -0.9]].forEach(([x, z]) => add(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14), tyre, x, 0.36, z, (m) => { m.rotation.x = Math.PI / 2; }));
  } else {
    add(new THREE.BoxGeometry(2.6, 0.42, 0.78), body, -0.3, 0.42, 0);                         // coque + capot
    add(new THREE.BoxGeometry(1.5, 0.26, 0.42), body, 1.6, 0.34, 0);                          // nez
    add(new THREE.BoxGeometry(1.5, 0.34, 1.62), body, -0.35, 0.36, 0);                        // pontons
    add(new THREE.BoxGeometry(1.5, 0.5, 0.2), body, -0.95, 0.75, 0);                          // dérive capot
    add(new THREE.BoxGeometry(0.5, 0.07, 1.9), dark, 2.35, 0.14, 0);                          // aileron avant
    add(new THREE.BoxGeometry(0.42, 0.07, 1.36), dark, -2.25, 0.98, 0);                       // aileron arrière
    [0.68, -0.68].forEach((z) => add(new THREE.BoxGeometry(0.5, 0.62, 0.05), body, -2.25, 0.72, z));
    add(new THREE.BoxGeometry(4.2, 0.06, 1.5), dark, -0.1, 0.1, 0);                           // fond plat
    add(new THREE.TorusGeometry(0.26, 0.035, 6, 14, Math.PI), dark, 0.42, 0.62, 0, (m) => { m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 2; });
    add(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.4 }), 0.3, 0.68, 0);
    [[1.55, 0.86], [1.55, -0.86], [-1.9, 0.84], [-1.9, -0.84]].forEach(([x, z]) => add(new THREE.CylinderGeometry(0.38, 0.38, 0.42, 16), tyre, x, 0.38, z, (m) => { m.rotation.x = Math.PI / 2; }));
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d');
  const gr = cx.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; g.add(sh);
  g.scale.setScalar(1.15);
  return g;
}

function mount(el, { res, seedStr, colorOf, getT, onIncident, lapSec = 6 }) {
  const canvas = document.createElement('canvas'); canvas.className = 'car3d-canvas';
  el.innerHTML = ''; el.appendChild(canvas);
  const size = () => [Math.max(240, el.clientWidth), Math.max(160, el.clientHeight)];
  let [w, h] = size();
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(1.6, window.devicePixelRatio || 1)); r.setSize(w, h, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const SKY = [new THREE.Color(0x7fb2e6), new THREE.Color(0x7a828e), new THREE.Color(0x3b4049)];
  scene.background = SKY[0].clone(); scene.fog = new THREE.Fog(scene.background.getHex(), 120, 520);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a5a3a, 1.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4); sun.position.set(80, 140, 60); scene.add(sun);

  const LAPS = res.laps.length;
  const tr = makeTrack(seedStr, res.w);
  const { N, P, T: TAN, S: SIDE, K, HW } = tr;
  const mats = [];
  const ribbon = (offset, width, y, from, to, mat, uvScale = 0) => {
    const pos = [], idx = [], uv = [];
    for (let i = from; i <= to; i++) {
      const j = ((i % N) + N) % N, n = SIDE[j], p = P[j];
      pos.push(p.x + n.x * (offset + width / 2), y, p.z + n.z * (offset + width / 2), p.x + n.x * (offset - width / 2), y, p.z + n.z * (offset - width / 2));
      uv.push(0, i * uvScale, 1, i * uvScale);
      if (i < to) { const a = (i - from) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); scene.add(m); return m;
  };
  const std = (o) => { const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o }); mats.push(m); return m; };
  // asphalte (grain procédural)
  const tc = document.createElement('canvas'); tc.width = tc.height = 128; const tx = tc.getContext('2d'); tx.fillStyle = '#8a8d94'; tx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) { const g = 90 + Math.random() * 90; tx.fillStyle = `rgba(${g},${g},${g},.5)`; tx.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4); }
  const atex = new THREE.CanvasTexture(tc); atex.wrapS = atex.wrapT = THREE.RepeatWrapping; atex.colorSpace = THREE.SRGBColorSpace;
  const roadMat = std({ map: atex, color: 0x4a4d55, roughness: 0.92, metalness: 0 });
  ribbon(0, HW * 2, 0.02, 0, N, roadMat, 0.2);
  const white = std({ color: 0xf0f0f0, roughness: 0.7 }), red = std({ color: 0xd8191f, roughness: 0.6 }), gravel = std({ color: 0xb9a57c, roughness: 1 }), runoff = std({ color: 0x5b6470, roughness: 0.95 });
  ribbon(HW - 0.25, 0.28, 0.03, 0, N, white); ribbon(-HW + 0.25, 0.28, 0.03, 0, N, white);
  // virages : vibreurs à la corde, bac à graviers et mur de pneus à l'extérieur
  const runs = []; let cur = null;
  for (let i = 0; i < N; i++) { const s = Math.sign(K[i]); if (Math.abs(K[i]) > 0.075) { if (!cur || cur.s !== s) { cur = { s, a: i, b: i }; runs.push(cur); } else cur.b = i; } else cur = null; }
  const corners = runs.filter((u) => u.b - u.a > 8);
  const tyrePos = [];
  corners.forEach((u) => {
    for (let i = u.a - 2; i < u.b + 8; i += 3) ribbon(u.s * (HW + 0.55), 1.1, 0.04, i, i + 3, ((i - u.a) / 3) % 2 ? white : red);
    for (let i = u.a + Math.round((u.b - u.a) * 0.5); i < u.b + 22; i += 3) ribbon(-u.s * (HW + 0.55), 1.1, 0.04, i, i + 3, ((i - u.a) / 3) % 2 ? white : red);
    ribbon(-u.s * (HW + 6.5), 11, 0.01, u.a - 8, u.b + 26, Math.abs(K[Math.round((u.a + u.b) / 2)]) > 0.16 ? gravel : runoff);
    for (let i = u.a - 6; i < u.b + 26; i += 1) { const j = ((i % N) + N) % N, o = -u.s * (HW + 12.4); tyrePos.push([P[j].x + SIDE[j].x * o, P[j].z + SIDE[j].z * o]); }
  });
  const tyres = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 8), std({ color: 0x17181b, roughness: 0.85 }), Math.max(1, tyrePos.length)); const mx = new THREE.Matrix4();
  tyrePos.forEach(([x, z], k) => tyres.setMatrixAt(k, mx.makeTranslation(x, 0.55, z))); scene.add(tyres);
  const grassMat = std({ color: 0x5a9a44, roughness: 1 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), grassMat); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; scene.add(grass);
  // ligne de départ à damier, portique, stands, tribune
  for (let k = 0; k < 8; k++) for (let j = 0; j < 2; j++) ribbon(-HW + (k + 0.5) * (HW / 4), HW / 4, 0.035, j, j + 1, (k + j) % 2 ? white : std({ color: 0x111111 }));
  const frame = (i, f) => { const g = new THREE.Group(); g.position.copy(P[i]); g.rotation.y = tr.head(TAN[i]); f(g); scene.add(g); return g; };
  frame(0, (g) => {
    const steel = std({ color: 0x23262c, roughness: 0.5, metalness: 0.6 });
    [HW + 1.2, -HW - 1.2].forEach((z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); p.position.set(0, 3.5, z); g.add(p); });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, HW * 2 + 3), steel); beam.position.set(0, 7, 0); g.add(beam);
    g.userData.lights = [];
    for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff0000, emissiveIntensity: 0 })); l.position.set(-0.4, 6.9, -2 + k); g.add(l); g.userData.lights.push(l); }
    // bâtiment des stands (intérieur du circuit) et tribune (extérieur)
    const pit = new THREE.Mesh(new THREE.BoxGeometry(70, 6, 9), std({ color: 0xd9dde3, roughness: 0.7 })); pit.position.set(-12, 3, HW + 16); g.add(pit);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(72, 0.6, 11), std({ color: 0xc2161c, roughness: 0.6 })); roof.position.set(-12, 6.3, HW + 15.4); g.add(roof);
    for (let k = 0; k < 11; k++) { const d = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.6, 0.3), std({ color: 0x1b1d22, roughness: 0.6 })); d.position.set(-43 + k * 6.2, 1.8, HW + 11.4); g.add(d); }
    const lane = new THREE.Mesh(new THREE.BoxGeometry(84, 0.05, 5), std({ color: 0x55585f, roughness: 0.9 })); lane.position.set(-12, 0.03, HW + 8); g.add(lane);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(84, 1, 0.4), std({ color: 0xe8e8e8, roughness: 0.8 })); wall.position.set(-12, 0.5, HW + 4.6); g.add(wall);
    const cc = document.createElement('canvas'); cc.width = 256; cc.height = 64; const c2 = cc.getContext('2d');
    for (let i = 0; i < 2200; i++) { c2.fillStyle = ['#e33', '#fff', '#fc3', '#39f', '#222', '#f80', '#2c7'][Math.floor(Math.random() * 7)]; c2.fillRect(Math.random() * 256, Math.random() * 64, 2.5, 2.5); }
    const crowd = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cc), roughness: 1 }); mats.push(crowd);
    for (let k = 0; k < 6; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(80, 1.3, 2.2), crowd); st.position.set(-10, 1 + k * 1.3, -HW - 14 - k * 2.2); g.add(st); }
    const cover = new THREE.Mesh(new THREE.BoxGeometry(82, 0.5, 15), std({ color: 0x2b2e35, roughness: 0.6 })); cover.position.set(-10, 10.5, -HW - 20); cover.rotation.x = -0.12; g.add(cover);
  });
  const gantry = scene.children[scene.children.length - 1];
  // arbres
  const rt = rng(hash('trees-' + seedStr)), treeM = [];
  for (let k = 0; k < 900 && treeM.length < 260; k++) {
    const x = (rt() - 0.5) * 520, z = (rt() - 0.5) * 380; let ok = true;
    for (let i = 0; i < N; i += 6) { const dx = P[i].x - x, dz = P[i].z - z; if (dx * dx + dz * dz < 34 * 34) { ok = false; break; } }
    const lx = x - P[0].x, lz = z - P[0].z; if (lx * lx + lz * lz < 60 * 60) ok = false;
    if (ok) treeM.push([x, z, 0.8 + rt() * 0.9]);
  }
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 6, 7), std({ color: 0x356b33, roughness: 1 }), Math.max(1, treeM.length));
  treeM.forEach(([x, z, s], k) => trees.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(x, 3 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)))); scene.add(trees);

  /* ----- voitures ----- */
  const rr = rng(hash('inc-' + seedStr + res.field.length));
  const gapAt = new Map();
  res.field.forEach((x) => gapAt.set(x.i, [(x.grid - 1) * (res.gridGap || 0.6)]));
  res.laps.forEach((order) => order.forEach((o) => { const a = gapAt.get(o.i); a.push(o.gap == null ? a[a.length - 1] : o.gap); }));
  const cars = res.field.map((x) => {
    const g = makeCar(colorOf(x)); scene.add(g);
    const out = x.out ? { lap: x.out.lap, why: x.out.why, T: x.out.lap - 1 + 0.2 + rr() * 0.65, crash: x.out.why === 'Accident', told: false } : null;
    return { x, g, out, lane: ((x.i * 7) % 5 - 2) * 0.55, spin: 0, dead: false };
  });
  const me = cars.find((c) => c.x.c.me);
  const mk = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); mk.rotation.x = Math.PI; scene.add(mk);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.7, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const sc = makeCar(0xd9dde3, { sc: true }); sc.visible = false; scene.add(sc);

  /* ----- particules : fumée, flammes, projections d'eau, pluie ----- */
  const pc = document.createElement('canvas'); pc.width = pc.height = 64; const px = pc.getContext('2d');
  const pg = px.createRadialGradient(32, 32, 2, 32, 32, 31); pg.addColorStop(0, 'rgba(255,255,255,.9)'); pg.addColorStop(1, 'rgba(255,255,255,0)'); px.fillStyle = pg; px.fillRect(0, 0, 64, 64);
  const ptex = new THREE.CanvasTexture(pc);
  const puffs = Array.from({ length: 260 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ptex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.userData = { life: 0 }; scene.add(s); return s; });
  let puffI = 0;
  const puff = (x, y, z, col, size, life, vy = 1.4) => { const s = puffs[puffI++ % puffs.length]; s.position.set(x, y, z); s.material.color.set(col); s.userData = { life, max: life, size, vy }; s.visible = true; };
  const RN = 1400, rainPos = new Float32Array(RN * 6), rainSeed = Array.from({ length: RN }, () => [Math.random() * 120 - 60, Math.random() * 50, Math.random() * 120 - 60]);
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xcfe2f5, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);

  /* ----- caméras ----- */
  const cam = new THREE.PerspectiveCamera(34, w / h, 0.5, 1200);
  const tvCams = corners.map((u) => { const i = Math.round((u.a + u.b) / 2) % N, o = -u.s * (HW + 20); return new THREE.Vector3(P[i].x + SIDE[i].x * o, 9, P[i].z + SIDE[i].z * o); });
  for (let i = 0; i < N; i += Math.round(N / 7)) tvCams.push(new THREE.Vector3(P[i].x + SIDE[i].x * (HW + 18), 8, P[i].z + SIDE[i].z * (HW + 18)));
  let camMode = 'tv', tvI = -1, focus = me, focusUntil = 0;
  const box = new THREE.Box3().setFromPoints(P), ctr = box.getCenter(new THREE.Vector3()), span = box.getSize(new THREE.Vector3());
  const look = new THREE.Vector3().copy(P[0]), want = new THREE.Vector3();

  const place = (c, T, dt, now) => {
    const a = gapAt.get(c.x.i);
    const Tc = c.out ? Math.min(T, c.out.T) : Math.min(T, LAPS);
    const L = Math.min(LAPS - 1, Math.floor(Tc)), k = Tc - L;
    const gap = lerp(a[L], a[Math.min(a.length - 1, L + 1)], c.out && L >= c.out.lap - 1 ? 0 : k);
    let prog = Tc - gap / LT, lat = c.lane, yaw = 0;
    const after = c.out && T > c.out.T ? (T - c.out.T) : -1; // en tours
    let hide = false;
    if (after >= 0) {
      const sec = after * lapSec; // secondes réelles depuis l'incident (à vitesse ×1)
      if (!c.out.told) { c.out.told = true; focus = c; focusUntil = now + 4200; if (onIncident) onIncident(c.x, c.out); }
      const j0 = Math.floor((((prog % 1) + 1) % 1) * N), side = (K[j0] || 0) >= 0 ? -1 : 1;
      if (c.out.crash) {
        const e = 1 - Math.exp(-sec * 1.3);
        prog += 0.012 * e; lat = c.lane + side * (HW + 9.5) * e; yaw = e < 0.98 ? sec * 9 * (1 - e) + e * 2.2 : 2.2;
        if (sec < 2.5 && Math.random() < 0.6) puff(c.g.position.x, 0.8, c.g.position.z, 0x8a7a5c, 3 + Math.random() * 3, 1.2);
        else if (sec < 30 && Math.random() < 0.12) puff(c.g.position.x, 1.2, c.g.position.z, 0x3a3a3a, 2.5, 1.8, 2.4);
      } else {
        const e = 1 - Math.exp(-sec * 0.6);
        prog += 0.03 * e; lat = c.lane - side * (HW + 2.2) * Math.min(1, sec / 3);
        if (sec < 40 && Math.random() < (sec < 5 ? 0.7 : 0.2)) puff(c.g.position.x - TAN[j0].x * 2.4, 1 + Math.random(), c.g.position.z - TAN[j0].z * 2.4, c.out.why === 'Moteur' || c.out.why === 'Surchauffe' ? 0xe8e8e8 : 0x555555, 2.4 + Math.random() * 2.6, 2.2, 2.2);
        if ((c.out.why === 'Moteur' || c.out.why === 'Freins') && sec < 9 && Math.random() < 0.5) puff(c.g.position.x - TAN[j0].x * 2.2, 0.8, c.g.position.z - TAN[j0].z * 2.2, 0xff7a14, 1.2 + Math.random(), 0.45, 1);
      }
      hide = after > 1.6; // la voiture est évacuée par les commissaires
    }
    const u = ((prog % 1) + 1) % 1, f = u * N, j = Math.floor(f) % N, j2 = (j + 1) % N, kk = f - Math.floor(f);
    const x = lerp(P[j].x, P[j2].x, kk) + SIDE[j].x * lat, z = lerp(P[j].z, P[j2].z, kk) + SIDE[j].z * lat;
    c.g.position.set(x, 0, z); c.g.rotation.y = tr.head(TAN[j]) + yaw; c.g.visible = !hide; c.prog = prog; c.j = j; c.stopped = after >= 0;
  };

  let alive = true, raf = 0, prev = performance.now(), visible = true, flash = 0;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((e) => { visible = e[0].isIntersecting; }) : null; if (io) io.observe(el);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { [w, h] = size(); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }) : null; if (ro) ro.observe(el);
  const col = new THREE.Color(), tmp = new THREE.Vector3();
  const loop = () => {
    if (!alive) return; raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (!visible || document.hidden) return;
    const rawT = getT(), T = clamp(rawT, 0, LAPS);
    // météo interpolée
    const L = Math.min(LAPS - 1, Math.floor(T)), k = T - L, A = res.weather[L], B = res.weather[L + 1] || A;
    const rainV = lerp(A.rain, B.rain, k), wet = lerp(A.wet, B.wet, k), cloud = lerp(A.cloud, B.cloud, k);
    col.copy(SKY[0]).lerp(SKY[1], clamp(cloud * 1.3, 0, 1)).lerp(SKY[2], clamp(rainV * 1.2 - 0.25, 0, 1));
    if (flash > 0) { flash -= dt * 4; col.lerp(new THREE.Color(0xffffff), Math.max(0, flash) * 0.6); } else if (rainV > 0.6 && Math.random() < dt * 0.25) flash = 1;
    scene.background.copy(col); scene.fog.color.copy(col); scene.fog.near = lerp(140, 50, rainV); scene.fog.far = lerp(620, 260, rainV);
    sun.intensity = lerp(2.4, 0.5, clamp(cloud, 0, 1)); hemi.intensity = lerp(1.35, 0.95, cloud) + Math.max(0, flash);
    roadMat.color.setHex(0x4a4d55).lerp(new THREE.Color(0x16181d), wet * 0.85); roadMat.roughness = lerp(0.92, 0.18, wet); roadMat.metalness = lerp(0, 0.55, wet);
    grassMat.color.setHex(0x5a9a44).lerp(new THREE.Color(0x35603a), cloud);
    // feux de départ
    if (gantry.userData.lights) gantry.userData.lights.forEach((l, i) => { l.material.emissiveIntensity = rawT < 0 && rawT > -0.5 + (i + 1) * 0.085 ? 3.5 : 0; });
    cars.forEach((c) => place(c, T, dt, now));
    // projections d'eau
    if (wet > 0.25) cars.forEach((c) => { if (!c.stopped && c.g.visible && Math.random() < wet * 0.5) puff(c.g.position.x - TAN[c.j].x * 3, 0.9, c.g.position.z - TAN[c.j].z * 3, 0xdfe8f2, 2.5 + wet * 3, 0.7, 2); });
    // voiture de sécurité
    const scOn = res.scLap > 0 && T > res.scLap - 0.75 && T < res.scLap + 0.85;
    sc.visible = scOn;
    if (scOn) { const lead = Math.max(...cars.filter((c) => !c.stopped).map((c) => c.prog)); const u = (((lead + 0.014) % 1) + 1) % 1, j = Math.floor(u * N) % N; sc.position.set(P[j].x, 0, P[j].z); sc.rotation.y = tr.head(TAN[j]); sc.userData.light.material.emissiveIntensity = Math.sin(now / 90) > 0 ? 3 : 0.2; }
    // repère du joueur
    mk.visible = ring.visible = me.g.visible; mk.position.set(me.g.position.x, 4.6 + Math.sin(now / 300) * 0.35, me.g.position.z); mk.rotation.y = now / 600; ring.position.set(me.g.position.x, 0.06, me.g.position.z);
    // particules
    puffs.forEach((s) => { if (!s.visible) return; const d = s.userData; d.life -= dt; if (d.life <= 0) { s.visible = false; return; } const q = 1 - d.life / d.max; const sz = d.size * (0.6 + q * 1.6); s.scale.set(sz, sz, 1); s.position.y += dt * d.vy; s.material.opacity = (1 - q) * 0.6; });
    rainMat.opacity = clamp(rainV * 0.75, 0, 0.6); rain.visible = rainV > 0.03;
    if (rain.visible) {
      const fall = 70 * dt;
      for (let i = 0; i < RN; i++) { const s = rainSeed[i]; s[1] -= fall; if (s[1] < 0) s[1] += 50; const o = i * 6; const X = look.x + s[0], Z = look.z + s[2]; rainPos[o] = X; rainPos[o + 1] = s[1]; rainPos[o + 2] = Z; rainPos[o + 3] = X + 0.5; rainPos[o + 4] = s[1] - 1.8 - rainV * 1.6; rainPos[o + 5] = Z; }
      rainGeo.attributes.position.needsUpdate = true;
    }
    // caméra
    if (now > focusUntil) focus = me.g.visible && !(me.out && T > me.out.T + 0.6) ? me : cars.filter((c) => !c.stopped).sort((a, b) => b.prog - a.prog)[0] || me;
    const fp = focus.g.position;
    if (camMode === 'map') { want.set(ctr.x + span.x * 0.15, Math.max(span.x, span.z) * 0.95 / Math.min(1.6, w / h) * 1.15, ctr.z + span.z * 0.95); cam.position.lerp(want, Math.min(1, dt * 2)); look.lerp(ctr, Math.min(1, dt * 3)); cam.fov = 34; }
    else if (camMode === 'onboard') { const t = TAN[focus.j || 0]; want.set(fp.x - t.x * 11, 4.2, fp.z - t.z * 11); cam.position.copy(want); look.set(fp.x + t.x * 8, 1, fp.z + t.z * 8); cam.fov = 52; }
    else if (camMode === 'heli') { want.set(fp.x - 26, 58, fp.z + 34); cam.position.lerp(want, Math.min(1, dt * 4)); look.lerp(fp, Math.min(1, dt * 9)); cam.fov = 30; }
    else { // réalisation TV : caméra de bord de piste la plus proche de la voiture suivie
      let best = tvI, bd = tvI >= 0 ? tvCams[tvI].distanceTo(fp) * 0.8 : 1e9;
      tvCams.forEach((p, i) => { const d = p.distanceTo(fp); if (d < bd) { bd = d; best = i; } });
      if (best !== tvI) { tvI = best; cam.position.copy(tvCams[tvI]); look.copy(fp); }
      look.lerp(fp, Math.min(1, dt * 10)); cam.fov += (clamp(1150 / tvCams[tvI].distanceTo(fp), 8, 32) - cam.fov) * Math.min(1, dt * 4);
    }
    cam.updateProjectionMatrix(); cam.lookAt(look);
    r.render(scene, cam);
  };
  loop();
  return {
    setCam(m) { camMode = m; tvI = -1; },
    weatherAt(T) { const L = Math.min(LAPS - 1, Math.floor(clamp(T, 0, LAPS))); return res.weather[L]; },
    dispose() {
      alive = false; cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      r.dispose(); r.forceContextLoss && r.forceContextLoss();
    },
  };
}

F1.race3d = { mount };
window.dispatchEvent(new Event('race3d-ready'));
