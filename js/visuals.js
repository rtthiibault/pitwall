/* Visuels : monoplaces vectorielles aux couleurs des écuries + portraits des pilotes (Wikimedia Commons). */
(function (F1) {
  // Livrées : carrosserie, accent, détail (aileron/fond), couleur du casque
  const LIVERY = {
    mclaren: { body: '#FF8000', accent: '#1B1B1F', detail: '#47C7FC', helmet: '#FFD600' },
    ferrari: { body: '#E8002D', accent: '#FFFFFF', detail: '#111111', helmet: '#FFEB00' },
    red_bull: { body: '#1E2A5A', accent: '#E10600', detail: '#FFCC00', helmet: '#3671C6' },
    mercedes: { body: '#16181C', accent: '#27F4D2', detail: '#C8CCD0', helmet: '#FFFFFF' },
    aston_martin: { body: '#00594F', accent: '#CEDC00', detail: '#0B2A26', helmet: '#CEDC00' },
    alpine: { body: '#0078C1', accent: '#FD4BC7', detail: '#0A1A3A', helmet: '#FFFFFF' },
    williams: { body: '#00A0DE', accent: '#041E42', detail: '#FFFFFF', helmet: '#041E42' },
    rb: { body: '#F2F3F7', accent: '#1634CB', detail: '#E10600', helmet: '#1634CB' },
    racing_bulls: { body: '#F2F3F7', accent: '#1634CB', detail: '#E10600', helmet: '#1634CB' },
    haas: { body: '#EEEEEE', accent: '#E6002B', detail: '#1A1A1A', helmet: '#E6002B' },
    audi: { body: '#BFC3C7', accent: '#F50537', detail: '#141414', helmet: '#141414' },
    sauber: { body: '#52E252', accent: '#111111', detail: '#111111', helmet: '#FFFFFF' },
    cadillac: { body: '#121212', accent: '#F4F4F4', detail: '#C9A227', helmet: '#C9A227' },
  };
  const livery = (id) => LIVERY[id] || { body: F1.teamColor(id), accent: '#111', detail: '#333', helmet: '#fff' };
  let uid = 0;
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  function wheel(cx, cy, r, spin) {
    return `<g class="${spin ? 'wh-spin' : ''}" style="transform-origin:${cx}px ${cy}px">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#0c0c0e"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 3}" fill="none" stroke="#1f1f24" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.56}" fill="#2a2b31"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.56}" fill="none" stroke="#E10600" stroke-width="2.2" stroke-dasharray="${r * 0.9} ${r * 0.5}"/>
      <path d="M${cx - r * 0.5} ${cy}H${cx + r * 0.5}M${cx} ${cy - r * 0.5}V${cy + r * 0.5}" stroke="#55565e" stroke-width="2.4"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.14}" fill="#9a9ca5"/></g>`;
  }

  /* Monoplace vue de profil (nez à droite). opts : number, spin (roues animées), shadow */
  function car(teamId, opts = {}) {
    const L = livery(teamId);
    const id = 'c' + (++uid);
    const num = opts.number != null ? String(opts.number) : '';
    return `<svg class="car" viewBox="0 0 420 120" role="img" aria-label="Monoplace ${F1.teamShort(teamId)}">
      <defs>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
        <radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      </defs>
      ${opts.shadow === false ? '' : `<ellipse cx="210" cy="110" rx="200" ry="8" fill="url(#${id}s)"/>`}
      <!-- aileron arrière -->
      <rect x="14" y="16" width="44" height="9" rx="2" fill="${L.detail}"/>
      <rect x="16" y="27" width="40" height="6" rx="2" fill="${L.accent}"/>
      <path d="M20 16 L28 16 L34 70 L24 70 Z" fill="${L.body}"/>
      <path d="M20 16 L28 16 L34 70 L24 70 Z" fill="url(#${id}b)"/>
      <!-- fond plat -->
      <path d="M36 96 H392 L398 101 H30 Z" fill="#101013"/>
      <!-- carrosserie -->
      <path d="M34 84 C34 72 38 60 48 54 L70 44 C86 36 110 30 140 28 L160 27 C168 27 172 30 174 36 L178 46 L232 48 C262 50 300 60 338 68 L384 76 C392 78 394 84 388 86 L338 88 C320 89 300 90 270 90 L150 92 C110 92 70 92 40 92 Z" fill="${L.body}"/>
      <!-- bandes de livrée -->
      <path d="M48 70 C90 62 150 58 230 60 C280 61 330 68 386 80 L386 84 C330 74 280 68 228 67 C150 66 92 70 46 78 Z" fill="${L.accent}"/>
      <path d="M140 28 L160 27 C168 27 172 30 174 36 L178 46 L150 46 C150 38 146 32 140 28 Z" fill="${L.accent}" opacity=".9"/>
      <!-- ponton -->
      <path d="M112 62 C140 56 196 54 236 60 L248 72 L246 90 L112 92 C104 82 104 70 112 62 Z" fill="${L.body}"/>
      <path d="M112 62 C140 56 196 54 236 60 L240 66 C200 61 146 62 110 70 Z" fill="#000" opacity=".25"/>
      <path d="M232 60 L248 72 L246 90 L238 90 Z" fill="#000" opacity=".35"/>
      <!-- reflets -->
      <path d="M34 84 C34 72 38 60 48 54 L70 44 C86 36 110 30 140 28 L160 27 C168 27 172 30 174 36 L178 46 L232 48 C262 50 300 60 338 68 L384 76 C392 78 394 84 388 86 L338 88 C320 89 300 90 270 90 L150 92 C110 92 70 92 40 92 Z" fill="url(#${id}b)"/>
      <!-- prise d'air -->
      <path d="M150 30 C156 29 162 30 164 34 L160 40 L150 40 Z" fill="#0b0b0d"/>
      <!-- pilote + halo -->
      <circle cx="198" cy="44" r="10" fill="${L.helmet}"/>
      <path d="M190 42 H206 V46 H190 Z" fill="#0b0b0d" opacity=".85"/>
      <path d="M176 47 C186 30 214 30 236 46" fill="none" stroke="#1a1a1d" stroke-width="5" stroke-linecap="round"/>
      <path d="M206 34 L210 48" stroke="#1a1a1d" stroke-width="4"/>
      <!-- numéro -->
      ${num ? `<text x="176" y="84" text-anchor="middle" font-family="Titillium Web, sans-serif" font-weight="900" font-style="italic" font-size="19" fill="${lum(L.body) > 0.55 ? '#111' : '#fff'}" opacity=".95">${num}</text>` : ''}
      <!-- aileron avant -->
      <path d="M328 94 H408 L410 100 H324 Z" fill="${L.detail}"/>
      <path d="M340 90 H404 L406 94 H336 Z" fill="${L.accent}"/>
      <rect x="402" y="76" width="7" height="24" rx="2" fill="${L.body}"/>
      ${wheel(84, 86, 26, opts.spin)}
      ${wheel(318, 88, 24, opts.spin)}
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

  F1.visuals = { car, livery, loadPortraits, portrait, allPortraits };
})(globalThis.F1 = globalThis.F1 || {});
