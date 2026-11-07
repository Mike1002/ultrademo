// kit.mjs — the designer pass: one model call that builds the kit every frame
// builder reuses (D-44 step 3; the engine notes: twelve parallel builders drift,
// so one designer builds the parts first). Writes kit/tokens.css (palette by
// role, type roles with the fetched open fonts, spacing, radii, the ground
// treatment), kit/components.css + kit/components.html (the rebuilt parts,
// themed from the product) and kit/README.md (what exists, how to use it).

import { canvasOf, forCanvas } from './canvas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { callText, imageOf, stripFence } from './model.mjs';
import { FRAME_CONTRACT, styleDefinition } from './craft.mjs';

export const KIT_FILES = ['kit/tokens.css', 'kit/components.css', 'kit/components.html', 'kit/README.md'];

const paletteValue = (e) => (typeof e === 'string' ? e : e.value);
const paletteUse = (e) => (typeof e === 'string' ? '' : e.use || '');
const typeFamily = (r) => (typeof r === 'string' ? r : r.family);

/** The palette as plain lines: "role: #hex — use". */
export function paletteLines(direction) {
  return Object.entries(direction.palette).map(([role, e]) => `- ${role}: ${paletteValue(e)}${paletteUse(e) ? ` — ${paletteUse(e)}` : ''}`).join('\n');
}

/**
 * The font files in <project>/assets/fonts as "family weight style → path".
 * A file the plan's type roles name (direction.type.<role>.file) takes that
 * role's family and weight (a variable face keeps its "100 900" range);
 * otherwise the name pattern family-400.woff2 is read.
 */
export function fontFiles(projectDir, plan = null) {
  const dir = path.join(projectDir, 'assets', 'fonts');
  if (!fs.existsSync(dir)) return [];
  const named = new Map();
  for (const r of Object.values(plan?.direction?.type || {})) if (r && typeof r === 'object' && r.file) named.set(path.basename(r.file), { family: r.family, weight: r.weight !== undefined ? String(r.weight) : '400' });
  return fs.readdirSync(dir).filter((f) => /\.woff2?$/.test(f)).sort().map((f) => {
    if (named.has(f)) return { file: `assets/fonts/${f}`, family: named.get(f).family, weight: named.get(f).weight, style: 'normal' };
    const m = f.match(/^(.*?)-(\d{3})(i|italic)?\.woff2?$/);
    const family = m ? m[1].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : f;
    return { file: `assets/fonts/${f}`, family, weight: m ? m[2] : '400', style: m && m[3] ? 'italic' : 'normal' };
  });
}

/** The parts the plan's scenes name, so the designer builds exactly those. */
export function partsNamed(plan) {
  const lines = [];
  for (const s of plan.scenes) {
    const vis = s.visuals.map((v) => `${v.ref} (${v.kind}${v.focal ? ', focal' : ''})`).join(', ');
    lines.push(`- ${s.id} "${s.name}" (${s.beat}): layout "${s.layout}"; on screen in order: ${s.content.join(' · ')}; visuals: ${vis || 'none'}; copy: "${s.copy.headline}"${s.copy.sub ? ` / "${s.copy.sub}"` : ''}${s.copy.accent ? ` (accent "${s.copy.accent}")` : ''}; carry: ${s.carry ? `${s.carry.element} — ${s.carry.action}` : 'none'}`);
  }
  return lines.join('\n');
}

