// sketch.mjs — the sketch storyboard of a direction, one cell per moment.
//
// The cell format: a 16:9 frame of plain shapes drawn in the real words and
// colours (solid boxes stand for panels and media, dashed boxes for rebuilt or
// placeholder parts, yellow arrows for motion and camera), a label row, and a
// caption with meaning, feeling, picture, objects, colours and order of arrival.
// Nothing here is a finished frame: the user judges placement, hierarchy and copy.

import { allocate, lengthRange } from './schema.mjs';

const e = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);

/** The palette roles a sketch uses, with sensible fallbacks. */
export function sketchColours(d) {
  const get = (...roles) => { for (const r of roles) { const p = d.palette.find((x) => x.role === r); if (p) return p.value; } return null; };
  const dark = d.canvas === 'dark';
  return {
    canvas: get('ground') || (dark ? '#0c0f1a' : '#f7f6f2'),
    ink: get('ink') || (dark ? '#f4f6fb' : '#1a1a1a'),
    muted: get('muted', 'ink-muted') || (dark ? '#8e96ad' : '#6d6a63'),
    accent: get('accent') || '#f2c200',
    primary: get('primary', 'button', 'cta') || get('accent') || '#4f46e5',
    surface: get('surface', 'card') || (dark ? '#161a2c' : '#ffffff'),
    line: get('line') || (dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)'),
    warm: get('warm', 'gold', 'secondary') || '#f5c542',
    red: '#ef4444',
  };
}

/** Mark the accent substring of a headline. */
function headlineHtml(copy) {
  const h = String(copy?.headline || '');
  const a = String(copy?.accent || '');
  if (a && h.includes(a)) return e(h.slice(0, h.indexOf(a))) + `<span class="c">${e(a)}</span>` + e(h.slice(h.indexOf(a) + a.length));
  return e(h);
}

// D-82: a vertical video's sketches are 9:16 cells, every kind stacked. The page or the storyboard sets the format first.
let VERTICAL = false;
export function setSketchFormat(format) { const [w, h] = String(format || '').split('x').map(Number); VERTICAL = h > w; return VERTICAL; }
export const sketchVertical = () => VERTICAL;

