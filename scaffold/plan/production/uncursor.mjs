// uncursor.mjs — take the browser's own pointer out of product captures (D-88 tutorials, and any capture made in the
// user's signed-in browser, where the screenshot includes the mouse pointer).
//
//   node plan/production/uncursor.mjs <project> [--from assets/steps] [--to assets/clean]
//
// The pointer in a capture is a still copy that never moves. Scenes draw their own cursor (the arrow that travels,
// clicks, rings and zooms), so a left-over pointer would put a second, frozen arrow on screen. This removes it:
//   1. find the pointer: a dark, arrow-shaped cluster about 11×17 px per device pixel;
//   2. mask its pixels (the dark fill and a white outline around it);
//   3. find another capture of the same screen whose pixels around the pointer match (a fitted gain and offset per
//      colour channel lets a dimmed screen behind a dialog match the undimmed one) and copy only the masked pixels;
//   4. when no capture matches, keep the pointer and say so: the scene must cover that spot (the drawn cursor resting
//      there, a typed field over it, a cut-out from another capture) or not show that capture.
// It writes the cleaned copies to <to>/ (originals untouched), <to>/uncursor.json (what was done to each file) and
// <to>/uncursor-sheet.png (before and after, 3× enlarged, one pair per patched pointer), which the agent opens and looks
// at before using the copies: a patch that copied the wrong pixels shows there.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const IMG = /\.(png|jpe?g)$/i;
const FIND = 60; // finding the pointer: its black fill (JPEG keeps it around 20–60); stricter, so it does not merge with dark UI under it
const DARK = 70; // masking it: a little looser, so its anti-aliased edge goes too
const DIL = 3; // the white outline: this many pixels around the dark fill
const RING = 6; // the pixels around the pointer's box that decide whether a donor is the same screen
const MATCH = 6; // the mean channel difference (0–255) under which a donor counts as the same screen

/** Decode an image into { data (RGB), W, H }. */
export async function decode(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

/** The device-pixel scale of a capture: 1 for a 1× screenshot of a laptop window, 2 for a 2× one. */
export const scaleOf = (W) => Math.max(1, Math.round(W / 1500));

/**
 * The pointer in an image, or null: the most arrow-like dark cluster of a pointer's size. An arrow has a straight
 * left edge and widens from its tip downward, which tells it apart from a dark glyph of the same size.
 */
export function findPointer(im) {
  const { data, W, H } = im;
  const k = scaleOf(W);
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) < FIND) dark[i] = 1;
  const seen = new Uint8Array(W * H);
  let best = null;
  for (let i = 0; i < W * H; i++) {
    if (!dark[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1;
    const px = []; let x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (st.length) {
      const j = st.pop(); px.push(j);
      const x = j % W, y = (j / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const n of [j - 1, j + 1, j - W, j + W]) if (n >= 0 && n < W * H && dark[n] && !seen[n] && Math.abs((n % W) - x) <= 1) { seen[n] = 1; st.push(n); }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 8 * k || w > 14 * k || h < 14 * k || h > 22 * k || h <= w || px.length < 60 * k * k) continue;
    // the shape: rows' left edges stay at x0 down the upper two thirds, and rows widen from the tip
    const rows = new Map();
    for (const j of px) { const x = j % W, y = (j / W) | 0; const r = rows.get(y) || [W, 0]; rows.set(y, [Math.min(r[0], x), Math.max(r[1], x)]); }
    const top = [...rows.entries()].filter(([y]) => y < y0 + h * 0.66).map(([, r]) => r);
    const leftStraight = top.filter((r) => r[0] - x0 <= 1 * k).length / Math.max(1, top.length);
    const widthAt = (f) => { const r = rows.get(y0 + Math.round(h * f)); return r ? r[1] - r[0] + 1 : 0; };
    const widens = widthAt(0.55) >= widthAt(0.15) + 2 * k && widthAt(0.15) < 0.7 * w; // a narrow tip that widens
    const score = leftStraight + (widens ? 1 : 0);
    if (score < 1.6) continue;
    if (!best || score > best.score) best = { x0, y0, x1, y1, n: px.length, score: Math.round(score * 100) / 100 };
  }
  return best;
}

/** The pointer's mask in a box around it: its dark fill and an outline DIL px wide. */
export function maskOf(im, c) {
  const b = { x0: Math.max(0, c.x0 - DIL - 1), y0: Math.max(0, c.y0 - DIL - 1), x1: Math.min(im.W - 1, c.x1 + DIL + 1), y1: Math.min(im.H - 1, c.y1 + DIL + 1) };
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  const dark = new Uint8Array(w * h), m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = b.x0 + x, Y = b.y0 + y;
    if (X < c.x0 - 1 || X > c.x1 + 1 || Y < c.y0 - 1 || Y > c.y1 + 1) continue;
    const i = (Y * im.W + X) * 3;
    if (Math.max(im.data[i], im.data[i + 1], im.data[i + 2]) < DARK) dark[y * w + x] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!dark[y * w + x]) continue;
    for (let dy = -DIL; dy <= DIL; dy++) for (let dx = -DIL; dx <= DIL; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) m[yy * w + xx] = 1; }
  }
  return { b, w, h, m };
}

