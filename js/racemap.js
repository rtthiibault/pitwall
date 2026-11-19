/* PITWALL — course manager en vue 2D, strictement vue du dessus : tracé réel du circuit et un point par voiture (canvas 2D).
   Position de chaque voiture : calculée à partir de SES temps au tour (et non de son écart au leader), sur l'horloge de course.
   Arrêts au stand : la voiture quitte la piste à 95 % du tour, roule dans une voie parallèle à la ligne droite des stands,
   s'immobilise à son stand, puis rejoint la piste à 5 % du tour suivant. Aucune téléportation, jamais ailleurs sur le circuit.
   Deux styles : « anim » (ambiance, pluie animée) et « flat » (2D épurée, aplats, sans effets). Mode config basse : 24 images/s. */
(function (F1) {
  const LT = 90; // durée de référence d'un tour (s), pour placer les voitures avant le départ
  const PIT_IN = 0.05, PIT_OUT = 0.05; // voie des stands : de 95 % du tour à 5 % du tour suivant
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (k) => k * k * (3 - 2 * k);

  // Tracé fermé : points de contrôle (tracé réel ou de secours), lissés (Catmull-Rom), puis rééchantillonnés à pas constant
  function makeTrack(seedStr, profile) {
    let ctrl = [];
    const real = F1.CIRCUITS && F1.CIRCUITS[seedStr];
    if (real) ctrl = real.split(' ').map((q) => q.split(',').map(Number));
    else {
      const r = rng(hash('track-' + seedStr));
      const n0 = Math.round(8 + (profile.df || 0.4) * 9);
      const stretch = 1.25 + (profile.speed || 0.35) * 1.1;
      for (let i = 0; i < n0; i++) {
        const straight = i <= 1 || i === n0 - 1;
        const a = Math.PI / 2 + (i / n0) * Math.PI * 2 + (straight ? 0 : (r() - 0.5) * (Math.PI * 2 / n0) * 0.55);
        const rad = straight ? 1 : 0.55 + r() * 0.62;
        ctrl.push([Math.cos(a) * 62 * rad * stretch, straight ? 58 : Math.sin(a) * 62 * rad]);
      }
    }
    const n = ctrl.length, SUB = real ? 6 : 24;
    const raw = [];
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB, t2 = t * t, t3 = t2 * t;
        raw.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    const len = [0];
    for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const total = len[raw.length], N = 900, P = [];
    let j = 0;
    for (let i = 0; i < N; i++) {
      const d = (i / N) * total;
      while (len[j + 1] < d) j++;
      const a = raw[j % raw.length], b = raw[(j + 1) % raw.length], k = (d - len[j]) / Math.max(1e-6, len[j + 1] - len[j]);
      P.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k)]);
    }
    return { P, N };
  }

  function mount(el, { res, seedStr, colorOf, getT, onIncident, style = 'anim', low = false }) {
    const cv = document.createElement('canvas'); cv.className = 'race-map-cv';
    el.innerHTML = ''; el.appendChild(cv);
    const ctx = cv.getContext('2d');
    const LAPS = res.LAPS || res.laps.length;
    const { P, N } = makeTrack(seedStr, res.w);
    const opt = { style, low };
    let W = 0, H = 0, S = [], NRM = [], inSide = 1, laneW = 15;
    const fit = () => {
      const q = opt.low ? 1 : Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(240, el.clientWidth); H = Math.max(160, el.clientHeight);
      cv.width = Math.round(W * q); cv.height = Math.round(H * q); ctx.setTransform(q, 0, 0, q, 0, 0);
      const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const pad = 34, k = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0));
      const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = (H - (y1 - y0) * k) / 2 + y1 * k;
      S = P.map((p) => [ox + p[0] * k, oy - p[1] * k]); // vue du dessus, y inversé : la ligne des stands est en bas
      NRM = S.map((p, i) => { const a = S[(i - 1 + N) % N], b = S[(i + 1) % N]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; });
      // la voie des stands longe la ligne droite des stands, du côté intérieur du circuit
      const cx = S.reduce((a, p) => a + p[0], 0) / N, cy = S.reduce((a, p) => a + p[1], 0) / N, p = S[0], nn = NRM[0];
      inSide = Math.hypot(p[0] + nn[0] * 10 - cx, p[1] + nn[1] * 10 - cy) < Math.hypot(p[0] - nn[0] * 10 - cx, p[1] - nn[1] * 10 - cy) ? 1 : -1;
      laneW = clamp(Math.min(W, H) * 0.035, 11, 17);
    };
    fit();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(fit) : null; if (ro) ro.observe(el);
    const at = (u, off = 0) => { const f = (((u % 1) + 1) % 1) * N, j = Math.floor(f) % N, j2 = (j + 1) % N, k = f - Math.floor(f); return [lerp(S[j][0], S[j2][0], k) + NRM[j][0] * off, lerp(S[j][1], S[j2][1], k) + NRM[j][1] * off]; };

    /* ---------- Horloge de course et position de chaque voiture ---------- */
    const tOf = (i) => res.tArr[i];
    // horloge : temps du leader, interpolé dans le tour en cours (T est exprimé en tours du leader)
    function clock(T) {
      const Lmax = res.lap;
      const lead = (k) => { let m = Infinity; for (const x of res.field) { if (x.out && x.out.lap <= k && k > 0) continue; const a = tOf(x.i); if (a[k] != null && a[k] < m) m = a[k]; } return m === Infinity ? 0 : m; };
      if (T <= 0) return T * LT; // procédure de départ : avant le premier tour
      const L = Math.min(Lmax - 1, Math.floor(T)), k = clamp(T - L, 0, 1);
      return lerp(lead(L), lead(Math.min(Lmax, L + 1)), k);
    }
    // progression (en tours) d'une voiture à l'instant tau, et décalage latéral si elle est dans la voie des stands
    function place(x, tau, c) {
      const a = tOf(x.i), n = a.length - 1;
      if (tau <= a[0]) return { u: (tau - a[0]) / LT, lane: 0 }; // sur la grille, derrière la ligne
      let k = 0; while (k < n && a[k + 1] <= tau) k++;
      if (x.out && k >= x.out.lap - 1) {
        // abandon : la voiture roule encore une partie du tour, puis s'arrête sur le bord de la piste
        const avg = n > 0 && x.out.lap > 1 ? (a[x.out.lap - 1] - a[0]) / (x.out.lap - 1) : LT;
        const f = Math.min(c.k, (tau - a[x.out.lap - 1]) / avg);
        return { u: x.out.lap - 1 + f, lane: 0, stopped: f >= c.k };
      }
      if (k >= n) return { u: n, lane: 0 };
      const D = a[k + 1] - a[k], lapNo = k + 1, f = (tau - a[k]) / D;
      const loss = (x.pitLoss || {})[lapNo] || 0, pitNow = (x.pitLaps || []).includes(lapNo), pitPrev = (x.pitLaps || []).includes(k);
      if (pitNow && loss > 0) {
        // tour avec arrêt : rythme normal jusqu'à l'entrée des stands, puis voie des stands (vitesse limitée + immobilisation)
        const clean = Math.max(1, D - loss), tIn = clean * (1 - PIT_IN);
        const e = tau - a[k];
        if (e < tIn) return { u: k + e / clean, lane: pitPrev && e < clean * PIT_OUT ? 1 - smooth(e / (clean * PIT_OUT)) : 0 };
        const s = clamp((e - tIn) / (D - tIn), 0, 1);
        // dans la voie : 0-30 % roule jusqu'au stand, 30-75 % immobile, 75-100 % repart vers la ligne
        const g = s < 0.3 ? smooth(s / 0.3) * 0.75 : s < 0.75 ? 0.75 : 0.75 + smooth((s - 0.75) / 0.25) * 0.25;
        return { u: k + 1 - PIT_IN + PIT_IN * g, lane: smooth(clamp(s / 0.12, 0, 1)), box: s >= 0.3 && s < 0.75 };
      }
      // sortie des stands au début du tour suivant
      if (pitPrev && f < PIT_OUT) return { u: k + f, lane: 1 - smooth(f / PIT_OUT) };
      return { u: k + f, lane: 0 };
    }

    const rr = rng(hash('inc-' + seedStr + res.field.length));
    const cars = res.field.map((x) => ({ x, col: colorOf(x), me: !!x.c.me, k: 0.2 + rr() * 0.65, told: false, stopAt: 0 }));
    const drops = Array.from({ length: 70 }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.8]);
    const FLAT = () => opt.style === 'flat';

    let alive = true, raf = 0, prev = performance.now(), lastDraw = 0;
    const loop = () => {
      if (!alive) return; raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (opt.low && now - lastDraw < 1000 / 24) return; // config basse : 24 images/s (la course, elle, est calculée à part)
      lastDraw = now;
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (document.hidden || !W) return;
      const rawT = getT(), T = clamp(rawT, -1, LAPS);
      const L = clamp(Math.floor(T), 0, LAPS - 1), kk = clamp(T - L, 0, 1), A = res.weather[L], B = res.weather[L + 1] || A;
      const rain = lerp(A.rain, B.rain, kk), wet = lerp(A.wet, B.wet, kk);
      const flat = FLAT();
      ctx.clearRect(0, 0, W, H);
      // fond
      if (flat) { ctx.fillStyle = wet > 0.12 ? '#141b24' : '#13171c'; ctx.fillRect(0, 0, W, H); }
      else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, `rgb(${Math.round(lerp(16, 12, rain))},${Math.round(lerp(19, 20, rain))},${Math.round(lerp(26, 38, rain))})`); g.addColorStop(1, '#0a0c11');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      // piste
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath(); S.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      const asphalt = wet > 0.08 ? `rgb(${Math.round(lerp(58, 40, wet))},${Math.round(lerp(63, 66, wet))},${Math.round(lerp(74, 104, wet))})` : flat ? '#2c333d' : '#3a3f4a';
      if (flat) { ctx.strokeStyle = '#4a535f'; ctx.lineWidth = 13; ctx.stroke(); ctx.strokeStyle = asphalt; ctx.lineWidth = 10; ctx.stroke(); }
      else {
        ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 17; ctx.stroke();
        ctx.strokeStyle = asphalt; ctx.lineWidth = 11; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1; ctx.setLineDash([5, 9]); ctx.stroke(); ctx.setLineDash([]);
      }
      // voie des stands : parallèle à la ligne droite des stands, de 95 % à 5 % du tour
      const PIT = laneW * inSide;
      const ramp = (u) => { const d = Math.min(Math.abs(u - (1 - PIT_IN)), Math.abs(u - PIT_OUT)); return smooth(clamp(d / 0.012, 0, 1)); };
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const u = 1 - PIT_IN + (i / 60) * (PIT_IN + PIT_OUT), p = at(u, PIT * ramp(u % 1)); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.strokeStyle = flat ? '#262c34' : '#2b2f38'; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = flat ? '#55606d' : 'rgba(142,203,255,.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
      // ligne de départ / arrivée
      { const a = at(0, -7), b = at(0, 7); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
      // feux de départ
      if (rawT < 0) { const p = at(0, -26 * inSide); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(p[0] - 24 + i * 12, p[1], 4, 0, 6.3); ctx.fillStyle = rawT > -0.5 + (i + 1) * 0.085 ? '#ff2b1c' : '#3a1512'; ctx.fill(); } }
      // voitures
      const tau = clock(T);
      let lead = -1e9; const dots = [];
      for (const c of cars) {
        const pl = place(c.x, tau, c);
        let off = ((c.x.i * 7) % 5 - 2) * 1.3 * (1 - pl.lane) + PIT * pl.lane, state = pl.lane > 0.5 ? 'pit' : 'run', fade = 1;
        if (pl.stopped) {
          if (!c.stopAt) c.stopAt = now;
          if (!c.told) { c.told = true; if (onIncident) onIncident(c.x, { lap: c.x.out.lap, why: c.x.out.why, crash: c.x.out.why === 'Accident' }); }
          const sec = (now - c.stopAt) / 1000, crash = c.x.out.why === 'Accident';
          off = (crash ? -inSide : inSide) * Math.min(13, sec * 9); state = crash ? 'crash' : 'mech'; fade = clamp(1.6 - sec / 9, 0, 1);
        } else if (pl.u > lead) lead = pl.u;
        if (fade > 0) dots.push({ c, p: at(pl.u, off), state, fade, prog: pl.u, box: pl.box });
      }
      dots.sort((a, b) => (a.c.me ? 1 : 0) - (b.c.me ? 1 : 0));
      const first = dots.filter((d) => d.state === 'run' || d.state === 'pit').sort((a, b) => b.prog - a.prog)[0];
      for (const d of dots) {
        const [x, y] = d.p, R = d.c.me ? 7.5 : 5.5;
        ctx.globalAlpha = d.fade;
        if (d.state === 'crash' || d.state === 'mech') {
          if (!flat) { ctx.beginPath(); ctx.arc(x, y, 9 + Math.sin(now / 160) * 2, 0, 6.3); ctx.fillStyle = d.state === 'crash' ? 'rgba(255,212,0,.28)' : 'rgba(200,200,200,.22)'; ctx.fill(); }
          ctx.beginPath(); ctx.arc(x, y, R, 0, 6.3); ctx.fillStyle = '#5b606b'; ctx.fill();
          ctx.strokeStyle = d.state === 'crash' ? '#ffd400' : '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke();
        } else {
          if (d.c.me && !flat) { ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(now / 240) * 1.5, 0, 6.3); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.stroke(); }
          ctx.beginPath(); ctx.arc(x, y, R, 0, 6.3); ctx.fillStyle = d.c.col; ctx.fill();
          ctx.lineWidth = d.c.me ? 2.2 : 1.2; ctx.strokeStyle = d.state === 'pit' ? '#8ecbff' : d.c.me ? '#fff' : 'rgba(0,0,0,.65)'; ctx.stroke();
        }
        if (d.c.me || d === first || d.state === 'pit') {
          const t = d.state === 'pit' ? (d.box ? 'ARRÊT' : 'STANDS') : d.c.me ? 'VOUS' : 'P1';
          ctx.font = '700 10px Archivo, sans-serif'; const tw = ctx.measureText(t).width + 8;
          ctx.fillStyle = 'rgba(8,9,14,.85)'; ctx.fillRect(x - tw / 2, y - R - 19, tw, 13);
          ctx.fillStyle = d.state === 'pit' ? '#8ecbff' : '#fff'; ctx.textAlign = 'center'; ctx.fillText(t, x, y - R - 9);
        }
        ctx.globalAlpha = 1;
      }
      // voiture de sécurité, juste devant le leader
      const scOn = res.scLap > 0 && T > res.scLap - 0.75 && T < res.scLap + (res.scLen || 2) - 0.15;
      if (scOn && lead > -1e8) {
        const p = at(lead + 0.014);
        ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 6.3); ctx.fillStyle = flat || Math.sin(now / 110) > 0 ? '#ff8a00' : '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = '700 10px Archivo, sans-serif'; ctx.fillStyle = '#ff8a00'; ctx.textAlign = 'center'; ctx.fillText('SC', p[0], p[1] - 10);
      }
      // pluie : traits animés (style animé, hors config basse) ou simple voile bleuté
      if (rain > 0.04) {
        if (flat || opt.low) { ctx.fillStyle = `rgba(80,130,200,${clamp(rain * 0.12, 0.03, 0.12)})`; ctx.fillRect(0, 0, W, H); }
        else {
          ctx.strokeStyle = `rgba(190,215,245,${clamp(rain * 0.5, 0.08, 0.4)})`; ctx.lineWidth = 1; ctx.beginPath();
          const n = Math.round(drops.length * clamp(rain * 1.3, 0.15, 1));
          for (let i = 0; i < n; i++) { const d = drops[i]; d[1] += dt * d[2] * 1.4; if (d[1] > 1) { d[1] -= 1; d[0] = Math.random(); } const x = d[0] * W, y = d[1] * H; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); }
          ctx.stroke();
        }
      }
    };
    loop();
    return {
      setStyle(s) { opt.style = s; },
      setLow(v) { opt.low = !!v; fit(); },
      dispose() { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); el.innerHTML = ''; },
    };
  }

  F1.racemap = { mount };
})(window.F1 = window.F1 || {});