/** A kind's drawing for a 9:16 cell: the headline above, the product part below at the full width. */
function frameHtmlVertical(m, d, c) {
  const s = m.sketch || { kind: 'type-centred', lines: [] };
  const lines = (s.lines || []).filter(Boolean).slice(0, 4);
  const copy = m.copy || {};
  // the size fits the longest word in the cell's width (a long product name never runs off the side)
  const longest = Math.max(4, ...String(copy.headline || '').split(/\s+/).map((w) => w.length));
  const fit = (size) => Math.min(size, Math.floor((84 / (longest * 0.62)) * 10) / 10);
  const head = (top, size, extra = '') => `<div class="display" style="left:8%;top:${top}%;width:84%;font-size:${fit(size)}cqw;${extra}">${headlineHtml(copy)}</div>`;
  const kicker = copy.kicker ? `<div class="kicker" style="left:8%;top:6%;width:84%;white-space:normal;line-height:1.3;font-size:3.6cqw">${e(copy.kicker)}</div>` : '';
  const sub = (top, extra = '') => (copy.sub ? `<div class="kicker" style="left:8%;top:${top}%;width:84%;white-space:normal;text-transform:none;letter-spacing:0;font-size:4.6cqw;line-height:1.3;color:${c.muted};${extra}">${e(copy.sub)}</div>` : '');
  const pool = (left, top, w, h, colour, op = 0.45) => `<div class="pool" style="left:${left}%;top:${top}%;width:${w}%;height:${h}%;background:${colour};opacity:${op}"></div>`;
  const box = (top, h, text, extra = '') => `<div class="box" style="left:8%;top:${top}%;width:84%;height:${h}%;font-size:4.4cqw;${extra}">${e(text)}</div>`;
  const pill = (top, label) => `<div class="pill" style="left:50%;top:${top}%;transform:translate(-50%,-50%);font-size:6cqw;padding:4cqw 8cqw">${e(label)}</div>`;
  switch (s.kind) {
    case 'hero-number': {
      const num = d.signature?.number && m.beat === 'proof' ? d.signature.number : (copy.headline || '');
      return `${pool(0, 20, 100, 40, c.primary, 0.3)}${kicker}<div class="display" style="left:8%;top:24%;width:84%;font-size:20cqw;text-align:center;white-space:nowrap"><span class="g">${e(num)}</span></div>${sub(44, 'text-align:center')}${lines.map((l, i) => box(58 + i * 9, 7, l)).join('')}`;
    }
    case 'product-window':
      return `${kicker}${head(10, 9)}<div class="solid" style="left:6%;top:34%;width:88%;height:58%"></div><div style="left:6%;top:34%;width:88%;height:4%;border-bottom:1px solid ${c.line}"></div>${lines.slice(0, 4).map((l, i) => `<div class="box" style="left:11%;top:${42 + i * 11}%;width:78%;height:8%;font-size:4.2cqw">${e(l)}</div>`).join('')}`;
    case 'split':
      return `${pool(0, 40, 100, 55, c.primary, 0.25)}${kicker}${head(10, 10)}${sub(32)}${lines.map((l, i) => box(46 + i * 11, 8, l)).join('')}`;
    case 'stack-problem':
      return `${head(8, 9)}${copy.sub ? `<div class="kicker" style="left:8%;top:30%;width:84%;white-space:normal;text-transform:none;font-size:4.6cqw;text-decoration:line-through;color:${c.muted}">${e(copy.sub)}</div>` : ''}<div class="solid" style="left:8%;top:42%;width:64%;height:20%"></div><div class="solid" style="left:16%;top:48%;width:64%;height:20%;opacity:.8"></div><div class="solid" style="left:24%;top:54%;width:64%;height:20%;opacity:.6"></div>${lines.map((l, i) => box(80 + i * 6, 5, l, `border-color:${c.red};color:${c.red};width:60%`)).join('')}`;
    case 'cards': {
      const n = Math.max(2, Math.min(4, lines.length || 3));
      const h = Math.floor((56 - (n - 1) * 2) / n);
      return `${kicker}${head(copy.kicker ? 12 : 9, 9)}${Array.from({ length: n }, (_, i) => box(34 + i * (h + 2), h, lines[i] || '')).join('')}`;
    }
    case 'close-cta':
      return `${pool(0, 20, 100, 55, c.primary, 0.3)}${head(28, 11, 'text-align:center')}${pill(64, s.pill || 'CTA')}`;
    case 'pill-press':
      return `${pool(10, 30, 80, 40, c.primary, 0.5)}${kicker}${pill(46, s.pill || copy.headline || 'Press')}<div class="cursor" style="left:62%;top:52%"></div>${lines[0] ? `<div class="kicker" style="left:8%;top:62%;width:84%;text-align:center">${e(lines[0])}</div>` : ''}`;
    case 'type-left':
      return `${pool(20, 40, 90, 45, c.primary, 0.35)}${kicker}${head(28, 12)}${sub(60)}`;
    case 'type-centred':
    default:
      return `${pool(0, 25, 100, 50, c.primary, 0.35)}${kicker}${head(30, 12, 'text-align:center')}${sub(62, 'text-align:center')}`;
  }
}

