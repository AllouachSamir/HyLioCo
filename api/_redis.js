// Outils communs aux fonctions /api de HyLioCo.
// Le « _ » au début du nom empêche Vercel d'en faire une adresse publique.
// Stockage : base Redis Upstash reliée au projet Vercel (onglet Storage → Upstash for Redis).
// Vercel fournit alors automatiquement les variables KV_REST_API_URL et KV_REST_API_TOKEN.

const crypto = require('crypto');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const configure = () => Boolean(REDIS_URL && REDIS_TOKEN);

async function envoyer(chemin, corps) {
  const r = await fetch(REDIS_URL + chemin, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  return r.json();
}

// Une commande : redis(['GET', 'clé']) → résultat
async function redis(commande) {
  const data = await envoyer('', commande);
  if (data.error) throw new Error(data.error);
  return data.result;
}

// Plusieurs commandes en un seul aller-retour → tableau des résultats
async function redisLot(commandes) {
  const data = await envoyer('/pipeline', commandes);
  return data.map(d => {
    if (d.error) throw new Error(d.error);
    return d.result;
  });
}

// Réponse de HGETALL ([champ, valeur, champ, valeur…]) → objet
function objetDe(liste) {
  if (liste && !Array.isArray(liste)) return { ...liste };
  const o = {};
  for (let i = 0; i + 1 < (liste || []).length; i += 2) o[liste[i]] = liste[i + 1];
  return o;
}

// Adresse IP du visiteur : Vercel la place dans x-real-ip et x-forwarded-for
function ipDe(req) {
  const h = req.headers;
  const ip = h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '';
  return String(ip).trim().slice(0, 64) || 'inconnue';
}

// Pays, région et ville déduits de l'IP par Vercel
function lieuDe(req) {
  const h = req.headers;
  const lire = nom => {
    try { return decodeURIComponent(String(h[nom] || '')).slice(0, 80); } catch (e) { return ''; }
  };
  return { pays: lire('x-vercel-ip-country'), region: lire('x-vercel-ip-country-region'), ville: lire('x-vercel-ip-city') };
}

// Date du jour à Paris, AAAA-MM-JJ (une liste de visites par jour)
function jourDe(ms) {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(ms));
}

// Corps JSON de la requête (Vercel le décode ; une requête mal formée donne {})
function corpsDe(req) {
  try {
    const b = req.body;
    if (b && typeof b === 'object') return b;
    if (typeof b === 'string' && b) return JSON.parse(b);
  } catch (e) { /* corps illisible */ }
  return {};
}

// Comparaison à temps constant (clé d'accès à l'administration)
function memeTexte(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { configure, redis, redisLot, objetDe, ipDe, lieuDe, jourDe, corpsDe, memeTexte };
