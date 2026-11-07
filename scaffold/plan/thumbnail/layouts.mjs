// thumbnail/layouts.mjs — the video's thumbnail, drawn as one HTML page per layout and size. Nothing is hard-coded about
// the look: the colours and fonts come from the confirmed direction, and the background (its glow, grid, dots, grain,
// rules) from the direction's video style, or from the project's own kit ground when the direction has no gallery style.
// No play button is drawn: the player shows its own.
//   thumbLook(direction, { style, kitCss }) → the look;  thumbnailHtml({ layout, size, look, content }) → a page.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SIZES = [
  { id: 'wide', w: 1280, h: 720, label: '1280 × 720', use: 'YouTube and the site player' },
  { id: 'square', w: 1080, h: 1080, label: '1080 × 1080', use: 'Social posts' },
  { id: 'link', w: 1200, h: 630, label: '1200 × 630', use: 'Link previews' },
];

export const LAYOUTS = [
  { id: 'info', name: 'Informational', note: 'Logo, title, one line and the product window. Works as the opening frame.' },
  { id: 'headline', name: 'Big headline', note: 'The opening hook, large, with the logo.' },
  { id: 'product', name: 'Product and headline', note: 'The product screen, tilted, with a short headline.' },
  { id: 'versus', name: 'Problem → answer', note: 'The pain on one side, the answer on the other.' },
  { id: 'moment', name: 'A moment from the video', note: 'A frame from the finished video, with the logo.' },
];

const ALIAS = { 'ink-muted': 'muted', 'canvas-deep': 'deep', 'violet-glow': 'glow', bg: 'ground' };

/** The thumbnail's look from a direction (plan.direction or a proposal): palette roles, fonts, the video style's
 * atmosphere and shape. `style` is the gallery style.json when the direction names one; `kitCss` the project's
 * kit/tokens.css, read for its ground when there is no style. */
export function thumbLook(direction = {}, { style = null, kitCss = '' } = {}) {
  const pal = {};
  const raw = direction.palette || {};
  const pairs = Array.isArray(raw) ? raw.map((r) => [r.role, r.value]) : Object.entries(raw).map(([k, v]) => [k, v?.value ?? v]);
  for (const [k, v] of pairs) if (k && typeof v === 'string') pal[ALIAS[k] || k] = v;
  const dark = (direction.canvas || style?.canvas) === 'dark';
  const c = {
    ground: pal.ground || style?.palette?.bg || (dark ? '#0b0b0f' : '#f8f9fb'),
    ink: pal.ink || style?.palette?.ink || (dark ? '#f4f4f5' : '#0b0b0f'),
    muted: pal.muted || style?.palette?.muted || (dark ? '#9a9aa5' : '#5b6170'),
    surface: pal.surface || style?.palette?.surface || (dark ? '#16161b' : '#ffffff'),
    line: pal.line || style?.palette?.line || (dark ? 'rgba(255,255,255,.12)' : '#dfe2e8'),
  };
  c.accent = pal.accent || pal.primary || style?.palette?.accent || '#2f6df6';
  c.primary = pal.primary || c.accent;
  c.glow = pal.glow || c.accent;
  c.deep = pal.deep || (dark ? '#000000' : c.ink);
  // the background: the style's own atmosphere, else the kit's ground (soft pools and grain), else a plain ground
  let atmosphere = style?.atmosphere;
  if (!atmosphere && !kitCss) atmosphere = ['pools', 'grain:0.1']; // the brand style before the kit exists: the same soft ground
  if (!atmosphere) {
    atmosphere = [];
    if (/ground__pool/.test(kitCss)) atmosphere.push('pools');
    const g = kitCss.match(/\.ground__grain\{[^}]*opacity:\s*([\d.]+)/);
    if (g) atmosphere.push(`grain:${g[1]}`);
    if (/\.ground__grid\{(?![^}]*display:\s*none)/.test(kitCss)) atmosphere.push('grid:64');
  }
  const shape = { card: style?.shape?.radius_card ?? 18, shadow: style?.shape?.shadow !== 'none', hairline: style?.shape?.border === 'hairline' };
  const t = direction.type || {};
  const fam = (x) => (typeof x === 'string' ? x : x?.family) || '';
  const fonts = {
    display: fam(t.display) || style?.type?.display?.family || 'Inter',
    displayWeight: Number((typeof t.display === 'object' && t.display.weight) || style?.type?.display?.weight || 800) || 800,
    text: fam(t.text) || style?.type?.body?.family || 'Inter',
    mono: fam(t.mono) || style?.type?.mono?.family || 'JetBrains Mono',
  };
  return { dark, c, atmosphere, shape, fonts, styleId: direction.video_style || null };
}

