/* Pictogrammes PITWALL : un jeu d'icônes vectorielles originales (trait 1,7 px sur une grille de 24, angles arrondis,
   couleur héritée du texte) qui remplace tous les emojis du site. Les emojis restent dans le code comme « noms » lisibles :
   un observateur les remplace à l'affichage, partout (pages, fenêtres, messages, fil de course). */
(function (F1) {
  const sunRays = (cx, cy, r1, r2, n = 8, from = 0) => Array.from({ length: n }, (_, i) => { const a = from + (i * Math.PI * 2) / n; return `M${(cx + Math.cos(a) * r1).toFixed(2)} ${(cy + Math.sin(a) * r1).toFixed(2)}L${(cx + Math.cos(a) * r2).toFixed(2)} ${(cy + Math.sin(a) * r2).toFixed(2)}`; }).join('');
  const CLOUD = 'M7.5 19.5h9.5a3.8 3.8 0 0 0 .4-7.6 5.3 5.3 0 0 0-10.2 1.3 3.2 3.2 0 0 0 .3 6.3z';
  const CLOUD_UP = 'M7.5 16h9.5a3.8 3.8 0 0 0 .4-7.6 5.3 5.3 0 0 0-10.2 1.3 3.2 3.2 0 0 0 .3 6.3z';
  const F = (d) => `<path d="${d}" fill="currentColor" stroke="none"/>`;
  const medal = (n) => `<path d="M8 2.8 11 9M16 2.8 13 9"/><circle cx="12" cy="15" r="5.6" fill="var(--pi-m)" stroke="currentColor"/>${n ? `<text x="12" y="17.6" text-anchor="middle" font-size="7.2" font-weight="800" fill="#14171c" stroke="none" font-family="Archivo, sans-serif">${n}</text>` : '<path d="m12 12.4.9 1.8 2 .3-1.45 1.4.35 2L12 17l-1.8.9.35-2-1.45-1.4 2-.3z" fill="#14171c" stroke="none"/>'}`;
  const COIN_P = '<path d="M23 12 17.5 21.5h-11L1 12l5.5-9.5h11Z" fill="#1fc9b0" stroke="#0a7565" stroke-width="1"/><path d="M6.5 2.5h11L23 12h-4.4L15 6.2H9L6.5 2.5Z" fill="#7ff3e1" opacity=".55" stroke="none"/><circle cx="12" cy="12" r="5.6" fill="#0c4a42" stroke="none"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="#5ee8d3" stroke-width="1.2" stroke-dasharray="2.2 1.3"/><circle cx="12" cy="12" r="1.5" fill="#5ee8d3" stroke="none"/>';
  const COIN_J = '<circle cx="12" cy="12" r="11.2" fill="#e8b63a" stroke="none"/><g fill="#8a5d0c" stroke="none">' + [0, 60, 120, 180, 240, 300].map((a) => `<rect x="10.5" y=".8" width="3" height="3.6" rx=".7" transform="rotate(${a} 12 12)"/>`).join('') + '</g><circle cx="12" cy="12" r="10.4" fill="none" stroke="#a87414" stroke-width=".9"/><circle cx="12" cy="12" r="6.6" fill="#f7d877" stroke="#9a6810" stroke-width="1.1"/><path d="M8.9 8.9h3.1V12H8.9zM12 12h3.1v3.1H12z" fill="#5c3c05" stroke="none"/><path d="M12 8.9h3.1V12H12zM8.9 12H12v3.1H8.9z" fill="#fff3c4" stroke="none"/>';

  const I = {
    // course
    flag: '<path d="M5 21.5V3.5"/><path d="M5 4h14v9H5"/>' + F('M5 4h3.5v3H5zM12 4h3.5v3H12zM8.5 7H12v3H8.5zM15.5 7H19v3h-3.5zM5 10h3.5v3H5zM12 10h3.5v3H12z'),
    lights: '<rect x="2.5" y="7" width="19" height="10" rx="2.5"/><path d="M12 3.5V7M12 17v3.5"/><g fill="var(--red, #d7261e)" stroke="none"><circle cx="7" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="17" cy="12" r="2.1"/></g>',
    car: '<path d="M2.5 15.5h19l-1.4-2.3-6-1.1-1.9-2.6h-3.1L7.6 12l-3.9.6z"/><path d="M2.5 8h3.6v4.4"/>' + F('M4.2 16.6a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0M15.4 16.6a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0'),
    helmet: '<path d="M3.5 14.5a8.5 8.5 0 0 1 17-1.2V17.5h-10l-2.6 2.5H3.5z"/><path d="M10.5 13h10"/><path d="M12 9.3h8"/>',
    tyre: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="' + sunRays(12, 12, 6.2, 8.2, 8, Math.PI / 8) + '"/>',
    fuel: '<path d="M5 20.5V5A1.5 1.5 0 0 1 6.5 3.5h6A1.5 1.5 0 0 1 14 5v15.5M3.5 20.5h12"/><path d="M7.5 7h4v3.5h-4z"/><path d="M14 9h2.3l2 2v6.3a1.3 1.3 0 0 0 2.6 0V9l-2-2"/>',
    wrench: '<path d="M14.6 4.3a4.6 4.6 0 0 0-5.8 6L3.7 15.4a1.9 1.9 0 0 0 2.7 2.7l5.1-5.1a4.6 4.6 0 0 0 6-5.8l-2.6 2.6-2.5-.6-.6-2.5z"/>',
    driver: '<path d="M14 3.5 20.5 10l-3 3L11 6.5z"/><path d="M12.6 11.4 4 20"/>',
    nut: '<path d="M12 2.8 19.9 7.4v9.2L12 21.2l-7.9-4.6V7.4z"/><circle cx="12" cy="12" r="3.3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.4 2.3 2.6-.7.7 2.6 2.3 1.4-1 2.5 1 2.5-2.3 1.4-.7 2.6-2.6-.7L12 21.2l-1.4-2.3-2.6.7-.7-2.6-2.3-1.4 1-2.5-1-2.5 2.3-1.4.7-2.6 2.6.7z"/>',
    toolbox: '<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M9 8V5.5h6V8M3 13h18M10.5 13v2.2h3V13"/>',
    jack: '<path d="M3 20.5h18M6.5 20.5 9 14h6l2.5 6.5M9.5 14V9h5v5M6.5 9h11"/>',
    gun: '<path d="M3.5 8.5h9.5l2-2h3v6h-3l-2-2H9.5V13l-2 6H4.6l1.6-6V8.5"/><path d="M18 9.5h3"/>',
    weave: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12 12 4M4 20 20 4M12 20l8-8M8 4l12 12M4 8l12 12" opacity=".75"/>',
    truck: '<path d="M2.5 6.5h11v10h-11zM13.5 9.5h4l3 3.2v3.8h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    factory: '<path d="M3 21V10l5 3v-3l5 3v-3l5 3V4h3v17z"/><path d="M7 17h2M12 17h2M17 17h1.5"/>',
    crane: '<path d="M6 21V4h2v17M3.5 21h8M8 4l11.5 4H8M17.5 8v4.5"/><rect x="16" y="12.5" width="3" height="2.6"/>',
    antenna: '<path d="M5.2 18.8a9.6 9.6 0 0 1 0-13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6M8.3 15.7a5.2 5.2 0 0 1 0-7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4"/>' + F('M10.4 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0'),
    headset: '<path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect x="3" y="13" width="4" height="6.5" rx="1.4"/><rect x="17" y="13" width="4" height="6.5" rx="1.4"/>',
    radio: '<path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect x="3" y="13" width="4" height="6.5" rx="1.4"/><rect x="17" y="13" width="4" height="6.5" rx="1.4"/><path d="M19 19.5c0 1.4-2 2-5.5 2"/>',
    battery: '<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M21.5 10.3v3.4"/>' + F('M5.2 9.6h2.6v4.8H5.2zM9.2 9.6h2.6v4.8H9.2zM13.2 9.6h2.6v4.8h-2.6z'),
    bolt: '<path d="M13.2 2.5 4.8 13.4h6.4L10 21.5l8.4-11H12z"/>',
    aero: '<path d="M2.5 14c4.2-4.6 12.3-5.6 19-2.4-5.1.3-10.2 1.4-15 4.1z"/><path d="M3 7.5h7M6.5 10H14M13.5 18H21"/>',
    wind: '<path d="M3 8.5h11a2.5 2.5 0 1 0-2.5-2.5M3 12.5h15.5a2.5 2.5 0 1 1-2.5 2.5M3 16.5h8"/>',
    flame: '<path d="M12 21.5c-3.9 0-6.5-2.6-6.5-6 0-3 1.9-5 3.4-7 .3 2 1.3 3 2.6 3.5.2-3.5 1.6-6.4 4.1-9.5.4 3.6 3 5.6 3 9.6 0 5.3-2.7 9.4-6.6 9.4z"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.6 4.6 12 6.6l2.4-2M9.6 19.4 12 17.4l2.4 2M3.9 11.1l3 1.1-.5 3.1M20.1 12.9l-3-1.1.5-3.1"/>',
    shield: '<path d="M12 3 19.5 6v5.6c0 4.5-3 7.9-7.5 9.4-4.5-1.5-7.5-4.9-7.5-9.4V6z"/><path d="m8.8 12 2.3 2.3 4.3-4.6"/>',
    swords: '<path d="M4 4l10.5 10.5M20 4 9.5 14.5M6 16.5l1.5 1.5M18 16.5 16.5 18M5 15l4 4M19 15l-4 4M3.5 20.5 6 18M20.5 20.5 18 18"/>',
    sim: '<path d="M3 9.3c0-1.9 1.4-2.8 3.3-2.8h11.4c1.9 0 3.3.9 3.3 2.8v3.4c0 2.8-1.6 4.8-4 4.8h-1.6l-1.4-2h-4l-1.4 2H7c-2.4 0-4-2-4-4.8z"/><rect x="9" y="8.8" width="6" height="3.4" rx=".8"/>' + F('M5.6 11a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0M16.6 11a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0'),
    // équipe / R&D
    lab: '<path d="M9.5 3h5M10.5 3v6.2L4.9 18.6A1.6 1.6 0 0 0 6.3 21h11.4a1.6 1.6 0 0 0 1.4-2.4L13.5 9.2V3"/><path d="M7.6 15h8.8"/>',
    dna: '<path d="M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9M16 3c0 4.5-8 4.5-8 9s8 4.5 8 9M9.6 6.2h4.8M9.6 17.8h4.8"/>',
    ruler: '<path d="M4 20V4l16 16z"/><path d="M8 16v-3.4l3.4 3.4z"/><path d="M4 8h2M4 12h2"/>',
    pawn: '<circle cx="12" cy="6.4" r="2.8"/><path d="M9.5 10h5M10 10.5c0 3-1.5 5-2.5 6.5h9c-1-1.5-2.5-3.5-2.5-6.5M6.5 20.5h11v-3.5h-11z"/>',
    brief: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5V5h6v2.5M3 12.5h18M11 12.5v2h2v-2"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/><path d="m6.5 12.2 3-3.2 2.5 2 4-4.5"/>',
    chart: '<path d="M3.5 3.5v17h17"/><path d="m7 15 4-4.5 3 3L19.5 7"/><path d="M15.5 7h4v4"/>',
    box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/>',
    userplus: '<circle cx="10" cy="8" r="4"/><path d="M2.5 20.5c1.2-3.8 4-5.5 7.5-5.5 2 0 3.8.6 5 1.7M18.5 13v6M15.5 16h6"/>',
    contract: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 10.5h7M9 13.5h5"/><path d="M9 18c1-1.4 1.9-1.4 2.4 0s1.5 1.4 2.4 0 1.9-1 2.7 0"/>',
    idcard: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="10.8" r="2.2"/><path d="M5.4 16c.6-1.5 1.7-2.3 3.1-2.3s2.5.8 3.1 2.3M14 10h4.5M14 13.5h3"/>',
    // récompenses
    trophy: '<path d="M8 3.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.3a2.6 2.6 0 0 0 2.9 3.8M16 5.5h2.7a2.6 2.6 0 0 1-2.9 3.8M12 13v3.5M9.5 16.5h5v3.5h-5zM7.5 20h9"/>',
    crown: '<path d="M4 17.5h16l1-10-5 4-4-7-4 7-5-4z"/><path d="M4.5 20.5h15"/>',
    gem: '<path d="M6.5 4h11l3.5 5L12 20.5 3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11.5L16 9l-1.5-5"/>',
    medal0: medal(0), medal1: medal('1'), medal2: medal('2'), medal3: medal('3'),
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/>' + F('M10.8 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0'),
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5C10.6 5 7 4.6 7 6.8s3 1.7 5 1.7c2 0 5 .4 5-1.7S13.4 5 12 8.5z"/>',
    firework: '<path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8"/>' + F('M10.4 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0'),
    champagne: '<path d="M9.5 21h4V11.5l-1-2V4h-2v5.5l-1 2z"/><path d="M15 6.5l2.5-1.5M15.5 9H18M14.5 4l.8-1.5"/>',
    spark: '<path d="M11 3c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6z"/><path d="M18.5 14.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z"/>',
    boost: '<path d="m6 12.5 6-6 6 6M6 18.5l6-6 6 6"/>',
    slow: '<path d="M3.8 17.5a8.2 8.2 0 1 1 16.4 0"/><path d="M12 17.5 7.4 14"/>' + F('M11 17.5a1 1 0 1 0 2 0 1 1 0 1 0-2 0'),
    up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
    // jeu / paris
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/>' + F('M7.1 8.1a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0M14.7 8.1a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0M10.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0M7.1 15.9a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0M14.7 15.9a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0'),
    ticket: '<path d="M3 7.5h18v3a1.5 1.5 0 0 0 0 3v3H3v-3a1.5 1.5 0 0 0 0-3z"/><path d="M15 7.5v9" stroke-dasharray="1.6 1.8"/>',
    radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.4"/><path d="M12 12l6-6"/>' + F('M14.6 15.2a1 1 0 1 0 2 0 1 1 0 1 0-2 0'),
    news: '<path d="M4 4.5h13v15H5.5A1.5 1.5 0 0 1 4 18z"/><path d="M17 8h3v10a1.5 1.5 0 0 1-3 0"/><path d="M7 8h7M7 11h7M7 14h4"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z"/>',
    pitcoin: COIN_P, jeton: COIN_J,
    // état
    warn: '<path d="M12 3.6 2.6 19.8h18.8z"/><path d="M12 10v4.4"/>' + F('M11.1 17.2a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0'),
    ok: '<circle cx="12" cy="12" r="8.8"/><path d="m8 12.3 2.7 2.7L16.2 9.3"/>',
    no: '<circle cx="12" cy="12" r="8.8"/><path d="m9 9 6 6M15 9l-6 6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5V17"/>',
    bulb: '<path d="M9.3 18h5.4M10.2 21h3.6"/><path d="M8.5 14.6a6 6 0 1 1 7 0c-.8.6-1.2 1.5-1.2 2.4H9.7c0-.9-.4-1.8-1.2-2.4z"/>',
    beacon: '<path d="M6 15a6 6 0 0 1 12 0v3H6z"/><path d="M4 21h16M12 3v2.5M4.6 6.6l1.8 1.8M19.4 6.6l-1.8 1.8"/>',
    flaggreen: '<path d="M5 21.5V3.5"/><path d="M5 4h14v9H5z" fill="currentColor"/>',
    refresh: '<path d="M19.5 10.5A7.8 7.8 0 0 0 5.4 7.2L4 8.8"/><path d="M4 3.8v5h5"/><path d="M4.5 13.5a7.8 7.8 0 0 0 14.1 3.3l1.4-1.6"/><path d="M20 20.2v-5h-5"/>',
    shuffle: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4"/><path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/>',
    hourglass: '<path d="M6.5 3h11M6.5 21h11M7.5 3v3a4.5 4.5 0 0 0 9 0V3M7.5 21v-3a4.5 4.5 0 0 1 9 0v3"/>',
    stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.6M10 2.5h4M12 2.5V6M18.4 6.6 20 5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' + F('M7 13.2h3v3H7z'),
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    save: '<path d="M5 3.5h11.5L20 7v13.5H5z"/><path d="M8 3.5v5h7v-5M8 20.5v-6h8v6"/>',
    pencil: '<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19z"/><path d="M13.5 7l3.5 3.5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    inbox: '<path d="M3 13l2.5-8h13L21 13v6.5H3z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
    skip: '<path d="m5 6 6.5 6L5 18zM12 6l6.5 6L12 18zM20 6v12"/>',
    // météo
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="' + sunRays(12, 12, 6.6, 9.4) + '"/>',
    suncloud: '<g stroke="var(--pi-sun, #f6c445)"><circle cx="8.6" cy="8.2" r="3"/><path d="' + sunRays(8.6, 8.2, 4.7, 6.4, 6, Math.PI) + '"/></g><path d="' + CLOUD + '" fill="var(--pi-bg, #14181e)"/>',
    cloud: '<path d="' + CLOUD + '"/>',
    sunrain: '<g stroke="var(--pi-sun, #f6c445)"><circle cx="8.6" cy="6.6" r="2.8"/><path d="' + sunRays(8.6, 6.6, 4.4, 6, 6, Math.PI) + '"/></g><path d="' + CLOUD_UP + '" fill="var(--pi-bg, #14181e)"/><path d="M9 18.5l-1 2.5M13 18.5l-1 2.5M17 18.5l-1 2.5" stroke="var(--pi-rain, #5ab0ff)"/>',
    rain: '<path d="' + CLOUD_UP + '"/><path d="M8 18.5l-1 2.5M12 18.5l-1 2.5M16 18.5l-1 2.5" stroke="var(--pi-rain, #5ab0ff)"/>',
    storm: '<path d="' + CLOUD_UP + '"/><path d="M12.5 15.5 10 19.2h3l-1.5 3.3" stroke="var(--pi-sun, #f6c445)"/>',
    drop: '<path d="M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.5 6-10.5z"/>',
  };

  // Emoji -> pictogramme (+ teinte sémantique)
  const MAP = {
    '🏁': 'flag', '🚦': 'lights', '🚥': 'lights', '🏎': 'car', '🧠': 'helmet', '🛞': 'tyre', '⛽': 'fuel', '🔧': 'wrench', '🛠': 'wrench', '🪛': 'driver',
    '🔩': 'nut', '⚙': 'gear', '🧰': 'toolbox', '🛗': 'jack', '🔫': 'gun', '🧵': 'weave', '🚛': 'truck', '🏭': 'factory', '🏗': 'crane', '📡': 'antenna',
    '🎧': 'headset', '📻': 'radio', '🔋': 'battery', '⚡': 'bolt', '🌀': 'aero', '💨': 'wind', '🌬': 'wind', '🔥': 'flame', '❄': 'snow', '🛡': 'shield',
    '⚔': 'swords', '🎮': 'sim', '🔬': 'lab', '🧬': 'dna', '📐': 'ruler', '♟': 'pawn', '👔': 'brief', '💼': 'contract', '💻': 'monitor', '🖥': 'monitor',
    '📈': 'chart', '📦': 'box', '👤': 'user', '👨': 'user', '👋': 'userplus', '🤝': 'contract', '🪪': 'idcard', '🏆': 'trophy', '👑': 'crown', '💎': 'gem',
    '💠': 'gem', '🏅': 'medal0', '🥇': 'medal1', '🥈': 'medal2', '🥉': 'medal3', '🎯': 'target', '🎁': 'gift', '🎉': 'firework', '🎆': 'firework', '🍾': 'champagne',
    '🥂': 'champagne', '✨': 'spark', '🚀': 'boost', '🐢': 'slow', '⬆': 'up', '🎲': 'dice', '🎟': 'ticket', '🔮': 'radar', '📰': 'news', '🌐': 'globe', '🌍': 'globe',
    '💰': 'pitcoin', '💸': 'jeton', '🟡': 'jeton', '⚠': 'warn', '✅': 'ok', '❌': 'no', '😬': 'no', '🤷': 'inbox', '🔒': 'lock', '💡': 'bulb', '🚨': 'beacon',
    '🟢': 'flaggreen', '🔄': 'refresh', '🔀': 'shuffle', '⏳': 'hourglass', '⏱': 'stopwatch', '📅': 'calendar', '🔗': 'link', '📋': 'clipboard', '💾': 'save',
    '✏': 'pencil', '🔍': 'search', '📨': 'mail', '⏭': 'skip', '☀': 'sun', '🌤': 'suncloud', '⛅': 'suncloud', '☁': 'cloud', '🌦': 'sunrain', '🌧': 'rain',
    '⛈': 'storm', '💧': 'drop',
  };
  const TONE = { warn: 'warn', ok: 'ok', no: 'no', flaggreen: 'ok', beacon: 'warn', trophy: 'gold', crown: 'gold', medal1: 'gold', medal0: 'gold', gem: 'gem', bolt: 'volt', battery: 'volt', flame: 'hot', snow: 'cold', sun: 'sun', drop: 'cold', bulb: 'gold', lock: 'mute' };

  const svg = (name, cls = '') => { const b = I[name]; if (!b) return ''; return `<svg class="pi pi-${name} ${TONE[name] ? 'pt-' + TONE[name] : ''} ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${b}</svg>`; };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const RX = new RegExp('(' + Object.keys(MAP).sort((a, b) => b.length - a.length).map(esc).join('|') + ')\\uFE0F?', 'gu');
  const has = (s) => { RX.lastIndex = 0; return RX.test(s); };
  const strip = (s) => s.replace(RX, '').replace(/\s{2,}/g, ' ').trim();
  // gabarits analysés une seule fois, clonés ensuite
  const tpl = {};
  const node = (name) => { if (!tpl[name]) { const t = document.createElement('template'); t.innerHTML = svg(name); tpl[name] = t.content.firstChild; } return tpl[name].cloneNode(true); };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE', 'INPUT', 'CANVAS']);

  function fixText(t) {
    const v = t.nodeValue; if (!v || !has(v)) return;
    const p = t.parentNode; if (!p) return;
    if (SKIP.has(p.nodeName) || p.namespaceURI === 'http://www.w3.org/2000/svg') { t.nodeValue = strip(v); return; }
    const frag = document.createDocumentFragment(); let last = 0; RX.lastIndex = 0; let m;
    while ((m = RX.exec(v))) {
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      frag.appendChild(node(MAP[m[1]]));
      last = m.index + m[0].length;
    }
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    p.replaceChild(frag, t);
  }
  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  function fixAttrs(el) { for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && has(v)) el.setAttribute(a, strip(v)); } }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP.has(root.nodeName) && root.nodeName !== 'OPTION' && root.nodeName !== 'TITLE') return; fixAttrs(root); }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    list.forEach(fixText);
    if (root.querySelectorAll) root.querySelectorAll('[title],[aria-label],[placeholder],[alt]').forEach(fixAttrs);
  }
  function start() {
    scan(document.body);
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'characterData') fixText(m.target);
        else if (m.type === 'attributes') fixAttrs(m.target);
        else m.addedNodes.forEach(scan);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  F1.icon = svg;
  F1.icons = { MAP, names: Object.keys(I), strip };
})(globalThis.F1 = globalThis.F1 || {});
