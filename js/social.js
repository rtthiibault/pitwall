/* Système d'amis : profils publics, recherche par pseudo, demandes d'ami, classement entre amis.
   Backend : Supabase (gratuit). Identité : compte anonyme lié à ce navigateur (aucun email demandé). */
(function (F1) {
  const CFG = window.PITWALL_CONFIG || {};
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const COLS = 'id,username,team,balance,profit,bets_won,bets_done,best_odds,achievements,updated_at';
  const USER_RE = /^[A-Za-z0-9_.-]{3,24}$/;
  const S = {
    enabled: !!(CFG.supabaseUrl && CFG.supabaseAnonKey), ready: false, error: null,
    client: null, user: null, me: null, links: [], friends: [], incoming: [], outgoing: [],
  };
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(S); } catch (e) { console.error(e); } });

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SDK; s.async = true; s.onload = res; s.onerror = () => rej(new Error('Impossible de charger le module Supabase'));
      document.head.appendChild(s);
    });
  }
  const fail = (error) => {
    if (!error) return;
    if (error.code === '23505') throw new Error('Déjà pris ou déjà existant');
    throw new Error(error.message || String(error));
  };
  // Pseudo valide à partir d'un nom libre ("Lewis du 93" -> "Lewis_du_93")
  const cleanName = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24);
  const escLike = (q) => q.replace(/[\\%_]/g, (c) => '\\' + c);

  async function init() {
    if (!S.enabled || S.ready) return S;
    S.error = null;
    try {
      await loadSdk();
      S.client = S.client || window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pitwall-auth' } });
      let { data } = await S.client.auth.getSession();
      let session = data && data.session;
      if (!session) {
        const r = await S.client.auth.signInAnonymously();
        fail(r.error);
        session = r.data.session;
      }
      S.user = session.user;
      await loadMe();
      if (S.me) await refresh(false);
      S.ready = true;
      if (S.me) sync(true);
    } catch (e) {
      S.error = e.message || String(e);
      console.warn('[PITWALL] amis :', S.error);
    }
    emit();
    return S;
  }

  async function loadMe() {
    const r = await S.client.from('profiles').select(COLS).eq('id', S.user.id).maybeSingle();
    fail(r.error);
    S.me = r.data || null;
  }

  function statsRow() {
    const st = F1.store.stats(), p = F1.store.get();
    return {
      balance: Math.round(p.balance), profit: Math.round(st.profit), bets_won: st.won, bets_done: st.done,
      best_odds: Math.round((st.bestOdds || 0) * 100) / 100, achievements: Object.keys(p.ach || {}).length, updated_at: new Date().toISOString(),
    };
  }
  // Colonnes du mode manager (ajoutées par supabase/migration-manager.sql) : envoyées seulement si elles existent
  let mgrCols = true;
  function mgrRow() {
    const m = F1.store.get().manager;
    if (!m || !F1.manager) return {};
    return { lp: m.lp, league: F1.manager.leagueOf(m.lp).id, mgr_driver: m.driver ? m.driver.id : null, mgr_team: m.chassis ? m.chassis.id : null };
  }
  async function updateMe(row) {
    let r = await S.client.from('profiles').update(mgrCols ? { ...row, ...mgrRow() } : row).eq('id', S.user.id);
    if (r.error && mgrCols && /column|schema cache|PGRST204/i.test((r.error.message || '') + (r.error.code || ''))) {
      mgrCols = false;
      r = await S.client.from('profiles').update(row).eq('id', S.user.id);
    }
    return r;
  }

  // Création / modification du pseudo public
  async function claim(username, team) {
    username = String(username || '').trim();
    if (!USER_RE.test(username)) throw new Error('Pseudo : 3 à 24 caractères, lettres sans accent, chiffres, _ . -');
    const row = { username, team: team || null, ...statsRow() };
    const r = S.me
      ? await S.client.from('profiles').update(row).eq('id', S.user.id)
      : await S.client.from('profiles').insert({ id: S.user.id, ...row });
    if (r.error && r.error.code === '23505') throw new Error(`Le pseudo « ${username} » est déjà pris`);
    fail(r.error);
    await loadMe();
    await refresh(false);
    emit();
  }

  // Envoi des statistiques (solde, réussite…) pour le classement entre amis
  let syncT = null;
  function sync(now) {
    if (!S.ready || !S.me) return;
    clearTimeout(syncT);
    syncT = setTimeout(async () => {
      const row = statsRow();
      const r = await updateMe(row);
      if (!r.error) { Object.assign(S.me, row, mgrCols ? mgrRow() : {}); emit(); }
    }, now ? 0 : 2500);
  }

  /* ---------- Ligues de pronostics (supabase/migration-bet-leagues.sql) ----------
     Officielle : tous les profils, classés par gains nets. Privées : créées avec un nom, rejointes avec un code. */
  const MISSING = /bet_league|create_bet_league|join_bet_league|does not exist|schema cache|PGRST20[02]|42P01|42883/i;
  const leagueErr = (e) => { if (e && MISSING.test((e.message || '') + (e.code || ''))) { const x = new Error('LEAGUES_MISSING'); x.missing = true; throw x; } fail(e); };
  const rankRows = (rows) => (rows || []).slice().sort((a, b) => (b.profit || 0) - (a.profit || 0) || (b.bets_won || 0) - (a.bets_won || 0));
  async function officialBoard() {
    const r = await S.client.from('profiles').select(COLS).order('profit', { ascending: false }).limit(50);
    fail(r.error);
    let myRank = null, total = null;
    if (S.me) {
      const a = await S.client.from('profiles').select('id', { count: 'exact', head: true }).gt('profit', S.me.profit || 0);
      const b = await S.client.from('profiles').select('id', { count: 'exact', head: true });
      if (!a.error) myRank = (a.count || 0) + 1; if (!b.error) total = b.count;
    }
    return { rows: r.data || [], myRank, total };
  }
  async function myLeagues() {
    const r = await S.client.from('bet_league_members').select('league_id, bet_leagues ( id, name, code, owner, created_at )').eq('user_id', S.user.id);
    leagueErr(r.error);
    const ls = (r.data || []).map((x) => x.bet_leagues).filter(Boolean);
    if (!ls.length) return [];
    const c = await S.client.from('bet_league_members').select('league_id').in('league_id', ls.map((l) => l.id));
    const n = {}; (c.data || []).forEach((x) => { n[x.league_id] = (n[x.league_id] || 0) + 1; });
    return ls.map((l) => ({ ...l, members: n[l.id] || 1 })).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }
  async function leagueBoard(id) {
    const r = await S.client.from('bet_league_members').select('user_id').eq('league_id', id);
    leagueErr(r.error);
    const ids = (r.data || []).map((x) => x.user_id);
    if (!ids.length) return [];
    const p = await S.client.from('profiles').select(COLS).in('id', ids);
    fail(p.error);
    return rankRows(p.data);
  }
  async function createLeague(name) {
    name = String(name || '').trim();
    if (name.length < 3 || name.length > 40) throw new Error('Nom de ligue : 3 à 40 caractères');
    const r = await S.client.rpc('create_bet_league', { p_name: name });
    leagueErr(r.error);
    return r.data;
  }
  async function joinLeague(code) {
    code = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^PIT-[A-Z0-9]{4}$/.test(code)) throw new Error('Code attendu au format PIT-XXXX');
    const r = await S.client.rpc('join_bet_league', { p_code: code });
    leagueErr(r.error);
    return r.data;
  }
  async function leaveLeague(id) {
    const r = await S.client.from('bet_league_members').delete().eq('league_id', id).eq('user_id', S.user.id);
    leagueErr(r.error);
  }

  // Classement mondial des managers (null si la migration n'a pas été appliquée)
  async function leaderboard() {
    const r = await S.client.from('profiles').select('id,username,team,lp,league').order('lp', { ascending: false }).limit(30);
    if (r.error) return null;
    return r.data || [];
  }
  async function search(q) {
    q = String(q || '').trim();
    if (q.length < 2) return [];
    const r = await S.client.from('profiles').select(COLS).ilike('username', `%${escLike(q)}%`).neq('id', S.user.id).order('username').limit(12);
    fail(r.error);
    return r.data || [];
  }
  async function byUsername(name) {
    const r = await S.client.from('profiles').select(COLS).ilike('username', escLike(String(name || '').trim())).limit(1);
    fail(r.error);
    return (r.data || [])[0] || null;
  }

  async function refresh(notify = true) {
    if (!S.user) return;
    const r = await S.client.from('friendships').select('id,requester,addressee,status,created_at').or(`requester.eq.${S.user.id},addressee.eq.${S.user.id}`);
    fail(r.error);
    const links = r.data || [];
    const other = (l) => (l.requester === S.user.id ? l.addressee : l.requester);
    const ids = [...new Set(links.map(other))];
    let profs = [];
    if (ids.length) {
      const p = await S.client.from('profiles').select(COLS).in('id', ids);
      fail(p.error);
      profs = p.data || [];
    }
    const P = new Map(profs.map((x) => [x.id, x]));
    const wrap = (l) => ({ link: l, p: P.get(other(l)) });
    S.links = links;
    S.friends = links.filter((l) => l.status === 'accepted').map(wrap).filter((x) => x.p);
    S.incoming = links.filter((l) => l.status === 'pending' && l.addressee === S.user.id).map(wrap).filter((x) => x.p);
    S.outgoing = links.filter((l) => l.status === 'pending' && l.requester === S.user.id).map(wrap).filter((x) => x.p);
    if (notify) emit();
  }

  function relation(id) {
    if (S.user && id === S.user.id) return 'me';
    const l = S.links.find((x) => x.requester === id || x.addressee === id);
    if (!l) return 'none';
    if (l.status === 'accepted') return 'friend';
    return l.requester === S.user.id ? 'sent' : 'received';
  }
  const linkWith = (id) => S.links.find((x) => x.requester === id || x.addressee === id) || null;

  async function request(id) {
    const r = await S.client.from('friendships').insert({ requester: S.user.id, addressee: id });
    if (r.error && r.error.code === '23505') { await refresh(); throw new Error('Une demande existe déjà avec ce joueur'); }
    fail(r.error);
    await refresh();
  }
  async function accept(linkId) {
    const r = await S.client.from('friendships').update({ status: 'accepted' }).eq('id', linkId);
    fail(r.error);
    await refresh();
  }
  async function remove(linkId) {
    const r = await S.client.from('friendships').delete().eq('id', linkId);
    fail(r.error);
    await refresh();
  }

  // Rafraîchissement périodique des demandes (toutes les 60 s quand l'onglet est visible)
  setInterval(() => { if (S.ready && S.me && !document.hidden) refresh().catch(() => {}); }, 60000);

  F1.social = { state: S, officialBoard, myLeagues, leagueBoard, createLeague, joinLeague, leaveLeague, leaderboard, init, claim, sync, search, byUsername, refresh, relation, linkWith, request, accept, remove, onChange: (f) => listeners.push(f), cleanName, USER_RE };
})(globalThis.F1 = globalThis.F1 || {});