/** @font-face rules for the look's families, from the gallery's font folder (files named <slug>-<weight>.woff2). */
export function fontFaces(look, fontsDir) {
  const seen = new Set(), out = [];
  for (const family of [look.fonts.display, look.fonts.text, look.fonts.mono]) {
    if (!family || seen.has(family)) continue;
    seen.add(family);
    const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let files = [];
    try { files = fs.readdirSync(path.join(fontsDir, slug)).filter((f) => f.endsWith('.woff2')); } catch {}
    for (const f of files) {
      const w = (f.match(/-(\d{3})\.woff2$/) || [])[1] || '400';
      out.push(`@font-face{font-family:"${family}";src:url("${pathToFileURL(path.join(fontsDir, slug, f)).href}") format("woff2");font-weight:${w};font-display:block}`);
    }
  }
  return out.join('\n');
}

/** A logo file as a data URL for an <img>; an SVG without a viewBox gets one from its width and height, so it scales. */
export function logoDataUrl(file) {
  const buf = fs.readFileSync(file);
  if (!/\.svg$/i.test(file)) return `data:image/${path.extname(file).slice(1).replace('jpg', 'jpeg')};base64,${buf.toString('base64')}`;
  let svg = buf.toString('utf8');
  const tag = svg.match(/<svg\b[^>]*>/)?.[0] || '';
  if (tag && !/viewBox=/i.test(tag)) {
    const w = parseFloat(tag.match(/\swidth="([\d.]+)/)?.[1]), h = parseFloat(tag.match(/\sheight="([\d.]+)/)?.[1]);
    if (w && h) svg = svg.replace(tag, tag.replace('<svg', `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet"`));
  } else if (tag && /\swidth="[\d.]*%"/.test(tag)) {
    // sized in percent: give it the viewBox's own size, so the image box hugs the mark
    const vb = (tag.match(/viewBox="([^"]+)"/i)?.[1] || '').split(/[\s,]+/).map(Number);
    if (vb.length === 4) svg = svg.replace(tag, tag.replace(/\swidth="[^"]*"/, ` width="${vb[2]}"`).replace(/\sheight="[^"]*"/, ` height="${vb[3]}"`));
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const e = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const hexA = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
/** A line with its accent words coloured: accent is a phrase inside the text. */
const keep = (s) => s.replace(/([^\s<>]+-[^\s<>]+)/g, '<span style="white-space:nowrap">$1</span>');
const accented = (text, accent, colour) => {
  const t = e(text);
  if (!accent) return keep(t);
  const a = e(accent), i = t.indexOf(a);
  return i < 0 ? keep(t) : `${keep(t.slice(0, i))}<span style="color:${colour}">${keep(a)}</span>${keep(t.slice(i + a.length))}`;
};

/** The background layers for the atmosphere tokens (glow, glow-center, corner-glow, pools, grid, grid-accent, dots,
 * grain, vignette, rules, registration, rings, scanlines, stripes-top). Unknown tokens are skipped. */
function atmosphereLayers(look, W, H, u) {
  const { c, dark } = look;
  const L = [];
  for (const tok of look.atmosphere || []) {
    const [name, arg] = String(tok).split(':');
    const v = Number(arg);
    if (name === 'pools') {
      L.push(`<div style="position:absolute;top:${-0.5 * H}px;right:${-0.18 * W}px;width:${0.75 * W}px;height:${0.75 * W}px;border-radius:50%;background:${hexA(c.accent, 0.16)};filter:blur(${90 * u}px)"></div>`);
      L.push(`<div style="position:absolute;bottom:${-0.55 * H}px;left:${-0.25 * W}px;width:${0.75 * W}px;height:${0.75 * W}px;border-radius:50%;background:${hexA(c.primary, 0.11)};filter:blur(${90 * u}px)"></div>`);
    } else if (name === 'glow' || name === 'corner-glow') {
      const a = (v || 0.4) * (dark ? 0.55 : 0.35);
      L.push(`<div style="position:absolute;inset:0;background:radial-gradient(60% 70% at 88% 8%,${hexA(c.glow, a)},transparent 70%),radial-gradient(50% 60% at 6% 100%,${hexA(c.primary, a * 0.7)},transparent 70%)"></div>`);
    } else if (name === 'glow-center') {
      L.push(`<div style="position:absolute;inset:0;background:radial-gradient(55% 60% at 50% 55%,${hexA(c.glow, (v || 0.22) * 1.4)},transparent 72%)"></div>`);
    } else if (name === 'grid' || name === 'grid-accent') {
      const step = Math.round((v || 64) * u), col = name === 'grid-accent' ? hexA(c.accent, 0.16) : dark ? 'rgba(255,255,255,.05)' : hexA(c.ink, 0.06);
      L.push(`<div style="position:absolute;inset:0;background-image:linear-gradient(${col} 1px,transparent 1px),linear-gradient(90deg,${col} 1px,transparent 1px);background-size:${step}px ${step}px;-webkit-mask-image:radial-gradient(90% 90% at 50% 50%,#000 40%,transparent 100%)"></div>`);
    } else if (name === 'dots') {
      const step = Math.round((v || 24) * u), col = dark ? 'rgba(255,255,255,.10)' : hexA(c.ink, 0.10);
      L.push(`<div style="position:absolute;inset:0;background-image:radial-gradient(${col} ${Math.max(1, 1.4 * u)}px,transparent ${Math.max(1.5, 1.8 * u)}px);background-size:${step}px ${step}px"></div>`);
    } else if (name === 'grain') {
      L.push(`<div style="position:absolute;inset:0;opacity:${v || 0.1};background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='240' height='240' filter='url(%23n)' opacity='0.55'/></svg>&quot;);background-size:240px 240px;mix-blend-mode:${dark ? 'screen' : 'multiply'}"></div>`);
    } else if (name === 'vignette') {
      L.push(`<div style="position:absolute;inset:0;background:radial-gradient(75% 75% at 50% 50%,transparent 55%,rgba(0,0,0,${v || 0.4}) 100%)"></div>`);
    } else if (name === 'rules') {
      L.push(`<div style="position:absolute;left:${40 * u}px;right:${40 * u}px;top:${28 * u}px;border-top:${Math.max(2, 3 * u)}px solid ${c.ink}"></div><div style="position:absolute;left:${40 * u}px;right:${40 * u}px;bottom:${28 * u}px;border-top:1px solid ${hexA(c.ink, 0.35)}"></div>`);
    } else if (name === 'registration') {
      const m = 22 * u, s = 14 * u;
      for (const [x, y] of [[m, m], [W - m - s, m], [m, H - m - s], [W - m - s, H - m - s]]) L.push(`<div style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:linear-gradient(${c.ink},${c.ink}) center/1px 100% no-repeat,linear-gradient(${c.ink},${c.ink}) center/100% 1px no-repeat;opacity:.45"></div>`);
    } else if (name === 'rings') {
      L.push(`<div style="position:absolute;inset:0;background:repeating-radial-gradient(circle at 85% 50%,transparent 0 ${38 * u}px,${hexA(c.ink, 0.07)} ${38 * u}px ${39.5 * u}px)"></div>`);
    } else if (name === 'scanlines') {
      L.push(`<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px ${3 * u}px)"></div>`);
    } else if (name === 'stripes-top') {
      L.push(`<div style="position:absolute;left:0;right:0;top:0;height:${14 * u}px;background:repeating-linear-gradient(90deg,${c.ink} 0 ${14 * u}px,transparent ${14 * u}px ${28 * u}px)"></div>`);
    }
  }
  return L.join('');
}

/** A product window: a browser bar and the screen, cropped to `crop` ({x,y,w,h} in the image's pixels, iw/ih its size). */
function windowHtml(look, screen, { w, h, u, tilt = '', domain = '' }) {
  const { c, shape } = look;
  const bar = screen.bar !== false;
  const barH = bar ? Math.round(30 * u) : 0;
  const cr = screen.crop || { x: 0, y: 0, w: screen.iw, h: screen.ih };
  if (!h) h = Math.round(w * cr.h / cr.w) + barH;
  const scale = Math.max(w / cr.w, (h - barH) / cr.h);
  const radius = Math.min(shape.card, 18) * u;
  const shadow = shape.shadow ? `0 ${30 * u}px ${80 * u}px ${look.dark ? 'rgba(0,0,0,.55)' : hexA(c.ink, 0.16)}` : 'none';
  const border = `${shape.hairline ? 1 : Math.max(1, 1.5 * u)}px solid ${c.line}`;
  const dots = ['#ff5f57', '#febc2e', '#28c840'].map((d) => `<i style="width:${9 * u}px;height:${9 * u}px;border-radius:50%;background:${d};display:inline-block"></i>`).join('');
  return `<div style="width:${w}px;height:${h}px;border-radius:${radius}px;overflow:hidden;background:${c.surface};border:${border};box-shadow:${shadow};transform:${tilt};display:flex;flex-direction:column">
${bar ? `<div style="height:${barH}px;flex:none;display:flex;align-items:center;gap:${6 * u}px;padding:0 ${12 * u}px;border-bottom:1px solid ${c.line};background:${c.surface}">${dots}${domain ? `<span style="margin-left:${10 * u}px;font:500 ${11 * u}px/1 '${look.fonts.text}';color:${c.muted};background:${look.dark ? 'rgba(255,255,255,.06)' : hexA(c.ink, 0.05)};padding:${5 * u}px ${12 * u}px;border-radius:999px">${e(domain)}</span>` : ''}</div>` : ''}
<div style="flex:1;background-image:url('${screen.src}');background-repeat:no-repeat;background-size:${screen.iw * scale}px ${screen.ih * scale}px;background-position:${-cr.x * scale}px ${-cr.y * scale}px"></div></div>`;
}

const winH = (screen, w, u) => { const cr = screen.crop || { w: screen.iw, h: screen.ih }; return Math.round(w * cr.h / cr.w) + (screen.bar === false ? 0 : Math.round(30 * u)); };
// align-self keeps the logo at its own width: inside a flex column it would otherwise stretch to the column and squash
const logoImg = (content, hPx, extra = '') => content.logo ? `<img src="${content.logo}" alt="" style="height:${hPx}px;width:auto;max-width:100%;align-self:flex-start;object-fit:contain;object-position:left center;display:block;${extra}">` : `<b>${e(content.product)}</b>`;

/** One thumbnail page. content: { product, domain, logo, title, line, meta, hook:{text,accent}, headline:{text,accent},
 * pain, answer:{text,accent}, screen:{src,iw,ih,crop}, frame } (file:// urls). */
export function thumbnailHtml({ layout, size, look, content, faces = '' }) {
  const { w: W, h: H } = size;
  const sq = W / H < 1.3;
  // 9:16 (a Shorts or Reels cover) reads on a phone: larger type than the square
  const u = sq ? W / 1080 * (H / W > 1.3 ? 1.4 : 1.12) : Math.min(W / 1280, H / 720);
  const { c, fonts } = look;
  const disp = (px, extra = '') => `font-family:'${fonts.display}',system-ui,sans-serif;font-weight:${fonts.displayWeight};font-size:${px}px;line-height:1.04;letter-spacing:-0.02em;color:${c.ink};margin:0;${extra}`;
  const text = (px, extra = '') => `font-family:'${fonts.text}',system-ui,sans-serif;font-weight:400;font-size:${px}px;line-height:1.35;color:${c.muted};margin:0;${extra}`;
  const kicker = (px) => `font-family:'${fonts.mono}',ui-monospace,monospace;font-weight:500;font-size:${px}px;letter-spacing:.16em;text-transform:uppercase;color:${c.muted}`;
  const pad = (sq ? 72 : 64) * u;
  let body = '';

  if (layout === 'info') {
    const ww = sq ? W * 0.9 : W * 0.6, wh = winH(content.screen, ww, u), top = sq ? H * 0.5 : (H - wh) / 2;
    body = sq
      ? `<div style="position:absolute;left:${pad}px;top:${pad}px;right:${pad}px;display:flex;flex-direction:column;gap:${18 * u}px">${logoImg(content, 34 * u)}
<h1 style="${disp(64 * u)}">${accented(content.title, content.titleAccent, c.accent)}</h1><p style="${text(24 * u)}">${e(content.line)}</p><span style="${kicker(14 * u)}">${e(content.meta)}</span></div>
<div style="position:absolute;left:${pad}px;top:${top}px">${windowHtml(look, content.screen, { w: ww, h: wh, u, domain: content.domain })}</div>`
      : `<div style="position:absolute;left:${pad}px;top:0;bottom:0;width:${W * 0.42}px;display:flex;flex-direction:column;justify-content:center;gap:${20 * u}px">${logoImg(content, 30 * u)}
<h1 style="${disp(58 * u)}">${accented(content.title, content.titleAccent, c.accent)}</h1><p style="${text(22 * u)}">${e(content.line)}</p><span style="${kicker(13 * u)}">${e(content.meta)}</span></div>
<div style="position:absolute;left:${W * 0.52}px;top:${top}px">${windowHtml(look, content.screen, { w: ww, h: wh, u, domain: content.domain })}</div>`;
  } else if (layout === 'headline') {
    const px = (sq ? 104 : 92) * u;
    body = `<div style="position:absolute;left:${pad}px;right:${pad}px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:${28 * u}px">
<span style="${kicker(15 * u)}">${e(content.kicker || content.meta)}</span><h1 style="${disp(px, 'max-width:13em')}">${accented(content.hook.text, content.hook.accent, c.accent)}</h1></div>
<div style="position:absolute;left:${pad}px;bottom:${pad * 0.8}px">${logoImg(content, 30 * u)}</div>`;
  } else if (layout === 'product') {
    const ww = sq ? W * 0.95 : W * 0.66, wh = winH(content.screen, ww, u);
    body = `<div style="position:absolute;left:${sq ? -W * 0.02 : W * 0.4}px;top:${sq ? H * 0.42 : H * 0.17}px;perspective:${1800 * u}px">${windowHtml(look, content.screen, { w: ww, h: wh, u, domain: content.domain, tilt: `rotateY(${sq ? -8 : -16}deg) rotateX(6deg) rotateZ(-2deg)` })}</div>
<div style="position:absolute;left:${pad}px;top:${sq ? pad : 0}px;${sq ? `right:${pad}px` : `bottom:0;width:${W * 0.38}px`};display:flex;flex-direction:column;justify-content:center;gap:${22 * u}px">${logoImg(content, 28 * u)}
<h1 style="${disp((sq ? 76 : 62) * u)}">${accented(content.headline.text, content.headline.accent, c.accent)}</h1></div>`;
  } else if (layout === 'versus') {
    const half = sq ? { w: W, h: H / 2 } : { w: W / 2, h: H };
    const onP = '#ffffff';
    body = `<div style="position:absolute;left:0;top:0;width:${half.w}px;height:${half.h}px;padding:${pad}px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:${18 * u}px">
<span style="${kicker(14 * u)}">The problem</span><h2 style="${disp((sq ? 62 : 50) * u, `color:${c.muted};font-weight:${Math.min(fonts.displayWeight, 700)}`)}">${e(content.pain)}</h2></div>
<div style="position:absolute;${sq ? `left:0;top:${H / 2}px` : `left:${W / 2}px;top:0`};width:${half.w}px;height:${half.h}px;padding:${pad}px;box-sizing:border-box;background:${c.primary};display:flex;flex-direction:column;justify-content:center;gap:${18 * u}px">
<span style="${kicker(14 * u)};color:${hexA('#ffffff', 0.75)}">With ${e(content.product)}</span><h2 style="${disp((sq ? 66 : 54) * u, `color:${onP}`)}">${e(content.answer.text)}</h2>
<div style="margin-top:${10 * u}px">${logoImg(content, 26 * u, 'filter:brightness(0) invert(1)')}</div></div>
<div style="position:absolute;${sq ? `left:${W / 2 - 34 * u}px;top:${H / 2 - 34 * u}px` : `left:${W / 2 - 34 * u}px;top:${H / 2 - 34 * u}px`};width:${68 * u}px;height:${68 * u}px;border-radius:50%;background:${c.surface};border:1px solid ${c.line};display:grid;place-items:center;font:700 ${30 * u}px/1 '${fonts.text}';color:${c.primary};box-shadow:0 ${8 * u}px ${24 * u}px rgba(0,0,0,.15)">${sq ? '↓' : '→'}</div>`;
  } else if (layout === 'moment') {
    const chip = `<div style="display:inline-flex;align-items:center;padding:${12 * u}px ${18 * u}px;border-radius:${12 * u}px;background:${c.surface};border:1px solid ${c.line};box-shadow:0 ${8 * u}px ${24 * u}px rgba(0,0,0,.12)">${logoImg(content, 24 * u)}</div>`;
    const tall = H / W > 1.3;
    body = tall && content.frameTall
      // 9:16 with a vertical version: its own frame, full bleed, the logo on a chip
      ? `<img src="${content.frameTall}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"><div style="position:absolute;left:${40 * u}px;bottom:${H * 0.22}px">${chip}</div>`
      : sq
      ? `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${pad}px;display:flex;flex-direction:column;gap:${16 * u}px">${logoImg(content, 30 * u)}<h1 style="${disp(58 * u)}">${accented(content.title, content.titleAccent, c.accent)}</h1></div>
<img src="${content.frame}" alt="" style="position:absolute;left:${pad * 0.5}px;right:${pad * 0.5}px;${tall ? `top:${H * 0.38}px` : `bottom:${pad}px`};width:${W - pad}px;border-radius:${14 * u}px;border:1px solid ${c.line};box-shadow:0 ${20 * u}px ${60 * u}px rgba(0,0,0,.15)">`
      : `<img src="${content.frame}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
<div style="position:absolute;left:${40 * u}px;bottom:${36 * u}px">${chip}</div>`;
  }

  const bare = layout === 'moment' && (!sq || (H / W > 1.3 && content.frameTall));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${faces}
html,body{margin:0;padding:0}body{width:${W}px;height:${H}px;overflow:hidden;position:relative;background:${c.ground}}
h1,h2{text-wrap:balance}</style></head><body>${bare ? '' : atmosphereLayers(look, W, H, u)}${body}</body></html>`;
}
