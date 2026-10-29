/* HyLioCo — mini-jeu « La traversée du lion »
   Un seul geste : Espace, ↑ ou toucher l'écran pour sauter ; appuyer de nouveau en l'air = double saut.
   ↓ : redescendre plus vite · P ou Échap : pause.
   Dépend de lion.js (le lion), decor.js (la savane) et sons.js (les sons). */
(() => {
  'use strict';

  const frameEl = document.getElementById('jeu-cadre');
  const canvas = document.getElementById('jeu-canvas');
  if (!canvas || !frameEl || !window.HyLion || !window.HyDecor) return;
  const ctx = canvas.getContext('2d');
  const sons = window.HySons || { unlock() {}, play() {}, setMuted() {}, isMuted: () => true };
  const $ = id => document.getElementById(id);
  const ui = {
    score: $('hud-score'), record: $('hud-record'), vies: $('hud-vies'), pieces: $('hud-pieces'), effets: $('hud-effets'),
    banniere: $('jeu-banniere'), toast: $('jeu-toast'),
    debut: $('ecran-debut'), pause: $('ecran-pause'), fin: $('ecran-fin'),
    finScore: $('fin-score'), finDistance: $('fin-distance'), finPieces: $('fin-pieces'), finRecord: $('fin-record'), finNouveau: $('fin-nouveau'),
    btnJouer: $('btn-jouer'), btnRejouer: $('btn-rejouer'), btnPartager: $('btn-partager'), btnReprendre: $('btn-reprendre'),
    btnSon: $('btn-son'), btnPause: $('btn-pause'), btnEcran: $('btn-plein-ecran'),
    recordBas: $('jeu-record'), messageBas: $('jeu-message'),
    mondial: $('hud-mondial'), mondialScore: $('hud-mondial-score'),
    debutMondial: $('debut-mondial'), debutMondialScore: $('debut-mondial-score'), debutMondialNom: $('debut-mondial-nom'),
    finMondial: $('fin-mondial'), finMondialStat: $('fin-mondial-stat'), finMondialScore: $('fin-mondial-score'),
    finNom: $('fin-nom'), finNomChamp: $('fin-nom-champ'), finNomEtat: $('fin-nom-etat'),
    basMondial: $('jeu-mondial'), basMondialScore: $('jeu-mondial-score'), basMondialNom: $('jeu-mondial-nom'),
  };
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Outils ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const chance = p => Math.random() < p;
  const fmt = n => Math.max(0, Math.floor(n)).toLocaleString('fr-FR');
  function pickWeighted(list) {
    let r = Math.random() * list.reduce((s, it) => s + it.w, 0);
    for (const it of list) if ((r -= it.w) < 0) return it;
    return list[list.length - 1];
  }
  const rectHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function circleRect(cx, cy, r, b) {
    const nx = clamp(cx, b.x, b.x + b.w), ny = clamp(cy, b.y, b.y + b.h);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- Réglages ---------- */
  const MIN_W = 460, MIN_H = 300;                 // fenêtre minimale sur le monde (unités)
  const LION_S = 0.46;                             // échelle du lion (dessiné dans une boîte 207 × 136)
  const LION_W = HyLion.W * LION_S, LION_H = HyLion.H * LION_S;
  const LION_X = 40;
  const G_UP = 2600, G_DOWN = 3500, FAST_FALL = 5200;
  const JUMP_V = 800, DOUBLE_V = 690, JUMP_CUT = 320, MIN_RISE = 36;
  const BUFFER = 0.14;                             // un appui juste avant d'atterrir compte quand même
  const MAX_LIVES = 3;
  const UNITS_PER_M = 10;
  const GOLD = '#F5B700', RED = '#E2554B', IVORY = '#F7F3EA', NAVY = '#0A2342';
  const FONT = '"Outfit", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // zones de collision du lion (repère du dessin 207 × 136) : corps, tête et crinière, pattes
  const LION_BOXES = [[40, 52, 110, 40], [150, 18, 48, 48], [58, 96, 96, 30]];

  const KINDS = {
    rocher: { w: 40, h: 28 },
    grosRocher: { w: 58, h: 42 },
    buisson: { w: 48, h: 36 },
    tronc: { w: 84, h: 30 },
    termitiere: { w: 38, h: 66 },
    piege: { w: 34, h: 14 },
    sables: { w: 120, h: 6, soft: true },
    cratere: { w: 60, h: 30 },
    vautour: { w: 52, h: 24, fly: true },
  };

  /* ---------- Monde ---------- */
  let W = 640, H = 300, GROUND = 248, scale = 1;
  let decor = null;

  let state = 'ready';            // ready | running | paused | dying | over
  let t = 0, runTime = 0, dyingTimer = 0, overAt = 0;
  let speed = 0, dist = 0, bonus = 0, coinCount = 0, lives = MAX_LIVES, lastScore = 0;
  let lion = null;
  let obstacles = [], coins = [], boxes = [], meteors = [], sparks = [], dusts = [], popups = [];
  let effects = {};
  let nextPattern = 0, level = 0, lastPhase = 0, milestone = 0, recordAnnounced = false;
  let invulnUntil = 0, shakeUntil = 0, shakeAmp = 0, flashUntil = 0, hitStop = 0;
  let jumpHeld = false, jumpBuffer = 0, downHeld = false;
  let groups = new Map(), groupId = 0;
  let lastScoreShown = -1, lastBestShown = -1, dustTimer = 0;
  let cheatInvincible = false;
  let triche = false;             // outils de test utilisés : plus aucun score envoyé au record mondial

  const KEY_BEST = 'hylioco-record';
  let best = 0;
  try { best = parseInt(localStorage.getItem(KEY_BEST), 10) || 0; } catch (e) { /* stockage indisponible */ }

  // record mondial (api/record.js) : null tant que le serveur n'a pas répondu
  const KEY_NOM = 'hylioco-nom';
  let mondial = null, mondialAnnonce = false, lastMondialShown = -1;
  let partie = 0, jetonNom = null;
  let monNom = '';
  try { monNom = localStorage.getItem(KEY_NOM) || ''; } catch (e) { /* stockage indisponible */ }

  const meters = () => dist / UNITS_PER_M;
  const score = () => Math.max(0, Math.floor(meters() + bonus));
  const speedK = () => clamp(W / 640, 0.82, 1);
  const baseSpeed = () => (300 + 400 * (1 - Math.exp(-runTime / 95))) * speedK();
  const gapBetween = () => speed * 0.62 + rand(10, 70);         // espace pour atterrir puis ressauter
  const gapAfter = () => speed * rand(0.75, 1.2) + 120;         // respiration entre deux séquences
  const tod = () => (0.03 + meters() / 2600) % 1;               // heure du jour (avance avec la distance)
  const has = name => !!effects[name] && effects[name].until > t;
  const lionTop = () => GROUND - LION_H - lion.alt + (has('enlise') && lion.ground ? 5 : 0);

  function newLion() {
    return { x: LION_X, alt: 0, v: 0, ground: true, jumps: 0, jumpFrom: 0, phase: 0, air: 0, run: 0,
      strands: HyLion.makeStrands(), simAcc: 0 };
  }

  /* ---------- Taille du canvas ---------- */
  function resize() {
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(cssW / MIN_W, cssH / MIN_H);
    W = cssW / scale;
    H = cssH / scale;
    GROUND = H - 52;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    if (!decor) decor = HyDecor.create(W, H, GROUND);
    else HyDecor.resize(decor, W, H, GROUND);
    if (!running) draw();
  }

  /* ---------- Séquences d'obstacles ---------- */
  function addObstacle(kind, x, extra) {
    const k = KINDS[kind];
    const o = { kind, x, w: k.w, h: k.h, alt: 0, soft: !!k.soft, fly: !!k.fly, seed: Math.random(), ...extra };
    if (kind === 'rocher' || kind === 'grosRocher') o.shape = rockShape(o.w, o.h);
    obstacles.push(o);
    return o;
  }
  function addBird(x, high) {
    return addObstacle('vautour', x, { alt: high ? 80 : 24, high, flap: rand(0, 6) });
  }
  function newGroup(n) {
    groups.set(++groupId, { total: n, got: 0 });
    return groupId;
  }
  function coinLine(x, n, alt) {
    const gid = newGroup(n);
    for (let i = 0; i < n; i++) coins.push({ x: x + i * 24, alt, r: 7, gid, ph: i * 0.5 });
    return (n - 1) * 24 + 14;
  }
  function coinArc(cx, base, n, rise) {
    const gid = newGroup(n), half = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const k = (i - half) / half;
      coins.push({ x: cx + (i - half) * 22, alt: base + rise * (1 - k * k), r: 7, gid, ph: i * 0.5 });
    }
  }
  function addBox(x, alt) {
    boxes.push({ x, alt, size: 28, ph: rand(0, 6) });
    return 28;
  }
  // une météorite : son point d'impact défile avec le sol ; sa chute avance au même rythme,
  // si bien qu'elle touche toujours le sol bien devant le lion (au point « land »), quelle que soit la vitesse.
  // Renvoie la position du point d'impact (centre du futur cratère).
  function addMeteor(x) {
    const land = clamp(W * 0.6, LION_X + LION_W + 200, W - 50);
    const tx = Math.max(x, land + speed * 1.05);   // au moins ~1 s de chute
    meteors.push({ tx, tx0: tx, land, r: rand(9, 12), ox: rand(90, 170), whistle: false, ember: 0 });
    return tx;
  }
  function meteorRow(x, n) {
    let end = x;
    for (let i = 0; i < n; i++) end = addMeteor(end + 30 + (i ? gapBetween() : 0)) + 30;
    return end - x;
  }
  function furthestEnd() {
    let end = 0;
    for (const o of obstacles) end = Math.max(end, o.x + o.w);
    for (const m of meteors) end = Math.max(end, m.tx + 30);
    return end;
  }

  const PATTERNS = [
    // niveau 0 : rochers, buissons, pièces
    { lvl: 0, w: 4, make: x => { addObstacle('rocher', x); if (chance(0.45)) coinArc(x + 20, 34, 5, 62); return 40; } },
    { lvl: 0, w: 3, make: x => { addObstacle('buisson', x); return 48; } },
    { lvl: 0, w: 2, make: x => coinLine(x, 6, 0) },
    { lvl: 0, w: 1.4, make: x => coinLine(x, 5, 92) },
    // niveau 1 : gros rochers, troncs, boîtes mystère, pièges appâtés
    { lvl: 1, w: 3, make: x => { addObstacle('grosRocher', x); coinArc(x + 29, 48, 5, 70); return 58; } },
    { lvl: 1, w: 2.4, make: x => { addObstacle('tronc', x); return 84; } },
    { lvl: 1, w: 2.2, make: x => addBox(x, 100) },
    { lvl: 1, w: 1.6, make: x => { const l = coinLine(x, 4, 0); addObstacle('piege', x + l + 10); return l + 10 + 34; } },
    // niveau 2 : enchaînements, termitières, vautours, sables mouvants
    { lvl: 2, w: 2.4, make: x => { const g = gapBetween(); addObstacle('rocher', x); addObstacle('buisson', x + 40 + g); return 40 + g + 48; } },
    { lvl: 2, w: 2, make: x => { addObstacle('termitiere', x); coinArc(x + 19, 74, 5, 70); return 38; } },
    { lvl: 2, w: 2, make: x => { addBird(x, false); return 52; } },
    { lvl: 2, w: 1.6, make: x => { addBird(x + 70, true); coinLine(x, 6, 0); return 180; } },
    { lvl: 2, w: 1.6, make: x => { addObstacle('sables', x); return 120; } },
    { lvl: 2, w: 1.4, make: x => { addBox(x, 100); const g = gapBetween(); addObstacle('rocher', x + 28 + g); return 28 + g + 40; } },
    // niveau 3 : météorites
    { lvl: 3, w: 3, make: x => addMeteor(x + 30) + 30 - x },
    { lvl: 3, w: 1.6, make: x => { const end = addMeteor(x + 30) + 30, g = gapBetween(); addObstacle('rocher', end + g); return end + g + 40 - x; } },
    { lvl: 3, w: 1.4, make: x => { const g = gapBetween(); addObstacle('tronc', x); addBird(x + 84 + g + 60, true); return 84 + g + 120; } },
    // niveau 4 : rafales
    { lvl: 4, w: 2, make: x => meteorRow(x, 3) },
    { lvl: 4, w: 1.6, make: x => {
      const g1 = gapBetween(), g2 = gapBetween();
      addObstacle('buisson', x); addObstacle('rocher', x + 48 + g1); addObstacle('rocher', x + 48 + g1 + 40 + g2);
      return 48 + g1 + 40 + g2 + 40;
    } },
  ];
  const LEVELS = [0, 140, 420, 850, 1500];   // mètres
  const LEVEL_TEXT = [
    null,
    'Boîtes mystère : récompense… ou piège !',
    'Attention aux vautours et aux sables mouvants',
    'Pluie de météorites en approche !',
    'Accrochez-vous, la savane s’emballe !',
  ];

  function spawnPattern() {
    const pool = PATTERNS.filter(p => p.lvl <= level).map(p => ({ ...p, w: p.w * (p.lvl === level && level > 0 ? 1.4 : 1) }));
    const p = pickWeighted(pool);
    const x = Math.max(W + 30, furthestEnd() + 40);
    const len = p.make(x);
    nextPattern = (x - W) + len + gapAfter();
  }

  /* ---------- Boîtes mystère ---------- */
  const OUTCOMES = [
    { w: 3, good: true, run: () => { setEffect('bouclier', 10); return 'Bouclier !'; } },
    { w: 2.4, good: true, run: () => { setEffect('aimant', 10); return 'Aimant à pièces !'; } },
    { w: 2.4, good: true, run: () => { setEffect('x2', 10); return 'Points ×2 !'; } },
    { w: 1.6, good: true, run: () => {
      if (lives < MAX_LIVES) { lives++; renderLives(); return '+1 vie !'; }
      bonus += 100; return '+100 points !';
    } },
    { w: 1.8, good: true, run: () => { bonus += 100; return '+100 points !'; } },
    { w: 2, good: false, run: () => { meteorShower(); return 'Piège : pluie de météorites !'; } },
    { w: 1.6, good: false, run: () => { setEffect('tempete', 6); return 'Piège : tempête de sable !'; } },
    { w: 1.6, good: false, run: () => { setEffect('rapide', 5); return 'Piège : accélération !'; } },
    { w: 1.2, good: false, run: () => { bonus -= 50; return 'Piège : −50 points'; } },
  ];
  function meteorShower() {
    const x = Math.max(W + 40, furthestEnd() + gapBetween());
    const len = meteorRow(x, 3);
    nextPattern = Math.max(nextPattern, (x - W) + len + gapAfter());
  }
  function openBox(b) {
    const o = pickWeighted(OUTCOMES);
    const label = o.run();
    const y = GROUND - b.alt - b.size / 2;
    burst(b.x + b.size / 2, y, o.good ? [GOLD, '#FFE58A', IVORY] : [RED, '#FF9B5A', '#3A2A2A'], 26, 220);
    popup(b.x + b.size / 2, y - 18, label, o.good ? GOLD : RED, 15);
    banner(label, o.good ? 'bon' : 'mauvais');
    sons.play(o.good ? 'bonus' : 'piege');
    vibrate(o.good ? 20 : 60);
  }

  /* ---------- Effets temporaires ---------- */
  const EFFECTS = {
    bouclier: { label: 'Bouclier', good: true, icon: 'M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z' },
    aimant: { label: 'Aimant', good: true, icon: 'M5 3h4v8a3 3 0 006 0V3h4v8a7 7 0 01-14 0z' },
    x2: { label: 'Points ×2', good: true, icon: 'M5 7l6 10M11 7L5 17M14 9a3 3 0 016 0c0 3-6 4-6 8h6' },
    enlise: { label: 'Enlisé', good: false, icon: 'M3 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2M3 20c3 0 3-2 6-2s3 2 6 2 3-2 6-2M12 3v7m-3-3l3 3 3-3' },
    tempete: { label: 'Tempête', good: false, icon: 'M3 8h11a3 3 0 10-3-3M3 12h15a3 3 0 11-3 3M3 16h8' },
    rapide: { label: 'Accélération', good: false, icon: 'M4 6l6 6-6 6M12 6l6 6-6 6' },
  };
  function setEffect(name, seconds) {
    effects[name] = { until: t + seconds, total: seconds };
    renderEffects();
  }

  /* ---------- Particules et textes ---------- */
  function burst(x, y, colors, n, power) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(power * 0.25, power);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.25, r: rand(1.4, 3.4),
        life: rand(0.35, 0.8), max: 0.8, color: colors[i % colors.length], g: 520 });
    }
  }
  function ring(x, y, color) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      sparks.push({ x, y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, r: 2.2, life: 0.4, max: 0.4, color, g: 0 });
    }
  }
  function dust(x, y, n, power = 60) {
    for (let i = 0; i < n; i++) {
      dusts.push({ x: x + rand(-10, 10), y: y - rand(0, 3), vx: rand(-power, power * 0.3) - speed * 0.25, vy: rand(-power * 0.8, -8),
        r: rand(2, 4.5), life: rand(0.35, 0.65), max: 0.65 });
    }
  }
  function popup(x, y, text, color, size = 13) {
    x = clamp(x, 60, W - 60);
    const near = popups.filter(p => p.life > 0.7 && Math.abs(p.x - x) < 70).length;
    if (near >= 3) return;   // pas plus de trois messages empilés au même endroit
    popups.push({ x, y: y - near * 17, text, color, size, life: 1.15 });
  }
  function shake(duration, amp) {
    if (reduceMotion) return;
    shakeUntil = Math.max(shakeUntil, t + duration);
    shakeAmp = Math.max(shakeAmp, amp);
  }
  function vibrate(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  }

  /* ---------- Interface (HUD, bandeaux, écrans) ---------- */
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.4-4.6-9.5-9.1C1 8.5 3.1 4.6 6.8 4.6c2.1 0 3.5 1.1 4.2 2.4.7-1.3 2.1-2.4 4.2-2.4 3.7 0 5.8 3.9 4.3 7.3C19.4 16.4 12 21 12 21z"/></svg>';
  let shownLives = -1;
  function renderLives() {
    if (!ui.vies || shownLives === lives) return;
    shownLives = lives;
    let html = '';
    for (let i = 0; i < MAX_LIVES; i++) html += `<span class="coeur${i < lives ? '' : ' vide'}">${HEART}</span>`;
    ui.vies.innerHTML = html;
  }
  function renderCoins() { if (ui.pieces) ui.pieces.textContent = coinCount; }
  let effectBars = {};
  function renderEffects() {
    if (!ui.effets) return;
    effectBars = {};
    ui.effets.textContent = '';
    for (const name of Object.keys(effects)) {
      if (!has(name)) continue;
      const def = EFFECTS[name];
      const el = document.createElement('span');
      el.className = 'effet' + (def.good ? '' : ' mauvais');
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${def.icon}"/></svg>${def.label}<i class="effet-barre"></i>`;
      ui.effets.appendChild(el);
      effectBars[name] = el.querySelector('.effet-barre');
    }
  }
  function updateEffects() {
    let changed = false;
    for (const name of Object.keys(effects)) {
      const e = effects[name];
      if (e.until <= t) { delete effects[name]; changed = true; continue; }
      const bar = effectBars[name];
      if (bar) bar.style.transform = `scaleX(${clamp((e.until - t) / e.total, 0, 1)})`;
    }
    if (changed) renderEffects();
  }
  function renderScore() {
    const s = score();
    if (ui.score && s !== lastScoreShown) { ui.score.textContent = fmt(s); lastScoreShown = s; }
    const b = Math.max(best, state === 'running' || state === 'dying' ? s : 0);
    if (ui.record && b !== lastBestShown) { ui.record.textContent = fmt(b); lastBestShown = b; }
    if (ui.mondialScore && mondial) {
      const m = Math.max(mondial.score, state === 'running' || state === 'dying' ? s : 0);
      if (m !== lastMondialShown) { ui.mondialScore.textContent = fmt(m); lastMondialShown = m; }
    }
  }
  let bannerTimer = 0;
  function banner(text, kind = '') {
    if (!ui.banniere) return;
    ui.banniere.textContent = text;
    ui.banniere.className = 'jeu-banniere visible' + (kind ? ' ' + kind : '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { ui.banniere.className = 'jeu-banniere' + (kind ? ' ' + kind : ''); }, 2300);
  }
  let toastTimer = 0;
  function toast(text) {
    if (!ui.toast) return;
    ui.toast.textContent = text;
    ui.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2200);
  }
  function showScreen(which) {
    for (const [name, el] of [['debut', ui.debut], ['pause', ui.pause], ['fin', ui.fin]]) if (el) el.hidden = name !== which;
    frameEl.classList.toggle('en-jeu', !which);
  }
  function showBestBelow(msg) {
    if (ui.recordBas) ui.recordBas.textContent = fmt(best);
    if (ui.messageBas) ui.messageBas.textContent = msg || '';
  }

  /* ---------- Record mondial ---------- */
  function api(url, corps) {
    const ctrl = window.AbortController ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), 8000);
    const options = corps ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) } : {};
    return fetch(url, { ...options, signal: ctrl && ctrl.signal })
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(d.erreur || 'HTTP ' + r.status), { status: r.status });
        return d;
      })
      .finally(() => clearTimeout(timer));
  }
  function setMondial(r) {
    if (!r || !(r.score >= 0)) return;
    mondial = { score: Math.floor(r.score), nom: String(r.nom || 'Anonyme') };
    const connu = mondial.score > 0;
    for (const el of [ui.mondial, ui.debutMondial, ui.finMondialStat, ui.basMondial]) if (el) el.hidden = !connu;
    for (const el of [ui.debutMondialScore, ui.finMondialScore, ui.basMondialScore]) if (el) el.textContent = fmt(mondial.score);
    for (const el of [ui.debutMondialNom, ui.basMondialNom]) if (el) el.textContent = mondial.nom;
    lastMondialShown = -1;
    renderScore();
  }
  function chargerMondial() {
    if (window.fetch) api('/api/record').then(setMondial).catch(() => { /* record mondial indisponible : rien à afficher */ });
  }
  function etatNom(texte, ok) {
    ui.finNomEtat.textContent = texte;
    ui.finNomEtat.classList.toggle('ok', !!ok);
  }
  function envoyerScore(s) {
    const numero = partie;
    const corps = { score: s, distance: Math.floor(meters()), pieces: coinCount, duree: Math.round(runTime * 10) / 10, nom: monNom };
    api('/api/record', corps).then(r => {
      setMondial(r.record);
      if (!r.battu || numero !== partie || state !== 'over') return;
      jetonNom = r.jeton;
      if (ui.finNouveau) ui.finNouveau.hidden = true;
      if (ui.finMondial) ui.finMondial.hidden = false;
      if (ui.finNom) {
        ui.finNomChamp.value = monNom;
        if (monNom) etatNom(`Record enregistré au nom de ${mondial.nom}.`, true);
        else etatNom('Votre nom au tableau d’honneur');
        ui.finNom.hidden = false;
      }
      showBestBelow(' — Record mondial !');
      sons.play('palier');
    }).catch(() => { /* score non envoyé : la partie reste comptée en local */ });
  }
  function nommerRecord(e) {
    e.preventDefault();
    if (!jetonNom) return;
    const nom = ui.finNomChamp.value.trim();
    etatNom('Enregistrement…');
    api('/api/record', { jeton: jetonNom, nom }).then(r => {
      monNom = nom;
      try { localStorage.setItem(KEY_NOM, nom); } catch (err) { /* ignore */ }
      setMondial(r.record);
      etatNom(`Record enregistré au nom de ${mondial.nom}.`, true);
      ui.finNomChamp.blur();
    }).catch(err => {
      etatNom(err.status === 403 ? 'Trop tard : ce record ne peut plus être renommé.' : 'Envoi impossible, réessayez.');
    });
  }

  /* ---------- Déroulement d'une partie ---------- */
  function startGame() {
    sons.unlock();
    sons.play('clic');
    state = 'running';
    t = 0; runTime = 0; dist = 0; bonus = 0; coinCount = 0; lives = MAX_LIVES;
    lion = newLion();
    lion.run = 0.4;
    obstacles = []; coins = []; boxes = []; meteors = []; sparks = []; dusts = []; popups = [];
    effects = {}; groups = new Map();
    speed = baseSpeed();
    nextPattern = 360; level = 0; lastPhase = 0; milestone = 0; recordAnnounced = false;
    partie++; mondialAnnonce = false; jetonNom = null;
    invulnUntil = 0; shakeUntil = 0; flashUntil = 0; hitStop = 0;
    jumpHeld = false; jumpBuffer = 0; downHeld = false;
    shownLives = -1; lastScoreShown = -1; lastBestShown = -1; lastMondialShown = -1;
    renderLives(); renderCoins(); renderEffects(); renderScore();
    showScreen(null);
    showBestBelow();
    chargerMondial();
    canvas.focus({ preventScroll: true });
    start();
  }
  function pauseGame() {
    if (state !== 'running') return;
    state = 'paused';
    jumpHeld = false; downHeld = false;
    showScreen('pause');
    setPauseIcon(true);
  }
  function resumeGame() {
    if (state !== 'paused') return;
    sons.unlock();
    state = 'running';
    showScreen(null);
    setPauseIcon(false);
    canvas.focus({ preventScroll: true });
    start();
  }
  function die() {
    state = 'dying';
    dyingTimer = 1.1;
    sons.play('fin');
  }
  function gameOver() {
    state = 'over';
    overAt = performance.now();
    const s = score();
    const isRecord = s > best;
    if (isRecord) {
      best = s;
      try { localStorage.setItem(KEY_BEST, String(best)); } catch (e) { /* ignore */ }
    }
    lastScore = s;
    if (ui.finScore) ui.finScore.textContent = fmt(s);
    if (ui.finDistance) ui.finDistance.textContent = fmt(meters()) + ' m';
    if (ui.finPieces) ui.finPieces.textContent = coinCount;
    if (ui.finRecord) ui.finRecord.textContent = fmt(best);
    if (ui.finNouveau) ui.finNouveau.hidden = !isRecord;
    if (ui.finMondial) ui.finMondial.hidden = true;
    if (ui.finNom) ui.finNom.hidden = true;
    showBestBelow(isRecord ? ' — Nouveau record !' : '');
    renderScore();
    showScreen('fin');
    if (mondial && s > mondial.score && !triche) envoyerScore(s);
  }

  let onHurt = null;   // outil de test
  function hurt(x, y, source) {
    if (invulnUntil > t || state !== 'running' || cheatInvincible) return;
    if (onHurt) onHurt(source);
    hitStop = 0.07;
    shake(0.3, 6);
    flashUntil = t + 0.2;
    if (has('bouclier')) {
      delete effects.bouclier;
      renderEffects();
      invulnUntil = t + 1.1;
      popup(x, y - 10, 'Bouclier brisé', GOLD);
      burst(x, y, [GOLD, IVORY], 18, 200);
      sons.play('piege');
      return;
    }
    lives--;
    renderLives();
    invulnUntil = t + 1.7;
    popup(x, y - 12, '−1 vie', RED, 14);
    sons.play('choc');
    vibrate(80);
    if (lives <= 0) die();
  }

  /* ---------- Contrôles : sauter ---------- */
  function pressJump() {
    sons.unlock();
    if (state === 'ready') return startGame();
    if (state === 'over') { if (performance.now() - overAt > 700) startGame(); return; }
    if (state === 'paused') return resumeGame();
    if (state !== 'running') return;
    jumpHeld = true;
    jumpBuffer = BUFFER;
    tryJump();
  }
  function releaseJump() { jumpHeld = false; }
  function tryJump() {
    if (lion.ground) { doJump(false); jumpBuffer = 0; return; }
    if (lion.v < 0 && lion.alt < 24) return;   // presque au sol : le saut partira à l'atterrissage
    if (lion.jumps < 2) { doJump(true); jumpBuffer = 0; }
  }
  function doJump(double) {
    const k = has('enlise') ? 0.78 : 1;
    lion.v = (double ? DOUBLE_V : JUMP_V) * k;
    lion.ground = false;
    lion.jumps = double ? 2 : 1;
    lion.jumpFrom = lion.alt;
    if (double) {
      const hx = lion.x + 160 * LION_S, hy = lionTop() + 20 * LION_S;
      ring(hx, hy, GOLD);
      burst(hx, hy, [GOLD, '#FFE58A'], 10, 120);
      sons.play('doubleSaut');
    } else {
      dust(lion.x + LION_W * 0.5, GROUND, 6, 70);
      sons.play('saut');
    }
  }

  /* ---------- Lion : allure et mèches ---------- */
  function lionBoxes() {
    const top = lionTop();
    return LION_BOXES.map(([x, y, w, h]) => ({ x: lion.x + x * LION_S, y: top + y * LION_S, w: w * LION_S, h: h * LION_S }));
  }
  function animateLion(dt, wind) {
    const runTarget = state === 'running' ? 1 : 0;
    lion.run += (runTarget - lion.run) * Math.min(1, dt * 3);
    lion.air += ((lion.ground ? 0 : 1) - lion.air) * Math.min(1, dt * 16);
    const rate = state === 'over' ? 0 : lerp(5.5, Math.PI * 2 * (1.9 + speed / 600), lion.run);
    lion.phase += dt * rate * (has('enlise') ? 0.6 : 1);
    const a = HyLion.anchor(lion.phase, lion.air, lion.run);
    const ax = lion.x + a.x * LION_S, ay = lionTop() + a.y * LION_S;
    lion.simAcc = Math.min(lion.simAcc + dt, 0.1);
    while (lion.simAcc >= 1 / 60) {
      HyLion.stepStrands(lion.strands, ax, ay, LION_S, wind, t);
      lion.simAcc -= 1 / 60;
    }
  }

  /* ---------- Mise à jour ---------- */
  const fireSize = o => clamp(o.life / 0.8, 0, 1);
  function obstacleBox(o) {
    const top = GROUND - o.alt - o.h;
    switch (o.kind) {
      case 'rocher': case 'grosRocher':
        return { x: o.x + o.w * 0.14, y: top + o.h * 0.18, w: o.w * 0.72, h: o.h * 0.82 };
      case 'termitiere':
        return { x: o.x + o.w * 0.18, y: top + o.h * 0.06, w: o.w * 0.64, h: o.h * 0.94 };
      case 'cratere':
        return { x: o.x + 14, y: GROUND - 22 * fireSize(o), w: o.w - 28, h: 22 * fireSize(o) };
      case 'vautour':
        return { x: o.x + 6, y: top + 5, w: o.w - 12, h: o.h - 9 };
      default:
        return { x: o.x + o.w * 0.12, y: top + o.h * 0.15, w: o.w * 0.76, h: o.h * 0.85 };
    }
  }
  function meteorPos(m) {
    const p = clamp((m.tx0 - m.tx) / Math.max(1, m.tx0 - m.land), 0, 1), e = p * p;
    return { x: m.tx + m.ox * (1 - e), y: lerp(-40, GROUND - m.r * 0.3, e), p };
  }

  function updateParticles(dt) {
    for (const p of sparks) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    sparks = sparks.filter(p => p.life > 0);
    for (const p of dusts) { p.life -= dt; p.vy += 90 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 6; }
    dusts = dusts.filter(p => p.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 30 * dt; }
    popups = popups.filter(p => p.life > 0);
  }

  function update(realDt) {
    let dt = realDt;
    if (hitStop > 0) { hitStop -= realDt; dt = 0; }
    if (state === 'dying') dt *= 0.35;
    t += dt;
    updateParticles(dt);

    if (state === 'ready') {
      HyDecor.scroll(decor, 55 * dt, dt);
      animateLion(dt, 140);
      return;
    }
    if (state === 'paused') return;
    if (state === 'over') { animateLion(dt, 30); return; }

    let dx;
    if (state === 'dying') {
      speed *= Math.max(0, 1 - realDt * 2.5);
      dx = speed * dt;
      dyingTimer -= realDt;
      if (dyingTimer <= 0) gameOver();
    } else {
      runTime += dt;
      const target = baseSpeed() * (has('rapide') ? 1.3 : 1) * (has('enlise') ? 0.6 : 1);
      speed += (target - speed) * Math.min(1, dt * 2.5);
      dx = speed * dt;
    }
    dist += dx;
    HyDecor.scroll(decor, dx, dt);

    // progression : niveaux, heure du jour, paliers
    if (state === 'running') {
      const m = meters();
      while (level < LEVELS.length - 1 && m >= LEVELS[level + 1]) {
        level++;
        if (LEVEL_TEXT[level]) banner(LEVEL_TEXT[level], level === 3 ? 'mauvais' : '');
      }
      const phase = tod() < 0.3 ? 0 : tod() < 0.46 ? 1 : tod() < 0.8 ? 2 : 3;
      if (phase !== lastPhase) {
        lastPhase = phase;
        banner(['Le jour revient sur la savane', 'Le soleil se couche…', 'La nuit tombe sur la savane', 'L’aube se lève'][phase]);
      }
      const s = score();
      if (Math.floor(s / 1000) > milestone) {
        milestone = Math.floor(s / 1000);
        banner(fmt(milestone * 1000) + ' points !', 'bon');
        sons.play('palier');
      }
      if (!mondialAnnonce && mondial && mondial.score > 0 && s > mondial.score) {
        mondialAnnonce = recordAnnounced = true;
        banner('Record mondial battu !', 'bon');
        sons.play('serie');
      }
      if (!recordAnnounced && best > 0 && s > best) {
        recordAnnounced = true;
        banner('Nouveau record !', 'bon');
        sons.play('serie');
      }
    }

    // saut : appui gardé en mémoire, gravité, atterrissage
    if (jumpBuffer > 0) {
      jumpBuffer -= dt;
      if (state === 'running') tryJump();
    }
    if (!lion.ground) {
      if (!jumpHeld && lion.v > JUMP_CUT && lion.alt - lion.jumpFrom > MIN_RISE) lion.v = JUMP_CUT;
      const g = (lion.v > 0 ? G_UP : G_DOWN) + (downHeld ? FAST_FALL : 0);
      lion.v -= g * dt;
      lion.alt += lion.v * dt;
      if (lion.alt <= 0) {
        const impact = -lion.v;
        lion.alt = 0; lion.v = 0; lion.ground = true; lion.jumps = 0;
        dust(lion.x + LION_W * 0.45, GROUND, 8, 80);
        if (impact > 600) sons.play('atterrissage');
      }
    }
    animateLion(dt, state === 'running' ? speed * 0.85 : 40);
    if (lion.ground && state === 'running' && (dustTimer -= dt) <= 0) {
      dustTimer = 0.09;
      dusts.push({ x: lion.x + 30 * LION_S, y: GROUND - 1, vx: -speed * 0.3 + rand(-20, 10), vy: rand(-30, -8), r: rand(1.5, 3), life: 0.4, max: 0.4 });
    }

    // apparitions
    if (state === 'running' && (nextPattern -= dx) <= 0) spawnPattern();

    // défilement
    for (const o of obstacles) {
      o.x -= dx * (o.fly ? 1.12 : 1);
      if (o.fly) o.flap += dt * 9;
      if (o.kind === 'cratere') o.life -= dt;
    }
    for (const c of coins) c.x -= dx;
    for (const b of boxes) b.x -= dx;
    for (const m of meteors) m.tx -= dx;
    obstacles = obstacles.filter(o => o.x + o.w > -40);
    boxes = boxes.filter(b => b.x + b.size > -30 && !b.taken);

    const lb = lionBoxes();
    const alive = state === 'running';

    // météorites : sifflement, braises, impact (cratère en feu) ou choc avec le lion
    for (const m of meteors) {
      const pos = meteorPos(m);
      if (!m.whistle && pos.y > -20) { m.whistle = true; sons.play('meteore'); }
      if ((m.ember -= dt) <= 0) {
        m.ember = 0.03;
        sparks.push({ x: pos.x + rand(-3, 3), y: pos.y + rand(-3, 3), vx: rand(20, 60), vy: rand(-60, -10), r: rand(1, 2.4), life: 0.45, max: 0.45, color: chance(0.5) ? '#FFB347' : '#FF6A2A', g: 60 });
      }
      if (pos.p >= 1) {
        m.dead = true;
        addObstacle('cratere', m.tx - 30, { life: 4.5 });
        burst(m.tx, GROUND - 4, ['#FFD166', '#FF7A2A', '#C93C3C', '#5A4636'], 30, 280);
        dust(m.tx, GROUND, 14, 140);
        shake(0.3, 6);
        sons.play('impact');
        continue;
      }
      if (alive && lb.some(b => circleRect(pos.x, pos.y, m.r * 0.8, b))) {
        m.dead = true;
        burst(pos.x, pos.y, ['#FFD166', '#FF7A2A'], 20, 200);
        hurt(pos.x, pos.y, 'météorite');
      }
    }
    meteors = meteors.filter(m => !m.dead);

    if (alive) {
      // obstacles et pièges
      for (const o of obstacles) {
        if (o.done) continue;
        if (o.kind === 'sables') {
          const legs = lb[2];
          if (lion.ground && legs.x + legs.w > o.x + 12 && legs.x < o.x + o.w - 12) {
            o.done = true;
            setEffect('enlise', 2.5);
            popup(o.x + o.w / 2, GROUND - 60, 'Sables mouvants !', RED);
            sons.play('piege');
          }
          continue;
        }
        if (o.kind === 'cratere' && o.life < 0.6) continue;
        const ob = obstacleBox(o);
        if (lb.some(b => rectHit(b, ob))) {
          o.done = true;
          if (o.kind === 'piege') popup(ob.x, ob.y - 24, 'Piège à loup !', RED);
          hurt(ob.x + ob.w / 2, ob.y, o.kind + (o.high ? '-haut' : ''));
        }
      }
      // pièces (attirées par l'aimant)
      const mult = has('x2') ? 2 : 1;
      const cx = lion.x + LION_W * 0.55, cy = lionTop() + LION_H * 0.45;
      for (const c of coins) {
        if (c.taken) continue;
        let x = c.x, y = GROUND - c.alt - c.r;
        if (has('aimant') && Math.hypot(cx - x, cy - y) < 190 && x < W) {
          c.x += (cx - x) * Math.min(1, dt * 7);
          c.alt -= (cy - y) * Math.min(1, dt * 7);
          x = c.x; y = GROUND - c.alt - c.r;
        }
        if (lb.some(b => circleRect(x, y, c.r + 3, b))) {
          c.taken = true;
          coinCount++;
          bonus += 10 * mult;
          renderCoins();
          burst(x, y, [GOLD, '#FFE58A', IVORY], 7, 110);
          popup(x, y - 10, '+' + 10 * mult, GOLD, 12);
          sons.play('piece');
          const g = groups.get(c.gid);
          if (g && ++g.got === g.total && g.total >= 4) {
            bonus += 50 * mult;
            popup(x, y - 30, 'Série parfaite ! +' + 50 * mult, GOLD, 14);
            sons.play('serie');
          }
        }
      }
      // boîtes mystère
      for (const b of boxes) {
        if (b.taken) continue;
        const y = GROUND - b.alt - b.size + Math.sin(t * 3 + b.ph) * 4;
        if (lb.some(h => rectHit(h, { x: b.x, y, w: b.size, h: b.size }))) { b.taken = true; openBox(b); }
      }
    }
    coins = coins.filter(c => !c.taken && c.x > -20);

    updateEffects();
    renderScore();
  }

  /* ---------- Dessin : obstacles (éclairés par l'heure) ---------- */
  function rockShape(w, h) {
    const pts = [], n = 8;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      const edge = i === 0 || i === n;
      pts.push([w / 2 + Math.cos(a) * (w / 2) * (edge ? 1 : rand(0.92, 1.04)), -Math.sin(a) * h * (edge ? 1 : rand(0.86, 1.08))]);
    }
    return pts;
  }
  function contactShadow(x, w) {
    ctx.fillStyle = 'rgba(70,45,20,0.22)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND + 2, w * 0.58, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawRock(o) {
    const x = o.x, y = GROUND, p = o.shape;
    contactShadow(x, o.w);
    ctx.beginPath();
    ctx.moveTo(x + p[0][0], y + p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      ctx.quadraticCurveTo(x + p[i][0], y + p[i][1], x + mx, y + my);
    }
    ctx.lineTo(x + p[p.length - 1][0], y);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y - o.h, x + o.w * 0.7, y);
    g.addColorStop(0, '#A3AEBF'); g.addColorStop(0.55, '#6E7C92'); g.addColorStop(1, '#4A566A');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.ellipse(x + o.w * 0.34, y - o.h * 0.72, o.w * 0.24, o.h * 0.2, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,40,0.22)';
    ctx.fillRect(x, y - o.h * 0.22, o.w, o.h * 0.22);
    ctx.strokeStyle = 'rgba(28,36,50,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + o.w * 0.56, y - o.h * 0.88);
    ctx.lineTo(x + o.w * 0.63, y - o.h * 0.55);
    ctx.lineTo(x + o.w * 0.57, y - o.h * 0.3);
    ctx.stroke();
    ctx.restore();
  }
  function drawBush(o) {
    const { x, w, h } = o, y = GROUND;
    contactShadow(x, w);
    ctx.strokeStyle = '#5B4A2E';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI, cx = x + w / 2, cy = y - h * 0.42;
      ctx.moveTo(cx + Math.cos(a) * w * 0.4, cy + Math.sin(a) * h * 0.5);
      ctx.lineTo(cx + Math.cos(a) * w * 0.6, cy + Math.sin(a) * h * 0.7);
    }
    ctx.stroke();
    const g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, '#6C8150'); g.addColorStop(1, '#344530');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + w * 0.27, y - h * 0.36, h * 0.36, 0, Math.PI * 2);
    ctx.moveTo(x + w * 0.55 + h * 0.46, y - h * 0.55);
    ctx.arc(x + w * 0.55, y - h * 0.55, h * 0.46, 0, Math.PI * 2);
    ctx.moveTo(x + w * 0.8 + h * 0.32, y - h * 0.34);
    ctx.arc(x + w * 0.8, y - h * 0.34, h * 0.32, 0, Math.PI * 2);
    ctx.rect(x + w * 0.1, y - h * 0.4, w * 0.8, h * 0.4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(x + w * 0.5, y - h * 0.72, h * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = GOLD;
    for (const [px, py] of [[0.3, 0.55], [0.52, 0.8], [0.7, 0.5], [0.42, 0.35], [0.82, 0.3]]) {
      ctx.beginPath(); ctx.arc(x + w * px, y - h * py, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawLog(o) {
    const { x, w, h } = o, y = GROUND, r = h / 2;
    contactShadow(x, w);
    const g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, '#A8734A'); g.addColorStop(1, '#6A4329');
    ctx.fillStyle = g;
    rr(x, y - h, w - 8, h, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(55,32,16,0.55)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 12, y - h * 0.68); ctx.lineTo(x + 36, y - h * 0.7);
    ctx.moveTo(x + 22, y - h * 0.36); ctx.lineTo(x + 52, y - h * 0.34);
    ctx.moveTo(x + 44, y - h * 0.8); ctx.lineTo(x + 62, y - h * 0.78);
    ctx.stroke();
    const cx = x + w - 9, cy = y - r;
    ctx.fillStyle = '#DDBC8C';
    ctx.beginPath(); ctx.ellipse(cx, cy, 9, r - 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6A4329';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, 5, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, 2, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
  }
  function drawMound(o) {
    const { x, w, h } = o, y = GROUND;
    contactShadow(x - 4, w + 8);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#D09A62'); g.addColorStop(1, '#94613A');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo(x + w * 0.02, y - h * 0.5, x + w * 0.3, y - h * 0.9);
    ctx.quadraticCurveTo(x + w * 0.42, y - h * 1.03, x + w * 0.54, y - h * 0.9);
    ctx.lineTo(x + w * 0.6, y - h * 0.72);
    ctx.quadraticCurveTo(x + w * 0.7, y - h * 0.8, x + w * 0.77, y - h * 0.66);
    ctx.quadraticCurveTo(x + w * 0.96, y - h * 0.34, x + w + 5, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,52,26,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y - h * 0.8); ctx.quadraticCurveTo(x + w * 0.2, y - h * 0.4, x + w * 0.18, y - 2);
    ctx.moveTo(x + w * 0.62, y - h * 0.6); ctx.quadraticCurveTo(x + w * 0.7, y - h * 0.3, x + w * 0.74, y - 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(60,34,18,0.6)';
    for (const [px, py] of [[0.42, 0.62], [0.36, 0.3], [0.62, 0.44]]) {
      ctx.beginPath(); ctx.ellipse(x + w * px, y - h * py, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawSnare(o) {
    const { x, w, h } = o, y = GROUND;
    ctx.fillStyle = 'rgba(40,46,58,0.6)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y - 1.5, w / 2 + 2, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, '#EEF1F5'); g.addColorStop(1, '#8B95A4');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#323B4A';
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x0 = x + (i / n) * w;
      ctx.lineTo(x0 + w / n / 2, y - h + (i % 2 ? 3 : 0));
      ctx.lineTo(x0 + w / n, y - 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#323B4A';
    ctx.beginPath(); ctx.arc(x + w / 2, y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  function drawQuicksand(o) {
    const { x, w } = o, y = GROUND + 5;
    ctx.fillStyle = '#B8925A';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9C773F';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 0.5, w * 0.36, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(70,46,18,0.55)';
    ctx.lineWidth = 1.3;
    const sw = t * 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + 0.5, w * (0.1 + i * 0.1), 1.6 + i * 1.2, 0, sw + i, sw + i + Math.PI * 1.3);
      ctx.stroke();
    }
  }
  function drawScorch(o) {
    ctx.fillStyle = 'rgba(40,26,20,0.55)';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, GROUND + 3, o.w / 2 + 6, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(20,12,10,0.6)';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, GROUND + 3, o.w * 0.32, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawGroundObstacle(o) {
    switch (o.kind) {
      case 'rocher': case 'grosRocher': return drawRock(o);
      case 'buisson': return drawBush(o);
      case 'tronc': return drawLog(o);
      case 'termitiere': return drawMound(o);
      case 'piege': return drawSnare(o);
      case 'sables': return drawQuicksand(o);
      case 'cratere': return drawScorch(o);
    }
  }

  /* ---------- Dessin : ce qui brille (après la lumière de l'heure) ---------- */
  function drawFire(o) {
    const k = fireSize(o);
    if (k <= 0) {
      // le cratère fume encore un moment
      if (o.life > -1.5 && chance(0.3)) dusts.push({ x: o.x + o.w / 2 + rand(-10, 10), y: GROUND - 4, vx: rand(-10, 10) - speed * 0.2, vy: rand(-40, -20), r: rand(3, 5), life: 0.8, max: 0.8, smoke: true });
      return;
    }
    const cx = o.x + o.w / 2, base = GROUND + 1;
    const glow = ctx.createRadialGradient(cx, base - 10, 2, cx, base - 10, 46 * k);
    glow.addColorStop(0, 'rgba(255,170,60,0.45)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 50, base - 60, 100, 70);
    for (let i = 0; i < 5; i++) {
      const fx = cx + (i - 2) * 9;
      const fh = (16 + 10 * Math.sin(t * 13 + i * 1.7 + o.seed * 6)) * k * (i === 2 ? 1.3 : 1);
      const fw = 7 + (i === 2 ? 3 : 0);
      const g = ctx.createLinearGradient(0, base - fh, 0, base);
      g.addColorStop(0, 'rgba(255,230,140,0.95)');
      g.addColorStop(0.45, 'rgba(255,140,40,0.95)');
      g.addColorStop(1, 'rgba(210,60,40,0.9)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fx - fw, base);
      ctx.quadraticCurveTo(fx - fw * 0.8, base - fh * 0.55, fx + Math.sin(t * 9 + i) * 2, base - fh);
      ctx.quadraticCurveTo(fx + fw * 0.8, base - fh * 0.55, fx + fw, base);
      ctx.closePath();
      ctx.fill();
    }
    if (chance(0.35)) sparks.push({ x: cx + rand(-18, 18), y: base - rand(4, 20), vx: rand(-20, 20), vy: rand(-90, -40), r: rand(1, 2), life: 0.5, max: 0.5, color: '#FFB347', g: -20 });
  }

  function drawBird(o, night) {
    const cx = o.x + o.w / 2, cy = GROUND - o.alt - o.h / 2;
    const f = Math.sin(o.flap);
    const body = night > 0.5 ? '#8E9CC4' : '#3B3238';
    const wing = night > 0.5 ? '#7685B0' : '#2A2328';
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 2);
    ctx.quadraticCurveTo(cx + 6, cy - 14 - f * 12, cx + 26, cy - 6 - f * 16);
    ctx.lineTo(cx + 20, cy - 2 - f * 6);
    ctx.lineTo(cx + 24, cy + 1 - f * 5);
    ctx.quadraticCurveTo(cx + 10, cy + 2, cx + 2, cy + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(cx + 2, cy + 1, 14, 6.5, 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + 26, cy - 3); ctx.lineTo(cx + 25, cy + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#EDE4D3';
    ctx.beginPath(); ctx.ellipse(cx - 11, cy - 2, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#D8A88E';
    ctx.beginPath(); ctx.ellipse(cx - 17, cy - 5, 4.2, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E9C46A';
    ctx.beginPath(); ctx.moveTo(cx - 20, cy - 6); ctx.lineTo(cx - 26, cy - 3); ctx.lineTo(cx - 20, cy - 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1B1B1B';
    ctx.beginPath(); ctx.arc(cx - 18.5, cy - 6, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 1);
    ctx.quadraticCurveTo(cx - 6, cy - 12 - f * 13, cx - 2, cy - 18 - f * 16);
    ctx.quadraticCurveTo(cx + 8, cy - 8 - f * 8, cx + 10, cy);
    ctx.closePath();
    ctx.fill();
  }

  function drawCoin(c) {
    const x = c.x, y = GROUND - c.alt - c.r;
    const glow = ctx.createRadialGradient(x, y, 1, x, y, c.r * 2.4);
    glow.addColorStop(0, 'rgba(255,215,90,0.35)');
    glow.addColorStop(1, 'rgba(255,215,90,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - c.r * 2.4, y - c.r * 2.4, c.r * 4.8, c.r * 4.8);
    const sx = 0.22 + 0.78 * Math.abs(Math.cos(t * 3.2 + c.ph));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, 1);
    const g = ctx.createLinearGradient(-c.r, -c.r, c.r, c.r);
    g.addColorStop(0, '#FFE58A'); g.addColorStop(0.5, GOLD); g.addColorStop(1, '#C98A00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,98,0,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, c.r * 0.7, 0, Math.PI * 2); ctx.stroke();
    if (sx > 0.55) {
      ctx.fillStyle = '#A87400';
      ctx.font = `800 ${c.r * 1.15}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', 0, 0.5);
    }
    ctx.restore();
  }

  function star4(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.3, y - r * 0.3); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.3, y + r * 0.3);
    ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.3, y + r * 0.3); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.3, y - r * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  function drawBox(b) {
    const s = b.size, x = b.x, y = GROUND - b.alt - s + Math.sin(t * 3 + b.ph) * 4;
    const glow = ctx.createRadialGradient(x + s / 2, y + s / 2, 4, x + s / 2, y + s / 2, s * 1.3);
    glow.addColorStop(0, 'rgba(255,205,70,0.5)');
    glow.addColorStop(1, 'rgba(255,205,70,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - s, y - s, s * 3, s * 3);
    const g = ctx.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, '#16396A'); g.addColorStop(1, NAVY);
    ctx.fillStyle = g;
    rr(x, y, s, s, 6);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.4;
    rr(x + 1.2, y + 1.2, s - 2.4, s - 2.4, 5);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.font = `800 ${s * 0.68}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + s / 2, y + s / 2 + 1);
    const a = t * 2 + b.ph;
    ctx.fillStyle = 'rgba(255,240,180,0.9)';
    star4(x + s / 2 + Math.cos(a) * s * 0.75, y + s / 2 + Math.sin(a) * s * 0.75, 3);
  }

  function drawMeteor(m) {
    const { x, y, p } = meteorPos(m);
    // direction de la traînée = direction de la chute
    const len = Math.hypot(m.ox, GROUND + 40), ux = -m.ox / len, uy = (GROUND + 40) / len;
    const tail = 70 + 50 * p;
    const tx = x - ux * tail, ty = y - uy * tail;
    const g = ctx.createLinearGradient(x, y, tx, ty);
    g.addColorStop(0, 'rgba(255,214,120,0.95)');
    g.addColorStop(0.35, 'rgba(255,120,40,0.7)');
    g.addColorStop(1, 'rgba(200,60,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - uy * m.r * 1.1, y + ux * m.r * 1.1);
    ctx.lineTo(tx, ty);
    ctx.lineTo(x + uy * m.r * 1.1, y - ux * m.r * 1.1);
    ctx.closePath();
    ctx.fill();
    const glow = ctx.createRadialGradient(x, y, m.r * 0.5, x, y, m.r * 2.6);
    glow.addColorStop(0, 'rgba(255,190,90,0.6)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - m.r * 2.6, y - m.r * 2.6, m.r * 5.2, m.r * 5.2);
    const rg = ctx.createRadialGradient(x - m.r * 0.3, y - m.r * 0.3, 1, x, y, m.r);
    rg.addColorStop(0, '#6B5A55'); rg.addColorStop(1, '#2E2524');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
    const dir = Math.atan2(uy, ux);
    ctx.strokeStyle = 'rgba(255,150,60,0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(x, y, m.r, dir - 1.2, dir + 1.2); ctx.stroke();
  }
  function drawMeteorShadow(m) {
    const p = meteorPos(m).p;
    ctx.fillStyle = `rgba(150,30,20,${0.12 + 0.35 * p})`;
    ctx.beginPath(); ctx.ellipse(m.tx, GROUND + 3, 10 + 22 * p, 3 + 2.5 * p, 0, 0, Math.PI * 2); ctx.fill();
  }
  // signal « ! » en haut de l'écran tant que la météorite n'est pas encore visible
  function drawMeteorWarning(m) {
    const pos = meteorPos(m);
    if (pos.y > 24 && pos.x < W - 10) return;
    if (Math.floor(t * 6) % 2) return;
    const x = clamp(pos.x, 18, W - 18), y = 66;   // sous les boutons du haut
    ctx.fillStyle = 'rgba(226,85,75,0.92)';
    ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 10, y + 8); ctx.lineTo(x - 10, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = IVORY;
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + 2.5);
  }

  /* ---------- Dessin : le lion ---------- */
  function drawLionBody(alpha) {
    ctx.save();
    const blink = invulnUntil > t && state === 'running' && Math.floor(t * 12) % 2;
    ctx.globalAlpha = alpha * (blink ? 0.35 : 1);
    ctx.translate(lion.x, lionTop());
    ctx.scale(LION_S, LION_S);
    HyLion.drawBody(ctx, lion.phase, lion.air, lion.run);
    ctx.restore();
  }
  function drawLionShadow() {
    const k = clamp(1 - lion.alt / 220, 0.25, 1);
    ctx.fillStyle = `rgba(70,45,20,${0.26 * k})`;
    ctx.beginPath();
    ctx.ellipse(lion.x + LION_W * 0.5, GROUND + 3, LION_W * 0.46 * (0.6 + 0.4 * k), 4.5 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawAuras() {
    const cx = lion.x + LION_W * 0.52, cy = lionTop() + LION_H * 0.5;
    if (has('bouclier')) {
      const pulse = 0.55 + 0.25 * Math.sin(t * 6);
      ctx.fillStyle = 'rgba(245,183,0,0.10)';
      ctx.strokeStyle = `rgba(255,205,70,${pulse})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(cx, cy, LION_W * 0.64, LION_H * 0.78, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,230,150,0.9)';
      for (let i = 0; i < 3; i++) {
        const a = t * 2.2 + i * 2.09;
        star4(cx + Math.cos(a) * LION_W * 0.64, cy + Math.sin(a) * LION_H * 0.78, 3);
      }
    }
    if (has('aimant')) {
      const r = 22 + ((t * 60) % 40);
      ctx.strokeStyle = `rgba(255,205,70,${0.5 * (1 - (r - 22) / 40)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx + LION_W * 0.2, cy - 6, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawOverlays() {
    if (has('tempete')) {
      const e = effects.tempete, k = clamp(Math.min(e.until - t, t - (e.until - e.total)) / 0.6, 0, 1);
      const g = ctx.createLinearGradient(W * 0.3, 0, W, 0);
      g.addColorStop(0, `rgba(214,178,118,${0.15 * k})`);
      g.addColorStop(1, `rgba(214,178,118,${0.82 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(245,225,185,${0.5 * k})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 26; i++) {
        const y = (i * 37.3) % H, x = W - ((t * 700 + i * 151) % (W + 80));
        ctx.moveTo(x, y); ctx.lineTo(x + 40, y + 2);
      }
      ctx.stroke();
    }
    if (has('rapide')) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const y = 30 + ((i * 53.7) % (GROUND - 40)), x = W - ((t * 1500 + i * 97) % (W + 120));
        ctx.moveTo(x, y); ctx.lineTo(x + 60, y);
      }
      ctx.stroke();
    }
    if (flashUntil > t) {
      ctx.fillStyle = `rgba(226,85,75,${0.22 * (flashUntil - t) / 0.2})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function draw() {
    if (!decor || !lion) return;
    const pal = HyDecor.palette(state === 'ready' ? 0.04 : tod());
    ctx.save();
    if (shakeUntil > t) {
      const k = (shakeUntil - t) * 3;
      ctx.translate(rand(-1, 1) * shakeAmp * k, rand(-1, 1) * shakeAmp * k * 0.6);
    } else shakeAmp = 0;

    // 1. paysage et objets, éclairés par l'heure du jour
    HyDecor.drawSky(ctx, decor, pal);
    HyDecor.drawLand(ctx, decor, pal);
    for (const m of meteors) drawMeteorShadow(m);
    for (const o of obstacles) if (!o.fly) drawGroundObstacle(o);
    for (const p of dusts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * (p.smoke ? 0.35 : 0.5);
      ctx.fillStyle = p.smoke ? '#4A4040' : '#C9AE7E';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawLionShadow();
    drawLionBody(1);
    HyDecor.drawFront(ctx, decor);
    HyDecor.applyLight(ctx, decor, pal);

    // 2. ce qui brille par soi-même : étoiles, feu, or, météorites…
    HyDecor.drawNight(ctx, decor, pal, t);
    if (pal.night > 0.05) drawLionBody(0.42 * pal.night);   // le lion reste lisible la nuit
    for (const o of obstacles) if (o.kind === 'cratere') drawFire(o);
    for (const o of obstacles) if (o.fly) drawBird(o, pal.night);
    for (const c of coins) drawCoin(c);
    for (const b of boxes) drawBox(b);
    HyLion.drawStrands(ctx, lion.strands, LION_S);
    drawAuras();
    for (const m of meteors) drawMeteor(m);
    for (const p of sparks) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawOverlays();
    for (const p of popups) {
      ctx.globalAlpha = clamp(p.life * 1.6, 0, 1);
      ctx.font = `800 ${p.size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(6,21,40,0.55)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    for (const m of meteors) drawMeteorWarning(m);
  }

  /* ---------- Boucle ---------- */
  let running = false, last = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000 || 0, 1 / 30);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  /* ---------- Entrées ---------- */
  let inView = false;
  const JUMP_KEYS = new Set([' ', 'Spacebar', 'ArrowUp', 'w', 'W', 'z', 'Z']);
  window.addEventListener('keydown', e => {
    if (!inView || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    const onButton = el && (el.tagName === 'BUTTON' || el.tagName === 'A');
    if (JUMP_KEYS.has(e.key)) {
      if (onButton && e.key === ' ') return;   // la barre d'espace active le bouton
      e.preventDefault();
      if (!e.repeat) pressJump();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      if (state === 'running') { e.preventDefault(); downHeld = true; }
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (state === 'running') pauseGame();
      else if (state === 'paused' && e.key !== 'Escape') resumeGame();
    } else if (e.key === 'Enter' && (state === 'ready' || state === 'over') && !onButton) {
      pressJump();
    }
  });
  window.addEventListener('keyup', e => {
    if (JUMP_KEYS.has(e.key)) releaseJump();
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') downHeld = false;
  });
  window.addEventListener('blur', () => { jumpHeld = false; downHeld = false; if (state === 'running') pauseGame(); });

  canvas.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    if (state === 'running') pressJump();
  });
  window.addEventListener('pointerup', releaseJump);
  window.addEventListener('pointercancel', releaseJump);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  if (ui.btnJouer) ui.btnJouer.addEventListener('click', () => startGame());
  if (ui.btnRejouer) ui.btnRejouer.addEventListener('click', () => startGame());
  if (ui.btnReprendre) ui.btnReprendre.addEventListener('click', () => resumeGame());
  if (ui.finNom) ui.finNom.addEventListener('submit', nommerRecord);
  if (ui.btnPause) ui.btnPause.addEventListener('click', () => { if (state === 'running') pauseGame(); else if (state === 'paused') resumeGame(); });
  function setPauseIcon(paused) {
    if (!ui.btnPause) return;
    ui.btnPause.setAttribute('aria-label', paused ? 'Reprendre' : 'Mettre en pause');
    ui.btnPause.classList.toggle('en-pause', paused);
  }
  function setSoundIcon() {
    if (!ui.btnSon) return;
    const off = sons.isMuted();
    ui.btnSon.classList.toggle('muet', off);
    ui.btnSon.setAttribute('aria-pressed', String(off));
    ui.btnSon.setAttribute('aria-label', off ? 'Activer le son' : 'Couper le son');
  }
  if (ui.btnSon) {
    setSoundIcon();
    ui.btnSon.addEventListener('click', () => {
      sons.unlock();
      sons.setMuted(!sons.isMuted());
      setSoundIcon();
      sons.play('clic');
      if (state === 'running') canvas.focus({ preventScroll: true });
    });
  }
  // plein écran (là où le navigateur le permet), en paysage sur mobile
  if (ui.btnEcran) {
    const req = frameEl.requestFullscreen || frameEl.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    const current = () => document.fullscreenElement || document.webkitFullscreenElement;
    if (!req) ui.btnEcran.hidden = true;
    ui.btnEcran.addEventListener('click', () => {
      if (current()) { exit.call(document); return; }
      Promise.resolve(req.call(frameEl)).then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => {});
      if (state === 'running') canvas.focus({ preventScroll: true });
    });
  }
  if (ui.btnPartager) {
    ui.btnPartager.addEventListener('click', async () => {
      const text = jetonNom
        ? `J’ai battu le record mondial avec ${fmt(lastScore)} points dans « La traversée du lion » de HyLioCo. Saurez-vous faire mieux ?`
        : `J’ai marqué ${fmt(lastScore)} points dans « La traversée du lion » de HyLioCo. Saurez-vous faire mieux ?`;
      const url = 'https://hylioco.com/#jeu';
      try {
        if (navigator.share) { await navigator.share({ title: 'HyLioCo — La traversée du lion', text, url }); return; }
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast('Lien copié : collez-le à vos amis !');
      } catch (e) { /* partage annulé */ }
    });
  }

  // pause automatique quand le jeu sort de l'écran ou que l'onglet est caché
  new IntersectionObserver(([entry]) => {
    inView = entry.intersectionRatio > 0.35;
    if (!entry.isIntersecting) { if (state === 'running') pauseGame(); stop(); }
    else if (!document.hidden) start();
  }, { threshold: [0, 0.35] }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (state === 'running') pauseGame(); stop(); }
    else if (inView) start();
  });

  // outils de test : https://…/?debug
  if (/[?&]debug\b/.test(location.search)) {
    window.__jeu = {
      get state() { return state; }, get lion() { return lion; }, get obstacles() { return obstacles; },
      get meteors() { return meteors; }, get coins() { return coins; }, get boxes() { return boxes; },
      get speed() { return speed; }, get W() { return W; }, get GROUND() { return GROUND; },
      get lives() { return lives; }, get score() { return score(); }, get meters() { return meters(); },
      get level() { return level; }, get effects() { return effects; },
      LION_S, LION_W, LION_H, lionBoxes, obstacleBox, meteorPos,
      press: pressJump, release: releaseJump, start: startGame,
      step(dt) { triche = true; update(dt); }, draw,
      invincible(v) { triche = true; cheatInvincible = v; },
      setLives(v) { triche = true; lives = v; },
      onHurt(fn) { onHurt = fn; },
      setTod(v) { triche = true; dist = (((v - 0.03) % 1 + 1) % 1) * 2600 * UNITS_PER_M; },
    };
  }

  // démarrage : la savane s'anime derrière l'écran d'accueil
  lion = newLion();
  showScreen('debut');
  showBestBelow();
  renderLives(); renderCoins(); renderScore();
  chargerMondial();
  new ResizeObserver(resize).observe(canvas);
})();
