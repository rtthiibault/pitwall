/* PITWALL — Championnat du monde d'endurance (WEC).
   Le WEC n'a pas d'API publique gratuite : le calendrier et le plateau sont intégrés ici,
   et les résultats sont lus dans data/wec/<année>.json (à compléter après chaque course).
   La saison produite a la même forme que celle de la F1 : tout le moteur de paris est réutilisé.
   Entité pariée : une voiture de la catégorie Hypercar (son équipage). */
(function (F1) {
  /* ---------- Constructeurs Hypercar ---------- */
  // prior : niveau a priori (échelle « points par course »), tiré du championnat constructeurs 2026 pour les marques présentes
  const MAKERS = {
    w_toyota: { name: 'Toyota Gazoo Racing', short: 'Toyota', color: '#F2F2F2', nat: 'Japanese', prior: 12.5 },
    w_bmw: { name: 'BMW M Team WRT', short: 'BMW', color: '#3D7BFF', nat: 'German', prior: 10.6 },
    w_ferrari: { name: 'Ferrari AF Corse', short: 'Ferrari', color: '#E8002D', nat: 'Italian', prior: 9.6 },
    w_cadillac: { name: 'Cadillac Hertz Team JOTA', short: 'Cadillac', color: '#D4AF37', nat: 'American', prior: 9.2 },
    w_aston: { name: 'Aston Martin THOR Team', short: 'Aston Martin', color: '#1F9D7A', nat: 'British', prior: 5 },
    w_peugeot: { name: 'Peugeot TotalEnergies', short: 'Peugeot', color: '#B6F500', nat: 'French', prior: 4.2 },
    w_genesis: { name: 'Genesis Magma Racing', short: 'Genesis', color: '#D9541E', nat: 'Korean', prior: 3.4 },
    w_mclaren: { name: 'McLaren', short: 'McLaren', color: '#FF8000', nat: 'British', prior: 4.6, rookie: true },
    w_ford: { name: 'Ford Racing', short: 'Ford', color: '#58B4FF', nat: 'American', prior: 4.1, rookie: true },
    w_alpine: { name: 'Alpine Endurance Team', short: 'Alpine', color: '#0093CC', nat: 'French', prior: 7 },
  };
  // la balance de performance resserre la hiérarchie : on rapproche les niveaux de la moyenne
  Object.values(MAKERS).forEach((m) => { m.prior = Math.round((6 + 0.55 * (m.prior - 6)) * 10) / 10; });
  Object.entries(MAKERS).forEach(([id, m]) => { F1.ref.TEAM_COLORS[id] = m.color; F1.ref.TEAM_SHORT[id] = m.short; F1.ref.TEAM_PRIOR[id] = m.prior; });

  /* ---------- Plateau : [n°, constructeur, modèle, équipage, à confirmer ?] ---------- */
  const C = (num, maker, model, crew, tbc) => ({ num, maker, model, crew, tbc: !!tbc });
  const ENTRIES = {
    2027: [
      C('8', 'w_toyota', 'TR010 Hybrid', ['Sébastien Buemi', 'Brendon Hartley', 'Ryō Hirakawa']),
      C('7', 'w_toyota', 'TR010 Hybrid', ['Mike Conway', 'Kamui Kobayashi', 'Nyck de Vries']),
      C('15', 'w_bmw', 'M Hybrid V8', ['Kevin Magnussen', 'Raffaele Marciello', 'Dries Vanthoor']),
      C('20', 'w_bmw', 'M Hybrid V8', ['Robin Frijns', 'René Rast', 'Sheldon van der Linde']),
      C('50', 'w_ferrari', '499P', ['Antonio Fuoco', 'Miguel Molina', 'Nicklas Nielsen']),
      C('51', 'w_ferrari', '499P', ['Alessandro Pier Guidi', 'James Calado', 'Antonio Giovinazzi']),
      C('38', 'w_cadillac', 'V-Series.R', ['Earl Bamber', 'Sébastien Bourdais', 'Jack Aitken']),
      C('12', 'w_cadillac', 'V-Series.R', ['Alex Lynn', 'Will Stevens', 'Norman Nato']),
      C('007', 'w_aston', 'Valkyrie', ['Harry Tincknell', 'Tom Gamble', 'Ross Gunn']),
      C('009', 'w_aston', 'Valkyrie', ['Alex Riberas', 'Marco Sørensen', 'Roman De Angelis']),
      C('93', 'w_peugeot', '9X8', ['Paul di Resta'], true),
      C('94', 'w_peugeot', '9X8', ['Loïc Duval'], true),
      C('17', 'w_genesis', 'GMR-001', ['André Lotterer', 'Pipo Derani', 'Mathys Jaubert']),
      C('19', 'w_genesis', 'GMR-001', ['Mathieu Jaminet', 'Paul-Loup Chatin', 'Daniel Juncadella']),
      // nouveaux constructeurs 2027 : numéros et répartition des équipages pas encore officialisés
      C('M1', 'w_mclaren', 'MCL-HY', [], true),
      C('M2', 'w_mclaren', 'MCL-HY', [], true),
      C('F1', 'w_ford', 'Hypercar LMDh', ['Mike Rockenfeller', 'Sebastian Priaulx', 'Logan Sargeant'], true),
      C('F2', 'w_ford', 'Hypercar LMDh', ['Matt Campbell', 'Nick Yelloly', 'Tom Blomqvist'], true),
    ],
  };

  /* ---------- Calendriers : [manche, nom, circuit, ville, pays, lat, long, départ UTC, durée h, coefficient de points] ---------- */
  const R = (round, name, circuitId, circuit, locality, country, lat, long, start, hours, mult) => ({ round, name, circuitId, circuit, locality, country, lat, long, start, hours, mult });
  const CALENDAR = {
    2027: [
      R(1, '1812 km du Qatar', 'losail', 'Lusail International Circuit', 'Lusail', 'Qatar', 25.49, 51.454, '2027-03-27T11:00:00Z', 10, 1.5),
      R(2, '6 Heures d\'Imola', 'imola', 'Autodromo Enzo e Dino Ferrari', 'Imola', 'Italy', 44.344, 11.713, '2027-04-11T11:00:00Z', 6, 1),
      R(3, '6 Heures de Silverstone', 'silverstone', 'Silverstone Circuit', 'Silverstone', 'UK', 52.079, -1.017, '2027-04-25T11:00:00Z', 6, 1),
      R(4, '6 Heures de Spa-Francorchamps', 'spa', 'Circuit de Spa-Francorchamps', 'Stavelot', 'Belgium', 50.437, 5.971, '2027-05-15T12:00:00Z', 6, 1),
      R(5, '24 Heures du Mans', 'lemans', 'Circuit de la Sarthe', 'Le Mans', 'France', 47.956, 0.208, '2027-06-12T14:00:00Z', 24, 2),
      R(6, '6 Heures de São Paulo', 'interlagos', 'Autódromo José Carlos Pace', 'São Paulo', 'Brazil', -23.701, -46.697, '2027-07-11T14:30:00Z', 6, 1),
      R(7, 'Lone Star Le Mans', 'americas', 'Circuit of the Americas', 'Austin', 'USA', 30.133, -97.641, '2027-09-12T18:00:00Z', 6, 1),
      R(8, '6 Heures de Fuji', 'fuji', 'Fuji Speedway', 'Oyama', 'Japan', 35.372, 138.927, '2027-09-26T02:00:00Z', 6, 1),
      R(9, '8 Heures de Bahreïn', 'bahrain', 'Bahrain International Circuit', 'Sakhir', 'Bahrain', 26.032, 50.511, '2027-11-06T11:00:00Z', 8, 1.5),
    ],
  };

  /* ---------- Saison 2026 (terminée) : classements finaux connus, sert de référence ---------- */
  const PREV = {
    year: 2026, rounds: 8,
    makers: { w_toyota: 215, w_bmw: 172, w_ferrari: 150, w_cadillac: 143, w_alpine: 122, w_aston: 58, w_peugeot: 42, w_genesis: 14 },
    // équipages dont le total final est connu avec certitude
    crews: [['8', 'w_toyota', 114, ['Sébastien Buemi', 'Brendon Hartley', 'Ryō Hirakawa']], ['7', 'w_toyota', 97, ['Mike Conway', 'Kamui Kobayashi', 'Nyck de Vries']]],
  };

  /* ---------- LMGT3 : pari par marque (plateau provisoire, catégorie à balance de performance) ---------- */
  const GT3 = [['corvette', 'Corvette', 0.16, '#FFD100'], ['bmw', 'BMW', 0.14, '#3D7BFF'], ['ferrari', 'Ferrari', 0.13, '#E8002D'], ['porsche', 'Porsche', 0.13, '#C9CED8'],
    ['mclaren', 'McLaren', 0.11, '#FF8000'], ['aston', 'Aston Martin', 0.1, '#1F9D7A'], ['lexus', 'Lexus', 0.09, '#8E8E93'], ['ford', 'Ford', 0.07, '#58B4FF'], ['mercedes', 'Mercedes-AMG', 0.07, '#27F4D2']];

  const PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const carId = (num) => 'wec_' + String(num).toLowerCase();
  const surname = (n) => n.split(' ').slice(1).join(' ') || n;

  function entities(list) {
    const drivers = new Map(), teams = new Map();
    for (const e of list) {
      const m = MAKERS[e.maker];
      if (!teams.has(e.maker)) teams.set(e.maker, { id: e.maker, name: m.name, short: m.short, nationality: m.nat, color: m.color, points: 0, position: 99, wins: 0, rookie: !!m.rookie });
      const placeholder = /^[MF]\d$/.test(e.num); // numéro pas encore attribué
      const label = placeholder ? `${m.short} n°${e.num.slice(1)}` : `${m.short} #${e.num}`;
      drivers.set(carId(e.num), {
        id: carId(e.num), code: placeholder ? e.num : '#' + e.num, number: placeholder ? '?' : e.num, given: '', family: label, nationality: m.nat, iso: F1.ref.NAT_ISO[m.nat] || (m.nat === 'Korean' ? 'kr' : ''),
        teamId: e.maker, tbc: e.tbc, points: 0, position: 99, wins: 0, model: e.model, crew: e.crew,
        crewTxt: e.crew.length ? e.crew.map(surname).join(' · ') + (e.tbc ? ' · à confirmer' : '') : 'Équipage à confirmer',
      });
    }
    return { drivers, teams };
  }

  // Convertit une manche du fichier de résultats en tableau de résultats « façon F1 »
  function raceResults(res, race, drivers) {
    if (!res || !Array.isArray(res.hypercar) || !res.hypercar.length) return null;
    const out = [];
    const lap = typeof res.margin === 'string' && /tour|lap/i.test(res.margin);
    const push = (num, pos, classified) => {
      const d = drivers.get(carId(num)); if (!d) return;
      const pts = classified ? (PTS[pos - 1] || 0) * race.mult + (String(res.pole) === String(num) ? 1 : 0) : (String(res.pole) === String(num) ? 1 : 0);
      out.push({
        pos, positionText: classified ? String(pos) : 'R', classified, driverId: d.id, teamId: d.teamId,
        grid: res.grid && res.grid[num] ? +res.grid[num] : String(res.pole) === String(num) ? 1 : 0, laps: 0,
        status: classified ? (pos === 2 && lap ? '+1 Lap' : 'Classée') : 'Abandon',
        ms: null, timeText: pos === 1 ? (race.hours + ' h') : pos === 2 && res.margin != null ? (lap ? '+1 tour' : '+' + res.margin) : null,
        fastestRank: String(res.fastest) === String(num) ? 1 : null, fastestTime: null, points: pts,
      });
    };
    res.hypercar.forEach((num, i) => push(num, i + 1, true));
    (res.dnf || []).forEach((num, i) => push(num, res.hypercar.length + i + 1, false));
    return out.length >= 2 ? out : null;
  }

  function build(year, file) {
    const { drivers, teams } = entities(ENTRIES[year]);
    const rounds = (file && file.rounds) || {};
    const races = CALENDAR[year].map((c) => {
      const date = new Date(c.start);
      const day = 864e5, h = 36e5;
      const quali = new Date(date.getTime() - (c.hours === 24 ? 2 * day - 4 * h : day - 3 * h)); // Hyperpole la veille (l'avant-veille au Mans)
      const sessions = [
        { key: 'fp1', label: 'Essais libres', date: new Date(date.getTime() - (c.hours === 24 ? 3 : 2) * day) },
        { key: 'quali', label: 'Qualifs & Hyperpole', date: quali },
        { key: 'race', label: 'Départ', date },
        { key: 'end', label: 'Arrivée', date: new Date(date.getTime() + c.hours * h) },
      ];
      const res = rounds[c.round];
      const results = raceResults(res, c, drivers);
      return {
        round: c.round, season: year, name: c.name, nameFr: c.name, circuitId: c.circuitId, circuit: c.circuit, locality: c.locality,
        country: c.country, countryFr: F1.countryFr(c.country), iso: F1.ref.COUNTRY_ISO[c.country] || '', lat: c.lat, long: c.long,
        date, qualiDate: quali, sprintDate: null, sprint: false, street: false, tbc: false, sessions,
        hours: c.hours, mult: c.mult, dnf: c.hours >= 24 ? 0.2 : c.hours >= 8 ? 0.11 : 0.08,
        marginLines: [10, 30, 60], marginScale: c.hours >= 24 ? 14 : 7,
        results, sprintResults: null,
        qualifying: results ? null : res && res.pole && !res.hypercar ? [{ pos: 1, driverId: carId(res.pole), teamId: (drivers.get(carId(res.pole)) || {}).teamId }] : null,
        gt3: res && res.lmgt3 ? String(res.lmgt3).toLowerCase() : null,
      };
    });
    // points : équipages = somme de leurs résultats ; constructeurs = meilleure voiture de la marque à chaque manche
    for (const r of races) {
      if (!r.results) continue;
      const best = {};
      for (const x of r.results) {
        const d = drivers.get(x.driverId); d.points += x.points; if (x.pos === 1 && x.classified) d.wins++;
        if (x.classified && !(x.teamId in best)) best[x.teamId] = (PTS[Object.keys(best).length] || 0) * r.mult;
      }
      for (const t in best) { teams.get(t).points += best[t]; }
      const w = r.results[0]; if (w && w.classified) teams.get(w.teamId).wins++;
    }
    const st = file && file.standings;
    if (st && st.crews) for (const n in st.crews) { const d = drivers.get(carId(n)); if (d) d.points = +st.crews[n]; }
    if (st && st.manufacturers) for (const t in st.manufacturers) { const x = teams.get(t.startsWith('w_') ? t : 'w_' + t); if (x) x.points = +st.manufacturers[t]; }
    [...drivers.values()].sort((a, b) => b.points - a.points).forEach((d, i) => { d.position = i + 1; });
    [...teams.values()].sort((a, b) => b.points - a.points).forEach((t, i) => { t.position = i + 1; });

    const now = Date.now();
    const done = races.filter((r) => r.results);
    const lastDone = done.length ? done[done.length - 1] : null;
    const endOf = (r) => r.date.getTime() + r.hours * 36e5;
    const next = races.find((r) => !r.results && r.date.getTime() > now) || null;
    const pending = races.find((r) => !r.results && r.date.getTime() <= now && now - endOf(r) < 10 * 864e5) || null;
    const priors = {}; teams.forEach((t) => { priors[t.id] = MAKERS[t.id].prior; });
    return {
      series: 'wec', key: 'wec-' + year, year, source: file ? 'wecfile' : 'wecembedded', updated: file && file.updated ? new Date(file.updated) : null,
      races, drivers, teams, entrants: [...drivers.keys()], next, pending, lastDone, doneCount: done.length,
      finished: races.every((r) => r.results), priors, upcoming: null, prev: null, gt3: GT3,
    };
  }

  // Saison 2026 résumée (classements finaux), pour le rappel du champion en avant-saison
  function prevSeason() {
    const drivers = new Map(), teams = new Map();
    Object.entries(PREV.makers).forEach(([id, pts], i) => { const m = MAKERS[id]; teams.set(id, { id, name: m.name, short: m.short, color: m.color, points: pts, position: i + 1, wins: 0 }); });
    PREV.crews.forEach(([num, maker, pts, crew], i) => drivers.set(carId(num), { id: carId(num), code: '#' + num, number: num, given: '', family: `${MAKERS[maker].short} #${num}`, teamId: maker, points: pts, position: i + 1, wins: 0, crew, crewTxt: crew.map(surname).join(' · ') }));
    return { series: 'wec', key: 'wec-' + PREV.year, year: PREV.year, races: [], drivers, teams, entrants: [...drivers.keys()], doneCount: PREV.rounds, finished: true, source: 'wecembedded' };
  }

  async function fetchFile(year) {
    try {
      const r = await fetch(`data/wec/${year}.json?v=${Math.floor(Date.now() / 36e5)}`);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }
  const activeYear = () => Math.max(...Object.keys(CALENDAR).map(Number));
  async function loadSeason() {
    const year = activeYear();
    const season = build(year, await fetchFile(year));
    season.prev = prevSeason();
    return season;
  }

  F1.wec = { loadSeason, build, MAKERS, ENTRIES, CALENDAR, GT3, PREV, carId };
})(globalThis.F1 = globalThis.F1 || {});
