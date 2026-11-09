/* Moteur de cotes : modèle de Plackett-Luce (bruit de Gumbel) + simulation Monte-Carlo.
   Force d'un pilote = points/course (pilote, écurie, forme récente) mélangés à un a priori,
   puis la grille de départ (si les qualifs sont connues) et la météo modulent la course. */
(function (F1) {
  const PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const SPTS = [8, 7, 6, 5, 4, 3, 2, 1];
  const N_RACE = 20000;
  const N_SEASON = 6000;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const gumbel = (r) => -Math.log(-Math.log(r() * 0.999999 + 0.0000005));

  /* ---- Forces ---- */
  function strengths(season, race, weather) {
    const before = season.races.filter((r) => r.results && r.round < race.round);
    const n = before.length;
    const pts = {}, starts = {}, teamPts = {}, recent = {};
    before.forEach((r, idx) => {
      const decay = Math.pow(0.72, n - 1 - idx);
      for (const x of r.results.concat(r.sprintResults || [])) {
        pts[x.driverId] = (pts[x.driverId] || 0) + x.points;
        teamPts[x.teamId] = (teamPts[x.teamId] || 0) + x.points;
      }
      for (const x of r.results) {
        starts[x.driverId] = (starts[x.driverId] || 0) + 1;
        const p = x.classified ? (PTS[x.pos - 1] || 0) : 0;
        recent[x.driverId] = recent[x.driverId] || { s: 0, w: 0 };
        recent[x.driverId].s += p * decay; recent[x.driverId].w += decay;
      }
    });
    const w = Math.min(n / 5, 1);
    const rain = weather ? Math.min(weather.rain || 0, 100) / 100 : 0;
    const out = season.entrants.map((id) => {
      const d = season.drivers.get(id);
      const prior = F1.ref.TEAM_PRIOR[d.teamId] ?? 4;
      const ppr = (pts[id] || 0) / Math.max(starts[id] || 0, 1);
      const tppr = (teamPts[d.teamId] || 0) / Math.max(2 * n, 1);
      const rec = recent[id] ? recent[id].s / recent[id].w : ppr;
      const base = starts[id] ? w * (0.4 * ppr + 0.25 * tppr + 0.35 * rec) + (1 - w) * prior : 0.6 * tppr * w + (1 - w * 0.6) * prior * 0.8;
      // la pluie resserre la hiérarchie (plus d'aléa)
      const s = Math.pow(base + 1.5, 1.85 * (1 - 0.35 * rain));
      return { id, teamId: d.teamId, s, ls: Math.log(s) };
    });
    return out;
  }

  function pickWeighted(r, arr, wfn) {
    let tot = 0; for (const a of arr) tot += wfn(a);
    let x = r() * tot;
    for (const a of arr) { x -= wfn(a); if (x <= 0) return a; }
    return arr[arr.length - 1];
  }

  /* ---- Simulation d'un Grand Prix ---- */
  function simulateRace(season, race, weather) {
    const st = strengths(season, race, weather);
    const N = st.length;
    const seed = hash(`${season.year}-${race.round}-${st.map((x) => x.id + x.s.toFixed(3)).join()}-${race.qualifying ? 'q' : ''}`);
    const r = mulberry32(seed);
    const rain = weather ? (weather.rain || 0) / 100 : 0;
    const smax = Math.max(...st.map((x) => x.s));
    const pDnf = st.map((x) => (race.street ? 0.085 : 0.055) * (1 + 0.6 * rain) * (1.25 - 0.45 * (x.s / smax)));

    const knownGrid = race.qualifying ? new Map(race.qualifying.map((q) => [q.driverId, q.pos])) : null;
    const idx = new Map(st.map((x, i) => [x.id, i]));
    const teams = [...new Set(st.map((x) => x.teamId))];
    const tIdx = new Map(teams.map((t, i) => [t, i]));

    const c = {
      win: new Float64Array(N), podium: new Float64Array(N), top6: new Float64Array(N), points: new Float64Array(N),
      dnf: new Float64Array(N), fastest: new Float64Array(N), pole: new Float64Array(N), sprintWin: new Float64Array(N),
      beat: Array.from({ length: N }, () => new Float64Array(N)),
      teamWin: new Float64Array(teams.length), teamDouble: new Float64Array(teams.length), teamBoth: new Float64Array(teams.length),
      finishers: new Float64Array(N + 1), margin: { 2: 0, 5: 0, 10: 0 }, poleWins: 0, wGrid: { p1: 0, p2: 0, p3: 0, p4: 0 },
    };
    const gridPos = new Int32Array(N), key = new Float64Array(N), pos = new Int32Array(N);
    const order = Array.from({ length: N }, (_, i) => i);
    const qKey = new Float64Array(N);

    for (let it = 0; it < N_RACE; it++) {
      // Grille
      if (knownGrid) {
        for (let i = 0; i < N; i++) gridPos[i] = knownGrid.get(st[i].id) || N;
      } else {
        for (let i = 0; i < N; i++) qKey[i] = 1.3 * st[i].ls + gumbel(r);
        order.sort((a, b) => qKey[b] - qKey[a]);
        for (let k = 0; k < N; k++) gridPos[order[k]] = k + 1;
      }
      // Course : force + avantage de position de départ + aléa
      let nDnf = 0;
      for (let i = 0; i < N; i++) {
        const out = r() < pDnf[i];
        key[i] = out ? -1e6 + r() : st[i].ls - 0.11 * (gridPos[i] - 1) + gumbel(r);
        if (out) nDnf++;
      }
      order.sort((a, b) => key[b] - key[a]);
      for (let k = 0; k < N; k++) pos[order[k]] = k;
      const classified = N - nDnf;
      c.finishers[classified]++;
      for (let k = 0; k < N; k++) {
        const i = order[k];
        if (k < classified) {
          if (k === 0) c.win[i]++;
          if (k < 3) c.podium[i]++;
          if (k < 6) c.top6[i]++;
          if (k < 10) c.points[i]++;
        } else c.dnf[i]++;
      }
      for (let i = 0; i < N; i++) {
        const bi = c.beat[i];
        for (let j = 0; j < N; j++) if (pos[i] < pos[j]) bi[j]++;
      }
      const w0 = order[0], w1 = order[1];
      if (gridPos[w0] === 1) c.poleWins++;
      const g = gridPos[w0];
      c.wGrid[g === 1 ? 'p1' : g === 2 ? 'p2' : g <= 5 ? 'p3' : 'p4']++;
      for (let i = 0; i < N; i++) if (gridPos[i] === 1) c.pole[i]++;
      const tw = tIdx.get(st[w0].teamId);
      c.teamWin[tw]++;
      if (st[w0].teamId === st[w1].teamId) c.teamDouble[tw]++;
      // écart vainqueur
      const ratio = Math.exp(st[w1].ls - st[w0].ls);
      const m = -Math.log(r() + 1e-9) * (2.8 + 9 * Math.max(0, 1 - ratio));
      if (m > 2) c.margin[2]++;
      if (m > 5) c.margin[5]++;
      if (m > 10) c.margin[10]++;
      // meilleur tour (parmi les classés, avantage aux pilotes de tête)
      const cl = order.slice(0, Math.max(classified, 1));
      const fl = pickWeighted(r, cl, (i) => Math.pow(st[i].s, 0.75) * (pos[i] < 5 ? 1.6 : 1));
      c.fastest[fl]++;
      // les 2 voitures dans les points
      const inPts = {};
      for (let k = 0; k < Math.min(10, classified); k++) { const t = st[order[k]].teamId; inPts[t] = (inPts[t] || 0) + 1; }
      for (const t in inPts) if (inPts[t] >= 2) c.teamBoth[tIdx.get(t)]++;
      // sprint
      if (race.sprint) {
        let best = -1, bk = -Infinity;
        for (let i = 0; i < N; i++) { const kk = st[i].ls + gumbel(r) * 1.05 - (r() < 0.03 ? 1e6 : 0); if (kk > bk) { bk = kk; best = i; } }
        c.sprintWin[best]++;
      }
    }
    const P = (v) => v / N_RACE;
    const drivers = st.map((x, i) => ({
      id: x.id, teamId: x.teamId, s: x.s,
      p: {
        win: P(c.win[i]), podium: P(c.podium[i]), top6: P(c.top6[i]), points: P(c.points[i]),
        dnf: P(c.dnf[i]), fastest: P(c.fastest[i]), pole: P(c.pole[i]), sprintWin: P(c.sprintWin[i]),
      },
    }));
    const finCdf = (line) => { let s = 0; for (let k = 0; k <= N; k++) if (k > line) s += c.finishers[k]; return s / N_RACE; };
    return {
      race, N, drivers, idx,
      h2h: (a, b) => { const i = idx.get(a), j = idx.get(b); return c.beat[i][j] / N_RACE; },
      teams: teams.map((t, i) => ({ id: t, win: P(c.teamWin[i]), double: P(c.teamDouble[i]), both: P(c.teamBoth[i]) })),
      finishersOver: finCdf, margin: { 2: P(c.margin[2]), 5: P(c.margin[5]), 10: P(c.margin[10]) },
      poleWins: P(c.poleWins), wGrid: { p1: P(c.wGrid.p1), p2: P(c.wGrid.p2), p3: P(c.wGrid.p3), p4: P(c.wGrid.p4) },
      expFinishers: c.finishers.reduce((s, v, k) => s + v * k, 0) / N_RACE,
    };
  }

  /* ---- Simulation de fin de saison ---- */
  function simulateSeason(season) {
    const remaining = season.races.filter((r) => !r.results);
    const ref = season.next || remaining[0] || season.races[season.races.length - 1];
    const st = strengths(season, ref, null);
    const N = st.length;
    const r = mulberry32(hash('season' + season.year + season.doneCount));
    const base = st.map((x) => season.drivers.get(x.id).points || 0);
    const teams = [...new Set(st.map((x) => x.teamId))];
    const tBase = teams.map((t) => (season.teams.get(t) || {}).points || 0);
    const tIdx = st.map((x) => teams.indexOf(x.teamId));
    const champ = new Float64Array(N), tChamp = new Float64Array(teams.length);
    const key = new Float64Array(N), order = Array.from({ length: N }, (_, i) => i);
    const ptsArr = new Float64Array(N), tPts = new Float64Array(teams.length);
    const sims = remaining.length ? N_SEASON : 1;
    for (let it = 0; it < sims; it++) {
      for (let i = 0; i < N; i++) ptsArr[i] = base[i];
      for (let t = 0; t < teams.length; t++) tPts[t] = tBase[t];
      for (const rc of remaining) {
        const runs = rc.sprint && !rc.sprintResults ? [SPTS, PTS] : [PTS];
        for (const table of runs) {
          for (let i = 0; i < N; i++) key[i] = r() < 0.06 ? -1e6 : st[i].ls + gumbel(r);
          order.sort((a, b) => key[b] - key[a]);
          for (let k = 0; k < table.length; k++) { const i = order[k]; if (key[i] > -1e5) { ptsArr[i] += table[k]; tPts[tIdx[i]] += table[k]; } }
        }
      }
      let bi = 0; for (let i = 1; i < N; i++) if (ptsArr[i] > ptsArr[bi] || (ptsArr[i] === ptsArr[bi] && r() < 0.5)) bi = i;
      champ[bi]++;
      let bt = 0; for (let t = 1; t < teams.length; t++) if (tPts[t] > tPts[bt]) bt = t;
      tChamp[bt]++;
    }
    return {
      drivers: st.map((x, i) => ({ id: x.id, teamId: x.teamId, p: champ[i] / sims })),
      teams: teams.map((t, i) => ({ id: t, p: tChamp[i] / sims })),
      remaining: remaining.length,
    };
  }

  /* ---- Probabilités -> cotes décimales ---- */
  function toOdds(p, margin = 1.07) {
    if (!(p > 0)) return 501;
    let o = 1 / (p * margin);
    if (o < 1.01) o = 1.01;
    if (o < 2) return Math.round(o * 100) / 100;
    if (o < 5) return Math.round(o * 20) / 20;
    if (o < 10) return Math.round(o * 10) / 10;
    if (o < 30) return Math.round(o * 2) / 2;
    if (o < 100) return Math.round(o);
    return Math.min(501, Math.round(o / 5) * 5);
  }
  // Formule de Harville (tiercé) à partir des probabilités de victoire
  function harville(winP, a, b, c) {
    const pa = winP[a], pb = winP[b], pc = winP[c];
    if (!pa || !pb || !pc) return 0;
    return pa * (pb / (1 - pa)) * (pc / (1 - pa - pb));
  }

  F1.model = { simulateRace, simulateSeason, toOdds, harville, PTS, SPTS, hash };
})(globalThis.F1 = globalThis.F1 || {});
