// frames.mjs — the frame builders: one model call per scene (in parallel, up
// to four), each writing compositions/frames/<id>.html on the HyperFrames
// frame contract from that scene's full spec, the kit, the named shot
// blueprint, the gate-clean gallery code of its motion styles and the renderer
// traps list. Then lint and check through a one-scene scratch host; on a lint
// error, one repair call; failures are recorded plainly, never hidden.

import { canvasOf, canvasOfProject, forCanvas } from './canvas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { callText, imageOf, stripFence } from './model.mjs';
import { FRAME_CONTRACT, DOCTRINE, COMPOSITION, rendererTraps, blueprintText, galleryCode, sceneRuleIds, SCAFFOLD, HYPERFRAMES } from './craft.mjs';
import { paletteLines } from './kit.mjs';
import { probePage } from './render.mjs';

const paletteValue = (e) => (typeof e === 'string' ? e : e.value);
const r3 = (n) => Math.round(n * 1000) / 1000;
// the effects library (D-78): inlined into a frame that calls UDFX, once
const FX_JS = path.join(path.dirname(new URL(import.meta.url).pathname), 'effects', 'effects.js');
export const fxScript = () => fs.readFileSync(FX_JS, 'utf8');

/** The letter-first id prefix of a scene ("01-the-chase" → "s01thechase"): a CSS id may not start with a digit. */
export const idPrefix = (scene) => 's' + String(scene.id).replace(/[^a-z0-9]/gi, '');

/**
 * Load the frame in a headless browser and wait for its timeline: catches the
 * runtime errors lint cannot (an invalid selector, an undefined name), which
 * would otherwise cost a 45 s wait in the renderer. Returns { ok, error }.
 */
export async function runtimeProbe(projectDir, scene) {
  const { chromium } = await import('playwright');
  const file = probePage(projectDir, scene);
  const browser = await chromium.launch();
  try {
    const cv = canvasOfProject(projectDir);
    const page = await browser.newPage({ viewport: { width: cv.W, height: cv.H } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e).split('\n')[0]));
    await page.goto('file://' + file, { waitUntil: 'load' });
    try {
      await page.waitForFunction((id) => Boolean(window.__timelines && window.__timelines[id]), scene.id, { polling: 50, timeout: 10000 });
    } catch {
      const more = await page.evaluate(() => window.__probeErrors || []);
      return { ok: false, error: `the timeline window.__timelines["${scene.id}"] never registered in the browser${errors.length || more.length ? `: ${[...errors, ...more][0]}` : ' (a script error, or the key does not match the composition id)'}` };
    }
    const dur = await page.evaluate((id) => window.__timelines[id].duration(), scene.id);
    if (errors.length) return { ok: false, error: `the frame's script threw: ${errors[0]}` };
    return { ok: true, timeline_s: Math.round(dur * 100) / 100 };
  } finally { await browser.close(); }
}

