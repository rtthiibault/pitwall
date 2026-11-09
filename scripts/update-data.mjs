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
const UA = { 'User-Agent': 'PitwallFanSite/1.0 (non-commercial F1 fan site; weekly batch job)' };
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
async function wget(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.status === 429 || r.status >= 500) { const ra = +r.headers.get('retry-after') || 5 * (i + 1); await sleep(ra * 1000); continue; }
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  }
  throw new Error('limite de requêtes Wikimedia : ' + url);
}
const titleOf = (d) => (d.url && d.url.includes('/wiki/') ? decodeURIComponent(d.url.split('/wiki/')[1].split(/[?#]/)[0]).replace(/_/g, ' ') : null);
// 2 requêtes groupées : image principale des pages Wikipédia, puis auteur/licence sur Commons
async function portraitsFor(list) {
  const out = {};
  const titles = new Map();
  for (const d of list) { const t = titleOf(d); if (t) titles.set(t, d.driverId); }
  const names = [...titles.keys()];
  const fileOf = {};
  for (let i = 0; i < names.length; i += 40) {
    const j = await wget(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(names.slice(i, i + 40).join('|'))}`);
    const alias = {};
    for (const n of (j.query.normalized || [])) alias[n.to] = n.from;
    for (const n of (j.query.redirects || [])) alias[n.to] = alias[n.from] || n.from;
    for (const pg of Object.values(j.query.pages)) {
      const orig = alias[pg.title] || pg.title;
      const id = titles.get(orig) || titles.get(pg.title);
      if (id && pg.pageimage) fileOf[id] = pg.pageimage;
    }
    await sleep(1000);
  }
  const files = [...new Set(Object.values(fileOf))];
  for (let i = 0; i < files.length; i += 40) {
    const j = await wget(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=420&titles=${encodeURIComponent(files.slice(i, i + 40).map((f) => 'File:' + f).join('|'))}`);
    const norm = {};
    for (const n of (j.query.normalized || [])) norm[n.to] = n.from;
    for (const pg of Object.values(j.query.pages)) {
      const ii = pg.imageinfo && pg.imageinfo[0];
      if (!ii || pg.missing !== undefined) continue; // absente de Commons = image non libre -> ignorée
      const fname = (norm[pg.title] || pg.title).replace(/^File:/, '');
      const md = ii.extmetadata || {};
      for (const [id, f] of Object.entries(fileOf)) {
        if (f.replace(/_/g, ' ') !== fname.replace(/_/g, ' ')) continue;
        out[id] = { img: ii.thumburl || ii.url, page: ii.descriptionurl, artist: strip(md.Artist && md.Artist.value) || 'Auteur inconnu', license: strip(md.LicenseShortName && md.LicenseShortName.value) || 'Licence libre' };
      }
    }
    await sleep(1000);
  }
  return out;
}
let oldP = {};
try { oldP = JSON.parse(await readFile('data/portraits.json', 'utf8')).drivers || {}; } catch (e) { /* premier passage */ }
const want = new Map();
for (const s of [cur]) {
  for (const x of s.driverStandings) want.set(x.Driver.driverId, x.Driver);
  for (const r of s.results.slice(-3)) for (const x of r.Results) want.set(x.Driver.driverId, x.Driver);
}
try { const nx = JSON.parse(await readFile(`data/seasons/${cur.year + 1}.json`, 'utf8')); for (const x of nx.driverStandings) want.set(x.Driver.driverId, x.Driver); } catch (e) { /* pas encore de saison suivante */ }
let fresh = {};
try { fresh = await portraitsFor([...want.values()]); } catch (e) { console.warn('! portraits : ' + e.message); }
const drivers = {};
for (const id of want.keys()) { if (fresh[id]) drivers[id] = fresh[id]; else if (oldP[id]) drivers[id] = oldP[id]; }
console.log(`Portraits : ${Object.keys(drivers).length}/${want.size}`);
await save('data/portraits.json', { updated: new Date().toISOString(), source: 'Wikimedia Commons', drivers });
meta.portraits = Object.keys(drivers).length;

await writeFile('data/meta.json', JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
