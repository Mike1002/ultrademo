// The "see" half of the see-and-fix loop: render a scene's frames at chosen times, fast, without a full video render.
// Usage: node plan/production/look.mjs <project-dir> <scene-id> [t1,t2,...] [--out <dir>] [--boxes]
//   writes <out>/<scene-id>-tSS.SS.png per time and <out>/<scene-id>-strip.jpg (all times tiled),
//   and with --boxes a JSON of every labelled element's box, measured every 0.1 s across the whole scene
//   (not only at the still times: a fault between two stills was missed on 2026-11-01), plus overlap and edge findings.
import { canvasOfProject, nearEdge } from './canvas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { probePage } from './render.mjs';
import { spawnSync } from 'node:child_process';
import { CAPTION_BAND, CAPTION_CHOICES } from '../captions/styles.mjs';

const require = createRequire(path.resolve('package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const [projectDir, sceneId, timesArg] = args.filter((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const outDir = path.resolve(outIdx >= 0 ? args[outIdx + 1] : path.join(projectDir, 'production', 'look'));
const wantBoxes = args.includes('--boxes');
const plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'));
const scene = plan.scenes.find((s) => s.id === sceneId);
if (!scene) { console.error(`no scene ${sceneId}`); process.exit(2); }
const times = timesArg ? timesArg.split(',').map(Number) : [0.05, 0.6, 1.2, 2.2, 3.2, 4.2, 5.0, scene.duration_s - 0.05];
fs.mkdirSync(outDir, { recursive: true });

const page = probePage(path.resolve(projectDir), scene);
const browser = await chromium.launch();
const cv = canvasOfProject(path.resolve(projectDir));
const ctx = await browser.newContext({ viewport: { width: cv.W, height: cv.H } });
const p = await ctx.newPage();
await p.goto('file://' + page);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
const errors = await p.evaluate(() => window.__probeErrors);
if (errors.length) console.log('page errors:', errors);
const shots = [];
const boxes = {};
const seek = (t) => p.evaluate(([id, t]) => { const tl = window.__timelines[id]; tl.seek(t, false); }, [scene.id, t]);
for (const t of times) {
  await seek(t);
  await p.waitForTimeout(60);
  const file = path.join(outDir, `${scene.id}-t${t.toFixed(2).padStart(5, '0')}.png`);
  await p.screenshot({ path: file });
  shots.push(file);
}
// D-94: with burned-in captions, the caption band stays free of the scene's content (product, text, images): sampled on a
// grid of points every 0.1 s; whatever is on top at a point, unless it is the ground or decoration, is in the band
const capStyle = CAPTION_CHOICES.includes(plan.video.intake?.caption_style) ? plan.video.intake.caption_style : 'none';
const bandFr = capStyle !== 'none' ? CAPTION_BAND[cv.H > cv.W ? 'vertical' : 'landscape'] : null;
const band = {};
const boxTimes = [];
for (let t = 0.05; t < scene.duration_s; t += 0.1) boxTimes.push(Math.round(t * 100) / 100);
if (wantBoxes) for (const t of boxTimes) {
  await seek(t);
  {
    boxes[t] = await p.evaluate(() => {
      const out = [];
      const vis = (el) => { let e = el; let o = 1; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= Number(cs.opacity); e = e.parentElement; } return o; };
      for (const el of document.querySelectorAll('[data-look]')) {
        const r = el.getBoundingClientRect();
        const o = vis(el);
        if (o > 0.05 && r.width > 0 && r.height > 0) out.push({ id: el.dataset.look, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), o: Math.round(o * 100) / 100 });
      }
      return out;
    });
  }
  if (bandFr) band[t] = await p.evaluate(([W, H, f]) => {
    const y0 = Math.round(H * f[0]) + 2, y1 = Math.round(H * f[1]) - 2;
    const hits = new Map();
    // the ground, decoration and the page itself are not content; anything else on top at a point is
    const quiet = (el) => {
      if (el.id === 'root' || el.tagName === 'BODY' || el.tagName === 'HTML') return true;
      for (let e = el; e && e.nodeType === 1 && e.id !== 'root'; e = e.parentElement) {
        if (e.hasAttribute('data-decor') || /(^|\s)ground(__[\w-]+)?(\s|$)/.test(typeof e.className === 'string' ? e.className : '')) return true;
      }
      return false;
    };
    // an element shows something at that point: a picture, its own text, a fill, a border or a shadow (an empty wrapper does not)
    const alpha = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
    const shown = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = getComputedStyle(e); if (c.visibility === 'hidden' || c.display === 'none') return 0; o *= Number(c.opacity); } return o; };
    const paints = (el) => {
      if (shown(el) < 0.05) return false; // faded out, here or in a parent
      if (/^(IMG|SVG|VIDEO|CANVAS)$/i.test(el.tagName) || el instanceof SVGElement) return true;
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true;
      const cs = getComputedStyle(el);
      if (Number(cs.opacity) < 0.05) return false;
      const r = el.getBoundingClientRect();
      if (r.width >= W * 0.9 && r.height >= H * 0.9) return false; // a full-frame backdrop is the ground, not content
      return alpha(cs.backgroundColor) > 0.06 || (cs.backgroundImage && cs.backgroundImage !== 'none') || (cs.boxShadow && cs.boxShadow !== 'none') || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(cs[`border${k}Width`]) >= 1 && alpha(cs[`border${k}Color`]) > 0.12);
    };
    for (let y = y0; y <= y1; y += Math.max(12, Math.round((y1 - y0) / 8))) for (let x = 24; x < W - 24; x += 40) {
      const top = document.elementsFromPoint(x, y).find((el) => !quiet(el) && paints(el));
      if (!top) continue;
      const host = top.closest('[data-look],[data-product]') || top;
      const name = host.dataset?.look || (host.dataset?.product ? 'product' : (host.id || host.tagName.toLowerCase()));
      hits.set(name, (hits.get(name) || 0) + 1);
    }
    return [...hits.entries()].map(([id, n]) => ({ id, n }));
  }, [cv.W, cv.H, bandFr]);
}
await browser.close();

