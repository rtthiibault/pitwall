// Génère data/snapshot.json à partir de l'API Jolpica (Node 18+).
// Lancé chaque semaine par la GitHub Action : sert de secours si l'API live est injoignable.
import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://api.jolpi.ca/ergast/f1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
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
    await sleep(400);
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

const schedule = (await get(`${API}/current.json?limit=100`)).MRData.RaceTable.Races;
await sleep(400);
const ds = (await get(`${API}/current/driverStandings.json?limit=100`)).MRData.StandingsTable.StandingsLists[0];
await sleep(400);
const cs = (await get(`${API}/current/constructorStandings.json?limit=100`)).MRData.StandingsTable.StandingsLists[0];
await sleep(400);
const results = await races('current/results', 'Results');
const sprint = await races('current/sprint', 'SprintResults');
const qualifying = await races('current/qualifying', 'QualifyingResults');

const snap = {
  updated: new Date().toISOString(),
  schedule,
  driverStandings: ds ? ds.DriverStandings : [],
  constructorStandings: cs ? cs.ConstructorStandings : [],
  results, sprint, qualifying,
};
await mkdir('data', { recursive: true });
await writeFile('data/snapshot.json', JSON.stringify(snap));
console.log(`Snapshot OK : ${schedule.length} GP, ${results.length} courses disputées, ${sprint.length} sprints.`);
