/* =========================================================
   Музыка: генеративный lo-fi на Web Audio API.
   Никаких аудиофайлов — всё синтезируется прямо в браузере.
   Тональность до мажор, 72 BPM, 8-тактовый цикл:
   Fmaj7 – Em7 – Dm7 – Cmaj7 – Fmaj7 – G6 – Em7 – Am7
   ========================================================= */
(function () {
  'use strict';

  var mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  var ctx = null, master, musicIn, sfxOut, lowpass, comp, reverb, noiseBuf, pour = null;
  var started = false, muted = false, timer = null;
  var step = 0, nextT = 0, mood = 'intro';

  var BPM = 72, S16 = 60 / BPM / 4, BAR = 16, LOOP = BAR * 8;
  var bus = {};

  // Базовые уровни дорожек (микс)
  var BASE = { keys: .85, pad: .5, bass: .9, bell: .55, kick: .7, snare: .32, hat: .22, vinyl: .16 };

  // Настроения по экранам: множители дорожек + частота общего фильтра
  var MOODS = {
    intro:   { keys: .8, pad: 1,  bass: .5, bell: .35, kick: 0,   snare: 0,   hat: 0,   vinyl: 1,  cutoff: 2600 },
    morning: { keys: 1,  pad: .6, bass: .8, bell: .6,  kick: .5,  snare: .7,  hat: .3,  vinyl: .9, cutoff: 4800 },
    walk:    { keys: .9, pad: .5, bass: 1,  bell: .9,  kick: 1,   snare: .9,  hat: .9,  vinyl: .7, cutoff: 9000 },
    flowers: { keys: .9, pad: .7, bass: .9, bell: 1,   kick: .8,  snare: .8,  hat: .6,  vinyl: .8, cutoff: 7500 },
    cat:     { keys: .8, pad: 1,  bass: .5, bell: .55, kick: 0,   snare: 0,   hat: 0,   vinyl: 1,  cutoff: 3200 },
    gym:     { keys: .8, pad: .4, bass: 1,  bell: .8,  kick: 1,   snare: 1,   hat: 1,   vinyl: .5, cutoff: 11000 },
    city:    { keys: 1,  pad: .6, bass: .9, bell: .9,  kick: .7,  snare: .8,  hat: .6,  vinyl: .8, cutoff: 7000 },
    thrift:  { keys: .9, pad: .5, bass: 1,  bell: .8,  kick: .9,  snare: .8,  hat: .8,  vinyl: 1,  cutoff: 6000 },
    craft:   { keys: 1,  pad: .7, bass: .8, bell: .55, kick: .7,  snare: .7,  hat: .5,  vinyl: 1,  cutoff: 5200 },
    market:  { keys: .9, pad: .5, bass: 1,  bell: 1,   kick: 1,   snare: .9,  hat: 1,   vinyl: .7, cutoff: 10000 },
    evening: { keys: .8, pad: 1,  bass: .6, bell: .45, kick: 0,   snare: 0,   hat: 0,   vinyl: 1,  cutoff: 1700 },
    finale:  { keys: 1,  pad: 1,  bass: .9, bell: 1,   kick: .6,  snare: .5,  hat: .4,  vinyl: .8, cutoff: 7000 }
  };

  // Аккорды: бас + голоса (MIDI)
  var PROG = [
    { b: 41, c: [53, 57, 60, 64] }, // Fmaj7
    { b: 40, c: [52, 55, 59, 62] }, // Em7
    { b: 38, c: [50, 53, 57, 60] }, // Dm7
    { b: 36, c: [55, 59, 60, 64] }, // Cmaj7
    { b: 41, c: [53, 57, 60, 64] }, // Fmaj7
    { b: 43, c: [55, 59, 62, 64] }, // G6
    { b: 40, c: [52, 55, 59, 62] }, // Em7
    { b: 45, c: [55, 57, 60, 64] }  // Am7
  ];

  // Мелодия «Дашин день»: [такт, шестнадцатая, нота, длительность в 1/16]
  var MELODY = [
    [0, 0, 76, 3], [0, 3, 74, 1], [0, 4, 72, 4], [0, 10, 69, 2], [0, 12, 72, 4],
    [1, 0, 71, 6], [1, 8, 67, 2], [1, 10, 71, 2], [1, 12, 74, 4],
    [2, 0, 72, 3], [2, 3, 74, 1], [2, 4, 77, 4], [2, 8, 76, 4], [2, 12, 74, 4],
    [3, 0, 72, 8], [3, 12, 67, 2], [3, 14, 69, 2],
    [4, 0, 72, 2], [4, 2, 76, 2], [4, 4, 81, 6], [4, 12, 79, 4],
    [5, 0, 79, 4], [5, 4, 76, 2], [5, 6, 74, 2], [5, 8, 74, 8],
    [6, 0, 76, 3], [6, 3, 74, 1], [6, 4, 71, 4], [6, 8, 67, 4], [6, 12, 71, 4],
    [7, 0, 72, 6], [7, 8, 69, 8]
  ];
  var MEL = {};
  MELODY.forEach(function (n) { MEL[n[0] * BAR + n[1]] = [n[2], n[3]]; });

  /* ---------------- Построение графа ---------------- */
  function build() {
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'playback' });

    master = ctx.createGain(); master.gain.value = 0;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .3;
    master.connect(comp); comp.connect(ctx.destination);

    lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 2600; lowpass.Q.value = .4;
    lowpass.connect(master);

    // «Плавание» плёнки: модулируем крошечную задержку
    var wow = ctx.createDelay(.05); wow.delayTime.value = .012;
    var lfo = ctx.createOscillator(); lfo.frequency.value = .33;
    var lfoG = ctx.createGain(); lfoG.gain.value = .0011;
    lfo.connect(lfoG); lfoG.connect(wow.delayTime); lfo.start();
    musicIn = ctx.createGain(); musicIn.gain.value = .9;
    musicIn.connect(wow); wow.connect(lowpass);

    // Реверб
    reverb = ctx.createConvolver(); reverb.buffer = impulse(2.8, 2.6);
    var revOut = ctx.createGain(); revOut.gain.value = .32;
    reverb.connect(revOut); revOut.connect(lowpass);

    sfxOut = ctx.createGain(); sfxOut.gain.value = .9;
    sfxOut.connect(master);
    var sfxRev = ctx.createGain(); sfxRev.gain.value = .25; sfxOut.connect(sfxRev); sfxRev.connect(reverb);

    var sends = { keys: .3, pad: .5, bell: .55, snare: .15 };
    Object.keys(BASE).forEach(function (k) {
      var g = ctx.createGain(); g.gain.value = 0; g.connect(musicIn);
      if (sends[k]) { var s = ctx.createGain(); s.gain.value = sends[k]; g.connect(s); s.connect(reverb); }
      bus[k] = g;
    });

    // Шум для ударных
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    startVinyl();
  }

  function impulse(sec, decay) {
    var len = Math.floor(ctx.sampleRate * sec);
    var b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function startVinyl() {
    var len = ctx.sampleRate * 4;
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * .035;
    for (var k = 0; k < 70; k++) {
      var p = Math.floor(Math.random() * (len - 200)), a = rnd(.2, .8) * (Math.random() < .5 ? -1 : 1);
      for (var j = 0; j < 60; j++) d[p + j] += a * Math.exp(-j / 8);
    }
    var src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = .5;
    src.connect(bp); bp.connect(bus.vinyl); src.start();
  }

  /* ---------------- Инструменты ---------------- */
  function env(g, t, peak, a, d, sustain, rel) {
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(.0001, peak * sustain), t + a + d);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d + rel);
  }

  // Электропиано (FM)
  function keys(t, m, v, dur) {
    var f = mtof(m);
    var o = ctx.createOscillator(); o.frequency.value = f;
    var mo = ctx.createOscillator(); mo.frequency.value = f;
    var mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.5 * v, t);
    mg.gain.exponentialRampToValueAtTime(f * .12 + .01, t + .7);
    mo.connect(mg); mg.connect(o.frequency);
    var a = ctx.createGain();
    env(a, t, .2 * v, .012, .5, .35, dur + .8);
    o.connect(a); a.connect(bus.keys);
    var end = t + dur + 1.4;
    o.start(t); mo.start(t); o.stop(end); mo.stop(end);
  }
  function chord(t, notes, v, dur) {
    notes.forEach(function (m, i) { keys(t + i * .014, m, v * rnd(.85, 1), dur); });
  }

  // Пэд
  function pad(t, notes, dur) {
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = .3;
    var g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(.03, t + 1.3);
    g.gain.setValueAtTime(.03, t + dur - .3);
    g.gain.linearRampToValueAtTime(.0001, t + dur + 1.6);
    lp.connect(g); g.connect(bus.pad);
    notes.forEach(function (m) {
      [-7, 7].forEach(function (dt) {
        var o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mtof(m); o.detune.value = dt;
        o.connect(lp); o.start(t); o.stop(t + dur + 1.7);
      });
    });
  }

  function bass(t, m, v, dur) {
    var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    var g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.42 * v, t + .02);
    g.gain.exponentialRampToValueAtTime(.22 * v, t + .3);
    g.gain.setValueAtTime(.22 * v, t + dur);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur + .18);
    o.connect(lp); lp.connect(g); g.connect(bus.bass);
    o.start(t); o.stop(t + dur + .2);
  }

  // Колокольчик / калимба
  function bell(t, m, v, dur, dest) {
    var f = mtof(m), out = dest || bus.bell;
    var g = ctx.createGain();
    env(g, t, .28 * v, .005, .25, .3, Math.max(.6, dur) + .9);
    g.connect(out);
    [[1, 1], [2, .22], [4.07, .08]].forEach(function (p, i) {
      var o = ctx.createOscillator(); o.frequency.value = f * p[0];
      var pg = ctx.createGain(); pg.gain.setValueAtTime(p[1], t);
      if (i) pg.gain.exponentialRampToValueAtTime(.0001, t + .35 / i);
      o.connect(pg); pg.connect(g);
      o.start(t); o.stop(t + Math.max(.6, dur) + 1.3);
    });
  }

  function noise(t, dur, type, freq, q, peak, decay, dest) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + decay);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * .5); s.stop(t + dur);
  }
  function kick(t, v) {
    var o = ctx.createOscillator(); o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(42, t + .11);
    var g = ctx.createGain(); g.gain.setValueAtTime(.9 * v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .34);
    o.connect(g); g.connect(bus.kick); o.start(t); o.stop(t + .36);
  }
  function snare(t, v) { noise(t, .3, 'bandpass', 1900, .8, .5 * v, .22, bus.snare); }
  function hat(t, v) { noise(t, .08, 'highpass', 7200, .7, .32 * v, .05, bus.hat); }

  /* ---------------- Секвенсор ---------------- */
  function on(k) { return (MOODS[mood] || MOODS.intro)[k] > .01; }

  function playStep(s, t) {
    var loop = Math.floor(s / LOOP), bs = s % LOOP, bar = Math.floor(bs / BAR), st = bs % BAR;
    var ch = PROG[bar];

    if (st === 0 && on('pad')) pad(t, ch.c, BAR * S16);

    if (on('keys')) {
      if (st === 0) chord(t, ch.c, .6, 1.3);
      if (st === 6 && bar % 2 === 0) chord(t, ch.c.slice(2), .32, .4);
      if (st === 10) chord(t, ch.c, .42, .7);
      if (st === 14 && bar % 2 === 1) chord(t, ch.c.slice(1, 3), .26, .3);
    }

    if (on('bass')) {
      if (st === 0) bass(t, ch.b, .9, 6 * S16);
      if (st === 10) bass(t, ch.b + (bar % 2 ? 7 : 12), .6, 3 * S16);
      if (st === 14 && bar === 7) bass(t, ch.b - 2, .5, S16 * 1.5);
    }

    if (on('kick') && (st === 0 || st === 10 || (st === 7 && bar % 2))) kick(t, st === 0 ? 1 : .7);
    if (on('snare') && (st === 4 || st === 12)) snare(t, rnd(.8, 1));
    if (on('hat')) {
      if (st % 2 === 0) hat(t, st % 4 === 0 ? .9 : .55);
      else if (Math.random() < .14) hat(t, .3);
    }

    if (on('bell')) {
      if (loop % 2 === 0) {
        var n = MEL[bs];
        if (n) bell(t, n[0], .8, n[1] * S16);
      } else if ((st === 0 || st === 6 || st === 10) && Math.random() < .55) {
        bell(t, ch.c[Math.floor(Math.random() * 4)] + (Math.random() < .3 ? 24 : 12), .5, 2 * S16);
      }
    }
  }

  function schedule() {
    if (!ctx) return;
    if (nextT < ctx.currentTime - .05) nextT = ctx.currentTime + .05;
    while (nextT < ctx.currentTime + .15) {
      var swing = (step % 2) ? S16 * .28 : 0;
      try { playStep(step, nextT + swing); } catch (e) { /* не роняем музыку из-за одной ноты */ }
      nextT += S16;
      step = (step + 1) % (LOOP * 2);
    }
  }

  function applyMood(fast) {
    if (!ctx) return;
    var m = MOODS[mood] || MOODS.intro, now = ctx.currentTime, tc = fast ? .05 : .9;
    Object.keys(BASE).forEach(function (k) { bus[k].gain.setTargetAtTime(BASE[k] * (m[k] || 0), now, tc); });
    lowpass.frequency.setTargetAtTime(m.cutoff, now, fast ? .05 : 1.2);
  }

  /* ---------------- Звуковые эффекты ---------------- */
  var PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];
  var SFX = {
    pop: function (i) { bell(ctx.currentTime, PENTA[(i || 0) % PENTA.length], .55, .15, sfxOut); },
    chime: function () { var t = ctx.currentTime; [72, 76, 79, 84, 88].forEach(function (m, i) { bell(t + i * .085, m, .6, .3, sfxOut); }); },
    tick: function () { bell(ctx.currentTime, PENTA[3 + Math.floor(Math.random() * 6)], .22, .08, sfxOut); },
    ding: function () { var t = ctx.currentTime; bell(t, 88, .7, .3, sfxOut); bell(t + .12, 91, .6, .5, sfxOut); },
    nope: function () {
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(170, t + .15);
      env(g, t, .12, .01, .1, .3, .1); o.connect(g); g.connect(sfxOut); o.start(t); o.stop(t + .3);
    },
    drop: function () {
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(rnd(450, 600), t); o.frequency.exponentialRampToValueAtTime(rnd(1300, 1600), t + .08);
      env(g, t, .16, .005, .06, .2, .08); o.connect(g); g.connect(sfxOut); o.start(t); o.stop(t + .2);
    },
    swoosh: function (high) {
      var t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(high ? 1200 : 300, t); f.frequency.exponentialRampToValueAtTime(high ? 4000 : 1800, t + .45);
      var g = ctx.createGain(); g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(high ? .12 : .07, t + .18); g.gain.exponentialRampToValueAtTime(.0001, t + .55);
      s.connect(f); f.connect(g); g.connect(sfxOut); s.start(t); s.stop(t + .6);
    },
    woof: function () {
      var t0 = ctx.currentTime;
      [0, .2].forEach(function (d) {
        var t = t0 + d, o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(230, t + .12);
        var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2.5;
        var g = ctx.createGain(); env(g, t, .3, .01, .08, .3, .06);
        o.connect(f); f.connect(g); g.connect(sfxOut); o.start(t); o.stop(t + .2);
      });
    },
    shutter: function () {
      var t = ctx.currentTime;
      noise(t, .06, 'highpass', 2500, .7, .35, .04, sfxOut);
      noise(t + .07, .06, 'bandpass', 1800, 1, .25, .05, sfxOut);
    },
    purr: function (onState) {
      if (!SFX._purr) {
        var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
        var am = ctx.createGain(); am.gain.value = .5;
        var lfo = ctx.createOscillator(); lfo.frequency.value = 24;
        var lg = ctx.createGain(); lg.gain.value = .5;
        lfo.connect(lg); lg.connect(am.gain);
        var g = ctx.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(am); am.connect(g); g.connect(sfxOut);
        s.start(); lfo.start();
        SFX._purr = g;
      }
      SFX._purr.gain.setTargetAtTime(onState ? .9 : 0, ctx.currentTime, onState ? .15 : .4);
    },
    pour: function (onState) {
      if (!pour) {
        var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.4;
        var g = ctx.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(sfxOut); s.start();
        pour = g;
      }
      pour.gain.setTargetAtTime(onState ? .1 : 0, ctx.currentTime, .08);
    }
  };

  /* ---------------- Публичное API ---------------- */
  var silentEl = null;
  function silentWavUrl() {
    // 0.5 с тишины, 8 кГц, 8 бит — крошечный WAV, собранный на лету
    var n = 4000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    var str = function (o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    for (var i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function unlockIOS() {
    // iOS 17+: «медиа»-режим, звук идёт даже при беззвучном переключателе
    try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; } } catch (e) {}
    // Старые iOS: тот же эффект даёт тихо играющий <audio>
    var iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!iOS || silentEl) return;
    try {
      silentEl = new Audio(silentWavUrl());
      silentEl.loop = true;
      silentEl.setAttribute('playsinline', '');
      var p = silentEl.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  window.Music = {
    start: function () {
      unlockIOS();
      if (!ctx) {
        try { build(); } catch (e) { console.warn('Web Audio недоступен', e); return; }
      }
      ctx.resume();
      if (!started) {
        started = true;
        nextT = ctx.currentTime + .1;
        timer = setInterval(schedule, 25);
      }
      muted = false;
      applyMood(true);
      master.gain.setTargetAtTime(.85, ctx.currentTime, .6);
    },
    setMood: function (name) {
      if (name && MOODS[name]) mood = name;
      applyMood(false);
    },
    toggle: function () {
      if (!started) { this.start(); return false; }
      muted = !muted;
      if (muted) {
        master.gain.setTargetAtTime(0, ctx.currentTime, .12);
        setTimeout(function () { if (muted && ctx) ctx.suspend(); }, 500);
      } else {
        ctx.resume();
        master.gain.setTargetAtTime(.85, ctx.currentTime, .2);
      }
      return muted;
    },
    isOn: function () { return started && !muted; },
    sfx: function (name) {
      if (!ctx || muted || !SFX[name]) return;
      try { SFX[name].apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) {}
    }
  };

  document.addEventListener('visibilitychange', function () {
    if (!ctx || !started) return;
    if (document.hidden) ctx.suspend();
    else if (!muted) ctx.resume();
  });
})();
