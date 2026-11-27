/* Chronos des séances (essais libres, qualifications, sprint, course) via OpenF1, interrogé depuis le navigateur.
   Séance terminée : classement et meilleurs tours. Séance en cours : données au fil de leur publication
   (le direct d'OpenF1 peut demander un accès payant : dans ce cas, on l'indique et le classement arrive en fin de séance). */
(function (F1) {
  const API = 'https://api.openf1.org/v1';
  const NAMES = { fp1: ['Practice 1'], fp2: ['Practice 2'], fp3: ['Practice 3'], sq: ['Sprint Qualifying', 'Sprint Shootout'], sprint: ['Sprint'], quali: ['Qualifying'], race: ['Race'] };
  const DUR = { fp1: 60, fp2: 60, fp3: 60, sq: 45, sprint: 45, quali: 60, race: 120 }; // minutes
  const cacheYear = new Map();

  async function get(path) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 9000);
    try {
      const r = await fetch(API + path, { signal: c.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      const j = await r.json();
      if (!Array.isArray(j)) { const e = new Error((j && (j.detail || j.error)) || 'Réponse inattendue'); e.status = 401; throw e; }
      return j;
    } finally { clearTimeout(t); }
  }
  async function sessionOf(year, key, date) {
    if (!cacheYear.has(year)) cacheYear.set(year, get(`/sessions?year=${year}`).catch((e) => { cacheYear.delete(year); throw e; }));
    const all = await cacheYear.get(year);
    const names = NAMES[key] || [];
    const near = all.filter((s) => names.includes(s.session_name) && Math.abs(Date.parse(s.date_start) - date.getTime()) < 8 * 36e5);
    return near.sort((a, b) => Math.abs(Date.parse(a.date_start) - date) - Math.abs(Date.parse(b.date_start) - date))[0] || null;
  }
  const best = (arr) => { let b = null; arr.forEach((v) => { if (typeof v === 'number' && v > 0 && (b == null || v < b)) b = v; }); return b; };

  /* état d'une séance : 'soon' (à venir), 'live' (en cours ou juste finie), 'done' */
  function phase(key, date) {
    const t = Date.now(), st = date.getTime(), end = st + (DUR[key] || 60) * 60e3;
    return t < st ? 'soon' : t < end + 20 * 60e3 ? 'live' : 'done';
  }

  /* Résultat : { rows: [{ pos, num, name, code, team, color, best, q: [q1,q2,q3], gap, laps, out }], src, note } */
  async function load(race, s) {
    const ph = phase(s.key, s.date);
    if (ph === 'soon') return { phase: ph, rows: [] };
    const ses = await sessionOf(race.season || s.date.getFullYear(), s.key, s.date);
    if (!ses) return { phase: ph, rows: [], note: 'Séance introuvable chez OpenF1 pour le moment.' };
    const sk = ses.session_key;
    const [drivers, result, laps] = await Promise.all([
      get(`/drivers?session_key=${sk}`).catch(() => []),
      get(`/session_result?session_key=${sk}`).catch(() => []),
      get(`/laps?session_key=${sk}`).catch((e) => { if (e.status === 401 || e.status === 403) throw e; return []; }),
    ]);
    const D = new Map(drivers.map((d) => [d.driver_number, d]));
    const lapsBy = new Map();
    laps.forEach((l) => { const a = lapsBy.get(l.driver_number) || []; a.push(l); lapsBy.set(l.driver_number, a); });
    const info = (n) => { const d = D.get(n) || {}; return { num: n, name: d.full_name || d.broadcast_name || `#${n}`, code: d.name_acronym || '', team: d.team_name || '', color: d.team_colour ? '#' + d.team_colour : '#8a94a3' }; };
    const lapCount = (n) => (lapsBy.get(n) || []).reduce((m, l) => Math.max(m, l.lap_number || 0), 0);
    const bestLap = (n) => best((lapsBy.get(n) || []).map((l) => l.lap_duration));
    let rows;
    if (result.length) {
      rows = result.filter((r) => r.position != null || r.dnf || r.dns || r.dsq).map((r) => {
        const q = Array.isArray(r.duration) ? r.duration : null;
        return { ...info(r.driver_number), pos: r.position, q, best: q ? best(q) : (s.key === 'race' || s.key === 'sprint') ? bestLap(r.driver_number) : (typeof r.duration === 'number' ? r.duration : bestLap(r.driver_number)),
          total: (s.key === 'race' || s.key === 'sprint') && typeof r.duration === 'number' ? r.duration : null, gap: Array.isArray(r.gap_to_leader) ? r.gap_to_leader.filter((g) => g != null).pop() : r.gap_to_leader,
          laps: r.number_of_laps != null ? r.number_of_laps : lapCount(r.driver_number), out: r.dsq ? 'DSQ' : r.dns ? 'NP' : r.dnf ? 'AB' : '' };
      }).sort((a, b) => (a.pos || 99) - (b.pos || 99));
    } else {
      // pas encore de classement officiel : meilleurs tours publiés jusqu'ici
      rows = [...lapsBy.keys()].map((n) => ({ ...info(n), best: bestLap(n), laps: lapCount(n) })).filter((r) => r.laps > 0)
        .sort((a, b) => (a.best == null) - (b.best == null) || (a.best || 0) - (b.best || 0));
      const lead = rows[0] && rows[0].best;
      rows.forEach((r, i) => { r.pos = i + 1; r.gap = i && r.best && lead ? r.best - lead : null; });
    }
    return { phase: ph, rows, src: 'OpenF1', provisional: !result.length, note: !rows.length && ph === 'live' ? 'Les temps s\'afficheront dès qu\'OpenF1 les publie.' : '' };
  }
  const fmtLap = (v) => { if (v == null || !(v > 0)) return '—'; const m = Math.floor(v / 60), s = v - m * 60; return (m ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(3).replace('.', ','); };
  const fmtGap = (g) => (g == null || g === '' ? '' : typeof g === 'number' ? '+' + g.toFixed(3).replace('.', ',') : String(g).replace('.', ','));
  F1.live = { load, phase, fmtLap, fmtGap, DUR };
})(window.F1 = window.F1 || {});