// strip: tile at 480 wide, 4 per row, with the time burned in
const list = path.join(outDir, `${scene.id}-list.txt`);
fs.writeFileSync(list, shots.map((f) => `file '${f}'`).join('\n') + '\n');
const cols = Math.min(4, shots.length);
const rows = Math.ceil(shots.length / cols);
spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', cv.H > cv.W ? `scale=270:-2,pad=278:488:4:4:color=#333333,tile=${Math.min(times.length, 8)}x${Math.ceil(times.length / 8)}` : `scale=480:-2,pad=488:278:4:4:color=#333333,tile=${cols}x${rows}`, '-frames:v', '1', path.join(outDir, `${scene.id}-strip.jpg`)]);
fs.rmSync(list, { force: true });

if (wantBoxes) {
  // findings, grouped per pair (or per element at the edge) with the time span they last: labelled boxes that overlap, and boxes within 40 px of the frame edge
  const spans = new Map();
  const note = (key, t, text) => { const r = spans.get(key) || { from: t, to: t, text, n: 0 }; r.from = Math.min(r.from, t); r.to = Math.max(r.to, t); r.n++; spans.set(key, r); };
  for (const [ts, bs] of Object.entries(boxes)) {
    const t = Number(ts);
    for (const b of bs) if (nearEdge(b, cv)) note(`edge:${b.id}`, t, `"${b.id}" is within 40 px of the frame edge (${b.x},${b.y} ${b.w}x${b.h})`);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], c = bs[j];
      const ix = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x));
      const iy = Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
      const inside = (u, v) => u.x >= v.x && u.y >= v.y && u.x + u.w <= v.x + v.w && u.y + u.h <= v.y + v.h;
      if (ix * iy > 0 && !inside(a, c) && !inside(c, a)) note(`overlap:${a.id}|${c.id}`, t, `"${a.id}" and "${c.id}" overlap (${ix}x${iy} px at ${t} s)`);
    }
  }
  // the caption band: content in it for more than two samples running is a finding (a passing glide is let through)
  const bandSpans = new Map();
  for (const [ts, hs] of Object.entries(band)) for (const h of hs) { const r = bandSpans.get(h.id) || { from: Number(ts), to: Number(ts), n: 0 }; r.from = Math.min(r.from, Number(ts)); r.to = Math.max(r.to, Number(ts)); r.n++; bandSpans.set(h.id, r); }
  const bandFindings = [...bandSpans.entries()].filter(([, r]) => r.n > 2).map(([id, r]) => `${r.from.toFixed(2)}–${r.to.toFixed(2)} s: "${id}" is in the caption band (${cv.H > cv.W ? `from ${Math.round(bandFr[0] * 100)}% to ${Math.round(bandFr[1] * 100)}% of the frame's height, above the platform buttons` : `the bottom ${Math.round((1 - bandFr[0]) * 100)}% of the frame`}), where the burned-in captions go`);
  const findings = [...spans.values()].map((r) => `${r.from.toFixed(2)}–${r.to.toFixed(2)} s: ${r.text}`).concat(bandFindings);
  fs.writeFileSync(path.join(outDir, `${scene.id}-boxes.json`), JSON.stringify({ step_s: 0.1, boxes, findings, ...(bandFr ? { caption_band: bandFindings } : {}) }, null, 1));
  console.log(findings.length ? findings.join('\n') : `no overlaps or edge crowding among labelled elements (${boxTimes.length} times, every 0.1 s)`);
}
console.log(path.join(outDir, `${scene.id}-strip.jpg`));
