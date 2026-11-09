// Met à jour toutes les données du site depuis l'API Jolpica (Node 18+).
// Lancé automatiquement par la GitHub Action (.github/workflows/update-data.yml).
//
// Fichiers produits :
//   data/snapshot.json        saison en cours (compatibilité)
//   data/seasons/<année>.json saison précédente, en cours et suivante (si publiée)
//   data/meta.json            date de mise à jour + résumé
import { writeFile, readFile, mkdir } from 'node:fs/promises';

const API = 'https://api.jolpi.ca/ergast/f1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) { await sleep(4000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2500 * (i + 1));
    }
  }
  throw new Error('trop de tentatives : ' + url);
}

async function races(path, field) {
  const byRound = new Map();
  let offset = 0, total = 1;
  while (offset < total) {
    const j = (await get(`${API}/${path}.json?limit=100&offset=${offset}`)).MRData;
    total = +j.total;
    for (const race of j.RaceTable.Races) {
      const ex = byRound.get(race.round);
      if (ex) ex[field] = ex[field].concat(race[field] || []);
      else byRound.set(race.round, { ...race, [field]: race[field] || [] });
    }
    offset += 100;
    await sleep(450);
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

async function season(path) {
  const sched = (await get(`${API}/${path}.json?limit=100`)).MRData.RaceTable;
  const schedule = sched.Races;
  if (!schedule.length) return null;
  await sleep(450);
  const ds = (await get(`${API}/${path}/driverStandings.json?limit=100`)).MRData.StandingsTable.StandingsLists[0];
  await sleep(450);
  const cs = (await get(`${API}/${path}/constructorStandings.json?limit=100`)).MRData.StandingsTable.StandingsLists[0];
  await sleep(450);
  const started = schedule.some((r) => new Date(`${r.date}T${r.time || '12:00:00Z'}`) < new Date());
  const results = started ? await races(`${path}/results`, 'Results') : [];
  const sprint = started ? await races(`${path}/sprint`, 'SprintResults') : [];
  const qualifying = started ? await races(`${path}/qualifying`, 'QualifyingResults') : [];
  return {
    year: +(sched.season || schedule[0].season),
    updated: new Date().toISOString(),
    schedule,
    driverStandings: ds ? ds.DriverStandings : [],
    constructorStandings: cs ? cs.ConstructorStandings : [],
    results, sprint, qualifying,
  };
}

const summary = (s) => ({ races: s.schedule.length, done: s.results.length, sprints: s.sprint.length, leader: s.driverStandings[0] ? `${s.driverStandings[0].Driver.familyName} (${s.driverStandings[0].points})` : null });
const same = async (file, data) => {
  try { const old = JSON.parse(await readFile(file, 'utf8')); delete old.updated; const nw = { ...data }; delete nw.updated; return JSON.stringify(old) === JSON.stringify(nw); } catch (e) { return false; }
};
// n'écrit le fichier que si les données ont réellement changé (évite des commits inutiles)
async function save(file, data) {
  if (await same(file, data)) { console.log(`= ${file} inchangé`); return false; }
  await writeFile(file, JSON.stringify(data));
  console.log(`✔ ${file} mis à jour`);
  return true;
}

await mkdir('data/seasons', { recursive: true });
const meta = { updated: new Date().toISOString(), seasons: {} };

const cur = await season('current');
if (!cur) throw new Error('Saison en cours introuvable');
await save('data/snapshot.json', cur);
await save(`data/seasons/${cur.year}.json`, cur);
meta.current = cur.year;
meta.seasons[cur.year] = summary(cur);

for (const y of [cur.year - 1, cur.year + 1]) {
  try {
    await sleep(800);
    const s = await season(String(y));
    if (!s) { console.log(`- saison ${y} pas encore publiée dans l'API`); continue; }
    await save(`data/seasons/${y}.json`, s);
    meta.seasons[y] = summary(s);
  } catch (e) {
    console.warn(`! saison ${y} : ${e.message}`);
  }
}

// ---------- Portraits des pilotes (images libres de Wikimedia Commons, avec auteur et licence) ----------
const UA = { 'User-Agent': 'PitwallFanSite/1.0 (site de pronostics F1 non commercial)' };
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
async function wget(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); }
async function portraitFor(d) {
  let title = d.url && d.url.includes('/wiki/') ? decodeURIComponent(d.url.split('/wiki/')[1]) : null;
  if (!title) {
    const q = await wget(`https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&search=${encodeURIComponent(d.givenName + ' ' + d.familyName + ' racing driver')}`);
    title = q[3] && q[3][0] ? decodeURIComponent(q[3][0].split('/wiki/')[1]) : null;
  }
  if (!title) return null;
  const sum = await wget(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const orig = (sum.originalimage || sum.thumbnail || {}).source;
  if (!orig || !orig.includes('/wikipedia/commons/')) return null; // images libres uniquement
  const file = decodeURIComponent(orig.split('/').pop());
  const info = await wget(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=420&titles=${encodeURIComponent('File:' + file)}`);
  const page = Object.values(info.query.pages)[0];
  const ii = page && page.imageinfo && page.imageinfo[0];
  if (!ii) return null;
  const md = ii.extmetadata || {};
  return {
    img: ii.thumburl || ii.url, page: ii.descriptionurl, wiki: sum.content_urls && sum.content_urls.desktop.page,
    artist: strip(md.Artist && md.Artist.value) || 'Auteur inconnu', license: strip(md.LicenseShortName && md.LicenseShortName.value) || 'Licence libre',
  };
}
let oldP = {};
try { oldP = JSON.parse(await readFile('data/portraits.json', 'utf8')).drivers || {}; } catch (e) { /* premier passage */ }
const want = new Map();
for (const s of [cur]) {
  for (const x of s.driverStandings) want.set(x.Driver.driverId, x.Driver);
  for (const r of s.results.slice(-3)) for (const x of r.Results) want.set(x.Driver.driverId, x.Driver);
}
try { const nx = JSON.parse(await readFile(`data/seasons/${cur.year + 1}.json`, 'utf8')); for (const x of nx.driverStandings) want.set(x.Driver.driverId, x.Driver); } catch (e) { /* pas encore de saison suivante */ }
const drivers = {};
for (const [id, d] of want) {
  try { const p = await portraitFor(d); if (p) drivers[id] = p; else if (oldP[id]) drivers[id] = oldP[id]; }
  catch (e) { console.warn(`! portrait ${id} : ${e.message}`); if (oldP[id]) drivers[id] = oldP[id]; }
  await sleep(250);
}
await save('data/portraits.json', { updated: new Date().toISOString(), source: 'Wikimedia Commons', drivers });
meta.portraits = Object.keys(drivers).length;

await writeFile('data/meta.json', JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
