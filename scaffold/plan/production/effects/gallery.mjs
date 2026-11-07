#!/usr/bin/env node
// effects/gallery.mjs — writes gallery.html: every effect in catalogue.json playing in a loop on a small sample, with its
// event, its sound (press to hear it) and a Lively / Subtle switch. Opens as a file; no server needed (D-56, D-78).
//   node plan/production/effects/gallery.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { uiCssInline, udHeadInline } from '../../ui/inline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCAFFOLD = path.join(HERE, '..', '..', '..');
const cat = JSON.parse(fs.readFileSync(path.join(HERE, 'catalogue.json'), 'utf8')).effects;
const lib = JSON.parse(fs.readFileSync(path.join(SCAFFOLD, 'sfx', 'library.json'), 'utf8')).sounds;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// a neutral sample for each effect, from Ultrademo itself (D-73)
const SAMPLE = {
  money: '<div class="chip ok">Paid · $49</div>', confetti: '<div class="chip ok">Approved</div>', cannon: '<div class="title">Launch day</div>',
  check: '<div class="row">Voice picked</div>', stamp: '<div class="row">Review · Scene 3</div>', sparkle: '<div class="btn">Video ready</div>',
  bigstar: '<div class="chip">Scene approved</div>', stars: '<div class="row" style="margin-top:110px">Rated by the team</div>', thumbsup: '<div class="chip ok">Looks good</div>',
  hearts: '<div class="chip">Loved it</div>', highfive: '<div class="chip ok" style="margin-top:160px">Video shipped</div>', smiley: '<div class="row" style="margin-top:150px">Viewers stayed to the end</div>',
  click: '<div class="btn" id="T">Render video</div>', typing: '<div class="row fld" id="T"></div>',
  wave: '<div class="row" style="position:relative;z-index:1;display:flex;gap:14px;align-items:center"><b>John Carter</b><span style="color:#667085">Sample call · 00:04</span></div>', shield: '<div class="row" style="margin-top:150px">Keys stay on your machine</div>', erase: '<div class="row" id="T">old-take.mp4</div>',
  speed: '<div class="title">Rendered in 99 s</div>', growth: '<div class="num">+38%</div>', drop: '<div class="num bad" id="T">−12%</div>',
  bell: '<div class="row" style="margin-top:100px">New comment</div>', pulse: '<div class="pair"><span>Plan</span><span>Video</span></div>', send: '<div class="btn">Share link</div>',
  clock: '<div class="row" style="margin-top:150px">Hours of editing saved</div>', glint: '<div class="title" id="T">ultrademo</div>',
};
// how each sample calls the effect (in = the stage; target = the sample)
const CALL = {
  pulse: "{ x: 95, y: 120, to: { x: 305, y: 120 } }", send: "{ target: S, to: { x: 360, y: 20 } }", erase: "{ target: document.getElementById('T' + k), hide: true }",
  drop: "{ target: document.getElementById('T' + k) }", glint: "{ target: document.getElementById('T' + k) }", stars: "{ x: 200, y: 70 }",
  shield: "{ x: 200, y: 75 }", sparkle: "{ target: S, size: 0.5 }", smiley: "{ x: 200, y: 58, size: 0.8 }", highfive: "{ x: 200, y: 92 }",
  click: "{ target: document.getElementById('T' + k), cursor: true }", wave: "{ x: 200, y: 120, w: 380, h: 210, dur: 1.9, behind: true }", stamp: "{ target: S, size: 0.7 }", typing: "{ target: document.getElementById('T' + k), text: 'Launch video for Ultrademo' }", bell: "{ x: 200, y: 80 }", clock: "{ x: 200, y: 75 }", cannon: "{ target: S, w: 280 }",
};

