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
      const r = await S.client.from('profiles').update(row).eq('id', S.user.id);
      if (!r.error) { Object.assign(S.me, row); emit(); }
    }, now ? 0 : 2500);
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

  F1.social = { state: S, init, claim, sync, search, byUsername, refresh, relation, linkWith, request, accept, remove, onChange: (f) => listeners.push(f), cleanName, USER_RE };
})(globalThis.F1 = globalThis.F1 || {});
