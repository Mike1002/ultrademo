#!/usr/bin/env node
// scene.mjs — the production step in agent mode (D-68, D-70): the agent writes every scene itself,
// looks at it, fixes it, verifies it, checks each join as soon as both sides exist, and renders the
// whole video once at the end. The rules it builds by are in plan/production/AGENT.md.
//
//   node plan/production/scene.mjs prepare <project>            assets, the kit (a designer task for the agent), one brief per scene
//   node plan/production/scene.mjs build <project> <scene> [t1,t2,...]
//                                                               production/scenes/<scene>.html -> the frame; stills and the overlap check
//   node plan/production/scene.mjs check <project> <scene>[,<scene>...]
//                                                               lint, the renderer's check, a real render, the composition and scene checks
//   node plan/production/scene.mjs joins <project> [<scene>]    the join check for every join whose two scenes exist (or the joins of one scene)
//   node plan/production/scene.mjs whole <project>              the one full render with the music bed, and a sheet of stills at every join
//   node plan/production/scene.mjs status <project>             where every scene stands
//   node plan/production/scene.mjs vertical <project>           sets up the vertical version in <project>/vertical/ (D-82)
//   node plan/production/scene.mjs cut <project> <15|30> <scene>,<scene>,...
//                                                               sets up a social cut in <project>/cut-<n>/ from those scenes (D-82)
//
// Run from scaffold/. Exit 3 means a task waits for the agent (the designer pass); nothing failed.

import { canvasOf, verticalNote } from './canvas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePlan, formatReport } from '../validate.mjs';
import { prepareAssets } from './run.mjs';
import { designerPass, kitCss, KIT_FILES } from './kit.mjs';
import { finishFrame, sceneAssets, scratchHost } from './frames.mjs';
import { Ledger, DEFAULT_MODEL } from './model.mjs';
import { agentFetch, useProjectTasks, exitIfAwaiting } from '../agent.mjs';
import { motionLevel } from '../direction/schema.mjs';
import { mayChange } from '../outline/outline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const node = (script, args) => spawnSync(process.execPath, [path.join(HERE, script), ...args], { stdio: 'inherit' }).status ?? 1;
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function loadPlan(projectDir) {
  const file = path.join(projectDir, 'plan.json');
  if (!fs.existsSync(file)) throw new Error(`${file} not found; confirm a direction first`);
  const v = validatePlan(readJson(file));
  if (!v.ok || !v.plan) throw new Error(`the plan does not validate:\n${formatReport(v.problems.filter((p) => p.level === 'error'))}`);
  return v.plan;
}

const bodyFile = (projectDir, id) => path.join(projectDir, 'production', 'scenes', `${id}.html`);
const frameFile = (projectDir, id) => path.join(projectDir, 'compositions', 'frames', `${id}.html`);

const MOTION_BRIEF = {
  none: 'Motion between scenes: None (D-90). No camera move, no interstitial; the scene builds and clears with its transition only. The cursor, the click ring and a short zoom on the click target still play.',
  minimal: 'Motion between scenes: Minimal (D-90). The camera glides from the previous step\'s target to this one (start where the last scene ended, then settle on the target); the cursor carries across the cut from where it last was; the step number animates in. The cursor, the click ring and a short zoom on the click target play.',
  full: 'Motion between scenes: Full (D-90). As Minimal, and an interstitial (a kinetic title card, a lifted UI part, a small animated diagram) may sit between steps or sections as its own scene, in the direction\'s style. The cursor, the click ring and a short zoom on the click target play.',
};

/** D-88 to D-91: the tutorial lines of a scene's brief (its step, the click markers, the data change, the motion level);
 * also the motion level for an explainer that has one. Empty for every other scene. */
