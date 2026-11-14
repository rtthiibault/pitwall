/* PITWALL — course manager en vue 2D : tracé du circuit et un point par voiture (canvas 2D, très léger).
   Le tracé est stylisé (généré à partir du profil du circuit), pas le dessin exact du vrai circuit. */
(function (F1) {
  const LT = 90; // durée d'un tour « simulé » en secondes : convertit les écarts en distance sur le tracé
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Tracé fermé : points de contrôle autour d'une ellipse, lissés (Catmull-Rom), puis rééchantillonnés à pas constant
  function makeTrack(seedStr, profile) {
    const r = rng(hash('track-' + seedStr));
    const n = Math.round(8 + (profile.df || 0.4) * 9);
    const stretch = 1.25 + (profile.speed || 0.35) * 1.1;
    const ctrl = [];
    for (let i = 0; i < n; i++) {
      const straight = i <= 1 || i === n - 1; // ligne droite des stands autour du départ
      const a = Math.PI / 2 + (i / n) * Math.PI * 2 + (straight ? 0 : (r() - 0.5) * (Math.PI * 2 / n) * 0.55);
      const rad = straight ? 1 : 0.55 + r() * 0.62;
      ctrl.push([Math.cos(a) * 62 * rad * stretch, straight ? 58 : Math.sin(a) * 62 * rad]);
    }
    const raw = [];
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      for (let k = 0; k < 24; k++) {
        const t = k / 24, t2 = t * t, t3 = t2 * t;
        raw.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    const len = [0];
    for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const total = len[raw.length], N = 480, P = [];
    let j = 0;
    for (let i = 0; i < N; i++) {
      const d = (i / N) * total;
      while (len[j + 1] < d) j++;
      const a = raw[j % raw.length], b = raw[(j + 1) % raw.length], k = (d - len[j]) / Math.max(1e-6, len[j + 1] - len[j]);
      P.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k)]);
    }
    return { P, N };
  }

  function mount(el, { res, seedStr, colorOf, getT, onIncident, lapSec = 6 }) {
    const cv = document.createElement('canvas'); cv.className = 'race-map-cv';
    el.innerHTML = ''; el.appendChild(cv);
    const ctx = cv.getContext('2d');
    const LAPS = res.laps.length;
    const { P, N } = makeTrack(seedStr, res.w);
    let W = 0, H = 0, S = [], NRM = [];
    const fit = () => {
      const q = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(240, el.clientWidth); H = Math.max(160, el.clientHeight);
      cv.width = Math.round(W * q); cv.height = Math.round(H * q); ctx.setTransform(q, 0, 0, q, 0, 0);
      const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const pad = 34, k = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0));
      const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = (H - (y1 - y0) * k) / 2 + y1 * k;
      S = P.map((p) => [ox + p[0] * k, oy - p[1] * k]); // y inversé : la ligne des stands est en bas
      NRM = S.map((p, i) => { const a = S[(i - 1 + N) % N], b = S[(i + 1) % N]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; });
    };
    fit();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(fit) : null; if (ro) ro.observe(el);
    // intérieur du circuit (pour placer la voie des stands du bon côté)
    const cx = () => S.reduce((a, p) => a + p[0], 0) / N, cy = () => S.reduce((a, p) => a + p[1], 0) / N;

    // écarts par voiture à la fin de chaque tour
    const gapAt = new Map();
    res.field.forEach((x) => gapAt.set(x.i, [(x.grid - 1) * (res.gridGap || 0.6)]));
    res.laps.forEach((order) => order.forEach((o) => { const a = gapAt.get(o.i); a.push(o.gap == null ? a[a.length - 1] : o.gap); }));
    const rr = rng(hash('inc-' + seedStr + res.field.length));
    const cars = res.field.map((x) => ({
      x, col: colorOf(x), me: !!x.c.me, pits: x.pitLaps || [],
      out: x.out ? { lap: x.out.lap, why: x.out.why, crash: x.out.why === 'Accident', T: x.out.lap - 1 + 0.2 + rr() * 0.65, told: false } : null,
    }));
    const at = (u, off = 0) => { const f = (((u % 1) + 1) % 1) * N, j = Math.floor(f) % N, j2 = (j + 1) % N, k = f - Math.floor(f); return [lerp(S[j][0], S[j2][0], k) + NRM[j][0] * off, lerp(S[j][1], S[j2][1], k) + NRM[j][1] * off]; };
    const drops = Array.from({ length: 70 }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.8]);

    let alive = true, raf = 0, prev = performance.now();
    const loop = () => {
      if (!alive) return; raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (document.hidden || !W) return;
      const rawT = getT(), T = clamp(rawT, 0, LAPS);
      const L = Math.min(LAPS - 1, Math.floor(T)), k = T - L, A = res.weather[L], B = res.weather[L + 1] || A;
      const rain = lerp(A.rain, B.rain, k), wet = lerp(A.wet, B.wet, k);
      ctx.clearRect(0, 0, W, H);
      // fond : s'assombrit et bleuit quand il pleut
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgb(${Math.round(lerp(16, 12, rain))},${Math.round(lerp(19, 20, rain))},${Math.round(lerp(26, 38, rain))})`); g.addColorStop(1, '#0a0c11');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // tracé
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath(); S.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 17; ctx.stroke();
      ctx.strokeStyle = wet > 0.08 ? `rgb(${Math.round(lerp(58, 40, wet))},${Math.round(lerp(63, 66, wet))},${Math.round(lerp(74, 104, wet))})` : '#3a3f4a'; ctx.lineWidth = 11; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1; ctx.setLineDash([5, 9]); ctx.stroke(); ctx.setLineDash([]);
      // voie des stands (côté intérieur) et ligne de départ
      const inSide = (() => { const p = S[0], n = NRM[0]; return Math.hypot(p[0] + n[0] * 10 - cx(), p[1] + n[1] * 10 - cy()) < Math.hypot(p[0] - n[0] * 10 - cx(), p[1] - n[1] * 10 - cy()) ? 1 : -1; })();
      const PIT = 15 * inSide;
      ctx.beginPath(); for (let i = -26; i <= 26; i++) { const p = at(i / N, PIT * Math.min(1, (26 - Math.abs(i)) / 8)); i === -26 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
      ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = 5; ctx.stroke();
      { const a = at(0, -8), b = at(0, 8); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
      // feux de départ
      if (rawT < 0) { const p = at(0, -24 * inSide); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(p[0] - 24 + i * 12, p[1], 4, 0, 6.3); ctx.fillStyle = rawT > -0.5 + (i + 1) * 0.085 ? '#ff2b1c' : '#3a1512'; ctx.fill(); } }
      // voitures
      let lead = -1e9; const dots = [];
      for (const c of cars) {
        const a = gapAt.get(c.x.i);
        const Tc = c.out ? Math.min(T, c.out.T) : T;
        const Lc = Math.min(LAPS - 1, Math.floor(Tc)), kc = Tc - Lc;
        const gap = lerp(a[Lc], a[Math.min(a.length - 1, Lc + 1)], c.out && Lc >= c.out.lap - 1 ? 0 : kc);
        const prog = Tc - gap / LT;
        let off = ((c.x.i * 7) % 5 - 2) * 1.3, state = 'run', fade = 1;
        if (c.out && T > c.out.T) {
          const sec = (T - c.out.T) * lapSec;
          if (!c.out.told) { c.out.told = true; if (onIncident) onIncident(c.x, c.out); }
          off = (c.out.crash ? -inSide : inSide) * Math.min(13, sec * 9); state = c.out.crash ? 'crash' : 'mech'; fade = clamp(1.6 - sec / 9, 0, 1);
        } else {
          // arrêt au stand : la voiture passe par la voie des stands à la fin du tour concerné
          const lapNo = Math.floor(prog) + 1, u = prog - Math.floor(prog);
          if ((c.pits.includes(lapNo) && u > 0.945) || (c.pits.includes(lapNo - 1) && u < 0.055)) { off = PIT * Math.min(1, (0.055 - Math.min(Math.abs(u - 1), u)) / 0.02 + 0.2); state = 'pit'; }
          if (prog > lead) lead = prog;
        }
        if (fade > 0) dots.push({ c, p: at(prog, off), state, fade, prog });
      }
      dots.sort((a, b) => (a.c.me ? 1 : 0) - (b.c.me ? 1 : 0));
      const first = dots.filter((d) => d.state === 'run' || d.state === 'pit').sort((a, b) => b.prog - a.prog)[0];
      for (const d of dots) {
        const [x, y] = d.p, R = d.c.me ? 8 : 6;
        ctx.globalAlpha = d.fade;
        if (d.state === 'crash' || d.state === 'mech') {
          ctx.beginPath(); ctx.arc(x, y, 9 + Math.sin(now / 160) * 2, 0, 6.3); ctx.fillStyle = d.state === 'crash' ? 'rgba(255,212,0,.28)' : 'rgba(200,200,200,.22)'; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, R, 0, 6.3); ctx.fillStyle = '#5b606b'; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke();
        } else {
          if (d.c.me) { ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(now / 240) * 1.5, 0, 6.3); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.stroke(); }
          ctx.beginPath(); ctx.arc(x, y, R, 0, 6.3); ctx.fillStyle = d.c.col; ctx.fill();
          ctx.lineWidth = d.c.me ? 2.2 : 1.2; ctx.strokeStyle = d.state === 'pit' ? '#8ecbff' : d.c.me ? '#fff' : 'rgba(0,0,0,.65)'; ctx.stroke();
        }
        if (d.c.me || d === first || d.state === 'pit') {
          const t = d.state === 'pit' ? 'STAND' : d.c.me ? 'VOUS' : 'P1';
          ctx.font = '900 10px Titillium Web, sans-serif'; const tw = ctx.measureText(t).width + 8;
          ctx.fillStyle = 'rgba(8,9,14,.82)'; ctx.fillRect(x - tw / 2, y - R - 19, tw, 13);
          ctx.fillStyle = d.state === 'pit' ? '#8ecbff' : '#fff'; ctx.textAlign = 'center'; ctx.fillText(t, x, y - R - 9);
        }
        ctx.globalAlpha = 1;
      }
      // voiture de sécurité
      if (res.scLap > 0 && T > res.scLap - 0.75 && T < res.scLap + 0.85 && lead > -1e8) {
        const p = at(lead + 0.014);
        ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 6.3); ctx.fillStyle = Math.sin(now / 110) > 0 ? '#ff8a00' : '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = '900 10px Titillium Web, sans-serif'; ctx.fillStyle = '#ff8a00'; ctx.textAlign = 'center'; ctx.fillText('SC', p[0], p[1] - 10);
      }
      // pluie : quelques traits légers
      if (rain > 0.04) {
        ctx.strokeStyle = `rgba(190,215,245,${clamp(rain * 0.5, 0.08, 0.4)})`; ctx.lineWidth = 1; ctx.beginPath();
        const n = Math.round(drops.length * clamp(rain * 1.3, 0.15, 1));
        for (let i = 0; i < n; i++) { const d = drops[i]; d[1] += dt * d[2] * 1.4; if (d[1] > 1) { d[1] -= 1; d[0] = Math.random(); } const x = d[0] * W, y = d[1] * H; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); }
        ctx.stroke();
      }
    };
    loop();
    return { dispose() { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); el.innerHTML = ''; } };
  }

  F1.racemap = { mount };
})(window.F1 = window.F1 || {});
