/* HyLioCo — décor du jeu : la savane, de l'après-midi à la nuit étoilée.
   Le paysage est dessiné en couleurs de jour puis « éclairé » par une couleur de lumière
   (multiplication) qui change avec l'heure ; le ciel, le soleil, la lune et les étoiles
   sont dessinés avec leurs propres couleurs. Toutes les tailles sont en unités du monde. */
window.HyDecor = (() => {
  'use strict';

  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = t => t * t * (3 - 2 * t);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  // couleur à dessiner pour obtenir « c » une fois la lumière appliquée
  const unlit = (c, tint) => c.map((v, i) => Math.min(255, v * 255 / Math.max(1, tint[i])));

  /* ---------- Heure du jour ---------- */
  // tod (0 → 1) : après-midi, coucher de soleil, nuit, aube, après-midi
  const KEYS = [
    { at: 0.00, tint: '#FFFFFF', skyTop: '#F4EFE5', skyLow: '#FBE3B0', night: 0 },
    { at: 0.24, tint: '#FFFFFF', skyTop: '#F4EFE5', skyLow: '#FBE3B0', night: 0 },
    { at: 0.38, tint: '#FFCDA8', skyTop: '#F0C38F', skyLow: '#FF8B3D', night: 0.05 },
    { at: 0.50, tint: '#93A2D4', skyTop: '#061528', skyLow: '#17396B', night: 1 },
    { at: 0.72, tint: '#93A2D4', skyTop: '#061528', skyLow: '#17396B', night: 1 },
    { at: 0.86, tint: '#F3CBBB', skyTop: '#8199C9', skyLow: '#FFBE8F', night: 0.1 },
    { at: 1.00, tint: '#FFFFFF', skyTop: '#F4EFE5', skyLow: '#FBE3B0', night: 0 },
  ].map(k => ({ ...k, tint: hex(k.tint), skyTop: hex(k.skyTop), skyLow: hex(k.skyLow) }));

  function palette(tod) {
    tod = ((tod % 1) + 1) % 1;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].at <= tod) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = smooth(clamp((tod - a.at) / (b.at - a.at), 0, 1));
    // hauteur du soleil : 1 = haut dans le ciel, 0 = horizon, < 0 = couché
    let sunH;
    if (tod < 0.24) sunH = 1 - (tod / 0.24) * 0.15;
    else if (tod < 0.46) sunH = 0.85 - ((tod - 0.24) / 0.22) * 1.0;
    else if (tod < 0.78) sunH = -0.4;
    else sunH = -0.15 + ((tod - 0.78) / 0.22) * 1.15;
    const tint = mix(a.tint, b.tint, t);
    return {
      tod, tint, sunH,
      white: tint.every(v => v > 253),
      skyTop: mix(a.skyTop, b.skyTop, t),
      skyLow: mix(a.skyLow, b.skyLow, t),
      night: lerp(a.night, b.night, t),
    };
  }

  /* ---------- Silhouettes ---------- */
  function acaciaPath(v) {
    const p = new Path2D();
    const h = 52 + v * 22, lean = (v - 0.5) * 8;
    // tronc
    p.moveTo(-2.6, 0);
    p.quadraticCurveTo(-2, -h * 0.5, lean - 1.6, -h);
    p.lineTo(lean + 1.6, -h);
    p.quadraticCurveTo(2, -h * 0.5, 2.6, 0);
    p.closePath();
    // branches
    p.moveTo(lean - 0.8, -h + 2);
    p.lineTo(lean - 18, -h - 9);
    p.lineTo(lean - 15, -h - 10);
    p.lineTo(lean + 0.6, -h - 1);
    p.closePath();
    p.moveTo(lean, -h + 1);
    p.lineTo(lean + 17, -h - 8);
    p.lineTo(lean + 14, -h - 10);
    p.lineTo(lean - 1, -h - 2);
    p.closePath();
    // couronne plate en nappes
    const top = -h - 12;
    p.ellipse(lean, top, 40 + v * 10, 7.5, 0, 0, Math.PI * 2);
    p.ellipse(lean - 20, top - 4, 22, 6.5, -0.05, 0, Math.PI * 2);
    p.ellipse(lean + 21, top - 3, 24, 6, 0.05, 0, Math.PI * 2);
    p.ellipse(lean + 2, top - 8, 20, 5.5, 0, 0, Math.PI * 2);
    return p;
  }
  const ACACIAS = [0, 0.35, 0.7, 1].map(acaciaPath);

  // girafe (pieds à y = 0, tournée vers la droite)
  const GIRAFE = (() => {
    const p = new Path2D();
    for (const lx of [-15, -9, 10, 16]) p.rect(lx - 1.6, -44, 3.2, 44);
    p.ellipse(0, -50, 22, 10, -0.12, 0, Math.PI * 2);
    p.moveTo(12, -54); p.lineTo(31, -104); p.lineTo(37, -102); p.lineTo(21, -50); p.closePath();
    p.ellipse(38, -104, 8, 4.2, 0.25, 0, Math.PI * 2);
    p.rect(31, -114, 1.8, 7); p.rect(34.5, -114, 1.8, 7);
    p.moveTo(-21, -52); p.lineTo(-25, -34); p.lineTo(-23, -34); p.lineTo(-19, -50); p.closePath();
    return p;
  })();
  // éléphant
  const ELEPHANT = (() => {
    const p = new Path2D();
    for (const lx of [-20, -11, 9, 18]) p.rect(lx - 4.5, -22, 9, 22);
    p.ellipse(0, -32, 30, 19, 0, 0, Math.PI * 2);
    p.ellipse(31, -38, 13, 12, 0, 0, Math.PI * 2);
    p.ellipse(24, -36, 9, 13, -0.2, 0, Math.PI * 2);
    p.moveTo(38, -34);
    p.quadraticCurveTo(48, -20, 44, -4);
    p.lineTo(40, -4);
    p.quadraticCurveTo(42, -18, 34, -28);
    p.closePath();
    p.moveTo(-29, -36); p.lineTo(-34, -20); p.lineTo(-32, -20); p.lineTo(-27, -34); p.closePath();
    return p;
  })();

  /* ---------- État ---------- */
  function create(W, H, ground) {
    const st = { W, H, ground, dist: 0, mountain: W * 0.62, clouds: [], trees: [], animals: [], tufts: [], front: [], streaks: [], stars: [], nextAnimal: 260 };
    for (let i = 0; i < 80; i++) st.stars.push({ x: Math.random(), y: Math.random() * 0.62, r: rand(0.5, 1.7), ph: rand(0, 6.3) });
    populate(st);
    return st;
  }
  function populate(st) {
    const { W } = st;
    st.clouds = [];
    for (let x = rand(-60, 40); x < W + 200; x += rand(180, 320)) st.clouds.push({ x, y: rand(0.08, 0.38), s: rand(0.7, 1.3) });
    st.trees = [];
    for (let x = rand(-40, 60); x < W + 200; x += rand(130, 280)) st.trees.push({ x, s: rand(0.75, 1.15), v: (Math.random() * 4) | 0, far: Math.random() < 0.4 });
    st.tufts = [];
    for (let x = 0; x < W + 80; x += rand(26, 70)) st.tufts.push({ x, s: rand(0.7, 1.25) });
    st.front = [];
    for (let x = 0; x < W + 120; x += rand(60, 150)) st.front.push({ x, y: rand(18, 42), s: rand(0.9, 1.5) });
    st.streaks = [];
    for (let x = 0; x < W + 80; x += rand(14, 40)) st.streaks.push({ x, y: rand(6, 44), w: rand(6, 26), pebble: Math.random() < 0.35 });
    st.animals = [];
  }
  function resize(st, W, H, ground) {
    const grew = W > st.W + 40;
    st.W = W; st.H = H; st.ground = ground;
    if (grew) populate(st);
  }

  function wrap(item, dx, factor, W, margin, onWrap) {
    item.x -= dx * factor;
    if (item.x < -margin) { item.x += W + margin * 2 + rand(0, 160); if (onWrap) onWrap(item); }
  }
  /** Fait défiler le décor de dx unités (vitesse du sol). */
  function scroll(st, dx, dt) {
    const { W } = st;
    st.dist += dx;
    st.mountain -= dx * 0.02;
    if (st.mountain < -260) st.mountain = W + 260 + rand(0, 400);
    for (const c of st.clouds) { c.x -= dx * 0.05 + 4 * dt; if (c.x < -140) { c.x = W + rand(40, 220); c.y = rand(0.08, 0.38); c.s = rand(0.7, 1.3); } }
    for (const tr of st.trees) wrap(tr, dx, tr.far ? 0.22 : 0.34, W, 70, t => { t.s = rand(0.75, 1.15); t.v = (Math.random() * 4) | 0; t.far = Math.random() < 0.4; });
    for (const g of st.tufts) wrap(g, dx, 1, W, 20, g => { g.s = rand(0.7, 1.25); });
    for (const f of st.front) wrap(f, dx, 1.3, W, 40, f => { f.y = rand(18, 42); f.s = rand(0.9, 1.5); });
    for (const s of st.streaks) wrap(s, dx, 1, W, 30, s => { s.y = rand(6, 44); s.w = rand(6, 26); s.pebble = Math.random() < 0.35; });
    // animaux au loin : de temps en temps, une girafe ou un petit troupeau d'éléphants
    st.nextAnimal -= dx;
    if (st.nextAnimal <= 0) {
      const kind = Math.random() < 0.55 ? 'girafe' : 'elephant';
      const n = kind === 'girafe' ? 1 + (Math.random() < 0.4) : 1 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) st.animals.push({ kind, x: W + 60 + i * rand(46, 70), s: kind === 'girafe' ? rand(0.55, 0.7) : rand(0.42, 0.55) - i * 0.04, ph: rand(0, 6) });
      st.nextAnimal = rand(1400, 2600);
    }
    for (const a of st.animals) { a.x -= dx * 0.3 - 9 * dt; a.ph += dt * 3; }
    st.animals = st.animals.filter(a => a.x > -120);
  }

  /* ---------- Dessin ---------- */
  function hillY(x, base, amp, freq, phase) {
    const u = x * freq + phase;
    return base - amp * (0.6 * Math.sin(u) + 0.3 * Math.sin(u * 2.3 + 1.7) + 0.1 * Math.sin(u * 5.1 + 0.4));
  }

  /** Ciel et soleil : dessinés pour donner leurs couleurs finales après la lumière. */
  function drawSky(ctx, st, pal) {
    const { W, ground } = st;
    const g = ctx.createLinearGradient(0, 0, 0, ground);
    g.addColorStop(0, css(unlit(pal.skyTop, pal.tint)));
    g.addColorStop(1, css(unlit(pal.skyLow, pal.tint)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, ground + 2);
    if (pal.sunH > -0.3) {
      const warm = clamp(1 - pal.sunH, 0, 1);
      const col = unlit(mix(hex('#FFE6A0'), hex('#FF7E2A'), warm), pal.tint);
      const sx = W * 0.74, sy = ground - 26 - pal.sunH * ground * 0.6, r = 24 + warm * 12;
      const halo = ctx.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 3.4);
      halo.addColorStop(0, css(col, 0.45));
      halo.addColorStop(1, css(col, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(sx - r * 3.4, sy - r * 3.4, r * 6.8, r * 6.8);
      ctx.fillStyle = css(col);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // brume : rapproche les plans lointains de la couleur de l'horizon (plus forte la nuit)
  function haze(ctx, st, pal, height, strength) {
    const top = st.ground - height;
    const c = unlit(pal.skyLow, pal.tint);
    const g = ctx.createLinearGradient(0, top, 0, st.ground);
    g.addColorStop(0, css(c, 0));
    g.addColorStop(1, css(c, strength));
    ctx.fillStyle = g;
    ctx.fillRect(0, top, st.W, height + 2);
  }

  /** Paysage (en couleurs de jour) : nuages, montagne, collines, arbres, animaux, sol. */
  function drawLand(ctx, st, pal) {
    const { W, ground, dist } = st;
    // nuages
    ctx.fillStyle = `rgba(255,255,255,${0.62 * (1 - 0.75 * pal.night)})`;
    for (const c of st.clouds) {
      const y = c.y * ground, s = c.s;
      ctx.beginPath();
      ctx.ellipse(c.x, y, 46 * s, 9 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - 18 * s, y - 6 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 12 * s, y - 8 * s, 24 * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // montagne lointaine (Kilimandjaro)
    {
      const mx = st.mountain, base = ground - 14, h = Math.min(130, ground * 0.42);
      ctx.fillStyle = '#C9D3DF';
      ctx.beginPath();
      ctx.moveTo(mx - 250, base);
      ctx.bezierCurveTo(mx - 150, base - h * 0.35, mx - 70, base - h * 0.92, mx - 30, base - h);
      ctx.lineTo(mx + 34, base - h * 0.98);
      ctx.bezierCurveTo(mx + 80, base - h * 0.9, mx + 160, base - h * 0.32, mx + 260, base);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#F3F5F9';
      ctx.beginPath();
      ctx.moveTo(mx - 52, base - h * 0.84);
      ctx.lineTo(mx - 30, base - h);
      ctx.lineTo(mx + 34, base - h * 0.98);
      ctx.lineTo(mx + 58, base - h * 0.82);
      ctx.lineTo(mx + 36, base - h * 0.86);
      ctx.lineTo(mx + 20, base - h * 0.8);
      ctx.lineTo(mx + 2, base - h * 0.87);
      ctx.lineTo(mx - 18, base - h * 0.8);
      ctx.lineTo(mx - 34, base - h * 0.86);
      ctx.closePath();
      ctx.fill();
    }
    // collines lointaines (brume bleutée) puis proches (herbe sèche)
    const hills = (color, base, amp, freq, factor) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, ground + 2);
      for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, hillY(x, base, amp, freq, dist * factor * freq));
      ctx.lineTo(W, ground + 2);
      ctx.closePath();
      ctx.fill();
    };
    hills('#C2CDDA', ground - 30, 16, 0.009, 0.06);
    // arbres du dernier plan
    ctx.fillStyle = '#7F8EA3';
    for (const tr of st.trees) if (tr.far) drawTree(ctx, tr, ground - 16, 0.62);
    haze(ctx, st, pal, 160, 0.28 + 0.5 * pal.night);
    hills('#D6C79A', ground - 12, 9, 0.016, 0.14);
    // arbres et animaux du plan moyen
    ctx.fillStyle = '#34435A';
    for (const tr of st.trees) if (!tr.far) drawTree(ctx, tr, ground - 4, 1);
    ctx.fillStyle = '#3B4A60';
    for (const a of st.animals) {
      ctx.save();
      ctx.translate(a.x, ground - 5 - Math.abs(Math.sin(a.ph)) * 1.2);
      ctx.scale(a.s, a.s);
      ctx.fill(a.kind === 'girafe' ? GIRAFE : ELEPHANT);
      ctx.restore();
    }
    haze(ctx, st, pal, 90, 0.08 + 0.3 * pal.night);
    // sol
    const g = ctx.createLinearGradient(0, ground, 0, st.H);
    g.addColorStop(0, '#E9D4A8');
    g.addColorStop(1, '#D4B985');
    ctx.fillStyle = g;
    ctx.fillRect(0, ground, W, st.H - ground);
    ctx.fillStyle = 'rgba(120,88,40,0.28)';
    ctx.fillRect(0, ground, W, 1.6);
    for (const s of st.streaks) {
      if (s.pebble) {
        ctx.fillStyle = 'rgba(128,96,54,0.38)';
        ctx.beginPath(); ctx.ellipse(s.x, ground + s.y, 2.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(150,112,60,0.16)';
        ctx.fillRect(s.x, ground + s.y, s.w, 1.4);
      }
    }
    // herbes le long de l'horizon
    ctx.strokeStyle = '#A38B54';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const t of st.tufts) grass(ctx, t.x, ground + 1, 7 * t.s);
    ctx.stroke();
  }
  function drawTree(ctx, tr, base, k) {
    ctx.save();
    ctx.translate(tr.x, base);
    ctx.scale(tr.s * k, tr.s * k);
    ctx.fill(ACACIAS[tr.v]);
    ctx.restore();
  }
  function grass(ctx, x, y, h) {
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x + i * 1.4, y);
      ctx.quadraticCurveTo(x + i * 2.2, y - h * 0.6, x + i * 3.6, y - h * (1 - Math.abs(i) * 0.12));
    }
  }

  /** Herbes du premier plan, devant le lion (en bas de l'écran). */
  function drawFront(ctx, st) {
    ctx.strokeStyle = '#8F7743';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const f of st.front) grass(ctx, f.x, st.ground + f.y, 11 * f.s);
    ctx.stroke();
  }

  /** Lumière de l'heure : multiplie tout ce qui a été dessiné (ciel compris, déjà compensé). */
  function applyLight(ctx, st, pal) {
    if (pal.white) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = css(pal.tint);
    ctx.fillRect(0, 0, st.W, st.H);
    ctx.restore();
  }

  /** Lune et étoiles (après la lumière, avec leur propre éclat). */
  function drawNight(ctx, st, pal, time) {
    if (pal.night < 0.02) return;
    const a = pal.night;
    const skyH = st.ground - 40;
    ctx.fillStyle = '#FFFFFF';
    for (const s of st.stars) {
      const tw = 0.55 + 0.45 * Math.sin(time * 2 + s.ph);
      ctx.globalAlpha = a * tw * 0.9;
      ctx.beginPath(); ctx.arc(s.x * st.W, s.y * skyH, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // lune
    const mx = st.W * 0.24, my = Math.max(36, skyH * 0.22);
    const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 70);
    halo.addColorStop(0, `rgba(247,243,234,${0.28 * a})`);
    halo.addColorStop(1, 'rgba(247,243,234,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 70, my - 70, 140, 140);
    ctx.fillStyle = `rgba(247,243,234,${a})`;
    ctx.beginPath(); ctx.arc(mx, my, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(200,206,222,${0.5 * a})`;
    ctx.beginPath(); ctx.arc(mx - 4, my - 3, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 5, my + 4, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  return { palette, create, resize, scroll, drawSky, drawLand, drawFront, applyLight, drawNight };
})();
