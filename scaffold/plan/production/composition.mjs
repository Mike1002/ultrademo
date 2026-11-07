// composition.mjs — the composition checks (D-67): measured on the frames the
// renderer seeks, not on the code. Two layers.
//
// The DOM layer opens each scene's frame in a headless browser, seeks it every
// 0.25 s (plus its motion-line boundaries and the overlap window), and reads
// every visible element's box: text, images, painted containers. Node then
// merges them into blocks (what a viewer sees as one thing) and checks:
//   1. every visible container has content (no empty card, panel or box);
//   2. balance: the primary content covers a sensible share of 1920×1080 and
//      its centre sits in the middle third unless the layout says left, right
//      or corner; a corner-anchored layout is flagged;
//   3. what the layout centres (or a single primary block) is centred within 2%;
//   4. nothing within 4% of the frame edges but the brand mark and labels the
//      layout places there; nothing small floating alone far from the rest;
//   5. no two scenes' content overlaps in a transition: the outgoing scene's
//      blocks are gone or fading before the incoming ones land in the same place;
//   6. scale: the headline at the direction's headline size, the primary
//      product part at least 40% of the frame width on product moments.
// Two markers the scene author sets: data-shape on a drawn graphic (a meter
// fill, a progress bar, a selection frame) so it counts as content, and
// data-product on the wrapper of a rebuilt product surface made of several
// panels, so check 6 measures the surface, not one panel.
// A failure must persist (0.5 s for an empty box, 0.75 s for the rest) so a
// passing entrance does not count. Each failure is a plain sentence with the
// scene, the time in the video and the element.
//
// The pixel layer reads any rendered video (ours or a reference) from an edge
// map at 2 frames per second: where the ink sits, how much of the frame it
// covers, whether it hugs a corner or an edge. It is what the comparison table
// uses for the reference videos, which have no DOM.

import { canvasOf } from './canvas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { decodeFrames } from '../../scripts/lib/frames.mjs';
import { probePage } from './render.mjs';

