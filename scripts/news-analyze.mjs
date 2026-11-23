// Paddock Wire : analyse d'une dépêche F1 -> catégorie + impact (F1 Manager et cotes).
// Analyse par règles (mots-clés FR/EN) : écuries, motoristes et pilotes cités, sujet (moteur, aéro,
// fiabilité, pilote, règlement, météo) et tonalité (positive / négative). Aucune dépendance.

const norm = (s) => ` ${String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9%+-]+/g, ' ')} `;

// Écuries : identifiants du site -> alias (texte normalisé, mots entiers)
export const TEAMS = {
  ferrari: ['ferrari', 'scuderia', 'maranello'],
  mclaren: ['mclaren', 'woking'],
  red_bull: ['red bull', 'milton keynes', 'rbr'],
  rb: ['racing bulls', 'vcarb', 'visa cash app', 'faenza'],
  mercedes: ['mercedes', 'brackley', 'fleches d argent', 'silver arrows'],
  aston_martin: ['aston martin', 'amr'],
  alpine: ['alpine', 'enstone'],
  williams: ['williams', 'grove'],
  haas: ['haas'],
  audi: ['audi', 'sauber', 'hinwil'],
  cadillac: ['cadillac'],
};
export const TEAM_NAME = { ferrari: 'Ferrari', mclaren: 'McLaren', red_bull: 'Red Bull', rb: 'Racing Bulls', mercedes: 'Mercedes', aston_martin: 'Aston Martin', alpine: 'Alpine', williams: 'Williams', haas: 'Haas', audi: 'Audi', cadillac: 'Cadillac' };
// Motoristes 2026 -> écuries équipées
export const SUPPLIERS = {
  mercedes: ['mercedes', 'mclaren', 'williams', 'alpine'],
  ferrari: ['ferrari', 'haas', 'cadillac'],
  honda: ['aston_martin'],
  red_bull: ['red_bull', 'rb'],
  audi: ['audi'],
};
const SUPPLIER_ALIAS = { honda: ['honda'], red_bull: ['ford', 'red bull powertrains', 'rbpt'] };

const RX = {
  engine: /\b(moteurs?|motoriste|motorisation|bloc propulseur|blocs?|unite de puissance|power units?|pu|chevaux|\d+\s?ch|puissance|horsepower|\d+\s?hp|hp|hybride|batterie|mgu-?k|ers|turbo|deploiement|energie electrique|engine|engines)\b/,
  aero: /\b(aero\w*|ailerons?|fond plat|fonds plats|plancher|diffuseur|pontons?|appui|downforce|floor|front wing|rear wing|sidepods?|marsouinage|porpoising|rebonds?|bouncing|carrosserie|suspension|chassis)\b/,
  reliab: /\b(fiabilite|fiable|pannes?|casses?|abandons?|surchauffe|fuites?|reliability|reliable|failures?|retire[sd]?|retirement|dnf|boite de vitesses|gearbox|hydraulique|probleme technique|technical (issue|problem)|blown|incendie|fire)\b/,
  upgrade: /\b(evolutions?|nouvelles? (specification|version|spec|package|aileron|fond|piece)s?|ameliorations?|ameliore|upgrades?|upgraded|mise a jour|package|nouveautes?)\b/,
  pos: /\b(gains?|gagne|progres|progresse|plus rapide|en forme|domine|domination|dominante?|record|pole|victoire|vainqueur|remporte|triomphe|wins?|won|victory|dominant|dominates|fastest|quickest|boost|ameliore|ameliorations?|confiant|competitif|competitive|step forward|pas en avant|reussite|efficace|solide|leader|en tete|meilleur temps|upgrade)\b/,
  neg: /\b(deficit|manque|pertes?|perd|probleme|problemes|difficultes?|difficile|lutte|galere|souffre|crise|pannes?|casses?|abandons?|decevant|deception|recul|lent|lenteur|penalite|penalites|sanction|sanctionne|disqualifie|disqualification|struggles?|struggling|problems?|issues?|lack|slow|crisis|penalty|penalised|penalized|disqualified|blesse|blessure|malade|forfait|injur(y|ed)|ill(ness)?|accident|crash|sortie de piste|erreur|deficit|retard|handicap|inquietude|alerte|worry|concern|setback|surchauffe|fuite|fiasco|desastre|cauchemar|naufrage|disaster|nightmare|humiliation|calvaire)\b/,
  strong: /\b(gros|grosse|majeure?|important|importante|significati\w*|enorme|massive|major|big|huge|serieu\w*|grave|catastroph\w*|\d{2}\s?ch|\d{2}\s?hp|\d+\s?dixiemes?|\d+(,\d+)?\s?s(econdes?)? (au|par) tour)\b/,
  injury: /\b(blesse|blessure|malade|maladie|forfait|injur(y|ed)|illness|hopital|hospital|fracture|commotion)\b/,
  contract: /\b(contrat|contract|deal|signe|signature|transfert|mercato|rumeur|piste|baquet|volant|remplace|remplacant|replaced|confirme|confirmed|titularise|prolong\w*|extension|salaire|salary|202[7-9]|2030)\b/,
  form: /\b(crise|domine|domination|doubles?|victoire|triomphe|fiasco|desastre|catastroph\w*|naufrage|cauchemar|crisis|dominat\w*|one-two|disaster|nightmare)\b/,
  other: /\b(motogp|moto ?gp|wec|hypercar|indycar|nascar|rallye|wrc|dakar|endurance|le mans|formule e|formula e|superbike|moto2|moto3)\b/,
  gridpen: /(penalite\w* (de |sur la )?(grille|\d+ places?)|recul\w* (de \d+ places )?sur la grille|grid penalty|place grid|depart (du fond|des stands|depuis la voie des stands)|pit ?lane start|back of the grid)/,
  driverPos: /\b(pole|victoire|vainqueur|remporte|triomphe|wins?|won|victory|domine|dominates|en forme|record|meilleur temps|fastest|quickest|confiant|leader|en tete|podium)\b/,
  driverNeg: /\b(erreur|crash|accident|sortie de piste|tete-a-queue|spin|mistake|penalite|penalty|sanction|disqualifie|disqualified|difficile|lutte|struggl\w*|decevant|deception)\b/,
  rules: /\b(fia|reglement\w*|directive\w*|commissaires?|stewards?|regulations?|budget cap|plafond budgetaire|enquete|investigation|homologation|protest|reclamation|sanction|penalite|penalty|interdi\w*|ban(ned)?|legal\w*)\b/,
  weather: /\b(pluie|pluvieux|meteo|orages?|averses?|rain|wet|storm|weather|chaleur|canicule|froid|vent|typhon|typhoon|neige|grele|inondation|flood)\b/,
  f1: /\b(f1|formule 1|formula 1|formula one|grand prix|gp)\b/,
};
const count = (rx, t) => (t.match(new RegExp(rx.source, 'g')) || []).length;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function findTeams(t) {
  let s = t.replace(/ racing bulls /g, ' __rb__ ').replace(/ red bull powertrains /g, ' __rbpt__ ');
  const out = [];
  for (const [id, al] of Object.entries(TEAMS)) {
    const hit = al.some((a) => (id === 'rb' ? s.includes(' __rb__ ') || s.includes(` ${a} `) : s.includes(` ${a} `)));
    if (hit) out.push(id);
  }
  return out;
}
function findSuppliers(t) {
  const out = [];
  for (const [id, al] of Object.entries(SUPPLIER_ALIAS)) if (al.some((a) => t.includes(` ${a} `))) out.push(id);
  return out;
}