export function tutorialBriefLines(plan, s) {
  const v = plan.video;
  const motion = MOTION_BRIEF[motionLevel(v)];
  if (v.template !== 'tutorial') return v.intake?.motion_between && v.template !== 'launch' ? [`- ${motion}`] : [];
  const lines = [`- ${motion}`];
  if (s.beat !== 'step') return lines;
  const steps = plan.scenes.filter((x) => x.beat === 'step');
  const n = steps.indexOf(s) + 1;
  const o = v.intake?.outline;
  const oSteps = o?.status === 'confirmed' ? o.moments.map((m, i) => ({ m, i })).filter((x) => x.m.beat === 'step') : [];
  const om = oSteps[n - 1] || null;
  lines.push(`- Tutorial step ${n} of ${steps.length}${om ? `: ${String(om.m.what).replace(/[.\s]+$/, '')}` : ''}. The headline is the caption and starts "Step ${n} · " with the action ("Step ${n} · Click Invite").`);
  lines.push('- Show the full screen, the cursor travelling to the target, the click (a ring) or the typing, a short zoom on what changes (lift the part, never crop the screen), and the result. Hold long enough to follow: the caption read, the click seen, the result visible.');
  lines.push('- Mark every click for the check: data-click="<what is clicked>" and data-click-at="<seconds into this scene>" on the target, data-cursor="1" (with data-decor="1") on the cursor; the cursor\'s tip (the top-left of its box) is on the target at that moment.');
  if (om?.m.data_change) {
    lines.push(om.m.rebuild || !mayChange(plan, om.i)
      ? `- Changes data: ${om.m.data_change}. Not confirmed for the demo account: show the before and after states rebuilt from the screens; never perform it in the product.`
      : `- Changes data: ${om.m.data_change}. Confirmed on the demo account: the capture may perform exactly this, nothing else.`);
  }
  if (om?.m.url) lines.push(`- Its screen: ${om.m.url}${om.m.sign_in ? ' (behind the sign-in)' : ''}.`);
  return lines;
}

/** One brief per scene: what the plan asks, the assets with their pixel sizes, its neighbours and joins. */
function writeBrief(projectDir, plan, i) {
  const s = plan.scenes[i];
  const prev = plan.scenes[i - 1] || null;
  const next = plan.scenes[i + 1] || null;
  const assets = sceneAssets(plan, s, projectDir);
  const lines = [
    `# Brief: ${s.id} · ${s.name}`,
    '',
    `Write \`production/scenes/${s.id}.html\` (a <style>, the <div id="root" data-composition-id="${s.id}" data-duration="${s.duration_s}"> and one <script> that registers window.__timelines["${s.id}"]; no <template>, the build adds it with the kit). Rules: plan/production/AGENT.md.`,
    '',
    `- Duration ${s.duration_s} s, at ${s.start_s}–${(s.start_s + s.duration_s).toFixed(2)} s in the video. Beat: ${s.beat}. Role: ${s.role || '—'}.`,
    `- In from ${prev ? `${prev.id} by a ${s.transition_in}` : 'nothing (the first scene: frame 0 shows the headline)'}; out to ${next ? `${next.id} by a ${next.transition_in}` : 'the end (fade to the ground in the last 0.25 s)'}.`,
    `- Headline "${s.copy.headline}"${s.copy.accent ? ` (accent: "${s.copy.accent}")` : ''}${s.copy.sub ? `; sub "${s.copy.sub}"` : ''}; at most ${s.copy.words_max} words. It must stay readable to ${s.reads.length ? s.reads.map((r) => `${r.to_s} s`).join(', ') : 'the end'} (each read window's end, less 0.1 s).`,
    `- Layout: ${s.layout}`,
    ...tutorialBriefLines(plan, s),
    '- Content:', ...s.content.map((c) => `  - ${c}`),
    '- Motion:', ...s.motion.map((m) => `  - ${m.from_s}–${m.to_s} s: ${m.what}`),
    `- Numbers allowed on screen: ${s.numbers.length ? s.numbers.map((n) => `"${n.value}" (${n.cite})`).join('; ') : 'none'}. A counter may pass through lower values on its way.`,
    `- Visuals: ${s.visuals.map((v) => `${v.ref} (${v.kind}${v.focal ? ', focal' : ''}${v.role ? `, ${v.role}` : ''})`).join('; ') || 'none'}.`,
    `- Assets: ${assets.length ? '' : 'none listed; captured pages are in assets/scout/.'}`,
    ...assets.map((a) => `  - ${a.path}${a.size ? ` (${a.size.width}×${a.size.height})` : ''}: ${a.what || a.kind}`),
    `- Carry into the next scene: ${s.carry ? `${s.carry.element}: ${s.carry.action}` : 'none'}.`,
    ...(i === 0 && plan.direction.thumbnail?.intro ? [`- Opens on the thumbnail: show \`assets/thumbnail-intro.png\` full frame from 0 to about 1.5 s (it is the video's first frame and the player's poster), then move into this scene: the title steps aside and the scene's own content takes the frame (no hard cut). The 1.5 s comes out of this scene; its words and timings after that stay as planned.`] : []),
    `- Canvas: ${canvasOf(plan).label}: data-width="${canvasOf(plan).W}" data-height="${canvasOf(plan).H}" on #root.${canvasOf(plan).vertical ? ` ${verticalNote(canvasOf(plan))}` : ''}`,
    '',
    'Loop: build, look at the strip and the full-size stills, fix, repeat until clean; then check; then the joins with the neighbours that exist.',
    '',
  ];
  fs.mkdirSync(path.join(projectDir, 'production', 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'production', 'briefs', `${s.id}.md`), lines.join('\n'));
}