/** The drawing inside one cell, by sketch kind. Inline styles, container units. */
export function frameHtml(m, d, c) {
  if (VERTICAL) return frameHtmlVertical(m, d, c);
  const s = m.sketch || { kind: 'type-centred', lines: [] };
  const lines = (s.lines || []).filter(Boolean).slice(0, 4);
  const kicker = m.copy?.kicker ? `<div class="kicker" style="left:50%;top:14%;transform:translateX(-50%)">${e(m.copy.kicker)}</div>` : '';
  const note = s.note ? `<div class="arrow" style="right:3%;top:5%;left:auto;max-width:46%;text-align:right">${e(s.note)}</div>` : '';
  const pool = (left, top, w, h, colour, op = 0.45) => `<div class="pool" style="left:${left}%;top:${top}%;width:${w}%;height:${h}%;background:${colour};opacity:${op}"></div>`;
  switch (s.kind) {
    case 'type-left':
      return `${pool(60, 25, 50, 65, c.primary, 0.35)}<div class="display" style="left:7%;top:20%;max-width:70%;font-size:8cqw">${headlineHtml(m.copy)}</div>${m.copy?.sub ? `<div class="kicker" style="left:7%;top:78%;color:${c.muted}">${e(m.copy.sub)}</div>` : ''}<div style="left:7%;top:88%;width:30%;height:1cqw;background:${c.accent}"></div>${note}`;
    case 'hero-number': {
      const num = d.signature?.number && m.beat === 'proof' ? d.signature.number : (m.copy?.headline || '');
      const boxes = lines.map((l, i) => `<div class="box" style="left:${i % 2 ? 72 : 6}%;top:${30 + Math.floor(i / 2) * 36}%;width:22%;height:12%">${e(l)}</div>`).join('');
      return `${kicker}<div class="display" style="left:50%;top:38%;transform:translateX(-50%);font-size:9cqw;white-space:nowrap"><span class="g">${e(num)}</span></div>${m.copy?.sub ? `<div class="kicker" style="left:50%;top:72%;transform:translateX(-50%);color:${c.ink}">${e(m.copy.sub)}</div>` : ''}${boxes}${lines.length ? `<div class="arrow" style="left:30%;top:34%">←</div><div class="arrow" style="left:66%;top:34%">→</div>` : ''}${note}`;
    }
    case 'product-window': {
      const side = lines.slice(1).map((l, i) => `<div class="box" style="left:66%;top:${18 + i * 20}%;width:23%;height:16%">${e(l)}</div>`).join('');
      return `<div class="solid" style="left:8%;top:12%;width:84%;height:76%"></div><div style="left:8%;top:12%;width:84%;height:6%;border-bottom:1px solid ${c.line}"></div><div class="box" style="left:11%;top:22%;width:${lines.length > 1 ? 52 : 78}%;height:58%">${e(lines[0] || m.copy?.headline || 'product window')}</div>${side}${s.pill ? `<div class="pill" style="left:11%;top:${lines.length > 1 ? 82 : 82}%;font-size:2.6cqw;padding:1.4cqw 3cqw">${e(s.pill)}</div>` : ''}${note}`;
    }
    case 'split': {
      const boxes = lines.map((l, i) => `<div class="box" style="left:58%;top:${20 + i * 17}%;width:34%;height:13%">${e(l)}</div>`).join('');
      return `${pool(55, 10, 50, 80, c.primary, 0.25)}<div class="display" style="left:6%;top:24%;width:44%;font-size:6.4cqw">${headlineHtml(m.copy)}</div>${m.copy?.sub ? `<div class="kicker" style="left:6%;top:70%;width:44%;color:${c.muted};text-transform:none;letter-spacing:0;font-size:2.6cqw">${e(m.copy.sub)}</div>` : ''}<div class="solid" style="left:54%;top:14%;width:42%;height:72%"></div>${boxes}${note}`;
    }
    case 'stack-problem': {
      const pills = lines.map((l, i) => `<div class="box" style="left:72%;top:${50 + i * 14}%;width:22%;height:10%;border-color:${c.red};color:${c.red}">${e(l)}</div>`).join('');
      const h = m.copy?.headline || '';
      const sub = m.copy?.sub ? `<br><span style="text-decoration:line-through;color:${c.muted}">${e(m.copy.sub)}</span>` : '';
      return `<div class="display" style="left:6%;top:12%;font-size:6cqw;max-width:88%">${e(h)}${sub}</div><div class="solid" style="left:12%;top:48%;width:46%;height:40%"></div><div class="solid" style="left:22%;top:56%;width:46%;height:40%;opacity:.8"></div><div class="solid" style="left:32%;top:64%;width:46%;height:40%;opacity:.6"></div>${pills}${note}`;
    }
    case 'cards': {
      const n = Math.max(2, Math.min(4, lines.length || 3));
      const w = Math.floor((88 - (n - 1) * 3) / n);
      const cards = Array.from({ length: n }, (_, i) => `<div class="box" style="left:${6 + i * (w + 3)}%;top:42%;width:${w}%;height:40%">${e(lines[i] || '')}</div>`).join('');
      return `${kicker}<div class="display" style="left:6%;top:${m.copy?.kicker ? 22 : 14}%;font-size:5.6cqw;max-width:88%">${headlineHtml(m.copy)}</div>${cards}${note}`;
    }
    case 'close-cta':
      return `${pool(25, 10, 50, 70, c.primary, 0.3)}<div class="display" style="left:50%;top:26%;transform:translateX(-50%);font-size:6.6cqw;text-align:center;width:88%">${headlineHtml(m.copy)}</div><div class="pill" style="left:50%;top:66%;transform:translate(-50%,-50%)">${e(s.pill || d.cta || 'Start')}</div>${m.copy?.sub ? `<div class="kicker" style="left:50%;top:84%;transform:translateX(-50%)">${e(m.copy.sub)}</div>` : ''}<div class="box" style="left:3%;top:3%;width:14%;height:12%">logo mark, small</div>${note}`;
    case 'pill-press':
      return `${pool(30, 20, 40, 60, c.primary, 0.5)}${kicker}<div class="pill" style="left:50%;top:46%;transform:translate(-50%,-50%)">${e(s.pill || m.copy?.headline || 'Press')}</div><div class="cursor" style="left:60%;top:58%"></div>${lines[0] ? `<div class="arrow" style="left:66%;top:40%">→ ${e(lines[0])}</div>` : ''}${lines[1] ? `<div class="kicker" style="left:50%;top:72%;transform:translateX(-50%);color:${c.ink}">${e(lines[1])}</div>` : ''}${note}`;
    case 'type-centred':
    default:
      return `${pool(30, 15, 40, 70, c.primary, 0.35)}${kicker}<div class="display" style="left:50%;top:${m.copy?.kicker ? 34 : 30}%;transform:translateX(-50%);font-size:7.6cqw;text-align:center;width:88%">${headlineHtml(m.copy)}</div>${m.copy?.sub ? `<div class="kicker" style="left:50%;top:76%;transform:translateX(-50%);color:${c.muted}">${e(m.copy.sub)}</div>` : ''}<div style="left:50%;top:88%;width:14%;height:0.8cqw;background:${c.accent};transform:translateX(-50%)"></div>${note}`;
  }
}

