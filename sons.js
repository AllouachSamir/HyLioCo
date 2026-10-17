/* HyLioCo — effets sonores du jeu.
   Sons synthétisés avec Web Audio : aucun fichier à télécharger.
   Le son ne démarre qu'après une action du joueur (règle des navigateurs). */
window.HySons = (() => {
  'use strict';

  const KEY = 'hylioco-son';
  const VOLUME = 0.55;
  let ac = null, master = null, noiseBuffer = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) { /* stockage indisponible */ }

  function ensure() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ac.destination);
    return ac;
  }

  /** À appeler lors d'une action du joueur (clic, touche) pour autoriser le son. */
  function unlock() {
    const a = ensure();
    if (a && a.state === 'suspended') a.resume();
  }

  function tone({ type = 'sine', f0, f1 = f0, dur, vol = 0.2, attack = 0.008, delay = 0 }) {
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ f0 = 800, f1 = f0, dur, vol = 0.3, attack = 0.01, delay = 0, filter = 'lowpass' }) {
    if (!noiseBuffer) {
      noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const notes = (freqs, type, vol, step, dur) =>
    freqs.forEach((f, i) => tone({ type, f0: f, dur, vol, delay: i * step }));

  const SFX = {
    saut: () => {
      tone({ type: 'triangle', f0: 300, f1: 560, dur: 0.16, vol: 0.14 });
      noise({ f0: 1800, f1: 700, dur: 0.12, vol: 0.035, filter: 'bandpass' });
    },
    doubleSaut: () => {
      tone({ type: 'sine', f0: 700, f1: 1400, dur: 0.2, vol: 0.11 });
      tone({ type: 'sine', f0: 1050, f1: 2100, dur: 0.24, vol: 0.05, delay: 0.05 });
    },
    atterrissage: () => noise({ f0: 320, f1: 120, dur: 0.1, vol: 0.07 }),
    piece: () => notes([1319, 1760], 'square', 0.045, 0.055, 0.09),
    serie: () => notes([1047, 1319, 1568, 2093], 'triangle', 0.09, 0.07, 0.14),
    bonus: () => notes([523, 659, 784, 1047], 'triangle', 0.11, 0.08, 0.16),
    piege: () => {
      tone({ type: 'sawtooth', f0: 220, f1: 110, dur: 0.35, vol: 0.1 });
      tone({ type: 'sawtooth', f0: 233, f1: 116, dur: 0.35, vol: 0.07, delay: 0.02 });
    },
    choc: () => {
      noise({ f0: 900, f1: 150, dur: 0.3, vol: 0.32 });
      tone({ type: 'sine', f0: 160, f1: 50, dur: 0.3, vol: 0.28 });
    },
    meteore: () => tone({ type: 'sine', f0: 1700, f1: 260, dur: 1.1, vol: 0.03 }),
    impact: () => {
      noise({ f0: 500, f1: 60, dur: 0.7, vol: 0.34 });
      tone({ type: 'sine', f0: 95, f1: 38, dur: 0.6, vol: 0.28 });
    },
    palier: () => notes([784, 988, 1175, 1568], 'triangle', 0.09, 0.09, 0.2),
    fin: () => notes([523, 440, 349, 262], 'triangle', 0.11, 0.16, 0.3),
    clic: () => tone({ type: 'sine', f0: 880, dur: 0.06, vol: 0.06 }),
  };

  function play(name) {
    if (muted || !ac || ac.state !== 'running') return;
    const f = SFX[name];
    if (f) { try { f(); } catch (e) { /* ignore */ } }
  }

  function setMuted(value) {
    muted = value;
    try { localStorage.setItem(KEY, value ? 'off' : 'on'); } catch (e) { /* ignore */ }
    if (master) master.gain.value = value ? 0 : VOLUME;
  }

  return { unlock, play, setMuted, isMuted: () => muted };
})();
