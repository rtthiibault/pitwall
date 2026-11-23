/* Paddock Wire : dépêches F1 relevées toutes les 30 min (data/news.json, GitHub Action) et moteur d'impact.
   Chaque dépêche analysée porte un impact : modificateurs de monoplace (F1 Manager) et multiplicateur de cotes (Paris).
   L'impact est plein pendant 48 h puis s'estompe linéairement jusqu'à 7 jours. */
(function (F1) {
  const FILE = 'data/news.json';
  const LS = 'pitwall:news:v1';
  const FULL_H = 48, END_H = 168;
  const CAP_STAT = 6;                 // plafond de cumul par caractéristique et par écurie
  const MULT_MIN = 0.75, MULT_MAX = 1.35;
  const S = { data: null, loadedAt: 0, err: null, cbs: [] };

  const weight = (x, now = Date.now()) => {
    const h = (now - Date.parse(x.firstSeen || x.timestamp)) / 36e5;
    return h <= FULL_H ? 1 : h >= END_H ? 0 : 1 - (h - FULL_H) / (END_H - FULL_H);
  };
  const items = () => (S.data && S.data.items) || [];
  const active = (now = Date.now()) => items().filter((x) => x.impact && weight(x, now) > 0);

  function sig(d) { return d ? d.updated + '|' + d.items.length : ''; }
  async function load(force) {
    const before = sig(S.data);
    if (!S.data) { try { const c = JSON.parse(localStorage.getItem(LS)); if (c && c.items) S.data = c; } catch (e) { /* */ } }
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
    try {
      const r = await fetch(`${FILE}?v=${force ? Date.now() : Math.floor(Date.now() / 6e5)}`, { signal: c.signal, cache: force ? 'no-store' : 'default' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d && Array.isArray(d.items)) { S.data = d; S.err = null; try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) { /* quota */ } }
    } catch (e) { S.err = e.message; } finally { clearTimeout(t); }
    S.loadedAt = Date.now();
    const changed = sig(S.data) !== before;
    if (changed) S.cbs.forEach((f) => { try { f(); } catch (e) { /* */ } });
    return { changed, data: S.data };
  }

  /* Modificateurs de monoplace par écurie (id d'écurie = id de châssis dans F1 Manager) :
     powerUnit -> vitesse de pointe, aero -> appui, reliability -> fiabilité.
     Une même information reprise par plusieurs médias ne doit pas compter plusieurs fois : pour chaque
     caractéristique, on retient la plus forte hausse et la plus forte baisse (pas leur somme). */
  function teamMods(now = Date.now()) {
    const acc = {};
    for (const x of active(now)) {
      const im = x.impact, w = weight(x, now), m = im.managerModifiers || {};
      if (im.targetType === 'driver') continue;
      for (const id of im.targetIds || []) {
        const o = acc[id] || (acc[id] = { speed: [0, 0], df: [0, 0], rel: [0, 0] });
        [['speed', m.powerUnit], ['df', m.aero], ['rel', m.reliability]].forEach(([k, v]) => { v = (v || 0) * w; if (v > o[k][0]) o[k][0] = v; if (v < o[k][1]) o[k][1] = v; });
      }
    }
    const out = {};
    for (const id in acc) { out[id] = {}; for (const k in acc[id]) out[id][k] = Math.round(Math.max(-CAP_STAT, Math.min(CAP_STAT, acc[id][k][0] + acc[id][k][1])) * 10) / 10; }
    for (const id in out) if (!out[id].speed && !out[id].df && !out[id].rel) delete out[id];
    return out;
  }
  // Multiplicateur de cote : écurie (dépêches équipe/moteur) x pilote (dépêches pilote)
  function oddsMult(teamId, driverId, now = Date.now()) {
    // plus forte hausse x plus forte baisse, séparément pour l'écurie et pour le pilote (pas de cumul des doublons)
    const ext = { t: [1, 1], d: [1, 1] };
    for (const x of active(now)) {
      const im = x.impact; if (!im.bettingOddsMultiplier || im.bettingOddsMultiplier === 1) continue;
      const ids = im.targetIds || [], isD = im.targetType === 'driver';
      if (!(isD ? driverId && ids.includes(driverId) : teamId && ids.includes(teamId))) continue;
      const v = Math.pow(im.bettingOddsMultiplier, weight(x, now)), e = ext[isD ? 'd' : 't'];
      if (v > e[0]) e[0] = v; if (v < e[1]) e[1] = v;
    }
    return Math.max(MULT_MIN, Math.min(MULT_MAX, ext.t[0] * ext.t[1] * ext.d[0] * ext.d[1]));
  }
  // Prochain relevé : dernier relevé + 30 min (période annoncée par le fichier)
  const nextAt = () => { const u = S.data && Date.parse(S.data.updated); if (!u) return null; const min = S.data.periodMinutes || (S.data.periodHours || 0.5) * 60; return u + min * 60e3; };
  // Tableau de bord : écuries et pilotes touchés en ce moment
  function board(now = Date.now()) {
    const tm = teamMods(now), teams = new Set(Object.keys(tm)), drivers = new Set();
    for (const x of active(now)) {
      const im = x.impact;
      if (im.targetType === 'driver') (im.targetIds || []).forEach((d) => drivers.add(d));
      else (im.targetIds || []).forEach((t) => teams.add(t));
    }
    return { teams: [...teams].map((id) => ({ id, mods: tm[id] || { speed: 0, df: 0, rel: 0 }, mult: oddsMult(id, null, now) })).sort((a, b) => b.mult - a.mult),
      drivers: [...drivers].map((id) => ({ id, mult: oddsMult(null, id, now) })).sort((a, b) => b.mult - a.mult) };
  }

  F1.news = { load, items, active, weight, teamMods, oddsMult, nextAt, board, onChange: (f) => S.cbs.push(f), get data() { return S.data; }, get error() { return S.err; } };
})(globalThis.F1 = globalThis.F1 || {});
