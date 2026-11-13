/* Portefeuille virtuel, historique des paris, succès. Stocké dans le navigateur (localStorage). */
(function (F1) {
  const KEY = 'pitwall:profile:v1';
  const START = 1000;
  const WEEKLY = 150;
  const RESCUE = 300;
  const MAX_ODDS = 2000; // plafond d'un combiné

  const ACH = [
    { id: 'first', icon: '🏁', title: 'Lights out', desc: 'Placer votre premier pari' },
    { id: 'win1', icon: '🍾', title: 'Champagne !', desc: 'Gagner un premier pari' },
    { id: 'combo', icon: '🔗', title: 'Train DRS', desc: 'Gagner un combiné de 3 sélections ou plus' },
    { id: 'long', icon: '🚀', title: 'Remontée fantastique', desc: 'Gagner un pari à cote ≥ 10' },
    { id: 'tierce', icon: '🥇', title: 'Podium parfait', desc: 'Gagner un tiercé' },
    { id: 'streak', icon: '🔥', title: 'Grand Chelem', desc: '5 paris gagnés d\'affilée' },
    { id: 'rich', icon: '💎', title: 'Budget cap explosé', desc: 'Atteindre 5 000 jetons' },
    { id: 'season', icon: '🏆', title: 'Visionnaire', desc: 'Parier sur le champion du monde' },
    { id: 'loyal', icon: '📅', title: 'Abonné du paddock', desc: 'Récupérer 5 primes de week-end' },
    { id: 'mgr_team', icon: '🏗️', title: 'Team principal', desc: 'Posséder un pilote et un châssis' },
    { id: 'mgr_win', icon: '🏁', title: 'Victoire constructeur', desc: 'Gagner une course de manager' },
    { id: 'mgr_or', icon: '🥇', title: 'Ligue Or', desc: 'Atteindre la ligue Or en mode manager' },
    { id: 'mgr_rd', icon: '🔬', title: 'Bureau d\'études', desc: 'Développer 5 pièces en R&D' },
    { id: 'mgr_mk5', icon: '🧬', title: 'Spécification ultime', desc: 'Amener une pièce au niveau Mk V' },
    { id: 'mgr_pkg', icon: '📦', title: 'Package complet', desc: 'Toutes les pièces d\'une branche de R&D développées' },
    { id: 'mgr_tunnel', icon: '🎲', title: 'Coup de poker', desc: 'Réussir un pari soufflerie' },
    { id: 'mgr_obj', icon: '🎯', title: 'Feuille de route', desc: 'Remplir les 3 objectifs d\'une journée' },
  ];

  let state = null;
  const listeners = [];

  function blank() {
    return { v: 1, name: '', created: Date.now(), balance: START, bets: [], claimed: {}, rescues: {}, ach: {}, history: [{ t: Date.now(), b: START }], manager: blankManager() };
  }
  const blankManager = () => ({ pc: (F1.manager && F1.manager.START_PC) || 300, driver: null, chassis: null, ups: { speed: 0, df: 0, rel: 0 }, parts: {}, rdSpent: 0, setup: 0, lp: 0, best: 0, races: [], day: { key: '', n: 0 }, log: [] });
  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!state || state.v !== 1) state = blank();
    if (!state.manager) state.manager = blankManager();
    const m = state.manager;
    if (!m.parts) m.parts = {};
    // anciennes sauvegardes : une pièce développée (horodatage) devient Mk I
    for (const k in m.parts) if (m.parts[k] > 5) m.parts[k] = 1;
    if (!m.fails) m.fails = {};
    if (!m.daily) m.daily = { key: '' };
    return state;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
    listeners.forEach((f) => f(state));
  }
  const get = () => state || load();
  const onChange = (f) => listeners.push(f);
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const track = () => { state.history.push({ t: Date.now(), b: Math.round(state.balance * 100) / 100 }); if (state.history.length > 400) state.history.shift(); };
  const unlocked = [];
  function unlock(id) { if (!state.ach[id]) { state.ach[id] = Date.now(); unlocked.push(ACH.find((a) => a.id === id)); } }

  function placeBet(legs, stake) {
    get();
    stake = Math.floor(stake * 100) / 100;
    if (!(stake > 0)) throw new Error('Mise invalide');
    if (stake > state.balance + 1e-9) throw new Error('Solde insuffisant');
    const odds = Math.min(MAX_ODDS, Math.round(legs.reduce((p, l) => p * l.odds, 1) * 100) / 100);
    const bet = {
      id: uid(), placedAt: Date.now(), stake, odds, status: 'open', payout: 0,
      legs: legs.map((l) => ({ sid: l.sid, mid: l.mid, kind: l.kind, round: l.round, key: l.key, label: l.label, mtitle: l.mtitle, odds: l.odds, args: l.args, driverId: l.driverId, teamId: l.teamId, season: l.season, result: null })),
    };
    state.balance = Math.round((state.balance - stake) * 100) / 100;
    state.bets.unshift(bet);
    unlock('first');
    if (legs.some((l) => l.kind === 'wdc')) unlock('season');
    track(); save();
    return bet;
  }

  // Règle les paris dont les résultats sont disponibles. Renvoie la liste des paris réglés.
  function settleAll(season) {
    get();
    const settled = [];
    for (const bet of state.bets) {
      if (bet.status !== 'open') continue;
      let changed = false;
      for (const leg of bet.legs) {
        if (leg.result) continue;
        if (leg.season && leg.season !== season.year) continue;
        const r = F1.markets.settle(leg, season);
        if (r) { leg.result = r; changed = true; }
      }
      if (!changed && !bet.legs.every((l) => l.result)) continue;
      if (bet.legs.some((l) => l.result === 'lost')) { bet.status = 'lost'; bet.payout = 0; }
      else if (bet.legs.every((l) => l.result)) {
        const eff = Math.min(MAX_ODDS, bet.legs.reduce((p, l) => p * (l.result === 'won' ? l.odds : 1), 1));
        if (bet.legs.every((l) => l.result === 'void')) { bet.status = 'void'; bet.payout = bet.stake; }
        else { bet.status = 'won'; bet.payout = Math.round(bet.stake * eff * 100) / 100; bet.effOdds = Math.round(eff * 100) / 100; }
      } else continue;
      bet.settledAt = Date.now();
      state.balance = Math.round((state.balance + bet.payout) * 100) / 100;
      settled.push(bet);
      if (bet.status === 'won') {
        const pcGain = F1.manager ? F1.manager.betReward(bet) : 0;
        if (pcGain) { bet.pcReward = pcGain; addPC(pcGain, 'Pari gagné'); }
        unlock('win1');
        if (bet.legs.length >= 3) unlock('combo');
        if (bet.effOdds >= 10) unlock('long');
        if (bet.legs.some((l) => l.kind === 'tierce' && l.result === 'won')) unlock('tierce');
      }
    }
    if (settled.length) {
      const done = state.bets.filter((b) => b.status === 'won' || b.status === 'lost').sort((a, b) => b.settledAt - a.settledAt);
      let streak = 0; for (const b of done) { if (b.status === 'won') streak++; else break; }
      if (streak >= 5) unlock('streak');
      if (state.balance >= 5000) unlock('rich');
      track(); save();
    }
    return settled;
  }

  function claimWeekly(season, race) {
    get();
    const k = `${season.year}-${race.round}`;
    if (state.claimed[k]) return 0;
    state.claimed[k] = Date.now();
    state.balance += WEEKLY;
    if (Object.keys(state.claimed).filter((k) => k[0] !== 'S').length >= 5) unlock('loyal');
    track(); save();
    return WEEKLY;
  }
  const SEASON_BONUS = 500;
  function claimSeason(season) {
    get();
    const k = 'S' + season.year;
    if (state.claimed[k]) return 0;
    state.claimed[k] = Date.now();
    state.balance += SEASON_BONUS;
    track(); save();
    return SEASON_BONUS;
  }
  const canClaimSeason = (season) => !get().claimed['S' + season.year];
  function canClaim(season, race) { return race && !get().claimed[`${season.year}-${race.round}`]; }
  function rescue(season, race) {
    get();
    const k = `${season.year}-${race ? race.round : 0}`;
    if (state.balance >= 10 || state.rescues[k]) return 0;
    state.rescues[k] = Date.now();
    state.balance += RESCUE;
    track(); save();
    return RESCUE;
  }
  function canRescue(season, race) { const s = get(); return s.balance < 10 && !s.rescues[`${season.year}-${race ? race.round : 0}`]; }

  function stats() {
    const s = get();
    const done = s.bets.filter((b) => b.status === 'won' || b.status === 'lost');
    const won = done.filter((b) => b.status === 'won');
    const staked = done.reduce((a, b) => a + b.stake, 0);
    const returned = won.reduce((a, b) => a + b.payout, 0);
    const open = s.bets.filter((b) => b.status === 'open');
    return {
      total: s.bets.length, done: done.length, won: won.length, rate: done.length ? won.length / done.length : 0,
      staked, profit: returned - staked, roi: staked ? (returned - staked) / staked : 0,
      bestOdds: won.reduce((m, b) => Math.max(m, b.effOdds || b.odds), 0), biggest: won.reduce((m, b) => Math.max(m, b.payout - b.stake), 0),
      openStake: open.reduce((a, b) => a + b.stake, 0), open: open.length,
    };
  }
  /* ---------- Mode manager ---------- */
  const mgr = () => get().manager;
  function addPC(n, reason) {
    const m = mgr();
    m.pc = Math.round((m.pc + n) * 100) / 100;
    m.log.unshift({ t: Date.now(), n, reason }); if (m.log.length > 40) m.log.pop();
  }
  function spendPC(n, reason) {
    if (mgr().pc + 1e-9 < n) throw new Error('PitCoins insuffisants');
    addPC(-n, reason);
  }
  function buyDriver(d, resale) {
    const m = mgr();
    if (m.driver && m.driver.id === d.id) throw new Error('Ce pilote est déjà dans votre écurie');
    const net = d.price - (resale || 0);
    if (m.pc + 1e-9 < net) throw new Error(`Il vous manque ${Math.ceil(net - m.pc)} PitCoins`);
    if (resale) addPC(resale, `Transfert : vente de ${m.driver.name}`);
    spendPC(d.price, `Recrutement : ${d.name}`);
    m.driver = { id: d.id, name: d.name, price: d.price, at: Date.now() };
    if (m.chassis) unlock('mgr_team');
    save();
  }
  function buyChassis(c, resale) {
    const m = mgr();
    if (m.chassis && m.chassis.id === c.id) throw new Error('Vous possédez déjà ce châssis');
    const net = c.price - (resale || 0);
    if (m.pc + 1e-9 < net) throw new Error(`Il vous manque ${Math.ceil(net - m.pc)} PitCoins`);
    if (resale) addPC(resale, `Revente du châssis ${m.chassis.name}`);
    spendPC(c.price, `Achat du châssis ${c.name}`);
    m.chassis = { id: c.id, name: c.name, price: c.price, at: Date.now() };
    m.ups = { speed: 0, df: 0, rel: 0 }; m.parts = {}; m.rdSpent = 0; m.setup = 0;
    if (m.driver) unlock('mgr_team');
    save();
  }
  function upgrade(stat, cost) {
    const m = mgr();
    if (!m.chassis) throw new Error('Achetez d\'abord un châssis');
    spendPC(cost, `R&D : ${stat}`);
    m.ups[stat] = (m.ups[stat] || 0) + 1; m.rdSpent += cost;
    if (m.ups[stat] >= 5) unlock('mgr_rd');
    save();
  }
  // Statistiques du jour (objectifs)
  function daily() {
    const m = mgr();
    if (!m.daily || m.daily.key !== dayKey()) m.daily = { key: dayKey(), races: 0, top5: 0, podium: 0, win: 0, gainMax: 0, finish: 0, rd: 0, tunnelOk: 0, fastest: 0, claimed: {} };
    return m.daily;
  }
  function objectives() {
    const d = daily();
    return F1.manager.dailyObjectives(d.key).map((o) => ({ ...o, val: Math.min(o.goal, d[o.k] || 0), done: (d[o.k] || 0) >= o.goal, claimed: !!d.claimed[o.id] }));
  }
  function claimObjective(id, mult = 1) {
    const o = objectives().find((x) => x.id === id);
    if (!o || !o.done || o.claimed) throw new Error('Objectif non disponible');
    const pc = Math.round(o.pc * mult);
    daily().claimed[id] = Date.now();
    addPC(pc, `Objectif : ${o.txt}`);
    if (objectives().every((x) => x.claimed)) unlock('mgr_obj');
    save();
    return pc;
  }
  // Recherche : chaque pièce progresse de Mk I à Mk V. mode 'tunnel' = pari soufflerie (moitié prix, réussite incertaine)
  function research(part, mode = 'safe') {
    const m = mgr(), MG = F1.manager;
    if (!m.chassis) throw new Error('Achetez d\'abord un châssis');
    const lv = MG.partLevel(m.parts, part.id);
    if (lv >= MG.MAX_LV) throw new Error('Pièce déjà au niveau maximal');
    if (!lv && MG.partState(part, m.parts) !== 'available') throw new Error('Développez d\'abord la pièce précédente de cette branche');
    const full = MG.levelCost(part, lv + 1);
    const tunnel = mode === 'tunnel';
    const cost = tunnel ? Math.round(full / 2) : full;
    const chance = tunnel ? MG.tunnelChance(m.fails[part.id] || 0) : 1;
    spendPC(cost, `R&D${tunnel ? ' (soufflerie)' : ''} : ${part.name} ${MG.LV_NAME[lv + 1]}`);
    m.rdSpent += cost;
    const ok = Math.random() < chance;
    const d = daily();
    if (ok) {
      m.parts[part.id] = lv + 1; m.fails[part.id] = 0; d.rd++;
      if (tunnel) { d.tunnelOk++; unlock('mgr_tunnel'); }
      if (Object.keys(m.parts).length >= 5) unlock('mgr_rd');
      if (lv + 1 >= MG.MAX_LV) unlock('mgr_mk5');
      if (MG.branchPackage(part.cat, part.br, m.parts).minL >= 1) unlock('mgr_pkg');
    } else m.fails[part.id] = (m.fails[part.id] || 0) + 1;
    save();
    return { ok, level: m.parts[part.id] || 0, chance, cost };
  }
  function setSetup(v) { mgr().setup = v; save(); }
  const dayKey = () => new Date().toLocaleDateString('fr-CA');
  function racesLeft() { const m = mgr(); return (F1.manager ? F1.manager.RACES_PER_DAY : 5) - (m.day.key === dayKey() ? m.day.n : 0); }
  function recordRace(r) {
    const m = mgr();
    if (m.day.key !== dayKey()) m.day = { key: dayKey(), n: 0 };
    m.day.n++;
    const before = m.lp;
    m.lp = Math.max(0, m.lp + r.lp);
    m.best = Math.max(m.best, m.lp);
    addPC(r.pc, `Course : P${r.pos}${r.dnf ? ' (abandon)' : ''}`);
    m.races.unshift({ ...r, t: Date.now(), lpBefore: before, lpAfter: m.lp }); if (m.races.length > 30) m.races.pop();
    const d = daily();
    d.races++;
    if (!r.dnf) { d.finish++; if (r.pos <= 5) d.top5++; if (r.pos <= 3) d.podium++; if (r.pos === 1) d.win++; d.gainMax = Math.max(d.gainMax, (r.grid || r.pos) - r.pos); }
    if (r.fastest) d.fastest++;
    if (r.pos === 1 && !r.dnf) unlock('mgr_win');
    if (F1.manager && m.lp >= F1.manager.LEAGUES[2].min) unlock('mgr_or');
    save();
  }

  function setName(n) { get().name = String(n).slice(0, 24); save(); }
  function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(get())))); }
  function importCode(code) {
    const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!o || o.v !== 1 || !Array.isArray(o.bets)) throw new Error('Code invalide');
    state = o; save();
  }
  function reset() { const n = get().name; state = blank(); state.name = n; save(); }
  const popUnlocked = () => unlocked.splice(0);

  F1.store = { load, get, save, onChange, mgr, addPC, objectives, claimObjective, buyDriver, buyChassis, upgrade, research, setSetup, racesLeft, recordRace, dayKey, placeBet, settleAll, claimWeekly, claimSeason, canClaimSeason, SEASON_BONUS, canClaim, rescue, canRescue, stats, setName, exportCode, importCode, reset, popUnlocked, ACH, START, WEEKLY, RESCUE, MAX_ODDS };
})(globalThis.F1 = globalThis.F1 || {});