/** Image size through ffprobe (works on jpg/png). */
export function imageSize(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const m = String(r.stdout || '').trim().match(/^(\d+),(\d+)/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** The assets a scene may place: captured sources copied under assets/scout/. */
export function sceneAssets(plan, scene, projectDir) {
  const bySource = new Map(plan.video.sources.map((s) => [s.id, s]));
  const refs = new Set([...scene.sources, ...scene.visuals.map((v) => v.ref)]);
  const out = [];
  for (const ref of refs) {
    const src = bySource.get(ref);
    if (!src) continue;
    const rel = `assets/scout/${path.basename(src.path)}`;
    const abs = path.join(projectDir, rel);
    if (!fs.existsSync(abs)) continue;
    const size = /\.(jpe?g|png)$/i.test(rel) ? imageSize(abs) : null;
    out.push({ id: src.id, kind: src.kind, path: rel, what: src.what, size });
  }
  return out;
}

export function builderSystem() {
  return `You are a frame builder for one scene of a product video: a HyperFrames composition in HTML + GSAP that a renderer seeks frame by frame at 1920×1080. You write the scene exactly as its spec says (what is on screen, in what order, the copy and its cap, the three kinds of visual, the named shot blueprint and motion styles, the motion across the whole duration, what carries into the next scene) over the kit the designer built, copying motion code from the gate-clean gallery frames you are given rather than inventing mechanisms. The output must be pretty, eye-catching and alive on every frame.

${FRAME_CONTRACT}

${DOCTRINE}

${COMPOSITION}

Three kinds of visual (D-49): a captured visual is a real screenshot placed as an <img> from the listed asset path, cropped, framed, pushed or panned, never redrawn or relabelled; a rebuilt visual is the product's UI rebuilt from the kit's parts with its real labels, and it may animate (rows arrive, pills change state, buttons press) but never shows a state or label the product lacks; an illustration carries mood and the camera's destination, never a number, never stands as proof.

Answer with the file only: it starts with <template> and ends with </template>. No prose, no markdown fence.`;
}

/** The fix section of a rebuild prompt: the failures in plain words, the stills, the previous file. */
export function fixSection(fix) {
  if (!fix) return '';
  return `\n# Fix round ${fix.round || 2}: what the checks found on your rendered frames\nYour previous version of this scene rendered, and the checks on its frames failed. The attached stills are that render at the times named. Rebuild the whole scene so every failure below is gone, and keep what passed (the copy, the product parts, the motion lines and their timing, what continues into the next scene).\n${fix.failures.map((f) => `- ${f}`).join('\n')}\n\n# Your previous file (the one that failed)\n\n${String(fix.previous || '').slice(0, 60000)}\n`;
}

/** The builder prompt for scene `index`. Returns { system, prompt, images }. With `fix`, the rebuild prompt of the fix round. */
export function builderPrompt({ plan, index, projectDir, kit, traps = rendererTraps(), signatureHtml = '', fix = null }) {
  const { video, direction, scenes } = plan;
  const scene = scenes[index];
  const prev = scenes[index - 1] || null;
  const next = scenes[index + 1] || null;
  const overlap = direction.transition_overlap_s ?? 0.4;
  const assets = sceneAssets(plan, scene, projectDir);
  const images = [];
  for (const a of assets.filter((x) => x.size).slice(0, 2)) images.push(imageOf(path.join(projectDir, a.path), `The captured page "${a.id}" (${a.what}), ${a.size.width}×${a.size.height} px, at ${a.path}: the product as it really looks.`));
  for (const st of (fix?.stills || []).slice(0, 4)) if (fs.existsSync(st.file)) images.push(imageOf(st.file, `Your previous render of this scene at ${st.t.toFixed(2)} s${st.why ? ` (${st.why})` : ''}.`));
  const rules = sceneRuleIds(scene).map((id) => galleryCode(id)).filter(Boolean);
  const claims = plan.video.claims.filter((c) => scene.claims.includes(c.id) || scene.numbers.some((n) => n.cite === c.id));
  const words = (() => { try { return JSON.parse(fs.readFileSync(path.join(projectDir, 'direction', 'brand-read.json'), 'utf8')).product_words; } catch { return null; } })();
  const sketch = (() => {
    try {
      const P = JSON.parse(fs.readFileSync(path.join(projectDir, 'direction', 'proposals.json'), 'utf8'));
      const chosen = JSON.parse(fs.readFileSync(path.join(projectDir, 'direction', 'chosen.json'), 'utf8')).chosen ?? 0;
      const m = P.directions?.[chosen]?.moments?.[index];
      return m?.sketch ? `Sketch the user approved: kind ${m.sketch.kind}; picture: ${m.sketch.picture}; objects: ${m.sketch.objects}; lines: ${(m.sketch.lines || []).join(' | ') || 'none'}; pill: ${m.sketch.pill || 'none'}; colours: ${m.sketch.colours}; note: ${m.sketch.note}; feeling: ${m.sketch.feeling}.` : '';
    } catch { return ''; }
  })();
  const spec = { ...scene };
  delete spec.status; delete spec.measured; delete spec.review;
  const isSignature = scene.style_tags.some((t) => /pill-press-morph|counter-climb|card-cascade|type-slam|window-push-in|line-draw-reveal|token-swap|toast-stack/.test(t)) && signatureHtml && index === signatureIndex(plan);
  const prompt = `# The video
Product: ${video.product} (${video.url}). Template ${video.template}, ${video.length_s} s, ${video.format}, ${video.fps} fps, narration: ${video.narration}. Viewer: ${video.viewer}. Claim: ${video.claim}. Pain point: ${video.pain_point}. Proof moment: ${video.proof_moment}. Call to action: ${video.cta}. Tone: ${video.copy.register}.

# The direction (binding for every scene)
Name: ${direction.name}. Mood: ${direction.mood}. Canvas: ${direction.canvas}. Energy: ${direction.energy}; pace: at least ${direction.pace_band.motion_per_s_min} motion per second, nothing still longer than 0.5 s.
Palette (literal values for tweens):
${paletteLines(direction)}
Type: display ${typeof direction.type.display === 'string' ? direction.type.display : direction.type.display.family}; text ${typeof direction.type.text === 'string' ? direction.type.text : direction.type.text.family}; mono ${typeof direction.type.mono === 'string' ? direction.type.mono : direction.type.mono.family} (use the kit's .t- classes).
Camera: ${direction.camera}. Signature move: ${direction.signature_move}.
Ground: ${direction.ground || ''}. Motion grammar: ${direction.motion_grammar || ''}.
Not in this video: ${direction.banned.join('; ') || 'nothing banned'}.
${words ? `Product words you may show (real labels): buttons ${JSON.stringify(words.buttons || [])}; features ${JSON.stringify(words.features || [])}; entities ${JSON.stringify(words.entities || [])}; nav ${JSON.stringify(words.nav || [])}.` : ''}

# This scene: ${index + 1} of ${scenes.length}, id "${scene.id}", ${scene.duration_s} s (starts at ${scene.start_s} s in the video); id prefix for every element: "${idPrefix(scene)}-"
Its full spec (the motion lines are windows in seconds inside the scene; cover all of them):
\`\`\`json
${JSON.stringify(spec, null, 1)}
\`\`\`
${sketch}
Transition into this scene: ${scene.transition_in}${prev ? ` from "${prev.name}", which ends with: ${prev.carry ? `${prev.carry.element} — ${prev.carry.action}` : 'nothing carried'}. Your frame 0 shows that element already present where the previous scene left it.` : ' (the video opens here: the headline is already on screen at frame 0).'}
${next ? `What continues into the next scene "${next.name}" (${next.transition_in} transition, overlap ${overlap} s): ${scene.carry ? `${scene.carry.element} — ${scene.carry.action}` : 'nothing named'}. That element is visible and settled on your last frame.` : 'This is the last scene: end on the product, settled, with the call to action readable (close: ' + direction.close + ').'}
Reading time: ${scene.reads.map((r) => `${r.from_s}–${r.to_s} s: ${r.what}`).join('; ')}. The headline is readable until the end of its reading window.
Word cap: ${scene.copy.words_max} words on screen for headline plus sub. Numbers allowed on screen: ${scene.numbers.length ? scene.numbers.map((n) => `"${n.value}" (${n.cite})`).join(', ') : 'none from the plan'}; sample values inside the rebuilt UI are allowed only when they are the product's own labels listed above.
${claims.length ? `Facts this scene relies on: ${claims.map((c) => `"${c.text}" (${c.cite})`).join('; ')}.` : ''}

# Assets you may place (project-relative paths)
${assets.length ? assets.map((a) => `- ${a.path}: ${a.kind}, ${a.what}${a.size ? `, ${a.size.width}×${a.size.height} px` : ''}`).join('\n') : '- none (this scene is built from the kit and type only)'}

# The kit (inlined into your frame by the pipeline; use its classes and variables; do not repeat it)
## kit/README.md
${kit.readme}
## kit/tokens.css
\`\`\`css
${kit.tokens}
\`\`\`
## kit/components.css
\`\`\`css
${kit.components}
\`\`\`
## kit/components.html (copy the markup of the parts you need; prefix every id with "${idPrefix(scene)}-")
\`\`\`html
${kit.componentsHtml}
\`\`\`

# The shot blueprint: ${scene.blueprint}${scene.blueprint_posture ? ` (${scene.blueprint_posture})` : ''}
${scene.blueprint_note ? `How to adapt it: ${scene.blueprint_note}` : ''}
${scene.blueprint === 'composed' ? 'Composed from the motion styles below; keep their mechanisms.' : blueprintText(scene.blueprint, scene.role)}

# Gate-clean motion-style code to copy from (the mechanism, retimed to this scene; these samples are 1280×720 on a neutral look, yours is 1920×1080 in the kit's look)
${rules.length ? rules.map((r) => `## ${r.id}: ${r.one_line}\n\`\`\`html\n${r.html}\n\`\`\``).join('\n') : '(no motion style named; compose from the blueprint and the doctrine)'}

${isSignature ? `# The signature render the user approved for this moment (match its geometry, parts and move; extend it to the full duration and the full spec)\n\`\`\`html\n${signatureHtml.slice(0, 9000)}\n\`\`\`\n` : ''}
# Renderer traps (what the sources' own code gets wrong; every one of these cost a retry)
${traps}

Write the scene now. Checklist before you answer: template → style → #root (data-composition-id="${scene.id}", data-duration="${scene.duration_s}") → script registering window.__timelines["${scene.id}"]; every id starts with "${idPrefix(scene)}-" (a letter first; "#${scene.id}-x" would be an invalid selector); fromTo everywhere; no CSS transform on tweened elements; the first motion line's content visible at t=0${index === 0 ? ' (the headline readable on frame 0)' : ''}; every motion line covered; something changing every 0.5 s and one camera move; a full-frame stage with background, midground and foreground; no empty container at any moment; the content balanced and centred where the layout centres it, nothing within 4% of the edges but the mark and placed labels; the headline at the direction's headline size; on a product moment the product part at least 40% of the frame width; the stage cleared (all but the carried element) in your last 0.4–0.6 s${index > 0 ? ', and nothing but the ground and the carried element in your first 0.3 s' : ''}; real spaces between word spans; nothing outside 1920×1080; only the plan's numbers; under 350 lines.${fixSection(fix)}`;
  return { system: forCanvas(builderSystem(), canvasOf(plan)), prompt, images };
}

/** The scene whose style tags name the signature move and whose beat is the proof, else the first signature-tagged scene. */
export function signatureIndex(plan) {
  const kinds = /pill-press-morph|counter-climb|card-cascade|type-slam|window-push-in|line-draw-reveal|token-swap|toast-stack/;
  const idx = plan.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.style_tags.some((t) => kinds.test(t)));
  const proof = idx.find(({ s }) => s.beat === 'proof');
  return (proof || idx[0] || { i: -1 }).i;
}

/** Pull the <template> file out of a model answer. */
export function parseFrame(text) {
  const t = stripFence(text);
  const i = t.indexOf('<template');
  const j = t.lastIndexOf('</template>');
  if (i < 0 || j < 0) return null;
  return t.slice(i, j + '</template>'.length) + '\n';
}

/**
 * Finish a builder's frame: inline the kit CSS as the first child of the
 * template, stamp the root attributes, and report what is missing.
 * @returns {{ html: string, problems: string[] }}
 */
export function finishFrame(html, { id, duration, width = 1920, height = 1080, kitCss }) {
  const problems = [];
  let out = html;
  // root attributes
  const rootRe = /<div\b([^>]*\bid=["']root["'][^>]*)>/;
  const m = out.match(rootRe);
  if (!m) problems.push('no <div id="root"> in the frame');
  else {
    let attrs = m[1];
    const setAttr = (name, value) => {
      const re = new RegExp(`\\s${name}=["'][^"']*["']`);
      attrs = re.test(attrs) ? attrs.replace(re, ` ${name}="${value}"`) : `${attrs} ${name}="${value}"`;
    };
    setAttr('data-composition-id', id);
    setAttr('data-width', String(width));
    setAttr('data-height', String(height));
    setAttr('data-duration', String(r3(duration)));
    out = out.replace(rootRe, `<div${attrs}>`);
  }
  // timeline key
  const keyRe = /window\.__timelines\[\s*["']([^"']+)["']\s*\]\s*=/;
  const k = out.match(keyRe);
  if (!k) problems.push('the frame registers no timeline on window.__timelines');
  else if (k[1] !== id) out = out.replace(keyRe, `window.__timelines["${id}"] =`);
  // kit css inlined once
  out = out.replace(/<style data-kit="1">[\s\S]*?<\/style>\s*/, '');
  // function replacers: the kit and the effects code carry '$' (template literals), which a replacement string would read as a pattern
  out = out.replace(/<template>\s*/, () => `<template>\n<style data-kit="1">\n${kitCss}\n</style>\n`);
  if (!/<template>/.test(out)) problems.push('the frame does not start with <template>');
  // effects library: inlined after the kit when the scene plays an effect
  out = out.replace(/<script data-fx="1">[\s\S]*?<\/script>\s*/, '');
  if (/UDFX\.play\(/.test(out)) out = out.replace(/(<style data-kit="1">[\s\S]*?<\/style>\n)/, (m, kit) => `${kit}<script data-fx="1">\n${fxScript()}\n</script>\n`);
  return { html: out, problems };
}

/** The frame root's data-duration (the host extends it by the transition overlap). */
export function setFrameDuration(file, duration) {
  const html = fs.readFileSync(file, 'utf8');
  const next = html.replace(/(<div\b[^>]*\bid=["']root["'][^>]*?)\sdata-duration=["'][^"']*["']/, `$1 data-duration="${r3(duration)}"`);
  if (next !== html) fs.writeFileSync(file, next);
}

// ---------------------------------------------------------------------------
// The scratch host: one scene mounted alone, for lint, check and the scene render
// ---------------------------------------------------------------------------

export function hostHtml({ clips, duration, ground, width = 1920, height = 1080, fps = 30, transitions = '', audio = '', scripts = '', overlays = [] }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${width}, height=${height}" />
<title>Ultrademo video</title>
<script src="assets/gsap.min.js"></script>${scripts ? `\n${scripts}` : ''}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: ${ground}; }
  #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: ${ground}; }
  .scene { position: absolute; inset: 0; width: 100%; height: 100%; background-color: ${ground}; will-change: transform, opacity, filter; }
  #ground { position: absolute; inset: 0; background: ${ground}; }
  .overlay { position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; pointer-events: none; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${r3(duration)}" data-width="${width}" data-height="${height}" data-fps="${fps}">
  <div id="ground" class="clip" data-start="0" data-duration="${r3(duration)}" data-track-index="0"></div>
${clips.map((c) => `  <div id="el-${c.id}" class="scene" data-composition-id="${c.id}" data-composition-src="compositions/frames/${c.id}.html" data-start="${r3(c.start)}" data-duration="${r3(c.duration)}" data-track-index="${c.track}"></div>`).join('\n')}
${overlays.map((o) => `  <div id="el-${o.id}" class="overlay" data-composition-id="${o.id}" data-composition-src="compositions/frames/${o.id}.html" data-start="0" data-duration="${r3(duration)}" data-track-index="${o.track || 40}"></div>`).join('\n')}
${audio}
</div>
<script>
  window.__timelines["main"] = gsap.timeline({ paused: true });
  (function () { var tl = window.__timelines["main"];
${transitions}
    tl.to({}, { duration: ${r3(duration)} }, 0);
  })();
</script>
</body>
</html>
`;
}

/** Make (or refresh) the one-scene scratch project under production/build/<id>/. */
export function scratchHost(projectDir, plan, scene) {
  const dir = path.join(projectDir, 'production', 'build', scene.id);
  fs.mkdirSync(path.join(dir, 'compositions', 'frames'), { recursive: true });
  const link = (target, at) => { try { fs.rmSync(at, { force: true }); } catch { /* none */ } fs.symlinkSync(target, at); };
  link(path.join(projectDir, 'assets'), path.join(dir, 'assets'));
  link(path.join(projectDir, 'compositions', 'frames', `${scene.id}.html`), path.join(dir, 'compositions', 'frames', `${scene.id}.html`));
  fs.writeFileSync(path.join(dir, 'hyperframes.json'), JSON.stringify({ paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: false } }) + '\n');
  const [w, h] = plan.video.format.split('x').map(Number);
  fs.writeFileSync(path.join(dir, 'index.html'), hostHtml({ clips: [{ id: scene.id, start: 0, duration: scene.duration_s, track: 1 }], duration: scene.duration_s, ground: paletteValue(plan.direction.palette.ground), width: w, height: h, fps: plan.video.fps }));
  return dir;
}

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '') };
};

const jsonTail = (out) => {
  const i = out.indexOf('{');
  if (i < 0) return null;
  try { return JSON.parse(out.slice(i)); } catch {
    const j = out.lastIndexOf('\n}');
    try { return JSON.parse(out.slice(i, j + 2)); } catch { return null; }
  }
};

/** hyperframes lint on a project dir → { errors, warnings, findings[], text }. */
export function lintProject(dir) {
  const r = run('npx', ['--no-install', HYPERFRAMES, 'lint', dir, '--json'], SCAFFOLD);
  const j = jsonTail(r.out);
  const findings = j?.findings || j?.lint?.findings || [];
  const errors = j ? (j.errorCount ?? findings.filter((f) => f.severity === 'error').length) : Number((r.out.match(/(\d+) error/) || [])[1] ?? 1);
  const warnings = j ? (j.warningCount ?? findings.filter((f) => f.severity === 'warning').length) : Number((r.out.match(/(\d+) warning/) || [])[1] ?? 0);
  const text = findings.filter((f) => f.severity === 'error').map((f) => `${f.code}: ${f.message}${f.fixHint ? ` Fix: ${f.fixHint}` : ''}`).join('\n') || (errors ? r.out.slice(-3000) : '');
  return { errors, warnings, findings, text, raw: r.out };
}

/** hyperframes check --no-contrast on a project dir → { ok, errors, warnings, findings[], text }. */
export function checkProject(dir) {
  const r = run('npx', ['--no-install', HYPERFRAMES, 'check', dir, '--no-contrast', '--json'], SCAFFOLD);
  const j = jsonTail(r.out);
  const groups = j ? ['lint', 'runtime', 'layout', 'motion'].map((k) => j[k]).filter(Boolean) : [];
  const findings = groups.flatMap((g) => (g.findings || g.issues || []).map((f) => ({ ...f, group: g === j.lint ? 'lint' : g === j.runtime ? 'runtime' : g === j.layout ? 'layout' : 'motion' })));
  const errors = findings.filter((f) => f.severity === 'error' && f.group !== 'lint').length;
  const warnings = findings.filter((f) => f.severity === 'warning' && f.group !== 'lint').length;
  const text = findings.filter((f) => f.group !== 'lint').slice(0, 12).map((f) => `${f.group} ${f.severity} ${f.code || f.rule || ''}: ${f.message || ''}`).join('\n');
  return { ok: Boolean(j?.ok), errors, warnings, findings, text, raw: r.out.slice(-4000) };
}

/**
 * Build one scene: prompt → frame → finish → write → lint (one repair) → check.
 * Never throws for a bad frame; returns { id, ok, file, lint, check, problems[], calls, seconds, repaired }.
 */
export async function buildScene({ plan, index, projectDir, kit, traps, signatureHtml, model, key, ledger, fetchImpl, log = () => {}, fix = null }) {
  const scene = plan.scenes[index];
  const t0 = Date.now();
  const outDir = path.join(projectDir, 'production', 'frames');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'compositions', 'frames'), { recursive: true });
  const file = path.join(projectDir, 'compositions', 'frames', `${scene.id}.html`);
  const tag = fix ? `.fix${fix.round || 2}` : '';
  const callName = (kind) => (fix ? `${kind === 'frame' ? 'fix' : 'fix-repair'}:${scene.id}` : `${kind}:${scene.id}`);
  const result = { id: scene.id, ok: false, file: path.relative(projectDir, file), lint: null, check: null, problems: [], calls: 0, seconds: 0, repaired: false, ...(fix ? { round: fix.round || 2 } : {}) };
  const { system, prompt, images } = builderPrompt({ plan, index, projectDir, kit, traps, signatureHtml, fix });
  fs.writeFileSync(path.join(outDir, `${scene.id}${tag}.prompt.md`), `# System\n\n${system}\n\n# Prompt\n\n${prompt}\n\n(${images.length} image(s) attached)\n`);
  const attempt = async (name, p) => {
    const r = await callText({ name, step: fix ? 'fix' : 'frames', scene: scene.id, model, key, system, prompt: p, images, ledger, maxOutputTokens: 16000, fetchImpl, log: (s) => log(`  ${s}`) });
    result.calls++;
    const parsed = parseFrame(r.text);
    if (!parsed) return { html: null, problems: ['the answer holds no <template>…</template> file'], raw: r.text };
    const cv = canvasOf(plan);
    const fin = finishFrame(parsed, { id: scene.id, duration: scene.duration_s, width: cv.W, height: cv.H, kitCss: kit.css });
    return { html: fin.html, problems: fin.problems, raw: r.text };
  };
  try {
    log(`frame ${scene.id} (${index + 1}/${plan.scenes.length}): ${scene.name}`);
    let a = await attempt(callName('frame'), prompt);
    fs.writeFileSync(path.join(outDir, `${scene.id}${tag}.answer.html`), a.raw);
    let problems = [...a.problems];
    let lint = null;
    const gate = async () => {
      fs.writeFileSync(file, a.html);
      scratchHost(projectDir, plan, scene);
      lint = lintProject(path.join(projectDir, 'production', 'build', scene.id));
      fs.writeFileSync(path.join(outDir, `${scene.id}${tag}.lint.txt`), lint.raw);
      const found = [];
      if (lint.errors > 0) found.push(`lint: ${lint.errors} error(s)\n${lint.text}`);
      const rt = await runtimeProbe(projectDir, scene);
      if (!rt.ok) found.push(`runtime: ${rt.error}`);
      result.timeline_s = rt.timeline_s ?? null;
      // a short timeline is worth one repair but never blocks the scene: the renderer holds the last frame and the dead-hold check measures it
      soft = rt.ok && rt.timeline_s < scene.duration_s - 0.6 ? [`the timeline ends at ${rt.timeline_s} s but the scene lasts ${scene.duration_s} s: the motion lines must cover the whole duration (a dead hold at the end)`] : [];
      return found;
    };
    let soft = [];
    if (a.html) problems.push(...(await gate()), ...soft);
    if (problems.length) {
      log(`  ${scene.id}: one repair (${problems[0].split('\n')[0]})`);
      const repairPrompt = `${prompt}\n\n# Your previous answer\n\n${(a.html || a.raw).slice(0, 60000)}\n\n# Problems the linter and the pipeline found\n\n${problems.map((p) => `- ${p}`).join('\n')}\n\nReturn the whole corrected file (template to /template), nothing else. Keep everything that was right.`;
      a = await attempt(callName('repair'), repairPrompt);
      result.repaired = true;
      fs.writeFileSync(path.join(outDir, `${scene.id}${tag}.repair.html`), a.raw);
      problems = [...a.problems];
      if (a.html) problems.push(...(await gate()).map((p) => `after the repair, ${p}`));
      result.notes = soft;
    }
    result.notes = soft;
    result.lint = lint ? { errors: lint.errors, warnings: lint.warnings, text: lint.text } : null;
    if (a.html && lint && problems.length === 0) {
      const check = checkProject(path.join(projectDir, 'production', 'build', scene.id));
      fs.writeFileSync(path.join(outDir, `${scene.id}${tag}.check.json`), JSON.stringify({ ok: check.ok, errors: check.errors, warnings: check.warnings, findings: check.findings.slice(0, 80) }, null, 2));
      result.check = { ok: check.ok, errors: check.errors, warnings: check.warnings, text: check.text };
      result.ok = true;
    }
    result.problems = problems;
  } catch (err) {
    if (err?.name === 'CapReached') throw err;
    result.problems.push(err.message);
  }
  result.seconds = Math.round((Date.now() - t0) / 100) / 10;
  log(`  ${scene.id}: ${result.ok ? 'built' : 'failed'} in ${result.seconds}s${result.lint ? ` (lint ${result.lint.errors} error(s), ${result.lint.warnings} warning(s)${result.check ? `; check ${result.check.errors} error(s), ${result.check.warnings} warning(s)` : ''})` : ''}`);
  return result;
}

/** Run jobs with at most `limit` in flight; results in order. */
export async function parallel(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let stop = null;
  const worker = async () => {
    while (next < items.length && !stop) {
      const i = next++;
      try { results[i] = await fn(items[i], i); } catch (err) { stop = err; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (stop) throw stop;
  return results;
}
