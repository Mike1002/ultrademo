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
  const findings = [...spans.values()].map((r) => `${r.from.toFixed(2)}–${r.to.toFixed(2)} s: ${r.text}`);
  fs.writeFileSync(path.join(outDir, `${scene.id}-boxes.json`), JSON.stringify({ step_s: 0.1, boxes, findings }, null, 1));
  console.log(findings.length ? findings.join('\n') : `no overlaps or edge crowding among labelled elements (${boxTimes.length} times, every 0.1 s)`);
}
console.log(path.join(outDir, `${scene.id}-strip.jpg`));
