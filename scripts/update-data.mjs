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

await writeFile('data/meta.json', JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
