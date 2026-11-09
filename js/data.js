/* Couche données : API Jolpica (successeur d'Ergast) -> snapshot hebdo -> secours.
   Tout est normalisé dans un objet "season" unique utilisé par le reste du site. */
(function (F1) {
  const API = 'https://api.jolpi.ca/ergast/f1';
  const TTL = 20 * 60 * 1000; // 20 min de cache navigateur
  const RAW_KEY = 'pitwall:raw:v1';

  /* ---------- Référentiels visuels ---------- */
  const TEAM_COLORS = {
    mclaren: '#FF8000', ferrari: '#E8002D', red_bull: '#3671C6', mercedes: '#27F4D2',
    aston_martin: '#229971', alpine: '#0093CC', williams: '#64C4FF', rb: '#6692FF',
    racing_bulls: '#6692FF', haas: '#B6BABD', sauber: '#52E252', audi: '#F4F4F4',
    cadillac: '#C9A227',
  };
  const TEAM_SHORT = {
    mclaren: 'McLaren', ferrari: 'Ferrari', red_bull: 'Red Bull', mercedes: 'Mercedes',
    aston_martin: 'Aston Martin', alpine: 'Alpine', williams: 'Williams', rb: 'Racing Bulls',
    racing_bulls: 'Racing Bulls', haas: 'Haas', sauber: 'Sauber', audi: 'Audi', cadillac: 'Cadillac',
  };
  // Niveau a priori (points/course) utilisé tant qu'il y a peu de courses disputées
  const TEAM_PRIOR = {
    mercedes: 15, mclaren: 15, ferrari: 13, red_bull: 12, aston_martin: 6, williams: 6,
    alpine: 4, rb: 4, racing_bulls: 4, haas: 4, audi: 3, sauber: 3, cadillac: 1.5,
  };
  const COUNTRY_ISO = {
    Australia: 'au', China: 'cn', Japan: 'jp', Bahrain: 'bh', 'Saudi Arabia': 'sa', USA: 'us',
    'United States': 'us', Canada: 'ca', Monaco: 'mc', Spain: 'es', Austria: 'at', UK: 'gb',
    'United Kingdom': 'gb', Belgium: 'be', Hungary: 'hu', Netherlands: 'nl', Italy: 'it',
    Azerbaijan: 'az', Singapore: 'sg', Mexico: 'mx', Brazil: 'br', Qatar: 'qa', UAE: 'ae',
    'United Arab Emirates': 'ae', Portugal: 'pt', Turkey: 'tr', France: 'fr', Germany: 'de',
    Russia: 'ru', Argentina: 'ar', 'South Africa': 'za', Korea: 'kr', India: 'in', Malaysia: 'my', Vietnam: 'vn',
  };
  const COUNTRY_FR = {
    Australia: 'Australie', China: 'Chine', Japan: 'Japon', Bahrain: 'Bahreïn', 'Saudi Arabia': 'Arabie saoudite',
    USA: 'États-Unis', 'United States': 'États-Unis', Canada: 'Canada', Monaco: 'Monaco', Spain: 'Espagne',
    Austria: 'Autriche', UK: 'Royaume-Uni', 'United Kingdom': 'Royaume-Uni', Belgium: 'Belgique', Hungary: 'Hongrie',
    Netherlands: 'Pays-Bas', Italy: 'Italie', Azerbaijan: 'Azerbaïdjan', Singapore: 'Singapour', Mexico: 'Mexique',
    Brazil: 'Brésil', Qatar: 'Qatar', UAE: 'Émirats arabes unis', 'United Arab Emirates': 'Émirats arabes unis',
    Portugal: 'Portugal', Malaysia: 'Malaisie', France: 'France', Germany: 'Allemagne', Turkey: 'Turquie',
  };
  const NAT_ISO = {
    British: 'gb', Dutch: 'nl', Monegasque: 'mc', Spanish: 'es', Mexican: 'mx', Australian: 'au', French: 'fr',
    German: 'de', Finnish: 'fi', Canadian: 'ca', Thai: 'th', Japanese: 'jp', Chinese: 'cn', Danish: 'dk',
    American: 'us', Italian: 'it', Argentine: 'ar', Argentinian: 'ar', Brazilian: 'br', 'New Zealander': 'nz',
    Swiss: 'ch', Austrian: 'at', Belgian: 'be', Polish: 'pl', Russian: 'ru', Swedish: 'se', Indian: 'in',
    Venezuelan: 've', Colombian: 'co', Estonian: 'ee', Irish: 'ie', Israeli: 'il',
  };
  const RACE_FR = {
    'Australian Grand Prix': "Grand Prix d'Australie", 'Chinese Grand Prix': 'Grand Prix de Chine',
    'Japanese Grand Prix': 'Grand Prix du Japon', 'Bahrain Grand Prix': 'Grand Prix de Bahreïn',
    'Saudi Arabian Grand Prix': "Grand Prix d'Arabie saoudite", 'Miami Grand Prix': 'Grand Prix de Miami',
    'Canadian Grand Prix': 'Grand Prix du Canada', 'Monaco Grand Prix': 'Grand Prix de Monaco',
    'Barcelona-Catalunya Grand Prix': 'Grand Prix de Barcelone-Catalogne', 'Spanish Grand Prix': "Grand Prix d'Espagne",
    'Austrian Grand Prix': "Grand Prix d'Autriche", 'British Grand Prix': 'Grand Prix de Grande-Bretagne',
    'Belgian Grand Prix': 'Grand Prix de Belgique', 'Hungarian Grand Prix': 'Grand Prix de Hongrie',
    'Dutch Grand Prix': 'Grand Prix des Pays-Bas', 'Italian Grand Prix': "Grand Prix d'Italie",
    'Azerbaijan Grand Prix': "Grand Prix d'Azerbaïdjan", 'Singapore Grand Prix': 'Grand Prix de Singapour',
    'United States Grand Prix': 'Grand Prix des États-Unis', 'Mexico City Grand Prix': 'Grand Prix de Mexico',
    'São Paulo Grand Prix': 'Grand Prix de São Paulo', 'Las Vegas Grand Prix': 'Grand Prix de Las Vegas',
    'Qatar Grand Prix': 'Grand Prix du Qatar', 'Abu Dhabi Grand Prix': "Grand Prix d'Abu Dhabi",
    'Emilia Romagna Grand Prix': "Grand Prix d'Émilie-Romagne", 'Portuguese Grand Prix': 'Grand Prix du Portugal', 'Barcelona Grand Prix': 'Grand Prix de Barcelone', 'Brazilian Grand Prix': 'Grand Prix du Brésil', 'Bahrain Grand Prix in Malaysia': 'Grand Prix de Bahreïn (en Malaisie)', 'Malaysian Grand Prix': 'Grand Prix de Malaisie', 'Turkish Grand Prix': 'Grand Prix de Turquie',
  };
  const STREET = ['monaco', 'marina_bay', 'baku', 'jeddah', 'vegas', 'albert_park', 'villeneuve', 'miami', 'madring'];

  F1.ref = { TEAM_COLORS, TEAM_SHORT, TEAM_PRIOR, COUNTRY_ISO, NAT_ISO, STREET };
  F1.teamColor = (id) => TEAM_COLORS[id] || '#9aa3b2';
  F1.teamShort = (id, name) => TEAM_SHORT[id] || name || id;
  F1.flagUrl = (iso, w = 80) => (iso ? `https://flagcdn.com/w${w}/${iso}.png` : '');
  F1.raceFr = (n) => RACE_FR[n] || n;
  F1.countryFr = (c) => COUNTRY_FR[c] || c;

  /* ---------- Cache & réseau ---------- */
  function cacheGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function cacheSet(key, d) { try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* quota */ } }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function getJSON(url, ms = 10000) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // Récupère un endpoint "Races" paginé et fusionne les courses découpées entre pages
  async function apiRaces(path, field) {
    const first = (await getJSON(`${API}/${path}.json?limit=100&offset=0`)).MRData;
    const pages = [first];
    const total = +first.total;
    const offsets = [];
    for (let o = 100; o < total; o += 100) offsets.push(o);
    for (let i = 0; i < offsets.length; i += 3) {
      await sleep(350);
      const batch = await Promise.all(offsets.slice(i, i + 3).map((o) => getJSON(`${API}/${path}.json?limit=100&offset=${o}`).then((j) => j.MRData)));
      pages.push(...batch);
    }
    const byRound = new Map();
    for (const p of pages) {
      for (const race of p.RaceTable.Races) {
        const ex = byRound.get(race.round);
        if (ex) ex[field] = ex[field].concat(race[field] || []);
        else byRound.set(race.round, { ...race, [field]: race[field] || [] });
      }
    }
    return [...byRound.values()].sort((a, b) => a.round - b.round);
  }

  // path = 'current' ou une année ('2027')
  async function loadLive(path) {
    const [sched, ds, cs] = await Promise.all([
      getJSON(`${API}/${path}.json?limit=100`),
      getJSON(`${API}/${path}/driverStandings.json?limit=100`),
      getJSON(`${API}/${path}/constructorStandings.json?limit=100`),
    ]);
    const races = sched.MRData.RaceTable.Races;
    if (!races.length) throw new Error('calendrier vide');
    let results = [], sprint = [];
    const started = races.some((r) => new Date(r.date + 'T' + (r.time || '12:00:00Z')).getTime() < Date.now());
    if (started) {
      await sleep(400);
      results = await apiRaces(`${path}/results`, 'Results');
      await sleep(400);
      try { sprint = await apiRaces(`${path}/sprint`, 'SprintResults'); } catch (e) { /* pas de sprint */ }
    }
    const dl = ds.MRData.StandingsTable.StandingsLists[0];
    const cl = cs.MRData.StandingsTable.StandingsLists[0];
    return {
      year: +(sched.MRData.RaceTable.season || races[0].season),
      schedule: races,
      driverStandings: dl ? dl.DriverStandings : [],
      constructorStandings: cl ? cl.ConstructorStandings : [],
      results, sprint, qualifying: [],
      updated: new Date().toISOString(),
    };
  }

  // Complète une saison qui n'a pas encore de classement (avant-saison) avec la grille embarquée
  function withEmbedded(raw) {
    const emb = F1.SEASONS && F1.SEASONS[raw.year];
    if (!emb) return raw;
    const out = { ...raw };
    if (!out.schedule || !out.schedule.length) out.schedule = emb.schedule;
    else out.schedule = out.schedule.map((r) => { const e = emb.schedule.find((x) => x.round === r.round && x.Circuit.circuitId === r.Circuit.circuitId); return e && e.tbc ? { ...r, tbc: true } : r; });
    if ((!out.driverStandings || !out.driverStandings.length) && !(out.results || []).length) out.driverStandings = emb.driverStandings;
    if (!out.constructorStandings || !out.constructorStandings.length) out.constructorStandings = emb.constructorStandings;
    return out;
  }

  async function loadRaw(path = 'current') {
    const key = RAW_KEY + ':' + path;
    const c = cacheGet(key);
    const ttl = path === 'current' ? TTL : 6 * 36e5;
    if (c && Date.now() - c.t < ttl) return { raw: withEmbedded(c.d), source: 'live' };
    try {
      const raw = await loadLive(path);
      cacheSet(key, raw);
      return { raw: withEmbedded(raw), source: 'live' };
    } catch (e) {
      console.warn(`[PITWALL] API live indisponible (${path}) :`, e.message);
    }
    // repli : fichiers régénérés automatiquement par la GitHub Action (data/snapshot.json, data/seasons/<année>.json)
    try {
      const file = path === 'current' ? 'data/snapshot.json' : `data/seasons/${path}.json`;
      const snap = await getJSON(file + '?v=' + Math.floor(Date.now() / 36e5), 6000);
      if (snap && snap.schedule && snap.schedule.length) return { raw: withEmbedded({ year: +snap.schedule[0].season, ...snap }), source: 'snapshot' };
    } catch (e) { /* pas de fichier hebdo */ }
    if (c) return { raw: withEmbedded(c.d), source: 'cache' };
    const year = path === 'current' ? embeddedYear() : +path;
    if (F1.SEASONS[year]) return { raw: F1.SEASONS[year], source: 'fallback' };
    return null;
  }
  // Saison embarquée la plus pertinente aujourd'hui (celle qui n'est pas encore terminée)
  function embeddedYear() {
    const ys = Object.keys(F1.SEASONS).map(Number).sort();
    for (const y of ys) { const last = F1.SEASONS[y].schedule.at(-1); if (new Date(last.date).getTime() + 2 * 864e5 > Date.now()) return y; }
    return ys.at(-1);
  }

  /* ---------- Normalisation ---------- */
  const at = (o) => (o && o.date ? new Date(o.date + 'T' + (o.time || '12:00:00Z')) : null);

  function normResult(r) {
    const pt = r.positionText;
    return {
      pos: +r.position, positionText: pt, classified: /^\d+$/.test(pt),
      driverId: r.Driver.driverId, teamId: r.Constructor.constructorId, grid: +r.grid, laps: +r.laps,
      status: r.status, ms: r.Time && r.Time.millis ? +r.Time.millis : null, timeText: r.Time ? r.Time.time : null,
      fastestRank: r.FastestLap && r.FastestLap.rank ? +r.FastestLap.rank : null,
      fastestTime: r.FastestLap && r.FastestLap.Time ? r.FastestLap.Time.time : null,
      points: +r.points || 0,
    };
  }
  function normQuali(q) {
    return { pos: +q.position, driverId: q.Driver.driverId, teamId: q.Constructor.constructorId, q1: q.Q1, q2: q.Q2, q3: q.Q3 };
  }

  function normalize(raw, source) {
    const drivers = new Map();
    const teams = new Map();
    const addDriver = (D, teamId) => {
      const ex = drivers.get(D.driverId) || {};
      drivers.set(D.driverId, {
        id: D.driverId, code: D.code || D.familyName.slice(0, 3).toUpperCase(), number: D.permanentNumber || ex.number || '',
        given: D.givenName, family: D.familyName, nationality: D.nationality, iso: NAT_ISO[D.nationality] || '',
        teamId: teamId || ex.teamId, tbc: ex.tbc, wiki: D.url || ex.wiki, points: ex.points || 0, position: ex.position || 99, wins: ex.wins || 0,
      });
    };
    const addTeam = (C) => {
      if (!teams.has(C.constructorId)) teams.set(C.constructorId, { id: C.constructorId, name: C.name, short: F1.teamShort(C.constructorId, C.name), nationality: C.nationality, color: F1.teamColor(C.constructorId), points: 0, position: 99, wins: 0 });
    };

    const resByRound = new Map();
    for (const r of raw.results || []) {
      for (const x of r.Results) { addTeam(x.Constructor); addDriver(x.Driver, x.Constructor.constructorId); }
      resByRound.set(+r.round, r.Results.map(normResult).sort((a, b) => a.pos - b.pos));
    }
    const sprintByRound = new Map();
    for (const r of raw.sprint || []) {
      for (const x of r.SprintResults) { addTeam(x.Constructor); if (!drivers.has(x.Driver.driverId)) addDriver(x.Driver, x.Constructor.constructorId); }
      sprintByRound.set(+r.round, r.SprintResults.map(normResult).sort((a, b) => a.pos - b.pos));
    }
    const qualiByRound = new Map();
    for (const r of raw.qualifying || []) qualiByRound.set(+r.round, r.QualifyingResults.map(normQuali).sort((a, b) => a.pos - b.pos));

    for (const s of raw.driverStandings || []) {
      const cons = s.Constructors || [];
      cons.forEach(addTeam);
      const ex = drivers.get(s.Driver.driverId);
      addDriver(s.Driver, (ex && ex.teamId) || (cons.length ? cons[cons.length - 1].constructorId : null));
      const d = drivers.get(s.Driver.driverId);
      d.points = +s.points; d.position = +s.position || 99; d.wins = +s.wins; d.tbc = !!s.tbc;
    }
    for (const s of raw.constructorStandings || []) {
      addTeam(s.Constructor);
      const t = teams.get(s.Constructor.constructorId);
      t.points = +s.points; t.position = +s.position || 99; t.wins = +s.wins;
    }

    const races = (raw.schedule || []).map((r) => {
      const round = +r.round;
      const sessions = [];
      const push = (key, label, o) => { const d = at(o); if (d) sessions.push({ key, label, date: d }); };
      push('fp1', 'Essais libres 1', r.FirstPractice);
      push('fp2', 'Essais libres 2', r.SecondPractice);
      push('fp3', 'Essais libres 3', r.ThirdPractice);
      push('sq', 'Qualif. sprint', r.SprintQualifying || r.SprintShootout);
      push('sprint', 'Sprint', r.Sprint);
      push('quali', 'Qualifications', r.Qualifying);
      push('race', 'Course', r);
      sessions.sort((a, b) => a.date - b.date);
      const country = r.Circuit.Location.country;
      return {
        round, season: +r.season, name: r.raceName, nameFr: F1.raceFr(r.raceName),
        circuitId: r.Circuit.circuitId, circuit: r.Circuit.circuitName,
        locality: r.Circuit.Location.locality, country, countryFr: F1.countryFr(country), iso: COUNTRY_ISO[country] || '',
        lat: +r.Circuit.Location.lat, long: +r.Circuit.Location.long,
        date: at(r), qualiDate: at(r.Qualifying), sprintDate: at(r.Sprint), sprint: !!r.Sprint,
        street: STREET.includes(r.Circuit.circuitId), tbc: !!r.tbc,
        sessions,
        results: resByRound.get(round) || null,
        sprintResults: sprintByRound.get(round) || null,
        qualifying: qualiByRound.get(round) || null,
      };
    });

    const now = Date.now();
    const done = races.filter((r) => r.results);
    const lastDone = done.length ? done[done.length - 1] : null;
    const next = races.find((r) => !r.results && r.date && r.date.getTime() > now) || null;
    const pending = races.find((r) => !r.results && r.date && r.date.getTime() <= now && now - r.date.getTime() < 5 * 864e5) || null;

    // Grille actuelle : pilotes de la dernière course disputée, sinon classement
    let entrants;
    if (lastDone) entrants = lastDone.results.map((x) => { const d = drivers.get(x.driverId); d.teamId = x.teamId; return d.id; });
    else entrants = [...drivers.values()].map((d) => d.id);
    entrants = entrants.filter((id) => drivers.get(id) && drivers.get(id).teamId);

    // Points calculés depuis les résultats (fiable même si le classement API a du retard)
    const ptsByDriver = {};
    for (const r of races) {
      for (const x of (r.results || []).concat(r.sprintResults || [])) ptsByDriver[x.driverId] = (ptsByDriver[x.driverId] || 0) + x.points;
    }
    for (const d of drivers.values()) if (ptsByDriver[d.id] != null && ptsByDriver[d.id] > d.points) d.points = ptsByDriver[d.id];

    const season = {
      year: races.length ? races[0].season : raw.year || new Date().getFullYear(),
      source, updated: raw.updated ? new Date(raw.updated) : null,
      races, drivers, teams, entrants, next, pending, lastDone, doneCount: done.length,
      finished: races.length > 0 && races.every((r) => r.results),
    };
    return season;
  }

  // Niveau des écuries pour l'avant-saison : points/voiture/course de la saison précédente, régressés vers la moyenne
  function priorsFrom(prev) {
    if (!prev || prev.doneCount < 3) return null;
    const out = {};
    for (const t of prev.teams.values()) out[t.id] = 2 + 0.8 * (t.points / (2 * prev.doneCount));
    return out;
  }

  /* Charge la saison active (celle sur laquelle on parie) et, si elle existe, la saison suivante.
     Quand la saison en cours est terminée, la saison suivante devient automatiquement la saison active. */
  async function loadSeason() {
    const cur = await loadRaw('current');
    let season = normalize(cur.raw, cur.source);
    const nextYear = season.year + 1;
    let upcoming = null;
    if (F1.SEASONS[nextYear] || season.finished || !season.next) {
      const nx = await loadRaw(String(nextYear));
      if (nx) upcoming = normalize(nx.raw, nx.source === 'fallback' && cur.source !== 'fallback' ? 'embedded' : nx.source);
    }
    if (upcoming && upcoming.races.length) upcoming.priors = priorsFrom(season);
    // bascule : plus aucun GP à venir dans la saison courante -> la suivante devient active
    if (upcoming && !season.next && !season.pending && upcoming.next) {
      upcoming.prev = season;
      return upcoming;
    }
    // saison "current" en avant-saison (janvier-mars) : priors depuis la saison précédente
    if (season.doneCount === 0 && season.source !== 'fallback') {
      const pv = await loadRaw(String(season.year - 1));
      if (pv && pv.source !== 'fallback') { season.prev = normalize(pv.raw, pv.source); season.priors = priorsFrom(season.prev); }
    }
    season.upcoming = upcoming && upcoming.year > season.year ? upcoming : null;
    return season;
  }

  // Saison d'une année précise (pour régler d'anciens paris)
  async function loadYear(year) {
    const r = await loadRaw(String(year));
    return r ? normalize(r.raw, r.source) : null;
  }

  // Qualifications d'une manche (chargées à la demande)
  async function loadQualifying(season, race) {
    if (!race || race.qualifying) return race && race.qualifying;
    if (season.source === 'fallback') return null;
    if (race.qualiDate && race.qualiDate.getTime() + 75 * 60e3 > Date.now()) return null; // pas encore disputées
    const key = `pitwall:q:${season.year}:${race.round}`;
    const c = cacheGet(key);
    if (c && (c.d || Date.now() - c.t < 10 * 60e3)) { race.qualifying = c.d; return c.d; }
    try {
      const j = await getJSON(`${API}/${season.year}/${race.round}/qualifying.json`);
      const r = j.MRData.RaceTable.Races[0];
      const q = r ? r.QualifyingResults.map(normQuali).sort((a, b) => a.pos - b.pos) : null;
      cacheSet(key, q);
      race.qualifying = q;
      return q;
    } catch (e) { return null; }
  }

  // Météo prévue (Open-Meteo, gratuit, sans clé)
  async function loadWeather(race) {
    if (!race || !race.date) return null;
    const diff = race.date.getTime() - Date.now();
    if (diff > 15 * 864e5 || diff < -864e5) return null;
    const key = `pitwall:w:${race.season}:${race.round}`;
    const c = cacheGet(key);
    if (c && Date.now() - c.t < 3 * 36e5) return c.d;
    try {
      const day = race.date.toISOString().slice(0, 10);
      const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${race.lat}&longitude=${race.long}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&start_date=${day}&end_date=${day}&timezone=UTC`, 7000);
      const h = race.date.getUTCHours();
      const w = {
        temp: Math.round(j.hourly.temperature_2m[h]), rain: j.hourly.precipitation_probability[h] ?? 0,
        wind: Math.round(j.hourly.wind_speed_10m[h]), code: j.hourly.weather_code[h],
      };
      cacheSet(key, w);
      return w;
    } catch (e) { return null; }
  }

  function clearCache() {
    try { Object.keys(localStorage).filter((k) => k.startsWith('pitwall:raw') || k.startsWith('pitwall:q:')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* */ }
  }

  // Date du dernier passage de la mise à jour automatique
  async function loadMeta() {
    try { return await getJSON('data/meta.json?v=' + Math.floor(Date.now() / 36e5), 5000); } catch (e) { return null; }
  }

  F1.data = { loadMeta, loadSeason, loadYear, loadQualifying, loadWeather, normalize, clearCache, embeddedYear };
})(globalThis.F1 = globalThis.F1 || {});
