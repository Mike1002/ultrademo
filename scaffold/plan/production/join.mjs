// The join check: two neighbouring scenes mounted on one page with the plan's transition, captured frame by frame
// around the boundary, without a full render. Catches what single-scene checks cannot: a headline ghosting under the
// next one, an empty stretch between scenes, a jump in the ground.
// The page uses its own wrapper ids (ud-join-*), never a class a scene might use (a .w wrapper once broke every headline).
// Usage: node plan/production/join.mjs <project-dir> <scene-a> <scene-b> [--before 0.8] [--after 1.2]
//   writes production/look/join-<a>-<b>.mp4 (30 fps), join-<a>-<b>-strip.jpg and join-<a>-<b>.json (findings).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(path.resolve('package.json'));
const { chromium } = require('playwright');
const sharp = require('sharp');

const args = process.argv.slice(2);
const [projectArg, aId, bId] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const before = opt('--before', 0.8), after = opt('--after', 1.2);
const projectDir = path.resolve(projectArg);
const plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'));
const [CW, CH] = String(plan.video?.format || '1920x1080').split('x').map(Number);
const A = plan.scenes.find((s) => s.id === aId), B = plan.scenes.find((s) => s.id === bId);
if (!A || !B) { console.error('no such scene'); process.exit(2); }
const kind = B.transition_in;
const overlap = ['crossfade', 'zoom-through', 'wipe'].includes(kind) ? (plan.direction.transition_overlap_s ?? 0.4) : 0;
const bAt = A.duration_s;
const outDir = path.join(projectDir, 'production', 'look');
const tag = `join-${aId}-${bId}`;
const frameDir = path.join(outDir, tag);
fs.mkdirSync(frameDir, { recursive: true });
for (const f of fs.readdirSync(frameDir)) fs.rmSync(path.join(frameDir, f));

const inner = (id) => { const html = fs.readFileSync(path.join(projectDir, 'compositions', 'frames', `${id}.html`), 'utf8'); return (html.match(/<template>([\s\S]*)<\/template>/) || [, html])[1]; };
const page = path.join(projectDir, 'production', 'probe', `${tag}.html`);
fs.mkdirSync(path.dirname(page), { recursive: true });
fs.writeFileSync(page, `<!doctype html><html><head><meta charset="UTF-8"><base href="../../"><script src="assets/gsap.min.js"></script><script>window.__timelines = {};</script>
<style>html,body{margin:0;width:${CW}px;height:${CH}px;overflow:hidden;background:#000}#ud-join-a,#ud-join-b{position:absolute;inset:0;overflow:hidden}#ud-join-a>#root,#ud-join-b>#root{position:relative;width:${CW}px;height:${CH}px;overflow:hidden}</style></head>
<body><div id="ud-join-a">${inner(aId)}</div><div id="ud-join-b">${inner(bId)}</div></body></html>`);

const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: CW, height: CH } })).newPage();
await p.goto('file://' + page);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
const fps = 30;
const t0 = Math.max(0, bAt - before), t1 = bAt + overlap + after;
const frames = [];
for (let n = 0, t = t0; t <= t1 + 1e-6; n++, t = t0 + n / fps) {
  const pr = overlap ? Math.min(1, Math.max(0, (t - bAt) / overlap)) : (t >= bAt ? 1 : 0);
  const opB = t < bAt ? 0 : (overlap ? ease(pr) : 1);
  const opA = t < bAt ? 1 : (overlap ? 1 - ease(pr) : 0);
  const rec = await p.evaluate(([a, b, ta, tb, oa, ob]) => {
    const wa = document.getElementById('ud-join-a'), wb = document.getElementById('ud-join-b');
    wa.style.opacity = oa; wb.style.opacity = ob;
    const seek = (id, t) => { const tl = window.__timelines[id]; if (tl) { tl.pause(); tl.seek(Math.max(0, t), false); } };
    seek(a, ta); if (tb >= 0) seek(b, tb);
    const vis = (el, stop) => { let e = el, o = 1; while (e && e !== stop.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= Number(cs.opacity); e = e.parentElement; } return o; };
    const boxes = (w) => [...w.querySelectorAll('[data-look]')].map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.look, x: r.x, y: r.y, w: r.width, h: r.height, o: vis(el, w) }; }).filter((b) => b.o > 0.05 && b.w > 0);
    return { a: boxes(wa), b: tb >= 0 ? boxes(wb) : [] };
  }, [aId, bId, t, t - bAt, opA, opB]);
  const file = path.join(frameDir, `f${String(n).padStart(4, '0')}.png`);
  await p.screenshot({ path: file });
  frames.push({ t: Math.round(t * 1000) / 1000, ...rec });
}
await browser.close();

