// Render a plan.json as the page a user reads: plain words, rendered fonts and colours, gallery previews.
// Usage: node plan/to-html.mjs <plan.json> [out.html] [--assets <dir>]
//   --assets  the project folder whose relative asset paths (images, fonts) the plan refers to
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const planPath = args.find((a) => !a.startsWith('--'));
if (!planPath) { console.error('usage: node plan/to-html.mjs <plan.json> [out.html] [--assets <dir>]'); process.exit(2); }
const assetsFlag = args.indexOf('--assets');
const assetsDir = assetsFlag >= 0 ? path.resolve(args[assetsFlag + 1]) : path.dirname(path.resolve(planPath));
const positional = args.filter((a, i) => !a.startsWith('--') && i !== assetsFlag + 1);
const outArg = positional[1];
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const out = path.resolve(outArg || path.join(path.dirname(planPath), 'plan.html'));
const outDir = path.dirname(out);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const rel = (abs) => path.relative(outDir, abs).split(path.sep).join('/');
const MG = path.join(ROOT, 'research/motion-craft/motion-gallery');
const VG = path.join(ROOT, 'research/motion-craft/video-style-gallery');
const SCAFFOLD = path.join(ROOT, 'scaffold');
const e = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nice = (s) => String(s ?? '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

// ---- plain words
const WORDS = {
  arc: { PAS: 'Problem, Agitation, Solution (P.A.S.)', AIDA: 'Attention, Interest, Desire, Action (A.I.D.A.)', BAB: 'Before, After, Bridge' },
  autonomy: { review: 'User reviewed', director: 'Auto (the skill self-reviews)' },
  close: { product: 'ends on the product', logo: 'ends on the logo', both: 'ends on the product, then the logo' },
  angle: { 'cold-open': 'Cold open: the product is already in use', 'result-first': 'Result first: the outcome before the how', 'big-claim': 'Big claim', contradiction: 'Contradiction: a common belief, flipped', pain: 'The pain, named', question: 'A question about the pain', 'direct-address': 'Speaks to the viewer directly', 'open-loop': 'An open question the video answers later', promise: 'A promise with its payoff', 'story-open': 'A person and a moment', reveal: 'Withhold, then reveal', 'social-proof': 'Social proof', fomo: 'Urgency' },
  route: { visual: 'what you see', spoken: 'what you hear', text: 'on-screen text', sound: 'sound', edit: 'the cut' },
  camera: { locked: 'fixed camera', drift: 'slow drift', push: 'slow push in', chase: 'camera follows the action', fluid: 'continuous camera travel', 'one-move': 'one camera move' },
  status: { planned: 'Planned', sketched: 'Sketched', built: 'Rendered', approved: 'Approved', fix: 'Needs a fix' },
  transition: { cut: 'hard cut', crossfade: 'crossfade', 'zoom-through': 'zoom through', match: 'match cut', 'slow-fade': 'slow fade', wipe: 'wipe' },
  register: { factual: 'factual', balanced: 'balanced', bold: 'bold' },
  narration: { voice: 'narrated', 'music-only': 'music only, no narration', hybrid: 'narrated with music' },
  kind: { captured: 'captured', rebuilt: 'rebuilt in code', illustration: 'illustration' },
};
const w = (table, v) => WORDS[table]?.[v] || nice(v);
const TECH_BAN = /y ?= ?\d|t ?= ?0|px\b|cqw|frame ?0|z-index|opacity/i;

const v = plan.video || {}, d = plan.direction || {}, scenes = plan.scenes || [];
const total = scenes.reduce((s, x) => s + (x.duration_s || 0), 0);
const fmtT = (s) => (Math.round(s * 10) / 10).toFixed(1);

// ---- fonts: load from the project's asset paths when present
const fontFaces = [];
const fontFamily = (role) => {
  const t = d.type?.[role]; if (!t) return null;
  const fam = typeof t === 'string' ? t : t.family;
  const file = typeof t === 'object' && t.file ? path.join(assetsDir, t.file) : null;
  if (file && exists(file)) fontFaces.push(`@font-face{font-family:"${fam}";src:url("${rel(file)}") format("woff2");font-weight:${typeof t.weight === 'number' ? t.weight : (t.weight || '100 900')}}`);
  return fam;
};
const famDisplay = fontFamily('display'), famText = fontFamily('text'), famMono = fontFamily('mono');

// ---- direction block pieces
const paletteChips = d.palette ? Object.entries(d.palette).map(([k, val]) => {
  const col = typeof val === 'object' ? (val.value || val.hex || '') : String(val);
  const use = typeof val === 'object' ? (val.use || '') : '';
  return `<div class="sw" title="${e(use)}"><i style="background:${e(col)}"></i><div><b>${e(nice(k))}</b><span>${e(col)}</span>${use ? `<small>${e(use)}</small>` : ''}</div></div>`;
}).join('') : '';
const paletteGrid = paletteChips ? `<div class="swgrid">${paletteChips}</div>` : '';
const typeRows = ['display', 'text', 'mono'].map((role) => {
  const t = d.type?.[role]; if (!t) return '';
  const fam = typeof t === 'string' ? t : t.family;
  const sizes = typeof t === 'object' && t.sizes ? t.sizes.map((s) => `${s.use}: ${s.size}`).join(' · ') : '';
  const sample = role === 'display' ? 'Your product, in motion.' : role === 'mono' ? 'MADE WITH ULTRADEMO · 12 VIDEOS' : 'Launch videos made from your real product.';
  return `<div class="typerow"><div class="label">${e(nice(role))}</div><div><div class="sample" style="font-family:'${e(fam)}',system-ui;${role === 'display' ? 'font-size:34px;font-weight:700' : role === 'mono' ? 'font-size:14px;letter-spacing:.14em;text-transform:uppercase' : 'font-size:18px'}">${e(sample)}</div><div class="muted small meta">${e(fam)}${sizes ? ' · ' + e(sizes) : ''}</div></div></div>`;
}).join('');
const musicPath = (() => { const t = d.music?.track; if (!t) return null; const p = String(t).split(' (')[0].trim(); const abs = path.isAbsolute(p) ? p : (exists(path.join(SCAFFOLD, p)) ? path.join(SCAFFOLD, p) : path.join(assetsDir, p)); return exists(abs) ? abs : null; })();
const musicNote = d.music?.track ? (String(d.music.track).match(/\((.*)\)/)?.[1] || '') : '';
const musicBlock = d.music?.track ? `<div class="kv"><span>Music</span><div>${musicPath ? `<audio controls preload="none" src="${e(rel(musicPath))}"></audio>` : `<b>${e(String(d.music.track).split(' (')[0])}</b>`}<div class="muted small">${e([musicNote, d.music.bpm ? `${d.music.bpm} bpm` : '', d.music.switches_at?.length ? `changes at ${d.music.switches_at.join(', ')} s` : ''].filter(Boolean).join(' · '))}</div></div></div>` : '';
const voiceWords = (() => { const vv = d.voice || {}; if (!vv || vv.tier === 'none' || vv.none) return v.narration === 'music-only' ? 'None (music only)' : 'None'; const prov = vv.provider || vv.tier; const paid = /eleven|inworld|openai|azure/i.test(prov || '') ? `Paid (${nice(prov)})` : 'Free'; return `${vv.voice || vv.name || ''} ${paid}${vv.sample ? '' : ''}`.trim(); })();
const styleId = d.video_style; const stylePreview = styleId && exists(path.join(VG, styleId, 'preview.mp4')) ? `<div class="stylecard"><video src="${e(rel(path.join(VG, styleId, 'preview.mp4')))}" poster="${e(rel(path.join(VG, styleId, 'poster.jpg')))}" muted loop playsinline controls preload="metadata"></video><div class="small muted">Video style: ${e(nice(styleId))} · the same 10-second strip every style is shown on</div></div>` : (styleId ? `<b>${e(nice(styleId))}</b>` : '');
const dialsChips = d.dials ? Object.entries(d.dials).map(([k, val]) => `<span class="chip"><em>${e(nice(k))}</em>${e(nice(val))}</span>`).join('') : '';
const bans = (d.banned || []).filter((b) => !TECH_BAN.test(b));
const techBans = (d.banned || []).filter((b) => TECH_BAN.test(b));
const hookWords = d.hook ? `${w('angle', d.hook.angle)}; lands through ${w('route', d.hook.route)}${d.hook.secondary_route ? ` and ${w('route', d.hook.secondary_route)}` : ''}` : '';

// ---- claims: only real claims; sample values shown separately
const isSample = (c) => c.kind === 'sample' || /sample|usage level|viewer count|poll split/i.test(c.note || '');
const realClaims = (v.claims || []).filter((c) => !isSample(c));
const samples = (v.claims || []).filter(isSample);
const claimRows = realClaims.map((c) => `<li>${e(c.text)}${c.cite ? `<span class="muted small"> · ${e(c.cite)}</span>` : ''}</li>`).join('');

// ---- source assets grid
const srcCards = (v.sources || []).map((s) => {
  const p = s.path ? path.join(assetsDir, s.path) : null;
  const img = p && exists(p) && /\.(png|jpe?g|webp|gif)$/i.test(p) ? `<img src="${e(rel(p))}" alt="${e(s.what || s.id)}" loading="lazy">` : `<div class="noimg">${e(nice(s.kind))}</div>`;
  return `<figure>${img}<figcaption><b>${e(nice(s.id))}</b><span class="muted small">${e(nice(s.kind))}${s.what ? ' · ' + e(s.what) : ''}</span></figcaption></figure>`;
}).join('');

// ---- per-scene helpers
const motionStyleCard = (id) => {
  const dir = exists(path.join(MG, id)) ? path.join(MG, id) : (exists(path.join(MG, 'lib-' + id)) ? path.join(MG, 'lib-' + id) : null);
  if (!dir) return `<span class="chip">${e(nice(id))}</span>`;
  return `<figure class="ms"><video src="${e(rel(path.join(dir, 'preview.mp4')))}" poster="${e(rel(path.join(dir, 'poster.jpg')))}" muted loop playsinline preload="none" onmouseenter="this.play()" onmouseleave="this.pause()"></video><figcaption>${e(nice(id))}</figcaption></figure>`;
};
const visualRow = (x) => `<li><b>${e(nice(x.ref))}</b> <span class="kind ${e(x.kind)}">${e(w('kind', x.kind))}</span>${x.note ? ` <span class="muted small">${e(x.note)}</span>` : ''}</li>`;
const motionLine = (m) => typeof m === 'string' ? m : `${m.from_s ?? ''}–${m.to_s ?? ''} s: ${m.what ?? m.text ?? ''}`;
const splitMotion = (line) => { const mm = String(line).match(/^\s*([\d.]+)\s*[–-]\s*([\d.]+)\s*s?:\s*(.*)$/); return mm ? { t: `${mm[1]}–${mm[2]} s`, text: mm[3] } : { t: '', text: line }; };

const sceneCards = scenes.map((s, i) => {
  const start = s.start_s || 0, end = start + (s.duration_s || 0);
  const pills = s.status ? `<span class="muted small">· Scene status</span> <span class="pill">${e(w('status', s.status))}</span>` : '';
  const copy = s.copy ? `<div class="copy" style="font-family:'${e(famDisplay || 'system-ui')}',system-ui"><div class="h">${e(s.copy.headline || '')}</div>${s.copy.sub ? `<div class="s" style="font-family:'${e(famText || 'system-ui')}',system-ui">${e(s.copy.sub)}</div>` : ''}</div>` : '';
  const fontLine = s.font ? Object.entries(typeof s.font === 'object' ? s.font : { type: s.font }).map(([role, use]) => `<span class="chip"><em>${e(nice(role))}</em>${e(use)}</span>`).join('') : '';
  const numbers = (s.numbers || []).map((n) => { const cid = n.claim || n.claim_id || n.cite || n.source || n.source_id; const cl = (v.claims || []).find((c) => c.id === cid); return `<li><b>${e(n.value)}</b>${cl ? `<span class="muted small"> · ${e(cl.text)}</span>` : ''}</li>`; }).join('');
  const motion = (s.motion || []).map((m) => { const { t, text } = splitMotion(motionLine(m)); return `<tr><td class="mono">${e(t)}</td><td>${e(text.replace(/\(→ [^)]*\)/g, '').trim())}</td></tr>`; }).join('');
  const reads = (s.reads || []).map((r) => `<tr><td class="mono">${e(r.from_s)}–${e(r.to_s)} s</td><td>${e(r.what)}</td></tr>`).join('');
  const sound = s.sound ? [s.sound.cue ? `cue: ${s.sound.cue}` : '', s.sound.sfx?.length ? `effects: ${s.sound.sfx.join(', ')}` : 'effects: none'].filter(Boolean).join(' · ') : '';
  const attrs = [
    s.layout ? ['Layout', e(s.layout)] : null,
    s.content?.length ? ['On screen, in order', `<ol>${s.content.map((c) => `<li>${e(c)}</li>`).join('')}</ol>`] : null,
    s.visuals?.length ? ['Visuals', `<ul class="plain">${s.visuals.map(visualRow).join('')}</ul>`] : null,
    numbers ? ['Numbers shown', `<ul class="plain">${numbers}</ul>`] : null,
    s.blueprint ? ['Shot blueprint', `<b>${e(nice(s.blueprint))}</b>${s.blueprint_note ? ` <span class="muted small">${e(s.blueprint_note)}</span>` : ''}`] : null,
    s.rules?.length ? ['Motion styles', `<div class="msrow">${s.rules.map(motionStyleCard).join('')}</div>`] : null,
    fontLine ? ['Typography', fontLine] : null,
    s.mood ? ['Mood', e(s.mood)] : null,
    s.camera ? ['Camera', e(w('camera', s.camera))] : null,
    sound ? ['Sound', e(sound)] : null,
    s.voice ? ['Narration line', e(s.voice)] : null,
    s.carry ? ['Continues into the next scene', e(`${s.carry.element}${s.carry.action ? ': ' + s.carry.action : ''}`)] : null,
    s.style_tags?.length ? ['Tags', s.style_tags.map((t) => `<span class="chip">${e(t)}</span>`).join('')] : null,
  ].filter(Boolean).map(([k, val]) => `<div class="kv"><span>${k}</span><div>${val}</div></div>`).join('');
  const hold = s.hold_s ? `<tr><td class="mono">${e(fmtT((s.duration_s || 0) - s.hold_s))}–${e(fmtT(s.duration_s || 0))} s</td><td class="muted">pause so the viewer can read (${e(s.hold_s)} s)</td></tr>` : '';
  const checks = (s.checks || []).map((c) => `<li>${e(c)}</li>`).join('');
  const review = s.review ? `<div class="kv"><span>Your verdict</span><div><b>${e(nice(s.review.verdict))}</b>${s.review.note ? ' · ' + e(s.review.note) : ''}</div></div>` : '';
  return `<details class="scene" id="${e(s.id)}"${i === 0 ? ' open' : ''}>
  <summary><div><span class="num">${String(i + 1).padStart(2, '0')}</span> <b>${e(s.name || nice(s.id))}</b> <span class="pill soft">${e(nice(s.beat))}</span>${s.role && s.role !== s.beat ? `<span class="pill soft">${e(nice(s.role))}</span>` : ''}</div>
  <div class="when"><span class="mono">${e(fmtT(start))}–${e(fmtT(end))} s</span> <span class="muted">(${e(s.duration_s)} s)</span> <span class="muted">· comes in with a ${e(w('transition', s.transition_in || 'cut'))}</span> ${pills}</div></summary>
  <p class="goal">${e(s.goal || '')}</p>
  ${copy}
  <div class="three">
    <div class="part"><h4>What's in the scene</h4><div class="attrs">${attrs}</div></div>
    <div class="part"><h4>Timed plan <span class="muted" style="text-transform:none;letter-spacing:0">(seconds within this scene)</span></h4><div class="tlwrap"><table class="tl">${motion}${hold}</table>${reads ? `<div><h5 style="margin-top:0">What the viewer takes in, and when</h5><table class="tl">${reads}</table></div>` : ''}</div></div>
    <div class="part"><h4>Self QA</h4>${checks ? `<ul>${checks}</ul>` : '<p class="muted">none listed</p>'}${review}</div>
  </div>
</details>`;
}).join('\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Video plan · ${e(v.product || '')}</title>
<style>
${fontFaces.join('\n')}
:root{--bg:#f6f3ec;--card:#fffdf8;--ink:#1d1c1a;--muted:#6d6a63;--line:#e3ded2;--accent:#f2c200;--good:#2f7a3d;--bad:#b23a2e;--mid:#9a6b00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#151513;--card:#1f1e1b;--ink:#ece8df;--muted:#a19d93;--line:#34322d;--good:#6cc27c;--bad:#ee7a6c;--mid:#e0b23c}}
:root[data-theme="dark"]{--bg:#151513;--card:#1f1e1b;--ink:#ece8df;--muted:#a19d93;--line:#34322d;--good:#6cc27c;--bad:#ee7a6c;--mid:#e0b23c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"Inter",system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 16px 80px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:32px 0 10px}h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}h5{margin:12px 0 4px;font-size:12.5px;color:var(--muted);font-weight:600}
.muted{color:var(--muted)}.small{font-size:12.5px}.mono{font:12.5px ui-monospace,Menlo,monospace;white-space:nowrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0}
.kv{display:grid;grid-template-columns:150px 1fr;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}.kv:last-child{border-bottom:0}.kv>span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em;padding-top:3px}.kv ol,.kv ul{margin:0;padding-left:18px}.kv ul.plain{list-style:none;padding:0}.kv ul.plain li{padding:2px 0}
.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 9px;margin:2px 4px 2px 0;font-size:12.5px;background:var(--bg)}.chip em{font-style:normal;color:var(--muted);margin-right:5px}
.kind{font-size:11.5px;border-radius:999px;padding:1px 7px;border:1px solid var(--line);margin-left:6px;color:var(--muted)}.kind.captured{border-color:var(--good)}.kind.rebuilt{border-color:var(--mid)}.kind.illustration{border-color:var(--bad)}
.pill{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin-left:6px}.pill.soft{background:var(--bg)}
.swgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.sw{display:flex;align-items:flex-start;gap:8px;padding:4px 2px;min-width:0}.sw i{width:26px;height:26px;border-radius:6px;border:1px solid var(--line);flex:none;margin-top:2px}.sw div{display:flex;flex-direction:column;line-height:1.25;min-width:0}.sw b{font-size:13px;font-weight:600}.sw span{font-size:11.5px;color:var(--muted)}.sw small{font-size:11px;color:var(--muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.typerow{display:grid;grid-template-columns:90px 1fr;gap:10px;align-items:start;padding:8px 0;border-bottom:1px solid var(--line)}.typerow:last-child{border-bottom:0}.typerow .label{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding-top:6px}.typerow .sample{line-height:1.15}.typerow .meta{margin-top:4px}
.stylecard video{width:100%;max-width:520px;border-radius:8px;border:1px solid var(--line);background:#000;display:block}
.srcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}.srcgrid figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}.srcgrid img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:#fff}.srcgrid .noimg{aspect-ratio:16/10;display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--bg)}.srcgrid figcaption{padding:6px 8px;font-size:12.5px}.srcgrid figcaption b{display:block}
ul.claims{margin:0;padding-left:20px}ul.claims li{margin:4px 0}
.scene{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:12px 0}.scene summary{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline;cursor:pointer;list-style:none;color:inherit;font-size:inherit}.scene summary::-webkit-details-marker{display:none}.scene summary>div:first-child::before{content:'▸ ';color:var(--muted)}.scene[open] summary>div:first-child::before{content:'▾ '}.scene summary:hover{color:var(--ink)}.tools{display:flex;gap:8px;margin:4px 0 8px}.tools button{font:inherit;font-size:12.5px;border:1px solid var(--line);background:var(--card);color:var(--muted);border-radius:999px;padding:3px 10px;cursor:pointer}.num{font:700 13px ui-monospace,Menlo,monospace;color:var(--muted)}.when{font-size:13.5px}
.goal{margin:8px 0 4px;font-size:15px}.copy{margin:6px 0 12px;padding:12px 14px;background:var(--bg);border-radius:8px}.copy .h{font-size:24px;font-weight:700;line-height:1.1}.copy .s{color:var(--muted);margin-top:4px}
.three{display:flex;flex-direction:column;gap:12px}.part{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 14px}.part ul{margin:0;padding-left:18px}.attrs{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}@media(max-width:900px){.attrs{grid-template-columns:1fr}}.attrs .kv{grid-template-columns:140px 1fr}.tlwrap{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}@media(max-width:900px){.tlwrap{grid-template-columns:1fr}}
table.tl{border-collapse:collapse;width:100%;font-size:13.5px}table.tl td{padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:top}table.tl td.mono{width:92px;color:var(--muted)}table.tl tr:last-child td{border-bottom:0}
.msrow{display:flex;flex-wrap:wrap;gap:8px}.ms{margin:0;width:150px}.ms video{width:150px;aspect-ratio:16/9;border-radius:6px;border:1px solid var(--line);background:#000;display:block}.ms figcaption{font-size:11.5px;margin-top:3px;color:var(--muted)}
nav{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 20px}nav a{font-size:12.5px;color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:2px 9px}nav a:hover{color:var(--ink)}
details{margin-top:8px}summary{cursor:pointer;color:var(--muted);font-size:13px}
</style></head><body><main>
<h1>Video plan · ${e(v.product || '')}</h1>
<div class="muted">${e(nice(v.template || ''))} video · ${e(v.length_s || total)} seconds · ${e(w('narration', v.narration))} · ${scenes.length} scenes</div>
<nav>${scenes.map((s, i) => `<a href="#${e(s.id)}">${String(i + 1).padStart(2, '0')} ${e(s.name || nice(s.id))}</a>`).join('')}</nav>

<h2>The brief</h2><div class="card">
${[['Product', `${e(v.product)}${v.url ? ` · <a href="${e(v.url)}">${e(v.url)}</a>` : ''}`], ['Who it is for', e(v.viewer)], ['The one claim', e(v.claim)], ['The pain it solves', e(v.pain_point)], ['The proof moment', e(v.proof_moment)], ['Call to action', e(v.cta)], ['Message', e(v.message)], ['Approach', e(w('arc', (v.arc || '').split(' ')[0]) + ((v.arc || '').includes(' ') ? ', ' + v.arc.split(' ').slice(1).join(' ') : ''))], ['Copy tone', e(w('register', v.copy?.register || 'balanced'))], ['Autonomy level', e(w('autonomy', v.autonomy || 'review'))], ['Reference video', v.reference ? e(v.reference) : '']]
  .filter(([, val]) => val).map(([k, val]) => `<div class="kv"><span>${k}</span><div>${val}</div></div>`).join('')}
</div>

<h2>Direction</h2><div class="card">
<div class="kv"><span>The look in a line</span><div><b>${e(d.mood || d.name || '')}</b>${d.name ? `<span class="muted small"> · named "${e(d.name)}"</span>` : ''} · ${e(d.canvas === 'dark' ? 'dark canvas' : 'light canvas')}</div></div>
${stylePreview ? `<div class="kv"><span>Video style</span><div>${stylePreview}</div></div>` : ''}
${d.energy ? `<div class="kv"><span>Energy and pace</span><div>${e(nice(d.energy))}${d.pace_band ? ` · ${e(typeof d.pace_band === 'object' ? Object.entries(d.pace_band).map(([k, x]) => `${nice(k)} ${Array.isArray(x) ? x.join('–') : x}`).join(', ') : d.pace_band)}` : ''}</div></div>` : ''}
${d.camera ? `<div class="kv"><span>Camera</span><div>${e(w('camera', d.camera))}</div></div>` : ''}
${d.signature_move ? `<div class="kv"><span>Signature move</span><div>${e(d.signature_move)}</div></div>` : ''}
${hookWords ? `<div class="kv"><span>Opening hook</span><div>${e(hookWords)}</div></div>` : ''}
${d.close ? `<div class="kv"><span>Closing shot</span><div>${e(w('close', d.close))}</div></div>` : ''}
${paletteGrid ? `<div class="kv"><span>Colours</span><div>${paletteGrid}</div></div>` : ''}
${typeRows ? `<div class="kv"><span>Typography</span><div>${typeRows}</div></div>` : ''}
${musicBlock}
<div class="kv"><span>Narration</span><div>${e(voiceWords)}</div></div>
${dialsChips ? `<div class="kv"><span>Direction settings</span><div>${dialsChips}</div></div>` : ''}
${bans.length ? `<div class="kv"><span>Not in this video</span><div><ul>${bans.map((b) => `<li>${e(b)}</li>`).join('')}</ul>${techBans.length ? `<details><summary>${techBans.length} technical rules the builders follow</summary><ul>${techBans.map((b) => `<li>${e(b)}</li>`).join('')}</ul></details>` : ''}</div></div>` : ''}
</div>

<h2>Claims the video makes (${realClaims.length})</h2><div class="card"><p class="muted small">Everything below will appear in the video. Please read them as the facts you stand behind.</p><ul class="claims">${claimRows}</ul>
${samples.length ? `<details><summary>${samples.length} sample values shown in the rebuilt product (not claims)</summary><ul class="claims">${samples.map((c) => `<li>${e(c.text)}</li>`).join('')}</ul></details>` : ''}</div>

<h2>Source assets (${(v.sources || []).length})</h2><div class="srcgrid">${srcCards}</div>

<h2>Scenes</h2>
<div class="tools"><button onclick="document.querySelectorAll('.scene').forEach(d=>d.open=true)">Expand all</button><button onclick="document.querySelectorAll('.scene').forEach(d=>d.open=false)">Collapse all</button></div>
${sceneCards}
</main></body></html>`;
fs.writeFileSync(out, html);
console.log(out);