async function prepare(projectDir) {
  const plan = loadPlan(projectDir);
  useProjectTasks(projectDir);
  process.env.ULTRADEMO_MODE = 'agent';
  prepareAssets(projectDir, plan);
  if (!KIT_FILES.every((f) => fs.existsSync(path.join(projectDir, f)))) {
    const sigFile = path.join(projectDir, 'direction', 'frames', plan.direction.chosen, 'signature', 'index.html');
    const signatureHtml = fs.existsSync(sigFile) ? fs.readFileSync(sigFile, 'utf8') : '';
    const ledger = new Ledger(5, path.join(projectDir, 'production', 'cost.json'));
    fs.mkdirSync(path.join(projectDir, 'production'), { recursive: true });
    await designerPass({ plan, projectDir, model: DEFAULT_MODEL, key: 'agent', ledger, fetchImpl: agentFetch(), log: (s) => console.log(s), signatureHtml });
  }
  // D-82: the video opens on its thumbnail when the user asked for it on the refine page: the opening frame, in the kit's look
  if (plan.direction.thumbnail?.intro) {
    const { introFrame } = await import('../thumbnail/render.mjs');
    const f = await introFrame(projectDir);
    if (f) console.log(`opening frame: ${f}`);
  }
  plan.scenes.forEach((_, i) => writeBrief(projectDir, plan, i));
  fs.mkdirSync(path.join(projectDir, 'production', 'scenes'), { recursive: true });
  console.log(`kit: ${KIT_FILES.map((f) => path.join(projectDir, f)).join(', ')}`);
  console.log(`briefs: ${path.join(projectDir, 'production', 'briefs')} (${plan.scenes.length})`);
  console.log(`next: write ${path.join(projectDir, 'production', 'scenes', `${plan.scenes[0].id}.html`)}, then node plan/production/scene.mjs build ${projectDir} ${plan.scenes[0].id}`);
}

