// frames.mjs — the signature render of a direction (D-65): one 3-second
// composition per direction, the direction's signature moment built from that
// moment's own copy and sketch layout with the signature move played over it,
// in the direction's palette and fonts. Written as a HyperFrames composition
// and rendered with the same pipeline as the motion gallery
// (research/motion-craft/motion-gallery/_tools/build.sh: lint, render with
// hyperframes 0.8.145 from scaffold/, GSAP from the gallery's _lib/).
//
// Two directions render the same only when their signature moments carry the
// same copy, layout and move; that is a defect in the directions, not a reason
// to show a generic frame (D-65). `mode: 'playwright'` skips the render and
// takes the still by seeking the timeline in a headless browser; the default
// tests use it so nothing slow runs.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SIGNATURE_KINDS, signatureMoment } from './schema.mjs';
import { sketchColours } from './sketch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.ULTRADEMO_ROOT || path.resolve(HERE, '..', '..', '..');
export const SCAFFOLD = path.join(ROOT, 'scaffold');
export const GALLERY_LIB = path.join(ROOT, 'research/motion-craft/motion-gallery/_lib/gsap.min.js');
export const FONTS_DIR = path.join(ROOT, 'research/motion-craft/video-style-gallery/_fonts');
export const HYPERFRAMES = 'hyperframes@0.8.145';
// HyperFrames runs pinned and quiet: no usage telemetry, no update check, no background self-install (it would replace
// the pinned version). Set here so every renderer call inherits it.
for (const k of ['HYPERFRAMES_NO_TELEMETRY', 'DO_NOT_TRACK', 'HYPERFRAMES_NO_UPDATE_CHECK', 'HYPERFRAMES_NO_AUTO_INSTALL']) process.env[k] ??= '1';


export const LOOP_S = 3;
/** Where the still is taken: the move is mid-flight and the layout has settled. */
export const STILL_AT = 2.0;

const e = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const js = (v) => JSON.stringify(String(v ?? ''));

/** Open fonts: family → faces, from the gallery's fonts.json. */
export function openFonts() {
  const file = path.join(FONTS_DIR, 'fonts.json');
  if (!fs.existsSync(file)) return [];
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.entries(j.fetched || {}).map(([family, v]) => ({
    family,
    weights: (v.faces || []).map((f) => `${f.weight}${f.style === 'italic' ? 'i' : ''}`),
    faces: (v.faces || []).map((f) => ({ file: path.join(FONTS_DIR, path.relative('_fonts', f.file)), weight: f.weight, style: f.style })),
  }));
}

/** @font-face lines for the three type roles; copies the files when `copyTo` is given. Returns { css, files: {family→[copied]} }. */
export function fontFaces(d, { copyTo = null, urlPrefix = './fonts/' } = {}) {
  const all = openFonts();
  const families = [...new Set([d.type.display, d.type.text, d.type.mono])];
  const css = [];
  const files = {};
  for (const fam of families) {
    const f = all.find((x) => x.family === fam);
    if (!f) continue;
    files[fam] = [];
    for (const face of f.faces) {
      if (!fs.existsSync(face.file)) continue;
      const name = path.basename(face.file);
      if (copyTo) { fs.mkdirSync(copyTo, { recursive: true }); fs.copyFileSync(face.file, path.join(copyTo, name)); }
      files[fam].push(name);
      css.push(`@font-face{font-family:"${fam}";src:url("${urlPrefix}${name}") format("woff2");font-weight:${face.weight};font-style:${face.style};font-display:block}`);
    }
  }
  return { css: css.join('\n'), files };
}

/** Weight to use for a display face: heavy faces ship one weight. */
export function displayWeight(family, faces) {
  const w = faces.map((f) => Number(String(f).replace('i', ''))).filter(Number.isFinite);
  if (!w.length) return 800;
  return Math.max(...w);
}

/** Text entrance as GSAP lines; `sel` is a word-span selector. */
function textEntrance(kind, sel, at, stagger = 0.05) {
  switch (kind) {
    case 'slam': return `tl.fromTo(${js(sel)}, { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: "power4.out", stagger: ${stagger * 1.6} }, ${at});`;
    case 'blur-in': return `tl.fromTo(${js(sel)}, { filter: "blur(18px)", opacity: 0 }, { filter: "blur(0px)", opacity: 1, duration: 0.5, ease: "power2.out", stagger: ${stagger} }, ${at});`;
    case 'scale-in': return `tl.fromTo(${js(sel)}, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.4)", stagger: ${stagger} }, ${at});`;
    case 'letters': return `tl.fromTo(${js(sel)}, { y: 30, opacity: 0, rotateX: -40 }, { y: 0, opacity: 1, rotateX: 0, duration: 0.4, ease: "power3.out", stagger: ${stagger * 0.6} }, ${at});`;
    case 'fade-up': return `tl.fromTo(${js(sel)}, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: "power3.out", stagger: ${stagger} }, ${at});`;
    case 'rise-mask':
    default: return `tl.fromTo(${js(sel)}, { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: "expo.out", stagger: ${stagger} }, ${at});`;
  }
}

/** Headline words in masks; the accent substring gets .acc. With `slot`, the accent (or last) word becomes a swap column of `slot` tokens. */
function wordsHtml(text, accent, slot = null) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const a = String(accent || '').toLowerCase();
  const isAcc = (w) => a && a.includes(w.toLowerCase().replace(/[.,!?]/g, ''));
  // the swap slot spans the accent phrase (or the last word)
  let slotFrom = -1, slotTo = -1;
  if (slot && slot.length) {
    const clean = (x) => x.toLowerCase().replace(/[.,!?:;]+$/, '');
    outer: for (let i = 0; i < words.length; i++) for (let j = i; j < words.length; j++) if (a && words.slice(i, j + 1).map(clean).join(' ') === clean(a)) { slotFrom = i; slotTo = j; break outer; }
    if (slotFrom < 0) slotFrom = slotTo = words.length - 1;
  }
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (i === slotFrom) {
      const phraseRaw = words.slice(slotFrom, slotTo + 1).join(' ');
      const phrase = phraseRaw.replace(/[.,!?:;]+$/, '');
      const tail = phraseRaw.slice(phrase.length);
      const tokens = [phrase, ...slot.filter((t) => t.toLowerCase() !== phrase.toLowerCase())].slice(0, 4);
      out.push(`<span class="slot"><span id="sigcol">${tokens.map((t) => `<span class="acc">${e(t + tail)}</span>`).join('')}</span></span>`);
      i = slotTo;
      continue;
    }
    out.push(`<span class="mask"><span class="w${isAcc(words[i]) ? ' acc' : ''}">${e(words[i])}</span></span>`);
  }
  return out.join(' ');
}

