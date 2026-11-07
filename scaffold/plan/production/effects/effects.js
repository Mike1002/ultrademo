/* effects.js — Ultrademo's effects library (D-78): a visual for each event in a video, played on the scene's own GSAP
   timeline so it renders frame by frame and seeks correctly. The matching sound for each effect is in catalogue.json;
   add it to the scene's cues at the same time.

   UDFX.play(tl, name, opts)
     tl      the scene's paused timeline
     name    one of UDFX.names
     opts    in:      the element the effect is drawn in (positioned; the effect sits above its content)
             at:      time on the timeline, in seconds
             target:  an element inside `in` to centre on (or x, y in px inside `in`)
             to:      {x, y} end point (pulse, send)
             w, h:    a region (erase, glint; taken from target when given)
             size:    scale, 1 by default
             level:   'lively' (default) or 'subtle' (fewer particles, shorter travel)
             label:   text for the stamp ('Approved' by default)
             color:   the stamp's colour; colors: [a, b] for the sparkle burst
             font:    font-family for the $ signs and the stamp (the scene's own font by default)
             text:    what typing types into the target (else the target's own text)
             count:   stars filled, bell count
             hold:    seconds the effect stays before fading (badges, stamps)
             hide:    erase also fades the target out
             cursor:  click also draws the pointer arriving and pressing
             dur:     seconds the sound wave runs (2.7 by default)
             behind:  the sound wave sits under the content of `in` (a call card over it)
   Everything is deterministic (seeded, never random), so a frame always renders the same. */