// the frame: landscape by default, set from the plan by probeComposition / setCanvas (D-82: vertical builds)
export let W = 1920, H = 1080;
export function setCanvas(w, h) { W = w; H = h; }
export const STEP_S = 0.25;
export const PERSIST = { empty: 0.5, balance: 0.75, corner: 0.75, edge: 0.75, centre: 0.75, lonely: 0.75 };
export const EDGE = 0.04;          // 4% of the frame on each side
export const CENTRE_TOL = 0.02;    // 2% of the frame width
export const MERGE_GAP = 22;       // px: boxes closer than this read as one block
export const PRODUCT_MIN_W = 0.40; // share of the frame width for the primary product part
const r2 = (n) => Math.round(n * 100) / 100;
const pct = (n) => `${Math.round(n * 100)}%`;
export const clock = (s) => { const t = Math.max(0, s); const m = Math.floor(t / 60); const sec = t - m * 60; return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1).replace(/\.0$/, '')}`; };

// ---------------------------------------------------------------------------
// The browser side: raw boxes at one seek time
// ---------------------------------------------------------------------------

/** Runs in the page; returns { leaves: [...], containers: [...] } with rects [l, t, r, b]. */
export const COMPOSITION_SCRIPT = `(product) => {
  const W = window.innerWidth, H = window.innerHeight;
  const root = document.querySelector('#root') || document.body;
  const opMemo = new Map(), clipMemo = new Map(), csMemo = new Map();
  const cs = (el) => { if (!csMemo.has(el)) csMemo.set(el, getComputedStyle(el)); return csMemo.get(el); };
  const opOf = (el) => {
    if (!el || el === document.body || el === document.documentElement) return 1;
    if (opMemo.has(el)) return opMemo.get(el);
    const s = cs(el);
    const o = (s.display === 'none' || s.visibility === 'hidden') ? 0 : parseFloat(s.opacity || '1') * opOf(el.parentElement);
    opMemo.set(el, o); return o;
  };
  const insetClip = (el, r) => {
    const m = String(cs(el).clipPath || '').match(/^inset\\(([^)]*)\\)/);
    if (!m) return null;
    const v = m[1].split(/\\s+/).filter((x) => /^-?[\\d.]+(px|%)?$/.test(x)).map((x, i) => x.endsWith('%') ? parseFloat(x) / 100 * ((i % 2) ? r.width : r.height) : parseFloat(x));
    if (!v.length) return null;
    const [t, rr = t, b = t, l = rr] = v;
    return [r.left + l, r.top + t, r.right - rr, r.bottom - b];
  };
  const clipFor = (el) => {
    if (!el || el === document.body || el === document.documentElement) return [0, 0, W, H];
    if (clipMemo.has(el)) return clipMemo.get(el);
    let c = clipFor(el.parentElement);
    const s = cs(el);
    if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible' || (s.clipPath && s.clipPath !== 'none')) {
      const r = el.getBoundingClientRect();
      const ic = insetClip(el, r) || [r.left, r.top, r.right, r.bottom];
      c = [Math.max(c[0], ic[0]), Math.max(c[1], ic[1]), Math.min(c[2], ic[2]), Math.min(c[3], ic[3])];
    }
    clipMemo.set(el, c); return c;
  };
  const cut = (r, c) => { const x = [Math.max(r.left, c[0]), Math.max(r.top, c[1]), Math.min(r.right, c[2]), Math.min(r.bottom, c[3])]; return x[2] - x[0] < 1 || x[3] - x[1] < 1 ? null : x.map(Math.round); };
  let pk = Number(document.body.dataset.pkNext || 0);
  const key = (el) => { if (!el.dataset.pk) el.dataset.pk = 'k' + (pk++); return el.dataset.pk; };
  const nameOf = (el) => [el.id || '', typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '', el.getAttribute && (el.getAttribute('src') || ''), el.getAttribute && (el.getAttribute('alt') || '')].join(' ');
  const DECOR = /(^|[\\s_-])(ground|pool|pools|glow|grain|bloom|halo|vignette|noise|backdrop|bg|aurora|sheen|beam|orb|ambient|flare|ripple|particle|confetti|spark|grid-bg|gridlines|scanline|shine)(?=$|[\\s_-]|\\d)/i;
  const BRAND = /(logo|wordmark|brand|lockup|(^|[\\s_-])mark(?=$|[\\s_-]))/i;
  const CURSOR = /cursor|pointer|caret/i;
  const LABEL = /(^|[\\s_-])(kicker|label|eyebrow|tag|badge|chip|caption|meta|folio)s?(?=$|[\\s_-]|\\d)/i;
  const flags = (el) => {
    let decor = false, brand = false, cursor = false, edge = false, label = false;
    for (let e = el; e && e !== document.body && e !== root.parentElement; e = e.parentElement) {
      if (e.hasAttribute && (e.hasAttribute('data-decor') || e.getAttribute('aria-hidden') === 'true')) decor = true;
      if (e.hasAttribute && e.hasAttribute('data-edge')) edge = true;
      if (e.hasAttribute && e.hasAttribute('data-brand')) brand = true;
      const n = nameOf(e);
      if (DECOR.test(n)) decor = true;
      if (BRAND.test(n)) brand = true;
      if (CURSOR.test(n)) cursor = true;
      if (LABEL.test(n)) label = true;
      if (e === root) break;
    }
    const f = cs(el).filter || '';
    const bl = f.match(/blur\\(([\\d.]+)px\\)/);
    if (bl && Number(bl[1]) >= 8) decor = true;
    return { decor, brand, cursor, edge, label };
  };
  const scaleOf = (el) => { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; };
  const leaves = [], containers = [];
  // text
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const txt = n.textContent.replace(/\\s+/g, ' ').trim();
    if (!txt) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,template')) continue;
    const op = opOf(el);
    if (op < 0.3) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    const box = cut(r, clipFor(el));
    if (!box) continue;
    const s = cs(el);
    const size = parseFloat(s.fontSize) || 0;
    const fl = flags(el);
    if (fl.decor && op < 0.6) continue;
    leaves.push({ kind: 'text', key: key(el), text: txt.slice(0, 80), rect: box, op: Math.round(op * 100) / 100, size: Math.round(size), eff: Math.round(size * (el instanceof SVGElement ? 1 : scaleOf(el))), ...fl, brand: fl.brand || (product && txt.toLowerCase() === product.toLowerCase()) });
  }
  // images, svg roots, canvas, video, CSS background images; and painted containers
  const all = root.querySelectorAll('*');
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'template', 'br'].includes(tag)) continue;
    if (el instanceof SVGElement && el.ownerSVGElement) continue;
    const op = opOf(el);
    if (op < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const box = cut(r, clipFor(el.parentElement));
    if (!box) continue;
    const area = (box[2] - box[0]) * (box[3] - box[1]);
    const s = cs(el);
    const fl = flags(el);
    const bgImg = s.backgroundImage && s.backgroundImage !== 'none' && /url\\(/.test(s.backgroundImage);
    const isImage = (tag === 'img' && el.complete && el.naturalWidth > 0) || (tag === 'svg' && el.querySelector('path,rect,circle,ellipse,line,polyline,polygon,text,use,image')) || tag === 'canvas' || tag === 'video' || bgImg;
    if (isImage) {
      if (fl.decor || area > 0.92 * W * H) continue;
      leaves.push({ kind: 'image', key: key(el), tag, rect: box, op: Math.round(op * 100) / 100, ...fl });
      continue;
    }
    if (el instanceof SVGElement) continue;
    const alpha = (c) => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,\\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
    const bgA = alpha(s.backgroundColor);
    const grad = s.backgroundImage && s.backgroundImage !== 'none' && /gradient/.test(s.backgroundImage);
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s['border' + k + 'Width']) >= 1 && alpha(s['border' + k + 'Color']) > 0.12 && s['border' + k + 'Style'] !== 'none');
    const shadow = s.boxShadow && s.boxShadow !== 'none';
    const painted = bgA > 0.06 || grad || border || shadow;
    if (!painted) continue;
    // a drawn graphic (meter fill, progress bar, selection frame) is content, not an empty box
    if (el.hasAttribute('data-shape')) { if (!fl.decor) leaves.push({ kind: 'image', key: key(el), tag: 'shape', rect: box, op: Math.round(op * 100) / 100, ...fl }); continue; }
    const w = box[2] - box[0], h = box[3] - box[1];
    if (w < 60 || h < 34) continue;
    if (fl.decor || fl.cursor) continue;
    if (area > 0.7 * W * H) continue;
    const roundish = parseFloat(s.borderTopLeftRadius) >= Math.min(w, h) / 2 - 1 && Math.abs(w - h) < 6;
    containers.push({ key: key(el), tag, rect: box, op: Math.round(op * 100) / 100, round: roundish, ...fl, el });
  }
  // content of each container: a descendant leaf or a painted child, or a leaf drawn mostly inside it
  const inside = (a, b, share) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])); return ix * iy >= share * (a[2] - a[0]) * (a[3] - a[1]); };
  const keyed = new Map();
  for (const el of all) if (el.dataset && el.dataset.pk) keyed.set(el.dataset.pk, el);
  const out = containers.map((c) => {
    const area = (c.rect[2] - c.rect[0]) * (c.rect[3] - c.rect[1]);
    let filled = false;
    for (const l of leaves) {
      const lel = keyed.get(l.key);
      if (lel && c.el.contains(lel) && lel !== c.el) { filled = true; break; }
      if (inside(l.rect, c.rect, 0.85)) { filled = true; break; }
    }
    if (!filled) for (const d of containers) { if (d !== c && c.el.contains(d.el) && (d.rect[2] - d.rect[0]) * (d.rect[3] - d.rect[1]) >= 0.01 * area) { filled = true; break; } }
    const { el, ...rest } = c;
    return { ...rest, filled };
  });
  // the rebuilt product surface as one part (a bento of panels reads as one product)
  const products = [];
  for (const el of root.querySelectorAll('[data-product]')) { if (opOf(el) < 0.5) continue; const box = cut(el.getBoundingClientRect(), clipFor(el.parentElement)); if (box) products.push(box); }
  document.body.dataset.pkNext = String(pk);
  return { leaves, containers: out, products };
}`;

/**
 * Probe every scene: boxes every STEP_S, at the motion-line boundaries, and
 * in the transition overlap after the end. Returns { [sceneId]: { ok, error?, samples: [{ t, leaves, containers }] } }.
 */
export async function probeComposition({ plan, projectDir, log = () => {} }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const out = {};
  const overlap = plan.direction.transition_overlap_s ?? 0.4;
  const cv = canvasOf(plan); setCanvas(cv.W, cv.H);
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', () => {});
    for (const s of plan.scenes) {
      const file = path.join(projectDir, 'compositions', 'frames', `${s.id}.html`);
      if (!fs.existsSync(file)) { out[s.id] = { ok: false, error: 'no frame file', samples: [] }; continue; }
      const probe = probePage(projectDir, s, { width: W, height: H });
      const rec = { ok: true, samples: [] };
      try {
        await page.goto('file://' + probe, { waitUntil: 'load' });
        await page.waitForFunction((id) => Boolean(window.__timelines && window.__timelines[id]), s.id, { polling: 50, timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))));
        const times = new Set();
        for (let t = 0.05; t < s.duration_s; t += STEP_S) times.add(r2(t));
        for (const m of s.motion || []) if (m.from_s > 0 && m.from_s < s.duration_s) times.add(r2(m.from_s + 0.02));
        times.add(r2(s.duration_s - 0.03));
        for (const u of [0.25, 0.5, 0.75]) { times.add(r2(s.duration_s + u * overlap)); times.add(r2(u * overlap)); }
        for (const t of [...times].sort((a, b) => a - b)) {
          await page.evaluate(([id, tt]) => { const tl = window.__timelines[id]; tl.pause(); tl.seek(tt, false); if (tl.render) tl.render(tt, false, false); }, [s.id, t]);
          const raw = await page.evaluate(`(${COMPOSITION_SCRIPT})(${JSON.stringify(plan.video.product || '')})`);
          rec.samples.push({ t, ...raw });
        }
      } catch (err) {
        rec.ok = false;
        rec.error = `the frame could not be probed for composition: ${String(err.message).split('\n')[0]}`;
      }
      out[s.id] = rec;
      log(`composition probe ${s.id}: ${rec.ok ? `${rec.samples.length} sample(s)` : rec.error}`);
    }
  } finally { await browser.close(); }
  return out;
}

// ---------------------------------------------------------------------------
// Node side: blocks and the measures of one sample
// ---------------------------------------------------------------------------

const areaOf = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const inter = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const near = (a, b, g) => a[0] - g < b[2] && b[0] - g < a[2] && a[1] - g < b[3] && b[1] - g < a[3];

/**
 * Merge the leaves and containers of one sample into blocks: boxes closer than
 * MERGE_GAP read as one thing. Decor and the cursor are left out.
 * @returns {Array<{ rect, op, text, members, kinds: string[], brand, label, edge, empty, emptyKeys: string[], hasImage, hasPaint, maxEff }>}
 */
export function blocksOf(sample, { gap = MERGE_GAP } = {}) {
  const items = [];
  for (const l of sample.leaves || []) { if (l.decor || l.cursor) continue; items.push({ ...l, rect: l.rect }); }
  for (const c of sample.containers || []) { if (c.decor || c.cursor) continue; items.push({ ...c, kind: 'container' }); }
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  // words on one line set in separate spans read as one line: they merge across a word space (up to 0.6 of the font size)
  const sameLine = (a, b) => a.kind === 'text' && b.kind === 'text' && Math.min(a.rect[3], b.rect[3]) - Math.max(a.rect[1], b.rect[1]) > 0.5 * Math.min(a.rect[3] - a.rect[1], b.rect[3] - b.rect[1]);
  const gapFor = (a, b) => (sameLine(a, b) ? Math.max(gap, 0.6 * Math.max(a.eff || a.size || 0, b.eff || b.size || 0)) : gap);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (near(items[i].rect, items[j].rect, gapFor(items[i], items[j]))) parent[find(i)] = find(j);
  const groups = new Map();
  items.forEach((it, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); });
  return [...groups.values()].map((m) => {
    const rect = m.reduce((a, it) => (a ? union(a, it.rect) : it.rect), null);
    const texts = m.filter((x) => x.kind === 'text');
    return {
      rect,
      op: Math.max(...m.map((x) => x.op)),
      text: texts.map((x) => x.text).join(' ').slice(0, 80),
      members: m.length,
      kinds: [...new Set(m.map((x) => x.kind))],
      brand: m.every((x) => x.brand),
      label: texts.length > 0 && !m.some((x) => x.kind === 'image') && m.every((x) => (x.kind === 'text' ? (x.label || (x.eff <= 26 && !m.some((y) => y.kind === 'container'))) : x.label)),
      edge: m.some((x) => x.edge),
      empty: m.filter((x) => x.kind === 'container' && !x.filled).length > 0 && !m.some((x) => x.kind !== 'container' || x.filled),
      emptyKeys: m.filter((x) => x.kind === 'container' && !x.filled).map((x) => x.key),
      hasImage: m.some((x) => x.kind === 'image'),
      hasPaint: m.some((x) => x.kind === 'container'),
      maxEff: Math.max(0, ...texts.map((x) => x.eff || 0)),
    };
  });
}

/** What the layout text says about placement. */
export function layoutIntent(scene) {
  const s = `${scene.layout || ''} ${scene.caption || ''}`.toLowerCase();
  const centred = /\bcent(re|er|red|ered|ring)\b|\bmiddle\b/.test(s);
  const sides = { left: /\bleft\b/.test(s), right: /\bright\b/.test(s), top: /\btop\b|upper/.test(s), bottom: /\bbottom\b|lower/.test(s) };
  const corner = /\bcorner\b/.test(s) || /\b(top|bottom|upper|lower)[- ](left|right)\b/.test(s);
  const asym = /\bsplit\b|asymmetric|thirds|60\/40|70\/30|40\/60|30\/70|side[- ]by[- ]side|two columns|\bcolumns\b/.test(s);
  const brandEdge = /\b(logo|mark|wordmark)\b[^.;]*\b(corner|edge|left|right|top|bottom)\b|\b(corner|edge)\b[^.;]*\b(logo|mark|wordmark)\b/.test(s);
  const labelEdge = /\b(kicker|label|tag|folio|caption)\b/.test(s);
  return { centred, sides, corner, asym, brandEdge, labelEdge, text: s.trim() };
}

/** The measures of one sample's blocks. */
export function measureSample(blocks) {
  const primary = blocks.filter((b) => !b.brand && !(b.label && b.edge));
  // occupancy on a grid of 40 px cells (48×27 landscape, 27×48 vertical) so nested boxes are not counted twice
  const GX = Math.round(W / 40), GY = Math.round(H / 40), cw = W / GX, ch = H / GY;
  let cells = 0, sx = 0, sy = 0;
  const grid = new Uint8Array(GX * GY);
  for (const b of primary) {
    const x0 = Math.max(0, Math.floor(b.rect[0] / cw)), x1 = Math.min(GX - 1, Math.floor((b.rect[2] - 1) / cw));
    const y0 = Math.max(0, Math.floor(b.rect[1] / ch)), y1 = Math.min(GY - 1, Math.floor((b.rect[3] - 1) / ch));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!grid[y * GX + x]) { grid[y * GX + x] = 1; cells++; sx += (x + 0.5) * cw; sy += (y + 0.5) * ch; }
  }
  const bbox = primary.length ? primary.reduce((a, b) => (a ? union(a, b.rect) : b.rect), null) : null;
  const centroid = cells ? [sx / cells, sy / cells] : null;
  const col = centroid ? (centroid[0] < W / 3 ? 'left' : centroid[0] > (2 * W) / 3 ? 'right' : 'centre') : null;
  const row = centroid ? (centroid[1] < H / 3 ? 'top' : centroid[1] > (2 * H) / 3 ? 'bottom' : 'centre') : null;
  return {
    primary,
    bbox,
    bbox_share: bbox ? areaOf(bbox) / (W * H) : 0,
    bbox_w: bbox ? (bbox[2] - bbox[0]) / W : 0,
    bbox_h: bbox ? (bbox[3] - bbox[1]) / H : 0,
    occupancy: cells / (GX * GY),
    centroid,
    zone: centroid ? { col, row } : null,
  };
}

const zoneWords = (z) => (z.col === 'centre' && z.row === 'centre' ? 'the centre' : z.col !== 'centre' && z.row !== 'centre' ? `the ${z.row}-${z.col} corner` : z.col !== 'centre' ? `the ${z.col} side` : `the ${z.row} of the frame`);
const nameBlock = (b) => (b.text ? `"${b.text.slice(0, 40)}${b.text.length > 40 ? '…' : ''}"` : b.hasImage ? 'an image' : b.empty ? 'an empty box' : 'a panel');

/**
 * The failures of one sample (unfiltered by time). Each is { type, key, text }.
 * `intent` is layoutIntent(scene).
 */
export function sampleFailures(sample, blocks, m, intent) {
  const F = [];
  // 1 empty containers, each on its own (a ghost box behind a headline is still empty)
  for (const c of sample.containers || []) {
    if (c.filled || c.decor || c.cursor || c.op < 0.15) continue;
    if (areaOf(c.rect) < 0.004 * W * H) continue;
    F.push({ type: 'empty', key: `empty:${c.key}`, text: `an empty box (${Math.round(c.rect[2] - c.rect[0])}×${Math.round(c.rect[3] - c.rect[1])} px at ${Math.round(c.rect[0])}, ${Math.round(c.rect[1])}, opacity ${pct(c.op)}) with nothing in it` });
  }
  if (!m.centroid) return F;
  // 2 balance
  const small = m.bbox_share < 0.05 || (m.bbox_w < 0.3 && m.bbox_h < 0.3);
  const z = m.zone;
  const sideOk = (z.col === 'left' && intent.sides.left) || (z.col === 'right' && intent.sides.right) || (z.col === 'centre');
  const rowOk = (z.row === 'top' && intent.sides.top) || (z.row === 'bottom' && intent.sides.bottom) || (z.row === 'centre');
  const isCorner = z.col !== 'centre' && z.row !== 'centre';
  const where = `its centre at ${pct(m.centroid[0] / W)} across, ${pct(m.centroid[1] / H)} down`;
  if (isCorner && !(intent.corner && sideOk && rowOk)) F.push({ type: 'corner', key: 'corner', text: `the content is anchored in ${zoneWords(z)} (${where}, covering ${pct(m.bbox_share)} of the frame) with the rest of the frame empty` });
  else if (!isCorner && (z.col !== 'centre' || z.row !== 'centre') && !((sideOk && rowOk) || intent.asym)) F.push({ type: 'balance', key: 'balance', text: `the content leans to ${zoneWords(z)} (${where}); the layout does not ask for it` });
  if (small) F.push({ type: 'balance', key: 'small', text: `the content covers only ${pct(m.bbox_share)} of the frame (${pct(m.bbox_w)} of its width, ${pct(m.bbox_h)} of its height); a video frame wants it bigger` });
  // 3 centring
  const prim = m.primary.filter((b) => !b.label && areaOf(b.rect) >= 0.002 * W * H);
  const centreWanted = (intent.centred && !intent.sides.left && !intent.sides.right && !intent.asym) || (prim.length === 1 && !intent.sides.left && !intent.sides.right && !intent.asym);
  if (centreWanted) {
    // with several blocks, only those standing in the central column (crossing the centre line) are meant to be centred; toasts or cards around a centred hero are not
    const central = prim.length > 1 ? prim.filter((b) => b.rect[0] < W / 2 && b.rect[2] > W / 2) : prim;
    for (const b of central) {
      const cx = (b.rect[0] + b.rect[2]) / 2;
      const off = (cx - W / 2) / W;
      if (Math.abs(off) > CENTRE_TOL && b.rect[2] - b.rect[0] < 0.96 * W) F.push({ type: 'centre', key: `centre:${b.text || b.kinds.join('+')}`.slice(0, 60), text: `${nameBlock(b)} is meant to be centred but sits ${Math.abs(Math.round(off * W))} px ${off > 0 ? 'right' : 'left'} of the centre (${(Math.abs(off) * 100).toFixed(1)}% of the frame; the tolerance is 2%)` });
    }
  }
  // 4 edges, and small things floating alone
  for (const b of blocks) {
    if (b.op < 0.3) continue;
    const big = areaOf(b.rect) >= 0.45 * W * H;
    if (big) continue;
    const touches = [];
    // 2 px of slack so an 76/77 px margin (4% of 1920 is 76.8) is not counted as touching
    if (b.rect[0] < EDGE * W - 2) touches.push('left');
    if (b.rect[2] > (1 - EDGE) * W + 2) touches.push('right');
    if (b.rect[1] < EDGE * H - 2) touches.push('top');
    if (b.rect[3] > (1 - EDGE) * H + 2) touches.push('bottom');
    const allowed = b.brand || (b.label && (b.edge || intent.labelEdge)) || b.edge;
    if (touches.length && !allowed) F.push({ type: 'edge', key: `edge:${b.text || b.kinds.join('+')}`.slice(0, 60), text: `${nameBlock(b)} is within 4% of the ${touches.join(' and ')} edge${touches.length > 1 ? 's' : ''} (${b.rect.map(Math.round).join(', ')})` });
  }
  const others = (b) => blocks.filter((x) => x !== b && x.op >= 0.3);
  for (const b of blocks) {
    if (b.op < 0.3 || areaOf(b.rect) > 0.03 * W * H) continue;
    const o = others(b);
    if (!o.length) continue;
    const dist = Math.min(...o.map((x) => Math.max(0, Math.max(x.rect[0] - b.rect[2], b.rect[0] - x.rect[2]), Math.max(x.rect[1] - b.rect[3], b.rect[1] - x.rect[3]))));
    const cx = (b.rect[0] + b.rect[2]) / 2, cy = (b.rect[1] + b.rect[3]) / 2;
    const outer = cx < W / 4 || cx > (3 * W) / 4 || cy < H / 5 || cy > (4 * H) / 5;
    const allowed = (b.brand && intent.brandEdge) || b.edge || (b.label && intent.labelEdge);
    if (dist > 0.22 * W && outer && !allowed) F.push({ type: 'lonely', key: `lonely:${b.text || b.kinds.join('+')}`.slice(0, 60), text: `${nameBlock(b)}${b.brand ? ' (the brand mark)' : ''} floats alone ${Math.round(dist)} px from the rest of the content, at ${pct(cx / W)} across, ${pct(cy / H)} down` });
  }
  return F;
}

/** Runs of consecutive failing samples per key, kept when they last at least the type's persistence; one finding per key (its longest run). */
export function persistentFailures(perSample, step = STEP_S) {
  const byKey = new Map();
  perSample.forEach((p, i) => { for (const f of p.failures) { if (!byKey.has(f.key)) byKey.set(f.key, []); byKey.get(f.key).push({ i, t: p.t, f }); } });
  const out = [];
  for (const hits of byKey.values()) {
    let best = null, run = [hits[0]];
    const close = () => { const d = run[run.length - 1].t - run[0].t + step; if (!best || d > best.d) best = { d, run: run.slice() }; };
    for (let k = 1; k < hits.length; k++) { if (hits[k].i === hits[k - 1].i + 1) run.push(hits[k]); else { close(); run = [hits[k]]; } }
    close();
    const type = hits[0].f.type;
    if (best.d >= (PERSIST[type] ?? 0.75) - 1e-6) out.push({ ...best.run[0].f, start: best.run[0].t, end: best.run[best.run.length - 1].t });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The headline's size from the direction (the smallest lower bound among headline sizes; 64 px when none). */
export function headlineMinPx(direction) {
  const d = direction?.type?.display;
  const sizes = typeof d === 'object' && d?.sizes ? d.sizes : [];
  const lows = [];
  for (const s of sizes) {
    if (!/headline|hero|\bxl\b|\bl\b|title|frame/i.test(s.use) || /card/i.test(s.use)) continue;
    const m = String(s.size).match(/(\d+)/);
    if (m) lows.push(Number(m[1]));
  }
  return lows.length ? Math.min(...lows) : 64;
}

const normWord = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
const wordsOf = (s) => String(s || '').split(/\s+/).map(normWord).filter(Boolean);

/** Whether a scene is a product moment: it places a captured or rebuilt part of the product (not a logo, a line of copy or the call-to-action button), and it is not the close. */
const NOT_PRODUCT = /(^|-)(logo|mark|wordmark|line|lines|headline|text|type|copy|word|words|title|quote|kicker|pill|cta|button)(-|$)/;
export const isProductMoment = (scene) => !['cta', 'close'].includes(scene.beat) && (scene.visuals || []).some((v) => (v.kind === 'captured' || v.kind === 'rebuilt') && !NOT_PRODUCT.test(String(v.ref).toLowerCase()));

/**
 * The composition findings of one scene from its samples (not the transitions).
 * @returns {{ findings: Array<{ check, level, text, type, start_s, end_s }>, measured: object }}
 */
export function sceneComposition(scene, rec, plan) {
  if (!rec || !rec.ok) return { findings: [{ check: 'composition', level: 'warn', type: 'probe', text: `${scene.id}: ${rec?.error || 'the frame was not probed'}, so the composition checks did not run` }], measured: {}, samples: 0 };
  const intent = layoutIntent(scene);
  const inScene = (rec?.samples || []).filter((x) => x.t < scene.duration_s);
  const perSample = inScene.map((x) => { const blocks = blocksOf(x); const m = measureSample(blocks); return { t: x.t, blocks, m, failures: sampleFailures(x, blocks, m, intent) }; });
  const runs = persistentFailures(perSample);
  const at = (t) => clock(scene.start_s + t);
  const findings = runs.map((r) => ({
    check: `composition:${r.type}`, level: 'fail', type: r.type, start_s: r.start, end_s: r.end,
    text: `${scene.id} at ${at(r.start)}–${at(r.end + STEP_S)} (${r.start.toFixed(2)}–${(r.end + STEP_S).toFixed(2)} s into the scene): ${r.text}`,
  }));
  // 6 scale: the headline, and the product part on product moments
  const head = wordsOf(scene.copy?.headline).filter((w) => w.length > 1);
  const minPx = headlineMinPx(plan.direction);
  let headMax = 0;
  for (const p of perSample) for (const b of p.blocks) {
    const words = new Set(wordsOf(b.text));
    if (head.length && head.filter((w) => words.has(w)).length >= Math.ceil(head.length / 2)) headMax = Math.max(headMax, b.maxEff);
  }
  const measured = { headline_px: headMax || null, headline_min_px: minPx };
  if (head.length && headMax && headMax < 0.9 * minPx) findings.push({ check: 'composition:scale', level: 'fail', type: 'scale', text: `${scene.id}: the headline "${scene.copy.headline}" is set at ${headMax} px at its largest; the direction's headline size starts at ${minPx} px` });
  if (isProductMoment(scene)) {
    let widest = 0;
    for (const p of perSample) for (const b of p.blocks) if ((b.hasImage || b.hasPaint) && !b.brand && !b.empty) widest = Math.max(widest, (b.rect[2] - b.rect[0]) / W);
    for (const x of inScene) for (const r of x.products || []) widest = Math.max(widest, (r[2] - r[0]) / W);
    measured.product_width = r2(widest);
    if (widest < PRODUCT_MIN_W) findings.push({ check: 'composition:scale', level: 'fail', type: 'scale', text: `${scene.id}: the product never fills more than ${pct(widest)} of the frame width (at least ${pct(PRODUCT_MIN_W)} on a product moment)` });
  }
  const shares = perSample.map((p) => p.m.bbox_share).filter((x) => x > 0);
  measured.content_share = shares.length ? r2(shares.reduce((a, b) => a + b, 0) / shares.length) : 0;
  measured.composition_failures = findings.length;
  return { findings, measured, samples: perSample.length };
}

