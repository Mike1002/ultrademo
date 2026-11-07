#!/usr/bin/env node
// run.mjs — the production step of the skill v2 (step 3 of five, D-44): a
// confirmed plan in, rendered scenes with their checks out.
//
//   node plan/production/run.mjs <project-dir> [--cap 5.00] [--only <scene-id>] [--model anthropic/claude-sonnet-5]
//                                [--parallel 4] [--fixtures <dir>] [--record <dir>] [--voice <spec>] [--no-fix]
//
// 1. validates plan.json; every scene must be sketched (or, with --only, that scene fix or sketched)
// 2. the designer pass: one model call writes kit/ (tokens, components, README)
// 3. the frame builders: one call per scene, up to four in parallel; lint, one repair, check
// 4. index.html with the plan's transitions, the narration and the music bed
// 5. HyperFrames renders the whole video and every scene alone; stills and a sheet; the ffmpeg mix at -14 LUFS
// 6. the checks, written to out/checks.json and out/checks.md; measured and status back into plan.json
//    (round 1 also kept as out/checks-round1.json and .md)
// 7. the fix round (D-67): every scene with a hard failure gets one rebuild call carrying its failures and
//    its stills; it is re-rendered and re-checked; at most two rounds per scene (--no-fix skips it)
// 8. time and tokens per step and scene to out/cost.json; the run stops at --cap and says so
// 9. out/report.md, with both rounds
// The model key is OPENROUTER_API_KEY (environment or app/.env.local), never printed.

import { canvasOf } from './canvas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan, formatReport } from '../validate.mjs';
import { Ledger, CapReached, loadKey, DEFAULT_MODEL, DEFAULT_CAP_USD, recordedFetch, recordingFetch } from './model.mjs';
import { ROOT, SCAFFOLD, GALLERY_LIB, openFonts, rendererTraps } from './craft.mjs';
import { designerPass, kitCss, kitSheetFrame, KIT_FILES } from './kit.mjs';
import { buildScene, parallel, lintProject, scratchHost } from './frames.mjs';
import { assembleIndex } from './assemble.mjs';
import { renderProject, sceneStills, frameSheet, probeVideo } from './render.mjs';
import { narrate, mixAudio, musicFor } from './audio.mjs';
import { runChecks, applyToPlan, checksMarkdown, probeScenes } from './checks.mjs';
import { probeComposition } from './composition.mjs';
import { still } from './render.mjs';
import { reportMarkdown } from './report.mjs';

const typeFamily = (r) => (typeof r === 'string' ? r : r.family);

export function parseArgs(argv) {
  const args = { projectDir: null, cap: DEFAULT_CAP_USD, only: null, model: DEFAULT_MODEL, parallel: 4, fixtures: null, record: null, voice: null, workers: 'auto', fix: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--cap') args.cap = Number(next());
    else if (a === '--only') args.only = next();
    else if (a === '--model') args.model = next();
    else if (a === '--parallel') args.parallel = Number(next());
    else if (a === '--fixtures') args.fixtures = next();
    else if (a === '--record') args.record = next();
    else if (a === '--voice') args.voice = next();
    else if (a === '--workers') args.workers = next();
    else if (a === '--no-fix') args.fix = false;
    else if (!a.startsWith('--')) args.projectDir = a;
  }
  return args;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(`${f}.tmp`, JSON.stringify(o, null, 2) + '\n'); fs.renameSync(`${f}.tmp`, f); };

/** Copy what the frames reference into <project>/assets: gsap, the fonts, the captured pages, the music. */
export function prepareAssets(projectDir, plan) {
  const assets = path.join(projectDir, 'assets');
  fs.mkdirSync(path.join(assets, 'scout'), { recursive: true });
  fs.mkdirSync(path.join(assets, 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(assets, 'music'), { recursive: true });
  if (fs.existsSync(GALLERY_LIB)) fs.copyFileSync(GALLERY_LIB, path.join(assets, 'gsap.min.js'));
  // fonts: the direction's families from the open-font set when the project has none
  const have = fs.readdirSync(path.join(assets, 'fonts')).filter((f) => /\.woff2?$/.test(f));
  if (!have.length) {
    const families = new Set(Object.values(plan.direction.type).map(typeFamily));
    for (const f of openFonts()) if (families.has(f.family)) for (const face of f.faces) if (fs.existsSync(face.file)) fs.copyFileSync(face.file, path.join(assets, 'fonts', path.basename(face.file)));
  }
  for (const s of plan.video.sources) {
    const src = path.join(projectDir, s.path);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(assets, 'scout', path.basename(s.path)));
  }
  const music = musicFor(plan.direction, projectDir);
  if (music?.abs && !music.own) fs.copyFileSync(music.abs, path.join(assets, 'music', music.file));
  return { music: music ? { ...music, path: music.abs ? `assets/music/${music.file}` : null } : null };
}