(function () {
  if (window.UDFX) return;
  var NS = 'http://www.w3.org/2000/svg';
  var PAL = ['#1674f8', '#53d4fc', '#ffcf21', '#17b26a', '#fc4213', '#be65ff'];
  function rnd(i, k) { var v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); }
  function mk(box, css, html) {
    var e = document.createElement('div');
    e.setAttribute('data-decor', '1');
    e.style.cssText = 'position:absolute;pointer-events:none;z-index:20;opacity:0;' + (css || '');
    if (html) e.innerHTML = html;
    box.appendChild(e);
    return e;
  }
  function svg(w, h, inner, vb) { return '<svg xmlns="' + NS + '" width="' + w + '" height="' + h + '" viewBox="' + (vb || '0 0 24 24') + '" style="display:block;overflow:visible">' + inner + '</svg>'; }
  // where the effect sits: a target element's centre (offset chain to the container) or x, y
  function origin(o) {
    if (o.target) {
      var x = o.target.offsetWidth / 2, y = o.target.offsetHeight / 2, w = o.target.offsetWidth, h = o.target.offsetHeight, l = 0, t = 0, e = o.target;
      while (e && e !== o.in) { l += e.offsetLeft; t += e.offsetTop; e = e.offsetParent; }
      return { x: l + x, y: t + y, left: l, top: t, w: w, h: h };
    }
    var W = o.w || 200, H = o.h || 60;
    return { x: o.x || 0, y: o.y || 0, left: (o.x || 0) - W / 2, top: (o.y || 0) - H / 2, w: W, h: H };
  }
  function n(o, lively, subtle) { return o.level === 'subtle' ? subtle : lively; }
  function centred(el, p, size) { el.style.left = (p.x - size / 2) + 'px'; el.style.top = (p.y - size / 2) + 'px'; }
  var STAR = '<path d="M12 2.5l2.9 6.2 6.6.7-4.9 4.5 1.4 6.6L12 17.2l-6 3.3 1.4-6.6-4.9-4.5 6.6-.7z"/>';
  var SPARK = '<path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z"/>';
  var FX = {};

  // money earned or paid: dollar signs burst up from the amount
  FX.money = function (tl, o, p) {
    var k = n(o, 9, 5), s = 40 * (o.size || 1);
    for (var i = 0; i < k; i++) {
      var e = mk(o.in, 'font:900 ' + s + 'px ' + (o.font || 'inherit') + ';color:#17b26a;text-shadow:0 4px 12px rgba(23,178,106,.25)', '$');
      e.style.left = (p.x - s / 3) + 'px'; e.style.top = (p.y - s / 2) + 'px';
      var dx = (rnd(i, 1) - 0.5) * 380 * (o.size || 1), dy = -(140 + rnd(i, 2) * 120) * (o.size || 1) * n(o, 1, 0.7);
      tl.fromTo(e, { opacity: 0, x: 0, y: 0, scale: 0.5, rotation: 0 }, { keyframes: [{ opacity: 1, scale: 1.1, duration: 0.18, ease: 'power2.out' }, { x: dx, y: dy, rotation: (rnd(i, 3) - 0.5) * 50, duration: 0.8, ease: 'power2.out' }, { opacity: 0, duration: 0.28, ease: 'power1.in' }], immediateRender: false }, o.at + i * 0.04);
    }
  };
  // hired, success, launch: confetti bursts up and falls
  FX.confetti = function (tl, o, p) {
    var k = n(o, 30, 14), sz = o.size || 1;
    for (var i = 0; i < k; i++) {
      var w = (6 + rnd(i, 4) * 6) * sz, h = (10 + rnd(i, 5) * 8) * sz;
      var e = mk(o.in, 'width:' + w + 'px;height:' + h + 'px;border-radius:2px;background:' + PAL[i % PAL.length]);
      e.style.left = (p.x - w / 2) + 'px'; e.style.top = (p.y - h / 2) + 'px';
      var a = (-160 + rnd(i, 6) * 140) * Math.PI / 180, v = (160 + rnd(i, 7) * 220) * sz * n(o, 1, 0.75);
      var bx = Math.cos(a) * v, by = Math.sin(a) * v;
      tl.fromTo(e, { opacity: 0, x: 0, y: 0, rotation: 0 }, { keyframes: [{ opacity: 1, x: bx, y: by, rotation: rnd(i, 8) * 360, duration: 0.5, ease: 'power2.out' }, { x: bx * 1.25, y: by + 320 * sz, rotation: rnd(i, 9) * 720, duration: 1.1, ease: 'power1.in' }, { opacity: 0, duration: 0.25 }], immediateRender: false }, o.at + rnd(i, 10) * 0.08);
    }
  };
  // a launch: two confetti bursts from the lower corners of the region
  FX.cannon = function (tl, o, p) {
    var W = p.w || 800;
    FX.confetti(tl, Object.assign({}, o, { size: (o.size || 1) * 1.2 }), { x: p.x - W / 2, y: p.y + 60 });
    FX.confetti(tl, Object.assign({}, o, { at: o.at + 0.12, size: (o.size || 1) * 1.2 }), { x: p.x + W / 2, y: p.y + 60 });
  };
  // task done: a green check draws itself
  FX.check = function (tl, o, p) {
    var s = 84 * (o.size || 1);
    var e = mk(o.in, '', svg(s, s, '<circle cx="12" cy="12" r="11" fill="#17b26a"/><path class="fx-ck" d="M6.8 12.4l3.4 3.4 7-7.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="20" stroke-dashoffset="20"/>'));
    centred(e, p, s);
    tl.fromTo(e, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2.4)', immediateRender: false }, o.at);
    tl.fromTo(e.querySelector('.fx-ck'), { attr: { 'stroke-dashoffset': 20 } }, { attr: { 'stroke-dashoffset': 0 }, duration: 0.32, ease: 'power2.out', immediateRender: false }, o.at + 0.18);
    tl.to(e, { opacity: 0, scale: 0.9, duration: 0.3 }, o.at + 0.5 + (o.hold || 0.9));
  };
  // success: a burst of four-point stars flies out from the point, twinkles and fades
  FX.sparkle = function (tl, o, p) {
    var k = n(o, 16, 9), sz = o.size || 1, c = o.colors || ['#1674f8', '#53d4fc'], reach = n(o, 1, 0.72);
    for (var i = 0; i < k; i++) {
      var s = (26 + (i * 11) % 30) * sz, a = (i / k) * Math.PI * 2 + 0.2, r = (190 + (i * 37) % 130) * sz * reach;
      var dx = Math.cos(a) * r, dy = Math.sin(a) * r * 0.7, t = o.at + (i % 4) * 0.03;
      var e = mk(o.in, '', svg(s, s, SPARK.replace('<path', '<path fill="' + (i % 3 ? c[0] : c[1]) + '"')));
      centred(e, p, s);
      tl.fromTo(e, { opacity: 0, x: 0, y: 0, scale: 0.2, rotation: 0 }, { opacity: 1, x: dx * 0.7, y: dy * 0.7, scale: 1, rotation: 45, duration: 0.3, ease: 'power3.out', immediateRender: false }, t);
      tl.to(e, { x: dx, y: dy + 30 * sz, scale: 0, rotation: 90, opacity: 0, duration: 0.6, ease: 'power2.in' }, t + 0.3 + (i % 3) * 0.05);
    }
  };
  // approved, verified, cited: a ring opens and a stamp lands with a small burst (label 'Approved' by default)
  FX.stamp = function (tl, o, p) {
    var sz = o.size || 1, R = 120 * sz, col = o.color || '#17b26a';
    var ring = mk(o.in, 'width:' + R + 'px;height:' + R + 'px;border-radius:50%;border:4px solid ' + col);
    centred(ring, p, R);
    tl.fromTo(ring, { opacity: 0.9, scale: 0.5 }, { opacity: 0, scale: 1.9, duration: 0.8, ease: 'power2.out', immediateRender: false }, o.at);
    var st = mk(o.in, 'padding:6px 14px;border:3px solid ' + col + ';border-radius:10px;font:800 ' + (22 * sz) + 'px ' + (o.font || 'inherit') + ';letter-spacing:.06em;text-transform:uppercase;color:' + col + ';background:rgba(255,255,255,.92);white-space:nowrap', o.label || 'Approved');
    st.style.left = (p.x + 30 * sz) + 'px'; st.style.top = (p.y - 70 * sz) + 'px';
    tl.fromTo(st, { opacity: 0, scale: 2, rotation: -14 }, { opacity: 1, scale: 1, rotation: -8, duration: 0.28, ease: 'power3.in', immediateRender: false }, o.at + 0.1);
    tl.fromTo(st, { y: 0 }, { y: 3, duration: 0.06, yoyo: true, repeat: 1, immediateRender: false }, o.at + 0.38);
    tl.to(st, { opacity: 0, duration: 0.3 }, o.at + 0.5 + (o.hold || 1.2));
    FX.sparkle(tl, Object.assign({}, o, { at: o.at + 0.36, level: 'subtle', size: sz * 0.45, colors: [col, '#a6e9c9'] }), { x: p.x + 110 * sz, y: p.y - 56 * sz });
  };
  FX.cited = FX.stamp;
  // achievement: a big gold star pops with sparkles
  FX.bigstar = function (tl, o, p) {
    var s = 120 * (o.size || 1);
    var e = mk(o.in, 'filter:drop-shadow(0 0 18px rgba(255,207,33,.7))', svg(s, s, STAR.replace('<path', '<path fill="#ffcf21" stroke="#f0a500" stroke-width="0.8"')));
    centred(e, p, s);
    tl.fromTo(e, { opacity: 0, scale: 0, rotation: -40 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.45, ease: 'back.out(2.2)', immediateRender: false }, o.at);
    tl.to(e, { opacity: 0, scale: 0.8, duration: 0.3 }, o.at + 0.5 + (o.hold || 1));
    FX.sparkle(tl, Object.assign({}, o, { at: o.at + 0.15, size: (o.size || 1) * 0.6, colors: ['#ffcf21', '#ffe58a'] }), p);
  };
  FX.badge = FX.bigstar;
  // rating: a row of stars fills one by one
  FX.stars = function (tl, o, p) {
    var c = o.count || 5, s = 46 * (o.size || 1), gap = 8 * (o.size || 1), W = c * s + (c - 1) * gap;
    for (var i = 0; i < 5; i++) {
      var e = mk(o.in, '', svg(s, s, '<g class="fx-bg">' + STAR.replace('<path', '<path fill="#eaecf0"') + '</g><g class="fx-on" style="opacity:0">' + STAR.replace('<path', '<path fill="#ffcf21" stroke="#f0a500" stroke-width="0.6"') + '</g>'));
      e.style.left = (p.x - (5 * s + 4 * gap) / 2 + i * (s + gap)) + 'px'; e.style.top = (p.y - s / 2) + 'px';
      tl.fromTo(e, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.2, immediateRender: false }, o.at);
      if (i < c) {
        tl.fromTo(e.querySelector('.fx-on'), { opacity: 0 }, { opacity: 1, duration: 0.1, immediateRender: false }, o.at + 0.2 + i * 0.13);
        tl.fromTo(e, { scale: 1 }, { scale: 1.25, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, o.at + 0.2 + i * 0.13);
      }
      tl.to(e, { opacity: 0, duration: 0.3 }, o.at + 0.9 + (o.hold || 1));
    }
  };
  // reactions (thumbs up, high five, smiley): the icon pops, wobbles, and three small copies float up like live reactions
  function reaction(tl, o, p, inner, glow) {
    var sz = o.size || 1, s = 92 * sz;
    var e = mk(o.in, 'filter:drop-shadow(0 8px 18px ' + glow + ')', svg(s, s, inner));
    centred(e, p, s);
    tl.fromTo(e, { opacity: 0, scale: 0.3, rotation: -20 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.35, ease: 'back.out(2.6)', immediateRender: false }, o.at);
    tl.fromTo(e, { rotation: 0 }, { keyframes: { rotation: [0, -10, 8, -4, 0] }, duration: 0.4, ease: 'none', immediateRender: false }, o.at + 0.35);
    for (var i = 0; i < n(o, 3, 0); i++) {
      var m = s * 0.38, c = mk(o.in, '', svg(m, m, inner));
      centred(c, { x: p.x + (i - 1) * 34 * sz, y: p.y - 10 * sz }, m);
      tl.fromTo(c, { opacity: 0, y: 0, x: 0, scale: 0.5 }, { keyframes: [{ opacity: 1, scale: 1, duration: 0.15 }, { y: -(110 + rnd(i, 30) * 50) * sz, x: (rnd(i, 31) - 0.5) * 50 * sz, duration: 0.8, ease: 'sine.out' }, { opacity: 0, duration: 0.2 }], immediateRender: false }, o.at + 0.3 + i * 0.12);
    }
    tl.to(e, { y: -30, opacity: 0, duration: 0.4, ease: 'power2.in' }, o.at + 0.75 + (o.hold || 0.6));
  }
  // approval
  FX.thumbsup = function (tl, o, p) {
    reaction(tl, o, p, '<circle cx="12" cy="12" r="11.5" fill="#1674f8"/><path d="M7 11h2.3v6.5H7zM10.3 17.5V11l2.6-4.2c.5-.8 1.8-.5 1.8.5v2.8h2.6c.9 0 1.5.8 1.3 1.6l-1.1 4.6c-.2.6-.7 1.1-1.4 1.1z" fill="#fff"/>', 'rgba(22,116,248,.35)');
  };
  // a win shared by the team: two raised hands swing in, meet with impact lines and a small burst, then bounce apart
  var HAND = (function () {
    var F = [[8.6, 12.5, 8.2, 4.6], [11.7, 12, 11.7, 3.2], [14.8, 12.3, 15.2, 4], [17.6, 13.6, 18.6, 7.2], [8.8, 16.2, 4.4, 11.6]];
    function layer(col, extra) {
      var g = '<path d="M7.2 13.4h11.7v4.4a5.4 5.4 0 01-5.4 5.4h-0.9a5.4 5.4 0 01-5.4-5.4z" fill="' + col + '" stroke="' + col + '" stroke-width="' + extra + '" stroke-linejoin="round"/>';
      F.forEach(function (f, i) { g += '<path d="M' + f[0] + ' ' + f[1] + 'L' + f[2] + ' ' + f[3] + '" stroke="' + col + '" stroke-width="' + ((i === 4 ? 3.3 : 3) + extra) + '" stroke-linecap="round"/>'; });
      return g;
    }
    return layer('#b87400', 1.5) + layer('#ffcf21', 0) + '<path d="M10 18.6c1.6 1.1 4 1.1 5.6 0" fill="none" stroke="#e0a000" stroke-width=".8" stroke-linecap="round"/>';
  })();
  FX.highfive = function (tl, o, p) {
    var sz = o.size || 1, s = 96 * sz, gap = s * 0.3;
    var L = mk(o.in, 'filter:drop-shadow(0 6px 12px rgba(184,116,0,.3))', svg(s, s, HAND));
    var R = mk(o.in, 'filter:drop-shadow(0 6px 12px rgba(184,116,0,.3))', svg(s, s, '<g transform="translate(24 0) scale(-1 1)">' + HAND + '</g>'));
    L.style.left = (p.x - gap - s / 2) + 'px'; L.style.top = (p.y - s / 2) + 'px'; L.style.transformOrigin = '50% 100%';
    R.style.left = (p.x + gap - s / 2) + 'px'; R.style.top = (p.y - s / 2) + 'px'; R.style.transformOrigin = '50% 100%';
    var t = o.at, hit = t + 0.3;
    tl.fromTo(L, { opacity: 0, x: -90 * sz, rotation: -35 }, { opacity: 1, x: 0, rotation: 22, duration: 0.3, ease: 'power3.in', immediateRender: false }, t);
    tl.fromTo(R, { opacity: 0, x: 90 * sz, rotation: 35 }, { opacity: 1, x: 0, rotation: -22, duration: 0.3, ease: 'power3.in', immediateRender: false }, t);
    tl.to(L, { x: -14 * sz, rotation: 6, duration: 0.35, ease: 'back.out(3)' }, hit);
    tl.to(R, { x: 14 * sz, rotation: -6, duration: 0.35, ease: 'back.out(3)' }, hit);
    // impact lines from the meeting point, above the palms
    var cx = p.x, cy = p.y - s * 0.42, k = n(o, 7, 5);
    for (var i = 0; i < k; i++) {
      var a = (-90 + (i - (k - 1) / 2) * (150 / (k - 1))) * Math.PI / 180, len = 22 * sz;
      var ln = mk(o.in, 'width:' + len + 'px;height:' + (4 * sz) + 'px;border-radius:4px;background:#fc8f13;transform-origin:0 50%');
      ln.style.left = cx + 'px'; ln.style.top = (cy - 2 * sz) + 'px';
      var rot = a * 180 / Math.PI, d0 = 16 * sz, d1 = 46 * sz;
      tl.fromTo(ln, { opacity: 0, rotation: rot, x: Math.cos(a) * d0, y: Math.sin(a) * d0, scaleX: 0.3 }, { keyframes: [{ opacity: 1, scaleX: 1, duration: 0.08 }, { x: Math.cos(a) * d1, y: Math.sin(a) * d1, opacity: 0, scaleX: 0.5, duration: 0.32, ease: 'power2.out' }], immediateRender: false }, hit);
    }
    FX.sparkle(tl, Object.assign({}, o, { at: hit, level: 'subtle', size: sz * 0.42, colors: ['#ffcf21', '#fc8f13'] }), { x: cx, y: cy });
    tl.to([L, R], { opacity: 0, y: -20 * sz, duration: 0.3, ease: 'power2.in' }, hit + 0.45 + (o.hold || 0.6));
  };
  // a happy customer, a good experience
  FX.smiley = function (tl, o, p) {
    reaction(tl, o, p, '<circle cx="12" cy="12" r="11.5" fill="#ffcf21"/><circle cx="12" cy="12" r="11.5" fill="none" stroke="#e0a800" stroke-width=".6"/><ellipse cx="8.4" cy="9.6" rx="1.3" ry="1.8" fill="#3d2b00"/><ellipse cx="15.6" cy="9.6" rx="1.3" ry="1.8" fill="#3d2b00"/><path d="M6.6 13.4c1.2 3 3.2 4.4 5.4 4.4s4.2-1.4 5.4-4.4" fill="none" stroke="#3d2b00" stroke-width="1.6" stroke-linecap="round"/><circle cx="6.4" cy="14" r="1.4" fill="#ff8fa3" opacity=".6"/><circle cx="17.6" cy="14" r="1.4" fill="#ff8fa3" opacity=".6"/>', 'rgba(224,168,0,.4)');
  };
  // delight: hearts float up and sway
  FX.hearts = function (tl, o, p) {
    var k = n(o, 7, 4), sz = o.size || 1;
    for (var i = 0; i < k; i++) {
      var s = (22 + rnd(i, 14) * 18) * sz;
      var e = mk(o.in, '', svg(s, s, '<path d="M12 21s-7.5-4.6-9.5-9.3C1 8.1 3.3 4.5 7 4.5c2.1 0 3.6 1.1 5 2.9 1.4-1.8 2.9-2.9 5-2.9 3.7 0 6 3.6 4.5 7.2C19.5 16.4 12 21 12 21z" fill="' + (i % 2 ? '#fc4b6c' : '#ff8fa3') + '"/>'));
      centred(e, { x: p.x + (rnd(i, 15) - 0.5) * 80 * sz, y: p.y }, s);
      tl.fromTo(e, { opacity: 0, y: 0, x: 0, scale: 0.4 }, { keyframes: [{ opacity: 1, scale: 1, duration: 0.2 }, { y: -(150 + rnd(i, 16) * 90) * sz, x: (rnd(i, 17) - 0.5) * 90 * sz, duration: 1.1, ease: 'sine.out' }, { opacity: 0, duration: 0.25 }], immediateRender: false }, o.at + i * 0.09);
    }
  };
  // security: a shield pops and its lock clicks shut
  FX.shield = function (tl, o, p) {
    var s = 110 * (o.size || 1);
    var e = mk(o.in, 'filter:drop-shadow(0 10px 22px rgba(22,116,248,.35))', svg(s, s, '<path d="M12 1.8l8.2 3.1v6.2c0 5.1-3.5 9.4-8.2 11.1C7.3 20.5 3.8 16.2 3.8 11.1V4.9z" fill="#1674f8"/><path class="fx-sh" d="M9.4 11V9.2a2.6 2.6 0 015.2 0V11" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><rect x="8.2" y="10.6" width="7.6" height="5.6" rx="1.2" fill="#fff"/>'));
    centred(e, p, s);
    tl.fromTo(e, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)', immediateRender: false }, o.at);
    tl.fromTo(e.querySelector('.fx-sh'), { y: -2.6 }, { y: 0, duration: 0.12, ease: 'power3.in', immediateRender: false }, o.at + 0.45);
    tl.fromTo(e, { scale: 1 }, { scale: 1.08, duration: 0.1, yoyo: true, repeat: 1, immediateRender: false }, o.at + 0.57);
    tl.to(e, { opacity: 0, duration: 0.3 }, o.at + 0.8 + (o.hold || 0.9));
  };
  // privacy or deletion: a sweep erases the region (and fades the target when hide is set)
  FX.erase = function (tl, o, p) {
    var e = mk(o.in, 'left:' + p.left + 'px;top:' + p.top + 'px;width:' + p.w + 'px;height:' + p.h + 'px;overflow:hidden;opacity:1');
    var band = document.createElement('div');
    band.style.cssText = 'position:absolute;top:0;bottom:0;width:60px;left:-60px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.95),rgba(240,68,56,.25),rgba(255,255,255,0))';
    e.appendChild(band);
    tl.fromTo(band, { x: 0 }, { x: p.w + 120, duration: 0.55, ease: 'power1.inOut', immediateRender: false }, o.at);
    if (o.hide && o.target) tl.to(o.target, { opacity: 0, duration: 0.3 }, o.at + 0.25);
  };
  // speed or automation: lines streak past
  FX.speed = function (tl, o, p) {
    var k = n(o, 8, 5), sz = o.size || 1;
    for (var i = 0; i < k; i++) {
      var w = (120 + rnd(i, 18) * 160) * sz;
      var e = mk(o.in, 'height:' + (3 + rnd(i, 19) * 3) + 'px;width:' + w + 'px;border-radius:3px;background:linear-gradient(90deg,rgba(22,116,248,0),#1674f8)');
      e.style.left = (p.x - 260 * sz) + 'px'; e.style.top = (p.y + (i - k / 2) * 16 * sz) + 'px';
      tl.fromTo(e, { opacity: 0, x: 0 }, { keyframes: [{ opacity: 0.9, duration: 0.08 }, { x: 420 * sz, duration: 0.42, ease: 'power2.in' }, { opacity: 0, duration: 0.1 }], immediateRender: false }, o.at + rnd(i, 20) * 0.2);
    }
  };
  // growth: a green arrow rises with a glow
  FX.growth = function (tl, o, p) {
    var s = 90 * (o.size || 1);
    var e = mk(o.in, 'filter:drop-shadow(0 0 14px rgba(23,178,106,.5))', svg(s, s, '<path d="M12 2.5l7.5 8h-4.7V21H9.2V10.5H4.5z" fill="#17b26a"/>'));
    centred(e, p, s);
    tl.fromTo(e, { opacity: 0, y: 50 }, { opacity: 1, y: -20, duration: 0.55, ease: 'power3.out', immediateRender: false }, o.at);
    tl.to(e, { opacity: 0, y: -50, duration: 0.35, ease: 'power2.in' }, o.at + 0.6 + (o.hold || 0.6));
  };
  // drop or problem: the target shakes and a red arrow sinks
  FX.drop = function (tl, o, p) {
    if (o.target) tl.fromTo(o.target, { x: 0 }, { keyframes: { x: [0, -10, 9, -7, 5, -3, 0] }, duration: 0.45, ease: 'none', immediateRender: false }, o.at);
    var s = 70 * (o.size || 1);
    var e = mk(o.in, '', svg(s, s, '<path d="M12 21.5l7.5-8h-4.7V3H9.2v10.5H4.5z" fill="#f04438"/>'));
    centred(e, { x: p.x + (p.w || 0) / 2 + s * 0.4, y: p.y }, s);
    tl.fromTo(e, { opacity: 0, y: -30 }, { opacity: 1, y: 20, duration: 0.5, ease: 'power2.in', immediateRender: false }, o.at + 0.05);
    tl.to(e, { opacity: 0, duration: 0.3 }, o.at + 0.6 + (o.hold || 0.6));
  };
  // notification: a bell rings with a count
  FX.bell = function (tl, o, p) {
    var s = 84 * (o.size || 1);
    var e = mk(o.in, 'transform-origin:50% 10%', svg(s, s, '<path d="M12 2.5a6.2 6.2 0 00-6.2 6.2v4.1L4 15.6v1.2h16v-1.2l-1.8-2.8V8.7A6.2 6.2 0 0012 2.5z" fill="#ffcf21" stroke="#e0a800" stroke-width=".6"/><path d="M9.6 18.2a2.4 2.4 0 004.8 0z" fill="#e0a800"/><circle cx="18.5" cy="5.5" r="4.2" fill="#f04438"/><text x="18.5" y="7.2" text-anchor="middle" font-size="5.4" font-weight="700" fill="#fff" font-family="inherit">' + (o.count || 1) + '</text>'));
    centred(e, p, s);
    tl.fromTo(e, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)', immediateRender: false }, o.at);
    tl.fromTo(e, { rotation: 0 }, { keyframes: { rotation: [0, 18, -15, 11, -7, 3, 0] }, duration: 0.7, ease: 'none', immediateRender: false }, o.at + 0.2);
    tl.to(e, { opacity: 0, duration: 0.3 }, o.at + 0.9 + (o.hold || 0.6));
  };
  // sync: a glowing pulse travels from the point to `to`
  FX.pulse = function (tl, o, p) {
    var to = o.to || { x: p.x + 300, y: p.y }, k = 3, sz = o.size || 1;
    for (var i = 0; i < k; i++) {
      var s = 16 * sz;
      var e = mk(o.in, 'width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:#1674f8;box-shadow:0 0 0 6px rgba(22,116,248,.2),0 0 16px rgba(22,116,248,.6)');
      centred(e, p, s);
      tl.fromTo(e, { opacity: 0, x: 0, y: 0 }, { keyframes: [{ opacity: 1, duration: 0.06 }, { x: to.x - p.x, y: to.y - p.y, duration: 0.55, ease: 'power2.inOut' }, { opacity: 0, duration: 0.08 }], immediateRender: false }, o.at + i * 0.22);
    }
  };
  // sent or shared: a paper plane flies off up and to the right
  FX.send = function (tl, o, p) {
    var s = 64 * (o.size || 1), to = o.to || { x: p.x + 360, y: p.y - 200 };
    var e = mk(o.in, '', svg(s, s, '<path d="M2.5 11.4L21.5 3l-5.4 18-4.6-6.3-6.4-1.7z" fill="#1674f8"/><path d="M11.5 14.7l10-11.7-14.9 10z" fill="#0b4fb3"/>'));
    centred(e, p, s);
    tl.fromTo(e, { opacity: 0, x: 0, y: 0, scale: 0.6, rotation: 0 }, { keyframes: [{ opacity: 1, scale: 1, duration: 0.2, ease: 'back.out(2)' }, { x: (to.x - p.x) * 0.45, y: (to.y - p.y) * 0.2 + 30, rotation: -8, duration: 0.35, ease: 'sine.inOut' }, { x: to.x - p.x, y: to.y - p.y, rotation: -20, scale: 0.7, duration: 0.45, ease: 'power2.in' }, { opacity: 0, duration: 0.12 }], immediateRender: false }, o.at);
  };
  // time saved: clock hands spin and settle
  FX.clock = function (tl, o, p) {
    var s = 96 * (o.size || 1);
    var e = mk(o.in, 'filter:drop-shadow(0 8px 18px rgba(12,17,29,.18))', svg(s, s, '<circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#1674f8" stroke-width="1.6"/><g class="fx-h"><path d="M12 12V7.2" stroke="#0c111d" stroke-width="1.6" stroke-linecap="round"/></g><g class="fx-m"><path d="M12 12V4.6" stroke="#1674f8" stroke-width="1.2" stroke-linecap="round"/></g><circle cx="12" cy="12" r="1.2" fill="#0c111d"/>'));
    centred(e, p, s);
    tl.fromTo(e, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)', immediateRender: false }, o.at);
    tl.fromTo(e.querySelector('.fx-m'), { rotation: 0, svgOrigin: '12 12' }, { rotation: 720, svgOrigin: '12 12', duration: 0.9, ease: 'power3.out', immediateRender: false }, o.at + 0.1);
    tl.fromTo(e.querySelector('.fx-h'), { rotation: 0, svgOrigin: '12 12' }, { rotation: 60, svgOrigin: '12 12', duration: 0.9, ease: 'power3.out', immediateRender: false }, o.at + 0.1);
    tl.to(e, { opacity: 0, duration: 0.3 }, o.at + 1.0 + (o.hold || 0.5));
  };
  // a button is clicked: the target presses in and two rings ripple out from the point
  FX.click = function (tl, o, p) {
    var sz = o.size || 1;
    if (o.cursor) {
      var cs = 34 * sz, cu = mk(o.in, 'filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))', svg(cs, cs, '<path d="M4 2.5v17.2l4.6-4.4 3 6.6 3-1.3-3-6.5h6.3z" fill="#0c111d" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>'));
      cu.style.left = (p.x - cs * 0.17) + 'px'; cu.style.top = (p.y - cs * 0.1) + 'px';
      tl.fromTo(cu, { opacity: 0, x: 70 * sz, y: 60 * sz, scale: 1 }, { opacity: 1, x: 0, y: 0, duration: 0.4, ease: 'power2.out', immediateRender: false }, o.at - 0.42);
      tl.fromTo(cu, { scale: 1 }, { scale: 0.82, duration: 0.08, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, o.at);
      tl.to(cu, { opacity: 0, duration: 0.25 }, o.at + 0.6 + (o.hold || 0.4));
    }
    if (o.target) tl.fromTo(o.target, { scale: 1 }, { scale: 0.95, duration: 0.08, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, o.at);
    for (var i = 0; i < n(o, 2, 1); i++) {
      var R = 44 * sz, e = mk(o.in, 'width:' + R + 'px;height:' + R + 'px;border-radius:50%;border:3px solid #1674f8;background:rgba(22,116,248,.12)');
      centred(e, p, R);
      tl.fromTo(e, { opacity: 0.9, scale: 0.3 }, { opacity: 0, scale: 1.6 + i * 0.5, duration: 0.5, ease: 'power2.out', immediateRender: false }, o.at + i * 0.1);
    }
  };
  // text typed into a field: the characters appear one by one with a caret (text from opts.text or the target's own)
  FX.typing = function (tl, o) {
    var el = o.target; if (!el) throw new Error('UDFX typing needs opts.target');
    var txt = o.text != null ? o.text : el.textContent, cps = o.cps || 16, t = o.at;
    el.textContent = '';
    for (var i = 0; i < txt.length; i++) {
      var c = document.createElement('span'); c.textContent = txt[i]; c.style.display = 'none'; el.appendChild(c);
      tl.set(c, { display: 'inline' }, t + i / cps + (txt[i] === ' ' ? 0 : rnd(i, 32) * 0.02));
    }
    var caret = document.createElement('span');
    caret.setAttribute('data-decor', '1');
    caret.style.cssText = 'display:inline-block;width:2px;height:1.1em;margin-left:1px;vertical-align:-0.15em;background:currentColor;opacity:0';
    el.appendChild(caret);
    var end = t + txt.length / cps;
    tl.set(caret, { opacity: 1 }, t);
    tl.fromTo(caret, { opacity: 1 }, { opacity: 0, duration: 0.3, repeat: 3, yoyo: true, ease: 'steps(1)', immediateRender: false }, end + 0.05);
    tl.set(caret, { opacity: 0 }, end + 0.05 + 1.2 + (o.hold || 0));
  };
  // audio playing (a call, a voice, a recording): layered wave lines drift and swell like speech, then settle.
  // Each line is a seamless sine path slid sideways; its height follows a seeded speech envelope. Plain tweens only.
  FX.wave = function (tl, o, p) {
    var sz = o.size || 1, W = o.w || 900 * sz, H = o.h || 200 * sz, dur = o.dur || 2.7, k = n(o, 9, 5);
    var cols = o.color ? [o.color, o.color] : ['#1674f8', '#53d4fc'];
    var box = mk(o.in, 'left:' + (p.x - W / 2) + 'px;top:' + (p.y - H / 2) + 'px;width:' + W + 'px;height:' + H + 'px;overflow:hidden;' +
      '-webkit-mask-image:radial-gradient(ellipse 50% 50% at 50% 50%,#000 35%,transparent 100%);mask-image:radial-gradient(ellipse 50% 50% at 50% 50%,#000 35%,transparent 100%)' + (o.behind ? ';z-index:0' : ''));
    for (var i = 0; i < k; i++) {
      var m = 1 + (i % 3), lam = W / m, A = H * (0.16 + 0.26 * rnd(i, 41)), ph = rnd(i, 42) * Math.PI * 2, d = '';
      for (var x = 0; x <= 2 * W; x += 6) d += (x ? 'L' : 'M') + x.toFixed(1) + ' ' + (H / 2 + A * Math.sin(2 * Math.PI * x / lam + ph)).toFixed(1);
      var row = document.createElement('div');
      row.style.cssText = 'position:absolute;left:0;top:0;width:' + (2 * W) + 'px;height:' + H + 'px;transform-origin:25% 50%';
      row.innerHTML = '<svg width="' + (2 * W) + '" height="' + H + '" style="display:block;overflow:visible"><path d="' + d + '" fill="none" stroke="' + cols[i % 2] + '" stroke-width="' + (2 + rnd(i, 43) * 2) * sz + '" stroke-opacity="' + (0.45 + 0.5 * rnd(i, 44)) + '" stroke-linecap="round"/></svg>';
      box.appendChild(row);
      // slide one full width (the path repeats, so the loop is seamless); faster lines for higher waves
      var period = (1.6 + rnd(i, 45) * 1.4) / m, reps = Math.ceil((dur + 0.6) / period);
      tl.fromTo(row, { x: i % 2 ? -W : 0 }, { x: i % 2 ? 0 : -W, duration: period, ease: 'none', repeat: reps - 1, immediateRender: false }, o.at);
      // height: up from flat, a seeded speech envelope every 0.22 s, back to flat
      var steps = Math.max(2, Math.round(dur / 0.22)), sy = [0.05];
      for (var j = 0; j < steps; j++) sy.push(0.25 + 0.75 * rnd(j + 1, 46 + i % 2));
      sy.push(0.05);
      tl.fromTo(row, { scaleY: 0.05 }, { keyframes: { scaleY: sy, easeEach: 'sine.inOut' }, duration: dur + 0.3, ease: 'none', immediateRender: false }, o.at);
    }
    tl.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.25, immediateRender: false }, o.at);
    tl.to(box, { opacity: 0, duration: 0.3 }, o.at + dur);
  };
  // new or introducing: a light glint sweeps across the region (the logo, a title)
  FX.glint = function (tl, o, p) {
    var e = mk(o.in, 'left:' + p.left + 'px;top:' + p.top + 'px;width:' + p.w + 'px;height:' + p.h + 'px;overflow:hidden;opacity:1;mix-blend-mode:screen');
    var band = document.createElement('div'), bw = Math.max(40, p.h * 0.5), lean = p.h * 0.6;
    // the band waits a full skew's lean beyond the left edge: skewed, its top corner otherwise pokes into view before the sweep
    band.style.cssText = 'position:absolute;top:-20%;bottom:-20%;width:' + bw + 'px;left:-' + (bw + lean) + 'px;transform:skewX(-20deg);background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.85),rgba(255,255,255,0))';
    e.appendChild(band);
    tl.fromTo(band, { x: 0 }, { x: p.w + bw + 2 * lean, duration: 0.6, ease: 'power2.inOut', immediateRender: false }, o.at);
  };

  window.UDFX = {
    names: Object.keys(FX),
    play: function (tl, name, o) {
      var f = FX[name];
      if (!f) throw new Error('UDFX: no effect "' + name + '" (have: ' + Object.keys(FX).join(', ') + ')');
      if (!o || !o.in) throw new Error('UDFX.play needs opts.in (the element to draw in)');
      if (getComputedStyle(o.in).position === 'static') o.in.style.position = 'relative';
      f(tl, o, origin(o));
    },
  };
})();