// ---------------------------------------------------------------------------
// 5 transitions: the outgoing scene's tail against the incoming scene's head
// ---------------------------------------------------------------------------

const ease = {
  'power2.inOut': (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
  'power3.in': (p) => p * p * p,
  'power3.out': (p) => 1 - Math.pow(1 - p, 3),
  'power3.inOut': (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
};
const scaleRect = (r, s) => [W / 2 + (r[0] - W / 2) * s, H / 2 + (r[1] - H / 2) * s, W / 2 + (r[2] - W / 2) * s, H / 2 + (r[3] - H / 2) * s];

/** How a transition shows each side at progress p: { out: {op, map}, in: {op, map} }. Shader transitions blend like a crossfade. */
export function transitionModel(kind, p) {
  switch (kind) {
    case 'zoom-through': {
      const a = ease['power3.in'](p), b = ease['power3.out'](p);
      return { out: { op: 1 - a, map: (r) => scaleRect(r, 1 + 1.2 * a) }, in: { op: b, map: (r) => scaleRect(r, 0.6 + 0.4 * b) } };
    }
    case 'wipe': {
      const a = ease['power3.inOut'](p);
      return { out: { op: 1, map: (r) => [r[0] - 0.08 * W * a, r[1], r[2] - 0.08 * W * a, r[3]] }, in: { op: 1, map: (r) => [r[0], r[1], Math.min(r[2], W * a), r[3]] } };
    }
    default: {
      const a = ease['power2.inOut'](p);
      return { out: { op: 1 - a, map: (r) => r }, in: { op: a, map: (r) => r } };
    }
  }
}

/**
 * Collisions in one transition: outgoing blocks still visible (≥ 0.3 after the
 * transition's own fade) over incoming blocks already landed (≥ 0.3) in the
 * same place (overlap ≥ 20% of the smaller box). The carried element (the same
 * words on both sides, or a box at the same place and size) is exempt.
 */
export function transitionCollisions({ from, to, kind, overlap, recFrom, recTo, startInVideo = 0 }) {
  const out = [];
  const tail = (recFrom?.samples || []).filter((x) => x.t >= from.duration_s - 1e-6);
  const head = (recTo?.samples || []).filter((x) => x.t <= overlap + 1e-6);
  if (!tail.length || !head.length) return out;
  const nearestHead = (u) => head.reduce((a, x) => (Math.abs(x.t - u) < Math.abs(a.t - u) ? x : a), head[0]);
  for (const ts of tail) {
    const u = ts.t - from.duration_s;
    const p = Math.max(0, Math.min(1, u / overlap));
    const model = transitionModel(kind, p);
    const A = blocksOf(ts).map((b) => ({ ...b, rect: model.out.map(b.rect), vis: b.op * model.out.op }));
    const B = blocksOf(nearestHead(u)).map((b) => ({ ...b, rect: model.in.map(b.rect), vis: b.op * model.in.op }));
    for (const a of A) for (const b of B) {
      if (a.vis < 0.3 || b.vis < 0.3 || a.brand || b.brand) continue;
      const i = inter(a.rect, b.rect);
      const smaller = Math.min(areaOf(a.rect), areaOf(b.rect));
      if (!smaller || i < 0.2 * smaller) continue;
      const wa = new Set(wordsOf(a.text)), wb = wordsOf(b.text);
      const sameWords = wb.length && wb.filter((w) => wa.has(w)).length >= Math.ceil(wb.length * 0.6);
      const iou = i / (areaOf(a.rect) + areaOf(b.rect) - i);
      if (sameWords || (!a.text && !b.text && iou > 0.6)) continue;
      out.push({ check: 'composition:transition', level: 'fail', type: 'transition', key: `${nameBlock(a)}|${nameBlock(b)}`,
        text: `the ${kind === 'cut' || kind === 'match' ? 'cut' : kind} from ${from.id} into ${to.id} at ${clock(startInVideo + u)}: the outgoing ${nameBlock(a)} is still showing at ${pct(a.vis)} while the incoming ${nameBlock(b)} lands in the same place at ${pct(b.vis)}; the outgoing content must leave that region before the next scene's content arrives` });
    }
  }
  const seen = new Set();
  return out.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true))).slice(0, 3);
}