function build(projectDir, id, times) {
  const plan = loadPlan(projectDir);
  const scene = plan.scenes.find((s) => s.id === id);
  if (!scene) throw new Error(`no scene ${id}`);
  const src = bodyFile(projectDir, id);
  if (!fs.existsSync(src)) throw new Error(`${src} not found; write the scene first (its brief: production/briefs/${id}.md)`);
  let body = fs.readFileSync(src, 'utf8').replace(/<\/?template>/g, '');
  const cv = canvasOf(plan);
  const fin = finishFrame(`<template>\n${body}\n</template>\n`, { id, duration: scene.duration_s, width: cv.W, height: cv.H, kitCss: kitCss(projectDir) });
  if (fin.problems.length) { console.log(`frame problems:\n- ${fin.problems.join('\n- ')}`); process.exitCode = 1; }
  fs.mkdirSync(path.dirname(frameFile(projectDir, id)), { recursive: true });
  fs.writeFileSync(frameFile(projectDir, id), fin.html);
  scratchHost(projectDir, plan, scene);
  const d = scene.duration_s;
  const t = times || [0.03, d * 0.12, d * 0.25, d * 0.4, d * 0.55, d * 0.7, d * 0.85, d - 0.05].map((x) => Math.round(x * 100) / 100).join(',');
  return node('look.mjs', [projectDir, id, t, '--boxes']);
}

function joins(projectDir, only) {
  const plan = loadPlan(projectDir);
  let code = 0;
  for (let i = 1; i < plan.scenes.length; i++) {
    const a = plan.scenes[i - 1], b = plan.scenes[i];
    if (only && only !== a.id && only !== b.id) continue;
    if (!fs.existsSync(frameFile(projectDir, a.id)) || !fs.existsSync(frameFile(projectDir, b.id))) continue;
    code = node('join.mjs', [projectDir, a.id, b.id]) || code;
  }
  return code;
}

function status(projectDir) {
  const plan = loadPlan(projectDir);
  const verify = fs.existsSync(path.join(projectDir, 'production', 'look', 'verify.json')) ? readJson(path.join(projectDir, 'production', 'look', 'verify.json')) : {};
  const rows = plan.scenes.map((s) => {
    const v = verify[s.id];
    const st = !fs.existsSync(bodyFile(projectDir, s.id)) ? 'not written' : !fs.existsSync(frameFile(projectDir, s.id)) ? 'written, not built' : !v ? 'built, not checked' : `checked: ${v.checks?.status === 'built' ? 'passes' : `fix (${v.checks?.reason || 'see verify.json'})`}`;
    return `${s.id.padEnd(16)} ${String(s.duration_s).padStart(4)} s  ${st}`;
  });
  // only the joins of the plan as it stands (an earlier join of a scene since split or renamed is left out)
  const pairs = new Set(plan.scenes.slice(1).map((s, i) => `join-${plan.scenes[i].id}-${s.id}.json`));
  const joinFiles = fs.existsSync(path.join(projectDir, 'production', 'look')) ? fs.readdirSync(path.join(projectDir, 'production', 'look')).filter((f) => pairs.has(f)) : [];
  const bad = joinFiles.filter((f) => readJson(path.join(projectDir, 'production', 'look', f)).findings?.length);
  console.log(rows.join('\n'));
  console.log(`joins checked: ${joinFiles.length} of ${plan.scenes.length - 1}${bad.length ? `; with findings: ${bad.map((f) => f.replace(/^join-|\.json$/g, '')).join(', ')}` : ''}`);
  console.log(`video: ${fs.existsSync(path.join(projectDir, 'out', 'video.mp4')) ? path.join(projectDir, 'out', 'video.mp4') : 'not rendered yet'}`);
}

/** D-82: the vertical version of a landscape video, as its own project in <project>/vertical/: the same plan, scene
 * timings, words and assets on 1080×1920. Every command works on it as on any project (prepare, build, check, joins,
 * whole); its whole render takes the landscape video's soundtrack. The plan is written once and then left to the agent
 * (its layout text may change for the vertical frame; timings, words, claims and numbers never do). */