const card = (e, i) => {
  const s = lib.find((x) => x.id === e.sound);
  const sample = (SAMPLE[e.name] || '<div class="chip">Sample</div>').replace(/id="T"/, `id="T${i}"`);
  return `<section class="fx"><div class="stage" id="st${i}" data-name="${esc(e.name)}" data-call="${esc(CALL[e.name] || '{ target: S }')}" data-k="${i}">${sample}</div>
  <div class="meta"><div><div class="ud-eyebrow">${esc(e.event)}</div><h2>${esc(e.label)}</h2><p>${esc(e.when)}</p></div>
  <button class="snd" data-src="${s ? `../../../sfx/${esc(s.file)}` : ''}"${s ? '' : ' disabled'} title="Play the sound">▶ ${esc(e.sound)}</button></div></section>`;
};
// one section per group, in catalogue order
const groups = [...new Set(cat.map((e) => e.group))];
// the library's other sounds: no visual of their own, played as cues on their own (derived, so the list stays current)
const used = new Set(cat.map((e) => e.sound));
const loose = lib.filter((x) => !used.has(x.id));
const soundRows = loose.map((x) => `<div class="sr"><button class="snd" data-src="../../../sfx/${esc(x.file)}" title="Play the sound">▶ ${esc(x.id)}</button><span class="len">${Number(x.length_s).toFixed(2)} s</span><span class="sit">${esc(x.situations.join('; '))}</span></div>`).join('\n');
const cards = groups.map((g) => `<h2 class="grp">${esc(g)}</h2>\n<div class="grid">\n${cat.map((e, i) => (e.group === g ? card(e, i) : '')).join('\n')}\n</div>`).join('\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ultrademo effects</title>
<style>${uiCssInline()}
@font-face{font-family:"Bricolage Grotesque";src:url("${pathToFileURL(path.join(SCAFFOLD, 'plan', 'ui', 'fonts', 'BricolageGrotesque-ExtraBold.ttf')).href}") format("truetype");font-weight:800;font-style:normal}
body{margin:0;background:var(--surface-soft);color:var(--text);font-family:var(--ud-body)}
main{max-width:1180px;margin:0 auto;padding:22px 28px 48px}
.ud-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 22px}
h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(26px,3.4vw,34px);letter-spacing:-.035em;margin:8px 0 6px}
.lead{color:var(--text-muted);max-width:760px;margin:0 0 18px;line-height:1.5}
.bar{display:flex;gap:8px;align-items:center;margin:0 0 18px;font-size:14px}
.bar button,.snd{font:600 13px var(--ud-body);color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-pill);padding:7px 13px;cursor:pointer}
.bar button[aria-pressed="true"]{background:var(--action);color:var(--on-action);border-color:var(--ink)}
.snd{border:2px solid var(--play);white-space:nowrap}
.grp{font:800 20px var(--ud-display);letter-spacing:-.02em;margin:26px 0 10px}
.sounds{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);padding:4px 14px}
.sr{display:grid;grid-template-columns:150px 60px 1fr;gap:12px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13px}
.sr:first-child{border-top:0}.sr .snd{justify-self:start}.len{color:var(--text-muted);font-variant-numeric:tabular-nums}.sit{color:var(--text-muted);line-height:1.4}
@media (max-width:600px){.sr{grid-template-columns:1fr auto}.sit{grid-column:1/-1}}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}
.fx{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);overflow:hidden}
.stage{position:relative;height:240px;background:#f5f9ff;overflow:hidden;display:flex;align-items:center;justify-content:center;font-family:var(--ud-body)}
.meta{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:12px 14px}
.meta h2{margin:4px 0 2px;font:700 16px var(--ud-body)}.meta p{margin:0;font-size:13px;color:var(--text-muted);line-height:1.4}
.chip{padding:8px 16px;border-radius:999px;background:#eef8ff;color:#1674f8;font-weight:600;font-size:18px;border:2px solid #b2ddff}
.chip.ok{background:#e8f8f0;color:#0f8a52;border-color:#a6e9c9}
.row{padding:12px 18px;border-radius:12px;background:#fff;border:2px solid #eaecf0;font-size:17px;color:#0c111d}
.btn{padding:12px 22px;border-radius:12px;background:#1674f8;color:#fff;font-weight:600;font-size:17px}
.title{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:42px;letter-spacing:-.025em;color:#0c111d}
.num{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:58px;letter-spacing:-.025em;color:#17b26a}.num.bad{color:#f04438}
.fld{min-width:270px;min-height:24px;color:#0c111d}
.pair{display:flex;gap:120px}.pair span{padding:10px 16px;border-radius:10px;background:#fff;border:2px solid #eaecf0;font-weight:600}
@media (max-width:600px){main{padding:16px}}
</style></head><body><main>
${udHeadInline()}
<div class="ud-eyebrow">Effects · ${cat.length}</div>
<h1>Effects</h1>
<p class="lead">An effect marks something that happens in the video: a visual and a sound for each kind of event (D-78). The plan tags events and the matching effect plays; any one can be swapped or removed, and the whole video is set to lively, subtle or none. Press a sound to hear it.</p>
<div class="bar">Level <button data-level="lively" aria-pressed="true">Lively</button><button data-level="subtle" aria-pressed="false">Subtle</button></div>
${cards}
<h2 class="grp">Sounds without a visual</h2>
<p class="lead" style="margin-bottom:10px">Sounds in the library that no effect above uses: quick interface cues (keys, clicks, pops, ticks) and crowd reactions. A scene adds them as cues on their own.</p>
<div class="sounds">
${soundRows}
</div>
</main>
<script src="gsap.min.js"></script>
<script>${fs.readFileSync(path.join(HERE, 'effects.js'), 'utf8')}</script>
<script>
(function(){
  var level = 'lively', tls = [], stages = [].slice.call(document.querySelectorAll('.stage')), orig = stages.map(function(st){ return st.innerHTML; });
  function build(){
    tls.forEach(function(t){ t.kill(); });
    tls = [];
    stages.forEach(function(st, j){
      st.innerHTML = orig[j]; // the sample as written, so a rebuild starts clean
      var S = st.firstElementChild, k = st.dataset.k;
      var tl = gsap.timeline({ repeat: -1, repeatDelay: 0.7 });
      var o = (new Function('S', 'k', 'return ' + st.dataset.call))(S, k);
      o.in = st; o.at = 0.4; o.level = level;
      UDFX.play(tl, st.dataset.name, o);
      tl.to({}, { duration: 0.1 }, 2.4);
      tls.push(tl);
    });
  }
  build();
  document.querySelectorAll('[data-level]').forEach(function(b){ b.addEventListener('click', function(){ level = b.dataset.level; document.querySelectorAll('[data-level]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); }); build(); }); });
  var audio = new Audio();
  document.querySelectorAll('.snd').forEach(function(b){ b.addEventListener('click', function(){ if (!b.dataset.src) return; audio.src = b.dataset.src; audio.currentTime = 0; audio.play(); }); });
})();
</script></body></html>`;
fs.writeFileSync(path.join(HERE, 'gallery.html'), html);
console.log(path.join(HERE, 'gallery.html'));
