/* PITWALL Manager : PitCoins, marché des pilotes et châssis, R&D, moteur de course, ligues.
   Logique pure (sans DOM) : utilisable et testable hors navigateur. */
(function (F1) {
  const START_PC = 300;
  const RACES_PER_DAY = 3;          // courses gratuites par fenêtre de recharge
  const REFILL_H = 5;               // durée d'une fenêtre : 3 courses toutes les 5 heures
  const FIELD = 20; // 1 joueur + 19 managers IA
  const LAPS = 20;                  // course de référence : l'équilibrage d'origine a été réglé sur 20 tours
  /* Nombre de tours officiel de chaque Grand Prix */
  const RACE_LAPS = {
    albert_park: 58, shanghai: 56, suzuka: 53, bahrain: 57, jeddah: 50, miami: 57, villeneuve: 70, monaco: 78, catalunya: 66,
    red_bull_ring: 71, silverstone: 52, spa: 44, hungaroring: 70, zandvoort: 72, monza: 53, madring: 57, baku: 51, marina_bay: 62,
    americas: 56, rodriguez: 71, interlagos: 71, vegas: 50, losail: 57, yas_marina: 58, sepang: 56, portimao: 66, istanbul: 58, imola: 63,
  };
  const lapsOf = (race) => (race && RACE_LAPS[race.circuitId]) || 57;

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
  /* ---------- Âge et expérience des pilotes ----------
     Année de naissance réelle. Un pilote gagne de l'XP à chaque course terminée avec l'écurie du joueur ;
     les jeunes apprennent vite et ont une grande marge de progression, les vétérans presque plus. */
  const BIRTH = {
    max_verstappen: 1997, norris: 1999, leclerc: 1997, russell: 1998, hamilton: 1985, piastri: 2001, alonso: 1981, antonelli: 2006,
    sainz: 1994, albon: 1996, perez: 1990, gasly: 1996, hulkenberg: 1987, bottas: 1989, hadjar: 2004, ocon: 1996, tsunoda: 2000,
    bearman: 2005, bortoleto: 2004, lawson: 2002, stroll: 1998, colapinto: 2003, arvid_lindblad: 2007, rafael_camara: 2005,
  };
  const ageOf = (id, year) => (BIRTH[id] ? (year || new Date().getFullYear()) - BIRTH[id] : 27);
  // [multiplicateur d'XP, progression maximale en points de caractéristique, libellé]
  function growth(age) {
    if (age <= 21) return { mult: 2, cap: 12, label: 'Très fort potentiel' };
    if (age <= 23) return { mult: 1.6, cap: 10, label: 'Fort potentiel' };
    if (age <= 27) return { mult: 1.1, cap: 6, label: 'En progression' };
    if (age <= 32) return { mult: 0.6, cap: 3, label: 'À maturité' };
    if (age <= 37) return { mult: 0.25, cap: 1.5, label: 'Vétéran' };
    return { mult: 0.1, cap: 0.5, label: 'Fin de carrière' };
  }
  const XP_PER_POINT = 55;                  // XP nécessaires pour +1 point de progression
  // XP divisée par 3,75 : un point de progression demande ~7 courses pour un jeune pilote, ~25 pour un pilote à maturité
  const XP_DIV = 3.75;
  const xpForRace = (pos, dnf, age) => (dnf ? 0 : Math.round(((10 + Math.max(0, 11 - pos)) * growth(age).mult) / XP_DIV));
  // Progression acquise : points gagnés (plafonnés selon l'âge), répartis sur les trois caractéristiques
  function driverGrowth(id, xpState, year) {
    const st = (xpState && xpState[id]) || { xp: 0, races: 0 };
    const age = ageOf(id, year), g = growth(age);
    const pts = Math.min(g.cap, st.xp / XP_PER_POINT);
    return { age, ...g, xp: st.xp, races: st.races, pts, maxed: pts >= g.cap - 1e-9, next: g.cap > pts ? XP_PER_POINT - (st.xp % XP_PER_POINT) : 0,
      bonus: { pace: pts, craft: pts * 0.8, cons: pts * 1.2 } };
  }
  // Pilote du marché + progression acquise avec l'écurie du joueur
  function withExperience(d, xpState, year) {
    if (!d) return d;
    const g = driverGrowth(d.id, xpState, year);
    const cl = (v) => Math.min(99, Math.round((v) * 10) / 10);
    return { ...d, base: { rating: d.rating, pace: d.pace, craft: d.craft, cons: d.cons }, pace: cl(d.pace + g.bonus.pace), craft: cl(d.craft + g.bonus.craft), cons: cl(d.cons + g.bonus.cons), rating: Math.min(99, Math.round(d.rating + g.pts)), exp: g };
  }

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
    // description qualitative du tracé : au joueur d'en déduire son réglage
    const traits = [
      ['Lignes droites', w[0] >= 0.55 ? 'Très longues' : w[0] >= 0.45 ? 'Longues' : w[0] >= 0.3 ? 'Moyennes' : 'Courtes'],
      ['Virages lents', w[1] >= 0.6 ? 'Très nombreux' : w[1] >= 0.5 ? 'Nombreux' : w[1] >= 0.4 ? 'Quelques-uns' : 'Rares'],
      ['Contraintes mécaniques', w[2] >= 0.25 ? 'Élevées' : 'Normales'],
    ];
    return { speed: w[0], df: w[1], rel: w[2], kind, tip, traits };
  }

  /* ---------- Ligues ---------- */
  const LEAGUES = [
    { id: 'bronze', name: 'Bronze', min: 0, mult: 1, color: '#cd7f32', icon: '🥉', bot: [0, 2], drv: [76, 86] },
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
  // les PitCoins ne viennent plus que des courses : même le fond de grille rapporte de quoi progresser
  // 3 courses toutes les 5 h (jusqu'à ~9 par jour) : gains par course revenus au barème d'origine (ils avaient été doublés pour 2 courses/jour)
  const PC_TABLE = [40, 32, 26, 22, 19, 16, 14, 12, 11, 10, 9, 8, 8, 7, 7, 6, 6, 5, 5, 5];
  const DNF_LP = -8, DNF_PC = 3;
  // Barème par ligue : Bronze ne fait jamais perdre de points ; Argent et Or réintroduisent les pertes peu à peu ;
  // à partir de Platine, le barème complet s'applique
  const LP_BY_LEAGUE = [
    { t: [30, 22, 16, 12, 9, 7, 5, 4, 3, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0], dnf: 0 },
    { t: [30, 22, 16, 12, 8, 5, 3, 2, 1, 0, 0, 0, -1, -1, -2, -2, -3, -3, -4, -4], dnf: -3 },
    { t: [30, 22, 16, 12, 8, 5, 3, 1, 0, -1, -2, -3, -4, -4, -5, -5, -6, -6, -7, -7], dnf: -5 },
  ];
  const lpScale = (league) => LP_BY_LEAGUE[Math.max(0, LEAGUES.findIndex((l) => l.id === (league && league.id)))] || { t: LP_TABLE, dnf: DNF_LP };

  /* ---------- Outils ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

  /* ---------- Marché : notes et prix calculés à partir des données réelles ---------- */
  // Prix d'un pilote selon son âge, à niveau égal : les jeunes valent leur marge de progression, les vétérans (qui ne progressent
  // presque plus) deviennent des choix rentables à court terme
  const AGE_PRICE = (age) => (age <= 21 ? 1.35 : age <= 23 ? 1.2 : age <= 27 ? 1 : age <= 29 ? 0.85 : age <= 32 ? 0.65 : age <= 36 ? 0.5 : 0.4);
  /* Valeur marchande d'un pilote : 80 % sur sa note ACTUELLE (progression acquise comprise), en exponentielle
     (chaque point au-dessus de 80 vaut de plus en plus cher), 20 % sur sa marge de progression restante, pondérée par l'âge.
     Un pilote formé jusqu'à 86 vaut donc nettement plus qu'un pilote à 82, même s'il a atteint son plafond. */
  const valueCurve = (r) => 45 * Math.exp((r - 80) / 7);
  const AGE_W = (age) => (age <= 21 ? 1.3 : age <= 23 ? 1.15 : age <= 27 ? 1 : age <= 32 ? 0.7 : 0.4);
  function driverValue(rating, remaining, age) {
    const upside = Math.min(1.5, (Math.max(0, remaining) / 6) * AGE_W(age));   // 0 (plafond atteint) à 1,5 (jeune, tout à apprendre)
    return Math.max(15, Math.round((valueCurve(rating) * (0.8 + 0.2 * upside)) / 5) * 5);
  }
  const RESALE_K = 0.78;   // revente : 78 % de la valeur marchande actuelle
  // valeur d'un pilote tel qu'il est aujourd'hui (objet renvoyé par withExperience)
  const valueOfDriver = (x) => (x.exp ? driverValue((x.base ? x.base.rating : x.rating) + x.exp.pts, x.exp.cap - x.exp.pts, x.exp.age) : x.price);
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
      const age = ageOf(id, season.year), agef = AGE_W(age);
      const price = driverValue(rating, growth(age).cap, age);   // valeur marchande sans progression acquise
      return { id, name: `${d.given} ${d.family}`, family: d.family, code: d.code, number: d.number, iso: d.iso, teamId: d.teamId, rating, pace, craft, cons, price, rookie, age, agef };
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
        price: Math.round((25 + 475 * Math.pow(st, 2.2)) / 5) * 5,   // de 25 PC (fond de grille) à 500 PC (meilleure écurie)
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
  // gain apporté par chaque niveau (en part du bonus nominal de la pièce) : chaque niveau rapporte un peu plus que le précédent
  const LV_GAIN = [0.5, 0.55, 0.6, 0.65, 0.7];
  const LV_NAME = ['—', 'Mk I', 'Mk II', 'Mk III', 'Mk IV', 'Mk V'];
  const lvCum = (l) => LV_GAIN.slice(0, l).reduce((a, b) => a + b, 0);
  const partLevel = (owned, id) => { const v = owned && owned[id]; return !v ? 0 : v > MAX_LV ? 1 : v; };
  let levelCost = null; // défini plus bas, avec la grille tarifaire commune à la R&D et au garage
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
    G('trucks', 'fac', 'Camions-ateliers', 'Logistique renforcée : moins de frais de déplacement, donc plus de PitCoins à chaque course.', '🚛', { pc: 0.03 }, 70),
  ];
  const GARAGE_BY_ID = new Map(GARAGE.map((g) => [g.id, g]));
  // gain apporté par chaque niveau d'équipement (en part de l'effet nominal) : cumul au niveau 5 = 5 fois l'effet nominal, comme avant
  const G_GAIN = [0.8, 0.9, 1, 1.1, 1.2];
  const gCum = (l) => G_GAIN.slice(0, l).reduce((a, b) => a + b, 0);

  /* ---------- Grille tarifaire : le prix est proportionnel au gain de performance réel ----------
     Chaque bonus a une valeur en « points de performance » : vitesse et appui = 1 par point, fiabilité = 0,63
     (son poids dans la note voiture), et des valeurs étalonnées pour les bonus mécaniques et d'écurie.
     Prix d'un niveau = TARIF × valeur du gain apporté par CE niveau, pour toutes les pièces et tous les équipements.
     Conséquence : un gain plus grand coûte toujours plus cher, un gain égal coûte le même prix, partout. */
  const VALUE = { speed: 1, df: 1, rel: 0.63, launch: 1.9, tyre: 1.9, push: 1.9, pit: 1.9, sc: 1.9, drv: 1.9, wx: 1.9, pc: 21, rd: 30, tunnel: 25 };
  const valueOf = (fx) => Object.entries(fx).reduce((a, [k, v]) => a + (VALUE[k] || 0) * v, 0);
  const TARIF = 80;   // PitCoins par point de performance
  const price = (v) => Math.max(5, Math.round((TARIF * v) / 5) * 5);
  levelCost = (p, l) => price(valueOf(p.fx) * LV_GAIN[l - 1]);           // coût pour passer au niveau l
  const garageCost = (g, l) => price(valueOf(g.fx) * G_GAIN[l - 1]);
  const garageLevel = (m, id) => Math.min(MAX_LV, (m && m.garage && m.garage[id]) || 0);
  // Bonus cumulés du personnel et du garage
  function teamBonus(m) {
    const b = { speed: 0, df: 0, rel: 0, launch: 0, tyre: 0, push: 0, pit: 0, sc: 0, drv: 0, wx: 0, pc: 0, rd: 0, tunnel: 0, races: 0 };
    if (!m) return b;
    STAFF_ROLES.forEach((r) => { const x = staffOf(m, r.id); if (x) for (const k in r.fx) b[k] += r.fx[k] * x.tier; });
    GARAGE.forEach((g) => { const l = garageLevel(m, g.id); if (!l) return; const f = gCum(l); for (const k in g.fx) b[k] += g.fx[k] * f; });
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
  const BOT_EXTRA = [10, 18, 31, 46, 64, 84]; // développement moyen des managers IA selon la ligue
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
      const ranges = [[0, n], [0, n], [0, n], [0, 8], [0, 6], [0, 4]];
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
  function weatherTimeline(r, rainProb = 0.25, temp = 24, laps = LAPS) {
    // les tirages sont faits sur une course de 20 « segments » puis étalés sur le vrai nombre de tours
    const K = laps / LAPS, sc = (v) => Math.round(v * K);
    const rain = new Array(laps + 1).fill(0);
    const u = r();
    if (u < rainProb) {
      const wetStart = r() < 0.3;
      const a = wetStart ? 0 : sc(3 + Math.floor(r() * (LAPS - 7)));
      const len = Math.max(2, sc(4 + Math.floor(r() * 9))), peak = 0.45 + r() * 0.55;
      for (let l = a; l <= Math.min(laps, a + len); l++) { const k = (l - a) / len; rain[l] = peak * Math.sin(Math.PI * Math.min(1, wetStart ? 0.5 + k / 2 : k)) ** 0.7; }
      if (wetStart) rain[0] = peak;
    } else if (u < rainProb + 0.12 * Math.min(1, rainProb * 4)) { const a = sc(4 + Math.floor(r() * (LAPS - 8))), n = Math.max(3, sc(3)); for (let l = 0; l < n; l++) rain[a + l] = [0.22, 0.3, 0.15][Math.floor((l / n) * 3)]; } // averse passagère
    const out = []; let wet = rain[0] > 0.3 ? 0.75 : 0;
    const look = [1, 2, 3].map((d) => Math.max(1, Math.round(d * K)));
    for (let l = 0; l <= laps; l++) {
      if (l) wet = clamp(wet + (rain[l] * 0.5 - 0.11 * (1 - rain[l])) / K, 0, 1);
      const cloud = clamp(Math.max(rain[l] * 1.4, ...look.map((d, j) => (rain[l + d] || 0) * (1.1 - (j + 1) * 0.25)), rainProb * 0.6), 0, 1);
      out.push({ rain: Math.round(rain[l] * 100) / 100, wet: Math.round(wet * 100) / 100, cloud: Math.round(cloud * 100) / 100, air: Math.round(temp - 5 * cloud), track: Math.round(temp + 12 - 14 * cloud - 6 * wet) });
    }
    return out;
  }
  const wxLabel = (x) => (x.rain > 0.6 ? 'Forte pluie' : x.rain > 0.25 ? 'Pluie' : x.rain > 0.05 ? 'Bruine' : x.wet > 0.35 ? 'Piste mouillée' : x.wet > 0.08 ? 'Piste humide' : x.cloud > 0.5 ? 'Couvert' : 'Sec');
  const wxIcon = (x) => (x.rain > 0.6 ? '⛈️' : x.rain > 0.25 ? '🌧️' : x.rain > 0.05 ? '🌦️' : x.cloud > 0.5 ? '☁️' : x.cloud > 0.2 ? '⛅' : '☀️');

  /* ---------- Climat des circuits : [probabilité de pluie en course, température de l'air] ---------- */
  const CLIMATE = {
    spa: [0.5, 17], silverstone: [0.4, 19], interlagos: [0.45, 23], sepang: [0.5, 31], suzuka: [0.35, 21], marina_bay: [0.35, 30], zandvoort: [0.35, 19], villeneuve: [0.3, 21],
    albert_park: [0.25, 21], shanghai: [0.28, 19], hungaroring: [0.2, 28], red_bull_ring: [0.28, 22], imola: [0.25, 21], istanbul: [0.2, 22], miami: [0.25, 29], americas: [0.15, 26],
    catalunya: [0.12, 25], madring: [0.1, 27], portimao: [0.15, 22], rodriguez: [0.15, 22], baku: [0.08, 24], monaco: [0.2, 21], monza: [0.06, 26], vegas: [0.03, 14],
    bahrain: [0.02, 27], jeddah: [0.02, 29], losail: [0.02, 28], yas_marina: [0.02, 28],
  };
  const climateOf = (race) => (race && CLIMATE[race.circuitId]) || [0.2, 22];
  const trackState = (wet) => (wet < 0.12 ? 'Sèche' : wet < 0.45 ? 'Humide' : 'Trempée');
  // Bulletin d'avant-course : état au départ, température et risque de pluie annoncé (une prévision, pas une certitude)
  function forecast(seed, race) {
    const [p, temp] = climateOf(race), laps = lapsOf(race);
    const wx = weatherTimeline(rng(seed ^ 0x5bd1e995), p, temp, laps);
    const r = rng(seed ^ 0x2545f491);
    const rainLaps = wx.map((x, l) => (x.rain > 0.2 ? l : -1)).filter((l) => l > 0);
    const will = rainLaps.length > 0;
    const risk = Math.round(clamp(will ? 45 + r() * 45 : p * 100 * (0.4 + r() * 1.1) + r() * 12, 2, 95) / 5) * 5;
    const mid = (will ? rainLaps[0] : Math.floor(r() * laps)) / laps;
    const when = mid <= 0.33 ? 'en début de course' : mid <= 0.66 ? 'en milieu de course' : 'en fin de course';
    const s = wx[0];
    const sky = s.rain > 0.25 ? 'Pluie au départ' : s.wet > 0.12 ? 'Piste humide au départ' : risk >= 60 ? 'Ciel menaçant' : risk >= 30 ? 'Nuageux' : 'Sec';
    return { icon: wxIcon({ rain: s.rain, cloud: risk >= 60 ? 0.7 : risk >= 30 ? 0.3 : 0 }), sky, temp: s.air, track: trackState(s.wet), risk, when, txt: `${sky} · ${s.air} °C · ${s.wet > 0.12 ? `piste ${trackState(s.wet).toLowerCase()}` : `risque de pluie ${when} : ${risk} %`}` };
  }

  // Prévision tour par tour affichée avant la course : probabilité de pluie par tour, avec une marge d'erreur
  // (l'averse peut arriver un ou deux tours plus tôt ou plus tard, et une alerte peut ne rien donner).
  function forecastLaps(seed, race) {
    const [p, temp] = climateOf(race), laps = lapsOf(race), K = laps / LAPS;
    const wx = weatherTimeline(rng(seed ^ 0x5bd1e995), p, temp, laps);
    const r = rng(seed ^ 0x51ed270b);
    const shift = Math.round((r() - 0.5) * 6 * K);        // décalage de ±15 % de la course
    const base = p * 100 * (0.3 + r() * 0.4);          // bruit de fond : le même pour toute la course
    const ghost = r() < 0.08 + p * 0.7 ? Math.round((3 + Math.floor(r() * (LAPS - 8))) * K) : -1;   // fausse alerte éventuelle
    const near1 = Math.max(1, Math.round(K)), out = [];
    for (let l = 1; l <= laps; l++) {
      const t = wx[clamp(l - shift, 1, laps)];
      const near = Math.max(...[-near1, 0, near1].map((d) => (wx[clamp(l - shift + d, 1, laps)] || t).rain));
      let pr = t.rain > 0.15 ? 55 + t.rain * 40 : near > 0.15 ? 35 + r() * 15 : t.wet > 0.2 ? 25 : base;
      if (ghost > 0 && l >= ghost && l < ghost + 3 * K && pr < 30) pr = 30 + r() * 20;
      out.push({ lap: l, p: Math.round(clamp(pr + (r() - 0.5) * 4, 2, 95) / 5) * 5, heavy: t.rain > 0.6, wet: t.wet });
    }
    const kind = (x) => (x.p >= 55 ? (x.heavy ? 'heavy' : 'rain') : x.p >= 25 ? 'risk' : 'dry');
    const segs = [];
    out.forEach((x) => { const k = kind(x), last = segs[segs.length - 1]; x.kind = k; if (last && last.kind === k) { last.to = x.lap; last.p = Math.max(last.p, x.p); } else segs.push({ kind: k, from: x.lap, to: x.lap, p: x.p }); });
    const LBL = { dry: ['☀️', 'Sec'], risk: ['🌦️', 'Risque de pluie'], rain: ['🌧️', 'Pluie'], heavy: ['⛈️', 'Pluie forte'] };
    segs.forEach((g) => { g.icon = LBL[g.kind][0]; g.txt = `${g.from === g.to ? 'Tour ' + g.from : `Tours ${g.from}-${g.to}`} : ${LBL[g.kind][1]}${g.kind === 'dry' ? '' : ' ' + g.p + ' %'}`; });
    return { laps: out, segs, startWet: wx[0].wet, total: laps };
  }
  // Tendance annoncée en course pour les n prochains tours
  function trend(R, n = 3, from = null) {
    const LAPS = R.LAPS, lap = from == null ? R.lap : from, wet = R.weather[Math.min(LAPS, lap)].wet;
    const nx = []; for (let d = 1; d <= n && lap + d <= LAPS; d++) nx.push(R.weather[lap + d]);
    if (!nx.length) return 'Dernier tour';
    const rainNow = R.weather[Math.min(LAPS, lap)].rain > 0.15;
    const k = nx.findIndex((x) => x.rain > 0.15);
    const maxWet = Math.max(...nx.map((x) => x.wet)), minWet = Math.min(...nx.map((x) => x.wet)), maxRain = Math.max(...nx.map((x) => x.rain));
    if (!rainNow && k >= 0) return `${maxRain > 0.6 ? 'Forte averse' : 'Averse'} prévue dans ${k + 1} tour${k ? 's' : ''}`;
    if (rainNow && maxRain > R.weather[lap].rain + 0.15) return 'La pluie s\'intensifie';
    if (rainNow && nx[nx.length - 1].rain < 0.1) return 'La pluie s\'arrête bientôt';
    if (wet > 0.12 && minWet < wet - 0.08) return 'La piste sèche progressivement';
    if (maxWet > wet + 0.1) return 'La piste se mouille';
    return wet > 0.12 ? 'Conditions stables, piste mouillée' : 'Temps sec et stable';
  }

  /* ---------- Pneus : rythme (s/tour, négatif = plus rapide) et usure par tour ---------- */
  const TYRES = {
    S: { id: 'S', name: 'Tendres', short: 'Tendre', color: '#e10600', pace: -1.0, wear: 0.034, desc: 'Très rapides au départ, mais ils s\'usent vite et s\'effondrent en milieu de course.' },
    M: { id: 'M', name: 'Mediums', short: 'Medium', color: '#ffd400', pace: -0.5, wear: 0.024, desc: 'Bon équilibre entre vitesse et endurance.' },
    H: { id: 'H', name: 'Durs', short: 'Dur', color: '#f2f2f2', pace: 0, wear: 0.018, desc: 'Plus lents au début, mais usure très faible : pour les longs relais et les circuits abrasifs.' },
    I: { id: 'I', name: 'Intermédiaires', short: 'Inter', color: '#2ee59d', pace: 0, wear: 0.02, desc: 'Pour une piste humide ou une pluie légère.' },
    W: { id: 'W', name: 'Pluie', short: 'Pluie', color: '#3d7bff', pace: 0, wear: 0.018, desc: 'Pour la forte pluie et la piste trempée.' },
  };
  const isSlick = (t) => t === 'S' || t === 'M' || t === 'H';
  const idealTyre = (wet) => (wet < 0.12 ? 'dry' : wet < 0.6 ? 'I' : 'W');
  // Règle des 2 composés : sur une course sèche, il faut avoir utilisé deux composés secs différents (elle saute si Inter ou Pluie ont servi)
  const ruleOk = (x) => x.used.some((t) => !isSlick(t)) || new Set(x.used).size >= 2;
  const RULE_PENALTY = 30;
  function dryFor(lapsLeft, abr, x) {
    const base = TYRES.S.wear * abr * lapsLeft <= 0.8 ? 'S' : TYRES.M.wear * abr * lapsLeft <= 0.82 ? 'M' : 'H';
    if (!x || ruleOk(x) || x.used[0] !== base) return base;
    return base === 'S' ? 'M' : base === 'H' ? 'M' : TYRES.S.wear * abr * lapsLeft <= 0.8 ? 'S' : 'H';   // un autre composé pour respecter la règle
  }
  // État d'un train de pneus pour l'affichage : température et performance restante
  function tyreStatus(tyre, wear, wet, mode, fresh) {
    const loss = tyreDelta(tyre, wet, wear) - TYRES[tyre].pace;
    const wrong = isSlick(tyre) ? wet >= 0.2 : wet < 0.1;
    const temp = fresh ? 'Froids' : wrong && !isSlick(tyre) ? 'Surchauffe' : wrong ? 'Trop froids' : mode === 'push' && wear > 0.5 ? 'Surchauffe' : 'Dans la fenêtre';
    return { temp, perf: Math.round(clamp(100 - loss * 14, 0, 100)), hot: temp === 'Surchauffe', cold: temp === 'Froids' || temp === 'Trop froids' };
  }
  const MODES = { push: { name: 'Attaque', dt: -0.4, wear: 1.5 }, std: { name: 'Équilibré', dt: 0, wear: 1 }, save: { name: 'Économie', dt: 0.3, wear: 0.65 } };
  // Temps perdu par tour selon le composé, l'état de la piste et l'usure
  function tyreDelta(tyre, wet, wear) {
    let t = TYRES[tyre].pace;
    if (isSlick(tyre)) { if (wet >= 0.12) t += wet < 0.45 ? 2 + 7 * wet : 5 + 10 * wet; }
    else if (tyre === 'I') t += wet < 0.12 ? 3.2 : wet > 0.6 ? 1.5 + 4 * (wet - 0.6) : 0;
    else t += wet < 0.12 ? 5.5 : wet < 0.45 ? 1.6 : -0.3;
    t += wear < 0.75 ? wear * wear : 0.56 + (wear - 0.75) * 20;   // au-delà de 75 % d'usure, le rythme s'effondre
    return t;
  }

  /* ---------- Moteur de course, tour par tour ----------
     createRace() prépare la grille ; stepLap() calcule un tour ; les décisions radio du joueur s'appliquent entre deux tours. */
  const DILEMMA_AT = [0.25, 0.55, 0.8];   // dilemmes radio vers 25 %, 55 % et 80 % de la course
  const dilemmaLaps = (laps) => DILEMMA_AT.map((f) => Math.round(f * laps));
  const DILEMMA_LAPS = dilemmaLaps(LAPS);
  function createRace({ player, bots, race, seed, wxSeed, rainProb, temp, startTyre, plan, manual }) {
    const w = circuitProfile(race);
    const LAPS = lapsOf(race), K = LAPS / 20, DL = dilemmaLaps(LAPS);
    // générateur aléatoire dont l'état peut être sauvegardé : un tour peut être recalculé à l'identique
    const st = { rs: seed >>> 0 };
    const r = () => { st.rs = (st.rs + 0x6d2b79f5) | 0; let t = Math.imul(st.rs ^ (st.rs >>> 15), 1 | st.rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const cl = climateOf(race);
    const weather = weatherTimeline(rng((wxSeed == null ? seed : wxSeed) ^ 0x5bd1e995), rainProb == null ? cl[0] : rainProb, temp == null ? cl[1] : temp, LAPS);
    const abr = 0.88 + w.df * 0.35 + w.rel * 0.3;   // abrasivité du circuit
    const wet0 = weather[0].wet;
    const field = [{ ...player, me: true }, ...bots].map((c, i) => {
      const car = withSetup(c.car, c.setup);
      const cs = carScore(car, w);
      const mech = c.car.mech || {};
      const db = 2 * Math.min(2.5, mech.drv || 0);
      const d = db ? { ...c.driver, pace: Math.min(99, c.driver.pace + db), craft: Math.min(99, c.driver.craft + db), cons: Math.min(99, c.driver.cons + db) } : c.driver;
      const M = (k) => 2.8 * Math.tanh((mech[k] || 0) / 2.8); // rendements décroissants
      const form = gauss(r) * 5.5; // forme du jour (pilote + voiture) : un bon ou un mauvais dimanche pèse lourd
      const u = r();
      const tyre = c.me && startTyre && TYRES[startTyre] ? startTyre : idealTyre(wet0) !== 'dry' ? idealTyre(wet0) : u < 0.35 ? 'S' : u < 0.8 ? 'M' : 'H';
      return { i, c, name: c.name, driver: d, cs, M, tyre, used: [tyre], fresh: false, pitLoss: {}, wear: 0, wrong: 0, thr: 0.68 + r() * 0.13, noPit: 0, tyreLog: [], pitLaps: [], pits: 0,
        perf: 0.42 * ((d.pace + d.craft) / 2) + 0.58 * cs + form, q: 0.5 * d.pace + 0.5 * cs + form + gauss(r) * 2.5, time: 0, out: null, lapsDone: 0, spins: 0 };
    });
    field.sort((a, b) => b.q - a.q).forEach((x, k) => { x.grid = k + 1; });
    const gridGap = 0.35 + 0.6 * w.df;
    field.forEach((x) => { x.time = (x.grid - 1) * gridGap; });
    const gapArr = {}, tArr = {}; field.forEach((x) => { gapArr[x.i] = [x.time]; tArr[x.i] = [x.time]; });
    // la voiture de sécurité sort à un moment où le stand peut réagir
    const scLap = r() < 0.5 ? DL[Math.floor(r() * DL.length)] : -1;
    const stops = planFor(plan, LAPS).stops;
    // ctl : commandes du muret pendant la course (appel au stand, prochain composé, rythme, suivi du plan)
    return { tArr, LAPS, K, sqK: Math.sqrt(K), DL, scLen: Math.max(2, Math.round(1.5 * K)), lap: 0, field, me: field.find((x) => x.c.me), laps: [], gapArr, events: [], fastest: { t: 1e9, who: null, lap: 0 }, scLap, w, weather, gridGap, abr, r, st, prevOrder: field.map((x) => x.i), asked: [],
      manual: !!manual, plan: { stops }, ctl: { box: false, tyre: stops[0] ? stops[0].tyre : 'M', mode: 'std', plan: true } };
  }
  function planFor(plan, laps) {
    const of = (plan && plan.of) || LAPS;
    const stops = ((plan && plan.stops) || []).filter((p) => p && TYRES[p.tyre]).map((p) => ({ tyre: p.tyre, lap: of === laps ? p.lap : Math.round((p.lap * laps) / of) }))
      .filter((p) => p.lap >= 1 && p.lap < laps).sort((a, b) => a.lap - b.lap);
    return { of: laps, stops };
  }
  // Sauvegarde / restauration de l'état avant un tour (pour le recalculer après un ordre du muret)
  function snapshot(R) {
    return { rs: R.st.rs, lap: R.lap, nEv: R.events.length, fastest: { ...R.fastest }, prevOrder: R.prevOrder.slice(), asked: R.asked.slice(), box: R.ctl.box, ctlTyre: R.ctl.tyre,
      cars: R.field.map((x) => ({ ...x, used: x.used.slice(), pitLaps: x.pitLaps.slice(), tyreLog: x.tyreLog.slice(), pitLoss: { ...x.pitLoss }, out: x.out ? { ...x.out } : null })) };
  }
  // Recalcule le dernier tour avec les commandes actuelles du muret (même aléa : seul l'effet des ordres change)
  function redoLap(R) {
    const s0 = R.snap; if (!s0 || s0.lap !== R.lap - 1 || R.lap >= R.LAPS + 1) return false;
    const keep = { box: R.ctl.box, tyre: R.ctl.tyre };
    R.st.rs = s0.rs; R.lap = s0.lap; R.events.length = s0.nEv; R.fastest = { ...s0.fastest }; R.prevOrder = s0.prevOrder.slice(); R.asked = s0.asked.slice();
    R.field.forEach((x, k) => Object.assign(x, s0.cars[k], { used: s0.cars[k].used.slice(), pitLaps: s0.cars[k].pitLaps.slice(), tyreLog: s0.cars[k].tyreLog.slice(), pitLoss: { ...s0.cars[k].pitLoss }, out: s0.cars[k].out ? { ...s0.cars[k].out } : null }));
    R.laps.length = s0.lap; R.field.forEach((x) => { R.gapArr[x.i].length = s0.lap + 1; R.tArr[x.i].length = s0.lap + 1; });
    R.final = null; R.ctl.box = keep.box; R.ctl.tyre = keep.tyre;
    stepLap(R);
    return true;
  }
  function pitStop(R, x, lap, tyre, sc, why) {
    const r = R.r, crew = x.M('pit');
    let still = Math.max(1.8, 2.05 + Math.abs(gauss(r)) * 1.1 * (1 - 0.25 * crew) - 0.12 * crew);
    const botched = r() < 0.12 * (1 - 0.3 * crew);
    if (botched) still += 3 + r() * 5;
    x.tyre = tyre; x.wear = 0; x.wrong = 0; x.pits++; x.pitLaps.push(lap); x.fresh = true;
    if (!x.used.includes(tyre)) x.used.push(tyre);
    if (x.c.me) R.events.push({ lap, type: botched ? 'loss' : 'pit', who: x.i, txt: `${botched ? 'arrêt au stand raté' : 'arrêt au stand'} (${still.toFixed(1).replace('.', ',')} s) → ${TYRES[tyre].name.toLowerCase()}${why ? ' · ' + why : ''}` });
    x.pitLoss[lap] = (sc ? 9 : 19) + still;
    return x.pitLoss[lap];
  }
  function stepLap(R) {
    const LAPS = R.LAPS, K = R.K || 1;
    if (R.lap >= LAPS) return R;
    R.snap = snapshot(R);
    const lap = ++R.lap, r = R.r, w = R.w, field = R.field, events = R.events;
    const wx = R.weather[lap], wet = wx.wet, left = LAPS - lap;
    const sc = R.scLap > 0 && lap >= R.scLap && lap < R.scLap + R.scLen, scIn = lap === R.scLap + 1;
    if (wx.rain > 0.05 && R.weather[lap - 1].rain <= 0.05) events.push({ lap, type: 'wx', txt: `${wxIcon(wx)} La pluie arrive sur le circuit !` });
    if (wx.rain <= 0.05 && R.weather[lap - 1].rain > 0.05) events.push({ lap, type: 'wx', txt: '🌤️ La pluie s\'arrête, la piste va sécher.' });
    if (trackState(wet) !== trackState(R.weather[lap - 1].wet)) events.push({ lap, type: 'wx', txt: `Piste ${trackState(wet).toLowerCase()}` });
    for (const x of field) {
      if (x.out) continue;
      const d = x.driver;
      if (x.outNext) { x.out = { lap, why: x.outNext }; events.push({ lap, type: 'dnf', who: x.i, txt: `abandonne (${x.outNext.toLowerCase()})` }); continue; }
      // abandons : fiabilité de la voiture et régularité du pilote
      const pMech = (0.1 * Math.pow(1 - x.c.car.rel / 100, 1.5) * (0.6 + w.rel * 2)) / LAPS;
      const slickWet = isSlick(x.tyre) && wet > 0.35;
      const pCrash = ((0.035 * (1 - d.cons / 100) * (0.5 + d.craft / 100)) / LAPS) * (1 + 5 * wet) * (slickWet ? 3 : 1) * (sc ? 0.3 : 1);
      const u = r();
      if (u < pMech) { x.out = { lap, why: ['Moteur', 'Boîte de vitesses', 'Hydraulique', 'Surchauffe', 'Freins'][Math.floor(r() * 5)] }; events.push({ lap, type: 'dnf', who: x.i, txt: `abandonne (${x.out.why.toLowerCase()})` }); continue; }
      if (u < pMech + pCrash) { x.out = { lap, why: 'Accident' }; events.push({ lap, type: 'dnf', who: x.i, txt: wet > 0.35 ? 'part en aquaplaning et tape le mur : abandon' : 'part dans le mur : abandon' }); continue; }
      const ty = x.M('tyre');
      let t = 90 - x.perf * 0.036 + gauss(r) * 0.95 * R.sqK * (1.5 - d.cons / 100) * (1 - 0.12 * ty);
      x.hold = false;
      // imprévus du tour : tour canon, petite faute, souci technique passager, débris
      if (!sc && lap > 1) {
        const v = r(), rare = r() < 1 / K;   // débris et pannes passagères : même nombre par course, quelle que soit sa longueur
        if (v < 0.05 * (d.pace / 88)) { t -= 0.7 + r() * 0.7; if (x.c.me) events.push({ lap, type: 'gain', who: x.i, txt: 'signe un tour canon' }); }
        else if (v < 0.05 * (d.pace / 88) + 0.07 * (1.6 - d.cons / 100)) { t += 1 + r() * 1.8; if (x.c.me) events.push({ lap, type: 'loss', who: x.i, txt: 'bloque une roue et élargit la trajectoire' }); }
        else if (v > 0.986 && rare) { t += (3 + r() * 4) * K; if (x.c.me) events.push({ lap, type: 'loss', who: x.i, txt: 'perd de la puissance pendant quelques virages (souci électrique)' }); }
        else if (v > 0.981 && left >= 2 && rare) { t += 6; x.wear = 1; events.push({ lap, type: x.c.me ? 'loss' : 'spin', who: x.i, txt: 'roule sur un débris : crevaison lente, il faut rentrer au stand' }); }
      }
      // piste mouillée : tout le monde ralentit, les pilotes combatifs s'en sortent mieux
      t += 7 * wet - (d.craft - 82) * 0.06 * wet;
      // pneus : composé, adéquation à la piste, usure
      t += tyreDelta(x.tyre, wet, x.wear);
      if (x.fresh) { t += 0.5; x.fresh = false; }               // tour de sortie des stands : pneus froids
      const mode = MODES[x.c.me ? R.ctl.mode : 'std'] || MODES.std; // rythme choisi au muret
      t += mode.dt;
      // Écarts de rythme ramenés à l'échelle d'une course de 20 tours : sur 50 à 78 tours, la hiérarchie pèserait sinon
      // 3 fois plus que les imprévus. Les pertes ponctuelles (départ, accrochages, arrêts) restent comptées en secondes réelles.
      t = 90 + (t - 90) / K;
      if (lap === 1) {
        const c1 = r();
        if (c1 < 0.012) { x.out = { lap, why: 'Accident' }; events.push({ lap, type: 'dnf', who: x.i, txt: 'est pris dans un accrochage au premier virage : abandon' }); continue; }
        if (c1 < 0.06) { t += 5 + r() * 5; events.push({ lap, type: x.c.me ? 'loss' : 'spin', who: x.i, txt: 'est touché au premier virage et repart loin' }); }
      }
      if (lap === 1) { const g = gauss(r) * 1.7 - 0.9 * x.M('launch'); t += g; if (x.c.me && x.M('launch') > 0.5 && g < -1.2) events.push({ lap, type: 'gain', who: x.i, txt: 'envol parfait au départ !' }); }
      if (lap > LAPS - 5 * K) t -= (0.2 * x.M('push')) / K;
      if (!sc && r() < (0.035 * (1 - d.cons / 100) * 3 * (1 - 0.2 * ty) * (1 + x.wear)) / K) { t += 4 + r() * 4; x.spins++; events.push({ lap, type: 'spin', who: x.i, txt: 'part en tête-à-queue et perd du temps' }); }
      // usure du train de pneus sur ce tour
      x.wear = Math.min(1, x.wear + TYRES[x.tyre].wear * R.abr * (1 - 0.1 * ty) * (!isSlick(x.tyre) && wet < 0.12 ? 2.6 : 1) * (sc ? 0.4 : 1) * mode.wear * (1 + gauss(r) * 0.06));
      // décision d'arrêt en fin de tour : consigne radio, météo, usure, voiture de sécurité, crevaison
      const need = idealTyre(wet);
      const mismatch = isSlick(x.tyre) ? wet >= 0.2 : need === 'dry' ? wet < 0.1 : (x.tyre === 'I' && wet > 0.72) || (x.tyre === 'W' && wet < 0.4);
      x.wrong = mismatch ? x.wrong + 1 : 0;
      const delay = Math.max(1, Math.round(3.4 - x.M('wx') + (x.i * 7 % 3) * 0.5));
      const dry = dryFor(left, R.abr, x);
      let pit = null, why = '';
      if (x.c.me && R.manual) {
        // le joueur décide : appel au stand, consigne radio acceptée, arrêt prévu au plan (s'il le suit toujours)
        const ps = R.ctl.plan ? R.plan.stops[x.pits] : null;
        if (R.ctl.skip === lap) { /* arrêt de ce tour annulé au muret */ }
        else if (R.ctl.box) { pit = R.ctl.tyre; why = 'appel du muret'; }
        else if (ps && ps.lap === lap) { pit = ps.tyre; why = 'arrêt prévu'; }
        if (R.ctl.skip === lap) pit = null;
        else if (x.wear >= 0.97 && left >= 1 && r() < 0.35) { pit = R.ctl.tyre; why = 'crevaison'; t += 9; }
        if (pit) { R.ctl.box = false; const nx = R.plan.stops[x.pits + 1]; if (nx && R.ctl.plan) R.ctl.tyre = nx.tyre; }
      } else if (x.radioPit) { pit = x.radioPit; why = 'consigne radio'; x.radioPit = null; }
      else if (x.wear >= 0.97 && left >= 1 && r() < 0.35) { pit = need === 'dry' ? dry : need; why = 'crevaison'; t += 9; }
      else if (x.noPit > 0) x.noPit--;
      else if (mismatch && x.wrong >= delay && left >= 2) { pit = need === 'dry' ? dry : need; why = 'changement de météo'; }
      else if (x.wear > x.thr && left >= 3) { pit = need === 'dry' ? dry : need; why = 'pneus usés'; }
      else if (scIn && !x.c.me && x.wear > 0.4 && left >= 4 && r() < 0.65) { pit = need === 'dry' ? dry : need; why = 'sous voiture de sécurité'; }
      else if (need === 'dry' && !ruleOk(x) && left >= 1 && left <= 2 + (x.i % 3)) { pit = dry; why = 'règle des 2 composés'; }
      if (pit) t += pitStop(R, x, lap, pit, sc || x.vsc, why);
      x.vsc = false;
      x.time += t; x.lapsDone = lap; x.tyreLog[lap] = x.tyre; x.pitted = !!pit;
      if (t < R.fastest.t && !sc) R.fastest = { t, who: x.i, lap };
    }
    if (!sc && lap > 1) {
      // Duels : une voiture qui en rattrape une autre tente le dépassement. Réussite selon la combativité des deux pilotes,
      // l'écart d'usure des pneus, le rythme choisi et le tracé (les longues lignes droites aident). Sinon elle reste bloquée derrière.
      const prev = R.prevOrder.map((i) => field[field.findIndex((y) => y.i === i)]).filter((y) => y && !y.out);
      for (let k = 1; k < prev.length; k++) {
        const a = prev[k - 1], b = prev[k];
        if (a.pitted || b.pitted || b.time >= a.time) continue;
        const pPass = clamp(0.42 + (b.driver.craft - a.driver.craft) / 70 + (a.wear - b.wear) * 0.6 + (b.c.me && R.ctl.mode === 'push' ? 0.12 : 0) - (a.c.me && R.ctl.mode === 'push' ? 0.08 : 0) + (w.speed - 0.35) * 0.7 + (a.time - b.time) * 0.06, 0.08, 0.92);
        if (r() < pPass) { if (b.c.me) events.push({ lap, type: 'gain', who: b.i, txt: `dépasse ${a.name} en piste` }); else if (a.c.me) events.push({ lap, type: 'loss', who: a.i, txt: `se fait dépasser par ${b.name}` }); }
        else { b.time = a.time + 0.25 + r() * 0.45; b.hold = true; const quiet = (b.c.me || a.c.me) && R.lastStuck != null && lap - R.lastStuck < 4; if ((b.c.me || a.c.me) && !quiet) R.lastStuck = lap; if (quiet) { /* déjà signalé */ } else if (b.c.me) events.push({ lap, type: 'spin', who: b.i, txt: `reste bloqué derrière ${a.name}` }); else if (a.c.me) events.push({ lap, type: 'gain', who: a.i, txt: `résiste à l'attaque de ${b.name}` }); }
      }
    }
    if (sc) {
      // voiture de sécurité : le peloton se regroupe (ceux qui se sont arrêtés repartent derrière)
      const running = field.filter((x) => !x.out).sort((a, b) => a.time - b.time);
      if (running.length) { const lead = running[0].time; running.forEach((x, k) => { x.time = lead + k * 0.6; }); }
      if (lap === R.scLap) events.push({ lap, type: 'sc', txt: 'Voiture de sécurité : le peloton est regroupé !' });
      if (lap === R.scLap + R.scLen - 1) events.push({ lap, type: 'wx', txt: '🟢 Fin de la voiture de sécurité : la course reprend.' });
    }
    if (lap >= LAPS) {
      // arrivée : +30 s pour qui a fini une course sèche sur un seul composé
      field.forEach((x) => { if (!x.out && !ruleOk(x)) { x.time += RULE_PENALTY; x.pen = RULE_PENALTY; if (x.c.me) events.push({ lap, type: 'loss', who: x.i, txt: `pénalité de ${RULE_PENALTY} s : un seul composé utilisé sur course sèche` }); } });
    }
    const order = field.filter((x) => !x.out).sort((a, b) => a.time - b.time).concat(field.filter((x) => x.out).sort((a, b) => b.out.lap - a.out.lap));
    const me = R.me;
    const pBefore = R.prevOrder.indexOf(me.i), pNow = order.indexOf(me);
    if (!me.out && lap > 1 && pNow < pBefore - 1) events.push({ lap, type: 'gain', who: me.i, txt: `gagne ${pBefore - pNow} place${pBefore - pNow > 1 ? 's' : ''} → P${pNow + 1}` });
    if (!me.out && lap > 1 && pNow > pBefore + 1) events.push({ lap, type: 'loss', who: me.i, txt: `recule en P${pNow + 1}` });
    R.prevOrder = order.map((x) => x.i);
    const leadT = order[0].time;
    R.laps.push(order.map((x) => ({ i: x.i, gap: x.out ? null : x.time - leadT, out: !!x.out, ty: x.tyre, wear: x.wear })));
    field.forEach((x) => { const a = R.gapArr[x.i]; a.push(x.out ? a[a.length - 1] : x.time - leadT); const b = R.tArr[x.i]; b.push(x.out ? b[b.length - 1] : x.time); });
    if (lap >= LAPS) R.final = R.laps[LAPS - 1].map((x, k) => ({ ...x, pos: k + 1 }));
    return R;
  }
  // Course complète sans intervention (équilibrage, fin automatique d'une course interrompue)
  function simulate(opts) {
    const R = opts.R || createRace(opts);
    R.manual = false; // plus personne au muret : l'ingénieur gère les arrêts
    if (R.me.radioPit == null && R.ctl.box) { R.me.radioPit = R.ctl.tyre; R.ctl.box = false; }
    while (R.lap < R.LAPS) stepLap(R);
    R.events.sort((a, b) => a.lap - b.lap);
    return R;
  }

  /* ---------- Radio stand : dilemmes proposés au joueur pendant la course ----------
     Chaque scénario : cond(c) = quand il a du sens · opts = choix, fx(c) renvoie l'effet :
     { dt : secondes perdues (+) ou gagnées (−), pit : composé à monter, wear : usure ajoutée, perf : niveau perdu, out : abandon, noPit : tours sans arrêt, msg } */
  const pct = (p) => clamp(p, 0.03, 0.97);
  const RADIO = [
    { id: 'sc', prio: 3, cond: (c) => c.sc && c.leftK >= 4,
      title: 'Voiture de sécurité', text: (c) => `Safety Car en piste. Un arrêt coûte moitié moins de temps maintenant. Vos ${TYRES[c.tyre].name.toLowerCase()} sont usés à ${c.wearPct} %, vous êtes P${c.pos}.`,
      opts: [{ l: 'Box maintenant (arrêt « gratuit »)', box: true, fx: (c) => ({ pit: c.R.ctl.tyre, msg: c.wear > 0.4 ? 'Arrêt à moindre coût : des pneus frais pour la relance.' : 'Vos pneus étaient encore bons : vous cédez des places pour rien.' }) },
        { l: 'Rester en piste, garder la position', fx: (c) => ({ noPit: 1, msg: c.wear > 0.55 ? 'Position conservée, mais vos pneus usés vont souffrir à la relance.' : 'Position conservée avec des pneus encore corrects.' }) }], def: 1 },
    { id: 'undercut', prio: 2, cond: (c) => c.gapAhead < 2.5 && c.wear > 0.25 && c.leftK >= 6 && !c.sc && c.need === 'dry' && isSlick(c.tyre),
      title: 'Fenêtre d\'undercut', text: (c) => `La voiture devant est à ${c.gapAhead.toFixed(1).replace('.', ',')} s. En vous arrêtant avant elle, des pneus neufs peuvent vous faire passer devant.`,
      opts: [{ l: 'Tenter l\'undercut maintenant', box: true, fx: (c) => { const ok = c.rnd() < pct(0.5 + 0.12 * c.x.M('pit')); return { pit: c.R.ctl.tyre, dt: ok ? -2.5 : 0.8, msg: ok ? 'Undercut réussi, tour de sortie canon !' : 'Trafic à la sortie des stands : l\'undercut échoue.' }; } },
        { l: 'Rester en piste', fx: () => ({ msg: 'On reste sur le plan prévu.' }) }], def: 1 },
    { id: 'flat', prio: 1, cond: (c) => c.wear > 0.3 && c.wear < 0.7 && c.leftK >= 4 && !c.sc,
      title: 'Plat sur un pneu', text: (c) => `Blocage de roue : un plat provoque des vibrations. Usure ${c.wearPct} %.`,
      opts: [{ l: 'Passer en mode Économie pour ménager le pneu', fx: () => ({ mode: 'save', dt: 0.3, msg: 'Rythme réduit, le pneu tiendra.' }) },
        { l: 'Garder le rythme', fx: () => ({ dt: 0.8, wear: 0.12, msg: 'Le pneu s\'abîme plus vite.' }) }], def: 0 },
    { id: 'cover', prio: 2, cond: (c) => c.gapBehind < 3 && c.wear > 0.2 && c.leftK >= 5 && !c.sc && isSlick(c.tyre) && c.need === 'dry',
      title: 'Undercut adverse', text: (c) => `La voiture derrière vous (${c.gapBehind.toFixed(1).replace('.', ',')} s) vient de rentrer au stand : elle tente l'undercut. Vos pneus sont usés à ${c.wearPct} %.`,
      opts: [{ l: 'Mode Attaque pour couvrir', fx: (c) => ({ mode: 'push', dt: -0.6, wear: 0.03, msg: c.wear < 0.6 ? 'Vos tours rapides annulent l\'undercut.' : 'Vous attaquez, mais vos pneus usés limitent le gain.' }) },
        { l: 'Rentrer au prochain passage', box: true, fx: (c) => ({ pit: c.R.ctl.tyre, msg: 'On répond tout de suite : arrêt au prochain passage.' }) },
        { l: 'Garder le rythme prévu', fx: (c) => (c.rnd() < 0.5 ? { dt: 1.5, msg: 'L\'undercut fonctionne : il ressortira devant.' } : { msg: 'Son tour de sortie est lent : la position est sauve.' }) }], def: 2 },
    { id: 'heat', prio: 1, cond: (c) => c.leftK >= 3,
      title: 'Surchauffe moteur', text: (c) => `Les températures grimpent dans le trafic. Fiabilité de votre voiture : ${Math.round(c.rel)}.`,
      opts: [{ l: 'Lever le pied quelques tours', fx: () => ({ dt: 2.0, msg: 'Températures sous contrôle.' }) },
        { l: 'Ouvrir le refroidissement', fx: (c) => (c.rnd() < 0.04 ? { out: 'Surchauffe', msg: 'Trop tard : le moteur lâche.' } : { dt: 0.9, msg: 'Un peu de traînée en plus, mais le moteur respire.' }) },
        { l: 'Continuer à fond', fx: (c) => (c.rnd() < pct(0.42 - c.rel / 250) ? { out: 'Surchauffe', msg: 'Le moteur n\'a pas tenu.' } : { dt: 0, msg: 'Ça passe : aucune seconde perdue.' }) }], def: 0 },
    { id: 'attack', prio: 1, cond: (c) => c.gapAhead < 1.2 && c.pos > 1 && !c.sc,
      title: 'Dans l\'aspiration', text: (c) => `Vous êtes à ${c.gapAhead.toFixed(1).replace('.', ',')} s de la P${c.pos - 1}, DRS ouvert. Combativité de votre pilote : ${Math.round(c.d.craft)}.`,
      opts: [{ l: 'Attaquer au freinage', fx: (c) => { const u = c.rnd(); if (u < 0.06) return { dt: 6, msg: 'Contact : aileron avant endommagé.' }; return u < 0.06 + pct(0.35 + (c.d.craft - 80) / 60) ? { dt: -(c.gapAhead + 0.6), msg: 'Dépassement superbe à l\'intérieur !' } : { dt: 1.8, wear: 0.06, msg: 'Blocage de roue, la tentative échoue.' }; } },
        { l: 'Attendre la prochaine zone DRS', fx: (c) => (c.rnd() < 0.55 ? { dt: -(c.gapAhead * 0.6 + 0.3), msg: 'Dépassement propre en ligne droite.' } : { dt: 0, msg: 'Il défend bien : pas d\'ouverture cette fois.' }) },
        { l: 'Rester derrière, gérer les pneus', fx: () => ({ dt: 0.3, wear: -0.05, msg: 'Vous préservez vos gommes pour plus tard.' }) }], def: 2 },
    { id: 'defend', prio: 1, cond: (c) => c.gapBehind < 1.2 && !c.sc,
      title: 'Sous pression', text: (c) => `Une voiture plus rapide est à ${c.gapBehind.toFixed(1).replace('.', ',')} s derrière vous.`,
      opts: [{ l: 'Défense agressive', fx: (c) => { const u = c.rnd(); if (u < 0.07) return { dt: 5, msg: 'Changement de ligne tardif : 5 s de pénalité.' }; return u < 0.07 + pct(0.4 + (c.d.craft - 80) / 50) ? { dt: 0, wear: 0.05, msg: 'Porte fermée, la position est gardée.' } : { dt: 1.5, wear: 0.05, msg: 'Il passe quand même, et vous avez abîmé vos pneus.' }; } },
        { l: 'Défendre proprement', fx: () => ({ dt: 0.6, msg: 'Défense propre, peu de temps perdu.' }) },
        { l: 'Laisser passer et suivre', fx: () => ({ dt: 1.0, wear: -0.04, msg: 'Vous prenez son aspiration sans user vos pneus.' }) }], def: 1 },
    { id: 'kerb', prio: 1, cond: (c) => c.leftK >= 3 && !c.sc,
      title: 'Fond plat menacé', text: () => 'Le fond plat tape sur les vibreurs. Ils font gagner du temps, mais peuvent l\'endommager.',
      opts: [{ l: 'Éviter les vibreurs', fx: () => ({ dt: 1.2, msg: 'Fond plat préservé.' }) },
        { l: 'Continuer à les attaquer', fx: (c) => (c.rnd() < 0.3 ? { perf: 6, msg: 'Fond plat endommagé : de l\'appui perdu jusqu\'à l\'arrivée.' } : { dt: -0.8, msg: 'Ça tient, et le chrono en profite.' }) }], def: 0 },
    { id: 'fuel', prio: 1, cond: (c) => c.leftK >= 4 && !c.sc,
      title: 'Consommation trop élevée', text: (c) => `Au rythme actuel, il manquera du carburant pour les ${c.left} derniers tours.`,
      opts: [{ l: 'Lever le pied en fin de ligne droite', fx: () => ({ dt: 1.6, msg: 'Consommation revenue dans la cible.' }) },
        { l: 'Ignorer et attaquer', fx: (c) => (c.rnd() < 0.3 ? { dt: 5, msg: 'Il faut économiser énormément en fin de course.' } : { dt: 0, msg: 'Le calcul était pessimiste : aucune perte.' }) }], def: 0 },
    { id: 'traffic', prio: 1, cond: (c) => c.pos <= 12 && !c.sc,
      title: 'Retardataires', text: () => 'Un groupe de voitures attardées vous bouche la vue avant un enchaînement lent.',
      opts: [{ l: 'Forcer le passage', fx: (c) => (c.rnd() < pct(0.55 + (c.d.craft - 80) / 80) ? { dt: -0.8, msg: 'Passé sans perdre le rythme.' } : { dt: 2, msg: 'Bloqué dans les virages lents.' }) },
        { l: 'Patienter jusqu\'à la ligne droite', fx: () => ({ dt: 0.7, msg: 'Un peu de temps perdu, aucun risque pris.' }) }], def: 1 },
    { id: 'mode', prio: 1, cond: (c) => c.leftK <= 6 && c.leftK >= 2 && !c.sc,
      title: 'Mode moteur', text: (c) => `Il reste ${c.left} tours. Le mode attaque donne de la puissance, mais sollicite la mécanique.`,
      opts: [{ l: 'Mode attaque', fx: (c) => (c.rnd() < pct((1 - c.rel / 100) * 0.3) ? { out: 'Moteur', msg: 'Le moteur casse.' } : { dt: -(1.5 + 0.4 * c.x.M('push')), msg: 'Puissance maximale jusqu\'à l\'arrivée.' }) },
        { l: 'Rester en mode course', fx: () => ({ msg: 'On assure l\'arrivée.' }) }], def: 1 },
    { id: 'brakes', prio: 1, cond: (c) => c.leftK >= 3 && !c.sc,
      title: 'Freins en surchauffe', text: () => 'Les disques avant dépassent la température limite.',
      opts: [{ l: 'Freiner plus tôt quelques tours', fx: () => ({ dt: 1.0, msg: 'Températures de freins stabilisées.' }) },
        { l: 'Ne rien changer', fx: (c) => (c.rnd() < pct(0.24 - (c.d.cons - 80) / 150) ? { dt: 5, msg: 'Blocage et tête-à-queue au freinage.' } : { dt: 0, msg: 'Les freins tiennent.' }) }], def: 0 },
    { id: 'vsc', prio: 1, cond: (c) => c.leftK >= 4 && !c.sc && c.wear > 0.2 && c.need === 'dry' && isSlick(c.tyre),
      title: 'Voiture de sécurité virtuelle', text: (c) => `Débris en piste : VSC pendant un tour. Un arrêt coûte bien moins cher maintenant. Usure ${c.wearPct} %, prochain composé choisi : ${TYRES[c.R.ctl.tyre].name}.`,
      opts: [{ l: 'Anticiper l\'arrêt sous VSC', box: true, fx: (c) => ({ pit: c.R.ctl.tyre, vsc: true, msg: 'Arrêt à moindre coût sous VSC.' }) },
        { l: 'Rester en piste', fx: () => ({ msg: 'Vous gardez votre position en piste.' }) }], def: 1 },
    { id: 'limits', prio: 1, cond: (c) => !c.sc,
      title: 'Limites de piste', text: () => 'Deux avertissements déjà : au troisième, c\'est la pénalité.',
      opts: [{ l: 'Garder de la marge', fx: () => ({ dt: 0.5, msg: 'Aucun nouvel avertissement.' }) },
        { l: 'Continuer à utiliser toute la piste', fx: (c) => (c.rnd() < 0.35 ? { dt: 5, msg: '5 s de pénalité pour limites de piste.' } : { dt: -0.4, msg: 'Les commissaires laissent passer.' }) }], def: 0 },
    { id: 'balance', prio: 1, cond: (c) => c.leftK >= 3 && !c.sc,
      title: 'Équilibre de la voiture', text: (c) => `Votre pilote se plaint de sous-virage. Régularité : ${Math.round(c.d.cons)}.`,
      opts: [{ l: 'Modifier les réglages au volant', fx: (c) => (c.rnd() < pct(0.5 + (c.d.cons - 80) / 60) ? { dt: -1.0, msg: 'Le nouveau réglage fonctionne.' } : { dt: 0.6, msg: 'Le réglage perturbe le pilote.' }) },
        { l: 'Ne rien toucher', fx: () => ({ msg: 'Le pilote s\'adapte.' }) }], def: 1 },
    { id: 'lead', prio: 2, cond: (c) => c.pos === 1 && c.gapBehind > 5 && c.leftK >= 3 && !c.sc,
      title: 'En tête avec de l\'avance', text: (c) => `Vous menez avec ${c.gapBehind.toFixed(1).replace('.', ',')} s d'avance. Usure ${c.wearPct} %.`,
      opts: [{ l: 'Gérer l\'écart et les pneus', fx: () => ({ dt: 1.0, wear: -0.08, msg: 'Vous gérez votre avance.' }) },
        { l: 'Creuser l\'écart', fx: () => ({ dt: -1.0, wear: 0.06, msg: 'L\'écart grandit, les pneus trinquent.' }) }], def: 0 },
  ];
  // Contexte de course vu depuis la voiture du joueur, après le tour qui vient de se terminer
  function radioCtx(R) {
    const LAPS = R.LAPS, x = R.me, lap = R.lap, wet = R.weather[lap].wet;
    const order = R.field.filter((y) => !y.out).sort((a, b) => a.time - b.time);
    const k = order.indexOf(x);
    const next = [1, 2, 3].map((d) => R.weather[Math.min(LAPS, lap + Math.round(d * (R.K || 1)))]);
    const wetMax = Math.max(...next.map((n) => n.wet)), wetMin = Math.min(...next.map((n) => n.wet));
    return { R, x, lap, left: LAPS - lap, leftK: (LAPS - lap) / (R.K || 1), wet, state: trackState(wet), need: idealTyre(wet), wetMax, wetMin,
      rainSoon: wetMax > wet + 0.12 || next.slice(0, 2).some((n) => n.rain > 0.2), drying: wet > 0.1 && wetMin < wet - 0.1 && next[1].rain < 0.1,
      sc: lap === R.scLap, tyre: x.tyre, wear: x.wear, wearPct: Math.round(x.wear * 100), pos: k + 1,
      gapAhead: k > 0 ? x.time - order[k - 1].time : 99, gapBehind: k < order.length - 1 ? order[k + 1].time - x.time : 99, d: x.driver, rel: x.c.car.rel, rnd: R.r };
  }
  function dilemmaFor(R) {
    if (!R.me || R.me.out || R.lap >= R.LAPS) return null;
    const c = radioCtx(R);
    const ok = RADIO.filter((s) => !R.asked.includes(s.id) && s.cond(c));
    if (!ok.length) return null;
    const top = Math.max(...ok.map((s) => s.prio));
    const pool = ok.filter((s) => s.prio === top);
    const s = pool[Math.floor(R.r() * pool.length)];
    R.asked.push(s.id);
    return { id: s.id, title: s.title, text: s.text(c), options: s.opts.map((o) => o.l), box: s.opts.map((o) => !!o.box), def: s.def, ctx: c, s };
  }
  // Applique le choix du joueur : écart de temps immédiat, arrêt au prochain passage, usure, casse…
  function applyChoice(R, dil, idx, tyre) {
    const x = R.me, o = dil.s.opts[idx] || dil.s.opts[dil.def];
    const e = o.fx(dil.ctx) || {};
    if (e.pit && tyre && TYRES[tyre]) e.pit = tyre; // composé choisi par le joueur
    const dt = e.dt || 0;
    x.time += dt;
    if (e.wear) x.wear = clamp(x.wear + e.wear, 0, 1);
    if (e.perf) x.perf -= e.perf;
    if (e.pit) { if (R.manual) { R.ctl.tyre = e.pit; R.ctl.box = true; } else x.radioPit = e.pit; x.vsc = !!e.vsc; }
    if (e.mode) R.ctl.mode = e.mode;
    if (e.noPit) x.noPit = e.noPit;
    if (e.out) x.outNext = e.out;
    const sec = Math.abs(dt).toFixed(1).replace('.', ',');
    const msg = (e.msg || '') + (dt < 0 ? ` +${sec} s gagnées.` : dt > 0 ? ` −${sec} s.` : '');
    R.events.push({ lap: R.lap, type: 'radio', who: x.i, txt: `📻 ${dil.title} — ${o.l} : ${msg}` });
    return { msg, dt, good: dt < 0 || (!dt && !e.out), choice: o.l, pit: e.pit || null, out: e.out || null };
  }

  // Récompenses selon la position et la ligue
  function rewards(pos, dnf, league) {
    const sc = lpScale(league), lp = dnf ? sc.dnf : sc.t[pos - 1] ?? sc.t[sc.t.length - 1];
    const pc = Math.round((dnf ? DNF_PC : PC_TABLE[pos - 1] ?? 2) * league.mult);
    return { lp, pc };
  }
  /* ---------- Sponsors : 10 entreprises fictives, du partenaire local au géant mondial ----------
     Contrat : un objectif sur un nombre de courses. Réussi avant la fin : prime. Raté à l'expiration : pénalité.
     Deux emplacements : principal (pontons et nez de la voiture) et secondaire (aileron arrière, prime et pénalité ×0,6).
     goal : { top: position à atteindre ou mieux, count: nombre de fois, races: durée du contrat } */
  const SPONSORS = [
    { id: 'voltrush', name: 'VoltRush', kind: 'Boisson énergisante', tier: 1, league: 0, color: '#c6ff00', ink: '#10140a', goal: { top: 12, count: 2, races: 5 }, sign: 15, reward: 90, penalty: 30 },
    { id: 'pixelforge', name: 'PixelForge', kind: 'Accessoires gaming', tier: 1, league: 0, color: '#8b5cf6', ink: '#ffffff', goal: { top: 10, count: 2, races: 6 }, sign: 20, reward: 120, penalty: 40 },
    { id: 'dumas', name: 'Garage Dumas', kind: 'Pièces auto, marque locale', tier: 1, league: 0, color: '#1f6feb', ink: '#ffffff', goal: { top: 15, count: 4, races: 6 }, sign: 10, reward: 80, penalty: 25 },
    { id: 'nexa', name: 'Nexa Telecom', kind: 'Télécoms et tech', tier: 2, league: 1, color: '#00b3a4', ink: '#ffffff', goal: { top: 8, count: 3, races: 8 }, sign: 40, reward: 240, penalty: 90 },
    { id: 'blockvault', name: 'Blockvault', kind: 'Crypto-actifs', tier: 2, league: 1, color: '#f7931a', ink: '#1a1000', goal: { top: 5, count: 1, races: 5 }, sign: 60, reward: 300, penalty: 150 },
    { id: 'torq', name: 'TORQ Parts', kind: 'Pièces auto internationales', tier: 2, league: 1, color: '#e11d48', ink: '#ffffff', goal: { top: 10, count: 5, races: 8 }, sign: 35, reward: 220, penalty: 80 },
    { id: 'aeris', name: 'Aeris Airways', kind: 'Compagnie aérienne', tier: 2, league: 1, color: '#0ea5e9', ink: '#ffffff', goal: { top: 6, count: 2, races: 8 }, sign: 50, reward: 280, penalty: 110 },
    { id: 'valcourt', name: 'Valcourt Genève', kind: 'Haute horlogerie', tier: 3, league: 2, color: '#0f3d2e', ink: '#e8d9a8', goal: { top: 3, count: 1, races: 10 }, sign: 100, reward: 600, penalty: 250 },
    { id: 'orbital', name: 'Orbital Dynamics', kind: 'Aérospatiale', tier: 3, league: 2, color: '#e5e7eb', ink: '#0b0d10', goal: { top: 3, count: 3, races: 10 }, sign: 140, reward: 850, penalty: 320 },
    { id: 'synapse', name: 'Synapse AI', kind: 'Intelligence artificielle mondiale', tier: 3, league: 2, color: '#111827', ink: '#7dd3fc', goal: { top: 1, count: 1, races: 10 }, sign: 160, reward: 1000, penalty: 400 },
  ];
  const SPONSOR_BY_ID = new Map(SPONSORS.map((s) => [s.id, s]));
  const SUB_K = 0.6; // emplacement secondaire : prime et pénalité réduites
  const goalText = (g) => (g.top === 1 ? `Gagner ${g.count > 1 ? g.count + ' courses' : 'une course'}` : `Finir ${g.count > 1 ? g.count + ' fois' : 'une fois'} dans le top ${g.top}`) + ` lors des ${g.races} prochaines courses`;
  const sponsorTerms = (s, slot) => { const k = slot === 'sub' ? SUB_K : 1; return { sign: Math.round(s.sign * k), reward: Math.round(s.reward * k), penalty: Math.round(s.penalty * k) }; };
  // Mise à jour d'un contrat après une course : renvoie { status: 'run' | 'win' | 'fail' }
  function sponsorAfterRace(c, pos, dnf) {
    const s = SPONSOR_BY_ID.get(c.id); if (!s) return { status: 'fail' };
    c.done++; if (!dnf && pos <= s.goal.top) c.hits++;
    if (c.hits >= s.goal.count) return { status: 'win' };
    if (c.done >= s.goal.races) return { status: 'fail' };
    return { status: 'run' };
  }
  /* ---------- Objectifs du jour ---------- */
  const OBJECTIVES = [
    { id: 'races3', txt: 'Disputer 3 courses aujourd\'hui', k: 'races', goal: 3, pc: 40 },
    { id: 'top5', txt: 'Terminer dans le top 5', k: 'top5', goal: 1, pc: 60 },
    { id: 'podium', txt: 'Monter sur le podium', k: 'podium', goal: 1, pc: 50 },
    { id: 'win', txt: 'Remporter une course', k: 'win', goal: 1, pc: 80 },
    { id: 'gain5', txt: 'Gagner 5 places en une seule course', k: 'gainMax', goal: 5, pc: 45 },
    { id: 'finish4', txt: 'Voir le drapeau à damier 2 fois', k: 'finish', goal: 2, pc: 50 },
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
    BIRTH, ageOf, growth, xpForRace, driverGrowth, withExperience, XP_PER_POINT,
    STAFF_ROLES, STAFF, staffOf, GARAGE, GARAGE_ZONES, GARAGE_BY_ID, garageCost, garageLevel, gCum, G_GAIN, VALUE, valueOf, TARIF, teamBonus, weatherTimeline, wxLabel, wxIcon,
    MAX_LV, LV_GAIN, LV_NAME, lvCum, partLevel, levelCost, MECH, tunnelChance, branchPackage, carRating, OBJECTIVES, dailyObjectives,
    forecastLaps, trend, ruleOk, RULE_PENALTY, tyreStatus, MODES, redoLap, dryFor,
    CLIMATE, climateOf, trackState, forecast, TYRES, isSlick, tyreDelta, DILEMMA_LAPS, dilemmaLaps, lapsOf, RACE_LAPS, planFor, REFILL_H, createRace, stepLap, dilemmaFor, applyChoice, RADIO,
    SPONSORS, SPONSOR_BY_ID, goalText, sponsorTerms, sponsorAfterRace, SUB_K,
    START_PC, RACES_PER_DAY, FIELD, LAPS, STATS, UP_STEP, UP_MAX, upCost, LEAGUES, leagueOf, nextLeague, LP_TABLE, lpScale, AGE_PRICE, driverValue, valueOfDriver, RESALE_K, XP_DIV, PC_TABLE,
    RD_CATS, RD_PARTS, RD_BY_ID, rdBranches, partState, partsBonus,
    market, carStats, withSetup, carScore, bestSetup, compat, circuitProfile, botField, simulate, rewards, hash, TALENT,
  };
})(globalThis.F1 = globalThis.F1 || {});
