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
    { id: 'mgr_staff', icon: '🎧', title: 'Muret au complet', desc: 'Pourvoir les 5 postes du muret des stands' },
    { id: 'mgr_garage', icon: '🧰', title: 'Garage dernier cri', desc: 'Cumuler 25 niveaux d\'équipements de garage' },
    { id: 'mgr_rain', icon: '🌧️', title: 'Maître de la pluie', desc: 'Gagner une course manager sous la pluie' },
    { id: 'mgr_obj', icon: '🎯', title: 'Feuille de route', desc: 'Remplir les 3 objectifs d\'une journée' },
  ];

  let state = null;
  const listeners = [];

  function blank() {
    return { v: 1, name: '', created: Date.now(), balance: START, bets: [], claimed: {}, rescues: {}, ach: {}, history: [{ t: Date.now(), b: START }], manager: blankManager() };
  }
  const blankManager = () => ({ pc: (F1.manager && F1.manager.START_PC) || 300, driver: null, chassis: null, ups: { speed: 0, df: 0, rel: 0 }, parts: {}, rdSpent: 0, setup: 0, lp: 0, best: 0, races: [], day: { key: 0, n: 0, paid: 0 }, log: [], staff: {}, garage: {}, fails: {}, daily: { key: '' }, drvXp: {}, next: { seed: (Math.random() * 4294967296) >>> 0, tyre: 'M', plan: { stops: [{ lap: 9, tyre: 'H' }] } } });
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
    if (!m.staff) m.staff = {};
    if (!m.drvXp) m.drvXp = {};
    // quota par fenêtre de 5 h (et non plus par jour) : un ancien compteur journalier repart à zéro
    if (!m.day || typeof m.day.key !== 'number') m.day = { key: 0, n: 0, paid: 0 };
    if (!m.next || typeof m.next.seed !== 'number') m.next = { seed: (Math.random() * 4294967296) >>> 0, tyre: 'M' };
    if (!['S', 'M', 'H', 'I', 'W'].includes(m.next.tyre)) m.next.tyre = 'M';
    if (!m.next.plan || !Array.isArray(m.next.plan.stops)) m.next.plan = { stops: [{ lap: 9, tyre: 'H' }] };
    if (!m.garage) m.garage = {};
    if (!m.sponsors) m.sponsors = { main: null, sub: null, log: [] };
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
        if (leg.season ? leg.season !== (season.key || season.year) : season.series === 'wec') continue;
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
    const tb = MG.teamBonus(m);
    const full = Math.round(MG.levelCost(part, lv + 1) * (1 - tb.rd));
    const tunnel = mode === 'tunnel';
    const cost = tunnel ? Math.round(full / 2) : full;
    const chance = tunnel ? Math.min(0.95, MG.tunnelChance(m.fails[part.id] || 0) + tb.tunnel) : 1;
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
  // Personnel : recruter un membre du muret des stands (l'ancien titulaire est repris à 50 %)
  function hireStaff(role, id) {
    const m = mgr(), MG = F1.manager;
    const x = MG.STAFF[role].find((c) => c.id === id);
    if (!x) throw new Error('Candidat inconnu');
    const cur = MG.staffOf(m, role);
    if (cur && cur.id === id) throw new Error('Déjà en poste');
    const refund = cur ? Math.round(cur.price * 0.5) : 0;
    if (m.pc + refund + 1e-9 < x.price) throw new Error(`Il vous manque ${Math.ceil(x.price - refund - m.pc)} PitCoins`);
    if (refund) addPC(refund, `Départ de ${cur.name}`);
    spendPC(x.price, `Recrutement : ${x.name}`);
    m.staff[role] = id;
    if (MG.STAFF_ROLES.every((r) => m.staff[r.id])) unlock('mgr_staff');
    save();
    return x;
  }
  // Garage : améliorer un équipement d'un niveau
  function upgradeGarage(id) {
    const m = mgr(), MG = F1.manager;
    const g = MG.GARAGE_BY_ID.get(id);
    const l = MG.garageLevel(m, id);
    if (!g || l >= MG.MAX_LV) throw new Error('Équipement déjà au niveau maximal');
    spendPC(MG.garageCost(g, l + 1), `Garage : ${g.name} niv. ${l + 1}`);
    m.garage[id] = l + 1;
    if (Object.values(m.garage).reduce((a, v) => a + v, 0) >= 25) unlock('mgr_garage');
    save();
    return l + 1;
  }
  function setSetup(v) { mgr().setup = v; save(); }
  const dayKey = () => new Date().toLocaleDateString('fr-CA');
  /* Courses du manager : 3 gratuites par fenêtre de 5 heures (plus les bonus du garage et du personnel).
     Au-delà, des courses supplémentaires se paient en jetons (la monnaie des paris) : 100, puis 150, 200…
     Le tarif repart à 100 à chaque nouvelle fenêtre. */
  const WINDOW_MS = () => ((F1.manager && F1.manager.REFILL_H) || 5) * 3600e3;
  const windowKey = () => Math.floor(Date.now() / WINDOW_MS());
  const win = () => { const m = mgr(); if (m.day.key !== windowKey()) m.day = { key: windowKey(), n: 0, paid: 0 }; return m.day; };
  function racesPerDay() { return (F1.manager ? F1.manager.RACES_PER_DAY + F1.manager.teamBonus(mgr()).races : 3); }
  function racesLeft() { return Math.max(0, racesPerDay() - win().n); }
  function extraCost() { return 100 + 50 * (win().paid || 0); }
  function refillIn() { return (windowKey() + 1) * WINDOW_MS() - Date.now(); }
  function canPayExtra() { return state.balance >= extraCost(); }
  function setTyre(t) { mgr().next.tyre = t; save(); }
  function setPlan(stops, of) { mgr().next.plan = { of: of || 20, stops: stops.slice(0, 2) }; save(); }
  // Une course lancée est décomptée tout de suite : on ne peut pas l'annuler en fermant la fenêtre
  function consumeRace() {
    const d = win();
    if (d.n < racesPerDay()) { d.n++; save(); return { paid: 0 }; }
    // course supplémentaire, payée en jetons
    const cost = extraCost();
    if (state.balance < cost) throw new Error(`Il faut ${cost} jetons pour une course supplémentaire`);
    state.balance -= cost; track();
    d.paid = (d.paid || 0) + 1; save();
    return { paid: cost };
  }
  function recordRace(r) {
    const m = mgr();
    m.next = { seed: (Math.random() * 4294967296) >>> 0, tyre: m.next.tyre, plan: m.next.plan };   // nouvelle météo pour la course suivante
    const before = m.lp;
    m.lp = Math.max(0, m.lp + r.lp);
    m.best = Math.max(m.best, m.lp);
    addPC(r.pc, `Course : P${r.pos}${r.dnf ? ' (abandon)' : ''}`);
    m.races.unshift({ ...r, t: Date.now(), lpBefore: before, lpAfter: m.lp }); if (m.races.length > 30) m.races.pop();
    const d = daily();
    d.races++;
    if (!r.dnf) { d.finish++; if (r.pos <= 5) d.top5++; if (r.pos <= 3) d.podium++; if (r.pos === 1) d.win++; d.gainMax = Math.max(d.gainMax, (r.grid || r.pos) - r.pos); }
    if (r.fastest) d.fastest++;
    // expérience du pilote : courses disputées avec l'écurie et XP (selon l'âge) si la course est terminée
    if (m.driver && F1.manager) {
      const x = m.drvXp[m.driver.id] || (m.drvXp[m.driver.id] = { xp: 0, races: 0 });
      const gain = F1.manager.xpForRace(r.pos, r.dnf, F1.manager.ageOf(m.driver.id));
      const before = F1.manager.driverGrowth(m.driver.id, m.drvXp).pts;
      x.races++; x.xp += gain;
      const after = F1.manager.driverGrowth(m.driver.id, m.drvXp).pts;
      m.races[0].xp = gain; m.races[0].grew = Math.floor(after) > Math.floor(before);
    }
    m.races[0].sponsors = sponsorsAfterRace(r.pos, r.dnf);
    if (r.pos === 1 && !r.dnf) unlock('mgr_win');
    if (r.pos === 1 && !r.dnf && r.rain) unlock('mgr_rain');
    if (F1.manager && m.lp >= F1.manager.LEAGUES[2].min) unlock('mgr_or');
    save();
  }

  /* ---------- Sponsors ---------- */
  function signSponsor(id, slot) {
    const MG = F1.manager, m = mgr(), s = MG.SPONSOR_BY_ID.get(id);
    if (!s) throw new Error('Sponsor inconnu');
    if (!['main', 'sub'].includes(slot)) throw new Error('Emplacement inconnu');
    if (m.sponsors[slot]) throw new Error('Cet emplacement a déjà un sponsor');
    const other = m.sponsors[slot === 'main' ? 'sub' : 'main'];
    if (other && other.id === id) throw new Error('Ce sponsor est déjà sur votre voiture');
    const L = MG.LEAGUES.findIndex((l) => l.id === MG.leagueOf(m.lp).id);
    if (L < s.league) throw new Error(`Ce sponsor ne signe qu'à partir de la ligue ${MG.LEAGUES[s.league].name}`);
    const t = MG.sponsorTerms(s, slot);
    m.sponsors[slot] = { id, done: 0, hits: 0, t: Date.now() };
    addPC(t.sign, `Sponsor : prime de signature ${s.name}`);
    save();
    return t;
  }
  // Après chaque course : avancement des contrats, prime ou pénalité à l'échéance
  function sponsorsAfterRace(pos, dnf) {
    const MG = F1.manager, m = mgr(), out = [];
    if (!MG || !m.sponsors) return out;
    for (const slot of ['main', 'sub']) {
      const c = m.sponsors[slot]; if (!c) continue;
      const s = MG.SPONSOR_BY_ID.get(c.id), t = MG.sponsorTerms(s, slot);
      const hitNow = !dnf && pos <= s.goal.top;
      const r = MG.sponsorAfterRace(c, pos, dnf);
      const row = { slot, id: c.id, name: s.name, color: s.color, ink: s.ink, goal: MG.goalText(s.goal), hits: c.hits, count: s.goal.count, done: c.done, races: s.goal.races, hitNow, status: r.status, amount: 0 };
      if (r.status === 'win') { addPC(t.reward, `Sponsor ${s.name} : objectif atteint`); row.amount = t.reward; }
      if (r.status === 'fail') { const pen = Math.min(m.pc, t.penalty); addPC(-pen, `Sponsor ${s.name} : objectif manqué (pénalité)`); row.amount = -pen; }
      if (r.status !== 'run') { m.sponsors[slot] = null; m.sponsors.log.unshift({ id: c.id, slot, status: r.status, amount: row.amount, t: Date.now() }); if (m.sponsors.log.length > 20) m.sponsors.log.pop(); }
      out.push(row);
    }
    return out;
  }
  /* ---------- Grand Prix Hebdomadaire ----------
     m.weeklyGP = { weekId, attemptsUsed, bestTime (ms, null = aucun chrono valide), bestPosition, bestConfig, rewardClaimed, firstPrime }
     m.weeklyPast = semaine précédente en attente de sa prime de classement ; m.trophies = trophées gagnés. */
  function weeklyGP(weekId) {
    const m = mgr();
    if (!m.weeklyGP || m.weeklyGP.weekId !== weekId) {
      if (m.weeklyGP && m.weeklyGP.bestTime != null && !m.weeklyGP.rewardClaimed) m.weeklyPast = { ...m.weeklyGP };
      m.weeklyGP = { weekId, attemptsUsed: 0, bestTime: null, bestPosition: null, bestConfig: null, rewardClaimed: false, firstPrime: false };
      save();
    }
    return m.weeklyGP;
  }
  function useWeeklyAttempt(weekId) {
    const w = weeklyGP(weekId), max = (F1.manager && F1.manager.WEEKLY_ATTEMPTS) || 2;
    if (w.attemptsUsed >= max) throw new Error('Plus de tentative cette semaine : rendez-vous lundi pour le prochain Grand Prix');
    w.attemptsUsed++; save();
    return max - w.attemptsUsed;
  }
  // Fin d'une tentative : meilleur temps conservé, prime au premier chrono valide, petit bonus d'XP (aucun effet sur les sponsors ni la ligue)
  function recordWeekly(r) {
    const m = mgr(), w = weeklyGP(r.weekId);
    if (r.circuit) w.circuit = r.circuit;
    let prime = 0, xp = 0;
    const improved = r.timeMs != null && (w.bestTime == null || r.timeMs < w.bestTime);
    if (improved) { w.bestTime = r.timeMs; w.bestPosition = r.pos; w.bestConfig = { chassis: r.chassis, chassisId: r.chassisId, driver: r.driver }; }
    if (r.timeMs != null && !w.firstPrime) { w.firstPrime = true; prime = (F1.manager && F1.manager.WEEKLY_FIRST_PRIME) || 50; addPC(prime, 'Grand Prix Hebdomadaire : premier chrono de la semaine'); }
    if (m.driver && r.xp) { const x = m.drvXp[m.driver.id] || (m.drvXp[m.driver.id] = { xp: 0, races: 0 }); x.xp += r.xp; xp = r.xp; }
    save();
    return { improved, prime, xp, best: w.bestTime, left: ((F1.manager && F1.manager.WEEKLY_ATTEMPTS) || 2) - w.attemptsUsed };
  }
  // Prime de classement de la semaine passée (une seule fois) et trophée pour un top 10
  function claimWeeklyGP(rank, total) {
    const m = mgr(), w = m.weeklyPast;
    if (!w || w.rewardClaimed) return null;
    const prize = F1.manager.weeklyPrize(rank, total) || 60;
    w.rewardClaimed = true;
    addPC(prize, `Grand Prix Hebdomadaire ${w.weekId} : ${rank ? rank + (rank === 1 ? 'er' : 'e') : 'classé'}`);
    if (rank && rank <= 10) { if (!m.trophies) m.trophies = []; m.trophies.unshift({ week: w.weekId, rank, total, circuit: w.circuit || '', t: Date.now() }); if (m.trophies.length > 40) m.trophies.pop(); }
    m.weeklyPast = null;
    save();
    return { prize, rank, total };
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

  F1.store = { weeklyGP, useWeeklyAttempt, recordWeekly, claimWeeklyGP, signSponsor, load, get, save, onChange, mgr, addPC, hireStaff, upgradeGarage, racesPerDay, extraCost, refillIn, canPayExtra, setTyre, setPlan, consumeRace, objectives, claimObjective, buyDriver, buyChassis, upgrade, research, setSetup, racesLeft, recordRace, dayKey, placeBet, settleAll, claimWeekly, claimSeason, canClaimSeason, SEASON_BONUS, canClaim, rescue, canRescue, stats, setName, exportCode, importCode, reset, popUnlocked, ACH, START, WEEKLY, RESCUE, MAX_ODDS };
})(globalThis.F1 = globalThis.F1 || {});
