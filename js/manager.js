/* PITWALL Manager : PitCoins, marché des pilotes et châssis, R&D, moteur de course, ligues.
   Logique pure (sans DOM) : utilisable et testable hors navigateur. */
(function (F1) {
  const START_PC = 300;
  const RACES_PER_DAY = 5;
  const FIELD = 20; // 1 joueur + 19 managers IA
  const LAPS = 20;

  /* ---------- Pilotes : talent de base (ajusté chaque semaine par la forme réelle) ---------- */
  // id: [talent, offset rythme, offset combativité, offset régularité]
  const TALENT = {
    max_verstappen: [97, 1, 2, 1], norris: [93, 1, 0, -1], leclerc: [93, 3, 0, -2], russell: [92, 2, 0, 0],
    hamilton: [91, 0, 2, 0], piastri: [91, 0, 0, 3], alonso: [89, -2, 4, 3], antonelli: [88, 2, 1, -4],
    sainz: [88, 0, 1, 2], albon: [85, 0, 1, 1], perez: [84, -3, 2, 2], gasly: [84, 0, 1, 0],
    hulkenberg: [83, 0, 0, 2], bottas: [83, 1, -2, 2], hadjar: [83, 2, 1, -3], ocon: [82, 0, 1, -1],
    tsunoda: [82, 2, 1, -3], bearman: [81, 0, 2, -2], bortoleto: [80, 0, 0, -1], lawson: [79, 0, 2, -3],
    stroll: [77, -1, 0, -3], colapinto: [77, 0, 1, -3], arvid_lindblad: [76, 1, 1, -5], rafael_camara: [75, 1, 0, -5],
  };
  const ROOKIES = ['arvid_lindblad', 'rafael_camara'];

  /* ---------- Châssis : profil de chaque écurie (vitesse de pointe, appui, fiabilité) ---------- */
  const TEAM_PROFILE = {
    mercedes: [3, 2, 6], mclaren: [-2, 6, 3], ferrari: [4, 1, -4], red_bull: [6, -4, 1],
    aston_martin: [-3, 3, 0], williams: [6, -6, 0], alpine: [0, -2, -3], rb: [2, -1, -1],
    racing_bulls: [2, -1, -1], haas: [0, -2, 0], audi: [-1, 0, -2], sauber: [-1, 0, -2], cadillac: [-2, -2, -6],
  };
  const STATS = [
    { k: 'speed', label: 'Vitesse de pointe', icon: '⚡', short: 'Vitesse' },
    { k: 'df', label: 'Appui aérodynamique', icon: '🌀', short: 'Appui' },
    { k: 'rel', label: 'Fiabilité', icon: '🔧', short: 'Fiabilité' },
  ];
  const UP_STEP = 2.5;    // points de stat par niveau de R&D
  const UP_MAX = 10;      // niveau max par caractéristique
  const upCost = (lvl) => Math.round(25 * Math.pow(1.32, lvl));

  /* ---------- Profils des circuits (poids : vitesse, appui, fiabilité) ---------- */
  const CIRCUIT = {
    albert_park: [0.35, 0.45, 0.2], shanghai: [0.4, 0.45, 0.15], suzuka: [0.3, 0.55, 0.15], bahrain: [0.4, 0.35, 0.25],
    jeddah: [0.55, 0.3, 0.15], miami: [0.4, 0.4, 0.2], villeneuve: [0.5, 0.25, 0.25], monaco: [0.1, 0.7, 0.2],
    catalunya: [0.25, 0.6, 0.15], red_bull_ring: [0.45, 0.35, 0.2], silverstone: [0.35, 0.5, 0.15], spa: [0.5, 0.35, 0.15],
    hungaroring: [0.15, 0.65, 0.2], zandvoort: [0.2, 0.65, 0.15], monza: [0.65, 0.15, 0.2], madring: [0.35, 0.45, 0.2],
    baku: [0.55, 0.3, 0.15], sepang: [0.35, 0.4, 0.25], marina_bay: [0.15, 0.6, 0.25], americas: [0.35, 0.45, 0.2],
    rodriguez: [0.45, 0.3, 0.25], interlagos: [0.4, 0.4, 0.2], vegas: [0.6, 0.25, 0.15], losail: [0.3, 0.55, 0.15],
    yas_marina: [0.4, 0.4, 0.2], portimao: [0.35, 0.45, 0.2], istanbul: [0.35, 0.5, 0.15],
  };
  function circuitProfile(race) {
    const w = (race && CIRCUIT[race.circuitId]) || [0.35, 0.45, 0.2];
    const kind = w[0] >= 0.5 ? 'Circuit rapide' : w[1] >= 0.55 ? 'Circuit technique / sinueux' : w[2] >= 0.25 ? 'Circuit exigeant (chaleur, freinages)' : 'Circuit équilibré';
    const tip = w[0] >= 0.5 ? 'Privilégiez la vitesse de pointe et un réglage à faible appui.' : w[1] >= 0.55 ? 'Privilégiez l\'appui aérodynamique et un réglage chargé.' : w[2] >= 0.25 ? 'La fiabilité fera la différence : les abandons sont fréquents ici.' : 'Visez une voiture homogène et un réglage médian.';
    return { speed: w[0], df: w[1], rel: w[2], kind, tip };
  }

  /* ---------- Ligues ---------- */
  const LEAGUES = [
    { id: 'bronze', name: 'Bronze', min: 0, mult: 1, color: '#cd7f32', icon: '🥉', bot: [0, 1], drv: [74, 82] },
    { id: 'argent', name: 'Argent', min: 100, mult: 1.3, color: '#c9ced8', icon: '🥈', bot: [1, 3], drv: [77, 85] },
    { id: 'or', name: 'Or', min: 250, mult: 1.7, color: '#ffcc4d', icon: '🥇', bot: [3, 5], drv: [80, 88] },
    { id: 'platine', name: 'Platine', min: 450, mult: 2.2, color: '#7fe3d6', icon: '💠', bot: [5, 7], drv: [83, 91] },
    { id: 'diamant', name: 'Diamant', min: 700, mult: 3, color: '#8ab4ff', icon: '💎', bot: [7, 9], drv: [86, 94] },
    { id: 'legende', name: 'Légende', min: 1000, mult: 4, color: '#ff4d6d', icon: '👑', bot: [9, 10], drv: [89, 97] },
  ];
  const leagueOf = (lp) => [...LEAGUES].reverse().find((l) => lp >= l.min) || LEAGUES[0];
  const nextLeague = (lp) => LEAGUES.find((l) => l.min > lp) || null;
  // Points de ligue (LP) et PitCoins selon la position finale
  const LP_TABLE = [30, 22, 16, 12, 8, 5, 3, 1, 0, -2, -3, -4, -5, -6, -7, -8, -8, -9, -9, -10];
  const PC_TABLE = [40, 30, 24, 18, 14, 10, 8, 6, 4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  const DNF_LP = -8, DNF_PC = 1;

  /* ---------- Outils ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

  /* ---------- Marché : notes et prix calculés à partir des données réelles ---------- */
  function market(season) {
    const ents = season.entrants.length ? season.entrants : [...season.drivers.keys()];
    const drivers = season.drivers;
    // forme réelle : points par course disputée
    const starts = {};
    season.races.forEach((r) => (r.results || []).forEach((x) => { starts[x.driverId] = (starts[x.driverId] || 0) + 1; }));
    const ppr = (id) => (starts[id] ? (drivers.get(id).points || 0) / starts[id] : 0);
    const maxPpr = Math.max(1, ...ents.map(ppr));
    const done = season.doneCount;
    const out = ents.map((id) => {
      const d = drivers.get(id);
      const t = TALENT[id] || [78, 0, 0, 0];
      const form = 65 + 33 * Math.pow(ppr(id) / maxPpr, 0.7);
      const wForm = done >= 3 ? 0.3 : 0.1;
      const rating = Math.round(clamp(t[0] * (1 - wForm) + form * wForm, 60, 99));
      const h = hash(id);
      const off = (i) => (TALENT[id] ? t[i] : ((h >> (i * 4)) % 5) - 2);
      const rookie = ROOKIES.includes(id);
      const pace = clamp(rating + off(1), 50, 99), craft = clamp(rating + off(2), 50, 99), cons = clamp(rating + off(3) - (rookie ? 2 : 0), 50, 99);
      const price = Math.max(30, Math.round((30 + 170 * Math.pow(clamp((rating - 70) / 27, 0, 1.2), 1.5)) / 5) * 5);
      return { id, name: `${d.given} ${d.family}`, family: d.family, code: d.code, number: d.number, iso: d.iso, teamId: d.teamId, rating, pace, craft, cons, price, rookie };
    }).sort((a, b) => b.rating - a.rating || b.price - a.price);

    const teams = [...new Set(ents.map((id) => drivers.get(id).teamId))].map((tid) => {
      const t = season.teams.get(tid);
      const prior = (season.priors && season.priors[tid]) ?? F1.ref.TEAM_PRIOR[tid] ?? 4;
      const real = done ? (t.points || 0) / (2 * done) : prior;
      return { id: tid, raw: done >= 3 ? 0.65 * real + 0.35 * prior : prior };
    });
    const maxRaw = Math.max(...teams.map((t) => t.raw)), minRaw = Math.min(...teams.map((t) => t.raw));
    const chassis = teams.map((t) => {
      const st = (t.raw - minRaw) / Math.max(0.01, maxRaw - minRaw); // 0..1
      const base = 45 + 30 * st;
      const p = TEAM_PROFILE[t.id] || [0, 0, 0];
      const tt = season.teams.get(t.id);
      return {
        id: t.id, name: tt ? tt.short : t.id, strength: st,
        speed: Math.round(clamp(base + p[0], 30, 90)), df: Math.round(clamp(base + p[1], 30, 90)), rel: Math.round(clamp(base + 4 + p[2], 30, 95)),
        price: Math.round((60 + 190 * Math.pow(st, 1.3)) / 5) * 5,
      };
    }).sort((a, b) => b.price - a.price);
    return { drivers: out, chassis, byDriver: new Map(out.map((x) => [x.id, x])), byChassis: new Map(chassis.map((x) => [x.id, x])) };
  }

  /* ---------- Voiture du joueur ---------- */
  /* ---------- Recherche & Développement : pièces à développer une par une ----------
     cat : catégorie · br : branche (les pièces d'une branche se débloquent dans l'ordre)
     fx : gains (points de caractéristique) · focus : point visé par la caméra 3D (t) et décalage de la caméra (d) */
  const RD_CATS = [
    { id: 'aero', name: 'Aérodynamique', icon: '🌀', color: '#27b4f4' },
    { id: 'chassis', name: 'Châssis', icon: '🔩', color: '#2ee59d' },
    { id: 'pu', name: 'Chaîne motrice', icon: '⚡', color: '#ff4fa3' },
    { id: 'rel', name: 'Durabilité', icon: '🛡️', color: '#ffcc4d' },
  ];
  const P = (cat, br, id, name, desc, icon, fx, cost, t, d) => ({ cat, br, id, name, desc, icon, fx, cost, focus: { t, d } });
  const RD_PARTS = [
    // Aérodynamique — appui
    P('aero', 'Appui aérodynamique', 'fw_main', 'Aileron avant – plan principal', 'Nouveau profil du plan principal : plus d\'appui à l\'avant, moins de sous-virage.', 'wing', { df: 3 }, 30, [2.45, 0.1, 0.35], [1.7, 0.75, 1.6]),
    P('aero', 'Appui aérodynamique', 'fw_gurney', 'Volet Gurney de l\'aileron avant', 'Petite lèvre sur le bord de fuite du volet : appui supplémentaire pour un coût en traînée minime.', 'flap', { df: 3 }, 45, [2.3, 0.2, 0.5], [1.2, 0.55, 1.45]),
    P('aero', 'Appui aérodynamique', 'fw_end', 'Déflecteurs de l\'aileron avant', 'Dérives redessinées pour mieux contourner les roues avant (moins de turbulences).', 'endplate', { df: 3, speed: 1 }, 65, [2.4, 0.15, 0.82], [1.3, 0.45, 1.3]),
    P('aero', 'Appui aérodynamique', 'floor', 'Fond plat – canaux Venturi', 'Canaux sous la voiture : effet de sol, la monoplace est « aspirée » vers la piste.', 'floor', { df: 4 }, 95, [0.3, 0.05, 0.8], [0.5, 0.35, 2.3]),
    P('aero', 'Appui aérodynamique', 'diffuser', 'Diffuseur', 'Extraction de l\'air sous la voiture : appui à l\'arrière, stabilité en courbe rapide.', 'diffuser', { df: 4 }, 135, [-2.35, 0.18, 0.3], [-1.9, 0.35, 1.3]),
    // Aérodynamique — traînée
    P('aero', 'Réduction de la traînée', 'mirrors', 'Rétroviseurs latéraux', 'Rétroviseurs profilés : un peu moins de résistance à l\'air.', 'mirror', { speed: 2 }, 30, [0.75, 0.72, 0.4], [1.0, 0.45, 1.35]),
    P('aero', 'Réduction de la traînée', 'rims', 'Jantes', 'Flasques de jantes carénées : moins de turbulences autour des roues.', 'rim', { speed: 2 }, 45, [1.73, 0.36, 0.85], [0.7, 0.25, 1.6]),
    P('aero', 'Réduction de la traînée', 'sidepods', 'Pontons à undercut', 'Pontons creusés en partie basse : flux d\'air propre vers l\'arrière de la voiture.', 'sidepod', { speed: 3, df: 1 }, 70, [0.3, 0.42, 0.55], [1.1, 0.7, 2.1]),
    P('aero', 'Réduction de la traînée', 'rw', 'Aileron arrière basse traînée', 'Profil d\'aileron arrière moins incidenté : vitesse de pointe en hausse.', 'rwing', { speed: 4 }, 100, [-2.5, 0.85, 0], [-1.9, 0.85, 1.9]),
    P('aero', 'Réduction de la traînée', 'active', 'Aileron arrière actif (mode X)', 'Aérodynamique active 2026 : les volets s\'ouvrent en ligne droite et se referment au freinage.', 'flap', { speed: 4, df: 2 }, 150, [-2.6, 1.0, 0.2], [-1.2, 0.95, 1.4]),
    // Châssis — tenue de route
    P('chassis', 'Tenue de route', 'susp_f', 'Suspension avant', 'Triangles et biellettes revus : meilleur appui mécanique en virage lent.', 'susp', { df: 2 }, 35, [1.55, 0.4, 0.5], [1.2, 0.85, 1.55]),
    P('chassis', 'Tenue de route', 'susp_r', 'Suspension arrière', 'Géométrie arrière optimisée : motricité en sortie de virage.', 'susp', { df: 2 }, 55, [-1.55, 0.42, 0.5], [-1.2, 0.85, 1.6]),
    P('chassis', 'Tenue de route', 'brakes', 'Étriers et disques de frein', 'Freinage plus tardif et plus stable.', 'brake', { df: 2, rel: 1 }, 80, [1.73, 0.36, 0.72], [0.45, 0.2, 1.15]),
    P('chassis', 'Tenue de route', 'balance', 'Répartition des masses', 'Centre de gravité abaissé, équilibre avant/arrière affiné.', 'balance', { df: 3, speed: 1 }, 115, [0, 0.3, 0], [0.2, 2.7, 3.3]),
    // Châssis — poids
    P('chassis', 'Poids', 'mono', 'Monocoque allégée', 'Nouveau laminage carbone : quelques kilos en moins.', 'mono', { speed: 2 }, 50, [0.9, 0.5, 0], [1.5, 1.3, 2.1]),
    P('chassis', 'Poids', 'halo', 'Halo et cockpit allégés', 'Halo en titane affiné et sièges plus légers.', 'halo', { speed: 2 }, 75, [0.55, 0.85, 0], [0.9, 0.8, 1.6]),
    P('chassis', 'Poids', 'ballast', 'Lest optimisé', 'La voiture passe sous le poids minimum : le lest est placé là où il aide le plus.', 'balance', { speed: 2, df: 1 }, 110, [-0.2, 0.15, 0], [0.3, 1.6, 2.6]),
    // Chaîne motrice — thermique
    P('pu', 'Moteur thermique', 'ice', 'Moteur V6 turbo (combustion)', 'Chambre de combustion revue pour le carburant 100 % durable de 2026.', 'engine', { speed: 3 }, 40, [-0.6, 0.55, 0], [0.2, 1.5, 2.3]),
    P('pu', 'Moteur thermique', 'turbo', 'Turbocompresseur', 'Turbo plus réactif : meilleures relances.', 'turbo', { speed: 3 }, 60, [-0.95, 0.6, 0.2], [-0.6, 0.95, 1.8]),
    P('pu', 'Moteur thermique', 'airbox', 'Prise d\'air', 'Admission d\'air redessinée au-dessus du pilote.', 'airbox', { speed: 2 }, 85, [0.05, 1.0, 0], [0.9, 0.65, 1.5]),
    P('pu', 'Moteur thermique', 'exhaust', 'Échappement', 'Contre-pression réduite.', 'exhaust', { speed: 3 }, 120, [-2.05, 0.5, 0], [-1.5, 0.75, 1.1]),
    // Chaîne motrice — électrique
    P('pu', 'Énergie électrique', 'mguk', 'MGU-K 350 kW', 'Le moteur électrique 2026 fournit près de la moitié de la puissance.', 'motor', { speed: 3 }, 50, [0.15, 0.35, 0], [0.7, 1.0, 2.1]),
    P('pu', 'Énergie électrique', 'battery', 'Batterie', 'Plus d\'énergie stockée et récupérée au freinage.', 'battery', { speed: 2 }, 80, [0.45, 0.3, 0], [0.9, 1.1, 2.0]),
    P('pu', 'Énergie électrique', 'maps', 'Cartographie de déploiement', 'Logiciel qui répartit l\'énergie électrique sur le tour : plus de vitesse en bout de ligne droite.', 'chip', { speed: 3 }, 130, [0.3, 0.6, 0], [0.9, 1.4, 1.9]),
    P('pu', 'Énergie électrique', 'gearbox_p', 'Boîte de vitesses rapide', 'Passages de rapports plus rapides.', 'gearbox', { speed: 2 }, 160, [-1.7, 0.35, 0], [-1.4, 0.6, 1.75]),
    // Durabilité — refroidissement
    P('rel', 'Refroidissement', 'radiators', 'Radiateurs', 'Radiateurs plus efficaces dans les pontons.', 'radiator', { rel: 4 }, 35, [0.65, 0.5, 0.5], [1.35, 0.5, 1.4]),
    P('rel', 'Refroidissement', 'cooling', 'Ouïes de refroidissement', 'Évacuation de la chaleur sur le capot moteur.', 'louvre', { rel: 3 }, 55, [-0.8, 0.7, 0.3], [-0.5, 1.0, 1.7]),
    P('rel', 'Refroidissement', 'hydraulics', 'Hydraulique', 'Circuit hydraulique (direction, boîte) mieux protégé.', 'hydraulic', { rel: 4 }, 85, [-1.0, 0.4, 0.3], [-0.8, 0.8, 1.8]),
    // Durabilité — usure
    P('rel', 'Usure', 'electronics', 'Électronique de contrôle', 'Faisceaux et boîtiers protégés des vibrations.', 'chip', { rel: 3 }, 40, [0.3, 0.55, 0], [0.8, 1.2, 1.8]),
    P('rel', 'Usure', 'gearbox_rel', 'Fiabilité de la boîte', 'Pignons renforcés.', 'gearbox', { rel: 4 }, 70, [-1.7, 0.35, 0], [-1.4, 0.6, 1.75]),
    P('rel', 'Usure', 'engine_life', 'Longévité moteur', 'Pièces internes plus résistantes : moins de casses.', 'engine', { rel: 4 }, 110, [-0.6, 0.55, 0], [0.2, 1.5, 2.3]),
    P('rel', 'Usure', 'brake_life', 'Endurance des freins', 'Disques à l\'usure mieux maîtrisée.', 'brake', { rel: 3 }, 150, [1.73, 0.36, 0.72], [0.45, 0.2, 1.15]),
  ];
  const RD_BY_ID = new Map(RD_PARTS.map((p) => [p.id, p]));
  const rdBranches = (cat) => [...new Set(RD_PARTS.filter((p) => p.cat === cat).map((p) => p.br))];
  // État d'une pièce : 'done' | 'available' | 'locked' | 'unknown' (au-delà de la prochaine pièce verrouillée)
  function partState(p, owned = {}) {
    if (owned[p.id]) return 'done';
    const list = RD_PARTS.filter((x) => x.br === p.br && x.cat === p.cat);
    const i = list.indexOf(p);
    if (i === 0 || owned[list[i - 1].id]) return 'available';
    return owned[list[Math.max(0, i - 2)].id] || i === 1 ? 'locked' : 'unknown';
  }
  function partsBonus(owned = {}) {
    const b = { speed: 0, df: 0, rel: 0 };
    for (const id of Object.keys(owned)) { const p = RD_BY_ID.get(id); if (p) for (const k in p.fx) b[k] += p.fx[k]; }
    return b;
  }
  function carStats(chassis, ups = {}, parts = null) {
    const b = partsBonus(parts || {});
    return { speed: chassis.speed + UP_STEP * (ups.speed || 0) + b.speed, df: chassis.df + UP_STEP * (ups.df || 0) + b.df, rel: Math.min(99, chassis.rel + UP_STEP * (ups.rel || 0) + b.rel) };
  }
  // Réglage du week-end : -1 (faible appui, vitesse) à +1 (fort appui)
  function withSetup(car, setup) {
    const s = clamp(setup || 0, -1, 1);
    return { speed: car.speed * (1 - 0.12 * s), df: car.df * (1 + 0.12 * s), rel: car.rel };
  }
  const carScore = (car, w) => car.speed * w.speed + car.df * w.df + car.rel * w.rel;
  // Réglage idéal pour un circuit (pour l'indicateur de compatibilité)
  function bestSetup(car, w) {
    let best = 0, bv = -1;
    for (let s = -1; s <= 1.0001; s += 0.05) { const v = carScore(withSetup(car, s), w); if (v > bv) { bv = v; best = s; } }
    return Math.round(best * 20) / 20;
  }
  // Compatibilité voiture/circuit en % (100 = voiture parfaite partout)
  const compat = (car, w, setup) => Math.round(carScore(withSetup(car, setup), w));

  /* ---------- Plateau IA (fixe pour la journée et la ligue) ---------- */
  const BOT_NAMES = ['Apex Racing', 'Scuderia Lumière', 'Vortex GP', 'Nordic Speed', 'Team Kerb', 'Blue Comet', 'Atlas Motorsport', 'Riviera F1', 'Phoenix Racing', 'Iron Horse GP',
    'Sakura Speed', 'Andes Racing', 'Celtic Motorsport', 'Orbit Team', 'Velocity Works', 'Gaucho Racing', 'Alpine Wolf', 'Tidewater GP', 'Crimson Arrow', 'Zenith Racing', 'Boreal F1', 'Midnight Motorsport'];
  function botField(mk, league, dayKey) {
    const r = rng(hash(`bots-${league.id}-${dayKey}`));
    const names = [...BOT_NAMES].sort(() => r() - 0.5).slice(0, FIELD - 1);
    const pool = mk.drivers.filter((d) => d.rating >= league.drv[0] - 2 && d.rating <= league.drv[1] + 2);
    const drvPool = pool.length >= 6 ? pool : mk.drivers;
    return names.map((name) => {
      const d = drvPool[Math.floor(r() * drvPool.length)];
      // plus la ligue est haute, plus les managers IA roulent sur de bons châssis
      const li = LEAGUES.indexOf(league);
      const n = mk.chassis.length; // châssis triés du plus cher au moins cher
      const ranges = [[n - 6, n], [n - 9, n], [0, n], [0, 8], [0, 6], [0, 4]];
      const [a, b] = ranges[li].map((x) => Math.max(0, Math.min(n, x)));
      const c = mk.chassis[a + Math.floor(r() * Math.max(1, b - a))];
      const lv = () => Math.round(league.bot[0] + r() * (league.bot[1] - league.bot[0]));
      const ups = { speed: lv(), df: lv(), rel: lv() };
      return { bot: true, name, driver: d, chassisId: c.id, car: carStats(c, ups), setup: Math.round((r() * 1.6 - 0.8) * 10) / 10 };
    });
  }

  /* ---------- Moteur de course ----------
     performance = (niveau pilote) + (stats voiture + améliorations) × (compatibilité circuit) + aléa/incidents */
  function simulate({ player, bots, race, seed }) {
    const w = circuitProfile(race);
    const r = rng(seed);
    const field = [{ ...player, me: true }, ...bots].map((c, i) => {
      const car = withSetup(c.car, c.setup);
      const cs = carScore(car, w);
      const d = c.driver;
      const form = gauss(r) * 3.5; // forme du jour (pilote + voiture)
      return { i, c, name: c.name, driver: d, cs, perf: 0.42 * ((d.pace + d.craft) / 2) + 0.58 * cs + form, q: 0.5 * d.pace + 0.5 * cs + form + gauss(r) * 2.5, time: 0, out: null, lapsDone: 0, spins: 0 };
    });
    // qualifications
    field.sort((a, b) => b.q - a.q).forEach((x, k) => { x.grid = k + 1; });
    const gridGap = 0.35 + 0.6 * w.df;
    field.forEach((x) => { x.time = (x.grid - 1) * gridGap; });
    const scLap = r() < 0.3 ? 4 + Math.floor(r() * (LAPS - 8)) : -1;
    const events = [];
    const laps = [];
    let fastest = { t: 1e9, who: null, lap: 0 };
    let prevOrder = field.map((x) => x.i);
    for (let lap = 1; lap <= LAPS; lap++) {
      for (const x of field) {
        if (x.out) continue;
        const d = x.driver;
        // abandons : fiabilité de la voiture et régularité du pilote
        const pMech = (0.1 * Math.pow(1 - x.c.car.rel / 100, 1.5) * (0.6 + w.rel * 2)) / LAPS;
        const pCrash = (0.035 * (1 - d.cons / 100) * (0.5 + d.craft / 100)) / LAPS;
        const u = r();
        if (u < pMech) { x.out = { lap, why: ['Moteur', 'Boîte de vitesses', 'Hydraulique', 'Surchauffe', 'Freins'][Math.floor(r() * 5)] }; events.push({ lap, type: 'dnf', who: x.i, txt: `abandonne (${x.out.why.toLowerCase()})` }); continue; }
        if (u < pMech + pCrash) { x.out = { lap, why: 'Accident' }; events.push({ lap, type: 'dnf', who: x.i, txt: 'part dans le mur : abandon' }); continue; }
        let t = 90 - x.perf * 0.045 + gauss(r) * 0.6 * (1.5 - d.cons / 100);
        if (r() < 0.035 * (1 - d.cons / 100) * 3) { t += 4 + r() * 4; x.spins++; events.push({ lap, type: 'spin', who: x.i, txt: 'part en tête-à-queue et perd du temps' }); }
        x.time += t; x.lapsDone = lap;
        if (t < fastest.t) fastest = { t, who: x.i, lap };
      }
      if (lap === scLap) {
        // voiture de sécurité : le peloton se regroupe
        const running = field.filter((x) => !x.out).sort((a, b) => a.time - b.time);
        const lead = running[0].time;
        running.forEach((x, k) => { x.time = lead + k * 0.6; });
        events.push({ lap, type: 'sc', txt: 'Voiture de sécurité : le peloton est regroupé !' });
      }
      const order = field.filter((x) => !x.out).sort((a, b) => a.time - b.time).concat(field.filter((x) => x.out).sort((a, b) => b.out.lap - a.out.lap));
      // dépassements impliquant le joueur
      const me = field.find((x) => x.c.me);
      const pBefore = prevOrder.indexOf(me.i), pNow = order.findIndex((x) => x.c.me);
      if (!me.out && lap > 1 && pNow < pBefore) events.push({ lap, type: 'gain', who: me.i, txt: `gagne ${pBefore - pNow} place${pBefore - pNow > 1 ? 's' : ''} → P${pNow + 1}` });
      if (!me.out && lap > 1 && pNow > pBefore) events.push({ lap, type: 'loss', who: me.i, txt: `recule en P${pNow + 1}` });
      prevOrder = order.map((x) => x.i);
      const leadT = order[0].time;
      laps.push(order.map((x) => ({ i: x.i, gap: x.out ? null : x.time - leadT, out: !!x.out })));
    }
    const final = laps[laps.length - 1].map((x, k) => ({ ...x, pos: k + 1 }));
    return { field, laps, final, events: events.sort((a, b) => a.lap - b.lap), fastest, scLap, w };
  }

  // Récompenses selon la position et la ligue
  function rewards(pos, dnf, league) {
    const lp = dnf ? DNF_LP : LP_TABLE[pos - 1] ?? -10;
    const pc = Math.round((dnf ? DNF_PC : PC_TABLE[pos - 1] ?? 2) * league.mult);
    return { lp, pc };
  }
  // Récompense en PitCoins d'un pari gagné
  function betReward(bet) {
    const gain = (bet.payout || 0) - bet.stake;
    if (bet.status !== 'won' || gain <= 0) return 0;
    return clamp(Math.round(4 + gain / 10 + ((bet.effOdds || bet.odds) >= 5 ? 10 : 0)), 5, 80);
  }

  F1.manager = {
    START_PC, RACES_PER_DAY, FIELD, LAPS, STATS, UP_STEP, UP_MAX, upCost, LEAGUES, leagueOf, nextLeague, LP_TABLE, PC_TABLE,
    RD_CATS, RD_PARTS, RD_BY_ID, rdBranches, partState, partsBonus,
    market, carStats, withSetup, carScore, bestSetup, compat, circuitProfile, botField, simulate, rewards, betReward, hash, TALENT,
  };
})(globalThis.F1 = globalThis.F1 || {});
