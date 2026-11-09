/* Définition des marchés de paris et règlement automatique à partir des résultats officiels. */
(function (F1) {
  const { toOdds, harville, hash } = F1.model;
  const dn = (s, id) => { const d = s.drivers.get(id); return d ? d.family : id; };
  const tn = (s, id) => { const t = s.teams.get(id); return t ? t.short : id; };

  function sel(market, key, label, p, extra = {}) {
    return { mid: market.id, key, sid: market.id + '|' + key, label, prob: p, odds: toOdds(p, market.margin || 1.07), kind: market.kind, round: market.round, mtitle: market.title, ...extra };
  }

  /* Marchés d'un Grand Prix */
  function buildRace(season, race, sim) {
    const R = race.round;
    const M = [];
    const add = (m) => { m.round = R; M.push(m); return m; };
    const byP = (k) => [...sim.drivers].sort((a, b) => b.p[k] - a.p[k]);
    const dsel = (m, d, p) => sel(m, d.id, dn(season, d.id), p, { driverId: d.id, teamId: d.teamId, args: { d: d.id } });

    const driverMarket = (kind, id, title, sub, pk, closes, group, margin) => {
      const m = add({ id: `r${R}:${id}`, kind, title, sub, closes, group, margin, layout: 'drivers' });
      m.selections = byP(pk).map((d) => dsel(m, d, d.p[pk]));
      return m;
    };
    driverMarket('win', 'win', 'Vainqueur de la course', 'Le pilote qui franchit la ligne en tête', 'win', race.date, 'top', 1.1);
    driverMarket('podium', 'podium', 'Sur le podium', 'Termine dans le top 3', 'podium', race.date, 'drivers', 1.08);
    driverMarket('top6', 'top6', 'Top 6', 'Termine parmi les 6 premiers', 'top6', race.date, 'drivers', 1.06);
    driverMarket('points', 'points', 'Dans les points', 'Termine dans le top 10', 'points', race.date, 'drivers', 1.05);
    driverMarket('fastest', 'fastest', 'Meilleur tour en course', 'Signe le tour le plus rapide', 'fastest', race.date, 'drivers', 1.12);
    driverMarket('dnf', 'dnf', 'Abandon', 'Non classé à l\'arrivée', 'dnf', race.date, 'drivers', 1.1);
    if (!race.qualifying) driverMarket('pole', 'pole', 'Pole position', 'Le plus rapide en qualifications', 'pole', race.qualiDate || race.date, 'top', 1.1);
    if (race.sprint && !race.sprintResults) driverMarket('sprintWin', 'sprint', 'Vainqueur du Sprint', 'Course sprint du samedi', 'sprintWin', race.sprintDate || race.date, 'top', 1.12);

    // Écuries
    const tw = add({ id: `r${R}:team`, kind: 'teamWin', title: 'Écurie victorieuse', sub: 'L\'écurie du vainqueur', closes: race.date, group: 'teams', margin: 1.08, layout: 'teams' });
    tw.selections = [...sim.teams].sort((a, b) => b.win - a.win).map((t) => sel(tw, t.id, tn(season, t.id), t.win, { teamId: t.id, args: { t: t.id } }));
    const td = add({ id: `r${R}:double`, kind: 'double', title: 'Doublé 1-2', sub: 'Les deux voitures aux deux premières places', closes: race.date, group: 'teams', margin: 1.12, layout: 'teams' });
    td.selections = [...sim.teams].sort((a, b) => b.double - a.double).filter((t) => t.double > 0.0005).map((t) => sel(td, t.id, tn(season, t.id), t.double, { teamId: t.id, args: { t: t.id } }));
    const tb = add({ id: `r${R}:both`, kind: 'bothPts', title: 'Les 2 voitures dans les points', sub: 'Double arrivée dans le top 10', closes: race.date, group: 'teams', margin: 1.06, layout: 'teams' });
    tb.selections = [...sim.teams].sort((a, b) => b.both - a.both).map((t) => sel(tb, t.id, tn(season, t.id), t.both, { teamId: t.id, args: { t: t.id } }));

    // Duels
    const pairs = [];
    const byTeam = {};
    sim.drivers.forEach((d) => { (byTeam[d.teamId] = byTeam[d.teamId] || []).push(d.id); });
    Object.values(byTeam).forEach((ids) => { if (ids.length === 2) pairs.push([ids[0], ids[1], 'mate']); });
    const winP = Object.fromEntries(sim.drivers.map((d) => [d.id, d.p.win]));
    const ranked = [...season.entrants].sort((a, b) => season.drivers.get(b).points - season.drivers.get(a).points || (winP[b] || 0) - (winP[a] || 0));
    for (let i = 0; i + 1 < Math.min(ranked.length, 10); i += 1) {
      const a = ranked[i], b = ranked[i + 1];
      if (season.drivers.get(a).teamId !== season.drivers.get(b).teamId && !pairs.some((p) => p[0] === a && p[1] === b)) pairs.push([a, b, 'rival']);
    }
    pairs.forEach(([a, b, type]) => {
      const m = add({ id: `r${R}:h2h:${a}:${b}`, kind: 'h2h', title: `${dn(season, a)} vs ${dn(season, b)}`, sub: type === 'mate' ? 'Duel de coéquipiers' : 'Duel au classement', closes: race.date, group: 'h2h', margin: 1.06, layout: 'h2h', h2hType: type, a, b });
      const pa = sim.h2h(a, b), pb = sim.h2h(b, a);
      const n = pa + pb || 1;
      m.selections = [
        sel(m, a, dn(season, a), pa / n, { driverId: a, teamId: season.drivers.get(a).teamId, args: { a, b } }),
        sel(m, b, dn(season, b), pb / n, { driverId: b, teamId: season.drivers.get(b).teamId, args: { a: b, b: a } }),
      ];
    });

    // Spéciaux
    const fin = Math.round(sim.expFinishers - 0.5) + 0.5;
    [fin - 1, fin].forEach((line) => {
      const m = add({ id: `r${R}:fin:${line}`, kind: 'finishers', title: `Pilotes classés : ${line}`, sub: 'Nombre de voitures classées à l\'arrivée', closes: race.date, group: 'specials', margin: 1.06, layout: 'ou' });
      const po = sim.finishersOver(line);
      m.selections = [sel(m, 'over', `Plus de ${line}`, po, { args: { line, side: 'over' } }), sel(m, 'under', `Moins de ${line}`, 1 - po, { args: { line, side: 'under' } })];
    });
    [2, 5, 10].forEach((line) => {
      const m = add({ id: `r${R}:margin:${line}`, kind: 'margin', title: `Écart du vainqueur : ${line} s`, sub: 'Écart entre le 1er et le 2e sous le drapeau à damier', closes: race.date, group: 'specials', margin: 1.06, layout: 'ou' });
      const po = sim.margin[line];
      m.selections = [sel(m, 'over', `Plus de ${line} s`, po, { args: { line, side: 'over' } }), sel(m, 'under', `Moins de ${line} s`, 1 - po, { args: { line, side: 'under' } })];
    });
    const pw = add({ id: `r${R}:polewin`, kind: 'poleWins', title: 'Le poleman gagne la course ?', sub: 'Victoire depuis la 1re place sur la grille', closes: race.date, group: 'specials', margin: 1.06, layout: 'ou' });
    pw.selections = [sel(pw, 'yes', 'Oui', sim.poleWins, { args: { v: true } }), sel(pw, 'no', 'Non', 1 - sim.poleWins, { args: { v: false } })];
    const wg = add({ id: `r${R}:wgrid`, kind: 'winnerGrid', title: 'Position de départ du vainqueur', sub: 'D\'où partira le futur vainqueur ?', closes: race.date, group: 'specials', margin: 1.08, layout: 'ou' });
    wg.selections = [
      sel(wg, 'p1', 'Pole position', sim.wGrid.p1, { args: { b: 'p1' } }), sel(wg, 'p2', '2e place', sim.wGrid.p2, { args: { b: 'p2' } }),
      sel(wg, 'p3', '3e à 5e', sim.wGrid.p3, { args: { b: 'p3' } }), sel(wg, 'p4', '6e ou plus loin', sim.wGrid.p4, { args: { b: 'p4' } }),
    ];

    // Cote boostée (choisie de façon déterministe pour le GP)
    const pool = M.filter((m) => ['podium', 'h2h', 'top6', 'teamWin'].includes(m.kind)).flatMap((m) => m.selections.filter((s) => s.prob > 0.25 && s.prob < 0.7));
    if (pool.length) {
      const base = pool[hash(`boost${season.year}${R}`) % pool.length];
      const boosted = Math.round(base.odds * 1.35 * 20) / 20;
      const m = add({ id: `r${R}:boost`, kind: base.kind, title: 'Cote boostée', sub: `${base.mtitle} — ${base.label}`, closes: race.date, group: 'top', layout: 'boost' });
      m.selections = [{ ...base, mid: m.id, sid: m.id + '|' + base.key, odds: boosted, oldOdds: base.odds, boost: true, mtitle: `${base.mtitle} (boost)` }];
    }
    return M;
  }

  /* Tiercé (podium exact ou dans le désordre) */
  function tierce(season, race, sim, a, b, c, ordered) {
    const w = {};
    sim.drivers.forEach((d) => { w[d.id] = d.p.win; });
    let p;
    if (ordered) p = harville(w, a, b, c);
    else p = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]].reduce((s, x) => s + harville(w, ...x), 0);
    const m = { id: `r${race.round}:tierce:${ordered ? 'o' : 'd'}`, kind: 'tierce', round: race.round, title: ordered ? 'Tiercé dans l\'ordre' : 'Tiercé dans le désordre', margin: 1.15 };
    const label = `${season.drivers.get(a).code} · ${season.drivers.get(b).code} · ${season.drivers.get(c).code}`;
    return sel(m, `${a}-${b}-${c}`, label, p, { args: { a, b, c, ordered } });
  }

  /* Marchés de saison */
  function buildSeason(season, ss) {
    const closes = (season.races.filter((r) => !r.results).slice(-1)[0] || {}).date || null;
    const m1 = { id: `s${season.year}:wdc`, kind: 'wdc', round: 0, title: `Champion du monde pilotes ${season.year}`, sub: season.doneCount ? `Simulation des ${ss.remaining} manches restantes` : `Avant-saison · simulation des ${ss.remaining} manches`, closes, group: 'season', margin: 1.1, layout: 'drivers' };
    m1.selections = [...ss.drivers].sort((a, b) => b.p - a.p).filter((d) => d.p >= 0.003).slice(0, 12)
      .map((d) => sel(m1, d.id, dn(season, d.id), d.p, { driverId: d.id, teamId: d.teamId, season: season.year, args: { d: d.id } }));
    const m2 = { id: `s${season.year}:wcc`, kind: 'wcc', round: 0, title: `Champion du monde constructeurs ${season.year}`, sub: 'Le titre des écuries', closes, group: 'season', margin: 1.1, layout: 'teams' };
    m2.selections = [...ss.teams].sort((a, b) => b.p - a.p).filter((t) => t.p >= 0.003).slice(0, 8)
      .map((t) => sel(m2, t.id, tn(season, t.id), t.p, { teamId: t.id, season: season.year, args: { t: t.id } }));
    return [m1, m2].filter((m) => m.selections.length > 1);
  }

  /* ---- Règlement : renvoie 'won' | 'lost' | 'void' | null (en attente) ---- */
  function settle(leg, season) {
    const a = leg.args || {};
    if (leg.kind === 'wdc' || leg.kind === 'wcc') {
      if (!season.finished) return null;
      if (leg.kind === 'wdc') { const top = [...season.drivers.values()].sort((x, y) => y.points - x.points)[0]; return top && top.id === a.d ? 'won' : 'lost'; }
      const top = [...season.teams.values()].sort((x, y) => y.points - x.points)[0]; return top && top.id === a.t ? 'won' : 'lost';
    }
    const race = season.races.find((r) => r.round === leg.round);
    if (!race) return 'void';
    if (leg.kind === 'pole') {
      if (race.qualifying && race.qualifying.length) return race.qualifying[0].driverId === a.d ? 'won' : 'lost';
      if (race.results) { const p = race.results.find((x) => x.grid === 1); if (p) return p.driverId === a.d ? 'won' : 'lost'; return 'void'; }
      return null;
    }
    if (leg.kind === 'sprintWin') {
      if (!race.sprintResults) return race.results ? 'void' : null;
      const w = race.sprintResults[0]; if (!race.sprintResults.some((x) => x.driverId === a.d)) return 'void';
      return w.driverId === a.d ? 'won' : 'lost';
    }
    const R = race.results;
    if (!R) return null;
    const find = (id) => R.find((x) => x.driverId === id);
    const winner = R[0];
    const yes = (b) => (b ? 'won' : 'lost');
    switch (leg.kind) {
      case 'win': case 'podium': case 'top6': case 'points': case 'dnf': case 'fastest': {
        const x = find(a.d); if (!x) return 'void';
        if (leg.kind === 'win') return yes(x.pos === 1 && x.classified);
        if (leg.kind === 'podium') return yes(x.classified && x.pos <= 3);
        if (leg.kind === 'top6') return yes(x.classified && x.pos <= 6);
        if (leg.kind === 'points') return yes(x.classified && x.pos <= 10);
        if (leg.kind === 'dnf') return yes(!x.classified);
        const fl = R.find((y) => y.fastestRank === 1); if (!fl) return 'void';
        return yes(fl.driverId === a.d);
      }
      case 'teamWin': return yes(winner.teamId === a.t);
      case 'double': return yes(R[0].teamId === a.t && R[1] && R[1].teamId === a.t && R[1].classified);
      case 'bothPts': return yes(R.filter((x) => x.classified && x.pos <= 10 && x.teamId === a.t).length >= 2);
      case 'h2h': { const x = find(a.a), y = find(a.b); if (!x || !y) return 'void'; return yes(x.pos < y.pos); }
      case 'finishers': { const n = R.filter((x) => x.classified).length; return yes(a.side === 'over' ? n > a.line : n < a.line); }
      case 'margin': {
        const p2 = R[1]; if (!p2) return 'void';
        let m = Infinity;
        if (p2.ms && winner.ms) m = (p2.ms - winner.ms) / 1000;
        else if (p2.timeText && /^\+?\d/.test(p2.timeText) && !/lap/i.test(p2.status)) m = parseFloat(p2.timeText.replace('+', ''));
        return yes(a.side === 'over' ? m > a.line : m < a.line);
      }
      case 'poleWins': return yes((winner.grid === 1) === a.v);
      case 'winnerGrid': { const g = winner.grid || 99; const b = g === 1 ? 'p1' : g === 2 ? 'p2' : g <= 5 ? 'p3' : 'p4'; return yes(b === a.b); }
      case 'tierce': {
        const top = R.slice(0, 3).filter((x) => x.classified).map((x) => x.driverId);
        if (top.length < 3) return 'lost';
        if (a.ordered) return yes(top[0] === a.a && top[1] === a.b && top[2] === a.c);
        return yes([a.a, a.b, a.c].every((id) => top.includes(id)));
      }
      default: return 'void';
    }
  }

  // Groupes de corrélation (interdits ensemble dans un combiné)
  const EXCLUSIVE = ['win', 'pole', 'sprintWin', 'teamWin', 'double', 'fastest', 'finishers', 'margin', 'poleWins', 'winnerGrid', 'tierce'];
  function corrKey(leg) {
    if (leg.kind === 'wdc' || leg.kind === 'wcc') return [leg.kind + (leg.season || '')];
    const keys = [EXCLUSIVE.includes(leg.kind) ? `r${leg.round}:${leg.kind}` : leg.mid.replace(':boost', ':' + leg.kind)];
    if (leg.driverId) keys.push(`r${leg.round}:d:${leg.driverId}`);
    if (leg.kind === 'h2h' && leg.args) keys.push(`r${leg.round}:d:${leg.args.b}`);
    if (leg.teamId && !leg.driverId) keys.push(`r${leg.round}:t:${leg.teamId}`);
    return [...new Set(keys)];
  }

  F1.markets = { buildRace, buildSeason, tierce, settle, corrKey };
})(globalThis.F1 = globalThis.F1 || {});
