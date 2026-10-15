/* Harvestworks — sound. Everything is synthesised with Web Audio (no audio files):
   soft bells and plucks on a C-major pentatonic scale, a little reverb, gentle ambience
   (breeze, birds by day, crickets at dusk) and optional generative music.
   The game calls HW_SOUND.play(name), HW_SOUND.setHour(h) and HW_SOUND.unlock() on first input. */
window.HW_SOUND = (function () {
  const KEY = 'harvestworks.audio';
  const prefs = Object.assign({ mute: false, sfx: 0.7, amb: 0.35, mus: 0.3 }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { } };
  let ctx = null, master, reverb, buses = {}, hour = 10, quiet = false, last = {}, timers = [];
  let season = 'spring', wx = 'clear', wet = false, breeze = null, rainG = null; // set by the game every frame

  // C-major pentatonic, octaves 3–6
  const N = { C3: 130.81, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B3: 246.94,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, F3: 174.61, D3: 146.83 };
  const PENTA = [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.D6, N.E6];
  const hz = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note number → frequency

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = prefs.mute ? 0 : 0.9; master.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(2.8); const wet = ctx.createGain(); wet.gain.value = 0.5; reverb.connect(wet); wet.connect(master);
    ['sfx', 'amb', 'mus'].forEach(k => { const g = ctx.createGain(); g.gain.value = prefs[k]; g.connect(master);
      const send = ctx.createGain(); send.gain.value = k === 'mus' ? 0.55 : 0.3; g.connect(send); send.connect(reverb); buses[k] = g; });
    startAmbience(); startMusic();
  }
  function impulse(sec) { const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); } return b; }
  let noiseBuf = null;
  function noise() { if (noiseBuf) return noiseBuf; const len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return noiseBuf; }

  /* ---------- voices ---------- */
  let scale = 1; // the farmhand's work plays a little quieter than yours
  function env(g, t, a, peak, dur) { peak *= scale; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function bell(f, at = 0, dur = 1.4, vol = 0.12, bus = 'sfx') {
    const t = ctx.currentTime + at, g = ctx.createGain(); g.connect(buses[bus]); env(g, t, 0.006, vol, dur);
    [[1, 1], [2.76, 0.18], [5.4, 0.05]].forEach(([m, v]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05); });
  }
  function pluck(f, at = 0, dur = 0.35, vol = 0.1, bus = 'sfx') {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
    o.connect(lp); lp.connect(g); g.connect(buses[bus]); env(g, t, 0.004, vol, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  function tone(f0, f1, at, dur, vol, type = 'sine', bus = 'sfx') {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); g.connect(buses[bus]); env(g, t, 0.008, vol, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  function hush(freq, q, at, dur, vol, type = 'bandpass', bus = 'sfx') { // a soft filtered-noise burst: rustles, knocks, splashes
    const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(); f.type = type; f.frequency.value = freq; f.Q.value = q; s.connect(f); f.connect(g); g.connect(buses[bus]); env(g, t, 0.004, vol, dur); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  const rnd = a => a[(Math.random() * a.length) | 0];

  /* ---------- the sound list ---------- */
  const SOUNDS = {
    ready:   () => bell(rnd([N.E6, N.G6, N.D6]), 0, 1.6, 0.07),
    done:    () => { bell(N.G5, 0, 1.3, 0.08); bell(N.C6, 0.12, 1.6, 0.08); },
    collect: () => { pluck(N.C5, 0, 0.3, 0.09); pluck(N.E5, 0.07, 0.35, 0.08); },
    harvest: () => { pluck(N.C5, 0, 0.3, 0.08); pluck(N.E5, 0.06, 0.3, 0.08); pluck(N.G5, 0.12, 0.45, 0.08); hush(3000, 0.7, 0, 0.18, 0.03, 'highpass'); },
    till:    () => { hush(260, 0.8, 0, 0.22, 0.12, 'lowpass'); tone(120, 70, 0, 0.18, 0.06); },
    plant:   () => { hush(400, 0.8, 0, 0.15, 0.08, 'lowpass'); pluck(N.G4, 0.05, 0.25, 0.06); },
    water:   () => { tone(900, 1500, 0, 0.09, 0.05); tone(800, 1300, 0.11, 0.09, 0.04); hush(2500, 1, 0, 0.25, 0.02); },
    fertilize: () => { hush(500, 0.8, 0, 0.2, 0.07, 'lowpass'); bell(N.A5, 0.05, 0.9, 0.04); },
    chop:    () => { hush(700, 4, 0, 0.12, 0.16); tone(200, 140, 0, 0.12, 0.08, 'triangle'); hush(650, 4, 0.18, 0.1, 0.1); },
    replant: () => SOUNDS.plant(),
    mine:    () => { hush(2200, 6, 0, 0.08, 0.12); tone(480, 380, 0, 0.1, 0.05, 'triangle'); hush(1900, 6, 0.14, 0.07, 0.08); },
    fish:    () => { tone(1300, 520, 0, 0.16, 0.06); hush(1800, 0.8, 0.05, 0.3, 0.04); },
    gather:  () => { hush(3800, 0.8, 0, 0.2, 0.05, 'highpass'); pluck(rnd([N.D5, N.E5, N.G5]), 0.04, 0.3, 0.07); },
    sell:    () => { bell(N.G6, 0, 0.8, 0.05); bell(N.C6 * 2, 0.07, 1, 0.045); },
    buy:     () => { bell(N.C6, 0, 0.7, 0.05); bell(N.E6, 0.07, 0.8, 0.04); },
    deliver: () => [N.C5, N.E5, N.G5, N.C6].forEach((f, k) => bell(f, k * 0.09, 1.6, 0.07)),
    goal:    () => [N.C5, N.E5, N.G5, N.C6].forEach((f, k) => bell(f, k * 0.09, 1.6, 0.07)),
    contract: () => { [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, k) => bell(f, k * 0.1, 2, 0.07)); [N.C4, N.G4].forEach(f => bell(f, 0.45, 2.6, 0.05)); },
    discover: () => [N.C6, N.D6, N.E6, N.G6, N.A6].forEach((f, k) => bell(f, k * 0.06, 1.4, 0.045)),
    survey:  () => { [N.C4, N.G4, N.E5].forEach((f, k) => bell(f, k * 0.15, 3, 0.07)); bell(N.C6, 0.6, 2.5, 0.05); },
    build:   () => { hush(650, 4, 0, 0.1, 0.12); hush(600, 4, 0.16, 0.1, 0.1); bell(N.G5, 0.3, 1.2, 0.06); },
    place:   () => SOUNDS.build(), move: () => SOUNDS.build(), expand: () => { bell(N.D5, 0, 1.4, 0.06); bell(N.A5, 0.1, 1.6, 0.06); },
    upgrade: () => { bell(N.E5, 0, 1.2, 0.06); bell(N.A5, 0.1, 1.4, 0.06); }, homeup: () => SOUNDS.upgrade(), toolup: () => SOUNDS.upgrade(),
    load:    () => pluck(rnd([N.G4, N.A4]), 0, 0.25, 0.06),
    reshape: () => { hush(300, 0.7, 0, 0.35, 0.1, 'lowpass'); bell(N.D5, 0.2, 1.2, 0.05); },
    day:     () => { bell(N.C5, 0, 2.5, 0.05); bell(N.G5, 0.25, 2.5, 0.035); },
    warn:    () => { tone(N.A4, N.A4, 0, 0.18, 0.045, 'triangle'); tone(N.F4, N.F4, 0.16, 0.25, 0.045, 'triangle'); },
    tap:     () => pluck(N.C6, 0, 0.08, 0.02)
  };
  function play(name, vol = 1) {
    if (!ctx || prefs.mute || quiet || !SOUNDS[name] || ctx.state !== 'running') return;
    const now = performance.now(); if (now - (last[name] || 0) < 110) return; last[name] = now; // no machine-gun repeats
    scale = vol; try { SOUNDS[name](); } finally { scale = 1; }
  }

  /* ---------- ambience: a breeze all day, birds in daylight, crickets in the evening ---------- */
  function startAmbience() {
    const s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    s.buffer = noise(); s.loop = true; lp.type = 'lowpass'; lp.frequency.value = 420; g.gain.value = 0.05;
    lfo.frequency.value = 0.06; lg.gain.value = 0.035; lfo.connect(lg); lg.connect(g.gain);
    s.connect(lp); lp.connect(g); g.connect(buses.amb); s.start(); lfo.start(); breeze = { lp, g };
    // rain: a soft hiss that fades in while it falls
    const rs = ctx.createBufferSource(), rhp = ctx.createBiquadFilter(), rlp = ctx.createBiquadFilter(); rainG = ctx.createGain();
    rs.buffer = noise(); rs.loop = true; rhp.type = 'highpass'; rhp.frequency.value = 900; rlp.type = 'lowpass'; rlp.frequency.value = 5200; rainG.gain.value = 0;
    rs.connect(rhp); rhp.connect(rlp); rlp.connect(rainG); rainG.connect(buses.amb); rs.start();
    const drip = () => { timers.push(setTimeout(drip, 120 + Math.random() * 380)); if (!wet || prefs.mute || quiet || ctx.state !== 'running') return;
      tone(1800 + Math.random() * 1800, 900 + Math.random() * 500, 0, 0.05, 0.008, 'sine', 'amb'); };
    timers.push(setTimeout(drip, 500));
    // summer heat: cicadas in the middle of the day
    const cicadas = () => { timers.push(setTimeout(cicadas, 2500 + Math.random() * 4000)); if (prefs.mute || quiet || ctx.state !== 'running' || season !== 'summer' || hour < 11 || hour > 18 || wet) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), am = ctx.createOscillator(), ag = ctx.createGain(), g2 = ctx.createGain(), dur = 1.6 + Math.random() * 1.6;
      o.type = 'sawtooth'; o.frequency.value = 5200 + Math.random() * 600; am.frequency.value = 38 + Math.random() * 10; ag.gain.value = 0.5; am.connect(ag); ag.connect(g2.gain);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5600; bp.Q.value = 6; o.connect(bp); bp.connect(g2); g2.connect(buses.amb);
      const v = wx === 'heat' ? 0.012 : 0.006; g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(v, t + 0.5); g2.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.start(t); am.start(t); o.stop(t + dur + 0.1); am.stop(t + dur + 0.1); };
    timers.push(setTimeout(cicadas, 3000));
    const birds = () => { timers.push(setTimeout(birds, (season === 'winter' ? 9000 : season === 'autumn' ? 6000 : 4000) + Math.random() * 9000)); if (prefs.mute || quiet || hour >= 18.5 || wet || ctx.state !== 'running') return;
      if (season === 'winter' && Math.random() < .5) return;
      const base = 2400 + Math.random() * 1400, n = 2 + (Math.random() * 3 | 0);
      for (let k = 0; k < n; k++) { const at = k * (0.11 + Math.random() * 0.06); tone(base, base * (1.15 + Math.random() * 0.2), at, 0.07, 0.025, 'sine', 'amb'); } };
    const crickets = () => { timers.push(setTimeout(crickets, 900 + Math.random() * 700)); if (prefs.mute || quiet || hour < 18.5 || season === 'winter' || wet || ctx.state !== 'running') return;
      if (season === 'autumn' && Math.random() < .5) return;
      for (let k = 0; k < 3; k++) tone(4400, 4300, k * 0.045, 0.03, 0.012, 'triangle', 'amb'); };
    timers.push(setTimeout(birds, 2500)); timers.push(setTimeout(crickets, 1500));
  }

  /* ---------- music: a different piece for each season, generated as it plays and never the same twice ----------
     Each season has its own key, chords, tempo, melody voice and pad colour:
     spring: bright C major, music-box bells over soft pads, birdlike grace notes.
     summer: G major (a touch of Lydian), quicker, plucked melody with a walking bass.
     autumn: A minor/Dorian, slower and warmer, a low wooden pluck and a darker pad.
     winter: E minor, sparse high celesta notes, long airy pads with lots of space. */
  const THEMES = {
    spring: { bar: 9, lp: 900, padVol: 0.05, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62], [60, 64, 67], [57, 62, 64]], mel: [72, 74, 76, 79, 81, 84, 86, 88], gap: [0.9, 1.6], p: 0.7, voice: 'bell', grace: true },
    summer: { bar: 7, lp: 1300, padVol: 0.045, chords: [[55, 59, 62], [60, 64, 67], [57, 61, 64], [55, 59, 62], [52, 55, 59], [60, 64, 69]], mel: [67, 69, 71, 73, 74, 76, 78, 79, 81], gap: [0.45, 0.8], p: 0.6, voice: 'pluck', bass: true },
    autumn: { bar: 10, lp: 700, padVol: 0.055, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [50, 53, 57], [52, 56, 59]], mel: [57, 60, 62, 64, 67, 69, 72], gap: [1.0, 1.8], p: 0.65, voice: 'wood' },
    winter: { bar: 11, lp: 1100, padVol: 0.04, chords: [[52, 55, 59, 62], [48, 52, 55, 59], [55, 59, 62, 66], [50, 54, 57, 61]], mel: [83, 86, 88, 90, 91, 95, 98], gap: [1.6, 2.6], p: 0.55, voice: 'celesta' }
  };
  function pad(freqs, dur, T) {
    const t = ctx.currentTime, lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = T.lp;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(T.padVol, t + 2.5); g.gain.setValueAtTime(T.padVol, t + dur - 2.5); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1);
    lp.connect(g); g.connect(buses.mus);
    freqs.forEach(f => [0, 4].forEach(det => { const o = ctx.createOscillator(); o.type = T.voice === 'celesta' ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 1.2); }));
  }
  function note(T, f, at) {
    if (T.voice === 'bell') bell(f, at, 2.2, 0.04, 'mus');
    else if (T.voice === 'pluck') pluck(f, at, 0.6, 0.06, 'mus');
    else if (T.voice === 'wood') { pluck(f, at, 0.9, 0.07, 'mus'); pluck(f * 2, at + 0.01, 0.4, 0.015, 'mus'); }
    else { bell(f, at, 3.2, 0.03, 'mus'); bell(f * 2, at + 0.02, 1.6, 0.008, 'mus'); }
  }
  function startMusic() {
    let ci = 0, cur = null;
    const bar = () => { const T = THEMES[season] || THEMES.spring; if (T !== cur) { cur = T; ci = 0; }
      timers.push(setTimeout(bar, T.bar * 1000)); if (prefs.mute || prefs.mus <= 0 || ctx.state !== 'running') return;
      const ch = T.chords[ci++ % T.chords.length]; pad(ch.map(hz), T.bar, T);
      if (T.bass) [0, 2, 4, 6].forEach((b, k) => { if (k * (T.bar / 4) < T.bar - 0.5) pluck(hz(ch[0] - 12 + (k === 2 ? 7 : 0)), k * (T.bar / 4), 0.5, 0.05, 'mus'); });
      let prev = (Math.random() * T.mel.length) | 0;
      for (let at = 0.8; at < T.bar - 0.6; at += T.gap[0] + Math.random() * (T.gap[1] - T.gap[0])) {
        if (Math.random() > T.p) continue;
        prev = Math.max(0, Math.min(T.mel.length - 1, prev + ((Math.random() * 5) | 0) - 2)); // stepwise, so it sings rather than scatters
        note(T, hz(T.mel[prev]), at);
        if (T.grace && Math.random() < 0.15) note(T, hz(T.mel[Math.min(T.mel.length - 1, prev + 1)]), at - 0.08);
      } };
    timers.push(setTimeout(bar, 1200));
  }

  /* ---------- settings ---------- */
  function set(k, v) { prefs[k] = v; savePrefs(); if (!ctx) return;
    if (k === 'mute') master.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.05);
    else if (buses[k]) buses[k].gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

  // the season picks the music for the next bar; weather shapes the ambience (rain hiss, muffled breeze in snow and fog)
  function setScene(se, w, rain) { season = se; wx = w; wet = !!rain; if (!ctx || !breeze) return; const t = ctx.currentTime;
    rainG.gain.setTargetAtTime(wet ? 0.07 : 0, t, 1.5);
    breeze.lp.frequency.setTargetAtTime(w === 'snow' || w === 'fog' ? 260 : season === 'winter' ? 520 : season === 'autumn' ? 480 : 420, t, 2); }
  return { unlock, play, set, prefs, setScene, setHour(h) { hour = h; }, set quiet(v) { quiet = v; }, get ready() { return !!ctx; } };
})();