/** The CSS tokens of a direction for a composition. */
function tokensCss(d, c, fontCss, dw, W = 1280, H = 720) {
  return `${fontCss}
:root{--bg:${c.canvas};--ink:${c.ink};--muted:${c.muted};--accent:${c.accent};--primary:${c.primary};--surface:${c.surface};--line:${c.line};--warm:${c.warm};
--f-display:"${d.type.display}",system-ui,sans-serif;--f-text:"${d.type.text}",system-ui,sans-serif;--f-mono:"${d.type.mono}",ui-monospace,monospace;--w-display:${dw}}
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--bg)}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--f-text);-webkit-font-smoothing:antialiased}
.clip{position:absolute;inset:0;overflow:hidden;background:var(--bg)}
#stage{position:absolute;inset:0;transform-origin:50% 50%}
.pool{position:absolute;border-radius:50%;filter:blur(60px);pointer-events:none}
.display{font-family:var(--f-display);font-weight:var(--w-display);letter-spacing:-0.02em;line-height:1.04}
.display .acc,.acc{color:var(--accent)}
.kicker{font-family:var(--f-mono);font-weight:500;text-transform:uppercase;letter-spacing:.18em;font-size:18px;color:var(--muted);white-space:nowrap}
.mask{display:inline-block;overflow:hidden;vertical-align:top;padding:.08em .02em .12em;margin:-.08em -.02em -.12em}.mask .w{display:inline-block;will-change:transform,opacity}
.slot{display:inline-block;height:1.04em;overflow:hidden;vertical-align:top}.slot #sigcol{display:block}.slot #sigcol span{display:block;height:1.04em;white-space:nowrap}
.sub{font-family:var(--f-text);font-weight:400;font-size:30px;color:var(--muted);line-height:1.3}
.pill{display:inline-flex;align-items:center;gap:12px;height:64px;padding:0 30px;border-radius:16px;background:var(--primary);color:#fff;font-weight:600;font-size:26px;font-family:var(--f-text);white-space:nowrap;transform-origin:50% 50%}
.surf{position:absolute;background:var(--surface);border:2px solid var(--line);border-radius:18px;overflow:hidden}
.win{box-shadow:0 40px 120px rgba(0,0,0,.35)}
.bar{height:44px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;padding:0 18px;font-family:var(--f-mono);font-size:14px;color:var(--muted)}
.bar i{width:10px;height:10px;border-radius:50%;background:var(--muted);opacity:.45;display:inline-block}
.main{position:absolute;left:0;top:44px;right:0;bottom:0;padding:30px 34px}
.card{background:var(--bg);border:2px solid var(--line);border-radius:14px;padding:22px 26px}
.row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid var(--line);font-size:21px;white-space:nowrap}.row:last-child{border-bottom:0}.row span:first-child{overflow:hidden;text-overflow:ellipsis}
.tag{font-size:15px;font-family:var(--f-mono);padding:4px 12px;border-radius:999px;background:var(--line);color:var(--ink);flex:none}.tag.warm{background:var(--warm);color:#1a1a1a}
.cc{position:absolute;background:var(--surface);border:2px solid var(--line);border-radius:18px;padding:24px 26px;overflow:hidden}
.toast{position:absolute;display:flex;align-items:center;gap:12px;height:58px;padding:0 22px;border-radius:14px;background:var(--surface);border:2px solid var(--line);font-size:22px;box-shadow:0 20px 60px rgba(0,0,0,.3);white-space:nowrap;color:var(--ink)}
.toast b{width:12px;height:12px;border-radius:50%;background:var(--accent);display:inline-block;flex:none}
.cursor{position:absolute;width:26px;height:36px;z-index:9}
.rule{display:block;height:5px;background:var(--accent);transform-origin:left center}
.stat{font-family:var(--f-display);font-weight:var(--w-display);font-variant-numeric:tabular-nums;letter-spacing:-0.03em;line-height:1;white-space:nowrap}
.mark{position:absolute;left:40px;top:34px;font-family:var(--f-display);font-weight:var(--w-display);font-size:28px;letter-spacing:-0.01em;color:var(--ink)}
.strike{text-decoration:line-through}
.problem{display:inline-block;border:2px solid #ef4444;color:#ef4444;border-radius:999px;padding:6px 16px;font-size:18px;font-family:var(--f-mono);white-space:nowrap}
.box{position:absolute;background:var(--surface);border:2px solid var(--line);border-radius:14px;padding:16px 18px;font-size:20px;color:var(--ink);overflow:hidden;display:flex;align-items:center}`;
}

const CURSOR_SVG = `<svg viewBox="0 0 26 36" width="26" height="36"><path d="M2 2 L2 28 L8 22 L13 34 L18 32 L13 20 L22 20 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>`;

const px = (pct, of) => Math.round(pct / 100 * of);
const headSize = (text, max = 108) => { const n = String(text || '').length; return Math.min(max, n <= 18 ? 108 : n <= 28 ? 88 : n <= 40 ? 72 : 60); };
/** "Jamie Dalton — Owner" → { name, tag }. */
const parseRow = (line) => { const m = String(line).match(/^(.*?)\s+(?:—|–|-|·|:)\s+(.*)$/); return m ? { name: m[1], tag: m[2] } : { name: String(line), tag: null }; };
const rowsHtml = (lines, id = 'sigrows') => `<div class="card" id="${id}">${lines.map((l, i) => { const r = parseRow(l); return `<div class="row" id="${id}-${i}"><span>${e(r.name)}</span>${r.tag ? `<span class="tag${/invited|pending|waiting/i.test(r.tag) ? ' warm' : ''}" id="${id}-tag${i}">${e(r.tag)}</span>` : ''}</div>`; }).join('')}</div>`;

/**
 * The moment's layout at 1280×720 from its sketch kind (the same geometry as
 * sketch.mjs, drawn as a finished frame). Returns { html, has } where `has`
 * says which anchors the move can use: head, pill, num, cards, win, rows.
 */
