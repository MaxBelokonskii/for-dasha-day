/* =========================================================
   Логика экранов. Каждый экран — функция (el, api) => хуки:
   { enter, arrived, leave, skip }
   api: done(), isDone(), sfx(name), hint(text), next(), go(i), setDark(bool), swapLead(text)
   ========================================================= */
(function () {
  'use strict';

  var C = window.CONTENT || {};
  var NS = 'http://www.w3.org/2000/svg';
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var restart = function (node, cls) { node.classList.remove(cls); void node.getBoundingClientRect(); node.classList.add(cls); };

  var Scenes = window.Scenes = {};

  /* ---------- 0. Интро ---------- */
  Scenes.intro = function (el, api) {
    var btn = el.querySelector('.start');
    btn.addEventListener('click', function () {
      if (window.Music) window.Music.start();
      if (window.App) window.App.syncSound();
      api.done();
      setTimeout(api.next, 220);
    });
    return {};
  };

  /* ---------- 1. Кофе: держать, чтобы налить ---------- */
  Scenes.coffee = function (el, api) {
    var fill = el.querySelector('.coffee-fill');
    var hold = el.querySelector('.hold');
    var cup = el.querySelector('.cup-wrap');
    var ring = el.querySelector('.ring-fg');
    var R = 2 * Math.PI * 30;
    ring.style.strokeDasharray = R;
    var TOP = 74, BOTTOM = 192;
    var level = 0, holding = false, raf = 0, last = 0;

    function render() {
      fill.setAttribute('y', (BOTTOM - (BOTTOM - TOP) * level).toFixed(1));
      ring.style.strokeDashoffset = (R * (1 - level)).toFixed(1);
    }
    function loop(t) {
      var dt = Math.min(50, t - last); last = t;
      if (holding && level < 1) {
        level = Math.min(1, level + dt / 2600);
        render();
        if (level >= 1) finish();
      }
      raf = holding ? requestAnimationFrame(loop) : 0;
    }
    function start(e) {
      if (api.isDone()) return;
      if (e && e.preventDefault) e.preventDefault();
      holding = true;
      el.classList.add('pouring');
      api.sfx('pour', true);
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(loop);
    }
    function stop() {
      if (!holding) return;
      holding = false;
      el.classList.remove('pouring');
      api.sfx('pour', false);
    }
    function finish() {
      stop();
      el.classList.add('full');
      api.done();
    }
    [hold, cup].forEach(function (n) {
      n.addEventListener('pointerdown', start);
      n.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    // клавиатура: пробел/Enter на кнопке
    hold.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.stopPropagation(); start(e); } });
    hold.addEventListener('keyup', stop);
    render();

    return {
      leave: stop,
      skip: function () { level = 1; render(); finish(); }
    };
  };

  /* ---------- Лиссабон: погладить, пока не замурчит ---------- */
  Scenes.cat = function (el, api) {
    var wrap = el.querySelector('.cat-wrap');
    var hearts = el.querySelector('.pet-hearts');
    var bar = el.querySelector('.purr .bar i');
    var pola = el.querySelector('.polaroid.liss');
    var img = pola.querySelector('img');
    var level = 0, last = null, sinceHeart = 0, purrTimer = null, finished = false;

    if (C.catPhoto) img.src = C.catPhoto;

    function heart(x, y) {
      var h = document.createElement('i');
      h.className = 'pet-heart';
      h.textContent = Math.random() < .5 ? '♥' : '❤';
      h.style.left = x + 'px';
      h.style.top = y + 'px';
      h.style.setProperty('--dx', rand(-30, 30) + 'px');
      hearts.appendChild(h);
      h.addEventListener('animationend', function () { h.remove(); });
    }
    function move(e) {
      var r = wrap.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      if (last) {
        var d = Math.hypot(x - last.x, y - last.y);
        if (d < 80) {
          el.classList.add('petting');
          api.sfx('purr', true);
          clearTimeout(purrTimer);
          purrTimer = setTimeout(function () { el.classList.remove('petting'); if (!finished) api.sfx('purr', false); }, 600);
          if (!finished) {
            level = Math.min(1, level + d / 1300);
            bar.style.width = (level * 100) + '%';
            if (level >= 1) finish();
          }
          sinceHeart += d;
          if (sinceHeart > 90) { sinceHeart = 0; heart(x, y); }
        }
      }
      last = { x: x, y: y };
    }
    function finish() {
      finished = true;
      el.classList.add('happy');
      setTimeout(function () { api.sfx('purr', false); }, 1800);
      setTimeout(function () { el.classList.add('show-liss'); api.sfx('pop', 6); }, 700);
      api.done();
    }
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerleave', function () { last = null; });
    wrap.addEventListener('pointerup', function () { last = null; });
    wrap.addEventListener('pointerdown', function (e) { last = null; move(e); });

    return {
      leave: function () { api.sfx('purr', false); el.classList.remove('petting'); },
      skip: function () { level = 1; bar.style.width = '100%'; finish(); }
    };
  };

  /* ---------- Спортзал: 8 повторений ---------- */
  Scenes.gym = function (el, api) {
    var btn = el.querySelector('.dumbbell');
    var num = el.querySelector('.reps b');
    var cheer = el.querySelector('.cheer');
    var NEED = C.gymReps || 8;
    var CHEERS = C.gymCheers || ['Ещё разок!'];
    el.querySelector('.reps span').textContent = '/ ' + NEED;
    var n = 0, lastT = 0;

    btn.addEventListener('click', function () {
      var t = performance.now();
      if (t - lastT < 140) return;
      lastT = t;
      restart(btn, 'rep');
      if (n >= NEED) { api.sfx('pop', 8); return; }
      n++;
      num.textContent = n;
      restart(num, 'bump');
      cheer.textContent = CHEERS[Math.min(n - 1, CHEERS.length - 1)];
      restart(cheer, 'pop');
      api.sfx('pop', n);
      if (n >= NEED) api.done();
    });
    return { skip: function () { n = NEED; num.textContent = n; } };
  };

  /* ---------- 2. Прогулка: апорт с Рэем ---------- */
  Scenes.walk = function (el, api) {
    var wrap = el.querySelector('.dog-wrap');
    var dog = el.querySelector('.dog');
    var ball = el.querySelector('.ball');
    var heart = el.querySelector('.heart-pop');
    var cnt = el.querySelector('.counter b');
    var NEED = C.walkThrows || 3;
    el.querySelector('.counter').lastChild.textContent = ' / ' + NEED;
    var n = 0, busy = false;

    function anim(node, frames, opts) {
      if (!node.animate) return { finished: Promise.resolve(), cancel: function () {} };
      return node.animate(frames, opts);
    }

    async function throwIt() {
      if (busy) return;
      busy = true;
      api.sfx('pop', 2);
      var W = window.innerWidth, Hh = window.innerHeight;
      var br = ball.getBoundingClientRect();
      var dx = W - br.left + 60;
      var a = anim(ball, [
        { transform: 'translate(0,0) rotate(0deg)' },
        { transform: 'translate(' + dx * .45 + 'px,' + (-Hh * .26) + 'px) rotate(300deg)' },
        { transform: 'translate(' + dx + 'px,0) rotate(720deg)' }
      ], { duration: 900, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' });

      await wait(160);
      api.sfx('woof');
      dog.classList.add('running');
      var dr = wrap.getBoundingClientRect();
      var run = W - dr.left + 40;
      var d1 = anim(wrap, [{ transform: 'translateX(0)' }, { transform: 'translateX(' + run + 'px)' }],
        { duration: 1000, easing: 'ease-in', fill: 'forwards' });
      await d1.finished;
      await wait(550);
      dog.classList.add('back', 'carry');
      var d2 = anim(wrap, [{ transform: 'translateX(' + run + 'px)' }, { transform: 'translateX(0)' }],
        { duration: 1300, easing: 'ease-out', fill: 'forwards' });
      await d2.finished;
      dog.classList.remove('back', 'carry', 'running');
      d1.cancel(); d2.cancel(); a.cancel();
      anim(ball, [{ opacity: 0, transform: 'translateY(-24px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 350, easing: 'ease-out' });

      n++;
      cnt.textContent = n;
      restart(heart, 'go');
      api.sfx('pop', 4 + n);
      if (n >= NEED) api.done();
      busy = false;
    }
    ball.addEventListener('click', throwIt);

    return {
      skip: function () { n = NEED; cnt.textContent = n; }
    };
  };

  /* ---------- 3. Цветы: полить три раза ---------- */
  Scenes.flowers = function (el, api) {
    var plant = el.querySelector('.plant');
    var can = el.querySelector('.can');
    var drops = el.querySelector('.drops');
    var cnt = el.querySelector('.counter b');
    var stages = Array.prototype.slice.call(plant.querySelectorAll('.st'));
    var stage = 0, busy = false;

    function setStage(s) {
      stage = s;
      plant.dataset.stage = s;
      cnt.textContent = s;
      stages.forEach(function (g) { g.classList.toggle('on', +g.dataset.s <= s); });
    }
    function drop() {
      var d = document.createElement('i');
      d.className = 'drop';
      d.style.left = rand(-16, 16) + 'px';
      d.style.setProperty('--fall', (plant.getBoundingClientRect().height * rand(.42, .5)) + 'px');
      drops.appendChild(d);
      d.addEventListener('animationend', function () { d.remove(); });
    }

    can.addEventListener('click', async function () {
      if (busy) return;
      if (stage >= 3) { api.sfx('pop', 6); restart(plant.querySelector('.bloom'), 'on'); return; }
      busy = true;
      can.classList.add('pour');
      for (var k = 0; k < 10; k++) setTimeout(drop, 120 + k * 60);
      api.sfx('drop'); setTimeout(function () { api.sfx('drop'); }, 220); setTimeout(function () { api.sfx('drop'); }, 450);
      await wait(900);
      can.classList.remove('pour');
      setStage(stage + 1);
      api.sfx('pop', stage + 2);
      if (stage >= 3) { await wait(700); api.done(); }
      busy = false;
    });
    setStage(0);

    return { skip: function () { setStage(3); } };
  };

  /* ---------- Город: найти 3 детали на фасадах ---------- */
  Scenes.city = function (el, api) {
    var details = Array.prototype.slice.call(el.querySelectorAll('.detail'));
    var slots = Array.prototype.slice.call(el.querySelectorAll('.slot'));
    var fact = el.querySelector('.fact');
    var flash = el.querySelector('.flash');
    var defs = C.cityDetails || [];
    var found = 0;

    function card(sym) {
      var d = document.createElement('div');
      d.className = 'pola';
      d.style.setProperty('--r', rand(-7, 7).toFixed(1) + 'deg');
      d.innerHTML = '<svg viewBox="0 0 40 40"><use href="#' + sym + '" x="0" y="0" width="40" height="40"/></svg>';
      return d;
    }
    function setFact(txt) {
      fact.classList.add('swap');
      setTimeout(function () { fact.textContent = txt; fact.classList.remove('swap'); }, 300);
    }
    function take(det) {
      if (det.classList.contains('found')) return;
      det.classList.add('found');
      var def = defs[+det.dataset.d] || { symbol: 'heart', fact: '' };
      restart(flash, 'go');
      api.sfx('shutter');
      setFact(def.fact);

      var slot = slots[found];
      found++;
      var c = card(def.symbol);
      var from = det.getBoundingClientRect(), to = slot.getBoundingClientRect();
      if (c.animate && to.width) {
        c.classList.add('fly');
        c.style.left = to.left + 'px';
        c.style.top = to.top + 'px';
        document.body.appendChild(c);
        var dx = from.left + from.width / 2 - (to.left + to.width / 2);
        var dy = from.top + from.height / 2 - (to.top + to.height / 2);
        c.animate([
          { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.4) rotate(-20deg)', opacity: 0 },
          { transform: 'translate(' + dx * .5 + 'px,' + dy * .55 + 'px) scale(1.7) rotate(8deg)', opacity: 1, offset: .35 },
          { transform: 'rotate(' + c.style.getPropertyValue('--r') + ')', opacity: 1 }
        ], { duration: 950, easing: 'cubic-bezier(.3,.8,.3,1)' }).finished.then(function () {
          c.classList.remove('fly'); c.style.left = c.style.top = '';
          slot.appendChild(c); slot.classList.add('filled');
        });
      } else {
        slot.appendChild(c); slot.classList.add('filled');
      }
      if (found >= details.length) setTimeout(api.done, 1100);
    }
    details.forEach(function (d) {
      d.addEventListener('click', function () { take(d); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); take(d); } });
    });

    return {
      skip: function () { details.forEach(function (d, k) { setTimeout(function () { take(d); }, k * 400); }); }
    };
  };

  /* ---------- Секонд: перебрать вешалки ---------- */
  Scenes.thrift = function (el, api) {
    var rack = el.querySelector('.rack');
    var box = el.querySelector('.hangers');
    var tag = el.querySelector('.tag');
    var tTitle = el.querySelector('.tag-title');
    var tPrice = el.querySelector('.tag-price');
    var items = C.thrift || [];
    var front = 0, busy = false;

    var SHAPES = {
      shirt: 'M30 30 14 40 4 80l16 4 8-24v86h64V60l8 24 16-4-10-40-16-10Q60 40 30 30z',
      sweater: 'M30 30 12 42 6 120l16 2 6-58v82h64V64l6 58 16-2-6-78-18-12Q60 42 30 30z',
      dress: 'M40 30q20 8 40 0l6 36q-8 6-4 10l28 70H10l28-70q4-4-4-10z',
      blazer: 'M24 30 2 38 0 96l16 2 10-36v84h68V62l10 36 16-2-2-58-22-8Q60 40 24 30z'
    };
    function pattern(id, it) {
      var c = it.color;
      switch (it.pattern) {
        case 'dots': return '<pattern id="' + id + '" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="' + c + '"/><circle cx="7" cy="7" r="2.6" fill="#fff"/></pattern>';
        case 'zigzag': return '<pattern id="' + id + '" width="20" height="18" patternUnits="userSpaceOnUse"><rect width="20" height="18" fill="' + c + '"/><path d="M0 13l5-6 5 6 5-6 5 6" stroke="#fff" stroke-width="2" fill="none"/></pattern>';
        case 'leaves': return '<pattern id="' + id + '" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="' + c + '"/><ellipse cx="8" cy="8" rx="7" ry="3" fill="#3f8f5f" transform="rotate(-30 8 8)"/><circle cx="20" cy="19" r="3.5" fill="#e8576b"/></pattern>';
        case 'denim': return '<pattern id="' + id + '" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="' + c + '"/><path d="M0 6 6 0" stroke="rgba(255,255,255,.2)" stroke-width="1"/></pattern>';
        default: return '';
      }
    }
    function extras(it) {
      var line = 'stroke="rgba(0,0,0,.18)" stroke-width="1.5" fill="none"';
      if (it.kind === 'shirt') {
        var e = '<path d="M46 30l14 14 14-14" fill="rgba(255,255,255,.25)" ' + line + '/><path d="M60 44v100" ' + line + '/>' +
          '<g fill="rgba(255,255,255,.75)"><circle cx="60" cy="62" r="2"/><circle cx="60" cy="84" r="2"/><circle cx="60" cy="106" r="2"/><circle cx="60" cy="128" r="2"/></g>';
        if (it.pattern === 'denim') e += '<rect x="68" y="56" width="16" height="16" rx="2" ' + line + '/><path d="M68 62h16" ' + line + '/><path d="M34 146V60M86 146V60" stroke="#e8b04a" stroke-width="1.2" stroke-dasharray="3 2" fill="none"/>';
        return e;
      }
      if (it.kind === 'sweater') return '<path d="M44 32q16 10 32 0" stroke="rgba(0,0,0,.2)" stroke-width="5" fill="none"/><path d="M28 140h64M6 116h16M98 116h16" stroke="rgba(0,0,0,.15)" stroke-width="6"/>';
      if (it.kind === 'dress') return '<path d="M36 70h48" stroke="#fff" stroke-width="4"/><circle cx="60" cy="70" r="4" fill="#f6b3c0"/>';
      if (it.kind === 'blazer') return '<path d="M44 32l16 40 16-40M60 72v74" ' + line + '/><path d="M44 32l-6 26 14 4M76 32l6 26-14 4" fill="rgba(255,255,255,.18)" ' + line + '/><g fill="#ffd36e"><circle cx="66" cy="96" r="2.4"/><circle cx="66" cy="114" r="2.4"/></g><rect x="30" y="104" width="16" height="4" rx="2" fill="rgba(0,0,0,.15)"/>';
      return '';
    }
    function svgFor(it, i) {
      var id = 'gp' + i;
      var p = pattern(id, it);
      var fill = p ? 'url(#' + id + ')' : it.color;
      return '<svg viewBox="0 0 120 150"><defs>' + p + '</defs>' +
        '<path d="M60 3c7 0 9 4 9 7 0 4-4 6-9 9" stroke="#8a6a4a" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M60 19 24 32h72z" fill="none" stroke="#8a6a4a" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="' + SHAPES[it.kind] + '" fill="' + fill + '" stroke="rgba(0,0,0,.12)" stroke-width="1.5"/>' +
        extras(it) + '</svg>';
    }

    var nodes = items.map(function (it, i) {
      var g = document.createElement('div');
      g.className = 'garment';
      g.innerHTML = svgFor(it, i);
      box.appendChild(g);
      return g;
    });

    function layout() {
      nodes.forEach(function (g, i) {
        var k = i - front;
        if (k < 0) {
          var off = -k - 1;
          g.style.transform = 'translateX(' + (-56 - off * 4) + '%) rotate(' + (-11 - off * 2) + 'deg) scale(.8)';
          g.style.zIndex = 5 + i;
          g.classList.add('aside');
        } else {
          g.style.transform = 'translateX(' + (k * 9) + '%) rotate(' + (k * 2.4) + 'deg) scale(' + (1 - k * .05) + ')';
          g.style.zIndex = 20 - k;
          g.classList.remove('aside');
        }
      });
    }
    function showTag(it, first) {
      var apply = function () {
        tTitle.textContent = it.title;
        tPrice.textContent = it.price;
        tag.classList.toggle('gold', !!it.find);
        tag.classList.remove('swap');
      };
      if (first) return apply();
      tag.classList.add('swap');
      setTimeout(apply, 260);
    }
    function sparkles() {
      for (var i = 0; i < 14; i++) {
        var s = document.createElement('i');
        s.className = 'sparkle';
        s.textContent = i % 3 ? '✦' : '✨';
        s.style.left = rand(25, 75) + '%';
        s.style.top = rand(15, 70) + '%';
        s.style.fontSize = rand(12, 24) + 'px';
        s.style.setProperty('--dx', rand(-60, 60) + 'px');
        s.style.setProperty('--dy', rand(-80, -20) + 'px');
        s.style.animationDelay = rand(0, .4) + 's';
        rack.appendChild(s);
        s.addEventListener('animationend', function () { this.remove(); });
      }
    }
    function nextItem() {
      if (busy) return;
      if (front >= items.length - 1) {
        api.sfx('pop', 6);
        sparkles();
        return;
      }
      busy = true;
      front++;
      layout();
      api.sfx('swoosh', true);
      setTimeout(function () { api.sfx('tick'); }, 180);
      showTag(items[front]);
      if (items[front].find) {
        setTimeout(function () { sparkles(); api.sfx('chime'); }, 450);
        setTimeout(api.done, 900);
      }
      setTimeout(function () { busy = false; }, 420);
    }
    rack.addEventListener('click', nextItem);
    layout();
    if (items[0]) showTag(items[0], true);

    return {
      skip: function () { front = items.length - 2; nextItem(); }
    };
  };

  /* ---------- 4. Картина по номерам ---------- */
  Scenes.paint = function (el, api) {
    var svg = el.querySelector('.pbn');
    var pal = el.querySelector('.palette');
    var labels = svg.querySelector('.labels');
    var COLORS = { 1: '#fde3cf', 2: '#c99a74', 3: '#86aed0', 4: '#ef8fa3', 5: '#8dbb83', 6: '#ffd36e' };
    var regions = Array.prototype.slice.call(svg.querySelectorAll('.rg'));
    var sel = null;

    regions.forEach(function (r) {
      var x = r.dataset.lx, y = r.dataset.ly;
      if (x == null) {
        try { var b = r.getBBox(); x = b.x + b.width / 2; y = b.y + b.height / 2; } catch (e) { x = 0; y = 0; }
      }
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.textContent = r.dataset.n;
      labels.appendChild(t);
      r._label = t;
    });

    var nums = [];
    regions.forEach(function (r) { if (nums.indexOf(r.dataset.n) < 0) nums.push(r.dataset.n); });
    nums.sort();
    nums.forEach(function (n) {
      var b = document.createElement('button');
      b.className = 'swatch';
      b.dataset.n = n;
      b.textContent = n;
      b.style.setProperty('--c', COLORS[n]);
      b.setAttribute('aria-label', 'Цвет ' + n);
      b.addEventListener('click', function () { select(n); });
      pal.appendChild(b);
    });

    function select(n) {
      sel = n;
      Array.prototype.forEach.call(pal.children, function (b) { b.classList.toggle('on', b.dataset.n === n); });
      regions.forEach(function (r) { r.classList.toggle('hl', r.dataset.n === n && !r.classList.contains('painted')); });
      api.sfx('pop', +n);
    }
    function paint(r) {
      if (r.classList.contains('painted')) return;
      r.classList.add('painted');
      r.classList.remove('hl');
      r.style.fill = COLORS[r.dataset.n];
      r._label.classList.add('gone');
      api.sfx('pop', +r.dataset.n + 2);
      var left = regions.filter(function (x) { return x.dataset.n === r.dataset.n && !x.classList.contains('painted'); }).length;
      if (!left) pal.querySelector('[data-n="' + r.dataset.n + '"]').classList.add('complete');
      if (regions.every(function (x) { return x.classList.contains('painted'); })) {
        el.classList.add('painted-all');
        api.done();
      }
    }
    regions.forEach(function (r) {
      r.addEventListener('click', function () {
        if (r.classList.contains('painted')) return;
        if (!sel) { api.hint('Сначала выбери цвет внизу 🎨'); return; }
        if (r.dataset.n !== sel) { restart(r, 'nope'); api.sfx('nope'); return; }
        paint(r);
      });
    });

    return {
      skip: function () {
        regions.filter(function (r) { return !r.classList.contains('painted'); })
          .forEach(function (r, k) { setTimeout(function () { paint(r); }, k * 70); });
      }
    };
  };

  /* ---------- 5. Вышивка крестиком ---------- */
  Scenes.stitch = function (el, api) {
    var grid = el.querySelector('.xgrid');
    var cnt = el.querySelector('.counter b');
    var tot = el.querySelector('.counter i');
    var PATTERN = [
      '..AA...AA..',
      '.ABAA.AAAA.',
      'ABAAAAAAAAA',
      'AAAAAAAAAAA',
      'AAAAAAAAAAA',
      '.AAAAAAAAA.',
      '..AAAAAAA..',
      '...AAAAA...',
      '....AAA....',
      '.....A.....'
    ];
    var COL = { A: '#e05a70', B: '#f7b8c2' };
    var cells = [];
    PATTERN.forEach(function (row) {
      row.split('').forEach(function (ch) {
        var c = document.createElement('div');
        c.className = 'cell';
        if (ch !== '.') { c.classList.add('p'); c.style.setProperty('--c', COL[ch]); cells.push(c); }
        grid.appendChild(c);
      });
    });
    var total = cells.length, n = 0, down = false, lastTick = 0, finishing = false;
    tot.textContent = total;

    function stitch(c) {
      if (!c || !c.classList || !c.classList.contains('p') || c.classList.contains('st')) return;
      c.classList.add('st');
      n++;
      cnt.textContent = n;
      var t = performance.now();
      if (t - lastTick > 45) { api.sfx('tick'); lastTick = t; }
      if (!finishing && n >= Math.ceil(total * .85)) autoFinish();
    }
    function at(e) { stitch(document.elementFromPoint(e.clientX, e.clientY)); }
    function autoFinish() {
      finishing = true;
      var rest = cells.filter(function (c) { return !c.classList.contains('st'); });
      rest.forEach(function (c, k) { setTimeout(function () { stitch(c); }, 150 + k * 45); });
      setTimeout(function () { el.classList.add('stitched'); api.done(); }, 300 + rest.length * 45 + 300);
    }
    grid.addEventListener('pointerdown', function (e) {
      down = true; at(e);
      if (e.pointerType !== 'mouse' && grid.releasePointerCapture) { try { grid.releasePointerCapture(e.pointerId); } catch (x) {} }
      e.preventDefault();
    });
    window.addEventListener('pointermove', function (e) { if (down) at(e); });
    window.addEventListener('pointerup', function () { down = false; });
    window.addEventListener('pointercancel', function () { down = false; });

    return { skip: function () { if (!finishing) autoFinish(); } };
  };

  /* ---------- 6. Любимаркет ---------- */
  Scenes.market = function (el, api) {
    var shop = el.querySelector('.shop');
    var shelf = el.querySelector('.shelf');
    var badge = el.querySelector('.badge');
    var bar = el.querySelector('.bar i');
    var freeT = el.querySelector('.free-text');
    var checkout = el.querySelector('.checkout');
    var typing = el.querySelector('.typing');
    var NEED = 3, count = 0, typer = null;

    (C.products || []).forEach(function (p) {
      var a = document.createElement('article');
      a.className = 'card';
      a.innerHTML =
        '<div class="card-img" style="--bg:' + p.bg + '"><span>' + p.emoji + '</span><em class="sale">−100%</em></div>' +
        '<div class="price"><b>0 ₽</b><s>' + p.old + '</s></div>' +
        '<h4>' + p.title + '</h4>' +
        '<p class="meta">★ 5,0 · ' + p.reviews + ' отзывов</p>' +
        '<p class="deliv">' + p.note + '</p>' +
        '<button class="add">В корзину</button>';
      var btn = a.querySelector('.add');
      btn.addEventListener('click', function () {
        if (shop.classList.contains('ordered')) return;
        var inCart = btn.classList.toggle('in');
        btn.textContent = inCart ? '✓ В корзине' : 'В корзину';
        count += inCart ? 1 : -1;
        api.sfx(inCart ? 'ding' : 'pop', 1);
        update();
      });
      shelf.appendChild(a);
    });

    function plural(n) {
      if (n % 10 === 1 && n % 100 !== 11) return 'товар';
      if ([2, 3, 4].indexOf(n % 10) >= 0 && [12, 13, 14].indexOf(n % 100) < 0) return 'товара';
      return 'товаров';
    }
    function update() {
      badge.textContent = count;
      restart(badge, 'bump');
      bar.style.width = Math.min(100, count / NEED * 100) + '%';
      var left = NEED - count;
      freeT.textContent = left > 0
        ? 'До бесплатной доставки счастья — ещё ' + left + ' ' + plural(left)
        : 'Доставка счастья — бесплатно 🎉';
      checkout.disabled = count < NEED;
    }
    checkout.addEventListener('click', function () {
      if (count < NEED) return;
      el.querySelector('.ord').textContent = '№' + Math.floor(1000 + Math.random() * 9000);
      shop.classList.add('ordered');
      api.sfx('chime');
      setTimeout(api.done, 600);
    });

    function startTyping() {
      var phrases = C.searchPhrases || ['подарок для самой любимой'];
      var pi = 0, ci = 0, dir = 1;
      clearInterval(typer);
      typer = setInterval(function () {
        var p = phrases[pi];
        ci += dir;
        typing.textContent = p.slice(0, ci);
        if (ci >= p.length + 14) dir = -1;      // пауза на полной фразе
        if (dir < 0 && ci > p.length) ci = p.length;
        if (ci <= 0 && dir < 0) { dir = 1; pi = (pi + 1) % phrases.length; }
      }, 70);
    }

    return {
      enter: startTyping,
      leave: function () { clearInterval(typer); },
      skip: function () {
        Array.prototype.slice.call(shelf.querySelectorAll('.add:not(.in)'), 0, Math.max(0, NEED - count))
          .forEach(function (b) { b.click(); });
        checkout.click();
      }
    };
  };

  /* ---------- 7. Вечер: подождать, пока стемнеет, и почитать ---------- */
  Scenes.evening = function (el, api) {
    var stars = el.querySelector('.stars');
    var book = el.querySelector('.book');
    var text = el.querySelector('.page-text');
    var photo = el.querySelector('.photo');
    var img = photo.querySelector('img');
    var pnum = el.querySelector('.pnum');
    var flipper = el.querySelector('.flipper');
    var lead = el.querySelector('.lead');
    var pages = C.book || [];
    var page = 0, started = false, flipping = false, timers = [];

    makeStars(stars, 46, 62);

    function show(i) {
      var p = pages[i] || {};
      text.textContent = p.text || '';
      pnum.textContent = i + 1;
      photo.classList.remove('has-img');
      if (p.photo) {
        img.onload = function () { photo.classList.add('has-img'); };
        img.onerror = function () { photo.classList.remove('has-img'); };
        img.src = p.photo;
      }
    }
    show(0);

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function night() {
      el.classList.add('dusk');
      later(function () { el.classList.add('night'); api.setDark(true); }, 3200);
      later(function () {
        el.classList.add('book-on');
        api.swapLead('Почитаем? Нажимай на страницу 📖');
      }, 7000);
    }

    book.addEventListener('click', async function () {
      if (!el.classList.contains('book-on') || flipping) return;
      if (page >= pages.length - 1) { api.sfx('pop', 7); return; }
      flipping = true;
      api.sfx('swoosh', true);
      flipper.style.opacity = 1;
      var a = flipper.animate
        ? flipper.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], { duration: 750, easing: 'cubic-bezier(.45,.05,.35,1)' })
        : null;
      text.classList.add('fade'); photo.classList.add('fade');
      await wait(380);
      page++;
      show(page);
      text.classList.remove('fade'); photo.classList.remove('fade');
      if (a) await a.finished;
      flipper.style.opacity = 0;
      flipping = false;
      if (page >= pages.length - 1) api.done();
    });

    return {
      arrived: function () { if (!started) { started = true; night(); } },
      skip: function () {
        timers.forEach(clearTimeout);
        el.classList.add('dusk', 'night', 'book-on');
        api.setDark(true);
        page = pages.length - 1; show(page);
      }
    };
  };

  /* ---------- 8. Финал ---------- */
  Scenes.finale = function (el, api) {
    var petals = el.querySelector('.petals');
    var sign = el.querySelector('.sign');
    sign.textContent = C.signature || '';
    var art = el.querySelector('.finale-art');
    var usImg = el.querySelector('.polaroid.us img');
    if (C.usPhoto) {
      usImg.onload = function () { art.classList.add('has-us'); };
      usImg.src = C.usPhoto;
    }
    makeStars(el.querySelector('.stars'), 60, 100);
    var COLORS = ['#f4a3b5', '#f7bccb', '#e86a80', '#ffd7df', '#f6a96b', '#fffaf3'];

    function burst(x, y, n, up) {
      for (var i = 0; i < n; i++) {
        var p = document.createElement('span');
        p.className = 'petal';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.setProperty('--c', COLORS[i % COLORS.length]);
        p.style.setProperty('--dx', rand(-140, 140) + 'px');
        p.style.setProperty('--dy', (up ? rand(-320, -120) : rand(60, 260)) + 'px');
        p.style.setProperty('--r', rand(-360, 360) + 'deg');
        p.style.setProperty('--t', rand(1.8, 3.2) + 's');
        petals.appendChild(p);
        p.addEventListener('animationend', function () { this.remove(); });
      }
    }
    el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      var r = el.getBoundingClientRect();
      burst(e.clientX - r.left, e.clientY - r.top, 12, Math.random() < .5);
      api.sfx('pop', Math.floor(rand(3, 9)));
    });
    el.querySelector('.restart').addEventListener('click', function () { api.go(1); });

    var timers = [];
    return {
      enter: function () { restart(el, 'play'); },
      arrived: function () {
        var W = el.clientWidth, H = el.clientHeight;
        timers.push(setTimeout(function () { burst(W / 2, H * .62, 26, true); api.sfx('chime'); }, 1700));
        timers.push(setTimeout(function () { burst(W * .2, H * .8, 14, true); }, 2600));
        timers.push(setTimeout(function () { burst(W * .8, H * .8, 14, true); }, 3000));
      },
      leave: function () { timers.forEach(clearTimeout); timers = []; }
    };
  };

  /* ---------- helpers ---------- */
  function makeStars(box, n, maxTop) {
    if (!box) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var s = document.createElement('i');
      s.className = 'star';
      s.style.left = rand(0, 100) + '%';
      s.style.top = rand(0, maxTop) + '%';
      s.style.setProperty('--s', rand(1.5, 3.4) + 'px');
      s.style.setProperty('--o', rand(.45, 1).toFixed(2));
      s.style.setProperty('--d', rand(0, 3).toFixed(2) + 's');
      frag.appendChild(s);
    }
    box.appendChild(frag);
  }
})();