export function makeVertical(projectDir) {
  const plan = loadPlan(projectDir);
  if (canvasOf(plan).vertical) throw new Error('this video is already vertical; there is no landscape version to adapt');
  const vdir = path.join(projectDir, 'vertical');
  const fresh = !fs.existsSync(path.join(vdir, 'plan.json'));
  fs.mkdirSync(vdir, { recursive: true });
  if (fresh) {
    const vplan = JSON.parse(JSON.stringify(plan));
    vplan.video.format = '1080x1920';
    vplan.video.intake = { ...(vplan.video.intake || {}), vertical_of: path.basename(projectDir) };
    fs.writeFileSync(path.join(vdir, 'plan.json'), JSON.stringify(vplan, null, 1) + '\n');
  }
  // the same assets (logo, captures, fonts, music) and the direction the kit is read from
  if (fs.existsSync(path.join(projectDir, 'assets'))) fs.cpSync(path.join(projectDir, 'assets'), path.join(vdir, 'assets'), { recursive: true });
  for (const f of ['hyperframes.json']) if (fs.existsSync(path.join(projectDir, f))) fs.copyFileSync(path.join(projectDir, f), path.join(vdir, f));
  const dirLink = path.join(vdir, 'direction');
  if (!fs.existsSync(dirLink) && fs.existsSync(path.join(projectDir, 'direction'))) fs.symlinkSync(path.join('..', 'direction'), dirLink);
  console.log(`${fresh ? 'Set up' : 'Refreshed the assets of'} the vertical version: ${vdir}
Next, the same loop as the landscape video, on that folder:
  1. node plan/production/scene.mjs prepare ${vdir}   (a kit for 1080×1920: start from ${path.join(projectDir, 'kit')}, resized for the vertical frame)
  2. each scene: write ${path.join(vdir, 'production', 'scenes')}/<id>.html for the vertical frame (read the landscape scene beside it), build, look, fix, check, joins
  3. node plan/production/scene.mjs whole ${vdir}   (takes the landscape soundtrack; copies the result to ${path.join(projectDir, 'out', 'video-vertical.mp4')})`);
}

/** D-82: a social cut (15 or 30 s) as its own project in <project>/cut-<n>/: the scenes the agent picked, in the order
 * given, their lengths scaled to fit; vertical when the video has a vertical version (its scenes are the starting point),
 * else the video's own frame. No narration (the words on screen carry it); the music and the scenes' sound effects stay.
 * Its whole render goes to <project>/out/cut-<n>.mp4, where the review page lists it. */