export function layoutHtml(m, d, c, ctx) {
  const s = m.sketch || { kind: 'type-centred', lines: [] };
  const lines = (s.lines || []).filter(Boolean).slice(0, 4);
  const copy = m.copy || {};
  const slot = ctx.slot || null;
  const has = { head: false, pill: false, num: false, cards: false, win: false, rows: false, sub: false, kicker: false };
  const V = Boolean(ctx.vertical);
  const kicker = (style = '') => (copy.kicker ? (has.kicker = true, `<div class="kicker" id="sigkicker" style="${style}">${e(copy.kicker)}</div>`) : '');
  const head = (size, style = '') => (copy.headline ? (has.head = true, `<div class="display" id="sighead" style="font-size:${size}px;${style}">${wordsHtml(copy.headline, copy.accent, slot)}</div>`) : '');
  const sub = (style = '') => (copy.sub ? (has.sub = true, `<div class="sub" id="sigsub" style="${style}">${e(copy.sub)}</div>`) : '');
  const pill = (label, style = '') => (has.pill = true, `<div class="pill" id="sigpill" style="${style}"><span id="sigpilltext">${e(label)}</span></div>`);
  const pool = (left, top, w, h, col, op) => `<div class="pool" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px;background:${col};opacity:${op}"></div>`;
  const dark = d.canvas === 'dark';
  const op = (a, b) => (dark ? a : b);
  const mark = `<div class="mark" id="sigmark">${e(ctx.video.product)}</div>`;
  const pillLabel = s.pill || ctx.video.cta || 'Start';
  let html = '';
  // D-82: a vertical video's frames are 720×1280: every kind stacked (headline above, the product part below at full width)
  if (ctx.vertical) {
    const L = 'left:48px;right:48px';
    switch (s.kind) {
      case 'hero-number': {
        const numRaw = ctx.number || (copy.headline || '');
        const isNumber = Boolean(ctx.number);
        has.num = isNumber;
        const boxes = lines.filter((l) => !(isNumber && String(l).replace(/[^\d]/g, '') === String(ctx.digits ?? ''))).map((l, i) => `<div class="box surf" style="left:48px;width:624px;top:${800 + i * 104}px;height:84px">${e(l)}</div>`).join('');
        html = `${pool(-80, 200, 880, 700, c.primary, op(0.4, 0.16))}${mark}<div id="sigheadwrap" style="position:absolute;${L};top:250px;text-align:center">${kicker('margin-bottom:18px')}${isNumber ? `<div class="stat" id="signum" style="font-size:${numRaw.length <= 7 ? 150 : numRaw.length <= 14 ? 100 : 72}px;color:var(--accent)">${ctx.numberHtml}</div>${head(44, 'margin-top:22px')}` : head(headSize(copy.headline, 88))}${sub('margin-top:20px')}</div>${boxes}`;
        break;
      }
      case 'product-window': {
        has.win = true;
        const own = lines.filter((l) => String(l).trim().toLowerCase() !== String(copy.headline || '').trim().toLowerCase());
        const rowLines = own.length >= 1 ? own : (ctx.brand.product_words?.entities || []).slice(0, 3);
        has.rows = rowLines.length > 0;
        html = `${pool(-100, 500, 900, 800, c.primary, op(0.4, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;${L};top:130px">${kicker('margin-bottom:12px')}${head(Math.min(72, headSize(copy.headline, 72)))}${sub('font-size:26px;margin-top:12px')}</div><div class="surf win" id="sigwin" style="left:40px;top:470px;width:640px;height:700px"><div class="bar"><i></i><i></i><i></i><span style="margin-left:10px">${e(ctx.host)}</span></div><div class="main">${has.rows ? rowsHtml(rowLines) : `<div class="card"><div style="font-size:24px;color:var(--muted)">${e(ctx.video.proof_moment || '')}</div></div>`}${s.pill || ctx.needPill ? `<div style="margin-top:22px">${pill(s.pill || pillLabel)}</div>` : ''}</div></div>`;
        break;
      }
      case 'split': {
        has.rows = lines.length > 0;
        html = `${pool(-80, 520, 880, 700, c.primary, op(0.3, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;${L};top:150px">${kicker('margin-bottom:16px')}${head(headSize(copy.headline, 80))}${sub('margin-top:16px')}</div><div class="surf" id="sigpanel" style="left:48px;top:600px;width:624px;height:560px;padding:28px">${has.rows ? rowsHtml(lines) : `<div style="font-size:26px;color:var(--muted)">${e(ctx.video.proof_moment || ctx.video.product)}</div>`}</div>`;
        break;
      }
      case 'stack-problem': {
        const pills = lines.map((l, i) => `<div class="problem" style="position:absolute;left:48px;top:${1000 + i * 62}px">${e(l)}</div>`).join('');
        html = `${mark}<div id="sigheadwrap" style="position:absolute;${L};top:130px">${kicker('margin-bottom:14px')}${head(headSize(copy.headline, 76))}${copy.sub ? `<div class="sub strike" id="sigsub" style="margin-top:14px">${e(copy.sub)}</div>` : ''}</div><div class="surf" style="left:60px;top:560px;width:480px;height:260px"></div><div class="surf" style="left:120px;top:630px;width:480px;height:260px;opacity:.8"></div><div class="surf" style="left:180px;top:700px;width:480px;height:260px;opacity:.6"></div>${pills}`;
        has.sub = Boolean(copy.sub);
        break;
      }
      case 'cards': {
        const items = lines.length >= 2 ? lines : (ctx.words.length >= 2 ? ctx.words : (ctx.brand.product_words?.features || []).slice(0, 3));
        const n = Math.max(2, Math.min(4, items.length || 3));
        const h = Math.floor((760 - (n - 1) * 24) / n);
        has.cards = true;
        const cardBody = (t) => { const r = parseRow(t); return `<div class="display cct" style="font-size:36px">${e(r.name)}</div>${r.tag ? `<div style="margin-top:14px"><span class="tag${/invited|pending|waiting/i.test(r.tag) ? ' warm' : ''}">${e(r.tag)}</span></div>` : ''}`; };
        html = `${pool(-80, 600, 880, 600, c.primary, op(0.3, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;${L};top:130px">${kicker('margin-bottom:14px')}${head(Math.min(68, headSize(copy.headline, 68)))}</div>${Array.from({ length: n }, (_, i) => `<div class="cc" id="sigcc${i}" style="left:48px;top:${420 + i * (h + 24)}px;width:624px;height:${h}px"><div class="kicker" style="font-size:14px;margin-bottom:12px">0${i + 1}</div>${cardBody(items[i] || '')}</div>`).join('')}`;
        break;
      }
      case 'close-cta':
        html = `${pool(-80, 260, 880, 760, c.primary, op(0.35, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;${L};top:360px;text-align:center">${kicker('margin-bottom:18px')}${head(headSize(copy.headline, 88))}</div><div style="position:absolute;left:50%;top:800px;transform:translate(-50%,-50%)">${pill(s.pill || ctx.video.cta || pillLabel)}</div>${copy.sub ? `<div class="sub" id="sigsub" style="position:absolute;${L};top:900px;text-align:center">${e(copy.sub)}</div>` : ''}<div class="kicker" style="position:absolute;left:0;right:0;bottom:80px;text-align:center">${e(ctx.host)}</div>`;
        has.sub = Boolean(copy.sub);
        break;
      case 'pill-press': {
        const label = s.pill || ctx.words[0] || ctx.video.cta || copy.headline || 'Press';
        const rowLines = lines.length >= 2 ? lines : [];
        has.rows = rowLines.length > 0;
        html = `${pool(-40, 360, 800, 640, c.primary, op(0.5, 0.18))}${mark}<div id="sigheadwrap" style="position:absolute;${L};top:${has.rows ? 170 : 300}px;text-align:center">${kicker('margin-bottom:14px')}${copy.headline && copy.headline !== label ? head(headSize(copy.headline, 80)) : ''}${sub('margin-top:12px')}</div><div style="position:absolute;left:50%;top:${has.rows ? 520 : 680}px;transform:translate(-50%,-50%)">${pill(label, 'height:84px;font-size:34px;padding:0 44px')}</div>${has.rows ? `<div class="surf" style="left:60px;top:620px;width:600px;height:400px;padding:16px 24px;font-size:22px">${rowsHtml(rowLines).replace('class="card"', 'class="card" style="border:0;padding:0;background:transparent"')}</div>` : (lines[0] ? `<div class="kicker" style="position:absolute;left:0;right:0;top:790px;text-align:center;color:var(--ink)">${e(lines[0])}</div>` : '')}`;
        break;
      }
      case 'type-left':
      case 'type-centred':
      default: {
        const centred = s.kind !== 'type-left';
        html = `${pool(-80, 300, 880, 760, c.primary, op(0.35, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;${L};top:50%;transform:translateY(-50%);${centred ? 'text-align:center' : ''}">${kicker('margin-bottom:22px')}${head(headSize(copy.headline, 104))}${sub('margin-top:22px')}<div class="rule" id="sigrule0" style="width:160px;margin:30px ${centred ? 'auto' : '0'} 0"></div></div>`;
      }
    }
    return { html, has };
  }
  switch (s.kind) {
    case 'type-left':
      html = `${pool(760, 180, 640, 540, c.primary, op(0.4, 0.16))}${mark}<div id="sigheadwrap" style="position:absolute;left:90px;top:50%;width:900px;transform:translateY(-50%)">${kicker('margin-bottom:22px')}${head(headSize(copy.headline, 96))}${sub('margin-top:22px;max-width:760px')}<div class="rule" id="sigrule0" style="width:220px;margin-top:30px"></div></div>`;
      break;
    case 'hero-number': {
      const numRaw = ctx.number || (copy.headline || '');
      const isNumber = Boolean(ctx.number);
      has.num = isNumber;
      const boxes = lines.filter((l) => !(isNumber && String(l).replace(/[^\d]/g, '') === String(ctx.digits ?? ''))).map((l, i) => `<div class="box surf" style="left:${px(i % 2 ? 72 : 6, 1280)}px;top:${px(30 + Math.floor(i / 2) * 36, 720)}px;width:${px(22, 1280)}px;height:${px(12, 720)}px">${e(l)}</div>`).join('');
      html = `${pool(240, 60, 800, 600, c.primary, op(0.4, 0.16))}${mark}<div id="sigheadwrap" style="position:absolute;left:140px;right:140px;top:50%;transform:translateY(-50%);text-align:center">${kicker('margin-bottom:18px')}${isNumber ? `<div class="stat" id="signum" style="font-size:${numRaw.length <= 7 ? 200 : numRaw.length <= 14 ? 130 : 96}px;color:var(--accent)">${ctx.numberHtml}</div>${head(44, 'margin-top:22px')}` : head(headSize(copy.headline))}${sub('margin-top:20px')}</div>${boxes}`;
      break;
    }
    case 'product-window': {
      has.win = true;
      const own = lines.filter((l) => String(l).trim().toLowerCase() !== String(copy.headline || '').trim().toLowerCase());
      // the product's own lines, else its own names; never an invented status beside them (D-73: no fixture words)
      const rowLines = own.length >= 1 ? own : (ctx.brand.product_words?.entities || []).slice(0, 3);
      has.rows = rowLines.length > 0;
      html = `${pool(700, -100, 800, 700, c.primary, op(0.4, 0.14))}<div class="surf win" id="sigwin" style="left:102px;top:86px;width:1075px;height:547px"><div class="bar"><i></i><i></i><i></i><span style="margin-left:10px">${e(ctx.host)}</span></div><div class="main"><div id="sigheadwrap" style="margin-bottom:18px">${kicker('font-size:15px;margin-bottom:10px')}${head(rowLines.length >= 2 ? 40 : 52)}${sub('font-size:22px;margin-top:8px')}</div>${has.rows ? rowsHtml(rowLines) : `<div class="card"><div style="font-size:24px;color:var(--muted)">${e(ctx.video.proof_moment || '')}</div></div>`}${s.pill || ctx.needPill ? `<div style="margin-top:18px">${pill(s.pill || pillLabel)}</div>` : ''}</div></div>`;
      break;
    }
    case 'split': {
      has.rows = lines.length > 0;
      html = `${pool(700, 70, 640, 580, c.primary, op(0.3, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;left:77px;top:50%;width:560px;transform:translateY(-50%)">${kicker('margin-bottom:18px')}${head(headSize(copy.headline, 80))}${sub('margin-top:18px')}</div><div class="surf" id="sigpanel" style="left:690px;top:100px;width:540px;height:520px;padding:30px">${has.rows ? rowsHtml(lines) : `<div style="font-size:24px;color:var(--muted)">${e(ctx.video.proof_moment || ctx.video.product)}</div>`}</div>`;
      break;
    }
    case 'stack-problem': {
      const pills = lines.map((l, i) => `<div class="problem" style="position:absolute;left:${px(72, 1280)}px;top:${px(50 + i * 14, 720)}px">${e(l)}</div>`).join('');
      html = `${mark}<div id="sigheadwrap" style="position:absolute;left:77px;top:86px;width:1120px">${kicker('margin-bottom:14px')}${head(headSize(copy.headline, 72))}${copy.sub ? `<div class="sub strike" id="sigsub" style="margin-top:14px">${e(copy.sub)}</div>` : ''}</div><div class="surf" style="left:154px;top:346px;width:589px;height:288px"></div><div class="surf" style="left:282px;top:403px;width:589px;height:288px;opacity:.8"></div><div class="surf" style="left:410px;top:461px;width:589px;height:288px;opacity:.6"></div>${pills}`;
      has.sub = Boolean(copy.sub);
      break;
    }
    case 'cards': {
      const items = lines.length >= 2 ? lines : (ctx.words.length >= 2 ? ctx.words : (ctx.brand.product_words?.features || []).slice(0, 3));
      const n = Math.max(2, Math.min(4, items.length || 3));
      const w = Math.floor((1126 - (n - 1) * 38) / n);
      has.cards = true;
      const cardBody = (t) => { const r = parseRow(t); return `<div class="display cct" style="font-size:${n >= 4 ? 28 : 34}px">${e(r.name)}</div>${r.tag ? `<div style="margin-top:16px"><span class="tag${/invited|pending|waiting/i.test(r.tag) ? ' warm' : ''}">${e(r.tag)}</span></div>` : ''}`; };
      html = `${pool(240, 300, 800, 500, c.primary, op(0.3, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;left:77px;top:${copy.kicker ? 120 : 100}px;width:1126px">${kicker('margin-bottom:14px')}${head(Math.min(64, headSize(copy.headline)))}</div>${Array.from({ length: n }, (_, i) => `<div class="cc" id="sigcc${i}" style="left:${77 + i * (w + 38)}px;top:302px;width:${w}px;height:288px"><div class="kicker" style="font-size:14px;margin-bottom:14px">0${i + 1}</div>${cardBody(items[i] || '')}</div>`).join('')}`;
      break;
    }
    case 'close-cta':
      html = `${pool(320, 70, 640, 500, c.primary, op(0.35, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;left:77px;top:160px;width:1126px;text-align:center">${kicker('margin-bottom:18px')}${head(headSize(copy.headline, 84))}</div><div style="position:absolute;left:50%;top:475px;transform:translate(-50%,-50%)">${pill(s.pill || ctx.video.cta || pillLabel)}</div>${copy.sub ? `<div class="sub" id="sigsub" style="position:absolute;left:0;right:0;top:596px;text-align:center">${e(copy.sub)}</div>` : ''}<div class="kicker" style="position:absolute;left:0;right:0;bottom:36px;text-align:center">${e(ctx.host)}</div>`;
      has.sub = Boolean(copy.sub);
      break;
    case 'pill-press': {
      const label = s.pill || ctx.words[0] || ctx.video.cta || copy.headline || 'Press';
      const rowLines = lines.length >= 2 ? lines : [];
      has.rows = rowLines.length > 0;
      html = `${pool(400, 160, 480, 420, c.primary, op(0.5, 0.18))}${mark}<div id="sigheadwrap" style="position:absolute;left:140px;right:140px;top:${has.rows ? 92 : 150}px;text-align:center">${kicker('margin-bottom:14px')}${copy.headline && copy.headline !== label ? head(has.rows ? 52 : headSize(copy.headline, 80)) : ''}${sub('margin-top:12px')}</div><div style="position:absolute;left:50%;top:${has.rows ? 318 : 380}px;transform:translate(-50%,-50%)">${pill(label, 'height:84px;font-size:34px;padding:0 44px')}</div>${has.rows ? `<div class="surf" style="left:390px;top:386px;width:500px;height:260px;padding:14px 22px;font-size:19px">${rowsHtml(rowLines).replace('class="card"', 'class="card" style="border:0;padding:0;background:transparent"')}</div>` : (lines[0] ? `<div class="kicker" style="position:absolute;left:0;right:0;top:470px;text-align:center;color:var(--ink)">${e(lines[0])}</div>` : '')}`;
      break;
    }
    case 'type-centred':
    default:
      html = `${pool(240, 60, 800, 600, c.primary, op(0.35, 0.14))}${mark}<div id="sigheadwrap" style="position:absolute;left:${V ? 48 : 110}px;right:${V ? 48 : 110}px;top:50%;transform:translateY(-50%);text-align:center">${kicker('margin-bottom:22px')}${head(headSize(copy.headline))}${sub('margin-top:22px')}<div class="rule" id="sigrule0" style="width:160px;margin:30px auto 0"></div></div>`;
  }
  return { html, has };
}

