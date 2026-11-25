/* Illustrations du F1 Manager : le garage de l'écurie et le muret des stands.
   Dessins vectoriels en perspective légère, couleurs de l'écurie, éléments qui apparaissent
   avec les équipements achetés. Grille : garage 1200 × 460, muret 1200 × 420. */
(function (F1) {
  const shade = (hex, k) => { // k < 0 : plus sombre, k > 0 : plus clair
    const n = parseInt(String(hex).slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = k < 0 ? 0 : 255, a = Math.abs(k); r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const ink = (hex) => { const n = parseInt(String(hex).slice(1), 16); const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#0b0d10' : '#ffffff'; };

  // jauge de niveau : 5 segments, remplis selon le niveau (remplace les pastilles « N1 »)
  function gauge(x, y, lv, col, label) {
    if (!lv) return '';
    let s = `<g transform="translate(${x} ${y})" class="g-lv"><title>${label} : niveau ${lv} sur 5</title><rect x="-23" y="-6" width="46" height="12" rx="2" fill="#07090c" stroke="rgba(255,255,255,.14)"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="${-19 + i * 8}" y="-2.5" width="6" height="5" rx="1" fill="${i < lv ? col : '#262b33'}"/>`;
    return s + '</g>';
  }

  // mécanicien en combinaison ignifugée, vu de face. pose : 0 debout, 1 pistolet de roue, 2 accroupi avec une roue
  function mech(x, y, k, col, pose = 0, flip = false) {
    const dark = shade(col, -0.45), lite = shade(col, 0.2), c = col;
    const helmet = `<g><circle cx="0" cy="-2" r="15" fill="#eef0f3"/><path d="M-15 -2 A15 15 0 0 1 15 -2" fill="none" stroke="${c}" stroke-width="5"/>
      <path d="M-12 -1 H12 C12 5 9 8 0 8 C-9 8 -12 5 -12 -1 Z" fill="#0b0d12"/><path d="M-9 1 H6" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/></g>`;
    const torso = `<path d="M-19 16 C-19 12 -15 10 -10 10 H10 C15 10 19 12 19 16 L17 66 H-17 Z" fill="${c}"/>
      <path d="M-7 10 L0 18 L7 10" fill="none" stroke="#fff" stroke-width="2"/><path d="M-17 40 H17" stroke="${dark}" stroke-width="6"/>
      <rect x="4" y="22" width="10" height="7" rx="1" fill="#fff" opacity=".9"/><path d="M-19 16 L-17 66" stroke="${lite}" stroke-width="2" opacity=".6"/>`;
    const legs = `<path d="M-15 64 H-1 L-2 112 H-13 Z" fill="${dark}"/><path d="M1 64 H15 L13 112 H2 Z" fill="${dark}"/>
      <path d="M-14 82 H-2 M2 82 H14" stroke="${c}" stroke-width="3"/><rect x="-16" y="110" width="15" height="7" rx="3" fill="#0b0d10"/><rect x="1" y="110" width="15" height="7" rx="3" fill="#0b0d10"/>`;
    let arms;
    if (pose === 1) { // pistolet de roue tenu devant
      arms = `<path d="M-19 18 L-28 44 L-20 48 L-12 24 Z" fill="${c}"/><path d="M19 18 L34 36 L28 42 L14 26 Z" fill="${c}"/>
        <circle cx="-24" cy="48" r="5" fill="#0b0d10"/><circle cx="32" cy="42" r="5" fill="#0b0d10"/>
        <g transform="translate(30 34)"><rect x="0" y="-6" width="30" height="13" rx="3" fill="#c9ced6"/><rect x="28" y="-4" width="8" height="9" rx="1" fill="#8b929c"/><rect x="6" y="6" width="7" height="14" rx="2" fill="#2a2e36"/><path d="M8 20 C4 34 -14 36 -22 30" fill="none" stroke="#e10600" stroke-width="3"/></g>`;
    } else if (pose === 2) { // accroupi : roue à la main
      return `<g transform="translate(${x} ${y}) scale(${flip ? -k : k} ${k})" class="mech"><ellipse cx="4" cy="118" rx="30" ry="6" fill="rgba(0,0,0,.45)"/>
        <path d="M-15 70 H0 L10 104 L24 112 L22 118 H2 L-12 90 Z" fill="${dark}"/><path d="M0 70 H14 L18 100 L4 116 L-4 110 L4 96 Z" fill="${dark}"/>
        <rect x="-16" y="112" width="18" height="7" rx="3" fill="#0b0d10"/><rect x="14" y="112" width="16" height="7" rx="3" fill="#0b0d10"/>
        <g transform="translate(0 30)">${torso.replace(/66/g, '44')}</g>
        <path d="M-17 50 L-30 78 L-22 82 L-10 58 Z" fill="${c}"/><path d="M17 50 L32 74 L25 80 L12 58 Z" fill="${c}"/>
        <g transform="translate(-4 92)"><circle r="24" fill="#16181d"/><circle r="24" fill="none" stroke="#2c3038" stroke-width="5"/><circle r="12" fill="#3a3f48"/><circle r="5" fill="#9aa1ab"/><path d="M-22 -6 A23 23 0 0 1 -6 -22" stroke="#ffd400" stroke-width="3" fill="none"/></g>
        <g transform="translate(0 30)">${helmet}</g></g>`;
    } else {
      arms = `<path d="M-19 18 L-25 56 L-17 58 L-12 26 Z" fill="${c}"/><path d="M19 18 L25 56 L17 58 L12 26 Z" fill="${c}"/>
        <circle cx="-21" cy="60" r="5" fill="#0b0d10"/><circle cx="21" cy="60" r="5" fill="#0b0d10"/>`;
    }
    return `<g transform="translate(${x} ${y}) scale(${flip ? -k : k} ${k})" class="mech"><ellipse cx="0" cy="118" rx="24" ry="5" fill="rgba(0,0,0,.45)"/>${legs}${torso}${arms}${helmet}</g>`;
  }

  // pile de pneus, couvertures chauffantes facultatives
  function tyreStack(x, y, compound, blankets, col) {
    let s = `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="70" rx="32" ry="7" fill="rgba(0,0,0,.45)"/>`;
    for (let k = 0; k < 4; k++) {
      const ty = 50 - k * 19;
      if (blankets) {
        s += `<rect x="-29" y="${ty}" width="58" height="18" rx="7" fill="${col}"/><rect x="-29" y="${ty}" width="58" height="18" rx="7" fill="url(#gBlanket)"/>
          <rect x="-12" y="${ty + 5}" width="24" height="8" rx="1" fill="#fff" opacity=".9"/><path d="M-29 ${ty + 9} H-14 M14 ${ty + 9} H29" stroke="${shade(col, -0.4)}" stroke-width="2"/>`;
      } else {
        s += `<rect x="-28" y="${ty}" width="56" height="18" rx="8" fill="#121317"/><path d="M-22 ${ty + 9} H22" stroke="${compound}" stroke-width="3"/>
          <path d="M-26 ${ty + 3} C-10 ${ty + 1} 10 ${ty + 1} 26 ${ty + 3}" stroke="rgba(255,255,255,.08)" stroke-width="2" fill="none"/>`;
      }
    }
    return s + '</g>';
  }

  /* ---------------- Garage ---------------- */
  function garage({ L, col, nMech, team }) {
    const o = (id) => (L(id) ? 1 : 0.16);
    const C = col, D = shade(col, -0.55), ti = ink(col);
    const g = [];
    g.push(`<defs>
      <linearGradient id="gCeil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070a"/><stop offset="1" stop-color="#0d1015"/></linearGradient>
      <linearGradient id="gWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12151b"/><stop offset="1" stop-color="#1b1f27"/></linearGradient>
      <linearGradient id="gSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#090b0f"/><stop offset="1" stop-color="#14171d"/></linearGradient>
      <linearGradient id="gFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3038"/><stop offset=".55" stop-color="#1d2027"/><stop offset="1" stop-color="#121419"/></linearGradient>
      <linearGradient id="gCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="gBack" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(C, 0.05)}"/><stop offset="1" stop-color="${shade(C, -0.35)}"/></linearGradient>
      <linearGradient id="gBlanket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
      <linearGradient id="gScreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1220"/><stop offset="1" stop-color="#05080d"/></linearGradient>
      <pattern id="gStripes" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="9" height="18" fill="rgba(0,0,0,.14)"/></pattern>
      <radialGradient id="gPool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".09"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>`);
    // volume : plafond, murs latéraux en perspective, mur du fond, sol
    g.push(`<rect width="1200" height="460" fill="#0b0d11"/>
      <rect width="1200" height="48" fill="url(#gCeil)"/>
      <path d="M0 0 H70 V300 L0 392 Z" fill="url(#gSide)"/><path d="M1200 0 H1130 V300 L1200 392 Z" fill="url(#gSide)" transform="translate(0 0)"/>
      <rect x="70" y="48" width="1060" height="252" fill="url(#gWall)"/>
      <path d="M0 392 L70 300 H1130 L1200 392 V460 H0 Z" fill="url(#gFloor)"/>`);
    // panneaux du mur du fond (joints verticaux, rivets)
    for (let i = 0; i < 10; i++) { const x = 70 + i * 106; g.push(`<path d="M${x} 48 V300" stroke="rgba(0,0,0,.45)" stroke-width="2"/><path d="M${x + 1.5} 48 V300" stroke="rgba(255,255,255,.035)"/>`); }
    g.push(`<path d="M70 232 H1130" stroke="rgba(0,0,0,.35)" stroke-width="2"/><path d="M70 296 H1130" stroke="#2a2f38" stroke-width="6"/>`);
    // panneau de l'écurie au fond
    g.push(`<g><rect x="388" y="70" width="424" height="118" fill="url(#gBack)"/><rect x="388" y="70" width="424" height="118" fill="url(#gStripes)"/>
      <rect x="388" y="70" width="424" height="4" fill="rgba(255,255,255,.35)"/><rect x="388" y="184" width="424" height="4" fill="rgba(0,0,0,.4)"/>
      <text x="600" y="134" text-anchor="middle" font-size="40" font-weight="900" fill="${ti}" letter-spacing="-1">${team}</text>
      <text x="600" y="164" text-anchor="middle" font-size="12" font-weight="600" fill="${ti}" opacity=".75" letter-spacing="4">PITWALL RACING · BOX 01</text></g>`);
    // poutre d'éclairage et rampes LED avec cônes de lumière
    g.push(`<path d="M40 22 H1160 M40 40 H1160" stroke="#3a3f49" stroke-width="3"/>`);
    let lat = ''; for (let x = 40; x < 1160; x += 24) lat += `M${x} 22 L${x + 12} 40 L${x + 24} 22 `;
    g.push(`<path d="${lat}" stroke="#2b3038" stroke-width="1.6" fill="none"/>`);
    [190, 460, 740, 1010].forEach((x) => g.push(`<path d="M${x - 70} 52 L${x - 150} 300 H${x + 150} L${x + 70} 52 Z" fill="url(#gCone)"/><rect x="${x - 76}" y="44" width="152" height="8" rx="2" fill="#20242c"/><rect x="${x - 70}" y="49" width="140" height="3" fill="#f3f6ff"/>`));
    // marquage du box au sol : cadre jaune en perspective, ligne d'axe couleur d'écurie, reflets
    g.push(`<path d="M232 306 H968 L1048 452 H152 Z" fill="none" stroke="#e8c330" stroke-width="5" opacity=".85"/>
      <path d="M600 306 V452" stroke="${C}" stroke-width="4" stroke-dasharray="18 14" opacity=".8"/>
      <path d="M190 380 H1010" stroke="rgba(255,255,255,.08)" stroke-width="2"/>
      <ellipse cx="600" cy="420" rx="360" ry="38" fill="url(#gPool)"/>`);

    // ---- équipements ----
    // banc de départ : portique de feux au mur, à gauche
    g.push(`<g opacity="${o('startsim')}"><rect x="118" y="64" width="190" height="40" rx="4" fill="#06080b" stroke="#2c313a" stroke-width="2"/>
      ${[0, 1, 2, 3, 4].map((i) => `<g transform="translate(${140 + i * 36} 84)"><circle r="10" fill="#1a0a0a"/><circle r="7" class="${L('startsim') ? 'scr-blink' : ''}" style="animation-delay:${i * 0.22}s" fill="#ff2a1f"/></g>`).join('')}
      <path d="M150 104 V120 M280 104 V120" stroke="#2c313a" stroke-width="3"/>${gauge(213, 126, L('startsim'), C, 'Banc de départ')}</g>`);
    // baie de télémétrie : deux écrans sur bras, à gauche
    g.push(`<g opacity="${o('telemetry')}"><path d="M218 196 V258 M196 258 H240" stroke="#2c313a" stroke-width="4"/>
      ${[110, 222].map((x, i) => `<g transform="translate(${x} 136)"><rect width="104" height="64" rx="3" fill="#07090d" stroke="#3a404b" stroke-width="2"/><rect x="5" y="5" width="94" height="54" fill="url(#gScreen)"/>
        ${i === 0 ? `<polyline class="scr-line" fill="none" stroke="#2ee59d" stroke-width="1.6" points="${Array.from({ length: 12 }, (_, k) => `${9 + k * 8},${36 + Math.sin(k * 1.2) * 13}`).join(' ')}"/><polyline fill="none" stroke="#ff4f6b" stroke-width="1.2" points="${Array.from({ length: 12 }, (_, k) => `${9 + k * 8},${40 + Math.cos(k * 0.9) * 9}`).join(' ')}"/><path d="M9 52 H95" stroke="#283040"/>`
          : `${[0, 1, 2, 3].map((r) => `<rect x="10" y="${11 + r * 11}" width="${30 + ((r * 23) % 30)}" height="5" fill="${['#e10600', '#ffd400', '#2ee59d', '#27b4f4'][r]}" opacity=".85"/><rect class="scr-bar" style="animation-delay:${r * 0.3}s" x="62" y="${11 + r * 11}" width="28" height="5" fill="#8b93a1"/>`).join('')}`}</g>`).join('')}
      ${gauge(218, 128, L('telemetry'), C, 'Baie de télémétrie')}</g>`);
    // muret des stands (chronométrage) et radar météo, à droite
    g.push(`<g opacity="${o('pitwall')}"><g transform="translate(902 136)"><rect width="110" height="64" rx="3" fill="#07090d" stroke="#3a404b" stroke-width="2"/><rect x="5" y="5" width="100" height="54" fill="url(#gScreen)"/>
      ${[0, 1, 2, 3, 4].map((r) => `<text x="11" y="${17 + r * 10}" font-size="7" fill="${r === 0 ? '#c66bff' : r < 3 ? '#2ee59d' : '#cfd5dc'}" font-family="monospace">${['P1 1:22.418', 'P2 +0.214', 'P3 +0.570', 'P4 +1.032', 'P5 +1.410'][r]}</text>`).join('')}</g>
      <path d="M957 200 V258 M935 258 H979" stroke="#2c313a" stroke-width="4"/>${gauge(957, 128, L('pitwall'), C, 'Muret des stands')}</g>`);
    g.push(`<g opacity="${o('radar')}"><g transform="translate(1020 136)"><rect width="96" height="64" rx="3" fill="#07090d" stroke="#3a404b" stroke-width="2"/><rect x="5" y="5" width="86" height="54" fill="#041019"/>
      <circle cx="48" cy="32" r="23" fill="none" stroke="#1e6b8c"/><circle cx="48" cy="32" r="13" fill="none" stroke="#1e6b8c"/><path d="M25 32 H71 M48 9 V55" stroke="#123f53"/>
      <path d="M56 18 C66 20 70 30 62 36 C56 40 50 34 54 28 Z" fill="rgba(39,180,244,.45)"/><path d="M38 40 C44 38 46 46 40 48 Z" fill="rgba(46,229,157,.4)"/>
      <g class="radar-sweep2"><path d="M48 32 L48 9" stroke="#27f4d2" stroke-width="2"/></g></g>${gauge(1068, 128, L('radar'), C, 'Station météo')}</g>`);
    // portique de stand : feu au-dessus de l'avant de la voiture
    g.push(`<g opacity="${o('gantry')}"><path d="M862 48 V120" stroke="#2c313a" stroke-width="6"/><rect x="844" y="112" width="36" height="66" rx="6" fill="#06080b" stroke="#3a404b" stroke-width="2"/>
      <circle cx="862" cy="132" r="10" fill="${L('gantry') ? '#ff2a1f' : '#3a1010'}"/><circle cx="862" cy="158" r="10" class="${L('gantry') ? 'g-green' : ''}" fill="#12351f"/>${gauge(862, 190, L('gantry'), C, 'Portique et feux')}</g>`);
    // pistolets pneumatiques suspendus à la flèche, flexibles rouges
    g.push(`<g opacity="${o('guns')}"><path d="M330 56 H870" stroke="#2c313a" stroke-width="5"/>
      ${[[420, 1], [760, -1]].map(([x, d]) => `<path d="M${x} 58 C${x + 30 * d} 90 ${x - 24 * d} 120 ${x} 150" fill="none" stroke="#d01913" stroke-width="3.5"/>
        <g transform="translate(${x} 150)"><rect x="-16" y="0" width="32" height="14" rx="3" fill="#cfd4db"/><rect x="${d > 0 ? 14 : -22}" y="2" width="8" height="10" rx="1" fill="#7d848e"/><rect x="-5" y="12" width="10" height="18" rx="2" fill="#2a2e36"/></g>`).join('')}
      ${gauge(420, 200, L('guns'), C, 'Pistolets pneumatiques')}</g>`);
    // banc à 7 vérins : quatre vérins sous les roues
    g.push(`<g opacity="${o('rig')}">${[[424, 444], [760, 444], [446, 420], [738, 420]].map(([x, y]) => `<g transform="translate(${x} ${y})"><rect x="-20" y="-6" width="40" height="10" rx="2" fill="#3b6fd0"/><rect x="-14" y="4" width="28" height="12" fill="#26437e"/><path d="M-20 -6 H20" stroke="#8fb2ff" stroke-width="1.5"/></g>`).join('')}
      ${gauge(600, 446, L('rig'), C, 'Banc à 7 vérins')}</g>`);
    // crics avant et arrière, posés au sol
    g.push(`<g opacity="${o('jacks')}"><g transform="translate(202 410)"><path d="M0 0 H72 L84 -10" fill="none" stroke="#dfe3e9" stroke-width="7" stroke-linecap="round"/><rect x="66" y="-4" width="26" height="10" rx="2" fill="${C}"/><circle cx="6" cy="8" r="7" fill="#0b0d10"/><circle cx="58" cy="8" r="7" fill="#0b0d10"/></g>
      <g transform="translate(998 410) scale(-1 1)"><path d="M0 0 H72 L84 -10" fill="none" stroke="#dfe3e9" stroke-width="7" stroke-linecap="round"/><rect x="66" y="-4" width="26" height="10" rx="2" fill="${C}"/><circle cx="6" cy="8" r="7" fill="#0b0d10"/><circle cx="58" cy="8" r="7" fill="#0b0d10"/></g>
      ${gauge(250, 438, L('jacks'), C, 'Crics rapides')}</g>`);
    // station pneus : trois piles (tendre, médium, dur), couvertures chauffantes si installées
    g.push(`<g opacity="${o('tyrerack')}">${['#e10600', '#ffd400', '#f2f2f2'].map((cp, i) => tyreStack(44 + i * 62 + (i * 6), 314 - i * 4, cp, !!L('blankets'), C)).join('')}
      ${gauge(108, 300, L('tyrerack'), C, 'Station pneus')}${L('blankets') ? gauge(170, 300, L('blankets'), C, 'Couvertures chauffantes') : ''}</g>`);
    // rampe carburant et lubrifiants : chariot de fûts et flexibles
    g.push(`<g opacity="${o('fuelrig')}"><g transform="translate(936 318)"><rect x="-6" y="56" width="74" height="8" rx="2" fill="#2c313a"/><circle cx="4" cy="68" r="6" fill="#0b0d10"/><circle cx="58" cy="68" r="6" fill="#0b0d10"/>
      <rect x="0" y="0" width="28" height="56" rx="5" fill="#d7dbe1"/><rect x="0" y="10" width="28" height="5" fill="${C}"/><rect x="32" y="8" width="28" height="48" rx="5" fill="#c3c8cf"/><rect x="32" y="18" width="28" height="5" fill="#2a2e36"/>
      <path d="M14 0 V-10 H46 V8" fill="none" stroke="#2a2e36" stroke-width="3"/><path d="M60 30 C82 34 86 54 74 66" fill="none" stroke="#111" stroke-width="4"/></g>${gauge(966, 304, L('fuelrig'), C, 'Rampe carburant')}</g>`);
    // stock de pièces : servante d'atelier à tiroirs, outils dessus
    g.push(`<g opacity="${o('spares')}"><g transform="translate(1030 300)"><rect x="0" y="0" width="140" height="86" rx="4" fill="#b3161c"/><rect x="0" y="0" width="140" height="6" fill="#d6252b"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="8" y="${12 + i * 18}" width="124" height="14" rx="1" fill="#8a1015"/><rect x="58" y="${17 + i * 18}" width="24" height="3" rx="1" fill="#e8ebef"/>`).join('')}
      <circle cx="14" cy="92" r="7" fill="#0b0d10"/><circle cx="126" cy="92" r="7" fill="#0b0d10"/><path d="M18 -4 H52 M64 -6 L80 -2 M96 -3 H124" stroke="#9aa1ab" stroke-width="4" stroke-linecap="round"/></g>
      ${gauge(1100, 292, L('spares'), C, 'Stock de pièces')}</g>`);
    // mécaniciens : nombre selon le niveau « Mécaniciens »
    const spots = [[256, 292, 0.92, 1, false], [944, 292, 0.92, 1, true], [330, 322, 1, 2, false], [872, 322, 1, 2, true], [150, 286, 0.86, 0, false], [1050, 286, 0.86, 0, true],
      [470, 270, 0.8, 0, false], [730, 270, 0.8, 0, true], [80, 300, 0.96, 0, false], [1122, 300, 0.96, 0, true], [560, 262, 0.74, 0, false], [640, 262, 0.74, 0, true]];
    g.push(spots.slice(0, nMech).map(([x, y, k, p, f]) => mech(x, y, k, C, p, f)).join(''));
    g.push(gauge(600, 296, L('crew'), C, 'Mécaniciens'));
    return g.join('');
  }

  /* ---------------- Muret des stands ---------------- */
  // décor de la piste et de l'allée des stands, sous les postes du muret (les postes restent des boutons HTML)
  function wallTrack(col) {
    return `<svg class="wall2-svg" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="wAsph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#23262d"/><stop offset="1" stop-color="#15171b"/></linearGradient>
        <linearGradient id="wGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".18"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <rect width="1200" height="200" fill="url(#wAsph)"/><rect width="1200" height="70" fill="url(#wGlow)"/>
      <rect y="0" width="1200" height="14" fill="#2f343c"/><rect y="14" width="1200" height="4" fill="#0b0d10"/>
      ${Array.from({ length: 40 }, (_, i) => `<rect x="${i * 30}" y="18" width="15" height="9" fill="${i % 2 ? '#f2f3f5' : '#d7261e'}"/>`).join('')}
      <path d="M0 98 H1200" stroke="#f2f3f5" stroke-width="3" stroke-dasharray="44 30" opacity=".55"/>
      <path d="M0 176 H1200" stroke="#f2f3f5" stroke-width="4" opacity=".7"/>
      ${Array.from({ length: 6 }, (_, i) => `<text x="${100 + i * 200}" y="160" font-size="14" font-weight="700" fill="rgba(255,255,255,.12)" letter-spacing="3">PIT LANE 80</text>`).join('')}
    </svg>`;
  }

  F1.scenes = { garage, wallTrack, mech, gauge, shade };
})(globalThis.F1 = globalThis.F1 || {});
