/* Avatar « numéro de pilote » : un numéro dans la typographie d'une écurie, mis en scène façon carte de pilote
   (fond aux couleurs de l'écurie, plaque argentée inclinée, reflet). Dessiné dans un canvas, exporté en JPEG. */
(function (F1) {
  const TEAMS = ['red_bull', 'ferrari', 'mclaren', 'mercedes', 'aston_martin', 'alpine', 'williams', 'rb', 'haas', 'audi', 'cadillac'];
  // fond (couleur secondaire de l'écurie) et couleur du numéro posé sur la plaque argentée
  const LOOK = {
    red_bull: { bg: '#1b3a8a', num: '#e4122d' }, ferrari: { bg: '#7a0010', num: '#e8002d' }, mclaren: { bg: '#5a2a00', num: '#ff7a00' },
    mercedes: { bg: '#063a36', num: '#00a19c' }, aston_martin: { bg: '#04382c', num: '#00665e' }, alpine: { bg: '#0a2a66', num: '#0078c1' },
    williams: { bg: '#062b6b', num: '#005aff' }, rb: { bg: '#14248a', num: '#1634cb' }, haas: { bg: '#2e3136', num: '#d6001c' },
    audi: { bg: '#2a2d33', num: '#d0021b' }, cadillac: { bg: '#3a2f10', num: '#161616' },
  };
  const STYLES = [['plaque', 'Plaque'], ['neon', 'Néon'], ['couleur', 'Couleur']];
  const S = 512;

  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  // police de remplacement de l'écurie (pour un numéro sans dessin, ex. avec un 9)
  function fontOf(team) {
    const f = (F1.num.FONTS[F1.num.tkey(team)] || 'Orbitron:wght@900');
    const fam = f.split(':')[0].replace(/\+/g, ' ');
    const w = (f.match(/(\d{3})$/) || [, '800'])[1];
    return { css: `${/ital/.test(f) ? 'italic ' : ''}${w} 200px "${fam}", "Arial Black", Arial, sans-serif`, load: `${/ital/.test(f) ? 'italic ' : ''}${w} 200px "${fam}"`, fam };
  }

  // couleurs proposées (la couleur libre reste possible via le sélecteur)
  const BG_PRESETS = [['auto', 'Écurie'], ['#0b1b4d', 'Bleu nuit'], ['#05070c', 'Noir'], ['#2a2d33', 'Carbone'], ['#6e0b14', 'Rouge'], ['#0d3b2e', 'Vert'], ['#3b1d6e', 'Violet'], ['#5a2a00', 'Cuivre']];
  const PLATE_PRESETS = [['#c9ced6', 'Argent'], ['#d4af37', 'Or'], ['#f2f3f5', 'Blanc'], ['#26292f', 'Carbone'], ['team', 'Écurie']];
  const lum = (h) => { const [r, g, b] = hex(h).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

  function background(x, bg, style, glow) {
    const g = x.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, mix(bg, '#ffffff', style === 'couleur' ? 0.14 : 0.06));
    g.addColorStop(0.55, bg);
    g.addColorStop(1, mix(bg, '#000000', 0.6));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // rayons lumineux en diagonale
    x.save(); x.translate(S / 2, S / 2); x.rotate(-0.95);
    [[-150, 70, 0.07], [-40, 26, 0.05], [90, 110, 0.06], [200, 40, 0.04]].forEach(([o, w, a]) => {
      const r = x.createLinearGradient(o - w, 0, o + w, 0);
      r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, `rgba(255,255,255,${a})`); r.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = r; x.fillRect(o - w, -S, w * 2, S * 2);
    });
    x.restore();
    if (style === 'neon') { const r = x.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * 0.55); r.addColorStop(0, glow + '40'); r.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = r; x.fillRect(0, 0, S, S); }
    // vignettage
    const v = x.createRadialGradient(S / 2, S * 0.45, S * 0.25, S / 2, S / 2, S * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)'); x.fillStyle = v; x.fillRect(0, 0, S, S);
  }

  const K = 0.46; // inclinaison de la plaque (décalage horizontal par unité de hauteur)
  // parallélogramme centré en (cx, cy) : largeur w mesurée à l'horizontale, hauteur h
  const plate = (cx, cy, w, h) => [[cx - w / 2 + (K * h) / 2, cy - h / 2], [cx + w / 2 + (K * h) / 2, cy - h / 2], [cx + w / 2 - (K * h) / 2, cy + h / 2], [cx - w / 2 - (K * h) / 2, cy + h / 2]];
  const poly = (x, pts) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); };

  function drawPlate(x, pts, style, pc, u) {
    if (style === 'neon') {
      x.save(); poly(x, pts); x.lineWidth = 5 * u; x.strokeStyle = pc; x.shadowColor = pc; x.shadowBlur = 26 * u; x.stroke(); x.shadowBlur = 0;
      x.globalAlpha = 0.1; x.fillStyle = pc; x.fill(); x.restore(); return;
    }
    if (style === 'couleur') { x.save(); poly(x, pts); x.globalAlpha = 0.16; x.fillStyle = pc; x.fill(); x.globalAlpha = 0.55; x.lineWidth = 3 * u; x.strokeStyle = mix(pc, '#ffffff', 0.4); x.stroke(); x.restore(); return; }
    // plaque métal : ombre portée, dégradé dérivé de la couleur choisie, liseré clair, reflet
    const dark = lum(pc) < 0.3;
    x.save(); poly(x, pts); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 40 * u; x.shadowOffsetY = 18 * u; x.fillStyle = pc; x.fill(); x.restore();
    x.save(); poly(x, pts);
    const g = x.createLinearGradient(pts[3][0], pts[3][1], pts[1][0], pts[1][1]);
    g.addColorStop(0, mix(pc, '#000000', 0.3)); g.addColorStop(0.3, mix(pc, '#ffffff', dark ? 0.12 : 0.6)); g.addColorStop(0.5, mix(pc, '#ffffff', dark ? 0.22 : 0.9));
    g.addColorStop(0.72, mix(pc, '#ffffff', dark ? 0.06 : 0.3)); g.addColorStop(1, mix(pc, '#ffffff', dark ? 0.15 : 0.7));
    x.fillStyle = g; x.fill();
    x.lineWidth = 6 * u; x.strokeStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.85)'; x.stroke();
    x.clip(); const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2, w = pts[1][0] - pts[3][0];
    const sh = x.createRadialGradient(cx - w * 0.15, cy - w * 0.12, 4, cx - w * 0.15, cy - w * 0.12, w * 0.5); sh.addColorStop(0, `rgba(255,255,255,${dark ? 0.25 : 0.8})`); sh.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sh; x.fillRect(0, 0, S, S);
    x.restore();
    // éclat dans le coin haut droit
    const [sx, sy] = pts[1], r = 24 * u;
    x.save(); x.translate(sx - 5 * u, sy + 2 * u);
    const gl = x.createRadialGradient(0, 0, 0, 0, 0, r); gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gl; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
    const q = r * 0.85, t = r * 0.09;
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -q); x.lineTo(t, -t); x.lineTo(q, 0); x.lineTo(t, t); x.lineTo(0, q); x.lineTo(-t, t); x.lineTo(-q, 0); x.lineTo(-t, -t); x.closePath(); x.fill();
    x.restore();
  }

  /* Le numéro est d'abord dessiné seul, en grand, dans un canvas annexe : on mesure ainsi son encre réelle
     (les dessins ont des marges différentes selon l'écurie). Pour chaque ligne on calcule u = x + K·y,
     ce qui « redresse » l'inclinaison : la plaque la plus serrée autour du chiffre est un rectangle dans ce repère. */
  const GH = 420;
  function glyphLayer(n, team, fill, style) {
    const c = document.createElement('canvas'), x = c.getContext('2d'), g = F1.num.glyph(n, team);
    let w;
    if (g) {
      const [vx, vy, vw, vh] = g.vb.split(' ').map(Number), sc = GH / vh; w = Math.ceil(vw * sc) + 40;
      c.width = w; c.height = GH + 40;
      x.translate(20 - vx * sc, 20 - vy * sc); x.scale(sc, sc);
      x.fillStyle = fill(x, vy, vy + vh);
      g.p.forEach(([d, eo, dx]) => { x.save(); if (dx) x.translate(dx, 0); x.fill(new Path2D(d), eo ? 'evenodd' : 'nonzero'); x.restore(); });
    } else {
      const f = fontOf(team); x.font = f.css; const m = x.measureText(n);
      const sc = GH / ((m.actualBoundingBoxAscent || 150) + (m.actualBoundingBoxDescent || 0)); w = Math.ceil(m.width * sc * 1.3) + 60;
      c.width = w; c.height = GH + 40; x.font = f.css; x.textAlign = 'center';
      x.translate(w / 2, 20 + (m.actualBoundingBoxAscent || 150) * sc); x.scale(sc, sc);
      if (F1.num.tkey(team) === 'rb') x.transform(1, 0, -0.25, 1, 0, 0);
      x.fillStyle = fill(x, -(m.actualBoundingBoxAscent || 150), m.actualBoundingBoxDescent || 0); x.fillText(n, 0, 0);
    }
    // encre : bornes verticales et bornes du repère redressé
    const d = x.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    let y0 = H, y1 = -1; const rows = [];
    for (let y = 0; y < H; y++) { let a = -1, b = -1; for (let i = 0; i < W; i++) if (d[(y * W + i) * 4 + 3] > 40) { if (a < 0) a = i; b = i; } if (a >= 0) { rows.push([y, a, b]); y0 = Math.min(y0, y); y1 = y; } }
    if (y1 < 0) return null;
    const cy = (y0 + y1) / 2; let u0 = Infinity, u1 = -Infinity;
    rows.forEach(([y, a, b]) => { u0 = Math.min(u0, a + K * (y - cy)); u1 = Math.max(u1, b + 1 + K * (y - cy)); });
    return { c, cy, cu: (u0 + u1) / 2, iw: u1 - u0, ih: y1 - y0 + 1 };
  }

  // rendu complet : attend la police de l'écurie si le numéro n'a pas de dessin
  async function render(canvas, { n, team, style = 'plaque', bg = 'auto', plate: plateCol = '#c9ced6' }) {
    n = F1.num.clean(n) || '0'; team = F1.num.tkey(team) || 'red_bull';
    if (!F1.num.glyph(n, team) && document.fonts) {
      F1.num.loadFonts();
      // la feuille Google Fonts doit être chargée avant de demander la police, sinon fonts.load ne trouve rien
      const link = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
      if (link && !link.sheet) await new Promise((ok) => { link.addEventListener('load', ok, { once: true }); link.addEventListener('error', ok, { once: true }); setTimeout(ok, 3000); });
      try { await Promise.race([document.fonts.load(fontOf(team).load, n), new Promise((ok) => setTimeout(ok, 3000))]); } catch (e) { /* police de secours */ }
    }
    canvas.width = canvas.height = S;
    const x = canvas.getContext('2d'), look = LOOK[team] || LOOK.red_bull, col = F1.teamColor(team);
    const bgc = /^#[0-9a-f]{6}$/i.test(bg) ? bg : look.bg;
    const pc = plateCol === 'team' ? col : /^#[0-9a-f]{6}$/i.test(plateCol) ? plateCol : '#c9ced6';
    // couleur du chiffre : celle de l'écurie, éclaircie ou assombrie si elle se confond avec la plaque
    let numCol = style === 'neon' ? mix(col, '#ffffff', 0.1) : style === 'couleur' ? '#ffffff' : look.num;
    if (style === 'plaque' && Math.abs(lum(numCol) - lum(pc)) < 0.12) numCol = lum(pc) < 0.45 ? '#ffffff' : '#111318';
    background(x, bgc, style, style === 'neon' ? (plateCol === '#c9ced6' ? col : pc) : col);
    // reflet au sol
    const fl = x.createRadialGradient(S / 2, S * 0.86, 4, S / 2, S * 0.86, S * 0.4); fl.addColorStop(0, 'rgba(255,255,255,.1)'); fl.addColorStop(1, 'rgba(255,255,255,0)');
    x.save(); x.scale(1, 0.25); x.fillStyle = fl; x.fillRect(0, S * 2.6, S, S * 1.4); x.restore();

    const fill = (cx2, a, b) => { if (style === 'couleur') return '#ffffff'; const g = cx2.createLinearGradient(0, a, 0, b); g.addColorStop(0, mix(numCol, '#ffffff', 0.12)); g.addColorStop(0.55, numCol); g.addColorStop(1, mix(numCol, '#000000', 0.25)); return g; };
    const L = glyphLayer(n, team, fill, style);
    if (!L) return canvas;
    // plaque autour de l'encre (repère du canvas annexe), marges égales, puis mise à l'échelle pour tenir dans le cercle
    const ph0 = L.ih / 0.7, pw0 = L.iw + ph0 * 0.3;
    const corners = plate(0, 0, pw0, ph0), far = Math.max(...corners.map(([a, b]) => Math.hypot(a, b)));
    const R = S * 0.4, sc = Math.min(R / far, (S * 0.5) / ph0);
    const cx = S / 2, cy = S / 2, u = (ph0 * sc) / 290, pts = plate(cx, cy, pw0 * sc, ph0 * sc);
    const ptsDraw = style === 'neon' ? pts : pts;
    drawPlate(x, ptsDraw, style, style === 'neon' && plateCol === '#c9ced6' ? col : pc, u);
    x.save();
    if (style === 'neon') { x.shadowColor = numCol; x.shadowBlur = 30 * u; }
    else if (style === 'couleur') { x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 24 * u; x.shadowOffsetY = 10 * u; }
    else { x.shadowColor = 'rgba(0,0,0,.2)'; x.shadowBlur = 6 * u; x.shadowOffsetY = 3 * u; }
    // le point (cu, cy) du repère redressé correspond au centre de la plaque : à la hauteur cy, u = x
    x.translate(cx, cy); x.scale(sc, sc); x.drawImage(L.c, -L.cu, -L.cy);
    if (style === 'neon') { x.shadowBlur = 8 * u; x.globalAlpha = 0.6; x.drawImage(L.c, -L.cu, -L.cy); }
    x.restore();
    return canvas;
  }

  // exports JPEG : 256 px pour l'affichage, 128 px pour le profil en ligne
  function exportJpeg(src, size, q) { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, size, size); return c.toDataURL('image/jpeg', q); }

  F1.numAvatar = { TEAMS, STYLES, LOOK, BG_PRESETS, PLATE_PRESETS, render, exportJpeg };
})(globalThis.F1 = globalThis.F1 || {});