/** One cell: frame, label row, caption. */
export function cellHtml(m, i, d, c, slot) {
  const s = m.sketch || {};
  const order = (m.order && m.order.length ? m.order : [m.motion]).join(' → ');
  return `<div class="cell"><div class="frame" style="background:${c.canvas}">${frameHtml(m, d, c)}</div>
<div class="label"><span>${String(i + 1).padStart(2, '0')} · ${e(String(m.name).toUpperCase())}</span><span>${fmt(slot.start_s)}–${fmt(slot.start_s + slot.duration_s)} s · ${e(m.beat)}</span></div>
<div class="cap"><div><b>Meaning</b>${e(s.meaning || m.goal)}</div><div><b>Feeling</b>${e(s.feeling || '')}</div><div><b>Picture</b>${e(s.picture || m.motion)}</div><div><b>Objects</b>${e(s.objects || '')}</div><div><b>Colours</b>${e(s.colours || '')}</div><div><b>Order</b>${e(order)}</div></div></div>`;
}

/** The CSS the cells need; `fontCss` carries the @font-face lines for the direction's display face. */
export function sketchCss(d, c, fontCss = '') {
  const display = d.type?.display || 'Archivo Black';
  const mono = d.type?.mono || 'Geist Mono';
  return `${fontCss}
.sk{--bg:#f6f3ec;--card:#fffdf8;--ink:#1d1c1a;--muted:#6d6a63;--line:#d9d3c5;--accent:#f2c200}
.sk .grid{display:grid;grid-template-columns:repeat(${VERTICAL ? 5 : 3},1fr);gap:18px}@media(max-width:900px){.sk .grid{grid-template-columns:1fr}}
.sk .cell{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;color:var(--ink)}
.sk .frame{aspect-ratio:${VERTICAL ? '9/16' : '16/9'};position:relative;container-type:inline-size;overflow:hidden}
.sk .frame *{position:absolute}.sk .frame .display span{position:static;display:inline}
.sk .pool{border-radius:50%;filter:blur(3cqw)}
.sk .kicker{font:600 2.2cqw/1 "${mono}",ui-monospace,Menlo,monospace;letter-spacing:.18em;color:${c.muted};text-transform:uppercase;white-space:nowrap}
.sk .display{font:${/black|anton|bebas|dela|shrikhand/i.test(display) ? 400 : 800} 9cqw/1.02 "${display}","Arial Black",sans-serif;color:${c.ink};letter-spacing:-.02em}
.sk .display .c{color:${c.accent}}.sk .display .g{color:${c.warm}}
.sk .pill{border-radius:99cqw;background:${c.primary};color:#fff;font:600 3cqw/1 sans-serif;padding:2cqw 4cqw;white-space:nowrap}
.sk .box{border:1px dashed ${d.canvas === 'dark' ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.45)'};border-radius:1.5cqw;color:${d.canvas === 'dark' ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.7)'};font:2.4cqw/1.3 sans-serif;padding:1.5cqw;overflow:hidden}
.sk .solid{background:${c.surface};border:1px solid ${c.line};border-radius:1.5cqw}
.sk .arrow{color:#f2c200;font:700 3cqw/1.2 sans-serif;text-shadow:0 0 2px rgba(0,0,0,.4)}
.sk .cursor{width:3cqw;height:3cqw;border-left:2px solid ${c.ink};border-bottom:2px solid ${c.ink};transform:rotate(45deg) skew(-10deg,-10deg)}
.sk .label{display:flex;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--line);font:12px ui-monospace,Menlo,monospace;color:var(--muted)}
.sk .cap{padding:10px 12px 12px;font-size:12.5px;line-height:1.4}.sk .cap b{display:inline-block;min-width:66px;color:var(--muted);font-weight:600}.sk .cap div{margin:2px 0}
.sk .seam{padding:14px;font-size:12.5px}.sk .seam span{display:inline-block;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:3px 8px;margin:3px 4px 3px 0}
.sk .sw{display:inline-block;width:22px;height:22px;border-radius:5px;vertical-align:middle;margin-right:4px;border:1px solid var(--line)}`;
}

