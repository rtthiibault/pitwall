/* PITWALL — effets « sport auto » : drapeau à damier entre les pages, étincelles au clic,
   lignes de vitesse au défilement, apparitions en cascade, indicateur de navigation façon vibreur. */
(function (F1) {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Drapeau à damier qui flotte sur tout l'écran ---------- */
  let wipe = null;
  let low = false; // mode config basse : effets allégés
  function flagWipe(onCover) {
    if (reduce || low) { onCover(); return; }
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

  /* ---------- Traces de pneus sur les bords, laissées par une petite F1 ----------
     Une monoplace vue de dessus descend dans chaque marge au rythme du défilement et dépose deux traces de gomme
     (ses roues arrière). Elle glisse d'un virage à l'autre avec un léger contre-braquage. Tout reste dans les marges,
     peu contrasté, et rien ne tourne en boucle : l'animation ne s'exécute que lorsque la page défile. */
  const CAR_SVG = '<svg viewBox="0 0 24 64" aria-hidden="true">'
    + '<rect class="wh" x="0" y="8" width="5" height="9" rx="1.6"/><rect class="wh" x="19" y="8" width="5" height="9" rx="1.6"/>'
    + '<rect class="wh" x="0" y="44" width="6" height="11" rx="1.8"/><rect class="wh" x="18" y="44" width="6" height="11" rx="1.8"/>'
    + '<rect class="wg" x="2" y="1" width="20" height="3.2" rx="1"/>'
    + '<path class="bd" d="M10.6 3 L13.4 3 L14.6 20 L18 25 L18.4 41 L16 49 L15 57 L9 57 L8 49 L5.6 41 L6 25 L9.4 20 Z"/>'
    + '<ellipse class="ck" cx="12" cy="30" rx="2.4" ry="4.2"/>'
    + '<rect class="wg" x="3" y="58" width="18" height="4.4" rx="1"/></svg>';
  function skidMarks() {
    const el = document.getElementById('skids'); if (!el || el.firstChild) return;
    const NS = 'http://www.w3.org/2000/svg';
    const sides = ['l', 'r'].map((side) => {
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'skid ' + side); svg.setAttribute('viewBox', '0 0 100 1000'); svg.setAttribute('preserveAspectRatio', 'none');
      // ligne médiane ondulée : la voiture enchaîne les virages d'un bord à l'autre de la marge
      const pts = []; for (let y = 0; y <= 1000; y += 10) { const k = y / 1000; pts.push([50 + Math.sin(k * Math.PI * 3.2 + (side === 'r' ? 1.4 : 0)) * 22 + Math.sin(k * Math.PI * 9) * 4, y]); }
      const tracks = [0, 1].map(() => { const p = document.createElementNS(NS, 'path'); p.setAttribute('pathLength', '1000'); svg.appendChild(p); return p; });
      el.appendChild(svg);
      const car = document.createElement('div'); car.className = 'skid-car ' + side; car.innerHTML = CAR_SVG; el.appendChild(car);
      return { side, svg, pts, tracks, car, cum: [], w: 0, h: 0, left: 0, carW: 0 };
    });

    // géométrie en pixels (l'échelle du SVG n'est pas uniforme) : abscisse curviligne de la ligne médiane
    const layout = () => sides.forEach((S) => {
      const r = S.svg.getBoundingClientRect(); S.w = r.width; S.h = r.height; S.left = r.left;
      S.carW = Math.max(12, Math.min(24, S.w * 0.28));
      const P = S.pts.map(([x, y]) => S.px(x, y)); S.P = P;
      S.cum = [0]; for (let i = 1; i < P.length; i++) S.cum.push(S.cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      // les deux traces suivent les roues arrière, de part et d'autre de la ligne médiane (décalage normal, en pixels)
      const off = S.carW * 0.4;
      [-1, 1].forEach((sg, j) => {
        const d = P.map((p, i) => {
          const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
          const tx = b[0] - a[0], ty = b[1] - a[1], n = Math.hypot(tx, ty) || 1;
          const X = p[0] + (-ty / n) * off * sg, Y = p[1] + (tx / n) * off * sg;
          return `${(((S.side === 'r' ? S.left + S.w - X : X - S.left) / (S.w || 1)) * 100).toFixed(2)} ${((Y / (S.h || 1)) * 1000).toFixed(1)}`;
        });
        S.tracks[j].setAttribute('d', 'M' + d.join(' L'));
      });
      S.car.style.width = S.carW + 'px'; S.car.style.height = S.carW * 2.67 + 'px';
      S.car.hidden = S.w < 40;
    });
    sides.forEach((S) => { S.px = (x, y) => [S.side === 'r' ? S.left + S.w * (1 - x / 100) : S.left + (S.w * x) / 100, (S.h * y) / 1000]; });

    // point et cap à une fraction donnée de la longueur
    const at = (S, f) => {
      const L = S.cum[S.cum.length - 1] * f; let i = 1; while (i < S.cum.length - 1 && S.cum[i] < L) i++;
      const a = S.P[i - 1], b = S.P[i], u = (L - S.cum[i - 1]) / ((S.cum[i] - S.cum[i - 1]) || 1);
      return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, hd: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    };

    let cur = -1, target = 0, raf = 0;
    const draw = () => {
      raf = 0;
      cur = cur < 0 || reduce ? target : cur + (target - cur) * 0.16;
      if (Math.abs(target - cur) < 0.0004) cur = target;
      sides.forEach((S) => {
        S.tracks.forEach((p) => { p.style.strokeDasharray = `${(cur * 1000).toFixed(1)} 1000`; });
        if (S.car.hidden) return;
        const p = at(S, cur), q = at(S, Math.max(0, cur - 0.035));
        // dérive : la caisse pointe vers l'intérieur du virage, d'autant plus que la courbe se resserre
        let turn = p.hd - q.hd; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        const yaw = Math.max(-0.45, Math.min(0.45, turn * 2.2));
        const ang = (p.hd + yaw) * 180 / Math.PI + 90; // le dessin de la voiture pointe vers le haut
        // l'arrière de la voiture est posé au bout des traces : on décale le centre vers l'avant
        const fwd = S.carW * 0.9;
        const cx = p.x + Math.cos(p.hd) * fwd, cy = p.y + Math.sin(p.hd) * fwd;
        S.car.style.transform = `translate(${(cx - S.carW / 2).toFixed(1)}px, ${(cy - S.carW * 1.335).toFixed(1)}px) rotate(${ang.toFixed(1)}deg)`;
      });
      if (cur !== target) raf = requestAnimationFrame(draw);
    };
    const upd = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 40 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      // la voiture avance avec la lecture de la page ; elle part un peu en dessous du haut pour être visible dès le début
      target = 0.08 + p * 0.86;
      if (!raf) raf = requestAnimationFrame(draw);
    };
    window.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', () => { layout(); cur = -1; upd(); });
    window.addEventListener('hashchange', () => setTimeout(upd, 60));
    layout(); upd();
  }

  /* ---------- Traits obliques du fond : en mouvement permanent, plus vite quand on fait défiler ----------
     Les barres glissent le long de leur propre inclinaison (vers le haut à droite), comme des lignes de vitesse.
     Seul un transform est modifié à chaque image (pas de mise en page) ; à l'arrêt de l'onglet, rien ne tourne. */
  function stripes() {
    // Le calque des traits est un vrai élément : on déplace son transform directement. (Écrire des variables CSS sur
    // <html> à chaque image forçait le recalcul des styles de toute la page, très coûteux sur les pages chargées.)
    let layer = document.querySelector('.bg-stripes');
    if (!layer) { layer = document.createElement('div'); layer.className = 'bg-stripes'; layer.setAttribute('aria-hidden', 'true'); document.body.prepend(layer); }
    if (reduce || low || stripes.on) return; stripes.on = true;
    const bar = () => document.querySelector('.topbar'), SLOPE = 0.62;
    let t = 0, last = performance.now(), lastY = scrollY, v = 0;
    const tile = () => (innerWidth <= 760 ? [1100, 690] : [1600, 1000]);
    const mod = (a, m) => ((a % m) + m) % m;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // vitesse de défilement lissée : elle accélère le glissement puis retombe doucement
      const dy = scrollY - lastY; lastY = scrollY;
      v += (Math.abs(dy) / Math.max(dt, 0.001) - v) * 0.12;
      t += (14 + Math.min(v, 2600) * 0.16) * dt;
      const [tw, th] = tile();
      layer.style.transform = `translate3d(${mod(t * SLOPE, tw).toFixed(1)}px, ${(-mod(t, th)).toFixed(1)}px, 0)`;
      const tb = bar(); if (tb) tb.style.setProperty('background-position-x', (-(t * 1.6) % 1400).toFixed(1) + 'px', 'important'); // le thème fixe le fond en !important
      if (low) { stripes.on = false; return; } // config basse : les bandes s'arrêtent là où elles sont
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stripes); else stripes();

  function setLow(v) { low = !!v; if (!low) stripes(); }
  F1.fx = { setLow, skidMarks, stripes, flagWipe, reveal, navIndicator, reduce };
})(window.F1 = window.F1 || {});
