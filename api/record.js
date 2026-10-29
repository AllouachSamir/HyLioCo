// Record mondial de « La traversée du lion » — fonction Vercel (/api/record)
// GET  : renvoie le record { score, nom, date } (score 0 tant que personne n'a joué)
// POST { score, distance, pieces, duree, nom } : propose le score d'une partie terminée.
//      S'il bat le record, il le remplace et la réponse contient un jeton
//      qui permet de changer le nom affiché pendant 15 minutes.
// POST { jeton, nom } : donne son nom au record qu'on vient de battre.
// Le jeu tourne dans le navigateur : ces contrôles écartent les erreurs et les tricheries
// grossières, pas un tricheur déterminé. La page admin.html permet d'effacer un record.

const crypto = require('crypto');
const { configure, redis, redisLot, objetDe, ipDe, corpsDe } = require('./_redis');

const KEY = 'hylioco:record';
const ATTENTE = 'hylioco:attente:';        // + IP : un score toutes les 3 s au plus
const DELAI_NOM = 15 * 60 * 1000;
const NOM_MAX = 20;
const ANONYME = 'Anonyme';

// Remplace le record si le score le bat, en une seule opération (deux joueurs peuvent finir en même temps)
const BATTRE = `
local actuel = tonumber(redis.call('HGET', KEYS[1], 'score') or '0')
if tonumber(ARGV[1]) <= actuel then return 0 end
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'score', ARGV[1], 'nom', ARGV[2], 'date', ARGV[3], 'jeton', ARGV[4],
  'ip', ARGV[5], 'distance', ARGV[6], 'pieces', ARGV[7], 'duree', ARGV[8])
return 1`;

// Change le nom si le jeton est celui du record actuel et qu'il n'a pas expiré
const NOMMER = `
if redis.call('HGET', KEYS[1], 'jeton') ~= ARGV[1] then return 0 end
if tonumber(redis.call('HGET', KEYS[1], 'date') or '0') < tonumber(ARGV[3]) then return 0 end
redis.call('HSET', KEYS[1], 'nom', ARGV[2])
return 1`;

// Nom affiché : sans caractères invisibles, espaces resserrés, 20 caractères au plus
function nettoyerNom(nom) {
  const propre = String(nom || '').normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(propre).slice(0, NOM_MAX).join('').trim() || ANONYME;
}

const publicDe = r => ({ score: Number(r.score) || 0, nom: r.nom || '', date: Number(r.date) || 0 });

// Un score possible pour la durée de la partie (le lion court à 91 m/s au plus)
function scoreValide(score, distance, pieces, duree) {
  return Number.isInteger(score) && score >= 1 && score <= 10000000
    && duree >= 1 && duree <= 36000
    && distance >= 0 && distance <= 100 * duree + 100
    && Number.isInteger(pieces) && pieces >= 0 && pieces <= 10 * duree + 10
    && score <= 160 * duree + 500;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }
  if (!configure()) {
    return res.status(503).json({ erreur: 'Record non configuré' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json(publicDe(objetDe(await redis(['HGETALL', KEY]))));
    }

    const b = corpsDe(req);
    const nom = nettoyerNom(b.nom);

    if (typeof b.jeton === 'string') {
      const limite = String(Date.now() - DELAI_NOM);
      const [ok, actuel] = await redisLot([
        ['EVAL', NOMMER, '1', KEY, b.jeton.slice(0, 64), nom, limite],
        ['HGETALL', KEY],
      ]);
      if (ok !== 1) return res.status(403).json({ erreur: 'Ce record ne peut plus être renommé' });
      return res.status(200).json({ record: publicDe(objetDe(actuel)) });
    }

    const score = Number(b.score), distance = Number(b.distance), pieces = Number(b.pieces), duree = Number(b.duree);
    if (!scoreValide(score, distance, pieces, duree)) {
      return res.status(400).json({ erreur: 'Score refusé' });
    }
    const ip = ipDe(req);
    if (await redis(['SET', ATTENTE + ip, '1', 'PX', '3000', 'NX']) !== 'OK') {
      return res.status(429).json({ erreur: 'Trop de scores envoyés, réessayez dans un instant' });
    }

    const jeton = crypto.randomBytes(16).toString('hex');
    const [battu, actuel] = await redisLot([
      ['EVAL', BATTRE, '1', KEY, String(score), nom, String(Date.now()), jeton,
        ip, String(Math.round(distance)), String(pieces), String(Math.round(duree))],
      ['HGETALL', KEY],
    ]);
    const reponse = { battu: battu === 1, record: publicDe(objetDe(actuel)) };
    if (battu === 1) reponse.jeton = jeton;
    return res.status(200).json(reponse);
  } catch (e) {
    return res.status(502).json({ erreur: 'Record indisponible' });
  }
};
