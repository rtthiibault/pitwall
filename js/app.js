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
    const app = $('#app');
    let html;
    switch (r) {
      case 'paris': html = pageBets(parts[1] || 'populaires'); break;
      case 'calendrier': html = pageCalendar(+parts[1] || null); break;
      case 'classements': html = pageStandings(); break;
      case 'gp': html = pageGP(+parts[1]); break;
      case 'mes-paris': html = pageMyBets(); break;
      case 'grille': html = pageGrid(); break;
      default: html = pageHome();
    }
    app.innerHTML = sourceNotice() + html;
    app.classList.remove('fade-in'); void app.offsetWidth; app.classList.add('fade-in');
    afterRender(r, parts);
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
    return `<section class="hero"><div class="hero-bg">${streaks()}<div class="grid-floor"></div><div class="big-round">R${nx.round}</div>${heroCar()}<div class="kerb"></div></div>
      <div class="hero-top">${flag(nx.iso, 'lg')}<span class="chip red live">Prochain Grand Prix</span><span class="chip">Manche ${nx.round} / ${s.races.length}</span>${nx.sprint ? '<span class="chip gold">⚡ Week-end Sprint</span>' : ''}${nx.street ? '<span class="chip">🏙️ Circuit urbain</span>' : ''}${nx.round === 1 ? `<span class="chip green">🚦 Ouverture de la saison ${s.year}</span>` : ''}${nx.tbc ? '<span class="chip">À confirmer</span>' : ''}</div>
      <h1><span class="accent">${esc(nx.countryFr)}</span>${esc(nx.nameFr)}</h1>
      <div class="hero-meta"><span>📍 ${esc(nx.circuit)} · ${esc(nx.locality)}</span><span>🗓️ ${DAYL.format(nx.date)} · ${HM.format(nx.date)}</span>
      ${w ? `<span class="weather" title="Prévision Open-Meteo à l'heure du départ">${wIcon} ${w.temp}°C · 💧 ${w.rain} % · 💨 ${w.wind} km/h</span>` : ''}</div>
      ${countdown(nx.date.getTime())}
      <div class="weekend">${nx.sessions.map((x) => `<div class="sess ${x.date.getTime() < now ? 'done' : x === nextSess ? 'next' : ''}"><small>${esc(x.label)}</small><b>${WD.format(x.date)} ${HM.format(x.date)}</b></div>`).join('')}</div>
      <div class="hero-actions"><a class="btn" href="#/paris">🏁 Parier sur ce GP</a><a class="btn ghost" href="#/paris/tierce">Jouer le tiercé</a></div></section>`;
  }
  function heroCar() {
    const w = S.markets.find((m) => m.kind === 'win');
    const fav = w && w.selections[0] && drv(w.selections[0].driverId);
    if (!fav) return '';
    return `<div class="hero-car" title="Monoplace du favori : ${esc(fav.family)}">${F1.visuals.car(fav.teamId, { number: fav.number, spin: true })}</div>`;
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
      <div class="seg"><button class="${tab === 'drivers' ? 'on' : ''}" data-action="stand" data-t="drivers">Pilotes</button><button class="${tab === 'teams' ? 'on' : ''}" data-action="stand" data-t="teams">Constructeurs</button></div></div>
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
          <div class="gcar">${F1.visuals.car(t.id, { number: drv(ds[0]).number, spin: true })}</div>
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
    F1.store.popUnlocked().forEach((a, i) => setTimeout(() => { toast(a.icon, `Succès débloqué : <b>${esc(a.title)}</b>`, 'win', 5000); confetti(80); }, i * 900));
  }

  /* =================== Portefeuille / profil =================== */
  let shownBal = null;
  function updateWallet() {
    const p = F1.store.get();
    const el = $('#balance');
    const target = p.balance;
    $('#avatar').textContent = (p.name || '?').slice(0, 1).toUpperCase();
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
  const closeModal = () => { $('#modal').innerHTML = ''; };
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
      <div class="logo" style="justify-content:center;font-size:18px;margin-bottom:10px"><span>PIT<em>WALL</em></span></div>
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
  });
  window.addEventListener('resize', () => { document.body.classList.toggle('has-slip', S.slip.length > 0 && innerWidth >= 1280); });

  boot();
})(globalThis.F1);
