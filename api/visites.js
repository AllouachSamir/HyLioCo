// Compteur de visiteurs HyLioCo — fonction Vercel (/api/visites)
// GET  : renvoie le nombre de visiteurs
// POST : compte un nouveau visiteur et renvoie le total
// Stockage : base Redis Upstash reliée au projet Vercel (onglet Storage → Upstash for Redis).
// Vercel fournit alors automatiquement les variables KV_REST_API_URL et KV_REST_API_TOKEN.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'hylioco:visiteurs';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ erreur: 'Compteur non configuré' });
  }

  const command = req.method === 'POST' ? ['INCR', KEY] : ['GET', KEY];
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
    const data = await r.json();
    return res.status(200).json({ visiteurs: Number(data.result) || 0 });
  } catch (e) {
    return res.status(502).json({ erreur: 'Compteur indisponible' });
  }
};
