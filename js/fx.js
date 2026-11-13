/* PITWALL — effets « sport auto » : drapeau à damier entre les pages, étincelles au clic,
   lignes de vitesse au défilement, apparitions en cascade, indicateur de navigation façon vibreur. */
(function (F1) {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Drapeau à damier qui flotte sur tout l'écran ---------- */
  let wipe = null;
  function flagWipe(onCover) {
    if (reduce) { onCover(); return; }
    if (wipe) { wipe.pending = onCover; return; }   // déjà en cours : on remplace la page à la couverture
    const cv = document.getElementById('flagWipe');
    const ctx = cv.getContext('2d');
    const q = Math.min(1.25, window.devicePixelRatio || 1);
    const W = innerWidth, H = innerHeight;
    cv.width = Math.round(W * q); cv.height = Math.round(H * q);
    cv.classList.add('on');
    const L = W * 1.55, FH = H * 1.32;               // longueur / hauteur du tissu
    const rows = 8, sq = FH / rows, cols = Math.ceil(L / sq), sub = 2;
    const nu = cols * sub, nv = rows * sub;
    const X = new Float32Array((nu + 1) * (nv + 1)), Y = new Float32Array(X.length), Z = new Float32Array(X.length);
    const t0 = performance.now();
    wipe = { pending: onCover, phase: 0, start: t0, from: -W * 0.04 };
    const P1 = 360, P2 = 520, X1 = W * 1.12, X2 = W + L + W * 0.08;
    const ease1 = (k) => 1 - Math.pow(1 - k, 3), ease2 = (k) => k * k * (1.6 - 0.6 * k);
    const draw = (now) => {
      const el = now - wipe.start;
      let px;
      if (wipe.phase === 0) {
        const k = Math.min(1, el / P1); px = wipe.from + (X1 - wipe.from) * ease1(k);
        if (k >= 1) {
          const cb = wipe.pending; wipe.pending = null;
          try { cb && cb(); } catch (e) { console.error(e); }
          wipe.phase = 1; wipe.start = performance.now(); requestAnimationFrame(draw); return;
        }
      } else {
        if (wipe.pending) { const cb = wipe.pending; wipe.pending = null; try { cb(); } catch (e) { console.error(e); } }
        const k = Math.min(1, el / P2); px = X1 + (X2 - X1) * ease2(k);
        if (k >= 1) { ctx.clearRect(0, 0, cv.width, cv.height); cv.classList.remove('on'); wipe = null; return; }
      }
      const tt = (now - t0) / 1000;
      ctx.setTransform(q, 0, 0, q, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate(-0.06); ctx.translate(-W / 2, -H / 2);
      // maillage du tissu : ondulation qui s'amplifie vers le bord libre
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        for (let i = 0; i <= nu; i++) {
          const u = i / nu, a = (0.15 + u) * sq * 0.55;
          const ph = u * 9.5 - tt * 15 + v * 1.4;
          const z = Math.sin(ph) * a;
          const k2 = j * (nu + 1) + i;
          X[k2] = px - u * L + z * 0.18;
          Y[k2] = H / 2 + (v - 0.5) * FH + z * 0.32 + u * u * H * 0.05;
          Z[k2] = Math.cos(ph) * (0.25 + u);
        }
      }
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
          if (X[b] < -2 && X[a] < -2) continue;
          if (X[a] > W + 2 && X[b] > W + 2) continue;
          const white = ((Math.floor(i / sub) + Math.floor(j / sub)) & 1) === 0;
          const s = Math.max(0.35, Math.min(1.2, 0.82 + (Z[a] + Z[c]) * 0.22));
          const g = white ? Math.round(236 * s) : Math.round(20 + 22 * s);
          ctx.fillStyle = ctx.strokeStyle = `rgb(${g},${g},${white ? Math.min(255, g + 4) : g + 3})`;
          ctx.beginPath(); ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[b], Y[b]); ctx.lineTo(X[c], Y[c]); ctx.lineTo(X[d], Y[d]); ctx.closePath();
          ctx.fill(); ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
      // ombre portée du tissu sur le bord d'attaque + mât
      const top = Y[0] - 40, bot = Y[(nu + 1) * nv] + 40;
      const gr = ctx.createLinearGradient(px - 7, 0, px + 9, 0);
      gr.addColorStop(0, '#2a2c33'); gr.addColorStop(0.45, '#d9dbe2'); gr.addColorStop(1, '#3a3c44');
      ctx.fillStyle = gr; ctx.fillRect(px - 6, top, 14, bot - top);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(px + 8, top, 10, bot - top);
      ctx.restore();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  /* ---------- Étincelles (titane sous le fond plat) au clic ---------- */
  const parts = [];
  let sctx = null, scv = null, sRaf = 0;
  function sparks(x, y, n = 18, hue = 38) {
    if (reduce) return;
    if (!scv) { scv = document.getElementById('sparks'); sctx = scv.getContext('2d'); }
    const q = Math.min(2, window.devicePixelRatio || 1);
    if (scv.width !== Math.round(innerWidth * q)) { scv.width = Math.round(innerWidth * q); scv.height = Math.round(innerHeight * q); }
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, v = 180 + Math.random() * 420;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.4, age: 0, h: hue + Math.random() * 18 });
    }
    if (!sRaf) { let pt = performance.now(); const step = (now) => {
      const dt = Math.min(0.04, (now - pt) / 1000); pt = now;
      sctx.setTransform(q, 0, 0, q, 0, 0); sctx.clearRect(0, 0, innerWidth, innerHeight);
      sctx.globalCompositeOperation = 'lighter'; sctx.lineCap = 'round';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt;
        if (p.age > p.life) { parts.splice(i, 1); continue; }
        const ox = p.x, oy = p.y; p.vy += 900 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.age / p.life;
        sctx.strokeStyle = `hsla(${p.h},100%,${60 + 30 * k}%,${k})`; sctx.lineWidth = 1 + 1.6 * k;
        sctx.beginPath(); sctx.moveTo(ox - p.vx * dt * 1.5, oy - p.vy * dt * 1.5); sctx.lineTo(p.x, p.y); sctx.stroke();
      }
      sctx.globalCompositeOperation = 'source-over';
      sRaf = parts.length ? requestAnimationFrame(step) : 0;
      if (!sRaf) sctx.clearRect(0, 0, innerWidth, innerHeight);
    }; sRaf = requestAnimationFrame(step); }
  }
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.odd, .btn, .slip-fab, .tab, .rd-part, .chips button, .seg button, .seg a');
    if (!t) return;
    const gold = t.classList.contains('gold') || t.classList.contains('odd');
    sparks(e.clientX, e.clientY, t.classList.contains('odd') ? 14 : 20, gold ? 40 : 18);
  }, { passive: true });

  /* ---------- Lignes de vitesse quand on fait défiler vite ---------- */
  let lastY = scrollY, lastT = performance.now(), speedV = 0, slRaf = 0;
  const sl = () => document.getElementById('speedLines');
  function onScroll() {
    const now = performance.now(), dy = Math.abs(scrollY - lastY) / Math.max(1, now - lastT);
    lastY = scrollY; lastT = now;
    speedV = Math.max(speedV, Math.min(1, (dy - 0.8) / 3.5));
    if (!slRaf && !reduce) slRaf = requestAnimationFrame(decay);
  }
  function decay() {
    const el = sl(); speedV *= 0.9;
    if (el) el.style.opacity = speedV.toFixed(3);
    slRaf = speedV > 0.01 ? requestAnimationFrame(decay) : 0;
    if (!slRaf && el) el.style.opacity = 0;
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Apparition en cascade des cartes (comme les feux du départ) ---------- */
  const io = 'IntersectionObserver' in window && !reduce ? new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;
  function reveal(root) {
    if (!io) return;
    const els = root.querySelectorAll('.grid > *, .section-h, .tbl tbody tr, .race-card, .mcard, .lrow, .ach');
    const groups = new Map();
    els.forEach((el) => {
      if (el.closest('.hero') || el.closest('.rv')) return;
      const p = el.parentElement; const k = groups.get(p) || 0; groups.set(p, k + 1);
      el.style.setProperty('--rd', Math.min(k, 10) * 55 + 'ms');
      el.classList.add('rv'); io.observe(el);
    });
  }

  /* ---------- Indicateur de navigation (vibreur coulissant) ---------- */
  function navIndicator() {
    const nav = document.getElementById('nav'); if (!nav) return;
    let ind = nav.querySelector('.nav-ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'nav-ind'; nav.appendChild(ind); }
    const a = nav.querySelector('a.active');
    if (!a) { ind.style.opacity = 0; return; }
    ind.style.opacity = 1; ind.style.width = a.offsetWidth - 16 + 'px'; ind.style.transform = `translateX(${a.offsetLeft + 8}px)`;
  }
  window.addEventListener('resize', navIndicator);

  F1.fx = { flagWipe, sparks, reveal, navIndicator, reduce };
})(window.F1 = window.F1 || {});