/** How well a donor matches around the pointer (outside the mask), with a per-channel gain and offset fitted. */
export function donorScore(im, dn, mk, ring = RING) {
  const { b, w, m } = mk;
  const px = [];
  for (let Y = b.y0 - ring; Y <= b.y1 + ring; Y++) for (let X = b.x0 - ring; X <= b.x1 + ring; X++) {
    if (X < 0 || Y < 0 || X >= im.W || Y >= im.H) continue;
    const inBox = X >= b.x0 && X <= b.x1 && Y >= b.y0 && Y <= b.y1;
    if (inBox && m[(Y - b.y0) * w + (X - b.x0)]) continue;
    px.push((Y * im.W + X) * 3);
  }
  if (px.length < 20) return null;
  const fit = [0, 1, 2].map((k) => {
    let sx = 0, sy = 0, sxx = 0, sxy = 0; const N = px.length;
    for (const i of px) { const x = dn.data[i + k], y = im.data[i + k]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const den = N * sxx - sx * sx;
    // a flat patch has no slope to fit: treat it as a plain offset
    const a = den > N * N * 4 ? (N * sxy - sx * sy) / den : 1;
    return [a, (sy - a * sx) / N];
  });
  // a fit that inverts or crushes the image is not the same screen
  if (fit.some(([a]) => a < 0.3 || a > 3)) return null;
  let s = 0, n = 0;
  for (const i of px) for (let k = 0; k < 3; k++) { s += Math.abs(im.data[i + k] - clamp(dn.data[i + k] * fit[k][0] + fit[k][1])); n++; }
  return { d: s / n, fit };
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Clean one image against the others (all the same size): returns { out (RGB buffer), report }. `others` is a list of
 * { name, im, pointer } (their own pointers are kept out of the copied area).
 */
export function cleanOne(name, im, pointer, others) {
  const out = Buffer.from(im.data);
  if (!pointer) return { out, report: { file: name, pointer: null, status: 'no pointer' } };
  const mk = maskOf(im, pointer);
  const near = (p) => p && !(p.x1 + DIL < mk.b.x0 - RING || mk.b.x1 + RING < p.x0 - DIL || p.y1 + DIL < mk.b.y0 - RING || mk.b.y1 + RING < p.y0 - DIL);
  let best = null;
  for (const ring of [RING, 0]) {
    for (const o of others) {
      if (o.name === name || o.im.W !== im.W || o.im.H !== im.H || near(o.pointer)) continue;
      const r = donorScore(im, o.im, mk, ring);
      if (r && (!best || r.d < best.d)) best = { ...r, from: o.name, ring, im: o.im };
    }
    if (best && best.d < (ring ? MATCH : MATCH - 2)) break;
  }
  const box = [pointer.x0, pointer.y0, pointer.x1, pointer.y1];
  if (!best || best.d >= (best.ring ? MATCH : MATCH - 2)) {
    return { out, report: { file: name, pointer: box, status: 'kept', why: best ? `no capture of the same screen around it (closest ${best.from}, ${best.d.toFixed(1)})` : 'no other capture of this size' } };
  }
  const { b, w, h, m } = mk;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    const i = ((b.y0 + y) * im.W + (b.x0 + x)) * 3;
    for (let k = 0; k < 3; k++) out[i + k] = clamp(best.im.data[i + k] * best.fit[k][0] + best.fit[k][1]);
  }
  return { out, report: { file: name, pointer: box, status: 'removed', from: best.from, match: Math.round(best.d * 100) / 100 } };
}

/** Before and after crops of each pointer, 3× enlarged, four pairs a row. */
async function sheet(entries, file) {
  const C = 64, S = 3, T = C * S, GAP = 10;
  const items = entries.filter((e) => e.report.pointer);
  if (!items.length) return null;
  const tiles = [];
  for (const [i, e] of items.entries()) {
    const [x0, y0] = e.report.pointer;
    const left = Math.max(0, Math.min(e.im.W - C, x0 - 24)), top = Math.max(0, Math.min(e.im.H - C, y0 - 22));
    for (const [k, buf] of [e.im.data, e.out].entries()) {
      const png = await sharp(buf, { raw: { width: e.im.W, height: e.im.H, channels: 3 } }).extract({ left, top, width: C, height: C }).resize(T, T, { kernel: 'nearest' }).png().toBuffer();
      tiles.push({ input: png, left: ((i % 4) * 2 + k) * (T + GAP), top: Math.floor(i / 4) * (T + GAP) });
    }
  }
  const rows = Math.ceil(items.length / 4);
  await sharp({ create: { width: 8 * (T + GAP), height: rows * (T + GAP), channels: 3, background: '#ff00ff' } }).composite(tiles).png().toFile(file);
  return file;
}

/** Clean every capture in `from` into `to`. Returns the report list. */
export async function uncursor(projectDir, { from = 'assets/steps', to = 'assets/clean' } = {}) {
  const src = path.resolve(projectDir, from), dst = path.resolve(projectDir, to);
  if (!fs.existsSync(src)) throw new Error(`no captures in ${src}`);
  fs.mkdirSync(dst, { recursive: true });
  const files = fs.readdirSync(src).filter((f) => IMG.test(f)).sort();
  const all = [];
  for (const f of files) { const im = await decode(path.join(src, f)); all.push({ name: f, im, pointer: findPointer(im) }); }
  const entries = [];
  for (const e of all) {
    const { out, report } = cleanOne(e.name, e.im, e.pointer, all);
    const target = path.join(dst, e.name);
    const img = sharp(out, { raw: { width: e.im.W, height: e.im.H, channels: 3 } });
    await (/\.png$/i.test(e.name) ? img.png() : img.jpeg({ quality: 95 })).toFile(target);
    entries.push({ ...e, out, report });
  }
  const reports = entries.map((e) => e.report);
  fs.writeFileSync(path.join(dst, 'uncursor.json'), JSON.stringify(reports, null, 1) + '\n');
  const sheetFile = await sheet(entries, path.join(dst, 'uncursor-sheet.png'));
  return { reports, sheet: sheetFile, dir: dst };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const projectDir = args.find((a) => !a.startsWith('--'));
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (!projectDir) { console.error('usage: node plan/production/uncursor.mjs <project> [--from assets/steps] [--to assets/clean]'); process.exit(1); }
  const { reports, sheet: sh, dir } = await uncursor(path.resolve(projectDir), { from: opt('--from'), to: opt('--to') });
  const n = (s) => reports.filter((r) => r.status === s).length;
  console.log(`${reports.length} capture(s): pointer removed in ${n('removed')}, kept in ${n('kept')}, none in ${n('no pointer')}. Clean copies in ${dir}`);
  for (const r of reports.filter((x) => x.status === 'kept')) console.log(`  kept: ${r.file} at ${r.pointer.slice(0, 2).join(',')} (${r.why}). Cover that spot in the scene or do not show this capture.`);
  if (sh) console.log(`Look at ${sh} before using the copies (left: before, right: after).`);
}
