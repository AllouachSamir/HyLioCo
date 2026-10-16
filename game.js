/* HyLioCo — mini-jeu « La traversée du lion »
   ← → (ou Q / D) : se déplacer · Espace / ↑ : sauter (maintenir = plus haut) · ↓ : redescendre vite
   Mobile : boutons sous le jeu, ou toucher le jeu pour sauter. */
(() => {
  'use strict';

  const canvas = document.getElementById('jeu-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const recordEl = document.getElementById('jeu-record');
  const messageEl = document.getElementById('jeu-message');
  const touchUI = document.querySelector('.jeu-tactile');

  const C = {
    marine: '#0A2342',
    roi: '#1C4A7A',
    or: '#F5B700',
    orFonce: '#B98600',
    ivoire: '#F7F3EA',
    sable: '#EBDDBE',
    sableFonce: '#D9C69E',
    feu: '#FF7A1A',
    rouge: '#C93C3C',
  };
  const FONT = '"Outfit", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  /* ---------- Monde ---------- */
  const H = 300;            // hauteur du monde (unités) ; la largeur dépend de l'écran
  const GROUND = 252;
  const LION_W = 72, LION_H = 56;
  const GRAVITY = 2500, JUMP_V = 820, JUMP_CUT = 360, MIN_RISE = 50, FAST_FALL = 4000;
  const MOVE_SPEED = 250;
  const MAX_LIVES = 3;

  let W = 700, scale = 1, sky = null;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function pickWeighted(list) {
    let r = Math.random() * list.reduce((s, it) => s + it.w, 0);
    for (const it of list) if ((r -= it.w) < 0) return it;
    return list[list.length - 1];
  }

  /* ---------- Record (stocké dans le navigateur) ---------- */
  const KEY_BEST = 'hylioco-record';
  let best = 0;
  try { best = parseInt(localStorage.getItem(KEY_BEST), 10) || 0; } catch (e) { /* stockage indisponible */ }
  const fmt = n => Math.floor(n).toLocaleString('fr-FR');
  function showRecord(msg) {
    if (recordEl) recordEl.textContent = fmt(best);
    if (messageEl) messageEl.textContent = msg || '';
  }
  showRecord();

  /* ---------- État ---------- */
  let state = 'ready';      // ready | running | paused | over
  let t = 0;
  let lion, obstacles, meteors, coins, boxes, particles, floaters, craters, effects;
  let speed, score, lives, invulnUntil, shakeUntil, overAt, newRecord;
  let gapObstacle, timerMeteor, timerCoins, timerBox, shower, showerTimer;
  let scenery;
  const keys = { left: false, right: false, down: false };
  let jumpHeld = false;

  function reset() {
    lion = { x: 60, y: GROUND - LION_H, vy: 0, ground: true, jumpFrom: 0, phase: 0 };
    obstacles = []; meteors = []; coins = []; boxes = []; craters = [];
    particles = []; floaters = [];
    effects = {};
    speed = 260; score = 0; lives = MAX_LIVES;
    invulnUntil = 0; shakeUntil = 0; newRecord = false;
    gapObstacle = 320; timerMeteor = 5; timerCoins = 1.2; timerBox = 8;
    shower = 0; showerTimer = 0;
  }

  const has = name => (effects[name] || 0) > t;
  const EFFECTS = {
    bouclier: { label: 'Bouclier', good: true },
    x2: { label: 'Points ×2', good: true },
    ralenti: { label: 'Ralenti', good: false },
    etourdi: { label: 'Étourdi', good: false },
  };

  /* ---------- Décor ---------- */
  function initScenery() {
    scenery = { trees: [], pebbles: [], tufts: [], hills: 0 };
    for (let x = rand(0, 120); x < W + 240; x += rand(170, 340)) scenery.trees.push({ x, s: rand(0.7, 1.15) });
    for (let x = 0; x < W + 60; x += rand(18, 55)) scenery.pebbles.push({ x, y: GROUND + rand(10, 44), r: rand(1.5, 3.5) });
    for (let x = 0; x < W + 60; x += rand(50, 120)) scenery.tufts.push({ x, s: rand(0.7, 1.2) });
  }
  function scrollScenery(dx) {
    scenery.hills += dx * 0.08;
    for (const s of scenery.trees) if ((s.x -= dx * 0.3) < -120) { s.x = W + rand(40, 220); s.s = rand(0.7, 1.15); }
    for (const p of scenery.pebbles) if ((p.x -= dx) < -6) { p.x = W + rand(0, 40); p.y = GROUND + rand(10, 44); }
    for (const g of scenery.tufts) if ((g.x -= dx) < -20) { g.x = W + rand(0, 80); g.s = rand(0.7, 1.2); }
  }

  function resize() {
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    scale = cssH / H;
    W = cssW / scale;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#F7F3EA');
    sky.addColorStop(1, '#FBE6B4');
    if (!scenery || state !== 'running') initScenery();
    if (lion) lion.x = clamp(lion.x, 8, maxLionX());
    if (!running) draw();
  }
  const maxLionX = () => Math.max(60, W * 0.72 - LION_W);

  /* ---------- Apparitions ---------- */
  const OBSTACLES = [
    { type: 'rocher', w: 38, h: 26, weight: 3 },
    { type: 'grosRocher', w: 54, h: 40, weight: 2 },
    { type: 'tronc', w: 64, h: 24, weight: 2 },
    { type: 'buisson', w: 44, h: 34, weight: 2 },
    { type: 'piege', w: 40, h: 14, weight: 1.6, from: 60 },
    { type: 'sable', w: 92, h: 8, weight: 1.2, from: 150, soft: true },
  ];
  function spawnObstacle() {
    const list = OBSTACLES.filter(o => !o.from || score > o.from).map(o => ({ w: o.weight, def: o }));
    const d = pickWeighted(list).def;
    obstacles.push({ type: d.type, x: W + 20, y: GROUND - d.h, w: d.w, h: d.h, soft: !!d.soft });
    if (!d.soft && Math.random() < 0.35) coinArc(W + 20 + d.w / 2);
    gapObstacle = speed * rand(0.95, 1.8) + 140;
  }
  function coinArc(cx) {
    for (let i = 0; i < 5; i++) {
      const k = i - 2;
      coins.push({ x: cx + k * 26, y: GROUND - 120 + k * k * 9, r: 8, phase: i * 0.6 });
    }
  }
  function coinRow() {
    const high = Math.random() < 0.4;
    const y = high ? GROUND - 105 : GROUND - 24;
    for (let i = 0; i < 5; i++) coins.push({ x: W + 30 + i * 28, y, r: 8, phase: i * 0.6 });
  }
  function spawnBox() {
    boxes.push({ x: W + 30, y: GROUND - 128, w: 30, h: 30, seed: rand(0, 6) });
  }
  function spawnMeteor(targetX) {
    const T = rand(1.15, 1.5) * clamp(1.2 - score / 4000, 0.75, 1.2);
    const tx = targetX !== undefined ? targetX
      : Math.random() < 0.5 ? lion.x + LION_W / 2 + rand(-24, 24) : rand(30, W - 30);
    const vx = -rand(40, 130);
    const y0 = -30;
    meteors.push({ x: tx - vx * T, y: y0, vx, vy: (GROUND - y0) / T, r: rand(9, 13), tx, T, age: 0 });
  }

  /* ---------- Boîtes mystère ---------- */
  const OUTCOMES = [
    { w: 3, good: true, run: () => { setEffect('bouclier', 8); return 'Bouclier !'; } },
    { w: 3, good: true, run: () => { setEffect('x2', 8); return 'Points ×2 !'; } },
    { w: 3, good: true, run: () => { score += 100; return '+100'; } },
    { w: 1.5, good: true, run: () => {
      if (lives < MAX_LIVES) { lives++; return '+1 vie'; }
      score += 100; return '+100';
    } },
    { w: 2.5, good: false, run: () => { setEffect('ralenti', 4); return 'Piège : ralenti !'; } },
    { w: 2.5, good: false, run: () => { setEffect('etourdi', 4); return 'Piège : étourdi !'; } },
    { w: 2, good: false, run: () => { shower = 6; showerTimer = 0.2; return 'Piège : pluie de météorites !'; } },
    { w: 1.5, good: false, run: () => { score = Math.max(0, score - 50); return 'Piège : −50'; } },
  ];
  function setEffect(name, seconds) { effects[name] = t + seconds; }
  function openBox(b) {
    const o = pickWeighted(OUTCOMES);
    const label = o.run();
    burst(b.x + b.w / 2, b.y + b.h / 2, o.good ? [C.or, C.ivoire] : [C.rouge, C.marine], 18, 160);
    floater(b.x + b.w / 2, b.y - 6, label, o.good ? C.orFonce : C.rouge, 15);
  }

  /* ---------- Effets visuels ---------- */
  function burst(x, y, colors, n, power) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(power * 0.3, power);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.3, r: rand(1.5, 3.5),
        life: rand(0.4, 0.8), max: 0.8, color: colors[i % colors.length], g: 500 });
    }
  }
  function dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      particles.push({ x: x + rand(-14, 14), y, vx: rand(-60, 20), vy: rand(-50, -10), r: rand(2, 4),
        life: rand(0.3, 0.5), max: 0.5, color: C.sableFonce, g: 120 });
    }
  }
  function floater(x, y, text, color, size) {
    x = clamp(x, 70, W - 70);
    // empile les messages récents au lieu de les superposer
    const near = floaters.filter(f => f.life > 0.75 && Math.abs(f.x - x) < 60).length;
    floaters.push({ x, y: y - near * 16, text, color, size: size || 13, life: 1.1 });
  }

  /* ---------- Actions ---------- */
  function jumpPress() {
    jumpHeld = true;
    if (state === 'ready') { reset(); state = 'running'; showRecord(); }
    else if (state === 'paused') { state = 'running'; return; }
    else if (state === 'over') {
      if (performance.now() - overAt < 600) return;
      reset(); state = 'running'; showRecord();
    }
    if (state === 'running' && lion.ground) {
      lion.vy = -JUMP_V * (has('ralenti') ? 0.85 : 1);
      lion.ground = false;
      lion.jumpFrom = lion.y;
    }
  }
  function jumpRelease() { jumpHeld = false; }

  function hurt(x, y) {
    if (invulnUntil > t) return;
    shakeUntil = t + 0.3;
    if (has('bouclier')) {
      delete effects.bouclier;
      invulnUntil = t + 1;
      floater(x, y - 10, 'Bouclier brisé', C.orFonce);
      return;
    }
    lives--;
    invulnUntil = t + 1.6;
    floater(x, y - 10, '−1 vie', C.rouge);
    if (lives <= 0) gameOver();
  }

  function gameOver() {
    state = 'over';
    overAt = performance.now();
    keys.left = keys.right = keys.down = false;
    const s = Math.floor(score);
    if (s > best) {
      best = s;
      newRecord = true;
      try { localStorage.setItem(KEY_BEST, String(best)); } catch (e) { /* ignore */ }
    }
    showRecord(newRecord ? ' — Nouveau record !' : '');
  }

  /* ---------- Collisions ---------- */
  const rectHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function circleRect(cx, cy, r, b) {
    const nx = clamp(cx, b.x, b.x + b.w), ny = clamp(cy, b.y, b.y + b.h);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }
  function lionBoxes() {
    // corps + tête, un peu plus petits que le dessin : le jeu reste tolérant
    return [
      { x: lion.x + 10, y: lion.y + 22, w: 46, h: 27 },
      { x: lion.x + 42, y: lion.y + 4, w: 28, h: 26 },
    ];
  }

  /* ---------- Mise à jour ---------- */
  function update(dt) {
    t += dt;

    for (const p of particles) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    particles = particles.filter(p => p.life > 0);
    for (const f of floaters) { f.life -= dt; f.y -= 34 * dt; }
    floaters = floaters.filter(f => f.life > 0);

    if (state === 'ready') { scrollScenery(70 * dt); lion.phase += dt * 9; return; }
    if (state !== 'running') return;

    speed = Math.min(speed + 5 * dt, 620);
    const dx = speed * dt;
    const mult = has('x2') ? 2 : 1;
    score += dx / 12 * mult;
    scrollScenery(dx);

    // déplacement horizontal
    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (has('etourdi')) dir = -dir;
    const slow = has('ralenti') ? 0.5 : 1;
    lion.x = clamp(lion.x + dir * MOVE_SPEED * slow * dt, 8, maxLionX());
    lion.phase += dt * (7 + speed / 70) * (dir < 0 ? 0.6 : dir > 0 ? 1.3 : 1) * slow;
    if (has('ralenti') && lion.ground && Math.random() < 0.3) dust(lion.x + 30, GROUND, 1);

    // saut
    if (!lion.ground) {
      if (!jumpHeld && lion.vy < -JUMP_CUT && lion.jumpFrom - lion.y > MIN_RISE) lion.vy = -JUMP_CUT;
      lion.vy += (GRAVITY + (keys.down ? FAST_FALL : 0)) * dt;
      lion.y += lion.vy * dt;
      if (lion.y >= GROUND - LION_H) {
        lion.y = GROUND - LION_H; lion.vy = 0; lion.ground = true;
        dust(lion.x + LION_W / 2, GROUND, 6);
      }
    }

    // apparitions
    if ((gapObstacle -= dx) <= 0) spawnObstacle();
    if ((timerCoins -= dt) <= 0) { coinRow(); timerCoins = rand(2.5, 4.5); }
    if ((timerBox -= dt) <= 0) { spawnBox(); timerBox = rand(8, 13); }
    if ((timerMeteor -= dt) <= 0) {
      spawnMeteor();
      timerMeteor = rand(0.6, 1.4) * clamp(2.4 - score / 800, 0.65, 2.4);
    }
    if (shower > 0 && (showerTimer -= dt) <= 0) { spawnMeteor(rand(30, W - 30)); shower--; showerTimer = 0.28; }

    // défilement
    for (const list of [obstacles, coins, boxes, craters]) for (const o of list) o.x -= dx;
    obstacles = obstacles.filter(o => o.x + o.w > -20);
    coins = coins.filter(c => c.x > -20 && !c.taken);
    boxes = boxes.filter(b => b.x + b.w > -20 && !b.taken);
    for (const c of craters) c.life -= dt;
    craters = craters.filter(c => c.life > 0 && c.x > -60);

    // météorites
    for (const m of meteors) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.age += dt;
      if (m.y >= GROUND - m.r * 0.4) {
        m.dead = true;
        burst(m.x, GROUND - 4, [C.feu, C.or, C.marine], 16, 190);
        craters.push({ x: m.x, r: m.r * 1.8, life: 2.5 });
        shakeUntil = Math.max(shakeUntil, t + 0.18);
      }
    }

    // collisions
    const hb = lionBoxes();
    for (const o of obstacles) {
      if (o.hitDone) continue;
      if (o.soft) {
        if (lion.ground && lion.x + LION_W * 0.7 > o.x && lion.x + LION_W * 0.3 < o.x + o.w) {
          o.hitDone = true;
          setEffect('ralenti', 3);
          floater(o.x + o.w / 2, GROUND - 70, 'Sables mouvants !', C.rouge);
        }
        continue;
      }
      const ob = { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 4 };
      if (hb.some(b => rectHit(b, ob))) { o.hitDone = true; hurt(o.x + o.w / 2, o.y); }
    }
    for (const m of meteors) {
      if (!m.dead && hb.some(b => circleRect(m.x, m.y, m.r * 0.85, b))) {
        m.dead = true;
        burst(m.x, m.y, [C.feu, C.or], 14, 170);
        hurt(m.x, m.y);
      }
    }
    meteors = meteors.filter(m => !m.dead);
    for (const c of coins) {
      if (!c.taken && hb.some(b => circleRect(c.x, c.y, c.r + 2, b))) {
        c.taken = true;
        score += 10 * mult;
        burst(c.x, c.y, [C.or, C.ivoire], 6, 90);
        floater(c.x, c.y - 8, '+' + 10 * mult, C.orFonce, 12);
      }
    }
    for (const b of boxes) {
      const by = b.y + Math.sin(t * 3 + b.seed) * 4;
      if (!b.taken && hb.some(h => rectHit(h, { x: b.x, y: by, w: b.w, h: b.h }))) { b.taken = true; openBox(b); }
    }
  }

  /* ---------- Dessin : utilitaires ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function text(str, x, y, size, align, color, weight) {
    ctx.font = `${weight || 600} ${size}px ${FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || C.marine;
    ctx.fillText(str, x, y);
  }

  /* ---------- Dessin : décor ---------- */
  function drawBackground() {
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);

    // soleil
    ctx.fillStyle = 'rgba(245,183,0,0.16)';
    circle(W * 0.84, 82, 40); ctx.fill();
    ctx.fillStyle = 'rgba(245,183,0,0.38)';
    circle(W * 0.84, 82, 27); ctx.fill();

    // collines lointaines
    ctx.fillStyle = 'rgba(28,74,122,0.10)';
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    for (let x = 0; x <= W + 10; x += 10) {
      const u = (x + scenery.hills) / 140;
      ctx.lineTo(x, GROUND - 34 - Math.sin(u) * 12 - Math.sin(u * 0.37 + 1) * 10);
    }
    ctx.lineTo(W, GROUND);
    ctx.fill();

    // acacias
    ctx.fillStyle = 'rgba(10,35,66,0.16)';
    for (const tr of scenery.trees) drawAcacia(tr.x, GROUND, tr.s);

    // sol
    ctx.fillStyle = C.sable;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = C.marine;
    ctx.fillRect(0, GROUND, W, 2.5);
    ctx.fillStyle = C.sableFonce;
    for (const p of scenery.pebbles) { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.6, p.r, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(10,35,66,0.35)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (const g of scenery.tufts) {
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.moveTo(g.x, GROUND); ctx.lineTo(g.x + i * 4 * g.s, GROUND - 8 * g.s); }
      ctx.stroke();
    }
  }
  function drawAcacia(x, ground, s) {
    const h = 70 * s;
    ctx.fillRect(x - 2 * s, ground - h, 4 * s, h);
    ctx.beginPath();
    ctx.moveTo(x, ground - h * 0.55);
    ctx.lineTo(x - 16 * s, ground - h - 2);
    ctx.lineTo(x - 12 * s, ground - h - 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, ground - h - 6 * s, 46 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 20 * s, ground - h - 12 * s, 24 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 22 * s, ground - h - 11 * s, 22 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- Dessin : obstacles, pièges, récompenses ---------- */
  function drawObstacle(o) {
    const { x, y, w, h } = o;
    switch (o.type) {
      case 'rocher':
      case 'grosRocher':
        ctx.fillStyle = C.marine;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w * 0.06, y + h * 0.5);
        ctx.quadraticCurveTo(x + w * 0.18, y, x + w * 0.52, y + h * 0.04);
        ctx.quadraticCurveTo(x + w * 0.86, y + h * 0.06, x + w * 0.96, y + h * 0.55);
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.roi;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, y + h * 0.42);
        ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.14, x + w * 0.55, y + h * 0.16);
        ctx.lineTo(x + w * 0.42, y + h * 0.46);
        ctx.closePath();
        ctx.fill();
        break;
      case 'tronc': {
        ctx.fillStyle = C.marine;
        rr(x, y + 2, w - 10, h - 2, (h - 2) / 2); ctx.fill();
        ctx.strokeStyle = C.roi; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 12, y + 9); ctx.lineTo(x + 30, y + 9);
        ctx.moveTo(x + 20, y + 17); ctx.lineTo(x + 42, y + 17);
        ctx.stroke();
        const cx = x + w - 11, cy = y + h / 2 + 1;
        ctx.fillStyle = C.sableFonce;
        ctx.beginPath(); ctx.ellipse(cx, cy, 9, h / 2 - 1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.marine; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(cx, cy, 4.5, h / 4, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'buisson': {
        ctx.strokeStyle = C.marine; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          const cx = x + w / 2, cy = y + h * 0.65;
          ctx.moveTo(cx + Math.cos(a) * w * 0.38, cy + Math.sin(a) * h * 0.5);
          ctx.lineTo(cx + Math.cos(a) * w * 0.56, cy + Math.sin(a) * h * 0.72);
        }
        ctx.stroke();
        ctx.fillStyle = C.marine;
        ctx.beginPath();
        ctx.arc(x + w * 0.3, y + h * 0.62, h * 0.38, 0, Math.PI * 2);
        ctx.arc(x + w * 0.62, y + h * 0.5, h * 0.48, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + w * 0.12, y + h * 0.6, w * 0.76, h * 0.4);
        ctx.fillStyle = C.roi;
        circle(x + w * 0.55, y + h * 0.38, 3); ctx.fill();
        circle(x + w * 0.3, y + h * 0.55, 2.4); ctx.fill();
        break;
      }
      case 'piege': {
        // piège à mâchoires
        ctx.fillStyle = C.roi;
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 2, w / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.ivoire; ctx.strokeStyle = C.marine; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 2, y + h - 3);
        const n = 6;
        for (let i = 0; i < n; i++) {
          const x0 = x + 2 + (i / n) * (w - 4);
          ctx.lineTo(x0 + (w - 4) / n / 2, y + (i % 2 ? 2 : 0));
          ctx.lineTo(x0 + (w - 4) / n, y + h - 3);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.marine;
        circle(x + w / 2, y + h - 2, 2.5); ctx.fill();
        break;
      }
      case 'sable': {
        ctx.fillStyle = '#C9AE76';
        ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND + 3, w / 2, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#A88B52'; ctx.lineWidth = 1.5;
        const sw = t * 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, GROUND + 3, w * (0.12 + i * 0.12), 2 + i * 1.4, 0, sw + i, sw + i + Math.PI * 1.2);
          ctx.stroke();
        }
        break;
      }
    }
  }

  function drawCoin(c) {
    const sx = 0.25 + 0.75 * Math.abs(Math.cos(t * 4 + c.phase));
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(sx, 1);
    ctx.fillStyle = C.or;
    circle(0, 0, c.r); ctx.fill();
    ctx.strokeStyle = C.orFonce; ctx.lineWidth = 2;
    circle(0, 0, c.r * 0.62); ctx.stroke();
    ctx.restore();
  }

  function drawBox(b) {
    const y = b.y + Math.sin(t * 3 + b.seed) * 4;
    ctx.fillStyle = 'rgba(245,183,0,0.22)';
    circle(b.x + b.w / 2, y + b.h / 2, b.w * 0.95); ctx.fill();
    ctx.fillStyle = C.marine;
    rr(b.x, y, b.w, b.h, 6); ctx.fill();
    ctx.strokeStyle = C.or; ctx.lineWidth = 2.5;
    rr(b.x + 1.5, y + 1.5, b.w - 3, b.h - 3, 5); ctx.stroke();
    text('?', b.x + b.w / 2, y + b.h / 2 + 1, 19, 'center', C.or, 800);
  }

  function drawMeteorWarning(m) {
    const p = clamp(m.age / m.T, 0, 1);
    ctx.fillStyle = `rgba(201,60,60,${0.15 + 0.4 * p})`;
    ctx.beginPath(); ctx.ellipse(m.tx, GROUND + 3, 8 + 20 * p, 3 + 2.5 * p, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawMeteor(m) {
    const len = Math.hypot(m.vx, m.vy);
    const ux = m.vx / len, uy = m.vy / len;
    const tail = 70;
    const tx = m.x - ux * tail, ty = m.y - uy * tail;
    const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
    g.addColorStop(0, 'rgba(255,122,26,0.9)');
    g.addColorStop(0.4, 'rgba(245,183,0,0.55)');
    g.addColorStop(1, 'rgba(245,183,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(m.x - uy * m.r, m.y + ux * m.r);
    ctx.lineTo(tx, ty);
    ctx.lineTo(m.x + uy * m.r, m.y - ux * m.r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,122,26,0.35)';
    circle(m.x, m.y, m.r * 1.6); ctx.fill();
    ctx.fillStyle = C.marine;
    circle(m.x, m.y, m.r); ctx.fill();
    ctx.strokeStyle = C.feu; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.roi;
    circle(m.x - m.r * 0.3, m.y - m.r * 0.25, m.r * 0.28); ctx.fill();
    circle(m.x + m.r * 0.35, m.y + m.r * 0.2, m.r * 0.18); ctx.fill();
  }

  /* ---------- Dessin : le lion ---------- */
  function drawLion() {
    const dead = state === 'over';
    const ground = lion.ground;
    const bob = ground && !dead ? Math.abs(Math.sin(lion.phase)) * 2 : 0;
    const blink = invulnUntil > t && !dead && Math.floor(t * 12) % 2;

    ctx.save();
    ctx.translate(lion.x, lion.y);
    if (blink) ctx.globalAlpha = 0.35;

    const swing = ground && !dead ? 0.55 : 0;
    const a = Math.sin(lion.phase) * swing;
    const tuckBack = !ground && !dead ? -0.75 : 0;
    const tuckFront = !ground && !dead ? 0.75 : 0;
    const leg = (hx, hy, ang, color) => {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ang);
      ctx.fillStyle = color;
      rr(-3.5, -2, 7, 20, 3.5); ctx.fill();
      rr(-4, 13, 10, 5.5, 2.75); ctx.fill();
      ctx.restore();
    };

    // pattes arrière-plan
    leg(20, 36 - bob, tuckBack - a, C.roi);
    leg(51, 36 - bob, tuckFront + a, C.roi);

    // queue
    const tw = dead ? 0 : Math.sin(t * 6) * 4;
    ctx.strokeStyle = C.marine; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, 28 - bob);
    ctx.quadraticCurveTo(-2, 30 + tw, -4, 14 + tw);
    ctx.stroke();
    ctx.fillStyle = C.or;
    circle(-4, 12 + tw, 5); ctx.fill();

    // corps
    ctx.fillStyle = C.marine;
    ctx.beginPath(); ctx.ellipse(34, 32 - bob, 27, 13, 0, 0, Math.PI * 2); ctx.fill();

    // pattes avant-plan
    leg(16, 36 - bob, tuckBack + a, C.marine);
    leg(47, 36 - bob, tuckFront - a, C.marine);

    // crinière
    const hx = 56, hy = 20 - bob;
    ctx.fillStyle = C.or;
    ctx.beginPath();
    ctx.arc(hx - 2, hy, 16, 0, Math.PI * 2);
    for (let i = 0; i < 10; i++) {
      const an = (i / 10) * Math.PI * 2 + 0.3;
      const cx = hx - 2 + Math.cos(an) * 14, cy = hy + Math.sin(an) * 14;
      ctx.moveTo(cx + 6.5, cy);
      ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
    }
    ctx.fill();

    // tête
    ctx.fillStyle = C.marine;
    circle(hx - 5, hy - 12, 4); ctx.fill();          // oreille
    circle(hx + 2, hy + 1, 11); ctx.fill();
    rr(hx + 6, hy - 1, 14, 11, 5); ctx.fill();        // museau

    // œil
    if (dead) {
      ctx.strokeStyle = C.ivoire; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(hx + 3.5, hy - 5.5); ctx.lineTo(hx + 8.5, hy - 0.5);
      ctx.moveTo(hx + 8.5, hy - 5.5); ctx.lineTo(hx + 3.5, hy - 0.5);
      ctx.stroke();
    } else {
      ctx.fillStyle = C.ivoire;
      circle(hx + 6, hy - 3, 2.7); ctx.fill();
      ctx.fillStyle = C.marine;
      circle(hx + 6.8, hy - 3, 1.3); ctx.fill();
    }
    // bouche
    ctx.strokeStyle = C.ivoire; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(hx + 12, hy + 7); ctx.lineTo(hx + 18, hy + 6.5); ctx.stroke();

    // étourdi : étoiles autour de la tête
    if (has('etourdi') && !dead) {
      ctx.fillStyle = C.or;
      for (let i = 0; i < 3; i++) {
        const an = t * 5 + i * 2.1;
        star(hx + Math.cos(an) * 16, hy - 22 + Math.sin(an) * 4, 3.5);
      }
    }
    ctx.restore();

    // bouclier
    if (has('bouclier') && !dead) {
      const p = 0.55 + 0.25 * Math.sin(t * 6);
      ctx.fillStyle = 'rgba(245,183,0,0.10)';
      ctx.strokeStyle = `rgba(245,183,0,${p})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(lion.x + 34, lion.y + 26, 48, 38, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }
  function star(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- Dessin : interface ---------- */
  function heart(x, y, s, full) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
    if (full) { ctx.fillStyle = C.or; ctx.fill(); ctx.strokeStyle = C.orFonce; }
    else { ctx.fillStyle = 'rgba(10,35,66,0.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(10,35,66,0.35)'; }
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  function badge(label, x, y, good) {
    ctx.font = `700 11px ${FONT}`;
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = good ? C.or : C.rouge;
    rr(x, y - 9, w, 18, 9); ctx.fill();
    text(label, x + 8, y + 0.5, 11, 'left', good ? C.marine : C.ivoire, 700);
  }

  function drawHUD() {
    for (let i = 0; i < MAX_LIVES; i++) heart(22 + i * 26, 22, 9, i < lives);
    let y = 48;
    for (const name in effects) {
      if (effects[name] <= t) continue;
      badge(`${EFFECTS[name].label} ${Math.ceil(effects[name] - t)} s`, 12, y, EFFECTS[name].good);
      y += 23;
    }
    text(fmt(score), W - 14, 22, 24, 'right', C.marine, 800);
    text('Record ' + fmt(Math.max(best, Math.floor(score))), W - 14, 46, 12, 'right', C.roi, 600);
  }

  function wrap(str, maxW) {
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function panel(lines) {
    // lines : [{ text, size, weight, color, gap }]
    const k = W < 480 ? 0.85 : 1;
    const pw = Math.min(W - 32, 470);
    const laid = [];
    let h = 26;
    for (const l of lines) {
      ctx.font = `${l.weight || 600} ${l.size * k}px ${FONT}`;
      const parts = wrap(l.text, pw - 36);
      parts.forEach((s, i) => laid.push({ ...l, text: s, gap: i === parts.length - 1 ? l.gap : 0 }));
      h += parts.length * l.size * k * 1.35 + (l.gap || 0) * k;
    }
    const px = (W - pw) / 2, py = Math.max(10, (GROUND - h) / 2 - 6);
    ctx.fillStyle = 'rgba(247,243,234,0.94)';
    rr(px, py, pw, h, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(10,35,66,0.12)'; ctx.lineWidth = 1;
    ctx.stroke();
    let y = py + 13;
    for (const l of laid) {
      const lh = l.size * k * 1.35;
      text(l.text, W / 2, y + lh / 2, l.size * k, 'center', l.color || C.marine, l.weight);
      y += lh + (l.gap || 0) * k;
    }
  }

  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  function drawOverlay() {
    if (state === 'ready') {
      panel([
        { text: 'La traversée du lion', size: 22, weight: 800, gap: 6 },
        { text: 'Sautez les obstacles et esquivez les météorites.', size: 13 },
        { text: 'Pièces et boîtes mystère : récompense… ou piège !', size: 13, gap: 8 },
        { text: coarse ? 'Boutons ◀ ▶ pour bouger, « Sauter » pour sauter' : '← → pour bouger · Espace ou ↑ pour sauter', size: 12, color: C.roi, gap: 8 },
        { text: coarse ? 'Touchez pour jouer' : 'Appuyez sur Espace pour jouer', size: 15, weight: 800, color: C.orFonce },
      ]);
    } else if (state === 'paused') {
      panel([
        { text: 'Pause', size: 22, weight: 800, gap: 4 },
        { text: coarse ? 'Touchez pour reprendre' : 'Espace pour reprendre', size: 14, weight: 700, color: C.orFonce },
      ]);
    } else if (state === 'over') {
      panel([
        { text: 'Fin de partie', size: 22, weight: 800, gap: 4 },
        { text: 'Score : ' + fmt(score), size: 16, weight: 700 },
        newRecord
          ? { text: 'Nouveau record !', size: 16, weight: 800, color: C.orFonce, gap: 6 }
          : { text: 'Record à battre : ' + fmt(best), size: 14, color: C.roi, gap: 6 },
        { text: coarse ? 'Touchez pour rejouer' : 'Espace pour rejouer', size: 14, weight: 700, color: C.orFonce },
      ]);
    }
  }

  function draw() {
    ctx.save();
    if (shakeUntil > t) ctx.translate(rand(-3, 3), rand(-2, 2));
    drawBackground();
    for (const c of craters) {
      ctx.fillStyle = `rgba(10,35,66,${0.25 * Math.min(1, c.life)})`;
      ctx.beginPath(); ctx.ellipse(c.x, GROUND + 4, c.r, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const m of meteors) drawMeteorWarning(m);
    for (const o of obstacles) drawObstacle(o);
    for (const c of coins) drawCoin(c);
    for (const b of boxes) drawBox(b);
    drawLion();
    for (const m of meteors) drawMeteor(m);
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      circle(p.x, p.y, p.r); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.life * 1.5, 0, 1);
      text(f.text, f.x, f.y, f.size, 'center', f.color, 800);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (state !== 'ready') drawHUD();
    drawOverlay();
  }

  /* ---------- Boucle ---------- */
  let last = 0, running = false;
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
  function stop() {
    running = false;
    if (state === 'running') state = 'paused';
    keys.left = keys.right = keys.down = false;
    jumpHeld = false;
  }

  /* ---------- Entrées ---------- */
  let inView = false;
  const KEYMAP = {
    ArrowLeft: 'left', q: 'left', a: 'left', Q: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowDown: 'down', s: 'down', S: 'down',
  };
  const JUMP_KEYS = new Set([' ', 'Spacebar', 'ArrowUp', 'z', 'w', 'Z', 'W']);

  window.addEventListener('keydown', e => {
    if (!inView || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && el !== canvas && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (el && el !== canvas && /^(A|BUTTON)$/.test(el.tagName) && (e.key === ' ' || e.key === 'Enter')) return;
    if (JUMP_KEYS.has(e.key)) {
      e.preventDefault();
      if (!e.repeat) jumpPress();
    } else if (KEYMAP[e.key]) {
      e.preventDefault();
      keys[KEYMAP[e.key]] = true;
    }
  });
  window.addEventListener('keyup', e => {
    if (JUMP_KEYS.has(e.key)) jumpRelease();
    else if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false;
  });
  window.addEventListener('blur', () => { keys.left = keys.right = keys.down = false; jumpHeld = false; });

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    jumpPress();
  });
  window.addEventListener('pointerup', jumpRelease);
  window.addEventListener('pointercancel', jumpRelease);

  if (touchUI) {
    touchUI.addEventListener('contextmenu', e => e.preventDefault());
    for (const btn of touchUI.querySelectorAll('[data-action]')) {
      const action = btn.dataset.action;
      const dirKey = action === 'gauche' ? 'left' : 'right';
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (action === 'saut' || state !== 'running') jumpPress();
        else keys[dirKey] = true;
      });
      const up = () => {
        if (action === 'saut') jumpRelease();
        else keys[dirKey] = false;
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
    }
  }

  new IntersectionObserver(([entry]) => {
    inView = entry.intersectionRatio > 0.4;
    if (entry.isIntersecting && !document.hidden) start(); else stop();
  }, { threshold: [0, 0.4] }).observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else {
      const r = canvas.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) start();
    }
  });

  reset();
  new ResizeObserver(resize).observe(canvas);
})();