/** The sketch detail per moment from the direction record, when the project keeps it (lines, pill, objects, colours). */
export function sketchNotes(projectDir, plan) {
  const file = path.join(projectDir, 'direction', 'proposals.json');
  const chosenFile = path.join(projectDir, 'direction', 'chosen.json');
  if (!fs.existsSync(file) || !fs.existsSync(chosenFile)) return '';
  try {
    const P = JSON.parse(fs.readFileSync(file, 'utf8'));
    const chosen = JSON.parse(fs.readFileSync(chosenFile, 'utf8')).chosen ?? 0;
    const d = P.directions?.[chosen];
    if (!d) return '';
    return d.moments.map((m, i) => {
      const sk = m.sketch || {};
      const sc = plan.scenes[i];
      return `- ${sc ? sc.id : i + 1}: sketch ${sk.kind || ''}; objects: ${sk.objects || ''}; lines: ${(sk.lines || []).join(' | ') || 'none'}; pill: ${sk.pill || 'none'}; colours: ${sk.colours || ''}; note: ${sk.note || ''}`;
    }).join('\n');
  } catch { return ''; }
}

/** The product's own words from the brand read, when the project keeps it. */
export function productWords(projectDir) {
  const file = path.join(projectDir, 'direction', 'brand-read.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).product_words || null; } catch { return null; }
}

export function designerSystem() {
  return `You are the designer of one product video. You build the kit that every scene builder will reuse, so nothing drifts between scenes: the palette by role, the type roles in the fetched open fonts, spacing and radii, the ground treatment, and the rebuilt parts of the product (card, pill, button, counter, list row, device frame, panel, kicker, cursor) plus the product-specific parts the plan names. The scenes are HyperFrames compositions (HTML + GSAP, rendered frame by frame at 1920×1080); your CSS must obey that renderer.

Rules for the kit CSS:
- Literal hex colours in :root custom properties (--ground, --ink, --accent, …, one per palette role) and literal values everywhere a builder may tween a colour (GSAP cannot interpolate var()).
- @font-face for every font file listed, with the exact relative paths given, inside kit/tokens.css; font-family names exactly as the families are listed; a variable face listed with a weight range ("100 900") gets that range as its font-weight descriptor.
- Type roles as classes (.t-display, .t-text, .t-mono, .t-kicker, .t-label) with video-scale sizes: display 64–200 px, body 28–42 px, labels 18–24 px, borders 2–4 px, padding 60–140 px; letter-spacing and line-height per role.
- No CSS transition, no @keyframes, no transform on any part a builder may tween (parts are positioned by the scene with left/top; a part's own hover/press states do not exist in video).
- No position:fixed, no vh/vw units, no 100vw; sizes in px against the 1920×1080 canvas. will-change: transform on parts that will move (cards, pills, cursor).
- The ground treatment: a .ground class (full-bleed, the ground colour) and the pools/glow/grain classes the direction asks for, with literal rgba colours (never the transparent keyword in a gradient), opacity 12–25% for decorative layers.
- Components are classes prefixed k- (.k-card, .k-pill, .k-pill--accent, .k-button, .k-button--primary, .k-counter, .k-row, .k-device, .k-panel, .k-kicker, .k-cursor) plus the product-specific parts, each with the product's real labels and colours, looking like a produced video frame (3:1 size contrast, 2–4 px borders, soft shadows on dark, solid fills on light), never like a web page. Each part is self-contained: a builder copies its markup from kit/components.html and places it.
- The cursor is an inline SVG arrow (28×38) in .k-cursor with transform-origin at its tip; never a real cursor image.

Output exactly four files, each between its own markers and nothing else:
<<<FILE kit/tokens.css>>>
…
<<<END FILE>>>
<<<FILE kit/components.css>>>
…
<<<END FILE>>>
<<<FILE kit/components.html>>>
… one commented block per part: <!-- part: name — how to use, which wrapper to tween --> then the markup with the product's real words …
<<<END FILE>>>
<<<FILE kit/README.md>>>
… what exists, how to use it (class names, which element a builder tweens for each part, the type ramp, the palette roles and their hex values, the ground classes), in plain words; say video, never film …
<<<END FILE>>>`;
}

/** The designer prompt for a plan. Returns { system, prompt, images }. */
export function designerPrompt({ plan, projectDir, signatureHtml = '' }) {
  const { video, direction } = plan;
  const style = styleDefinition(direction.video_style);
  const fonts = fontFiles(projectDir, plan);
  const words = productWords(projectDir);
  const scoutFile = path.join(projectDir, 'scout', 'report.json');
  const scout = fs.existsSync(scoutFile) ? JSON.parse(fs.readFileSync(scoutFile, 'utf8')) : null;
  const images = [];
  for (const src of video.sources.filter((s) => /\.(jpe?g|png)$/i.test(s.path)).slice(0, 2)) {
    const f = path.join(projectDir, src.path);
    if (fs.existsSync(f)) images.push(imageOf(f, `Captured page "${src.id}": ${src.what}. Rebuild the product's parts from what you see here (its colours, radii, labels), themed to the direction's palette.`));
  }
  const type = Object.entries(direction.type).map(([role, r]) => `- ${role}: ${typeFamily(r)}${typeof r !== 'string' && r.weight ? ` ${r.weight}` : ''}${typeof r !== 'string' && r.sizes ? ` (${r.sizes.map((s) => `${s.use}: ${s.size}${s.tracking ? `, tracking ${s.tracking}` : ''}${s.line_height ? `, line-height ${s.line_height}` : ''}`).join('; ')})` : ''}`).join('\n');
  const prompt = `# The video
Product: ${video.product} (${video.url}). Template: ${video.template}. Viewer: ${video.viewer}. Claim: ${video.claim}. Pain point: ${video.pain_point}. Proof moment: ${video.proof_moment}. Call to action: ${video.cta}. Tone: ${video.copy.register}. Length ${video.length_s} s, ${video.format}, ${video.fps} fps, ${video.narration}.

# The direction (binding)
Name: ${direction.name} (${direction.chosen}). Mood: ${direction.mood}. Canvas: ${direction.canvas}. Energy: ${direction.energy}.
Palette by role (literal values):
${paletteLines(direction)}
Type roles:
${type}
Ground: ${direction.ground || '(use the canvas colour with one soft pool of the accent at 15–20% opacity)'}
Motion grammar: ${direction.motion_grammar || ''}
Camera: ${direction.camera}
Signature move: ${direction.signature_move}
Direction settings: ${Object.entries(direction.dials).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}
Not in this video: ${direction.banned.join('; ') || 'nothing banned'}
${direction.components.length ? `Components the direction already specifies:\n${direction.components.map((c) => `- ${c.name}: ${c.spec}`).join('\n')}` : ''}
${direction.composition_rules.length ? `Composition rules:\n${direction.composition_rules.map((r) => `- ${r}`).join('\n')}` : ''}

# The video style it is based on${style ? ` (${style.name})` : ''}
${style ? `Palette: ${JSON.stringify(style.palette)}\nType: ${JSON.stringify(style.type)}\nShape: ${JSON.stringify(style.shape)}\nEasing: ${JSON.stringify(style.easing)}\nRhythm: ${JSON.stringify(style.rhythm)}\nText entrance: ${style.text_animation}\nAtmosphere: ${JSON.stringify(style.atmosphere)}\nNotes: ${style.notes}\nThe direction's palette above wins where they differ; take radii, borders, shadows and the atmosphere from the style.` : 'Derived from the brand; no gallery style.'}

# The product's own tokens (from the site read)
${scout?.tokens ? `Site colours: ground ${scout.tokens.ground}, ink ${scout.tokens.ink}; CSS variables ${JSON.stringify(scout.tokens.css_variables || {})}; site fonts ${JSON.stringify(scout.tokens.fonts || {})} (the video uses the open fonts below, not the site's fonts).` : '(no site tokens)'}
${words ? `Product words: nav ${JSON.stringify(words.nav || [])}; buttons ${JSON.stringify(words.buttons || [])}; features ${JSON.stringify(words.features || [])}; entities ${JSON.stringify(words.entities || [])}.` : ''}

# Font files available (use these exact paths in @font-face; nothing else is on disk)
${fonts.map((f) => `- ${f.family} ${f.weight} ${f.style}: ${f.file}`).join('\n') || '- (none: use the system sans and say so in the README)'}

# The scenes the builders will make (so the kit holds every part they need)
${partsNamed(plan)}
${sketchNotes(projectDir, plan) ? `\nSketch detail per scene (the user approved these layouts):\n${sketchNotes(projectDir, plan)}` : ''}

${signatureHtml ? `# The signature render the user approved on the direction page\nMatch its card, pill, rows and cursor geometry and colours so the video continues what was shown. Its composition:\n\`\`\`html\n${signatureHtml.slice(0, 9000)}\n\`\`\`` : ''}

Build the kit now: the four files, each between its markers. Make the product-specific parts the scenes name (every object in "on screen in order" and in the sketch detail), with the product's real labels. Think video frame, not web page.`;
  return { system: forCanvas(designerSystem(), canvasOf(plan)), prompt, images };
}

/** Parse "<<<FILE path>>> … <<<END FILE>>>" blocks. Fences inside a block are stripped. */
export function parseFiles(text) {
  const files = {};
  const re = /<<<FILE\s+([^\s>]+)\s*>>>\s*\n([\s\S]*?)\n?<<<END FILE>>>/g;
  for (const m of String(text).matchAll(re)) files[m[1].trim()] = stripFence(m[2]).trim() + '\n';
  return files;
}

/** Problems with a parsed kit, in plain words; empty when it is usable. */
export function kitProblems(files) {
  const out = [];
  for (const f of KIT_FILES) if (!files[f] || files[f].trim().length < 20) out.push(`${f} is missing or empty`);
  if (files['kit/tokens.css'] && !/:root\s*\{/.test(files['kit/tokens.css'])) out.push('kit/tokens.css has no :root block');
  if (files['kit/components.css'] && !/\.k-/.test(files['kit/components.css'])) out.push('kit/components.css defines no .k- part');
  const css = (files['kit/tokens.css'] || '') + (files['kit/components.css'] || '');
  if (/\btransition\s*:/.test(css)) out.push('the kit CSS uses a CSS transition (forbidden under a frame-seeked renderer)');
  if (/@keyframes/.test(css)) out.push('the kit CSS uses @keyframes (forbidden)');
  if (/\b\d+(vw|vh)\b/.test(css)) out.push('the kit CSS uses viewport units; sizes are px on the 1920×1080 canvas');
  return out;
}

export function writeKit(projectDir, files) {
  fs.mkdirSync(path.join(projectDir, 'kit'), { recursive: true });
  for (const f of KIT_FILES) fs.writeFileSync(path.join(projectDir, f), files[f] || '');
}

/** tokens.css + components.css, the CSS the pipeline inlines into every frame. */
export function kitCss(projectDir) {
  return ['kit/tokens.css', 'kit/components.css'].map((f) => (fs.existsSync(path.join(projectDir, f)) ? fs.readFileSync(path.join(projectDir, f), 'utf8') : '')).join('\n');
}

/** A sub-composition that lays the kit's parts on one sheet, for a lint and a still. */
export function kitSheetFrame(projectDir, plan, { id = 'kit-sheet', duration = 2 } = {}) {
  const html = fs.existsSync(path.join(projectDir, 'kit/components.html')) ? fs.readFileSync(path.join(projectDir, 'kit/components.html'), 'utf8') : '';
  const ground = paletteValue(plan.direction.palette.ground);
  const blocks = html.split(/(?=<!--\s*part:)/).map((b) => b.trim()).filter(Boolean);
  const cells = blocks.map((b, i) => `<div class="ks-cell" id="ks-cell-${i}">${b.replace(/\bid="([^"]*)"/g, (m, v) => `id="ks${i}-${v}"`)}</div>`).join('\n');
  return `<template>
<style>
#root { position: absolute; inset: 0; overflow: hidden; background: ${ground}; }
.ks-grid { position: absolute; left: 60px; top: 60px; width: ${canvasOf(plan).W - 120}px; height: ${canvasOf(plan).H - 120}px; display: flex; flex-wrap: wrap; gap: 36px; align-content: flex-start; }
.ks-cell { position: relative; flex: 0 0 auto; max-width: 860px; }
.ks-cell > * { position: relative !important; left: auto !important; top: auto !important; }
</style>
<div id="root" data-composition-id="${id}" data-width="${canvasOf(plan).W}" data-height="${canvasOf(plan).H}" data-duration="${duration}">
  <div class="ground"></div>
  <div class="ks-grid" id="ks-grid">${cells || '<div class="k-card" id="ks-empty">no parts</div>'}</div>
</div>
<script>
(function () {
  const tl = gsap.timeline({ paused: true });
  tl.fromTo("#ks-grid", { opacity: 0.001 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0);
  tl.to({ k: 0 }, { k: 1, duration: ${duration}, ease: "none" }, 0);
  window.__timelines["${id}"] = tl;
})();
</script>
</template>
`;
}

/**
 * Run the designer pass: one call (one repair on a parse or lint problem), write
 * the kit. Returns { files, seconds, repaired }.
 * @param {object} args { plan, projectDir, model, key, ledger, fetchImpl, log, lintKit?: (projectDir) => Promise<{errors, text}> }
 */
export async function designerPass({ plan, projectDir, model, key, ledger, fetchImpl, log = () => {}, lintKit = null }) {
  const t0 = Date.now();
  const sigFile = path.join(projectDir, 'direction', 'frames', plan.direction.chosen, 'signature', 'index.html');
  const signatureHtml = fs.existsSync(sigFile) ? fs.readFileSync(sigFile, 'utf8') : '';
  const { system, prompt, images } = designerPrompt({ plan, projectDir, signatureHtml });
  const promptDir = path.join(projectDir, 'production');
  fs.mkdirSync(promptDir, { recursive: true });
  fs.writeFileSync(path.join(promptDir, 'designer-prompt.md'), `# System\n\n${system}\n\n# Prompt\n\n${prompt}\n\n(${images.length} image(s) attached)\n`);
  log(`designer pass (${model}): the kit from the direction and the site tokens`);
  let { text } = await callText({ name: 'designer', step: 'designer', model, key, system, prompt, images, ledger, maxOutputTokens: 32000, fetchImpl, log: (s) => log(`  ${s}`) });
  fs.writeFileSync(path.join(promptDir, 'designer-answer.md'), text);
  let files = parseFiles(text);
  let problems = kitProblems(files);
  let repaired = false;
  if (!problems.length) {
    writeKit(projectDir, files);
    if (lintKit) {
      const lint = await lintKit(projectDir);
      if (lint.errors > 0) problems = [`hyperframes lint reports ${lint.errors} error(s) on the kit sheet:\n${lint.text.slice(0, 3000)}`];
    }
  }
  if (problems.length) {
    log(`  the kit needs one repair: ${problems[0].split('\n')[0]}`);
    const repairPrompt = `${prompt}\n\n# Your previous answer\n\n${text.slice(0, 40000)}\n\n# Problems to fix\n\n${problems.map((p) => `- ${p}`).join('\n')}\n\nReturn all four files again, complete, between their markers, with the problems fixed and nothing else changed.`;
    const r = await callText({ name: 'designer-repair', step: 'designer', model, key, system, prompt: repairPrompt, images, ledger, maxOutputTokens: 32000, fetchImpl, log: (s) => log(`  ${s}`) });
    text = r.text;
    fs.writeFileSync(path.join(promptDir, 'designer-repair.md'), `# Problems\n\n${problems.join('\n')}\n\n# Answer\n\n${text}`);
    files = parseFiles(text);
    repaired = true;
    const again = kitProblems(files);
    if (again.length) throw new Error(`The designer pass failed twice: ${again.join('; ')}`);
    writeKit(projectDir, files);
  }
  return { files, seconds: Math.round((Date.now() - t0) / 100) / 10, repaired };
}