// ink per frame: share of pixels clearly brighter than the ground, on a 480x270 copy (labels are not needed, so older scenes work too)
for (let i = 0; i < frames.length; i++) {
  const { data } = await sharp(path.join(frameDir, `f${String(i).padStart(4, '0')}.png`)).resize(480, 270).greyscale().raw().toBuffer({ resolveWithObject: true });
  let ink = 0; for (const v of data) if (v > 70) ink++;
  frames[i].ink = ink / data.length;
}
// findings: parts of both scenes visible in the same place (ghosting), and stretches with almost nothing on screen (an empty join)
const findings = [];
const ghost = new Map();
let emptyRun = [];
const empties = [];
for (const f of frames) {
  if (f.ink < 0.0005) emptyRun.push(f.t); else { if (emptyRun.length) empties.push(emptyRun); emptyRun = []; }
  for (const x of f.a) for (const y of f.b) {
    if (x.o < 0.25 || y.o < 0.25) continue;
    const ix = Math.max(0, Math.min(x.x + x.w, y.x + y.w) - Math.max(x.x, y.x)), iy = Math.max(0, Math.min(x.y + x.h, y.y + y.h) - Math.max(x.y, y.y));
    if (ix * iy < 0.1 * Math.min(x.w * x.h, y.w * y.h)) continue;
    const k = `${x.id}|${y.id}`; const g = ghost.get(k) || { from: f.t, to: f.t, max: 0 }; g.to = f.t; g.max = Math.max(g.max, Math.min(x.o, y.o)); ghost.set(k, g);
  }
}
if (emptyRun.length) empties.push(emptyRun);
for (const [k, g] of ghost) { const [x, y] = k.split('|'); findings.push(`${g.from.toFixed(2)}–${g.to.toFixed(2)} s: ${aId} "${x}" and ${bId} "${y}" show in the same place at once (both at least ${Math.round(g.max * 100)}%)`); }
for (const e of empties) { const len = e.length / fps; if (len >= 0.25) findings.push(`${e[0].toFixed(2)}–${e[e.length - 1].toFixed(2)} s: almost nothing is on screen for ${len.toFixed(2)} s (an empty join: under 0.05% of the frame is lit)`); }

const mp4 = path.join(outDir, `${tag}.mp4`);
spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(frameDir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4]);
const pick = frames.map((_, i) => i).filter((i) => i % 4 === 0).slice(0, 16);
const list = path.join(frameDir, 'list.txt');
fs.writeFileSync(list, pick.map((i) => `file '${path.join(frameDir, `f${String(i).padStart(4, '0')}.png`)}'`).join('\n') + '\n');
spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:-2,pad=488:278:4:4:color=#333333,tile=4x${Math.ceil(pick.length / 4)}`, '-frames:v', '1', path.join(outDir, `${tag}-strip.jpg`)]);
fs.rmSync(frameDir, { recursive: true, force: true });
fs.writeFileSync(path.join(outDir, `${tag}.json`), JSON.stringify({ kind, boundary_s: bAt, overlap, window: [t0, t1], findings }, null, 1));
console.log(`${kind} at ${bAt} s, ${frames.length} frames (${t0.toFixed(2)}–${t1.toFixed(2)} s, strip every 4th frame)`);
console.log(findings.length ? findings.join('\n') : 'no ghosting and no empty stretch at the join');
console.log(mp4);