/* drivers : [{ id, family, teamId }] (grille actuelle, lue dans data/snapshot.json) */
export function analyze(item, drivers = []) {
  const t = norm(`${item.title} . ${item.title} . ${item.summary || ''}`); // le titre compte double
  const tt = norm(item.title);
  const teams = findTeams(t);
  const titleTeams = findTeams(tt);
  const sup = findSuppliers(t);
  const drv = drivers.filter((d) => d.key && t.includes(` ${d.key} `));
  const titleDrv = drv.filter((d) => tt.includes(` ${d.key} `));
  const has = (k) => RX[k].test(t);
  const pos = count(RX.pos, t) + (has('upgrade') ? 1 : 0), neg = count(RX.neg, t);
  const tone = pos > neg ? 1 : neg > pos ? -1 : 0;
  const mag = has('strong') ? 2 : 1;

  // catégorie
  const tech = has('engine') || has('aero') || has('reliab') || has('upgrade');
  let category = 'PADDOCK';
  if (has('weather') && !tech) category = 'MÉTÉO';
  else if (has('rules') && !(tech && tone)) category = 'RÈGLEMENT';
  else if (tech) category = 'TECHNIQUE';

  const impact = { targetType: null, targetIds: [], managerModifiers: { powerUnit: 0, aero: 0, reliability: 0 }, bettingOddsMultiplier: 1, impactLabel: '' };
  const M = impact.managerModifiers;

  // 1) pilote cité dans le titre : blessure, pénalité de grille, forme
  const mainTeams = titleTeams.length ? titleTeams : teams;
  // (transferts, contrats et rumeurs : pas d'effet sur la performance)
  const ttone = Math.sign(count(RX.pos, tt) - count(RX.neg, tt)) || tone;
  if (titleDrv.length === 1 && !RX.contract.test(tt) && (has('injury') || has('gridpen') || ((RX.driverPos.test(tt) || RX.driverNeg.test(tt)) && !tech))) {
    const d = titleDrv[0];
    impact.targetType = 'driver'; impact.targetIds = [d.id];
    if (has('injury') && tone <= 0) impact.bettingOddsMultiplier = 1.25;
    else if (has('gridpen')) impact.bettingOddsMultiplier = 1.15;
    else if (RX.driverPos.test(tt) && ttone > 0) impact.bettingOddsMultiplier = 0.95;
    else if (RX.driverNeg.test(tt) && ttone < 0) impact.bettingOddsMultiplier = 1.06;
    else impact.targetType = null;
    if (impact.targetType) { impact.teamId = d.teamId; if (category === 'TECHNIQUE') category = 'PADDOCK'; }
  }
  // 2) sujet technique sur 1 à 3 écuries (au-delà : article de synthèse, pas d'impact)
  if (!impact.targetType && tech && tone && !RX.contract.test(tt) && mainTeams.length >= 1 && mainTeams.length <= 3) {
    const eng = has('engine'), aero = has('aero') || has('upgrade'), rel = has('reliab');
    if (eng) M.powerUnit = tone * (mag === 2 ? 4 : 2);
    if (aero && !(eng && !RX.aero.test(t))) M.aero = tone * (mag === 2 ? 3 : 2);
    if (rel) M.reliability = tone < 0 ? -(mag === 2 ? 3 : 2) : 1;
    if (eng && tone < 0 && !rel && /\b(fiabilite|casse|panne)\b/.test(t)) M.reliability = -1;
    if (!M.powerUnit && !M.aero && !M.reliability) M.aero = tone;
    // moteur : l'information concerne aussi les écuries clientes du motoriste
    const makers = eng ? [...new Set([...mainTeams.filter((id) => SUPPLIERS[id]), ...sup])] : [];
    if (eng && makers.length === 1 && /\b(clients?|customers?|motoriste|bloc propulseur|unite de puissance|power unit|moteur \w+|engine supplier)\b/.test(t)) {
      impact.targetType = 'engine';
      impact.targetIds = [...new Set([...SUPPLIERS[makers[0]], ...mainTeams])];
    } else {
      impact.targetType = 'team';
      impact.targetIds = mainTeams;
    }
  }
  // 3) forme générale d'une écurie (victoire, crise...) sans détail technique
  if (!impact.targetType && !tech && tone && titleTeams.length === 1 && RX.form.test(tt) && !RX.contract.test(tt) && category === 'PADDOCK') {
    impact.targetType = 'team'; impact.targetIds = mainTeams;
    M.aero = tone; M.powerUnit = tone > 0 ? 1 : 0;
  }

  if (impact.targetType && impact.targetType !== 'driver') {
    const s = M.powerUnit + M.aero;
    impact.bettingOddsMultiplier = Math.round(clamp(1 - 0.04 * s - 0.02 * M.reliability, 0.82, 1.25) * 100) / 100;
  }
  if (!impact.targetType) return { category, impact: null };

  const lab = [];
  const sgn = (v) => (v > 0 ? '+' : '') + v;
  if (M.powerUnit) lab.push(`Moteur ${sgn(M.powerUnit)} pts`);
  if (M.aero) lab.push(`Aéro ${sgn(M.aero)} pts`);
  if (M.reliability) lab.push(`Fiabilité ${sgn(M.reliability)} pt${Math.abs(M.reliability) > 1 ? 's' : ''}`);
  const pc = Math.round((impact.bettingOddsMultiplier - 1) * 100);
  if (pc) lab.push(`Cotes ${pc > 0 ? '+' : ''}${pc}%`);
  impact.impactLabel = lab.join(' | ');
  return { category, impact };
}

