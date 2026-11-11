// captions.mjs — captions for a narrated video: word timings, the caption files and the burned-in captions layer.
//   node --env-file-if-exists=.env plan/captions/captions.mjs <project>      (whole.mjs runs it before every full render)
//
// 1. Word timings (production/voice/words.json): every narration line's words with their start and end in the video.
//    With the user's ElevenLabs key, each line's audio is aligned to its script text (forced alignment: the script's own
//    words, timed from the audio; cached per line, paid once). Without a key the line's time is shared out by word length,
//    with a breath after punctuation: close enough for line captions, a little loose for word-by-word styles.
// 2. Caption files for every narrated video: out/captions.srt and out/captions.vtt (lines of up to 42 characters, at most
//    two per caption). Platforms show them as captions the viewer can switch on.
// 3. Burned-in captions when the brief chose a style (video.intake.caption_style, D-94): compositions/frames/captions.html,
//    a layer over the whole video drawn by the engine in styles.mjs, which assemble.mjs puts on top of the scenes.
// Example inputs (narration.json `inputs`: the sample data typed into the product, e.g. "Spring launch") are
// marked so every style shows them in its own colour.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { STYLES, styleById, styleCss, ENGINE_JS, CAPTION_CHOICES } from './styles.mjs';
import { openFonts } from '../production/craft.mjs';

const r3 = (n) => Math.round(n * 1000) / 1000;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}$%]+/gu, '');

/** The caption style the brief chose: 'none' or a style id. */
export function captionStyleOf(video) {
  const v = video?.intake?.caption_style;
  return CAPTION_CHOICES.includes(v) ? v : 'none';
}

/** Spread a line's time over its words by length, with a short breath after punctuation. */
export function estimateWords(text, start, secs) {
  const toks = String(text).split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const weight = (t) => t.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5 + (/[.!?]$/.test(t) ? 2.5 : /[,;:]$/.test(t) ? 1.2 : 0);
  const total = toks.reduce((a, t) => a + weight(t), 0);
  const span = Math.max(0.2, secs - 0.12);
  let at = start + 0.04;
  return toks.map((t) => {
    const d = (weight(t) / total) * span;
    const pause = /[.!?]$/.test(t) ? Math.min(0.35, d * 0.3) : /[,;:]$/.test(t) ? Math.min(0.18, d * 0.2) : 0;
    const w = { text: t, start: r3(at), end: r3(at + d - pause) };
    at += d;
    return w;
  });
}

/** Map aligned words (from the audio) onto the script's own tokens; null when they do not line up. */
export function mapAligned(text, aligned, offset) {
  const toks = String(text).split(/\s+/).filter(Boolean);
  const words = (aligned || []).filter((w) => norm(w.text));
  if (words.length !== toks.length) return null;
  return toks.map((t, i) => ({ text: t, start: r3(offset + words[i].start), end: r3(offset + words[i].end) }));
}

/** Mark the tokens of each example input (a phrase from the line's `inputs`) as lit. */
export function markInputs(words, inputs = []) {
  for (const phrase of inputs || []) {
    const p = String(phrase).split(/\s+/).map(norm).filter(Boolean);
    if (!p.length) continue;
    for (let i = 0; i + p.length <= words.length; i++) {
      if (p.every((x, k) => norm(words[i + k].text) === x)) for (let k = 0; k < p.length; k++) words[i + k].lit = true;
    }
  }
  return words;
}

async function alignLine(file, text, key) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)], { type: file.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' }), path.basename(file));
  form.append('text', text);
  const res = await fetch('https://api.elevenlabs.io/v1/forced-alignment', { method: 'POST', headers: { 'xi-api-key': key }, body: form });
  if (!res.ok) throw new Error(`forced alignment answered ${res.status}`);
  const j = await res.json();
  return (j.words || []).map((w) => ({ text: w.text, start: Number(w.start), end: Number(w.end) }));
}

/**
 * Every narrated word with its time in the video. voices.json comes from voiceover.mjs; narration.json carries `inputs`.
 * Returns { words, source: 'aligned' | 'estimated' | 'mixed' }.
 */
export async function wordTimings(projectDir, { key = process.env.ELEVENLABS_API_KEY, log = () => {} } = {}) {
  const voices = readJson(path.join(projectDir, 'production', 'voice', 'voices.json'), { lines: [] }).lines || [];
  const narration = readJson(path.join(projectDir, 'production', 'narration.json'), []);
  const cacheFile = path.join(projectDir, 'production', 'voice', 'alignment.json');
  const cache = readJson(cacheFile, {});
  const words = [];
  let aligned = 0, estimated = 0;
  for (const v of voices) {
    const text = v.text || '';
    const n = narration.find((l) => l.scene === v.scene && l.text === text) || {};
    let ws = null;
    const audio = v.path ? path.join(projectDir, v.path) : null;
    if (key && audio && fs.existsSync(audio)) {
      const id = crypto.createHash('sha1').update(`${text}\n${fs.statSync(audio).size}`).digest('hex').slice(0, 16);
      try {
        if (!cache[id]) { cache[id] = await alignLine(audio, text, key); log(`aligned ${v.id}`); }
        ws = mapAligned(text, cache[id], v.start_s);
      } catch (e) { log(`alignment for ${v.id} failed (${e.message}); estimated instead`); }
    }
    if (ws) aligned++; else { ws = estimateWords(text, v.start_s, v.secs); estimated++; }
    for (const w of markInputs(ws, n.inputs)) words.push({ ...w, line: v.id });
  }
  if (key) { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache) + '\n'); }
  return { words, source: aligned && estimated ? 'mixed' : aligned ? 'aligned' : 'estimated' };
}

