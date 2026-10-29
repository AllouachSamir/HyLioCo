// Administration HyLioCo — fonction Vercel (/api/journal), utilisée par la page admin.html
// Accès réservé : en-tête « Authorization: Bearer <clé> », la clé étant la variable
// d'environnement HYLIOCO_CLE_ADMIN du projet Vercel. Dix essais ratés bloquent l'IP 15 min.
// GET ?jours=7 : visiteurs, record mondial complet et visites des N derniers jours (183 au plus)
// POST { action: 'effacer-record' } : efface le record mondial (score douteux…)

const { configure, redis, redisLot, objetDe, ipDe, jourDe, corpsDe, memeTexte } = require('./_redis');

const CLE_ADMIN = process.env.HYLIOCO_CLE_ADMIN || '';
const ECHECS = 'hylioco:echecs:';           // + IP
const MAX_ECHECS = 10;

// Les N derniers jours à Paris, du plus récent au plus ancien (AAAA-MM-JJ)
function derniersJours(n) {
  const midi = new Date(jourDe(Date.now()) + 'T12:00:00Z').getTime();
  return Array.from({ length: n }, (_, i) => new Date(midi - i * 86400000).toISOString().slice(0, 10));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }
  if (!configure()) {
    return res.status(503).json({ erreur: 'Base de données non reliée au projet Vercel' });
  }
  if (!CLE_ADMIN) {
    return res.status(503).json({ erreur: 'Clé d’accès non définie (variable HYLIOCO_CLE_ADMIN sur Vercel)' });
  }

  try {
    const ip = ipDe(req);
    if (Number(await redis(['GET', ECHECS + ip])) >= MAX_ECHECS) {
      return res.status(429).json({ erreur: 'Trop d’essais : réessayez dans 15 minutes' });
    }
    const cle = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!cle || !memeTexte(cle, CLE_ADMIN)) {
      await redisLot([['INCR', ECHECS + ip], ['EXPIRE', ECHECS + ip, 900]]);
      return res.status(401).json({ erreur: 'Clé d’accès incorrecte' });
    }

    if (req.method === 'POST') {
      if (corpsDe(req).action !== 'effacer-record') return res.status(400).json({ erreur: 'Action inconnue' });
      await redis(['DEL', 'hylioco:record']);
      return res.status(200).json({ ok: true });
    }

    const n = Math.min(183, Math.max(1, parseInt((req.query && req.query.jours) || '7', 10) || 7));
    const jours = derniersJours(n);
    const [visiteurs, record, ...listes] = await redisLot([
      ['GET', 'hylioco:visiteurs'],
      ['HGETALL', 'hylioco:record'],
      ...jours.map(j => ['LRANGE', 'hylioco:journal:' + j, 0, -1]),
    ]);
    const lire = texte => { try { return JSON.parse(texte); } catch (e) { return null; } };
    const r = objetDe(record);
    delete r.jeton;
    return res.status(200).json({
      visiteurs: Number(visiteurs) || 0,
      record: r.score ? r : null,
      jours: jours.map((date, i) => ({ date, visites: (listes[i] || []).map(lire).filter(Boolean).reverse() })),
    });
  } catch (e) {
    return res.status(502).json({ erreur: 'Base de données indisponible' });
  }
};
