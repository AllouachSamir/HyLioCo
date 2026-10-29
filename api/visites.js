// Compteur de visiteurs et journal des visites HyLioCo — fonction Vercel (/api/visites)
// GET  : renvoie le nombre de visiteurs
// POST : note la visite dans le journal (IP, date, lieu, navigateur) ;
//        { nouveau: true } compte en plus un nouveau visiteur. Renvoie le total.
// Le journal garde une liste par jour, effacée automatiquement au bout de 6 mois.
// Il se consulte sur la page admin.html (voir api/journal.js).

const { configure, redis, redisLot, ipDe, lieuDe, jourDe, corpsDe } = require('./_redis');

const KEY = 'hylioco:visiteurs';
const JOURNAL = 'hylioco:journal:';            // + AAAA-MM-JJ
const CONSERVATION = 183 * 24 * 3600;         // 6 mois, en secondes
const MAX_PAR_JOUR = 5000;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }
  if (!configure()) {
    return res.status(503).json({ erreur: 'Compteur non configuré' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ visiteurs: Number(await redis(['GET', KEY])) || 0 });
    }

    const nouveau = corpsDe(req).nouveau === true;
    const maintenant = Date.now();
    const visite = {
      d: maintenant,
      ip: ipDe(req),
      ...lieuDe(req),
      nav: String(req.headers['user-agent'] || '').slice(0, 300),
      nouveau,
    };
    const cle = JOURNAL + jourDe(maintenant);
    const [total] = await redisLot([
      nouveau ? ['INCR', KEY] : ['GET', KEY],
      ['RPUSH', cle, JSON.stringify(visite)],
      ['LTRIM', cle, -MAX_PAR_JOUR, -1],
      ['EXPIRE', cle, CONSERVATION],
    ]);
    return res.status(200).json({ visiteurs: Number(total) || 0 });
  } catch (e) {
    return res.status(502).json({ erreur: 'Compteur indisponible' });
  }
};
