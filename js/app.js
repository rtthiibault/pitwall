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
  const coin = '<span class="coin sm">J</span>';

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
    try {
      S.season = await F1.data.loadSeason();
      await prepare();
    } catch (e) {
      console.error(e);
      S.season = F1.data.normalize(F1.FALLBACK, 'fallback');
      await prepare();
    }
    // portraits : on attend au plus 2,5 s, puis on redessine quand tout est arrivé
    const pp = F1.visuals.loadPortraits([...S.season.drivers.values(), ...(S.season.upcoming ? S.season.upcoming.drivers.values() : [])]);
    let portraitsDone = false;
    pp.then(() => { portraitsDone = true; });
    await Promise.race([pp, new Promise((r) => setTimeout(r, 2500))]);
    if (!portraitsDone) pp.then(() => route());
    await lights.finish();
    F1.store.onChange(updateWallet);
    F1.store.onChange(() => F1.social.sync());
    F1.social.onChange(() => { friendsBadge(); if (/^#\/amis/.test(location.hash) && !document.activeElement.closest('#friendSearch')) route(); });
    F1.social.init().then((so) => { if (so.incoming.length) toast('👋', `${so.incoming.length} demande${so.incoming.length > 1 ? 's' : ''} d'ami en attente`, 'win', 5000); });
    updateWallet();
    route();
    renderSlip();
    renderFooter();
    F1.data.loadMeta().then((m) => { S.meta = m; renderFooter(); });
    runSettlement();
    if (!F1.store.get().name) setTimeout(welcome, 700);
    setInterval(tick, 1000);
    setInterval(refresh, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
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
    const years = new Set(F1.store.get().bets.filter((b) => b.status === 'open').flatMap((b) => b.legs.filter((l) => !l.result && l.season && l.season !== s.year).map((l) => l.season)));
    for (const y of years) {
      if (s.prev && s.prev.year === y) S.archives[y] = s.prev;
      else if (s.upcoming && s.upcoming.year === y) S.archives[y] = s.upcoming;
      else if (!S.archives[y] && y < s.year) { try { S.archives[y] = await F1.data.loadYear(y); } catch (e) { /* */ } }
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
    [...S.markets, ...S.seasonMarkets, ...S.upMarkets].forEach((m) => m.selections.forEach((x) => all.set(x.sid, { ...x, closes: m.closes, season: x.season || s.year })));
    S.slip = S.slip.map((l) => all.get(l.sid) || (l.kind === 'tierce' && s.next && l.round === s.next.round ? l : null)).filter(Boolean);
    saveSlip();
  }

  async function refresh() {
    if (document.hidden || !S.season) return;
    const before = `${S.season.doneCount}|${S.season.next && S.season.next.round}|${S.season.next && !!S.season.next.qualifying}`;
    try {
      const ns = await F1.data.loadSeason();
      S.season = ns;
      await prepare();
      const after = `${ns.doneCount}|${ns.next && ns.next.round}|${ns.next && !!ns.next.qualifying}`;
      runSettlement();
      if (before !== after) { route(); renderSlip(); renderFooter(); toast('🔄', 'Données mises à jour : nouvelles cotes disponibles'); }
    } catch (e) { /* silencieux */ }
  }

  function startLights() {
    const el = $('#lights');
    const pods = $$('.pod', el);
    let i = 0;
    const seen = sessionStorage.getItem('pitwall:lights');
    const step = seen ? 120 : 420;
    const timer = setInterval(() => { if (i < pods.length) pods[i++].classList.add('on'); }, step);
    el.addEventListener('click', () => { clearInterval(timer); el.classList.add('out'); });
    return {
      finish: async () => {
        while (i < pods.length && !el.classList.contains('out')) await new Promise((r) => setTimeout(r, 60));
        clearInterval(timer);
        await new Promise((r) => setTimeout(r, seen ? 150 : 400 + Math.random() * 600));
        pods.forEach((p) => p.classList.remove('on'));
        $('#lightsCaption').innerHTML = '<b>Extinction des feux</b> — c\'est parti !';
        await new Promise((r) => setTimeout(r, seen ? 150 : 450));
        el.classList.add('out');
        try { sessionStorage.setItem('pitwall:lights', '1'); } catch (e) { /* */ }
      },
    };
  }

  /* =================== Routeur =================== */
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    const r = parts[0] || '';
    S.sel.clear();
    $$('[data-r]').forEach((a) => a.classList.toggle('active', a.dataset.r === (r === 'gp' ? 'calendrier' : r)));
    $('#friendsBtn').classList.toggle('active', r === 'amis');
    if (F1.car3d) F1.car3d.disposeAll();
    const app = $('#app');
    let html;
    switch (r) {
      case 'paris': html = pageBets(parts[1] || 'populaires'); break;
      case 'calendrier': html = pageCalendar(+parts[1] || null); break;
      case 'classements': html = pageStandings(); break;
      case 'gp': html = pageGP(+parts[1]); break;
      case 'mes-paris': html = pageMyBets(); break;
      case 'grille': html = pageGrid(); break;
      case 'amis': html = pageFriends(parts); break;
      case 'manager': html = pageManager(parts[1]); break;
      default: html = pageHome();
    }
    app.innerHTML = sourceNotice() + html;
    app.classList.remove('fade-in'); void app.offsetWidth; app.classList.add('fade-in');
    afterRender(r, parts);
    F1.visuals.hydrate(app);
    tick();
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0 }); });

  function afterRender(r, parts) {
    if (r === 'classements') mountChart();
    if (r === 'gp' && S.gpTab === 'quali') {
      const race = S.season.races.find((x) => x.round === +parts[1]);
      if (race && !race.qualifying) F1.data.loadQualifying(S.season, race).then((q) => { if (q) route(); });
    }
    if (r === 'mes-paris') mountBankroll();
    if (r === 'amis') mountFriends(parts);
    if (r === 'manager') mountManager(parts[1]);
  }

  function sourceNotice() {
    const src = S.season.source;
    if (src === 'live') return '';
    if (src === 'embedded') return `<div class="notice" style="margin-bottom:18px">📅 Saison ${S.season.year} : calendrier officiel et grille provisoire intégrés au site. Horaires estimés, remplacés automatiquement dès leur publication par l'API.</div>`;
    const msg = src === 'snapshot' ? 'API live injoignable : affichage du dernier instantané hebdomadaire des données.'
      : src === 'cache' ? 'API live injoignable : affichage des dernières données en cache.'
        : 'Mode hors ligne : données live indisponibles, calendrier et grille de secours affichés. Les cotes reposent sur un modèle a priori.';
    return `<div class="notice" style="margin-bottom:18px">⚠️ ${msg} <button class="btn sm ghost" data-action="reload">Réessayer</button></div>`;
  }

  /* =================== Composants =================== */
  const drv = (id) => S.season.drivers.get(id);
  const team = (id) => S.season.teams.get(id) || { short: id, color: '#888', name: id };
  const tcol = (id) => team(id).color;

  // Avatar pilote : photo libre (Wikimedia Commons) ou initiales aux couleurs de l'écurie
  function ava(id, cls = '') {
    const d = drv(id) || (S.season.upcoming && S.season.upcoming.drivers.get(id));
    if (!d) return '';
    const p = F1.visuals.portrait(id);
    const c = tcol(d.teamId);
    const ini = esc((d.given || '?')[0] + (d.family || '?')[0]);
    return `<span class="ava ${cls}" style="--tc:${c}">${p ? `<img src="${esc(p.img)}" alt="${esc(d.given + ' ' + d.family)}" loading="lazy" onerror="this.remove()">` : ''}<i>${ini}</i></span>`;
  }
  function drvCell(id, extra = '') {
    const d = drv(id); if (!d) return esc(id);
    const t = team(d.teamId);
    return `<div class="drv">${ava(id)}<div><b><span class="gv">${esc(d.given)}</span>${esc(d.family)}</b><small>${flag(d.iso, 'sm')} ${esc(t.short)}${d.tbc ? ' · à confirmer' : ''}${extra}</small></div></div>`;
  }
  function teamCell(id) {
    const t = team(id);
    return `<div class="drv"><span class="tstripe" style="background:${t.color}"></span><div><b>${esc(t.short)}</b><small>${esc(t.name)}</small></div></div>`;
  }

  function isClosed(m) { return m.closes && m.closes.getTime() <= Date.now(); }
  function reg(s, m) { const x = { ...s, closes: m ? m.closes : s.closes, season: s.season || S.season.year }; S.sel.set(x.sid, x); return x; }
  function oddBtn(s, m, { compact = false, label = null, cls = '' } = {}) {
    const x = reg(s, m);
    const on = S.slip.some((l) => l.sid === x.sid);
    const closed = m && isClosed(m);
    const color = x.teamId ? tcol(x.teamId) : 'var(--gold)';
    const lbl = label != null ? label : `${x.teamId ? `<span class="tstripe" style="background:${color}"></span>` : ''}${esc(x.label)}`;
    return `<button class="odd ${compact ? 'compact' : ''} ${on ? 'on' : ''} ${cls}" data-sid="${esc(x.sid)}" ${closed ? 'disabled' : ''} title="${esc(x.mtitle)} — ${esc(x.label)} · probabilité estimée ${pct(x.prob)}">${compact ? '' : `<span class="lbl">${lbl}</span>`}<span class="o">${fmtOdds(x.odds)}</span>${compact ? '' : `<span class="bar" style="width:${Math.min(100, x.prob * 100)}%;color:${color}"></span>`}</button>`;
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
    const side = (s) => { const d = drv(s.driverId); return `<div class="side" style="--tc:${tcol(d.teamId)}"><div class="row" style="flex-wrap:nowrap;gap:10px;margin-bottom:4px">${ava(d.id, 'md')}<div class="n">${esc(d.family)}</div></div><div class="t">${flag(d.iso, 'sm')} ${esc(team(d.teamId).short)} · ${fmt(d.points)} pts</div>${oddBtn(s, m, { label: 'Devant' })}</div>`; };
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

  /* =================== Accueil =================== */
  function pageHome() {
    const s = S.season;
    const nx = s.next;
    let h = hero(nx);
    if (s.pending) h += `<div class="notice red" style="margin-top:18px">🏁 <b>${esc(s.pending.nameFr)}</b> : course terminée ou en cours — vos paris seront réglés dès la publication des résultats officiels.</div>`;
    if (s.doneCount === 0 && nx && F1.store.canClaimSeason(s)) h += `<div class="notice" style="margin-top:18px">🎆 Nouvelle saison ${s.year} : prime de lancement <b>+${F1.store.SEASON_BONUS} jetons</b>. <span class="sp"></span><button class="btn sm gold" data-action="claim-season">Récupérer</button></div>`;
    if (s.prev && s.doneCount === 0) { const ch = [...s.prev.drivers.values()].sort((a, b) => b.points - a.points)[0]; if (ch) h += `<div class="notice" style="margin-top:18px">🏆 Saison ${s.prev.year} terminée : <b>${esc(ch.given + ' ' + ch.family)}</b> champion du monde avec ${fmt(ch.points)} points. Les cotes ${s.year} partent de la hiérarchie ${s.prev.year}.</div>`; }
    if (nx && F1.store.canClaim(s, nx)) h += `<div class="notice" style="margin-top:18px">🎁 Prime du week-end disponible : <b>+${F1.store.WEEKLY} jetons</b> pour le ${esc(nx.nameFr)}. <span class="sp"></span><button class="btn sm gold" data-action="claim">Récupérer</button></div>`;
    if (nx && F1.store.canRescue(s, nx)) h += `<div class="notice red" style="margin-top:18px">💸 Réservoir vide ? Le stand vous ravitaille : <b>+${F1.store.RESCUE} jetons</b>. <span class="sp"></span><button class="btn sm" data-action="rescue">Ravitailler</button></div>`;

    if (S.markets.length) {
      const win = S.markets.find((m) => m.kind === 'win');
      h += `<section class="section"><div class="section-h"><h2>Favoris pour la victoire</h2><a class="link" href="#/paris">Tous les marchés →</a></div><div class="grid g4">${win.selections.slice(0, 4).map((x, i) => favCard(x, win, i)).join('')}</div></section>`;
      const boost = S.markets.find((m) => m.layout === 'boost');
      const rival = S.markets.find((m) => m.kind === 'h2h' && m.h2hType === 'rival');
      const quali = S.markets.find((m) => m.kind === 'pole') || S.markets.find((m) => m.kind === 'sprintWin') || S.markets.find((m) => m.kind === 'podium');
      h += `<section class="section"><div class="section-h"><h2>À la une</h2></div><div class="grid g3">${boostCard(boost) || ''}${rival ? h2hCard(rival) : ''}${marketCard(quali, { limit: 6 })}</div></section>`;
    }
    h += `<section class="section"><div class="grid g2">${lastPodium()}${miniStandings()}</div></section>`;
    h += upcomingTeaser();
    h += homeStats();
    return h;
  }

  function hero(nx) {
    const s = S.season;
    if (!nx) {
      const champ = [...s.drivers.values()].sort((a, b) => b.points - a.points)[0];
      return `<section class="hero"><div class="hero-bg">${streaks()}<div class="grid-floor"></div><div class="big-round">${s.year}</div><div class="kerb"></div></div>
        <div class="hero-top"><span class="chip gold">🏆 Saison ${s.year} terminée</span></div>
        <h1><span class="accent">Champion du monde</span>${champ ? esc(champ.given + ' ' + champ.family) : '—'}</h1>
        <div class="hero-meta"><span>${champ ? fmt(champ.points) + ' points · ' + esc(team(champ.teamId).short) : ''}</span></div>
        <div class="hero-actions"><a class="btn" href="#/classements">Voir les classements</a><a class="btn ghost" href="#/mes-paris">Mon bilan</a></div></section>`;
    }
    const now = Date.now();
    const nextSess = nx.sessions.find((x) => x.date.getTime() > now);
    const w = S.weather;
    const wIcon = w ? (w.rain >= 50 ? '🌧️' : w.rain >= 25 ? '🌦️' : w.code <= 1 ? '☀️' : '⛅') : '';
    return `<section class="hero"><div class="hero-bg">${streaks()}<div class="grid-floor"></div><div class="big-round">R${nx.round}</div><div class="kerb"></div></div>
      <div class="hero-main"><div class="hero-top">${flag(nx.iso, 'lg')}<span class="chip red live">Prochain Grand Prix</span><span class="chip">Manche ${nx.round} / ${s.races.length}</span>${nx.sprint ? '<span class="chip gold">⚡ Week-end Sprint</span>' : ''}${nx.street ? '<span class="chip">🏙️ Circuit urbain</span>' : ''}${nx.round === 1 ? `<span class="chip green">🚦 Ouverture de la saison ${s.year}</span>` : ''}${nx.tbc ? '<span class="chip">À confirmer</span>' : ''}</div>
      <h1><span class="accent">${esc(nx.countryFr)}</span>${esc(nx.nameFr)}</h1>
      <div class="hero-meta"><span>📍 ${esc(nx.circuit)} · ${esc(nx.locality)}</span><span>🗓️ ${DAYL.format(nx.date)} · ${HM.format(nx.date)}</span>
      ${w ? `<span class="weather" title="Prévision Open-Meteo à l'heure du départ">${wIcon} ${w.temp}°C · 💧 ${w.rain} % · 💨 ${w.wind} km/h</span>` : ''}</div>
      ${countdown(nx.date.getTime())}
      <div class="weekend">${nx.sessions.map((x) => `<div class="sess ${x.date.getTime() < now ? 'done' : x === nextSess ? 'next' : ''}"><small>${esc(x.label)}</small><b>${WD.format(x.date)} ${HM.format(x.date)}</b></div>`).join('')}</div>
      <div class="hero-actions"><a class="btn" href="#/paris">🏁 Parier sur ce GP</a><a class="btn ghost" href="#/paris/tierce">Jouer le tiercé</a></div></div>${heroCar()}</section>`;
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
    return `<div class="fav" style="--tc:${t.color}"><div class="bignum">${esc(d.number)}</div>${F1.visuals.portrait(d.id) ? `<img class="fav-photo" src="${esc(F1.visuals.portrait(d.id).img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<div style="position:relative"><div class="rank">Favori n°${i + 1}</div><div class="fname">${flag(d.iso, 'sm')} ${esc(d.given)}</div><div class="lname">${esc(d.family)}</div><div class="team">${esc(t.short)} · ${fmt(d.points)} pts</div></div>
      <div>${oddBtn(x, m, { label: `<span>Victoire</span><span class="prob">${pct(x.prob)}</span>` })}</div></div>`;
  }
  function lastPodium() {
    const r = S.season.lastDone;
    if (!r) return `<div class="card"><h3>Dernier Grand Prix</h3><div class="empty"><div class="ic">🏁</div>Aucune course disputée pour l'instant.</div></div>`;
    const top = r.results.slice(0, 3);
    const step = (x, p) => { if (!x) return '<div></div>'; const d = drv(x.driverId); return `<div class="pod-step p${p}" style="--tc:${tcol(x.teamId)};--mc:${['var(--gold)', 'var(--silver)', 'var(--bronze)'][p - 1]}">${ava(d.id, 'lg')}<div class="who">${flag(d.iso, 'sm')} ${esc(d.family)}</div><div class="tm">${esc(team(x.teamId).short)}</div><div class="blk">${p}</div></div>`; };
    return `<a class="card" href="#/gp/${r.round}"><div class="market-h"><div><h3>${flag(r.iso, 'sm')} ${esc(r.nameFr)}</h3><div class="sub">Dernier Grand Prix · ${DAY.format(r.date)}</div></div><span class="chip">Résultats →</span></div>
      <div class="podium">${step(top[1], 2)}${step(top[0], 1)}${step(top[2], 3)}</div></a>`;
  }
  function miniStandings() {
    const ds = [...S.season.drivers.values()].filter((d) => S.season.entrants.includes(d.id) || d.points > 0).sort((a, b) => b.points - a.points).slice(0, 6);
    const max = ds[0] ? ds[0].points || 1 : 1;
    return `<a class="card" href="#/classements"><div class="market-h"><div><h3>Championnat pilotes</h3><div class="sub">Après ${S.season.doneCount} manche${S.season.doneCount > 1 ? 's' : ''}</div></div><span class="chip">Complet →</span></div>
      <table class="tbl" style="margin-top:10px"><tbody>${ds.map((d, i) => `<tr><td class="pos">${i + 1}</td><td>${drvCell(d.id)}</td><td style="width:35%"><div class="ptsbar"><i style="width:${(d.points / max) * 100}%;background:${tcol(d.teamId)}"></i></div></td><td class="r num"><b>${fmt(d.points)}</b></td></tr>`).join('')}</tbody></table></a>`;
  }
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
      case 'saison': h += (S.upMarkets.length ? `<div class="section-h"><h2>Saison ${S.season.upcoming.year} — paris long terme</h2><a class="link" href="#/calendrier/${S.season.upcoming.year}">Calendrier →</a></div><div class="notice" style="margin-bottom:16px">🔮 Cotes d'avant-saison basées sur la hiérarchie ${S.season.year} et la grille ${S.season.upcoming.year} (provisoire). Paris réglés après la dernière manche ${S.season.upcoming.year}.</div><div class="grid g2" style="margin-bottom:28px">${S.upMarkets.map((m) => marketCard(m)).join('')}</div><div class="section-h"><h2>Saison ${S.season.year}</h2></div>` : '') + (S.seasonMarkets.length ? `<div class="notice" style="margin-bottom:16px">🔮 Cotes issues de ${fmt(6000)} simulations de la fin de saison. Paris réglés après la dernière manche.</div><div class="grid g2">${S.seasonMarkets.map((m) => marketCard(m)).join('')}</div>` : '<div class="empty">Titres déjà attribués.</div>'); break;
      default: {
        const win = by('win')[0];
        const boost = M.find((m) => m.layout === 'boost');
        const pole = by('pole')[0], sprint = by('sprintWin')[0];
        h += `<div class="grid g2">${marketCard(win)}<div class="grid" style="align-content:start">${boost ? boostCard(boost) : ''}${pole ? marketCard(pole, { limit: 6 }) : ''}${sprint ? marketCard(sprint, { limit: 6 }) : ''}${marketCard(by('teamWin')[0], { limit: 6 })}</div></div>
          <div class="section-h" style="margin-top:28px"><h2>Duels phares</h2><a class="link" href="#/paris/duels">Tous les duels →</a></div><div class="grid g3">${by('h2h').filter((m) => m.h2hType === 'rival').slice(0, 3).map(h2hCard).join('')}</div>
          <div class="section-h" style="margin-top:28px"><h2>Spéciaux</h2><a class="link" href="#/paris/speciaux">Tous →</a></div><div class="grid g3">${M.filter((m) => m.group === 'specials').slice(1, 4).map((m) => marketCard(m)).join('')}</div>`;
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
      return `<button class="tslot filled" style="--tc:${tcol(d.teamId)}" data-action="tierce-clear" data-i="${i}" title="Retirer"><div class="pp">P${i + 1}</div>${ava(d.id, 'md')}<div class="nn">${esc(d.family)}</div><div class="muted" style="font-size:12px">${esc(team(d.teamId).short)} ✕</div></button>`;
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
    const years = [base.prev, base, base.upcoming].filter(Boolean);
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
      table = `<table class="tbl"><thead><tr><th>Pos</th><th>Écurie</th><th>Pilotes</th><th class="c">Victoires</th><th>Points</th><th class="r">Écart</th><th class="r">Titre</th></tr></thead><tbody>
        ${ts.map((t, i) => { const dl = s.entrants.filter((id) => drv(id).teamId === t.id).map((id) => drv(id).code).join(' · '); const wins = Object.entries(st).filter(([id]) => drv(id) && drv(id).teamId === t.id).reduce((a, [, o]) => a + o.wins, 0);
          return `<tr><td class="pos">${i + 1}</td><td>${teamCell(t.id)}</td><td class="muted">${esc(dl)}</td><td class="c num">${t.wins || wins}</td><td style="min-width:180px"><div class="row" style="flex-wrap:nowrap"><div class="ptsbar" style="flex:1"><i style="width:${(t.points / max) * 100}%;background:${t.color}"></i></div><b class="num">${fmt(t.points)}</b></div></td><td class="r num muted">${i ? '−' + fmt(max - t.points) : '—'}</td><td class="r">${champ.get(t.id) > 0 && !s.finished ? `<span class="chip ${champ.get(t.id) > 0.3 ? 'gold' : ''}">${pct(champ.get(t.id))}</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table>`;
    }
    return `<div class="market-head"><div><h1>Classements ${s.year}</h1><div class="muted" style="margin-top:6px">Après ${s.doneCount} manche${s.doneCount > 1 ? 's' : ''} · probabilité de titre simulée</div></div>
      <div class="row"><a class="link" href="#/grille">Grille & monoplaces →</a><div class="seg"><button class="${tab === 'drivers' ? 'on' : ''}" data-action="stand" data-t="drivers">Pilotes</button><button class="${tab === 'teams' ? 'on' : ''}" data-action="stand" data-t="teams">Constructeurs</button></div></div></div>
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
    const step = (x, p) => { if (!x) return '<div></div>'; const d = drv(x.driverId); return `<div class="pod-step p${p}" style="--tc:${tcol(x.teamId)};--mc:${['var(--gold)', 'var(--silver)', 'var(--bronze)'][p - 1]}">${ava(d.id, 'lg')}<div class="who">${flag(d.iso, 'sm')} ${esc(d.family)}</div><div class="tm">${esc(team(x.teamId).short)}</div><div class="blk">${p}</div></div>`; };
    const fl = r.results.find((x) => x.fastestRank === 1);
    const gainer = r.results.filter((x) => x.classified && x.grid > 0).sort((a, b) => (b.grid - b.pos) - (a.grid - a.pos))[0];
    const dnfs = r.results.filter((x) => !x.classified);
    const side = `<div class="grid" style="align-content:start"><div class="card"><h3>Podium</h3><div class="podium">${step(top[1], 2)}${step(top[0], 1)}${step(top[2], 3)}</div></div>
      <div class="grid g2">${fl ? `<div class="stat"><small>Meilleur tour</small><b style="font-size:18px">${esc(drv(fl.driverId).family)}</b><span class="muted num">${esc(fl.fastestTime || '')}</span></div>` : ''}
      ${gainer ? `<div class="stat"><small>Remontada</small><b style="font-size:18px">${esc(drv(gainer.driverId).family)}</b><span class="gain up">P${gainer.grid} → P${gainer.pos} (+${gainer.grid - gainer.pos})</span></div>` : ''}
      <div class="stat"><small>Classés</small><b>${r.results.length - dnfs.length} / ${r.results.length}</b></div><div class="stat"><small>Abandons</small><b>${dnfs.length}</b></div></div></div>`;
    let table;
    if (tab === 'quali') {
      if (!r.qualifying) table = '<div class="skeleton"></div>';
      else table = `<table class="tbl"><thead><tr><th>Pos</th><th>Pilote</th><th>Q1</th><th>Q2</th><th>Q3</th></tr></thead><tbody>${r.qualifying.map((q) => `<tr><td class="pos">${q.pos}</td><td>${drvCell(q.driverId)}</td><td class="num">${esc(q.q1 || '')}</td><td class="num">${esc(q.q2 || '')}</td><td class="num"><b>${esc(q.q3 || '')}</b></td></tr>`).join('')}</tbody></table>`;
    } else {
      const res = tab === 'sprint' && r.sprintResults ? r.sprintResults : r.results;
      table = `<table class="tbl"><thead><tr><th>Pos</th><th>Pilote</th><th class="c">Grille</th><th class="c">+/−</th><th class="c">Tours</th><th>Temps / statut</th><th class="r">Pts</th></tr></thead><tbody>
        ${res.map((x) => { const gd = x.grid > 0 && x.classified ? x.grid - x.pos : null; return `<tr><td class="pos">${x.classified ? x.pos : esc(x.positionText === 'R' ? 'AB' : x.positionText)}</td><td>${drvCell(x.driverId, x.fastestRank === 1 ? ' · <span style="color:#c77dff">⏱ Meilleur tour</span>' : '')}</td><td class="c num">${x.grid || 'PL'}</td><td class="c">${gd ? `<span class="gain ${gd > 0 ? 'up' : 'down'}">${gd > 0 ? '▲' : '▼'}${Math.abs(gd)}</span>` : '<span class="muted">—</span>'}</td><td class="c num">${x.laps}</td><td class="num ${x.classified ? '' : 'muted'}">${esc(x.timeText || x.status)}</td><td class="r num"><b>${x.points || ''}</b></td></tr>`; }).join('')}</tbody></table>`;
    }
    return head + tabs + `<div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px" id="gpGrid"><div class="card pad0"><div class="table-wrap">${table}</div></div>${side}</div>
      <style>@media(max-width:900px){#gpGrid{grid-template-columns:minmax(0,1fr)!important}}</style>`;
  }

  /* =================== Grille (pilotes & monoplaces) =================== */
  function pageGrid() {
    const s = S.season;
    const st = seasonStats();
    const teams = [...s.teams.values()].filter((t) => s.entrants.some((id) => drv(id).teamId === t.id)).sort((a, b) => b.points - a.points || a.position - b.position);
    const win = S.markets.find((m) => m.kind === 'win');
    const wp = win ? Object.fromEntries(win.selections.map((x) => [x.driverId, x])) : {};
    const card = (id) => {
      const d = drv(id); const o = st[d.id] || {}; const p = F1.visuals.portrait(d.id);
      return `<div class="gdrv" style="--tc:${tcol(d.teamId)}"><div class="gnum">${esc(d.number)}</div>
        <div class="gphoto">${p ? `<img src="${esc(p.img)}" alt="${esc(d.given + ' ' + d.family)}" loading="lazy" onerror="this.remove()">` : ''}<i>${esc(d.code)}</i></div>
        <div class="ginfo"><div class="fname">${flag(d.iso, 'sm')} ${esc(d.given)}</div><div class="lname">${esc(d.family)}</div>${d.tbc ? '<span class="chip" style="margin-top:4px">À confirmer</span>' : ''}
        <div class="gstats"><span><b>${fmt(d.points)}</b> pts</span><span><b>${o.wins || 0}</b> vict.</span><span><b>${o.podiums || 0}</b> podiums</span><span><b>P${d.position < 99 ? d.position : '—'}</b></span></div>
        ${wp[d.id] ? oddBtn(wp[d.id], win, { label: `<span>Victoire ${esc(s.next ? s.next.nameFr.replace('Grand Prix', 'GP') : '')}</span>` }) : ''}</div></div>`;
    };
    return `<div class="market-head"><div><h1>Grille ${s.year}</h1><div class="muted" style="margin-top:6px">${teams.length} écuries · ${s.entrants.length} pilotes · cliquez une cote pour parier</div></div></div>
      <div class="grid g2">${teams.map((t, i) => {
        const ds = s.entrants.filter((id) => drv(id).teamId === t.id);
        return `<div class="gteam" style="--tc:${t.color}"><div class="gteam-h"><div><div class="rank">P${i + 1} constructeurs · ${fmt(t.points)} pts</div><h3>${esc(t.short)}</h3><div class="sub">${esc(t.name)}</div></div></div>
          <div class="gcar">${F1.visuals.car(t.id, { view: '34', number: drv(ds[0]).number })}</div>
          <div class="gdrivers">${ds.map(card).join('')}</div></div>`;
      }).join('')}</div>`;
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
  function uava(p, cls = '') {
    const c = p.team ? tcol(p.team) : 'var(--red)';
    return `<span class="ava ${cls}" style="--tc:${c}"><i>${esc((p.username || '?').slice(0, 2).toUpperCase())}</i></span>`;
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
  async function socialAct(fn, okMsg) {
    try { await fn(); if (okMsg) toast('✅', okMsg, 'win'); } catch (e) { toast('⚠️', esc(e.message), 'err'); }
    if (/^#\/amis/.test(location.hash)) { route(); }
  }

  /* =================== Mode manager =================== */
  const MG = () => F1.manager;
  const pcoin = '<span class="coin sm pcoin">P</span>';
  const fmtPC = (n) => `${pcoin}${fmt(Math.round(n))}`;
  function mgrRace() { const s = S.season; return s.next || s.pending || s.lastDone || s.races[0]; }
  function mgrCtx() {
    const m = F1.store.mgr();
    const mk = S.mk || (S.mk = MG().market(S.season));
    const race = mgrRace();
    const w = MG().circuitProfile(race);
    const drvM = m.driver ? mk.byDriver.get(m.driver.id) || null : null;
    const ch = m.chassis ? mk.byChassis.get(m.chassis.id) || null : null;
    const car = ch ? MG().carStats(ch, m.ups, m.parts) : null;
    const league = MG().leagueOf(m.lp);
    const bots = MG().botField(mk, league, `${F1.store.dayKey()}-${race ? race.round : 0}`);
    return { m, mk, race, w, drvM, ch, car, league, bots };
  }
  // Position moyenne attendue : 150 courses simulées contre le plateau IA du jour (mêmes graines -> stable)
  function expectedPos(ctx, setup) {
    const player = { name: 'x', driver: ctx.drvM, car: ctx.car, setup };
    let sum = 0, wins = 0, pod = 0; const N = 150;
    for (let k = 0; k < N; k++) {
      const me = MG().simulate({ player, bots: ctx.bots, race: ctx.race, seed: 1000 + k * 7919 }).final.find((x) => x.i === 0);
      sum += me.pos; if (me.pos === 1 && !me.out) wins++; if (me.pos <= 3 && !me.out) pod++;
    }
    return { avg: Math.round((sum / N) * 10) / 10, win: wins / N, pod: pod / N };
  }
  const expTxt = (e) => `P${fmt(e.avg, 1)}`;
  const expSub = (e) => `en moyenne · victoire ${pct(e.win)} · podium ${pct(e.pod)}`;
  const statBar = (label, val, base, color, icon = '') => `<div class="sbar"><div class="sbar-h"><span>${icon} ${label}</span><b class="num">${Math.round(val)}</b></div><div class="sbar-t"><i style="width:${Math.min(100, base)}%;background:${color}"></i><i class="up" style="width:${Math.max(0, Math.min(100, val) - Math.min(100, base))}%"></i></div></div>`;
  const leagueBadge = (L, cls = '') => `<span class="lbadge ${cls}" style="--lc:${L.color}">${L.icon} ${L.name}</span>`;
  const resaleD = (ctx) => (ctx.m.driver ? Math.round(((ctx.drvM ? ctx.drvM.price : ctx.m.driver.price) * 0.7) / 5) * 5 : 0);
  const resaleC = (ctx) => (ctx.m.chassis ? Math.round(((ctx.ch ? ctx.ch.price : ctx.m.chassis.price) * 0.7 + ctx.m.rdSpent * 0.5) / 5) * 5 : 0);

  const MTABS = [['ecurie', '🏎️ Mon écurie'], ['pilotes', '👤 Pilotes'], ['chassis', '🔩 Châssis'], ['rd', '🔬 R&D'], ['ligues', '🏆 Ligues']];
  function pageManager(tab) {
    tab = tab || 'ecurie';
    const ctx = mgrCtx();
    const { m, league } = ctx;
    const nl = MG().nextLeague(m.lp);
    let h = `<div class="market-head"><div><div class="row" style="margin-bottom:8px">${leagueBadge(league)}<span class="chip">${fmt(m.lp)} LP</span></div><h1>Mode manager</h1>
      <div class="muted" style="margin-top:6px">Recrutez un pilote, achetez un châssis, développez la voiture et grimpez les ligues.</div></div>
      <div class="pc-big"><small>Vos PitCoins</small><b>${fmtPC(m.pc)}</b></div></div>
      <div class="tabs">${MTABS.map(([k, l]) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/manager/${k}">${l}</a>`).join('')}</div><div class="section" style="margin-top:20px">`;
    if (tab === 'pilotes') h += mgrDrivers(ctx);
    else if (tab === 'chassis') h += mgrChassis(ctx);
    else if (tab === 'rd') h += mgrRD(ctx);
    else if (tab === 'ligues') h += mgrLeagues(ctx, nl);
    else h += mgrHome(ctx, nl);
    return h + '</div>';
  }

  function mgrHome(ctx, nl) {
    const { m, drvM, ch, car, race, w, league } = ctx;
    if (!drvM || !ch) {
      const step = (ok, n, title, txt, href, cta) => `<div class="card mstep ${ok ? 'ok' : ''}"><div class="mnum">${ok ? '✓' : n}</div><h3>${title}</h3><div class="sub">${txt}</div>${ok ? '' : `<a class="btn sm" style="margin-top:14px" href="${href}">${cta}</a>`}</div>`;
      return `<div class="card mintro"><div style="font-size:42px">🏗️</div><h3 style="font-size:22px">Montez votre écurie</h3>
        <p class="muted">Vous démarrez avec <b>${fmtPC(MG().START_PC)}</b> mais sans pilote ni voiture. Les meilleurs pilotes et châssis coûtent cher : à vous de trouver le bon compromis, puis de développer la voiture.</p>
        <p class="muted" style="font-size:14px">💡 Gagnez des PitCoins en <b>réussissant vos paris</b> (chaque pari gagné rapporte) et en <b>courant</b> en mode manager.</p></div>
        <div class="grid g3" style="margin-top:16px">${step(!!drvM, 1, 'Recruter un pilote', drvM ? drvM.name : 'De 35 PC (rookies) à 180 PC (les cracks).', '#/manager/pilotes', 'Voir le marché')}
        ${step(!!ch, 2, 'Acheter un châssis', ch ? ch.name : 'De 60 PC à 250 PC selon le niveau de l\'écurie.', '#/manager/chassis', 'Voir les châssis')}
        ${step(false, 3, 'Courir !', `${MG().RACES_PER_DAY} courses simulées par jour, sur le circuit du prochain Grand Prix.`, '#', '')}</div>`;
    }
    const exp = expectedPos(ctx, m.setup);
    const best = MG().bestSetup(car, w);
    const left = F1.store.racesLeft();
    const prog = nl ? ((m.lp - league.min) / (nl.min - league.min)) * 100 : 100;
    const p = F1.visuals.portrait(drvM.id);
    const L = F1.visuals.livery(ch.id);
    const setupLbl = (v) => (v <= -0.35 ? 'Faible appui (vitesse)' : v >= 0.35 ? 'Fort appui (virages)' : 'Réglage médian');
    return `<div class="garage" style="--tc:${L.body}">
        <div class="garage-car">${F1.visuals.car(ch.id, { live: true, number: drvM.number })}<div class="stage-hint" style="text-align:center">⟲ Faites pivoter votre monoplace</div></div>
        <div class="garage-info">
          <div class="row" style="flex-wrap:nowrap"><div class="gphoto" style="--tc:${tcol(drvM.teamId)};width:74px;height:74px">${p ? `<img src="${esc(p.img)}" alt="" onerror="this.remove()">` : ''}<i>${esc(drvM.code)}</i></div>
          <div><div class="muted upper" style="font-size:11px;font-weight:700">Votre pilote</div><div class="lname" style="font-size:24px;font-weight:900;font-style:italic;text-transform:uppercase">${esc(drvM.family)}</div><div class="muted" style="font-size:13px">Note ${drvM.rating} · châssis ${esc(ch.name)}</div></div>
          <div class="sp"></div><div class="rating-big">${drvM.rating}</div></div>
          <div class="grid g2" style="margin-top:14px;gap:10px 18px">
            ${MG().STATS.map((st) => statBar(st.short, car[st.k], ch[st.k], F1.teamColor(ch.id), st.icon)).join('')}
            ${statBar('Pilote', drvM.rating, drvM.rating, 'var(--gold)', '👤')}
          </div></div></div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="market-h"><div><h3>${flag(race.iso, 'sm')} ${esc(race.nameFr)}</h3><div class="sub">Circuit des courses manager · ${esc(w.kind)}</div></div></div>
          <div class="cprof">${[['⚡ Vitesse', w.speed], ['🌀 Appui', w.df], ['🔧 Fiabilité', w.rel]].map(([l, v]) => `<div><small>${l}</small><div class="sbar-t"><i style="width:${v * 100 / 0.7}%;background:var(--red2)"></i></div><b>${Math.round(v * 100)} %</b></div>`).join('')}</div>
          <div class="notice" style="margin-top:12px;font-size:13px">💡 ${esc(w.tip)}</div>
          <div style="margin-top:16px"><div class="row" style="justify-content:space-between"><b style="font-size:14px">Réglage aéro du week-end</b><span class="chip" id="setupLbl">${setupLbl(m.setup)}</span></div>
            <input type="range" id="setupIn" min="-1" max="1" step="0.05" value="${m.setup}" class="slider">
            <div class="row" style="justify-content:space-between;font-size:12px" class="muted"><span class="muted">⚡ Faible appui</span><span class="muted">🌀 Fort appui</span></div></div>
          <div class="grid g2" style="margin-top:14px;gap:10px"><div class="stat"><small>Indice voiture</small><b id="cIdx">${MG().compat(car, w, m.setup)}</b></div><div class="stat"><small>Position estimée</small><b id="cPos">${expTxt(exp)}</b><span class="muted" style="font-size:12px" id="cPosSub">${expSub(exp)}</span></div></div>
          ${Math.abs(best - m.setup) > 0.25 ? '<div class="muted" style="font-size:12px;margin-top:8px" id="setupHint">Votre réglage n\'est pas optimal pour ce circuit : testez l\'autre sens du curseur.</div>' : '<div class="muted" style="font-size:12px;margin-top:8px" id="setupHint">👌 Réglage adapté à ce circuit.</div>'}
        </div>
        <div class="card league-card" style="--lc:${league.color}"><div class="market-h"><div><h3>Ligue ${esc(league.name)}</h3><div class="sub">Gains ×${league.mult} · plateau de ${MG().FIELD - 1} managers IA</div></div>${leagueBadge(league, 'lg')}</div>
          <div style="margin-top:14px"><div class="row" style="justify-content:space-between;font-size:13px"><span>${fmt(m.lp)} LP</span><span class="muted">${nl ? `${nl.icon} ${nl.name} à ${nl.min} LP` : 'Sommet atteint !'}</span></div><div class="ptsbar" style="height:10px;margin-top:6px"><i style="width:${prog}%;background:linear-gradient(90deg,var(--lc),#fff)"></i></div></div>
          <div class="grid g2" style="margin-top:14px;gap:10px"><div class="stat"><small>Courses aujourd'hui</small><b>${left} / ${MG().RACES_PER_DAY}</b></div><div class="stat"><small>Victoire</small><b>${fmtPC(MG().PC_TABLE[0] * league.mult)}</b><span class="muted" style="font-size:12px">+${MG().LP_TABLE[0]} LP</span></div></div>
          <button class="btn block" style="margin-top:16px;font-size:16px;padding:16px" data-action="m-race" ${left > 0 ? '' : 'disabled'}>${left > 0 ? '🚦 Lancer une course' : '⏳ Revenez demain'}</button>
          <div class="muted" style="font-size:12px;margin-top:8px;text-align:center">${left > 0 ? 'Résultat : niveau du pilote + voiture × compatibilité du circuit + aléa (incidents, voiture de sécurité…)' : `Limite de ${MG().RACES_PER_DAY} courses par jour atteinte.`}</div></div>
      </div>
      ${m.races.length ? `<section class="section"><div class="section-h"><h2>Dernières courses</h2></div><div class="card pad0"><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Circuit</th><th>Ligue</th><th class="c">Départ</th><th class="c">Arrivée</th><th class="r">LP</th><th class="r">PitCoins</th></tr></thead><tbody>
        ${m.races.slice(0, 10).map((r) => `<tr><td class="muted">${DTF.format(new Date(r.t))}</td><td>${esc(r.gp || '')}</td><td>${esc(r.league || '')}</td><td class="c num">P${r.grid || '—'}</td><td class="c"><b>${r.dnf ? 'AB' : 'P' + r.pos}</b></td><td class="r"><span class="gain ${r.lp >= 0 ? 'up' : 'down'}">${r.lp >= 0 ? '+' : ''}${r.lp}</span></td><td class="r num">+${r.pc}</td></tr>`).join('')}</tbody></table></div></div></section>` : ''}`;
  }

  function mgrDrivers(ctx) {
    const { m, mk } = ctx;
    const res = resaleD(ctx);
    return `<div class="notice" style="margin-bottom:16px">💰 Notes et prix recalculés chaque semaine selon la forme réelle des pilotes. ${m.driver ? `Revendre <b>${esc(m.driver.name)}</b> vous rapporte ${fmtPC(res)} (70 % de sa valeur).` : ''}</div>
      <div class="mgrid">${mk.drivers.map((d) => {
        const own = m.driver && m.driver.id === d.id;
        const net = d.price - (own ? 0 : res);
        const p = F1.visuals.portrait(d.id);
        return `<div class="mcard ${own ? 'own' : ''}" style="--tc:${tcol(d.teamId)}"><div class="row" style="flex-wrap:nowrap;align-items:start">
          <div class="gphoto" style="width:64px;height:64px">${p ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<i>${esc(d.code)}</i></div>
          <div style="min-width:0;flex:1"><div class="muted" style="font-size:12px">${flag(d.iso, 'sm')} ${esc(team(d.teamId).short)}</div><div style="font-weight:900;font-style:italic;text-transform:uppercase;font-size:17px;line-height:1.1">${esc(d.family)}</div>
          <div class="row" style="gap:4px;margin-top:4px">${d.rookie ? '<span class="chip gold">Rookie</span>' : ''}${own ? '<span class="chip green">Votre pilote</span>' : ''}</div></div>
          <div class="rating-big sm">${d.rating}</div></div>
          <div style="display:grid;gap:6px;margin:12px 0">${statBar('Rythme', d.pace, d.pace, tcol(d.teamId))}${statBar('Combativité', d.craft, d.craft, tcol(d.teamId))}${statBar('Régularité', d.cons, d.cons, tcol(d.teamId))}</div>
          <div class="row" style="justify-content:space-between"><b style="font-size:18px">${fmtPC(d.price)}</b>${own ? '' : `<button class="btn sm" data-action="m-buy-d" data-id="${esc(d.id)}" ${net > m.pc + 1e-9 ? 'disabled' : ''}>${m.driver ? `Transfert (${net >= 0 ? '−' : '+'}${Math.abs(net)})` : 'Recruter'}</button>`}</div></div>`;
      }).join('')}</div>`;
  }

  function mgrChassis(ctx) {
    const { m, mk, w } = ctx;
    const res = resaleC(ctx);
    return `<div class="notice" style="margin-bottom:16px">🔩 Chaque écurie a son profil (vitesse, appui, fiabilité). Changer de châssis <b>remet la R&D à zéro</b>. ${m.chassis ? `Revente actuelle : ${fmtPC(res)} (70 % du châssis + 50 % de la R&D investie).` : ''}</div>
      <div class="mgrid wide">${mk.chassis.map((c) => {
        const own = m.chassis && m.chassis.id === c.id;
        const net = c.price - (own ? 0 : res);
        const idx = MG().compat(c, w, MG().bestSetup(c, w));
        return `<div class="mcard ${own ? 'own' : ''}" style="--tc:${F1.teamColor(c.id)}"><div class="row" style="justify-content:space-between"><div><div style="font-weight:900;font-style:italic;text-transform:uppercase;font-size:20px">${esc(c.name)}</div><div class="muted" style="font-size:12px">Indice au prochain GP : <b>${idx}</b></div></div>${own ? '<span class="chip green">Votre châssis</span>' : ''}</div>
          <div style="margin:4px -6px">${F1.visuals.car(c.id, { view: '34', shadow: false })}</div>
          <div style="display:grid;gap:6px;margin-bottom:12px">${MG().STATS.map((st) => statBar(st.short, c[st.k], c[st.k], F1.teamColor(c.id), st.icon)).join('')}</div>
          <div class="row" style="justify-content:space-between"><b style="font-size:18px">${fmtPC(c.price)}</b>${own ? '' : `<button class="btn sm" data-action="m-buy-c" data-id="${esc(c.id)}" ${net > m.pc + 1e-9 ? 'disabled' : ''}>${m.chassis ? `Changer (${net >= 0 ? '−' : '+'}${Math.abs(net)})` : 'Acheter'}</button>`}</div></div>`;
      }).join('')}</div>`;
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
    hydraulic: '<path d="M14 30 H50 C60 30 60 46 50 46 H30 C20 46 20 58 30 58 H66"/><circle cx="14" cy="30" r="5"/><circle cx="66" cy="58" r="5"/>',
  };
  const rdIcon = (k, col) => `<svg viewBox="0 0 80 70" class="rd-ico" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${RD_ICON[k] || RD_ICON.chip}</svg>`;
  const FX_LBL = { speed: '⚡ Vitesse', df: '🌀 Appui', rel: '🔧 Fiabilité' };

  function mgrRD(ctx) {
    const { m, ch, car, w, race, league, bots } = ctx;
    if (!ch) return `<div class="empty"><div class="ic">🔬</div>Achetez d'abord un châssis pour lancer la R&D.<div style="margin-top:14px"><a class="btn" href="#/manager/chassis">Voir les châssis</a></div></div>`;
    const cats = MG().RD_CATS;
    const cat = cats.find((c) => c.id === S.rdCat) || cats[0];
    S.rdCat = cat.id;
    const owned = m.parts || {};
    const all = MG().RD_PARTS;
    const done = all.filter((p) => owned[p.id]).length;
    let sel = S.rdSel && MG().RD_BY_ID.get(S.rdSel);
    if (sel && sel.cat !== cat.id) sel = null;
    // pièce conseillée pour le prochain GP : meilleur gain d'indice par PitCoin parmi les pièces disponibles
    const gainOf = (p) => { const nc = { ...car }; for (const k in p.fx) nc[k] += p.fx[k]; return MG().compat(nc, w, m.setup) - MG().compat(car, w, m.setup); };
    const avail = all.filter((p) => MG().partState(p, owned) === 'available');
    const reco = avail.sort((a, b) => gainOf(b) / b.cost - gainOf(a) / a.cost)[0];
    const botAvg = (k) => bots.reduce((a, b) => a + b.car[k], 0) / bots.length;
    const legacy = (m.ups.speed || 0) + (m.ups.df || 0) + (m.ups.rel || 0);

    const tabs = cats.map((c) => {
      const n = all.filter((p) => p.cat === c.id), d = n.filter((p) => owned[p.id]).length;
      return `<button class="rd-tab ${c.id === cat.id ? 'on' : ''}" data-action="rd-cat" data-c="${c.id}" style="--cc:${c.color}"><span>${c.icon}</span>${esc(c.name)}<small>${d}/${n.length}</small></button>`;
    }).join('');
    const rows = MG().rdBranches(cat.id).map((br) => {
      const list = all.filter((p) => p.cat === cat.id && p.br === br);
      const nd = list.filter((p) => owned[p.id]).length;
      const cards = list.map((p) => {
        const st = MG().partState(p, owned);
        const unknown = st === 'unknown';
        const can = st === 'available' && p.cost <= m.pc + 1e-9;
        return `<button class="rd-card ${st} ${sel && sel.id === p.id ? 'sel' : ''} ${reco && reco.id === p.id ? 'reco' : ''}" data-action="rd-sel" data-p="${p.id}" style="--cc:${cat.color}">
          ${st === 'done' ? '<span class="rd-badge ok">✓</span>' : st === 'locked' ? '<span class="rd-badge">🔒</span>' : reco && reco.id === p.id ? '<span class="rd-badge reco">Conseillé</span>' : ''}
          <div class="rd-art">${unknown ? '<div class="rd-q">?</div>' : rdIcon(p.icon, st === 'done' ? '#cfe9ff' : st === 'available' ? '#ffffff' : 'rgba(255,255,255,.45)')}</div>
          <div class="rd-name">${unknown ? 'Amélioration inconnue' : esc(p.name)}</div>
          <div class="rd-cat">${cat.icon} ${esc(cat.name)}</div>
          <div class="rd-foot">${st === 'done' ? '<span class="muted">Terminé</span>' : unknown ? '<span class="muted">—</span>' : `<b class="${can ? '' : 'muted'}">${pcoin}${p.cost}</b>`}</div></button>`;
      }).join('<span class="rd-link"></span>');
      return `<div class="rd-row"><div class="rd-branch"><b>${esc(br)}</b><small>${nd}/${list.length}</small></div><div class="rd-cards">${cards}</div></div>`;
    }).join('');

    let detail;
    if (sel) {
      const st = MG().partState(sel, owned);
      const g = gainOf(sel);
      detail = `<div class="rd-detail" style="--cc:${cat.color}"><div class="row" style="flex-wrap:nowrap;align-items:start"><div class="rd-art sm">${rdIcon(sel.icon, '#fff')}</div>
          <div style="flex:1;min-width:0"><div class="muted upper" style="font-size:11px;font-weight:700">${cat.icon} ${esc(cat.name)} · ${esc(sel.br)}</div><h3 style="font-size:20px;margin:2px 0 6px">${st === 'unknown' ? 'Amélioration inconnue' : esc(sel.name)}</h3>
          <div class="muted" style="font-size:14px">${st === 'unknown' ? 'Développez les pièces précédentes de cette branche pour la découvrir.' : esc(sel.desc)}</div></div>
          <button class="rd-close" data-action="rd-sel" data-p="" aria-label="Vue d'ensemble">✕</button></div>
        ${st === 'unknown' ? '' : `<div class="row" style="margin-top:12px;gap:8px">${Object.entries(sel.fx).map(([k, v]) => `<span class="chip green">${FX_LBL[k]} +${v}</span>`).join('')}<span class="chip ${g > 0 ? 'gold' : ''}">Indice au ${esc(race.nameFr.replace('Grand Prix', 'GP'))} : +${g}</span></div>
        <div class="row" style="margin-top:14px">${st === 'done' ? '<span class="chip green">✓ Pièce installée sur votre monoplace</span>' : st === 'available' ? `<button class="btn" data-action="rd-buy" data-p="${sel.id}" ${sel.cost > m.pc + 1e-9 ? 'disabled' : ''}>🔬 Développer · ${sel.cost} PC</button>${sel.cost > m.pc + 1e-9 ? `<span class="muted" style="font-size:13px">Il vous manque ${Math.ceil(sel.cost - m.pc)} PitCoins</span>` : ''}` : '<span class="chip">🔒 Développez d\'abord la pièce précédente</span>'}</div>`}</div>`;
    } else {
      detail = `<div class="rd-detail"><h3 style="margin:0 0 6px">Sélectionnez une pièce à rechercher</h3><div class="muted" style="font-size:14px">La caméra zoome sur la pièce choisie. Prochain GP : <b style="color:var(--text)">${esc(race.nameFr)}</b> (${esc(w.kind.toLowerCase())}).${reco ? ` Pièce conseillée : <b style="color:var(--text)">${esc(reco.name)}</b>.` : ''}</div></div>`;
    }
    const cmp = MG().STATS.map((st) => `<div class="cmp-row"><span>${st.icon} ${st.short}</span><div class="cmp-bars"><i class="me" style="width:${Math.min(100, car[st.k])}%"></i><i class="bot" style="width:${Math.min(100, botAvg(st.k))}%"></i></div><b class="num">${Math.round(car[st.k])}<small class="muted"> / ${Math.round(botAvg(st.k))}</small></b></div>`).join('');
    const carHtml = F1.visuals.car(ch.id, { live: true, view: '34' }).replace('class="car3d', `data-focus='${sel && MG().partState(sel, owned) !== 'unknown' ? JSON.stringify(sel.focus) : ''}' class="car3d`).replace("data-focus='' ", '');

    return `<div class="rd-head"><div><h2 class="rd-title">Recherche</h2><div class="rd-tabs" id="rdTabs">${tabs}</div></div>
        <div class="rd-kpis" id="rdKpis"><div><small>Améliorations</small><b>${done}/${all.length}</b></div><div><small>R&D investie</small><b>${fmtPC(m.rdSpent)}</b></div><div><small>PitCoins</small><b>${fmtPC(m.pc)}</b></div></div></div>
      <div class="rd-stage" style="--cc:${cat.color}"><div class="stage-glow" style="--tc:${cat.color}"></div>${carHtml}
        <div class="rd-stage-cap" id="rdCap">${sel && MG().partState(sel, owned) !== 'unknown' ? `<span class="pulse-dot"></span><b>${esc(sel.name)}</b>` : `<span class="muted">⟲ Faites pivoter votre ${esc(ch.name)} · sélectionnez une pièce pour zoomer</span>`}</div></div>
      <div id="rdDetail">${detail}</div>
      <div class="rd-tree" id="rdTree">${rows}</div>
      <div class="grid g2" style="margin-top:16px" id="rdBottom"><div class="card"><h3>Comparaison des performances</h3><div class="sub">Votre voiture (couleur) face à la moyenne des managers de la ligue ${esc(league.name)} (gris)</div><div style="margin-top:12px;display:grid;gap:10px">${cmp}</div></div>
        <div class="card"><h3>Votre monoplace</h3><div class="sub">Châssis ${esc(ch.name)} + pièces développées${legacy ? ` + ${legacy} niveaux de l'ancienne R&D` : ''}</div><div style="margin-top:12px;display:grid;gap:8px">${MG().STATS.map((st) => statBar(st.short, car[st.k], ch[st.k], F1.teamColor(ch.id), st.icon)).join('')}</div></div></div>`;
  }

  // Mise à jour partielle de la page R&D (sans recharger la voiture 3D) puis zoom sur la pièce
  function rdRefresh() {
    const tmp = document.createElement('div');
    tmp.innerHTML = mgrRD(mgrCtx());
    for (const id of ['rdTabs', 'rdKpis', 'rdCap', 'rdDetail', 'rdTree', 'rdBottom']) { const a = $('#' + id), b = tmp.querySelector('#' + id); if (a && b) a.innerHTML = b.innerHTML; }
    const st = $('.rd-stage'); const nst = tmp.querySelector('.rd-stage'); if (st && nst) st.style.cssText = nst.style.cssText;
    const el = $('.rd-stage .car3d');
    const p = S.rdSel && MG().RD_BY_ID.get(S.rdSel);
    const f = p && MG().partState(p, F1.store.mgr().parts) !== 'unknown' ? p.focus : null;
    if (el) { el.dataset.focus = f ? JSON.stringify(f) : ''; if (el.__car3d) el.__car3d.focus(f); }
    const pc = $('.pc-big b'); if (pc) pc.innerHTML = fmtPC(F1.store.mgr().pc);
  }

  function mgrLeagues(ctx, nl) {
    const { m, league } = ctx;
    const ladder = MG().LEAGUES.map((L) => `<div class="lrow ${L === league ? 'cur' : ''} ${m.lp >= L.min ? 'reached' : ''}" style="--lc:${L.color}"><span class="lic">${L.icon}</span><div style="flex:1"><b>${L.name}</b><small>dès ${L.min} LP · gains ×${L.mult} · adversaires ${['débutants', 'confirmés', 'solides', 'experts', 'élite', 'légendaires'][MG().LEAGUES.indexOf(L)]}</small></div>${L === league ? '<span class="chip">Vous êtes ici</span>' : ''}</div>`).reverse().join('');
    const table = `<table class="tbl" style="font-size:13px"><thead><tr><th>Position</th>${[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((p) => `<th class="c">P${p}</th>`).join('')}<th class="c">AB</th></tr></thead><tbody>
      <tr><td>LP</td>${[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((p) => `<td class="c"><span class="gain ${MG().LP_TABLE[p - 1] >= 0 ? 'up' : 'down'}">${MG().LP_TABLE[p - 1] > 0 ? '+' : ''}${MG().LP_TABLE[p - 1]}</span></td>`).join('')}<td class="c"><span class="gain down">−8</span></td></tr>
      <tr><td>PitCoins</td>${[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((p) => `<td class="c num">${Math.round(MG().PC_TABLE[p - 1] * league.mult)}</td>`).join('')}<td class="c num">${Math.round(league.mult)}</td></tr></tbody></table>`;
    return `<div class="grid g2"><div class="card"><h3>Échelle des ligues</h3><div class="sub">Vos points de ligue (LP) montent ou descendent à chaque course. Passez un palier pour être promu : les gains augmentent, les adversaires aussi.</div><div class="ladder">${ladder}</div></div>
      <div class="grid" style="align-content:start"><div class="card"><h3>Barème (ligue ${esc(league.name)})</h3><div class="table-wrap" style="margin-top:8px">${table}</div><div class="muted" style="font-size:12px;margin-top:8px">Record personnel : ${fmt(m.best)} LP. Les PitCoins gagnés aux paris s'ajoutent en plus.</div></div>
      <div class="card"><h3>🌍 Classement des managers</h3><div id="mgrBoard" class="plist"><div class="skeleton" style="height:60px"></div></div></div></div></div>`;
  }
  function mountManager(tab) {
    const si = $('#setupIn');
    if (si) si.addEventListener('input', () => {
      const ctx = mgrCtx(); const v = +si.value;
      $('#cIdx').textContent = MG().compat(ctx.car, ctx.w, v);
      const e = expectedPos(ctx, v); $('#cPos').textContent = expTxt(e); $('#cPosSub').textContent = expSub(e);
      $('#setupLbl').textContent = v <= -0.35 ? 'Faible appui (vitesse)' : v >= 0.35 ? 'Fort appui (virages)' : 'Réglage médian';
      $('#setupHint').innerHTML = Math.abs(MG().bestSetup(ctx.car, ctx.w) - v) > 0.25 ? 'Votre réglage n\'est pas optimal pour ce circuit : testez l\'autre sens du curseur.' : '👌 Réglage adapté à ce circuit.';
    });
    if (si) si.addEventListener('change', () => F1.store.setSetup(+si.value));
    const board = $('#mgrBoard');
    if (board) {
      const me = F1.store.mgr();
      const local = () => `<div class="muted" style="font-size:13px">${F1.social.state.enabled ? 'Classement mondial indisponible pour le moment.' : 'Activez le système d\'amis (Supabase) pour voir le classement mondial.'}</div>`;
      if (!F1.social.state.ready || !F1.social.leaderboard) { board.innerHTML = local(); return; }
      F1.social.leaderboard().then((rows) => {
        if (!rows) { board.innerHTML = local() + '<div class="muted" style="font-size:12px;margin-top:6px">(Le propriétaire du site doit exécuter <code>supabase/migration-manager.sql</code>.)</div>'; return; }
        board.innerHTML = rows.length ? rows.map((p, i) => { const L = MG().leagueOf(p.lp || 0); const isMe = F1.social.state.me && p.id === F1.social.state.me.id; return `<div class="prow ${isMe ? 'me' : ''}"><b class="num" style="width:26px">${i + 1}</b>${uava(p, '')}<div class="pinfo"><b>${esc(p.username)}${isMe ? ' (vous)' : ''}</b><small>${L.icon} ${L.name}</small></div><b class="num">${fmt(p.lp || 0)} LP</b></div>`; }).join('') : '<div class="muted">Aucun manager classé pour l\'instant.</div>';
      }).catch(() => { board.innerHTML = local(); });
      void me;
    }
  }

  /* ---------- Course animée ---------- */
  let raceTimer = null;
  function startRace() {
    const ctx = mgrCtx();
    if (!ctx.drvM || !ctx.car) return;
    if (F1.store.racesLeft() <= 0) return toast('⏳', 'Plus de course disponible aujourd\'hui', 'err');
    const meName = (F1.social.state.me && F1.social.state.me.username) || F1.store.get().name || 'Mon écurie';
    const player = { name: meName, driver: ctx.drvM, car: ctx.car, setup: ctx.m.setup, chassisId: ctx.ch.id };
    const seed = MG().hash(`${Date.now()}-${Math.random()}`);
    const res = MG().simulate({ player, bots: ctx.bots, race: ctx.race, seed });
    const meF = res.final.find((x) => x.i === 0);
    const meField = res.field.find((x) => x.c.me);
    const rw = MG().rewards(meF.pos, meF.out, ctx.league);
    const leagueBefore = ctx.league;
    // le résultat est enregistré tout de suite (fermer la fenêtre ne permet pas d'annuler une course)
    F1.store.recordRace({ pos: meF.pos, dnf: meF.out, grid: meField.grid, lp: rw.lp, pc: rw.pc, gp: ctx.race.nameFr.replace('Grand Prix', 'GP'), league: leagueBefore.name, driver: ctx.drvM.family, chassis: ctx.ch.name });
    F1.social.sync(true);
    showRace(res, ctx, rw, leagueBefore);
  }
  function showRace(res, ctx, rw, leagueBefore) {
    const byI = new Map(res.field.map((x) => [x.i, x]));
    const ROW = 30;
    const tower = res.field.map((x) => {
      const col = F1.teamColor(x.c.chassisId || (ctx.ch && ctx.ch.id));
      return `<div class="trow ${x.c.me ? 'me' : ''}" data-i="${x.i}" style="transform:translateY(${(x.grid - 1) * ROW}px)"><b class="tp">${x.grid}</b><span class="tstripe" style="background:${col};height:16px"></span><span class="tn">${esc(x.c.me ? x.name : x.name)}</span><span class="tc">${esc(x.driver.code)}</span><span class="tg num">—</span></div>`;
    }).join('');
    $('#modal').innerHTML = `<div class="modal race-modal"><div class="modal-box race-box">
      <div class="race-h"><div><div class="muted upper" style="font-size:11px;font-weight:700">${leagueBadge(leagueBefore)} · ${esc(ctx.race.nameFr)}</div><div class="race-lap">Tour <b id="lapN">0</b> / ${MG().LAPS}</div></div><button class="btn sm ghost" data-action="m-skip">Passer ⏭</button></div>
      <div id="raceEnd"></div>
      <div class="race-car">${F1.visuals.car(ctx.ch.id, { view: 'side', number: ctx.drvM.number, spin: true })}</div>
      <div class="race-body"><div class="tower" style="height:${res.field.length * ROW}px">${tower}</div><div class="feed" id="feed"><div class="ev"><b>Départ</b> — vous partez P${res.field.find((x) => x.c.me).grid} sur la grille</div></div></div>
      </div></div>`;
    let lap = 0;
    const evs = res.events.slice();
    const render = (L) => {
      const order = res.laps[L - 1];
      order.forEach((o, k) => {
        const el = $(`.trow[data-i="${o.i}"]`); if (!el) return;
        el.style.transform = `translateY(${k * ROW}px)`;
        el.querySelector('.tp').textContent = o.out ? 'AB' : k + 1;
        el.querySelector('.tg').textContent = o.out ? 'Abandon' : k === 0 ? 'Leader' : '+' + o.gap.toFixed(1);
        el.classList.toggle('out', o.out);
      });
      $('#lapN').textContent = L;
      const feed = $('#feed');
      while (evs.length && evs[0].lap <= L) {
        const e = evs.shift();
        const who = e.who != null ? byI.get(e.who) : null;
        if (e.type !== 'sc' && who && !who.c.me && e.type !== 'dnf') continue; // n'affiche que les faits marquants
        const nm = who ? (who.c.me ? '<b class="me-t">Vous</b>' : `<b>${esc(who.name)}</b>`) : '';
        feed.insertAdjacentHTML('afterbegin', `<div class="ev ${e.type} ${who && who.c.me ? 'mine' : ''}"><span class="muted">T${e.lap}</span> ${e.type === 'sc' ? '🚨 ' + esc(e.txt) : nm + ' ' + esc(e.txt)}</div>`);
      }
    };
    const finish = () => {
      clearInterval(raceTimer); raceTimer = null;
      render(MG().LAPS);
      const me = res.final.find((x) => x.i === 0);
      const m = F1.store.mgr();
      const Lnow = MG().leagueOf(m.lp);
      const promo = Lnow.min > leagueBefore.min, demo = Lnow.min < leagueBefore.min;
      const fl = byI.get(res.fastest.who);
      $('#raceEnd').innerHTML = `<div class="race-res ${me.out ? 'dnf' : me.pos <= 3 ? 'podium' : ''}">
        <div class="big-pos">${me.out ? 'ABANDON' : 'P' + me.pos}</div>
        <div class="row" style="justify-content:center;gap:10px;margin:10px 0"><span class="chip ${rw.lp >= 0 ? 'green' : 'red'}">${rw.lp >= 0 ? '+' : ''}${rw.lp} LP</span><span class="chip gold">+${rw.pc} PitCoins</span>${fl ? `<span class="chip">⏱ Meilleur tour : ${esc(fl.c.me ? 'vous' : fl.name)}</span>` : ''}</div>
        ${promo ? `<div class="promo">🎉 PROMOTION ! Bienvenue en ligue ${Lnow.icon} ${Lnow.name} (gains ×${Lnow.mult})</div>` : demo ? `<div class="promo down">Relégation en ligue ${Lnow.icon} ${Lnow.name}. Améliorez la voiture et revenez plus fort !</div>` : ''}
        <div class="row" style="justify-content:center;margin-top:12px"><button class="btn ghost sm" data-action="m-close">Fermer</button>${F1.store.racesLeft() > 0 ? `<button class="btn sm" data-action="m-again">🚦 Nouvelle course (${F1.store.racesLeft()} restante${F1.store.racesLeft() > 1 ? 's' : ''})</button>` : ''}</div></div>`;
      $('[data-action="m-skip"]').style.display = 'none';
      const rc = $('.race-car'); if (rc) rc.style.display = 'none';
      const box = $('.race-box'); if (box) box.scrollTop = 0;
      if (!me.out && me.pos <= 3) confetti(me.pos === 1 ? 220 : 90);
      if (promo) setTimeout(() => confetti(260), 400);
      showAchievements();
    };
    S.raceFinish = finish;
    F1.visuals.hydrate($('#modal'));
    raceTimer = setInterval(() => { lap++; if (lap >= MG().LAPS) finish(); else render(lap); }, 650);
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
      <section class="section"><div class="section-h"><h2>Succès</h2><span class="muted">${Object.keys(p.ach).length} / ${F1.store.ACH.length}</span></div><div class="grid g3">${F1.store.ACH.map((a) => `<div class="ach ${p.ach[a.id] ? '' : 'locked'}"><div class="ic">${a.icon}</div><div><b>${esc(a.title)}</b><small>${esc(a.desc)}</small></div></div>`).join('')}</div></section>`;
    return h;
  }
  function seasonByYear(y) { const s = S.season; if (!y || y === s.year) return s; if (s.upcoming && s.upcoming.year === y) return s.upcoming; if (s.prev && s.prev.year === y) return s.prev; return S.archives[y] || null; }
  const STATUS = { open: ['En cours', 'gold'], won: ['Gagné', 'green'], lost: ['Perdu', 'red'], void: ['Remboursé', ''] };
  function betCard(b) {
    const [lbl, cls] = STATUS[b.status];
    const race = (r, y) => { const ss = seasonByYear(y); const x = ss && ss.races.find((z) => z.round === r); return (x ? x.nameFr.replace('Grand Prix', 'GP') : 'Manche ' + r) + (y && y !== S.season.year ? ' ' + y : ''); };
    return `<div class="bet ${b.status}"><div class="bet-h"><span class="row"><b>${b.legs.length > 1 ? `Combiné × ${b.legs.length}` : 'Simple'}</b><span class="muted" style="font-size:12px">${DTF.format(new Date(b.placedAt))}</span></span><span class="chip ${cls}">${lbl}</span></div>
      <div class="bet-legs">${b.legs.map((l) => `<div class="leg"><span><span class="res ${l.result || ''}">${l.result === 'won' ? '✓' : l.result === 'lost' ? '✕' : l.result === 'void' ? '↺' : '•'}</span> <b>${esc(l.label)}</b><span class="lm">${esc(l.mtitle)} · ${esc(l.round ? race(l.round, l.season) : 'Saison ' + (l.season || S.season.year))}</span></span><b class="num" style="color:var(--gold)">${fmtOdds(l.odds)}</b></div>`).join('')}</div>
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
        <label class="stake"><span class="coin sm">J</span><input id="stakeIn" type="number" inputmode="decimal" min="1" step="1" value="${stake}"><span class="muted" style="padding-right:8px">jetons</span></label>
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
    const settled = [S.season, ...Object.values(S.archives).filter(Boolean)].flatMap((ss) => F1.store.settleAll(ss));
    let delay = 0;
    let anyWin = false;
    settled.forEach((b) => {
      setTimeout(() => {
        if (b.status === 'won') { anyWin = true; toast('🏆', `Pari gagné ! <b>+${fmtJ(b.payout)}</b> jetons (cote ${fmtOdds(b.effOdds || b.odds)})${b.pcReward ? ` · <b>+${b.pcReward} PitCoins</b>` : ''}`, 'win', 6000); }
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
    F1.store.popUnlocked().forEach((a, i) => setTimeout(() => { toast(a.icon, `Succès débloqué : <b>${esc(a.title)}</b>`, 'win', 5000); confetti(80); }, i * 900));
  }

  /* =================== Portefeuille / profil =================== */
  let shownBal = null;
  function updateWallet() {
    const p = F1.store.get();
    const el = $('#balance');
    const target = p.balance;
    $('#avatar').textContent = (p.name || '?').slice(0, 1).toUpperCase();
    if ($('#pcBal')) $('#pcBal').textContent = fmt(Math.round(p.manager ? p.manager.pc : 0));
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
  const closeModal = () => { if (raceTimer) { clearInterval(raceTimer); raceTimer = null; } const wasRace = !!$('#modal .race-modal'); $('#modal').innerHTML = ''; if (wasRace && /^#\/manager/.test(location.hash)) route(); };
  function welcome() {
    modal(`<div style="font-size:42px">🏎️</div><h2>Bienvenue au muret des stands</h2>
      <p class="muted">PITWALL est un jeu de pronostics <b>gratuit</b> sur la Formule 1. Vous démarrez avec <b style="color:var(--gold)">${fmt(F1.store.START)} jetons virtuels</b> et recevez une prime à chaque Grand Prix. Les cotes sont recalculées après chaque course à partir des résultats officiels, et vos paris sont réglés automatiquement.</p>
      <p class="muted" style="font-size:13px">Aucun argent réel, rien à gagner : juste la gloire du paddock.</p>
      <label class="muted" style="font-size:13px;font-weight:700">Votre pseudo</label><input class="field" id="nameIn" maxlength="24" placeholder="ex. Lewis_du_93" style="margin:6px 0 16px">
      <button class="btn block" data-action="save-name">Entrer dans le paddock</button>`);
  }
  function profile() {
    const p = F1.store.get();
    modal(`<h2>Profil</h2><label class="muted" style="font-size:13px;font-weight:700">Pseudo</label>
      <div class="row" style="margin:6px 0 20px;flex-wrap:nowrap"><input class="field" id="nameIn" maxlength="24" value="${esc(p.name)}"><button class="btn sm" data-action="save-name">OK</button></div>
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
      Données : <a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noopener">Jolpica F1 API</a> (successeur d'Ergast) · Météo : <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Source : ${src}${s.updated ? ' · maj ' + DTF.format(s.updated) : ''}${meta}
      · <button class="link" data-action="reload" style="text-decoration:underline">Actualiser</button><br><br>
      Photos des pilotes : Wikimedia Commons, licences libres — <button class="link" data-action="credits" style="text-decoration:underline">crédits photos</button> · Monoplaces : illustrations originales.<br><br>
      Jeu gratuit à jetons virtuels, sans argent réel ni gain matériel. Site de fans non officiel, sans lien avec la Formula One Group, la FIA ou les écuries. Les cotes sont des estimations statistiques et n'ont qu'une valeur ludique.</div>`;
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
  document.addEventListener('click', (e) => {
    const odd = e.target.closest('[data-sid]:not([data-action])');
    if (odd && !odd.disabled) { toggleSel(odd.dataset.sid, odd); return; }
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
      case 'claim': { const g = F1.store.claimWeekly(S.season, S.season.next); if (g) { toast('🎁', `+${g} jetons crédités !`, 'win'); confetti(100); showAchievements(); route(); } break; }
      case 'claim-season': { const g = F1.store.claimSeason(S.season); if (g) { toast('🎆', `+${g} jetons pour la saison ${S.season.year} !`, 'win'); confetti(160); route(); } break; }
      case 'rescue': { const g = F1.store.rescue(S.season, S.season.next); if (g) { toast('⛽', `Ravitaillement : +${g} jetons`, 'win'); route(); } break; }
      case 'profile': profile(); break;
      case 'credits': credits(); break;
      case 'm-buy-d': { const ctx = mgrCtx(); const d = ctx.mk.byDriver.get(a.dataset.id); try { F1.store.buyDriver(d, resaleD(ctx)); toast('🤝', `<b>${esc(d.name)}</b> rejoint votre écurie !`, 'win'); confetti(80); showAchievements(); F1.social.sync(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'm-buy-c': { const ctx = mgrCtx(); const c = ctx.mk.byChassis.get(a.dataset.id); if (ctx.m.chassis && ctx.m.rdSpent > 0 && !confirm('Changer de châssis remet votre R&D à zéro. Continuer ?')) break; try { F1.store.buyChassis(c, resaleC(ctx)); toast('🔩', `Châssis <b>${esc(c.name)}</b> livré au garage !`, 'win'); confetti(80); showAchievements(); F1.social.sync(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'rd-cat': S.rdCat = a.dataset.c; S.rdSel = null; rdRefresh(); break;
      case 'rd-sel': S.rdSel = a.dataset.p || null; rdRefresh(); break;
      case 'rd-buy': { const p = MG().RD_BY_ID.get(a.dataset.p); try { F1.store.research(p); toast('🔬', `<b>${esc(p.name)}</b> développé et installé !`, 'win'); confetti(70); showAchievements(); F1.social.sync(); rdRefresh(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'm-up': { const k = a.dataset.k; const lvl = F1.store.mgr().ups[k] || 0; try { F1.store.upgrade(k, MG().upCost(lvl)); const st = MG().STATS.find((x) => x.k === k); toast('🔬', `${st.icon} ${esc(st.label)} : niveau ${lvl + 1} !`, 'win'); showAchievements(); route(); } catch (err) { toast('⚠️', esc(err.message), 'err'); } break; }
      case 'm-race': startRace(); break;
      case 'm-again': closeModal(); setTimeout(startRace, 50); break;
      case 'm-skip': if (S.raceFinish && raceTimer) S.raceFinish(); break;
      case 'm-close': closeModal(); break;
      case 'f-retry': F1.social.init().then(route); break;
      case 'f-refresh': socialAct(() => F1.social.refresh()); break;
      case 'f-claim': { const n = $('#claimName').value.trim(), t = $('#claimTeam').value; socialAct(async () => { await F1.social.claim(n, t); if (!F1.store.get().name) F1.store.setName(n); }, `Profil créé : bienvenue ${esc(n)} !`); break; }
      case 'f-edit': { const me = SO().me; modal(`<h2>Profil joueur</h2><label class="muted" style="font-size:13px;font-weight:700">Pseudo public</label><input class="field" id="claimName" maxlength="24" value="${esc(me.username)}" style="margin:6px 0 12px"><label class="muted" style="font-size:13px;font-weight:700">Écurie favorite</label><select class="field" id="claimTeam" style="margin:6px 0 16px">${teamOptions(me.team)}</select><div class="row"><button class="btn sm ghost" data-action="close-modal">Annuler</button><span class="sp"></span><button class="btn sm" data-action="f-save">Enregistrer</button></div>`); break; }
      case 'f-save': { const n = $('#claimName').value.trim(), t = $('#claimTeam').value; closeModal(); socialAct(() => F1.social.claim(n, t), 'Profil mis à jour'); break; }
      case 'f-add': socialAct(() => F1.social.request(a.dataset.u), 'Demande d\'ami envoyée'); break;
      case 'f-accept': socialAct(() => F1.social.accept(+a.dataset.id), 'Vous êtes maintenant amis 🤝'); break;
      case 'f-remove': if (!a.dataset.confirm || confirm('Retirer ce joueur de vos amis ?')) socialAct(() => F1.social.remove(+a.dataset.id)); break;
      case 'f-copy': (navigator.clipboard ? navigator.clipboard.writeText(a.dataset.v) : Promise.reject()).then(() => toast('🔗', 'Lien d\'invitation copié : envoyez-le à vos amis !', 'win'), () => prompt('Copiez ce lien :', a.dataset.v)); break;
      case 'save-name': { const v = ($('#nameIn').value || '').trim(); if (!v) { $('#nameIn').focus(); return; } F1.store.setName(v); closeModal(); toast('👋', `Bienvenue, <b>${esc(v)}</b> !`, 'win'); route(); break; }
      case 'copy-code': { const t = $('#expCode'); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => toast('📋', 'Code copié'), () => document.execCommand('copy')); break; }
      case 'import': try { F1.store.importCode($('#impCode').value); closeModal(); shownBal = null; updateWallet(); route(); toast('✅', 'Sauvegarde importée', 'win'); } catch (err) { toast('⚠️', 'Code de sauvegarde invalide', 'err'); } break;
      case 'reset': if (confirm('Effacer tous vos paris et repartir avec ' + F1.store.START + ' jetons ?')) { F1.store.reset(); closeModal(); route(); toast('↺', 'Partie réinitialisée'); } break;
      case 'close-modal': closeModal(); break;
      case 'modal-bg': if (e.target === a && F1.store.get().name) closeModal(); break;
      case 'reload': F1.data.clearCache(); location.reload(); break;
      default:
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('#modal').innerHTML && F1.store.get().name) closeModal(); else if (S.slipOpen) { S.slipOpen = false; renderSlip(); } }
    if (e.key === 'Enter' && e.target.id === 'nameIn') $('[data-action="save-name"]').click();
    if (e.key === 'Enter' && e.target.id === 'claimName' && $('[data-action="f-claim"]')) $('[data-action="f-claim"]').click();
  });
  window.addEventListener('resize', () => { document.body.classList.toggle('has-slip', S.slip.length > 0 && innerWidth >= 1280); });

  boot();
})(globalThis.F1);