/** All cells of a direction plus the seams, tokens and how-to-read cells. */
export function cellsHtml(d, video, c) {
  const slots = allocate(d.moments, video.length_s, lengthRange(video));
  const cells = d.moments.map((m, i) => cellHtml(m, i, d, c, slots[i]));
  const seams = d.moments.slice(1).map((m, i) => `<span>${String(i + 1).padStart(2, '0')}→${String(i + 2).padStart(2, '0')} ${e(m.transition_in || 'crossfade')}</span>`).join('');
  const carries = d.moments.slice(0, -1).map((m, i) => `${String(i + 1).padStart(2, '0')}→${String(i + 2).padStart(2, '0')}: ${e(m.carry?.element || '')}`).join(' · ');
  const swatches = d.palette.slice(0, 6).map((p) => `<span class="sw" style="background:${e(p.value)}"></span>${e(p.role)} `).join('');
  cells.push(`<div class="cell seam"><b>Transitions</b><div>${seams}</div><div style="margin-top:10px"><b>What continues</b> ${carries}</div></div>`);
  cells.push(`<div class="cell seam"><b>Tokens</b><div style="margin-top:8px">${swatches}</div><div style="margin-top:8px">Display: ${e(d.type.display)} · Text: ${e(d.type.text)} · Labels: ${e(d.type.mono)}</div><div style="margin-top:8px"><b>Not in this video</b> ${e((d.banned || []).join(' · '))}</div></div>`);
  cells.push(`<div class="cell seam"><b>How to read this</b><div style="margin-top:8px">Each cell is the moment's key picture drawn with the real words and colours. Plain boxes stand for panels and media; dashed boxes are rebuilt or placeholder parts; yellow arrows note motion and camera. Nothing here is a finished frame: you are judging placement, hierarchy and copy, and the build dresses the layout without redrawing it.</div></div>`);
  return cells.join('\n');
}

/** A standalone sketch storyboard page for one direction. */
export function renderSketch(d, video, { letter = 'A', fontCss = '' } = {}) {
  setSketchFormat(video.format);
  const c = sketchColours(d);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sketch storyboard ${e(letter)} · ${e(video.product)}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f6f3ec;color:#1d1c1a;font:14px/1.45 -apple-system,system-ui,sans-serif;padding:28px}header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;flex-wrap:wrap;gap:8px}h1{font-size:22px;margin:0}.dek{color:#6d6a63}.tag{font-size:12px;color:#6d6a63;border:1px solid #d9d3c5;border-radius:99px;padding:3px 10px}
${sketchCss(d, c, fontCss)}</style></head><body class="sk">
<header><div><h1>${e(video.product)} — ${e(video.template)} video, sketch storyboard <span class="tag">direction ${e(letter)} · ${e(d.name)}</span></h1><div class="dek">${e(d.mood)} · ${e(d.idea)}</div></div><div class="tag">${e(video.format || '1920x1080')} · ${e(video.length_s)} s · ${d.moments.length} moments</div></header>
<div class="grid">
${cellsHtml(d, video, c)}
</div></body></html>`;
}
