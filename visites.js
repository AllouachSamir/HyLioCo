/* HyLioCo — affichage du compteur de visiteurs.
   Chaque navigateur n'est compté qu'une fois ; le compteur reste caché si l'API ne répond pas. */
(() => {
  'use strict';
  const box = document.getElementById('compteur');
  if (!box || !window.fetch) return;
  const KEY = 'hylioco-visiteur-compte';

  let nouveau = true;
  try { nouveau = !localStorage.getItem(KEY); } catch (e) { nouveau = false; }

  fetch('/api/visites', { method: nouveau ? 'POST' : 'GET' })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const n = data && Number(data.visiteurs);
      if (!n) return;
      if (nouveau) { try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ } }
      document.getElementById('compteur-nombre').textContent = n.toLocaleString('fr-FR');
      document.getElementById('compteur-texte').textContent =
        n > 1 ? 'visiteurs attendent déjà le lancement' : 'visiteur attend déjà le lancement';
      box.hidden = false;
    })
    .catch(() => { /* compteur indisponible : on n'affiche rien */ });
})();