/**
 * The signature composition: the direction's signature moment as a 3 s loop,
 * the moment's layout with the signature move played over it.
 * @param {object} d the direction proposal (repaired)
 * @param {object} ctx { video, brand, fontCss, dw, gsapSrc, moment? }
 * @returns {{ html: string, moment: { index, name, kind } }}
 */
export function signatureHtml(d, ctx) {
  const c = sketchColours(d);
  const { video, brand, fontCss, dw, gsapSrc = './gsap.min.js' } = ctx;
  const sig = ctx.moment || signatureMoment(d);
  const m = sig.moment;
  const kind = SIGNATURE_KINDS[d.signature.kind] ? d.signature.kind : 'pill-press-morph';
  const words = (d.signature.words || []).map((w) => String(w)).filter(Boolean);
  const pw = brand.product_words || { nav: [], buttons: [], features: [], entities: [] };
  const host = (() => { try { return new URL(video.url).host.replace(/^www\./, ''); } catch { return String(video.url || ''); } })();
  const anim = d.text_animation || 'rise-mask';
  const V = /^(\d+)x(\d+)$/.test(String(video.format || '')) && Number(String(video.format).split('x')[1]) > Number(String(video.format).split('x')[0]);
  const [FW, FH] = V ? [720, 1280] : [1280, 720];

  // the number for a counter
  let number = null, numberHtml = '';
  if (kind === 'counter-climb') {
    const raw = String(d.signature.number || words[0] || '0');
    const digits = Number((raw.match(/[\d,.]+/) || ['0'])[0].replace(/,/g, '')) || 0;
    const at = raw.search(/\d/);
    const prefix = at > 0 ? raw.slice(0, at) : '';
    const suffix = raw.replace(/^[^\d]*[\d,.]+/, '');
    number = prefix + String(digits) + suffix;
    numberHtml = `${e(prefix)}<span id="sign">0</span>${e(suffix)}`;
    ctx = { ...ctx, digits };
  }
  const slot = kind === 'token-swap' ? (words.length >= 2 ? words : (pw.features.length >= 2 ? pw.features : ['one link', 'live list', 'roles'])).slice(0, 3) : null;
  const layout = layoutHtml(m, d, c, { video, brand, host, words, slot, number, numberHtml, digits: ctx.digits, needPill: kind === 'pill-press-morph' || kind === 'window-push-in', vertical: V });
  let body = layout.html;
  const has = layout.has;
  const scripts = [];

  // the layout arrives (0–0.7 s)
  scripts.push(`tl.fromTo("#stage .pool",{scale:0.86},{scale:1.06,duration:${LOOP_S},ease:"sine.inOut"},0);`);
  if (/class="surf/.test(body)) scripts.push(`tl.fromTo("#stage .surf",{y:30,opacity:0},{y:0,opacity:1,duration:0.5,ease:"power3.out",stagger:0.08},0.05);`);
  if (/id="sigmark"/.test(body)) scripts.push(`tl.fromTo("#sigmark",{y:-10,opacity:0},{y:0,opacity:1,duration:0.35,ease:"power3.out"},0.1);`);
  if (has.kicker) scripts.push(`tl.fromTo("#sigkicker",{y:12,opacity:0},{y:0,opacity:1,duration:0.35,ease:"power3.out"},0.12);`);
  if (has.head && kind !== 'type-slam' && kind !== 'line-draw-reveal') scripts.push(textEntrance(anim, '#sighead .w', 0.2, 0.05));
  if (has.sub) scripts.push(`tl.fromTo("#sigsub",{y:16,opacity:0},{y:0,opacity:1,duration:0.4,ease:"power3.out"},0.6);`);
  if (has.rows) scripts.push(`tl.fromTo("#stage .row",{x:-14,opacity:0},{x:0,opacity:1,duration:0.35,ease:"power3.out",stagger:0.07},0.45);`);
  if (/id="sigrule0"/.test(body)) scripts.push(`tl.fromTo("#sigrule0",{scaleX:0},{scaleX:1,duration:0.45,ease:"expo.out"},0.7);`);
  if (has.pill && kind !== 'pill-press-morph') scripts.push(`tl.fromTo("#sigpill",{scale:0.8,opacity:0},{scale:1,opacity:1,duration:0.4,ease:"back.out(1.6)"},0.55);`);
  if (has.num) scripts.push(`tl.fromTo("#signum",{scale:0.7,opacity:0},{scale:1,opacity:1,duration:0.5,ease:"power3.out"},0.3);`);

  // the signature move (0.8–2.7 s), on the layout's own anchors; what the layout lacks is added in the direction's words
  // where an added pill sits, by layout, so it never covers the layout's own parts
  const pillTop = V ? ({ cards: 1210, 'hero-number': 1180, split: 1210, 'stack-problem': 1220, 'product-window': 1210 }[m.sketch?.kind] || 1000) : ({ cards: 655, 'hero-number': 640, split: 650, 'stack-problem': 640, 'type-left': 620 }[m.sketch?.kind] || 560);
  // the move's final state: the last of its words when it has several ("Copy link", "Invited", "Joined" → Joined)
  const done = words.find((x) => /^(joined|done|sent|saved|copied|invited|added|published|shipped)$/i.test(x) && x !== (m.sketch?.pill || words[0])) || (words.length >= 2 ? words[words.length - 1] : 'Done');
  switch (kind) {
    case 'pill-press-morph': {
      if (!has.pill) body += `<div style="position:absolute;left:50%;top:${pillTop}px;transform:translate(-50%,-50%)"><div class="pill" id="sigpill" style="height:76px;font-size:30px;padding:0 40px"><span id="sigpilltext">${e(m.sketch?.pill || words[0] || video.cta || 'Continue')}</span></div></div>`;
      body += `<div id="sigring" style="position:absolute;left:0;top:0;width:120px;height:120px;border:3px solid var(--accent);border-radius:50%;margin:-60px 0 0 -60px;opacity:0;pointer-events:none"></div><div class="cursor" id="sigcursor" style="left:0;top:0">${CURSOR_SVG}</div>`;
      scripts.push(`tl.fromTo("#sigpill",{scale:0.6,opacity:0},{scale:1,opacity:1,duration:0.5,ease:"back.out(1.4)"},0.35);
const P=()=>{const r=document.getElementById("sigpill").getBoundingClientRect(),o=document.getElementById("root").getBoundingClientRect();return {x:r.left-o.left+r.width*0.56,y:r.top-o.top+r.height*0.62};};
tl.fromTo("#sigcursor",{x:()=>P().x+160,y:()=>P().y+170},{x:()=>P().x,y:()=>P().y,duration:0.7,ease:"power2.inOut"},0.8);
tl.to("#sigpill",{scale:0.92,duration:0.1,ease:"power2.in"},1.5);tl.to("#sigpill",{scale:1,duration:0.35,ease:"back.out(3)"},1.6);
tl.fromTo("#sigring",{x:()=>P().x,y:()=>P().y,scale:0.6,opacity:0.9},{x:()=>P().x,y:()=>P().y,scale:3.2,opacity:0,duration:0.8,ease:"power2.out",immediateRender:false},1.55);
tl.set("#sigpilltext",{textContent:${js('✓ ' + done)}},1.65);tl.fromTo("#sigpill",{backgroundColor:"${c.primary}"},{backgroundColor:"${c.accent}",duration:0.35,immediateRender:false},1.65);
tl.to("#sigcursor",{x:"+=40",y:"+=50",opacity:0,duration:0.5,ease:"power2.in"},2.2);`);
      break;
    }
    case 'counter-climb': {
      if (!has.num) {
        body += `<div style="position:absolute;left:0;right:0;top:${has.head ? 560 : 300}px;text-align:center"><div class="stat" id="signum" style="font-size:${number.length <= 7 ? 150 : 110}px;color:var(--accent)">${numberHtml}</div></div>`;
        scripts.push(`tl.fromTo("#signum",{scale:0.7,opacity:0},{y:0,scale:1,opacity:1,duration:0.5,ease:"power3.out"},0.5);`);
      }
      scripts.push(`const o={v:0};tl.to(o,{v:${ctx.digits},duration:1.7,ease:"power2.out",onUpdate(){document.getElementById("sign").textContent=Math.round(o.v).toLocaleString("en-US")}},0.9);
tl.fromTo("#signum",{scale:1},{scale:1.1,duration:1.7,ease:"power1.out",immediateRender:false},0.9);tl.to("#signum",{scale:1.04,duration:0.4,ease:"back.out(2)"},2.6);`);
      break;
    }
    case 'card-cascade': {
      if (!has.cards) {
        const items = (words.length >= 3 ? words : pw.features.length >= 3 ? pw.features : ['One link', 'Live list', 'Roles']).slice(0, 4);
        const n = items.length, w = Math.floor((1126 - (n - 1) * 30) / n), vh = Math.floor((620 - (n - 1) * 20) / n);
        body += items.map((t, i) => `<div class="cc" id="sigcc${i}" style="${V ? `left:48px;top:${600 + i * (vh + 20)}px;width:624px;height:${vh}px` : `left:${77 + i * (w + 30)}px;top:470px;width:${w}px;height:200px`};padding:20px 22px"><div class="kicker" style="font-size:13px;margin-bottom:10px">0${i + 1}</div><div class="display cct" style="font-size:${n >= 4 ? 26 : 30}px">${e(t)}</div></div>`).join('');
      }
      scripts.push(`tl.fromTo("#stage .cc",{y:120,opacity:0,rotate:2},{y:0,opacity:1,rotate:0,duration:0.55,ease:"expo.out",stagger:0.12},0.8);
tl.fromTo("#stage .cct",{yPercent:40,opacity:0},{yPercent:0,opacity:1,duration:0.4,ease:"power3.out",stagger:0.12},1.05);
tl.to("#stage .cc",{y:-8,duration:0.7,ease:"sine.inOut",stagger:0.1},2.0);tl.to("#stage .cc",{y:0,duration:0.4,ease:"sine.inOut",stagger:0.1},2.6);`);
      break;
    }
    case 'type-slam': {
      if (!has.head) body += `<div id="sigheadwrap" style="position:absolute;left:${V ? 48 : 110}px;right:${V ? 48 : 110}px;top:50%;transform:translateY(-50%);text-align:center"><div class="display" id="sighead" style="font-size:96px">${wordsHtml(words.join(' ') || video.claim, m.copy?.accent)}</div></div>`;
      scripts.push(`tl.fromTo("#sighead .w",{scale:2.2,opacity:0},{scale:1,opacity:1,duration:0.3,ease:"power4.out",stagger:0.22},0.5);
tl.fromTo("#sighead",{scale:1},{scale:1.04,duration:1.2,ease:"sine.inOut",immediateRender:false},1.8);`);
      break;
    }
    case 'window-push-in': {
      const target = has.win ? '#sigwin' : '#stage';
      if (!has.pill) body += `<div style="position:absolute;left:50%;top:${pillTop}px;transform:translate(-50%,-50%)"><div class="pill" id="sigpill"><span id="sigpilltext">${e(m.sketch?.pill || words[0] || pw.buttons[0] || video.cta || 'Continue')}</span></div></div>`;
      scripts.push(`const O=()=>{const r=document.getElementById("sigpill").getBoundingClientRect(),t=document.querySelector(${js(target)}).getBoundingClientRect();return ((r.left-t.left+r.width/2)/t.width*100).toFixed(1)+"% "+((r.top-t.top+r.height/2)/t.height*100).toFixed(1)+"%";};
tl.fromTo(${js(target)},{scale:1},{scale:1.22,transformOrigin:()=>O(),duration:1.6,ease:"power2.inOut",immediateRender:false},0.9);
tl.to("#sigpill",{scale:0.94,duration:0.08,ease:"power2.in"},1.9);tl.to("#sigpill",{scale:1,duration:0.3,ease:"back.out(3)"},1.98);
tl.set("#sigpilltext",{textContent:${js('✓ ' + done)}},2.0);tl.fromTo("#sigpill",{backgroundColor:"${c.primary}"},{backgroundColor:"${c.accent}",duration:0.3,immediateRender:false},2.0);
${has.rows ? `const lastRow=[...document.querySelectorAll("#sigrows .row")].pop();if(lastRow){tl.fromTo(lastRow,{scale:1},{scale:1.04,duration:0.18,ease:"power2.out",yoyo:true,repeat:1,immediateRender:false},2.15);}` : ''}`);
      break;
    }
    case 'line-draw-reveal': {
      if (!has.head) body += `<div id="sigheadwrap" style="position:absolute;left:${V ? 48 : 110}px;top:50%;width:${V ? 624 : 1060}px;transform:translateY(-50%)"><div class="display" id="sighead" style="font-size:${headSize(words[0] || video.claim)}px">${wordsHtml(words[0] || video.claim, m.copy?.accent)}</div></div>`;
      body = body.replace('<div class="display" id="sighead"', '<div class="rule" id="sigrule" style="width:100%;max-width:1060px;margin-bottom:26px"></div><div class="display" id="sighead"');
      body = body.replace(/(<div class="display" id="sighead"[^>]*>[\s\S]*?<\/div>)(?=\s*(?:<div class="sub"|<div class="rule" id="sigrule0"|<\/div>))/, '$1<div class="rule" id="sigrule2" style="width:100%;max-width:1060px;margin-top:26px;transform-origin:right center"></div>');
      scripts.push(`tl.fromTo("#sigrule",{scaleX:0},{scaleX:1,duration:0.7,ease:"expo.out"},0.35);
tl.fromTo("#sighead .w",{yPercent:110},{yPercent:0,duration:0.55,ease:"expo.out",stagger:0.07},0.65);
tl.fromTo("#sigrule2",{scaleX:0},{scaleX:1,duration:0.7,ease:"expo.out"},1.3);
tl.to("#sigrule",{scaleX:0,transformOrigin:"right center",duration:0.5,ease:"power3.in"},2.5);`);
      break;
    }
    case 'token-swap': {
      if (!/id="sigcol"/.test(body)) body += `<div id="sigheadwrap" style="position:absolute;left:${V ? 48 : 110}px;right:${V ? 48 : 110}px;top:50%;transform:translateY(-50%);text-align:center"><div class="display" id="sighead" style="font-size:84px">${wordsHtml(`${video.product} gives you ${slot[0]}`, slot[0], slot)}</div></div>`;
      const size = Number((body.match(/id="sighead" style="font-size:(\d+)px/) || [])[1] || 84);
      const step = Math.round(size * 1.04);
      const n = (body.match(/<span class="acc">/g) || []).length;
      scripts.push(`${Array.from({ length: Math.max(0, n - 1) }, (_, i) => `tl.to("#sigcol",{y:${-step * (i + 1)},duration:0.45,ease:"expo.out"},${(0.9 + i * 0.6).toFixed(2)});`).join('')}tl.to("#sigcol",{y:0,duration:0.45,ease:"expo.out"},${(0.9 + Math.max(0, n - 1) * 0.6 + 0.3).toFixed(2)});`);
      break;
    }
    case 'toast-stack':
    default: {
      const ents = pw.entities.length ? pw.entities : [];
      const rowNotes = (m.sketch?.lines || []).map(parseRow).filter((r) => r.tag).map((r) => `${r.name} · ${r.tag}`);
      const notes = (rowNotes.length >= 2 ? rowNotes : words.length >= 3 ? words.map((w, i) => (w.split(/\s+/).length <= 2 && ents[i % ents.length] ? `${ents[i % ents.length]} · ${w}` : w)) : ents.length ? ents.slice(0, 3) : [ctx.video?.product || copy.headline || ''].filter(Boolean)).filter(Boolean).slice(0, 3);
      body += notes.map((t, i) => `<div class="toast" id="sigtoast${i}" style="right:40px;bottom:40px"><b></b>${e(t)}</div>`).join('');
      scripts.push(`const H=70;[0,1,2].forEach(i=>{const at=0.8+i*0.6;tl.fromTo("#sigtoast"+i,{x:80,opacity:0},{x:0,opacity:1,duration:0.45,ease:"expo.out"},at);for(let j=0;j<i;j++)tl.to("#sigtoast"+j,{y:-(H*(i-j)),duration:0.4,ease:"power3.out"},at);});`);
    }
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=${FW}, height=${FH}"><title>signature moment · ${e(d.name)} · ${e(m.name)}</title>
<script src="${gsapSrc}"></script><style>${tokensCss(d, c, fontCss, dw, FW, FH)}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${LOOP_S}" data-width="${FW}" data-height="${FH}" data-fps="30"><section id="signature" class="clip" data-start="0" data-duration="${LOOP_S}"><div id="stage">${body}</div></section></div>
<script>gsap.config({nullTargetWarn:false});const tl = gsap.timeline({ paused: true });
${scripts.join('\n')}
window.__timelines = window.__timelines || {}; window.__timelines["main"] = tl;</script></body></html>`;
  return { html, moment: { index: sig.index, name: m.name, beat: m.beat, kind, layout: m.sketch?.kind || 'type-centred' } };
}

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '') };
};

/**
 * Build the signature render for one direction into <projectDir>/direction/frames/<letter>/.
 * Returns { dir, files: { signature, signature_mp4, lint }, report }; file paths are project-relative.
 * @param {object} opts { direction, video, brand, projectDir, letter, mode: 'hyperframes' | 'playwright', log }
 */
export async function buildFrames({ direction: d, video, brand, projectDir, outDir, letter, mode = 'hyperframes', log = () => {} }) {
  projectDir = projectDir || outDir;
  const dir = path.join(projectDir, 'direction', 'frames', letter);
  const sigDir = path.join(dir, 'signature');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(sigDir, { recursive: true });
  const { css: fontCss, files } = fontFaces(d, { copyTo: path.join(sigDir, 'fonts') });
  const dw = displayWeight(d.type.display, (openFonts().find((f) => f.family === d.type.display) || { weights: [] }).weights);
  fs.copyFileSync(GALLERY_LIB, path.join(sigDir, 'gsap.min.js'));
  fs.writeFileSync(path.join(sigDir, 'hyperframes.json'), JSON.stringify({ paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: false } }) + '\n');
  const sig = signatureHtml(d, { video, brand, fontCss, dw });
  fs.writeFileSync(path.join(sigDir, 'index.html'), sig.html);
  const rel = (f) => path.relative(projectDir, path.join(dir, f)).split(path.sep).join('/');
  const out = { dir, files: { signature: null, signature_mp4: null, lint: null }, report: { mode, moment: sig.moment, fonts: files, lint_errors: null, lint_warnings: null, seconds: 0 } };
  const t0 = Date.now();
  if (mode === 'hyperframes') {
    log(`frames ${letter}: lint`);
    const lint = run('npx', ['--no-install', HYPERFRAMES, 'lint', sigDir], SCAFFOLD);
    fs.writeFileSync(path.join(dir, 'lint.txt'), lint.out);
    out.files.lint = rel('lint.txt');
    const count = (o, word) => Number((o.match(new RegExp(`(\\d+) ${word}`)) || [])[1] ?? 0);
    out.report.lint_errors = count(lint.out, 'error');
    out.report.lint_warnings = count(lint.out, 'warning');
    log(`frames ${letter}: render the signature moment (${sig.moment.name})`);
    const r = run('npx', ['--no-install', HYPERFRAMES, 'render', sigDir, '-o', path.join(dir, 'signature.mp4'), '--fps', '30', '-w', '2', '--quiet'], SCAFFOLD);
    fs.writeFileSync(path.join(dir, 'render.txt'), r.out);
    if (fs.existsSync(path.join(dir, 'signature.mp4'))) {
      out.files.signature_mp4 = rel('signature.mp4');
      const still = run('ffmpeg', ['-v', 'error', '-y', '-ss', String(STILL_AT), '-i', path.join(dir, 'signature.mp4'), '-frames:v', '1', '-q:v', '2', path.join(dir, 'signature.jpg')]);
      if (still.code === 0) out.files.signature = rel('signature.jpg');
    }
  }
  if (mode === 'playwright' || !out.files.signature) {
    // the still by seeking the timeline in a headless browser (the default tests; or the fallback when a render failed)
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try {
      const vert = /^(\d+)x(\d+)$/.test(String(video.format || '')) && Number(String(video.format).split('x')[1]) > Number(String(video.format).split('x')[0]);
      const page = await browser.newPage({ viewport: vert ? { width: 720, height: 1280 } : { width: 1280, height: 720 } });
      await page.goto('file://' + path.join(sigDir, 'index.html'), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.__timelines && window.__timelines.main), null, { polling: 100, timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate((t) => { window.__timelines.main.seek(t, false); }, STILL_AT);
      await page.screenshot({ path: path.join(dir, 'signature.jpg'), type: 'jpeg', quality: 86 });
      out.files.signature = rel('signature.jpg');
    } finally { await browser.close(); }
  }
  out.report.seconds = Math.round((Date.now() - t0) / 100) / 10;
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}
