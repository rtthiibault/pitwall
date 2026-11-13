/* Visuels : monoplaces vectorielles aux couleurs des écuries + portraits des pilotes (Wikimedia Commons). */
(function (F1) {
  // Livrées : carrosserie, accent, détail (aileron/fond), couleur du casque
  const LIVERY = {
    mclaren: { body: '#FF8000', accent: '#1B1B1F', detail: '#47C7FC', helmet: '#FFD600' },
    ferrari: { body: '#E8002D', accent: '#FFFFFF', detail: '#111111', helmet: '#FFEB00' },
    red_bull: { body: '#1E2A5A', accent: '#E10600', detail: '#FFCC00', helmet: '#3671C6' },
    mercedes: { body: '#16181C', accent: '#27F4D2', detail: '#C8CCD0', helmet: '#FFFFFF' },
    aston_martin: { body: '#00594F', accent: '#CEDC00', detail: '#0B2A26', helmet: '#CEDC00' },
    alpine: { body: '#FF7FB8', accent: '#1D5FD6', detail: '#0C1A3D', helmet: '#FFFFFF' },
    williams: { body: '#00A0DE', accent: '#041E42', detail: '#FFFFFF', helmet: '#041E42' },
    rb: { body: '#F2F3F7', accent: '#1634CB', detail: '#E10600', helmet: '#1634CB' },
    racing_bulls: { body: '#F2F3F7', accent: '#1634CB', detail: '#E10600', helmet: '#1634CB' },
    haas: { body: '#EEEEEE', accent: '#E6002B', detail: '#1A1A1A', helmet: '#E6002B' },
    audi: { body: '#D5D7DB', accent: '#E3261C', detail: '#1D1E21', helmet: '#141414' },
    sauber: { body: '#52E252', accent: '#111111', detail: '#111111', helmet: '#FFFFFF' },
    cadillac: { body: '#121212', accent: '#F4F4F4', detail: '#C9A227', helmet: '#C9A227' },
  };
  const livery = (id) => LIVERY[id] || { body: F1.teamColor(id), accent: '#111', detail: '#333', helmet: '#fff' };
  let uid = 0;
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  // Roue 18" (pneu taille basse + flasque de jante + bande de couleur du composé Pirelli)
  function wheel(cx, cy, spin, id, compound) {
    const r = 34;
    return `<g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#0d0d10"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 1.5}" fill="none" stroke="#1d1e23" stroke-width="2"/>
      <path d="M${cx - r + 3} ${cy - 6} A ${r - 3} ${r - 3} 0 0 1 ${cx + 6} ${cy - r + 3}" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="27.5" fill="none" stroke="${compound}" stroke-width="2.2" stroke-dasharray="30 13"/>
      <circle cx="${cx}" cy="${cy}" r="25" fill="#26272d"/>
      <g class="${spin ? 'wh-spin' : ''}" style="transform-origin:${cx}px ${cy}px">
        <circle cx="${cx}" cy="${cy}" r="23" fill="url(#${id}w)"/>
        <path d="M${cx} ${cy - 22} L${cx} ${cy + 22} M${cx - 22} ${cy} L${cx + 22} ${cy}" stroke="#000" stroke-opacity=".18" stroke-width="1.5"/>
        <circle cx="${cx + 9}" cy="${cy - 9}" r="2.2" fill="#000" opacity=".35"/>
      </g>
      <circle cx="${cx}" cy="${cy}" r="5" fill="#cfd2d8"/><circle cx="${cx}" cy="${cy}" r="2.2" fill="#55575e"/>
    </g>`;
  }

  /* Monoplace 2026 vue de profil (nez à droite). opts : number, spin (roues animées), shadow, cam, compound */
  function svgCar(teamId, opts = {}) {
    const L = livery(teamId);
    const id = 'c' + (++uid);
    const num = opts.number != null ? String(opts.number) : '';
    const carbon = '#141419';
    const dark = '#0b0b0e';
    const halo = '#2b2c32';
    const cam = opts.cam || '#111';
    const numColor = lum(L.body) > 0.55 ? '#111' : '#fff';
    const BODY = 'M100 112 L108 96 C150 88 210 66 250 50 L256 45 L286 45 L291 50 L291 64 C296 69 300 74 304 76 L340 76 C370 76 400 78 420 84 C460 94 510 108 540 116 C549 119 549 125 540 127 C500 127 450 123 410 119 L330 121 L300 124 L170 124 C140 124 115 120 100 112 Z';
    const POD = 'M204 106 C232 97 282 88 332 86 C346 85.5 357 86 363 88 L365 100 C352 104 341 108 331 114 C300 121 252 122 205 118 Z';
    return `<svg class="car" viewBox="0 0 600 165" role="img" aria-label="Monoplace ${F1.teamShort(teamId)} 2026">
      <defs>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".35" stop-color="#fff" stop-opacity=".06"/><stop offset=".7" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
        <linearGradient id="${id}u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".85"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
        <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset=".5" stop-color="#000" stop-opacity="0"/></linearGradient>
        <radialGradient id="${id}w" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#3a3c44"/><stop offset=".7" stop-color="#1f2026"/><stop offset="1" stop-color="#0b0b0e"/></radialGradient>
        <radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      </defs>
      ${opts.shadow === false ? '' : `<ellipse cx="305" cy="152" rx="285" ry="9" fill="url(#${id}s)"/>`}

      <!-- suspensions (derrière les roues) -->
      <g stroke="#1b1c21" stroke-width="2.4" stroke-linecap="round">
        <path d="M410 96 L455 111"/><path d="M406 113 L455 121"/><path d="M424 118 L448 103" stroke-width="1.8"/>
        <path d="M186 103 L130 110"/><path d="M184 119 L130 122"/>
      </g>

      <!-- aileron arrière actif : dérive pleine + profils des 2 plans (sans beam wing) -->
      <path d="M86 60 L93 60 L104 100 L96 100 Z" fill="${carbon}"/>
      <path d="M46 108 L43 40 C43 34 47 31 53 31 L78 31 C82 31 84 34 84 38 L87 101 C72 104 59 106 46 108 Z" fill="${L.detail}"/>
      <path d="M46 108 L43 40 C43 34 47 31 53 31 L78 31 C82 31 84 34 84 38 L87 101 C72 104 59 106 46 108 Z" fill="url(#${id}b)" opacity=".7"/>
      <path d="M43 40 C43 34 47 31 53 31 L58 31 L60 106 L46 108 Z" fill="#000" opacity=".22"/>
      <path d="M47 60 C57 53 74 52 86 55 L86 61 C73 60 60 61 48 65 Z" fill="${carbon}" stroke="#000" stroke-opacity=".4" stroke-width=".8"/>
      <path d="M51 45 C60 38 73 37 84 39 L84 46 C73 45 62 46 52 49 Z" fill="${L.body}" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>
      <path d="M51 45 C60 38 73 37 84 39 L84 41 C73 40 61 41 52 46 Z" fill="#fff" opacity=".28"/>
      <!-- structure arrière + feu de pluie -->
      <path d="M104 104 L70 110 L70 121 L106 121 Z" fill="${carbon}"/>
      <rect x="74" y="113" width="10" height="5" rx="1" fill="#ff2a1f"/>
      <!-- fond plat + diffuseur -->
      <path d="M68 147 L152 147 L152 137 C122 134 96 130 74 125 Z" fill="${dark}"/>
      <path d="M152 124 L424 119 L430 140 L150 140 Z" fill="${carbon}"/>
      <path d="M140 140 L436 140 L444 147 L132 147 Z" fill="${dark}"/>
      <path d="M150 140 L430 140" stroke="#fff" stroke-opacity=".08"/>

      <!-- carrosserie : capot moteur, monocoque, nez -->
      <path d="${BODY}" fill="${L.body}"/>
      <path d="M250 50 C210 57 172 70 140 85 L148 88 C178 75 214 62 252 55 Z" fill="#fff" opacity=".12"/>
      <path d="M118 101 C168 90 226 72 268 60 L272 67 C230 78 172 96 124 108 Z" fill="${L.accent}"/>
      <path d="M422 86 C462 96 506 108 538 117 L537 121 C504 113 460 101 420 91 Z" fill="${L.accent}"/>
      <!-- ponton sculpté + undercut -->
      <path d="${POD}" fill="${L.body}"/>
      <path d="M214 109 C262 100 312 94 360 94 L361 98 C312 98 262 104 216 113 Z" fill="${L.accent}"/>
      <path d="M357 87 L364 88 L366 100 L358 101 Z" fill="${dark}"/>
      <path d="M331 114 C300 121 252 122 205 118 L208 124 L332 123 Z" fill="url(#${id}u)"/>
      <path d="M365 100 C352 104 341 108 331 114 L332 123 L366 120 Z" fill="url(#${id}u)"/>
      <!-- volumes / reflets -->
      <path d="${BODY}" fill="url(#${id}b)"/>
      <path d="${POD}" fill="url(#${id}b)" opacity=".8"/>
      <path d="M100 112 L108 96 C120 94 132 91 146 87 L150 120 C130 120 112 118 100 112 Z" fill="url(#${id}f)" opacity=".5"/>
      <!-- prise d'air + caméra TV -->
      <path d="M284 47 L290 50 L290 63 L284 61 Z" fill="${dark}"/>
      <rect x="262" y="39" width="17" height="6" rx="2" fill="${cam}"/>
      ${num ? `<text x="250" y="105" text-anchor="middle" font-family="Titillium Web, sans-serif" font-weight="900" font-style="italic" font-size="17" fill="${numColor}" opacity=".95">${num}</text>` : ''}

      <!-- pilote, halo, rétroviseur -->
      <circle cx="313" cy="67" r="11" fill="${L.helmet}"/>
      <path d="M313 56 A11 11 0 0 1 324 67 L313 67 Z" fill="#fff" opacity=".25"/>
      <rect x="307" y="62.5" width="15" height="5" rx="2.5" fill="#0b0b0e"/>
      <path d="M291 77 C295 60 312 55 330 59 C338 61 343 68 345 77" fill="none" stroke="${halo}" stroke-width="4.6" stroke-linecap="round"/>
      <path d="M296 66 C302 59 314 57 326 59" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.2"/>
      <path d="M340 76 L347 70" stroke="${carbon}" stroke-width="2"/><rect x="345" y="65" width="11" height="6" rx="2" fill="${L.body}" stroke="${carbon}" stroke-width="1"/>

      <!-- aileron avant actif (2 éléments) -->
      <path d="M519 124 L526 124 L530 141 L523 141 Z" fill="${carbon}"/>
      <path d="M486 141 C520 138.5 552 139.5 576 142.5 L576 148 L486 148 Z" fill="${L.detail}"/>
      <path d="M497 134 C525 129.5 553 130.5 574 134 L574 139 C552 136.5 525 136.5 499 140 Z" fill="${L.accent}"/>
      <path d="M562 118 C571 118 579 123 579 129 L579 148 L562 148 Z" fill="${L.body}"/>
      <path d="M562 118 C571 118 579 123 579 129 L579 148 L562 148 Z" fill="url(#${id}b)"/>

      ${wheel(130, 116, opts.spin, id, opts.compound || '#E10600')}
      ${wheel(455, 116, opts.spin, id, opts.compound || '#E10600')}
    </svg>`;
  }

  /* ---------- Portraits ---------- */
  const PKEY = 'pitwall:portraits:v1';
  let portraits = {};
  try { const c = JSON.parse(localStorage.getItem(PKEY)); if (c && Date.now() - c.t < 7 * 864e5) portraits = c.d || {}; } catch (e) { /* */ }
  const savePortraits = () => { try { localStorage.setItem(PKEY, JSON.stringify({ t: Date.now(), d: portraits })); } catch (e) { /* */ } };

  async function getJSON(url, ms = 8000) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
  }

  // 1) fichier hebdo généré par la GitHub Action (avec auteurs/licences) ; 2) Wikipédia en direct pour les manquants
  async function loadPortraits(drivers) {
    try {
      const j = await getJSON('data/portraits.json?v=' + Math.floor(Date.now() / 36e5), 5000);
      if (j && j.drivers) Object.assign(portraits, j.drivers);
    } catch (e) { /* pas de fichier */ }
    const missing = drivers.filter((d) => d.wiki && !portraits[d.id]).slice(0, 30);
    await Promise.all(missing.map(async (d) => {
      try {
        const title = decodeURIComponent(d.wiki.split('/wiki/')[1] || '');
        if (!title) return;
        const s = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        const src = s.thumbnail && s.thumbnail.source;
        // uniquement des images libres hébergées sur Wikimedia Commons
        if (src && src.includes('/wikipedia/commons/')) portraits[d.id] = { img: src.replace(/\/\d+px-/, '/400px-'), page: s.content_urls && s.content_urls.desktop.page, file: (s.originalimage || s.thumbnail).source, artist: null, license: null };
      } catch (e) { /* */ }
    }));
    savePortraits();
    return portraits;
  }
  const portrait = (id) => portraits[id] || null;
  const allPortraits = () => portraits;

  /* Monoplace : emplacement remplacé par le rendu 3D (Three.js) dès qu'il est prêt, dessin vectoriel sinon.
     opts.view : '34' (trois-quarts) | 'side' (profil) ; opts.live : visionneuse 3D interactive */
  function car(teamId, opts = {}) {
    const view = opts.view || (opts.live ? '34' : 'side');
    return `<div class="car3d ${opts.live ? 'live' : ''} v-${view}" data-team="${teamId}" data-view="${view}"><div class="car3d-fb">${svgCar(teamId, opts)}</div></div>`;
  }
  let hydrating = false;
  function hydrate(root = document) {
    if (!F1.car3d || !F1.car3d.supported || !F1.car3d.ready) return;
    const slots = [...root.querySelectorAll('.car3d:not(.ok)')];
    slots.filter((el) => el.classList.contains('live')).forEach((el) => {
      el.classList.add('ok');
      try { el.__car3d = F1.car3d.mount(el, el.dataset.team, { view: el.dataset.view, autoRotate: !el.dataset.focus, speed: 1.1, focus: el.dataset.focus ? JSON.parse(el.dataset.focus) : null }); } catch (e) { el.classList.remove('ok'); }
    });
    const imgs = slots.filter((el) => !el.classList.contains('live'));
    if (!imgs.length || hydrating) return;
    hydrating = true;
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < imgs.length && performance.now() - t0 < 40) {
        const el = imgs[i++];
        if (!el.isConnected || el.classList.contains('ok')) continue;
        try {
          const side = el.dataset.view === 'side';
          const url = F1.car3d.snapshot(el.dataset.team, { view: el.dataset.view, w: side ? 900 : 960, h: side ? 300 : 440 });
          el.innerHTML = `<img src="${url}" alt="Monoplace ${F1.teamShort(el.dataset.team)}" draggable="false">`;
          el.classList.add('ok');
        } catch (e) { /* on garde le dessin vectoriel */ }
      }
      if (i < imgs.length) setTimeout(step, 16); else { hydrating = false; const more = root.querySelector('.car3d:not(.ok):not(.live)'); if (more) hydrate(root); }
    };
    step();
  }
  window.addEventListener('car3d-ready', () => hydrate(document));

  /* ---------- Livrées 3D 2026 (d'après l'affiche officielle des monoplaces, sans logos de sponsors) ----------
     paint(u, v, s, part, ny) -> couleur hexadécimale ou null (= carbone)
       u : position longitudinale 0 (arrière) -> 1 (pointe du nez)
       v : hauteur 0 (sol) -> 1 (haut de la prise d'air)
       s : écart latéral 0 (axe) -> 1 (bord extérieur)
       part : 'body' | 'accent' | 'lower' | 'carbon'
     Repères : essieu arrière u≈0,18 · pontons u≈0,30–0,70 · prise d'air u≈0,42–0,50 · cockpit u≈0,52–0,62 · essieu avant u≈0,82 */
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (c1, c2, t) => { const a = hx(c1), b = hx(c2); return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join(''); };
  // filet horizontal : seulement sur les flancs (surfaces quasi verticales, |normale y| faible)
  const band = (v, a, b, n) => v > a && v < b && (n == null || Math.abs(n) < 0.3);
  const isRW = (u, v) => u < 0.11 && v > 0.42;           // aileron arrière
  const isFW = (u, v) => u > 0.88 && v < 0.24;           // aileron avant
  const LIVERY3D = {
    alpine: { // A526 : dégradé rose -> bleu, dessous bleu nuit
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) ? (v > 0.8 ? '#ff6fae' : '#1a3f9a') : isFW(u, v) && s > 0.75 ? '#1a3f9a' : null;
        if (p === 'lower' || v < 0.2) return '#0c1a3d';
        const t = sm(0.34, 0.72, u);
        let c = mix('#ff7fb8', '#1d5fd6', t);
        if (v > 0.72 && u < 0.55) c = mix(c, '#ff5fa6', 0.4);
        return c;
      },
    },
    aston_martin: { // AMR26 : vert anglais, filets citron vert
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) && v > 0.85 ? '#cedc00' : isFW(u, v) && s > 0.8 ? '#0a4f43' : null;
        if (p === 'lower' || v < 0.19) return '#071f1a';
        if (band(v, 0.34, 0.365, n) && u > 0.25 && u < 0.95) return '#cedc00';
        if (p === 'accent') return u < 0.15 ? '#cedc00' : '#0b5a4b';
        return u > 0.88 ? mix('#0b5a4b', '#0f7a63', 0.5) : '#0b5a4b';
      },
    },
    audi: { // R26 : avant argent, milieu rouge, arrière anthracite
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) ? (v > 0.85 ? '#e3261c' : '#1d1e21') : isFW(u, v) && s > 0.8 ? '#cfd2d6' : null;
        if (p === 'lower' || v < 0.18) return '#141416';
        if (p === 'accent') return '#e3261c';
        if (u > 0.6) return '#d5d7db';
        if (u > 0.44) return '#e3261c';
        return v > 0.5 ? '#26272b' : '#1b1c1f';
      },
      finish: { rough: 0.38, clear: 0.7 },
    },
    cadillac: { // noir et blanc, avant clair
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isFW(u, v) ? '#e9e9eb' : isRW(u, v) && v > 0.85 ? '#e9e9eb' : null;
        if (p === 'accent') return '#e9e9eb';
        if (p === 'lower' || v < 0.18) return u > 0.62 ? '#dcdcdf' : '#0e0e10';
        if (band(v, 0.3, 0.34, n) && u > 0.3 && u < 0.9) return '#e9e9eb';
        if (u > 0.9 && v < 0.3) return '#e9e9eb';
        return '#111113';
      },
    },
    haas: { // VF-26 : blanc, rouge et noir
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) ? (v > 0.85 ? '#e6002b' : '#f1f1f1') : null;
        if (p === 'accent') return '#e6002b';
        if (p === 'lower' || v < 0.19) return '#121212';
        if (u < 0.48 && v > 0.62) return v > 0.8 ? '#121212' : '#e6002b';
        if (band(v, 0.27, 0.33, n) && u > 0.22 && u < 0.78) return '#e6002b';
        if (band(v, 0.22, 0.27, n) && u > 0.22 && u < 0.7) return '#121212';
        return '#f2f2f2';
      },
    },
    ferrari: { // SF-26 : rouge, touches blanches, dessous noir
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) && v > 0.85 ? '#d40000' : null;
        if (p === 'accent') return '#f4f4f4';
        if (p === 'lower' || v < 0.2) return '#141414';
        if (u > 0.4 && u < 0.56 && v > 0.7) return '#f4f4f4';
        if (band(v, 0.22, 0.26, n) && u > 0.25 && u < 0.85) return '#f4f4f4';
        return '#d40000';
      },
    },
    mclaren: { // MCL40 : papaye avec chevron noir
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) && v > 0.8 ? '#ff8000' : isFW(u, v) && s > 0.82 ? '#ff8000' : null;
        if (p === 'accent') return '#1b1b1f';
        if (p === 'lower' || v < 0.19) return '#141416';
        if (u > 0.24 && u < 0.62 && v > 0.52 && v < 0.5 + (u - 0.24) * 0.9) return '#1b1b1f';
        if (u > 0.62 && u < 0.72 && v > 0.45 && v < 0.6) return '#1b1b1f';
        return '#ff8000';
      },
    },
    mercedes: { // W17 : noir, filets turquoise et argent
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) && v > 0.85 ? '#00d2be' : null;
        if (p === 'accent') return '#00d2be';
        if (p === 'lower' || v < 0.18) return '#0b0b0c';
        if (band(v, 0.2, 0.25, n) && u > 0.25 && u < 0.85) return '#00d2be';
        if (u > 0.78 && v > 0.22) return mix('#121214', '#5a5e66', sm(0.78, 1, u) * 0.6);
        return '#121214';
      },
    },
    rb: { // VCARB 03 : blanc dessus, bleu dessous, touches rouges
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) ? (v > 0.85 ? '#e10600' : '#1a2fb5') : isFW(u, v) && s > 0.8 ? '#1a2fb5' : null;
        if (p === 'accent') return '#e10600';
        if (p === 'lower' || v < 0.18) return '#0f1a66';
        const split = 0.36 + 0.18 * sm(0.2, 0.9, u);
        if (u < 0.22) return '#1a2fb5';
        if (v < split) return '#1a2fb5';
        if (u > 0.36 && u < 0.46 && v > 0.62) return '#e10600';
        return '#f4f5f7';
      },
    },
    racing_bulls: null,
    red_bull: { // RB22 : bleu nuit mat, rouge et jaune
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) && v > 0.85 ? '#d6001c' : null;
        if (p === 'accent') return '#ffcc00';
        if (p === 'lower' || v < 0.18) return '#0d1430';
        if (u > 0.95) return '#ffcc00';
        if (u > 0.3 && u < 0.5 && v > 0.55) return v > 0.78 ? '#ffcc00' : '#d6001c';
        if (band(v, 0.24, 0.28, n) && u > 0.3 && u < 0.85) return '#d6001c';
        return '#1a2650';
      },
      finish: { rough: 0.62, clear: 0.15 },
    },
    williams: { // FW48 : dégradé bleu nuit -> bleu ciel
      paint(u, v, s, p, n) {
        if (p === 'carbon') return isRW(u, v) && v > 0.85 ? '#2aa8ea' : null;
        if (p === 'accent') return '#f2f4f8';
        if (p === 'lower' || v < 0.18) return '#06163a';
        const t = Math.max(sm(0.55, 0.25, v), sm(0.6, 0.95, u) * 0.8);
        return mix('#0a2a66', '#2aa8ea', t);
      },
    },
  };
  LIVERY3D.racing_bulls = LIVERY3D.rb;
  const liveryPaint = (id) => LIVERY3D[id] || null;

  F1.visuals = { car, svgCar, hydrate, livery, liveryPaint, loadPortraits, portrait, allPortraits };
})(globalThis.F1 = globalThis.F1 || {});
