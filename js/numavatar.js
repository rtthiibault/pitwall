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

  function background(x, look, style, col) {
    const base = style === 'couleur' ? look.bg : '#04070f';
    const g = x.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, style === 'couleur' ? mix(look.bg, '#ffffff', 0.12) : mix(base, look.bg, 0.35));
    g.addColorStop(0.55, style === 'couleur' ? look.bg : mix(base, look.bg, 0.75));
    g.addColorStop(1, mix(look.bg, '#000000', 0.55));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // rayons lumineux en diagonale
    x.save(); x.translate(S / 2, S / 2); x.rotate(-0.95);
    [[-150, 70, 0.07], [-40, 26, 0.05], [90, 110, 0.06], [200, 40, 0.04]].forEach(([o, w, a]) => {
      const r = x.createLinearGradient(o - w, 0, o + w, 0);
      r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, `rgba(255,255,255,${a})`); r.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = r; x.fillRect(o - w, -S, w * 2, S * 2);
    });
    x.restore();
    if (style === 'neon') { const r = x.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * 0.55); r.addColorStop(0, col + '40'); r.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = r; x.fillRect(0, 0, S, S); }
    // vignettage
    const v = x.createRadialGradient(S / 2, S * 0.45, S * 0.25, S / 2, S / 2, S * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = v; x.fillRect(0, 0, S, S);
  }

  // plaque inclinée (parallélogramme) : coins pour une hauteur h, une largeur w et une inclinaison k
  const plate = (cx, cy, w, h, k) => [[cx - w / 2 + (k * h) / 2, cy - h / 2], [cx + w / 2 + (k * h) / 2, cy - h / 2], [cx + w / 2 - (k * h) / 2, cy + h / 2], [cx - w / 2 - (k * h) / 2, cy + h / 2]];
  const poly = (x, pts) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); };

  function drawPlate(x, pts, look, style, col) {
    if (style === 'neon') {
      x.save(); poly(x, pts); x.lineWidth = 5; x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = 26; x.stroke(); x.shadowBlur = 0;
      x.globalAlpha = 0.08; x.fillStyle = col; x.fill(); x.restore(); return;
    }
    if (style === 'couleur') { x.save(); poly(x, pts); x.fillStyle = 'rgba(255,255,255,.07)'; x.fill(); x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.35)'; x.stroke(); x.restore(); return; }
    // plaque argentée : ombre portée, dégradé métal, liseré clair, reflet
    x.save(); poly(x, pts); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 40; x.shadowOffsetY = 18; x.fillStyle = '#c9ced6'; x.fill(); x.restore();
    x.save(); poly(x, pts);
    const g = x.createLinearGradient(pts[3][0], pts[3][1], pts[1][0], pts[1][1]);
    g.addColorStop(0, '#8e959f'); g.addColorStop(0.3, '#e9ecf0'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.72, '#cfd4db'); g.addColorStop(1, '#f5f7f9');
    x.fillStyle = g; x.fill();
    x.lineWidth = 7; x.strokeStyle = 'rgba(255,255,255,.85)'; x.stroke();
    x.clip(); const sh = x.createRadialGradient(S * 0.42, S * 0.4, 10, S * 0.42, S * 0.4, S * 0.32); sh.addColorStop(0, 'rgba(255,255,255,.9)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sh; x.fillRect(0, 0, S, S);
    x.restore();
    // éclat dans le coin haut droit
    const [sx, sy] = pts[1];
    x.save(); x.translate(sx - 6, sy + 2);
    const gl = x.createRadialGradient(0, 0, 0, 0, 0, 26); gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gl; x.beginPath(); x.arc(0, 0, 26, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -22); x.lineTo(2.2, -2.2); x.lineTo(22, 0); x.lineTo(2.2, 2.2); x.lineTo(0, 22); x.lineTo(-2.2, 2.2); x.lineTo(-22, 0); x.lineTo(-2.2, -2.2); x.closePath(); x.fill();
    x.restore();
  }

  function numberFill(x, y0, y1, c, style) {
    if (style === 'couleur') return '#ffffff';
    const g = x.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, mix(c, '#ffffff', 0.12)); g.addColorStop(0.55, c); g.addColorStop(1, mix(c, '#000000', 0.25));
    return g;
  }

  function drawNumber(x, n, team, box, numCol, style) {
    const g = F1.num.glyph(n, team);
    x.save();
    if (style === 'neon') { x.shadowColor = numCol; x.shadowBlur = 30; }
    else if (style === 'couleur') { x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 24; x.shadowOffsetY = 10; }
    else { x.shadowColor = 'rgba(0,0,0,.18)'; x.shadowBlur = 6; x.shadowOffsetY = 3; }
    if (g) {
      const [vx, vy, vw, vh] = g.vb.split(' ').map(Number), sc = Math.min(box.w / vw, box.h / vh);
      x.translate(box.cx - (vw * sc) / 2 - vx * sc, box.cy - (vh * sc) / 2 - vy * sc); x.scale(sc, sc);
      x.fillStyle = numberFill(x, vy, vy + vh, numCol, style);
      g.p.forEach(([d, eo, dx]) => { x.save(); if (dx) x.translate(dx, 0); x.fill(new Path2D(d), eo ? 'evenodd' : 'nonzero'); x.restore(); });
      if (style === 'neon') { x.shadowBlur = 8; x.fillStyle = mix(numCol, '#ffffff', 0.55); g.p.forEach(([d, eo, dx]) => { x.save(); if (dx) x.translate(dx, 0); x.fill(new Path2D(d), eo ? 'evenodd' : 'nonzero'); x.restore(); }); }
    } else {
      const f = fontOf(team); x.font = f.css; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      const m = x.measureText(n), w = m.width, h = (m.actualBoundingBoxAscent || 150) + (m.actualBoundingBoxDescent || 0), sc = Math.min(box.w / w, box.h / h);
      x.translate(box.cx, box.cy + (h * sc) / 2 - (m.actualBoundingBoxDescent || 0) * sc); x.scale(sc, sc);
      if (F1.num.tkey(team) === 'rb') x.transform(1, 0, -0.25, 1, 0, 0);
      x.fillStyle = numberFill(x, -h, 0, numCol, style); x.fillText(n, 0, 0);
    }
    x.restore();
  }

  // rendu complet : attend la police de l'écurie si le numéro n'a pas de dessin
  async function render(canvas, { n, team, style = 'plaque' }) {
    n = F1.num.clean(n) || '0'; team = F1.num.tkey(team) || 'red_bull';
    if (!F1.num.glyph(n, team) && document.fonts) {
      F1.num.loadFonts();
      // la feuille Google Fonts doit être chargée avant de demander la police, sinon fonts.load ne trouve rien
      const link = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
      if (link && !link.sheet) await new Promise((ok) => { link.addEventListener('load', ok, { once: true }); link.addEventListener('error', ok, { once: true }); setTimeout(ok, 3000); });
      try { await Promise.race([document.fonts.load(fontOf(team).load, n), new Promise((ok) => setTimeout(ok, 3000))]); } catch (e) { /* police de secours */ }
    }
    canvas.width = canvas.height = S;
    const x = canvas.getContext('2d'), look = LOOK[team] || LOOK.red_bull, col = F1.teamColor(team === 'rb' ? 'rb' : team);
    const numCol = style === 'neon' ? mix(col, '#ffffff', 0.1) : look.num;
    background(x, look, style, col);
    // reflet au sol sous la plaque
    const fl = x.createRadialGradient(S / 2, S * 0.86, 4, S / 2, S * 0.86, S * 0.4); fl.addColorStop(0, 'rgba(255,255,255,.12)'); fl.addColorStop(1, 'rgba(255,255,255,0)');
    x.save(); x.scale(1, 0.25); x.fillStyle = fl; x.fillRect(0, S * 2.6, S, S * 1.4); x.restore();
    // plaque plus large pour deux chiffres ; le numéro occupe presque toute la plaque, comme sur une carte de pilote
    const two = n.length > 1, pw = two ? 262 : 226, ph = two ? 250 : 290, cx = S / 2, cy = S * 0.49, pts = plate(cx, cy, pw, ph, 0.46);
    drawPlate(x, pts, look, style, col);
    drawNumber(x, n, team, { cx: cx + 4, cy, w: two ? pw * 1.12 : pw * 1.22, h: ph * 0.8 }, numCol, style);
    return canvas;
  }

  // exports JPEG : 256 px pour l'affichage, 128 px pour le profil en ligne
  function exportJpeg(src, size, q) { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, size, size); return c.toDataURL('image/jpeg', q); }

  F1.numAvatar = { TEAMS, STYLES, LOOK, render, exportJpeg };
})(globalThis.F1 = globalThis.F1 || {});
