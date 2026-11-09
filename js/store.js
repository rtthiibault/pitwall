/* Portefeuille virtuel, historique des paris, succès. Stocké dans le navigateur (localStorage). */
(function (F1) {
  const KEY = 'pitwall:profile:v1';
  const START = 1000;
  const WEEKLY = 150;
  const RESCUE = 300;

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
  ];

  let state = null;
  const listeners = [];

  function blank() {
    return { v: 1, name: '', created: Date.now(), balance: START, bets: [], claimed: {}, rescues: {}, ach: {}, history: [{ t: Date.now(), b: START }] };
  }
  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!state || state.v !== 1) state = blank();
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
    const odds = Math.round(legs.reduce((p, l) => p * l.odds, 1) * 100) / 100;
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
        if (leg.season && leg.season !== season.year) { if (leg.season < season.year) { leg.result = 'void'; changed = true; } continue; }
        const r = F1.markets.settle(leg, season);
        if (r) { leg.result = r; changed = true; }
      }
      if (!changed && !bet.legs.every((l) => l.result)) continue;
      if (bet.legs.some((l) => l.result === 'lost')) { bet.status = 'lost'; bet.payout = 0; }
      else if (bet.legs.every((l) => l.result)) {
        const eff = bet.legs.reduce((p, l) => p * (l.result === 'won' ? l.odds : 1), 1);
        if (bet.legs.every((l) => l.result === 'void')) { bet.status = 'void'; bet.payout = bet.stake; }
        else { bet.status = 'won'; bet.payout = Math.round(bet.stake * eff * 100) / 100; bet.effOdds = Math.round(eff * 100) / 100; }
      } else continue;
      bet.settledAt = Date.now();
      state.balance = Math.round((state.balance + bet.payout) * 100) / 100;
      settled.push(bet);
      if (bet.status === 'won') {
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
    if (Object.keys(state.claimed).length >= 5) unlock('loyal');
    track(); save();
    return WEEKLY;
  }
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
  function setName(n) { get().name = String(n).slice(0, 24); save(); }
  function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(get())))); }
  function importCode(code) {
    const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!o || o.v !== 1 || !Array.isArray(o.bets)) throw new Error('Code invalide');
    state = o; save();
  }
  function reset() { const n = get().name; state = blank(); state.name = n; save(); }
  const popUnlocked = () => unlocked.splice(0);

  F1.store = { load, get, save, onChange, placeBet, settleAll, claimWeekly, canClaim, rescue, canRescue, stats, setName, exportCode, importCode, reset, popUnlocked, ACH, START, WEEKLY, RESCUE };
})(globalThis.F1 = globalThis.F1 || {});
