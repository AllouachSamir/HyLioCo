/* HyLioCo — compteur de visiteurs.
   Chaque navigateur n'est compté qu'une fois.
   1. Compteur du site (/api/visites) s'il est configuré sur Vercel (base Upstash reliée au projet).
   2. Sinon, compteur public gratuit Abacus (aucune configuration nécessaire).
   Si aucun ne répond, le compteur reste simplement masqué. */
(() => {
  'use strict';
  const box = document.getElementById('compteur');
  if (!box || !window.fetch) return;
  const KEY = 'hylioco-visiteur-compte';

  let nouveau = true;
  try { nouveau = !localStorage.getItem(KEY); } catch (e) { nouveau = false; }

  function getJSON(url, options) {
    const ctrl = window.AbortController ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), 6000);
    return fetch(url, { ...options, signal: ctrl && ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .finally(() => clearTimeout(timer));
  }

  const sources = [
    () => getJSON('/api/visites', { method: nouveau ? 'POST' : 'GET' }).then(d => Number(d.visiteurs)),
    () => getJSON(`https://abacus.jasoncameron.dev/${nouveau ? 'hit' : 'get'}/hylioco-com/visiteurs`).then(d => Number(d.value)),
  ];

  function show(n) {
    if (nouveau) { try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ } }
    document.getElementById('compteur-nombre').textContent = n.toLocaleString('fr-FR');
    document.getElementById('compteur-texte').textContent =
      n > 1 ? 'visiteurs attendent déjà le lancement' : 'visiteur attend déjà le lancement';
    box.hidden = false;
  }

  (async () => {
    for (const source of sources) {
      try {
        const n = await source();
        if (n > 0) return show(n);
      } catch (e) { /* source suivante */ }
    }
  })();
})();