/** a full stop that ends an abbreviation (p.m., e.g., U.S.) does not end a caption */
const ABBR = /^(?:\p{L}\.){2,}[,;:]?$/u;

/** Words into captions (the same grouping the engine uses). */
export function groupWords(words, g) {
  const out = []; let cur = [];
  const len = (ws) => ws.map((w) => w.text).join(' ').length;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; const next = [...cur, w];
    const full = g.mode === 'line' ? len(next) > g.max : next.length > g.max;
    if (cur.length && full) {
      // break at the last comma (after the first two words), so a clause stays together instead of leaving a stub
      let k = -1;
      for (let j = cur.length - 1; j >= 2; j--) if (/[,;:]$/.test(cur[j].text)) { k = j; break; }
      if (k >= 0 && k < cur.length - 1) { out.push(cur.slice(0, k + 1)); cur = [...cur.slice(k + 1), w]; } else { out.push(cur); cur = [w]; }
    } else cur = next;
    const brk = (/[.!?]$/.test(w.text) && !ABBR.test(w.text)) || (g.mode === 'chunk' && /,$/.test(w.text));
    const gap = words[i + 1] && words[i + 1].start - w.end > 0.45;
    if (brk || gap) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out.map((ws, i, a) => ({ ws, start: r3(ws[0].start - 0.08), end: r3(a[i + 1] ? Math.min(a[i + 1][0].start - 0.02, ws[ws.length - 1].end + 1.2) : ws[ws.length - 1].end + 1.2) }));
}

/** Split a caption's text into at most two lines of up to `max` characters, breaking at the space nearest the middle. */
export function twoLines(text, max = 42) {
  if (text.length <= max) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}

const stamp = (s, sep) => { const ms = Math.max(0, Math.round(s * 1000)); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, x = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`; };

/** The caption files: SRT and WebVTT, captions of up to two 42-character lines. */
export function captionFiles(words) {
  const gs = groupWords(words, { mode: 'line', max: 80 });
  const cues = gs.map((g, i) => ({ start: Math.max(0, g.start), end: gs[i + 1] ? Math.min(g.end, gs[i + 1].start - 0.001) : g.end, lines: twoLines(g.ws.map((w) => w.text).join(' ')) }));
  const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.lines.join('\n')}\n`).join('\n');
  const vtt = `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.lines.join('\n')}\n`).join('\n')}`;
  return { srt, vtt, cues };
}

/** The font a style uses here: its approved family when the font library has it, else its bundled stand-in. */
export function fontFor(style) {
  const lib = openFonts();
  const has = (f) => lib.find((x) => x.family === f);
  return has(style.font.family) ? style.font.family : style.font.fallback;
}

/** The font files the styles use (the faces each needs, resolved to the library), by file name: for the brief preview. */
export function previewFonts() {
  const lib = openFonts();
  const files = new Map();
  const faces = [];
  for (const s of STYLES) {
    const fam = fontFor(s);
    const l = lib.find((x) => x.family === fam);
    if (!l) continue;
    for (const f of l.faces) {
      if (!s.font.weights.includes(f.weight) || !(f.style === 'normal' || (s.font.italic && f.style === 'italic')) || !fs.existsSync(f.file)) continue;
      const name = path.basename(f.file);
      if (files.has(name)) continue;
      files.set(name, f.file);
      faces.push({ family: fam, weight: f.weight, style: f.style, name });
    }
  }
  return { files, faces };
}

/** @font-face rules for the preview, served at `${prefix}<file>`. */
export function previewFontCss(prefix = '/caption-fonts/') {
  return previewFonts().faces.map((f) => `@font-face{font-family:"${f.family}";src:url("${prefix}${f.name}") format("woff2");font-weight:${f.weight};font-style:${f.style};font-display:swap}`).join('\n');
}

function fontFaces(projectDir, family, weights, italic) {
  const lib = openFonts().find((x) => x.family === family);
  if (!lib) return '';
  const dir = path.join(projectDir, 'assets', 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  const faces = lib.faces.filter((f) => weights.includes(f.weight) && (f.style === 'normal' || (italic && f.style === 'italic')) && fs.existsSync(f.file));
  return faces.map((f) => {
    const name = `cap-${path.basename(f.file)}`;
    fs.copyFileSync(f.file, path.join(dir, name));
    return `@font-face{font-family:"${family}";src:url("assets/fonts/${name}") format("woff2");font-weight:${f.weight};font-style:${f.style};font-display:block}`;
  }).join('\n');
}

/** The burned-in captions layer: a frame the length of the video, drawn from the words at every time. */
export function captionsFrame({ projectDir, style: id, words, duration, width, height, accent }) {
  const s = styleById(id);
  const fam = fontFor(s);
  const faces = fontFaces(projectDir, fam, s.font.weights, s.font.italic);
  const css = styleCss(id, { family: () => fam, accent });
  const vertical = height > width;
  const data = JSON.stringify(words.map((w) => ({ text: w.text, start: w.start, end: w.end, ...(w.lit ? { lit: true } : {}) })));
  return `<template>
