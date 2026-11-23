// Paddock Wire : relève les flux RSS F1, analyse chaque dépêche et écrit data/news.json (Node 18+).
// Lancé toutes les heures par .github/workflows/news.yml : le relevé n'a lieu que si le précédent date
// de 5 h ou plus (cadence exacte de 5 h). FORCE=1 pour relever tout de suite.
import { readFile, writeFile } from 'node:fs/promises';
import { analyze, driverKeys, isF1 } from './news-analyze.mjs';

const OUT = 'data/news.json';
const PERIOD = 5 * 36e5;
const KEEP_DAYS = 10, MAX_ITEMS = 60;
// Sources francophones d'abord ; filter = flux généraliste, on ne garde que la F1
const FEEDS = [
  { name: 'Motorsport.com', url: 'https://fr.motorsport.com/rss/f1/news/', lang: 'fr' },
  { name: 'Nextgen-Auto', url: 'https://motorsport.nextgen-auto.com/backend.php', lang: 'fr', filter: true },
  { name: 'F1i', url: 'https://f1i.com/feed', lang: 'fr', filter: true },
  { name: 'AutoHebdo', url: 'https://www.autohebdo.fr/feed/', lang: 'fr', filter: true },
  { name: 'Motorsport.com (EN)', url: 'https://www.motorsport.com/rss/f1/news/', lang: 'en' },
  { name: 'The Race', url: 'https://www.the-race.com/formula-1/feed/', lang: 'en' },
];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', icirc: 'î', ndash: '–', mdash: '—', laquo: '«', raquo: '»' };
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const text = (s) => decode(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, n) => { const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(x); return m ? m[1] : ''; };
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
const cut = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)).replace(/[,;:.\s]+$/, '') + '…');

async function fetchFeed(f) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(f.url, { signal: c.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; PitwallNewsBot/1.0)', accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = await r.text();
    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    return blocks.map((b) => {
      const link = text(tag(b, 'link')) || ((/<link[^>]*href="([^"]+)"/i.exec(b) || [])[1] || '');
      const date = text(tag(b, 'pubDate')) || text(tag(b, 'published')) || text(tag(b, 'updated')) || text(tag(b, 'dc:date'));
      return { title: text(tag(b, 'title')), link, date: date ? new Date(date) : null, summary: text(tag(b, 'description')) || text(tag(b, 'summary')) };
    }).filter((x) => x.title && x.link && x.date && !isNaN(x.date));
  } finally { clearTimeout(t); }
}

async function main() {
  let prev = { items: [] };
  try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch (e) { /* premier relevé */ }
  const last = Date.parse(prev.updated || '') || 0;
  if (!process.env.FORCE && Date.now() - last < PERIOD - 10 * 60e3) { console.log('Dernier relevé il y a', ((Date.now() - last) / 36e5).toFixed(2), 'h : rien à faire'); return; }

  // grille actuelle pour reconnaître les pilotes
  let drivers = [];
  try {
    const s = JSON.parse(await readFile('data/snapshot.json', 'utf8'));
    drivers = driverKeys(s.driverStandings.map((d) => ({ id: d.Driver.driverId, family: d.Driver.familyName, teamId: (d.Constructors.at(-1) || {}).constructorId })));
  } catch (e) { console.warn('snapshot illisible :', e.message); }

  const now = Date.now(), seen = new Set(), fresh = [], sources = [];
  for (const f of FEEDS) {
    try {
      const list = await fetchFeed(f);
      sources.push({ name: f.name, ok: true, n: list.length });
      for (const x of list) {
        if (now - x.date > KEEP_DAYS * 864e5) continue;
        if (f.filter && !isF1(x)) continue;
        const key = x.title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60);
        if (seen.has(key)) continue; seen.add(key);
        const summary = cut(x.summary.replace(/^(.{0,20}\s)?(lire la suite|read more).*/i, ''), 260);
        const a = analyze({ title: x.title, summary }, drivers);
        fresh.push({ id: 'news_' + hash(x.link), timestamp: x.date.toISOString(), category: a.category, title: x.title, summary, source: f.name, lang: f.lang, url: x.link, impact: a.impact });
      }
      console.log(`${f.name} : ${list.length} articles`);
    } catch (e) { sources.push({ name: f.name, ok: false, err: e.message }); console.warn(`${f.name} : ${e.message}`); }
  }
  // fusion avec les dépêches déjà publiées (une dépêche garde son id et sa date de première détection)
  const byId = new Map((prev.items || []).filter((x) => now - Date.parse(x.timestamp) < KEEP_DAYS * 864e5).map((x) => [x.id, x]));
  for (const x of fresh) if (!byId.has(x.id)) byId.set(x.id, { ...x, firstSeen: new Date(now).toISOString() });
  const items = [...byId.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, MAX_ITEMS);
  if (!sources.some((s) => s.ok) && prev.items && prev.items.length) console.warn('Aucune source joignable : dépêches précédentes conservées');
  const out = { updated: new Date(now).toISOString(), periodHours: 5, next: new Date(now + PERIOD).toISOString(), sources, items };
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`${items.length} dépêches, dont ${items.filter((x) => x.impact).length} avec impact`);
}
main().catch((e) => { console.error(e); process.exit(1); });
