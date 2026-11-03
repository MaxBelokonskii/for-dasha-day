/* =========================================================
   Движок: полноэкранные «экраны», параллакс, гейты, ввод.
   ========================================================= */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var app = $('#app');
  var dotsEl = $('#dots'), nextBtn = $('#next'), hintEl = $('#hint'), skipBtn = $('#skip'), soundBtn = $('#sound');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var Music = window.Music || { start: function () {}, setMood: function () {}, toggle: function () { return true; }, isOn: function () { return false; }, sfx: function () {} };

  var S = Array.prototype.map.call(document.querySelectorAll('.scene'), function (el, i) {
    return {
      el: el, i: i,
      name: el.dataset.scene,
      done: !el.hasAttribute('data-gate'),
      dark: el.hasAttribute('data-dark'),
      layers: Array.prototype.map.call(el.querySelectorAll('.layer'), function (l) {
        return { el: l, speed: parseFloat(l.dataset.speed || '1'), depth: parseFloat(l.dataset.depth || '0') };
      }),
      hooks: {}
    };
  });
  var N = S.length;

  var cur = 0, maxSeen = 0, trans = null, nudgeAt = -1e9, H = window.innerHeight;
  var tx = 0, ty = 0, mx = 0, my = 0, pointerMode = 'idle';
  var skipTimer = null, hintTimer = null, wheelLock = false, wheelLast = 0, wheelAcc = 0;

  /* ---------- API для экранов ---------- */
  function makeApi(s) {
    return {
      done: function () { complete(s.i); },
      isDone: function () { return s.done; },
      sfx: function () { Music.sfx.apply(Music, arguments); },
      hint: showHint,
      next: function () { go(s.i + 1); },
      go: function (i) { go(i); },
      setDark: function (v) { s.dark = v; if (cur === s.i) refreshUI(); },
      swapLead: function (txt) { var l = s.el.querySelector('.lead'); if (l) swapText(l, txt); }
    };
  }

  S.forEach(function (s) {
    var def = window.Scenes && window.Scenes[s.name];
    if (!def) return;
    try { s.hooks = def(s.el, makeApi(s)) || {}; } catch (e) { console.error('Экран ' + s.name, e); s.done = true; }
  });
  function hook(i, name) {
    var h = S[i] && S[i].hooks[name];
    if (h) { try { h(); } catch (e) { console.error(e); } }
  }

  /* ---------- Точки навигации ---------- */
  S.forEach(function (s, i) {
    var b = document.createElement('button');
    b.className = 'dot';
    b.setAttribute('aria-label', s.el.dataset.title || ('Экран ' + (i + 1)));
    b.addEventListener('click', function () { if (i <= maxSeen) go(i); });
    dotsEl.appendChild(b);
  });

  function refreshUI() {
    var s = S[cur];
    Array.prototype.forEach.call(dotsEl.children, function (d, i) {
      d.classList.toggle('active', i === cur);
      d.classList.toggle('seen', i <= maxSeen);
      d.disabled = i > maxSeen;
    });
    nextBtn.classList.toggle('show', s.done && cur < N - 1 && cur > 0 && !trans);
    app.classList.toggle('ui-dark', !!s.dark);
    setThemeColor(s.dark ? (THEME_DARK[s.name] || '#151936') : (THEME[s.name] || '#fbf3ea'));
    dotsEl.style.opacity = cur === 0 ? 0 : 1;
  }

  // Цвет панели браузера (Safari/Chrome на телефоне) под текущий экран
  var THEME = { intro: '#ffd3bd', coffee: '#fbe0c9', cat: '#f6ecdf', gym: '#e2f3ee', walk: '#bfe2f2', flowers: '#f5efe4',
    city: '#ffd9b8', thrift: '#f5e2cf', paint: '#fff7ee', stitch: '#f6e9ea', market: '#efe8ff', evening: '#f7b98f', finale: '#151936' };
  var THEME_DARK = { evening: '#141938' };
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function setThemeColor(c) { if (themeMeta && themeMeta.content !== c) themeMeta.setAttribute('content', c); }

  function swapText(node, txt) {
    node.classList.add('swap');
    setTimeout(function () { node.textContent = txt; node.classList.remove('swap'); }, 350);
  }

  function showHint(msg) {
    if (!msg) return;
    hintEl.textContent = msg;
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintEl.classList.remove('show'); }, 2400);
  }

  function complete(i) {
    var s = S[i];
    if (s.done) return;
    s.done = true;
    s.el.classList.add('is-done');
    var lead = s.el.querySelector('[data-done-text]');
    if (lead) swapText(lead, lead.dataset.doneText);
    if (i > 0) Music.sfx('chime');
    if (i === cur) { clearTimeout(skipTimer); skipBtn.classList.remove('show'); }
    refreshUI();
  }

  /* ---------- Переходы ---------- */
  function go(to) {
    if (trans || to === cur || to < 0 || to >= N) return;
    if (to > cur) {
      for (var k = cur; k < to; k++) {
        if (!S[k].done) { if (k === cur) gateNudge(); return; }
      }
    }
    hook(cur, 'leave');
    var from = cur;
    cur = to;
    maxSeen = Math.max(maxSeen, cur);
    trans = { from: from, to: to, dir: to > from ? 1 : -1, start: performance.now(), dur: reduce ? 350 : 1150 };
    S[to].el.classList.add('is-visible');
    wheelLock = true;
    clearTimeout(skipTimer);
    skipBtn.classList.remove('show');
    hintEl.classList.remove('show');
    Music.setMood(S[to].el.dataset.mood);
    Music.sfx('swoosh');
    hook(to, 'enter');
    refreshUI();
  }

  function endTransition() {
    var t = trans;
    trans = null;
    S[t.from].el.classList.remove('is-visible');
    S[t.from].el.style.transform = '';
    hook(t.to, 'arrived');
    if (!S[cur].done && cur > 0) {
      skipTimer = setTimeout(function () { if (!S[cur].done) skipBtn.classList.add('show'); }, 35000);
    }
    refreshUI();
  }

  function gateNudge() {
    nudgeAt = performance.now();
    showHint(S[cur].el.dataset.hint || 'Сначала — маленькое дело на этом экране ✨');
    Music.sfx('nope');
  }

  /* ---------- Рендер-цикл (параллакс) ---------- */
  function ease(p) { return p < .5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2; }

  function place(i, off) {
    var s = S[i];
    s.el.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0)';
    for (var k = 0; k < s.layers.length; k++) {
      var L = s.layers[k];
      var y = (L.speed - 1) * off + my * L.depth;
      var x = mx * L.depth;
      L.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    }
  }

  function frame(now) {
    if (pointerMode === 'idle') {
      tx = Math.sin(now / 4300) * .35;
      ty = Math.cos(now / 5200) * .25;
    }
    mx += (tx - mx) * .06;
    my += (ty - my) * .06;

    if (trans) {
      var p = Math.min(1, (now - trans.start) / trans.dur), e = ease(p);
      place(trans.from, -trans.dir * e * H);
      place(trans.to, trans.dir * (1 - e) * H);
      if (p >= 1) endTransition();
    } else {
      var nt = (now - nudgeAt) / 520, off = 0;
      if (nt >= 0 && nt < 1) off = -Math.sin(nt * Math.PI) * 34 * (1 - nt * .4);
      place(cur, off);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Ввод ---------- */
  window.addEventListener('wheel', function (e) {
    var now = performance.now(), gap = now - wheelLast;
    wheelLast = now;
    if (e.ctrlKey) return;
    if (trans) { wheelLock = true; return; }
    if (wheelLock) { if (gap < 220) return; wheelLock = false; }
    if (gap > 220) wheelAcc = 0;
    var dy = e.deltaY * (e.deltaMode === 1 ? 33 : 1);
    if (Math.abs(e.deltaX) > Math.abs(dy)) return;
    wheelAcc += dy;
    if (Math.abs(wheelAcc) > 50) {
      var dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      wheelLock = true;
      if (dir > 0 && !S[cur].done) gateNudge(); else go(cur + dir);
    }
  }, { passive: true });

  var touch = null;
  app.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) { touch = null; return; }
    var t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, blocked: !!(e.target.closest && e.target.closest('[data-noswipe]')) };
  }, { passive: true });
  app.addEventListener('touchend', function (e) {
    if (!touch || touch.blocked) { touch = null; return; }
    var t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dy) > 48 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      if (dy < 0 && !S[cur].done) gateNudge(); else go(cur + (dy < 0 ? 1 : -1));
    }
  }, { passive: true });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    var onButton = e.target && e.target.tagName === 'BUTTON';
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !onButton)) {
      e.preventDefault();
      if (!S[cur].done) gateNudge(); else go(cur + 1);
    } else if (k === 'ArrowUp' || k === 'PageUp') {
      e.preventDefault(); go(cur - 1);
    } else if (k === 'Home') { go(0); }
  });

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    pointerMode = 'mouse';
    tx = (e.clientX / window.innerWidth - .5) * 2;
    ty = (e.clientY / window.innerHeight - .5) * 2;
  });

  // Гироскоп — только там, где не нужен системный запрос разрешения (Android)
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null || e.beta == null) return;
      pointerMode = 'gyro';
      tx = Math.max(-1, Math.min(1, e.gamma / 25));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 25));
    });
  }

  window.addEventListener('resize', function () { H = window.innerHeight; });

  nextBtn.addEventListener('click', function () { go(cur + 1); });
  skipBtn.addEventListener('click', function () {
    skipBtn.classList.remove('show');
    hook(cur, 'skip');
    complete(cur);
  });

  function syncSound() { soundBtn.classList.toggle('off', !Music.isOn()); }
  soundBtn.addEventListener('click', function () { Music.toggle(); syncSound(); });

  window.App = { go: go, syncSound: syncSound };

  /* ---------- Старт ---------- */
  // ?s=3 — открыть сразу нужный экран (удобно для отладки)
  var m = /[?&]s=(\d+)/.exec(location.search);
  if (m) {
    var target = Math.min(N - 1, +m[1]);
    for (var i = 0; i < target; i++) { S[i].done = true; S[i].el.classList.add('is-done'); }
    S[0].el.classList.remove('is-visible');
    cur = maxSeen = target;
    S[cur].el.classList.add('is-visible');
    Music.setMood(S[cur].el.dataset.mood);
    hook(cur, 'enter');
    setTimeout(function () { hook(cur, 'arrived'); }, 50);
  }
  refreshUI();
  requestAnimationFrame(frame);

  // Заранее подгружаем фото, чтобы они появлялись без задержки
  setTimeout(function () {
    var C = window.CONTENT || {};
    var urls = (C.book || []).map(function (p) { return p.photo; }).concat([C.usPhoto, C.catPhoto]);
    urls.forEach(function (u) { if (u) { var im = new Image(); im.decoding = 'async'; im.src = u; } });
  }, 1200);
})();