/** Stills of the whole video at the middle of every overlapping transition, for the eye (out/stills/seam-*.jpg). */
function seamStills(plan, outDir, assembled) {
  const video = path.join(outDir, 'video.mp4');
  if (!assembled || !fs.existsSync(video)) return [];
  const made = [];
  for (const b of assembled.boundaries || []) {
    const t = Math.round((b.at + b.dur / 2) * 100) / 100;
    const f = path.join(outDir, 'stills', `seam-${b.from}-${b.to}-t${t.toFixed(2)}.jpg`);
    if (still(video, t, f)) made.push(f);
  }
  return made;
}

/** The kit's files for the builder prompts. */
function readKit(projectDir) {
  const r = (f) => (fs.existsSync(path.join(projectDir, f)) ? fs.readFileSync(path.join(projectDir, f), 'utf8') : '');
  return { readme: r('kit/README.md'), tokens: r('kit/tokens.css'), components: r('kit/components.css'), componentsHtml: r('kit/components.html'), css: kitCss(projectDir) };
}

/** Lint the kit through a sheet frame mounted in a scratch host. */
async function lintKitSheet(projectDir, plan) {
  const id = 'kit-sheet';
  fs.mkdirSync(path.join(projectDir, 'compositions', 'frames'), { recursive: true });
  const { finishFrame } = await import('./frames.mjs');
  const fin = finishFrame(kitSheetFrame(projectDir, plan, { id }), { id, duration: 2, width: canvasOf(plan).W, height: canvasOf(plan).H, kitCss: kitCss(projectDir) });
  fs.writeFileSync(path.join(projectDir, 'compositions', 'frames', `${id}.html`), fin.html);
  scratchHost(projectDir, plan, { id, duration_s: 2 });
  const lint = lintProject(path.join(projectDir, 'production', 'build', id));
  fs.writeFileSync(path.join(projectDir, 'production', 'kit-lint.txt'), lint.raw);
  return lint;
}

/** A still of the kit sheet (headless browser, no render) for the report. */
async function kitSheetStill(projectDir) {
  try {
    const { chromium } = await import('playwright');
    const { probePage } = await import('./render.mjs');
    const file = probePage(projectDir, { id: 'kit-sheet' });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: canvasOf(plan).W, height: canvasOf(plan).H } });
      await page.goto('file://' + file, { waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.__timelines && window.__timelines['kit-sheet']), null, { timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { window.__timelines['kit-sheet'].seek(1, false); });
      await page.screenshot({ path: path.join(projectDir, 'kit', 'sheet.jpg'), type: 'jpeg', quality: 80 });
    } finally { await browser.close(); }
    return 'kit/sheet.jpg';
  } catch { return null; }
}

/**
 * Run the production step. Returns { projectDir, plan, checks, cost, report, stoppedAtCap, seconds }.
 * @param {ReturnType<typeof parseArgs>} args
 * @param {{ log?: (s: string) => void, fetchImpl?: typeof fetch, voiceProvider?: object }} [opts]
 */