// ---------------------------------------------------------------------------
// The pixel layer: any rendered video
// ---------------------------------------------------------------------------

/** One grey frame (w×h) → ink measures from its edge map. */
export function frameInk(f, w, h) {
  const T = 34;
  let ink = 0, sx = 0, sy = 0, edge = 0;
  const xs = new Uint32Array(w), ys = new Uint32Array(h);
  const bx = Math.max(1, Math.round(EDGE * w)), by = Math.max(1, Math.round(EDGE * h));
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const g = Math.abs(f[i + 1] - f[i - 1]) + Math.abs(f[i + w] - f[i - w]);
    if (g < T) continue;
    ink++; sx += x; sy += y; xs[x]++; ys[y]++;
    if (x < bx || x >= w - bx || y < by || y >= h - by) edge++;
  }
  if (ink < 0.002 * w * h) return { ink: ink / (w * h), empty: true };
  const trim = (hist, n) => { const cut = n * 0.02; let a = 0, lo = 0, hi = hist.length - 1; while (lo < hi && a + hist[lo] <= cut) a += hist[lo++]; a = 0; while (hi > lo && a + hist[hi] <= cut) a += hist[hi--]; return [lo, hi]; };
  const [x0, x1] = trim(xs, ink), [y0, y1] = trim(ys, ink);
  const cx = sx / ink / w, cy = sy / ink / h;
  const col = cx < 1 / 3 ? 'left' : cx > 2 / 3 ? 'right' : 'centre', row = cy < 1 / 3 ? 'top' : cy > 2 / 3 ? 'bottom' : 'centre';
  return { ink: ink / (w * h), empty: false, bbox_share: ((x1 - x0 + 1) * (y1 - y0 + 1)) / (w * h), centroid: [r2(cx), r2(cy)], col, row, edge_share: edge / ink };
}

/** Pixel composition of a whole video: shares of sampled time that are corner-anchored, off-balance, edge-crowded, small or empty. */
export function pixelComposition(file, { fps = 2, w = 192, h = 108 } = {}) {
  const fr = decodeFrames(file, { fps, w, h });
  const rows = [];
  for (let i = 0; i < fr.n; i++) rows.push(frameInk(fr.at(i), w, h));
  const n = rows.length || 1;
  const full = rows.filter((r) => !r.empty);
  const share = (pred) => r2(rows.filter(pred).length / n);
  return {
    samples: rows.length,
    corner_share: share((r) => !r.empty && r.col !== 'centre' && r.row !== 'centre'),
    off_balance_share: share((r) => !r.empty && (r.col !== 'centre' || r.row !== 'centre')),
    edge_crowded_share: share((r) => !r.empty && r.edge_share > 0.12),
    small_share: share((r) => !r.empty && r.bbox_share < 0.12),
    empty_share: share((r) => r.empty),
    mean_bbox_share: full.length ? r2(full.reduce((a, r) => a + r.bbox_share, 0) / full.length) : 0,
    mean_ink: Math.round(rows.reduce((a, r) => a + r.ink, 0) / n * 1000) / 1000,
  };
}
