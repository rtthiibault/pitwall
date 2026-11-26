/* PITWALL — interface (routeur, rendu des pages, ticket de paris, animations). */
(function (F1) {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtJ = (n) => fmt(n, Math.abs(n % 1) > 0.001 ? 2 : 0);
  const fmtOdds = (o) => (o >= 250 && o < 1000 ? '250' : o >= 30 ? fmt(o) : o >= 10 ? fmt(o, o % 1 ? 1 : 0) : fmt(o, 2));
  const pct = (p) => (p < 0.001 ? '<0,1 %' : fmt(p * 100, p < 0.1 ? 1 : 0) + ' %');
  const DTF = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const DAYL = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const HM = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const WD = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  const flag = (iso, cls = '') => (iso ? `<img class="flag ${cls}" src="${F1.flagUrl(iso, cls === 'lg' ? 160 : 80)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '');
  // Monnaies : jeton (paris) et PitCoin (F1 Manager), pictogrammes vectoriels
  const COIN_J = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11.2" fill="#e8b63a"/><g fill="#8a5d0c"><rect x="10.5" y=".8" width="3" height="3.6" rx=".7" transform="rotate(0 12 12)"/><rect x="10.5" y=".8" width="3" height="3.6" rx=".7" transform="rotate(60 12 12)"/><rect x="10.5" y=".8" width="3" height="3.6" rx=".7" transform="rotate(120 12 12)"/><rect x="10.5" y=".8" width="3" height="3.6" rx=".7" transform="rotate(180 12 12)"/><rect x="10.5" y=".8" width="3" height="3.6" rx=".7" transform="rotate(240 12 12)"/><rect x="10.5" y=".8" width="3" height="3.6" rx=".7" transform="rotate(300 12 12)"/></g><circle cx="12" cy="12" r="10.4" fill="none" stroke="#a87414" stroke-width=".9"/><circle cx="12" cy="12" r="6.6" fill="#f7d877" stroke="#9a6810" stroke-width="1.1"/><path d="M8.9 8.9h3.1V12H8.9zM12 12h3.1v3.1H12z" fill="#5c3c05"/><path d="M12 8.9h3.1V12H12zM8.9 12H12v3.1H8.9z" fill="#fff3c4"/></svg>';
  const COIN_P = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 12 17.5 21.5h-11L1 12l5.5-9.5h11Z" fill="#1fc9b0" stroke="#0a7565" stroke-width="1"/><path d="M6.5 2.5h11L23 12h-4.4L15 6.2H9L6.5 2.5Z" fill="#7ff3e1" opacity=".55"/><circle cx="12" cy="12" r="5.6" fill="#0c4a42"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="#5ee8d3" stroke-width="1.2" stroke-dasharray="2.2 1.3"/><circle cx="12" cy="12" r="1.5" fill="#5ee8d3"/></svg>';
  const coin = `<span class="coin sm jcoin" title="jetons">${COIN_J}</span>`;
  const jt = (n) => `<span class="amt">${coin}${fmt(n)}</span>`;   // montant en jetons avec le logo

  const S = {
    season: null, sim: null, markets: [], seasonMarkets: [], seasonSim: null, weather: null,
    sel: new Map(), slip: [], mode: 'single', modeTouched: false, stake: 20, slipOpen: false,
    expanded: new Set(), tierce: [null, null, null], upMarkets: [], archives: {}, calYear: null, standTab: 'drivers', chartHidden: new Set(), betsTab: 'open', gpTab: 'race',
  };
  F1.state = S;

  /* =================== Démarrage =================== */
  async function boot() {
    F1.store.load();
    try { S.slip = JSON.parse(sessionStorage.getItem('pitwall:slip')) || []; } catch (e) { S.slip = []; }
    const lights = startLights();
    try { S.series = localStorage.getItem('pitwall:series') === 'wec' ? 'wec' : 'f1'; } catch (e) { S.series = 'f1'; }
    try {
      await loadAll();
      await prepare();
    } catch (e) {
      console.error(e);
      S.f1 = F1.data.normalize(F1.FALLBACK, 'fallback');
      pickSeries();
      await prepare();
    }
    // portraits : on attend au plus 1,2 s, puis on redessine quand tout est arrivé
    const pp = F1.visuals.loadPortraits([...S.f1.drivers.values(), ...(S.f1.upcoming ? S.f1.upcoming.drivers.values() : [])]);
    let portraitsDone = false;
    pp.then(() => { portraitsDone = true; });
    await Promise.race([pp, new Promise((r) => setTimeout(r, 1200))]);
    if (!portraitsDone) pp.then(() => route());
    await lights.finish();
    F1.store.onChange(updateWallet);
    F1.store.onChange(() => F1.social.sync());
    F1.social.onChange(() => { friendsBadge(); avatarBadge(); if (/^#\/amis/.test(location.hash) && !document.activeElement.closest('#friendSearch')) route(); if (/^#\/ligues/.test(location.hash) && !$('#lgList') && !document.activeElement.closest('.lg-form')) route(); });
    F1.social.init().then((so) => { if (so.incoming.length) toast('👋', `${so.incoming.length} demande${so.incoming.length > 1 ? 's' : ''} d'ami en attente`, 'win', 5000); });
    updateWallet();
    route();
    if (F1.fx && F1.fx.skidMarks) F1.fx.skidMarks();
    renderSlip();
    renderFooter();
    F1.data.loadMeta().then((m) => { S.meta = m; renderFooter(); });
    runSettlement();
    if (!F1.store.get().name) setTimeout(welcome, 700);
    setInterval(tick, 1000);
    setInterval(refresh, 15 * 60 * 1000);
    F1.data.onLive(() => setTimeout(refresh, 200));
    if (F1.news) {
      F1.news.onChange(() => { computeMarkets(); renderSlip(); if (!document.documentElement.classList.contains('race-lock') && /^(#\/?)?$|^#\/(paris|paddock|ligues)/.test(location.hash)) route(); });
      let pwLast = Date.now();
      setInterval(() => { const n = F1.news.nextAt(); if (!document.hidden && n && Date.now() > n + 60e3 && Date.now() - pwLast > 120e3) { pwLast = Date.now(); F1.news.load(true); } }, 30e3);
    } // l'API live a répondu après l'affichage : mise à jour en arrière-plan
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  /* ---------- Championnats : la F1 et le WEC sont chargés tous les deux, un seul est affiché ---------- */
  const skey = (ss) => ss.key || ss.year;
  async function loadAll() {
    const nw = F1.news && !F1.news.data ? Promise.race([F1.news.load(), new Promise((r) => setTimeout(r, 1500))]) : null;
    const [f1, wec] = await Promise.all([F1.data.loadSeason(), F1.wec ? F1.wec.loadSeason().catch(() => null) : null, nw]);
    S.f1 = f1; S.wec = wec;
    pickSeries();
  }
  function pickSeries() {
    if (S.series === 'wec' && (!S.wec || WEC_LOCKED)) S.series = 'f1';
    S.season = S.series === 'wec' ? S.wec : S.f1;
    S.other = S.series === 'wec' ? S.f1 : S.wec;
    document.body.classList.toggle('wec', S.series === 'wec');
  }
  const WEC_LOCKED = true;
  function setSeries(k) {
    if (k === S.series || (k === 'wec' && (!S.wec || WEC_LOCKED))) return;
    S.series = k;
    try { localStorage.setItem('pitwall:series', k); } catch (e) { /* */ }
    const swap = () => {
      pickSeries();
      S.slip = []; S.sel.clear(); S.tierce = [null, null, null]; S.weather = null; S.expanded.clear(); S.chartHidden.clear();
      computeMarkets(); route(); renderSlip(); renderFooter();
      window.scrollTo({ top: 0, behavior: 'instant' });
      prepare().then(() => { route(); renderSlip(); });
    };
    if (F1.fx) F1.fx.flagWipe(swap); else swap();
  }
  // Remplace, sur une page WEC, le vocabulaire de la F1 (libellés fixes de l'interface)
  const WEC_TXT = [[/Prochain Grand Prix/g, 'Prochaine course'], [/Dernier Grand Prix/g, 'Dernière course'], [/Aucun Grand Prix à venir/g, 'Aucune course à venir'], [/Grand Prix introuvable/g, 'Course introuvable'],
    [/après le premier Grand Prix/g, 'après la première course'], [/Grands Prix/g, 'courses'], [/Parier sur ce GP/g, 'Parier sur cette course'], [/(\d+) GP\b/g, '$1 courses'], [/Championnat pilotes/g, 'Championnat équipages'],
    [/Matrice des cotes pilotes/g, 'Matrice des cotes par voiture'], [/Choisissez un pilote/g, 'Choisissez une voiture'], [/Un pilote qui ne prend pas/g, 'Une voiture qui ne prend pas'], [/Grille & monoplaces/g, 'Plateau & voitures'],
    [/^Grille (\d{4})$/g, 'Plateau Hypercar $1'], [/P(\d+) constructeurs/g, 'P$1 au championnat'], [/\bPilotes\b/g, 'Voitures'], [/\bPilote\b/g, 'Voiture'], [/\bpilotes\b/g, 'voitures'], [/Écuries/g, 'Constructeurs'], [/Écurie\b/g, 'Constructeur'], [/écuries/g, 'constructeurs'],
    [/· 0 sprints?/g, ''], [/ · \d+ week-ends? Sprint/g, ''], [/Prochain GP/g, 'Prochaine course'], [/Qualifications/g, 'Hyperpole']];
  function wecText(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) { let t = n.nodeValue; if (!t || t.length < 3) continue; const o = t; for (const [a, b] of WEC_TXT) t = t.replace(a, b); if (t !== o) n.nodeValue = t; }
  }

  async function prepare() {
    const s = S.season;
    const nx = s.next;
    if (nx) {
      await Promise.all([F1.data.loadQualifying(s, nx), F1.data.loadWeather(nx).then((w) => { S.weather = w; })]);
    }
    // qualifs pour régler les paris "pole" en attente
    const rounds = new Set(F1.store.get().bets.filter((b) => b.status === 'open').flatMap((b) => b.legs.filter((l) => l.kind === 'pole' && !l.result).map((l) => l.round)));
    for (const r of rounds) { const race = s.races.find((x) => x.round === r); if (race && !race.results) await F1.data.loadQualifying(s, race); }
    // paris ouverts sur une autre saison (ex. paris 2026 alors que 2027 est active) : charger cette saison
    const f = S.f1 || s; // les anciennes saisons à recharger sont toujours des saisons de F1 (clé = année)
    const years = new Set(F1.store.get().bets.filter((b) => b.status === 'open').flatMap((b) => b.legs.filter((l) => !l.result && typeof l.season === 'number' && l.season !== f.year).map((l) => l.season)));
    for (const y of years) {
      if (f.prev && f.prev.year === y) S.archives[y] = f.prev;
      else if (f.upcoming && f.upcoming.year === y) S.archives[y] = f.upcoming;
      else if (!S.archives[y] && y < f.year) { try { S.archives[y] = await F1.data.loadYear(y); } catch (e) { /* */ } }
    }
    computeMarkets();
  }

  function computeMarkets() {
    const s = S.season;
    S.sim = null; S.markets = [];
    if (s.next && s.entrants.length >= 4) {
      S.sim = F1.model.simulateRace(s, s.next, S.weather);
      S.markets = F1.markets.buildRace(s, s.next, S.sim);
    }
    S.mk = null;
    S.seasonSim = s.entrants.length >= 4 ? F1.model.simulateSeason(s) : null;
    S.seasonMarkets = S.seasonSim && !s.finished ? F1.markets.buildSeason(s, S.seasonSim) : [];
    // saison suivante (ex. 2027) : paris long terme ouverts dès maintenant
    S.upMarkets = [];
    if (s.upcoming && s.upcoming.entrants.length >= 4) S.upMarkets = F1.markets.buildSeason(s.upcoming, F1.model.simulateSeason(s.upcoming));
    // rafraîchir les cotes des sélections du ticket
    const all = new Map();
    [...S.markets, ...S.seasonMarkets, ...S.upMarkets].forEach((m) => m.selections.forEach((x) => all.set(x.sid, { ...x, closes: m.closes, season: x.season || skey(s) })));
    S.slip = S.slip.map((l) => all.get(l.sid) || (l.kind === 'tierce' && s.next && l.round === s.next.round ? l : null)).filter(Boolean);
    saveSlip();
  }

  async function refresh() {
    if (document.hidden || !S.season) return;
    const src0 = S.season.source;
    const before = `${S.season.doneCount}|${S.season.next && S.season.next.round}|${S.season.next && !!S.season.next.qualifying}`;
    try {
      await loadAll();
      const ns = S.season;
      await prepare();
      const after = `${ns.doneCount}|${ns.next && ns.next.round}|${ns.next && !!ns.next.qualifying}`;
      runSettlement();
      if (before !== after) { route(); renderSlip(); renderFooter(); toast('🔄', 'Données mises à jour : nouvelles cotes disponibles'); }
      else if (src0 !== S.season.source && !/^#\/manager/.test(location.hash)) route();
    } catch (e) { /* silencieux */ }
  }

  function startLights() {
    const el = $('#lights');
    const pods = $$('.pod', el);
    let i = 0;
    const seen = sessionStorage.getItem('pitwall:lights');
    const step = seen ? 100 : 240;
    const timer = setInterval(() => { if (i < pods.length) pods[i++].classList.add('on'); }, step);
    el.addEventListener('click', () => { clearInterval(timer); el.classList.add('out'); });
    return {
      finish: async () => {
        while (i < pods.length && !el.classList.contains('out')) await new Promise((r) => setTimeout(r, 60));
        clearInterval(timer);
        await new Promise((r) => setTimeout(r, seen ? 120 : 250 + Math.random() * 350));
        pods.forEach((p) => p.classList.remove('on'));
        $('#lightsCaption').innerHTML = '<b>Extinction des feux</b> — c\'est parti !';
        await new Promise((r) => setTimeout(r, seen ? 120 : 300));
        el.classList.add('out');
        try { sessionStorage.setItem('pitwall:lights', '1'); } catch (e) { /* */ }
      },
    };
  }

  /* =================== Routeur =================== */
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    const r = parts[0] || '';
    // F1 Manager : partie classique (#/manager) ou Carrière (#/carriere), deux sauvegardes indépendantes
    const isMgr = r === 'manager' || r === 'carriere';
    F1.store.setMode(r === 'carriere' ? 'career' : 'base');
    if (lastTop === null) lastTop = r;
    document.body.classList.toggle('on-home', r === '' && S.series !== 'wec');
    S.sel.clear();
    $$('[data-r]').forEach((a) => a.classList.toggle('active', a.dataset.r === (r === 'gp' ? 'calendrier' : r)));
    $('#friendsBtn').classList.toggle('active', r === 'amis');
    if (F1.car3d) F1.car3d.disposeAll();
    const app = $('#app');
    let html;
    switch (r) {
      case 'paris': if (parts[1] === 'ligues') { location.replace('#/ligues' + (parts[2] ? '/rejoindre/' + parts[2] : '')); return; } html = pageBets(parts[1] || 'populaires'); break;
      case 'ligues': html = pageLeagues(parts); break;
      case 'calendrier': html = pageCalendar(+parts[1] || null); break;
      case 'classements': html = pageStandings(); break;
      case 'gp': html = pageGP(+parts[1]); break;
      case 'mes-paris': html = pageMyBets(); break;
      case 'amis': html = pageFriends(parts); break;
      case 'manager': html = pageManager(parts[1]); break;
      case 'carriere': html = pageCareer(parts[1]); break;
      case 'paddock': html = pagePaddock(); F1.store.noteStat('pwVisits'); break;
      case 'succes': html = pageAch(); break;
      case 'profil': html = pageProfile(); break;
      case 'messagerie': html = pageMessages(parts); break;
      case 'notifications': html = pageNotifs(); break;
      case 'circuits': html = pageCircuits(); break;
      case 'parametres': html = pageSettings(); break;
      default: html = pageHome();
    }
    app.innerHTML = sourceNotice() + html;
    const newPage = location.hash.replace(/^#\/?/, '') !== lastPath;
    app.classList.remove('fade-in');
    if (newPage) { void app.offsetWidth; app.classList.add('fade-in'); }
    // 3. fond du mode manager teinté aux couleurs du châssis équipé
    const mch = isMgr ? F1.store.mgr().chassis : null;
    document.body.classList.toggle('mgr-bg', !!mch);
    document.body.classList.toggle('on-mgr', isMgr);
    document.body.classList.toggle('on-career', r === 'carriere');
    if (mch) document.body.style.setProperty('--mgr', F1.teamColor(mch.id));
    afterRender(r, parts);
    if (S.series === 'wec' && r !== 'manager') wecText(app);
    F1.visuals.hydrate(app);
    if (F1.fx) {
      F1.fx.navIndicator();
      const path = location.hash.replace(/^#\/?/, '');
      if (path !== lastPath) F1.fx.reveal(app);
      lastPath = path;
    }
    tick();
  }
  let lastPath = null, lastTop = null;
  // changement d'onglet : un drapeau à damier balaie l'écran, la page change pendant qu'il la couvre
  window.addEventListener('hashchange', () => {
    const top = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
    const go = () => { route(); window.scrollTo({ top: 0, behavior: 'instant' }); };
    if (F1.fx && lastTop !== null && top !== lastTop) F1.fx.flagWipe(go); else go();
    lastTop = top;
  });
  // Barre de progression du scroll : une petite F1 roule sur un vibreur
  let scrollRaf = 0;
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      const bar = $('#scrollRace'); if (bar) { bar.style.setProperty('--p', p); bar.classList.toggle('on', max > 200 && scrollY > 40); }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  function afterRender(r, parts) {
    const isMgr = r === 'manager' || r === 'carriere';
    if (r === 'classements') mountChart();
    if (r === 'paddock') pwApply();
    if (r === 'messagerie') mountMessages(parts);
    if (r === 'gp' && S.gpTab === 'quali') {
      const race = S.season.races.find((x) => x.round === +parts[1]);
      if (race && !race.qualifying) F1.data.loadQualifying(S.season, race).then((q) => { if (q) route(); });
    }
    if (r === 'mes-paris') mountBankroll();
    if (r === 'amis') mountFriends(parts);
    if (r === 'ligues') { if (parts[1] === 'l') mountLeaguePage(); else { mountLeagues(); mountLeagueDash(); } }
    if (isMgr) mountManager(parts[1]);
    if (r === 'manager' && parts[1] === 'hebdo') mountWeekly(); else { stopWeekly(); if (r === 'manager') weeklyClaim(); }
  }

  function sourceNotice() {
    const src = S.season.source;
    if (src === 'live') return '';
    if (S.series === 'wec') return `<div class="notice" style="margin-bottom:18px">🏁 WEC ${S.season.year} : calendrier officiel et plateau Hypercar provisoire intégrés au site (liste des engagés pas encore publiée). Horaires estimés. Les résultats sont saisis après chaque course, puis les paris se règlent automatiquement.</div>`;
    if (src === 'embedded') return `<div class="notice" style="margin-bottom:18px">📅 Saison ${S.season.year} : calendrier officiel et grille provisoire intégrés au site. Horaires estimés, remplacés automatiquement dès leur publication par l'API.</div>`;
    // instantané de moins de 36 h (mis à jour automatiquement) : les données sont à jour, aucun bandeau
    if (src === 'snapshot' && S.season.snapAt && Date.now() - S.season.snapAt < 36 * 36e5) return '';
    const msg = src === 'snapshot' ? 'API live injoignable : affichage du dernier instantané des données.'
      : src === 'cache' ? 'API live injoignable : affichage des dernières données en cache.'
        : 'Mode hors ligne : données live indisponibles, calendrier et grille de secours affichés. Les cotes reposent sur un modèle a priori.';
    return `<div class="notice" style="margin-bottom:18px">⚠️ ${msg} <button class="btn sm ghost" data-action="reload">Réessayer</button></div>`;
  }

  /* =================== Composants =================== */
  // avatars acceptés à l'affichage : images du site ou photos importées (JPEG/WebP encodées)
  const AVA_OK = /^(assets\/avatars\/avatar-\d+\.webp|data:image\/(jpeg|webp);base64,[A-Za-z0-9+\/=]+)$/;
  const drv = (id) => S.season.drivers.get(id) || (S.f1 && S.f1.drivers.get(id));
  const team = (id) => S.season.teams.get(id) || (S.f1 && S.f1.teams.get(id)) || { short: id, color: '#888', name: id };
  const tcol = (id) => team(id).color;

  // Avatar pilote : photo libre (Wikimedia Commons) ou initiales aux couleurs de l'écurie
  function ava(id, cls = '') {
    const d = drv(id) || (S.season.upcoming && S.season.upcoming.drivers.get(id));
    if (!d) return '';
    const p = F1.visuals.portrait(id);
    const c = tcol(d.teamId);
    const ini = d.crew ? esc(d.number) : esc((d.given || '?')[0] + (d.family || '?')[0]);
    return `<span class="ava ${cls}" style="--tc:${c}">${p ? `<img src="${esc(p.img)}" alt="${esc(d.given + ' ' + d.family)}" loading="lazy" onerror="this.remove()">` : ''}<i>${ini}</i></span>`;
  }
  // numéro d'un pilote dans le dessin de son écurie (couleur de l'écurie par défaut)
  const dnum = (n, teamId, cls = '', color) => (n ? `<span class="dn ${cls}" style="color:${color || tcol(teamId)}">${F1.num.html(n, teamId)}</span>` : '');
  const dnumOf = (id, cls = 'in') => { const d = drv(id) || (S.season.upcoming && S.season.upcoming.drivers.get(id)); return d && !d.crew ? dnum(d.number, d.teamId, cls) : ''; };
  function drvCell(id, extra = '') {
    const d = drv(id); if (!d) return esc(id);
    const t = team(d.teamId);
    return `<div class="drv">${ava(id)}<div><b><span class="gv">${esc(d.given)}</span>${esc(d.family)}${d.crew ? '' : dnum(d.number, d.teamId, 'in')}</b><small>${flag(d.iso, 'sm')} ${d.crewTxt ? esc(d.crewTxt) : esc(t.short) + (d.tbc ? ' · à confirmer' : '')}${extra}</small></div></div>`;
  }
  function teamCell(id) {
    const t = team(id);
    return `<div class="drv"><span class="tstripe" style="background:${t.color}"></span><div><b>${esc(t.short)}</b><small>${esc(t.name)}</small></div></div>`;
  }

  function isClosed(m) { return m.closes && m.closes.getTime() <= Date.now(); }
  function reg(s, m) { const x = { ...s, closes: m ? m.closes : s.closes, season: s.season || skey(S.season) }; S.sel.set(x.sid, x); return x; }
  function oddBtn(s, m, { compact = false, label = null, cls = '' } = {}) {
    const x = reg(s, m);
    const on = S.slip.some((l) => l.sid === x.sid);
    const closed = m && isClosed(m);
    const color = x.teamId ? tcol(x.teamId) : 'var(--gold)';
    const lbl = label != null ? label : `${x.teamId ? `<span class="tstripe" style="background:${color}"></span>` : ''}${esc(x.label)}${x.driverId ? dnumOf(x.driverId) : ''}`;
    return `<button class="odd ${compact ? 'compact' : ''} ${on ? 'on' : ''} ${cls}" data-sid="${esc(x.sid)}" ${closed ? 'disabled' : ''} title="${esc(x.mtitle)} — ${esc(x.label)} · probabilité estimée ${pct(x.prob)}">${compact ? '' : `<span class="lbl">${lbl}</span>`}<span class="o">${fmtOdds(x.odds)}</span>${x.news ? `<span class="pdw-odd ${x.news > 1 ? 'up' : 'dn'}" title="Paddock Wire : cote ${x.news > 1 ? 'en hausse' : 'en baisse'} de ${Math.abs(Math.round((x.news - 1) * 100))} % sous l'effet de l'actualité">${x.news > 1 ? '▲' : '▼'}</span>` : ''}${compact ? '' : `<span class="bar" style="width:${Math.min(100, x.prob * 100)}%;color:${color}"></span>`}</button>`;
  }
  function closeChip(m) {
    if (!m.closes) return '';
    if (isClosed(m)) return '<span class="chip">Fermé</span>';
    const left = m.closes - Date.now();
    return `<span class="chip ${left < 864e5 ? 'red live' : ''}" title="Clôture des paris">⏱ ${left < 864e5 ? 'Clôture ' + HM.format(m.closes) : DTF.format(m.closes)}</span>`;
  }

  function marketCard(m, { limit = 0 } = {}) {
    if (!m) return '';
    let body = '';
    if (m.layout === 'h2h') return h2hCard(m);
    if (m.layout === 'boost') return boostCard(m);
    if (m.layout === 'ou') body = `<div class="odds-row">${m.selections.map((s) => oddBtn(s, m)).join('')}</div>`;
    else {
      const exp = S.expanded.has(m.id);
      const list = limit && !exp ? m.selections.slice(0, limit) : m.selections;
      body = `<div class="odds-grid">${list.map((s) => oddBtn(s, m)).join('')}</div>`;
      if (limit && m.selections.length > limit) body += `<button class="more" data-action="expand" data-mid="${esc(m.id)}">${exp ? '▴ Réduire' : `▾ Voir les ${m.selections.length} sélections`}</button>`;
    }
    return `<div class="card market"><div class="market-h"><div><h3>${esc(m.title)}</h3><div class="sub">${esc(m.sub || '')}</div></div>${closeChip(m)}</div>${body}</div>`;
  }

  function h2hCard(m) {
    const [sa, sb] = m.selections;
    const side = (s) => { const d = drv(s.driverId); return `<div class="side" style="--tc:${tcol(d.teamId)}"><div class="row" style="flex-wrap:nowrap;gap:10px;margin-bottom:4px">${ava(d.id, 'md')}<div class="n">${esc(d.family)}${dnumOf(d.id)}</div></div><div class="t">${flag(d.iso, 'sm')} ${esc(team(d.teamId).short)} · ${fmt(d.points)} pts</div>${oddBtn(s, m, { label: 'Devant' })}</div>`; };
    return `<div class="card market"><div class="market-h"><div><h3>${esc(m.title)}</h3><div class="sub">${esc(m.sub)} · le mieux classé à l'arrivée</div></div>${closeChip(m)}</div>
      <div class="h2h">${side(sa)}<div class="vs">VS</div>${side(sb)}</div>
      <div class="h2h-bar"><i style="width:${sa.prob * 100}%;background:${tcol(drv(sa.driverId).teamId)}"></i><i style="flex:1;background:${tcol(drv(sb.driverId).teamId)};opacity:.7"></i></div>
      <div class="row" style="justify-content:space-between;margin-top:6px;font-size:12px" ><span class="muted">${pct(sa.prob)}</span><span class="muted">${pct(sb.prob)}</span></div></div>`;
  }
  function boostCard(m) {
    const s = m.selections[0];
    return `<div class="boost"><div class="bt">⚡ Cote boostée du week-end</div><div class="bl">${esc(s.label)}</div><div class="sub" style="color:#d9c48f">${esc(m.sub)}</div>
      <div class="row" style="margin-top:16px"><span class="old">${fmtOdds(s.oldOdds)}</span>${oddBtn(s, m, { label: '<span>⚡ Boost +35 %</span>' })}</div></div>`;
  }

  function countdown(ts, big = true) {
    return `<div class="countdown" data-cd="${ts}">${['j', 'h', 'min', 's'].map((u, i) => `<div class="cd-box"><b data-u="${i}">--</b><small>${['Jours', 'Heures', 'Min', 'Sec'][i]}</small></div>`).join('')}</div>`;
  }
  function tick() {
    $$('[data-cd]').forEach((el) => {
      let s = Math.max(0, Math.floor((+el.dataset.cd - Date.now()) / 1000));
      const v = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
      $$('[data-u]', el).forEach((b) => { const nv = String(v[+b.dataset.u]).padStart(2, '0'); if (b.textContent !== nv) b.textContent = nv; });
    });
  }


  /* =================== Paddock Wire : actualité F1 et moteur d'impact =================== */
  const PW_ICON = '<svg class="pdw-ico" viewBox="0 0 32 20" aria-hidden="true"><path d="M1 6.5h5M0 10h6M2 13.5h4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M9 2.5h16.5a1 1 0 0 1 1 1v12.2a1.8 1.8 0 0 0 1.8 1.8H10.6A1.6 1.6 0 0 1 9 15.9Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M26.5 6.5h3a.9.9 0 0 1 .9.9v8.3a1.8 1.8 0 0 1-3.6 0" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="12" y="5.4" width="5.6" height="4.4" fill="currentColor"/><path d="M19.6 5.9h4.2M19.6 9.3h4.2M12 12.6h11.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  const PW_CAT = { TECHNIQUE: ['tech', 'Technique'], PADDOCK: ['pad', 'Paddock'], 'RÈGLEMENT': ['reg', 'Règlement'], 'MÉTÉO': ['wx', 'Météo'] };
  const pwAgo = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60e3)); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j`; };
  const pwTime = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pwName = (id) => { const t = S.f1 && S.f1.teams.get(id); if (t) return t.short; const d = S.f1 && S.f1.drivers.get(id); return d ? d.family : F1.teamShort(id); };
  const pwSign = (v) => (v > 0 ? '+' : '') + String(v).replace('.', ',');
  function pwImpact(x) {
    const im = x.impact; if (!im) return '';
    const w = F1.news.weight(x), live = w > 0;
    const ids = im.targetIds.map((id) => { const tid = im.targetType === 'driver' ? (drv(id) || {}).teamId : id; return `<span class="pdw-tgt" style="--tc:${F1.teamColor(tid)}">${esc(pwName(id))}</span>`; }).join('');
    const kind = { engine: 'Motoriste', team: 'Écurie', driver: 'Pilote' }[im.targetType] || '';
    const left = Date.parse(x.firstSeen || x.timestamp) + 7 * 864e5 - Date.now();
    return `<div class="pdw-imp ${im.bettingOddsMultiplier > 1 ? 'neg' : 'pos'} ${live ? '' : 'off'}"><div class="pdw-imp-h"><span class="pdw-k">Impact · ${kind}</span>${ids}</div>
      <div class="pdw-imp-b"><b class="num">${esc(im.impactLabel)}</b><span class="pdw-w">${live ? `${w >= 1 ? 'Plein effet' : `Effet ${Math.round(w * 100)} %`} · s'estompe d'ici ${Math.max(1, Math.ceil(left / 864e5))} j` : 'Effet terminé'}</span></div><i class="pdw-gauge" style="--w:${Math.round(w * 100)}%"></i></div>`;
  }
  function pwCard(x) {
    const [cc, cl] = PW_CAT[x.category] || PW_CAT.PADDOCK;
    return `<article class="pdw-card ${x.impact ? 'has-imp' : ''}" data-cat="${cc}"><header class="pdw-meta"><span class="pdw-cat ${cc}">${cl}</span><span>${esc(x.source)}</span><time datetime="${esc(x.timestamp)}" title="${esc(pwTime(Date.parse(x.timestamp)))}">${pwAgo(Date.parse(x.timestamp))}</time></header>
      <h3>${esc(x.title)}</h3>${x.summary ? `<p>${esc(x.summary)}</p>` : ''}${pwImpact(x)}
      <a class="pdw-src" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Lire sur ${esc(x.source)} ↗</a></article>`;
  }
  /* ---------- Paddock Wire : dépêches, alerte « breaking », fil en direct ---------- */
  // pilotes et écuries cités dans une dépêche (ciblés par l'impact, ou reconnus dans le titre et le résumé)
  const PW_TEAM_RE = [['ferrari', /ferrari|scuderia/i], ['mclaren', /mclaren/i], ['red_bull', /red ?bull(?! ?(?:racing )?bulls)/i], ['mercedes', /mercedes/i], ['aston_martin', /aston ?martin/i],
    ['alpine', /alpine/i], ['williams', /williams/i], ['haas', /\bhaas\b/i], ['rb', /racing bulls|\bvcarb\b|\brb\b/i], ['audi', /\baudi\b|sauber/i], ['cadillac', /cadillac/i]];
  const pwTagCache = new Map();
  function pwTags(x) {
    if (pwTagCache.has(x.id)) return pwTagCache.get(x.id);
    const txt = `${x.title} ${x.summary || ''}`, teams = [], drivers = [];
    const tg = (x.impact && x.impact.targetIds) || [];
    const ds = S.f1 ? [...S.f1.drivers.values()] : [];
    tg.forEach((id) => { if (S.f1 && S.f1.teams.get(id)) teams.push(id); else if (ds.some((d) => d.id === id)) drivers.push(id); });
    ds.forEach((d) => { if (!drivers.includes(d.id) && d.family && d.family.length > 2 && new RegExp(`\\b${d.family.normalize('NFD').replace(/[̀-ͯ]/g, '')}\\b`, 'i').test(txt.normalize('NFD').replace(/[̀-ͯ]/g, ''))) drivers.push(d.id); });
    PW_TEAM_RE.forEach(([id, re]) => { if (!teams.includes(id) && re.test(txt) && S.f1 && (S.f1.teams.get(id) || (id === 'rb' && S.f1.teams.get('racing_bulls')))) teams.push(id); });
    drivers.forEach((id) => { const d = drv(id); if (d && d.teamId && !teams.includes(d.teamId) && teams.length < 1) teams.push(d.teamId); });
    const r = { teams: teams.slice(0, 3), drivers: drivers.slice(0, 3) };
    pwTagCache.set(x.id, r); return r;
  }
  const PW_HOT = /officiel|annonc|quitte|départ|signe|signature|remplac|limog|retraite|pénalit|disqualif|accident|bless|champion|transfert|contrat|prolong|rejoint|renvoi|sanction|exclu|abandon|crash|victoire|pole|record|choc|séisme|bombe/i;
  // importance d'une dépêche : impact sur le jeu, mots-clés forts, fraîcheur
  function pwScore(x) {
    const age = (Date.now() - Date.parse(x.timestamp)) / 36e5;
    return (x.impact ? 2 + 4 * F1.news.weight(x) : 0) + (PW_HOT.test(x.title) ? 3 : 0) + (age < 6 ? 2 : age < 24 ? 1 : age < 48 ? 0 : -3) + Math.min(2, pwTags(x).drivers.length);
  }
  const pwTeamCol = (x) => { const t = pwTags(x); const id = t.teams[0] || (t.drivers[0] && (drv(t.drivers[0]) || {}).teamId); return id ? F1.teamColor(id) : '#d7261e'; };
  // visuel d'une dépêche : photo de l'article, sinon portrait du pilote cité, sinon monoplace de l'écurie
  function pwVisual(x, cls = '') {
    const t = pwTags(x);
    if (x.image && /^https:\/\//.test(x.image)) return `<img class="pw-img ${cls}" src="${esc(x.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('ko')">`;
    const d = t.drivers[0], pt = d && F1.visuals.portrait(d);
    if (pt) return `<img class="pw-img portrait ${cls}" src="${esc(pt.img)}" alt="" loading="lazy" onerror="this.classList.add('ko')">`;
    if (t.teams[0]) return `<div class="pw-car ${cls}">${F1.visuals.car(t.teams[0], { view: 'side', shadow: false })}</div>`;
    return '';
  }
  const pwTagChips = (x) => { const t = pwTags(x); return [...t.drivers.map((id) => { const d = drv(id); return d ? `<span class="pw-tag" style="--tc:${tcol(d.teamId)}">${d.number ? dnum(d.number, d.teamId, 'in') : ''}${esc(d.family)}</span>` : ''; }), ...t.teams.map((id) => `<span class="pw-tag team" style="--tc:${F1.teamColor(id)}">${esc(pwName(id))}</span>`)].join(''); };
  let pwSeenPrev = null;
  const pwIsNew = (x) => pwSeenPrev != null && Date.parse(x.firstSeen || x.timestamp) > pwSeenPrev;
  function pwBreaking(x) {
    const t = pwTags(x), col = pwTeamCol(x), d = t.drivers[0] && drv(t.drivers[0]);
    const [cc, cl] = PW_CAT[x.category] || PW_CAT.PADDOCK;
    return `<article class="pwb" style="--tc:${col};--ti:${inkOn(col)}">
      <div class="pwb-bg"></div><div class="pwb-vis">${pwVisual(x)}</div>
      ${d && d.number ? `<div class="pwb-num">${F1.num.html(d.number, d.teamId, { color: 'currentColor' })}</div>` : ''}
      <div class="pwb-top"><span class="pwb-alert"><i></i>Alerte paddock</span><b class="pwb-word">Breaking</b></div>
      <div class="pwb-body"><div class="pwb-meta"><span class="pdw-cat ${cc}">${cl}</span><span>${esc(x.source)}</span><time datetime="${esc(x.timestamp)}">${pwAgo(Date.parse(x.timestamp))}</time>${pwIsNew(x) ? '<span class="pw-new">Nouveau</span>' : ''}</div>
        <h2 class="pwb-head">${esc(x.title)}</h2>${x.summary ? `<p class="pwb-sub">${esc(x.summary)}</p>` : ''}
        <div class="pwb-foot"><div class="pw-tags">${pwTagChips(x)}</div>${pwImpact(x)}<a class="pwb-cta" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Lire la dépêche ↗</a></div></div></article>`;
  }
  function pwTop(x) {
    const col = pwTeamCol(x), [cc, cl] = PW_CAT[x.category] || PW_CAT.PADDOCK;
    return `<a class="pwt" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" style="--tc:${col}"><div class="pwt-vis">${pwVisual(x)}<span class="pdw-cat ${cc}">${cl}</span></div>
      <div class="pwt-b"><div class="pwt-meta"><span>${esc(x.source)}</span><time>${pwAgo(Date.parse(x.timestamp))}</time>${pwIsNew(x) ? '<span class="pw-new">Nouveau</span>' : ''}</div><h3>${esc(x.title)}</h3><div class="pw-tags">${pwTagChips(x)}</div>${x.impact ? `<span class="pwt-imp">⚡ ${esc(x.impact.impactLabel || 'Impact actif')}</span>` : ''}</div></a>`;
  }
  function pwRow(x) {
    const [cc, cl] = PW_CAT[x.category] || PW_CAT.PADDOCK, ts = Date.parse(x.timestamp), t = pwTags(x);
    const q = `${x.title} ${x.summary || ''} ${x.source} ${t.drivers.map((id) => (drv(id) || {}).family || '').join(' ')} ${t.teams.map(pwName).join(' ')}`.toLowerCase();
    return `<article class="pwr ${x.impact ? 'has-imp' : ''} ${pwIsNew(x) ? 'new' : ''}" data-cat="${cc}" data-teams="${esc(t.teams.join(' '))}" data-q="${esc(q)}" style="--tc:${pwTeamCol(x)}">
      <div class="pwr-time"><b>${new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b><small>${pwAgo(ts)}</small></div><i class="pwr-dot"></i>
      <div class="pwr-card"><div class="pwr-main"><header class="pdw-meta"><span class="pdw-cat ${cc}">${cl}</span><span>${esc(x.source)}</span>${pwIsNew(x) ? '<span class="pw-new">Nouveau</span>' : ''}</header>
        <h3>${esc(x.title)}</h3>${x.summary ? `<p>${esc(x.summary)}</p>` : ''}<div class="pw-tags">${pwTagChips(x)}</div>${pwImpact(x)}
        <a class="pdw-src" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Lire sur ${esc(x.source)} ↗</a></div>
        ${x.image ? `<div class="pwr-vis">${pwVisual(x)}</div>` : ''}</div></article>`;
  }
  // filtres du fil (catégorie, écurie, recherche) appliqués sans recharger la page
  function pwApply() {
    const q = (($('#pwQ') || {}).value || '').trim().toLowerCase(), f = S.pwFilter || 'all', tm = S.pwTeam || '';
    let n = 0;
    $$('.pwr').forEach((el) => {
      const ok = (f === 'all' || (f === 'imp' ? el.classList.contains('has-imp') : f === 'new' ? el.classList.contains('new') : el.dataset.cat === f)) && (!tm || el.dataset.teams.split(' ').includes(tm)) && (!q || el.dataset.q.includes(q));
      el.hidden = !ok; if (ok) n++;
    });
    $$('.pw-day').forEach((g) => { g.hidden = ![...g.querySelectorAll('.pwr')].some((el) => !el.hidden); });
    const e = $('#pwEmpty'); if (e) e.hidden = n > 0;
    const c = $('#pwCount'); if (c) c.textContent = n;
  }
  function pagePaddock() {
    if (!F1.news) return '<div class="empty">Module indisponible.</div>';
    const d = F1.news.data, items = F1.news.items(), nx = F1.news.nextAt();
    // « nouveau » : dépêches arrivées depuis la visite précédente
    if (pwSeenPrev == null) { let v = 0; try { v = +localStorage.getItem('pitwall:pwSeen') || 0; } catch (e) { /* */ } pwSeenPrev = v || Date.now(); try { localStorage.setItem('pitwall:pwSeen', String(Date.now())); } catch (e) { /* */ } }
    const b = F1.news.board();
    const srcOk = d && d.sources ? d.sources.filter((x) => x.ok && !/\(EN\)/.test(x.name)).map((x) => x.name) : [];
    const late = nx && Date.now() > nx;
    const status = `<div class="pdw-status"><span class="pdw-live"><i></i>${d && d.updated ? 'Liaison paddock' : 'En attente'}</span>
      <div class="pdw-st"><small>Dernier relevé</small><b>${d && d.updated ? esc(pwTime(Date.parse(d.updated))) : '—'}</b></div>
      <div class="pdw-st"><small>${late ? 'Relevé en cours' : 'Prochaine mise à jour dans'}</small>${nx && !late ? `<b class="num pdw-cd" data-cd="${nx}"><span data-u="1">--</span>:<span data-u="2">--</span>:<span data-u="3">--</span></b>` : '<b>…</b>'}</div>
      <div class="pdw-st"><small>Sources</small><b>${srcOk.length ? esc(srcOk.join(' · ')) : '—'}</b></div>
      <button class="btn sm pdw-sync" data-action="pw-sync">↻ Forcer la synchro</button></div>`;
    const tick = items.slice(0, 14).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><time>${new Date(Date.parse(x.timestamp)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>${esc(x.title)}</a>`).join('<span class="pw-sep">◆</span>');
    const ticker = items.length ? `<div class="pw-ticker"><span class="pw-onair"><i></i>En direct</span><div class="pw-tk"><div class="pw-tk-in">${tick}<span class="pw-sep">◆</span>${tick}</div></div></div>` : '';
    const recent = items.filter((x) => Date.now() - Date.parse(x.timestamp) < 72 * 36e5);
    const ranked = [...(recent.length ? recent : items)].sort((a, b2) => pwScore(b2) - pwScore(a));
    const brk = ranked[0], tops = ranked.slice(1, 4);
    const f = S.pwFilter || 'all';
    const chips = [['all', 'Tout', items.length], ['new', 'Nouveau', items.filter(pwIsNew).length], ['imp', 'Impact actif', items.filter((x) => x.impact && F1.news.weight(x) > 0).length], ['tech', 'Technique'], ['pad', 'Paddock'], ['reg', 'Règlement'], ['wx', 'Météo']]
      .filter(([k, , n]) => k !== 'new' || n).map(([k, l, n]) => `<button class="pdw-chip ${f === k ? 'on' : ''}" data-action="pw-filter" data-f="${k}">${l}${n != null ? ` <span class="num">${n}</span>` : ''}</button>`).join('');
    const teamIds = [...new Set(items.flatMap((x) => pwTags(x).teams))];
    const teamSel = `<div class="pw-teams">${teamIds.map((id) => `<button class="pw-tbtn ${S.pwTeam === id ? 'on' : ''}" data-action="pw-team" data-t="${id}" style="--tc:${F1.teamColor(id)}" title="${esc(pwName(id))}"><i></i>${esc(pwName(id))}</button>`).join('')}</div>`;
    // fil groupé par jour
    const dayKey = (t) => { const x = new Date(t), td = new Date(); const diff = Math.round((new Date(td.toDateString()) - new Date(x.toDateString())) / 864e5); return diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Hier' : x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); };
    const groups = []; items.forEach((x) => { const k = dayKey(Date.parse(x.timestamp)); const g = groups[groups.length - 1]; if (g && g.k === k) g.items.push(x); else groups.push({ k, items: [x] }); });
    const feed = items.length ? groups.map((g) => `<section class="pw-day"><h4 class="pw-day-h">${esc(g.k)}<span>${g.items.length} dépêche${g.items.length > 1 ? 's' : ''}</span></h4>${g.items.map(pwRow).join('')}</section>`).join('') + '<div class="empty" id="pwEmpty" hidden>Aucune dépêche ne correspond à ces filtres.</div>'
      : '<div class="empty">Premier relevé du paddock en attente.</div>';
    const stat = (v) => (v ? `<b class="num ${v > 0 ? 'pos' : 'neg'}">${pwSign(v)}</b>` : '<span class="dim">·</span>');
    const multTxt = (m) => `<b class="num ${m > 1 ? 'neg' : 'pos'}">${m > 1 ? '+' : ''}${Math.round((m - 1) * 100)} %</b>`;
    const teamsRows = b.teams.map((t) => `<tr><td><span class="pdw-tgt" style="--tc:${F1.teamColor(t.id)}">${esc(pwName(t.id))}</span></td><td>${stat(t.mods.speed)}</td><td>${stat(t.mods.df)}</td><td>${stat(t.mods.rel)}</td><td>${multTxt(t.mult)}</td></tr>`).join('');
    const drvRows = b.drivers.map((x) => `<li><span class="pdw-tgt" style="--tc:${F1.teamColor((drv(x.id) || {}).teamId)}">${esc(pwName(x.id))}</span>${multTxt(x.mult)}</li>`).join('');
    const side = `<aside class="pdw-side"><div class="card pdw-board"><div class="pdw-bh"><h3>Impact en direct</h3><span class="muted">${b.teams.length + b.drivers.length ? 'cumul des dépêches actives' : 'aucun effet en cours'}</span></div>
      ${b.teams.length ? `<table class="pdw-tab"><thead><tr><th>Écurie</th><th title="Vitesse de pointe (moteur)">Vit.</th><th title="Appui (aéro)">Appui</th><th title="Fiabilité">Fiab.</th><th>Cotes</th></tr></thead><tbody>${teamsRows}</tbody></table>` : ''}
      ${b.drivers.length ? `<h4>Pilotes</h4><ul class="pdw-drv">${drvRows}</ul>` : ''}</div>
      <details class="card pdw-how"><summary>Comment l'actualité agit sur le jeu</summary><ul>
        <li><b>F1 Manager</b> : moteur → vitesse de pointe, aéro → appui, fiabilité → risque de casse, pour l'écurie concernée (IA et votre châssis) en course de campagne.</li>
        <li><b>Paris</b> : les cotes des pilotes et écuries visés sont multipliées (▲ cote plus haute, ▼ plus basse). Les paris déjà placés gardent leur cote.</li>
        <li><b>Durée</b> : plein effet 48 h, puis effet dégressif jusqu'à 7 jours.</li>
        <li><b>GP Hebdomadaire</b> : non concerné, pour que tout le monde court à armes égales.</li></ul></details></aside>`;
    return `<section class="pdw-page"><div class="pdw-hero"><div class="pdw-title">${PW_ICON}<h1 class="pdw-word">Paddock Wire</h1></div><p class="muted">Dépêches F1 relevées toutes les 30 minutes. Chaque information analysée agit sur les monoplaces de F1 Manager et sur les cotes.</p></div>
      ${ticker}${status}
      ${brk ? pwBreaking(brk) : ''}
      ${tops.length ? `<div class="pwt-row">${tops.map(pwTop).join('')}</div>` : ''}
      <div class="pdw-grid"><div class="pdw-feed"><div class="pw-tools"><div class="pw-search"><input class="field" id="pwQ" type="search" placeholder="Rechercher un pilote, une écurie, un sujet…" autocomplete="off" value="${esc(S.pwQ || '')}"><span class="muted"><b id="pwCount">${items.length}</b> dépêches</span></div><div class="pdw-chips">${chips}</div>${teamSel}</div>${feed}</div>${side}</div></section>`;
  }
  // Accueil : les dernières dépêches
  function pwHome() {
    if (!F1.news || S.series === 'wec') return '';
    const items = F1.news.items(); if (!items.length) return '';
    const recent = items.filter((x) => Date.now() - Date.parse(x.timestamp) < 72 * 36e5);
    const top = [...(recent.length ? recent : items)].sort((a, b) => pwScore(b) - pwScore(a))[0];
    const list = items.filter((x) => x !== top).slice(0, 5);
    const col = pwTeamCol(top), [cc, cl] = PW_CAT[top.category] || PW_CAT.PADDOCK;
    const feat = `<a class="pwh-feat" href="${esc(top.url)}" target="_blank" rel="noopener noreferrer" style="--tc:${col}"><div class="pwh-vis">${(() => { const dd = pwTags(top).drivers[0] && drv(pwTags(top).drivers[0]); return dd && dd.number ? `<span class="pwh-num">${F1.num.html(dd.number, dd.teamId, { color: 'currentColor' })}</span>` : ''; })()}${pwVisual(top)}</div>
      <div class="pwh-fb"><div class="pwh-meta"><span class="pwh-live"><i></i>À la une</span><span class="pdw-cat ${cc}">${cl}</span><span>${esc(top.source)}, ${pwAgo(Date.parse(top.timestamp))}</span></div>
        <h3>${esc(top.title)}</h3>${top.summary ? `<p>${esc(top.summary)}</p>` : ''}<div class="pw-tags">${pwTagChips(top)}</div>${top.impact ? `<span class="pwh-imp">⚡ ${esc(top.impact.impactLabel || 'Impact sur le jeu')}</span>` : ''}</div></a>`;
    const rows = list.map((x) => { const [c2] = PW_CAT[x.category] || PW_CAT.PADDOCK; return `<a class="pwh-row" href="#/paddock" style="--tc:${pwTeamCol(x)}"><time>${new Date(Date.parse(x.timestamp)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time><div><b>${esc(x.title)}</b><span class="pwh-row-m"><i class="pdw-cat ${c2}"></i>${esc(x.source)}${x.impact ? ' · <em>impact sur le jeu</em>' : ''}</span></div></a>`; }).join('');
    return `<section class="section pwh"><div class="pwh-head"><a class="pwh-brand" href="#/paddock">${PW_ICON}<span class="pdw-word">Paddock Wire</span></a><span class="pwh-sub">L'actualité F1, relevée toutes les 30 minutes. Elle fait bouger les cotes et les monoplaces du F1 Manager.</span><a class="btn sm ghost" href="#/paddock">Toutes les dépêches</a></div>
      <div class="pwh-grid">${feat}<div class="pwh-list">${rows}</div></div></section>`;
  }
  async function pwSync(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Synchro…'; }
    const before = new Map([...S.markets, ...S.seasonMarkets].flatMap((m) => m.selections.map((x) => [x.sid, x.odds])));
    const n0 = F1.news.items().length;
    const r = await F1.news.load(true);
    computeMarkets();
    let moved = 0; [...S.markets, ...S.seasonMarkets].forEach((m) => m.selections.forEach((x) => { const o = before.get(x.sid); if (o && o !== x.odds) moved++; }));
    const n1 = F1.news.items().length;
    route();
    if (F1.news.error && !r.changed) toast('⚠️', 'Paddock injoignable, dépêches en cache conservées', 'lose');
    else if (r.changed) toast('📰', `${Math.max(0, n1 - n0) ? `${n1 - n0} nouvelle(s) dépêche(s)` : 'Relevé mis à jour'} · ${moved} cote(s) recalculée(s)`, 'win');
    else toast('📡', `Synchro faite : déjà à jour. Impacts réappliqués aux monoplaces et aux cotes${moved ? ` (${moved} cote(s) modifiée(s))` : ''}.`);
  }

  /* =================== Accueil =================== */
  // Sélecteur de championnat (pictogrammes originaux, pas les logos officiels)
  // Endurance (WEC) : page conservée mais pas encore ouverte au public
  // Choix du championnat : interrupteur compact (pictogramme F1 Manager pour la Formule 1, Hypercar pour l'Endurance)
  function seriesTabs() {
    const hyper = '<svg class="sxs-ic" viewBox="0 0 66 22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16 C5 11 10 9 17 8 C24 4 34 3 43 5 C50 6 56 9 60 12 L63 15 V17 H56 M18 17 H46 M8 17 H4"/><path d="M27 6 C30 2 38 2 41 6"/><path d="M3 7 H10 L11 12"/><circle cx="13" cy="17" r="4"/><circle cx="51" cy="17" r="4"/></svg>';
    const opt = (k, name, icon) => { const on = S.series === k, lock = k === 'wec' && (WEC_LOCKED || !S.wec); return `<button class="${on ? 'on' : ''} ${lock ? 'lock' : ''}" role="tab" aria-selected="${on}" ${lock ? 'disabled title="Endurance : bientôt disponible"' : `data-action="series" data-s="${k}"`}>${icon}<span>${name}</span>${lock ? '<small>bientôt</small>' : ''}</button>`; };
    return `<div class="sxs" role="tablist" aria-label="Championnat">${opt('f1', 'Formule 1', F1_ICON.replace('class="f1-ico"', 'class="sxs-ic f1-ico"'))}${opt('wec', 'Endurance', hyper)}</div>`;
  }
  function seriesSwitch() {
    const tile = (k, name, sub, svg) => { const lock = k === 'wec' && WEC_LOCKED; return `<button class="series-tile ${S.series === k ? 'on' : ''} ${lock ? 'soon' : ''}" data-action="series" data-s="${k}" ${k === 'wec' && (!S.wec || lock) ? 'disabled' : ''} ${lock ? 'title="Endurance : bientôt disponible"' : ''} aria-pressed="${S.series === k}"><span class="series-ic ${k}">${lock ? '<i class="soon-band">Coming soon</i>' : ''}${svg}${S.series === k ? '<i class="series-ck">✓</i>' : ''}</span><b>${name}</b><small>${lock ? 'Bientôt disponible' : sub}</small></button>`; };
    const f1 = '<svg viewBox="0 0 64 64"><path d="M8 44 L20 24 H44 L40 31 H25 L22 36 H36 L32 43 H18 L17.5 44Z M46 24 H58 L46 44 H34Z" fill="#fff"/><path d="M8 50 H50" stroke="#fff" stroke-width="2.5" stroke-dasharray="7 4" opacity=".65"/></svg>';
    const wec = '<svg viewBox="0 0 64 64"><circle cx="32" cy="30" r="17" fill="none" stroke="#fff" stroke-width="3"/><path d="M32 30 V19 M32 30 L40 35" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M32 9 V13 M53 30 H49 M11 30 H15" stroke="#fff" stroke-width="2.5"/><text x="32" y="60" text-anchor="middle" font-size="12" font-weight="900" font-style="italic" fill="#fff" font-family="Titillium Web, sans-serif" letter-spacing="1.5">24H</text></svg>';
    return `<div class="series-sw">${tile('f1', 'Formule 1', S.f1 ? `Saison ${S.f1.year}` : '', f1)}${tile('wec', 'WEC', S.wec ? `Endurance ${S.wec.year}` : 'Indisponible', wec)}</div>`;
  }
  function pageHome() {
    const s = S.season;
    const nx = s.next;
    const f1Home = S.series !== 'wec' && nx;
    let h = f1Home ? heroTrack(nx) : seriesTabs() + hero(nx);
    if (s.pending) h += `<div class="notice red" style="margin-top:18px">🏁 <b>${esc(s.pending.nameFr)}</b> : course terminée ou en cours — vos paris seront réglés dès la publication des résultats officiels.</div>`;
    if (S.series !== 'wec' && s.doneCount === 0 && nx && F1.store.canClaimSeason(s)) h += `<div class="notice" style="margin-top:18px">🎆 Nouvelle saison ${s.year} : prime de lancement <b>+${jt(F1.store.SEASON_BONUS)}</b>. <span class="sp"></span><button class="btn sm gold" data-action="claim-season">Récupérer</button></div>`;
    if (s.prev && s.doneCount === 0) { const ch = [...s.prev.drivers.values()].sort((a, b) => b.points - a.points)[0]; if (ch) h += `<div class="notice" style="margin-top:18px">🏆 Saison ${s.prev.year} terminée : <b>${esc(ch.given + ' ' + ch.family)}</b> champion du monde avec ${fmt(ch.points)} points. Les cotes ${s.year} partent de la hiérarchie ${s.prev.year}.</div>`; }
    if (!f1Home && S.series !== 'wec' && nx && F1.store.canClaim(s, nx)) h += `<div class="notice" style="margin-top:18px">🎁 Prime du week-end disponible : <b>+${jt(F1.store.WEEKLY)}</b> pour le ${esc(nx.nameFr)}. <span class="sp"></span><button class="btn sm gold" data-action="claim">Récupérer</button></div>`;
    if (!f1Home && S.series !== 'wec' && nx && F1.store.canRescue(s, nx)) h += `<div class="notice red" style="margin-top:18px">💸 Réservoir vide ? Le stand vous ravitaille : <b>+${jt(F1.store.RESCUE)}</b>. <span class="sp"></span><button class="btn sm" data-action="rescue">Ravitailler</button></div>`;

    if (S.markets.length) {
      const win = S.markets.find((m) => m.kind === 'win');
      h += `<section class="section"><div class="section-h"><h2>Favoris pour la victoire</h2><a class="link" href="#/paris">Tous les marchés</a></div><div class="grid g4">${win.selections.slice(0, 4).map((x, i) => favCard(x, win, i)).join('')}</div></section>`;
      const boost = S.markets.find((m) => m.layout === 'boost');
      const rival = S.markets.find((m) => m.kind === 'h2h' && m.h2hType === 'rival');
      const quali = S.markets.find((m) => m.kind === 'pole') || S.markets.find((m) => m.kind === 'sprintWin') || S.markets.find((m) => m.kind === 'podium');
      h += `<section class="section"><div class="section-h"><h2>À la une</h2></div><div class="grid g3">${boostCard(boost) || ''}${rival ? h2hCard(rival) : ''}${marketCard(quali, { limit: 6 })}</div></section>`;
    }
    h += pwHome();
    h += `<section class="section"><div class="grid g2">${lastPodium()}${miniStandings()}</div></section>`;
    h += upcomingTeaser();
    if (!f1Home) h += homeStats();
    else h += `<section class="section"><div class="section-h"><h2>Ton week-end</h2><a class="link" href="#/profil">Mon profil</a></div>${yourWeekend(s, nx)}</section>`;
    return h;
  }

  /* ---------- Accueil : le tracé du prochain circuit, feux de départ, programme du week-end ---------- */
  /* ---------- Décor du circuit : paysage dessiné autour du tracé selon le lieu ----------
     g : sol · items : éléments du décor (pondérés) · night : course de nuit · sea : côté de la mer */
  const SCENES = {
    losail: { g: 'sand', items: { palm: 3, camel: 2, dune: 4 }, night: 1 }, bahrain: { g: 'sand', items: { palm: 3, camel: 2, dune: 4, tower: 1 }, night: 1 },
    jeddah: { g: 'sand', items: { tower: 3, palm: 3, dune: 1 }, night: 1, sea: 'left' }, yas_marina: { g: 'sand', items: { palm: 4, tower: 2, yacht: 2, dune: 1 }, night: 1, sea: 'bottom' },
    vegas: { g: 'city', items: { tower: 6, cactus: 2, palm: 1 }, night: 1 }, marina_bay: { g: 'city', items: { tower: 6, palm: 2, yacht: 1 }, night: 1, sea: 'bottom' },
    monaco: { g: 'city', items: { tower: 4, yacht: 3, palm: 2, pine: 1 }, sea: 'bottom' }, baku: { g: 'city', items: { tower: 6, tree: 1 }, sea: 'bottom' },
    miami: { g: 'city', items: { palm: 5, tower: 3 } }, madring: { g: 'city', items: { tower: 5, tree: 2 } }, shanghai: { g: 'city', items: { tower: 4, tree: 3 } },
    rodriguez: { g: 'city', items: { tower: 3, tree: 3 } }, interlagos: { g: 'park', items: { tree: 4, tower: 3 } }, albert_park: { g: 'park', items: { tree: 5, tower: 2 }, lake: 1 },
    villeneuve: { g: 'park', items: { tree: 4, tower: 2 }, lake: 1 }, sepang: { g: 'park', items: { palm: 5, tree: 3 } }, suzuka: { g: 'park', items: { tree: 4, pine: 3, mountain: 1 } },
    spa: { g: 'forest', items: { pine: 7, tree: 2, mountain: 1 } }, red_bull_ring: { g: 'forest', items: { mountain: 4, pine: 4 } }, imola: { g: 'forest', items: { tree: 5, pine: 2 } },
    monza: { g: 'forest', items: { tree: 7 } }, silverstone: { g: 'park', items: { tree: 4, field: 3 } }, hungaroring: { g: 'park', items: { tree: 4, field: 2 } },
    catalunya: { g: 'park', items: { tree: 3, mountain: 2, field: 1 } }, zandvoort: { g: 'sand', items: { dune: 5, pine: 2 }, sea: 'left' }, americas: { g: 'park', items: { tree: 3, field: 3 } },
    portimao: { g: 'park', items: { tree: 3, mountain: 2 } }, istanbul: { g: 'park', items: { tree: 4, tower: 1 } },
  };
  /* Lieux emblématiques : n = nom, f = position sur le tour (0 à 1 depuis la ligne), paint = virage peint (couleurs),
     tunnel = passage couvert (f à f2), icon = monument dessiné à côté du tracé */
  const LANDMARKS = {
    spa: [{ n: 'Eau Rouge · Raidillon', f: 0.055, f2: 0.1, paint: ['#ffd400', '#e10600'] }, { n: 'Pouhon', f: 0.5 }, { n: 'Blanchimont', f: 0.86 }],
    monaco: [{ n: 'Casino', f: 0.2, icon: 'casino' }, { n: 'Tunnel', f: 0.39, f2: 0.47, tunnel: 1 }, { n: 'Épingle du Fairmont', f: 0.31 }, { n: 'Piscine', f: 0.7 }],
    monza: [{ n: 'Parabolica', f: 0.9 }, { n: 'Lesmo', f: 0.45 }, { n: 'Ascari', f: 0.62 }, { n: 'Anneau de vitesse', f: 0.2, icon: 'banking' }],
    silverstone: [{ n: 'Maggotts · Becketts', f: 0.19, f2: 0.27, paint: ['#2e6be6', '#f4f4f2'] }, { n: 'Copse', f: 0.1 }, { n: 'Stowe', f: 0.5 }, { n: 'The Wing', f: 0.0, icon: 'wing' }],
    suzuka: [{ n: '130R', f: 0.86 }, { n: 'Les S', f: 0.14 }, { n: 'Pont du huit', f: 0.4 }, { n: 'Grande roue', f: 0.03, icon: 'ferris' }],
    marina_bay: [{ n: 'Marina Bay Sands', f: 0.55, icon: 'mbs' }, { n: 'Anderson Bridge', f: 0.32 }],
    vegas: [{ n: 'Sphere', f: 0.13, icon: 'sphere' }, { n: 'Le Strip', f: 0.6, f2: 0.78, paint: ['#ff2bd6', '#22f0ff'] }],
    yas_marina: [{ n: 'Yas Hotel', f: 0.6, icon: 'yas' }, { n: 'Marina', f: 0.75 }],
    bahrain: [{ n: 'Tour de Sakhir', f: 0.02, icon: 'tower' }, { n: 'Virage 4', f: 0.2 }],
    jeddah: [{ n: 'Corniche', f: 0.45 }, { n: 'Virage 27', f: 0.97 }],
    losail: [{ n: 'Ligne droite de 1 km', f: 0.98 }, { n: 'Virage 1', f: 0.06 }],
    albert_park: [{ n: 'Lakeside', f: 0.55 }, { n: 'Virage 1', f: 0.05 }],
    villeneuve: [{ n: 'Mur des Champions', f: 0.97, paint: ['#e10600', '#f4f4f2'], f2: 0.995 }, { n: 'Épingle', f: 0.6 }],
    interlagos: [{ n: 'S de Senna', f: 0.03, f2: 0.09, paint: ['#ffd400', '#1e9e4a'] }, { n: 'Junção', f: 0.84 }],
    rodriguez: [{ n: 'Foro Sol', f: 0.86, icon: 'stadium' }, { n: 'Virage 1', f: 0.2 }],
    americas: [{ n: 'Virage 1 en côte', f: 0.03 }, { n: 'Tour d\'observation', f: 0.62, icon: 'tower' }],
    red_bull_ring: [{ n: 'Taureau', f: 0.02, icon: 'bull' }, { n: 'Remus', f: 0.27 }],
    zandvoort: [{ n: 'Arie Luyendyk (relevé)', f: 0.93, f2: 0.99, paint: ['#ff7a00', '#f4f4f2'] }, { n: 'Hugenholtz', f: 0.14 }],
    hungaroring: [{ n: 'Virage 1', f: 0.06 }, { n: 'Virage 4', f: 0.3 }],
    imola: [{ n: 'Tamburello', f: 0.12 }, { n: 'Rivazza', f: 0.82 }],
    catalunya: [{ n: 'Virage 3', f: 0.22 }, { n: 'La Caixa', f: 0.48 }],
    baku: [{ n: 'Vieille ville', f: 0.42, icon: 'castle' }, { n: 'Ligne droite de 2 km', f: 0.88 }],
    shanghai: [{ n: 'L\'escargot', f: 0.04 }, { n: 'Longue ligne droite', f: 0.7 }],
    miami: [{ n: 'Hard Rock Stadium', f: 0.4, icon: 'stadium' }, { n: 'Marina', f: 0.15 }],
    madring: [{ n: 'La Monumental', f: 0.5 }, { n: 'IFEMA', f: 0.1 }],
    sepang: [{ n: 'Virage 15', f: 0.9 }, { n: 'Tribunes en feuille', f: 0.02, icon: 'leaf' }],
    portimao: [{ n: 'Montagnes russes', f: 0.45 }],
    istanbul: [{ n: 'Virage 8', f: 0.38 }],
  };
  const SCENE_DEFS = `
    <symbol id="sc-palm" viewBox="0 0 40 50"><path d="M20 50 C19 38 21 28 24 18" stroke="#7d5a37" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <g fill="#2f8f63"><path d="M24 18 C16 10 8 12 3 18 C10 14 17 15 24 18Z"/><path d="M24 18 C30 9 38 9 41 15 C35 12 29 14 24 18Z"/><path d="M24 18 C22 8 25 2 31 0 C27 6 26 12 24 18Z"/><path d="M24 18 C16 17 10 22 9 29 C13 23 18 20 24 18Z"/><path d="M24 18 C31 18 36 23 37 30 C33 24 29 20 24 18Z"/></g></symbol>
    <symbol id="sc-camel" viewBox="0 0 52 40"><path fill="#c48a52" d="M6 14 C4 10 6 6 10 7 C12 8 12 11 11 14 L13 20 C16 13 20 9 25 12 C27 8 32 8 34 13 C38 13 41 17 41 22 L43 22 C45 22 46 25 44 26 L41 26 L40 38 L37 38 L37 28 L33 30 L33 38 L30 38 L30 30 L22 30 L21 38 L18 38 L18 30 L15 29 L14 38 L11 38 L11 26 C10 22 9 18 6 14Z"/></symbol>
    <symbol id="sc-dune" viewBox="0 0 80 24"><path fill="#d8b06a" d="M0 24 C14 8 30 2 46 6 C58 9 70 16 80 24Z"/><path fill="#b98d4c" d="M46 6 C58 9 70 16 80 24 L54 24 C56 16 52 10 46 6Z"/></symbol>
    <symbol id="sc-tower" viewBox="0 0 44 70"><rect x="2" y="26" width="13" height="44" fill="#3b4453"/><rect x="15" y="4" width="15" height="66" fill="#4a5466"/><rect x="30" y="18" width="12" height="52" fill="#353d4b"/><rect x="21" y="0" width="3" height="5" fill="#4a5466"/>
      <g class="sc-win" fill="#ffd46b">${[8, 16, 24, 32, 40, 48, 56].map((y) => `<rect x="18" y="${y}" width="3" height="3"/><rect x="24" y="${y + 4}" width="3" height="3"/>`).join('')}${[30, 40, 50, 60].map((y) => `<rect x="6" y="${y}" width="3" height="3"/><rect x="34" y="${y - 6}" width="3" height="3"/>`).join('')}</g></symbol>
    <symbol id="sc-tree" viewBox="0 0 30 40"><rect x="13.5" y="24" width="3" height="16" fill="#6b4c30"/><circle cx="15" cy="16" r="12" fill="#3f8a54"/><circle cx="10" cy="13" r="6" fill="#4c9c61"/></symbol>
    <symbol id="sc-pine" viewBox="0 0 26 44"><rect x="11.5" y="34" width="3" height="10" fill="#5d4229"/><path fill="#2e6e4a" d="M13 0 L24 18 H18 L26 32 H0 L8 18 H2Z"/></symbol>
    <symbol id="sc-mountain" viewBox="0 0 90 46"><path fill="#4b5668" d="M0 46 L30 6 L44 22 L58 2 L90 46Z"/><path fill="#e8edf3" d="M30 6 L37 16 L31 14 L26 12Z M58 2 L66 13 L59 11 L53 9Z"/></symbol>
    <symbol id="sc-cactus" viewBox="0 0 24 36"><path fill="#3d8a5a" d="M10 36 V6 C10 2 15 2 15 6 V36Z M10 18 H5 V10 C5 7 8 7 8 10 V15 H10Z M15 22 H20 V13 C20 10 17 10 17 13 V19 H15Z"/></symbol>
    <symbol id="sc-yacht" viewBox="0 0 50 22"><path fill="#eef0f3" d="M2 14 H48 L42 22 H8Z"/><path fill="#cfd5dd" d="M14 14 V8 H34 L38 14Z"/><rect x="20" y="10" width="10" height="2" fill="#7ab8e8"/></symbol>
    <symbol id="lm-casino" viewBox="0 0 60 44"><rect x="6" y="18" width="48" height="26" fill="#e8dcc0"/><path d="M2 18 H58 L30 6Z" fill="#c9b48a"/><rect x="25" y="0" width="10" height="10" rx="5" fill="#7ea8a0"/><rect x="8" y="2" width="6" height="16" fill="#e8dcc0"/><rect x="46" y="2" width="6" height="16" fill="#e8dcc0"/>${[12, 22, 34, 44].map((x) => `<rect x="${x}" y="26" width="5" height="10" fill="#6b5a3a"/>`).join('')}</symbol>
    <symbol id="lm-ferris" viewBox="0 0 50 56"><circle cx="25" cy="22" r="20" fill="none" stroke="#e8edf3" stroke-width="2.5"/>${[0, 45, 90, 135].map((a) => `<path d="M25 22 l${(20 * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(20 * Math.sin((a * Math.PI) / 180)).toFixed(1)} M25 22 l${(-20 * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(-20 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" stroke="#aab4c0" stroke-width="1.2"/>`).join('')}${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<circle cx="${(25 + 20 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(22 + 20 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r="3" fill="${['#e10600', '#ffd400', '#2e6be6', '#2ec4b6'][a / 45 % 4]}"/>`).join('')}<path d="M25 22 L14 56 M25 22 L36 56" stroke="#e8edf3" stroke-width="2.5"/></symbol>
    <symbol id="lm-mbs" viewBox="0 0 70 56"><rect x="8" y="14" width="12" height="42" fill="#c9d2dc"/><rect x="29" y="14" width="12" height="42" fill="#c9d2dc"/><rect x="50" y="14" width="12" height="42" fill="#c9d2dc"/><path d="M2 14 C20 8 50 8 68 12 L66 15 C48 12 22 12 3 17Z" fill="#8a96a5"/><g class="sc-win" fill="#ffd46b">${[20, 28, 36, 44].map((y) => `<rect x="11" y="${y}" width="6" height="2"/><rect x="32" y="${y}" width="6" height="2"/><rect x="53" y="${y}" width="6" height="2"/>`).join('')}</g></symbol>
    <symbol id="lm-sphere" viewBox="0 0 50 50"><defs><radialGradient id="lmSph" cx=".35" cy=".35"><stop offset="0" stop-color="#ffe36b"/><stop offset=".45" stop-color="#ff7a00"/><stop offset="1" stop-color="#a1127a"/></radialGradient></defs><circle cx="25" cy="24" r="22" fill="url(#lmSph)"/><circle cx="18" cy="18" r="4" fill="#fff" opacity=".5"/><rect x="10" y="44" width="30" height="6" fill="#3b4453"/></symbol>
    <symbol id="lm-stadium" viewBox="0 0 70 40"><ellipse cx="35" cy="24" rx="33" ry="15" fill="#5a6474"/><ellipse cx="35" cy="22" rx="25" ry="10" fill="#3f8a54"/><path d="M14 22 H56" stroke="#e8edf3" stroke-width="1"/><ellipse cx="35" cy="22" rx="25" ry="10" fill="none" stroke="#c9d2dc" stroke-width="2"/></symbol>
    <symbol id="lm-bull" viewBox="0 0 60 40"><path fill="#c7cdd6" d="M6 14 C2 10 4 4 9 6 L12 10 C18 8 30 8 40 10 L48 12 C54 12 58 16 56 22 L52 24 L50 36 H46 L45 26 L32 26 L30 36 H26 L25 26 C20 26 16 24 14 20 L10 18 Z"/><path d="M8 7 C4 2 6 0 9 2 M12 9 C10 3 13 1 15 4" stroke="#e8edf3" stroke-width="2" fill="none"/><rect x="18" y="36" width="34" height="4" fill="#3b4453"/></symbol>
    <symbol id="lm-yas" viewBox="0 0 80 40"><path d="M4 30 C14 6 66 6 76 30" fill="none" stroke="#9fd3ff" stroke-width="5"/><path d="M10 30 C20 12 60 12 70 30" fill="none" stroke="#6f8aa8" stroke-width="2"/><rect x="4" y="28" width="12" height="12" fill="#c9d2dc"/><rect x="64" y="28" width="12" height="12" fill="#c9d2dc"/></symbol>
    <symbol id="lm-tower" viewBox="0 0 30 64"><rect x="11" y="16" width="8" height="48" fill="#c9d2dc"/><rect x="5" y="6" width="20" height="12" rx="2" fill="#8a96a5"/><rect x="8" y="9" width="14" height="5" fill="#9fd3ff"/><rect x="14" y="0" width="2" height="6" fill="#e10600"/></symbol>
    <symbol id="lm-castle" viewBox="0 0 70 40"><path fill="#c9a874" d="M0 40 V16 H6 V10 H12 V16 H18 V10 H24 V16 H30 V4 H40 V16 H46 V10 H52 V16 H58 V10 H64 V16 H70 V40Z"/><rect x="31" y="26" width="8" height="14" rx="4" fill="#6b4c30"/></symbol>
    <symbol id="lm-leaf" viewBox="0 0 70 34"><path fill="#e8edf3" d="M2 30 C10 6 26 2 34 10 C42 2 60 6 68 30Z"/><path d="M34 10 V30" stroke="#aab4c0" stroke-width="2"/><rect x="4" y="30" width="62" height="4" fill="#5a6474"/></symbol>
    <symbol id="lm-wing" viewBox="0 0 90 30"><path fill="#c9d2dc" d="M0 30 V18 C20 10 70 6 90 12 V30Z"/><path d="M0 18 C20 10 70 6 90 12" stroke="#e10600" stroke-width="2" fill="none"/></symbol>
    <symbol id="lm-banking" viewBox="0 0 90 34"><path d="M2 32 C20 4 70 4 88 32" fill="none" stroke="#7a828e" stroke-width="10"/><path d="M2 32 C20 4 70 4 88 32" fill="none" stroke="#a7aeb8" stroke-width="2" stroke-dasharray="4 5"/></symbol>
    <symbol id="sc-field" viewBox="0 0 70 30"><path fill="#5d8a4a" d="M0 30 L18 0 H70 L52 30Z"/><path stroke="#7aa65e" stroke-width="2" d="M10 25 L26 3 M22 25 L38 3 M34 25 L50 3 M46 25 L62 3"/></symbol>`;
  const SC_SIZE = { palm: [46, 58], camel: [52, 40], dune: [96, 30], tower: [52, 82], tree: [34, 44], pine: [30, 50], mountain: [130, 66], cactus: [24, 36], yacht: [50, 22], field: [84, 36] };
  function sceneLayer(circuitId, pts, box, avoid = []) {
    const sc = SCENES[circuitId] || { g: 'park', items: { tree: 3 } };
    let seed = 0; for (const c of circuitId) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const [bx, by, bw, bh] = box;
    const pool = Object.entries(sc.items).flatMap(([k, w]) => Array(w).fill(k));
    const near = (x, y, r) => pts.some((q, i) => i % 2 === 0 && (q[0] - x) ** 2 + (q[1] - y) ** 2 < r * r);
    const placed = [];
    for (let k = 0; k < 320 && placed.length < 24; k++) {
      const it = pool[Math.floor(rnd() * pool.length)], [w, h] = SC_SIZE[it].map((v) => v * 1.55);
      const x = bx + rnd() * bw, y = by + rnd() * bh;
      // eau : les yachts seulement sur la mer, rien d'autre dessus
      const wet = sc.sea === 'bottom' ? y > by + bh * 0.93 : sc.sea === 'left' ? x < bx + bw * 0.08 : false;
      if ((it === 'yacht') !== wet) continue;
      if (near(x, y - h * 0.35, Math.max(w, h) * 0.55 + 22)) continue;
      if (avoid.some((a) => (a[0] - x) ** 2 + (a[1] - y + h * 0.4) ** 2 < 110 * 110)) continue;
      if (placed.some((p2) => Math.abs(p2.x - x) < (w + p2.w) * 0.45 && Math.abs(p2.y - y) < (h + p2.h) * 0.4)) continue;
      placed.push({ it, x, y, w, h, flip: rnd() < 0.5 });
    }
    placed.sort((a, b) => a.y - b.y);
    const items = placed.map((q) => `<use href="#sc-${q.it}" x="${(q.x - q.w / 2).toFixed(0)}" y="${(q.y - q.h).toFixed(0)}" width="${q.w}" height="${q.h}"${q.flip && q.it !== 'tower' ? ` transform="translate(${(2 * q.x).toFixed(0)} 0) scale(-1 1)"` : ''}/>`).join('');
    // sol : nappe de couleur sous le circuit, texture selon le terrain
    const G = { sand: ['#c49a58', '#8f6a35'], city: ['#3a4250', '#252b35'], park: ['#4f8a4c', '#2f5a35'], forest: ['#2f6b45', '#1e4630'] }[sc.g];
    let tex = '';
    if (sc.g === 'sand') for (let k = 0; k < 14; k++) { const x = bx + rnd() * bw, y = by + rnd() * bh; tex += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} q 40 -14 80 0 t 80 0" stroke="#e6c88c" stroke-width="3" fill="none" opacity=".35"/>`; }
    if (sc.g === 'city') for (let k = 0; k < 40; k++) { const x = bx + rnd() * bw, y = by + rnd() * bh; if (!near(x, y, 50)) tex += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(30 + rnd() * 40).toFixed(0)}" height="${(30 + rnd() * 40).toFixed(0)}" rx="4" fill="#4a5363" opacity=".55"/>`; }
    if (sc.g === 'park' || sc.g === 'forest') for (let k = 0; k < 10; k++) { const x = bx + rnd() * bw, y = by + rnd() * bh; tex += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(60 + rnd() * 80).toFixed(0)}" ry="${(30 + rnd() * 40).toFixed(0)}" fill="#6aa65f" opacity=".18"/>`; }
    const cx = bx + bw / 2, cy = by + bh / 2;
    const water = sc.sea === 'bottom' ? `<path d="M${bx - 200} ${by + bh * 0.9} C ${cx - 200} ${by + bh * 0.8}, ${cx + 200} ${by + bh}, ${bx + bw + 200} ${by + bh * 0.86} V ${by + bh + 300} H ${bx - 200}Z" fill="url(#sc-sea)"/>`
      : sc.sea === 'left' ? `<path d="M${bx - 300} ${by - 200} H ${bx + bw * 0.1} C ${bx + bw * 0.18} ${cy - 100}, ${bx + bw * 0.04} ${cy + 120}, ${bx + bw * 0.12} ${by + bh + 200} H ${bx - 300}Z" fill="url(#sc-sea)"/>`
      : sc.lake ? `<ellipse cx="${(cx + bw * 0.05).toFixed(0)}" cy="${(cy + bh * 0.04).toFixed(0)}" rx="${(bw * 0.16).toFixed(0)}" ry="${(bh * 0.1).toFixed(0)}" fill="url(#sc-sea)" opacity=".9"/>` : '';
    let sky = '';
    if (sc.night) { for (let k = 0; k < 40; k++) sky += `<circle cx="${(bx - 120 + rnd() * (bw + 240)).toFixed(0)}" cy="${(by - 120 + rnd() * (bh * 0.5)).toFixed(0)}" r="${(1 + rnd() * 2.4).toFixed(1)}" fill="#fff" opacity="${(0.3 + rnd() * 0.6).toFixed(2)}"/>`; sky += `<g transform="translate(${(bx + bw - 30).toFixed(0)} ${(by - 30).toFixed(0)})"><circle r="34" fill="#f5efd8"/><circle cx="14" cy="-8" r="30" fill="#141a22"/></g>`; }
    return { defs: `${SCENE_DEFS}<radialGradient id="sc-ground" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="${G[0]}" stop-opacity=".55"/><stop offset=".7" stop-color="${G[1]}" stop-opacity=".35"/><stop offset="1" stop-color="${G[1]}" stop-opacity="0"/></radialGradient><linearGradient id="sc-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f6f9c"/><stop offset="1" stop-color="#0d3550"/></linearGradient>`,
      back: `${sky}${water}${tex}`, front: items, night: !!sc.night, ground: sc.g };
  }
  function trackSvg(circuitId, color, fixed = false) {
    const raw = F1.CIRCUITS && F1.CIRCUITS[circuitId];
    if (!raw) return '';
    const pts = raw.split(' ').map((q) => q.split(',').map(Number)).map(([x, y]) => [x, 1000 - y]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 110;
    const d = 'M' + pts.map((q) => q.join(' ')).join(' L') + ' Z';
    const [sx, sy] = pts[0], [nx2, ny2] = pts[3] || pts[1];
    const ang = (Math.atan2(ny2 - sy, nx2 - sx) * 180) / Math.PI;
    const still = fixed || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const box = [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
    // longueur cumulée : position d'un lieu emblématique à une fraction du tour
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const tot = cum[cum.length - 1] || 1;
    const idxAt = (f) => { const dd = ((f % 1) + 1) % 1 * tot; let i = cum.findIndex((v) => v >= dd); return i < 0 ? pts.length - 1 : i; };
    const ccx = (x0 + x1) / 2, ccy = (y0 + y1) / 2;
    const lms = (LANDMARKS[circuitId] || []).map((l) => { const q = pts[idxAt(l.f)]; let vx = q[0] - ccx, vy = q[1] - ccy; const n = Math.hypot(vx, vy) || 1; vx /= n; vy /= n; return { ...l, q, vx, vy }; });
    const seg = (a, b) => { const i = idxAt(a), j = idxAt(b), sel = i <= j ? pts.slice(i, j + 1) : [...pts.slice(i), ...pts.slice(0, j + 1)]; return 'M' + sel.map((q) => q.join(' ')).join(' L'); };
    const paints = lms.filter((l) => l.paint).map((l) => `<path d="${seg(l.f, l.f2)}" fill="none" stroke="${l.paint[0]}" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/><path d="${seg(l.f, l.f2)}" fill="none" stroke="${l.paint[1]}" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const tunnels = lms.filter((l) => l.tunnel).map((l) => `<path d="${seg(l.f, l.f2)}" fill="none" stroke="#0b0d10" stroke-width="40" stroke-linecap="round" opacity=".85"/><path d="${seg(l.f, l.f2)}" fill="none" stroke="#ffd46b" stroke-width="3" stroke-dasharray="6 10" opacity=".9"/>`).join('');
    const [bx0, by0, bw0, bh0] = box, clampX = (x, w) => Math.max(bx0 + 8, Math.min(bx0 + bw0 - w - 8, x)), clampY = (y, h) => Math.max(by0 + 8, Math.min(by0 + bh0 - h - 8, y));
    const icons = lms.filter((l) => l.icon).map((l) => { const w = 130, h = 100, x = clampX(l.q[0] + l.vx * 110 - w / 2, w), y = clampY(l.q[1] + l.vy * 110 - h / 2, h); return `<use href="#lm-${l.icon}" x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w}" height="${h}" class="hx-lm-ic"/>`; }).join('');
    const labels = lms.map((l) => {
      const off = l.icon ? 175 : 70, tw = l.n.length * 15.5 + 30, lx = l.q[0] + l.vx * off, ly = clampY(l.q[1] + l.vy * off + (l.icon ? 30 : 0) - 22, 44) + 22;
      const ax = clampX(l.vx < -0.35 ? lx - tw : l.vx > 0.35 ? lx : lx - tw / 2, tw);
      return `<g class="hx-lm"><path d="M${l.q[0]} ${l.q[1]} L${lx.toFixed(0)} ${ly.toFixed(0)}" stroke="#fff" stroke-width="2" stroke-dasharray="3 4" opacity=".7"/><circle cx="${l.q[0]}" cy="${l.q[1]}" r="7" fill="#fff"/><rect x="${ax.toFixed(0)}" y="${(ly - 22).toFixed(0)}" width="${tw.toFixed(0)}" height="42" rx="21" fill="rgba(10,12,16,.85)" stroke="rgba(255,255,255,.28)"/><text x="${(ax + tw / 2).toFixed(0)}" y="${(ly + 8).toFixed(0)}" text-anchor="middle">${esc(l.n)}</text></g>`;
    }).join('');
    const sc = sceneLayer(circuitId, pts, box, lms.flatMap((l) => [[l.q[0] + l.vx * 96, l.q[1] + l.vy * 96], [l.q[0] + l.vx * (l.icon ? 150 : 64), l.q[1] + l.vy * (l.icon ? 150 : 64)]]));
    // projecteurs le long du tracé pour les courses de nuit
    const lights = sc.night ? pts.filter((_, i) => i % Math.max(8, Math.round(pts.length / 14)) === 0).map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="34" fill="url(#sc-flood)"/>`).join('') : '';
    return `<svg class="hx-track g-${sc.ground} ${sc.night ? 'night' : ''}" viewBox="${box.join(' ')}" role="img" aria-label="Tracé du circuit et son décor">
      <defs>${sc.defs}<radialGradient id="sc-flood"><stop offset="0" stop-color="#fff6d0" stop-opacity=".55"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient>
        <pattern id="hxChk" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><rect width="4" height="4" fill="#111"/><rect x="4" y="4" width="4" height="4" fill="#111"/></pattern></defs>
      <g class="hx-scene">${sc.back}</g>${lights}
      <path class="hx-t-glow" d="${d}" style="stroke:${color}"/>${paints}<path class="hx-t-kerb" d="${d}"/><path class="hx-t-asphalt" d="${d}"/><path class="hx-t-line" id="hxTrk" d="${d}" pathLength="1"/>${tunnels}
      <g transform="translate(${sx} ${sy}) rotate(${ang})"><rect x="-4" y="-22" width="8" height="44" fill="url(#hxChk)"/></g>
      <g class="hx-scene-front">${sc.front}</g><g class="hx-lms">${icons}${labels}</g>
      ${still ? '' : `<circle class="hx-car" r="13" style="fill:${color}"><animateMotion dur="14s" repeatCount="indefinite" rotate="auto"><mpath href="#hxTrk"/></animateMotion></circle>`}</svg>`;
  }
  function heroTrack(nx) {
    const s = S.season, now = Date.now();
    const nextSess = nx.sessions.find((x) => x.date.getTime() > now);
    const w = S.weather;
    const favW = S.markets.find((m) => m.kind === 'win'), favS = favW && favW.selections[0], favD = favS && drv(favS.driverId);
    const tc = favD ? team(favD.teamId).color : '#d7261e';
    const lights = `<div class="hx-lights" data-cd="${nx.date.getTime()}" aria-label="Compte à rebours avant le départ">${['jours', 'heures', 'min', 's'].map((u, i) => `<div class="hx-pod"><i></i><b data-u="${i}">--</b><small>${u}</small></div>`).join('')}</div>`;
    const rail = `<ol class="hx-rail">${nx.sessions.map((x) => { const st = x.date.getTime() < now ? 'done' : x === nextSess ? 'next' : ''; return `<li class="${st}"><span>${esc(x.label)}</span><b>${WD.format(x.date)} ${HM.format(x.date)}</b></li>`; }).join('')}</ol>`;
    const tags = [nx.sprint ? 'Week-end sprint' : '', nx.street ? 'Circuit urbain' : ''].filter(Boolean).map((t) => `<span class="hx-tag">${t}</span>`).join('');
    const wx = w ? `<span>${w.rain >= 50 ? '🌧️' : w.rain >= 25 ? '🌦️' : w.code <= 1 ? '☀️' : '⛅'} ${w.temp} °C, pluie ${w.rain} %, vent ${w.wind} km/h</span>` : '';
    return `<section class="hx" style="--tc:${tc}">
      <div class="hx-l">
        <div class="hx-top">${flag(nx.iso, 'lg')}<span class="hx-round">Manche ${nx.round} sur ${s.races.length}</span>${tags}${seriesTabs()}</div>
        <h1 class="hx-title">${esc(nx.nameFr)}</h1>
        <p class="hx-place">${esc(nx.circuit)}, ${esc(nx.locality)}. Départ ${DAYL.format(nx.date)} à ${HM.format(nx.date)}.</p>
        ${lights}${rail}
        <div class="hx-cta"><a class="btn" href="#/paris">Parier sur ce Grand Prix</a><a class="btn ghost" href="#/paris/tierce">Jouer le tiercé</a></div>
      </div>
      <figure class="hx-map">${trackSvg(nx.circuitId, tc) || `<div class="hx-car3d">${F1.visuals.car(favD ? favD.teamId : 'mclaren', { live: true })}</div>`}
        <figcaption>${favD ? `<a class="hx-fav" href="#/paris" style="--tc:${tc}">${favD.number ? `<span class="hx-fav-n">${F1.num.html(favD.number, favD.teamId, { color: 'currentColor' })}</span>` : ''}<span><small>Favori</small><b>${esc(favD.given)} ${esc(favD.family)}</b></span><span class="hx-fav-o"><small>Cote</small><b>${fmtOdds(favS.odds)}</b></span></a>` : ''}${wx ? `<div class="hx-wx">${wx}</div>` : ''}</figcaption></figure>
    </section>`;
  }
  // « Ton week-end » : ce qui attend le joueur, en un seul endroit
  function yourWeekend(s, nx) {
    const p = F1.store.get(), st = F1.store.stats(), m = F1.store.mgr();
    const tile = (cls, icon, label, value, sub, action) => `<div class="yw-t ${cls}"><span class="yw-ic">${icon}</span><div class="yw-b"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>${action || ''}</div>`;
    const bonus = F1.store.canClaimSeason(s) && s.doneCount === 0 ? { act: 'claim-season', v: F1.store.SEASON_BONUS, l: `Prime de lancement ${s.year}` }
      : F1.store.canClaim(s, nx) ? { act: 'claim', v: F1.store.WEEKLY, l: 'Prime du week-end' } : F1.store.canRescue(s, nx) ? { act: 'rescue', v: F1.store.RESCUE, l: 'Ravitaillement' } : null;
    const wallet = tile(bonus ? 'hot' : '', coin, 'Mes jetons', fmtJ(p.balance), bonus ? `${bonus.l} : +${fmt(bonus.v)}` : `${st.profit >= 0 ? '+' : ''}${fmtJ(st.profit)} de bénéfice`, bonus ? `<button class="btn sm gold" data-action="${bonus.act}">Récupérer</button>` : '');
    const bets = tile('', '🎟️', 'Paris en cours', st.open, st.open ? `${fmtJ(st.openStake)} jetons engagés` : 'Aucun pari pour ce Grand Prix', `<a class="yw-go" href="#/${st.open ? 'mes-paris' : 'paris'}">${st.open ? 'Voir' : 'Parier'}</a>`);
    const lp = localPicks(), y = s.year, has = (k) => { const e = lp[pkKey(y, nx.round, k)]; return e && e.p && e.p.every(Boolean); };
    const nPick = (has('quali') ? 1 : 0) + (has('race') ? 1 : 0);
    const picks = tile(nPick < 2 ? 'todo' : '', '🏆', 'Pronostic de ligue', `${nPick} sur 2`, nPick === 2 ? 'Qualifications et course remplies' : nPick ? 'Il reste un podium à pronostiquer' : 'Qualifications et course à pronostiquer', `<a class="yw-go" href="#/ligues">${nPick === 2 ? 'Modifier' : 'Pronostiquer'}</a>`);
    let mgr;
    if (!m.driver || !m.chassis) mgr = tile('', F1_ICON, 'F1 Manager', 'Écurie à monter', 'Recrutez un pilote et choisissez une équipe', '<a class="yw-go" href="#/manager">Commencer</a>');
    else {
      const ready = F1.store.tunnel().jobs.filter((j) => j.end <= Date.now()).length, left = F1.store.racesLeft();
      mgr = tile(ready || left ? 'todo' : '', F1_ICON, 'F1 Manager', `${left} course${left > 1 ? 's' : ''} gratuite${left > 1 ? 's' : ''}`, ready ? `${ready} pièce${ready > 1 ? 's' : ''} prête${ready > 1 ? 's' : ''} à installer` : `Ligue ${esc(MG().leagueOf(m.lp).name)}, ${fmt(m.lp)} LP`, '<a class="yw-go" href="#/manager">Ouvrir</a>');
    }
    // Carrière : lue directement dans sa sauvegarde (le mode actif reste le classique sur l'accueil)
    const cr = F1.store.get().career, crC = cr && cr.cal, N = s.races.length;
    const crPos = crC ? F1.store.careerStandings().findIndex((x) => x.id === 'me') + 1 : 0;
    const crr = !cr || !cr.driver || !cr.chassis ? tile('crr', CUP_ICO, 'Carrière', 'Une saison, GP par GP', '3 courses par Grand Prix, un championnat', '<a class="yw-go" href="#/carriere">Commencer</a>')
      : tile('crr', CUP_ICO, `Carrière · saison ${crC.season}`, crC.over ? 'Saison terminée' : `GP ${crC.gp + 1} sur ${N}`, crC.over ? 'Lancez la saison suivante' : `Course ${crC.run + 1} sur ${F1.store.RUNS_PER_GP} · ${crPos ? 'P' + crPos + ' au championnat' : 'championnat à lancer'}`, '<a class="yw-go" href="#/carriere">Continuer</a>');
    return `<section class="yw" aria-label="Ton week-end">${wallet}${bets}${picks}${mgr}${crr}</section>`;
  }

  function hero(nx) {
    const s = S.season;
    if (!nx) {
      const champ = [...s.drivers.values()].sort((a, b) => b.points - a.points)[0];
      return `<section class="hero"><div class="hero-bg">${streaks()}<div class="grid-floor"></div><div class="big-round">${s.year}</div><div class="kerb"></div></div>
        <div class="hero-top"><span class="chip gold">Saison ${s.year} terminée</span></div>
        <h1><span class="accent">Champion du monde</span>${champ ? esc(champ.given + ' ' + champ.family) : '—'}</h1>
        <div class="hero-meta"><span>${champ ? fmt(champ.points) + ' points · ' + esc(team(champ.teamId).short) : ''}</span></div>
        <div class="hero-actions"><a class="btn" href="#/classements">Voir les classements</a><a class="btn ghost" href="#/mes-paris">Mon bilan</a></div></section>`;
    }
    const now = Date.now();
    const nextSess = nx.sessions.find((x) => x.date.getTime() > now);
    const w = S.weather;
    const wIcon = w ? (w.rain >= 50 ? '🌧️' : w.rain >= 25 ? '🌦️' : w.code <= 1 ? '☀️' : '⛅') : '';
    const favW = S.markets.find((m) => m.kind === 'win'), favD = favW && favW.selections[0] && drv(favW.selections[0].driverId);
    const heroTc = favD ? team(favD.teamId).color : 'var(--red)';
    return `<section class="hero hero-dark" style="--tc:${heroTc}"><div class="hero-bg">${streaks()}<div class="grid-floor"></div><div class="big-round">R${nx.round}</div><div class="kerb"></div></div>
      <div class="hero-main"><div class="hero-top">${flag(nx.iso, 'lg')}<span class="chip red live">Prochain Grand Prix</span><span class="chip">Manche ${nx.round} / ${s.races.length}</span>${nx.sprint ? '<span class="chip gold">Week-end sprint</span>' : ''}${nx.street ? '<span class="chip">Circuit urbain</span>' : ''}${nx.round === 1 ? `<span class="chip green">🚦 Ouverture de la saison ${s.year}</span>` : ''}${nx.tbc ? '<span class="chip">À confirmer</span>' : ''}</div>
      <h1><span class="accent">${esc(nx.countryFr)}</span>${esc(nx.nameFr)}</h1>
      <div class="hero-meta"><span>${esc(nx.circuit)}, ${esc(nx.locality)}</span><span>${DAYL.format(nx.date)} à ${HM.format(nx.date)}</span>
      ${w ? `<span class="weather" title="Prévision Open-Meteo à l'heure du départ">${wIcon} ${w.temp}°C · 💧 ${w.rain} % · 💨 ${w.wind} km/h</span>` : ''}</div>
      ${countdown(nx.date.getTime())}
      <div class="weekend">${nx.sessions.map((x) => `<div class="sess ${x.date.getTime() < now ? 'done' : x === nextSess ? 'next' : ''}"><small>${esc(x.label)}</small><b>${WD.format(x.date)} ${HM.format(x.date)}</b></div>`).join('')}</div>
      <div class="hero-actions"><a class="btn" href="#/paris">Parier sur ce Grand Prix</a><a class="btn ghost" href="#/paris/tierce">Jouer le tiercé</a></div></div>${heroCar()}</section>`;
  }
  function heroCar() {
    const w = S.markets.find((m) => m.kind === 'win');
    const fav = w && w.selections[0] && drv(w.selections[0].driverId);
    if (!fav) return '';
    const t = team(fav.teamId);
    return `<div class="hero-stage" style="--tc:${t.color}"><div class="stage-glow"></div>${F1.visuals.car(fav.teamId, { live: true, number: fav.number })}
      <div class="stage-cap"><span class="tstripe" style="background:${t.color}"></span><div><small>Favori du week-end</small><b>${esc(fav.family)} · ${esc(t.short)}</b></div><span class="stage-hint">⟲ Faites pivoter</span></div></div>`;
  }
  function streaks() {
    let h = '';
    for (let i = 0; i < 9; i++) h += `<span class="streak" style="top:${8 + i * 10}%;width:${120 + (i * 53) % 220}px;animation-duration:${1.6 + (i * 0.37) % 1.8}s;animation-delay:${(i * 0.61) % 3}s"></span>`;
    return h;
  }
  function favCard(x, m, i) {
    const d = drv(x.driverId); const t = team(d.teamId);
    return `<div class="fav" style="--tc:${t.color}">${F1.visuals.portrait(d.id) ? `<img class="fav-photo" src="${esc(F1.visuals.portrait(d.id).img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<div style="position:relative"><div class="fav-numrow">${d.number ? `<span class="fav-num">${F1.num.html(d.number, d.teamId, { color: 'currentColor' })}</span>` : ''}<span class="rank">Favori n°${i + 1}</span></div><div class="fname">${flag(d.iso, 'sm')} ${esc(d.model || d.given)}</div><div class="lname">${esc(d.family)}</div><div class="team">${d.crewTxt ? esc(d.crewTxt) : esc(t.short)} · ${fmt(d.points)} pts</div></div>
      <div>${oddBtn(x, m, { label: `<span>Victoire</span><span class="prob">${pct(x.prob)}</span>` })}</div></div>`;
  }
  function lastPodium() {
    const r = S.season.lastDone;
    if (!r) return `<div class="card"><h3>Dernier Grand Prix</h3><div class="empty"><div class="ic">🏁</div>Aucune course disputée pour l'instant.</div></div>`;
    const top = r.results.slice(0, 3);
    const step = (x, p) => { if (!x) return '<div></div>'; const d = drv(x.driverId); return `<div class="pod-step p${p}" style="--tc:${tcol(x.teamId)};--mc:${['var(--gold)', 'var(--silver)', 'var(--bronze)'][p - 1]}">${ava(d.id, 'lg')}<div class="who">${flag(d.iso, 'sm')} ${esc(d.family)}${dnumOf(d.id)}</div><div class="tm">${esc(team(x.teamId).short)}</div><div class="blk">${p}</div></div>`; };
    return `<a class="card" href="#/gp/${r.round}"><div class="market-h"><div><h3>${flag(r.iso, 'sm')} ${esc(r.nameFr)}</h3><div class="sub">Dernier Grand Prix · ${DAY.format(r.date)}</div></div><span class="chip">Résultats →</span></div>
      <div class="podium">${step(top[1], 2)}${step(top[0], 1)}${step(top[2], 3)}</div></a>`;
  }
  function miniStandings() {
    const ds = [...S.season.drivers.values()].filter((d) => S.season.entrants.includes(d.id) || d.points > 0).sort((a, b) => b.points - a.points).slice(0, 6);
    const max = ds[0] ? ds[0].points || 1 : 1;
    return `<a class="card" href="#/classements"><div class="market-h"><div><h3>Championnat pilotes</h3><div class="sub">Après ${S.season.doneCount} manche${S.season.doneCount > 1 ? 's' : ''}</div></div><span class="chip">Complet →</span></div>
      <table class="tbl" style="margin-top:10px"><tbody>${ds.map((d, i) => `<tr><td class="pos">${i + 1}</td><td>${drvCell(d.id)}</td><td style="width:35%"><div class="ptsbar"><i style="width:${(d.points / max) * 100}%;background:${tcol(d.teamId)}"></i></div></td><td class="r num"><b>${fmt(d.points)}</b></td></tr>`).join('')}</tbody></table></a>`;
  }
  /* ---------- Circuit en fond de page : la F1 du favori enchaîne les virages en glisse au fil du défilement ---------- */

  function upcomingTeaser() {
    const up = S.season.upcoming;
    if (!up || !up.races.length) return '';
    const first = up.races[0], last = up.races.at(-1);
    const nSprint = up.races.filter((r) => r.sprint).length;
    const news = up.races.filter((r) => !S.season.races.some((x) => x.circuitId === r.circuitId));
    const wdc = S.upMarkets.find((m) => m.kind === 'wdc');
    return `<section class="section"><div class="section-h"><h2>Saison ${up.year}</h2><a class="link" href="#/calendrier/${up.year}">Calendrier ${up.year} →</a></div>
      <div class="grid g2"><div class="hero" style="min-height:0;padding:28px"><div class="hero-bg">${streaks()}<div class="big-round" style="font-size:200px;top:-30px">${up.year}</div><div class="kerb"></div></div>
        <div class="hero-top">${flag(first.iso)}<span class="chip red">Ouverture</span><span class="chip">${up.races.length} GP</span><span class="chip gold">⚡ ${nSprint} Sprints</span></div>
        <h1 style="font-size:clamp(26px,3.4vw,40px)"><span class="accent">${DAYL.format(first.date)}</span>${esc(first.nameFr)}</h1>
        <div class="hero-meta"><span>🏁 Finale : ${esc(last.nameFr)} · ${DAY.format(last.date)}</span></div>
        ${news.length ? `<div class="weekend">${news.map((r) => `<div class="sess next"><small>Retour${r.tbc ? ' · à confirmer' : ''}</small><b>${flag(r.iso, 'sm')} ${esc(r.countryFr)}</b></div>`).join('')}</div>` : ''}
        ${countdown(first.date.getTime())}</div>
        ${wdc ? marketCard(wdc, { limit: 6 }) : ''}</div></section>`;
  }
  function homeStats() {
    const st = F1.store.stats(); const p = F1.store.get();
    return `<section class="section"><div class="section-h"><h2>Votre saison${p.name ? ' — ' + esc(p.name) : ''}</h2><a class="link" href="#/mes-paris">Mes paris →</a></div>
      <div class="grid g4"><div class="stat"><small>Solde</small><b>${coin}${fmtJ(p.balance)}</b></div><div class="stat"><small>Bénéfice</small><b class="${st.profit >= 0 ? 'pos' : 'neg'}">${st.profit >= 0 ? '+' : ''}${fmtJ(st.profit)}</b></div>
      <div class="stat"><small>Réussite</small><b>${st.done ? pct(st.rate) : '—'}</b></div><div class="stat"><small>Paris en cours</small><b>${st.open}</b></div></div></section>`;
  }

  /* =================== Paris =================== */
  const TABS = [
    ['populaires', 'Populaires'], ['pilotes', 'Pilotes'], ['duels', 'Duels'], ['ecuries', 'Écuries'],
    ['speciaux', 'Spéciaux'], ['tierce', 'Tiercé'], ['saison', 'Saison'],
  ];
  function pageBets(tab) {
    const s = S.season, nx = s.next, M = S.markets;
    const by = (k) => M.filter((m) => m.kind === k && m.layout !== 'boost');
    const counts = { populaires: '', pilotes: M.filter((m) => m.layout === 'drivers').length, duels: by('h2h').length, ecuries: M.filter((m) => m.group === 'teams').length, speciaux: M.filter((m) => m.group === 'specials').length, tierce: '', saison: S.seasonMarkets.length + S.upMarkets.length };
    let h = `<div class="market-head"><div><div class="row" style="margin-bottom:8px">${nx ? `<span class="chip red live">Manche ${nx.round}</span>${nx.sprint ? '<span class="chip gold">⚡ Sprint</span>' : ''}${nx.qualifying ? '<span class="chip green">Grille connue</span>' : ''}` : '<span class="chip">Saison</span>'}</div>
      <h1>${nx ? flag(nx.iso, 'lg') + esc(nx.nameFr) : 'Marchés de saison'}</h1>${nx ? `<div class="muted" style="margin-top:6px">${esc(nx.circuit)} · départ ${DTF.format(nx.date)}</div>` : ''}</div>
      ${nx ? `<div><div class="muted upper" style="font-size:11px;font-weight:700;text-align:right">Départ dans</div>${countdown(nx.date.getTime())}</div>` : ''}</div>`;
    h += `<div class="tabs">${TABS.map(([k, l]) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/paris/${k}">${l}${counts[k] ? `<span class="cnt">${counts[k]}</span>` : ''}</a>`).join('')}</div>`;
    if (!nx && tab !== 'saison') return h + `<div class="empty"><div class="ic">🏆</div>Aucun Grand Prix à venir. Rendez-vous la saison prochaine !</div>`;
    h += '<div class="section" style="margin-top:20px">';
    switch (tab) {
      case 'pilotes': h += driverMatrix() + `<div class="grid g2" style="margin-top:16px">${['podium', 'top6', 'points', 'fastest', 'dnf'].map((k) => marketCard(by(k)[0], { limit: 8 })).join('')}</div>`; break;
      case 'duels': h += `<div class="notice" style="margin-bottom:16px">⚔️ Un pilote qui ne prend pas le départ annule le duel (mise remboursée). En cas d'abandon des deux, c'est le classement officiel qui départage.</div><div class="grid g2">${by('h2h').map(h2hCard).join('')}</div>`; break;
      case 'ecuries': h += `<div class="grid g2">${M.filter((m) => m.group === 'teams').map((m) => marketCard(m, { limit: 11 })).join('')}</div>`; break;
      case 'speciaux': h += `<div class="grid g2">${M.filter((m) => m.group === 'specials').map((m) => marketCard(m)).join('')}</div>`; break;
      case 'tierce': h += tiercePanel(); break;
      case 'saison': h += (S.upMarkets.length ? `<div class="section-h"><h2>Saison ${S.season.upcoming.year} — paris long terme</h2><a class="link" href="#/calendrier/${S.season.upcoming.year}">Calendrier</a></div><div class="notice" style="margin-bottom:16px">🔮 Cotes d'avant-saison basées sur la hiérarchie ${S.season.year} et la grille ${S.season.upcoming.year} (provisoire). Paris réglés après la dernière manche ${S.season.upcoming.year}.</div><div class="grid g2" style="margin-bottom:28px">${S.upMarkets.map((m) => marketCard(m)).join('')}</div><div class="section-h"><h2>Saison ${S.season.year}</h2></div>` : '') + (S.seasonMarkets.length ? `<div class="notice" style="margin-bottom:16px">🔮 Cotes issues de ${fmt(6000)} simulations de la fin de saison. Paris réglés après la dernière manche.</div><div class="grid g2">${S.seasonMarkets.map((m) => marketCard(m)).join('')}</div>` : '<div class="empty">Titres déjà attribués.</div>'); break;
      default: {
        const win = by('win')[0];
        const boost = M.find((m) => m.layout === 'boost');
        const pole = by('pole')[0], sprint = by('sprintWin')[0];
        h += `<div class="grid g2">${marketCard(win)}<div class="grid" style="align-content:start">${boost ? boostCard(boost) : ''}${pole ? marketCard(pole, { limit: 6 }) : ''}${sprint ? marketCard(sprint, { limit: 6 }) : ''}${marketCard(by('teamWin')[0], { limit: 6 })}</div></div>
          <div class="section-h" style="margin-top:28px"><h2>Duels phares</h2><a class="link" href="#/paris/duels">Tous les duels</a></div><div class="grid g3">${by('h2h').filter((m) => m.h2hType === 'rival').slice(0, 3).map(h2hCard).join('')}</div>
          <div class="section-h" style="margin-top:28px"><h2>Spéciaux</h2><a class="link" href="#/paris/speciaux">Tous les marchés spéciaux</a></div><div class="grid g3">${M.filter((m) => m.group === 'specials').slice(1, 4).map((m) => marketCard(m)).join('')}</div>`;
      }
    }
    return h + '</div>';
  }

  function driverMatrix() {
    const cols = [['win', 'Victoire'], ['podium', 'Podium'], ['top6', 'Top 6'], ['points', 'Points'], ['fastest', 'Meilleur tour'], ['pole', 'Pole'], ['dnf', 'Abandon']]
      .map(([k, l]) => [S.markets.find((m) => m.kind === (k === 'pole' ? 'pole' : k) && m.layout === 'drivers'), l]).filter(([m]) => m);
    const q = S.season.next.qualifying ? new Map(S.season.next.qualifying.map((x) => [x.driverId, x.pos])) : null;
    const rows = S.sim.drivers.slice().sort((a, b) => b.p.win - a.p.win);
    return `<div class="card pad0"><div style="padding:18px 18px 6px"><h3>Matrice des cotes pilotes</h3><div class="sub">Tous les marchés individuels en un coup d'œil${q ? ' · grille de départ officielle prise en compte' : ''}</div></div>
      <div class="table-wrap"><table class="tbl matrix"><thead><tr><th>#</th><th>Pilote</th>${q ? '<th class="c">Grille</th>' : ''}${cols.map(([, l]) => `<th class="c">${l}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((d, i) => `<tr><td class="pos">${i + 1}</td><td>${drvCell(d.id)}</td>${q ? `<td class="c num"><b>${q.get(d.id) || '—'}</b></td>` : ''}${cols.map(([m]) => { const x = m.selections.find((y) => y.driverId === d.id); return `<td>${x ? oddBtn(x, m, { compact: true }) : ''}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
  }

  function tiercePanel() {
    const nx = S.season.next;
    const T = S.tierce.map((id) => (id && S.sim.idx.has(id) ? id : null));
    S.tierce = T;
    const slots = T.map((id, i) => {
      if (!id) return `<div class="tslot"><div class="pp">P${i + 1}</div><div class="muted" style="font-size:13px">Choisissez un pilote</div></div>`;
      const d = drv(id);
      return `<button class="tslot filled" style="--tc:${tcol(d.teamId)}" data-action="tierce-clear" data-i="${i}" title="Retirer"><div class="pp">P${i + 1}</div>${ava(d.id, 'md')}<div class="nn">${esc(d.family)}${dnumOf(d.id)}</div><div class="muted" style="font-size:12px">${esc(team(d.teamId).short)} ✕</div></button>`;
    }).join('');
    let res = '';
    if (T.every(Boolean)) {
      const closes = nx.date;
      const mo = { closes, id: 'tierce' };
      const so = F1.markets.tierce(S.season, nx, S.sim, T[0], T[1], T[2], true);
      const sd = F1.markets.tierce(S.season, nx, S.sim, T[0], T[1], T[2], false);
      res = `<div class="grid g2" style="margin-top:6px">${oddBtn(so, mo, { label: '🥇 Dans l\'ordre exact' })}${oddBtn(sd, mo, { label: '🔀 Dans le désordre' })}</div>`;
    }
    const sorted = S.sim.drivers.slice().sort((a, b) => b.p.podium - a.p.podium);
    return `<div class="grid g2"><div class="card"><h3>🏆 Composez votre tiercé</h3><div class="sub">Désignez le podium du ${esc(nx.nameFr)}. Cotes calculées avec la formule de Harville à partir des probabilités de victoire.</div>
      <div class="tierce-slots">${slots}</div>${res}${T.some(Boolean) ? '<button class="more" data-action="tierce-reset">↺ Recommencer</button>' : ''}</div>
      <div class="card"><h3>Pilotes</h3><div class="sub">Classés par probabilité de podium</div><div class="pick-grid" style="margin-top:14px">
      ${sorted.map((d) => { const x = drv(d.id); return `<button class="pick ${T.includes(d.id) ? 'used' : ''}" data-action="tierce-pick" data-d="${esc(d.id)}">${ava(d.id)}<span>${esc(x.code)}<small>${pct(d.p.podium)}</small></span></button>`; }).join('')}
      </div></div></div>`;
  }

  /* =================== Calendrier =================== */
  function pageCalendar(yr) {
    const base = S.season;
    const years = [base.prev, base, base.upcoming].filter((x) => x && x.races.length);
    const s = years.find((x) => x.year === yr) || base;
    const cards = s.races.map((r) => {
      const isNext = s.next && s.next.round === r.round;
      const first = r.sessions[0] ? r.sessions[0].date : r.date;
      const range = first && r.date ? (first.getMonth() === r.date.getMonth() ? `${first.getDate()} – ${DAY.format(r.date)}` : `${DAY.format(first)} – ${DAY.format(r.date)}`) : '';
      let foot;
      if (r.results) { const w = r.results[0]; const d = drv(w.driverId); foot = `<span class="winner"><span class="tstripe" style="background:${tcol(w.teamId)}"></span>🏆 ${esc(d ? d.family : w.driverId)}</span><span class="chip">Résultats</span>`; }
      else if (isNext && s === base) foot = `<span class="chip red live">Prochain GP</span><span class="chip gold">Paris ouverts</span>`;
      else if (r.date && r.date < Date.now()) foot = `<span class="chip">En attente des résultats</span>`;
      else foot = `<span class="muted" style="font-size:13px">${r.date ? DAYL.format(r.date) : ''}</span>`;
      const isN = isNext && s === base;
      return `<a class="race-card ${isN ? 'next' : r.results ? 'past' : ''}" href="${isN ? '#/paris' : s === base ? '#/gp/' + r.round : '#/calendrier/' + s.year}"><div class="rn">${String(r.round).padStart(2, '0')}</div>
        <div class="row">${flag(r.iso)}<span class="rdate">${range}</span>${r.sprint ? '<span class="chip gold">Sprint</span>' : ''}${r.tbc ? '<span class="chip">À confirmer</span>' : ''}</div>
        <div class="rname">${esc(r.nameFr)}</div><div class="rdate">${esc(r.circuit)}</div><div class="rfoot">${foot}</div></a>`;
    }).join('');
    const done = s.doneCount, tot = s.races.length;
    return `<div class="market-head"><div><h1>Calendrier ${s.year}</h1><div class="muted" style="margin-top:6px">${tot} Grands Prix · ${done} disputé${done > 1 ? 's' : ''} · ${s.races.filter((r) => r.sprint).length} week-ends Sprint${(s.source === 'fallback' || s.source === 'embedded') && !done ? ' · horaires estimés en attendant la publication officielle' : ''}</div>
      ${years.length > 1 ? `<div class="seg" style="margin-top:12px">${years.map((x) => `<a href="#/calendrier/${x.year}" style="padding:6px 14px;border-radius:8px;font-weight:700;font-size:13px" class="${x === s ? 'on' : ''}">${x.year}</a>`).join('')}</div>` : ''}</div>
      <div style="min-width:240px"><div class="row" style="justify-content:space-between;font-size:13px"><span class="muted">Progression de la saison</span><b>${Math.round((done / Math.max(tot, 1)) * 100)} %</b></div><div class="ptsbar" style="margin-top:6px;height:8px"><i style="width:${(done / Math.max(tot, 1)) * 100}%;background:linear-gradient(90deg,var(--red),var(--red2))"></i></div></div></div>
      <div class="cal">${cards}</div>`;
  }

  /* =================== Classements =================== */
  function seasonStats() {
    const st = {};
    const g = (id) => (st[id] = st[id] || { wins: 0, podiums: 0, poles: 0, fl: 0, dnf: 0, starts: 0, best: 99 });
    for (const r of S.season.races) {
      if (!r.results) continue;
      for (const x of r.results) {
        const o = g(x.driverId); o.starts++;
        if (x.classified && x.pos === 1) o.wins++;
        if (x.classified && x.pos <= 3) o.podiums++;
        if (x.grid === 1) o.poles++;
        if (x.fastestRank === 1) o.fl++;
        if (!x.classified) o.dnf++;
        if (x.classified) o.best = Math.min(o.best, x.pos);
      }
    }
    return st;
  }
  function pageStandings() {
    const s = S.season;
    const tab = S.standTab;
    const st = seasonStats();
    let table;
    if (tab === 'drivers') {
      const ds = [...s.drivers.values()].filter((d) => s.entrants.includes(d.id) || d.points > 0).sort((a, b) => b.points - a.points || a.position - b.position);
      const max = ds[0] ? ds[0].points || 1 : 1;
      const champ = S.seasonSim ? new Map(S.seasonSim.drivers.map((x) => [x.id, x.p])) : new Map();
      table = `<table class="tbl"><thead><tr><th>Pos</th><th>Pilote</th><th class="c">Victoires</th><th class="c">Podiums</th><th class="c">Poles</th><th class="c">Meill. tours</th><th class="c">Abandons</th><th>Points</th><th class="r">Écart</th><th class="r">Titre</th></tr></thead><tbody>
        ${ds.map((d, i) => { const o = st[d.id] || {}; return `<tr><td class="pos">${i + 1}</td><td>${drvCell(d.id)}</td><td class="c num">${o.wins || 0}</td><td class="c num">${o.podiums || 0}</td><td class="c num">${o.poles || 0}</td><td class="c num">${o.fl || 0}</td><td class="c num">${o.dnf || 0}</td>
          <td style="min-width:150px"><div class="row" style="flex-wrap:nowrap"><div class="ptsbar" style="flex:1"><i style="width:${(d.points / max) * 100}%;background:${tcol(d.teamId)}"></i></div><b class="num">${fmt(d.points)}</b></div></td><td class="r num muted">${i ? '−' + fmt(max - d.points) : '—'}</td><td class="r num">${champ.get(d.id) > 0 && !s.finished ? `<span class="chip ${champ.get(d.id) > 0.3 ? 'gold' : ''}">${pct(champ.get(d.id))}</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table>`;
    } else {
      const ts = [...s.teams.values()].filter((t) => s.entrants.some((id) => drv(id).teamId === t.id) || t.points > 0).sort((a, b) => b.points - a.points);
      const max = ts[0] ? ts[0].points || 1 : 1;
      const champ = S.seasonSim ? new Map(S.seasonSim.teams.map((x) => [x.id, x.p])) : new Map();
      table = `<table class="tbl"><thead><tr><th>Pos</th><th>Pilote</th><th>Pilotes</th><th class="c">Victoires</th><th>Points</th><th class="r">Écart</th><th class="r">Titre</th></tr></thead><tbody>
        ${ts.map((t, i) => { const dl = s.entrants.filter((id) => drv(id).teamId === t.id).map((id) => drv(id).code).join(' · '); const wins = Object.entries(st).filter(([id]) => drv(id) && drv(id).teamId === t.id).reduce((a, [, o]) => a + o.wins, 0);
          return `<tr><td class="pos">${i + 1}</td><td>${teamCell(t.id)}</td><td class="muted">${esc(dl)}</td><td class="c num">${t.wins || wins}</td><td style="min-width:180px"><div class="row" style="flex-wrap:nowrap"><div class="ptsbar" style="flex:1"><i style="width:${(t.points / max) * 100}%;background:${t.color}"></i></div><b class="num">${fmt(t.points)}</b></div></td><td class="r num muted">${i ? '−' + fmt(max - t.points) : '—'}</td><td class="r">${champ.get(t.id) > 0 && !s.finished ? `<span class="chip ${champ.get(t.id) > 0.3 ? 'gold' : ''}">${pct(champ.get(t.id))}</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table>`;
    }
    return `<div class="market-head"><div><h1>Classements ${s.year}</h1><div class="muted" style="margin-top:6px">Après ${s.doneCount} manche${s.doneCount > 1 ? 's' : ''} · probabilité de titre simulée</div></div>
      <div class="row"><div class="seg"><button class="${tab === 'drivers' ? 'on' : ''}" data-action="stand" data-t="drivers">Pilotes</button><button class="${tab === 'teams' ? 'on' : ''}" data-action="stand" data-t="teams">Constructeurs</button></div></div></div>
      <div class="card pad0"><div class="table-wrap">${table}</div></div>
      <section class="section"><div class="section-h"><h2>Évolution du championnat</h2><span class="muted" style="font-size:13px">Survolez le graphique · cliquez la légende pour masquer</span></div><div class="card"><div class="chart-wrap" id="chartWrap"></div><div class="legend" id="legend"></div></div></section>`;
  }

  function mountChart() {
    const wrap = $('#chartWrap'); if (!wrap) return;
    const s = S.season;
    const rounds = s.races.filter((r) => r.results);
    if (!rounds.length) { wrap.innerHTML = '<div class="empty">Le graphique apparaîtra après le premier Grand Prix.</div>'; return; }
    const isD = S.standTab === 'drivers';
    const series = new Map();
    const keyOf = (x) => (isD ? x.driverId : x.teamId);
    rounds.forEach((r, i) => {
      for (const x of r.results.concat(r.sprintResults || [])) {
        const k = keyOf(x);
        if (!series.has(k)) series.set(k, new Array(rounds.length + 1).fill(0));
        series.get(k)[i + 1] += x.points;
      }
    });
    for (const arr of series.values()) for (let i = 1; i < arr.length; i++) arr[i] += arr[i - 1];
    let keys = [...series.keys()].sort((a, b) => series.get(b).at(-1) - series.get(a).at(-1)).slice(0, isD ? 8 : 11);
    const W = 1000, H = 380, L = 44, R = 70, T = 14, B = 30;
    const maxY = Math.max(10, ...keys.map((k) => series.get(k).at(-1)));
    const niceMax = Math.ceil(maxY / 50) * 50;
    const x = (i) => L + (i / rounds.length) * (W - L - R);
    const y = (v) => T + (1 - v / niceMax) * (H - T - B);
    const seenTeam = {};
    let g = '';
    for (let v = 0; v <= niceMax; v += niceMax / 5) g += `<line class="gridl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
    rounds.forEach((r, i) => { if (rounds.length < 14 || i % 2 === 0) g += `<text x="${x(i + 1)}" y="${H - 8}" text-anchor="middle">${r.iso ? r.iso.toUpperCase() : r.round}</text>`; });
    const lines = keys.map((k) => {
      const arr = series.get(k);
      const color = isD ? tcol(drv(k) ? drv(k).teamId : '') : tcol(k);
      const tId = isD && drv(k) ? drv(k).teamId : k;
      const dash = isD && seenTeam[tId] ? 'dash' : ''; seenTeam[tId] = 1;
      const pts = arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const name = isD ? (drv(k) ? drv(k).code : k) : team(k).short;
      const off = S.chartHidden.has(k);
      return { k, color, name, svg: `<g data-k="${esc(k)}" style="${off ? 'display:none' : ''}"><polyline class="ln ${dash}" stroke="${color}" points="${pts}"/><circle cx="${x(arr.length - 1)}" cy="${y(arr.at(-1))}" r="4" fill="${color}"/><text x="${x(arr.length - 1) + 8}" y="${y(arr.at(-1)) + 4}" style="fill:${color};font-weight:700">${esc(name)}</text></g>` };
    });
    wrap.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}${lines.map((l) => l.svg).join('')}<line id="hov" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="rgba(255,255,255,.3)" stroke-dasharray="3 3" style="display:none"/><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hovRect"/></svg><div class="chart-tip" id="tip"></div>`;
    $('#legend').innerHTML = lines.map((l) => `<span data-action="chart-toggle" data-k="${esc(l.k)}" class="${S.chartHidden.has(l.k) ? 'off' : ''}"><i style="background:${l.color}"></i>${esc(l.name)}</span>`).join('');
    const svg = $('svg', wrap), tip = $('#tip'), hov = $('#hov');
    const onMove = (ev) => {
      const rect = svg.getBoundingClientRect();
      const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) * (W / rect.width);
      const i = Math.max(1, Math.min(rounds.length, Math.round(((cx - L) / (W - L - R)) * rounds.length)));
      hov.setAttribute('x1', x(i)); hov.setAttribute('x2', x(i)); hov.style.display = '';
      const rows = lines.filter((l) => !S.chartHidden.has(l.k)).map((l) => ({ ...l, v: series.get(l.k)[i] })).sort((a, b) => b.v - a.v);
      tip.innerHTML = `<b>${esc(rounds[i - 1].nameFr)}</b>${rows.map((r) => `<div class="row"><span style="color:${r.color}">● ${esc(r.name)}</span><b class="num">${fmt(r.v)}</b></div>`).join('')}`;
      tip.style.opacity = 1;
      const px = (x(i) / W) * rect.width;
      tip.style.left = Math.min(px + 14, rect.width - 170) + 'px';
      tip.style.top = '10px';
    };
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('touchmove', onMove, { passive: true });
    svg.addEventListener('mouseleave', () => { tip.style.opacity = 0; hov.style.display = 'none'; });
  }

  /* =================== Page Grand Prix =================== */
  function pageGP(round) {
    const s = S.season;
    const r = s.races.find((x) => x.round === round);
    if (!r) return '<div class="empty"><div class="ic">🤷</div>Grand Prix introuvable.</div>';
    const head = `<div class="market-head"><div><div class="row" style="margin-bottom:8px"><a class="chip" href="#/calendrier">← Calendrier</a><span class="chip">Manche ${r.round}</span>${r.sprint ? '<span class="chip gold">Sprint</span>' : ''}</div>
      <h1>${flag(r.iso, 'lg')}${esc(r.nameFr)}</h1><div class="muted" style="margin-top:6px">${esc(r.circuit)} · ${esc(r.locality)}, ${esc(r.countryFr)} · ${r.date ? DAYL.format(r.date) : ''}</div></div></div>`;
    if (!r.results) {
      const isNext = s.next && s.next.round === r.round;
      return head + `<div class="card"><h3>Programme du week-end</h3><div class="weekend">${r.sessions.map((x) => `<div class="sess"><small>${esc(x.label)}</small><b>${DTF.format(x.date)}</b></div>`).join('')}</div>
        ${isNext ? '<div class="hero-actions"><a class="btn" href="#/paris">Parier sur ce GP</a></div>' : `<p class="muted" style="margin-top:18px">${r.date < Date.now() ? 'Résultats pas encore publiés.' : 'Les paris ouvriront quand ce Grand Prix sera le prochain au calendrier.'}</p>`}</div>`;
    }
    const tab = S.gpTab;
    const tabs = `<div class="seg" style="margin-bottom:16px"><button class="${tab === 'race' ? 'on' : ''}" data-action="gptab" data-t="race">Course</button>${r.sprintResults ? `<button class="${tab === 'sprint' ? 'on' : ''}" data-action="gptab" data-t="sprint">Sprint</button>` : ''}<button class="${tab === 'quali' ? 'on' : ''}" data-action="gptab" data-t="quali">Qualifications</button></div>`;
    const top = r.results.slice(0, 3);
    const step = (x, p) => { if (!x) return '<div></div>'; const d = drv(x.driverId); return `<div class="pod-step p${p}" style="--tc:${tcol(x.teamId)};--mc:${['var(--gold)', 'var(--silver)', 'var(--bronze)'][p - 1]}">${ava(d.id, 'lg')}<div class="who">${flag(d.iso, 'sm')} ${esc(d.family)}${dnumOf(d.id)}</div><div class="tm">${esc(team(x.teamId).short)}</div><div class="blk">${p}</div></div>`; };
    const fl = r.results.find((x) => x.fastestRank === 1);
    const gainer = r.results.filter((x) => x.classified && x.grid > 0).sort((a, b) => (b.grid - b.pos) - (a.grid - a.pos))[0];
    const dnfs = r.results.filter((x) => !x.classified);
    const side = `<div class="grid" style="align-content:start"><div class="card"><h3>Podium</h3><div class="podium">${step(top[1], 2)}${step(top[0], 1)}${step(top[2], 3)}</div></div>
      <div class="grid g2">${fl ? `<div class="stat"><small>Meilleur tour</small><b style="font-size:18px">${dnumOf(fl.driverId, 'pre')}${esc(drv(fl.driverId).family)}</b><span class="muted num">${esc(fl.fastestTime || '')}</span></div>` : ''}
      ${gainer ? `<div class="stat"><small>Remontada</small><b style="font-size:18px">${dnumOf(gainer.driverId, 'pre')}${esc(drv(gainer.driverId).family)}</b><span class="gain up">P${gainer.grid} → P${gainer.pos} (+${gainer.grid - gainer.pos})</span></div>` : ''}
      <div class="stat"><small>Classés</small><b>${r.results.length - dnfs.length} / ${r.results.length}</b></div><div class="stat"><small>Abandons</small><b>${dnfs.length}</b></div></div></div>`;
    let table;
    if (tab === 'quali') {
      if (!r.qualifying) table = '<div class="skeleton"></div>';
      else table = `<table class="tbl"><thead><tr><th>Pos</th><th>Pilote</th><th>Q1</th><th>Q2</th><th>Q3</th></tr></thead><tbody>${r.qualifying.map((q) => `<tr><td class="pos">${q.pos}</td><td>${drvCell(q.driverId)}</td><td class="num">${esc(q.q1 || '')}</td><td class="num">${esc(q.q2 || '')}</td><td class="num"><b>${esc(q.q3 || '')}</b></td></tr>`).join('')}</tbody></table>`;
    } else {
      const res = tab === 'sprint' && r.sprintResults ? r.sprintResults : r.results;
      table = `<table class="tbl"><thead><tr><th>Pos</th><th>Pilote</th><th class="c">Grille</th><th class="c">+/−</th><th class="c">Tours</th><th>Temps / statut</th><th class="r">Pts</th></tr></thead><tbody>
        ${res.map((x) => { const gd = x.grid > 0 && x.classified ? x.grid - x.pos : null; return `<tr><td class="pos">${x.classified ? x.pos : esc(x.positionText === 'R' ? 'AB' : x.positionText)}</td><td>${drvCell(x.driverId, x.fastestRank === 1 ? ' · <span style="color:#c77dff">⏱ Meilleur tour</span>' : '')}</td><td class="c num">${x.grid || (S.series === 'wec' ? '—' : 'PL')}</td><td class="c">${gd ? `<span class="gain ${gd > 0 ? 'up' : 'down'}">${gd > 0 ? '▲' : '▼'}${Math.abs(gd)}</span>` : '<span class="muted">—</span>'}</td><td class="c num">${x.laps || '—'}</td><td class="num ${x.classified ? '' : 'muted'}">${esc(x.timeText || x.status)}</td><td class="r num"><b>${x.points || ''}</b></td></tr>`; }).join('')}</tbody></table>`;
    }
    return head + tabs + `<div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px" id="gpGrid"><div class="card pad0"><div class="table-wrap">${table}</div></div>${side}</div>
      <style>@media(max-width:900px){#gpGrid{grid-template-columns:minmax(0,1fr)!important}}</style>`;
  }

  function credits() {
    const all = F1.visuals.allPortraits();
    const ids = Object.keys(all).filter((id) => drv(id) || (S.season.upcoming && S.season.upcoming.drivers.get(id)));
    modal(`<h2>Crédits photos</h2><p class="muted" style="font-size:13px;margin-top:0">Portraits issus de Wikimedia Commons, sous licences libres (Creative Commons, etc.). Merci aux photographes.</p>
      <div style="display:grid;gap:8px;font-size:13px">${ids.map((id) => { const p = all[id]; const d = drv(id) || S.season.upcoming.drivers.get(id); return `<div class="row" style="flex-wrap:nowrap">${ava(id)}<div><b>${esc(d.given + ' ' + d.family)}</b><br><span class="muted">© ${esc(p.artist || 'voir la page du fichier')} · ${esc(p.license || 'licence libre')} · <a href="${esc(p.page || p.file || p.wiki || '#')}" target="_blank" rel="noopener" style="text-decoration:underline">source</a></span></div></div>`; }).join('') || '<span class="muted">Aucun portrait chargé.</span>'}</div>
      <div class="row" style="margin-top:18px"><span class="sp"></span><button class="btn sm" data-action="close-modal">Fermer</button></div>`);
  }

  /* =================== Amis =================== */
  const SO = () => F1.social.state;
  function friendsBadge() {
    const n = SO().incoming.length, b = $('#friendsBadge');
    if (!b) return;
    b.textContent = n; b.style.display = n ? '' : 'none';
  }
  // anneau de ligue autour d'une photo de profil : « --lr » porte la couleur, « ring » active le liseré
  const LG_BY = () => Object.fromEntries(MG().LEAGUES.map((l) => [l.id, l]));
  function leagueOfUser(p) {
    const u = SO().user, mine = p && (p.isMe || (u && p.id === u.id));
    if (mine) return MG().leagueOf(F1.store.mgr().lp);
    return (p && p.league && LG_BY()[p.league]) || (p && p.lp != null ? MG().leagueOf(p.lp) : null);
  }
  const ringAttr = (L) => (L ? ` data-lg="${L.id}" style="--lr:${L.color}"` : '');
  function uava(p, cls = '') {
    const c = p.team ? tcol(p.team) : 'var(--red)';
    // sa propre ligne : la photo de cet appareil (même si le serveur ne l'a pas encore, ou ne l'accepte pas)
    const u = SO().user, mine = p.isMe || (u && p.id === u.id), loc = mine ? F1.store.get().avatar : null;
    const src = (loc && AVA_OK.test(loc)) ? loc : p.avatar;
    const img = src && AVA_OK.test(src) ? `<img src="${esc(src)}" alt="" loading="lazy">` : '';
    const L = leagueOfUser(p);
    return `<span class="ava ${cls}${L ? ' ring' : ''}" style="--tc:${c}${L ? `;--lr:${L.color}` : ''}"${L ? ` data-lg="${L.id}" title="Ligue ${esc(L.name)}"` : ''}>${img}<i>${esc((p.username || '?').slice(0, 2).toUpperCase())}</i></span>`;
  }
  function relBtn(p) {
    const rel = F1.social.relation(p.id), l = F1.social.linkWith(p.id);
    if (rel === 'me') return '<span class="chip">Vous</span>';
    if (rel === 'friend') return '<span class="chip green">✓ Ami</span>';
    if (rel === 'sent') return `<button class="btn sm ghost" data-action="f-remove" data-id="${l.id}" title="Annuler la demande">⏳ Envoyée · annuler</button>`;
    if (rel === 'received') return `<button class="btn sm" data-action="f-accept" data-id="${l.id}">Accepter</button>`;
    return `<button class="btn sm" data-action="f-add" data-u="${esc(p.id)}">＋ Ajouter</button>`;
  }
  function playerRow(p) {
    const rate = p.bets_done ? Math.round((p.bets_won / p.bets_done) * 100) + ' %' : '—';
    return `<div class="prow">${uava(p, 'md')}<div class="pinfo"><b>${esc(p.username)}</b><small>${p.team ? esc(team(p.team).short) + ' · ' : ''}${coin}${fmt(p.balance)} · réussite ${rate}</small></div>${relBtn(p)}</div>`;
  }
  function pageFriends(parts) {
    const so = SO();
    const head = `<div class="market-head"><div><h1>Amis</h1><div class="muted" style="margin-top:6px">Cherchez des joueurs, ajoutez-les et comparez vos résultats.</div></div></div>`;
    if (!so.enabled) {
      return head + `<div class="card" style="max-width:760px"><div style="font-size:40px">🛠️</div><h3>Le système d'amis n'est pas encore activé</h3>
        <p class="muted">Il nécessite une base de données partagée gratuite (Supabase). Le propriétaire du site doit la créer une seule fois, en 5 minutes :</p>
        <ol class="muted" style="line-height:1.8"><li>Créer un projet gratuit sur <a href="https://supabase.com" target="_blank" rel="noopener" style="text-decoration:underline">supabase.com</a></li>
        <li><b>SQL Editor</b> → coller le contenu de <code>supabase/schema.sql</code> → <b>Run</b></li>
        <li><b>Authentication → Sign In / Providers</b> → activer <b>Allow anonymous sign-ins</b></li>
        <li><b>Project Settings → API</b> → copier l'URL et la clé <i>anon public</i> dans <code>js/config.js</code></li>
        <li>Pousser la modification sur GitHub : c'est en ligne !</li></ol></div>`;
    }
    if (so.error) return head + `<div class="notice red">⚠️ Connexion au service d'amis impossible : ${esc(so.error)} <button class="btn sm ghost" data-action="f-retry">Réessayer</button></div>`;
    if (!so.ready) return head + '<div class="skeleton"></div>';
    if (!so.me) {
      const sug = F1.social.cleanName(F1.store.get().name);
      return head + `<div class="card" style="max-width:560px"><div style="font-size:40px">🪪</div><h3>Choisissez votre pseudo public</h3>
        <p class="muted" style="font-size:14px">C'est le nom sous lequel vos amis vous trouveront. 3 à 24 caractères : lettres sans accent, chiffres, _ . -</p>
        <input class="field" id="claimName" maxlength="24" value="${esc(sug)}" placeholder="ex. Lewis_du_93" style="margin:6px 0 12px">
        <label class="muted" style="font-size:13px;font-weight:700">Écurie favorite (couleur de votre avatar)</label>
        <select class="field" id="claimTeam" style="margin:6px 0 16px">${teamOptions('')}</select>
        <button class="btn block" data-action="f-claim">Créer mon profil joueur</button>
        <p class="muted" style="font-size:12px;margin-bottom:0">Votre profil est lié à ce navigateur. Seuls votre pseudo et vos statistiques de jeu sont visibles par les autres joueurs.</p></div>`;
    }
    const me = so.me;
    const invite = `${location.origin}${location.pathname}#/amis/u/${encodeURIComponent(me.username)}`;
    const board = [{ ...me, isMe: true }, ...so.friends.map((x) => x.p)].sort((a, b) => b.balance - a.balance);
    let h = head;
    if (parts[1] === 'u' && parts[2]) h += `<div id="inviteCard" class="card" style="margin-bottom:16px"><div class="skeleton" style="height:60px"></div></div>`;
    h += `<div class="card friend-me" style="--tc:${me.team ? tcol(me.team) : 'var(--red)'}"><div class="row" style="flex-wrap:nowrap">${uava(me, 'lg0')}<div style="min-width:0"><div class="muted upper" style="font-size:11px;font-weight:700">Votre profil joueur</div><div style="font-size:24px;font-weight:900;font-style:italic">${esc(me.username)}</div><div class="muted" style="font-size:13px">${so.friends.length} ami${so.friends.length > 1 ? 's' : ''} · ${coin}${fmt(me.balance)}</div></div>
      <span class="sp"></span><div class="row"><button class="btn sm ghost" data-action="f-copy" data-v="${esc(invite)}">🔗 Copier mon lien d'invitation</button><button class="btn sm ghost" data-action="f-edit">✏️ Modifier</button></div></div></div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>🔍 Rechercher un joueur</h3><div class="sub">Tapez au moins 2 lettres de son pseudo</div>
          <div id="friendSearch"><input class="field" id="friendQ" placeholder="Pseudo…" autocomplete="off" style="margin-top:12px" value="${esc(S.friendQ || '')}"></div><div id="friendRes" class="plist"></div></div>
        <div class="card"><h3>📨 Demandes</h3>
          ${so.incoming.length ? `<div class="sub" style="margin-top:6px">Reçues</div><div class="plist">${so.incoming.map((x) => `<div class="prow">${uava(x.p, 'md')}<div class="pinfo"><b>${esc(x.p.username)}</b><small>veut devenir votre ami</small></div><div class="row"><button class="btn sm" data-action="f-accept" data-id="${x.link.id}">Accepter</button><button class="btn sm ghost" data-action="f-remove" data-id="${x.link.id}">Refuser</button></div></div>`).join('')}</div>` : '<div class="muted" style="margin-top:10px;font-size:14px">Aucune demande reçue.</div>'}
          ${so.outgoing.length ? `<div class="sub" style="margin-top:14px">Envoyées</div><div class="plist">${so.outgoing.map((x) => playerRow(x.p)).join('')}</div>` : ''}
        </div></div>
      <section class="section"><div class="section-h"><h2>Classement entre amis</h2><button class="link" data-action="f-refresh">↻ Actualiser</button></div>
      ${so.friends.length ? `<div class="card pad0"><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Joueur</th><th class="r">Solde</th><th class="r">Bénéfice</th><th class="c">Réussite</th><th class="c">Paris réglés</th><th class="c">Meill. cote</th><th class="c">Succès</th><th></th></tr></thead><tbody>
        ${board.map((p, i) => { const l = p.isMe ? null : F1.social.linkWith(p.id); return `<tr class="${p.isMe ? 'me-row' : ''}"><td class="pos">${i === 0 ? '🏆' : i + 1}</td><td><div class="drv">${uava(p)}<div><b>${esc(p.username)}</b>${p.isMe ? ' <span class="chip">Vous</span>' : ''}<small>${p.team ? esc(team(p.team).short) : ''}</small></div></div></td>
          <td class="r num"><b>${fmt(p.balance)}</b></td><td class="r num"><span class="gain ${p.profit >= 0 ? 'up' : 'down'}">${p.profit >= 0 ? '+' : ''}${fmt(p.profit)}</span></td><td class="c num">${p.bets_done ? Math.round((p.bets_won / p.bets_done) * 100) + ' %' : '—'}</td><td class="c num">${p.bets_done}</td><td class="c num">${p.best_odds ? fmtOdds(+p.best_odds) : '—'}</td><td class="c num">${p.achievements}</td>
          <td class="r">${l ? `<button class="link" data-action="f-remove" data-id="${l.id}" data-confirm="1" title="Retirer de mes amis">✕</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`
        : `<div class="empty"><div class="ic">🤝</div>Pas encore d'amis. Recherchez un pseudo ci-dessus ou partagez votre lien d'invitation.</div>`}</section>`;
    return h;
  }
  function teamOptions(cur) {
    return '<option value="">— Aucune —</option>' + [...S.season.teams.values()].filter((t) => S.season.entrants.some((id) => drv(id).teamId === t.id)).map((t) => `<option value="${esc(t.id)}" ${t.id === cur ? 'selected' : ''}>${esc(t.short)}</option>`).join('');
  }
  let searchT = null, searchSeq = 0;
  function runSearch() {
    const q = ($('#friendQ') || {}).value || '';
    S.friendQ = q;
    const out = $('#friendRes'); if (!out) return;
    clearTimeout(searchT);
    if (q.trim().length < 2) { out.innerHTML = ''; return; }
    out.innerHTML = '<div class="muted" style="padding:10px 0;font-size:14px">Recherche…</div>';
    const seq = ++searchSeq;
    searchT = setTimeout(async () => {
      try {
        const res = await F1.social.search(q);
        if (seq !== searchSeq) return;
        out.innerHTML = res.length ? res.map(playerRow).join('') : `<div class="muted" style="padding:10px 0;font-size:14px">Aucun joueur trouvé pour « ${esc(q)} ».</div>`;
      } catch (e) { out.innerHTML = `<div style="color:var(--lose);font-size:14px;padding:10px 0">${esc(e.message)}</div>`; }
    }, 300);
  }
  function mountFriends(parts) {
    const q = $('#friendQ');
    if (q) { q.addEventListener('input', runSearch); if (q.value) runSearch(); }
    const ic = $('#inviteCard');
    if (ic) F1.social.byUsername(decodeURIComponent(parts[2])).then((p) => {
      ic.innerHTML = p ? `<div class="sub" style="margin-bottom:8px">🎟️ Invitation reçue</div>${playerRow(p)}` : `<div class="muted">Aucun joueur nommé « ${esc(decodeURIComponent(parts[2]))} ».</div>`;
    }).catch((e) => { ic.innerHTML = `<div class="muted">${esc(e.message)}</div>`; });
  }
  /* =================== Mes ligues : pronostics podium entre amis ===================
     Chaque joueur pronostique le top 3 des qualifications et de la course de chaque Grand Prix. Ses pronostics valent
     pour toutes ses ligues. Points de ligue uniquement (aucune monnaie) ; verrouillage au début de chaque session. */
  const PODIUM = {
    quali: { label: 'Qualifications', exact: [10, 8, 6], podium: 3, perfect: 5 },
    race: { label: 'Course', exact: [25, 18, 15], podium: 5, perfect: 15 },
  };
  /* Prime de risque : chaque pilote bien placé rapporte ses points × un coefficient tiré de sa cote « podium »
     figée à l'enregistrement du pronostic (cote 1,5 ou moins : ×1 ; cote 6 : ×2 ; plafond ×3 dès la cote 13,5).
     La cote intègre l'effet des dépêches Paddock Wire. Le bonus « podium parfait » n'est pas multiplié. */
  const riskK = (o) => (o > 1 ? Math.min(3, Math.max(1, Math.sqrt(o / 1.5))) : 1);
  const fmtK = (k) => '×' + k.toFixed(k >= 2.95 ? 0 : 1).replace('.', ',');
  function podiumScore(pick, top, k, odds) {
    if (!pick || !top || top.length < 3) return null;
    const B = PODIUM[k]; let pts = 0, exact = 0;
    pick.forEach((d, i) => { const m = riskK(odds && odds[i]); if (d === top[i]) { pts += Math.round(B.exact[i] * m); exact++; } else if (top.includes(d)) pts += Math.round(B.podium * m); });
    return exact === 3 ? pts + B.perfect : pts;
  }
  // Cote « podium » de chaque pilote pour le Grand Prix à venir (marché des Paris, actualité Paddock Wire comprise)
  function podOdds() {
    const m = (S.markets || []).find((x) => x.kind === 'podium'); const out = new Map();
    if (m) m.selections.forEach((x) => out.set(x.driverId, { odds: x.odds, news: x.news || 1 }));
    return out;
  }
  // Flèche de tendance : rouge ▲ quand l'actualité fait monter la cote, vert ▼ quand elle la fait baisser
  const oddArrow = (news, withPct) => (!news || Math.abs(news - 1) < 0.005 ? '' : `<i class="odd-mv ${news > 1 ? 'up' : 'dn'}" title="Paddock Wire : cote ${news > 1 ? 'en hausse' : 'en baisse'} de ${Math.abs(Math.round((news - 1) * 100))} %">${news > 1 ? '▲' : '▼'}${withPct ? Math.abs(Math.round((news - 1) * 100)) + ' %' : ''}</i>`);
  const sessionStart = (race, k) => (k === 'quali' ? race.qualiDate || ((race.sessions || []).find((x) => x.key === 'quali') || {}).date : race.date) || null;
  const actualTop = (race, k) => { const arr = k === 'quali' ? race.qualifying : race.results; if (!arr || arr.length < 3) return null; return arr.filter((x) => x.pos > 0).sort((a, b) => a.pos - b.pos).slice(0, 3).map((x) => x.driverId); };
  const PKEY = 'pitwall:podium';
  const localPicks = () => { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } };
  const pkKey = (y, r, k) => `${y}-${r}-${k}`;
  function setLocalPick(y, r, k, picks, odds) { const o = localPicks(); o[pkKey(y, r, k)] = { p: picks, t: Date.now(), o: odds || null }; try { localStorage.setItem(PKEY, JSON.stringify(o)); } catch (e) { /* stockage indisponible */ } }
  const untilTxt = (ms) => { const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), mn = Math.floor((ms % 36e5) / 6e4); return d ? `${d} j ${h} h` : h ? `${h} h ${mn} min` : `${Math.max(1, mn)} min`; };
  // Grand Prix du moment : le prochain ; sinon le dernier disputé
  const leagueGp = () => { const f1 = S.f1 || S.season; return f1.next || [...f1.races].reverse().find((r) => r.results) || null; };
  const drvOf = (id) => (S.f1 || S.season).drivers.get(id) || { code: String(id).slice(0, 3).toUpperCase(), family: id, teamId: '' };
  const drvTag = (id, cls = '') => { const d = drvOf(id); return `<span class="pd-tag ${cls}" style="--tc:${F1.teamColor(d.teamId)}">${esc(d.code || '?')}</span>`; };
  function podiumCard(gp, k, y) {
    const st = sessionStart(gp, k), locked = !st || Date.now() >= st.getTime();
    const savedE = localPicks()[pkKey(y, gp.round, k)] || {}, saved = savedE.p || null, savedO = savedE.o || null;
    const OD = podOdds(), oddOf = (id) => (OD.get(id) || {}).odds || null;
    const draft = S.pdDraft[k];
    const dirty = !saved || draft.join() !== saved.join(), full = draft.filter(Boolean).length === 3;
    const top = actualTop(gp, k), pts = saved && top ? podiumScore(saved, top, k, savedO) : null;
    const f1 = S.f1 || S.season;
    const ids = (f1.entrants && f1.entrants.length ? f1.entrants : [...f1.drivers.keys()]).filter((id) => f1.drivers.has(id));
    const order = [...f1.teams.values()].sort((a, b) => (a.position || 99) - (b.position || 99)).map((t) => t.id);
    ids.sort((a, b) => order.indexOf(drvOf(a).teamId) - order.indexOf(drvOf(b).teamId));
    const show = locked ? saved || [] : draft;
    // cote retenue pour chaque marche : celle figée à l'enregistrement, sinon la cote du moment
    const oddAt = (i) => (locked || (saved && !dirty) ? (savedO && savedO[i]) : oddOf(show[i])) || null;
    const slots = [0, 1, 2].map((i) => { const id = show[i], d = id && drvOf(id), o = id ? oddAt(i) : null, m = riskK(o); return `<button class="pd-slot s${i} ${id ? 'on' : ''}" ${locked ? 'disabled' : `data-action="pd-clear" data-s="${k}" data-i="${i}" title="Retirer"`} style="--tc:${d ? F1.teamColor(d.teamId) : 'var(--line2)'}"><span class="pd-step">P${i + 1}</span>${d ? `<b>${d.number ? dnum(d.number, d.teamId, 'pdn') : ''}${esc(d.code)}</b><small>${esc(d.family)}</small>${o ? `<span class="pd-k ${m >= 2 ? 'hi' : m > 1.05 ? 'mid' : ''}">cote ${fmtOdds(o)} · ${fmtK(m)}</span>` : ''}` : '<em>Choisir un pilote</em>'}${top ? `<i class="pd-real">${drvTag(top[i])}</i>` : ''}</button>`; }).join('');
    const maxPts = show.filter(Boolean).length === 3 ? [0, 1, 2].reduce((a, i) => a + Math.round(PODIUM[k].exact[i] * riskK(oddAt(i))), 0) + PODIUM[k].perfect : 0;
    const picker = locked ? '' : `<div class="pd-grid">${ids.map((id) => { const d = drvOf(id), used = draft.includes(id), od = OD.get(id); return `<button class="pd-drv ${used ? 'used' : ''}" data-action="pd-pick" data-s="${k}" data-d="${esc(id)}" style="--tc:${F1.teamColor(d.teamId)}"><b>${d.number ? dnum(d.number, d.teamId, 'pdn') : ''}${esc(d.code)}</b><small>${esc(d.family)}</small>${od ? `<span class="pd-odd num">${fmtOdds(od.odds)}${oddArrow(od.news)}</span>` : ''}</button>`; }).join('')}</div>`;
    const status = locked
      ? (top ? `<span>Résultat officiel à droite de chaque marche</span>${pts != null ? `<b class="pd-pts">+${pts} pts</b>` : '<span class="muted">Pas de pronostic</span>'}` : `<span>🔒 Verrouillé depuis le ${DTF.format(st)}${saved ? '' : ' · aucun pronostic'}</span>`)
      : `<span>Verrouillage dans <b>${untilTxt(st.getTime() - Date.now())}</b> (${DTF.format(st)})${maxPts ? ` · podium exact : <b class="pd-max">${maxPts} pts</b>` : ''}</span><button class="btn sm" data-action="pd-save" data-s="${k}" ${full && dirty ? '' : 'disabled'}>${saved && !dirty ? 'Enregistré ✓' : 'Enregistrer'}</button>`;
    return `<section class="pd-card ${locked ? 'locked' : ''}"><div class="pd-h"><b>${PODIUM[k].label}</b><small class="muted">exact ${PODIUM[k].exact.join(' / ')} · sur le podium +${PODIUM[k].podium} · podium parfait +${PODIUM[k].perfect}</small></div>
      <div class="pd-slots">${slots}</div>${picker}<div class="pd-foot">${status}</div>${locked ? '' : '<small class="pd-risk">Plus la cote d\'un pilote est haute, plus il rapporte : jusqu\'à ×3. Les cotes bougent avec les dépêches Paddock Wire (▲ rouge : en hausse, ▼ vert : en baisse) et sont figées quand vous enregistrez.</small>'}</section>`;
  }
  function pageLeagues(parts) {
    if (parts[1] === 'l' && parts[2]) {
      return `<section class="lgp"><a class="lgp-back" href="#/ligues">← Toutes mes ligues</a><div id="lgPage" data-id="${esc(parts[2])}"><div class="skeleton" style="height:320px"></div></div></section>`;
    }
    const so = SO(), gp = leagueGp(), y = (S.f1 || S.season).year;
    const head = `<div class="market-head"><div><h1>Mes ligues</h1><div class="muted" style="margin-top:6px">Pronostiquez le podium des qualifications et de la course, et affrontez vos amis au classement. Des points de ligue seulement : ni jetons, ni PitCoins.</div></div></div>`;
    const dashHtml = '<div id="lgDash" class="lgd"><div class="skeleton" style="height:150px"></div></div>';
    // accès rapide : pronostic du GP (avec l'échéance), historique, création
    const nextLock = gp && ['quali', 'race'].map((k) => sessionStart(gp, k)).find((t) => t && t.getTime() > Date.now());
    let h = '';
    if (gp) {
      const key = `${y}-${gp.round}`;
      if (!S.pdDraft || S.pdDraft.key !== key) { const lp = localPicks(); S.pdDraft = { key, quali: ((lp[pkKey(y, gp.round, 'quali')] || {}).p || [null, null, null]).slice(), race: ((lp[pkKey(y, gp.round, 'race')] || {}).p || [null, null, null]).slice() }; }
      h += `<div id="pdSec" class="lgx-anchor"></div><div class="pd-gp"><div class="row" style="gap:10px;flex-wrap:nowrap">${flag(gp.iso, 'lg')}<div><div class="pd-gp-name">${esc(gp.nameFr)}</div><small class="muted">Manche ${gp.round} · ${esc(gp.circuit)} · vos pronostics valent pour toutes vos ligues</small></div></div></div>
        <div class="pd-cards">${podiumCard(gp, 'quali', y)}${podiumCard(gp, 'race', y)}</div>`;
    } else h += '<div class="empty"><div class="ic">🏁</div>Aucun Grand Prix à pronostiquer pour le moment.</div>';
    const code = parts[1] === 'rejoindre' && parts[2] ? decodeURIComponent(parts[2]) : '';
    h += '<div id="lgHistSec" class="lgx-anchor"></div><div class="section-h" style="margin-top:28px"><h2>Mes 5 derniers Grands Prix</h2><span class="muted" style="font-size:13px">Vos podiums face aux résultats officiels</span></div><div id="lgHist" class="lgh"><div class="skeleton" style="height:120px"></div></div>';
    // vos ligues en haut de la page, création / adhésion et barème en bas
    const lgHead = '<div class="lgx-h"><h2>Vos ligues</h2><span class="muted">Rang · écart au leader · podium</span></div>';
    // en haut : vos ligues (à gauche) et vos points de ligue (à droite)
    const top = (x, after = '') => head + `<div class="lgx-top"><section class="lgx-l">${lgHead}${x}</section>${dashHtml}</div>` + h + after;
    if (!so.enabled) return top('<div class="notice">Les ligues utilisent la base de données du système d\'amis, qui n\'est pas encore activée sur ce site. Vos pronostics sont gardés sur cet appareil.</div>');
    if (so.error) return top(`<div class="notice red">⚠️ Connexion impossible : ${esc(so.error)} <button class="btn sm ghost" data-action="f-retry">Réessayer</button></div>`);
    if (!so.ready) return top('<div class="skeleton"></div>');
    if (!so.me) {
      const sug = F1.social.cleanName(F1.store.get().name);
      return top(`<div class="card" style="max-width:560px"><h3>Créez votre profil pour jouer en ligue</h3>
        <p class="muted" style="font-size:14px">Votre pseudo apparaîtra dans les classements de vos ligues. 3 à 24 caractères : lettres sans accent, chiffres, _ . -</p>
        <input class="field" id="claimName" maxlength="24" value="${esc(sug)}" placeholder="ex. Lewis_du_93" style="margin:6px 0 12px">
        <label class="muted" style="font-size:13px;font-weight:700">Écurie favorite</label>
        <select class="field" id="claimTeam" style="margin:6px 0 16px">${teamOptions('')}</select>
        <button class="btn block" data-action="f-claim">Créer mon profil joueur</button></div>`);
    }
    return top(`<div class="lg-cards" id="lgList"><div class="skeleton" style="height:110px"></div></div>`, `
      <div id="lgFormsSec" class="lgx-anchor"></div><div class="section-h" style="margin-top:28px"><h2>Créer ou rejoindre une ligue</h2></div><div class="lg-forms"><div class="card lg-form"><b>Créer une ligue</b><div class="row" style="gap:6px;flex-wrap:nowrap"><input class="field" id="lgName" maxlength="40" placeholder="Nom (ex. Les potes du lycée)"><button class="btn sm" data-action="lg-create">Créer</button></div><small class="muted">Un code d'invitation unique est généré (ex. PIT-K7Q2).</small></div>
        <div class="card lg-form"><b>Rejoindre avec un code</b><div class="row" style="gap:6px;flex-wrap:nowrap"><input class="field" id="lgCode" maxlength="9" placeholder="PIT-XXXX" style="text-transform:uppercase" value="${esc(code)}"><button class="btn sm ${code ? '' : 'ghost'}" data-action="lg-join">Rejoindre</button></div></div></div>
      <details class="card lg-how"><summary>Barème des points</summary>${bareme()}</details>`);
  }
  // Liste des ligues : une carte par ligue, le classement complet s'ouvre dans une fenêtre dédiée
  let lgCache = [];
  async function mountLeagues() {
    const so = SO(); if (!so.ready || !so.me) return;
    const list = $('#lgList'); if (!list) return;
    // pronostics enregistrés hors ligne : envoyés au serveur s'ils sont encore modifiables
    syncLocalPicks();
    let leagues = [], missing = false;
    try { leagues = await F1.social.myLeagues(); } catch (e) { if (e.missing) missing = true; else toast('⚠️', esc(e.message), 'err'); }
    if (!$('#lgList')) return;
    lgCache = leagues;
    const me = so.me.id;
    list.innerHTML = missing ? '<div class="notice" style="font-size:13px">Les ligues privées ne sont pas encore activées : le propriétaire du site doit exécuter <code>supabase/migration-bet-leagues.sql</code> puis <code>supabase/migration-podium.sql</code> dans Supabase.</div>'
      : leagues.length ? leagues.map((l) => `<div class="lg-card" data-href="#/ligues/l/${l.id}"><div class="lg-card-h"><span class="lg-ic">🏆</span><div style="min-width:0"><b>${esc(l.name)}</b><small>${l.members} membre${l.members > 1 ? 's' : ''}${l.owner === me ? ' · créée par vous' : ''}</small></div></div>
          <div class="lg-card-code"><small>Code</small><b>${esc(l.code)}</b></div>
          <div class="lg-card-x" data-lg="${l.id}"><div class="skeleton" style="height:58px"></div></div>
          <a class="lg-go" href="#/ligues/l/${l.id}" aria-label="Voir le classement de la ligue">Classement complet ›</a></div>`).join('')
        : '<div class="card lg-empty"><b>Aucune ligue pour l\'instant</b><span class="muted">Créez-en une et partagez son code (PIT-XXXX), ou rejoignez celle d\'un ami.</span></div>';
    window.__lgBest = null; leagues.forEach(fillLeagueCard);
  }
  /* ---------- Mes ligues : statistiques du joueur et des ligues ---------- */
  // points d'un joueur sur une liste de GP disputés, à partir de ses pronostics (serveur, sinon cet appareil pour soi)
  function pickStats(pickOf, done) {
    const per = [];
    let total = 0, exact = 0, onPod = 0, made = 0, perfect = 0;
    done.forEach((race) => {
      let gpPts = 0, any = false;
      ['quali', 'race'].forEach((k) => {
        const pk = pickOf(race.round, k), top = actualTop(race, k), st = sessionStart(race, k);
        if (!pk || !top) return;
        any = true;
        const late = st && pk.at > st && !pk.local;
        const pts = late ? 0 : podiumScore(pk.p, top, k, pk.o) || 0;
        gpPts += pts;
        if (!late) { pk.p.forEach((d, i) => { made++; if (d === top[i]) exact++; else if (top.includes(d)) onPod++; }); if (pk.p.every((d, i) => d === top[i])) perfect++; }
      });
      if (any) per.push({ race, pts: gpPts });
      total += gpPts;
    });
    return { total, per, exact, onPod, made, perfect, gps: per.length, best: per.reduce((m, x) => (x.pts > (m ? m.pts : -1) ? x : m), null), last: per[per.length - 1] || null };
  }
  const pickFrom = (rows, uid, y, local) => (round, k) => {
    const r = rows.find((x) => x.user_id === uid && x.round === round && x.session === k);
    if (r) return { p: [r.p1, r.p2, r.p3], o: [r.o1, r.o2, r.o3].map(Number), at: new Date(r.updated_at) };
    if (local) { const l = localPicks()[pkKey(y, round, k)]; if (l && l.p && l.p.every(Boolean)) return { p: l.p, o: l.o || [], at: new Date(l.t || 0), local: true }; }
    return null;
  };
  let lgMine = null;   // mes statistiques (pour le meilleur rang en ligue)
  async function mountLeagueDash() {
    const dash = $('#lgDash'); if (!dash) return;
    const f1 = S.f1 || S.season, y = f1.year, so = SO(), done = f1.races.filter((r) => r.results);
    let rows = [];
    if (so.ready && so.me) { try { rows = await F1.social.podiumPicks([so.me.id], y); } catch (e) { /* pronostics partagés indisponibles */ } }
    if (!$('#lgDash')) return;
    const st = pickStats(pickFrom(rows, so.me && so.me.id, y, true), done);
    lgMine = st;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const bars = st.per.slice(-12), mx = Math.max(10, ...bars.map((x) => x.pts));
    const kpi = (l, v, sub = '', cls = '') => `<div class="lgd-k ${cls}"><small>${l}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    dash.innerHTML = `<div class="lgd-main"><div class="lgd-score"><small>Mes points de ligue · saison ${y}</small><b class="num">${fmt(st.total)}</b><span class="muted">${st.gps ? `${st.gps} Grand${st.gps > 1 ? 's' : ''} Prix pronostiqué${st.gps > 1 ? 's' : ''}` : 'Aucun pronostic noté pour l\'instant'}</span><div class="lgd-rank" id="lgdRank"></div></div>
        <div class="lgd-kpis">${kpi('Dernier GP', st.last ? `+${st.last.pts}` : '—', st.last ? esc(st.last.race.nameFr.replace('Grand Prix', 'GP')) : '')}${kpi('Meilleur GP', st.best ? `+${st.best.pts}` : '—', st.best ? esc(st.best.race.nameFr.replace('Grand Prix', 'GP')) : '')}
          ${kpi('Bonne marche', `${pct(st.exact, st.made)} %`, `${st.exact} pilote${st.exact > 1 ? 's' : ''} pile à sa place`)}${kpi('Sur le podium', `${pct(st.exact + st.onPod, st.made)} %`, 'pilotes choisis montés sur le podium')}${kpi('Podiums parfaits', st.perfect, 'les 3 marches exactes', st.perfect ? 'gold' : '')}</div></div>
      ${bars.length ? `<div class="lgd-chart"><small class="muted">Points par Grand Prix</small><div class="lgd-bars">${bars.map((x) => `<div class="lgd-bar" title="${esc(x.race.nameFr)} : ${x.pts} pts"><i style="height:${Math.max(4, (x.pts / mx) * 100)}%"></i><span>${esc((x.race.iso || '').toUpperCase() || x.race.round)}</span><b>${x.pts}</b></div>`).join('')}</div></div>` : ''}`;
    // historique détaillé des 5 derniers GP pronostiqués
    const hist = $('#lgHist');
    if (hist) {
      const pk = pickFrom(rows, so.me && so.me.id, y, true);
      const last = st.per.slice(-5).reverse();
      hist.innerHTML = last.length ? last.map(({ race, pts }) => {
        const ses = (k) => { const p = pk(race.round, k), top = actualTop(race, k); if (!p || !top) return `<div class="lgh-s"><small>${PODIUM[k].label}</small><span class="muted">pas de pronostic</span></div>`;
          const sp = podiumScore(p.p, top, k, p.o) || 0;
          return `<div class="lgh-s"><small>${PODIUM[k].label} <b>+${sp}</b></small><div class="lgh-pk">${p.p.map((d, i) => `<span class="lgh-d ${d === top[i] ? 'ok' : top.includes(d) ? 'mid' : 'ko'}" style="--tc:${F1.teamColor(drvOf(d).teamId)}"><i>P${i + 1}</i>${drvOf(d).number ? dnum(drvOf(d).number, drvOf(d).teamId, 'pdn') : ''}${esc(drvOf(d).code || '?')}</span>`).join('')}</div>
            <div class="lgh-real">Officiel : ${top.map((d) => esc(drvOf(d).code || '?')).join(' · ')}</div></div>`; };
        return `<div class="lgh-row"><div class="lgh-gp">${flag(race.iso, 'sm')}<div><b>${esc(race.nameFr)}</b><small class="muted">Manche ${race.round}</small></div><span class="lgh-pts">+${pts}</span></div>${ses('quali')}${ses('race')}</div>`;
      }).join('') : '<div class="card lg-empty"><b>Pas encore d\'historique</b><span class="muted">Pronostiquez le podium du prochain Grand Prix : vos résultats s\'afficheront ici après la course.</span></div>';
    }
  }
  // carte d'une ligue : mon rang, mes points, le leader, le podium de la ligue
  async function fillLeagueCard(l) {
    const el = document.querySelector(`.lg-card-x[data-lg="${l.id}"]`); if (!el) return;
    const so = SO(), f1 = S.f1 || S.season, y = f1.year, me = so.me.id, done = f1.races.filter((r) => r.results);
    try {
      const members = await F1.social.leagueBoard(l.id);
      let picks = []; try { picks = await F1.social.podiumPicks(members.map((p) => p.id), y); } catch (e) { /* */ }
      const rows = members.map((p) => ({ p, ...pickStats(pickFrom(picks, p.id, y, p.id === me), done) })).sort((a, b) => b.total - a.total || (b.last ? b.last.pts : 0) - (a.last ? a.last.pts : 0));
      const i = rows.findIndex((x) => x.p.id === me), mine = rows[i], lead = rows[0];
      const el2 = document.querySelector(`.lg-card-x[data-lg="${l.id}"]`); if (!el2) return;
      const av = (x) => `<span class="lgc-av${leagueOfUser(x.p) ? ' ring' : ''}"${ringAttr(leagueOfUser(x.p))} title="${esc(x.p.username)} · ${x.total} pts">${x.p.avatar && AVA_OK.test(x.p.avatar) ? `<img src="${esc(x.p.avatar)}" alt="">` : esc((x.p.username || '?')[0].toUpperCase())}</span>`;
      el2.innerHTML = `<div class="lgc-rank"><b>${i + 1}<sup>${i === 0 ? 'er' : 'e'}</sup></b><small>sur ${rows.length}</small></div>
        <div class="lgc-info"><div><small>Mes points</small><b>${mine ? mine.total : 0}</b></div><div><small>${i === 0 ? 'Avance' : 'Retard'}</small><b class="${i === 0 ? 'up' : 'down'}">${i === 0 ? (rows[1] ? `+${mine.total - rows[1].total}` : '—') : `−${lead.total - (mine ? mine.total : 0)}`}</b></div><div><small>Leader</small><b>${esc(lead.p.username)}</b></div></div>
        <div class="lgc-pod">${rows.slice(0, 3).map((x, k) => `<div class="lgc-step s${k}">${av(x)}<span>${k + 1}</span></div>`).join('')}</div>`;
      el2.closest('.lg-card').classList.toggle('lead', i === 0);
      // meilleur rang dans le tableau de bord
      const best = (window.__lgBest = window.__lgBest && window.__lgBest.rank <= i + 1 ? window.__lgBest : { rank: i + 1, of: rows.length, name: l.name });
      const r = $('#lgdRank'); if (r) r.innerHTML = `🏆 Meilleur classement : <b>${best.rank}${best.rank === 1 ? 'er' : 'e'} sur ${best.of}</b> dans « ${esc(best.name)} »`;
    } catch (e) { el.innerHTML = `<span class="muted" style="font-size:12px">Classement indisponible</span>`; }
  }
  // Classement complet d'une ligue : points de la saison, du dernier GP, et comparaison des pronostics une fois verrouillés
  async function leagueBoardHtml(sel) {
    const so = SO();
      const f1 = S.f1 || S.season, y = f1.year, me = so.me.id;
      const members = await F1.social.leagueBoard(sel.id);
      let picks = [], podMissing = false;
      try { picks = await F1.social.podiumPicks(members.map((p) => p.id), y); } catch (e) { if (e.missing) podMissing = true; else throw e; }
      const lp = localPicks();
      const pickOf = (uid, round, k) => { const r = picks.find((x) => x.user_id === uid && x.round === round && x.session === k); if (r) return { p: [r.p1, r.p2, r.p3], o: [r.o1, r.o2, r.o3].map(Number), at: new Date(r.updated_at) }; if (uid === me && lp[pkKey(y, round, k)]) return { p: lp[pkKey(y, round, k)].p, o: lp[pkKey(y, round, k)].o, at: new Date(lp[pkKey(y, round, k)].t), local: true }; return null; };
      const done = f1.races.filter((r) => r.results);
      const last = done[done.length - 1] || null;
      const ptsOf = (uid, race, k) => { const pk = pickOf(uid, race.round, k), top = actualTop(race, k), st = sessionStart(race, k); if (!pk || !top) return null; if (st && pk.at > st && !pk.local) return 0; return podiumScore(pk.p, top, k, pk.o); };
      const rows = members.map((p) => {
        let total = 0; done.forEach((r) => { total += (ptsOf(p.id, r, 'quali') || 0) + (ptsOf(p.id, r, 'race') || 0); });
        const lastPts = last ? (ptsOf(p.id, last, 'quali') || 0) + (ptsOf(p.id, last, 'race') || 0) : 0;
        return { p, total, lastPts };
      }).sort((a, b) => b.total - a.total || b.lastPts - a.lastPts);
      const link = `${location.origin}${location.pathname}#/ligues/rejoindre/${encodeURIComponent(sel.code)}`;
      // Grand Prix comparé : celui en cours si ses qualifications ont commencé, sinon le dernier disputé
      const gp = leagueGp(), gq = gp && sessionStart(gp, 'quali');
      const cmp = gp && gq && Date.now() >= gq.getTime() ? gp : last;
      const cell = (uid, race, k) => {
        const st = sessionStart(race, k), locked = st && Date.now() >= st.getTime(), pk = pickOf(uid, race.round, k);
        if (!locked && uid !== me) return '<td class="pd-hide" colspan="2">🔒 visible au départ</td>';
        if (!pk) return '<td class="muted" colspan="2">—</td>';
        const pts = ptsOf(uid, race, k), top = actualTop(race, k);
        return `<td><span class="pd-mini">${pk.p.map((d, i) => drvTag(d, top ? (d === top[i] ? 'ok' : top.includes(d) ? 'mid' : 'ko') : '')).join('')}</span></td><td class="r num">${pts == null ? '' : `+${pts}`}</td>`;
      };
      return `<div class="card"><div class="lg-h"><div><h3>${esc(sel.name)}</h3><small class="muted">${members.length} membre${members.length > 1 ? 's' : ''}${sel.owner === me ? ' · vous êtes le créateur' : ''}${last ? ` · dernier GP : ${esc(last.nameFr)}` : ''}</small></div>
          <div class="lg-code"><small>Code d'invitation</small><b>${esc(sel.code)}</b><button class="btn sm ghost" data-action="lg-copy" data-code="${esc(sel.code)}" data-link="${esc(link)}">Copier l'invitation</button></div></div>
        ${podMissing ? '<div class="notice" style="font-size:13px;margin-bottom:10px">Les pronostics partagés ne sont pas encore activés : le propriétaire du site doit exécuter <code>supabase/migration-podium.sql</code> dans Supabase. Vos pronostics sont gardés sur cet appareil.</div>' : ''}
        <div class="table-wrap"><table class="tbl lg-tbl"><thead><tr><th>#</th><th>Joueur</th><th class="r">Saison</th><th class="r">Dernier GP</th></tr></thead><tbody>${rows.map((x, i) => `<tr class="${x.p.id === me ? 'me-row' : ''}"><td class="pos">${i + 1}</td><td><span class="row" style="gap:8px;flex-wrap:nowrap">${uava(x.p, '')}<b>${esc(x.p.username)}</b>${x.p.id === me ? '<small class="muted">(vous)</small>' : ''}</span></td><td class="r num"><b>${x.total}</b> pts</td><td class="r num ${x.lastPts ? 'up' : ''}">${x.lastPts ? '+' + x.lastPts : '0'}</td></tr>`).join('')}</tbody></table></div></div>
      ${cmp ? `<div class="card" style="margin-top:12px"><div class="lg-h"><div><h3>Pronostics · ${esc(cmp.nameFr)}</h3><small class="muted">Vert : bonne marche · jaune : sur le podium, mauvaise marche · les pronostics des autres apparaissent au début de chaque session</small></div></div>
        <div class="table-wrap"><table class="tbl lg-tbl pd-cmp"><thead><tr><th>Joueur</th><th>Qualifications</th><th class="r">Pts</th><th>Course</th><th class="r">Pts</th></tr></thead><tbody>
          ${actualTop(cmp, 'quali') || actualTop(cmp, 'race') ? `<tr class="pd-real-row"><td><b>Résultat officiel</b></td><td>${actualTop(cmp, 'quali') ? `<span class="pd-mini">${actualTop(cmp, 'quali').map((d) => drvTag(d)).join('')}</span>` : '<span class="muted">à venir</span>'}</td><td></td><td>${actualTop(cmp, 'race') ? `<span class="pd-mini">${actualTop(cmp, 'race').map((d) => drvTag(d)).join('')}</span>` : '<span class="muted">à venir</span>'}</td><td></td></tr>` : ''}
          ${rows.map((x) => `<tr class="${x.p.id === me ? 'me-row' : ''}"><td><b>${esc(x.p.username)}</b></td>${cell(x.p.id, cmp, 'quali')}${cell(x.p.id, cmp, 'race')}</tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="card" style="margin-top:12px">${bareme()}<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn sm ghost" data-action="lg-leave" data-id="${sel.id}">Quitter la ligue</button></div></div>`;
  }
  // Page de classement d'une ligue (pleine page)
  async function mountLeaguePage() {
    const el = $('#lgPage'); if (!el) return;
    const so = SO();
    if (!so.ready || !so.me) { el.innerHTML = '<div class="notice">Connectez votre profil joueur pour voir le classement de vos ligues.</div>'; return; }
    try {
      if (!lgCache.length) lgCache = await F1.social.myLeagues();
      const sel = lgCache.find((l) => String(l.id) === String(el.dataset.id));
      if (!sel) { el.innerHTML = '<div class="notice">Ligue introuvable : vous n\'en faites peut-être plus partie.</div>'; return; }
      const html = await leagueBoardHtml(sel);
      if ($('#lgPage')) $('#lgPage').innerHTML = html;
    } catch (e) { if ($('#lgPage')) $('#lgPage').innerHTML = `<div class="notice red">⚠️ ${esc(e.message)}</div>`; }
  }
  async function openLeague(id) {
    const sel = lgCache.find((l) => String(l.id) === String(id)); if (!sel) return;
    $('#modal').innerHTML = `<div class="modal" data-action="modal-bg"><div class="modal-box lg-modal"><button class="lg-x" data-action="close-modal" aria-label="Fermer">✕</button><div id="lgModalBody"><div class="skeleton" style="height:260px"></div></div></div></div>`;
    try { const html = await leagueBoardHtml(sel); const el = $('#lgModalBody'); if (el) el.innerHTML = html; }
    catch (e) { const el = $('#lgModalBody'); if (el) el.innerHTML = `<div class="notice red">⚠️ ${esc(e.message)}</div>`; }
  }
  const bareme = () => `<div class="pd-bareme"><b>Barème</b>${['race', 'quali'].map((k) => `<div><span>${PODIUM[k].label}</span><span>P1 exact +${PODIUM[k].exact[0]} · P2 exact +${PODIUM[k].exact[1]} · P3 exact +${PODIUM[k].exact[2]} · pilote sur le podium à une autre marche +${PODIUM[k].podium} · podium parfait dans l'ordre +${PODIUM[k].perfect}</span></div>`).join('')}<div><span>Prime de risque</span><span>chaque pilote bien placé rapporte ses points × un coefficient lié à sa cote podium au moment du pronostic : ×1 jusqu'à la cote 1,5, ×2 à la cote 6, ×3 au maximum (cote 13,5 et plus). Le bonus du podium parfait n'est pas multiplié.</span></div><small class="muted">Un pronostic modifié après le début de la session ne rapporte rien.</small></div>`;
  // Rafraîchit seulement les deux cartes de pronostics (pas toute la page)
  function pdRefresh() { const c = $('.pd-cards'), gp = leagueGp(); if (!c || !gp) return route(); const y = (S.f1 || S.season).year; c.innerHTML = podiumCard(gp, 'quali', y) + podiumCard(gp, 'race', y); }
  // Envoie au serveur les pronostics gardés sur l'appareil (session pas encore commencée)
  let syncedPicks = false;
  function syncLocalPicks() {
    if (syncedPicks) return; syncedPicks = true;
    const gp = leagueGp(); if (!gp) return;
    const y = (S.f1 || S.season).year, lp = localPicks();
    ['quali', 'race'].forEach((k) => { const v = lp[pkKey(y, gp.round, k)], st = sessionStart(gp, k); if (v && st && Date.now() < st.getTime()) F1.social.savePodium(y, gp.round, k, v.p, st).catch(() => {}); });
  }
  async function socialAct(fn, okMsg) {
    try { await fn(); if (okMsg) toast('✅', okMsg, 'win'); } catch (e) { toast('⚠️', esc(e.message), 'err'); }
    if (/^#\/(amis|ligues)/.test(location.hash)) { route(); }
  }

  /* =================== Mode manager =================== */
  const MG = () => F1.manager;
  const pcoin = `<span class="coin sm pcoin" title="PitCoins">${COIN_P}</span>`;
  const fmtPC = (n) => `${pcoin}${fmt(Math.round(n))}`;
  // encart de solde, propre à chaque mode (les PitCoins du F1 Manager et de la Carrière sont séparés)
  const pcWallet = (n, label) => `<div class="pc-wallet ${n < 0 ? 'neg' : ''}" title="PitCoins ${label}"><span class="coin pcoin">${COIN_P}</span><div><small>PitCoins · ${label}</small><b>${fmt(Math.round(n))}</b></div></div>`;
  function mgrRace() {
    const s = S.f1 || S.season;
    if (F1.store.getMode() === 'career') { const c = F1.store.career().cal; return s.races[Math.min(c.gp, s.races.length - 1)]; }
    return s.next || s.pending || s.lastDone || s.races[0];
  }
  const CUP_ICO = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v4M8.5 20h7M10 17h4v3h-4Z"/></svg>';
  const MB = () => (F1.store.getMode() === 'career' ? '#/carriere' : '#/manager');
  const isCareer = () => F1.store.getMode() === 'career';
  function mgrCtx() {
    const m = F1.store.mgr();
    const mk = S.mk || (S.mk = MG().market(S.f1 || S.season));
    const race = mgrRace();
    const w = MG().circuitProfile(race);
    let drvM = m.driver ? MG().withExperience(mk.byDriver.get(m.driver.id) || null, m.drvXp) : null;
    // Carrière : la forme du pilote (point presse du Grand Prix) pèse sur son rythme, sa combativité et sa régularité
    if (drvM && F1.store.getMode() === 'career') { const f = F1.store.career().cal.form || 0; if (f) { const cl = (v) => Math.max(40, Math.min(99, v + f * 1.2)); drvM = { ...drvM, pace: cl(drvM.pace), craft: cl(drvM.craft), cons: cl(drvM.cons), form: f }; } }
    const ch = m.chassis ? mk.byChassis.get(m.chassis.id) || null : null;
    const tb = MG().teamBonus(m);
    const car = ch ? MG().carStats(ch, m.ups, m.parts, tb) : null;
    const fc = MG().forecast(m.next.seed, race);
    const league = MG().leagueOf(m.lp);
    const mate = m.mate ? mk.byDriver.get(m.mate.id) || null : null;
    // sauvegardes d'avant la hausse des prix : la revente des pilotes déjà achetés reste calée sur l'ancien barème
    if (m.ecoV !== 2) {
      if (m.driver && drvM) { const nv = MG().valueOfDriver(drvM); m.driver.k = nv ? Math.min(1, MG().valueOfDriverV1(drvM) / nv) : 1; }
      if (m.mate && mate) m.mate.k = mate.price ? Math.min(1, MG().valueOfDriverV1(MG().withExperience(mate, {})) / mate.price) : 1;
      m.ecoV = 2; F1.store.save();
    }
    const bots = MG().botField(mk, league, `${F1.store.dayKey()}-${race ? race.round : 0}`, m.driver && m.driver.id, mate && mate.id, ch && ch.id);
    return { m, mk, race, w, drvM, ch, car, league, bots, tb, fc, mate };
  }
  const statBar = (label, val, base, color, icon = '') => `<div class="sbar"><div class="sbar-h"><span>${icon} ${label}</span><b class="num">${Math.round(val)}</b></div><div class="sbar-t"><i style="width:${Math.min(100, base)}%;background:${color}"></i><i class="up" style="width:${Math.max(0, Math.min(100, val) - Math.min(100, base))}%"></i></div></div>`;
  const leagueBadge = (L, cls = '') => `<span class="lbadge ${cls}" style="--lc:${L.color}">${L.icon} ${L.name}</span>`;
  // revente d'un pilote : 78 % de sa valeur marchande actuelle (note du moment, progression acquise comprise)
  // revente d'un pilote : son prix du jour (note, progression et actualité Paddock Wire), jamais moins que ce qu'il a coûté
  /* revente d'un pilote : son prix du jour (note, progression et actualité Paddock Wire). Bonne actualité : plus-value ;
     mauvaise : on perd un peu, au plus 10 % du prix d'achat. */
  const RESALE_FLOOR = 0.9;
  const resaleD = (ctx) => (ctx.m.driver && ctx.drvM ? Math.max(Math.round(((ctx.m.driver.price || 0) * RESALE_FLOOR) / 5) * 5, MG().driverPrice(ctx.drvM)) : 0);
  // ligue requise pour signer un pilote (titulaire ou coéquipier) ; null si accessible
  const lockOf = (ctx, id) => { const req = MG().driverLeagueReq(ctx.mk, id), cur = MG().LEAGUES.findIndex((l) => l.id === ctx.league.id); return req > cur ? MG().LEAGUES[req] : null; };
  // revente : 70 % du prix (le plus bas entre le prix payé et le prix actuel, pour éviter tout bénéfice quand les prix montent) + 50 % de la R&D investie
  // départ d'une écurie : 70 % de son prix (la R&D, elle, suit le manager à 50 %)
  const resaleC = (ctx) => (ctx.m.chassis ? Math.round((Math.min(ctx.m.chassis.price || Infinity, ctx.ch ? ctx.ch.price : Infinity) * 0.7) / 5) * 5 : 0);

  /* ---------- Sponsors ---------- */
  // Livrée de la voiture du joueur : sponsors sous contrat (principal et secondaire)
  function livery(m) {
    const sp = (m && m.sponsors) || {}, one = (c) => { const s = c && MG().SPONSOR_BY_ID.get(c.id); return s ? { name: s.name, color: s.color, ink: s.ink } : null; };
    const skin = (m && m.pass && m.pass.skin) || null;
    const o = { main: one(sp.main), sub: one(sp.sub), skin };
    return o.main || o.sub || o.skin ? o : null;
  }
  const spBadge = (s, cls = '') => `<span class="sp-badge ${cls}" style="--sc:${s.color};--si:${s.ink}">${esc(s.name)}</span>`;
  function spProgress(c, s) {
    const g = s.goal;
    return `<div class="sp-prog"><div class="sp-hits">${Array.from({ length: g.count }, (_, i) => `<i class="${i < c.hits ? 'on' : ''}"></i>`).join('')}<span>${c.hits}/${g.count} objectif${g.count > 1 ? 's' : ''}</span></div>
      <div class="sp-left"><div class="bar"><i style="width:${(c.done / g.races) * 100}%"></i></div><small>${c.done}/${g.races} courses disputées · ${g.races - c.done} restante${g.races - c.done > 1 ? 's' : ''}</small></div>
      ${c.hits >= g.count ? `<div class="sp-met">✓ Objectif atteint : la prime sera versée à la fin du contrat (dans ${g.races - c.done} course${g.races - c.done > 1 ? 's' : ''})</div>` : ''}</div>`;
  }
  function mgrSponsors(ctx) {
    const { m, ch, league } = ctx;
    const sp = m.sponsors || { main: null, sub: null, log: [] };
    const Li = MG().LEAGUES.findIndex((l) => l.id === league.id);
    const slot = (k, label, where) => {
      const c = sp[k], s = c && MG().SPONSOR_BY_ID.get(c.id), t = s && MG().sponsorTerms(s, k);
      return `<div class="sp-slot ${c ? 'on' : ''}"><div class="sp-slot-h"><b>${label}</b><small>${where}</small></div>
        ${c ? `${spBadge(s, 'lg')}<div class="sp-goal">${esc(MG().goalText(s.goal))}</div>${spProgress(c, s)}<div class="sp-terms"><span class="up">Réussi : +${fmtPC(t.reward)}</span><span class="down">Raté : −${fmtPC(t.penalty)}</span></div>`
        : '<div class="muted" style="font-size:13px">Emplacement libre : signez un contrat ci-dessous.</div>'}</div>`;
    };
    const TIERS = [[1, 'Partenaires locaux', 'dès la ligue Bronze · objectifs accessibles'], [2, 'Partenaires internationaux', 'dès la ligue Argent · objectifs de milieu de grille'], [3, 'Partenaires de prestige', 'dès la ligue Or · podiums et victoires']];
    const card = (s) => {
      const locked = Li < s.league, mine = [sp.main, sp.sub].some((c) => c && c.id === s.id), wait = mine ? 0 : F1.store.sponsorCooldown(s.id);
      const tm = MG().sponsorTerms(s, 'main'), ts = MG().sponsorTerms(s, 'sub');
      const btn = (k, lbl) => `<button class="btn sm ${k === 'sub' ? 'ghost' : ''}" data-action="sp-sign" data-id="${s.id}" data-slot="${k}" ${locked || mine || wait || sp[k] ? 'disabled' : ''}>${lbl}</button>`;
      return `<div class="sp-card ${locked ? 'locked' : ''} ${mine ? 'mine' : ''} ${wait ? 'cool' : ''}" style="--sc:${s.color}">
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap;gap:10px">${spBadge(s)}<small class="muted">${esc(s.kind)}</small></div>
        <div class="sp-goal">${esc(MG().goalText(s.goal))}</div>
        <div class="sp-terms"><span>Signature +${fmtPC(tm.sign)}</span><span class="up">Objectif +${fmtPC(tm.reward)}</span><span class="down">Échec −${fmtPC(tm.penalty)}</span></div>
        ${locked ? `<div class="muted" style="font-size:12px">🔒 Disponible dès la ligue ${MG().LEAGUES[s.league].icon} ${MG().LEAGUES[s.league].name}</div>` : mine ? '<div class="chip green">Sous contrat</div>' : wait ? `<div class="sp-cool"><span>⏳ Re-signature possible dans <b>${wait} course${wait > 1 ? 's' : ''}</b></span><div class="bar"><i style="width:${((MG().SPONSOR_COOLDOWN - wait) / MG().SPONSOR_COOLDOWN) * 100}%"></i></div></div>` : `<div class="row" style="gap:6px">${btn('main', 'Signer en principal')}${btn('sub', `Secondaire (+${fmtPC(ts.reward)} / −${fmtPC(ts.penalty)})`)}</div>`}</div>`;
    };
    const log = (sp.log || []).slice(0, 6).map((x) => { const s = MG().SPONSOR_BY_ID.get(x.id); return s ? `<div class="sp-log ${x.status}">${spBadge(s)}<span>${x.status === 'win' ? 'Objectif atteint' : 'Objectif manqué'}</span><b class="${x.amount >= 0 ? 'up' : 'down'}">${x.amount >= 0 ? '+' : '−'}${fmtPC(Math.abs(x.amount))}</b></div>` : ''; }).join('');
    return `<div class="sp-top">
        <div class="sp-car">${ch ? F1.visuals.car(ch.id, { view: 'side', shadow: false, sponsor: livery(m) }) : '<div class="muted">Choisissez une équipe pour afficher votre livrée.</div>'}<small class="muted">Les sponsors sous contrat apparaissent sur votre monoplace : principal sur les pontons et le nez, secondaire sur l'aileron arrière.</small></div>
        <div class="sp-slots">${slot('main', 'Sponsor principal', 'pontons et nez')}${slot('sub', 'Sponsor secondaire', 'aileron arrière · prime et pénalité ×0,6')}</div></div>
      ${howto('Comment fonctionne un contrat', `Un contrat se juge course après course. Le contrat court toujours jusqu'à son échéance, même si l'objectif est rempli plus tôt : la prime est versée à la fin du contrat. Échéance sans objectif atteint : pénalité en PitCoins. Un contrat terminé (réussi ou non) bloque ce sponsor pendant ${MG().SPONSOR_COOLDOWN} courses, en principal comme en secondaire.`)}
      ${TIERS.map(([t, name, sub]) => `<div class="sp-tier"><div class="mg-sec"><h2>${name}</h2><span>${sub}</span></div><div class="sp-grid">${MG().SPONSORS.filter((s) => s.tier === t).map(card).join('')}</div></div>`).join('')}
      ${log ? `<div class="sp-tier"><div class="mg-sec"><h2>Contrats terminés</h2></div><div class="sp-logs">${log}</div></div>` : ''}`;
  }
  /* ---------- QG de l'écurie : coque (bandeau, rail de navigation) et tableau de bord ---------- */
  // parcours d'un directeur d'écurie : le QG, l'équipe et ses pilotes, le personnel et la technique, les finances, puis la compétition et les récompenses
  const MRAIL = [['ecurie', '🏁', 'QG'], ['chassis', '🏎️', 'Équipe'], ['pilotes', '👤', 'Pilotes'], ['transferts', '🤝', 'Transferts'], ['muret', '🎧', 'Muret'], ['rd', '🔬', 'R&D'], ['garage', '🧰', 'Garage'], ['sponsors', '💼', 'Sponsors'], ['hebdo', '🌐', 'GP Hebdo'], ['ligues', '🏆', 'Ligues'], ['passe', '🎟️', 'Pass']];
  function pageManager(tab) {
    tab = tab || 'ecurie';
    const ctx = mgrCtx();
    // l'onglet Sponsors ouvert : les contrats terminés sont « vus », la pastille disparaît
    if (tab === 'sponsors' && ctx.m.sponsors && (ctx.m.sponsors.log || []).some((x) => x.t > (ctx.m.sponsors.seen || 0))) { ctx.m.sponsors.seen = Date.now(); F1.store.save(); }
    const { m, league, ch, car, race } = ctx;
    const nl = MG().nextLeague(m.lp);
    const col = ch ? F1.teamColor(ch.id) : '#e10600';
    const hud = isCareer() ? careerHud(m, car) : [['PitCoins', m.pc < 0 ? `<span class="neg">${fmtPC(m.pc)}</span>` : fmtPC(m.pc)], ['Ligue', `${league.icon} ${esc(league.name)}`], ['Points de ligue', fmt(m.lp)], ['Courses gratuites', `${F1.store.racesLeft()} / ${F1.store.racesPerDay()}`], ['Note voiture', car ? MG().carRating(car) : '—']];
    const debt = m.pc < 0 ? `<div class="notice red" style="margin:0 0 14px">Solde de PitCoins négatif (${fmtPC(m.pc)}) après une pénalité de sponsor : vos achats sont bloqués jusqu'au retour au positif. Les courses, les objectifs du jour et les prochains sponsors vous renflouent.</div>` : '';
    // en-tête : la porte du box, aux couleurs de l'écurie, avec le numéro du pilote en filigrane
    const numTeam = ch ? ch.id : (ctx.drvM && ctx.drvM.teamId) || '';
    const num = m.number || (ctx.drvM && ctx.drvM.number) || '';
    // à droite du bandeau : le numéro choisi, en grand, dans la typographie de l'écurie, et la monoplace aux couleurs de la livrée
    // scène de droite : projecteur, numéro géant derrière la voiture, reflet au sol
    const ghost = (num || ch) ? `<div class="box-r" aria-hidden="true"><i class="box-spot"></i>${num ? `<div class="box-bignum">${F1.num.html(num, numTeam, { color: 'currentColor' })}</div>` : ''}${ch ? `<div class="box-car">${F1.visuals.car(ch.id, { view: 'side', number: num, numTeam: ch.id, sponsor: livery(m) })}</div>` : ''}<i class="box-floor"></i></div>` : '';
    const crew = ctx.drvM ? `<span class="box-drv">${num ? `<span class="box-num">${F1.num.html(num, numTeam, { color: 'currentColor' })}</span>` : ''}<b>${esc(ctx.drvM.name)}</b></span>${ctx.mate ? `<span class="box-mate">avec <b>${esc(ctx.mate.name)}</b></span>` : ''}` : '<span class="box-mate">Pas encore de pilote</span>';
    const cc = isCareer() ? F1.store.career().cal : null;
    let h = `<div class="hq ${cc ? 'is-career' : ''}" style="--tc:${col};--tc-ink:${inkOn(col)}">`;
    if (cc) h += `<div class="crr-band"><span class="crr-tag">${CUP_ICO}Mode Carrière</span><b>Saison ${cc.over ? cc.over.season : cc.season}</b><span>${cc.over ? 'Saison terminée' : `Grand Prix ${cc.gp + 1} sur ${(S.f1 || S.season).races.length} · course ${cc.run + 1} sur ${F1.store.RUNS_PER_GP}`}</span><a href="#/carriere/championnat">Voir le championnat</a></div>`;
    h += `
      <header class="box">
        ${ghost}
        <div class="box-l"><div class="box-crumb"><span class="hq-live"></span>${isCareer() ? 'Quartier général de la Carrière' : 'Quartier général du F1 Manager'}</div>
          <h1 class="box-team">${ch ? esc(ch.name) : 'Votre écurie'}</h1>
          <div class="box-crew">${crew}${leagueBadge(league)}</div>${pcWallet(m.pc, isCareer() ? 'Carrière' : 'F1 Manager')}</div>
        <i class="box-line" aria-hidden="true"></i>
      </header>
      <div class="hq-hud">${hud.map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join('')}</div>
      <div class="hq-body"><nav class="hq-rail" aria-label="Sections du F1 Manager">${isCareer() ? '<span class="rail-h">Saison</span>' : ''}${(isCareer() ? [['championnat', '🏆', 'Championnat'], ['ecurie', '🏁', 'Prochaine course'], ['__', '', 'Écurie']].concat(MRAIL.filter(([k]) => !['hebdo', 'ligues', 'ecurie'].includes(k))) : MRAIL).map(([k, ic, l]) => k === '__' ? `<span class="rail-h">${l}</span>` : `<a class="${k === tab ? 'on' : ''}" href="#/manager/${k}"${k === tab ? ' aria-current="page"' : ''}><span>${ic}</span><em>${l}</em>${railPing(k)}</a>`).join('')}</nav><div class="hq-main">${debt}${mgHead(tab)}`;
    if (tab === 'pilotes') h += mgrDrivers(ctx);
    else if (tab === 'chassis') h += mgrChassis(ctx);
    else if (tab === 'transferts') h += mgrTransfers(ctx);
    else if (tab === 'rd') { const tc = ctx.ch ? F1.teamColor(ctx.ch.id) : '#e10600'; h += `<div class="rd-team" style="--tc:${tc};--tc-ink:${inkOn(tc)}">${mgrRD(ctx)}</div>`; }
    else if (tab === 'muret') h += mgrStaff(ctx);
    else if (tab === 'garage') h += mgrGarage(ctx);
    else if (tab === 'ligues') h += mgrLeagues(ctx, nl);
    else if (tab === 'sponsors') h += mgrSponsors(ctx);
    else if (tab === 'hebdo') h += mgrWeekly(ctx);
    else if (tab === 'passe') h += mgrPass(ctx);
    else if (tab === 'championnat' && isCareer()) h += mgrChampionship(ctx);
    else h += mgrHome(ctx, nl);
    void race;
    h += '</div></div></div>';
    return isCareer() ? h.replace(/href="#\/manager/g, 'href="#/carriere') : h;
  }
  // mode d'emploi replié : le texte reste accessible sans encombrer l'onglet
  const howto = (summary, body) => `<details class="howto"><summary><span class="howto-i" aria-hidden="true">i</span>${summary}</summary><div class="howto-b">${body}</div></details>`;
  const MG_HEAD = {
    chassis: ['Équipe', 'La monoplace que vous dirigez : vitesse, appui, fiabilité et livrée.'],
    pilotes: ['Pilotes', 'Votre titulaire et le marché : note, potentiel et valeur.'],
    transferts: ['Transferts', 'Votre coéquipier et le marché des transferts, au prix du jour.'],
    muret: ['Muret des stands', 'Le personnel qui vous entoure le dimanche.'],
    garage: ['Garage', 'Équipements du box, mécaniciens et livrées de la monoplace.'],
    sponsors: ['Sponsors', 'Deux emplacements sur la voiture, des objectifs à tenir course après course.'],
    ligues: ['Ligues', 'Votre saison, l\'échelle des ligues et le classement des managers.'],
    championnat: ['Championnat', 'Trois courses par Grand Prix, puis cap sur le suivant. Points F1 à chaque course.'],
  };
  const mgHead = (tab) => { const h = MG_HEAD[tab]; return h ? `<header class="mg-head"><h1>${h[0]}</h1><p>${h[1]}</p></header>` : ''; };
  const pnl = (n, title, body, cls = '', link = '') => `<section class="pnl ${cls}"><header class="pnl-h"><h2>${title}</h2>${link}</header><div class="pnl-b">${body}</div></section>`;
  const pnlLink = (href, txt) => `<a class="pnl-l" href="${href}">${txt}</a>`;
  // Fiche d'expérience d'un pilote (âge, potentiel, progression acquise avec l'écurie)
  function xpBlock(e) {
    const inPt = e.maxed ? 100 : ((e.xp % MG().XP_PER_POINT) / MG().XP_PER_POINT) * 100;
    return `<div class="xp"><div class="row" style="justify-content:space-between;font-size:12px"><span><b>${e.age} ans</b> · ${esc(e.label)} · XP ×${fmt(e.mult, e.mult % 1 ? 1 : 0)}</span><span class="muted">${e.races} course${e.races > 1 ? 's' : ''} avec vous</span></div>
      <div class="xp-bar"><i style="width:${inPt}%"></i></div>
      <div class="row" style="justify-content:space-between;font-size:12px"><span>Progression <b style="color:var(--win)">+${fmt(e.pts, 1)}</b> <span class="muted">/ +${fmt(e.cap, e.cap % 1 ? 1 : 0)} max</span></span><span class="muted">${e.maxed ? 'Plafond atteint' : `${e.next} XP avant le prochain point`}</span></div></div>`;
  }
  // Panneau « Préparation du week-end » : météo prévue tour par tour, réglage aéro, pneus de départ et plan d'arrêts
  function weekendBody(ctx) {
    const { m, race, w } = ctx, T5 = MG().TYRES, fc = ctx.fc;
    const fl = MG().forecastLaps(m.next.seed, race);
    const setupLbl = (v) => (v <= -0.35 ? 'Faible appui (vitesse)' : v >= 0.35 ? 'Fort appui (virages)' : 'Réglage médian');
    const picker = (act, cur, extra = '') => `<div class="tyre-pick sm">${Object.values(T5).map((t) => `<button class="${t.id === cur ? 'on' : ''}" data-action="${act}" ${extra} data-t="${t.id}" style="--ty:${t.color}" title="${esc(t.name)} — ${esc(t.desc)}"><span class="tyre2">${t.id}</span>${t.short}</button>`).join('')}</div>`;
    const NL = MG().lapsOf(race), stops = MG().planFor(m.next.plan, NL).stops;
    const plan = stops.map((p, i) => `<div class="plan-row"><div class="plan-h"><b>Arrêt ${i + 1}</b><span class="plan-lap"><button data-action="plan-lap" data-i="${i}" data-d="-5" aria-label="5 tours plus tôt">«</button><button data-action="plan-lap" data-i="${i}" data-d="-1" aria-label="Plus tôt">−</button><span>tour <b>${p.lap}</b><small class="muted"> / ${NL}</small></span><button data-action="plan-lap" data-i="${i}" data-d="1" aria-label="Plus tard">+</button><button data-action="plan-lap" data-i="${i}" data-d="5" aria-label="5 tours plus tard">»</button></span>${stops.length > 1 || i > 0 ? `<button class="plan-x" data-action="plan-del" data-i="${i}" aria-label="Retirer cet arrêt">✕</button>` : ''}</div>${picker('plan-tyre', p.tyre, `data-i="${i}"`)}</div>`).join('');
    const seq = [m.next.tyre, ...stops.map((p) => p.tyre)];
    const dryOnly = seq.every((t) => MG().isSlick(t)), ok = !dryOnly || new Set(seq).size >= 2;
    return `<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div style="min-width:0"><div class="hq-name" style="font-size:18px">${flag(race.iso, 'sm')} ${esc(race.nameFr)}</div><div class="muted" style="font-size:12px">${esc(race.circuit)} · ${NL} tours</div></div></div>
      <div class="bulletin"><span>${fc.icon}</span><div><small>Radar météo · prévision</small><b>${esc(fc.sky)} · ${fc.temp} °C au départ</b></div></div>
      <div class="fc-strip">${fl.laps.map((x) => `<i class="${x.kind}" title="Tour ${x.lap} : pluie ${x.p} %"></i>`).join('')}</div>
      <div class="fc-segs">${fl.segs.map((g) => `<span>${g.icon} ${esc(g.txt)}</span>`).join('')}</div>
      <div class="muted" style="font-size:11px">Prévision à ± ${Math.round(NL * 0.15)} tours près : une averse annoncée peut arriver plus tôt, plus tard, ou ne pas venir.</div>
      <div class="ctraits">${w.traits.map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join('')}</div>
      <div style="margin-top:14px"><div class="row" style="justify-content:space-between"><b style="font-size:13px">Réglage aéro</b><span class="chip" id="setupLbl">${setupLbl(m.setup)}</span></div>
        <input type="range" id="setupIn" min="-1" max="1" step="0.05" value="${m.setup}" class="slider">
        <div class="row" style="justify-content:space-between;font-size:12px"><span class="muted">⚡ Faible appui</span><span class="muted">🌀 Fort appui</span></div></div>
      <div class="strat"><div class="strat-h"><b>Stratégie de course</b><span class="strat-seq">${seq.map((t) => tyreDot(t, 'sm')).join('<i>→</i>')}</span></div>
        <div class="plan-row"><div class="plan-h"><b>Départ</b><span class="muted" style="font-size:12px">${esc(T5[m.next.tyre].name)}</span></div>${picker('tyre-pick', m.next.tyre)}</div>
        ${plan}
        ${stops.length < 2 ? '<button class="btn sm ghost plan-add" data-action="plan-add">＋ Ajouter un 2e arrêt</button>' : ''}
        <div class="rule ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '⚠️'} Règle des 2 composés : sur course sèche, il faut utiliser au moins deux composés secs différents, sinon +${MG().RULE_PENALTY} s à l'arrivée.${ok ? '' : ' <b>Votre plan ne la respecte pas.</b>'}</div>
        <div class="muted" style="font-size:11px">Le plan s'exécute tout seul en course, mais vous gardez la main au muret : arrêt anticipé, autre composé, rythme.</div></div>`;
  }
  // Préparation du week-end en ligne (pleine largeur) : météo | circuit et réglage | stratégie, côte à côte
  function layoutWeek() {
    const b = $('.p-week .pnl-b'); if (!b || b.querySelector(':scope > .wk-cols')) return;
    const kids = [...b.children], strat = kids.find((k) => k.classList.contains('strat')), tr = kids.find((k) => k.classList.contains('ctraits'));
    if (!strat || !tr) return;
    const i = kids.indexOf(tr), cols = document.createElement('div'); cols.className = 'wk-cols';
    const c1 = document.createElement('div'), c2 = document.createElement('div'), c3 = document.createElement('div');
    kids.slice(0, i).forEach((k) => c1.appendChild(k)); kids.slice(i).filter((k) => k !== strat).forEach((k) => c2.appendChild(k)); c3.appendChild(strat);
    cols.append(c1, c2, c3); b.appendChild(cols);
  }
  function bindSetup() {
    layoutWeek();
    const si = $('#setupIn');
    if (!si) return;
    si.addEventListener('input', () => { const v = +si.value; $('#setupLbl').textContent = v <= -0.35 ? 'Faible appui (vitesse)' : v >= 0.35 ? 'Fort appui (virages)' : 'Réglage médian'; });
    si.addEventListener('change', () => F1.store.setSetup(+si.value));
  }
  function refreshWeekend() { const el = $('.p-week .pnl-b'); if (el) { el.innerHTML = weekendBody(mgrCtx()); bindSetup(); } }

  /* =====================================================================================
     CARRIÈRE — une expérience à part : week-end (point presse, qualifs, 3 courses), duel, contrats
     ===================================================================================== */
  const CR_TABS = [['weekend', 'Week-end', '<path d="M4 20V5m0 0h11l-2 3 2 3H4"/>'], ['championnat', 'Championnat', '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M12 13v4M8.5 20h7"/>'], ['duel', 'Duel', '<path d="M5 19 19 5M5 5l14 14"/>'],
    ['presse', 'Presse', '<path d="M4 5h13v14H6a2 2 0 0 1-2-2Z"/><path d="M17 8h3v9a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3"/>'], ['contrats', 'Contrats', '<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'], ['rd', 'Bureau d\'études', '<path d="M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3M8 3h8"/>'],
    ['garage', 'Garage', '<path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-7h10v7"/>'], ['muret', 'Muret', '<path d="M5 14v-2a7 7 0 0 1 14 0v2"/><rect x="3.5" y="13" width="4" height="6" rx="1"/><rect x="16.5" y="13" width="4" height="6" rx="1"/>'],
    ['sponsors', 'Sponsors', '<path d="M4 7h16v12H4z"/><path d="M9 7V5h6v2"/>']];
  const crIco = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  // écuries et pilotes accessibles : les plus faibles du plateau en début de carrière, un peu plus chaque saison
  function crAllowed(ctx) {
    const c = F1.store.career().cal, mk = ctx.mk;
    const teams = mk.chassis.slice().sort((a, b) => MG().carRating(MG().carStats(a, {}, {})) - MG().carRating(MG().carStats(b, {}, {}))).slice(0, Math.min(mk.chassis.length, 4 + 2 * (c.season - 1)));
    const drivers = mk.drivers.slice().sort((a, b) => a.rating - b.rating).slice(0, Math.min(mk.drivers.length, 7 + 3 * (c.season - 1)));
    return { teams, drivers, tIds: new Set(teams.map((x) => x.id)), dIds: new Set(drivers.map((x) => x.id)) };
  }
  // pastille pilote : photo, numéro dans la typographie de l'écurie, nom
  function crDrvChip(d, num, ch, role) {
    const p = F1.visuals.portrait(d.id), team = ch ? ch.id : d.teamId, col = F1.teamColor(team);
    return `<div class="crx-dc" style="--dc:${col}"><span class="crx-dc-ph"><i>${esc(d.code || '')}</i>${p ? `<img src="${esc(p.img)}" alt="" onerror="this.remove()">` : ''}</span>${num ? `<span class="crx-dc-n">${F1.num.html(num, team, { color: '#fff' })}</span>` : ''}<span class="crx-dc-t"><small>${role}</small><b>${esc(d.name)}</b></span></div>`;
  }
  const crNum = (id, team) => { const n = id === 'me' ? F1.store.mgr().number || (mgrCtx().drvM || {}).number : F1.num.ofDriver(id) || ((S.mk && S.mk.byDriver.get(id)) || {}).number; return n ? `<span class="crx-num">${F1.num.html(n, team, { color: 'currentColor' })}</span>` : ''; };
  function pageCareer(tab) {
    const ctx = mgrCtx(), { m, ch, drvM, mate } = ctx, c = F1.store.career().cal, s = S.f1 || S.season, N = s.races.length;
    const signed = !!(ch && drvM && mate);
    if (!signed) tab = 'contrats';
    tab = tab || 'weekend';
    const col = ch ? F1.teamColor(ch.id) : '#e9be3e';
    const st = F1.store.careerStandings(), myPos = st.findIndex((x) => x.id === 'me') + 1;
    const race = mgrRace();
    const formTxt = (f) => (f >= 2 ? 'En feu' : f >= 1 ? 'Confiant' : f <= -2 ? 'Sous pression' : f <= -1 ? 'Tendu' : 'Neutre');
    const pop = c.pop || 40;
    const ring = (v, lbl, sub) => `<div class="crx-ring" style="--v:${v}"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="t"/><circle cx="22" cy="22" r="19" class="v" pathLength="100" stroke-dasharray="${v} 100"/></svg><b>${v}</b><span><small>${lbl}</small>${sub}</span></div>`;
    const head = `<header class="crx-head" style="--tc:${col}">${ch ? `<div class="crx-head-car" aria-hidden="true">${F1.visuals.car(ch.id, { view: 'side', shadow: false, number: m.number || (drvM && drvM.number), numTeam: ch.id, sponsor: livery(m) })}</div>` : ''}
        <div class="crx-id"><span class="crx-kicker">${crIco('<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M12 13v4M8.5 20h7"/>')}Carrière · saison ${c.over ? c.over.season : c.season}</span>
          <h1>${ch ? esc(ch.name) : 'Nouvelle écurie'}</h1>
          ${drvM ? `<div class="crx-drivers">${crDrvChip(drvM, m.number || drvM.number, ch, 'Pilote')}${mate ? crDrvChip(mate, mate.number, ch, 'Coéquipier') : ''}</div>` : '<p>Signez une écurie et deux pilotes pour lancer la saison.</p>'}${pcWallet(m.pc, 'Carrière')}</div>
        <div class="crx-stats">${ring(pop, 'Popularité', pop >= 70 ? 'Star du paddock' : pop >= 50 ? 'Apprécié' : pop >= 30 ? 'Discret' : 'Contesté')}
          <div class="crx-stat"><small>Forme</small><b class="${(drvM && drvM.form) > 0 ? 'up' : (drvM && drvM.form) < 0 ? 'down' : ''}">${formTxt(c.form || 0)}</b><span>${c.form > 0 ? '+' : ''}${c.form || 0} pour ce Grand Prix</span></div>
          <div class="crx-stat"><small>Championnat</small><b>${myPos ? 'P' + myPos : '—'}</b><span>${c.pts.me || 0} points</span></div>
          <div class="crx-stat"><small>Calendrier</small><b>${c.over ? 'Fin' : `${c.gp + 1}<i>/${N}</i>`}</b><span>${c.over ? 'Saison bouclée' : esc(race.nameFr.replace('Grand Prix', 'GP'))}</span></div>
          <div class="crx-stat"><small>Courses</small><b>${F1.store.racesLeft()}<i>/${F1.store.racesPerDay()}</i></b><span>gratuites disponibles</span></div></div>
      </header>
      <nav class="crx-nav" aria-label="Sections de la Carrière">${CR_TABS.map(([k, l, ic]) => `<a href="#/carriere/${k}" class="${k === tab ? 'on' : ''}${!signed && k !== 'contrats' ? ' off' : ''}"${k === tab ? ' aria-current="page"' : ''}>${crIco(ic)}<span>${l}</span></a>`).join('')}</nav>`;
    let body = '';
    if (tab === 'weekend') body = crWeekend(ctx);
    else if (tab === 'championnat') body = mgrChampionship(ctx);
    else if (tab === 'duel') body = crDuel(ctx);
    else if (tab === 'presse') body = crPress(ctx);
    else if (tab === 'contrats') body = crContracts(ctx);
    else if (tab === 'rd') body = `<div class="rd-team" style="--tc:${col};--tc-ink:${inkOn(col)}">${mgrRD(ctx)}</div>`;
    else if (tab === 'garage') body = mgrGarage(ctx);
    else if (tab === 'muret') body = mgrStaff(ctx);
    else if (tab === 'sponsors') body = mgrSponsors(ctx);
    const html = `<div class="hq crx" style="--tc:${col};--tc-ink:${inkOn(col)}">${head}<div class="crx-body">${body}</div></div>`;
    return html.replace(/href="#\/manager/g, 'href="#/carriere');
  }

  // ---------- Week-end : point presse → qualifications → course (×3 par Grand Prix) ----------
  function crWeekend(ctx) {
    const c = F1.store.career().cal, R = F1.store.RUNS_PER_GP, race = mgrRace(), s = S.f1 || S.season, N = s.races.length;
    if (c.over) return careerStrip(ctx);
    const media = c.mediaGp === c.gp, q = F1.store.careerQualiFor();
    const gpRec = c.gps.find((g) => g.season === c.season && g.gp === c.gp);
    const step = (n, state, title, txt, act) => `<li class="crx-step ${state}"><span class="crx-n">${state === 'done' ? '✓' : n}</span><div><b>${title}</b><span>${txt}</span></div>${act || ''}</li>`;
    const steps = `<ol class="crx-steps">
      ${step(1, media ? 'done' : 'now', 'Point presse', media ? `Forme ${c.form > 0 ? '+' : ''}${c.form} · popularité ${c.pop}` : 'Trois questions, une minute : obligatoire avant les qualifs', media ? '' : '<button class="btn" data-action="cr-media">Répondre aux médias</button>')}
      ${step(2, q ? 'done' : media ? 'now' : 'wait', `Qualifications · course ${c.run + 1}`, q ? `Vous partez <b>P${q.myPos}</b>${q.matePos ? ` · coéquipier P${q.matePos}` : ''}` : 'Un tour lancé fixe votre place sur la grille', !q && media ? '<button class="btn" data-action="cr-quali">Lancer les qualifs</button>' : '')}
      ${step(3, q ? 'now' : 'wait', `Course ${c.run + 1} sur ${R}`, q ? `${MG().lapsOf(race)} tours · départ P${q.myPos}` : 'Disponible après les qualifications', q ? raceButton('btn crx-go') : '')}
    </ol>`;
    const runs = Array.from({ length: R }, (_, i) => { const r = gpRec && gpRec.res[i]; return `<div class="crx-run ${r ? 'done' : i === c.run ? 'next' : ''}"><small>Course ${i + 1}</small><b>${r ? (r.dnf ? 'Abandon' : 'P' + r.pos) : i === c.run ? 'À venir' : '—'}</b><span>${r ? `${r.q ? 'parti P' + r.q + ' · ' : ''}+${r.pts} pts` : ''}</span></div>`; }).join('');
    const map = race.circuitId ? trackSvg(race.circuitId, F1.teamColor(ctx.ch.id), true) : '';
    return `<section class="crx-gp"><div class="crx-gp-l"><small>Grand Prix ${c.gp + 1} sur ${N} · ${esc(race.circuit || '')}</small><h2>${flag(race.iso, 'lg')} ${esc(race.nameFr)}</h2>${steps}</div>
        <figure class="crx-gp-map hx-map">${map}</figure></section>
      <div class="crx-line">${crPilotCard(ctx, ctx.drvM, F1.store.mgr().number || ctx.drvM.number, 'Votre pilote', q && q.myPos, true)}${ctx.mate ? crPilotCard(ctx, ctx.mate, ctx.mate.number, 'Coéquipier', q && q.matePos, false) : ''}</div>
      <div class="crx-runs">${runs}</div>
      <div class="crx-two"><section class="crx-card">${crDuelMini(ctx)}</section><section class="crx-card">${crPressLog(c)}</section></div>
      <section class="crx-card crx-prep"><header><h3>Préparation de la course</h3><span>Réglage aéro, pneus et stratégie : ils s'appliquent aux qualifs et à la course</span></header><div class="p-week"><div class="pnl-b">${weekendBody(ctx)}</div></div></section>`;
  }
  // fiche pilote : numéro géant dans la typographie de l'écurie, photo, monoplace, jauges et place sur la grille
  function crPilotCard(ctx, d, n, role, gridPos, mine) {
    const team = ctx.ch.id, col = F1.teamColor(team), pt = F1.visuals.portrait(d.id), c = F1.store.career().cal;
    const bar = (l, v) => `<div class="cpc-bar"><small>${l}</small><span><i style="width:${Math.max(4, Math.min(100, (v - 50) * 2))}%"></i></span><b>${Math.round(v)}</b></div>`;
    const form = mine && c.form ? `<span class="cpc-form ${c.form > 0 ? 'up' : 'down'}">Forme ${c.form > 0 ? '+' : ''}${c.form}</span>` : '';
    return `<article class="cpc" style="--dc:${col};--di:${inkOn(col)}">
      <div class="cpc-num" aria-hidden="true">${n ? F1.num.html(n, team, { color: 'currentColor' }) : ''}</div>
      <div class="cpc-stripe" aria-hidden="true"></div>
      <header class="cpc-h"><span class="cpc-ph"><i>${esc(d.code || '')}</i>${pt ? `<img src="${esc(pt.img)}" alt="" onerror="this.remove()">` : ''}</span>
        <div class="cpc-id"><small>${role} · ${esc(ctx.ch.name)}</small><b>${esc(d.given || '')} <strong>${esc(d.family || d.name)}</strong></b>${form}</div>
        ${n ? `<span class="cpc-plate">${F1.num.html(n, team, { color: 'currentColor' })}</span>` : ''}</header>
      <div class="cpc-car">${F1.visuals.car(team, { view: 'side', shadow: false, number: n, numTeam: team, sponsor: livery(F1.store.mgr()) })}</div>
      <div class="cpc-f"><div class="cpc-bars">${bar('Rythme', d.pace)}${bar('Combativité', d.craft)}${bar('Régularité', d.cons)}</div>
        <div class="cpc-grid"><small>${gridPos ? 'Grille' : 'Note'}</small><b>${gridPos ? 'P' + gridPos : d.rating}</b></div></div></article>`;
  }
  // revue de presse du week-end : les dernières dépêches, dont celles qui citent le pilote
  function crPressLog(c) {
    const items = (c.news || []).slice(0, 5), CAT = { presse: 'Presse', qualif: 'Qualifs', course: 'Course', rumeur: 'Rumeur' };
    return `<header><h3>Revue de presse</h3><a href="#/carriere/presse">Toutes les dépêches</a></header><div class="crx-pop"><i style="width:${c.pop}%"></i></div><small class="muted crx-popl">Popularité ${c.pop} / 100</small>
      ${items.length ? `<ul class="crx-news">${items.map((x) => `<li class="${x.quote ? 'q' : ''}"><span class="crx-news-c c-${x.cat}">${CAT[x.cat] || 'Presse'}</span><div><b>${esc(x.title)}</b>${x.quote ? `<q>${esc(x.quote)}</q>` : ''}<small>${esc(x.src)} · ${pwAgo(x.t)}</small></div></li>`).join('')}</ul>`
        : '<p class="muted">Aucune dépêche pour l\'instant : répondez aux médias pour faire parler de vous.</p>'}`;
  }
  function crPressLogOld(c) {
    const last = c.media.slice(0, 4);
    return `<header><h3>Revue de presse</h3><span>Popularité ${c.pop} / 100</span></header><div class="crx-pop"><i style="width:${c.pop}%"></i></div>
      ${last.length ? `<ul class="crx-press">${last.map((x) => `<li><span>Saison ${x.season} · GP ${x.gp + 1}</span><b class="${x.pop >= 0 ? 'up' : 'down'}">${x.pop >= 0 ? '+' : ''}${x.pop} popularité</b><b class="${x.form >= 0 ? 'up' : 'down'}">forme ${x.form >= 0 ? '+' : ''}${x.form}</b></li>`).join('')}</ul>` : '<p class="muted">Aucune conférence de presse pour l\'instant.</p>'}
      <p class="muted crx-note">La popularité augmente la prime de chaque course (jusqu'à +25 %). La forme agit sur le rythme, la combativité et la régularité du pilote pendant tout le Grand Prix.</p>`;
  }


  /* ---------- Presse de la Carrière : actualités fictives, générées au fil de la saison ----------
     Chaque joueur obtient ses propres articles (tirages aléatoires), écrits à partir de ses résultats et de ses déclarations. */
  const CR_SRC = ['Le Mag du Paddock', 'Pit Lane Hebdo', 'Radio Stand', 'Grille de Départ', 'TurboPresse', "L'Écho des Stands", 'Chicane Info', 'Le Fil du Muret'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  function crNewsVars() {
    const ctx = mgrCtx(), c = F1.store.career().cal, race = mgrRace();
    return { ctx, c, v: { pilote: ctx.drvM ? ctx.drvM.name : 'le pilote', nom: ctx.drvM ? ctx.drvM.family || ctx.drvM.name : 'le pilote', equipier: ctx.mate ? ctx.mate.family || ctx.mate.name : 'son équipier', ecurie: ctx.ch ? ctx.ch.name : "l'écurie", gp: race.nameFr, saison: c.season } };
  }
  function crNewsPost(cat, title, body, extra = {}) {
    const { ctx } = crNewsVars();
    F1.store.careerNewsAdd({ cat, src: pick(CR_SRC), title, body, drv: extra.drv || (ctx.drvM && ctx.drvM.id), team: ctx.ch && ctx.ch.id, quote: extra.quote || null, hot: !!extra.hot, tag: extra.tag || null });
  }
  function crNewsMedia(answers) {
    const { v } = crNewsVars(), best = answers.slice().sort((a, b) => Math.abs(b.pop) - Math.abs(a.pop))[0] || {};
    const tot = answers.reduce((a, x) => a + (x.pop || 0), 0); v.citation = best.t || '';
    const T = tot >= 4 ? ['« {citation} » : {nom} galvanise le paddock avant le {gp}', '{nom} crève l\'écran en conférence de presse', 'Le ton monte chez {ecurie} : {nom} affiche ses ambitions']
      : tot >= 0 ? ['{nom} reste mesuré avant le {gp}', 'Conférence sans fausse note pour {nom}', '« {citation} » : le message de {nom} avant le {gp}']
      : ['Malaise en conférence : {nom} agace les journalistes', '{nom} sur la défensive avant le {gp}', 'Réponses glaciales : le clan {ecurie} sous tension'];
    const others = answers.filter((x) => x !== best && x.t);
    if (others.length) { const o = pick(others); v.c2 = o.t; crNewsPost('presse', fill(pick(['Ce qu\'il faut retenir de la conférence de {nom}', 'Décryptage : le message de {nom} à {ecurie}', '« {c2} » : {nom} se confie avant le {gp}']), v), `Autre moment de la conférence : à la question « ${o.q} », ${v.pilote} a répondu « ${o.t} ».`, { quote: o.t }); }
    if (Math.random() < 0.7) crNewsPost('rumeur', fill(pick(tot >= 0 ? ['Le paddock salue la confiance de {nom}', 'Les mots de {nom} font le tour du paddock', '{equipier} réagit aux déclarations de {nom}'] : ['Les propos de {nom} passent mal chez {ecurie}', '{equipier} recadre {nom} après la conférence', 'Le patron de {ecurie} temporise après les déclarations de {nom}']), v), pick(['Plusieurs membres de l\'équipe ont réagi en coulisses.', 'Les réseaux sociaux se sont emparés de la séquence.', 'Une réaction attendue avant le début des essais.']));
    crNewsPost('presse', fill(pick(T), v), `Interrogé avant le ${v.gp}, ${v.pilote} a répondu à trois questions. ${answers.map((x) => x.q ? `À « ${x.q} », il a répondu : « ${x.t} »` : '').filter(Boolean).join(' ')}`, { quote: best.t, hot: Math.abs(tot) >= 5 });
  }
  function crNewsQuali(q) {
    const { v } = crNewsVars(); v.pos = q.myPos; v.mp = q.matePos;
    const T = q.err ? ['Faute en qualifs : {nom} s\'élance P{pos}', 'Le pari du tout ou rien coûte cher à {nom}', '{nom} dans le mur des chronos au {gp}']
      : q.myPos <= 3 ? ['Exploit en qualifs : {ecurie} en P{pos} au {gp} !', '{nom} décroche une place en première ligne', 'Le paddock n\'en revient pas : {nom} P{pos}']
      : q.myPos <= 10 ? ['{nom} P{pos} : {ecurie} dans le top 10 des qualifs', 'Belle séance pour {nom}, qualifié P{pos}', '{ecurie} sourit après les qualifs du {gp}']
      : ['{nom} P{pos} : {ecurie} limite la casse', 'Qualifs compliquées pour {nom} au {gp}', 'Les limites de la monoplace {ecurie} exposées en qualifs'];
    const duel = v.mp ? (q.myPos < v.mp ? ` Il devance ${v.equipier} (P${v.mp}) dans le duel interne.` : ` ${v.equipier}, P${v.mp}, le devance cette fois.`) : '';
    crNewsPost('qualif', fill(pick(T), v), `${v.pilote} partira P${q.myPos} sur la grille du ${v.gp}.${duel}`, { hot: q.myPos <= 3 || q.err, tag: `P${q.myPos}` });
  }
  function crNewsRace(rec) {
    const { v, c, ctx } = crNewsVars(); v.pos = rec.pos; v.pts = rec.dnf ? 0 : (MG().F1_POINTS[rec.pos - 1] || 0);
    const T = rec.dnf ? ['Abandon pour {nom} au {gp}', 'Coup dur : {nom} contraint à l\'abandon', 'Le {gp} tourne court pour {ecurie}']
      : rec.pos === 1 ? ['VICTOIRE ! {nom} et {ecurie} écrivent l\'histoire', '{nom} triomphe au {gp}', 'Le petit poucet {ecurie} s\'impose au {gp}']
      : rec.pos <= 3 ? ['Podium pour {nom} au {gp} !', '{nom} sur la boîte : {ecurie} exulte', 'P{pos} : {nom} signe un résultat retentissant']
      : rec.pos <= 10 ? ['{nom} marque {pts} points au {gp}', 'Dans les points : {nom} P{pos}', '{ecurie} engrange {pts} points précieux']
      : ['{nom} P{pos} : pas de points au {gp}', 'Course difficile pour {ecurie} au {gp}', '{nom} finit P{pos}, loin des points'];
    const st = F1.store.careerStandings(), my = st.findIndex((x) => x.id === 'me') + 1;
    crNewsPost('course', fill(pick(T), v), `${v.pilote} termine ${rec.dnf ? 'sur abandon' : 'P' + rec.pos} au ${v.gp}${v.pts ? ` et marque ${v.pts} points` : ''}. Il pointe désormais P${my} au championnat avec ${c.pts.me || 0} points.${rec.mate ? ` Son équipier ${v.equipier} ${rec.mate.dnf ? 'a abandonné' : 'a terminé P' + rec.mate.pos}.` : ''}`, { hot: rec.pos <= 3 && !rec.dnf, tag: rec.dnf ? 'AB' : `P${rec.pos}` });
    // rumeurs et échos du paddock, au hasard
    if (Math.random() < 0.45) {
      const pop = c.pop || 40, lead = c.duel.q[0] + c.duel.r[0] - c.duel.q[1] - c.duel.r[1];
      const R = [
        ...(pop >= 60 ? ['Rumeur : un top team suivrait de près {nom}', 'Le phénomène {nom} intéresse les grandes écuries', 'Les sponsors se bousculent autour de {nom}'] : []),
        ...(lead < -1 ? ['Tension chez {ecurie} : {equipier} prend l\'ascendant', '{nom} sous pression face à {equipier}', 'Le duel interne tourne en faveur de {equipier}'] : []),
        ...(lead > 1 ? ['{equipier} en difficulté face à {nom}', '{nom} impose sa loi chez {ecurie}'] : []),
        'Évolution en vue : {ecurie} préparerait un nouveau fond plat', 'Les ingénieurs {ecurie} travaillent jour et nuit à l\'usine', 'Un nouveau sponsor tournerait autour de {ecurie}', "Le patron de {ecurie} croit en sa paire de pilotes", 'Simulateur : {nom} enchaîne les heures avant le prochain Grand Prix',
      ];
      crNewsPost('rumeur', fill(pick(R), v), pick(['Selon nos informations, rien n\'est encore officiel.', 'Une source proche de l\'équipe évoque des discussions avancées.', 'Le paddock bruisse de cette information depuis plusieurs jours.', "L'intéressé n'a pas souhaité commenter."]), { drv: lead < -1 && ctx.mate ? ctx.mate.id : null });
    }
    if (rec.career && rec.career.seasonDone) crNewsPost('course', rec.career.myPos === 1 ? `${v.nom} champion du monde !` : `Saison ${v.saison} bouclée : ${v.nom} P${rec.career.myPos} au championnat`, `Fin de saison pour ${v.ecurie}. ${rec.career.myPos === 1 ? 'Un titre historique pour une écurie modeste.' : 'Rendez-vous la saison prochaine pour viser plus haut.'}`, { hot: true });
  }
  const CR_CAT = { presse: ['pad', 'Presse'], qualif: ['tech', 'Qualifs'], course: ['reg', 'Course'], rumeur: ['wx', 'Rumeur'] };
  function crPressVisual(x) {
    // monoplace de l'écurie en fond, photo du pilote par-dessus (retirée si elle ne charge pas)
    const p = x.drv && F1.visuals.portrait(x.drv);
    return `<div class="crp-vis">${x.team ? `<div class="pw-car">${F1.visuals.car(x.team, { view: 'side', shadow: false })}</div>` : ''}${p ? `<img class="pw-img portrait" src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>`;
  }
  function crPress(ctx) {
    const c = F1.store.career().cal, items = c.news || [], col = ctx.ch ? F1.teamColor(ctx.ch.id) : '#e9be3e';
    const seen = c.newsSeen || 0; c.newsSeen = Date.now(); F1.store.save();
    const isNew = (x) => x.t > seen;
    const ago = (t) => pwAgo(t);
    const num = (x) => { const n = x.drv === (ctx.drvM && ctx.drvM.id) ? F1.store.mgr().number || ctx.drvM.number : x.drv && F1.num.ofDriver(x.drv); return n ? `<div class="pwb-num">${F1.num.html(n, x.team || 'red_bull', { color: 'currentColor' })}</div>` : ''; };
    if (!items.length) return `<section class="pdw-page crx-press"><div class="pdw-hero"><div class="pdw-title">${PW_ICON}<h1 class="pdw-word">Paddock Wire · Carrière</h1></div><p class="muted">Les journalistes suivent votre écurie : conférences de presse, qualifs, courses et rumeurs apparaîtront ici au fil de la saison.</p></div><div class="empty">Aucune dépêche pour l'instant. Répondez aux médias avant le premier Grand Prix.</div></section>`;
    const tick = items.slice(0, 12).map((x) => `<a><time>${new Date(x.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>${esc(x.title)}</a>`).join('<span class="pw-sep">◆</span>');
    const brk = items.find((x) => x.hot) || items[0], tops = items.filter((x) => x !== brk).slice(0, 3);
    const tag = (x) => x.tag ? `<span class="pw-tag" style="--tc:${col}">${esc(x.tag)}</span>` : '';
    const cat = (x) => CR_CAT[x.cat] || CR_CAT.presse;
    const breaking = `<article class="pwb" style="--tc:${col};--ti:${inkOn(col)}"><div class="pwb-bg"></div><div class="pwb-vis">${crPressVisual(brk)}</div>${num(brk)}
      <div class="pwb-top"><span class="pwb-alert"><i></i>Alerte paddock</span><b class="pwb-word">Breaking</b></div>
      <div class="pwb-body"><div class="pwb-meta"><span class="pdw-cat ${cat(brk)[0]}">${cat(brk)[1]}</span><span>${esc(brk.src)}</span><time>${ago(brk.t)}</time>${isNew(brk) ? '<span class="pw-new">Nouveau</span>' : ''}</div>
        <h2 class="pwb-head">${esc(brk.title)}</h2><p class="pwb-sub">${esc(brk.body)}</p>${brk.quote ? `<blockquote class="crp-quote">« ${esc(brk.quote)} »</blockquote>` : ''}<div class="pwb-foot"><div class="pw-tags">${tag(brk)}</div></div></div></article>`;
    const top = (x) => `<div class="pwt" style="--tc:${col}"><div class="pwt-vis">${crPressVisual(x)}<span class="pdw-cat ${cat(x)[0]}">${cat(x)[1]}</span></div><div class="pwt-b"><div class="pwt-meta"><span>${esc(x.src)}</span><time>${ago(x.t)}</time>${isNew(x) ? '<span class="pw-new">Nouveau</span>' : ''}</div><h3>${esc(x.title)}</h3><div class="pw-tags">${tag(x)}</div></div></div>`;
    const dayKey = (t) => { const x = new Date(t), td = new Date(); const diff = Math.round((new Date(td.toDateString()) - new Date(x.toDateString())) / 864e5); return diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Hier' : x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); };
    const groups = []; items.forEach((x) => { const k = dayKey(x.t); const g = groups[groups.length - 1]; if (g && g.k === k) g.items.push(x); else groups.push({ k, items: [x] }); });
    const row = (x) => `<article class="pwr ${isNew(x) ? 'new' : ''}" style="--tc:${col}"><div class="pwr-time"><b>${new Date(x.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b><small>${ago(x.t)}</small></div><i class="pwr-dot"></i>
      <div class="pwr-card"><div class="pwr-main"><header class="pdw-meta"><span class="pdw-cat ${cat(x)[0]}">${cat(x)[1]}</span><span>${esc(x.src)}</span>${isNew(x) ? '<span class="pw-new">Nouveau</span>' : ''}</header>
        <h3>${esc(x.title)}</h3><p>${esc(x.body)}</p>${x.quote ? `<blockquote class="crp-quote">« ${esc(x.quote)} »</blockquote>` : ''}<div class="pw-tags">${tag(x)}</div></div><div class="pwr-vis">${crPressVisual(x)}</div></div></article>`;
    const quotes = c.media.length ? items.filter((x) => x.quote).slice(0, 5).map((x) => `<li><q>${esc(x.quote)}</q><small>${esc(x.src)} · ${ago(x.t)}</small></li>`).join('') : '';
    const side = `<aside class="pdw-side"><div class="card pdw-board"><div class="pdw-bh"><h3>Cote médiatique</h3><span class="muted">${esc((ctx.drvM || {}).name || '')}</span></div>
        <div class="crp-meter"><b>${c.pop}</b><small>/ 100 popularité</small><div class="crx-pop"><i style="width:${c.pop}%"></i></div></div>
        <div class="crp-meter"><b class="${c.form > 0 ? 'up' : c.form < 0 ? 'down' : ''}">${c.form > 0 ? '+' : ''}${c.form}</b><small>forme pour ce Grand Prix</small></div>
        ${quotes ? `<h4>Vos déclarations</h4><ul class="crp-quotes">${quotes}</ul>` : ''}</div>
      <details class="card pdw-how"><summary>D'où viennent ces dépêches ?</summary><ul><li>Ce sont des <b>actualités fictives</b>, écrites au fil de votre carrière : vos conférences de presse, vos qualifs, vos courses, et les rumeurs du paddock.</li><li>Elles sont tirées au hasard pour chaque joueur : deux carrières ne racontent jamais la même histoire.</li></ul></details></aside>`;
    return `<section class="pdw-page crx-press"><div class="pdw-hero"><div class="pdw-title">${PW_ICON}<h1 class="pdw-word">Paddock Wire · Carrière</h1></div><p class="muted">Ce que la presse raconte de votre écurie. Dépêches fictives, propres à votre carrière.</p></div>
      <div class="pw-ticker"><span class="pw-onair"><i></i>En direct</span><div class="pw-tk"><div class="pw-tk-in">${tick}<span class="pw-sep">◆</span>${tick}</div></div></div>
      ${breaking}${tops.length ? `<div class="pwt-row">${tops.map(top).join('')}</div>` : ''}
      <div class="pdw-grid"><div class="pdw-feed">${groups.map((g) => `<section class="pw-day"><h4 class="pw-day-h">${esc(g.k)}<span>${g.items.length} dépêche${g.items.length > 1 ? 's' : ''}</span></h4>${g.items.map(row).join('')}</section>`).join('')}</div>${side}</div></section>`;
  }

  // ---------- Point presse : 3 questions, 60 secondes ----------
  const CR_Q = [
    ['Votre monoplace est l\'une des plus lentes du plateau. Quel est l\'objectif ce week-end ?', [['Marquer des points, rien de moins.', 4, -1], ['Progresser course après course, sans brûler les étapes.', 1, 2], ['On fera avec ce qu\'on a.', -3, 0]]],
    ['On dit que votre coéquipier a été plus rapide ces derniers temps. Votre réaction ?', [['Le chrono parlera dimanche.', 3, 1], ['Il fait du bon travail, on se pousse mutuellement.', 2, 1], ['Il a eu de la chance, rien de plus.', -2, 2]]],
    ['Les ingénieurs ont-ils apporté des évolutions pour ce Grand Prix ?', [['Oui, et j\'ai hâte de les essayer en piste.', 2, 1], ['Je préfère ne rien promettre avant d\'avoir roulé.', 0, 1], ['Pas assez à mon goût, il faut accélérer.', -1, -1]]],
    ['Ce circuit vous convient-il ?', [['C\'est l\'un de mes préférés, j\'y suis à l\'aise.', 2, 2], ['Chaque circuit a ses pièges, on s\'adapte.', 1, 1], ['Franchement, pas vraiment.', -2, -2]]],
    ['Un top team s\'intéresserait à vous. Rumeur ou réalité ?', [['Je suis concentré sur mon équipe actuelle.', 2, 1], ['Ce n\'est jamais désagréable d\'être regardé.', 3, -1], ['Pas de commentaire.', -1, 0]]],
    ['La pression monte après les derniers résultats. Comment la gérez-vous ?', [['Elle me motive, j\'adore ça.', 2, 1], ['Je reste dans ma bulle, une course à la fois.', 0, 2], ['Je ne lis pas ce qui se dit.', -1, 0]]],
    ['Les fans attendent un coup d\'éclat. Vous allez prendre des risques ?', [['Je vais tout donner dès le premier tour.', 4, -1], ['Les risques calculés, oui. Les coups de poker, non.', 1, 2], ['Ce n\'est pas le moment de faire n\'importe quoi.', -1, 1]]],
    ['La météo pourrait jouer un rôle. Un avantage pour vous ?', [['Sous la pluie, tout est possible.', 3, 1], ['On a des plans pour chaque scénario.', 1, 2], ['Je préfère une course sèche.', -1, 0]]],
    ['Votre équipe manque de moyens. Est-ce frustrant ?', [['On fait des miracles avec ce qu\'on a.', 3, 1], ['On travaille dur, les résultats viendront.', 1, 1], ['Oui, et la direction le sait.', -3, -1]]],
    ['Quel message pour vos supporters ?', [['Merci, on va leur donner des raisons d\'y croire.', 3, 1], ['Restez avec nous, on construit quelque chose.', 2, 1], ['Rien de spécial.', -2, 0]]],
  ];
  function crMediaOpen() {
    const c = F1.store.career().cal; if (c.mediaGp === c.gp) return;
    const r = (n) => { let x = MG().hash(`press-${c.season}-${c.gp}-${n}`); return x; };
    const pool = CR_Q.map((q, i) => [q, r(i)]).sort((a, b) => a[1] - b[1]).slice(0, 3).map((x) => x[0]);
    const answers = []; let i = 0, left = 60, timer;
    const draw = () => {
      const [q, opts] = pool[i];
      $('#crMedia').innerHTML = `<div class="crm-top"><span class="crm-live">● En direct</span><span>Question ${i + 1} sur 3</span><span class="crm-t" id="crmT">${left} s</span></div><div class="crm-bar"><i id="crmBar" style="width:${(left / 60) * 100}%"></i></div>
        <p class="crm-q">« ${esc(q)} »</p><div class="crm-a">${opts.map(([t], k) => `<button class="crm-btn" data-crm="${k}">${esc(t)}</button>`).join('')}</div>`;
    };
    const finish = () => {
      clearInterval(timer);
      while (answers.length < 3) answers.push({ pop: -2, form: 0, t: 'Pas de commentaire' });
      const res = F1.store.careerMedia(answers);
      try { crNewsMedia(answers.filter((x) => x.t && x.t !== 'Pas de commentaire')); } catch (e) { /* presse facultative */ }
      $('#crMedia').innerHTML = `<div class="crm-end"><small>Fin du point presse</small><h3>${res.pop >= 4 ? 'Les médias adorent' : res.pop >= 0 ? 'Conférence maîtrisée' : 'Réponses mal reçues'}</h3>
        <div class="crm-res"><div><small>Popularité</small><b class="${res.pop >= 0 ? 'up' : 'down'}">${res.pop >= 0 ? '+' : ''}${res.pop}</b><span>${res.total} / 100</span></div><div><small>Forme du pilote</small><b class="${res.form >= 0 ? 'up' : 'down'}">${res.form >= 0 ? '+' : ''}${res.form}</b><span>pour ce Grand Prix</span></div></div>
        <button class="btn" data-action="m-close">Passer aux qualifications</button></div>`;
    };
    modal(`<div class="crm" id="crMedia"></div>`);
    draw();
    timer = setInterval(() => { left--; const t = $('#crmT'), b = $('#crmBar'); if (!t) { clearInterval(timer); return; } t.textContent = left + ' s'; b.style.width = (left / 60) * 100 + '%'; if (left <= 0) finish(); }, 1000);
    $('#crMedia').addEventListener('click', (e) => { const b = e.target.closest('[data-crm]'); if (!b) return; const [t, pop, form] = pool[i][1][+b.dataset.crm]; answers.push({ pop, form, t, q: pool[i][0] }); i++; if (i >= 3) finish(); else draw(); });
  }

  // ---------- Qualifications : un tour lancé, trois approches ----------
  function crQualiOpen() {
    const c = F1.store.career().cal;
    if (c.mediaGp !== c.gp) return crMediaOpen();
    if (F1.store.careerQualiFor()) return;
    modal(`<div class="crq" id="crQuali"><small class="crq-k">Qualifications · course ${c.run + 1}</small><h2>Quelle approche pour le tour lancé ?</h2>
      <div class="crq-opts">${[['safe', 'Tour propre', 'Peu de risque, un chrono fiable.'], ['push', 'Tour engagé', 'Plus rapide en moyenne, un peu plus aléatoire.'], ['all', 'Tout ou rien', 'Le meilleur chrono possible, mais 1 chance sur 4 de faire une erreur.']].map(([k, t, d]) => `<button class="crq-opt" data-crq="${k}"><b>${t}</b><span>${d}</span></button>`).join('')}</div></div>`);
    $('#crQuali').addEventListener('click', (e) => { const b = e.target.closest('[data-crq]'); if (b) crQualiRun(b.dataset.crq); });
  }
  function crQualiRun(mode) {
    const ctx = mgrCtx(), w = ctx.w, race = ctx.race, c = F1.store.career().cal;
    const seed = MG().hash(`q-${c.season}-${c.gp}-${c.run}-${Date.now()}`); let st = seed >>> 0;
    const rnd = () => { st = (st + 0x6d2b79f5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const sc = (d, car, setup) => 0.5 * d.pace + 0.5 * MG().carScore(MG().withSetup(car, setup || 0), w);
    const mateE = MG().mateEntry(ctx.mate, ctx.car, ctx.ch.id, ctx.ch.name);
    const ents = [{ key: 'me', name: ctx.drvM.name, team: ctx.ch.id, s: sc(ctx.drvM, ctx.car, ctx.m.setup), me: true }]
      .concat(mateE ? [{ key: mateE.driver.id, name: mateE.driver.name, team: ctx.ch.id, s: sc(mateE.driver, mateE.car, 0), mate: true }] : [])
      .concat(ctx.bots.map((b) => ({ key: b.driver.id, name: b.driver.name || b.name, team: b.chassisId, s: sc(b.driver, b.car, b.setup) })));
    let err = false;
    ents.forEach((x) => {
      x.v = x.s + gauss() * 1.6;
      if (x.me) { if (mode === 'push') x.v += 0.9 + gauss() * 1.1; if (mode === 'all') { x.v += 2.2 + gauss() * 1.4; if (rnd() < 0.25) { x.v -= 14; err = true; } } }
    });
    ents.sort((a, b) => b.v - a.v);
    const pole = 78 + (MG().hash(race.circuitId || race.nameFr) % 14) + rnd(), top = ents[0].v;
    ents.forEach((x, i) => { x.pos = i + 1; x.t = pole + (top - x.v) * 0.06; });
    const me = ents.find((x) => x.me), mt = ents.find((x) => x.mate);
    const q = { order: ents.map((x) => x.key), myPos: me.pos, matePos: mt ? mt.pos : null, err, mode };
    F1.store.careerSetQuali(q);
    try { crNewsQuali(q); } catch (e) { /* presse facultative */ }
    const lt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
    const rows = ents.filter((x) => x.pos <= 10 || x.me || x.mate).map((x) => `<tr class="${x.me ? 'me-row' : x.mate ? 'mate-row' : ''}"><td class="pos">${x.pos}</td><td><span class="tstripe" style="background:${F1.teamColor(x.team)}"></span>${crNum(x.key, x.team)}${esc(x.me ? x.name + ' (vous)' : x.name)}</td><td class="r num">${x.pos === 1 ? lt(x.t) : '+' + (x.t - ents[0].t).toFixed(3)}</td></tr>`).join('');
    const box = $('#crQuali'); if (!box) return;
    box.innerHTML = `<div class="crq-run"><small class="crq-k">Tour lancé en cours</small><div class="crq-clock" id="crqClock">0:00.000</div><div class="crq-sec"><i></i><i></i><i></i></div></div>`;
    const t0 = performance.now(), D = 2600, target = me.t;
    const tick = (now) => { const k = Math.min(1, (now - t0) / D), el = $('#crqClock'); if (!el) return; el.textContent = lt(target * k); $$('.crq-sec i').forEach((x, j) => x.classList.toggle('on', k > (j + 1) / 3 - 0.01)); if (k < 1) requestAnimationFrame(tick); else show(); };
    const show = () => { const b2 = $('#crQuali'); if (!b2) return; b2.innerHTML = `<small class="crq-k">Qualifications terminées</small><h2>${err ? 'Erreur dans le dernier secteur !' : me.pos === 1 ? 'Pole position !' : `Vous partez P${me.pos}`}</h2>
      <p class="muted">${err ? 'Le tout ou rien n\'a pas payé : place en fond de grille.' : `Chrono ${lt(me.t)}${mt ? ` · coéquipier P${mt.pos}` : ''}`}</p>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Pilote</th><th class="r">Temps</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-action="m-close">Retour au week-end</button></div>`; if (me.pos <= 3 && !err) confetti(me.pos === 1 ? 160 : 60); };
    requestAnimationFrame(tick);
  }

  // ---------- Duel entre coéquipiers ----------
  function crDuelData(ctx) {
    const c = F1.store.career().cal, mate = ctx.mate;
    const mePts = c.pts.me || 0, matePts = mate ? c.pts[mate.id] || 0 : 0;
    const res = c.gps.filter((g) => g.season === c.season).flatMap((g) => g.res);
    return { q: c.duel.q, r: c.duel.r, pts: [mePts, matePts], res };
  }
  function crDuelMini(ctx) {
    if (!ctx.mate) return '<header><h3>Duel des coéquipiers</h3></header><p class="muted">Signez un coéquipier dans Contrats.</p>';
    const d = crDuelData(ctx), bar = (a, b) => { const t = a + b || 1; return `<div class="crd-bar"><i style="width:${(a / t) * 100}%"></i></div>`; };
    return `<header><h3>Duel des coéquipiers</h3><a href="#/carriere/duel">Détail</a></header>
      ${[['Qualifs', d.q], ['Courses', d.r], ['Points', d.pts]].map(([l, v]) => `<div class="crd-row"><b>${v[0]}</b><div><small>${l}</small>${bar(v[0], v[1])}</div><b>${v[1]}</b></div>`).join('')}
      <div class="crd-names"><span>${esc(ctx.drvM.family || ctx.drvM.name)}</span><span>${esc(ctx.mate.family || ctx.mate.name)}</span></div>`;
  }
  function crDuel(ctx) {
    if (!ctx.mate) return '<div class="crx-card"><p>Signez un coéquipier dans l\'onglet Contrats pour lancer le duel.</p></div>';
    const d = crDuelData(ctx), me = ctx.drvM, mt = ctx.mate, col = F1.teamColor(ctx.ch.id);
    const side = (x, num, win) => { const p = F1.visuals.portrait(x.id); return `<div class="crd-side ${win ? 'lead' : ''}"><div class="crd-ph"><i>${esc(x.code || (x.name || '?').slice(0, 3).toUpperCase())}</i>${p ? `<img src="${esc(p.img)}" alt="" onerror="this.remove()">` : ''}</div>${num ? `<span class="crd-num">${F1.num.html(num, ctx.ch.id, { color: '#fff' })}</span>` : ''}<h3>${esc(x.name)}</h3><span>Note ${x.rating}</span></div>`; };
    const tot = d.q[0] + d.r[0] - d.q[1] - d.r[1];
    const cell = (a, b) => `<td class="${a > b ? 'win' : ''}">${a}</td><td class="${b > a ? 'win' : ''}">${b}</td>`;
    const lines = d.res.slice(-12).map((r, i) => `<div class="crd-h"><span>${i + 1}</span><b class="${(r.dnf ? 99 : r.pos) < (r.mate === 'AB' ? 99 : r.mate || 99) ? 'win' : ''}">${r.dnf ? 'AB' : 'P' + r.pos}</b><b class="${(r.mate === 'AB' ? 99 : r.mate || 99) < (r.dnf ? 99 : r.pos) ? 'win' : ''}">${r.mate == null ? '—' : r.mate === 'AB' ? 'AB' : 'P' + r.mate}</b></div>`).join('');
    return `<section class="crd" style="--tc:${col}">${side(me, F1.store.mgr().number || me.number, tot > 0)}
        <div class="crd-mid"><small>Saison ${F1.store.career().cal.season}</small><b class="crd-score">${d.q[0] + d.r[0]}<i>–</i>${d.q[1] + d.r[1]}</b><span>${tot > 0 ? 'Vous menez le duel' : tot < 0 ? 'Votre coéquipier mène' : 'Égalité parfaite'}</span>
          <table class="crd-tbl"><tbody><tr><th>Qualifs</th>${cell(...d.q)}</tr><tr><th>Courses</th>${cell(...d.r)}</tr><tr><th>Points</th>${cell(...d.pts)}</tr></tbody></table></div>
        ${side(mt, mt.number, tot < 0)}</section>
      <section class="crx-card"><header><h3>Course par course</h3><span>Vous · coéquipier</span></header>${lines ? `<div class="crd-hist">${lines}</div>` : '<p class="muted">Aucune course disputée cette saison.</p>'}</section>`;
  }

  // ---------- Contrats : écurie, pilote, coéquipier (mercato) ----------
  function crContracts(ctx) {
    const { m, mk, ch, drvM, mate } = ctx, c = F1.store.career().cal, open = F1.store.careerOpen(), al = crAllowed(ctx);
    const lockMsg = open ? `<div class="crx-merc on">${crIco('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>')}<div><b>Mercato ouvert</b><span>Choisissez votre écurie et vos deux pilotes. Dès la première course, les contrats sont figés jusqu'à la fin de la saison.</span></div></div>`
      : `<div class="crx-merc">${crIco('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')}<div><b>Mercato fermé</b><span>Écurie et pilotes sont sous contrat jusqu'à la fin de la saison ${c.season}.</span></div></div>`;
    const cur = `<div class="crc-cur">${[['Écurie', ch ? ch.name : 'À signer', ch ? F1.teamColor(ch.id) : '#555', ch ? `Note voiture ${MG().carRating(ctx.car)}` : ''], ['Pilote', drvM ? drvM.name : 'À signer', ch ? F1.teamColor(ch.id) : '#555', drvM ? `Note ${drvM.rating}` : ''], ['Coéquipier', mate ? mate.name : 'À signer', ch ? F1.teamColor(ch.id) : '#555', mate ? `Note ${mate.rating}` : '']].map(([l, v, cc, sub]) => `<div class="crc-slot" style="--cc:${cc}"><small>${l}</small><b>${esc(v)}</b><span>${sub}</span></div>`).join('')}</div>`;
    if (!open) return lockMsg + cur;
    const tCards = al.teams.map((t) => { const own = ch && ch.id === t.id, car = MG().carStats(t, {}, {}); return `<div class="crc-card ${own ? 'own' : ''}" style="--cc:${F1.teamColor(t.id)}"><div class="crc-car">${F1.visuals.car(t.id, { view: 'side', shadow: false })}</div><b>${esc(t.name)}</b><span>Note voiture ${MG().carRating(car)} · vitesse ${Math.round(car.speed)} · appui ${Math.round(car.df)}</span>
      <div class="crc-foot"><b>${fmtPC(t.price)}</b>${own ? '<span class="chip green">Sous contrat</span>' : `<button class="btn sm" data-action="m-buy-c" data-id="${esc(t.id)}" ${t.price - resaleC(ctx) > m.pc + 1e-9 ? 'disabled' : ''}>Signer</button>`}</div></div>`; }).join('');
    const dCard = (d, role) => { const x = MG().withExperience(d, m.drvXp), price = role === 'mate' ? MG().mateValue(d) : MG().driverPrice(x), own = role === 'mate' ? mate && mate.id === d.id : drvM && drvM.id === d.id, other = role === 'mate' ? drvM && drvM.id === d.id : mate && mate.id === d.id, p = F1.visuals.portrait(d.id);
      return `<div class="crc-dr ${own ? 'own' : ''}" style="--cc:${F1.teamColor(d.teamId)}"><div class="crc-ph">${p ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<i>${esc(d.code || '')}</i></div><div class="crc-dn"><b>${d.number ? `<span class="crx-num" style="color:${F1.teamColor(d.teamId)}">${F1.num.html(d.number, d.teamId, { color: 'currentColor' })}</span>` : ''}${esc(d.name)}</b><span>${x.exp.age} ans · ${esc(x.exp.label)}</span></div><b class="crc-rt">${x.rating}</b>
        <div class="crc-act">${own ? '<span class="chip green">Signé</span>' : other ? '<span class="chip">Déjà pris</span>' : `<button class="btn sm" data-action="${role === 'mate' ? 'mate-buy' : 'm-buy-d'}" data-id="${esc(d.id)}">${fmtPC(price)}</button>`}</div></div>`; };
    return `${lockMsg}${cur}
      <section class="crx-sec"><header><h2>1. Écurie</h2><span>Seules les ${al.teams.length} écuries les plus modestes du plateau acceptent un manager débutant${c.season > 1 ? ' (de nouvelles portes s\'ouvrent chaque saison)' : ''}.</span></header><div class="crc-grid">${tCards}</div></section>
      <section class="crx-sec"><header><h2>2. Pilote titulaire</h2><span>Pilotes peu expérimentés ou en manque de résultats : à vous de les faire grandir.</span></header><div class="crc-list">${al.drivers.map((d) => dCard(d, 'drv')).join('')}</div></section>
      <section class="crx-sec"><header><h2>3. Coéquipier</h2><span>Le second baquet : votre premier rival dans le duel interne.</span></header><div class="crc-list">${al.drivers.map((d) => dCard(d, 'mate')).join('')}</div></section>`;
  }

  /* ---------- Carrière : progression dans le calendrier, championnat ---------- */
  function careerHud(m, car) {
    const c = F1.store.career().cal, N = (S.f1 || S.season).races.length, st = F1.store.careerStandings(), me = st.findIndex((x) => x.id === 'me') + 1;
    return [['PitCoins', m.pc < 0 ? `<span class="neg">${fmtPC(m.pc)}</span>` : fmtPC(m.pc)], ['Championnat', me ? 'P' + me : '—'], ['Points', fmt(c.pts.me || 0)],
      ['Grand Prix', c.over ? 'Saison finie' : `${c.gp + 1} / ${N}`], ['Course', c.over ? '—' : `${c.run + 1} / ${F1.store.RUNS_PER_GP}`]];
  }
  function careerStrip(ctx) {
    const c = F1.store.career().cal, s = S.f1 || S.season, N = s.races.length, R = F1.store.RUNS_PER_GP;
    const st = F1.store.careerStandings(), myPos = st.findIndex((x) => x.id === 'me') + 1, lead = st[0];
    if (c.over) {
      const champ = c.over.myPos === 1;
      return `<section class="cr-strip over"><div class="cr-l"><small>Saison ${c.over.season} terminée</small><h2>${champ ? 'Champion du monde !' : `Vous terminez P${c.over.myPos}`}</h2>
        <span class="muted">${c.over.pts} points · podium du championnat : ${c.over.top.map((x, i) => `${i + 1}. ${esc(x.id === 'me' ? 'Vous' : x.n || x.id)}`).join(' · ')}</span></div>
        <div class="cr-r"><button class="btn" data-action="cr-new">Lancer la saison ${c.season + 1}</button><small class="muted">Votre écurie et son développement sont conservés.</small></div></section>`;
    }
    const race = mgrRace(), gpRec = c.gps.find((g) => g.season === c.season && g.gp === c.gp);
    const runs = Array.from({ length: R }, (_, i) => { const r = gpRec && gpRec.res[i]; return `<span class="cr-run ${r ? 'done' : i === c.run ? 'next' : ''}"><small>Course ${i + 1}</small><b>${r ? (r.dnf ? 'AB' : 'P' + r.pos) : i === c.run ? 'À courir' : '—'}</b>${r ? `<i>+${r.pts} pts</i>` : ''}</span>`; }).join('');
    const prog = ((c.gp * R + c.run) / (N * R)) * 100;
    return `<section class="cr-strip"><div class="cr-l"><small>Saison ${c.season} · Grand Prix ${c.gp + 1} sur ${N}</small><h2>${flag(race.iso, 'sm')} ${esc(race.nameFr)}</h2>
        <div class="cr-prog" title="Avancement de la saison"><i style="width:${prog}%"></i></div></div>
      <div class="cr-runs">${runs}</div>
      <a class="cr-champ" href="#/carriere/championnat"><small>Championnat</small><b>${myPos ? 'P' + myPos : '—'}</b><span>${c.pts.me || 0} pts${lead && lead.id !== 'me' ? ` · leader ${esc(lead.n || '')} ${lead.pts}` : myPos === 1 ? ' · en tête' : ''}</span></a></section>`;
  }
  // débriefing en Carrière : course n sur 3 du Grand Prix, points marqués, place au championnat, Grand Prix bouclé
  function careerDebrief(rec) {
    const c = F1.store.career().cal, ev = rec.career, R = F1.store.RUNS_PER_GP, P = MG().F1_POINTS;
    const st = F1.store.careerStandings(), myPos = st.findIndex((x) => x.id === 'me') + 1;
    const pts = rec.dnf ? 0 : P[rec.pos - 1] || 0, runNo = ev && ev.gpDone ? R : c.run;
    const gp = ev && ev.gpDone;
    return `<section class="db-card cr-db"><header><span>Carrière · saison ${c.over ? c.over.season : c.season}</span><small>${gp ? 'Grand Prix bouclé' : `Course ${runNo} sur ${R}`}</small></header>
      <div class="db-money"><div><small>Points marqués</small><b class="${pts ? 'up' : ''}">+${pts}</b></div><div><small>Championnat</small><b>${myPos ? 'P' + myPos : '—'}</b></div><div><small>Total</small><b>${c.pts.me || 0} pts</b></div></div>
      ${gp ? `<div class="cr-db-gp"><b>${esc(gp.name || 'Grand Prix')}</b> : ${gp.res.map((x) => `<span class="cr-res ${x.dnf ? 'dnf' : x.pos <= 3 ? 'pod' : ''}">${x.dnf ? 'AB' : 'P' + x.pos}</span>`).join('')} <span class="muted">${gp.res.reduce((a, x) => a + x.pts, 0)} pts</span></div>` : ''}
      ${ev && ev.seasonDone ? `<div class="cr-db-end">${ev.myPos === 1 ? '🏆 Champion du monde !' : `Saison terminée : P${ev.myPos} au championnat`}. Lancez la saison suivante depuis le QG.</div>` : gp ? '<small class="muted">Cap sur le Grand Prix suivant au prochain départ.</small>' : ''}</section>`;
  }
  function mgrChampionship(ctx) {
    const c = F1.store.career().cal, s = S.f1 || S.season, P = MG().F1_POINTS;
    const st = F1.store.careerStandings();
    const rows = st.length ? st.map((x, i) => `<tr class="${x.id === 'me' ? 'me-row' : ''}"><td class="pos">${i + 1}</td><td><span class="row" style="gap:10px;flex-wrap:nowrap"><span class="tstripe" style="background:${x.id === 'me' ? F1.teamColor(ctx.ch ? ctx.ch.id : 'mclaren') : F1.teamColor(x.t)}"></span>${crNum(x.id, x.id === 'me' && ctx.ch ? ctx.ch.id : x.t)}<b>${x.id === 'me' ? esc((ctx.drvM && ctx.drvM.name) || 'Vous') + ' <small class="muted">(vous)</small>' : esc(x.n || x.id)}</b></span></td><td class="r num"><b>${x.pts}</b></td><td class="r num muted">${i ? '−' + (st[0].pts - x.pts) : '—'}</td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Aucune course disputée cette saison : lancez la première course depuis le QG.</td></tr>';
    const cal = s.races.map((r, i) => {
      const g = c.gps.find((x) => x.season === c.season && x.gp === i), cur = i === c.gp && !c.over;
      const res = g ? g.res.map((x) => `<span class="cr-res ${x.dnf ? 'dnf' : x.pos <= 3 ? 'pod' : ''}">${x.dnf ? 'AB' : 'P' + x.pos}</span>`).join('') : '';
      return `<div class="cr-gp ${g && g.res.length >= F1.store.RUNS_PER_GP ? 'done' : ''} ${cur ? 'cur' : ''}"><span class="cr-gp-n">${String(i + 1).padStart(2, '0')}</span><b>${flag(r.iso, 'sm')} ${esc(r.nameFr.replace('Grand Prix', 'GP'))}</b><span class="cr-gp-r">${res || (cur ? '<span class="muted">En cours</span>' : '')}</span><span class="cr-gp-p num">${g ? g.res.reduce((a, x) => a + x.pts, 0) + ' pts' : ''}</span></div>`;
    }).join('');
    const champs = c.champs.length ? `<div class="mg-sec"><h2>Palmarès</h2></div><div class="cr-champs">${c.champs.map((x) => `<span class="chip ${x.myPos === 1 ? 'gold' : ''}">Saison ${x.season} : ${x.myPos === 1 ? 'champion' : 'P' + x.myPos} · ${x.pts} pts</span>`).join('')}</div>` : '';
    return `${careerStrip(ctx)}${howto('Comment marche la Carrière', `Chaque Grand Prix du calendrier se court ${F1.store.RUNS_PER_GP} fois. Chaque course attribue les points F1 (${P.slice(0, 10).join(', ')}) aux dix premiers, à vous comme aux pilotes de l'IA. Après la ${F1.store.RUNS_PER_GP}ᵉ course, on passe au Grand Prix suivant. Après le dernier, le champion est couronné et une nouvelle saison commence. La Carrière a sa propre écurie, ses pilotes, sa R&D, son garage, ses sponsors et ses PitCoins : rien n'est partagé avec le F1 Manager classique.`)}
      <div class="cr-2col"><div><div class="mg-sec"><h2>Classement des pilotes</h2><span>Saison ${c.season}</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Pilote</th><th class="r">Points</th><th class="r">Écart</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div><div class="mg-sec"><h2>Calendrier</h2><span>${c.gp} sur ${s.races.length} Grands Prix bouclés</span></div><div class="cr-cal">${cal}</div>${champs}</div></div>
      <div class="row" style="justify-content:flex-end;margin-top:24px"><button class="btn ghost sm" data-action="cr-reset">Recommencer la Carrière à zéro</button></div>`;
  }
  function mgrHome(ctx, nl) {
    const { m, drvM, ch, car, race, w, league, bots } = ctx;
    if (!drvM || !ch) {
      const step = (ok, n, title, txt, href, cta) => `<div class="card mstep ${ok ? 'ok' : ''}"><div class="mnum">${ok ? '✓' : n}</div><h3>${title}</h3><div class="sub">${txt}</div>${ok ? '' : `<a class="btn sm" style="margin-top:14px" href="${href}">${cta}</a>`}</div>`;
      return `<div class="card mintro"><div style="font-size:42px">🏗️</div><h3 style="font-size:22px">Montez votre écurie</h3>
        <p class="muted">Vous démarrez avec <b>${fmtPC(MG().START_PC)}</b> mais sans pilote ni voiture. Les meilleurs pilotes et équipes coûtent cher : à vous de trouver le bon compromis, puis de développer la voiture.</p>
        <p class="muted" style="font-size:14px">💡 Les PitCoins se gagnent uniquement en <b>courant</b> en mode manager : chaque course rapporte, même en fond de grille. Un jeune pilote progresse vite si vous le faites rouler.</p></div>
        <div class="grid g3" style="margin-top:16px">${step(!!drvM, 1, 'Recruter un pilote', drvM ? drvM.name : 'Les vétérans sont bon marché, les jeunes coûtent plus cher : ils progressent.', '#/manager/pilotes', 'Voir le marché')}
        ${step(!!ch, 2, 'Choisir son équipe', ch ? ch.name : 'De 25 PC (fond de grille) à 500 PC (top team).', '#/manager/chassis', 'Voir les équipes')}
        ${step(false, 3, 'Courir !', `${F1.store.racesPerDay()} courses gratuites toutes les 5 heures, sur le circuit du prochain Grand Prix. Ensuite, des courses supplémentaires en jetons.`, '#', '')}</div>`;
    }
    const left = F1.store.racesLeft();
    const prog = nl ? ((m.lp - league.min) / (nl.min - league.min)) * 100 : 100;
    const p = F1.visuals.portrait(drvM.id);
    const col = F1.teamColor(ch.id);
    const setupLbl = (v) => (v <= -0.35 ? 'Faible appui (vitesse)' : v >= 0.35 ? 'Fort appui (virages)' : 'Réglage médian');
    const botAvg = (k) => bots.reduce((a, b) => a + b.car[k], 0) / bots.length;
    const owned = m.parts || {};
    // 01 — stand : la voiture et sa télémétrie face à la moyenne de la ligue
    const tele = MG().STATS.map((st) => { const v = car[st.k], o = botAvg(st.k), mx = Math.max(v, o, 1) * 1.08; return `<div class="tl"><small>${st.icon} ${st.short}</small><div class="tl-bars"><i class="me" style="width:${(v / mx) * 100}%"></i><i class="ia" style="width:${(o / mx) * 100}%"></i></div><b class="num">${Math.round(v)}</b><span class="muted num">IA ${Math.round(o)}</span></div>`; }).join('');
    const nwm = F1.news && F1.news.teamMods()[ch.id];
    const nwTxt = nwm ? [['speed', 'Vitesse'], ['df', 'Appui'], ['rel', 'Fiabilité']].filter(([k]) => nwm[k]).map(([k, l]) => `${l} ${nwm[k] > 0 ? '+' : ''}${nwm[k]}`).join(' · ') : '';
    const pwStrip = nwm ? `<a class="pdw-strip ${nwm.speed + nwm.df + nwm.rel < 0 ? 'neg' : 'pos'}" href="#/paddock">${PW_ICON}<span><b>Paddock Wire</b> · l'actualité ${esc(ch.name)} pèse sur votre châssis en course : <b class="num">${nwTxt}</b></span><span class="pdw-go">Voir les dépêches →</span></a>` : '';
    const stand = pwStrip + `<div class="hq-car">${F1.visuals.car(ch.id, { live: true, number: m.number || drvM.number, numTeam: ch.id, sponsor: livery(m) })}</div><div class="tele-grid">${tele}</div>${mechChips(car)}`;
    // 02 — pilote
    const e = drvM.exp;
    const dstat = (l, k) => statBar(l, drvM[k], drvM.base[k], 'var(--gold)');
    const pilot = `<div class="row" style="flex-wrap:nowrap"><div class="gphoto" style="--tc:${tcol(drvM.teamId)};width:70px;height:70px">${p ? `<img src="${esc(p.img)}" alt="" onerror="this.remove()">` : ''}<i>${esc(drvM.code)}</i>${dnum(drvM.number, ch ? ch.id : drvM.teamId, 'gnum', '#fff')}</div>
        <div style="min-width:0"><div class="muted upper" style="font-size:10px;font-weight:700">${flag(drvM.iso, 'sm')} ${esc(drvM.team || MG().TEAM_NAME[drvM.teamId] || '')}</div><div class="hq-name">${esc(drvM.family)}</div></div><div class="sp"></div><div class="rating-big">${drvM.rating}</div></div>
      ${xpBlock(e)}<div style="display:grid;gap:6px;margin-top:12px">${dstat('Rythme', 'pace')}${dstat('Combativité', 'craft')}${dstat('Régularité', 'cons')}</div>${driverTip(ctx)}`;
    // 03 — châssis
    const chassis = `<div class="row" style="justify-content:space-between"><div class="hq-name">${esc(ch.name)}</div><div class="rating-big sm">${MG().carRating(car)}</div></div>
      ${ctx.mate ? `<a class="hq-mate" href="#/manager/transferts" style="--tc:${col}"><small>Coéquipier</small><b>${esc(ctx.mate.name)}</b><span class="num">${ctx.mate.rating}</span></a>` : '<a class="hq-mate empty" href="#/manager/transferts"><small>Coéquipier</small><b>Aucun · recruter au marché des transferts</b></a>'}
      <div style="display:grid;gap:6px;margin-top:10px">${MG().STATS.map((st) => statBar(st.short, car[st.k], ch[st.k], col, st.icon)).join('')}</div><div class="muted" style="font-size:12px;margin-top:8px">Barre pleine : monoplace d'origine · partie claire : gains de R&D, du personnel et du garage.</div>`;
    // 04 — développement
    const all = MG().RD_PARTS, lv = (x) => MG().partLevel(owned, x.id);
    const rd = MG().RD_CATS.map((c) => { const ps = all.filter((x) => x.cat === c.id), d = ps.reduce((a, x) => a + lv(x), 0), t = ps.length * MG().MAX_LV; return `<div class="rdl"><span>${c.icon} ${esc(c.name)}</span><div class="ptsbar"><i style="width:${(d / t) * 100}%;background:${c.color}"></i></div><b class="num">${d}<small class="muted">/${t}</small></b></div>`; }).join('')
      + `<div class="row" style="margin-top:10px;gap:6px"><span class="chip">R&D investie ${fmtPC(m.rdSpent)}</span>${ctx.tb.rd ? `<span class="chip green">Coût −${Math.round(ctx.tb.rd * 100)} %</span>` : ''}</div>`;
    // 05 — week-end
    const weekend = weekendBody(ctx);
    // 06 — grille de départ
    const start = seasonBox(ctx) + `<div class="row" style="justify-content:space-between">${leagueBadge(league, 'lg')}<span class="muted" style="font-size:12px">Gains ×${league.mult} · ${MG().FIELD - 1} piloters IA</span></div>
      <div style="margin-top:12px"><div class="row" style="justify-content:space-between;font-size:12px"><span>${fmt(m.lp)} LP</span><span class="muted">${nl ? `${nl.icon} ${nl.name} à ${nl.min} LP` : 'Sommet atteint !'}</span></div><div class="ptsbar" style="height:9px;margin-top:5px"><i style="width:${prog}%;background:linear-gradient(90deg,${league.color},#fff)"></i></div></div>
      <div class="hq-kpi"><div><small>Courses gratuites</small><b>${left} / ${F1.store.racesPerDay()}</b></div><div><small>Victoire</small><b>${fmtPC(MG().PC_TABLE[0] * league.mult * (1 + ctx.tb.pc))}</b></div><div><small>Dernière place</small><b>${fmtPC(MG().PC_TABLE[19] * league.mult * (1 + ctx.tb.pc))}</b></div></div>
`;
    // 07 — équipe
    const staff = MG().STAFF_ROLES.map((r) => { const x = MG().staffOf(m, r.id); return `<div class="stf ${x ? 'on' : ''}"><span>${r.icon}</span><div><small>${esc(r.name)}</small><b>${x ? esc(x.name) : 'Poste vacant'}</b></div>${x ? stars(x.tier) : ''}</div>`; }).join('');
    const gTot = MG().GARAGE.reduce((a, g) => a + MG().garageLevel(m, g.id), 0);
    const crew = `${staff}<a class="stf on" href="#/manager/garage"><span>🧰</span><div><small>Garage</small><b>${gTot} / ${MG().GARAGE.length * MG().MAX_LV} niveaux · ${2 + MG().garageLevel(m, 'crew') * 2} mécaniciens</b></div></a>`;
    const obs = F1.store.objectives(), mult = league.mult;
    const objs = obs.map((o) => `<div class="obj2 ${o.done ? 'done' : ''} ${o.claimed ? 'claimed' : ''}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(o.txt)}</b><span class="chip gold">${fmtPC(o.pc * mult)}</span></div>
      <div class="ptsbar" style="height:6px;margin-top:8px"><i style="width:${(o.val / o.goal) * 100}%;background:${o.done ? 'var(--win)' : 'linear-gradient(90deg,#a259ff,#ff4fa3)'}"></i></div>
      <div class="row" style="justify-content:space-between;margin-top:6px"><span class="muted num" style="font-size:12px">${o.val} / ${o.goal}</span>${o.claimed ? '<span class="chip green">✓ Récupéré</span>' : o.done ? `<button class="btn sm gold" data-action="obj-claim" data-id="${o.id}">Récupérer</button>` : ''}</div></div>`).join('');
    const log = m.races.length ? `<div class="table-wrap"><table class="tbl" style="font-size:13px"><thead><tr><th>Date</th><th>Circuit</th><th class="c">Départ</th><th class="c">Arrivée</th><th class="r">LP</th><th class="r">PitCoins</th><th class="r">XP pilote</th></tr></thead><tbody>
        ${m.races.slice(0, 5).map((r) => `<tr><td class="muted">${DTF.format(new Date(r.t))}</td><td>${esc(r.gp || '')}</td><td class="c num">P${r.grid || '—'}</td><td class="c"><b>${r.dnf ? 'AB' : 'P' + r.pos}</b></td><td class="r"><span class="gain ${r.lp >= 0 ? 'up' : 'down'}">${r.lp >= 0 ? '+' : ''}${r.lp}</span></td><td class="r num">+${r.pc}</td><td class="r num">${r.xp != null ? '+' + r.xp : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="muted" style="font-size:13px">Aucune course disputée pour l\'instant.</div>';
    // bandeau de départ : la course à lancer, bien visible dès l'arrivée sur le QG
    const per = F1.store.racesPerDay();
    const lights = Array.from({ length: per }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('');
    const goStrip = `<section class="go-strip ${left ? '' : 'empty'}" style="--tc:${col};--tc-ink:${inkOn(col)}">
      <div class="go-l"><small>Prochaine course · ${MG().lapsOf(race)} tours</small><h2>${flag(race.iso, 'lg')} ${esc(race.nameFr)}</h2><span class="muted">${esc(w.kind || '')} · ${esc(ch.name)} · ${esc(drvM.name)}</span></div>
      <div class="go-m"><div class="go-lights">${lights}</div><small>${left ? `<b>${left}</b> course${left > 1 ? 's' : ''} gratuite${left > 1 ? 's' : ''} sur ${per}` : 'Courses gratuites épuisées'}</small></div>
      <div class="go-r">${raceButton('btn go-big')}</div></section>`;
    return (isCareer() ? careerStrip(ctx) : '') + goStrip + `<div class="dash">
      ${pnl('01', 'Stand · télémétrie', stand, 'p-stand')}
      ${pnl('02', 'Pilote', pilot, 'p-pilot', pnlLink('#/manager/pilotes', 'Marché'))}
      ${pnl('03', 'Équipe', chassis, 'p-chassis', pnlLink('#/manager/chassis', 'Changer'))}
      ${pnl('04', 'Développement R&D', rd, 'p-rd', pnlLink('#/manager/rd', 'Bureau d\'études'))}
      ${pnl('05', 'Préparation du week-end', weekend, 'p-week')}
      ${pnl('06', 'Grille de départ', start, 'p-start')}
      ${pnl('07', 'Muret et garage', `<div class="stf-grid">${crew}</div>`, 'p-crew', pnlLink('#/manager/muret', 'Recruter'))}
      ${pnl('08', 'Objectifs du jour', `<div class="obj-grid">${objs}</div>`, 'p-obj')}
      ${pnl('09', 'Journal de course', log, 'p-log')}
    </div>`;
  }

  function mgrDrivers(ctx) {
    const { m, mk } = ctx;
    const res = resaleD(ctx);
    return `${howto('Comment sont fixés les prix et la progression', `Prix = valeur marchande : surtout la note actuelle (chaque point au-dessus de 80 coûte cher), un peu la marge de progression selon l'âge. Un pilote gagne de l'expérience à chaque course terminée avec vous : les jeunes progressent vite et loin, les vétérans presque plus. La progression acquise est conservée si vous le reprenez plus tard. ${m.driver ? `Revendre <b>${esc(m.driver.name)}</b> vous rapporte ${fmtPC(res)} (78 % de sa valeur marchande actuelle : formez un jeune et revendez-le au sommet).` : ''}`)}
      <div class="mgrid">${mk.drivers.map((d) => {
        const own = m.driver && m.driver.id === d.id;
        const p = F1.visuals.portrait(d.id);
        const x = MG().withExperience(d, m.drvXp), e = x.exp;
        const val = MG().driverPrice(x), net = val - (own ? 0 : res), lock = own ? null : lockOf(ctx, d.id);
        return `<div class="mcard ${own ? 'own' : ''}" style="--tc:${tcol(d.teamId)}"><div class="row" style="flex-wrap:nowrap;align-items:start">
          <div class="gphoto" style="width:64px;height:64px">${p ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<i>${esc(d.code)}</i>${dnum(d.number, d.teamId, 'gnum', '#fff')}</div>
          <div style="min-width:0;flex:1"><div class="muted" style="font-size:12px">${flag(d.iso, 'sm')} ${esc(d.team || MG().TEAM_NAME[d.teamId] || '')}${d.reserve ? ' · réserviste' : ''} · ${e.age} ans</div><div class="mc-name">${esc(d.family)}</div>
          <div class="row" style="gap:4px;margin-top:4px"><span class="chip ${e.mult >= 1.6 ? 'gold' : ''}" title="Vitesse d'apprentissage : XP ×${e.mult} · progression maximale +${e.cap}">📈 ${esc(e.label)}</span>${own ? '<span class="chip green">Votre pilote</span>' : ''}</div></div>
          <div class="rating-big sm">${x.rating}</div></div>
          <div style="display:grid;gap:6px;margin:12px 0">${statBar('Rythme', x.pace, d.pace, tcol(d.teamId))}${statBar('Combativité', x.craft, d.craft, tcol(d.teamId))}${statBar('Régularité', x.cons, d.cons, tcol(d.teamId))}</div>
          <div class="muted" style="font-size:12px;margin:-4px 0 10px">${e.races ? `${e.races} course${e.races > 1 ? 's' : ''} avec vous · progression +${fmt(e.pts, 1)} / +${fmt(e.cap, e.cap % 1 ? 1 : 0)}` : `Marge de progression : +${fmt(e.cap, e.cap % 1 ? 1 : 0)} points · XP ×${e.mult}`}</div>
          <div class="row" style="justify-content:space-between"><div><small class="muted" style="display:block;font-size:11px">${own ? 'Valeur marchande' : 'Prix'}</small><b style="font-size:18px">${fmtPC(val)}</b>${own ? `<small class="muted" style="display:block;font-size:11px">Revente : ${fmtPC(res)}</small>` : ''}</div>${own ? '' : lock ? `<span class="chip lk" title="Les meilleurs pilotes ne signent qu'avec un manager confirmé">🔒 Ligue ${lock.icon} ${esc(lock.name)}</span>` : `<button class="btn sm" data-action="m-buy-d" data-id="${esc(d.id)}" ${net > m.pc + 1e-9 ? 'disabled' : ''}>${m.driver ? `Transfert (${net >= 0 ? '−' : '+'}${Math.abs(net)})` : 'Recruter'}</button>`}</div></div>`;
      }).join('')}</div>`;
  }

  // Choix de l'équipe : statistiques de base, livrée, pilotes, et modificateurs du moment issus de Paddock Wire
  /* ---------- Numéro de course du joueur : aperçu en direct dans la typographie de l'écurie ---------- */
  function npState(v, ctx) {
    const c = F1.num.clean(v), who = c && F1.num.takenBy(c), mine = who && ctx.m.driver && ctx.m.driver.id === who;
    if (!c) return { ok: false, msg: 'Tapez un numéro entre 1 et 99' };
    if (+c < 1) return { ok: false, msg: 'Le 0 n\'est pas autorisé : choisissez un numéro entre 1 et 99' };
    if (who && !mine) { const d = drv(who); return { ok: false, msg: `Déjà porté par ${d ? esc(d.given + ' ' + d.family) : 'un pilote de la grille'}` }; }
    return { ok: true, msg: mine ? 'Le numéro de votre pilote titulaire' : 'Numéro disponible' };
  }
  const numBig = (v, team) => (F1.num.clean(v) ? F1.num.html(v, team) : F1.num.text('?', team));
  function openNumberPicker(first) {
    const ctx = mgrCtx(), ch = ctx.ch; if (!ch) return;
    F1.num.loadFonts();
    const col = F1.teamColor(ch.id), team = F1.num.tkey(ch.id), cur = ctx.m.number || '';
    const refs = Object.entries(F1.num.GLYPHS).filter(([, g]) => g.t === team).map(([n]) => `<span class="np-ref-n" style="color:${col}">${F1.num.html(n, team)}</span>`).join('');
    const free = [7, 9, 13, 17, 19, 21, 22, 24, 28, 33, 47, 99].filter((n) => !F1.num.takenBy(n)).slice(0, 8);
    modal(`<div class="np" style="--tc:${col};--tc-ink:${inkOn(col)}">
      <div class="np-h"><small>${first ? 'Bienvenue chez ' + esc(ch.name) : esc(ch.name)}</small><h3>Choisissez votre numéro</h3><span class="muted">Il sera peint sur votre monoplace dans la typographie de l'écurie.</span></div>
      <div class="np-stage"><div class="np-big" id="npBig">${numBig(cur, team)}</div><div class="np-team">${esc(ch.name)}</div></div>
      <div class="np-row"><input class="field np-in" id="npIn" inputmode="numeric" maxlength="2" autocomplete="off" placeholder="—" value="${esc(cur)}" aria-label="Votre numéro (1 à 99)"><div class="np-msg" id="npMsg"></div></div>
      <div class="np-quick">${free.map((n) => `<button data-action="np-pick" data-n="${n}">${F1.num.html(n, team)}</button>`).join('')}</div>
      ${refs ? `<div class="np-refs"><small class="muted">Numéros des pilotes officiels de l'écurie</small><div>${refs}</div></div>` : ''}
      <div class="np-actions">${first ? '<button class="btn ghost" data-action="close-modal">Plus tard</button>' : '<button class="btn ghost" data-action="close-modal">Annuler</button>'}<button class="btn" data-action="np-save" id="npSave">Valider mon numéro</button></div></div>`);
    const inp = $('#npIn'), upd = () => {
      inp.value = F1.num.clean(inp.value);
      const st = npState(inp.value, ctx);
      $('#npBig').innerHTML = numBig(inp.value, team);
      $('#npBig').classList.remove('pop'); void $('#npBig').offsetWidth; $('#npBig').classList.add('pop');
      $('#npMsg').innerHTML = st.msg; $('#npMsg').className = 'np-msg ' + (inp.value ? (st.ok ? 'ok' : 'ko') : '');
      $('#npSave').disabled = !st.ok;
    };
    inp.addEventListener('input', upd);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#npSave').disabled) $('#npSave').click(); });
    upd();
  }
  // bandeau « Mon numéro » de l'onglet Équipe
  function myNumberBar(ctx) {
    const { m, ch } = ctx; if (!ch) return '';
    const col = F1.teamColor(ch.id);
    return `<div class="np-bar" style="--tc:${col}"><div class="np-bar-n">${m.number ? F1.num.html(m.number, ch.id) : '<span class="muted">—</span>'}</div>
      <div style="min-width:0;flex:1"><b>${m.number ? `Votre numéro de course : ${esc(m.number)}` : 'Vous n\'avez pas encore choisi votre numéro'}</b><small class="muted">Peint sur votre ${esc(ch.name)} dans la typographie de l'écurie, affiché en course et sur votre profil.</small></div>
      <button class="btn sm" data-action="np-open">${m.number ? 'Changer de numéro' : 'Choisir mon numéro'}</button></div>`;
  }
  function mgrChassis(ctx) {
    const { m, mk, w } = ctx;
    const res = resaleC(ctx);
    const NM = F1.news ? F1.news.teamMods() : {};
    const lbl = { speed: 'Vitesse', df: 'Appui', rel: 'Fiabilité' };
    return `${myNumberBar(ctx)}${howto('Changer d\'équipe : ce que vous gardez', `Choisissez l'équipe que vous dirigez : sa monoplace (vitesse, appui, fiabilité), sa livrée et l'effet de l'actualité Paddock Wire sur ses performances. Changer d'équipe <b>conserve la moitié de vos niveaux de R&D</b> (chaque pièce garde la moitié de ses niveaux). ${m.chassis ? `Départ de l'équipe actuelle : ${fmtPC(res)} récupérés (70 % de son prix).` : ''}`)}
      <div class="mgrid wide">${mk.chassis.map((c) => {
        const own = m.chassis && m.chassis.id === c.id;
        const net = c.price - (own ? 0 : res);
        const idx = MG().compat(c, w, MG().bestSetup(c, w));
        const nm = NM[c.id];
        const pw = nm ? Object.entries(lbl).filter(([k]) => nm[k]).map(([k, l]) => `<span class="tm-pw ${nm[k] > 0 ? 'up' : 'down'}">${nm[k] > 0 ? '▲' : '▼'} ${l} ${nm[k] > 0 ? '+' : ''}${fmt(nm[k], 1)}</span>`).join('') : '';
        const duo = MG().GRID.filter((g) => g[3] === c.id).map((g) => { const dd = mk.byDriver.get(g[0]); return esc(g[1]) + (dd && dd.number ? dnum(dd.number, c.id, 'in') : ''); }).join(' · ');
        return `<div class="mcard tm-card ${own ? 'own' : ''}" style="--tc:${F1.teamColor(c.id)}"><div class="row" style="justify-content:space-between;align-items:start"><div><div class="tm-name">${esc(c.name)}</div><div class="muted" style="font-size:12px">Pilotes officiels : ${duo || '—'}</div><div class="muted" style="font-size:12px">Indice au prochain GP : <b>${idx}</b></div></div>${own ? '<span class="chip green">Votre équipe</span>' : ''}</div>
          <div style="margin:4px -6px">${F1.visuals.car(c.id, { view: '34', shadow: false, sponsor: own ? livery(m) : null })}</div>
          <div style="display:grid;gap:6px;margin-bottom:10px">${MG().STATS.map((st) => statBar(st.short, c[st.k] + ((nm && nm[st.k]) || 0), c[st.k], F1.teamColor(c.id), st.icon)).join('')}</div>
          <div class="tm-pws">${pw ? `<small>📰 Paddock Wire</small>${pw}` : '<small class="muted">📰 Aucune actualité ne pèse sur cette équipe en ce moment</small>'}</div>
          <div class="row" style="justify-content:space-between;margin-top:10px"><b style="font-size:18px">${fmtPC(c.price)}</b>${own ? '' : `<button class="btn sm" data-action="m-buy-c" data-id="${esc(c.id)}" ${net > m.pc + 1e-9 ? 'disabled' : ''}>${m.chassis ? `Changer d'équipe (${net >= 0 ? '−' : '+'}${Math.abs(net)})` : 'Prendre la direction'}</button>`}</div></div>`;
      }).join('')}</div>`;
  }

  /* ---------- Marché des transferts : le coéquipier ----------
     Prix et cote de performance suivent l'actualité Paddock Wire ; à chaque course, la position du coéquipier
     rapporte une prime de PitCoins (moitié du barème de la ligue). */
  // revente du coéquipier : sa valeur du jour (cote de base + actualité), jamais moins que son prix d'achat
  const resaleM = (ctx) => (ctx.mate ? Math.max(Math.round((((ctx.m.mate && ctx.m.mate.price) || 0) * RESALE_FLOOR) / 5) * 5, MG().mateValue(ctx.mate)) : 0);
  function mgrTransfers(ctx) {
    const { m, mk, league } = ctx;
    const res = resaleM(ctx);
    const pcRow = [1, 2, 3, 5, 8, 10, 15].map((p) => `<span><small>P${p}</small><b>+${MG().matePC(p, false, league)}</b></span>`).join('');
    const cur = ctx.mate ? (() => {
      const d = { ...MG().withExperience(ctx.mate, {}), teamId: (ctx.ch && ctx.ch.id) || ctx.mate.teamId }, nf = MG().newsForm(ctx.mate), p = F1.visuals.portrait(d.id), last = (m.races || []).find((x) => x.mate);
      return `<div class="tr-cur" style="--tc:${tcol(d.teamId)}"><div class="gphoto" style="width:72px;height:72px">${p ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<i>${esc(d.code)}</i>${dnum(d.number, d.teamId, 'gnum', '#fff')}</div>
        <div style="flex:1;min-width:0"><small class="muted">Votre coéquipier</small><div class="tr-cur-n">${esc(d.name)}</div><div class="muted" style="font-size:12.5px">Cote de performance <b class="num">${d.rating + nf.perf}</b>${nf.perf ? ` <span class="${nf.perf > 0 ? 'up' : 'down'}">(${nf.perf > 0 ? '+' : ''}${nf.perf} actu)</span>` : ''} · ${m.stats.mateWins} victoire${m.stats.mateWins > 1 ? 's' : ''} · ${m.stats.matePodiums} podium${m.stats.matePodiums > 1 ? 's' : ''}${last ? ` · dernière course : ${last.mate.dnf ? 'abandon' : 'P' + last.mate.pos}` : ''}</div></div>
        <div style="text-align:right"><small class="muted">Valeur de revente</small><div><b>${fmtPC(res)}</b></div><button class="btn sm ghost" data-action="mate-release" style="margin-top:6px" ${F1.store.mateLocked() ? 'disabled title="Un seul changement de coéquipier par jour"' : ''}>Libérer</button></div></div>`;
    })() : `<div class="tr-cur empty"><div class="tr-slot">+</div><div><div class="tr-cur-n">Aucun coéquipier</div><div class="muted" style="font-size:13px">Recrutez un pilote ci-dessous : il court la seconde voiture de votre équipe et rapporte des PitCoins à chaque course.</div></div></div>`;
    const list = mk.drivers.filter((d) => !(m.driver && m.driver.id === d.id)).map((d) => {
      const x = MG().withExperience(d, {}), nf = MG().newsForm(x), price = MG().mateValue(d), own = m.mate && m.mate.id === d.id;
      const base = Math.max(10, Math.round((d.price * MG().MATE_K) / 5) * 5), dp = price - base;
      const net = price - (m.mate && !own ? res : 0), p = F1.visuals.portrait(d.id), lock = own ? null : lockOf(ctx, d.id), dayLock = F1.store.mateLocked();
      return `<div class="tr-row ${own ? 'own' : ''}" style="--tc:${tcol(d.teamId)}"><div class="gphoto" style="width:44px;height:44px">${p ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<i>${esc(d.code)}</i>${dnum(d.number, d.teamId, 'gnum', '#fff')}</div>
        <div class="tr-who"><b>${esc(d.name)}</b><small>${esc(d.team || '')}${d.reserve ? ' · réserviste' : ''} · ${x.exp.age} ans</small></div>
        <div class="tr-perf"><small>Cote</small><b class="num">${x.rating + nf.perf}</b>${nf.perf ? `<i class="${nf.perf > 0 ? 'up' : 'dn'}">${nf.perf > 0 ? '▲' : '▼'}${Math.abs(nf.perf)}</i>` : ''}</div>
        <div class="tr-price"><small>Prix</small><b>${fmtPC(price)}</b>${dp ? `<i class="${dp > 0 ? 'up' : 'dn'}" title="Effet Paddock Wire sur la valeur">${dp > 0 ? '▲' : '▼'} ${Math.abs(dp)}</i>` : ''}</div>
        <div class="tr-act">${own ? '<span class="chip green">Coéquipier</span>' : lock ? `<span class="chip lk" title="Les meilleurs pilotes ne signent qu'avec un manager confirmé">🔒 Ligue ${lock.icon} ${esc(lock.name)}</span>` : `<button class="btn sm" data-action="mate-buy" data-id="${esc(d.id)}" ${net > m.pc + 1e-9 || dayLock ? 'disabled' : ''} ${dayLock ? 'title="Un seul changement de coéquipier par jour"' : ''}>${m.mate ? `Transférer (${net >= 0 ? '−' : '+'}${Math.abs(net)})` : 'Recruter'}</button>`}</div></div>`;
    }).join('');
    return `${F1.store.mateLocked() ? '<div class="notice" style="margin-bottom:12px">⏳ Vous avez déjà changé de coéquipier aujourd\'hui : le prochain recrutement, transfert ou départ sera possible demain.</div>' : howto('Règles des transferts', 'Un seul changement de coéquipier par jour. À la revente, le pilote vaut son prix du jour : une bonne actualité le valorise, une mauvaise vous fait perdre un peu (10 % au plus).')}${cur}
      <div class="card tr-info"><div><b>Prime du coéquipier</b><small class="muted">PitCoins versés selon sa position d'arrivée (ligue ${esc(league.name)}), en plus de vos propres gains</small></div><div class="tr-pc">${pcRow}</div></div>
      <div class="mg-sec"><h2>Marché des transferts</h2><span>Prix et cotes suivent l'actualité Paddock Wire : ▲ bonne nouvelle, ▼ blessure, pénalité ou difficultés</span></div>
      <div class="tr-list">${list}</div>`;
  }

  /* ---------- R&D pièce par pièce ---------- */
  // Pictogrammes (traits) des pièces
  const RD_ICON = {
    wing: '<path d="M6 40 C24 30 48 28 74 32 L74 38 C50 36 26 38 6 46Z"/><path d="M10 50 C30 44 52 43 72 45"/><path d="M74 26 V50"/>',
    flap: '<path d="M8 44 C28 36 50 34 72 36"/><path d="M12 34 C30 28 50 26 70 28 L72 31"/><path d="M70 28 L74 24"/>',
    endplate: '<path d="M20 52 V24 C20 18 26 16 32 16 H58 L62 22 V52Z"/><path d="M28 30 H54 M28 40 H54"/>',
    floor: '<path d="M6 46 L18 34 H62 L74 46Z"/><path d="M24 40 C32 36 48 36 56 40"/><path d="M18 46 V50 H62 V46"/>',
    diffuser: '<path d="M10 50 L30 30 H70 V50Z"/><path d="M38 30 V50 M50 30 V50 M60 30 V50"/>',
    mirror: '<path d="M14 40 H44 L40 48 H14Z"/><path d="M44 40 C52 30 66 30 70 36 L70 46 C64 48 54 48 48 46"/>',
    rim: '<circle cx="40" cy="38" r="20"/><circle cx="40" cy="38" r="11"/><circle cx="40" cy="38" r="3"/>',
    sidepod: '<path d="M8 30 C26 22 52 22 72 30 L72 44 C54 50 26 50 8 44Z"/><path d="M60 28 V46"/><path d="M12 46 C28 52 50 52 66 46"/>',
    rwing: '<path d="M10 22 H70 L66 30 H14Z"/><path d="M14 34 H66 L62 40 H18Z"/><path d="M18 22 V54 M62 22 V54"/>',
    susp: '<path d="M8 22 L44 38 L8 54"/><path d="M44 38 H62"/><circle cx="66" cy="38" r="8"/>',
    brake: '<circle cx="40" cy="38" r="20"/><circle cx="40" cy="38" r="6"/><path d="M24 22 C34 14 50 14 58 22 L52 28 C46 22 36 22 30 28Z"/>',
    balance: '<path d="M40 16 V56"/><path d="M14 30 H66"/><path d="M14 30 L6 44 H22Z"/><path d="M66 30 L58 44 H74Z"/>',
    mono: '<path d="M6 44 C20 30 44 24 74 28 L74 40 C50 40 28 46 6 50Z"/><circle cx="46" cy="30" r="5"/>',
    halo: '<path d="M10 46 C16 22 52 18 66 30 L70 46"/><path d="M50 22 L58 46"/>',
    engine: '<rect x="14" y="26" width="40" height="24" rx="3"/><path d="M20 26 V18 H48 V26 M54 32 H66 V44 H54 M14 34 H6 V42 H14"/>',
    turbo: '<circle cx="34" cy="38" r="16"/><path d="M34 22 C44 30 44 46 34 54 M18 38 C26 30 42 30 50 38"/><path d="M50 30 H70 V40 H50"/>',
    airbox: '<path d="M14 54 V34 C14 22 26 16 40 16 C54 16 66 22 66 34 V54Z"/><ellipse cx="40" cy="32" rx="12" ry="8"/>',
    exhaust: '<path d="M8 32 H44 L58 26 H72 V44 H58 L44 38 H8Z"/><path d="M66 30 V40"/>',
    motor: '<circle cx="40" cy="38" r="18"/><path d="M40 20 V56 M22 38 H58"/><path d="M46 24 L36 38 H46 L36 52" stroke-width="3"/>',
    battery: '<rect x="12" y="24" width="52" height="28" rx="4"/><path d="M64 32 H70 V44 H64"/><path d="M40 28 L32 40 H42 L36 50"/>',
    chip: '<rect x="22" y="22" width="36" height="32" rx="3"/><rect x="31" y="31" width="18" height="14"/><path d="M28 16 V22 M40 16 V22 M52 16 V22 M28 54 V60 M40 54 V60 M52 54 V60 M16 30 H22 M16 46 H22 M58 30 H64 M58 46 H64"/>',
    gearbox: '<circle cx="30" cy="40" r="14"/><circle cx="54" cy="32" r="10"/><path d="M30 26 V22 M30 54 V58 M16 40 H12 M44 40 H48 M54 22 V18 M64 32 H68"/>',
    radiator: '<rect x="12" y="20" width="56" height="36" rx="3"/><path d="M20 20 V56 M28 20 V56 M36 20 V56 M44 20 V56 M52 20 V56 M60 20 V56"/>',
    louvre: '<path d="M10 54 L22 22 H70 L58 54Z"/><path d="M26 30 H62 M24 38 H60 M22 46 H58"/>',
    pit: '<path d="M10 50 L34 26 L42 34 L18 58Z"/><path d="M38 22 L50 10 L62 22 L50 34"/><circle cx="58" cy="46" r="12"/><circle cx="58" cy="46" r="4"/>',
    radio: '<path d="M18 34 C18 20 28 12 40 12 C52 12 62 20 62 34"/><rect x="12" y="32" width="12" height="20" rx="4"/><rect x="56" y="32" width="12" height="20" rx="4"/><path d="M62 50 C62 58 54 62 44 62 H38"/>',
    sim: '<rect x="10" y="14" width="60" height="34" rx="3"/><path d="M30 60 H50 M40 48 V60"/><path d="M18 40 L30 28 L40 34 L52 22 L62 26"/>',
    hydraulic: '<path d="M14 30 H50 C60 30 60 46 50 46 H30 C20 46 20 58 30 58 H66"/><circle cx="14" cy="30" r="5"/><circle cx="66" cy="58" r="5"/>',
  };
  // icône d'une pièce : son croquis technique (js/rdart.js), sinon le pictogramme de sa famille
  const rdIcon = (k, col) => { const part = MG().RD_BY_ID.get(k), art = F1.RD_ART && F1.RD_ART[k];
    return `<svg viewBox="0 0 80 70" class="rd-ico" fill="none" stroke="${col}" style="color:${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${art || RD_ICON[(part && part.icon) || k] || RD_ICON.chip}</svg>`; };
  const FX_LBL = { speed: '⚡ Vitesse', df: '🌀 Appui', rel: '🔧 Fiabilité', launch: '🚦 Départ', tyre: '🛞 Pneus', push: '🔋 Dépassement', pit: '🔧 Stand', sc: '📻 Stratégie SC', drv: '🎮 Pilote', wx: '🌧️ Réaction météo', pc: '💰 PitCoins', rd: '🔬 Coût R&D', tunnel: '🌬️ Soufflerie', races: '🏁 Courses/jour' };
  const fxVal = (k, v) => (['speed', 'df', 'rel'].includes(k) ? `+${fmt(v, Math.abs(v % 1) > 0.01 ? 1 : 0)}` : k === 'races' ? `+${v}` : k === 'rd' ? `−${Math.round(v * 100)} %` : k === 'pc' || k === 'tunnel' ? `+${Math.round(v * 100)} %` : `+${Math.round(v * 40)} %`);
  // ce que fait concrètement chaque bonus (infobulle au survol)
  function fxTip(k, v) {
    const p = (x) => Math.round(x * 100), n1 = (x) => fmt(x, Math.abs(x % 1) > 0.05 ? 1 : 0);
    const T = {
      speed: `+${n1(v)} de vitesse de pointe : vous gagnez du temps dans les lignes droites, surtout sur les circuits rapides.`,
      df: `+${n1(v)} d'appui : plus de vitesse en courbe, utile sur les circuits sinueux et sous la pluie.`,
      rel: `+${n1(v)} de fiabilité : moins de risque de casse moteur ou mécanique pendant la course.`,
      launch: `Meilleurs départs : moins de temps perdu au premier tour, et une vraie chance de gagner des places dès l'extinction des feux.`,
      tyre: `Usure des pneus réduite : les relais tiennent plus longtemps et le rythme baisse moins en fin de relais.`,
      push: `Plus de punch en fin de course : temps au tour amélioré dans les 5 derniers tours et en mode attaque.`,
      pit: `Arrêts aux stands plus rapides et undercuts plus souvent réussis.`,
      sc: `Meilleures décisions sous voiture de sécurité : l'arrêt « gratuit » est mieux exploité.`,
      drv: `Votre pilote gagne +${n1(2 * Math.min(2.5, v))} point${2 * Math.min(2.5, v) >= 2 ? 's' : ''} de rythme, de combativité et de régularité pendant la course.`,
      wx: `Réaction plus rapide aux changements de météo : meilleur choix de pneus et moins de temps perdu quand la pluie arrive ou s'arrête.`,
      pc: `+${p(v)} % de PitCoins gagnés à chaque course.`,
      rd: `Toutes les pièces de R&D coûtent ${p(v)} % moins cher.`,
      tunnel: `+${p(v)} points de chances de réussite aux paris en soufflerie.`,
      races: `+${v} course${v > 1 ? 's' : ''} gratuite${v > 1 ? 's' : ''} par fenêtre de 5 heures.`,
    };
    return T[k] || '';
  }
  const pips = (lv) => `<span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</span>`;

  const mechChips = (car) => { const e = Object.entries(car.mech || {}).filter(([, v]) => v > 0.01); return e.length ? `<div class="row" style="gap:6px;margin-top:12px">${e.map(([k, v]) => `<span class="chip" data-tip="${esc(fxTip(k, v))}">${FX_LBL[k]} ${fxVal(k, v)}</span>`).join('')}</div>` : ''; };
  function mgrRD(ctx) {
    const { m, ch, car, w, race, league, bots } = ctx;
    if (!ch) return `<div class="empty"><div class="ic">🔬</div>Choisissez d'abord une équipe pour lancer la R&D.<div style="margin-top:14px"><a class="btn" href="#/manager/chassis">Voir les châssis</a></div></div>`;
    const cats = MG().RD_CATS;
    const cat = cats.find((c) => c.id === S.rdCat) || cats[0];
    S.rdCat = cat.id;
    const owned = m.parts || {};
    const all = MG().RD_PARTS;
    let sel = S.rdSel && MG().RD_BY_ID.get(S.rdSel);
    if (sel && sel.cat !== cat.id) sel = null;
    // pièce conseillée pour le prochain GP : meilleur gain d'indice par PitCoin parmi les pièces disponibles
    const LV = (p) => MG().partLevel(owned, p.id);
    const nextCost = (p) => Math.round(MG().levelCost(p, LV(p) + 1) * (1 - ctx.tb.rd));
    const gainOf = (p) => { if (LV(p) >= MG().MAX_LV) return 0; const nc = MG().carStats(ch, m.ups, { ...owned, [p.id]: LV(p) + 1 }, ctx.tb); return Math.round((MG().compat(nc, w, m.setup) - MG().compat(car, w, m.setup)) * 10) / 10; };
    const avail = all.filter((p) => { const st = MG().partState(p, owned); return (st === 'available' || st === 'done') && LV(p) < MG().MAX_LV && p.cat !== 'strat'; });
    const reco = avail.sort((a, b) => gainOf(b) / nextCost(b) - gainOf(a) / nextCost(a))[0];
    const botAvg = (k) => bots.reduce((a, b) => a + b.car[k], 0) / bots.length;
    const legacy = (m.ups.speed || 0) + (m.ups.df || 0) + (m.ups.rel || 0);

    const tabs = cats.map((c) => {
      const n = all.filter((p) => p.cat === c.id), d = n.reduce((a, p) => a + LV(p), 0);
      return `<button class="rd-tab ${c.id === cat.id ? 'on' : ''}" data-action="rd-cat" data-c="${c.id}" style="--cc:${c.color}"><span>${c.icon}</span>${esc(c.name)}<small>${d}/${n.length * MG().MAX_LV}</small></button>`;
    }).join('');
    const rows = MG().rdBranches(cat.id).map((br) => {
      const list = all.filter((p) => p.cat === cat.id && p.br === br);
      const nd = list.reduce((a, p) => a + LV(p), 0);
      const pk = MG().branchPackage(cat.id, br, owned);
      const cards = list.map((p, idx) => {
        const st = MG().partState(p, owned);
        const unknown = st === 'unknown', lv = LV(p), max = lv >= MG().MAX_LV;
        const cost = nextCost(p);
        const can = (st === 'available' || st === 'done') && !max && cost <= m.pc + 1e-9;
        const inJob = F1.store.jobOf(p.id);
        return `<button class="rd-card ${st} ${max ? 'max' : ''} ${inJob ? 'job' : ''} ${sel && sel.id === p.id ? 'sel' : ''} ${reco && reco.id === p.id ? 'reco' : ''}" data-action="rd-sel" data-p="${p.id}" style="--cc:${cat.color}"><span class="rd-idx">${String(idx + 1).padStart(2, '0')}</span>
          ${inJob ? `<span class="rd-badge job">⏳ ${MG().LV_NAME[inJob.lv]}</span>` : max ? '<span class="rd-badge ok">MAX</span>' : lv ? `<span class="rd-badge ok">${MG().LV_NAME[lv]}</span>` : st === 'locked' ? '<span class="rd-badge">🔒</span>' : reco && reco.id === p.id ? '<span class="rd-badge reco">Conseillé</span>' : ''}
          ${!max && lv && reco && reco.id === p.id ? '<span class="rd-badge reco" style="top:38px">Conseillé</span>' : ''}
          <div class="rd-art">${unknown ? '<div class="rd-q">?</div>' : rdIcon(p.id, lv ? '#cfe9ff' : st === 'available' ? '#ffffff' : 'rgba(255,255,255,.45)')}</div>
          <div class="rd-name">${unknown ? 'Amélioration inconnue' : esc(p.name)}</div>
          <div class="rd-cat">${unknown ? `${cat.icon} ${esc(cat.name)}` : pips(lv)}</div>
          <div class="rd-foot">${max ? '<span class="muted">Spécification max</span>' : unknown || st === 'locked' ? '<span class="muted">—</span>' : `<b class="${can ? '' : 'muted'}">${pcoin}${cost}</b><small class="muted"> → ${MG().LV_NAME[lv + 1]}</small>`}</div></button>`;
      }).join('<span class="rd-link"></span>');
      const pkTxt = pk.minL >= MG().MAX_LV ? `📦 Package ${MG().LV_NAME[pk.minL]} complet · ${FX_LBL[pk.key]} ${fxVal(pk.key, pk.bonus)}`
        : `📦 Package ${MG().LV_NAME[pk.minL + 1]} : toutes les pièces ${MG().LV_NAME[pk.minL + 1]} → ${FX_LBL[pk.key]} ${fxVal(pk.key, pk.next)}${pk.bonus ? ` <span class="muted">(actuel ${fxVal(pk.key, pk.bonus)})</span>` : ''}`;
      return `<div class="rd-row"><div class="rd-branch"><b>${esc(br)}</b><small>${nd}/${list.length * MG().MAX_LV}</small><span class="rd-branch-bar"><i style="width:${(nd / (list.length * MG().MAX_LV)) * 100}%"></i></span></div><div><div class="rd-pkg ${pk.minL ? 'on' : ''}" style="--cc:${cat.color}">${pkTxt.replace('📦 ', '')}</div><div class="rd-cards">${cards}</div></div></div>`;
    }).join('');

    let detail;
    if (sel) {
      const st = MG().partState(sel, owned);
      const g = gainOf(sel);
      detail = `<div class="rd-detail" style="--cc:${cat.color}"><div class="row" style="flex-wrap:nowrap;align-items:start"><div class="rd-art sm">${rdIcon(sel.id, '#fff')}</div>
          <div style="flex:1;min-width:0"><div class="muted upper" style="font-size:11px;font-weight:700">${cat.icon} ${esc(cat.name)} · ${esc(sel.br)}</div><h3 style="font-size:20px;margin:2px 0 6px">${st === 'unknown' ? 'Amélioration inconnue' : esc(sel.name)}</h3>
          <div class="muted" style="font-size:14px">${st === 'unknown' ? 'Développez les pièces précédentes de cette branche pour la découvrir.' : esc(sel.desc)}</div></div>
          <button class="rd-close" data-action="rd-sel" data-p="" aria-label="Vue d'ensemble">✕</button></div>
        ${st === 'unknown' ? '' : (() => {
          const lv = LV(sel), max = lv >= MG().MAX_LV, nl = lv + 1;
          const cost = nextCost(sel), half = Math.round(cost / 2), fails = (m.fails || {})[sel.id] || 0, ch2 = Math.min(0.95, MG().tunnelChance(fails) + ctx.tb.tunnel);
          const step = max ? 0 : MG().LV_GAIN[lv];
          const ladder = `<div class="mk-ladder">${[1, 2, 3, 4, 5].map((i) => `<div class="mk ${i <= lv ? 'on' : ''} ${i === nl ? 'next' : ''}"><b>${MG().LV_NAME[i]}</b><small>${Object.entries(sel.fx).map(([k, v]) => fxVal(k, v * MG().LV_GAIN[i - 1])).join(' ')}</small>${i <= lv ? '' : `<small class="muted">${fmt(Math.round(MG().levelCost(sel, i) * (1 - ctx.tb.rd)))} PC</small>`}</div>`).join('')}</div>`;
          const can = st === 'available' || st === 'done';
          const job = F1.store.jobOf(sel.id), T = F1.store.tunnel(), ms = max ? 0 : MG().rdBuildMs(nl, sel.id), busy = ms > 0 && T.jobs.length >= T.slots;
          return `${ladder}<div class="row" style="margin-top:12px;gap:8px">${max ? '' : Object.entries(sel.fx).map(([k, v]) => `<span class="chip green" data-tip="${esc(fxTip(k, v * step))}">${FX_LBL[k]} ${fxVal(k, v * step)}</span>`).join('')}${max || sel.cat === 'strat' ? '' : `<span class="chip ${g > 0 ? 'gold' : ''}">Indice au ${esc(race.nameFr.replace('Grand Prix', 'GP'))} : +${fmt(g, g % 1 ? 1 : 0)}</span>`}${sel.cat === 'strat' && !max ? '<span class="chip">Agit pendant la course</span>' : ''}</div>
          <div class="row" style="margin-top:14px;gap:10px">${max ? '<span class="chip green">🧬 Spécification maximale atteinte</span>' : job ? `<span class="chip gold">⏳ ${MG().LV_NAME[job.lv]} en soufflerie : ${job.end <= Date.now() ? 'prête à installer' : 'fin dans ' + durTxt(job.end - Date.now())}</span>` : !can ? '<span class="chip">🔒 Développez d\'abord la pièce précédente</span>'
            : `<button class="btn" data-action="rd-buy" data-p="${sel.id}" data-mode="safe" ${cost > m.pc + 1e-9 || busy ? 'disabled' : ''}>🔬 ${lv ? 'Passer en' : 'Développer'} ${MG().LV_NAME[nl]} · ${cost} PC · ⏱ ${durTxt(ms)}</button>
              ${F1.store.betWait() > 0 ? `<button class="btn ghost tunnel-btn" disabled data-tip="Un pari soufflerie à la fois : il faut attendre 2 h entre deux paris.">🎲 Pari soufflerie dans ${durTxt(F1.store.betWait())}</button>` : `<button class="btn ghost tunnel-btn" data-action="rd-buy" data-p="${sel.id}" data-mode="tunnel" ${half > m.pc + 1e-9 || busy ? 'disabled' : ''} data-tip="Moitié prix, mais la pièce peut échouer en soufflerie. Chaque échec augmente les chances de la tentative suivante. Un seul pari toutes les 2 heures.">🎲 Pari soufflerie · ${half} PC · ${Math.round(ch2 * 100)} %</button>`}
              ${cost > m.pc + 1e-9 ? `<span class="muted" style="font-size:13px">Il vous manque ${fmtPC(Math.ceil(cost - m.pc))} pour le développement sûr</span>` : ''}`}</div>
          ${busy && !job && !max && can ? '<div class="muted" style="font-size:12px;margin-top:8px">🌬️ Soufflerie occupée : installez ou terminez la pièce en cours, ou débloquez un deuxième emplacement.</div>' : ''}
          ${fails ? `<div class="muted" style="font-size:12px;margin-top:8px">📈 ${fails} essai${fails > 1 ? 's' : ''} raté${fails > 1 ? 's' : ''} en soufflerie : les données récoltées augmentent vos chances.</div>` : ''}`;
        })()}</div>`;
    } else {
      detail = `<div class="rd-detail"><h3 style="margin:0 0 6px">Sélectionnez une pièce à rechercher</h3><div class="muted" style="font-size:14px">La caméra zoome sur la pièce choisie. Prochain GP : <b style="color:var(--text)">${esc(race.nameFr)}</b> (${esc(w.kind.toLowerCase())}).${reco ? ` Pièce conseillée : <b style="color:var(--text)">${esc(reco.name)}</b>.` : ''}</div></div>`;
    }
    const cmp = MG().STATS.map((st) => `<div class="cmp-row"><span>${st.icon} ${st.short}</span><div class="cmp-bars"><i class="me" style="width:${Math.min(100, car[st.k])}%"></i><i class="bot" style="width:${Math.min(100, botAvg(st.k))}%"></i></div><b class="num">${Math.round(car[st.k])}<small class="muted"> / ${Math.round(botAvg(st.k))}</small></b></div>`).join('');
    const showId = sel && MG().partState(sel, owned) !== 'unknown' ? sel.id : '';
    const puMode = S.rdView === 'pu' || (S.rdView == null && cat.id === 'pu');
    const carHtml = puMode ? `<div class="pu3d" id="pu3d" data-part="${showId}"></div>` : F1.visuals.car(ch.id, { live: true, view: '34', sponsor: livery(m) }).replace('class="car3d', `data-workshop="1" ${showId ? `data-part="${showId}" ` : ''}class="car3d`);
    const viewSw = `<div class="rd-view seg"><button class="${puMode ? '' : 'on'}" data-action="rd-view" data-v="car">🏎️ Monoplace</button><button class="${puMode ? 'on' : ''}" data-action="rd-view" data-v="pu">⚙️ Groupe propulseur éclaté</button></div>`;

    return `<div class="rd-head"><div><h2 class="rd-title">Recherche</h2><div class="rd-tabs" id="rdTabs">${tabs}</div></div>
        <div class="rd-kpis" id="rdKpis"><div><small>Note voiture</small><b>${MG().carRating(car)}</b></div><div><small>Niveaux R&D</small><b>${all.reduce((a, p) => a + LV(p), 0)}/${all.length * MG().MAX_LV}</b></div><div><small>R&D investie</small><b>${fmtPC(m.rdSpent)}</b></div><div><small>PitCoins</small><b>${fmtPC(m.pc)}</b></div></div></div>
      <div class="rd-stage" style="--cc:${cat.color}"><div class="stage-glow" style="--tc:${cat.color}"></div>${carHtml}${viewSw}
        <div class="rd-stage-cap" id="rdCap">${sel && MG().partState(sel, owned) !== 'unknown' ? `<span class="pulse-dot"></span><b>${esc(sel.name)}</b>` : `<span class="muted">${puMode ? '⟲ Groupe propulseur 2026 en vue éclatée · cliquez une étiquette ou une pièce' : `⟲ Faites pivoter votre ${esc(ch.name)} · sélectionnez une pièce pour zoomer`}</span>`}</div></div>
      <div id="rdJobs">${rdJobsHtml(m)}</div>
      <div id="rdDetail">${detail}</div>
      <div class="rd-tree" id="rdTree">${rows}</div>
      <div class="grid g2" style="margin-top:16px" id="rdBottom"><div class="card"><h3>Comparaison des performances</h3><div class="sub">Votre voiture (couleur) face à la moyenne des managers de la ligue ${esc(league.name)} (gris)</div><div style="margin-top:12px;display:grid;gap:10px">${cmp}</div></div>
        <div class="card"><h3>Votre monoplace</h3><div class="sub">Châssis ${esc(ch.name)} + pièces développées${legacy ? ` + ${legacy} niveaux de l'ancienne R&D` : ''}</div><div style="margin-top:12px;display:grid;gap:8px">${MG().STATS.map((st) => statBar(st.short, car[st.k], ch[st.k], F1.teamColor(ch.id), st.icon)).join('')}</div>${mechChips(car)}</div></div>`;
  }

  // Pari soufflerie : la pièce passe dans le flux d'air, l'aiguille de la balance décide
  function tunnelAnim(res, p, done) {
    const cat = MG().RD_CATS.find((c) => c.id === p.cat);
    const ov = document.createElement('div');
    ov.className = 'tunnel-ov';
    let streams = '';
    for (let i = 0; i < 16; i++) streams += `<i style="top:${6 + i * 5.8}%;animation-delay:${(i * 0.137) % 0.9}s;animation-duration:${0.55 + (i % 4) * 0.12}s"></i>`;
    ov.innerHTML = `<div class="tunnel-box" style="--cc:${cat.color}"><div class="tunnel-h">🌬️ Soufflerie · ${Math.round(res.chance * 100)} % de réussite</div>
      <div class="tunnel"><div class="air">${streams}</div><div class="tunnel-part">${rdIcon(p.id, '#fff')}</div></div>
      <div class="gauge"><div class="gauge-zone" style="width:${res.chance * 100}%"></div><div class="needle"></div></div>
      <div class="tunnel-res">Mesures en cours…</div></div>`;
    document.body.appendChild(ov);
    // l'aiguille hésite puis se fixe dans la zone verte (réussite) ou rouge (échec)
    const target = res.ok ? Math.random() * res.chance * 0.92 + 0.03 : res.chance + (1 - res.chance) * (0.15 + Math.random() * 0.75);
    const nd = $('.needle', ov), out = $('.tunnel-res', ov), t0 = performance.now(), D = 2200;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / D);
      const wob = Math.sin(k * 22) * (1 - k) * 0.35;
      const x = Math.max(0, Math.min(1, 0.5 + (target - 0.5) * (k * k * (3 - 2 * k)) + wob));
      nd.style.left = x * 100 + '%';
      if (k < 1) return requestAnimationFrame(step);
      ov.classList.add(res.ok ? 'ok' : 'ko');
      out.innerHTML = res.ok ? `✅ Validée : <b>${esc(p.name)} ${MG().LV_NAME[res.level]}</b>` : '❌ Corrélation ratée : la pièce part à la poubelle';
      setTimeout(() => { ov.classList.add('out'); setTimeout(() => ov.remove(), 350); done(); }, 1100);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Soufflerie : fabrication en temps réel ---------- */
  const p2 = (n) => String(n).padStart(2, '0');
  const hms = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${p2(Math.floor(t / 3600))}h ${p2(Math.floor((t % 3600) / 60))}m ${p2(t % 60)}s`; };
  const durTxt = (ms) => { if (ms <= 0) return 'immédiat'; const t = Math.ceil(ms / 60e3), h = Math.floor(t / 60), mn = t % 60; return h ? `${h} h${mn ? ' ' + p2(mn) : ''}` : `${mn} min`; };
  // compteur d'actions en attente par onglet (récompense à récupérer, pièce terminée, contrat sponsor bouclé)
  function railCount(k) {
    const m = F1.store.mgr();
    try {
      if (k === 'ecurie') return m.driver && m.chassis ? F1.store.objectives().filter((o) => o.done && !o.claimed).length : 0;
      if (k === 'rd') return F1.store.tunnel().jobs.filter((j) => j.end <= Date.now()).length;
      if (k === 'passe') { const P = F1.store.pass(), t = MG().passTier(P.xp); let n = 0; for (let i = 1; i <= t; i++) if (!P.claimed[i]) n++; return n; }
      if (k === 'sponsors') return ((m.sponsors && m.sponsors.log) || []).filter((x) => x.t > (m.sponsors.seen || 0)).length;
      if (k === 'hebdo') return m.weeklyPast && !m.weeklyPast.rewardClaimed ? 1 : 0;
    } catch (e) { /* données incomplètes */ }
    return 0;
  }
  const RAIL_TIP = { ecurie: 'objectif(s) du jour à récupérer', rd: 'pièce(s) prête(s) à installer', passe: 'palier(s) à réclamer', sponsors: 'contrat(s) terminé(s)', hebdo: 'prime de classement à récupérer' };
  const railPing = (k) => { const n = railCount(k); return n ? `<i class="rail-badge ${k === 'passe' ? 'blue' : ''}" title="${n} ${RAIL_TIP[k] || ''}">${n > 9 ? '9+' : n}</i>` : ''; };
  function rdJobsHtml(m) {
    const T = F1.store.tunnel(), now = Date.now(), cells = [];
    for (let i = 0; i < 2; i++) {
      const j = T.jobs[i];
      if (j) {
        const p = MG().RD_BY_ID.get(j.pid), cat = p && MG().RD_CATS.find((c) => c.id === p.cat), left = j.end - now, ready = left <= 0;
        const pct = ready ? 100 : Math.max(0, Math.min(100, (1 - left / (j.end - j.start)) * 100));
        cells.push(`<div class="tj ${ready ? 'ready' : 'run'}" data-start="${j.start}" data-end="${j.end}" style="--cc:${cat ? cat.color : '#2ad1c9'}">
          <div class="tj-art">${p ? rdIcon(p.id, '#fff') : ''}<span class="tj-air"><i></i><i></i><i></i></span></div>
          <div class="tj-body"><div class="tj-h"><small>${ready ? 'Fabrication terminée' : 'Soufflerie en cours'}</small><b>${p ? esc(p.name) : '?'} <em>${MG().LV_NAME[j.lv]}</em></b>${j.mode === 'tunnel' ? `<span class="tj-bet">🎲 Pari · ${Math.round(j.chance * 100)} %</span>` : ''}</div>
            <div class="tj-bar"><i style="width:${pct}%"></i></div>
            <div class="tj-foot"><span class="tj-cd num">${ready ? 'Prête' : hms(left)}</span>
              ${ready ? `<button class="btn sm" data-action="rd-install" data-p="${j.pid}">🔧 Installer la pièce</button>` : `<button class="btn sm ghost tj-rush" data-action="rd-rush" data-p="${j.pid}" title="Terminer la fabrication tout de suite en dépensant des jetons">⚡ Terminer maintenant · <span data-rush>${jt(MG().rushCost(left))}</span></button>`}</div></div></div>`);
      } else if (i < T.slots) cells.push(`<div class="tj empty"><div class="tj-art">🌬️</div><div class="tj-body"><b>Emplacement libre</b><small class="muted">Mk I s'installe tout de suite. Dès Mk II, la pièce passe en soufflerie, même au plein tarif : Mk II 15 à 30 min, Mk III 4 h, Mk IV 5 h, Mk V 6 h.</small></div></div>`);
      else cells.push(`<div class="tj locked"><div class="tj-art">🔒</div><div class="tj-body"><b>Deuxième emplacement</b><small class="muted">Fabriquez deux pièces en même temps.</small><button class="btn sm ghost" data-action="rd-slot2" ${m.pc + 1e-9 < MG().TUNNEL_SLOT2_PC ? 'disabled' : ''}>Débloquer · ${fmtPC(MG().TUNNEL_SLOT2_PC)}</button></div></div>`);
    }
    return `<section class="tj-wrap"><div class="tj-head"><h3>Soufflerie</h3><small class="muted">${T.jobs.length}/${T.slots} emplacement${T.slots > 1 ? 's' : ''} occupé${T.jobs.length > 1 ? 's' : ''} · le chrono continue même site fermé</small></div><div class="tj-grid">${cells.join('')}</div></section>`;
  }
  // chronos de la soufflerie : mis à jour chaque seconde, la carte passe en « Installer la pièce » à l'échéance
  setInterval(() => {
    const els = document.querySelectorAll('.tj[data-end]'); if (!els.length) return;
    let flip = false;
    els.forEach((el) => {
      const end = +el.dataset.end, start = +el.dataset.start, left = end - Date.now();
      if (left <= 0) { if (!el.classList.contains('ready')) flip = true; return; }
      const cd = el.querySelector('.tj-cd'); if (cd) cd.textContent = hms(left);
      const bar = el.querySelector('.tj-bar i'); if (bar) bar.style.width = (1 - left / (end - start)) * 100 + '%';
      const r = el.querySelector('[data-rush]'); if (r) r.innerHTML = jt(MG().rushCost(left));
    });
    if (flip && $('#rdJobs')) rdRefresh();
  }, 1000);
  // résultat d'une recherche ou d'une installation (avec l'animation du pari soufflerie)
  function rdOutcome(res, p, mode) {
    const after = () => {
      if (res.ok) { toast(mode === 'tunnel' ? '🎲' : '🔬', `<b>${esc(p.name)}</b> ${MG().LV_NAME[res.level]} installé${mode === 'tunnel' ? ' — la soufflerie valide la pièce !' : ' !'}`, 'win'); confetti(res.level >= MG().MAX_LV ? 200 : 70); }
      else toast('💨', `Échec en soufflerie : <b>${esc(p.name)}</b> ne tient pas ses promesses. Chances de la prochaine tentative : ${Math.round(MG().tunnelChance(F1.store.mgr().fails[p.id]) * 100)} %`, 'err', 5000);
      showAchievements(); F1.social.sync(); rdRefresh();
    };
    if (mode === 'tunnel') tunnelAnim(res, p, after); else after();
  }

  /* ---------- Pass de saison ---------- */
  /* Coffres du Pass : rendu 3D isométrique sobre (graphite mat, reflets doux, filet d'accent selon le rang) */
  const CHEST_TIER = { s: { a: '#9aa3ad', k: 0.86 }, m: { a: '#2ec4b6', k: 0.93 }, l: { a: '#d6b25e', k: 1 } };
  function chestSvg(size, open = false) {
    const T = CHEST_TIER[size] || CHEST_TIER.s, id = 'ch' + size, a = T.a;
    return `<svg class="ps-chest ${size} ${open ? 'open' : ''}" viewBox="0 0 80 76" aria-hidden="true" style="--ca:${a}">
      <defs>
        <linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a505a"/><stop offset=".55" stop-color="#30353d"/><stop offset="1" stop-color="#252930"/></linearGradient>
        <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3038"/><stop offset="1" stop-color="#1b1e23"/></linearGradient>
        <linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e2228"/><stop offset="1" stop-color="#121418"/></linearGradient>
        <radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
        <radialGradient id="${id}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${a}" stop-opacity=".55"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient>
      </defs>
      <ellipse cx="40" cy="68" rx="31" ry="7" fill="url(#${id}s)"/>
      <ellipse class="ch-glow" cx="40" cy="36" rx="30" ry="22" fill="url(#${id}g)"/>
      <g class="ch-body">
        <path d="M12 32 L40 46 L40 66 L12 52Z" fill="url(#${id}l)"/>
        <path d="M40 46 L68 32 L68 52 L40 66Z" fill="url(#${id}r)"/>
        <path d="M40 46 V66" stroke="#5b616b" stroke-width=".8" opacity=".7"/>
        <path d="M12 32 L40 46 L68 32" fill="none" stroke="${a}" stroke-width="1.4" opacity=".9"/>
        <path d="M22 42.6 L30 46.6 L30 54.6 L22 50.6Z" fill="#14171b" stroke="${a}" stroke-width=".8" opacity=".95"/>
        <circle cx="26" cy="47.4" r="1.2" fill="${a}"/><path d="M26 48.4 V50.6" stroke="${a}" stroke-width=".9"/>
        ${size === 'l' ? `<path d="M50 44 L58 40 M50 48 L58 44" stroke="${a}" stroke-width=".7" opacity=".55"/>` : ''}
      </g>
      <g class="ch-lid">
        <path d="M40 10 L68 24 L40 38 L12 24Z" fill="url(#${id}t)"/>
        <path d="M12 24 L40 38 L40 45 L12 31Z" fill="#262a31"/>
        <path d="M40 38 L68 24 L68 31 L40 45Z" fill="#191c21"/>
        <path d="M12 24 L40 10 L68 24" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".8"/>
        ${size !== 's' ? `<path d="M40 18 L50 23 L40 28 L30 23Z" fill="none" stroke="${a}" stroke-width="1" opacity=".85"/>` : '<path d="M33 20.5 L47 27.5" stroke="#fff" stroke-opacity=".08" stroke-width="3"/>'}
        ${size === 'l' ? `<path d="M40 21 L44 23 L40 25 L36 23Z" fill="${a}"/>` : ''}
      </g></svg>`;
  }
  // ouverture d'un ou plusieurs coffres : le couvercle se lève, le contenu s'affiche
  function chestReveal(items, extra) {
    const big = items.some((x) => x.size === 'l') ? 'l' : items.some((x) => x.size === 'm') ? 'm' : 's';
    const total = items.reduce((s, x) => s + x.pc, 0);
    modal(`<div class="ch-rev">
      <div class="ch-rev-stage">${chestSvg(big)}</div>
      <small>${items.length > 1 ? `${items.length} coffres ouverts` : esc(items[0].name)}</small>
      <div class="ch-rev-amt">+${fmtPC(total)}</div>
      ${items.length > 1 ? `<div class="ch-rev-list">${items.map((x) => `<span>${esc(x.name)} <b>+${x.pc}</b></span>`).join('')}</div>` : ''}
      ${extra ? `<div class="ch-rev-extra">${extra}</div>` : ''}
      <button class="btn" data-action="close-modal">Continuer</button></div>`);
    const st = $('.ch-rev'); if (st) requestAnimationFrame(() => setTimeout(() => st.classList.add('open'), 450));
  }
  const livSwatch = (l) => `<span class="ps-liv" style="--a:${l.c[0]};--b:${l.c[1]};--c:${l.c[2] || l.c[1]}"><i></i></span>`;
  function passArt(r) {
    if (r.kind === 'chest') return chestSvg(r.size);
    if (r.kind === 'token') return '<span class="ps-tok">🎟️</span>';
    return livSwatch(MG().PASS_LIVERY_BY.get(r.id));
  }
  function mgrPass(ctx) {
    const P = F1.store.pass(), M = MG(), T = M.PASS_TIERS, pg = M.passProgress(P.xp), tier = pg.tier, inTier = pg.cur, XT = pg.need;
    const ready = [];
    for (let t = 1; t <= tier; t++) if (!P.claimed[t]) ready.push(t);
    const complete = F1.store.passComplete();
    const cells = Array.from({ length: T }, (_, i) => {
      const t = i + 1, r = M.passReward(t), got = !!P.claimed[t], can = t <= tier && !got, cur = t === tier + 1;
      const sub = r.kind === 'chest' ? (got ? `Contenait +${fmtPC((P.got && P.got[t]) || r.pc)}` : 'Contenu mystère') : r.kind === 'token' ? '3ᵉ tentative au GP Hebdo' : esc(M.PASS_LIVERY_BY.get(r.id).desc);
      return `<div class="ps-t ${got ? 'got' : can ? 'ready' : 'lock'} ${cur ? 'cur' : ''} ${r.kind === 'livery' ? 'star' : ''} k-${r.kind}">
        <div class="ps-n">${t}</div><div class="ps-art">${passArt(r)}</div>
        <div class="ps-name">${esc(r.name)}</div><small class="ps-sub">${sub}</small>
        ${got ? '<span class="ps-ok">✓ Réclamé</span>' : can ? `<button class="btn sm" data-action="ps-claim" data-t="${t}">Réclamer</button>` : `<span class="ps-xp">${fmt(M.passCum(t))} XP</span>`}
        ${cur ? `<div class="ps-cur"><i style="width:${(inTier / XT) * 100}%"></i></div>` : ''}</div>`;
    }).join('');
    const done = (P.done || []).map((d) => `<span class="ps-season" title="Terminée le ${new Date(d.at).toLocaleDateString('fr-FR')}">🎟️ Saison ${d.season}</span>`).join('');
    const livOwned = P.liveries.length;
    return `<section class="ps-hero">
        <div class="ps-hl"><small>Pass de saison</small><h2>Saison ${P.season}</h2>
          <div class="ps-earn"><span>🏁 Course de campagne <b>+${M.PASS_XP_RACE} XP</b></span><span>🌐 Tentative GP Hebdo <b>+${M.PASS_XP_WEEKLY} XP</b></span></div></div>
        <div class="ps-hr"><div class="ps-lvl"><b>${tier}</b><small>/ ${T}</small></div>
          <div class="ps-prog"><div class="ps-bar"><i style="width:${(P.xp / M.PASS_XP_MAX) * 100}%"></i></div>
            <small class="muted">${tier >= T ? 'Tous les paliers sont atteints' : `${inTier} / ${XT} XP vers le palier ${tier + 1} · ${fmt(P.xp)} XP au total`}</small></div></div></section>
      <div class="ps-inv">
        <div><small>Jetons de tentative</small><b>🎟️ ${P.tokens || 0}</b><span class="muted">Une 3ᵉ tentative au GP Hebdo (une par semaine)</span></div>
        <div><small>Livrées spéciales</small><b>🎨 ${livOwned} / ${M.PASS_LIVERIES.length}</b><a class="link" href="#/manager/garage">Choisir dans le Garage</a></div>
        <div><small>Saisons complétées</small><b>${(P.done || []).length}</b>${done ? `<span class="ps-seasons">${done}</span>` : '<span class="muted">Le badge apparaît sur votre profil</span>'}</div>
        ${complete ? (F1.store.passNextOpen() ? `<button class="btn ps-next" data-action="ps-next">Commencer la saison ${P.season + 1} →</button>` : `<div class="ps-wait"><small>Pass terminé</small><b>Saison ${P.season + 1} le ${nextMonthTxt()}</b><span class="muted">Un nouveau Pass ouvre chaque mois.</span></div>`) : ready.length ? `<button class="btn" data-action="ps-all">Tout réclamer (${ready.length})</button>` : ''}</div>
      <div class="ps-grid">${cells}</div>`;
  }
  // Garage : choix de la livrée (le logo du sponsor reste par-dessus)
  function liveryPicker(ctx) {
    const { m, ch } = ctx; if (!ch) return '';
    const P = F1.store.pass(), cur = P.skin || null;
    const sp = livery(m) || {};
    const opts = [{ id: null, name: 'Livrée d\'équipe', desc: ch.name, tier: 0 }, ...MG().PASS_LIVERIES];
    return `<section class="lv-pick"><div class="lv-h"><div><h3>Livrée de la monoplace</h3><small class="muted">Les livrées spéciales se débloquent aux paliers 8, 16 et 24 du Pass de saison. Les logos de vos sponsors restent appliqués par-dessus.</small></div><a class="link" href="#/manager/passe">Pass de saison →</a></div>
      <div class="lv-grid">${opts.map((o) => {
        const own = !o.id || P.liveries.includes(o.id), on = cur === o.id;
        return `<button class="lv-opt ${on ? 'on' : ''} ${own ? '' : 'locked'}" ${own && !on ? `data-action="lv-set" data-id="${o.id || ''}"` : 'disabled'}>
          <div class="lv-car">${F1.visuals.car(ch.id, { view: 'side', shadow: false, sponsor: { main: sp.main || null, sub: sp.sub || null, skin: o.id } })}</div>
          <b>${esc(o.name)}</b><small>${on ? '✓ Équipée' : own ? esc(o.desc || '') : `🔒 Palier ${o.tier} du Pass`}</small></button>`;
      }).join('')}</div></section>`;
  }
  const passChip = (xp) => { const P = F1.store.pass(), pg = MG().passProgress(P.xp), t = pg.tier, XT = pg.need, inT = pg.cur; return `<a class="db-pass" href="#/manager/passe"><span>🎟️ Pass de saison <b>+${xp} XP</b></span><div class="bar"><i style="width:${(inT / XT) * 100}%"></i></div><small class="muted">Palier ${t} / ${MG().PASS_TIERS}${t < MG().PASS_TIERS ? ` · ${inT}/${XT} XP vers le palier ${t + 1}` : ''}</small></a>`; };

  // Mise à jour partielle de la page R&D (sans recharger la voiture 3D) puis zoom sur la pièce
  function rdRefresh() {
    const tmp = document.createElement('div');
    tmp.innerHTML = mgrRD(mgrCtx());
    for (const id of ['rdTabs', 'rdKpis', 'rdCap', 'rdJobs', 'rdDetail', 'rdTree', 'rdBottom']) { const a = $('#' + id), b = tmp.querySelector('#' + id); if (a && b) a.innerHTML = b.innerHTML; }
    const st = $('.rd-stage'); const nst = tmp.querySelector('.rd-stage'); if (st && nst) st.style.cssText = nst.style.cssText;
    const el = $('.rd-stage .car3d');
    const p = S.rdSel && MG().RD_BY_ID.get(S.rdSel);
    const id = p && MG().partState(p, F1.store.mgr().parts) !== 'unknown' ? p.id : '';
    if (el) { el.dataset.part = id; if (el.__car3d) el.__car3d.part(id || null); }
    const pu = $('#pu3d'); if (pu) { pu.dataset.part = id; if (pu.__pu) pu.__pu.part(id || null); }
    const pc = $(".hq-hud b"); if (pc) pc.innerHTML = fmtPC(F1.store.mgr().pc);
  }

  /* ---------- Muret des stands : personnel ---------- */
  const stars = (n) => `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
  const teamFx = (fx, mult = 1) => Object.entries(fx).map(([k, v]) => `<span class="chip green" data-tip="${esc(fxTip(k, v * mult))}">${FX_LBL[k]} ${fxVal(k, v * mult)}</span>`).join('');
  // écran du muret : contenu animé selon le poste
  function wallScreen(role, x, y, w, h, on) {
    const g = (c) => `<g transform="translate(${x} ${y})">${c}</g>`;
    const frame = `<rect width="${w}" height="${h}" rx="5" fill="#05070b" stroke="#3a3f4a" stroke-width="2"/>`;
    if (!on) return g(frame + `<text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" font-size="11" fill="#444b57">HORS LIGNE</text>`);
    let c = '';
    if (role === 'tp') for (let i = 0; i < 6; i++) c += `<rect x="6" y="${7 + i * 9}" width="${10}" height="5" fill="${['#e10600', '#27f4d2', '#ff8000', '#3671c6', '#fff', '#229971'][i]}"/><rect class="scr-bar" style="animation-delay:${i * 0.3}s" x="20" y="${7 + i * 9}" width="${w - 50 - (i * 7) % 20}" height="5" fill="#8b93a1"/><rect x="${w - 24}" y="${7 + i * 9}" width="18" height="5" fill="${i < 2 ? '#a259ff' : '#2ee59d'}"/>`;
    else if (role === 'td') c = `<path d="M8 ${h - 14} C${w * 0.3} ${h - 40} ${w * 0.6} ${h - 46} ${w - 8} ${h - 20}" fill="none" stroke="#27b4f4" stroke-width="2"/><path class="scr-line" d="M8 ${h - 22} C${w * 0.3} ${h - 52} ${w * 0.6} ${h - 30} ${w - 8} ${h - 44}" fill="none" stroke="#ff4fa3" stroke-width="1.5"/>${[0, 1, 2, 3, 4].map((i) => `<path class="scr-flow" style="animation-delay:${i * 0.25}s" d="M4 ${12 + i * 7} h${w - 8}" stroke="#7fe3d6" stroke-width="1" stroke-dasharray="6 9" opacity=".7"/>`).join('')}`;
    else if (role === 're') c = ['#2ee59d', '#e10600', '#ffd400'].map((col, i) => `<polyline class="scr-line" style="animation-delay:${i * 0.4}s" fill="none" stroke="${col}" stroke-width="1.6" points="${Array.from({ length: 14 }, (_, k) => `${6 + k * (w - 12) / 13},${14 + i * 17 + Math.sin(k * (1.1 + i * 0.4) + i) * 6}`).join(' ')}"/>`).join('');
    else if (role === 'st') c = [0, 1, 2, 3].map((i) => `<rect x="6" y="${8 + i * 13}" width="${(w - 12) * (0.35 + (i * 0.17) % 0.3)}" height="8" rx="2" fill="${['#e10600', '#ffd400', '#f2f2f2', '#2ee59d'][i]}"/><rect class="scr-bar" style="animation-delay:${i * 0.5}s" x="${6 + (w - 12) * (0.37 + (i * 0.17) % 0.3)}" y="${8 + i * 13}" width="${(w - 12) * 0.3}" height="8" rx="2" fill="${['#ffd400', '#f2f2f2', '#27b4f4', '#ffd400'][i]}"/>`).join('') + `<path d="M${w * 0.55} 4 V${h - 4}" stroke="#fff" stroke-dasharray="2 3"/>`;
    else c = `<text x="${w / 2}" y="${h / 2 + 8}" text-anchor="middle" font-size="24" font-weight="900" font-style="italic" fill="#2ee59d" class="scr-blink">2.1 s</text>${[[10, 10], [w - 22, 10], [10, h - 20], [w - 22, h - 20]].map(([a, b], i) => `<rect class="scr-blink" style="animation-delay:${i * 0.2}s" x="${a}" y="${b}" width="12" height="10" rx="2" fill="#2ee59d"/>`).join('')}`;
    return g(frame + `<g class="scr-on">${c}</g>`);
  }
  // bureau du muret : plan de travail, clavier, et l'ingénieur assis de dos avec son casque (chaise vide si le poste est vacant)
  function wallDesk(on, col, role) {
    const dk = F1.scenes.shade(col, -0.5);
    let s = `<path d="M96 62 V70 M104 62 V70" stroke="#3a3f4a" stroke-width="3"/><rect x="0" y="70" width="200" height="9" rx="1" fill="#2a2f38"/><rect x="0" y="70" width="200" height="2" fill="#4a505b"/>
      <rect x="70" y="73" width="38" height="4" rx="1" fill="#14171c"/><rect x="118" y="73" width="10" height="4" rx="2" fill="#14171c"/>`;
    // chaise
    s += `<path d="M78 118 V104 C78 92 84 86 100 86 C116 86 122 92 122 104 V118" fill="#15181d" stroke="#2c313a" stroke-width="1.5"/>`;
    if (on) s += `<g><path d="M80 118 C80 102 88 94 100 94 C112 94 120 102 120 118 Z" fill="${col}"/><path d="M84 106 C90 101 110 101 116 106" stroke="${dk}" stroke-width="3" fill="none"/>
        <rect x="96" y="88" width="8" height="8" fill="${dk}"/><circle cx="100" cy="82" r="10" fill="#2a1e17"/><path d="M89 80 A11 11 0 0 1 111 80" fill="none" stroke="#111" stroke-width="3"/>
        <rect x="86" y="78" width="5" height="9" rx="2" fill="#111"/><rect x="109" y="78" width="5" height="9" rx="2" fill="#111"/>${role === 're' ? '<path d="M88 86 C86 92 92 96 96 96" stroke="#111" stroke-width="1.5" fill="none"/>' : ''}</g>`;
    return s;
  }
  function mgrStaff(ctx) {
    const { m, ch, tb } = ctx;
    const col = ch ? F1.teamColor(ch.id) : '#e10600';
    const roles = MG().STAFF_ROLES;
    const role = roles.find((r) => r.id === S.staffRole) || roles[0];
    // Muret des stands : cinq postes (écrans de télémétrie + pictogramme du rôle) et la monoplace en 3D au pied du muret
    const ROLE_ICO = {
      tp: '<path d="M4 8h16v11H4z"/><path d="M9 8V5.5h6V8"/><path d="M4 12.5h16"/>',
      td: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3"/><path d="m10 14 1.2-3.8L15 9l-1.2 3.8Z"/>',
      re: '<path d="M5 14v-2a7 7 0 0 1 14 0v2"/><rect x="3.5" y="13" width="4" height="6" rx="1.2"/><rect x="16.5" y="13" width="4" height="6" rx="1.2"/><path d="M18.5 19c0 1.5-2 2.5-5 2.5"/>',
      st: '<path d="M4 19h16"/><path d="M6 16l4-5 3 3 5-7"/><circle cx="18" cy="7" r="1.4"/>',
      cm: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l2.2 2.2 5.5-5.5a4 4 0 0 0 5-5l-2.4 2.4-2.1-.6-.6-2.1Z"/>',
    };
    const ico = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${ROLE_ICO[id] || ROLE_ICO.tp}</svg>`;
    const bays = roles.map((r) => {
      const cur = MG().staffOf(m, r.id), on = !!cur;
      return `<button class="wbay ${r.id === role.id ? 'sel' : ''} ${on ? 'on' : 'off'}" data-action="staff-sel" data-r="${r.id}">
        <svg class="wbay-scr" viewBox="0 0 200 118" aria-hidden="true">${wallScreen(r.id, 0, 0, 96, 62, on)}${wallScreen(r.id === 'tp' ? 're' : r.id === 'cm' ? 'st' : 'tp', 104, 0, 96, 62, on)}${wallDesk(on, col, r.id)}</svg>
        <span class="wbay-desk"><span class="wbay-ico">${ico(r.id)}</span><span class="wbay-txt"><b>${esc(r.name)}</b><small>${on ? esc(cur.name) : 'Poste vacant'}</small>${on ? stars(cur.tier) : '<span class="wbay-plus">+ Recruter</span>'}</span></span></button>`;
    }).join('');
    const scene = `<div class="wall2" style="--tc:${col}">
      <div class="wall2-gantry"><i class="wall2-roof"></i><b>PIT WALL</b><span>${ch ? esc(ch.name) : 'Votre écurie'}</span></div>
      <div class="wall2-bays">${bays}</div>
      <div class="wall2-track">${F1.scenes.wallTrack(col)}${ch ? `<div class="wall2-car">${F1.visuals.car(ch.id, { view: 'side', numTeam: ch.id, number: ctx.m.number ? ctx.m.number : ctx.drvM ? ctx.drvM.number : '', sponsor: livery(m) })}</div>` : ''}</div></div>`;
    const cur = MG().staffOf(m, role.id);
    const cards = MG().STAFF[role.id].map((x) => {
      const own = cur && cur.id === x.id, refund = cur ? Math.round(cur.price * 0.5) : 0, net = x.price - refund;
      return `<div class="mcard ${own ? 'own' : ''}" style="--tc:${col}"><div class="row" style="flex-wrap:nowrap;align-items:start"><div class="staff-ava" style="--tc:${col}">${role.icon}</div>
        <div style="flex:1;min-width:0"><div class="muted" style="font-size:12px">${flag(x.iso, 'sm')} ${esc(role.name)}</div><div style="font-weight:900;font-style:italic;text-transform:uppercase;font-size:17px;line-height:1.15">${esc(x.name)}</div>${stars(x.tier)}</div><div class="rating-big sm">${x.rating}</div></div>
        <div class="muted" style="font-size:13px;margin:10px 0">${esc(x.bio)}</div><div class="row" style="gap:6px">${teamFx(role.fx, x.tier)}</div>
        <div class="row" style="justify-content:space-between;margin-top:14px"><b style="font-size:18px">${x.price ? fmtPC(x.price) : 'Gratuit'}</b>${own ? '<span class="chip green">En poste</span>' : `<button class="btn sm" data-action="staff-hire" data-r="${role.id}" data-id="${x.id}" ${net > m.pc + 1e-9 ? 'disabled' : ''}>${cur ? `Remplacer (${net >= 0 ? '−' : '+'}${Math.abs(net)})` : 'Recruter'}</button>`}</div></div>`;
    }).join('');
    const sum = Object.entries(tb).filter(([k, v]) => v > 0.001 && FX_LBL[k]).map(([k, v]) => `<span class="chip" data-tip="${esc(fxTip(k, v))}">${FX_LBL[k]} ${fxVal(k, v)}</span>`).join('');
    return `${scene}<div class="mg-tip">Cliquez sur un poste du muret pour voir les candidats. Remplacer quelqu'un vous rembourse 50 % de son prix.</div>${sum ? `<div class="mg-bonus"><span>Bonus actuels (personnel + garage)</span>${sum}</div>` : ''}
      <div class="section-h" style="margin-top:8px"><h2>${role.icon} ${esc(role.name)}</h2><span class="muted" style="font-size:13px;max-width:560px">${esc(role.desc)}</span></div><div class="mgrid">${cards}</div>`;
  }

  /* ---------- Garage : équipements et mécaniciens ---------- */
  function mech(x, y, k, col, pose = 0) { // mécanicien casqué, vu de face
    return `<g transform="translate(${x} ${y}) scale(${k})" class="mech"><ellipse cx="0" cy="118" rx="22" ry="5" fill="rgba(0,0,0,.4)"/><rect x="-13" y="62" width="11" height="54" rx="4" fill="#15171c"/><rect x="2" y="62" width="11" height="54" rx="4" fill="#15171c"/>
      <path d="M-18 14 H18 L16 68 H-16Z" fill="${col}"/><path d="M-17 34 H17" stroke="rgba(0,0,0,.3)" stroke-width="5"/><rect x="${pose ? -34 : -26}" y="${pose ? 22 : 16}" width="10" height="${pose ? 14 : 42}" rx="4" fill="${col}" ${pose ? 'transform="rotate(-50 -26 22)"' : ''}/><rect x="16" y="16" width="10" height="42" rx="4" fill="${col}"/>
      <circle cx="0" cy="0" r="15" fill="#e9eaee"/><path d="M-12 -3 H12 V5 H-12Z" fill="#101216"/><path d="M-15 0 A15 15 0 0 1 15 0" fill="none" stroke="${col}" stroke-width="4"/></g>`;
  }
  function mgrGarage(ctx) {
    const { m, ch, tb } = ctx;
    const col = ch ? F1.teamColor(ch.id) : '#e10600';
    const L = (id) => MG().garageLevel(m, id);
    const zones = MG().GARAGE_ZONES;
    const zone = zones.find((z) => z.id === S.garageZone) || zones[0];
    const tot = MG().GARAGE.reduce((a, g) => a + L(g.id), 0), max = MG().GARAGE.length * MG().MAX_LV;
    const o = (id) => (L(id) ? 1 : 0.22);
    const badge = (id, x, y) => (L(id) ? `<g transform="translate(${x} ${y})"><rect x="-17" y="-10" width="34" height="18" rx="9" fill="#0b0c10" stroke="${col}"/><text y="4" text-anchor="middle" font-size="11" font-weight="900" fill="#fff">N${L(id)}</text></g>` : '');
    const nMech = 2 + L('crew') * 2;
    const spots = [[250, 286, 0.95, 0], [948, 286, 0.95, 1], [356, 300, 1, 1], [842, 300, 1, 0], [150, 280, 0.9, 0], [1046, 280, 0.9, 0], [452, 262, 0.82, 0], [748, 262, 0.82, 1], [60, 300, 1, 0], [1140, 300, 1, 0], [560, 256, 0.78, 0], [640, 256, 0.78, 0]];
    const scene = `<div class="garage-scene" style="--tc:${col}"><div class="scene-in"><svg viewBox="0 0 1200 460" role="img" aria-label="Garage de l'écurie : ${nMech} mécaniciens, équipement ${tot} niveaux sur ${max}">
      ${F1.scenes.garage({ L, col, nMech, team: esc(ch ? (F1.ref.TEAM_SHORT[ch.id] || ch.name) : 'Votre écurie').toUpperCase() })}
      </svg><div class="garage-car2">${ch ? F1.visuals.car(ch.id, { view: 'side', shadow: false, sponsor: livery(m) }) : ''}</div>
      <div class="garage-cap"><b>${nMech} mécaniciens</b> · équipement ${tot}/${max} niveaux</div></div></div>`;
    const tabs = zones.map((z) => { const it = MG().GARAGE.filter((g) => g.zone === z.id); return `<button class="rd-tab ${z.id === zone.id ? 'on' : ''}" data-action="garage-zone" data-z="${z.id}" style="--cc:${col}"><span>${z.icon}</span>${esc(z.name)}<small>${it.reduce((a, g) => a + L(g.id), 0)}/${it.length * MG().MAX_LV}</small></button>`; }).join('');
    const cards = MG().GARAGE.filter((g) => g.zone === zone.id).map((g) => {
      const l = L(g.id), maxed = l >= MG().MAX_LV, cost = maxed ? 0 : MG().garageCost(g, l + 1);
      const fx = Object.entries(g.fx).map(([k, v]) => `<span class="chip ${l ? 'green' : ''}" data-tip="${esc(fxTip(k, v * MG().gCum(l)))}">${FX_LBL[k]} ${fxVal(k, v * MG().gCum(l))}${maxed ? '' : ` → ${fxVal(k, v * MG().gCum(l + 1))}`}</span>`).join('');
      return `<div class="mcard gcard ${maxed ? 'own' : ''}" style="--tc:${col};--cc:${col}"><div class="row" style="flex-wrap:nowrap;align-items:start"><div class="staff-ava">${g.icon}</div><div style="flex:1;min-width:0"><div style="font-weight:900;font-style:italic;text-transform:uppercase;font-size:16px;line-height:1.15">${esc(g.name)}</div><div style="margin-top:5px">${pips(l)}</div></div></div>
        <div class="muted" style="font-size:13px;margin:10px 0">${esc(g.desc)}</div><div class="row" style="gap:6px">${fx}</div>
        <div class="row" style="justify-content:space-between;margin-top:14px">${maxed ? '<span class="chip green">Niveau maximal</span>' : `<b style="font-size:18px">${fmtPC(cost)}</b><button class="btn sm" data-action="garage-up" data-id="${g.id}" ${cost > m.pc + 1e-9 ? 'disabled' : ''}>${l ? `Niveau ${l + 1}` : 'Installer'}</button>`}</div></div>`;
    }).join('');
    const sum = Object.entries(tb).filter(([k, v]) => v > 0.001 && FX_LBL[k]).map(([k, v]) => `<span class="chip" data-tip="${esc(fxTip(k, v))}">${FX_LBL[k]} ${fxVal(k, v)}</span>`).join('');
    return `${scene}${liveryPicker(ctx)}${sum ? `<div class="mg-bonus"><span>Bonus actuels (personnel + garage)</span>${sum}</div>` : ''}${howto('Équipements et mécaniciens', 'Chaque équipement a 5 niveaux. Les éléments installés apparaissent dans le garage, et chaque niveau de « Mécaniciens » ajoute deux personnes à l\'équipe.')}
      <div class="rd-tabs" style="margin-bottom:16px">${tabs}</div><div class="mgrid">${cards}</div>`;
  }

  /* ---------- Progression : suggestion de pilote, saison mensuelle ---------- */
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const monthTxt = (key) => { const [y, mo] = key.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
  const deMonth = (key) => { const t = monthTxt(key); return (/^[aeiouy]/i.test(t) ? "d'" : 'de ') + t; };
  const nextMonthTxt = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return `1er ${MONTHS[d.getMonth()]}`; };
  const monthEnd = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); };
  // « Il vous manque 120 PC pour Russell (+7 de note) » : le meilleur pilote accessible à viser
  function driverTip(ctx) {
    const { m, mk, drvM } = ctx; if (!drvM) return '';
    const cur = drvM.rating, res = resaleD(ctx);
    const all = mk.drivers.filter((d) => d.id !== drvM.id && !d.reserve && !(m.mate && m.mate.id === d.id) && d.rating >= cur + 2);
    if (!all.length) return '<div class="dtip ok">🏆 Vous avez déjà l\'un des meilleurs pilotes du plateau.</div>';
    const open = all.filter((d) => !lockOf(ctx, d.id)).map((d) => { const price = MG().driverPrice(MG().withExperience(d, m.drvXp)); return { d, price, net: price - res }; });
    const can = open.filter((x) => x.net <= m.pc).sort((a, b) => b.d.rating - a.d.rating)[0];
    const next = open.filter((x) => x.net > m.pc).sort((a, b) => a.net - b.net)[0];
    const locked = all.filter((d) => lockOf(ctx, d.id)).sort((a, b) => b.rating - a.rating)[0];
    const plus = (d) => `+${d.rating - cur} de note`;
    let h = '';
    if (can) h += `<a class="dtip ok" href="#/manager/pilotes">✅ Vous pouvez recruter <b>${esc(can.d.name)}</b> (${plus(can.d)}) dès maintenant${can.net > 0 ? ` : ${fmtPC(can.net)} après la revente de ${esc(drvM.family || drvM.name)}` : ''}.</a>`;
    if (next) h += `<a class="dtip" href="#/manager/pilotes">🎯 Il vous manque <b>${fmtPC(next.net - m.pc)}</b> pour <b>${esc(next.d.name)}</b> (${plus(next.d)}).</a>`;
    if (locked && !can && !next) { const L = lockOf(ctx, locked.id); h += `<div class="dtip">🔒 <b>${esc(locked.name)}</b> (${plus(locked)}) se débloque en ligue ${L.icon} ${esc(L.name)}.</div>`; }
    return h;
  }
  // saison du mois : prime selon la ligue de fin de mois, puis LP ramenés à 60 %
  function seasonBox(ctx) {
    const { m, league } = ctx;
    const li = MG().LEAGUES.indexOf(league), prize = MG().SEASON_PRIZE[li] || 0, nxt = MG().LEAGUES[li + 1];
    const left = monthEnd() - Date.now(), days = Math.max(0, Math.ceil(left / 864e5));
    const key = (m.mseason && m.mseason.key) || F1.store.curMonth();
    return `<div class="ssn"><div class="ssn-h"><small>Saison ${esc(deMonth(key))}</small><b>${days > 1 ? `Fin dans ${days} jours` : 'Dernier jour'}</b></div>
      <div class="ssn-r"><span>Prime actuelle <b>${fmtPC(prize)}</b> (ligue ${league.icon} ${esc(league.name)})</span>${nxt ? `<span class="muted">${nxt.icon} ${esc(nxt.name)} : ${fmtPC(MG().SEASON_PRIZE[li + 1])} à ${nxt.min} LP</span>` : ''}</div>
      <small class="muted">Le 1er du mois : prime versée selon votre ligue, puis vos LP repartent à ${Math.round(MG().SEASON_KEEP * 100)} % (${fmt(m.lp)} → ${fmt(Math.round(m.lp * MG().SEASON_KEEP))}).</small></div>`;
  }
  function seasonSummary() {
    const m = F1.store.mgr(), r = m.seasonNews; if (!r) return;
    m.seasonNews = null; F1.store.save();
    const L = MG().LEAGUES.find((l) => l.id === r.league) || MG().LEAGUES[0], La = MG().leagueOf(r.lpAfter);
    modal(`<div class="ssn-end"><small>Fin de la saison ${esc(deMonth(r.key))}</small><h3>${L.icon} Ligue ${esc(L.name)}</h3>
      <div class="ssn-kpi"><div><small>LP en fin de mois</small><b>${fmt(r.lp)}</b></div><div><small>Meilleur total</small><b>${fmt(r.peak)}</b></div><div><small>Prime de saison</small><b class="up">+${fmtPC(r.prize)}</b></div></div>
      <p class="muted">Nouvelle saison : vos LP repartent à ${fmt(r.lpAfter)} (ligue ${La.icon} ${esc(La.name)}). Remontez avant la fin du mois pour une prime plus grosse.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-action="close-modal">C'est parti</button></div></div>`);
    confetti(120);
  }
  function mgrLeagues(ctx, nl) {
    const { m, league } = ctx;
    const ladder = MG().LEAGUES.map((L) => `<div class="lrow ${L === league ? 'cur' : ''} ${m.lp >= L.min ? 'reached' : ''}" style="--lc:${L.color}"><span class="lic">${L.icon}</span><div style="flex:1"><b>${L.name}</b><small>dès ${L.min} LP · gains ×${L.mult} · adversaires ${['débutants', 'confirmés', 'solides', 'experts', 'élite', 'légendaires'][MG().LEAGUES.indexOf(L)]}</small></div>${L === league ? '<span class="chip">Vous êtes ici</span>' : ''}</div>`).reverse().join('');
    const table = `<table class="tbl" style="font-size:13px"><thead><tr><th>Position</th>${[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((p) => `<th class="c">P${p}</th>`).join('')}<th class="c">AB</th></tr></thead><tbody>
      <tr><td>LP</td>${[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((p) => { const v = MG().lpScale(league).t[p - 1]; return `<td class="c"><span class="gain ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${v}</span></td>`; }).join('')}<td class="c">${(() => { const v = MG().lpScale(league).dnf; return `<span class="gain ${v < 0 ? 'down' : ''}">${v}</span>`; })()}</td></tr>
      <tr><td>PitCoins</td>${[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((p) => `<td class="c num">${Math.round(MG().PC_TABLE[p - 1] * league.mult)}</td>`).join('')}<td class="c num">${Math.round(league.mult)}</td></tr></tbody></table>`;
    const hist = (m.seasons || []).slice(0, 6).map((r) => { const L = MG().LEAGUES.find((l) => l.id === r.league) || MG().LEAGUES[0]; return `<div class="ssn-row"><span>${esc(monthTxt(r.key))}</span><span>${L.icon} ${esc(L.name)}</span><span class="num">${fmt(r.lp)} LP</span><b class="up">+${fmtPC(r.prize)}</b></div>`; }).join('');
    return `<section class="card" style="margin-bottom:14px">${seasonBox(ctx)}${hist ? `<div class="ssn-hist"><small class="muted">Saisons passées</small>${hist}</div>` : ''}</section><section class="card mb-card"><div class="mb-h"><div><h3>Classement des managers</h3><small class="muted">Tous les joueurs · équipe, coéquipier et résultats de carrière en F1 Manager</small></div><div class="mb-legend"><span><i class="g"></i>Vous</span></div></div><div id="mgrBoard"><div class="skeleton" style="height:120px"></div></div></section>
      <div class="grid g2" style="margin-top:12px"><div class="card"><h3>Échelle des ligues</h3><div class="sub">Vos points de ligue (LP) montent à chaque course. En Bronze, on ne perd jamais de points ; à partir de l'Argent, une mauvaise course en fait perdre. Passez un palier pour être promu : les gains augmentent, les adversaires aussi.</div><div class="ladder">${ladder}</div></div>
      <div class="grid" style="align-content:start"><div class="card"><h3>Barème (ligue ${esc(league.name)})</h3><div class="table-wrap" style="margin-top:8px">${table}</div><div class="muted" style="font-size:12px;margin-top:8px">Record personnel : ${fmt(m.best)} LP.</div></div>
      </div></div>`;
  }
  function mountManager(tab) {
    // nouveau mois : fin de saison (prime, LP ramenés à 60 %), la page est redessinée puis le bilan s'affiche
    if (F1.store.seasonRoll()) { route(); return; }
    if (F1.store.mgr().seasonNews) setTimeout(seasonSummary, 400);
    const pu = $('#pu3d');
    if (pu) {
      const go = () => { if (!pu.isConnected || pu.__pu || !F1.car3d || !F1.car3d.supported) return; try { pu.__pu = F1.car3d.mountPU(pu, { part: pu.dataset.part || null }); pu.classList.add('ok'); } catch (e) { console.warn(e); } };
      if (F1.car3d && F1.car3d.ready) go(); else window.addEventListener('car3d-ready', go, { once: true });
      // clic sur une étiquette : sélectionne la première pièce de R&D liée à cet organe
      pu.addEventListener('click', (e) => { const t = e.target.closest('.pu-tag'); if (!t) return; const p = MG().RD_PARTS.find((x) => F1.car3d.PU_OF[x.id] === t.dataset.pu && MG().partState(x, F1.store.mgr().parts) !== 'unknown'); if (p) { S.rdCat = p.cat; S.rdSel = p.id; rdRefresh(); } else if (pu.__pu) pu.__pu.part(t.dataset.pu); });
    }
    bindSetup();
    const board = $('#mgrBoard');
    if (board) {
      const me = F1.store.mgr();
      const local = () => `<div class="muted" style="font-size:13px">${F1.social.state.enabled ? 'Classement mondial indisponible pour le moment.' : 'Activez le système d\'amis (Supabase) pour voir le classement mondial.'}</div>`;
      if (!F1.social.state.ready || !F1.social.leaderboard) { board.innerHTML = local(); return; }
      F1.social.leaderboard().then((res) => {
        if (!res) { board.innerHTML = local() + '<div class="muted" style="font-size:12px;margin-top:6px">(Le propriétaire du site doit exécuter <code>supabase/migration-manager.sql</code>.)</div>'; return; }
        const rows = res.rows, MK = S.mk || MG().market(S.f1 || S.season), myId = F1.social.state.me && F1.social.state.me.id;
        const dn = (id) => { const d = id && MK.byDriver.get(id); return d ? d.short || d.name : '—'; };
        const tn = (id) => (id ? MG().TEAM_NAME[id] || id : '—');
        if (!rows.length) { board.innerHTML = '<div class="muted">Aucun manager classé pour l\'instant.</div>'; return; }
        board.innerHTML = `<div class="table-wrap"><table class="mb-tbl"><thead><tr><th>Pos</th><th>Manager</th><th>Équipe</th><th>Coéquipier</th><th class="r">Victoires</th><th class="r">Podiums</th><th class="r">Meilleure</th><th class="r">Courses</th><th class="r">Points</th><th>Ligue</th></tr></thead><tbody>
          ${rows.map((p, i) => { const L = MG().leagueOf(p.lp || 0), isMe = p.id === myId, col = p.mgr_team ? F1.teamColor(p.mgr_team) : 'var(--line2)';
            return `<tr class="${isMe ? 'me' : ''} ${i < 3 ? 'top' + (i + 1) : ''}" style="--tc:${col}"><td class="mb-pos"><b>${i + 1}</b></td>
              <td><span class="mb-who">${uava(p, 'sm')}<b>${esc(p.username)}</b>${isMe ? '<small>vous</small>' : ''}</span></td>
              <td><span class="mb-team"><i></i>${esc(tn(p.mgr_team))}</span><small class="mb-sub">${esc(dn(p.mgr_driver))}</small></td>
              <td>${res.detailed ? esc(dn(p.mgr_mate)) : '<span class="muted">—</span>'}</td>
              <td class="r num mb-w">${res.detailed ? p.mgr_wins || 0 : '—'}</td><td class="r num">${res.detailed ? p.mgr_podiums || 0 : '—'}</td>
              <td class="r num">${res.detailed && p.mgr_best ? 'P' + p.mgr_best : '—'}</td><td class="r num muted">${res.detailed ? p.mgr_races || 0 : '—'}</td>
              <td class="r num mb-pts">${res.detailed ? fmt(p.mgr_points || 0) : '—'}</td><td>${leagueBadge(L)} <small class="muted num">${p.lp || 0} LP</small></td></tr>`; }).join('')}</tbody></table></div>
          ${res.detailed ? '' : '<div class="muted" style="font-size:12px;margin-top:8px">Victoires, podiums, meilleure position et points apparaîtront dès que le propriétaire du site aura exécuté <code>supabase/migration-profile-v2.sql</code>.</div>'}`;
      }).catch(() => { board.innerHTML = local(); });
      void me;
    }
  }

  // Bouton de départ : course gratuite, sinon course supplémentaire payée en jetons (tarif progressif, remis à zéro toutes les 5 h)
  function raceButton(cls, act = 'm-race') {
    const left = F1.store.racesLeft(), ms = F1.store.refillIn(), h = Math.floor(ms / 3600e3), mn = Math.ceil((ms % 3600e3) / 60e3);
    const refill = `${h ? h + ' h ' : ''}${mn} min`;
    if (left > 0) return `<button class="${cls}" data-action="${act}">🚦 ${act === 'm-again' ? 'Nouvelle course' : 'Lancer la course'} · ${left}/${F1.store.racesPerDay()} gratuite${left > 1 ? 's' : ''}</button>`;
    const cost = F1.store.extraCost(), ok = F1.store.canPayExtra();
    return `<button class="${cls}" data-action="${act}" ${ok ? '' : 'disabled'} title="Les 3 courses gratuites reviennent dans ${refill}">Course supplémentaire · ${jt(cost)}</button><div class="muted" style="font-size:12px;margin-top:6px;text-align:center">0/${F1.store.racesPerDay()} gratuite · recharge dans ${refill}${ok ? '' : ' · solde de jetons insuffisant'}</div>`;
  }
  const F1_ICON = '<svg class="f1-ico" viewBox="-1.5 -0.5 68 23" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.3 15.8 2.7 13.7 1.7 12V5.7Q1.7 4.7 2.7 4.7H9.7Q10.7 4.7 10.7 5.7V10"/><circle cx="11" cy="16.7" r="5"/><circle cx="50" cy="16.7" r="5"/><path d="M16 20.3H32C34 20.3 35.5 18 37.3 18H44"/><path d="M14.7 8.3C18 6.5 20.5 1.9 24.7 1.9H28.3Q29.7 2 30 4L30.7 6.7"/><path d="M27 8.1 36 6.3Q37.7 6 38.7 7L41.3 9.1"/><path d="M30.7 6.7 31.3 9.3Q32.3 10.3 35 10L42 9.8"/><path d="M41.3 9.1 49.7 9.7Q52.7 9.9 55.3 10.7L62 14.7Q64 15.4 64 16.7V18Q64 20.3 62.3 20.3H58"/></svg>';
  // Texte lisible sur une couleur d'écurie : noir sur les couleurs claires, blanc sur les foncées
  const inkOn = (hex) => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16); if (isNaN(n)) return '#fff'; const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; return l > 0.6 ? '#0b0d10' : '#fff'; };
  // Préférences d'affichage (gardées sur cet appareil)
  const getPref = (k) => { try { return localStorage.getItem('pitwall:' + k) || ''; } catch (e) { return ''; } };
  const setPref = (k, v) => { try { if (v) localStorage.setItem('pitwall:' + k, v); else localStorage.removeItem('pitwall:' + k); } catch (e) { /* stockage indisponible */ } };
  const mapStyle = () => (getPref('mapStyle') === 'flat' ? 'flat' : 'anim');
  const lowMode = () => getPref('low') === '1';
  const applyLow = () => { document.documentElement.classList.toggle('low', lowMode()); if (F1.fx && F1.fx.setLow) F1.fx.setLow(lowMode()); };
  applyLow();
  // Plan d'arrêts exprimé en tours du prochain Grand Prix (remis à l'échelle si la course change de longueur)
  function planNow() { const NL = MG().lapsOf(mgrCtx().race); return { NL, st: MG().planFor(F1.store.mgr().next.plan, NL).stops.map((p) => ({ ...p })) }; }
  /* ---------- Course animée ---------- */
  let raceTimer = null;
  // Pastille d'un composé de pneus (couleur officielle)
  const tyreDot = (t, cls = '') => `<span class="tyre2 ${cls}" style="--ty:${MG().TYRES[t].color}" title="${MG().TYRES[t].name}">${t}</span>`;
  function startRace() {
    const ctx = mgrCtx();
    if (!ctx.drvM || !ctx.car) return;
    if (isCareer() && F1.store.career().cal.over) return toast('🏁', 'Saison terminée : lancez la saison suivante depuis le week-end.', 'err');
    if (isCareer() && F1.store.career().cal.mediaGp !== F1.store.career().cal.gp) { toast('🎙️', 'Point presse obligatoire avant les qualifications.', 'err'); return crMediaOpen(); }
    if (isCareer() && !F1.store.careerQualiFor()) { toast('⏱️', 'Passez d\'abord par les qualifications : elles fixent la grille.', 'err'); return crQualiOpen(); }
    if (F1.store.racesLeft() <= 0 && !F1.store.canPayExtra()) return toast('⏳', `Courses gratuites épuisées. Une course supplémentaire coûte ${jt(F1.store.extraCost())}.`, 'err');
    const meName = (F1.social.state.me && F1.social.state.me.username) || F1.store.get().name || 'Mon écurie';
    const player = { name: meName, driver: ctx.drvM, car: ctx.car, setup: ctx.m.setup, chassisId: ctx.ch.id };
    const seed = MG().hash(`${Date.now()}-${Math.random()}`);
    // la météo de la course est celle annoncée par le bulletin ; la course est décomptée dès le départ
    const mateE = MG().mateEntry(ctx.mate, ctx.car, ctx.ch.id, ctx.ch.name);
    const R = MG().createRace({ player, bots: mateE ? [mateE, ...ctx.bots] : ctx.bots, race: ctx.race, seed, wxSeed: ctx.m.next.seed, startTyre: ctx.m.next.tyre, plan: ctx.m.next.plan, manual: true, news: F1.news ? F1.news.teamMods() : null, qualiOrder: isCareer() && F1.store.careerQualiFor() ? F1.store.careerQualiFor().order : null });
    let bill; try { bill = F1.store.consumeRace(); } catch (err) { return toast('⚠️', esc(err.message), 'err'); }
    if (bill.paid) toast('🟡', `Course supplémentaire : −${jt(bill.paid)}`, 'win');
    showRace(R, ctx);
  }
  function showRace(res, ctx) {
    const byI = new Map(res.field.map((x) => [x.i, x]));
    const ROW = matchMedia('(min-width: 900px)').matches ? 22 : 30, LAPS = res.LAPS, leagueBefore = ctx.league;
    const meX = res.me;
    const colorOf = (x) => F1.teamColor(x.c.chassisId || (ctx.ch && ctx.ch.id));
    const tower = res.field.map((x) => `<div class="trow ${x.c.me ? 'me' : ''} ${x.c.mate ? 'mate' : ''}" data-i="${x.i}" style="transform:translateY(${(x.grid - 1) * ROW}px)"><b class="tp">${x.grid}</b><span class="tstripe" style="background:${colorOf(x)};height:16px"></span><span class="tnm">${x.c.me ? ((ctx.m.number || x.driver.number) ? F1.num.html(ctx.m.number || x.driver.number, ctx.ch && ctx.ch.id, { color: colorOf(x) }) : '') : x.driver.number ? F1.num.html(x.driver.number, x.c.chassisId || x.driver.teamId, { color: colorOf(x) }) : ''}</span><span class="tn">${esc(x.name)}</span><span class="tc">${esc(x.driver.code)}</span><span class="tt">${tyreDot(x.tyre, 'sm')}</span><span class="tps" title="Arrêts aux stands"></span><span class="tg num">—</span></div>`).join('');
    const drvNum = ctx.m.number || (ctx.drvM && ctx.drvM.number) || (meX.driver && meX.driver.number) || '', meCol = colorOf(meX), meInk = inkOn(meCol);
    const meTeam = ctx.ch && ctx.ch.id;
    const plate = (n, teamId, ink, fb) => (F1.num.clean(n) ? F1.num.html(n, teamId, { color: ink }) : esc(String(fb || '?')));
    // en-tête radio : numéro du pilote aux couleurs de l'écurie + égaliseur
    const RHEAD = (title, extra = '') => `<div class="radio-h"><span class="rdo-plate" style="--tc:${meCol};--ti:${meInk}">${plate(drvNum, meTeam, meInk, meX.driver.code)}</span><span class="radio-wave"><i></i><i></i><i></i><i></i><i></i></span><span class="rdo-title">${title}</span>${extra}</div>`;
    // portée du radar : tours de prévision visibles à l'avance
    const sg = MG().staffOf(ctx.m, 'st');
    const range = Math.round((1 + MG().garageLevel(ctx.m, 'radar') + (sg && sg.tier >= 4 ? 1 : 0)) * res.K);
    const wxCls = (x) => (x.rain > 0.6 ? 'heavy' : x.rain > 0.25 ? 'rain' : x.rain > 0.05 ? 'drizzle' : x.wet > 0.35 ? 'wet' : x.cloud > 0.5 ? 'cloud' : 'dry');
    document.documentElement.classList.add('race-lock');
    // plein écran : le navigateur bascule si possible ; sinon la course occupe déjà toute la fenêtre
    const goFull = () => { const de = document.documentElement; if (!document.fullscreenElement && de.requestFullscreen) de.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); };
    goFull();
    $('#modal').innerHTML = `<div class="modal race-modal race-full"><div class="modal-box race-box">
      <div class="race-h"><div><div class="muted upper" style="font-size:11px;font-weight:700">${leagueBadge(leagueBefore)} · ${esc(ctx.race.nameFr)}</div><div class="race-lap">Tour <b id="lapN">0</b> / ${LAPS}</div></div>
        <div class="wx-now" id="wxNow"></div>
        <div class="race-ctl">
          <div class="seg" role="group" aria-label="Vitesse de la course">${[1, 2, 4, 8].map((v) => `<button class="${v === 1 ? 'on' : ''}" data-action="race-speed" data-v="${v}">×${v}</button>`).join('')}</div>
          <div class="seg" role="group" aria-label="Style de la carte">${[['anim', 'Animée'], ['flat', '2D épurée']].map(([k, l]) => `<button class="${mapStyle() === k ? 'on' : ''}" data-action="map-style" data-v="${k}">${l}</button>`).join('')}</div>
          <button class="btn sm ghost low-btn ${lowMode() ? 'on' : ''}" data-action="low-mode" title="Désactive les effets visuels lourds et limite la carte à 24 images par seconde">Config basse${lowMode() ? ' ✓' : ''}</button>
          <button class="btn sm ghost" data-rfs="1" title="Plein écran">⛶</button>
          <button class="btn sm ghost" data-action="m-skip">Passer ⏭</button></div></div>
      <div class="race-main">
        <div class="race-left">
          <div class="race-stage"><div class="race-map" id="raceMap"></div>
            <div class="race-flag" id="raceFlag"></div><div class="race-fc" id="raceFc"></div>
            <button class="mtl-btn" id="mtlBtn" title="Télémétrie de votre voiture en temps réel"><i></i>Télémétrie</button>
            <div class="mtele" id="mtele" hidden></div>
            <div class="map-wx" id="mapWx"></div>
            <div class="tr-radio" id="trRadio" aria-live="polite"></div>
            <div class="radio" id="radio"></div><div class="race-end" id="raceEnd"></div></div>
          <div class="rtele" id="tele"></div>
          <div class="wx-strip" id="wxStrip" style="grid-template-columns:repeat(${LAPS}, 1fr)" title="Radar météo : ${range} tour${range > 1 ? 's' : ''} de prévision (améliorez la station météo du garage pour voir plus loin)">${res.weather.slice(1).map((x, i) => `<i data-l="${i + 1}"></i>`).join('')}</div>
          <div class="pitwall" id="pitwall"></div>
        </div>
        <div class="race-side"><div class="tower-h"><span>Classement</span><div class="seg tw-mode"><button class="on" data-tw="gap">Leader</button><button data-tw="int">Intervalle</button></div></div><div class="tower" style="height:${res.field.length * ROW}px;--row:${ROW}px">${tower}</div><div class="feed" id="feed"><div class="ev"><b>Départ</b> — vous partez P${meX.grid} sur la grille, en ${MG().TYRES[meX.tyre].name.toLowerCase()}${res.weather[0].wet > 0.12 ? `, sur piste ${MG().trackState(res.weather[0].wet).toLowerCase()}` : ''}</div></div></div>
      </div></div></div>`;
    const STEP = 50, LAP_MS = 480000 / LAPS; // une course dure environ 8 minutes en vitesse ×1 (4 min en ×2, 2 min en ×4, 1 min en ×8), quel que soit le nombre de tours
    let lap = 0, T = -0.5, flagT = 0, started = false, paused = false, done = false, evI = 0, radioTimer = null; // T < 0 : procédure de départ (5 feux rouges)
    S.raceSpeed = 1;
    MG().stepLap(res); // le tour 1 est calculé d'avance : la carte interpole toujours vers le tour suivant
    const flagEl = $('#raceFlag');
    const showFlag = (html, cls, ms = 3800) => { flagEl.innerHTML = html; flagEl.className = 'race-flag on ' + cls; flagT = performance.now() + ms; };
    const wx = (L) => {
      const x = res.weather[Math.min(LAPS, L)];
      $('#wxNow').innerHTML = `<span class="wx-ic">${MG().wxIcon(x)}</span><div><b>${MG().wxLabel(x)}</b><small>Air ${Math.round(x.air)} °C · Piste ${Math.round(x.track)} °C</small></div>`;
      const st = MG().trackState(x.wet);
      $('#raceFc').innerHTML = `<span class="rf-state"><i class="${st === 'Sèche' ? 'dry' : st === 'Humide' ? 'damp' : 'soak'}"></i>Piste ${st.toLowerCase()}</span><span class="rf-hum">Humidité ${Math.round(x.wet * 100)} %</span><span class="rf-next">${esc(MG().trend(res, Math.max(3, Math.min(Math.round(5 * res.K), 2 + range)), Math.min(LAPS, L)))}</span>`;
      $$('#wxStrip i').forEach((el) => { const l = +el.dataset.l; el.className = l <= L ? wxCls(res.weather[l]) + ' past' : l <= L + range ? wxCls(res.weather[l]) : 'unk'; el.classList.toggle('now', l === Math.max(1, L)); });
      renderWall(L);
    };
    // Choix des pneus au moment de rentrer au stand : chaque composé avec son relais estimé, et une recommandation
    const tyreChoice = (L) => {
      const wet = res.weather[Math.min(LAPS, Math.max(0, L))].wet, left = Math.max(1, LAPS - L), need = wet < 0.12 ? 'dry' : wet < 0.6 ? 'I' : 'W';
      const stint = (t) => Math.round(0.75 / (MG().TYRES[t].wear * res.abr));
      const dryBest = MG().dryFor(left, res.abr, meX);
      const reco = need === 'dry' ? dryBest : need;
      return `<div class="tc-grid">${Object.values(MG().TYRES).map((t) => {
        const ok = need === 'dry' ? MG().isSlick(t.id) : t.id === need, n = stint(t.id);
        const note = !ok ? (need === 'dry' ? 'piste sèche : inadapté' : 'piste mouillée : inadapté') : n >= left ? `tient jusqu'à l'arrivée (${left} t.)` : `≈ ${n} tours · encore 1 arrêt`;
        const rule = MG().isSlick(t.id) && need === 'dry' && !MG().ruleOk({ used: [...meX.used, t.id] }) ? ' · ⚠️ même composé' : '';
        return `<button class="tc-opt ${t.id === reco ? 'reco' : ''} ${ok ? '' : 'bad'}" data-tc="${t.id}" style="--ty:${t.color}"><span class="tyre2">${t.id}</span><b>${esc(t.name)}${t.id === reco ? ' <i>conseillé</i>' : ''}</b><small>${note}${rule}</small></button>`;
      }).join('')}</div>`;
    };
    // Muret des stands : pneus du joueur, rythme, prochain composé, appel au stand
    const canRedo = () => !paused && !done && !meX.out && res.lap === lap + 1 && T - lap < 0.9;
    function renderWall(L) {
      const el = $('#pitwall'); if (!el) return;
      if (done || (meX.out && L >= meX.out.lap)) { el.innerHTML = ''; return; }
      const o = L > 0 && res.laps[L - 1] ? res.laps[L - 1].find((y) => y.i === meX.i) : null;
      const ty = o ? o.ty : meX.tyre, wear = o ? o.wear : 0, c = res.ctl;
      const ts = MG().tyreStatus(ty, wear, res.weather[Math.min(LAPS, L)].wet, c.mode, L > 0 && meX.pitLaps.includes(L));
      const tTy = (res.tele[Math.min(L, res.tele.length - 1)] || res.tele[0]).tTyre;
      const ps = c.plan && !(c.auto || {}).pits ? res.plan.stops[meX.pits - (meX.pitLaps.includes(res.lap) && res.lap > L ? 1 : 0)] : null;
      const boxLap = canRedo() || paused || T < 0 ? lap + 1 : lap + 2;
      const pending = res.lap > L && meX.pitLaps.includes(res.lap); // l'arrêt est acquis pour la fin du tour en cours
      const rule = MG().ruleOk(meX);
      el.innerHTML = `<div class="pw-cell pw-tyre">${tyreDot(ty)}<div><b>${MG().TYRES[ty].name}</b><div class="wearbar ${wear > 0.75 ? 'bad' : wear > 0.5 ? 'mid' : ''}"><i style="width:${Math.round(wear * 100)}%"></i></div><small>Usure <b>${Math.round(wear * 100)} %</b> · <span class="${tTy > MG().TYRE_HI ? 'hot' : tTy < 85 ? 'cold' : ''}">${Math.round(tTy)} °C</span> · perf. ${ts.perf} %</small></div></div>
        <div class="pw-cell"><small>Rythme pneus ${(c.auto || {}).tyre ? '<em class="auto-tag">AUTO</em>' : ''}</small><div class="pw-mode ${(c.auto || {}).tyre ? 'is-auto' : ''}">${Object.entries(MG().MODES).map(([k, v]) => `<button class="${((c.auto || {}).tyre ? (res.tele[Math.min(L + 1, res.tele.length - 1)] || {}).mode || c.mode : c.mode) === k ? 'on' : ''} m-${k}" data-pw="mode" data-v="${k}" title="${k === 'push' ? 'Plus rapide de 0,4 s par tour, usure +50 %' : k === 'save' ? 'Plus lent de 0,3 s par tour, usure −35 %' : 'Rythme et usure normaux'}">${v.name}</button>`).join('')}</div></div>
        <div class="pw-cell"><small>Prochain train</small><div class="pw-next">${Object.values(MG().TYRES).map((t) => `<button class="${c.tyre === t.id ? 'on' : ''}" data-pw="tyre" data-v="${t.id}" style="--ty:${t.color}" title="${esc(t.name)}"><span class="tyre2 sm"></span></button>`).join('')}</div></div>
        <div class="pw-cell pw-boxc"><button class="pw-box ${c.box || pending ? 'on' : ''}" data-pw="box">${pending ? 'BOX CE TOUR ✓' : c.box ? `BOX ${boxLap === lap + 1 ? 'CE TOUR' : 'AU PROCHAIN TOUR'} ✓` : 'BOX · rentrer au stand'}</button><small>${pending ? `Arrêt en fin de tour ${res.lap} → ${MG().TYRES[meX.tyre].name}${canRedo() ? ' · cliquer pour annuler' : ''}` : c.box ? `Arrêt en fin de tour ${Math.min(LAPS, boxLap)} → ${MG().TYRES[c.tyre].name} · cliquer pour annuler` : ps && ps.lap > L ? `Plan : arrêt au tour ${ps.lap} → ${MG().TYRES[ps.tyre].name} <button class="pw-link" data-pw="plan">annuler le plan</button>` : (c.auto || {}).pits ? '<em class="auto-tag">AUTO</em> Arrêts gérés par l\'ingénieur (usure, météo, voiture de sécurité)' : c.plan ? 'Aucun autre arrêt prévu' : 'Plan annulé : arrêts manuels <button class="pw-link" data-pw="plan">reprendre le plan</button>'}</small></div>
        <div class="pw-rule ${rule ? 'ok' : 'ko'}">${rule ? '✓ Règle des 2 composés respectée' : `⚠️ Un seul composé utilisé : +${MG().RULE_PENALTY} s à l'arrivée sans changement de gomme`}</div>`;
    }
    $('#pitwall').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pw]'); if (!b || done) return;
      const c = res.ctl, k = b.dataset.pw;
      if (k === 'box' && !c.box && !(res.lap > lap && meX.pitLaps.includes(res.lap))) { openBoxChoice(); return; }
      if (k === 'mode') { c.mode = b.dataset.v; if (c.auto && c.auto.tyre) c.auto.tyre = false; } else if (k === 'tyre') c.tyre = b.dataset.v; else if (k === 'box') { if (res.lap > lap && meX.pitLaps.includes(res.lap)) { if (!canRedo()) return; c.skip = res.lap; c.box = false; } else { c.box = !c.box; if (c.box && c.skip === res.lap) c.skip = 0; } } else if (k === 'plan') c.plan = !c.plan;
      // l'ordre s'applique au tour en cours tant que la voiture n'a pas atteint l'entrée des stands : le tour est recalculé
      if (canRedo()) MG().redoLap(res);
      renderWall(lap);
    });
    // Appel au stand depuis le muret : la course se fige, le joueur choisit ses pneus (ou annule)
    function openBoxChoice() {
      if (done || paused) return;
      const wasRedo = canRedo();
      paused = true;
      const box = $('#radio');
      box.innerHTML = `<div class="radio-box">${RHEAD('Box, box · quels pneus monter ?')}
        <p>Arrêt en fin de tour ${Math.min(LAPS, wasRedo ? lap + 1 : lap + 2)}. Le composé choisi décide de la suite de votre stratégie.</p>${tyreChoice(lap)}
        <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn sm ghost" data-tc-cancel="1">Annuler, rester en piste</button></div></div>`;
      box.classList.add('on');
      box.onclick = (e) => {
        const t = e.target.closest('[data-tc]'), x = e.target.closest('[data-tc-cancel]');
        if (!t && !x) return;
        box.classList.remove('on'); box.innerHTML = ''; box.onclick = null; paused = false;
        if (t) { res.ctl.tyre = t.dataset.tc; res.ctl.box = true; if (res.ctl.skip === res.lap) res.ctl.skip = 0; if (wasRedo && res.lap === lap + 1) MG().redoLap(res); }
        renderWall(lap);
      };
    }
    const render = (L) => {
      const order = res.laps[L - 1];
      order.forEach((o) => {
        const el = $(`.trow[data-i="${o.i}"]`); if (!el) return;
        el.querySelector('.tt').innerHTML = o.out ? '' : tyreDot(o.ty, 'sm' + (o.wear > 0.75 ? ' worn' : ''));
      });
      towerTick();
      $('#lapN').textContent = L;
      wx(L);
      const feed = $('#feed');
      const evs = res.events.filter((e) => e.lap <= L).sort((a, b) => a.lap - b.lap);
      for (; evI < evs.length; evI++) {
        const e = evs[evI];
        const who = e.who != null ? byI.get(e.who) : null;
        if (e.type === 'sc') showFlag('🚨 VOITURE DE SÉCURITÉ', 'sc', 4500);
        if (e.type !== 'sc' && e.type !== 'wx' && who && !who.c.me && e.type !== 'dnf' && e.type !== 'tr' && !/arrêt au stand|puissance/.test(e.txt)) continue; // n'affiche que les faits marquants
        if (e.type === 'tr') {
          const w = who || meX, mine = !!w.c.me;
          trSay(e.txt, w);
          feed.insertAdjacentHTML('afterbegin', `<div class="ev tr ${mine ? 'mine' : 'other'}" style="--tc:${colorOf(w)}"><span class="muted">T${e.lap}</span> 📻 <b class="${mine ? 'me-t' : 'tr-who'}">${esc(radioId(w).code)}</b>${mine ? '' : ` <small class="muted">${esc(w.c.team || '')}</small>`} « ${esc(e.txt)} »</div>`);
          continue;
        }
        const nm = who ? (who.c.me ? '<b class="me-t">Votre voiture</b>' : `<b>${esc(who.name)}</b>`) : '';
        feed.insertAdjacentHTML('afterbegin', `<div class="ev ${e.type} ${who && who.c.me ? 'mine' : ''}"><span class="muted">T${e.lap}</span> ${e.type === 'sc' ? '🚨 ' + esc(e.txt) : e.type === 'wx' || e.type === 'radio' ? esc(e.txt) : nm + ' ' + esc(e.txt)}</div>`);
      }
    };
    // Radio stand : la course se fige, 15 secondes pour décider, sinon le choix prudent s'applique
    const askRadio = (dil, then) => {
      paused = true;
      const box = $('#radio');
      const RADIO_S = 15; let leftS = RADIO_S;
      const answer = (idx, auto, tyre) => {
        if (!paused) return;
        clearInterval(radioTimer); radioTimer = null;
        if (auto && box.dataset.pick != null && box.dataset.pick !== '') { idx = +box.dataset.pick; } // temps écoulé pendant le choix des pneus : l'option choisie s'applique avec le composé prévu
        delete box.dataset.pick;
        const r = MG().applyChoice(res, dil, +idx, tyre);
        box.innerHTML = `<div class="radio-box res ${r.out ? 'bad' : r.dt < 0 ? 'good' : r.dt > 0 ? 'bad' : ''}">${RHEAD('Radio stand' + (auto ? ' · temps écoulé, choix prudent appliqué' : ''))}<div class="radio-pick">${esc(r.choice)}</div><p>${esc(r.msg)}</p></div>`;
        setTimeout(() => { box.classList.remove('on'); box.innerHTML = ''; paused = false; then(); renderWall(lap); }, 2600);
      };
      box.innerHTML = `<div class="radio-box">${RHEAD('Radio stand · ' + esc(dil.title), `<b class="radio-cd" id="radioCd">${RADIO_S}</b>`)}
        <p>${esc(dil.text)}</p><div class="radio-opts">${dil.options.map((o, i) => `<button class="btn sm ghost" data-radio="${i}">${esc(o)}</button>`).join('')}</div>
        <div class="radio-bar"><i id="radioBar"></i></div></div>`;
      box.classList.add('on'); renderWall(lap);
      box.onclick = (e) => {
        const t = e.target.closest('[data-tc]'); if (t) { answer(box.dataset.pick, false, t.dataset.tc); return; }
        const b = e.target.closest('[data-radio]'); if (!b) return;
        const idx = +b.dataset.radio;
        if (dil.box && dil.box[idx]) {
          // arrêt au stand : choisir le composé avant de valider (le compte à rebours continue)
          box.dataset.pick = idx;
          box.querySelector('.radio-opts').outerHTML = `<div class="radio-q"><b>${esc(dil.options[idx])}</b> · quels pneus monter ?</div>${tyreChoice(lap)}`;
          return;
        }
        answer(idx, false);
      };
      radioTimer = setInterval(() => { leftS -= 0.1; const cd = $('#radioCd'), bar = $('#radioBar'); if (cd) cd.textContent = Math.max(0, Math.ceil(leftS)); if (bar) bar.style.width = Math.max(0, (leftS / RADIO_S) * 100) + '%'; if (leftS <= 0) answer(dil.def, true); }, 100);
    };
    // Grand Prix Hebdomadaire : chrono total, meilleur temps de la semaine, petit bonus d'XP ; sponsors et ligue non concernés
    const finishWeekly = (silent, me) => {
      const ev = res.weekly, dnf = !!me.out || !!meX.pen;
      const timeMs = dnf ? null : Math.round(meX.time * 1000);
      const xp = Math.max(1, Math.round(MG().xpForRace(me.pos, me.out, MG().ageOf(ctx.drvM.id)) / 3));
      const rec = F1.store.recordWeekly({ weekId: ev.id, timeMs, pos: me.pos, chassis: ctx.ch.name, chassisId: ctx.ch.id, driver: ctx.drvM.name, xp: me.out ? 0 : xp, circuit: ev.race.nameFr });
      const so = SO();
      const sub = so.ready && so.me ? F1.social.submitWeekly(ev.id, timeMs, me.pos, ctx.ch.name, ctx.drvM.name) : Promise.reject(Object.assign(new Error('offline'), { offline: true }));
      if (silent || !$('.race-main')) { sub.catch(() => {}); showAchievements(); return; }
      T = LAPS; paused = false; $('#radio').classList.remove('on'); render(LAPS); renderWall(LAPS); renderTele();
      if (S.raceMap) { S.raceMap.dispose(); S.raceMap = null; }
      const w = F1.store.mgr().weeklyGP;
      const why = me.out ? `abandon (${esc(meX.out.why)})` : meX.pen ? 'règle des 2 composés secs non respectée' : '';
      const rows = res.final.filter((r) => r.pos <= 10 || r.i === meX.i).map((r) => { const x = byI.get(r.i); return `<tr class="${x.c.me ? 'me-row' : ''}"><td class="pos">${r.out ? 'AB' : r.pos}</td><td><span class="tstripe" style="background:${colorOf(x)};display:inline-block;height:13px;margin-right:7px;vertical-align:-1px"></span>${esc(x.name)}${x.c.me ? ' <small class="muted">(vous)</small>' : x.c.mate ? ' <small class="db-mate-tag">coéquipier</small>' : x.c.team ? ` <small class="muted">${esc(x.c.team)}</small>` : ''}</td><td class="r num">${r.out ? 'Abandon' : r.pos === 1 ? 'Vainqueur' : '+' + r.gap.toFixed(1).replace('.', ',') + ' s'}</td></tr>`; }).join('');
      $('.race-main').outerHTML = `<div class="debrief">
        <section class="db-card db-res"><header><span>Votre chrono</span><small>${esc(ev.race.nameFr)} · semaine ${ev.week} · ${LAPS} tours</small></header>
          <div class="wk-time ${dnf ? 'dnf' : ''}"><b>${dnf ? 'DNF / Non classé' : MG().fmtRaceTime(timeMs)}</b><small class="muted">${dnf ? why : `Arrivée P${me.pos} · ${esc(ctx.ch.name)} · ${esc(ctx.drvM.name)}`}${rec.improved ? ' · <b class="up">nouveau meilleur temps de la semaine !</b>' : ''}</small></div>
          <div class="table-wrap"><table class="tbl db-tbl"><thead><tr><th>Pos</th><th>Pilote</th><th class="r">Écart</th></tr></thead><tbody>${rows}</tbody></table></div></section>
        <div class="db-side"><section class="db-card"><header><span>Grand Prix Hebdomadaire</span></header>
          <div class="db-money"><div><small>Meilleur temps</small><b>${w && w.bestTime != null ? MG().fmtRaceTime(w.bestTime) : '—'}</b></div><div><small>Tentatives restantes</small><b>${rec.left} / ${w ? F1.store.weeklyMax(w) : MG().WEEKLY_ATTEMPTS}</b></div><div><small>Classement général</small><b id="wkRank">…</b></div></div>
          <div class="db-stats">${rec.prime ? `<span class="chip gold">+${fmtPC(rec.prime)} : premier chrono de la semaine</span>` : ''}${rec.xp ? `<span class="chip green">+${rec.xp} XP de participation</span>` : ''}${rec.passXp ? `<a class="chip blue" href="#/manager/passe">🎟️ +${rec.passXp} XP Pass de saison</a>` : ''}<span class="chip">Sponsors et ligue en pause pendant le Grand Prix Hebdomadaire</span></div>
          <small class="muted">À la clôture (dimanche 23 h 59), une prime de PitCoins est versée selon votre rang, et un trophée pour un top 10.</small></section></div>
        <div class="db-actions">${rec.left > 0 ? '<button class="btn ghost" data-action="wk-go">Seconde tentative</button>' : ''}<button class="btn" data-action="wk-back">Retour au Grand Prix Hebdomadaire</button></div></div>`;
      $('.race-ctl').classList.add('done');
      sub.then(() => (timeMs != null ? F1.social.weeklyRank(ev.id, (F1.store.mgr().weeklyGP || {}).bestTime || timeMs) : null)).then((rk) => { const el = $('#wkRank'); if (el) el.textContent = rk ? `${rk.rank}${rk.rank === 1 ? 'er' : 'e'} / ${rk.total}` : 'non classé'; })
        .catch((e) => { const el = $('#wkRank'); if (el) el.textContent = e.offline ? 'hors ligne' : e.missing ? 'bientôt' : '—'; });
      if (!dnf && me.pos <= 3) confetti(me.pos === 1 ? 220 : 90);
      showAchievements();
    };
    const finish = (silent) => {
      if (done) return; done = true;
      clearInterval(raceTimer); raceTimer = null; clearInterval(radioTimer); radioTimer = null; S.raceFinish = null;
      MG().simulate({ R: res }); // termine les tours restants sans intervention (bouton Passer, fenêtre fermée)
      const me = res.final.find((x) => x.i === meX.i);
      if (res.weekly) return finishWeekly(silent, me);
      const rw = MG().rewards(me.pos, me.out, leagueBefore);
      rw.pc = Math.round(rw.pc * (1 + ctx.tb.pc));
      if (isCareer()) rw.pc = Math.round(rw.pc * (1 + ((F1.store.career().cal.pop || 40) - 50) / 200)); // popularité : sponsors plus généreux
      const m0 = F1.store.mgr(), drvId = m0.driver && m0.driver.id;
      const xpBefore = drvId ? MG().driverGrowth(drvId, JSON.parse(JSON.stringify(m0.drvXp || {}))) : null, pcBefore = m0.pc;
      const mateX = res.field.find((x) => x.c.mate), mateR = mateX ? res.final.find((x) => x.i === mateX.i) : null;
      const mateRes = mateX && mateR ? { id: mateX.driver.id, name: mateX.driver.name, pos: mateR.pos, dnf: !!mateR.out, pc: Math.round(MG().matePC(mateR.pos, mateR.out, leagueBefore) * (1 + ctx.tb.pc)) } : null;
      const maxEng = Math.max(...res.tele.filter(Boolean).map((t) => t.tEng || 0));
      const cls = res.final.map((r) => { const x = byI.get(r.i); return { id: x.c.me ? 'me' : (x.driver && x.driver.id) || 'ai' + r.i, n: x.c.me ? 'Vous' : (x.driver && (x.driver.name || x.driver.family)) || '', t: x.c.chassisId || (x.driver && (x.driver.seatTeam || x.driver.teamId)) || '', pos: r.pos, out: !!r.out }; });
      F1.store.recordRace({ cls, nGP: (S.f1 || S.season).races.length, mate: mateRes, maxEng, pos: me.pos, dnf: me.out, grid: meX.grid, fastest: res.fastest.who === meX.i, rain: res.weather.some((x) => x.rain > 0.25), lp: rw.lp, pc: rw.pc, gp: ctx.race.nameFr.replace('Grand Prix', 'GP'), league: leagueBefore.name, driver: ctx.drvM.family, chassis: ctx.ch.name });
      F1.social.sync(true);
      if (isCareer()) { try { crNewsRace(F1.store.mgr().races[0] || {}); } catch (e) { /* presse facultative */ } }
      if (silent || !$('#raceEnd')) { showAchievements(); return; }
      T = LAPS; paused = false; $('#radio').classList.remove('on'); render(LAPS); renderWall(LAPS); renderTele();
      const m = F1.store.mgr();
      const Lnow = MG().leagueOf(m.lp);
      const promo = Lnow.min > leagueBefore.min, demo = Lnow.min < leagueBefore.min;
      // Débriefing d'après-course : classement, progression du pilote, bilan financier, ligue et sponsors
      if (S.raceMap) { S.raceMap.dispose(); S.raceMap = null; }
      const rec = m.races[0] || {};
      const xpAfter = drvId ? MG().driverGrowth(drvId, m.drvXp) : null;
      const strat = (x) => { const seq = []; (x.tyreLog || []).forEach((t) => { if (t && seq[seq.length - 1] !== t) seq.push(t); }); if (!seq.length) seq.push(x.tyre); return seq; };
      const stratHtml = (x) => strat(x).map((t) => tyreDot(t, 'sm')).join('<i class="st-arrow"></i>');
      const winner = byI.get(res.final[0].i);
      const gapTxt = (r) => (r.out ? 'Abandon' : r.pos === 1 ? 'Vainqueur' : '+' + r.gap.toFixed(1).replace('.', ',') + ' s');
      const rows = res.final.filter((r) => r.pos <= 10 || r.i === meX.i).map((r) => { const x = byI.get(r.i); return `<tr class="${x.c.me ? 'me-row' : ''}"><td class="pos">${r.out ? 'AB' : r.pos}</td><td><span class="tstripe" style="background:${colorOf(x)};display:inline-block;height:13px;margin-right:7px;vertical-align:-1px"></span>${esc(x.name)}${x.c.me ? ' <small class="muted">(vous)</small>' : x.c.mate ? ' <small class="db-mate-tag">coéquipier</small>' : x.c.team ? ` <small class="muted">${esc(x.c.team)}</small>` : ''}</td><td class="r num">${gapTxt(r)}</td><td><span class="st-seq">${stratHtml(x)}</span></td></tr>`; }).join('');
      // XP : barre du point en cours, de l'état d'avant à l'état d'après (un tour complet si un point est gagné)
      const XPP = MG().XP_PER_POINT, frac = (g) => (g.maxed ? 1 : (g.xp % XPP) / XPP);
      const statUp = xpBefore && xpAfter ? [['Rythme', 'pace'], ['Combativité', 'craft'], ['Régularité', 'cons']].map(([l, k]) => [l, xpAfter.bonus[k] - xpBefore.bonus[k]]).filter(([, d]) => d > 0.001) : [];
      const xpHtml = xpAfter ? `<div class="db-xp"><div class="row" style="justify-content:space-between"><b>${esc(ctx.drvM.name)}</b><span class="muted">${xpAfter.age} ans · ${esc(xpAfter.label)} · XP ×${fmt(xpAfter.mult, xpAfter.mult % 1 ? 1 : 0)}</span></div>
          <div class="xp-track"><i id="dbXp" style="width:${frac(xpBefore) * 100}%"></i></div>
          <div class="row" style="justify-content:space-between;font-size:13px"><span><b class="up">+${rec.xp || 0} XP</b> sur cette course</span><span class="muted">${xpAfter.maxed ? 'Plafond de progression atteint' : `${Math.ceil(xpAfter.next)} XP avant le prochain point`}</span></div>
          <div class="db-stats">${statUp.length ? statUp.map(([l, d]) => `<span class="chip green">${l} +${fmt(d, 1)}</span>`).join('') : '<span class="muted" style="font-size:12px">Pas encore de hausse de caractéristique : elle vient avec le prochain point de progression.</span>'}${rec.grew ? '<span class="chip gold">Nouveau point de progression !</span>' : ''}</div></div>` : '';
      const spRows = (rec.sponsors || []).map((x) => `<div class="db-sp"><span class="sp-badge" style="--sc:${x.color};--si:${x.ink}">${esc(x.name)}</span><div style="min-width:0"><div style="font-size:13px">${esc(x.goal)}</div><small class="muted">${x.status === 'win' ? 'Objectif atteint : prime versée' : x.status === 'fail' ? 'Contrat échu sans objectif : pénalité' : x.status === 'met' ? `✓ Objectif atteint · prime versée à l'échéance (${x.done}/${x.races} courses)` : `${x.hits}/${x.count} objectif${x.count > 1 ? 's' : ''} · ${x.done}/${x.races} courses${x.hitNow ? ' · objectif rempli sur cette course' : ''}`}</small></div>${x.amount ? `<b class="${x.amount > 0 ? 'up' : 'down'}">${x.amount > 0 ? '+' : '−'}${fmtPC(Math.abs(x.amount))}</b>` : ''}</div>`).join('');
      const pcNet = Math.round((m.pc - pcBefore) * 100) / 100;
      const lpMin = Lnow.min, lpNext = MG().nextLeague(m.lp), lpPct = lpNext ? ((m.lp - lpMin) / (lpNext.min - lpMin)) * 100 : 100;
      const fl = byI.get(res.fastest.who);
      $('.race-main').outerHTML = `<div class="debrief ${me.out ? 'dnf' : me.pos <= 3 ? 'podium' : ''}">
        <section class="db-card db-res"><header><span>Classement final</span><small>${esc(ctx.race.nameFr)} · ${LAPS} tours</small></header>
          <div class="db-pos"><b>${me.out ? 'Abandon' : 'P' + me.pos}</b><div><div>${me.out ? esc(meX.out.why) : me.pos === 1 ? 'Victoire !' : `à ${me.gap.toFixed(1).replace('.', ',')} s de ${esc(winner.name)}`}</div><small class="muted">Parti P${meX.grid} · ${meX.pits} arrêt${meX.pits > 1 ? 's' : ''} · stratégie <span class="st-seq">${stratHtml(meX)}</span>${meX.pen ? ` · <span class="down">+${meX.pen} s (un seul composé)</span>` : ''}${fl ? ` · meilleur tour : ${esc(fl.c.me ? 'vous' : fl.name)}` : ''}</small></div></div>
          ${mateRes ? `<div class="db-mate" style="--tc:${colorOf(mateX)}"><span class="db-mate-k">Coéquipier</span><b>${esc(mateRes.name)}</b><span class="db-mate-p">${mateRes.dnf ? 'Abandon' : 'P' + mateRes.pos}</span><span class="db-mate-pc ${mateRes.pc ? 'up' : ''}">${mateRes.pc ? '+' + fmtPC(mateRes.pc) : 'aucune prime'}</span></div>` : ''}
          <div class="table-wrap"><table class="tbl db-tbl"><thead><tr><th>Pos</th><th>Pilote</th><th class="r">Écart</th><th>Pneus</th></tr></thead><tbody>${rows}</tbody></table></div></section>
        <div class="db-side">${isCareer() ? careerDebrief(rec) : ''}
          <section class="db-card"><header><span>Progression du pilote</span></header>${xpHtml || '<div class="muted">Aucun pilote sous contrat.</div>'}</section>
          <section class="db-card"><header><span>Bilan financier et ligue</span></header>
            <div class="db-money"><div><small>PitCoins (course${rec.sponsors && rec.sponsors.some((x) => x.amount) ? ' + sponsors' : ''})</small><b class="${pcNet >= 0 ? 'up' : 'down'}">${pcNet >= 0 ? '+' : '−'}${fmtPC(Math.abs(pcNet))}</b></div><div><small>Points de ligue</small><b class="${rw.lp > 0 ? 'up' : rw.lp < 0 ? 'down' : ''}">${rw.lp > 0 ? '+' : ''}${rw.lp} LP</b></div><div><small>Ligue</small><b>${Lnow.icon} ${esc(Lnow.name)}</b></div></div>
            <div class="db-lp"><div class="bar"><i style="width:${Math.max(0, Math.min(100, lpPct))}%"></i></div><small class="muted">${fmt(m.lp)} LP${lpNext ? ` · ${lpNext.min - m.lp} LP avant la ligue ${lpNext.icon} ${lpNext.name}` : ' · ligue maximale'}</small></div>
            ${promo ? `<div class="promo">🎉 Promotion ! Bienvenue en ligue ${Lnow.icon} ${Lnow.name} (gains ×${Lnow.mult})</div>` : demo ? `<div class="promo down">Relégation en ligue ${Lnow.icon} ${Lnow.name}.</div>` : ''}
            ${rec.passXp ? passChip(rec.passXp) : ''}
            ${spRows ? `<div class="db-sps"><small class="muted">Objectifs sponsors</small>${spRows}</div>` : '<div class="muted" style="font-size:12px">Aucun sponsor sous contrat : signez-en un dans l\'onglet Sponsors.</div>'}</section>
        </div>
        <div class="db-actions"><button class="btn" data-action="m-qg">Retourner au QG</button></div></div>`;
      $('.race-ctl').classList.add('done');
      // barre d'XP animée
      if (xpAfter) requestAnimationFrame(() => { const el = $('#dbXp'); if (!el) return; const to = frac(xpAfter) * 100; if (rec.grew && !xpAfter.maxed) { el.style.width = '100%'; setTimeout(() => { el.style.transition = 'none'; el.style.width = '0%'; requestAnimationFrame(() => { el.style.transition = ''; el.style.width = to + '%'; }); }, 900); } else setTimeout(() => { el.style.width = to + '%'; }, 120); });
      if (!me.out && me.pos <= 3) confetti(me.pos === 1 ? 220 : 90);
      if (promo) setTimeout(() => confetti(260), 400);
      showAchievements();
    };
    /* ---------- Tour de classement en continu (toutes les 250 ms) ----------
       Les écarts au leader sont connus à chaque fin de tour : entre deux, ils sont interpolés, si bien qu'on voit
       les voitures se rapprocher, s'éloigner et se dépasser en plein tour. */
    let twMode = 'gap';
    const near = { ahead: 99, behind: 99 };
    function towerTick() {
      const L = Math.max(0, Math.floor(T)), f = Math.max(0, Math.min(1, T - L)), L1 = Math.min(res.lap, L + 1);
      const rows = res.field.map((x) => {
        const g = res.gapArr[x.i], g0 = g[Math.min(L, g.length - 1)], g1 = g[Math.min(L1, g.length - 1)];
        const outNow = !!(x.out && L >= x.out.lap);
        return { x, gp: outNow ? Infinity : g0 + (g1 - g0) * f, outNow, stops: x.pitLaps.filter((l) => l <= L).length };
      });
      const run = rows.filter((r) => !r.outNow).sort((a, b) => a.gp - b.gp), outs = rows.filter((r) => r.outNow).sort((a, b) => b.x.out.lap - a.x.out.lap);
      const lead = run.length ? run[0].gp : 0;
      [...run, ...outs].forEach((r, k) => {
        const el = $(`.trow[data-i="${r.x.i}"]`); if (!el) return;
        const ty = `translateY(${k * ROW}px)`; if (el.style.transform !== ty) el.style.transform = ty;
        const pos = r.outNow ? 'AB' : String(k + 1);
        const tp = el.querySelector('.tp'); if (tp.textContent !== pos) tp.textContent = pos;
        let gt;
        if (r.outNow) gt = 'Abandon';
        else if (k === 0) gt = twMode === 'gap' ? 'Leader' : 'Intervalle';
        else { const v = twMode === 'gap' ? r.gp - lead : r.gp - run[k - 1].gp; gt = '+' + (v < 60 ? v.toFixed(3) : v.toFixed(1)); }
        const tg = el.querySelector('.tg'); if (tg.textContent !== gt) tg.textContent = gt;
        const st = r.stops ? `${r.stops} STOP${r.stops > 1 ? 'S' : ''}` : '';
        const ps = el.querySelector('.tps'); if (ps.textContent !== st) { ps.textContent = st; ps.className = 'tps s' + Math.min(3, r.stops); }
        el.classList.toggle('out', r.outNow);
        if (r.x === meX && !r.outNow) { near.ahead = k > 0 ? r.gp - run[k - 1].gp : 99; near.behind = k < run.length - 1 ? run[k + 1].gp - r.gp : 99; }
      });
    }
    $('.tower-h').addEventListener('click', (e) => { const b = e.target.closest('[data-tw]'); if (!b) return; twMode = b.dataset.tw; $$('.tower-h [data-tw]').forEach((x) => x.classList.toggle('on', x === b)); towerTick(); });

    /* ---------- Télémétrie : carburant, batterie ERS, températures, et commandes ---------- */
    const TE = MG();
    const teleAt = () => {
      const L = Math.max(0, Math.floor(T)), f = Math.max(0, Math.min(1, T - L));
      const a = res.tele[Math.min(L, res.tele.length - 1)] || res.tele[0], b = res.tele[Math.min(L + 1, res.tele.length - 1)] || a;
      const mix = (k) => a[k] + (b[k] - a[k]) * f;
      return { fuel: mix('fuel'), bat: mix('bat'), tEng: mix('tEng'), tTyre: mix('tTyre'), lapsLeft: Math.max(0, LAPS - T) };
    };
    const lvl = (v, warn, crit, low) => (v >= crit ? 'crit' : v >= warn ? 'warn' : low != null && v < low ? 'cold' : 'ok');
    const gauge = (k, label) => `<div class="tg-g" data-g="${k}"><div class="tg-h"><small>${label}</small><b class="num" data-v></b><em data-s></em></div><div class="tg-bar">${k === 'tyre' ? '<span class="tg-win" style="left:42.9%;width:21.4%"></span>' : k === 'eng' ? '<span class="tg-red" style="left:70%;width:30%"></span>' : ''}<i data-b></i></div></div>`;
    // valeur effectivement utilisée sur le tour en cours (choix du joueur ou de l'ingénieur si la commande est automatique)
    const AUTO = res.ctl.auto || (res.ctl.auto = {});
    const usedNow = () => res.tele[Math.min(lap + 1, res.tele.length - 1)] || {};
    const ctlSeg = (key, opts, autoKey) => { const auto = AUTO[autoKey], cur = auto ? usedNow()[key] || res.ctl[key] : res.ctl[key]; return `<div class="seg tl-seg ${auto ? 'is-auto' : ''}" data-tl="${key}" data-auto="${autoKey}">${Object.entries(opts).map(([k, v]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''} tl-${k}"><i class="led"></i>${esc(v.name)}</button>`).join('')}</div>`; };
    const autoTag = (k) => (AUTO[k] ? '<em class="auto-tag" title="Géré par l\'ingénieur : touchez une commande pour reprendre la main">AUTO</em>' : '');
    const REV = 15;
    function renderTele() {
      const el = $('#tele'); if (!el) return;
      if (done || meX.out && lap >= meX.out.lap) { el.innerHTML = ''; return; }
      const act = res.ctl.act, actLap = act ? act.lap : 0, pend = act && actLap > lap;
      el.innerHTML = `<div class="rev" aria-hidden="true">${Array.from({ length: REV }, (_, i) => `<i class="${i < 5 ? 'g' : i < 10 ? 'r' : 'b'}"></i>`).join('')}</div>
        <div class="tl-gauges">${gauge('fuel', 'Carburant')}${gauge('bat', 'Batterie ERS')}${gauge('tyre', 'Temp. pneus')}${gauge('eng', 'Temp. moteur')}</div>
        <div class="tl-ctl">
          <div class="tl-c"><small>Mix · carburant ${autoTag('mix')}</small>${ctlSeg('mix', TE.MIX, 'mix')}</div>
          <div class="tl-c"><small>ERS · déploiement ${autoTag('ers')}</small>${ctlSeg('ers', TE.ERS, 'ers')}</div>
          <div class="tl-c tl-acts"><small>Consignes pilote ${autoTag('cool')}</small><div class="tl-btns">
            <button class="tl-act atk ${pend && act.k === 'attack' ? 'on' : ''}" data-act="attack" title="Manœuvre agressive au prochain freinage si l'écart est sous 1,0 s : batterie −18 %, pneus et moteur chauffent, risque de blocage si mal préparée">⚔ Tenter un dépassement<span data-hint="attack"></span></button>
            <button class="tl-act def ${pend && act.k === 'defend' ? 'on' : ''}" data-act="defend" title="Fermer les portes face à une voiture à moins d'1 s : batterie −12 %, gomme sollicitée">🛡 Défendre la position<span data-hint="defend"></span></button>
            <button class="tl-act cool ${(AUTO.cool ? usedNow().cool : res.ctl.cool) ? 'on' : ''}" data-act="cool" title="Lift & coast hors de l'aspiration : −0,25 s par tour, mais le moteur et les pneus refroidissent, consommation −4 %">❄ Air propre / Refroidir${(AUTO.cool ? usedNow().cool : res.ctl.cool) ? ' ✓' : ''}</button></div></div>
        </div>`;
      teleTick();
    }
    function teleTick() {
      const el = $('#tele'); if (!el || !el.firstChild) return;
      const v = teleAt(), burn = (TE.MIX[(AUTO.mix && usedNow().mix) || res.ctl.mix] || TE.MIX.std).burn;
      const fd = TE.fuelDelta(v.fuel, burn, v.lapsLeft), fuel0 = res.tele[0].fuel;
      const set = (k, val, pct, cls, sub) => {
        const g = el.querySelector(`[data-g="${k}"]`); if (!g) return;
        g.className = 'tg-g ' + cls; g.querySelector('[data-v]').textContent = val; g.querySelector('[data-s]').textContent = sub || '';
        g.querySelector('[data-b]').style.width = Math.max(0, Math.min(100, pct)) + '%';
      };
      const fr = (n, d = 1) => n.toFixed(d).replace('.', ',');
      set('fuel', `${fr(Math.max(0, TE.KG(v.fuel, LAPS)))} kg`, (v.fuel / fuel0) * 100, v.fuel <= 0 ? 'crit' : fd < 0 ? 'crit' : fd < 0.6 ? 'warn' : 'ok', `${fd >= 0 ? '+' : '−'}${fr(Math.abs(fd))} tour${Math.abs(fd) >= 2 ? 's' : ''}`);
      set('bat', `${Math.round(v.bat)} %`, v.bat, v.bat < 12 ? 'crit' : v.bat < 35 ? 'warn' : 'ok', (TE.ERS[(AUTO.ers && usedNow().ers) || res.ctl.ers] || {}).name || '');
      set('tyre', `${Math.round(v.tTyre)} °C`, ((v.tTyre - 60) / 70) * 100, v.tTyre > TE.TYRE_HI + 5 ? 'crit' : v.tTyre > TE.TYRE_HI ? 'warn' : v.tTyre < 85 ? 'cold' : 'ok', v.tTyre > TE.TYRE_HI ? 'surchauffe' : v.tTyre < 85 ? 'froids' : 'fenêtre 90–105');
      set('eng', `${Math.round(v.tEng)} °C`, ((v.tEng - 80) / 50) * 100, v.tEng > TE.ENG_CRIT ? 'crit' : v.tEng > TE.ENG_CRIT - 5 ? 'warn' : 'ok', v.tEng > TE.ENG_CRIT ? 'critique' : 'limite 115');
      // consignes possibles selon les écarts du moment
      const ha = el.querySelector('[data-hint="attack"]'), hd = el.querySelector('[data-hint="defend"]');
      if (ha) ha.textContent = near.ahead < 90 ? ` · ${fr(near.ahead)} s` : '';
      if (hd) hd.textContent = near.behind < 90 ? ` · ${fr(near.behind)} s` : '';
      const ba = el.querySelector('[data-act="attack"]'), bd = el.querySelector('[data-act="defend"]');
      if (ba) { ba.classList.toggle('ready', near.ahead <= 1.0); ba.disabled = near.ahead >= 90 && !ba.classList.contains('on'); }   // en tête : personne à attaquer
      if (bd) { bd.classList.toggle('ready', near.behind <= 1.0); bd.disabled = near.behind >= 90 && !bd.classList.contains('on'); }
    }
    $('#tele').addEventListener('click', (e) => {
      if (done || T < 0) return;
      const seg = e.target.closest('[data-tl] [data-v]'), a = e.target.closest('[data-act]');
      if (!seg && !a) return;
      if (seg) { res.ctl[seg.parentElement.dataset.tl] = seg.dataset.v; const ak = seg.parentElement.dataset.auto; if (AUTO[ak]) { AUTO[ak] = false; toast('🎧', 'Vous reprenez la main : commande manuelle'); } }
      if (a) {
        const k = a.dataset.act;
        if (k === 'cool') { if (AUTO.cool) { AUTO.cool = false; res.ctl.cool = !usedNow().cool; } else res.ctl.cool = !res.ctl.cool; }
        else {
          const forLap = canRedo() ? lap + 1 : lap + 2;
          if (res.ctl.act && res.ctl.act.k === k && res.ctl.act.lap === forLap) res.ctl.act = null; // second clic : annuler
          else res.ctl.act = { k, lap: forLap };
        }
      }
      // l'ordre s'applique au tour en cours tant que la voiture n'a pas atteint le point de freinage : le tour est recalculé
      if (canRedo()) MG().redoLap(res);
      renderTele(); renderWall(lap);
    });

    /* ---------- Radio du pilote : encart flottant (numéro, couleurs de l'écurie, égaliseur pendant le message) ---------- */
    const trQ = []; let trBusy = false;
    // identité radio d'une voiture : numéro et nom réels du pilote quand il existe dans la saison, sinon son code
    const radioId = (x) => {
      const md = {};
      if (x.c.me) return { num: String(drvNum || x.driver.code), team: meTeam, name: x.driver.name || x.driver.code, code: x.driver.code };
      return { num: String(x.driver.number || md.number || x.driver.code || '?'), team: x.c.chassisId || x.driver.teamId, name: x.driver.short || x.name, code: x.driver.code || '?' };
    };
    function trSay(txt, x = meX) {
      // file d'attente courte : on ne garde pas plus de deux messages des autres pilotes en attente
      if (!x.c.me && trQ.filter((q) => !q.x.c.me).length >= 2) return;
      trQ.push({ txt, x }); if (!trBusy) trNext();
    }
    function trNext() {
      const el = $('#trRadio'); if (!el) { trQ.length = 0; trBusy = false; return; }
      const q = trQ.shift(); if (!q) { trBusy = false; return; }
      const txt = q.txt, x = q.x, col = colorOf(x), ink = inkOn(col), id = radioId(x);
      trBusy = true;
      el.innerHTML = `<div class="trr ${x.c.me ? 'mine' : 'other'}" style="--tc:${col};--ti:${ink}"><span class="trr-num">${plate(id.num, id.team, ink, id.code)}</span><div class="trr-body"><div class="trr-h"><b>${esc(id.name)}</b><span class="trr-eq talking"><i></i><i></i><i></i><i></i><i></i><i></i></span><small>${x.c.me ? 'RADIO' : esc(x.c.team || '')}</small></div><p>« <span class="trr-t"></span> »</p></div></div>`;
      el.classList.add('on');
      const out = el.querySelector('.trr-t'), eq = el.querySelector('.trr-eq'); let n = 0;
      const typ = setInterval(() => { n += 2; out.textContent = txt.slice(0, n); if (n >= txt.length) { clearInterval(typ); eq.classList.remove('talking'); setTimeout(() => { el.classList.remove('on'); setTimeout(trNext, 350); }, 3600); } }, 28);
    }

    /* ---------- Grille de départ : charge de carburant et gestion automatique ---------- */
    const AUTO_OPTS = [
      ['ers', 'ERS', 'Déploie dans la seconde de la voiture devant, recharge sous 25 %'],
      ['mix', 'Mélange carburant', 'Économise si la marge fond, attaque quand il y a du rab'],
      ['cool', 'Refroidissement', 'Lift & coast dès que le moteur dépasse 112 °C'],
      ['tyre', 'Rythme pneus', 'Ménage la gomme au-dessus de 104 °C, attaque si elle est froide'],
      ['pits', 'Arrêts au stand', 'L\'ingénieur décide des arrêts (usure, météo, voiture de sécurité) ; le bouton BOX reste à vous'],
    ];
    try { Object.assign(AUTO, JSON.parse(getPref('autoMgmt') || '{}')); } catch (e) { /* préférences illisibles */ }
    function gridChoice() {
      paused = true;
      const box = $('#radio');
      const card = (k, v) => `<button class="fl-opt ${k === res.ctl.fuelLoad ? 'on' : ''}" data-fl="${k}"><b>${esc(v.name)}</b><span class="num">${Math.round(TE.KG(LAPS * v.k, LAPS))} kg</span><small>${esc(v.desc)}</small><em>${v.k >= 1.05 ? 'marge ≈ ' + Math.round((v.k - 1) * LAPS) + ' tours au mélange standard' : v.k < 1 ? 'manque ≈ ' + Math.round((1 - v.k) * LAPS) + ' tours : mélange Économie obligatoire' : 'marge ≈ ' + Math.max(1, Math.round((v.k - 1) * LAPS)) + ' tour'}</em></button>`;
      box.innerHTML = `<div class="radio-box grid-box">${RHEAD('Grille de départ · charge de carburant')}
        <p>Chaque kilo se paie au chrono : environ ${fr3((TE.KG ? 3 / 100 : 0.03))} s par kilo et par tour. Moins de carburant, c'est une voiture plus légère mais des tours en économie ; plus, c'est de la marge pour le mélange riche.</p>
        <div class="fl-grid">${Object.entries(TE.FUEL_LOAD).map(([k, v]) => card(k, v)).join('')}</div>
        <div class="au-h"><b>Gestion automatique</b><small>Confiez certaines commandes à votre ingénieur de course. Vous pouvez reprendre la main à tout moment en touchant la commande.</small></div>
        <div class="au-grid">${AUTO_OPTS.map(([k, l, d]) => `<button class="au-opt ${AUTO[k] ? 'on' : ''}" data-au="${k}"><span class="au-sw"><i></i></span><span><b>${l}</b><small>${d}</small></span></button>`).join('')}</div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-fl-go="1">Valider · extinction des feux</button></div></div>`;
      box.classList.add('on', 'grid-on');
      box.onclick = (e) => {
        const c = e.target.closest('[data-fl]');
        if (c) { res.ctl.fuelLoad = c.dataset.fl; $$('.fl-opt', box).forEach((x) => x.classList.toggle('on', x === c)); return; }
        const au = e.target.closest('[data-au]');
        if (au) { const k = au.dataset.au; AUTO[k] = !AUTO[k]; au.classList.toggle('on', !!AUTO[k]); setPref('autoMgmt', JSON.stringify(AUTO)); return; }
        if (!e.target.closest('[data-fl-go]')) return;
        res.tele[0].fuel = LAPS * TE.FUEL_LOAD[res.ctl.fuelLoad].k;
        MG().redoLap(res);   // le tour 1 est recalculé avec la charge choisie
        box.classList.remove('on', 'grid-on'); box.innerHTML = ''; box.onclick = null; paused = false;
        renderTele(); renderWall(0);
      };
    }
    const fr3 = (n) => n.toFixed(2).replace('.', ',');
    const mtEl = $('#mtele'), mtBtn = $('#mtlBtn');
    let mtOpen = getPref('mapTele') === '1', mtTrace = [], mtLast = 0;
    const mtShow = () => { mtEl.hidden = !mtOpen; mtBtn.classList.toggle('on', mtOpen); $('.race-stage').classList.toggle('mt-open', mtOpen); };
    mtEl.innerHTML = `<div class="mt-h"><span class="mt-num" style="--tc:${meCol};--ti:${meInk}">${plate(drvNum, meTeam, meInk, meX.driver.code)}</span><b>${esc(meX.driver.code)}</b><small>Télémétrie live</small></div>
      <div class="mt-rev">${Array.from({ length: 15 }, (_, i) => `<i class="${i < 5 ? 'g' : i < 10 ? 'r' : 'b'}"></i>`).join('')}</div>
      <div class="mt-main"><div class="mt-spd"><b class="num" data-m="v">0</b><small>km/h</small></div><div class="mt-gear"><b data-m="g">N</b><small>rapport</small></div>
        <div class="mt-pd"><span><i data-m="thr"></i></span><span class="brk"><i data-m="brk"></i></span><small>ACC · FRN</small></div></div>
      <div class="mt-tags"><span data-m="ers">ERS</span><span data-m="drs">DRS</span><span data-m="rpm" class="num">0 tr/min</span></div>
      <canvas class="mt-tr" width="440" height="84"></canvas>`;
    mtShow();
    mtBtn.addEventListener('click', () => { mtOpen = !mtOpen; setPref('mapTele', mtOpen ? '1' : ''); mtShow(); });
    function mtTick(now) {
      if (!mtOpen || !S.raceMap || !S.raceMap.tele) return;
      if (now - mtLast < 70) return; mtLast = now;
      const t = S.raceMap.tele(), q = (k) => mtEl.querySelector(`[data-m="${k}"]`);
      q('v').textContent = Math.round(t.v); q('g').textContent = t.out ? '—' : t.gear ? t.gear : 'N';
      q('thr').style.height = Math.round(t.thr * 100) + '%'; q('brk').style.height = Math.round(t.brk * 100) + '%';
      q('rpm').textContent = `${Math.round(t.rpm / 100) * 100} tr/min`;
      const lit = Math.round(((t.rpm - 9000) / 3600) * 15);
      mtEl.querySelectorAll('.mt-rev i').forEach((el, i) => el.classList.toggle('on', i < lit));
      const tl = usedNow(), dep = tl.ers === 'ot' || tl.ers === 'hotlap';
      const ers = q('ers'); ers.textContent = t.pit ? 'LIMITEUR' : dep && !t.brk ? 'DÉPLOIEMENT' : t.brk || tl.ers === 'rech' ? 'RÉCUPÉRATION' : 'ERS ÉQUILIBRÉ'; ers.className = t.pit ? 'pit' : dep && !t.brk ? 'dep' : t.brk || tl.ers === 'rech' ? 'harv' : '';
      const drs = q('drs'); drs.classList.toggle('on', !!t.straight && near.ahead <= 1 && T > 2 && !t.pit);
      mtTrace.push(t.v); if (mtTrace.length > 110) mtTrace.shift();
      const cv = mtEl.querySelector('.mt-tr'), c = cv.getContext('2d'), w = cv.width, h = cv.height;
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; [0.25, 0.5, 0.75].forEach((f) => { c.beginPath(); c.moveTo(0, h * f); c.lineTo(w, h * f); c.stroke(); });
      c.beginPath(); mtTrace.forEach((v, i) => { const x = (i / 109) * w, y = h - 4 - (v / 350) * (h - 8); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.strokeStyle = meCol; c.lineWidth = 2.4; c.lineJoin = 'round'; c.stroke();
      c.lineTo(w * ((mtTrace.length - 1) / 109), h); c.lineTo(0, h); c.closePath(); c.fillStyle = 'rgba(255,255,255,.05)'; c.fill();
    }
    // températures air / piste et vent : interpolées dans le tour, avec la tendance du tour suivant
    function mapWxTick() {
      const el = $('#mapWx'); if (!el) return;
      const L = Math.max(0, Math.min(LAPS - 1, Math.floor(T))), f = Math.max(0, Math.min(1, T - L)), A = res.weather[L], B = res.weather[Math.min(LAPS, L + 1)] || A, C = res.weather[Math.min(LAPS, L + 3)] || B;
      const air = A.air + (B.air - A.air) * f, trk = A.track + (B.track - A.track) * f, wind = (A.wind || 0) + ((B.wind || 0) - (A.wind || 0)) * f;
      const tr = (now, fut) => (fut > now + 0.25 ? '<i class="up">▲</i>' : fut < now - 0.25 ? '<i class="dn">▼</i>' : '<i>■</i>');
      const deg = S.raceMap && S.raceMap.windDeg ? S.raceMap.windDeg() : 0;
      el.innerHTML = `<span><small>AIR</small><b class="num">${air.toFixed(1).replace('.', ',')}°</b>${tr(air, C.air)}</span><span><small>PISTE</small><b class="num">${trk.toFixed(1).replace('.', ',')}°</b>${tr(trk, C.track)}</span><span><small>VENT</small><b class="num">${Math.round(wind)}</b><em>km/h</em><svg class="wind-ar" viewBox="0 0 12 12" style="transform:rotate(${Math.round(deg)}deg)"><path d="M1 6h9M7 3l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>`;
    }
    $('.race-ctl').addEventListener('click', (e) => { if (e.target.closest('[data-rfs]')) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFull(); } });

    S.raceFinish = finish;
    wx(0);
    towerTick(); renderTele(); mapWxTick(); gridChoice();
    // carte 2D : tracé du circuit et un point par voiture
    try {
      S.raceMap = F1.racemap.mount($('#raceMap'), {
        res, seedStr: ctx.race.circuitId || ctx.race.nameFr, colorOf, getT: () => T, style: mapStyle(), low: lowMode(),
        // décor du circuit (paysage et lieux emblématiques de la page d'accueil), sous la piste
        scene: ctx.race.circuitId ? trackSvg(ctx.race.circuitId, '#ffffff', true) : '',
        onIncident: (x, out) => showFlag(out.crash ? `🟡 DRAPEAU JAUNE · accident de <b>${esc(x.c.me ? 'votre voiture' : x.name)}</b>` : `💨 ${esc(out.why)} · <b>${esc(x.c.me ? 'votre voiture' : x.name)}</b> s'arrête`, out.crash ? 'yellow' : 'mech'),
      });
    } catch (e) { console.warn(e); const st = $('.race-stage'); if (st) st.classList.add('off'); }
    let lastTick = performance.now(), hfT = 0, revT = 0;
    raceTimer = setInterval(() => {
      // temps réel écoulé (et non nombre de ticks) : la course garde son rythme même sur un appareil lent
      const nowT = performance.now(), el = Math.min(500, nowT - lastTick); lastTick = nowT;
      if (flagT && nowT > flagT) { flagEl.classList.remove('on'); flagT = 0; }
      if (paused) return;
      T = Math.min(lap + 1, LAPS, T + (el / LAP_MS) * (T < 0 ? 1 : S.raceSpeed || 1)); // ne dépasse jamais le dernier tour calculé
      if (!started && T >= 0) { started = true; showFlag('🚦 Extinction des feux : c\'est parti !', 'mech', 2200); }
      if (nowT - hfT >= 250) { hfT = nowT; towerTick(); teleTick(); mapWxTick(); }
      mtTick(nowT);
      if (S.raceMap && S.raceMap.tele && nowT - revT > 70) { revT = nowT; const t = S.raceMap.tele(), lit = Math.round(((t.rpm - 9000) / 3600) * 15); $$('#tele .rev i').forEach((el, i) => el.classList.toggle('on', i < lit)); }
      const L = Math.floor(T + 1e-6);
      if (L > lap) {
        lap = L;
        if (lap >= LAPS) return finish(false);
        render(lap); renderTele();
        const dil = res.DL.includes(lap) ? MG().dilemmaFor(res) : null;
        if (dil) { T = lap; askRadio(dil, () => MG().stepLap(res)); } else MG().stepLap(res);
      }
    }, STEP);
  }

  /* =================== Grand Prix Hebdomadaire ===================
     Un Grand Prix par semaine pour tout le monde (même circuit, même météo, mêmes IA), 2 tentatives, classement au temps total.
     Garage partagé avec la campagne ; pas de quota consommé, sponsors et ligue en pause. */
  const WK = { tick: null };
  function stopWeekly() { clearInterval(WK.tick); WK.tick = null; }
  function startWeekly(useToken) {
    const ctx = mgrCtx(); if (!ctx.drvM || !ctx.car) return;
    const ev = MG().weeklyEvent();
    try { F1.store.useWeeklyAttempt(ev.id, useToken); } catch (e) { return toast('⏳', esc(e.message), 'err'); }
    const meName = (F1.social.state.me && F1.social.state.me.username) || F1.store.get().name || 'Mon écurie';
    const player = { name: meName, driver: ctx.drvM, car: ctx.car, setup: ctx.m.setup, chassisId: ctx.ch.id };
    const R = MG().createRace({ player, bots: (() => { const me2 = MG().mateEntry(ctx.mate, ctx.car, ctx.ch.id, ctx.ch.name), b2 = MG().weeklyBots(ev.seed, ctx.drvM && ctx.drvM.id, ctx.mate && ctx.mate.id, ctx.ch && ctx.ch.id); return me2 ? [me2, ...b2] : b2; })(), race: ev.race, seed: ev.seed, wxSeed: ev.seed, startTyre: ctx.m.next.tyre, plan: ctx.m.next.plan, manual: true });
    R.weekly = ev;
    showRace(R, { ...ctx, race: ev.race });
  }
  function mgrWeekly(ctx) {
    const { m, drvM, ch, car } = ctx, ev = MG().weeklyEvent(), w = F1.store.weeklyGP(ev.id);
    const fl = MG().forecastLaps(ev.seed, ev.race), plan = MG().planFor(m.next.plan, ev.laps).stops;
    const maxA = F1.store.weeklyMax(w), left = maxA - w.attemptsUsed, tok = F1.store.pass().tokens || 0, canTok = left <= 0 && !w.bonus && tok > 0;
    const head = `<div class="wk-banner"><div class="wk-b-l"><small>Grand Prix Hebdomadaire · semaine ${ev.week}</small><h2>${flag(ev.race.iso, 'lg')} ${esc(ev.race.nameFr)}</h2>
        <div class="muted" style="font-size:13px">${ev.laps} tours · mêmes conditions pour tous les joueurs : circuit, météo tour par tour, pilotes IA</div>
        <div class="fc-segs">${fl.segs.map((g) => `<span>${g.icon} ${esc(g.txt)}</span>`).join('')}</div></div>
      <div class="wk-b-r"><small>Clôture dimanche 23 h 59</small><b id="wkCount">${untilTxt(ev.endsAt - Date.now())}</b></div></div>`;
    const trophies = (m.trophies || []).slice(0, 8).map((t) => `<span class="wk-trophy" title="${esc(t.circuit)} · semaine ${esc(t.week)}">${t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : '🏅'} <b>${t.rank}${t.rank === 1 ? 'er' : 'e'}</b><small>${esc(t.week.replace('-W', ' · S'))}</small></span>`).join('');
    if (!drvM || !ch) return head + '<div class="notice">Recrutez un pilote et choisissez une équipe dans votre campagne pour participer.</div>';
    return head + `<div class="wk-grid">
      <section class="ol-card"><header><b>Votre engagement</b><a class="pnl-l" href="#/manager">Préparer dans le QG</a></header>
        <div class="ol-car">${F1.visuals.car(ch.id, { view: 'side', shadow: false, sponsor: livery(m) })}</div>
        <div class="ol-specs"><div><small>Pilote</small><b>${esc(drvM.name)}</b><span class="muted">${drvM.rating}</span></div><div><small>Équipe</small><b>${esc(ch.name)}</b><span class="muted">note ${MG().carRating(car)}</span></div>
          <div><small>Départ</small><b>${tyreDot(m.next.tyre, 'sm')} ${esc(MG().TYRES[m.next.tyre].name)}</b></div><div><small>Arrêts prévus</small><b>${plan.length ? plan.map((x) => `tour ${x.lap} ${tyreDot(x.tyre, 'sm')}`).join(' · ') : 'aucun'}</b><span class="muted">sur ${ev.laps} tours</span></div></div>
        <small class="muted">La course se joue comme en campagne (muret, arrêts, dilemmes radio). Elle ne consomme pas vos courses gratuites, et vos contrats sponsors sont en pause : aucun objectif ni pénalité ici.</small>
        <div class="wk-att"><div><small>Tentatives</small><b>${left} / ${maxA} restante${left > 1 ? 's' : ''}</b>${tok ? `<small class="muted">🎟️ ${tok} jeton${tok > 1 ? 's' : ''} de tentative en réserve</small>` : ''}</div><div><small>Meilleur temps</small><b>${w.bestTime != null ? MG().fmtRaceTime(w.bestTime) : '—'}</b>${w.bestConfig ? `<small class="muted">P${w.bestPosition} · ${esc(w.bestConfig.chassis)} · ${esc(w.bestConfig.driver)}</small>` : ''}</div></div>
        ${canTok ? `<button class="btn block wk-tok" data-action="wk-go" data-token="1">🎟️ Utiliser un jeton de tentative : 3ᵉ essai (${tok} en réserve)</button>` : `<button class="btn block" data-action="wk-go" ${left > 0 ? '' : 'disabled'}>${left > 0 ? `Lancer une tentative (${left}/${maxA})` : 'Tentatives épuisées : nouveau Grand Prix lundi'}</button>`}</section>
      <section class="ol-card"><header><b>Classement</b><div class="seg" id="wkTabs"></div></header><div id="wkBoard"><div class="skeleton" style="height:160px"></div></div></section></div>
      <section class="ol-card" style="margin-top:12px"><header><b>Récompenses</b></header>
        <div class="wk-prizes"><span>+${MG().WEEKLY_FIRST_PRIME} PC au premier chrono de la semaine</span><span>Clôture : 1<sup>er</sup> +600 · 2<sup>e</sup> +450 · 3<sup>e</sup> +350 · top 10 +200 · top 25 % +120 · classé +60</span><span>Trophée pour un top 10</span></div>
        ${trophies ? `<div class="wk-trophies">${trophies}</div>` : '<div class="muted" style="font-size:13px">Pas encore de trophée : un top 10 en rapporte un.</div>'}</section>`;
  }
  // Prime de classement de la semaine passée : versée à la première visite du F1 Manager après la clôture
  let claiming = false;
  async function weeklyClaim() {
    const m = F1.store.mgr(), so = SO();
    F1.store.weeklyGP(MG().weeklyEvent().id);   // bascule de semaine : la semaine finie passe en attente de prime
    if (claiming || !m.weeklyPast || m.weeklyPast.rewardClaimed) return;
    claiming = true;
    try {
      const past = m.weeklyPast;
      const online = so.enabled && so.ready && so.me;
      const rk = online ? await F1.social.weeklyRank(past.weekId, past.bestTime).catch((e) => (e.missing ? { missing: true } : null)) : null;
      if (online && !rk) return;   // classement momentanément indisponible : on réessaiera plus tard plutôt que de verser la prime minimale
      const got = F1.store.claimWeeklyGP(rk && rk.rank, rk && rk.total);   // sans classement en ligne : prime de participation
      if (got) { toast('🏆', `Grand Prix Hebdomadaire ${esc(past.weekId)} : ${got.rank ? `${got.rank}${got.rank === 1 ? 'er' : 'e'} sur ${got.total}` : 'chrono validé'} · +${fmtPC(got.prize)}${got.rank && got.rank <= 10 ? ' et un trophée' : ''}`, 'win', 6000); if (got.rank && got.rank <= 3) confetti(160); }
    } finally { claiming = false; }
  }
  async function mountWeekly() {
    stopWeekly();
    const ev = MG().weeklyEvent();
    WK.tick = setInterval(() => { const el = $('#wkCount'); if (!el) return stopWeekly(); el.textContent = untilTxt(Math.max(0, ev.endsAt - Date.now())); if (Date.now() >= ev.endsAt) route(); }, 30000);
    const so = SO(), board = $('#wkBoard'), tabs = $('#wkTabs'); if (!board) return;
    const m = F1.store.mgr(), me = so.me ? so.me.id : null;
    await weeklyClaim();
    if (!so.enabled || !so.ready || !so.me) {
      const w = m.weeklyGP;
      board.innerHTML = `${w && w.bestTime != null ? `<div class="wk-row me"><span class="pos">—</span><b>Vous</b><span class="num">${MG().fmtRaceTime(w.bestTime)}</span></div>` : ''}<div class="muted" style="font-size:13px;margin-top:6px">${!so.enabled ? 'Le classement en ligne utilise la base de données du système d\'amis, qui n\'est pas encore activée sur ce site.' : !so.ready ? 'Connexion…' : 'Créez votre profil joueur (page <a class="link" href="#/ligues">Mes ligues</a>) pour apparaître au classement.'}</div>`;
      return;
    }
    let leagues = []; try { leagues = await F1.social.myLeagues(); } catch (e) { /* ligues pas encore activées */ }
    const sel = S.wkBoard && leagues.some((l) => String(l.id) === String(S.wkBoard)) ? S.wkBoard : 'all';
    if (tabs) tabs.innerHTML = `<button class="${sel === 'all' ? 'on' : ''}" data-action="wk-board" data-v="all">Général</button>${leagues.map((l) => `<button class="${String(sel) === String(l.id) ? 'on' : ''}" data-action="wk-board" data-v="${l.id}">${esc(l.name)}</button>`).join('')}`;
    try {
      let rows = await F1.social.weeklyBoard(ev.id);
      if (sel !== 'all') { const mem = new Set((await F1.social.leagueBoard(sel)).map((p) => p.id)); rows = rows.filter((x) => mem.has(x.user_id)); }
      if (!$('#wkBoard')) return;
      const lead = rows.find((x) => x.time_ms != null);
      board.innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl lg-tbl"><thead><tr><th>#</th><th>Joueur</th><th class="r">Temps total</th><th class="r">Écart</th><th>Arrivée · voiture</th></tr></thead><tbody>${rows.map((x, i) => `<tr class="${x.user_id === me ? 'me-row' : ''}"><td class="pos">${x.time_ms != null ? i + 1 : '—'}</td><td><span class="row" style="gap:8px;flex-wrap:nowrap">${uava(x.p, '')}<b>${esc(x.p.username)}</b></span></td><td class="r num">${x.time_ms != null ? MG().fmtRaceTime(x.time_ms) : '<span class="muted">DNF / Non classé</span>'}</td><td class="r num">${x.time_ms != null && lead && x !== lead ? MG().fmtGap(x.time_ms - lead.time_ms) : x === lead ? '<span class="muted">leader</span>' : ''}</td><td><small>${x.position ? 'P' + x.position + ' · ' : ''}${esc(x.chassis || '')}${x.driver ? ' · ' + esc(x.driver) : ''}</small></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="muted" style="font-size:13px">Aucun chrono pour l\'instant cette semaine : soyez le premier !</div>';
    } catch (e) { if ($('#wkBoard')) board.innerHTML = e.missing ? '<div class="notice" style="font-size:13px">Le classement du Grand Prix Hebdomadaire n\'est pas encore activé : le propriétaire du site doit exécuter <code>supabase/migration-weekly.sql</code> dans Supabase. Vos chronos sont gardés sur cet appareil.</div>' : `<div class="notice red">⚠️ ${esc(e.message)}</div>`; }
  }

  /* =================== Mes paris =================== */
  function pageMyBets() {
    const p = F1.store.get(), st = F1.store.stats();
    const tab = S.betsTab;
    const list = p.bets.filter((b) => (tab === 'open' ? b.status === 'open' : b.status !== 'open'));
    let h = `<div class="market-head"><div><h1>Mes paris</h1><div class="muted" style="margin-top:6px">${p.name ? esc(p.name) + ' · ' : ''}membre depuis le ${DAY.format(new Date(p.created))}</div></div>
      <div class="row"><button class="btn sm ghost" data-action="profile">⚙️ Profil & sauvegarde</button></div></div>
      <div class="grid g4"><div class="stat"><small>Solde</small><b>${coin}${fmtJ(p.balance)}</b></div><div class="stat"><small>Bénéfice net</small><b class="${st.profit >= 0 ? 'pos' : 'neg'}">${st.profit >= 0 ? '+' : ''}${fmtJ(st.profit)}</b></div>
      <div class="stat"><small>Taux de réussite</small><b>${st.done ? pct(st.rate) : '—'}</b><span class="muted" style="font-size:12px">${st.won} / ${st.done} paris réglés</span></div><div class="stat"><small>ROI</small><b class="${st.roi >= 0 ? 'pos' : 'neg'}">${st.done ? (st.roi >= 0 ? '+' : '') + fmt(st.roi * 100, 1) + ' %' : '—'}</b></div>
      <div class="stat"><small>Meilleure cote gagnée</small><b>${st.bestOdds ? fmtOdds(st.bestOdds) : '—'}</b></div><div class="stat"><small>Plus gros gain</small><b>${st.biggest ? '+' + fmtJ(st.biggest) : '—'}</b></div>
      <div class="stat"><small>En jeu</small><b>${fmtJ(st.openStake)}</b><span class="muted" style="font-size:12px">${st.open} pari${st.open > 1 ? 's' : ''} en cours</span></div><div class="stat"><small>Total misé</small><b>${fmtJ(st.staked)}</b></div></div>
      <section class="section"><div class="section-h"><h2>Évolution du solde</h2></div><div class="card"><div id="bankroll"></div></div></section>
      <section class="section"><div class="section-h"><h2>Historique</h2><div class="seg"><button class="${tab === 'open' ? 'on' : ''}" data-action="betstab" data-t="open">En cours (${p.bets.filter((b) => b.status === 'open').length})</button><button class="${tab === 'done' ? 'on' : ''}" data-action="betstab" data-t="done">Réglés (${p.bets.filter((b) => b.status !== 'open').length})</button></div></div>
      ${list.length ? `<div class="grid g2">${list.slice(0, 60).map(betCard).join('')}</div>` : `<div class="empty"><div class="ic">🎟️</div>${tab === 'open' ? 'Aucun pari en cours.' : 'Aucun pari réglé pour l\'instant.'}<div style="margin-top:14px"><a class="btn" href="#/paris">Parier maintenant</a></div></div>`}</section>
      <section class="section"><div class="card ach-cta"><div><b>🏆 Succès</b><span class="muted"> · ${Object.keys(p.ach).length} / ${F1.store.ACH.length} débloqués${F1.store.achClaimable().length ? ` · <b class="up">${F1.store.achClaimable().length} récompense${F1.store.achClaimable().length > 1 ? 's' : ''} à réclamer</b>` : ''}</span></div><a class="btn sm" href="#/succes">Voir les succès</a></div></section>`;
    return h;
  }
  function seasonByYear(y) {
    const all = [S.f1, S.wec].filter(Boolean).flatMap((x) => [x, x.upcoming, x.prev]).filter(Boolean);
    if (!y) return S.f1 || S.season;
    return all.find((x) => skey(x) === y) || S.archives[y] || null;
  }
  const seasonLbl = (y) => (typeof y === 'string' ? y.replace('wec-', 'WEC ') : y);
  const STATUS = { open: ['En cours', 'gold'], won: ['Gagné', 'green'], lost: ['Perdu', 'red'], void: ['Remboursé', ''] };
  function betCard(b) {
    const [lbl, cls] = STATUS[b.status];
    const race = (r, y) => { const ss = seasonByYear(y); const x = ss && ss.races.find((z) => z.round === r); return (x ? x.nameFr.replace('Grand Prix', 'GP') : 'Manche ' + r) + (y && y !== skey(S.season) ? ' ' + seasonLbl(y) : ''); };
    return `<div class="bet ${b.status}"><div class="bet-h"><span class="row"><b>${b.legs.length > 1 ? `Combiné × ${b.legs.length}` : 'Simple'}</b><span class="muted" style="font-size:12px">${DTF.format(new Date(b.placedAt))}</span></span><span class="chip ${cls}">${lbl}</span></div>
      <div class="bet-legs">${b.legs.map((l) => `<div class="leg"><span><span class="res ${l.result || ''}">${l.result === 'won' ? '✓' : l.result === 'lost' ? '✕' : l.result === 'void' ? '↺' : '•'}</span> <b>${esc(l.label)}</b><span class="lm">${esc(l.mtitle)} · ${esc(l.round ? race(l.round, l.season) : 'Saison ' + seasonLbl(l.season || S.season.year))}</span></span><b class="num" style="color:var(--gold)">${fmtOdds(l.odds)}</b></div>`).join('')}</div>
      <div class="bet-f"><span>Mise <b>${fmtJ(b.stake)}</b></span><span>Cote <b>${fmtOdds(b.odds)}</b></span><span>${b.status === 'open' ? 'Gain potentiel' : 'Retour'} <b style="color:${b.status === 'won' ? 'var(--win)' : 'inherit'}">${fmtJ(b.status === 'open' ? b.stake * b.odds : b.payout)}</b></span></div></div>`;
  }
  function mountBankroll() {
    const el = $('#bankroll'); if (!el) return;
    const hist = F1.store.get().history;
    if (hist.length < 2) { el.innerHTML = '<div class="empty" style="padding:24px">Votre courbe apparaîtra après vos premiers paris.</div>'; return; }
    const W = 1000, H = 200, P = 10;
    const vals = hist.map((x) => x.b);
    const mn = Math.min(...vals, F1.store.START) * 0.95, mx = Math.max(...vals, F1.store.START) * 1.05;
    const x = (i) => P + (i / (vals.length - 1)) * (W - 2 * P);
    const y = (v) => P + (1 - (v - mn) / (mx - mn || 1)) * (H - 2 * P);
    const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const up = vals.at(-1) >= F1.store.START;
    const c = up ? '#2ee59d' : '#ff4d5e';
    el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:180px"><defs><linearGradient id="bg1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${y(F1.store.START)}" y2="${y(F1.store.START)}" stroke="rgba(255,255,255,.15)" stroke-dasharray="4 4"/>
      <polygon points="${x(0)},${H} ${pts} ${x(vals.length - 1)},${H}" fill="url(#bg1)"/><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /* =================== Ticket =================== */
  function saveSlip() { try { sessionStorage.setItem('pitwall:slip', JSON.stringify(S.slip)); } catch (e) { /* */ } }
  function conflicts() {
    if (S.mode !== 'combo') return new Set();
    const cnt = {};
    S.slip.forEach((l) => F1.markets.corrKey(l).forEach((k) => { cnt[k] = (cnt[k] || 0) + 1; }));
    return new Set(S.slip.filter((l) => F1.markets.corrKey(l).some((k) => cnt[k] > 1)).map((l) => l.sid));
  }
  function toggleSel(sid, btn) {
    const i = S.slip.findIndex((l) => l.sid === sid);
    if (i >= 0) S.slip.splice(i, 1);
    else {
      const s = S.sel.get(sid); if (!s) return;
      if (S.slip.length >= 15) return toast('⚠️', 'Ticket limité à 15 sélections', 'err');
      S.slip.push(s);
      if (S.slip.length === 2 && !S.modeTouched) S.mode = 'combo';
      const fab = $('#slipFab'); fab.classList.remove('pop'); void fab.offsetWidth; fab.classList.add('pop');
    }
    if (!S.slip.length) { S.modeTouched = false; S.mode = 'single'; }
    saveSlip();
    $$(`[data-sid="${CSS.escape(sid)}"]`).forEach((b) => { b.classList.toggle('on', i < 0); if (i < 0) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); } });
    renderSlip();
  }
  function renderSlip() {
    const el = $('#slip');
    const n = S.slip.length;
    document.body.classList.toggle('has-slip', n > 0 && innerWidth >= 1280);
    $('#slipFab').style.display = n ? '' : 'none';
    $('#fabCount').textContent = n;
    const conf = conflicts();
    const totalOdds = Math.min(F1.store.MAX_ODDS, S.slip.reduce((p, l) => p * l.odds, 1));
    const stake = S.stake;
    const bal = F1.store.get().balance;
    const totalStake = S.mode === 'single' ? stake * n : stake;
    const gain = S.mode === 'single' ? S.slip.reduce((a, l) => a + stake * l.odds, 0) : stake * totalOdds;
    const closed = S.slip.some((l) => l.closes && new Date(l.closes).getTime() <= Date.now());
    let err = '';
    if (conf.size) err = 'Sélections liées entre elles : impossible de les combiner.';
    else if (closed) err = 'Une sélection n\'est plus disponible (marché fermé).';
    else if (totalStake > bal + 1e-9) err = 'Solde insuffisant.';
    else if (!(stake >= 1)) err = 'Mise minimale : 1 jeton.';
    el.innerHTML = `<div class="slip-h"><h3>Ticket <span class="badge">${n}</span></h3><div class="row">${n ? '<button class="link" data-action="clear-slip">Vider</button>' : ''}<button class="slip-close x" data-action="close-slip" aria-label="Fermer" style="font-size:22px;padding:0 6px">×</button></div></div>
      ${n ? `<div style="padding:12px 18px 0"><div class="seg" style="width:100%;display:flex"><button style="flex:1" class="${S.mode === 'single' ? 'on' : ''}" data-action="mode" data-m="single">Simples</button><button style="flex:1" class="${S.mode === 'combo' ? 'on' : ''}" data-action="mode" data-m="combo" ${n < 2 ? 'disabled' : ''}>Combiné</button></div></div>` : ''}
      <div class="slip-body">${n ? S.slip.map((l) => `<div class="sleg ${conf.has(l.sid) ? 'conflict' : ''}"><button class="x" data-action="rm" data-sid="${esc(l.sid)}" aria-label="Retirer">✕</button><div class="sl">${l.teamId ? `<span class="tstripe" style="background:${tcol(l.teamId)};display:inline-block;height:12px;margin-right:6px"></span>` : ''}${esc(l.label)}</div><div class="srow"><span class="sm">${esc(l.mtitle)}</span><span class="so">${fmtOdds(l.odds)}</span></div></div>`).join('')
        : '<div class="slip-empty"><div class="ic">🎟️</div><b>Votre ticket est vide</b><br>Cliquez sur une cote pour l\'ajouter.<br><br><span style="font-size:13px">Astuce : combinez plusieurs sélections pour multiplier les cotes.</span></div>'}</div>
      ${n ? `<div class="slip-f"><div class="sum"><span>${S.mode === 'single' ? 'Mise par sélection' : 'Mise'}</span><span>Solde ${coin}<b>${fmtJ(bal)}</b></span></div>
        <label class="stake">${coin}<input id="stakeIn" type="number" inputmode="decimal" min="1" step="1" value="${stake}"><span class="muted" style="padding-right:8px">jetons</span></label>
        <div class="chips"><button data-action="stake" data-v="10">+10</button><button data-action="stake" data-v="50">+50</button><button data-action="stake" data-v="100">+100</button><button data-action="stake" data-v="max">Max</button></div>
        ${S.mode === 'combo' ? `<div class="sum"><span>Cote totale</span><b style="color:var(--gold);font-size:18px">${fmtOdds(Math.round(totalOdds * 100) / 100)}</b></div>` : `<div class="sum"><span>Mise totale</span><b>${fmtJ(totalStake)}</b></div>`}
        <div class="sum big"><span>Gain potentiel</span><b>${fmtJ(Math.round(gain * 100) / 100)}</b></div>
        ${err ? `<div style="color:var(--lose);font-size:13px;font-weight:600">${err}</div>` : ''}
        <button class="btn block" data-action="place" ${err ? 'disabled' : ''}>Valider ${S.mode === 'single' && n > 1 ? n + ' paris' : 'le pari'}</button></div>` : ''}`;
    el.classList.toggle('open', S.slipOpen && n > 0 || S.slipOpen);
    $('#backdrop').classList.toggle('show', S.slipOpen && innerWidth < 1280);
    const inp = $('#stakeIn');
    if (inp) inp.addEventListener('input', () => { S.stake = Math.max(0, Math.floor(+inp.value || 0)); const pos = inp.selectionStart; renderSlip(); const ni = $('#stakeIn'); ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (e) { /* number input */ } });
  }
  function placeBets() {
    const n = S.slip.length; if (!n) return;
    try {
      if (S.mode === 'combo' && n > 1) F1.store.placeBet(S.slip, S.stake);
      else S.slip.forEach((l) => F1.store.placeBet([l], S.stake));
      const placed = S.mode === 'combo' ? 1 : n;
      S.slip = []; S.mode = 'single'; S.modeTouched = false; saveSlip();
      S.slipOpen = false;
      renderSlip(); route();
      toast('✅', `${placed > 1 ? placed + ' paris validés' : 'Pari validé'} ! Bonne chance 🏎️`, 'win');
      confetti(60);
      showAchievements();
    } catch (e) { toast('⚠️', e.message, 'err'); }
  }

  /* =================== Règlement =================== */
  function runSettlement() {
    const settled = [S.season, S.other, ...Object.values(S.archives)].filter(Boolean).flatMap((ss) => F1.store.settleAll(ss));
    let delay = 0;
    let anyWin = false;
    settled.forEach((b) => {
      setTimeout(() => {
        if (b.status === 'won') { anyWin = true; toast('🏆', `Pari gagné ! <b>+${fmtJ(b.payout)}</b> jetons (cote ${fmtOdds(b.effOdds || b.odds)})`, 'win', 6000); }
        else if (b.status === 'lost') toast('😬', `Pari perdu : ${esc(b.legs.length > 1 ? 'combiné × ' + b.legs.length : b.legs[0].label)}`, '', 4000);
        else toast('↺', 'Pari remboursé (sélection annulée)', '', 4000);
      }, delay);
      delay += 700;
    });
    if (settled.some((b) => b.status === 'won')) setTimeout(() => confetti(220), 300);
    setTimeout(showAchievements, delay + 300);
    if (settled.length && /mes-paris|^#?\/?$/.test(location.hash || '/')) setTimeout(route, delay + 100);
  }
  function showAchievements() {
    const list = F1.store.popUnlocked().filter(Boolean);
    if (list.length > 2) { toast('🏆', `<b>${list.length} succès débloqués</b> · <a href="#/succes" style="text-decoration:underline">réclamez vos jetons</a>`, 'win', 6000); confetti(120); }
    else list.forEach((a, i) => setTimeout(() => { toast(a.icon, `Succès débloqué : <b>${esc(a.title)}</b> · <a href="#/succes" style="text-decoration:underline">+${a.reward} jetons à réclamer</a>`, 'win', 5500); confetti(80); }, i * 900));
    achBadge();
  }

  /* =================== Succès =================== */
  const ACH_CAT = [['all', 'Tous'], ['paris', 'Paris'], ['paddock', 'Paddock Wire'], ['ligues', 'Ligues'], ['manager', 'F1 Manager'], ['profil', 'Profil']];
  function achBadge() {
    const n = F1.store.achClaimable().length;
    $$('[data-r="succes"]').forEach((a) => { let b = a.querySelector('.nav-badge'); if (!n) { if (b) b.remove(); return; } if (!b) { b = document.createElement('i'); b.className = 'nav-badge'; a.appendChild(b); } b.textContent = n; });
  }
  function pageAch() {
    const p = F1.store.get(), all = F1.store.ACH, cat = S.achCat || 'all';
    const done = all.filter((a) => p.ach[a.id]).length, claim = F1.store.achClaimable();
    const pending = claim.reduce((t, a) => t + a.reward, 0), earned = all.filter((a) => (p.achClaimed || {})[a.id]).reduce((t, a) => t + a.reward, 0);
    const list = all.filter((a) => cat === 'all' || a.cat === cat).map((a) => ({ a, pr: F1.store.achProgress(a), claimed: !!(p.achClaimed || {})[a.id] }))
      .sort((x, y) => (y.pr.done && !y.claimed) - (x.pr.done && !x.claimed) || (y.pr.v / y.pr.max) - (x.pr.v / x.pr.max));
    const card = ({ a, pr, claimed }) => {
      const pct = Math.round((pr.v / pr.max) * 100), st = claimed ? 'claimed' : pr.done ? 'ready' : 'locked';
      return `<div class="achv ${st}" data-cat="${a.cat}"><div class="achv-badge"><span>${a.icon}</span>${st === 'locked' ? '<i class="achv-lock">🔒</i>' : ''}</div>
        <div class="achv-body"><b>${esc(a.title)}</b><small>${esc(a.desc)}</small>
          <div class="achv-bar"><i style="width:${pct}%"></i></div><div class="achv-meta"><span class="num">${pr.max > 1 ? `${fmt(pr.v)} / ${fmt(pr.max)}` : pr.done ? 'Accompli' : 'À accomplir'}</span><span class="achv-rw">${jt(a.reward)}</span></div></div>
        <div class="achv-act">${st === 'ready' ? `<button class="btn sm gold achv-claim" data-action="ach-claim" data-id="${a.id}">Réclamer</button>` : st === 'claimed' ? '<span class="chip green">✓ Réclamé</span>' : `<span class="muted num">${pct} %</span>`}</div></div>`;
    };
    return `<section class="ach-page"><div class="ach-hero"><div><h1>Succès</h1><p class="muted">Débloquez des succès sur tout le site, des paris au F1 Manager, et réclamez des jetons.</p></div>
        <div class="ach-kpis"><div><small>Débloqués</small><b class="num">${done}<em>/${all.length}</em></b><div class="achv-bar big"><i style="width:${(done / all.length) * 100}%"></i></div></div>
          <div><small>À réclamer</small><b>${jt(pending)}</b>${claim.length > 1 ? '<button class="btn sm gold" data-action="ach-claim-all" style="margin-top:6px">Tout réclamer</button>' : ''}</div><div><small>Déjà gagnés</small><b>${jt(earned)}</b></div></div></div>
      <div class="pdw-chips">${ACH_CAT.map(([k, l]) => `<button class="pdw-chip ${cat === k ? 'on' : ''}" data-action="ach-cat" data-c="${k}">${l} <span class="num">${k === 'all' ? all.length : all.filter((a) => a.cat === k).length}</span></button>`).join('')}</div>
      <div class="achv-grid">${list.map(card).join('')}</div></section>`;
  }
  // Animation de réclamation : badge qui éclate, jetons qui volent vers le portefeuille
  function achFly(btn, n) {
    const r = btn.getBoundingClientRect(), w = $('#wallet').getBoundingClientRect();
    for (let i = 0; i < Math.min(10, 3 + Math.round(n / 60)); i++) {
      const c = document.createElement('span'); c.className = 'coin-fly'; c.innerHTML = COIN_J;
      c.style.left = r.left + r.width / 2 + 'px'; c.style.top = r.top + r.height / 2 + 'px'; document.body.appendChild(c);
      const dx = w.left + 16 - (r.left + r.width / 2), dy = w.top + 16 - (r.top + r.height / 2);
      c.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 80}px), calc(-50% - ${40 + Math.random() * 40}px)) scale(1)`, opacity: 1, offset: 0.3 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5)`, opacity: 0.2 }], { duration: 900 + i * 60, easing: 'cubic-bezier(.5,0,.3,1)', delay: i * 45 }).onfinish = () => c.remove();
    }
    const card = btn.closest('.achv'); if (card) { card.classList.add('burst'); }
  }

  /* =================== Profil & tableau de bord =================== */
  const AVATARS = [1, 2, 3, 4, 5, 6].map((i) => `assets/avatars/avatar-${i}.webp`);
  // photo importée : recadrage carré au centre, compressée en JPEG (256 px pour l'affichage, 128 px pour le serveur)
  function cropPhoto(file, size, q) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = size;
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
        x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image illisible : choisissez un fichier JPEG, PNG ou WebP')); };
      img.src = url;
    });
  }
  async function importPhoto(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast('⚠️', 'Choisissez une image (JPEG, PNG, WebP…)', 'err');
    if (file.size > 15e6) return toast('⚠️', 'Image trop lourde (15 Mo maximum)', 'err');
    try {
      const big = await cropPhoto(file, 256, 0.86), small = await cropPhoto(file, 128, 0.78);
      F1.store.setAvatar(big, small); S.pfAva = false; F1.social.sync(true); showAchievements(); route();
      toast('🪪', 'Photo de profil importée', 'win');
    } catch (e) { toast('⚠️', esc(e.message), 'err'); }
  }
  /* ---------- Avatar « numéro de pilote » : numéro + typographie d'écurie + style ---------- */
  const NUMAV_KEY = 'pitwall:numav';
  function numAvCfg() {
    let c = null; try { c = JSON.parse(localStorage.getItem(NUMAV_KEY)); } catch (e) { /* stockage indisponible */ }
    const m = F1.store.mgr();
    return Object.assign({ n: m.number || '3', team: (m.chassis && F1.num.tkey(m.chassis.id)) || 'red_bull', style: 'plaque', bg: 'auto', plate: '#c9ced6' }, c || {});
  }
  function numAvSave(c) { try { localStorage.setItem(NUMAV_KEY, JSON.stringify(c)); } catch (e) { /* stockage indisponible */ } }
  function numAvOpen() {
    const c = numAvCfg(), NA = F1.numAvatar;
    if (!NA.TEAMS.includes(c.team)) c.team = 'red_bull';
    const SHORT = F1.ref.TEAM_SHORT;
    modal(`<div class="nav-av"><h2>Avatar numéro</h2><p class="muted" style="margin-top:0">Ton numéro de course dans la typographie de l'écurie de ton choix.</p>
      <div class="nav-av-g"><div class="nav-av-prev"><canvas id="naCv" width="512" height="512" aria-label="Aperçu de l'avatar"></canvas><div class="nav-av-mini"><span><canvas id="naMini" width="96" height="96"></canvas></span><small>Aperçu dans le menu</small></div></div>
        <div class="nav-av-f">
          <label class="nav-av-l">Numéro<input class="field" id="naN" inputmode="numeric" maxlength="2" value="${esc(c.n)}" autocomplete="off"></label>
          <div class="nav-av-l">Typographie</div><div class="nav-av-teams">${NA.TEAMS.map((t) => `<button type="button" class="nav-av-t ${t === c.team ? 'on' : ''}" data-action="na-team" data-t="${t}" style="--tc:${F1.teamColor(t)}"><i></i>${esc(SHORT[t] || t)}</button>`).join('')}</div>
          <div class="nav-av-l">Style</div><div class="nav-av-st">${NA.STYLES.map(([k, l]) => `<button type="button" class="${k === c.style ? 'on' : ''}" data-action="na-style" data-s="${k}">${l}</button>`).join('')}</div>
          <div class="nav-av-l">Fond</div><div class="nav-av-sw" data-k="bg">${NA.BG_PRESETS.map(([v, l]) => `<button type="button" class="${c.bg === v ? 'on' : ''}" data-action="na-col" data-k="bg" data-v="${v}" title="${l}" style="--sw:${v === 'auto' ? `linear-gradient(135deg, ${NA.LOOK[c.team].bg}, #05070c)` : v}">${v === 'auto' ? '<small>Auto</small>' : ''}</button>`).join('')}<label class="nav-av-pick" title="Couleur libre"><input type="color" id="naBg" value="${/^#/.test(c.bg) ? c.bg : '#0b1b4d'}"><span>＋</span></label></div>
          <div class="nav-av-l">Plaque</div><div class="nav-av-sw" data-k="plate">${NA.PLATE_PRESETS.map(([v, l]) => `<button type="button" class="${c.plate === v ? 'on' : ''}" data-action="na-col" data-k="plate" data-v="${v}" title="${l}" style="--sw:${v === 'team' ? F1.teamColor(c.team) : v}">${v === 'team' ? '<small>Écurie</small>' : ''}</button>`).join('')}<label class="nav-av-pick" title="Couleur libre"><input type="color" id="naPlate" value="${/^#/.test(c.plate) ? c.plate : '#c9ced6'}"><span>＋</span></label></div>
          <button class="btn" data-action="na-use" style="margin-top:16px;width:100%">Utiliser comme photo de profil</button>
        </div></div></div>`);
    S.numAv = c; numAvDraw();
  }
  let naSeq = 0;
  async function numAvDraw() {
    const cv = $('#naCv'); if (!cv || !S.numAv) return;
    const my = ++naSeq; const off = document.createElement('canvas');
    await F1.numAvatar.render(off, S.numAv);
    if (my !== naSeq || !$('#naCv')) return;
    const x = $('#naCv').getContext('2d'); x.clearRect(0, 0, 512, 512); x.drawImage(off, 0, 0);
    const mi = $('#naMini'); if (mi) { const y = mi.getContext('2d'); y.imageSmoothingQuality = 'high'; y.clearRect(0, 0, 96, 96); y.drawImage(off, 0, 0, 96, 96); }
  }
  async function numAvUse() {
    const c = S.numAv; if (!c || !F1.num.clean(c.n)) return toast('⚠️', 'Entre un numéro entre 0 et 99', 'err');
    const off = await F1.numAvatar.render(document.createElement('canvas'), c);
    F1.store.setAvatar(F1.numAvatar.exportJpeg(off, 256, 0.9), F1.numAvatar.exportJpeg(off, 128, 0.82));
    numAvSave(c); S.pfAva = false; closeModal(); F1.social.sync(true); showAchievements(); route();
    toast('🪪', `Avatar n°${esc(F1.num.clean(c.n))} enregistré`, 'win');
  }
  document.addEventListener('input', (e) => {
    if (!e.target || !S.numAv) return;
    const k = e.target.id === 'naBg' ? 'bg' : e.target.id === 'naPlate' ? 'plate' : null;
    if (k) { S.numAv[k] = e.target.value; $$(`.nav-av-sw[data-k="${k}"] button`).forEach((b) => b.classList.remove('on')); e.target.closest('.nav-av-pick').classList.add('on'); numAvDraw(); }
  });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'naN' && S.numAv) { const v = F1.num.clean(e.target.value); e.target.value = v; if (v) { S.numAv.n = v; numAvDraw(); } } });

  document.addEventListener('click', (e) => {
    // seulement dans la fenêtre de course (débriefing) : le bouton « F1 Manager » de la barre du haut doit mener au mode classique
    const l = e.target.closest && e.target.closest('#modal a[href^="#/manager"]');
    if (l && /^#\/carriere/.test(location.hash)) l.setAttribute('href', l.getAttribute('href').replace('#/manager', '#/carriere'));
  }, true);
  /* =================== Compte : menu de l'avatar, notifications, messagerie, circuits, paramètres =================== */
  // tout ce qui attend le joueur : demandes d'amis, messages, succès, F1 Manager, primes
  function notifItems() {
    const so = SO(), out = [], s = S.season, nx = s && s.next;
    (so.incoming || []).forEach((x) => out.push({ ic: '👋', t: `${esc(x.p.username)} veut devenir ton ami`, sub: 'Demande d\'ami', act: `<button class="btn sm" data-action="f-accept" data-id="${x.link.id}">Accepter</button><button class="btn sm ghost" data-action="f-remove" data-id="${x.link.id}">Refuser</button>` }));
    Object.entries(so.unreadBy || {}).forEach(([id, n]) => { const f = (so.friends || []).find((x) => x.p.id === id); out.push({ ic: '💬', t: `${n} nouveau${n > 1 ? 'x' : ''} message${n > 1 ? 's' : ''} de ${esc(f ? f.p.username : 'un ami')}`, sub: 'Messagerie', href: `#/messagerie/${id}` }); });
    const ach = F1.store.achClaimable(); if (ach.length) out.push({ ic: '🏅', t: `${ach.length} succès à récupérer`, sub: `+${fmt(ach.reduce((a, x) => a + x.reward, 0))} jetons`, href: '#/succes' });
    if (nx && S.series !== 'wec') { if (F1.store.canClaim(s, nx)) out.push({ ic: '🎁', t: 'Prime du week-end disponible', sub: `+${fmt(F1.store.WEEKLY)} jetons pour le ${esc(nx.nameFr)}`, act: '<button class="btn sm gold" data-action="claim">Récupérer</button>' }); }
    const m = F1.store.mgr();
    if (m.driver && m.chassis) {
      const add = (k, ic, t, href) => { const n = railCount(k); if (n) out.push({ ic, t: t(n), sub: 'F1 Manager', href }); };
      add('rd', '🔧', (n) => `${n} pièce${n > 1 ? 's' : ''} prête${n > 1 ? 's' : ''} à installer`, '#/manager/rd');
      add('passe', '🎟️', (n) => `${n} palier${n > 1 ? 's' : ''} du Pass à réclamer`, '#/manager/passe');
      add('ecurie', '🎯', (n) => `${n} objectif${n > 1 ? 's' : ''} du jour à récupérer`, '#/manager');
      add('sponsors', '💼', (n) => `${n} contrat${n > 1 ? 's' : ''} de sponsor terminé${n > 1 ? 's' : ''}`, '#/manager/sponsors');
      add('hebdo', '🌐', () => 'Prime du GP Hebdo à récupérer', '#/manager/hebdo');
      if (m.pc < 0) out.push({ ic: '⚠️', t: 'Solde de PitCoins négatif', sub: 'Achats bloqués jusqu\'au retour au positif', href: '#/manager' });
    }
    return out;
  }
  const notifCount = () => notifItems().length;
  // pastille sur l'avatar : notifications + messages
  function avatarBadge() {
    const av = $('#avatar'); if (!av) return;
    const n = notifCount();
    let b = av.querySelector('.av-badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('i'); b.className = 'av-badge'; av.appendChild(b); }
    b.textContent = n > 9 ? '9+' : n;
  }
  // Icônes du menu compte : trait 1,8 sur grille 24, couleur héritée, une teinte d'accent par rubrique
  const umSvg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const UM_IC = {
    profil: ['#60a5fa', umSvg('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>')],
    msg: ['#34d399', umSvg('<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6V16H6.5A2.5 2.5 0 0 1 4 13.5z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" stroke-width="2.6"/>')],
    notif: ['#fbbf24', umSvg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>')],
    circuit: ['#f87171', umSvg('<path d="M4.5 7.6A3.1 3.1 0 0 1 7.6 4.5h4.6c1.5 0 2.2 1.1 2.8 2.2l.8 1.5c.5.9 1.4 1.5 2.5 1.5a2.8 2.8 0 0 1 2.8 2.8v3.4a4 4 0 0 1-4 4H7.6a3.1 3.1 0 0 1-3.1-3.1v-1.3c0-1 .8-1.8 1.8-1.8h3a1.6 1.6 0 0 0 0-3.2h-3c-1 0-1.8-.8-1.8-1.8z"/><g stroke="none"><rect x="11.4" y="17.3" width="2.6" height="4.4" rx=".4" fill="#fff"/><rect x="11.4" y="17.3" width="1.3" height="1.1" fill="#1a1e25"/><rect x="12.7" y="18.4" width="1.3" height="1.1" fill="#1a1e25"/><rect x="11.4" y="19.5" width="1.3" height="1.1" fill="#1a1e25"/><rect x="12.7" y="20.6" width="1.3" height="1.1" fill="#1a1e25"/></g>')],
    amis: ['#a78bfa', umSvg('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 19a5.8 5.8 0 0 1 11.6 0"/><path d="M15.2 5.6a3.2 3.2 0 0 1 0 5.9M17.4 13.6a5.8 5.8 0 0 1 3.4 5.4"/>')],
    cal: ['#38bdf8', umSvg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 14h3M13.5 14h3M7.5 17h3"/>')],
    rank: ['#f59e0b', umSvg('<path d="M4 20h16"/><path d="M6 20v-6h4v6M10 20V9h4v11M14 20v-8h4v8"/><path d="M12 3.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3Z"/>')],
    ach: ['#e9be3e', umSvg('<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v4M8.5 20h7M10 17h4v3h-4Z"/>')],
    set: ['#94a3b8', umSvg('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.6h-4l-.5 2.4a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.5 2.4h4l.5-2.4a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4z"/>')],
  };
  function userMenu(open) {
    let el = $('#umenu');
    if (!open) { if (el) el.remove(); const av = $('#avatar'); if (av) av.setAttribute('aria-expanded', 'false'); return; }
    const p = F1.store.get(), so = SO(), name = (so.me && so.me.username) || p.name || 'Joueur', m = F1.store.mgr();
    const nN = notifCount(), nM = so.unread || 0, nF = (so.incoming || []).length, nA = F1.store.achClaimable().length;
    const here = '#/' + (location.hash.replace(/^#\/?/, '').split('/')[0] || '');
    const item = (href, ic, label, n, sub) => `<a class="um-i${href === here ? ' on' : ''}" href="${href}" role="menuitem"${href === here ? ' aria-current="page"' : ''}><span class="um-ic" style="--ic:${UM_IC[ic][0]}">${UM_IC[ic][1]}</span><span class="um-l">${label}${sub ? `<small>${sub}</small>` : ''}</span>${n ? `<b class="um-n">${n > 9 ? '9+' : n}</b>` : ''}</a>`;
    el = document.createElement('div'); el.id = 'umenu'; el.className = 'umenu'; el.setAttribute('role', 'menu');
    el.innerHTML = `<a class="um-head" href="#/profil"><span class="um-av ring"${ringAttr(MG().leagueOf(m.lp))}>${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(name.slice(0, 1).toUpperCase())}</span><span><b>${esc(name)}</b><small>${esc(MG().leagueOf(m.lp).name)} · ${fmtJ(p.balance)} jetons</small></span></a>
      ${item('#/profil', 'profil', 'Mon profil', 0, 'Statistiques et photo')}
      ${item('#/messagerie', 'msg', 'Messagerie', nM, so.me ? (nM ? 'Nouveaux messages' : 'Discuter avec tes amis') : 'Profil en ligne requis')}
      ${item('#/notifications', 'notif', 'Notifications', nN)}
      <div class="um-sep"></div>
      ${item('#/calendrier', 'cal', 'Calendrier', 0, 'Les Grands Prix de la saison')}
      ${item('#/classements', 'rank', 'Classements', 0, 'Pilotes et constructeurs')}
      ${item('#/circuits', 'circuit', 'Circuits', 0, 'Tous les tracés de la saison')}
      ${item('#/succes', 'ach', 'Succès', nA, nA ? 'Récompenses à récupérer' : `${Object.keys(F1.store.get().ach || {}).length} sur ${F1.store.ACH.length} débloqués`)}
      <div class="um-sep"></div>
      ${item('#/amis', 'amis', 'Amis', nF, nF ? 'Demandes en attente' : '')}
      <div class="um-sep"></div>${item('#/parametres', 'set', 'Paramètres', 0)}`;
    document.body.appendChild(el);
    const av = $('#avatar'), r = av.getBoundingClientRect();
    el.style.top = `${r.bottom + 10}px`; el.style.right = `${Math.max(8, innerWidth - r.right)}px`;
    av.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('click', (e) => { const el = $('#umenu'); if (!el) return; if (e.target.closest('#umenu a')) { userMenu(false); return; } if (!e.target.closest('#umenu') && !e.target.closest('#avatar')) userMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#umenu')) userMenu(false); });
  window.addEventListener('hashchange', () => userMenu(false));
  window.addEventListener('resize', () => userMenu(false));

  function pageNotifs() {
    const list = notifItems();
    return `<section class="ntf"><div class="market-head"><div><h1>Notifications</h1><div class="muted" style="margin-top:6px">Tout ce qui t'attend sur PITWALL, au même endroit.</div></div></div>
      ${list.length ? `<div class="ntf-list">${list.map((x) => `<div class="ntf-i">${x.href ? `<a class="ntf-a" href="${x.href}"></a>` : ''}<span class="ntf-ic">${x.ic}</span><div class="ntf-b"><b>${x.t}</b>${x.sub ? `<small>${x.sub}</small>` : ''}</div>${x.act ? `<div class="ntf-act">${x.act}</div>` : x.href ? '<span class="ntf-go">Voir</span>' : ''}</div>`).join('')}</div>`
        : '<div class="card lg-empty"><b>Rien de neuf pour l\'instant</b><span class="muted">Les demandes d\'amis, les messages, les succès et les récompenses du F1 Manager s\'afficheront ici.</span></div>'}</section>`;
  }

  /* ---------- Messagerie entre amis ---------- */
  let msgPoll = null;
  function pageMessages(parts) {
    const so = SO();
    const head = '<div class="market-head"><div><h1>Messagerie</h1><div class="muted" style="margin-top:6px">Discute avec tes amis. Les messages ne sont visibles que par vous deux.</div></div></div>';
    if (!so.enabled) return head + '<div class="notice">La messagerie utilise la base de données en ligne, qui n\'est pas encore activée sur ce site.</div>';
    if (so.error) return head + `<div class="notice red">⚠️ Connexion impossible : ${esc(so.error)}</div>`;
    if (!so.ready) return head + '<div class="skeleton" style="height:300px"></div>';
    if (!so.me) return head + '<div class="notice">Crée ton profil joueur (onglet Amis ou Mes ligues) pour écrire à tes amis.</div>';
    const friends = so.friends || [];
    if (!friends.length) return head + '<div class="card lg-empty"><b>Pas encore d\'amis</b><span class="muted">Ajoute des amis pour leur écrire.</span><a class="btn sm" href="#/amis" style="justify-self:start;margin-top:8px">Trouver des amis</a></div>';
    const sel = parts[1] && friends.find((x) => x.p.id === parts[1]) ? parts[1] : friends[0].p.id;
    return head + `<div class="msg" data-sel="${esc(sel)}"><aside class="msg-side" id="msgSide">${friends.map((x) => `<a class="msg-f ${x.p.id === sel ? 'on' : ''}" href="#/messagerie/${x.p.id}" data-f="${x.p.id}"><span class="msg-av">${x.p.avatar && AVA_OK.test(x.p.avatar) ? `<img src="${esc(x.p.avatar)}" alt="">` : esc(x.p.username[0].toUpperCase())}</span><span class="msg-fn"><b>${esc(x.p.username)}</b><small class="msg-prev">…</small></span><i class="msg-dot" hidden></i></a>`).join('')}</aside>
      <section class="msg-main"><header class="msg-h"><b>${esc(friends.find((x) => x.p.id === sel).p.username)}</b></header><div class="msg-thread" id="msgThread"><div class="skeleton" style="height:120px"></div></div>
        <form class="msg-form" data-action="msg-send-form" onsubmit="return false"><textarea class="field" id="msgIn" rows="1" maxlength="1000" placeholder="Écris un message…"></textarea><button class="btn" data-action="msg-send">Envoyer</button></form></section></div>`;
  }
  async function mountMessages() {
    clearInterval(msgPoll);
    const box = $('.msg'); if (!box) return;
    const sel = box.dataset.sel, me = SO().me.id;
    const load = async (first) => {
      if (!$('.msg') || $('.msg').dataset.sel !== sel) { clearInterval(msgPoll); return; }
      try {
        const [ib, th] = await Promise.all([F1.social.inbox(), F1.social.thread(sel)]);
        $$('.msg-f').forEach((a) => { const l = ib.last[a.dataset.f], n = ib.unread[a.dataset.f] || 0; const pv = a.querySelector('.msg-prev'); pv.textContent = l ? (l.from_id === me ? 'Toi : ' : '') + l.body : 'Aucun message'; const d = a.querySelector('.msg-dot'); d.hidden = !n || a.dataset.f === sel; d.textContent = n; });
        const t = $('#msgThread'); if (!t) return;
        const atEnd = first || t.scrollHeight - t.scrollTop - t.clientHeight < 40;
        let lastDay = '';
        t.innerHTML = th.length ? th.map((mm) => { const d = new Date(mm.created_at), day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); const sep = day !== lastDay ? `<div class="msg-day">${esc(day)}</div>` : ''; lastDay = day;
          return `${sep}<div class="msg-b ${mm.from_id === me ? 'me' : ''}"><p>${esc(mm.body)}</p><time>${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${mm.from_id === me && mm.read_at ? ' · lu' : ''}</time></div>`; }).join('') : '<div class="msg-empty">Aucun message. Écris le premier !</div>';
        if (atEnd) t.scrollTop = t.scrollHeight;
        if (ib.unread[sel]) { await F1.social.markRead(sel); avatarBadge(); }
      } catch (e) {
        const t = $('#msgThread'); if (t) t.innerHTML = e.missing ? '<div class="notice" style="margin:12px">La messagerie n\'est pas encore activée : le propriétaire du site doit exécuter <code>supabase/migration-messages.sql</code> dans Supabase.</div>' : `<div class="notice red" style="margin:12px">⚠️ ${esc(e.message)}</div>`;
        clearInterval(msgPoll);
      }
    };
    await load(true);
    msgPoll = setInterval(() => { if (!document.hidden) load(false); }, 8000);
  }
  async function sendMsg() {
    const box = $('.msg'), inp = $('#msgIn'); if (!box || !inp) return;
    const v = inp.value.trim(); if (!v) return;
    inp.disabled = true;
    try { await F1.social.sendMessage(box.dataset.sel, v); inp.value = ''; await mountMessages(); } catch (e) { toast('⚠️', esc(e.message), 'err'); }
    inp.disabled = false; inp.focus();
  }

  /* ---------- Circuits de la saison ---------- */
  function pageCircuits() {
    const s = S.f1 || S.season, nx = s.next;
    const cards = s.races.map((r) => {
      const done = !!(r.results && r.results.length), win = done && drv(r.results[0].driverId), isNext = nx && nx.round === r.round;
      const col = win ? team(win.teamId).color : isNext ? '#e10600' : '#5d6674';
      // identifiants propres à chaque carte : sinon les 23 tracés se partagent les dégradés et symboles de la première
      const pre = `c${r.round}-`, svg = trackSvg(r.circuitId, col, true).replace(/\bid="([^"]+)"/g, `id="${pre}$1"`).replace(/(href="#|url\(#)([^")]+)/g, `$1${pre}$2`);
      return `<a class="cir ${isNext ? 'next' : ''} ${done ? 'done' : ''}" href="#/gp/${r.round}" style="--tc:${col}"><div class="cir-map">${svg || '<div class="muted" style="padding:40px;text-align:center">Tracé indisponible</div>'}</div>
        <div class="cir-b"><div class="cir-top">${flag(r.iso, 'sm')}<span>Manche ${r.round}</span>${isNext ? '<span class="cir-tag">Prochain</span>' : ''}${r.sprint ? '<span class="cir-tag sp">Sprint</span>' : ''}</div><b>${esc(r.nameFr)}</b><small>${esc(r.circuit)}, ${esc(r.locality)}</small>
        <span class="cir-res">${done ? `Vainqueur : <b>${esc(win ? win.given + ' ' + win.family : '—')}</b>` : DAYL.format(r.date)}</span></div></a>`;
    }).join('');
    return `<section class="cirs"><div class="market-head"><div><h1>Circuits ${s.year}</h1><div class="muted" style="margin-top:6px">Les ${s.races.length} tracés de la saison, avec leur décor et leurs lieux emblématiques. Touchez un circuit pour voir son Grand Prix.</div></div></div><div class="cir-grid">${cards}</div></section>`;
  }

  /* ---------- Paramètres ---------- */
  function pageSettings() {
    const p = F1.store.get(), so = SO(), name = (so.me && so.me.username) || p.name || '';
    const tg = (k, on, label, sub) => `<label class="set-tg"><span><b>${label}</b><small>${sub}</small></span><input type="checkbox" data-pref="${k}" ${on ? 'checked' : ''}><i></i></label>`;
    return `<section class="set"><div class="market-head"><div><h1>Paramètres</h1></div></div>
      <div class="set-grid">
        <div class="card set-c"><h3>Compte</h3>
          <label class="muted" style="font-size:13px;font-weight:700">Pseudo</label><div class="row" style="flex-wrap:nowrap;gap:6px"><input class="field" id="nameIn" maxlength="24" value="${esc(name)}"><button class="btn sm" data-action="rename">Enregistrer</button></div>
          <small class="muted">${so.me ? 'Affiché dans tes ligues et les classements.' : 'Il servira de pseudo en ligne quand tu créeras ton profil joueur.'}</small>
          <a class="btn sm ghost" href="#/profil" style="justify-self:start">Changer de photo de profil</a></div>
        <div class="card set-c"><h3>Courses du F1 Manager</h3>
          ${tg('low', lowMode(), 'Mode économie', 'Moins d\'effets visuels pendant les courses, pour les appareils modestes')}
          ${tg('mapFlat', mapStyle() === 'flat', 'Carte 2D épurée', 'Tracé simple, sans animation de décor')}
          ${tg('mapTele', getPref('mapTele') === '1', 'Télémétrie affichée au départ', 'Ouvre la télémétrie de ta voiture sur la carte')}</div>
        <div class="card set-c"><h3>Sauvegarde</h3><p class="muted" style="font-size:13px;margin:0">Tes données restent dans ce navigateur. Copie ce code pour les transférer sur un autre appareil.</p>
          <textarea class="field" id="expCode" readonly rows="3">${esc(F1.store.exportCode())}</textarea><button class="btn sm ghost" data-action="copy-code" style="justify-self:start">📋 Copier le code</button>
          <textarea class="field" id="impCode" rows="2" placeholder="Colle ici un code de sauvegarde…"></textarea><button class="btn sm ghost" data-action="import" style="justify-self:start">⬆️ Importer</button></div>
        <div class="card set-c danger"><h3>Réinitialiser</h3><p class="muted" style="font-size:13px;margin:0">Efface tes paris et repart avec ${fmt(F1.store.START)} jetons. Ton F1 Manager est aussi remis à zéro.</p><button class="btn sm" data-action="reset" style="justify-self:start">Tout réinitialiser</button></div>
      </div></section>`;
  }
  document.addEventListener('change', (e) => {
    const k = e.target && e.target.dataset && e.target.dataset.pref; if (!k) return;
    const on = e.target.checked;
    if (k === 'low') setPref('low', on ? '1' : '');
    else if (k === 'mapFlat') setPref('mapStyle', on ? 'flat' : '');
    else if (k === 'mapTele') setPref('mapTele', on ? '1' : '');
    toast('⚙️', 'Préférence enregistrée');
  });

  function pageProfile() {
    const p = F1.store.get(), st = F1.store.stats(), m = p.manager || {}, ms = m.stats || {}, so = SO();
    const name = (so.me && so.me.username) || p.name || 'Joueur';
    const mgrLoss = Math.max(0, (ms.races || 0) - (ms.wins || 0));
    const betsLost = st.done - st.won;
    const winrate = (w, n) => (n ? Math.round((w / n) * 100) : 0);
    const kpi = (lab, val, sub = '', cls = '') => `<div class="pf-kpi ${cls}"><small>${lab}</small><b>${val}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    const ring = (pct, col, lab) => `<div class="pf-ring" style="--p:${pct};--c:${col}"><b class="num">${pct}%</b><small>${lab}</small></div>`;
    // historique récent : courses du manager et paris réglés, mélangés par date
    const races = (m.races || []).slice(0, 8).map((r) => ({ t: r.t, html: `<span class="pf-tag mgr">Manager</span><b>${r.dnf ? 'Abandon' : 'P' + r.pos}</b><span class="muted">${esc(r.gp || '')}${r.mate ? ` · coéquipier ${r.mate.dnf ? 'AB' : 'P' + r.mate.pos}` : ''}</span><span class="${r.pc > 0 ? 'up' : ''}">+${fmtPC(r.pc)}</span>` }));
    const bets = p.bets.filter((b) => b.status === 'won' || b.status === 'lost').slice(-8).map((b) => ({ t: b.settledAt || b.placedAt, html: `<span class="pf-tag bet">Pari</span><b class="${b.status === 'won' ? 'up' : 'down'}">${b.status === 'won' ? 'Gagné' : 'Perdu'}</b><span class="muted">${esc(b.legs.length > 1 ? `Combiné × ${b.legs.length}` : b.legs[0].label + ' · ' + b.legs[0].mtitle)}</span><span class="${b.status === 'won' ? 'up' : 'down'}">${b.status === 'won' ? '+' + jt(b.payout - b.stake) : '−' + jt(b.stake)}</span>` }));
    const hist = [...races, ...bets].sort((a, b) => b.t - a.t).slice(0, 10);
    const best = F1.store.ACH.filter((a) => p.ach[a.id]).sort((a, b) => b.reward - a.reward).slice(0, 6);
    const L = MG().leagueOf(m.lp || 0);
    return `<section class="pf-page">
      <div class="pf-hero"><button class="pf-ava ring"${ringAttr(MG().leagueOf(F1.store.mgr().lp))} data-action="pf-ava" title="Changer de photo">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : `<span>${esc(name.slice(0, 1).toUpperCase())}</span>`}<i>Changer</i></button>
        <div class="pf-id"><small class="muted">Profil joueur</small><h1>${esc(name)} <button class="pf-edit" data-action="profile" title="Changer de pseudo">✏️ Modifier</button></h1><div class="row" style="gap:6px;flex-wrap:wrap">${leagueBadge(L)}${m.number && m.chassis ? `<span class="chip pf-num" style="color:${F1.teamColor(m.chassis.id)}" title="Votre numéro de course">${F1.num.html(m.number, m.chassis.id)}</span>` : ''}<span class="chip">${Object.keys(p.ach).length} succès</span>${((m.pass && m.pass.done) || []).map((d) => `<span class="chip ps-badge" title="Pass de saison complété">🎟️ Saison ${d.season} complétée</span>`).join('')}${so.me ? '<span class="chip green">Profil en ligne</span>' : '<span class="chip">Profil local</span>'}</div></div>
        <div class="pf-wallets"><div><small>Jetons</small><b>${jt(p.balance)}</b></div><div><small>PitCoins</small><b>${fmtPC(m.pc || 0)}</b></div><button class="btn sm ghost" data-action="profile">⚙ Pseudo & sauvegarde</button></div></div>
      ${so.avatarShared === false && p.avatar && /^data:/.test(p.avatar) ? `<div class="notice" style="margin-top:10px">Ta photo est visible sur cet appareil, mais pas encore chez les autres joueurs : le serveur ne l'accepte pas. Le propriétaire du site doit exécuter <code>supabase/${so.avatarWhy === 'profile-v2' ? 'migration-profile-v2.sql puis migration-avatar-upload.sql' : 'migration-avatar-upload.sql'}</code> dans Supabase. En attendant, les photos de la galerie sont partagées.</div>` : ''}
      <div class="pf-gallery ${S.pfAva ? 'open' : ''}" id="pfGallery"><div class="pf-gh"><b>Choisissez votre photo de profil</b><button class="btn sm ghost" data-action="pf-ava">Fermer</button></div>
        <div class="pf-avs">${AVATARS.map((src) => `<button class="pf-av ${p.avatar === src ? 'on' : ''}" data-action="pf-ava-set" data-src="${src}"><img src="${src}" alt="" loading="lazy"></button>`).join('')}<label class="pf-av up ${p.avatar && /^data:/.test(p.avatar) ? 'on' : ''}" title="Importer ma photo">${p.avatar && /^data:/.test(p.avatar) ? `<img src="${esc(p.avatar)}" alt="">` : '<span>＋</span>'}<small>Ma photo</small><input type="file" accept="image/*" id="pfUpload" hidden></label><button class="pf-av num" data-action="numav" title="Créer un avatar avec mon numéro"><span class="pf-av-n">${F1.num.html(numAvCfg().n, numAvCfg().team, { color: '#fff' })}</span><small>Mon numéro</small></button><button class="pf-av none ${!p.avatar ? 'on' : ''}" data-action="pf-ava-set" data-src=""><span>${esc(name.slice(0, 1).toUpperCase())}</span><small>Initiale</small></button></div></div>
      <div class="pf-grid">
        <div class="card pf-block"><div class="pf-bh"><h3>F1 Manager</h3>${ring(winrate(ms.wins || 0, ms.races || 0), 'var(--red2)', 'victoires')}</div>
          <div class="pf-kpis">${kpi('Victoires', fmt(ms.wins || 0), '', 'up')}${kpi('Défaites', fmt(mgrLoss), 'courses non gagnées')}${kpi('Podiums', fmt(ms.podiums || 0))}${kpi('Meilleure position', ms.best && ms.best < 99 ? 'P' + ms.best : '—')}${kpi('Points', fmt(ms.points || 0), 'barème F1')}${kpi('PitCoins gagnés', fmtPC(ms.pcEarned || 0))}</div>
          <div class="muted" style="font-size:12.5px;margin-top:8px">${m.chassis ? `Équipe <b>${esc(m.chassis.name)}</b>` : 'Pas encore d\'équipe'}${m.driver ? ` · pilote <b>${esc((S.mk || MG().market(S.f1 || S.season)).byDriver.get(m.driver.id)?.name || m.driver.name)}</b>` : ''}${m.mate ? ` · coéquipier <b>${esc(m.mate.name)}</b>` : ''} · ${ms.races || 0} course${(ms.races || 0) > 1 ? 's' : ''}</div></div>
        <div class="card pf-block"><div class="pf-bh"><h3>Paris</h3>${ring(winrate(st.won, st.done), 'var(--gold)', 'réussite')}</div>
          <div class="pf-kpis">${kpi('Paris gagnés', fmt(st.won), '', 'up')}${kpi('Paris perdus', fmt(betsLost), '', 'down')}${kpi('Bénéfice net', `${st.profit >= 0 ? '+' : '−'}${jt(Math.abs(st.profit))}`, '', st.profit >= 0 ? 'up' : 'down')}${kpi('Meilleure cote', st.bestOdds ? fmtOdds(st.bestOdds) : '—')}${kpi('Jetons gagnés', jt((p.stats || {}).tokensEarned || 0), 'paris + succès')}${kpi('Grâce à l\'actu', fmt((p.stats || {}).newsWins || 0), 'paris Paddock Wire')}</div></div>
      </div>
      <div class="pf-grid">
        <div class="card"><div class="pf-bh"><h3>Activité récente</h3></div>${hist.length ? `<div class="pf-hist">${hist.map((x) => `<div class="pf-h">${x.html}</div>`).join('')}</div>` : '<div class="muted">Aucune course ni pari réglé pour l\'instant.</div>'}</div>
        <div class="card"><div class="pf-bh"><h3>Succès à la une</h3><a class="link" href="#/succes">Tous les succès</a></div>${best.length ? `<div class="pf-ach">${best.map((a) => `<div class="pf-a"><span>${a.icon}</span><b>${esc(a.title)}</b><small>${esc(a.desc)}</small></div>`).join('')}</div>` : '<div class="muted">Aucun succès débloqué pour l\'instant.</div>'}</div>
      </div></section>`;
  }

  /* =================== Portefeuille / profil =================== */
  let shownBal = null;
  function updateWallet() {
    const p = F1.store.get();
    const el = $('#balance');
    const target = p.balance;
    const av = $('#avatar');
    { const L = MG().leagueOf(F1.store.mgr().lp); av.classList.add('ring'); av.dataset.lg = L.id; av.style.setProperty('--lr', L.color); av.title = `Mon compte · ligue ${L.name}`; }
    if (p.avatar) { if (!av.querySelector('img') || av.querySelector('img').getAttribute('src') !== p.avatar) av.innerHTML = `<img src="${esc(p.avatar)}" alt="">`; }
    else av.textContent = (p.name || '?').slice(0, 1).toUpperCase();
    achBadge(); avatarBadge();
    // solde de PitCoins du mode affiché (F1 Manager ou Carrière), mis à jour à chaque achat ou gain, sans recharger la page
    { const v = Math.round(F1.store.mgr().pc || 0);
      $$('.pc-wallet').forEach((w) => { const b = w.querySelector('b'); if (b) b.textContent = fmt(v); w.classList.toggle('neg', v < 0); });
      $$('.hq-hud > div').forEach((d) => { const l = d.querySelector('small'); if (l && l.textContent === 'PitCoins') d.querySelector('b').innerHTML = v < 0 ? `<span class="neg">${fmtPC(v)}</span>` : fmtPC(v); }); }
    if (shownBal === null) { shownBal = target; el.textContent = fmtJ(target); return; }
    if (Math.abs(shownBal - target) < 0.005) return;
    const from = shownBal, t0 = performance.now();
    shownBal = target;
    const w = $('#wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump');
    const step = (t) => { const k = Math.min(1, (t - t0) / 700); const e = 1 - Math.pow(1 - k, 3); el.textContent = fmtJ(Math.round((from + (target - from) * e) * 100) / 100); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function modal(html) {
    $('#modal').innerHTML = `<div class="modal" data-action="modal-bg"><div class="modal-box">${html}</div></div>`;
    const f = $('#modal input'); if (f) setTimeout(() => f.focus(), 50);
  }
  const closeModal = () => { if (S.raceFinish) S.raceFinish(true); if (raceTimer) { clearInterval(raceTimer); raceTimer = null; } if (S.raceMap) { S.raceMap.dispose(); S.raceMap = null; } const wasRace = !!$('#modal .race-modal'); if (wasRace && document.fullscreenElement) document.exitFullscreen().catch(() => {}); document.documentElement.classList.remove('race-lock'); $('#modal').innerHTML = ''; if (wasRace && /^#\/manager/.test(location.hash)) route(); };
  function welcome() {
    modal(`<div style="font-size:42px">🏎️</div><h2>Bienvenue au muret des stands</h2>
      <p class="muted">PITWALL est un jeu de pronostics <b>gratuit</b> sur la Formule 1. Vous démarrez avec <b style="color:var(--gold)">${fmt(F1.store.START)} jetons virtuels</b> et recevez une prime à chaque Grand Prix. Les cotes sont recalculées après chaque course à partir des résultats officiels, et vos paris sont réglés automatiquement.</p>
      <p class="muted" style="font-size:13px">Aucun argent réel, rien à gagner : juste la gloire du paddock.</p>
      <label class="muted" style="font-size:13px;font-weight:700">Votre pseudo</label><input class="field" id="nameIn" maxlength="24" placeholder="ex. Lewis_du_93" style="margin:6px 0 16px">
      <button class="btn block" data-action="save-name">Entrer dans le paddock</button>`);
  }
  function profile() {
    const p = F1.store.get();
    const so = SO(), cur = (so.me && so.me.username) || p.name || '';
    modal(`<h2>Profil</h2><label class="muted" style="font-size:13px;font-weight:700">Pseudo</label>
      <div class="row" style="margin:6px 0 4px;flex-wrap:nowrap"><input class="field" id="nameIn" maxlength="24" value="${esc(cur)}"><button class="btn sm" data-action="rename">Enregistrer</button></div>
      <p class="muted" style="font-size:12px;margin:0 0 20px">${so.me ? 'Affiché dans vos ligues et les classements. 3 à 24 caractères : lettres sans accent, chiffres, _ . -' : 'Affiché sur ce site. Il servira aussi de pseudo en ligne quand vous créerez votre profil joueur.'}</p>
      <h3 style="margin:0 0 6px">Sauvegarde</h3><p class="muted" style="font-size:13px;margin-top:0">Vos données restent dans ce navigateur. Copiez ce code pour les transférer sur un autre appareil.</p>
      <textarea class="field" id="expCode" readonly>${esc(F1.store.exportCode())}</textarea>
      <div class="row" style="margin:8px 0 18px"><button class="btn sm ghost" data-action="copy-code">📋 Copier</button></div>
      <textarea class="field" id="impCode" placeholder="Collez ici un code de sauvegarde…"></textarea>
      <div class="row" style="margin:8px 0 18px"><button class="btn sm ghost" data-action="import">⬆️ Importer</button></div>
      <div class="row"><button class="btn sm ghost" data-action="reset" style="color:var(--lose)">Réinitialiser ma partie</button><span class="sp"></span><button class="btn sm" data-action="close-modal">Fermer</button></div>`);
  }

  function renderFooter() {
    const s = S.season;
    const src = { live: 'API live', snapshot: 'instantané hebdomadaire', cache: 'cache local', fallback: 'données de secours', embedded: 'calendrier ' + s.year + ' intégré' }[s.source];
    const meta = S.meta && S.meta.updated ? ` · données vérifiées automatiquement le ${DTF.format(new Date(S.meta.updated))}` : '';
    $('#footer').innerHTML = `<div style="max-width:760px;margin:0 auto">
      <div class="logo foot-logo"><span class="logo-word">PITWALL</span></div>
      <div style="margin:4px 0 14px"><button class="btn sm ghost low-btn ${lowMode() ? 'on' : ''}" data-action="low-mode" title="Désactive les effets visuels lourds et limite la carte de course à 24 images par seconde">Config basse${lowMode() ? ' ✓' : ''}</button></div>
      Données : <a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noopener">Jolpica F1 API</a> (successeur d'Ergast) · Météo : <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Source : ${src}${s.updated ? ' · maj ' + DTF.format(s.updated) : ''}${meta}
      · <button class="link" data-action="reload" style="text-decoration:underline">Actualiser</button><br><br>
      Photos des pilotes : Wikimedia Commons, licences libres — <button class="link" data-action="credits" style="text-decoration:underline">crédits photos</button> · Monoplaces : illustrations originales.<br><br>
      Jeu gratuit à jetons virtuels, sans argent réel ni gain matériel. Site de fans non officiel, sans lien avec la Formula One Group, la FIA, l'ACO, le WEC ou les écuries. Les cotes sont des estimations statistiques et n'ont qu'une valeur ludique.</div>`;
  }

  /* =================== Toasts & confettis =================== */
  function toast(icon, html, cls = '', ms = 3500) {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.innerHTML = `<span class="ti">${icon}</span><span>${html}</span>`;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }
  let confettiParts = [], confettiRun = false;
  function confetti(n = 150) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#confetti'), ctx = cv.getContext('2d');
    cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
    const colors = ['#e10600', '#ffffff', '#ffcc4d', '#27f4d2', '#ff8000', '#3671c6'];
    for (let i = 0; i < n; i++) confettiParts.push({ x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4, r: Math.random() * 6 + 4, c: colors[i % colors.length], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, life: 1, chk: Math.random() < 0.2 });
    if (confettiRun) return;
    confettiRun = true;
    const frame = () => {
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      confettiParts.forEach((p) => {
        p.vy += 0.42; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.a += p.va; p.life -= 0.006;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.globalAlpha = Math.max(0, p.life);
        if (p.chk) { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#000' : '#fff'; ctx.fillRect(-p.r + i * p.r, -p.r * 0.6 + j * p.r * 0.6, p.r, p.r * 0.6); } }
        else { ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); }
        ctx.restore();
      });
      confettiParts = confettiParts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
      if (confettiParts.length) requestAnimationFrame(frame);
      else { confettiRun = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
    };
    requestAnimationFrame(frame);
  }

  /* =================== Événements =================== */
  // infobulle des éléments [data-tip] (bonus des pièces, du personnel et du garage)
  const tipEl = document.createElement('div'); tipEl.className = 'tipbox'; document.body.appendChild(tipEl);
  let tipOn = null;
  const tipShow = (el) => {
    tipOn = el; tipEl.textContent = el.dataset.tip; tipEl.classList.add('on');
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tipEl.style.top = (r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8) + 'px';
  };
  document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el.dataset.tip) { if (el !== tipOn) tipShow(el); } else if (tipOn) { tipOn = null; tipEl.classList.remove('on'); } });
  document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el.dataset.tip) tipShow(el); });
  window.addEventListener('scroll', () => { if (tipOn) { tipOn = null; tipEl.classList.remove('on'); } }, { passive: true });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'pwQ') { S.pwQ = e.target.value; pwApply(); } });
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'pfUpload') importPhoto(e.target.files && e.target.files[0]); });
  document.addEventListener('click', (e) => {
    const odd = e.target.closest('[data-sid]:not([data-action])');
    if (odd && !odd.disabled) { toggleSel(odd.dataset.sid, odd); return; }
    // carte entièrement cliquable (ex. une ligue) : les liens et boutons qu'elle contient gardent leur propre action
    const card = e.target.closest('[data-href]');
    if (card && !e.target.closest('a, button')) { location.hash = card.dataset.href; return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    switch (act) {
      case 'open-slip': S.slipOpen = true; renderSlip(); break;
      case 'close-slip': S.slipOpen = false; renderSlip(); break;
      case 'clear-slip': S.slip = []; S.mode = 'single'; S.modeTouched = false; saveSlip(); renderSlip(); $$('.odd.on').forEach((b) => b.classList.remove('on')); break;
      case 'rm': toggleSel(a.dataset.sid); break;
      case 'mode': S.mode = a.dataset.m; S.modeTouched = true; renderSlip(); break;
      case 'stake': { const bal = F1.store.get().balance; if (a.dataset.v === 'max') S.stake = Math.floor(S.mode === 'single' ? bal / Math.max(S.slip.length, 1) : bal); else S.stake = (S.stake || 0) + +a.dataset.v; renderSlip(); break; }
      case 'place': placeBets(); break;
      case 'expand': S.expanded.has(a.dataset.mid) ? S.expanded.delete(a.dataset.mid) : S.expanded.add(a.dataset.mid); route(); break;
      case 'tierce-pick': { const i = S.tierce.indexOf(null); if (i >= 0) { S.tierce[i] = a.dataset.d; route(); } break; }
      case 'tierce-clear': S.tierce[+a.dataset.i] = null; route(); break;
      case 'tierce-reset': S.tierce = [null, null, null]; route(); break;
      case 'stand': S.standTab = a.dataset.t; route(); break;
      case 'chart-toggle': { const k = a.dataset.k; S.chartHidden.has(k) ? S.chartHidden.delete(k) : S.chartHidden.add(k); a.classList.toggle('off'); const g = $(`#chartWrap g[data-k="${CSS.escape(k)}"]`); if (g) g.style.display = S.chartHidden.has(k) ? 'none' : ''; break; }
      case 'gptab': S.gpTab = a.dataset.t; route(); break;
      case 'betstab': S.betsTab = a.dataset.t; route(); break;
      case 'claim': { const g = F1.store.claimWeekly(S.season, S.season.next); if (g) { toast('🎁', `+${jt(g)} crédités !`, 'win'); confetti(100); showAchievements(); route(); } break; }
      case 'claim-season': { const g = F1.store.claimSeason(S.season); if (g) { toast('🎆', `+${jt(g)} pour la saison ${S.season.year} !`, 'win'); confetti(160); route(); } break; }
      case 'rescue': { const g = F1.store.rescue(S.season, S.season.next); if (g) { toast('⛽', `Ravitaillement : +${jt(g)}`, 'win'); route(); } break; }
      case 'profile': profile(); break;
      case 'numav': numAvOpen(); break;
      case 'na-team': { S.numAv.team = a.dataset.t; $$('.nav-av-t').forEach((b) => b.classList.toggle('on', b === a)); const au = $('.nav-av-sw [data-v="auto"]'); if (au) au.style.setProperty('--sw', `linear-gradient(135deg, ${F1.numAvatar.LOOK[a.dataset.t].bg}, #05070c)`); const tm = $('.nav-av-sw [data-v="team"]'); if (tm) tm.style.setProperty('--sw', F1.teamColor(a.dataset.t)); numAvDraw(); break; }
      case 'na-col': { S.numAv[a.dataset.k] = a.dataset.v; $$(`.nav-av-sw[data-k="${a.dataset.k}"] button`).forEach((b) => b.classList.toggle('on', b === a)); numAvDraw(); break; }
      case 'na-style': { S.numAv.style = a.dataset.s; $$('.nav-av-st button').forEach((b) => b.classList.toggle('on', b === a)); numAvDraw(); break; }
      case 'na-use': numAvUse(); break;
      case 'pf-ava': { S.pfAva = !S.pfAva; const gal = $('#pfGallery'); if (gal) gal.classList.toggle('open', !!S.pfAva); break; }
      case 'pf-ava-set': { F1.store.setAvatar(a.dataset.src || null); S.pfAva = false; F1.social.sync(true); showAchievements(); route(); toast('🪪', 'Photo de profil mise à jour', 'win'); break; }
      case 'ach-cat': S.achCat = a.dataset.c; route(); break;
      case 'ach-claim': { try { const n = F1.store.claimAch(a.dataset.id); achFly(a, n); toast('🏆', `+${jt(n)} crédités`, 'win'); setTimeout(route, 900); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'ach-claim-all': { let t = 0; F1.store.achClaimable().forEach((x) => { t += F1.store.claimAch(x.id); }); achFly(a, t); confetti(140); toast('🏆', `+${jt(t)} crédités`, 'win'); setTimeout(route, 900); break; }
      case 'credits': credits(); break;
      case 'm-buy-d': { const ctx = mgrCtx(); const d0 = ctx.mk.byDriver.get(a.dataset.id); const d = { ...d0, price: MG().driverPrice(MG().withExperience(d0, ctx.m.drvXp)) }; const lk = lockOf(ctx, d0.id); if (lk) { toast('🔒', `${esc(d0.name)} ne signe qu'à partir de la ligue ${lk.icon} ${esc(lk.name)}`, 'err'); break; } try { F1.store.buyDriver(d, resaleD(ctx)); toast('🤝', `<b>${esc(d.name)}</b> rejoint votre écurie !`, 'win'); confetti(80); showAchievements(); F1.social.sync(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'mate-buy': { const ctx = mgrCtx(); const d0 = ctx.mk.byDriver.get(a.dataset.id); const lk = lockOf(ctx, d0.id); if (lk) { toast('🔒', `${esc(d0.name)} ne signe qu'à partir de la ligue ${lk.icon} ${esc(lk.name)}`, 'err'); break; } try { F1.store.buyMate(d0, MG().mateValue(d0), resaleM(ctx)); toast('🤝', `<b>${esc(d0.name)}</b> devient votre coéquipier !`, 'win'); confetti(70); showAchievements(); F1.social.sync(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'mate-release': { const ctx = mgrCtx(); if (!confirm(`Libérer ${ctx.m.mate.name} ? Vous récupérez ${resaleM(ctx)} PitCoins (un seul changement de coéquipier par jour).`)) break; let g; try { g = F1.store.releaseMate(resaleM(ctx)); } catch (err) { toast('⚠️', esc(err.message), 'err'); break; } toast('🤝', `Coéquipier libéré : +${fmtPC(g)}`, 'win'); F1.social.sync(); route(); break; }
      case 'sp-sign': { try { const t = F1.store.signSponsor(a.dataset.id, a.dataset.slot); const sp = MG().SPONSOR_BY_ID.get(a.dataset.id); toast('💼', `Contrat signé avec <b>${esc(sp.name)}</b> : +${t.sign} PitCoins de prime de signature`, 'win'); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'm-buy-c': { const ctx = mgrCtx(); const c = ctx.mk.byChassis.get(a.dataset.id); if (ctx.m.chassis && ctx.m.rdSpent > 0 && !confirm('Changer d\'équipe : chaque pièce de R&D garde la moitié de ses niveaux. Continuer ?')) break; try { F1.store.buyChassis(c, resaleC(ctx)); toast('🏎️', `Vous prenez la direction de <b>${esc(c.name)}</b> !`, 'win'); confetti(80); showAchievements(); F1.social.sync(); route(); setTimeout(() => openNumberPicker(true), 350); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'rd-cat': { const was = $('#pu3d') ? 'pu' : 'car'; S.rdCat = a.dataset.c; S.rdSel = null; S.rdView = null; if ((a.dataset.c === 'pu' ? 'pu' : 'car') !== was) route(); else rdRefresh(); break; }
      case 'series': setSeries(a.dataset.s); break;
      case 'rd-view': S.rdView = a.dataset.v; route(); break;
      case 'staff-sel': S.staffRole = a.dataset.r; route(); break;
      case 'staff-hire': { try { const x = F1.store.hireStaff(a.dataset.r, a.dataset.id); toast('🎧', `<b>${esc(x.name)}</b> rejoint votre muret des stands !`, 'win'); confetti(80); showAchievements(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'garage-zone': S.garageZone = a.dataset.z; route(); break;
      case 'garage-up': { try { const g = MG().GARAGE_BY_ID.get(a.dataset.id); const l = F1.store.upgradeGarage(a.dataset.id); toast(g.icon, `<b>${esc(g.name)}</b> : niveau ${l} installé au garage`, 'win'); if (l >= MG().MAX_LV) confetti(120); showAchievements(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'tyre-pick': F1.store.setTyre(a.dataset.t); refreshWeekend(); break;
      case 'plan-tyre': { const { NL, st } = planNow(); st[+a.dataset.i].tyre = a.dataset.t; F1.store.setPlan(st, NL); refreshWeekend(); break; }
      case 'plan-lap': { const { NL, st } = planNow(); const i = +a.dataset.i; const lo = i ? st[i - 1].lap + 1 : 1, hi = st[i + 1] ? st[i + 1].lap - 1 : NL - 1; st[i].lap = Math.max(lo, Math.min(hi, st[i].lap + +a.dataset.d)); F1.store.setPlan(st, NL); refreshWeekend(); break; }
      case 'plan-add': { const { NL, st } = planNow(); const last = st[st.length - 1]; st.push({ lap: Math.min(NL - 1, (last ? last.lap : Math.round(NL * 0.3)) + Math.round(NL * 0.3)), tyre: 'S' }); F1.store.setPlan(st, NL); refreshWeekend(); break; }
      case 'plan-del': { const { NL, st } = planNow(); st.splice(+a.dataset.i, 1); F1.store.setPlan(st, NL); refreshWeekend(); break; }
      case 'race-speed': S.raceSpeed = +a.dataset.v || 1; $$('[data-action="race-speed"]').forEach((b) => b.classList.toggle('on', b === a)); break;
      case 'map-style': setPref('mapStyle', a.dataset.v); if (S.raceMap) S.raceMap.setStyle(a.dataset.v); $$('[data-action="map-style"]').forEach((b) => b.classList.toggle('on', b === a)); break;
      case 'low-mode': { const v = !lowMode(); setPref('low', v ? '1' : ''); applyLow(); if (S.raceMap) S.raceMap.setLow(v); $$('[data-action="low-mode"]').forEach((b) => { b.classList.toggle('on', v); b.textContent = 'Config basse' + (v ? ' ✓' : ''); }); toast(v ? '🐢' : '✨', v ? 'Config basse activée : effets allégés, carte à 24 images/s' : 'Config basse désactivée', 'win'); break; }
      case 'rd-sel': S.rdSel = a.dataset.p || null; rdRefresh(); break;
      case 'rd-buy': {
        const p = MG().RD_BY_ID.get(a.dataset.p), mode = a.dataset.mode || 'safe';
        try {
          const res = F1.store.research(p, mode);
          if (res.queued) { toast('🌬️', `<b>${esc(p.name)} ${MG().LV_NAME[res.job.lv]}</b> part en soufflerie : prête dans ${durTxt(res.job.end - res.job.start)}`, 'win', 4500); rdRefresh(); break; }
          rdOutcome(res, p, mode);
        } catch (err) { toast('⚠️', esc(err.message), 'err'); }
        break;
      }
      case 'rd-install': { const p = MG().RD_BY_ID.get(a.dataset.p); try { const res = F1.store.installPart(p.id); rdOutcome(res, p, res.mode); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'rd-rush': { try { const c = F1.store.rushJob(a.dataset.p); toast('⚡', `Fabrication terminée tout de suite : −${c} jetons`, 'win'); rdRefresh(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'rd-slot2': { try { F1.store.unlockSlot2(); toast('🌬️', 'Deuxième emplacement de soufflerie débloqué', 'win'); confetti(60); rdRefresh(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'ps-claim': case 'ps-all': {
        try {
          const P = F1.store.pass(), t = MG().passTier(P.xp), list = a.dataset.t ? [+a.dataset.t] : Array.from({ length: t }, (_, i) => i + 1).filter((x) => !P.claimed[x]);
          let pc = 0, tok = 0; const liv = [], chests = [];
          for (const x of list) { const r = F1.store.claimPass(x); if (r.kind === 'chest') { pc += r.pc; chests.push(r); } else if (r.kind === 'token') tok++; else liv.push(MG().PASS_LIVERY_BY.get(r.id).name); }
          if (chests.length) {
            route();
            const extra = [tok ? `🎟️ ${tok} jeton${tok > 1 ? 's' : ''} de tentative` : '', ...liv.map((n) => `🎨 Livrée <b>${esc(n)}</b> (à équiper dans le Garage)`)].filter(Boolean).join('<br>');
            chestReveal(chests, extra); setTimeout(() => confetti(liv.length ? 180 : 80), 700); showAchievements(); break;
          }
          const parts = [pc ? `+${fmtPC(pc)}` : '', tok ? `${tok} jeton${tok > 1 ? 's' : ''} de tentative` : '', ...liv.map((n) => `livrée <b>${esc(n)}</b> (à équiper dans le Garage)`)].filter(Boolean);
          toast('🎁', `Pass de saison : ${parts.join(' · ')}`, 'win', 5000); confetti(liv.length ? 180 : 70);
          showAchievements(); route();
        } catch (err) { toast('⚠️', esc(err.message), 'err'); }
        break;
      }
      case 'ps-next': { try { const np = F1.store.nextSeason(); toast('🎟️', `Saison ${np.season - 1} complétée : le badge est sur votre profil. Bienvenue dans la saison ${np.season} !`, 'win', 5000); confetti(220); showAchievements(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'lv-set': { try { F1.store.setSkin(a.dataset.id || null); toast('🎨', a.dataset.id ? `Livrée <b>${esc(MG().PASS_LIVERY_BY.get(a.dataset.id).name)}</b> équipée` : 'Livrée d\'équipe rétablie', 'win'); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'obj-claim': { try { const pc = F1.store.claimObjective(a.dataset.id, mgrCtx().league.mult); toast('🎯', `Objectif rempli : +${fmtPC(pc)}`, 'win'); confetti(60); showAchievements(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'm-up': { const k = a.dataset.k; const lvl = F1.store.mgr().ups[k] || 0; try { F1.store.upgrade(k, MG().upCost(lvl)); const st = MG().STATS.find((x) => x.k === k); toast('🔬', `${st.icon} ${esc(st.label)} : niveau ${lvl + 1} !`, 'win'); showAchievements(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'm-race': startRace(); break;
      case 'm-again': closeModal(); setTimeout(startRace, 50); break;
      case 'm-qg': closeModal(); if (location.hash !== MB()) location.hash = MB(); else route(); break;
      case 'cr-media': crMediaOpen(); break;
      case 'cr-quali': crQualiOpen(); break;
      case 'cr-new': F1.store.careerNewSeason(); route(); toast('🏁', `Saison ${F1.store.career().cal.season} de Carrière lancée`, 'win'); break;
      case 'cr-reset': modal(`<h2>Recommencer la Carrière ?</h2><p class="muted">Votre écurie, vos pilotes, votre R&D, votre garage, vos PitCoins et votre championnat de Carrière seront effacés. Le F1 Manager classique n'est pas touché.</p><div class="row" style="justify-content:flex-end;gap:8px"><button class="btn ghost" data-action="modal-close">Annuler</button><button class="btn" data-action="cr-reset-ok">Effacer la Carrière</button></div>`); break;
      case 'cr-reset-ok': F1.store.careerReset(); closeModal(); location.hash = '#/carriere'; route(); toast('🔄', 'Carrière remise à zéro', 'win'); break;
      case 'm-skip': if (S.raceFinish && raceTimer) S.raceFinish(); break;
      case 'm-close': closeModal(); if (isCareer()) route(); break;
      case 'f-retry': F1.social.init().then(route); break;
      case 'f-refresh': socialAct(() => F1.social.refresh()); break;
      case 'lg-sel': S.lgSel = a.dataset.id; mountLeagues(); break;
      case 'lg-open': openLeague(a.dataset.id); break;
      case 'wk-go': { const tk = a.dataset.token === '1'; closeModal(); setTimeout(() => startWeekly(tk), 50); break; }
      case 'wk-back': closeModal(); if (location.hash !== '#/manager/hebdo') location.hash = '#/manager/hebdo'; else route(); break;
      case 'wk-board': S.wkBoard = a.dataset.v; mountWeekly(); break;
      case 'pd-pick': { const d = S.pdDraft[a.dataset.s], id = a.dataset.d; const j = d.indexOf(id); if (j >= 0) d[j] = null; else { const i = d.indexOf(null); d[i >= 0 ? i : 2] = id; } pdRefresh(); break; }
      case 'pd-clear': { S.pdDraft[a.dataset.s][+a.dataset.i] = null; pdRefresh(); break; }
      case 'pd-save': {
        const k = a.dataset.s, gp = leagueGp(), y = (S.f1 || S.season).year, picks = S.pdDraft[k].slice(), st = sessionStart(gp, k);
        if (picks.filter(Boolean).length !== 3) break;
        if (!st || Date.now() >= st.getTime()) { toast('🔒', 'Session commencée : pronostics verrouillés', 'err'); route(); break; }
        const OD = podOdds(), odds = picks.map((id) => { const o = OD.get(id); return o ? Math.round(Math.min(50, o.odds) * 100) / 100 : null; });
        setLocalPick(y, gp.round, k, picks, odds); F1.store.noteStat('podiumPicks'); showAchievements();
        const so = SO();
        if (so.ready && so.me) F1.social.savePodium(y, gp.round, k, picks, st, odds).then(() => toast('✅', `Pronostic ${PODIUM[k].label.toLowerCase()} enregistré pour toutes vos ligues`, 'win')).catch((e) => toast('💾', e.missing ? 'Pronostic gardé sur cet appareil (pronostics partagés pas encore activés sur ce site)' : esc(e.message), e.missing ? 'win' : 'err'));
        else toast('💾', 'Pronostic enregistré sur cet appareil', 'win');
        pdRefresh(); break;
      }
      case 'lg-create': { const n = ($('#lgName') || {}).value; (async () => { try { const l = await F1.social.createLeague(n); S.lgSel = l.id; F1.store.noteStat('leagueJoined', true); showAchievements(); toast('🏆', `Ligue <b>${esc(l.name)}</b> créée. Code à partager : <b>${esc(l.code)}</b>`, 'win'); route(); } catch (e) { toast('⚠️', esc(e.missing ? 'Ligues privées pas encore activées sur ce site (migration Supabase à exécuter).' : e.message), 'err'); } })(); break; }
      case 'lg-join': { const c = ($('#lgCode') || {}).value; (async () => { try { const l = await F1.social.joinLeague(c); S.lgSel = l.id; F1.store.noteStat('leagueJoined', true); showAchievements(); toast('🤝', `Vous avez rejoint <b>${esc(l.name)}</b>`, 'win'); route(); } catch (e) { toast('⚠️', esc(e.missing ? 'Ligues privées pas encore activées sur ce site (migration Supabase à exécuter).' : e.message), 'err'); } })(); break; }
      case 'lg-copy': { const txt = `Rejoins ma ligue de pronostics F1 sur PITWALL avec le code ${a.dataset.code} : ${a.dataset.link}`; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('📋', 'Invitation copiée : collez-la à vos amis', 'win')).catch(() => toast('📋', `Code : <b>${esc(a.dataset.code)}</b>`, 'win')); break; }
      case 'lg-leave': { if (!confirm('Quitter cette ligue ?')) break; (async () => { try { await F1.social.leaveLeague(a.dataset.id); S.lgSel = 'off'; closeModal(); if (/^#\/ligues\/l\//.test(location.hash)) location.hash = '#/ligues'; toast('👋', 'Vous avez quitté la ligue', 'win'); route(); } catch (e) { toast('⚠️', esc(e.message), 'err'); } })(); break; }
      case 'f-claim': { const n = $('#claimName').value.trim(), t = $('#claimTeam').value; socialAct(async () => { await F1.social.claim(n, t); if (!F1.store.get().name) F1.store.setName(n); }, `Profil créé : bienvenue ${esc(n)} !`); break; }
      case 'f-edit': { const me = SO().me; modal(`<h2>Profil joueur</h2><label class="muted" style="font-size:13px;font-weight:700">Pseudo public</label><input class="field" id="claimName" maxlength="24" value="${esc(me.username)}" style="margin:6px 0 12px"><label class="muted" style="font-size:13px;font-weight:700">Écurie favorite</label><select class="field" id="claimTeam" style="margin:6px 0 16px">${teamOptions(me.team)}</select><div class="row"><button class="btn sm ghost" data-action="close-modal">Annuler</button><span class="sp"></span><button class="btn sm" data-action="f-save">Enregistrer</button></div>`); break; }
      case 'f-save': { const n = $('#claimName').value.trim(), t = $('#claimTeam').value; closeModal(); socialAct(() => F1.social.claim(n, t), 'Profil mis à jour'); break; }
      case 'f-add': socialAct(() => F1.social.request(a.dataset.u), 'Demande d\'ami envoyée'); break;
      case 'f-accept': socialAct(() => F1.social.accept(+a.dataset.id), 'Vous êtes maintenant amis 🤝'); break;
      case 'f-remove': if (!a.dataset.confirm || confirm('Retirer ce joueur de vos amis ?')) socialAct(() => F1.social.remove(+a.dataset.id)); break;
      case 'f-copy': (navigator.clipboard ? navigator.clipboard.writeText(a.dataset.v) : Promise.reject()).then(() => toast('🔗', 'Lien d\'invitation copié : envoyez-le à vos amis !', 'win'), () => prompt('Copiez ce lien :', a.dataset.v)); break;
      case 'rename': {
        const v = ($('#nameIn').value || '').trim(), so = SO();
        if (!v) { $('#nameIn').focus(); break; }
        if (so.ready && so.me) {
          const n = F1.social.cleanName(v);
          if (!F1.social.USER_RE.test(n)) { toast('⚠️', 'Pseudo : 3 à 24 caractères, lettres sans accent, chiffres, _ . -', 'err'); break; }
          if (n === so.me.username) { F1.store.setName(n); closeModal(); route(); break; }
          a.disabled = true;
          F1.social.claim(n, so.me.team).then(() => { F1.store.setName(n); closeModal(); toast('✏️', `Pseudo changé : <b>${esc(n)}</b>`, 'win'); route(); })
            .catch((err) => { a.disabled = false; toast('⚠️', esc(err.message), 'err'); });
        } else { F1.store.setName(v.slice(0, 24)); closeModal(); toast('✏️', `Pseudo changé : <b>${esc(v.slice(0, 24))}</b>`, 'win'); route(); }
        break;
      }
      case 'save-name': { const v = ($('#nameIn').value || '').trim(); if (!v) { $('#nameIn').focus(); return; } F1.store.setName(v); closeModal(); toast('👋', `Bienvenue, <b>${esc(v)}</b> !`, 'win'); route(); break; }
      case 'copy-code': { const t = $('#expCode'); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => toast('📋', 'Code copié'), () => document.execCommand('copy')); break; }
      case 'import': try { F1.store.importCode($('#impCode').value); closeModal(); shownBal = null; updateWallet(); route(); toast('✅', 'Sauvegarde importée', 'win'); } catch (err) { toast('⚠️', 'Code de sauvegarde invalide', 'err'); } break;
      case 'reset': if (confirm('Effacer tous vos paris et repartir avec ' + F1.store.START + ' jetons ?')) { F1.store.reset(); closeModal(); route(); toast('↺', 'Partie réinitialisée'); } break;
      case 'close-modal': closeModal(); break;
      case 'umenu': { e.preventDefault(); userMenu(!$('#umenu')); break; }
      case 'msg-send': { e.preventDefault(); sendMsg(); break; }
      case 'scroll-to': { const t = $(a.dataset.to); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 80, behavior: 'smooth' }); break; }
      case 'np-open': openNumberPicker(false); break;
      case 'np-pick': { const i = $('#npIn'); if (i) { i.value = a.dataset.n; i.dispatchEvent(new Event('input')); } break; }
      case 'np-save': { const i = $('#npIn'); try { const n = F1.store.setNumber(i ? i.value : ''); closeModal(); toast('🏁', `Numéro <b>${esc(n)}</b> validé : il est peint sur votre monoplace`, 'win'); confetti(60); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'modal-bg': if (e.target === a && F1.store.get().name) closeModal(); break;
      case 'modal-close': closeModal(); break;
      case 'reload': F1.data.clearCache(); location.reload(); break;
      case 'pw-sync': pwSync(a); break;
      case 'pw-filter': S.pwFilter = a.dataset.f; $$('.pdw-chip').forEach((c) => c.classList.toggle('on', c.dataset.f === S.pwFilter)); pwApply(); break;
      case 'pw-team': S.pwTeam = S.pwTeam === a.dataset.t ? '' : a.dataset.t; $$('.pw-tbtn').forEach((c) => c.classList.toggle('on', c.dataset.t === S.pwTeam)); pwApply(); break;
      default:
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('#modal').innerHTML && F1.store.get().name) closeModal(); else if (S.slipOpen) { S.slipOpen = false; renderSlip(); } }
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'msgIn') { e.preventDefault(); sendMsg(); return; }
    if (e.key === 'Enter' && e.target.id === 'nameIn') ($('[data-action="rename"]') || $('[data-action="save-name"]')).click();
    if (e.key === 'Enter' && e.target.id === 'claimName' && $('[data-action="f-claim"]')) $('[data-action="f-claim"]').click();
  });
  window.addEventListener('resize', () => { document.body.classList.toggle('has-slip', S.slip.length > 0 && innerWidth >= 1280); });

  boot();
})(globalThis.F1);