export function makeCut(projectDir, seconds, ids) {
  const n = Number(seconds);
  if (![15, 30].includes(n)) throw new Error('a cut is 15 or 30 seconds');
  const plan = loadPlan(projectDir);
  const fromVertical = fs.existsSync(path.join(projectDir, 'vertical', 'plan.json'));
  const src = fromVertical ? path.join(projectDir, 'vertical') : projectDir;
  const srcPlan = fromVertical ? readJson(path.join(src, 'plan.json')) : plan;
  const picked = String(ids || '').split(',').map((x) => x.trim()).filter(Boolean).map((id) => srcPlan.scenes.find((sc) => sc.id === id));
  if (!picked.length || picked.some((x) => !x)) throw new Error(`name the scenes for the cut, in order, from: ${srcPlan.scenes.map((sc) => sc.id).join(', ')}`);
  const total = picked.reduce((a, sc) => a + sc.duration_s, 0);
  const k = n / total;
  let t = 0;
  const scenes = picked.map((sc, i) => {
    const d = i === picked.length - 1 ? Math.round((n - t) * 10) / 10 : Math.max(2, Math.round(sc.duration_s * k * 10) / 10);
    const scale = d / sc.duration_s;
    const out = { ...JSON.parse(JSON.stringify(sc)), start_s: Math.round(t * 10) / 10, duration_s: d };
    // the scene's timed parts follow its new length
    out.motion = (out.motion || []).map((m) => ({ ...m, from_s: Math.round(m.from_s * scale * 100) / 100, to_s: Math.round(m.to_s * scale * 100) / 100 }));
    out.reads = (out.reads || []).map((r) => (typeof r === 'object' && r ? Object.fromEntries(Object.entries(r).map(([key, v]) => [key, typeof v === 'number' ? Math.round(v * scale * 100) / 100 : v])) : r));
    delete out.voice; // no narration in a cut
    if (i === 0) out.transition_in = 'cut';
    t += d;
    return out;
  });
  const cdir = path.join(projectDir, `cut-${n}`);
  fs.mkdirSync(cdir, { recursive: true });
  const cplan = JSON.parse(JSON.stringify(srcPlan));
  cplan.video.length_s = n;
  cplan.video.narration = 'music-only';
  cplan.video.intake = { ...(cplan.video.intake || {}), cut_of: path.basename(projectDir), vertical_of: undefined };
  cplan.scenes = scenes;
  fs.writeFileSync(path.join(cdir, 'plan.json'), JSON.stringify(cplan, null, 1) + '\n');
  // the assets, the kit and the scene code of the source as the starting point (retimed by the agent)
  if (fs.existsSync(path.join(src, 'assets'))) fs.cpSync(path.join(src, 'assets'), path.join(cdir, 'assets'), { recursive: true });
  if (fs.existsSync(path.join(src, 'kit'))) fs.cpSync(path.join(src, 'kit'), path.join(cdir, 'kit'), { recursive: true });
  for (const f of ['hyperframes.json']) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(cdir, f));
  const dirLink = path.join(cdir, 'direction');
  if (!fs.existsSync(dirLink) && fs.existsSync(path.join(projectDir, 'direction'))) fs.symlinkSync(path.join('..', 'direction'), dirLink);
  fs.mkdirSync(path.join(cdir, 'production', 'scenes'), { recursive: true });
  for (const sc of scenes) {
    const from = path.join(src, 'production', 'scenes', `${sc.id}.html`);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(cdir, 'production', 'scenes', `${sc.id}.html`));
    // the scene's sound effects, retimed (from the vertical version, else the landscape scene)
    const cues = [src, projectDir].map((d) => path.join(d, 'production', 'scenes', `${sc.id}.cues.json`)).find((f) => fs.existsSync(f));
    if (cues) {
      const orig = picked.find((x) => x.id === sc.id);
      const scale = sc.duration_s / orig.duration_s;
      const list = readJson(cues).map((c) => ({ ...c, at: Math.round(c.at * scale * 100) / 100 })).filter((c) => c.at <= sc.duration_s);
      fs.writeFileSync(path.join(cdir, 'production', 'scenes', `${sc.id}.cues.json`), JSON.stringify(list, null, 1) + '\n');
    }
  }
  if (fs.existsSync(path.join(projectDir, 'sfx'))) fs.cpSync(path.join(projectDir, 'sfx'), path.join(cdir, 'sfx'), { recursive: true });
  scenes.forEach((_, i) => writeBrief(cdir, cplan, i));
  console.log(`Set up the ${n} s cut (${canvasOf(cplan).label}${fromVertical ? ', from the vertical version' : ''}): ${cdir}
Scenes: ${scenes.map((sc) => `${sc.id} ${sc.duration_s} s`).join(' · ')}
Next: retime each scene's code to its new length (production/scenes/ holds the source scenes as the start), then build, look, check and joins on that folder, and whole (it goes to ${path.join(projectDir, 'out', `cut-${n}.mp4`)}).`);
}

/**
 * D-93: the chapters of a long video, from the confirmed outline. When the scenes match the outline one to one, each
 * scene takes its moment's chapter; otherwise the step scenes take the outline's steps in order, and a scene that is not
 * a step joins the chapter of the step after it (an opening), or before it (a closing). Returns [{ name, start_s, end_s, scenes }].
 */
export function sceneChapters(plan) {
  const o = plan.video.intake?.outline;
  const ms = o?.status === 'confirmed' ? o.moments : [];
  if (!ms.some((m) => m.chapter)) return [];
  const scenes = plan.scenes;
  let names;
  if (ms.length === scenes.length) names = ms.map((m) => m.chapter);
  else {
    const stepCh = ms.filter((m) => m.beat === 'step').map((m) => m.chapter);
    let k = 0;
    names = scenes.map((s) => (s.beat === 'step' ? stepCh[k++] ?? null : null));
    for (let i = 0; i < names.length; i++) if (!names[i]) names[i] = names.slice(i + 1).find(Boolean) || names.slice(0, i).reverse().find(Boolean) || null;
  }
  const out = [];
  scenes.forEach((s, i) => {
    const name = names[i] || 'Chapter';
    const last = out[out.length - 1];
    if (last && last.name === name) { last.end_s = s.start_s + s.duration_s; last.scenes.push(s.id); }
    else out.push({ name, start_s: s.start_s, end_s: s.start_s + s.duration_s, scenes: [s.id] });
  });
  return out;
}

