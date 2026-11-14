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
    { id: 'strat', name: 'Stratégie & équipe', icon: '🧠', color: '#a259ff' },
  ];
  const P = (cat, br, id, name, desc, icon, fx, cost, t, d) => ({ cat, br, id, name, desc, icon, fx, cost, focus: { t, d } });
  const Q = (cat, br, id, name, desc, icon, fx, cost) => P(cat, br, id, name, desc, icon, fx, cost, [0, 0.4, 0], [1, 1, 2]);
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
    // Aérodynamique — efficacité des flux
    Q('aero', 'Efficacité des flux', 'nose', 'Nez et museau', 'Nez plus fin et plus court : le flux d\'air arrive propre sous la voiture.', 'mono', { df: 2, speed: 1 }, 40),
    Q('aero', 'Efficacité des flux', 'floor_edge', 'Bords de fond plat', 'Découpes et ailettes sur les bords du plancher : elles scellent l\'effet de sol.', 'floor', { df: 3 }, 60),
    Q('aero', 'Efficacité des flux', 'brake_ducts', 'Écopes de frein', 'Écopes sculptées : elles refroidissent les freins et détournent le sillage des roues.', 'brake', { df: 2, rel: 1 }, 85),
    Q('aero', 'Efficacité des flux', 'engine_cover', 'Capot moteur resserré', 'Carrosserie « taille de guêpe » à l\'arrière : moins de traînée, plus d\'air vers le diffuseur.', 'sidepod', { speed: 3, df: 1 }, 115),
    Q('aero', 'Efficacité des flux', 'beam_wing', 'Aileron inférieur (beam wing)', 'Petit aileron bas qui fait travailler ensemble le diffuseur et l\'aileron arrière.', 'rwing', { df: 4 }, 155),
    // Châssis — liaisons au sol
    Q('chassis', 'Liaisons au sol', 'dampers', 'Amortisseurs et ressort central', 'Amortisseurs inboard et troisième élément : la voiture reste stable à haute vitesse.', 'susp', { df: 2 }, 40),
    Q('chassis', 'Liaisons au sol', 'arb', 'Barres anti-roulis', 'Barres plus fines et réglables : moins de roulis en virage.', 'susp', { df: 2 }, 60),
    Q('chassis', 'Liaisons au sol', 'steering', 'Crémaillère de direction', 'Direction assistée plus précise, moins de frottements.', 'balance', { df: 2, rel: 1 }, 85),
    Q('chassis', 'Liaisons au sol', 'hubs', 'Moyeux et roulements', 'Roulements céramique à faible friction.', 'rim', { speed: 2, rel: 1 }, 115),
    Q('chassis', 'Liaisons au sol', 'diff', 'Différentiel', 'Différentiel à glissement piloté : motricité en sortie de virage lent.', 'gearbox', { df: 3 }, 150),
    // Chaîne motrice — admission & suralimentation
    Q('pu', 'Admission & suralimentation', 'plenum', 'Plenum d\'admission carbone', 'Boîte à air en carbone et trompettes d\'admission : chaque cylindre respire mieux.', 'airbox', { speed: 2 }, 45),
    Q('pu', 'Admission & suralimentation', 'intercooler', 'Échangeur air-air', 'L\'air comprimé par le turbo est refroidi avant d\'entrer dans le moteur : il est plus dense.', 'radiator', { speed: 2, rel: 1 }, 65),
    Q('pu', 'Admission & suralimentation', 'injection', 'Injection directe 500 bar', 'Injecteurs haute pression pour le carburant durable.', 'engine', { speed: 3 }, 90),
    Q('pu', 'Admission & suralimentation', 'manifolds', 'Collecteurs d\'échappement', 'Collecteurs en Inconel de longueur égale : les gaz arrivent en rythme sur la turbine.', 'exhaust', { speed: 3 }, 120),
    Q('pu', 'Admission & suralimentation', 'wastegate', 'Soupape de décharge', 'Pilotage fin de la pression de suralimentation.', 'turbo', { speed: 2, rel: 2 }, 155),
    // Chaîne motrice — transmission
    Q('pu', 'Transmission', 'clutch', 'Embrayage carbone', 'Embrayage multidisque de moins de 10 cm de diamètre.', 'rim', { speed: 1, rel: 2 }, 45),
    Q('pu', 'Transmission', 'ratios', 'Étagement des 8 rapports', 'Rapports choisis pour garder le moteur dans sa meilleure plage.', 'gearbox', { speed: 3 }, 70),
    Q('pu', 'Transmission', 'driveshafts', 'Arbres de transmission', 'Arbres et joints tripodes allégés.', 'susp', { speed: 2, rel: 1 }, 100),
    Q('pu', 'Transmission', 'oil', 'Lubrification à carter sec', 'Pompes de vidange et réservoir d\'huile optimisés : moins de pertes par barbotage.', 'hydraulic', { speed: 2, rel: 2 }, 135),
    // Chaîne motrice — récupération d'énergie
    Q('pu', 'Récupération d\'énergie', 'regen', 'Récupération au freinage', 'Le MGU-K recharge la batterie plus fort à chaque freinage.', 'motor', { speed: 3 }, 55),
    Q('pu', 'Récupération d\'énergie', 'inverter', 'Onduleur et électronique de puissance', 'Conversion du courant avec moins de pertes thermiques.', 'chip', { speed: 2, rel: 1 }, 90),
    Q('pu', 'Récupération d\'énergie', 'hv', 'Câblage haute tension', 'Câbles orange 800 V plus courts et mieux refroidis.', 'battery', { speed: 2, rel: 2 }, 130),
    // Durabilité — fluides & sécurité
    Q('rel', 'Fluides & sécurité', 'oiltank', 'Réservoir d\'huile', 'Réservoir cloisonné : la pompe ne désamorce plus dans les longs virages.', 'hydraulic', { rel: 3 }, 40),
    Q('rel', 'Fluides & sécurité', 'fuel', 'Réservoir et pompes à carburant', 'Cellule souple et pompes de gavage doublées.', 'battery', { rel: 3 }, 60),
    Q('rel', 'Fluides & sécurité', 'wiring', 'Faisceau électrique', 'Connecteurs aéronautiques verrouillés.', 'chip', { rel: 3 }, 85),
    Q('rel', 'Fluides & sécurité', 'sensors', 'Capteurs et télémétrie embarquée', 'Plus de 300 capteurs : une panne se voit venir avant la casse.', 'radio', { rel: 4 }, 115),
    Q('rel', 'Fluides & sécurité', 'heatshield', 'Écrans thermiques', 'Feuilles d\'or et céramique autour de l\'échappement.', 'louvre', { rel: 4 }, 150),
    // Stratégie & équipe — ces pièces agissent directement sur le déroulement de la course
    P('strat', 'Départ & course', 'launch', 'Embrayage de départ', 'Logiciel d\'embrayage et cartographie anti-patinage : un meilleur envol quand les feux s\'éteignent.', 'gearbox', { launch: 1 }, 45, [-1.7, 0.35, 0], [-1.4, 0.6, 1.75]),
    P('strat', 'Départ & course', 'tyres', 'Gestion des pneus', 'Capteurs de température et carrossage optimisé : les pneus s\'usent moins, moins de tête-à-queue en fin de course.', 'rim', { tyre: 1 }, 70, [-1.95, 0.36, 0.8], [-0.6, 0.3, 1.6]),
    P('strat', 'Départ & course', 'push', 'Mode dépassement', 'Une réserve d\'énergie électrique libérée dans les 5 derniers tours.', 'motor', { push: 1 }, 110, [0.45, 0.3, 0], [0.9, 1.1, 2.0]),
    P('strat', 'Équipe & stand', 'pitcrew', 'Équipe de stand', 'Pistolets pneumatiques, crics rapides et entraînement : des arrêts plus courts et moins d\'arrêts ratés.', 'pit', { pit: 1 }, 40, [1.73, 0.36, 0.85], [0.7, 0.25, 1.6]),
    P('strat', 'Équipe & stand', 'radio', 'Ingénieur de course', 'Lecture de course en direct : il vous fait rentrer au bon moment sous voiture de sécurité.', 'radio', { sc: 1 }, 75, [0.3, 0.85, 0], [0.9, 0.8, 1.6]),
    P('strat', 'Équipe & stand', 'simu', 'Simulateur pilote', 'Séances au simulateur avant chaque course : votre pilote gagne en rythme, en combativité et en régularité.', 'sim', { drv: 1 }, 120, [0.9, 0.5, 0], [1.5, 1.3, 2.1]),
  ];
  /* Niveaux de développement : chaque pièce passe de Mk I à Mk V (gains décroissants, coûts croissants) */
  const MAX_LV = 5;
  const LV_GAIN = [1, 0.5, 0.35, 0.25, 0.2];
  const LV_NAME = ['—', 'Mk I', 'Mk II', 'Mk III', 'Mk IV', 'Mk V'];
  const lvCum = (l) => LV_GAIN.slice(0, l).reduce((a, b) => a + b, 0);
  const partLevel = (owned, id) => { const v = owned && owned[id]; return !v ? 0 : v > MAX_LV ? 1 : v; };
  const levelCost = (p, l) => Math.round((p.cost * Math.pow(1.55, l - 1)) / 5) * 5; // coût pour atteindre le niveau l
  const STAT_KEYS = ['speed', 'df', 'rel'];
  // avec 65 pièces, chaque pièce pèse un peu moins qu'à l'origine
  const PART_K = 0.55;
  RD_PARTS.forEach((p) => STAT_KEYS.forEach((k) => { if (p.fx[k]) p.fx[k] = Math.round(p.fx[k] * PART_K * 10) / 10; }));
  const MECH = {
    launch: { label: 'Départ', icon: '🚦' }, tyre: { label: 'Pneus', icon: '🛞' }, push: { label: 'Dépassement', icon: '🔋' },
    pit: { label: 'Arrêts au stand', icon: '🔧' }, sc: { label: 'Stratégie SC', icon: '📻' }, drv: { label: 'Pilote', icon: '🎮' },
  };
  // Soufflerie : développement à moitié prix mais incertain (les échecs donnent des données pour la tentative suivante)
  const tunnelChance = (fails = 0) => Math.min(0.85, 0.55 + 0.12 * fails);
  // Package : bonus quand toutes les pièces d'une branche atteignent un niveau minimal
  const PKG = [0, 2, 1.5, 2, 2.5, 4];
  function branchPackage(cat, br, owned = {}) {
    const list = RD_PARTS.filter((x) => x.cat === cat && x.br === br);
    const minL = Math.min(...list.map((x) => partLevel(owned, x.id)));
    const tot = {}; list.forEach((x) => { for (const k in x.fx) tot[k] = (tot[k] || 0) + x.fx[k]; });
    const key = Object.keys(tot).sort((a, b) => tot[b] - tot[a])[0];
    const isStat = STAT_KEYS.includes(key);
    const bonus = PKG.slice(0, minL + 1).reduce((a, b) => a + b, 0) * (isStat ? 0.6 : 0.06);
    const next = minL < MAX_LV ? PKG[minL + 1] * (isStat ? 0.6 : 0.06) : 0;
    return { minL, key, bonus, next, isStat };
  }
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
    const b = { speed: 0, df: 0, rel: 0 }, mech = { launch: 0, tyre: 0, push: 0, pit: 0, sc: 0, drv: 0 };
    for (const p of RD_PARTS) {
      const l = partLevel(owned, p.id); if (!l) continue;
      const f = lvCum(l);
      for (const k in p.fx) (k in b ? b : mech)[k] += p.fx[k] * f;
    }
    RD_CATS.forEach((c) => rdBranches(c.id).forEach((br) => { const pk = branchPackage(c.id, br, owned); if (pk.bonus) (pk.key in b ? b : mech)[pk.key] += pk.bonus; }));
    b.mech = mech;
    return b;
  }
  /* ---------- Personnel du muret des stands (noms fictifs) ---------- */
  const STAFF_ROLES = [
    { id: 'tp', name: 'Team principal', icon: '👔', desc: 'Dirige l\'écurie, négocie avec les sponsors : plus de PitCoins à chaque course.', fx: { pc: 0.06 } },
    { id: 'td', name: 'Directeur technique', icon: '📐', desc: 'Pilote le bureau d\'études : la R&D coûte moins cher et la soufflerie réussit plus souvent.', fx: { rd: 0.04, tunnel: 0.02 } },
    { id: 're', name: 'Ingénieur de course', icon: '🎧', desc: 'La voix dans le casque du pilote : gestion des pneus et rythme de course.', fx: { tyre: 0.3, drv: 0.12 } },
    { id: 'st', name: 'Stratège', icon: '♟️', desc: 'Décide des arrêts : voiture de sécurité et changements de météo.', fx: { sc: 0.35, wx: 0.5 } },
    { id: 'cm', name: 'Chef mécanicien', icon: '🔧', desc: 'Dirige les arrêts au stand et la préparation de la voiture.', fx: { pit: 0.3, rel: 0.8 } },
  ];
  const STAFF_PRICE = [0, 60, 150, 320, 600];
  const STAFF_NAMES = {
    tp: [['Léo Marchetti', 'Ancien chef de projet, sa première saison à ce poste.', 'it'], ['Hélène Vasseur', 'Gestionnaire rigoureuse venue de l\'endurance.', 'fr'], ['Tobias Lindqvist', 'Ex-pilote reconverti, respecté dans le paddock.', 'se'], ['Amara Okonkwo', 'Négociatrice redoutable, les sponsors l\'adorent.', 'gb'], ['Viktor Albrecht', 'Vingt ans de titres : une légende du muret.', 'at']],
    td: [['Paul Renaudin', 'Jeune aérodynamicien prometteur.', 'fr'], ['Kenji Morimoto', 'Spécialiste des suspensions.', 'jp'], ['Sofia Bellandi', 'A conçu trois voitures victorieuses.', 'it'], ['Ewan MacAllister', 'Maître de l\'effet de sol.', 'gb'], ['Adrián Navarro', 'Génie de l\'aéro, ses concepts sont copiés partout.', 'es']],
    re: [['Mathis Leroy', 'Sort tout juste de la filière jeunes.', 'fr'], ['Giulia Ferrante', 'Calme en toutes circonstances.', 'it'], ['Daniel Hoffmann', 'Excellent sur la gestion des pneus.', 'de'], ['Priya Raman', 'Lit la télémétrie comme un roman.', 'in'], ['Jack Whitmore', 'A accompagné deux champions du monde.', 'gb']],
    st: [['Noé Gautier', 'Applique le plan, improvise peu.', 'fr'], ['Lars Pedersen', 'Bon lecteur des fenêtres d\'arrêt.', 'dk'], ['Camila Duarte', 'Audacieuse sous voiture de sécurité.', 'br'], ['Hannah Schreiber', 'Ses modèles météo se trompent rarement.', 'de'], ['Rui Tanaka', 'Voit la course trois tours avant tout le monde.', 'jp']],
    cm: [['Tom Vidal', 'Motivé, encore un peu vert.', 'fr'], ['Marco Esposito', 'Vingt ans de garage derrière lui.', 'it'], ['Jonas Keller', 'Organise les arrêts comme un ballet.', 'ch'], ['Aisha Farouk', 'Zéro arrêt raté la saison passée.', 'ae'], ['Bram de Vries', 'Détenteur du record de l\'arrêt le plus rapide.', 'nl']],
  };
  const STAFF = {};
  STAFF_ROLES.forEach((r) => { STAFF[r.id] = STAFF_NAMES[r.id].map(([name, bio, iso], k) => ({ id: `${r.id}${k + 1}`, role: r.id, tier: k + 1, name, bio, iso, rating: 62 + k * 8, price: STAFF_PRICE[k] })); });
  const staffOf = (m, role) => { const id = m && m.staff && m.staff[role]; return (id && STAFF[role].find((x) => x.id === id)) || null; };

  /* ---------- Garage : équipements améliorables (niveau 0 à 5) ---------- */
  const G = (id, zone, name, desc, icon, fx, cost) => ({ id, zone, name, desc, icon, fx, cost });
  const GARAGE_ZONES = [{ id: 'pit', name: 'Voie des stands', icon: '🛞' }, { id: 'bay', name: 'Box & mécaniciens', icon: '🧰' }, { id: 'eng', name: 'Ingénierie', icon: '📡' }, { id: 'fac', name: 'Usine', icon: '🏭' }];
  const GARAGE = [
    G('guns', 'pit', 'Pistolets pneumatiques', 'Pistolets à azote : l\'écrou saute en un dixième de seconde.', '🔫', { pit: 0.2 }, 30),
    G('jacks', 'pit', 'Crics rapides', 'Crics avant et arrière à relâchement automatique.', '🛗', { pit: 0.15 }, 25),
    G('gantry', 'pit', 'Portique et feux de stand', 'Le feu passe au vert dès que les quatre roues sont serrées.', '🚥', { pit: 0.12 }, 35),
    G('blankets', 'pit', 'Couvertures chauffantes', 'Pneus à température dès la sortie du stand.', '🔥', { launch: 0.15, tyre: 0.08 }, 30),
    G('startsim', 'pit', 'Banc de départ', 'Le pilote répète ses envols : point de patinage maîtrisé.', '🚦', { launch: 0.2 }, 40),
    G('crew', 'bay', 'Mécaniciens', 'Recrutement et entraînement de l\'équipe : chaque niveau ajoute des mécanos au garage.', '👨‍🔧', { pit: 0.18, rel: 0.5 }, 45),
    G('tyrerack', 'bay', 'Station pneus', 'Pressions, températures et carrossage contrôlés train par train.', '🛞', { tyre: 0.18 }, 35),
    G('spares', 'bay', 'Stock de pièces de rechange', 'Chaque pièce à durée de vie limitée est changée à temps.', '📦', { rel: 1.4 }, 40),
    G('fuelrig', 'bay', 'Rampe carburant et lubrifiants', 'Carburant et huiles analysés avant chaque course.', '⛽', { speed: 0.5, rel: 0.5 }, 40),
    G('rig', 'bay', 'Banc à 7 vérins', 'Les suspensions sont réglées sur un banc qui reproduit le circuit.', '🪛', { df: 0.6, tyre: 0.06 }, 50),
    G('pitwall', 'eng', 'Muret des stands', 'Écrans, intercom et chronométrage : la stratégie réagit plus vite.', '🖥️', { sc: 0.15, wx: 0.12 }, 45),
    G('radar', 'eng', 'Station météo et radar', 'Vous voyez la pluie arriver : un tour de prévision par niveau pendant la course.', '🌧️', { wx: 0.22 }, 40),
    G('telemetry', 'eng', 'Baie de télémétrie', 'Analyse en direct des données de la voiture.', '📈', { drv: 0.08, sc: 0.08 }, 45),
    G('simulator', 'eng', 'Simulateur pilote', 'Le pilote connaît chaque virage avant d\'arriver.', '🎮', { drv: 0.15 }, 60),
    G('dyno', 'fac', 'Banc d\'essai moteur', 'Le groupe propulseur tourne des heures avant d\'être monté.', '⚙️', { rel: 1.1, speed: 0.6 }, 55),
    G('composite', 'fac', 'Atelier composite', 'Autoclave et drapage carbone : pièces plus légères et plus précises.', '🧵', { df: 0.8, rd: 0.01 }, 55),
    G('cfd', 'fac', 'Cluster de calcul CFD', 'Simulation numérique des écoulements : la R&D coûte moins cher.', '💻', { rd: 0.025 }, 60),
    G('tunnel', 'fac', 'Soufflerie', 'Maquette à 60 % : les paris soufflerie réussissent plus souvent.', '🌬️', { tunnel: 0.03 }, 60),
    G('hospitality', 'fac', 'Motorhome et hospitalité', 'Les sponsors sont bien reçus : plus de PitCoins à chaque course.', '🥂', { pc: 0.04 }, 50),
    G('trucks', 'fac', 'Camions-ateliers', 'Logistique renforcée : une course de plus par jour aux niveaux 3 et 5.', '🚛', { races: 1 }, 70),
  ];
  const GARAGE_BY_ID = new Map(GARAGE.map((g) => [g.id, g]));
  const garageCost = (g, l) => Math.round((g.cost * Math.pow(1.6, l - 1)) / 5) * 5;
  const garageLevel = (m, id) => Math.min(MAX_LV, (m && m.garage && m.garage[id]) || 0);
  // Bonus cumulés du personnel et du garage
  function teamBonus(m) {
    const b = { speed: 0, df: 0, rel: 0, launch: 0, tyre: 0, push: 0, pit: 0, sc: 0, drv: 0, wx: 0, pc: 0, rd: 0, tunnel: 0, races: 0 };
    if (!m) return b;
    STAFF_ROLES.forEach((r) => { const x = staffOf(m, r.id); if (x) for (const k in r.fx) b[k] += r.fx[k] * x.tier; });
    GARAGE.forEach((g) => { const l = garageLevel(m, g.id); if (!l) return; for (const k in g.fx) b[k] += k === 'races' ? (l >= 5 ? 2 : l >= 3 ? 1 : 0) : g.fx[k] * l; });
    b.rd = Math.min(0.4, b.rd);
    return b;
  }
  function carStats(chassis, ups = {}, parts = null, team = null) {
    const b = partsBonus(parts || {});
    const t = team || {};
    const mech = { ...b.mech, wx: 0 };
    for (const k in mech) mech[k] += t[k] || 0;
    return { speed: chassis.speed + UP_STEP * (ups.speed || 0) + b.speed + (t.speed || 0), df: chassis.df + UP_STEP * (ups.df || 0) + b.df + (t.df || 0), rel: Math.min(99, chassis.rel + UP_STEP * (ups.rel || 0) + b.rel + (t.rel || 0)), mech };
  }
  // Note globale de la monoplace (pour l'affichage)
  const carRating = (car) => Math.round(car.speed * 0.38 + car.df * 0.38 + car.rel * 0.24 + (car.mech ? Object.values(car.mech).reduce((a, v) => a + v, 0) * 2.5 : 0));
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
  const BOT_EXTRA = [0, 6, 20, 38, 58, 80]; // développement moyen des managers IA selon la ligue
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
      const car = carStats(c, ups), ex = BOT_EXTRA[li];
      car.speed += ex; car.df += ex; car.rel = Math.min(97, car.rel + ex * 0.5);
      const bm = li * 0.3;
      car.mech = { launch: bm * r() * 1.4, tyre: bm, push: bm * r() * 1.4, pit: bm, sc: bm * r(), drv: 0, wx: 0.4 + li * 0.35 + r() * 0.8 };
      return { bot: true, name, driver: d, chassisId: c.id, car, setup: Math.round((r() * 1.6 - 0.8) * 10) / 10 };
    });
  }

  /* ---------- Moteur de course ----------
     performance = (niveau pilote) + (stats voiture + améliorations) × (compatibilité circuit) + aléa/incidents */
  // Météo d'une course : pluie (0..1) et humidité de la piste (0..1) tour par tour
  function weatherTimeline(r, rainProb = 0.25, temp = 24) {
    const rain = new Array(LAPS + 1).fill(0);
    const u = r();
    if (u < rainProb) {
      const wetStart = r() < 0.3;
      const a = wetStart ? 0 : 3 + Math.floor(r() * (LAPS - 7));
      const len = 4 + Math.floor(r() * 9), peak = 0.45 + r() * 0.55;
      for (let l = a; l <= Math.min(LAPS, a + len); l++) { const k = (l - a) / len; rain[l] = peak * Math.sin(Math.PI * Math.min(1, wetStart ? 0.5 + k / 2 : k)) ** 0.7; }
      if (wetStart) rain[0] = peak;
    } else if (u < rainProb + 0.12) { const a = 4 + Math.floor(r() * (LAPS - 8)); rain[a] = 0.22; rain[a + 1] = 0.3; rain[a + 2] = 0.15; } // averse passagère
    const out = []; let wet = rain[0] > 0.3 ? 0.75 : 0;
    for (let l = 0; l <= LAPS; l++) {
      if (l) wet = clamp(wet + rain[l] * 0.5 - 0.11 * (1 - rain[l]), 0, 1);
      const cloud = clamp(Math.max(rain[l] * 1.4, ...[1, 2, 3].map((d) => (rain[l + d] || 0) * (1.1 - d * 0.25)), rainProb * 0.6), 0, 1);
      out.push({ rain: Math.round(rain[l] * 100) / 100, wet: Math.round(wet * 100) / 100, cloud: Math.round(cloud * 100) / 100, air: Math.round(temp - 5 * cloud), track: Math.round(temp + 12 - 14 * cloud - 6 * wet) });
    }
    return out;
  }
  const wxLabel = (x) => (x.rain > 0.6 ? 'Forte pluie' : x.rain > 0.25 ? 'Pluie' : x.rain > 0.05 ? 'Bruine' : x.wet > 0.35 ? 'Piste mouillée' : x.wet > 0.08 ? 'Piste humide' : x.cloud > 0.5 ? 'Couvert' : 'Sec');
  const wxIcon = (x) => (x.rain > 0.6 ? '⛈️' : x.rain > 0.25 ? '🌧️' : x.rain > 0.05 ? '🌦️' : x.cloud > 0.5 ? '☁️' : x.cloud > 0.2 ? '⛅' : '☀️');

  function simulate({ player, bots, race, seed, rainProb, temp }) {
    const w = circuitProfile(race);
    const r = rng(seed);
    const weather = weatherTimeline(rng(seed ^ 0x5bd1e995), rainProb, temp);
    const field = [{ ...player, me: true }, ...bots].map((c, i) => {
      const car = withSetup(c.car, c.setup);
      const cs = carScore(car, w);
      const mech = c.car.mech || {};
      const db = 2 * Math.min(2.5, mech.drv || 0);
      const d = db ? { ...c.driver, pace: Math.min(99, c.driver.pace + db), craft: Math.min(99, c.driver.craft + db), cons: Math.min(99, c.driver.cons + db) } : c.driver;
      const M = (k) => 2.8 * Math.tanh((mech[k] || 0) / 2.8); // rendements décroissants
      const form = gauss(r) * 3.5; // forme du jour (pilote + voiture)
      return { i, c, name: c.name, driver: d, cs, M, tyre: weather[0].wet > 0.35 ? 'I' : 'S', wrong: 0, tyreLog: [], pitLap: 7 + Math.floor(r() * 6), perf: 0.42 * ((d.pace + d.craft) / 2) + 0.58 * cs + form, q: 0.5 * d.pace + 0.5 * cs + form + gauss(r) * 2.5, time: 0, out: null, lapsDone: 0, spins: 0 };
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
      const wx = weather[lap], wet = wx.wet;
      if (wx.rain > 0.05 && weather[lap - 1].rain <= 0.05) events.push({ lap, type: 'wx', txt: `${wxIcon(wx)} La pluie arrive sur le circuit !` });
      if (wx.rain <= 0.05 && weather[lap - 1].rain > 0.05) events.push({ lap, type: 'wx', txt: '🌤️ La pluie s\'arrête, la piste va sécher.' });
      for (const x of field) {
        if (x.out) continue;
        const d = x.driver;
        // abandons : fiabilité de la voiture et régularité du pilote
        const pMech = (0.1 * Math.pow(1 - x.c.car.rel / 100, 1.5) * (0.6 + w.rel * 2)) / LAPS;
        const need = wet > 0.35 ? 'I' : 'S';
        const bad = x.tyre !== need;
        const pCrash = ((0.035 * (1 - d.cons / 100) * (0.5 + d.craft / 100)) / LAPS) * (1 + 5 * wet) * (bad && need === 'I' ? 3 : 1);
        const u = r();
        if (u < pMech) { x.out = { lap, why: ['Moteur', 'Boîte de vitesses', 'Hydraulique', 'Surchauffe', 'Freins'][Math.floor(r() * 5)] }; events.push({ lap, type: 'dnf', who: x.i, txt: `abandonne (${x.out.why.toLowerCase()})` }); continue; }
        if (u < pMech + pCrash) { x.out = { lap, why: 'Accident' }; events.push({ lap, type: 'dnf', who: x.i, txt: wet > 0.35 ? 'part en aquaplaning et tape le mur : abandon' : 'part dans le mur : abandon' }); continue; }
        const ty = x.M('tyre');
        let t = 90 - x.perf * 0.045 + gauss(r) * 0.6 * (1.5 - d.cons / 100) * (1 - 0.12 * ty);
        // départ : l'embrayage fait la différence au premier tour
        // piste mouillée : tout le monde ralentit, les pilotes combatifs s'en sortent mieux ; mauvais pneus = grosse perte
        t += 7 * wet - (d.craft - 82) * 0.06 * wet;
        if (bad) t += need === 'I' ? 4 + 9 * wet : 2.6;
        if (lap === 1) { const g = gauss(r) * 0.9 - 0.9 * x.M('launch'); t += g; if (x.c.me && x.M('launch') > 0.5 && g < -1.2) events.push({ lap, type: 'gain', who: x.i, txt: 'envol parfait au départ !' }); }
        // usure des pneus en fin de relais et mode dépassement dans les derniers tours
        const stint = lap >= x.pitLap ? lap - x.pitLap : lap;
        if (stint > 5) t += 0.09 * (stint - 5) * (1 - 0.28 * ty);
        if (lap > LAPS - 5) t -= 0.2 * x.M('push');
        if (r() < 0.035 * (1 - d.cons / 100) * 3 * (1 - 0.2 * ty)) { t += 4 + r() * 4; x.spins++; events.push({ lap, type: 'spin', who: x.i, txt: 'part en tête-à-queue et perd du temps' }); }
        // changement de pneus imposé par la météo : le stratège réagit plus ou moins vite
        x.wrong = bad ? x.wrong + 1 : 0;
        const delay = Math.max(1, Math.round(3.4 - x.M('wx') + (x.i * 7 % 3) * 0.5));
        const swap = bad && x.wrong >= delay && lap < LAPS - 1;
        if (swap) { x.tyre = need; x.wrong = 0; }
        // arrêt au stand (un par course, plus les arrêts météo)
        if (lap === x.pitLap || swap) {
          if (swap && lap < x.pitLap) x.pitLap = lap; // l'arrêt météo remplace l'arrêt prévu
          const crew = x.M('pit');
          let still = Math.max(1.8, 2.05 + Math.abs(gauss(r)) * 0.7 * (1 - 0.25 * crew) - 0.12 * crew);
          const botched = r() < 0.07 * (1 - 0.3 * crew);
          if (botched) still += 3 + r() * 5;
          t += 19 + still;
          x.pits = (x.pits || 0) + 1; x.pitLaps = (x.pitLaps || []).concat(lap);
          const what = swap ? (need === 'I' ? ' → pneus pluie' : ' → pneus slicks') : '';
          if (x.c.me) events.push({ lap, type: botched ? 'loss' : 'pit', who: x.i, txt: botched ? `arrêt au stand raté${what} : ${still.toFixed(1).replace('.', ',')} s immobilisé !` : `arrêt au stand en ${still.toFixed(1).replace('.', ',')} s${what}` });
        }
        x.time += t; x.lapsDone = lap; x.tyreLog[lap] = x.tyre;
        if (t < fastest.t) fastest = { t, who: x.i, lap };
      }
      if (lap === scLap) {
        // voiture de sécurité : le peloton se regroupe
        // l'ingénieur de course exploite la neutralisation (arrêt « gratuit », bon placement)
        const meX = field.find((x) => x.c.me);
        const before = field.filter((x) => !x.out).sort((a, b) => a.time - b.time).indexOf(meX);
        field.forEach((x) => { if (!x.out) x.time -= 2.2 * x.M('sc') + r() * 0.8; });
        const running = field.filter((x) => !x.out).sort((a, b) => a.time - b.time);
        const after = running.indexOf(meX);
        if (!meX.out && meX.M('sc') > 0.3 && after < before) events.push({ lap, type: 'gain', who: meX.i, txt: `📻 coup stratégique sous voiture de sécurité : +${before - after} place${before - after > 1 ? 's' : ''}` });
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
    return { field, laps, final, events: events.sort((a, b) => a.lap - b.lap), fastest, scLap, w, weather, gridGap };
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

  /* ---------- Objectifs du jour ---------- */
  const OBJECTIVES = [
    { id: 'races3', txt: 'Disputer 3 courses', k: 'races', goal: 3, pc: 25 },
    { id: 'top5', txt: 'Terminer 2 fois dans le top 5', k: 'top5', goal: 2, pc: 40 },
    { id: 'podium', txt: 'Monter sur le podium', k: 'podium', goal: 1, pc: 50 },
    { id: 'win', txt: 'Remporter une course', k: 'win', goal: 1, pc: 80 },
    { id: 'gain5', txt: 'Gagner 5 places en une seule course', k: 'gainMax', goal: 5, pc: 45 },
    { id: 'finish4', txt: 'Voir le drapeau à damier 4 fois', k: 'finish', goal: 4, pc: 35 },
    { id: 'rd2', txt: 'Développer 2 améliorations', k: 'rd', goal: 2, pc: 30 },
    { id: 'tunnel', txt: 'Réussir un pari soufflerie', k: 'tunnelOk', goal: 1, pc: 35 },
    { id: 'fastest', txt: 'Signer le meilleur tour en course', k: 'fastest', goal: 1, pc: 45 },
  ];
  function dailyObjectives(dayKey) {
    const r = rng(hash('obj-' + dayKey));
    const pool = [...OBJECTIVES]; const out = [];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
  }

  F1.manager = {
    STAFF_ROLES, STAFF, staffOf, GARAGE, GARAGE_ZONES, GARAGE_BY_ID, garageCost, garageLevel, teamBonus, weatherTimeline, wxLabel, wxIcon,
    MAX_LV, LV_GAIN, LV_NAME, lvCum, partLevel, levelCost, MECH, tunnelChance, branchPackage, carRating, OBJECTIVES, dailyObjectives,
    START_PC, RACES_PER_DAY, FIELD, LAPS, STATS, UP_STEP, UP_MAX, upCost, LEAGUES, leagueOf, nextLeague, LP_TABLE, PC_TABLE,
    RD_CATS, RD_PARTS, RD_BY_ID, rdBranches, partState, partsBonus,
    market, carStats, withSetup, carScore, bestSetup, compat, circuitProfile, botField, simulate, rewards, betReward, hash, TALENT,
  };
})(globalThis.F1 = globalThis.F1 || {});