// strict = flux généraliste (toutes disciplines) : la F1 doit être explicitement citée
export function isF1(item, drivers = [], strict = true) {
  const t = norm(`${item.title} ${item.summary}`), tt = norm(item.title);
  if (RX.other.test(tt) || /\b(f2|f3|formule 2|formule 3)\b/.test(tt)) return /\b(f1|formule 1)\b/.test(tt); // autre championnat dans le titre
  if (!strict) return true;
  return /\b(f1|formule 1|formula 1|formula one)\b/.test(t) || findTeams(tt).length > 0 || drivers.some((d) => tt.includes(` ${d.key} `));
}
// Langue : anglais si les mots outils anglais dominent
const EN = /\b(the|and|after|with|for|to|of|his|her|as|says|over|from|into|why|how|what|who|is|was|has|be|at|on|in)\b/g;
const FR = /\b(le|la|les|des|du|de|et|pour|sur|une|un|est|a|au|aux|son|sa|ses|qui|que|dans|avec|pas|ne|se|il|elle)\b/g;
export const isEnglish = (item) => { const t = norm(item.title + ' ' + (item.summary || '').slice(0, 200)); return (t.match(EN) || []).length > (t.match(FR) || []).length; };
export const driverKeys = (list) => list.map((d) => ({ ...d, key: norm(d.family).trim() })).filter((d) => d.key.length >= 4);
