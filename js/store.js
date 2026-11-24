/* Portefeuille virtuel, historique des paris, succès. Stocké dans le navigateur (localStorage). */
(function (F1) {
  const KEY = 'pitwall:profile:v1';
  const START = 1000;
  const WEEKLY = 150;
  const RESCUE = 300;
  const MAX_ODDS = 2000; // plafond d'un combiné

  /* ---------- Succès ----------
     cat : rubrique · reward : jetons crédités en réclamant · goal(state) : progression { v, max } (sinon succès « événement »,
     débloqué par unlock()). Un succès est acquis quand sa progression est complète ; ses jetons se réclament dans l'onglet Succès. */
  const nBets = (s) => s.bets.length, nWon = (s) => s.bets.filter((b) => b.status === 'won').length;
  const bestStreak = (s) => { let best = 0, cur = 0; s.bets.filter((b) => b.status === 'won' || b.status === 'lost').sort((a, b) => (a.settledAt || 0) - (b.settledAt || 0)).forEach((b) => { cur = b.status === 'won' ? cur + 1 : 0; best = Math.max(best, cur); }); return best; };
  const MS = (s) => (s.manager && s.manager.stats) || {};
  const ACH = [
    // Paris
    { id: 'first', cat: 'paris', icon: '🎟️', title: 'Lights out', desc: 'Placer votre premier pari', reward: 50, goal: (s) => ({ v: nBets(s), max: 1 }) },
    { id: 'bets25', cat: 'paris', icon: '📋', title: 'Habitué des tribunes', desc: 'Placer 25 paris', reward: 120, goal: (s) => ({ v: nBets(s), max: 25 }) },
    { id: 'win1', cat: 'paris', icon: '🍾', title: 'Champagne !', desc: 'Gagner un premier pari', reward: 60, goal: (s) => ({ v: nWon(s), max: 1 }) },
    { id: 'wins10', cat: 'paris', icon: '🏅', title: 'Parieur affûté', desc: 'Gagner 10 paris', reward: 150, goal: (s) => ({ v: nWon(s), max: 10 }) },
    { id: 'wins50', cat: 'paris', icon: '🏆', title: 'Oracle du paddock', desc: 'Gagner 50 paris', reward: 500, goal: (s) => ({ v: nWon(s), max: 50 }) },
    { id: 'streak', cat: 'paris', icon: '🔥', title: 'Grand Chelem', desc: 'Gagner 5 paris d\'affilée', reward: 300, goal: (s) => ({ v: bestStreak(s), max: 5 }) },
    { id: 'combo', cat: 'paris', icon: '🔗', title: 'Train DRS', desc: 'Gagner un combiné de 3 sélections ou plus', reward: 150 },
    { id: 'long', cat: 'paris', icon: '🚀', title: 'Remontée fantastique', desc: 'Gagner un pari à cote 10 ou plus', reward: 200 },
    { id: 'tierce', cat: 'paris', icon: '🥇', title: 'Podium parfait', desc: 'Gagner un tiercé', reward: 300 },
    { id: 'season', cat: 'paris', icon: '🔮', title: 'Visionnaire', desc: 'Parier sur le champion du monde', reward: 80 },
    { id: 'rich', cat: 'paris', icon: '💎', title: 'Budget cap explosé', desc: 'Atteindre 5 000 jetons', reward: 250, goal: (s) => ({ v: Math.floor(s.balance), max: 5000 }) },
    { id: 'loyal', cat: 'paris', icon: '📅', title: 'Abonné du paddock', desc: 'Récupérer 5 primes de week-end', reward: 100, goal: (s) => ({ v: Object.keys(s.claimed || {}).filter((k) => k[0] !== 'S').length, max: 5 }) },
    // Paddock Wire
    { id: 'news_win', cat: 'paddock', icon: '📰', title: 'Coup de scoop', desc: 'Gagner un pari dont la cote avait bougé sur une info Paddock Wire', reward: 200, goal: (s) => ({ v: (s.stats || {}).newsWins || 0, max: 1 }) },
    { id: 'news_win5', cat: 'paddock', icon: '📡', title: 'Toujours à l\'écoute', desc: 'Gagner 5 paris influencés par l\'actualité', reward: 400, goal: (s) => ({ v: (s.stats || {}).newsWins || 0, max: 5 }) },
    { id: 'pw_reader', cat: 'paddock', icon: '🔍', title: 'Lecteur assidu', desc: 'Consulter le Paddock Wire 10 fois', reward: 60, goal: (s) => ({ v: (s.stats || {}).pwVisits || 0, max: 10 }) },
    // Ligues
    { id: 'league_join', cat: 'ligues', icon: '🤝', title: 'Esprit d\'équipe', desc: 'Créer ou rejoindre une ligue privée', reward: 100, goal: (s) => ({ v: (s.stats || {}).leagueJoined ? 1 : 0, max: 1 }) },
    { id: 'podium_pick', cat: 'ligues', icon: '🎯', title: 'Pronostiqueur', desc: 'Enregistrer 5 pronostics de podium', reward: 120, goal: (s) => ({ v: (s.stats || {}).podiumPicks || 0, max: 5 }) },
    // F1 Manager
    { id: 'mgr_team', cat: 'manager', icon: '🏗️', title: 'Team principal', desc: 'Avoir un pilote et une équipe', reward: 80 },
    { id: 'mate1', cat: 'manager', icon: '👤', title: 'Duo de choc', desc: 'Recruter votre premier coéquipier', reward: 100 },
    { id: 'mgr_first', cat: 'manager', icon: '🚦', title: 'Baptême du feu', desc: 'Terminer une course en F1 Manager', reward: 50, goal: (s) => ({ v: MS(s).races || 0, max: 1 }) },
    { id: 'mgr_win', cat: 'manager', icon: '🏁', title: 'Première victoire', desc: 'Gagner une course en F1 Manager', reward: 200, goal: (s) => ({ v: MS(s).wins || 0, max: 1 }) },
    { id: 'mgr_win10', cat: 'manager', icon: '👑', title: 'Dynastie', desc: 'Gagner 10 courses en F1 Manager', reward: 600, goal: (s) => ({ v: MS(s).wins || 0, max: 10 }) },
    { id: 'mgr_pod10', cat: 'manager', icon: '🥈', title: 'Habitué du podium', desc: 'Monter 10 fois sur le podium', reward: 300, goal: (s) => ({ v: MS(s).podiums || 0, max: 10 }) },
    { id: 'mgr_50', cat: 'manager', icon: '🛞', title: 'Marathonien', desc: 'Disputer 50 courses en F1 Manager', reward: 300, goal: (s) => ({ v: MS(s).races || 0, max: 50 }) },
    { id: 'one_two', cat: 'manager', icon: '🎆', title: 'Doublé !', desc: 'Finir 1er et 2e avec votre coéquipier', reward: 400 },
    { id: 'cool_race', cat: 'manager', icon: '❄', title: 'Sang-froid', desc: 'Terminer une course sans jamais dépasser 115 °C moteur', reward: 100, goal: (s) => ({ v: MS(s).coolRaces || 0, max: 1 }) },
    { id: 'mgr_rain', cat: 'manager', icon: '🌧️', title: 'Maître de la pluie', desc: 'Gagner une course sous la pluie', reward: 250 },
    { id: 'pc10k', cat: 'manager', icon: '💰', title: 'Coffre-fort', desc: 'Atteindre 10 000 PitCoins', reward: 500, goal: (s) => ({ v: Math.floor((s.manager || {}).pc || 0), max: 10000 }) },
    { id: 'mgr_or', cat: 'manager', icon: '🥇', title: 'Ligue Or', desc: 'Atteindre la ligue Or', reward: 300 },
    { id: 'mgr_rd', cat: 'manager', icon: '🔬', title: 'Bureau d\'études', desc: 'Développer 5 pièces en R&D', reward: 100, goal: (s) => ({ v: Object.keys((s.manager || {}).parts || {}).length, max: 5 }) },
    { id: 'mgr_mk5', cat: 'manager', icon: '🧬', title: 'Spécification ultime', desc: 'Amener une pièce au niveau Mk V', reward: 200 },
    { id: 'mgr_pkg', cat: 'manager', icon: '📦', title: 'Package complet', desc: 'Développer toutes les pièces d\'une branche de R&D', reward: 200 },
    { id: 'pass_season', cat: 'manager', icon: '🎟️', title: 'Saison bouclée', desc: 'Réclamer les 24 paliers d\'un Pass de saison', reward: 300, goal: (s) => ({ v: ((s.manager && s.manager.pass && s.manager.pass.done) || []).length, max: 1 }) },
    { id: 'mgr_tunnel', cat: 'manager', icon: '🎲', title: 'Coup de poker', desc: 'Réussir un pari en soufflerie', reward: 100 },
    { id: 'mgr_staff', cat: 'manager', icon: '🎧', title: 'Muret au complet', desc: 'Pourvoir les 5 postes du muret', reward: 200, goal: (s) => ({ v: Object.values((s.manager || {}).staff || {}).filter(Boolean).length, max: 5 }) },
    { id: 'mgr_garage', cat: 'manager', icon: '🧰', title: 'Garage dernier cri', desc: 'Cumuler 25 niveaux d\'équipements de garage', reward: 250, goal: (s) => ({ v: Object.values((s.manager || {}).garage || {}).reduce((a, x) => a + (+x || 0), 0), max: 25 }) },
    { id: 'mgr_obj', cat: 'manager', icon: '🎯', title: 'Feuille de route', desc: 'Remplir les 3 objectifs d\'une journée', reward: 100 },
    { id: 'weekly', cat: 'manager', icon: '🌐', title: 'Rendez-vous hebdo', desc: 'Signer un chrono au Grand Prix Hebdomadaire', reward: 100, goal: (s) => ({ v: ((s.manager || {}).weeklyGP || {}).bestTime != null || ((s.manager || {}).trophies || []).length ? 1 : 0, max: 1 }) },
    { id: 'weekly_top10', cat: 'manager', icon: '🏆', title: 'Trophée hebdo', desc: 'Finir dans le top 10 d\'un Grand Prix Hebdomadaire', reward: 300, goal: (s) => ({ v: ((s.manager || {}).trophies || []).length ? 1 : 0, max: 1 }) },
    // Profil
    { id: 'avatar', cat: 'profil', icon: '🪪', title: 'Nouveau look', desc: 'Choisir votre photo de profil', reward: 50, goal: (s) => ({ v: s.avatar ? 1 : 0, max: 1 }) },
  ];
  const ACH_BY = new Map(ACH.map((a) => [a.id, a]));

  let state = null;
  const listeners = [];

  function blank() {
    return { v: 1, name: '', created: Date.now(), balance: START, bets: [], claimed: {}, rescues: {}, ach: {}, achClaimed: {}, stats: { tokensEarned: 0, newsWins: 0, leagueJoined: false, pwVisits: 0, podiumPicks: 0 }, avatar: null, history: [{ t: Date.now(), b: START }], manager: blankManager() };
  }
  const blankManager = () => ({ ecoV: 2, pc: (F1.manager && F1.manager.START_PC) || 300, driver: null, chassis: null, ups: { speed: 0, df: 0, rel: 0 }, parts: {}, rdSpent: 0, setup: 0, lp: 0, best: 0, races: [], day: { key: 0, n: 0, paid: 0 }, log: [], staff: {}, garage: {}, fails: {}, daily: { key: '' }, drvXp: {}, next: { seed: (Math.random() * 4294967296) >>> 0, tyre: 'M', plan: { stops: [{ lap: 9, tyre: 'H' }] } } });
  const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const blankPass = (season = 1, done = [], liveries = [], tokens = 0, skin = null) => ({ season, xp: 0, claimed: {}, tokens, liveries, skin, done, month: curMonth() });
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
    if (m.mate === undefined) m.mate = null;
    if (!m.sponsors.cool) m.sponsors.cool = {};
    if (m.sponsors.seen == null) m.sponsors.seen = Date.now();
    if (!m.tunnel) m.tunnel = { slots: 1, jobs: [] };
    if (!m.pass) m.pass = blankPass();
    if (!m.pass.month) m.pass.month = curMonth();
    if (!m.mseason) m.mseason = { key: curMonth(), peak: m.lp || 0 };
    if (!m.seasons) m.seasons = [];
    // statistiques de carrière du manager (reconstituées depuis l'historique des anciennes sauvegardes)
    if (!m.stats) {
      const rs = m.races || [], P = (F1.manager && F1.manager.F1_POINTS) || [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
      m.stats = { races: rs.length, wins: rs.filter((x) => x.pos === 1 && !x.dnf).length, podiums: rs.filter((x) => x.pos <= 3 && !x.dnf).length,
        best: rs.reduce((b, x) => (x.dnf ? b : Math.min(b, x.pos)), 99), points: rs.reduce((a, x) => a + (x.dnf ? 0 : P[x.pos - 1] || 0), 0), dnf: rs.filter((x) => x.dnf).length,
        coolRaces: 0, pcEarned: 0, mateWins: 0, matePodiums: 0 };
    }
    if (!state.stats) state.stats = { tokensEarned: 0, newsWins: 0, leagueJoined: false, pwVisits: 0, podiumPicks: 0 };
    if (!state.achClaimed) state.achClaimed = {};
    if (state.avatar === undefined) state.avatar = null;
    return state;
  }
  function save() {
    checkAch();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
    listeners.forEach((f) => f(state));
  }
  const get = () => state || load();
  const onChange = (f) => listeners.push(f);
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const track = () => { state.history.push({ t: Date.now(), b: Math.round(state.balance * 100) / 100 }); if (state.history.length > 400) state.history.shift(); };
  const unlocked = [];
  function unlock(id) { const a = ACH_BY.get(id); if (a && !state.ach[id]) { state.ach[id] = Date.now(); unlocked.push(a); } }
  // Progression d'un succès (0..1) ; ceux qui sont complets sont marqués acquis automatiquement
  function achProgress(a) { if (state.ach[a.id]) return { v: 1, max: 1, done: true }; if (!a.goal) return { v: 0, max: 1, done: false }; const g = a.goal(state); return { v: Math.min(g.v, g.max), max: g.max, done: g.v >= g.max }; }
  function checkAch() { if (!state) return; for (const a of ACH) if (a.goal && !state.ach[a.id]) { try { if (achProgress(a).done) unlock(a.id); } catch (e) { /* données incomplètes */ } } }
  // Réclamer les jetons d'un succès acquis
  function claimAch(id) {
    get(); const a = ACH_BY.get(id);
    if (!a || !state.ach[id]) throw new Error('Succès pas encore débloqué');
    if (!state.achClaimed) state.achClaimed = {};
    if (state.achClaimed[id]) throw new Error('Récompense déjà réclamée');
    state.achClaimed[id] = Date.now();
    state.balance = Math.round((state.balance + a.reward) * 100) / 100;
    state.stats.tokensEarned = (state.stats.tokensEarned || 0) + a.reward;
    track(); save();
    return a.reward;
  }
  const achClaimable = () => { get(); return ACH.filter((a) => state.ach[a.id] && !(state.achClaimed || {})[a.id]); };
  function noteStat(k, v) { get(); state.stats[k] = v === undefined ? (state.stats[k] || 0) + 1 : v; save(); }
  function setAvatar(src) { get(); state.avatar = src; save(); }

  function placeBet(legs, stake) {
    get();
    stake = Math.floor(stake * 100) / 100;
    if (!(stake > 0)) throw new Error('Mise invalide');
    if (stake > state.balance + 1e-9) throw new Error('Solde insuffisant');
    const odds = Math.min(MAX_ODDS, Math.round(legs.reduce((p, l) => p * l.odds, 1) * 100) / 100);
    const bet = {
      id: uid(), placedAt: Date.now(), stake, odds, status: 'open', payout: 0,
      legs: legs.map((l) => ({ sid: l.sid, mid: l.mid, kind: l.kind, round: l.round, key: l.key, label: l.label, mtitle: l.mtitle, odds: l.odds, args: l.args, driverId: l.driverId, teamId: l.teamId, season: l.season, news: l.news || null, result: null })),
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
        if (bet.legs.some((l) => l.news && l.result === 'won')) state.stats.newsWins = (state.stats.newsWins || 0) + 1;
        state.stats.tokensEarned = (state.stats.tokensEarned || 0) + Math.max(0, bet.payout - bet.stake);
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
    if (m.mate && m.mate.id === d.id) throw new Error('Ce pilote est votre coéquipier : libérez-le d\'abord dans l\'onglet Transferts');
    const net = d.price - (resale || 0);
    if (m.pc + 1e-9 < net) throw new Error(`Il vous manque ${Math.ceil(net - m.pc)} PitCoins`);
    if (resale) addPC(resale, `Transfert : vente de ${m.driver.name}`);
    spendPC(d.price, `Recrutement : ${d.name}`);
    m.driver = { id: d.id, name: d.name, price: d.price, at: Date.now() };
    if (m.chassis) unlock('mgr_team');
    save();
  }
  // Coéquipier : recrutement, transfert (remplacement avec revente) ou libération
  // un seul changement de coéquipier (recrutement, transfert ou libération) par jour
  const mateLocked = () => mgr().mateDay === dayKey();
  function buyMate(d, price, resale) {
    const m = mgr();
    if (mateLocked()) throw new Error('Un seul changement de coéquipier par jour : revenez demain');
    if (m.driver && m.driver.id === d.id) throw new Error('Ce pilote est déjà votre pilote titulaire');
    if (m.mate && m.mate.id === d.id) throw new Error('Ce pilote est déjà votre coéquipier');
    const net = price - (resale || 0);
    if (m.pc + 1e-9 < net) throw new Error(`Il vous manque ${Math.ceil(net - m.pc)} PitCoins`);
    if (resale) addPC(resale, `Transfert : départ de ${m.mate.name}`);
    spendPC(price, `Recrutement du coéquipier : ${d.name}`);
    m.mate = { id: d.id, name: d.name, price, at: Date.now() };
    m.mateDay = dayKey();
    unlock('mate1');
    save();
  }
  function releaseMate(resale) {
    const m = mgr(); if (!m.mate) return 0;
    if (mateLocked()) throw new Error('Un seul changement de coéquipier par jour : revenez demain');
    const name = m.mate.name;
    m.mateDay = dayKey();
    if (resale) addPC(resale, `Transfert : départ de ${name}`);
    m.mate = null; save();
    return resale || 0;
  }
  function buyChassis(c, resale) {
    const m = mgr();
    if (m.chassis && m.chassis.id === c.id) throw new Error('Vous possédez déjà ce châssis');
    const net = c.price - (resale || 0);
    if (m.pc + 1e-9 < net) throw new Error(`Il vous manque ${Math.ceil(net - m.pc)} PitCoins`);
    if (resale) addPC(resale, `Revente du châssis ${m.chassis.name}`);
    spendPC(c.price, `Achat du châssis ${c.name}`);
    m.chassis = { id: c.id, name: c.name, price: c.price, at: Date.now() };
    // la R&D suit le manager à 50 % : chaque pièce garde la moitié de ses niveaux (arrondi inférieur)
    const half = {}; for (const k in m.parts) { const l = Math.floor(m.parts[k] / 2); if (l > 0) half[k] = l; }
    m.parts = half; m.ups = { speed: Math.floor((m.ups.speed || 0) / 2), df: Math.floor((m.ups.df || 0) / 2), rel: Math.floor((m.ups.rel || 0) / 2) };
    m.rdSpent = Math.round((m.rdSpent || 0) / 2); m.setup = 0;
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
  // Recherche : chaque pièce progresse de Mk I à Mk V. mode 'tunnel' = pari soufflerie (moitié prix, réussite incertaine).
  // Toute pièce est fabriquée en soufflerie (heure de fin enregistrée), même en développement sûr au plein tarif,
  // puis il faut l'installer : c'est à ce moment que le pari soufflerie est tranché.
  const tunnel = () => { const m = mgr(); if (!m.tunnel) m.tunnel = { slots: 1, jobs: [] }; return m.tunnel; };
  const jobOf = (pid) => tunnel().jobs.find((j) => j.pid === pid) || null;
  function applyResearch(part, level, tunnelMode, ok) {
    const m = mgr(), MG = F1.manager, d = daily();
    if (ok) {
      m.parts[part.id] = level; m.fails[part.id] = 0; d.rd++;
      if (tunnelMode) { d.tunnelOk++; unlock('mgr_tunnel'); }
      if (Object.keys(m.parts).length >= 5) unlock('mgr_rd');
      if (level >= MG.MAX_LV) unlock('mgr_mk5');
      if (MG.branchPackage(part.cat, part.br, m.parts).minL >= 1) unlock('mgr_pkg');
    } else m.fails[part.id] = (m.fails[part.id] || 0) + 1;
  }
  function research(part, mode = 'safe') {
    const m = mgr(), MG = F1.manager;
    if (!m.chassis) throw new Error('Achetez d\'abord un châssis');
    const lv = MG.partLevel(m.parts, part.id);
    if (lv >= MG.MAX_LV) throw new Error('Pièce déjà au niveau maximal');
    if (!lv && MG.partState(part, m.parts) !== 'available') throw new Error('Développez d\'abord la pièce précédente de cette branche');
    if (jobOf(part.id)) throw new Error('Cette pièce est déjà en soufflerie');
    const ms = MG.rdBuildMs(lv + 1, part.id), T = tunnel();
    if (ms > 0 && T.jobs.length >= T.slots) throw new Error('La soufflerie est occupée : installez ou terminez la pièce en cours');
    const tb = MG.teamBonus(m);
    const full = Math.round(MG.levelCost(part, lv + 1) * (1 - tb.rd));
    const tunnelMode = mode === 'tunnel';
    const wait = tunnelMode ? betWait() : 0;
    if (wait > 0) throw new Error(`Pari soufflerie déjà tenté récemment : prochain pari possible dans ${Math.ceil(wait / 60e3)} min`);
    const cost = tunnelMode ? Math.round(full / 2) : full;
    const chance = tunnelMode ? Math.min(0.95, MG.tunnelChance(m.fails[part.id] || 0) + tb.tunnel) : 1;
    spendPC(cost, `R&D${tunnelMode ? ' (soufflerie)' : ''} : ${part.name} ${MG.LV_NAME[lv + 1]}`);
    if (tunnelMode) m.betAt = Date.now();
    m.rdSpent += cost;
    if (ms > 0) {
      const now = Date.now(), job = { pid: part.id, lv: lv + 1, mode: tunnelMode ? 'tunnel' : 'safe', chance, cost, start: now, end: now + ms };
      T.jobs.push(job); save();
      return { queued: true, job, cost };
    }
    const ok = Math.random() < chance;
    applyResearch(part, lv + 1, tunnelMode, ok);
    save();
    return { ok, level: m.parts[part.id] || 0, chance, cost };
  }
  // Fabrication terminée : la pièce est installée (ou rejetée si le pari soufflerie échoue)
  // temps restant avant le prochain pari soufflerie (0 = disponible)
  function betWait() { const m = mgr(); return m.betAt ? Math.max(0, m.betAt + F1.manager.TUNNEL_BET_CD - Date.now()) : 0; }
  function installPart(pid) {
    const m = mgr(), MG = F1.manager, T = tunnel(), j = jobOf(pid);
    if (!j) throw new Error('Aucune pièce en fabrication');
    if (j.end > Date.now()) throw new Error('La pièce n\'est pas encore prête');
    const part = MG.RD_BY_ID.get(pid);
    T.jobs = T.jobs.filter((x) => x !== j);
    const ok = Math.random() < j.chance;
    if (part) applyResearch(part, j.lv, j.mode === 'tunnel', ok);
    save();
    return { ok, level: m.parts[pid] || 0, chance: j.chance, cost: j.cost, mode: j.mode };
  }
  // Terminer immédiatement une fabrication en payant des jetons
  function rushJob(pid) {
    const j = jobOf(pid); if (!j) throw new Error('Aucune pièce en fabrication');
    const left = j.end - Date.now(); if (left <= 0) return 0;
    const cost = F1.manager.rushCost(left);
    if (state.balance + 1e-9 < cost) throw new Error(`Il faut ${cost} jetons pour terminer tout de suite`);
    state.balance = Math.round((state.balance - cost) * 100) / 100; track();
    j.end = Date.now(); save();
    return cost;
  }
  function unlockSlot2() {
    const T = tunnel(); if (T.slots >= 2) throw new Error('Deuxième emplacement déjà débloqué');
    spendPC(F1.manager.TUNNEL_SLOT2_PC, 'Soufflerie : deuxième emplacement de fabrication');
    T.slots = 2; save();
  }

  /* ---------- Pass de saison ---------- */
  const pass = () => { const m = mgr(); if (!m.pass) m.pass = blankPass(); return m.pass; };
  function addPassXp(n) { const MG = F1.manager; if (!MG) return 0; const p = pass(); p.xp = Math.min(MG.PASS_TIERS * MG.PASS_XP_TIER, (p.xp || 0) + n); return n; }
  function claimPass(tier) {
    const MG = F1.manager, p = pass();
    tier = +tier;
    if (!(tier >= 1 && tier <= MG.PASS_TIERS)) throw new Error('Palier inconnu');
    if (MG.passTier(p.xp) < tier) throw new Error('Palier pas encore atteint');
    if (p.claimed[tier]) throw new Error('Récompense déjà réclamée');
    const r = MG.passReward(tier);
    if (r.kind === 'chest') {
      // coffre mystère : contenu tiré à l'ouverture
      r.pc = r.min + Math.round(Math.random() * (r.max - r.min));
      if (!p.got) p.got = {};
      p.got[tier] = r.pc;
      addPC(r.pc, `Pass de saison ${p.season} : ${r.name} (palier ${tier})`);
    }
    else if (r.kind === 'token') p.tokens = (p.tokens || 0) + 1;
    else if (r.kind === 'livery' && !p.liveries.includes(r.id)) p.liveries.push(r.id);
    p.claimed[tier] = Date.now();
    save();
    return r;
  }
  const passComplete = () => { const p = pass(); return Array.from({ length: F1.manager.PASS_TIERS }, (_, i) => i + 1).every((t) => p.claimed[t]); };
  // le Pass suivant ouvre le mois d'après : on ne peut pas enchaîner les saisons
  const passNextOpen = () => passComplete() && pass().month !== curMonth();
  function nextSeason() {
    if (!passComplete()) throw new Error('Réclamez d\'abord les 24 paliers');
    if (pass().month === curMonth()) throw new Error('Le prochain Pass ouvre le mois prochain');
    const m = mgr(), p = pass();
    m.pass = blankPass(p.season + 1, [...(p.done || []), { season: p.season, at: Date.now() }], p.liveries, p.tokens, p.skin);
    save();
    return m.pass;
  }
  // Numéro de course du joueur (1 à 99), libre s'il n'est pas déjà porté par un autre pilote de la grille
  function setNumber(n) {
    const m = mgr(), c = F1.num ? F1.num.clean(n) : String(n);
    if (!c || +c < 1 || +c > 99) throw new Error('Choisissez un numéro entre 1 et 99');
    const who = F1.num && F1.num.takenBy(c);
    if (who && !(m.driver && m.driver.id === who)) throw new Error('Ce numéro est déjà porté par un pilote de la grille');
    m.number = String(+c); save();
    return m.number;
  }
  /* Fin de saison mensuelle (appelée à l'ouverture du F1 Manager) : prime selon la ligue de fin de mois,
     LP ramenés à 60 %, résumé à afficher une fois. Renvoie le résumé s'il y a eu un changement de mois. */
  function seasonRoll() {
    const m = mgr(), MG = F1.manager; if (!MG) return null;
    if (!m.mseason) m.mseason = { key: curMonth(), peak: m.lp || 0 };
    if (m.mseason.key === curMonth()) return null;
    const L = MG.leagueOf(m.lp), li = MG.LEAGUES.indexOf(L), prize = MG.SEASON_PRIZE[li] || 0;
    const lpAfter = Math.round(m.lp * MG.SEASON_KEEP);
    const rec = { key: m.mseason.key, lp: m.lp, peak: Math.max(m.mseason.peak || 0, m.lp), league: L.id, prize, lpAfter, races: (m.stats && m.stats.races) || 0, t: Date.now() };
    if (prize) addPC(prize, `Fin de saison ${m.mseason.key} : ligue ${L.name}`);
    m.lp = lpAfter;
    m.seasons.unshift(rec); if (m.seasons.length > 24) m.seasons.pop();
    m.mseason = { key: curMonth(), peak: m.lp };
    m.seasonNews = rec;
    save();
    return rec;
  }
  function setSkin(id) {
    const p = pass();
    if (id && !p.liveries.includes(id)) throw new Error('Livrée pas encore débloquée');
    p.skin = id || null; save();
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
    m.races[0].passXp = addPassXp(F1.manager ? F1.manager.PASS_XP_RACE : 0);
    // statistiques de carrière et prime du coéquipier
    const st = m.stats, P = (F1.manager && F1.manager.F1_POINTS) || [];
    st.races++; if (r.dnf) st.dnf++; else { if (r.pos === 1) st.wins++; if (r.pos <= 3) st.podiums++; st.best = Math.min(st.best, r.pos); st.points += P[r.pos - 1] || 0; }
    st.pcEarned = Math.round((st.pcEarned + Math.max(0, r.pc)) * 100) / 100;
    if (!r.dnf && r.maxEng != null && r.maxEng < 115) { st.coolRaces++; unlock('cool_race'); }
    if (r.mate) {
      m.races[0].mate = r.mate;
      if (r.mate.pc) { addPC(r.mate.pc, `Coéquipier ${r.mate.name} : P${r.mate.pos}`); st.pcEarned += r.mate.pc; }
      if (r.mate.pos === 1 && !r.mate.dnf) st.mateWins++;
      if (r.mate.pos <= 3 && !r.mate.dnf) st.matePodiums++;
      if (!r.dnf && !r.mate.dnf && r.pos <= 2 && r.mate.pos <= 2) unlock('one_two');
    }
    if (m.pc >= 10000) unlock('pc10k');
    if (st.podiums >= 10) unlock('mgr_pod10');
    if (st.races >= 50) unlock('mgr_50');
    if (r.pos === 1 && !r.dnf) unlock('mgr_win');
    if (r.pos === 1 && !r.dnf && r.rain) unlock('mgr_rain');
    if (F1.manager && m.lp >= F1.manager.LEAGUES[2].min) unlock('mgr_or');
    if (m.mseason) m.mseason.peak = Math.max(m.mseason.peak || 0, m.lp);
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
    const wait = sponsorCooldown(id);
    if (wait > 0) throw new Error(`${s.name} ne re-signe pas tout de suite : encore ${wait} course${wait > 1 ? 's' : ''} à disputer`);
    const L = MG.LEAGUES.findIndex((l) => l.id === MG.leagueOf(m.lp).id);
    if (L < s.league) throw new Error(`Ce sponsor ne signe qu'à partir de la ligue ${MG.LEAGUES[s.league].name}`);
    const t = MG.sponsorTerms(s, slot);
    m.sponsors[slot] = { id, done: 0, hits: 0, t: Date.now() };
    addPC(t.sign, `Sponsor : prime de signature ${s.name}`);
    save();
    return t;
  }
  // Courses restant à disputer avant de pouvoir re-signer un sponsor (0 = disponible)
  function sponsorCooldown(id) {
    const m = mgr(), c = m.sponsors && m.sponsors.cool && m.sponsors.cool[id];
    if (c == null) return 0;
    return Math.max(0, F1.manager.SPONSOR_COOLDOWN - ((m.stats && m.stats.races) || 0) + c);
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
      if (r.status !== 'run') { m.sponsors[slot] = null; if (!m.sponsors.cool) m.sponsors.cool = {}; m.sponsors.cool[c.id] = ((m.stats && m.stats.races) || 0) + 1; m.sponsors.log.unshift({ id: c.id, slot, status: r.status, amount: row.amount, t: Date.now() }); if (m.sponsors.log.length > 20) m.sponsors.log.pop(); }
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
  // tentatives de la semaine : 2, plus une 3e si un jeton de tentative (Pass de saison) a été utilisé
  const weeklyMax = (w) => ((F1.manager && F1.manager.WEEKLY_ATTEMPTS) || 2) + (w.bonus ? 1 : 0);
  function useWeeklyAttempt(weekId, useToken) {
    const w = weeklyGP(weekId);
    if (w.attemptsUsed >= weeklyMax(w)) {
      const p = pass();
      if (!useToken || w.bonus || !(p.tokens > 0)) throw new Error('Plus de tentative cette semaine : rendez-vous lundi pour le prochain Grand Prix');
      p.tokens--; w.bonus = true;
    }
    w.attemptsUsed++; save();
    return weeklyMax(w) - w.attemptsUsed;
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
    const passXp = addPassXp(F1.manager ? F1.manager.PASS_XP_WEEKLY : 0);
    save();
    return { improved, prime, xp, passXp, best: w.bestTime, left: weeklyMax(w) - w.attemptsUsed };
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

  F1.store = { seasonRoll, passNextOpen, curMonth, betWait, mateLocked, setNumber, installPart, rushJob, unlockSlot2, jobOf, tunnel, pass, claimPass, passComplete, nextSeason, setSkin, weeklyMax, sponsorCooldown, achProgress, claimAch, achClaimable, noteStat, setAvatar, ACH_BY, buyMate, releaseMate, weeklyGP, useWeeklyAttempt, recordWeekly, claimWeeklyGP, signSponsor, load, get, save, onChange, mgr, addPC, hireStaff, upgradeGarage, racesPerDay, extraCost, refillIn, canPayExtra, setTyre, setPlan, consumeRace, objectives, claimObjective, buyDriver, buyChassis, upgrade, research, setSetup, racesLeft, recordRace, dayKey, placeBet, settleAll, claimWeekly, claimSeason, canClaimSeason, SEASON_BONUS, canClaim, rescue, canRescue, stats, setName, exportCode, importCode, reset, popUnlocked, ACH, START, WEEKLY, RESCUE, MAX_ODDS };
})(globalThis.F1 = globalThis.F1 || {});