export async function runProduction(args, opts = {}) {
  if (process.env.ULTRADEMO_MODE === 'agent' && !args.fixtures && !opts.fetchImpl) throw new Error('In agent mode the agent builds every scene itself, one at a time: node plan/production/scene.mjs prepare <project> (the rules: plan/production/AGENT.md). This command is the API-mode builder.');
  const log = opts.log || ((s) => console.log(s));
  const t0 = Date.now();
  const projectDir = path.resolve(args.projectDir);
  const planPath = path.join(projectDir, 'plan.json');
  if (!fs.existsSync(planPath)) throw new Error(`${planPath} not found; confirm a direction first`);
  const planInput = readJson(planPath);

  // 1. validate; statuses
  const v = validatePlan(planInput);
  if (!v.ok || !v.plan) throw new Error(`the plan does not validate:\n${formatReport(v.problems.filter((p) => p.level === 'error'))}`);
  const plan = v.plan;
  const only = args.only;
  if (only) {
    const s = plan.scenes.find((x) => x.id === only);
    if (!s) throw new Error(`--only ${only}: no scene with that id`);
    if (!['fix', 'sketched'].includes(s.status)) throw new Error(`--only ${only}: the scene is ${s.status}; only a scene marked fix (or still sketched) is rebuilt`);
    if (!KIT_FILES.every((f) => fs.existsSync(path.join(projectDir, f)))) throw new Error(`--only ${only}: the kit is missing; run the whole step first`);
  } else {
    const notSketched = plan.scenes.filter((s) => s.status !== 'sketched');
    if (notSketched.length) throw new Error(`every scene must be sketched before production; ${notSketched.map((s) => `${s.id} is ${s.status}`).join(', ')}. Use --only <scene-id> to rebuild one scene marked fix.`);
  }

  if (args.voice) process.env.ULTRADEMO_VOICE = args.voice;
  const outDir = path.join(projectDir, 'out');
  const prodDir = path.join(projectDir, 'production');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(prodDir, { recursive: true });
  const timings = { steps: {}, wall_s: 0 };
  const timed = async (name, fn) => { const s = Date.now(); try { return await fn(); } finally { timings.steps[name] = Math.round((Date.now() - s) / 100) / 10; } };

  // the model transport
  let fetchImpl = opts.fetchImpl || globalThis.fetch;
  let key = 'recorded';
  if (args.fixtures && !opts.fetchImpl) fetchImpl = recordedFetch(path.resolve(args.fixtures));
  else if (!args.fixtures) {
    key = loadKey(ROOT);
    if (!key) throw new Error('No OPENROUTER_API_KEY in the environment or app/.env.local; pass --fixtures <dir> to replay a recorded run.');
    if (args.record) fetchImpl = recordingFetch(path.resolve(args.record), fetchImpl);
  }
  const ledger = new Ledger(args.cap, path.join(outDir, 'cost.json'));
  if (only && fs.existsSync(path.join(outDir, 'cost.json'))) { try { ledger.calls.push(...(readJson(path.join(outDir, 'cost.json')).calls || [])); } catch { /* fresh */ } }
  const ctx = { model: args.model, key, ledger, fetchImpl };
  const result = { projectDir, plan: null, checks: null, cost: null, report: null, stoppedAtCap: false, seconds: 0, builds: [], kit: null, rounds: [] };
  const sigFile = path.join(projectDir, 'direction', 'frames', plan.direction.chosen, 'signature', 'index.html');
  const signatureHtml = fs.existsSync(sigFile) ? fs.readFileSync(sigFile, 'utf8') : '';

  const finish = async (stoppedAtCap = false) => {
    timings.wall_s = Math.round((Date.now() - t0) / 100) / 10;
    const cost = { ...ledger.toJSON(), model: args.model, timings, stopped_at_cap: stoppedAtCap, scenes: Object.fromEntries(result.builds.map((b) => [b.id, { seconds: b.seconds, calls: b.calls, cost_usd: Math.round(ledger.calls.filter((c) => c.scene === b.id).reduce((a, c) => a + (c.cost_usd || 0), 0) * 1e6) / 1e6, ok: b.ok, repaired: b.repaired }])) };
    writeJson(path.join(outDir, 'cost.json'), cost);
    result.cost = cost;
    const report = reportMarkdown({ plan, checks: result.checks, cost, timings, kit: result.kit, builds: result.builds, assembled: result.assembled, mix: result.mix, voices: result.voices || [], stoppedAtCap, only, rounds: result.rounds });
    fs.writeFileSync(path.join(outDir, 'report.md'), report);
    result.report = report;
    result.stoppedAtCap = stoppedAtCap;
    result.seconds = timings.wall_s;
    log(`${ledger.line()} · ${timings.wall_s}s wall${stoppedAtCap ? ' · STOPPED AT THE CAP' : ''}`);
    log(`report: ${path.join(outDir, 'report.md')}`);
    return result;
  };

  try {
    // assets
    const { music } = prepareAssets(projectDir, plan);

    // 2. the designer pass
    if (!only) {
      result.kit = await timed('designer', () => designerPass({ plan, projectDir, ...ctx, log, lintKit: () => lintKitSheet(projectDir, plan) }));
      const sheet = await kitSheetStill(projectDir);
      result.kit.parts = `${(result.kit.files['kit/components.html'].match(/<!--\s*part:/g) || []).length} parts${sheet ? `, sheet at ${sheet}` : ''}`;
      log(`kit: ${result.kit.parts} in ${result.kit.seconds}s`);
    } else result.kit = { files: {}, repaired: false, seconds: 0, parts: 'kept from the earlier run' };

    // 3. the frame builders
    const kit = readKit(projectDir);
    const traps = rendererTraps();
    const indices = plan.scenes.map((s, i) => i).filter((i) => !only || plan.scenes[i].id === only);
    result.builds = await timed('frames', () => parallel(indices, Math.max(1, args.parallel), (i) => buildScene({ plan, index: i, projectDir, kit, traps, signatureHtml, ...ctx, log })));
    if (only) {
      // the other scenes keep their earlier build records when they exist
      const prev = fs.existsSync(path.join(outDir, 'checks.json')) ? readJson(path.join(outDir, 'checks.json')) : null;
      for (const s of plan.scenes) if (s.id !== only) result.builds.push({ id: s.id, ok: fs.existsSync(path.join(projectDir, 'compositions', 'frames', `${s.id}.html`)), lint: { errors: prev?.scenes?.find((x) => x.id === s.id)?.measured?.lint_errors ?? 0, warnings: 0, text: '' }, check: null, problems: [], calls: 0, seconds: 0, repaired: false, kept: true });
      result.builds.sort((a, b) => plan.scenes.findIndex((s) => s.id === a.id) - plan.scenes.findIndex((s) => s.id === b.id));
    }

    // 4. narration and index.html
    result.voices = await timed('narration', () => narrate({ plan, projectDir, provider: opts.voiceProvider || null, log }));
    const fps = plan.video.fps;
    const builtSet = () => new Set(result.builds.filter((b) => b.ok).map((b) => b.id));
    const assemble = async () => {
      const built = builtSet();
      const assemblePlan = { ...plan, scenes: plan.scenes.filter((s) => built.has(s.id) && fs.existsSync(path.join(projectDir, 'compositions', 'frames', `${s.id}.html`))) };
      if (!assemblePlan.scenes.length) { log('nothing to assemble: no scene was built'); result.assembled = null; return; }
      // scenes that failed leave a gap; the video still assembles from what exists, contiguous in time
      let t = 0;
      assemblePlan.scenes = assemblePlan.scenes.map((s) => { const n = { ...s, start_s: t }; t = Math.round((t + s.duration_s) * 1000) / 1000; return n; });
      result.assembled = assembleIndex({ plan: assemblePlan, projectDir, voices: result.voices.filter((v) => built.has(v.id)), music: music?.path ? { path: music.path, usable_from_s: music.usable_from_s } : null });
      log(`index.html: ${result.assembled.clips.length} scenes, ${result.assembled.boundaries.length} transition(s), ${result.assembled.shaderCount ? `${result.assembled.shaderCount} shader` : 'CSS'}`);
    };
    const renderScenes = async (ids) => parallel(ids, 2, async (id) => { renderProject(path.join(prodDir, 'build', id), path.join(outDir, 'scenes', `${id}.mp4`), { fps, workers: 2, log }); });
    const renderWhole = async () => {
      const built = builtSet();
      if (result.assembled) {
        const silent = path.join(outDir, 'video-render.mp4');
        const r = renderProject(projectDir, silent, { fps, workers: args.workers, log });
        if (r.ok) {
          const total = result.assembled.total;
          result.mix = mixAudio({ video: silent, out: path.join(outDir, 'video.mp4'), duration: total, music: music?.abs ? { abs: music.abs, usable_from_s: music.usable_from_s } : null, voices: result.voices.filter((v) => v.path && built.has(v.id)).map((v) => ({ ...v, path: path.join(projectDir, v.path) })) });
          if (!result.mix.ok) { fs.copyFileSync(silent, path.join(outDir, 'video.mp4')); log(`mix: ${result.mix.reason}`); }
          else log(`mix: ${result.mix.measured?.lufs ?? '?'} LUFS, true peak ${result.mix.measured?.true_peak_dbtp ?? '?'} dBTP`);
          writeJson(path.join(outDir, 'mix.json'), result.mix);
        } else { log(`the whole video did not render: ${r.log.split('\n').slice(-3).join(' ')}`); fs.writeFileSync(path.join(outDir, 'render-error.txt'), r.log); }
      }
      try { fs.rmSync(path.join(outDir, 'stills'), { recursive: true, force: true }); } catch { /* none */ }
      const stills = sceneStills(plan, outDir, { fps });
      if (frameSheet(stills, path.join(outDir, 'sheet.jpg'))) log(`stills: ${stills.length} event frames, sheet at out/sheet.jpg`);
      seamStills(plan, outDir, result.assembled);
    };
    const check = async (round) => {
      const built = builtSet();
      const live = { ...plan, scenes: plan.scenes.filter((s) => built.has(s.id)) };
      const probes = await probeScenes({ plan: live, projectDir, log });
      const composition = await probeComposition({ plan: live, projectDir, log });
      const checks = runChecks({ plan, projectDir, outDir, probes, composition, buildResults: Object.fromEntries(result.builds.map((b) => [b.id, b])), voices: result.voices, mix: result.mix });
      checks.round = round;
      // only measured, status (and review, untouched) change in the plan; a scoped revision keeps the other scenes' records
      const fresh = readJson(planPath);
      if (only) checks.scenes = checks.scenes.map((c) => (c.id === only ? c : { ...c, measured: fresh.scenes.find((s) => s.id === c.id)?.measured || c.measured, status: fresh.scenes.find((s) => s.id === c.id)?.status || c.status, reason: 'kept from the earlier run' }));
      checks.summary.built = checks.scenes.filter((s) => s.status === 'built').length;
      checks.summary.fix = checks.scenes.filter((s) => s.status === 'fix').length;
      return { checks, fresh };
    };
    const writeChecks = (checks, fresh, suffix = '') => {
      writeJson(path.join(outDir, `checks${suffix}.json`), checks);
      fs.writeFileSync(path.join(outDir, `checks${suffix}.md`), checksMarkdown(checks, plan));
      if (!suffix) { result.checks = checks; applyToPlan(fresh, checks); writeJson(planPath, fresh); result.plan = fresh; }
      log(`checks (round ${checks.round}): ${checks.summary.built} built, ${checks.summary.fix} to fix${checks.video.rendered ? `; motion/s ${checks.video.motion_per_s}, still ${Math.round(checks.video.still_time * 100)}%, longest still ${checks.video.longest_still_s} s` : ''}`);
    };
    const roundRecord = (checks, extra = {}) => ({ round: checks.round, ...extra, scenes: checks.scenes.map((c) => ({ id: c.id, status: c.status, reason: c.reason, failures: c.checks.filter((x) => x.level === 'fail').map((x) => x.text) })), video: checks.video.rendered ? { motion_per_s: checks.video.motion_per_s, still_time: checks.video.still_time, longest_still_s: checks.video.longest_still_s } : null });

    await timed('assemble', assemble);
    // 5. renders, stills, the mix
    await timed('render', async () => { await renderScenes(plan.scenes.filter((s) => builtSet().has(s.id) && (!only || s.id === only)).map((s) => s.id)); await renderWhole(); });
    // 6. the checks, round 1
    let { checks, fresh } = await timed('checks', () => check(1));
    result.rounds.push(roundRecord(checks));

    // 7. the fix round: one rebuild per scene with a hard failure, re-rendered and re-checked (two rounds at most)
    const toFix = args.fix === false ? [] : checks.scenes.filter((c) => c.status === 'fix' && (!only || c.id === only) && c.hard.some((h) => !/^copy over its cap$/.test(h)));
    if (toFix.length) {
      writeChecks(checks, fresh, '-round1');
      log(`fix round: ${toFix.length} scene(s) with a hard failure: ${toFix.map((c) => c.id).join(', ')}`);
      const fixDir = path.join(prodDir, 'fix');
      fs.mkdirSync(fixDir, { recursive: true });
      let capped = false;
      const fixRecords = await timed('fix', () => parallel(toFix, Math.max(1, args.parallel), async (c) => {
        const index = plan.scenes.findIndex((s) => s.id === c.id);
        const scene = plan.scenes[index];
        const frameFile = path.join(projectDir, 'compositions', 'frames', `${c.id}.html`);
        const previous = fs.existsSync(frameFile) ? fs.readFileSync(frameFile, 'utf8') : '';
        if (previous) fs.writeFileSync(path.join(prodDir, 'frames', `${c.id}.round1.html`), previous);
        const failures = c.checks.filter((x) => x.level === 'fail').map((x) => x.text);
        const clip = path.join(outDir, 'scenes', `${c.id}.mp4`);
        const stills = [];
        if (fs.existsSync(clip)) {
          const at = [...new Set((c.composition_findings || []).filter((f) => f.level === 'fail' && typeof f.start_s === 'number').map((f) => Math.round((f.start_s + 0.15) * 100) / 100))].slice(0, 3);
          if (!at.length || (c.composition_findings || []).some((f) => f.type === 'transition')) at.push(Math.max(0.05, scene.duration_s - 0.1));
          if (at.length < 2) at.unshift(Math.min(scene.duration_s / 2, 1.5));
          for (const t of at.slice(0, 4)) { const f = path.join(fixDir, `${c.id}-t${t.toFixed(2)}.jpg`); if (still(clip, Math.min(t, scene.duration_s - 0.04), f, { width: 960 })) stills.push({ file: f, t }); }
        }
        if (capped) return { id: c.id, rebuilt: false, why: 'the cost cap was reached before this rebuild' };
        try {
          const b = await buildScene({ plan, index, projectDir, kit, traps, signatureHtml, ...ctx, log, fix: { round: 2, failures, stills, previous } });
          if (b.ok) {
            const k = result.builds.findIndex((x) => x.id === c.id);
            const prevCalls = k >= 0 ? result.builds[k].calls : 0;
            const merged = { ...b, calls: prevCalls + b.calls, round1: k >= 0 ? { calls: result.builds[k].calls, seconds: result.builds[k].seconds, repaired: result.builds[k].repaired } : null, fixed: true };
            if (k >= 0) result.builds[k] = merged; else result.builds.push(merged);
            return { id: c.id, rebuilt: true, calls: b.calls, seconds: b.seconds };
          }
          if (previous) { fs.writeFileSync(frameFile, previous); scratchHost(projectDir, plan, scene); }
          const why = b.problems[0]?.split('\n')[0] || 'the rebuild failed';
          return { id: c.id, rebuilt: false, why: /no recording/.test(why) ? 'replayed run: no recorded answer for the fix call' : /OpenRouter answered|connection failed|timed out/.test(why) ? `the model call failed (${why.slice(0, 160)}); the round-1 frame is kept` : `the rebuild did not pass lint or the runtime probe (${why}); the round-1 frame is kept` };
        } catch (err) {
          if (previous) { fs.writeFileSync(frameFile, previous); scratchHost(projectDir, plan, scene); }
          if (err instanceof CapReached || err?.name === 'CapReached') { capped = true; result.stoppedAtCap = true; return { id: c.id, rebuilt: false, why: 'the cost cap was reached before this rebuild' }; }
          return { id: c.id, rebuilt: false, why: err.message };
        }
      }));
      const rebuilt = fixRecords.filter((x) => x.rebuilt).map((x) => x.id);
      for (const x of fixRecords) log(`  fix ${x.id}: ${x.rebuilt ? 'rebuilt' : `not rebuilt (${x.why})`}`);
      if (rebuilt.length) {
        await timed('render-2', async () => { await assemble(); await renderScenes(rebuilt); await renderWhole(); });
        ({ checks, fresh } = await timed('checks-2', () => check(2)));
      } else checks = { ...checks, round: 2 };
      result.rounds.push(roundRecord(checks, { rebuilt, not_rebuilt: fixRecords.filter((x) => !x.rebuilt).map((x) => ({ id: x.id, why: x.why })) }));
      result.capped_in_fix = capped;
    }
    writeChecks(checks, fresh);
    if (result.stoppedAtCap) return await finish(true);
    return await finish(false);
  } catch (err) {
    if (err instanceof CapReached || err?.name === 'CapReached') {
      log(err.message);
      await finish(true);
      const e = new Error(err.message); e.name = 'CapReached'; e.result = result; throw e;
    }
    throw err;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectDir || !Number.isFinite(args.cap)) {
    console.error('usage: node plan/production/run.mjs <project-dir> [--cap 5.00] [--only <scene-id>] [--model ...] [--parallel 4] [--fixtures <dir>] [--record <dir>]');
    process.exit(2);
  }
  runProduction(args).then((r) => {
    process.exit(r.checks && r.checks.summary.fix === 0 ? 0 : 1);
  }).catch((err) => {
    console.error(err.name === 'CapReached' ? err.message : `Stopped: ${err.message}`);
    process.exit(1);
  });
}