/** Cut each chapter out of out/video.mp4 into out/chapters/<NN>-<name>.mp4 (re-encoded, so every cut lands on its frame). */
function chapters(projectDir) {
  const plan = loadPlan(projectDir);
  const list = sceneChapters(plan);
  if (!list.length) { console.log('This video has no chapters (the outline sets them for a video past five minutes).'); return 0; }
  const video = path.join(projectDir, 'out', 'video.mp4');
  if (!fs.existsSync(video)) { console.error('Render the whole video first: node plan/production/scene.mjs whole <project>'); return 1; }
  const dir = path.join(projectDir, 'out', 'chapters');
  fs.mkdirSync(dir, { recursive: true });
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'chapter';
  for (const [i, c] of list.entries()) {
    const out = path.join(dir, `${String(i + 1).padStart(2, '0')}-${slug(c.name)}.mp4`);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(c.start_s), '-to', String(c.end_s), '-i', video, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`Could not cut chapter ${i + 1}`); return 1; }
    console.log(`${String(i + 1).padStart(2, '0')} ${c.name}: ${(c.end_s - c.start_s).toFixed(1)} s → ${out}`);
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, projectArg, arg3, arg4] = process.argv.slice(2);
  if (!cmd || !projectArg) { console.error('usage: node plan/production/scene.mjs prepare|build|check|joins|whole|status|vertical|cut|chapters <project> [...]'); process.exit(2); }
  const projectDir = path.resolve(projectArg);
  (async () => {
    if (cmd === 'prepare') await prepare(projectDir);
    else if (cmd === 'build') process.exitCode = build(projectDir, arg3, arg4) || process.exitCode || 0;
    else if (cmd === 'check') process.exitCode = node('verify.mjs', [projectDir, arg3]);
    else if (cmd === 'joins') process.exitCode = joins(projectDir, arg3);
    else if (cmd === 'whole') {
      const t0 = Date.now();
      process.exitCode = node('whole.mjs', [projectDir]);
      // usage statistics: a finished render (the vertical version and cuts render from their own folders)
      const tel = await import('../telemetry.mjs');
      const base = path.basename(projectDir), parent = path.dirname(projectDir);
      const owner = base === 'vertical' || /^cut-\d+$/.test(base) ? parent : projectDir;
      if (process.exitCode) await tel.track('step_failed', { step: 'render', code: 'whole_render' });
      else await tel.track('video_rendered', { ...tel.projectProps(owner), render_s: (Date.now() - t0) / 1000, vertical: base === 'vertical', cut: /^cut-\d+$/.test(base) });
    }
    else if (cmd === 'status') status(projectDir);
    else if (cmd === 'vertical') makeVertical(projectDir);
    else if (cmd === 'cut') makeCut(projectDir, arg3, arg4);
    else if (cmd === 'chapters') process.exitCode = chapters(projectDir);
    else { console.error(`unknown command ${cmd}`); process.exit(2); }
    // the saved dashboard follows production (scenes written, the whole video, the vertical version)
    if (cmd !== 'status') await import('../dashboard/build.mjs').then((m) => m.refreshDashboard(projectDir)).catch(() => {});
  })().catch(async (err) => { exitIfAwaiting(err); console.error(`Stopped: ${err.message}`); await import('../telemetry.mjs').then((t) => t.track('step_failed', { step: 'production', code: ({ prepare: 'prepare', build: 'build', check: 'check', joins: 'joins', vertical: 'vertical', cut: 'cut' })[cmd] || 'production' })).catch(() => {}); process.exit(1); });
}