<style>
${faces}
${css}
</style>
<div id="root" data-composition-id="captions" data-width="${width}" data-height="${height}" data-duration="${r3(duration)}" style="position:absolute;inset:0;width:${width}px;height:${height}px;background:transparent">
 <div id="cap-root" class="s-${id}${vertical ? ' v' : ''}" data-decor="1"><div class="cap"></div></div>
</div>
<script>
${ENGINE_JS}
(function(){
  var WORDS = ${data};
  var STYLE = ${JSON.stringify({ id: s.id })};
  var GS = window.CAPTIONS.groups(WORDS, ${JSON.stringify(s.group)});
  var cap = document.querySelector('#cap-root .cap');
  var tl = gsap.timeline({ paused: true });
  function renderAt(t){ window.CAPTIONS.render(STYLE, cap, t, GS); }
  tl.to({ v: 0 }, { v: 1, duration: ${r3(duration)}, ease: 'none', onUpdate: function(){ renderAt(tl.time()); } }, 0);
  var render = tl.render.bind(tl);
  tl.render = function(a, b, c){ var r = render(a, b, c); renderAt(tl.time()); return r; };
  renderAt(0);
  window.__timelines['captions'] = tl;
})();
</script>
</template>
`;
}

/**
 * Build what the video needs: word timings, the caption files (narrated videos) and the captions layer (a style chosen).
 * A vertical version takes its words from the landscape video it is laid out from. Returns a summary.
 */
export async function buildCaptions(projectDir, plan, { log = () => {} } = {}) {
  const style = captionStyleOf(plan.video);
  const frameFile = path.join(projectDir, 'compositions', 'frames', 'captions.html');
  const verticalOf = plan.video.intake?.vertical_of ? path.dirname(projectDir) : null;
  const source = verticalOf || projectDir;
  const hasVoice = fs.existsSync(path.join(source, 'production', 'voice', 'voices.json'));
  if (!hasVoice) { fs.rmSync(frameFile, { force: true }); return { files: false, layer: false, reason: 'no narration' }; }
  const { words, source: timing } = await wordTimings(source, { log });
  fs.mkdirSync(path.join(projectDir, 'production', 'voice'), { recursive: true }); // a vertical version has no voice folder of its own
  fs.writeFileSync(path.join(projectDir, 'production', 'voice', 'words.json'), JSON.stringify(words, null, 1) + '\n');
  const outDir = path.join(projectDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const { srt, vtt, cues } = captionFiles(words);
  fs.writeFileSync(path.join(outDir, 'captions.srt'), srt);
  fs.writeFileSync(path.join(outDir, 'captions.vtt'), vtt);
  let layer = false;
  if (style !== 'none') {
    const [width, height] = String(plan.video.format || '1920x1080').split('x').map(Number);
    const duration = plan.scenes.reduce((a, s) => a + s.duration_s, 0);
    const pv = (e) => (typeof e === 'string' ? e : e?.value);
    const accent = pv(plan.direction?.palette?.accent) || pv(plan.direction?.palette?.primary) || '#45792a';
    fs.mkdirSync(path.dirname(frameFile), { recursive: true });
    fs.writeFileSync(frameFile, captionsFrame({ projectDir, style, words, duration, width, height, accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#45792a' }));
    layer = true;
  } else fs.rmSync(frameFile, { force: true });
  return { files: true, cues: cues.length, words: words.length, timing, style, layer };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectDir = path.resolve(process.argv[2] || '');
  const plan = readJson(path.join(projectDir, 'plan.json'), null);
  if (!plan) { console.error('usage: node --env-file-if-exists=.env plan/captions/captions.mjs <project>'); process.exit(1); }
  const r = await buildCaptions(projectDir, plan, { log: (m) => console.log(m) });
  if (!r.files) console.log(`captions: none (${r.reason})`);
  else console.log(`captions: ${r.cues} caption(s) from ${r.words} words (${r.timing} timings) in out/captions.srt and out/captions.vtt${r.layer ? `; burned in as ${styleById(r.style).name}` : '; none burned in'}`);
}

export { STYLES };
