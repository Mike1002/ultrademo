#!/usr/bin/env node
// run.mjs — the direction step of the skill v2 (step 2 of five, D-44; three screens, D-65).
//
//   node plan/direction/run.mjs <project-dir> [--port 4322] [--model ...] [--cheap-model ...] [--cap 3.00]
//                               [--style <gallery-id>|brand|auto] [--frames hyperframes|playwright]
//                               [--site-dir <folder>] [--fixtures <dir>] [--record <dir>] [--skip-scout] [--no-serve] [--max-pages 4]
//
// Reads <project-dir>/plan.json (the video block the intake wrote), then:
//   1. reads the site (public pages only) into <project-dir>/scout/
//   2. fills every Unsure field with a proposal, marked as proposed
//   3. serves the style screen (/style): the user picks a video style, "derived from your brand", or leaves it to the skill
//   4. with the style chosen, asks the model for three directions inside it, judges them, keeps two or three
//   5. draws a sketch storyboard per direction and renders each direction's signature moment
//   6. serves the direction screen (/direction), then the refine screen (/refine); confirm writes direction + scene skeletons
//   7. writes <project-dir>/direction/ (proposals, state, prompt, sketches, frames, reasoning, cost)
// --style skips the style screen (the tests and a scripted run). A hard cost cap (--cap, default $3.00) stops the run and says so.

import { learningsFor } from '../learnings.mjs';
import { listenOnFree, recordPage } from '../pages.mjs';
import fs from 'node:fs';
import { openInBrowser } from '../open.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSite, serveStatic } from './scout.mjs';
import { Ledger, CapReached, DEFAULT_MODEL, DEFAULT_CHEAP_MODEL, DEFAULT_CAP_USD, loadKey, brandRead, applyProposals, proposeDirections, judge, recordedFetch, recordingFetch } from './propose.mjs';
import { renderSketch } from './sketch.mjs';
import { buildFrames, openFonts, fontFaces, ROOT } from './frames.mjs';
import { startServer, writeJson, readJson, voiceFor, readState, writeState } from './serve.mjs';
import { BAND_NAMES, LETTERS } from './schema.mjs';
import { agentMode, agentFetch, useProjectTasks, exitIfAwaiting } from '../agent.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BANDS = path.join(ROOT, 'research/reference-videos/tools/bands-by-template.json');
const BLUEPRINTS = path.join(ROOT, 'research/motion-craft/2026-10-13-hyperframes-skills/skills/hyperframes-animation/blueprints-index.md');
const GALLERY = path.join(ROOT, 'research/motion-craft/video-style-gallery');
const STYLE_INDEX = path.join(GALLERY, 'index.json');
const MUSIC_DIR = path.join(ROOT, 'scaffold/music');
const CURATED = path.join(MUSIC_DIR, 'curated.json');
const MUSIC_METRICS = path.join(HERE, 'fixtures', 'music-metrics.json');

export { voiceFor };

export function parseArgs(argv) {
  const args = { projectDir: null, port: 4322, model: DEFAULT_MODEL, cheapModel: DEFAULT_CHEAP_MODEL, cap: DEFAULT_CAP_USD, style: null, frames: 'hyperframes', siteDir: null, fixtures: null, record: null, skipScout: false, serve: true, maxPages: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--port') args.port = Number(next());
    else if (a === '--model') args.model = next();
    else if (a === '--cheap-model') args.cheapModel = next();
    else if (a === '--cap') args.cap = Number(next());
    else if (a === '--style') args.style = next();
    else if (a === '--frames') args.frames = next();
    else if (a === '--site-dir') args.siteDir = next();
    else if (a === '--fixtures') args.fixtures = next();
    else if (a === '--record') args.record = next();
    else if (a === '--skip-scout') args.skipScout = true;
    else if (a === '--agent') process.env.ULTRADEMO_MODE = 'agent';
    else if (a === '--no-serve') args.serve = false;
    else if (a === '--max-pages') args.maxPages = Number(next());
    else if (!a.startsWith('--')) args.projectDir = a;
  }
  return args;
}

/**
 * The curated music list (scaffold/music/curated.json, D-65): only these tracks
 * are proposed or offered, each with its set, usable-from offset, measured tempo
 * and beat strength, mood tags, and the attribution line's creator and licence.
 */
export function musicLibrary() {
  const curated = readJson(CURATED, { tracks: [] }).tracks || [];
  const metrics = readJson(MUSIC_METRICS, { tracks: {} }).tracks || {};
  const attribution = fs.existsSync(path.join(MUSIC_DIR, 'ATTRIBUTION.md')) ? fs.readFileSync(path.join(MUSIC_DIR, 'ATTRIBUTION.md'), 'utf8') : '';
  const rows = Object.fromEntries([...attribution.matchAll(/^\| ([^|]+\.(?:mp3|ogg)) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => [m[1].trim(), { title: m[2].trim(), creator: m[3].trim(), source: m[4].trim(), licence: m[5].trim().split(' (')[0] }]));
  return curated.filter((t) => fs.existsSync(path.join(MUSIC_DIR, t.file))).map((t) => ({
    file: t.file, title: t.title, set: t.set || 'energetic', usable_from_s: Number(t.usable_from_s) || 0, mood: t.mood || [], note: t.note || '',
    creator: rows[t.file]?.creator || '', licence: rows[t.file]?.licence || '',
    bpm: t.bpm ?? metrics[t.file]?.bpm ?? null, beat_strength: t.beat_strength ?? metrics[t.file]?.beatStrength ?? null, rms: metrics[t.file]?.rms ?? null,
  }));
}

/** The pace band for a template from the measured references. */
export function paceFor(template) {
  const j = readJson(BANDS, null);
  const t = j?.by_template?.[BAND_NAMES[template]];
  const m = t?.metrics?.scenes_per_min;
  if (!m) return { shots_per_min: [12, 24], median: 18, thin: true, n: 0 };
  return { shots_per_min: [Math.round(m.low), Math.round(m.high)], median: Math.round(m.median), thin: Boolean(t.thin), n: t.n };
}

export function blueprintList() {
  if (!fs.existsSync(BLUEPRINTS)) return [];
  const md = fs.readFileSync(BLUEPRINTS, 'utf8');
  return [...md.matchAll(/<blueprint id="([a-z0-9-]+)" roles="([^"]+)"/g)].map((m) => ({ id: m[1], roles: m[2] }));
}

/** The gallery list for the style screen and the prompt. */
export function styleList() {
  const j = readJson(STYLE_INDEX, { entries: [] });
  // the gallery's own words say "film" once; the page says video (D-37)
  return (j.entries || []).map((s) => ({ id: s.id, name: s.name, canvas: s.canvas, mood: s.mood || [], suits: (s.suits || []).map((x) => String(x).replace(/\bfilm\b/gi, 'video')), display: s.fonts?.display || '', palette: s.palette || null, text_animation: s.text_animation || null, transition: s.transition || null, energy: s.energy || null }));
}

/** A style's definition from the gallery (<id>/style.json), compact, for the prompt and the page. */
export function styleDefinition(id) {
  const file = path.join(GALLERY, id, 'style.json');
  if (!/^[a-z0-9-]+$/.test(String(id)) || !fs.existsSync(file)) return null;
  const s = readJson(file);
  const type = {};
  for (const role of ['display', 'body', 'mono', 'label']) if (s.type?.[role]) type[role] = { family: s.type[role].family, weight: s.type[role].weight, transform: s.type[role].transform, tracking: s.type[role].tracking };
  return { id: s.id || id, name: s.name || id, canvas: s.canvas, mood: s.mood || [], palette: s.palette || {}, type, easing: s.easing || null, rhythm: s.rhythm || null, transition: s.transition || null, text_animation: s.text_animation || null, notes: s.notes || '' };
}

/** The user's style choice → what the prompt and the repair get: 'brand', null (auto), or a definition. Throws on an unknown id. */
export function resolveStyleChoice(choice) {
  if (!choice || choice === 'auto') return null;
  if (choice === 'brand') return 'brand';
  const def = styleDefinition(choice);
  if (!def) throw new Error(`"${choice}" is not a video style in the gallery (research/motion-craft/video-style-gallery/index.json)`);
  return def;
}

const dirOf = (projectDir) => path.join(projectDir, 'direction');

/** The ledger of this project, continuing cost.json so the whole step counts against one cap. */
function ledgerFor(projectDir, cap) {
  const file = path.join(dirOf(projectDir), 'cost.json');
  const prior = readJson(file, null);
  const ledger = new Ledger(cap, file);
  if (prior?.calls?.length) ledger.calls.push(...prior.calls);
  return ledger;
}

/** The model transport: a recording to replay, or a live key that may also record. Returns { fetchImpl, key }. */
function transport(opts) {
  // agent mode (D-68): the agent running the skill answers every model step from task files
  if (agentMode() && !opts.fixtures) return { fetchImpl: agentFetch(useProjectTasks(opts.projectDir)), key: 'agent' };
  if (opts.fetchImpl && opts.fixtures) return { fetchImpl: opts.fetchImpl, key: 'recorded' };
  if (opts.fixtures) return { fetchImpl: recordedFetch(path.resolve(opts.fixtures)), key: 'recorded' };
  const key = loadKey(ROOT);
  if (!key) throw new Error('No OPENROUTER_API_KEY in the environment or app/.env.local; pass --fixtures <dir> to replay a recorded run.');
  let fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (opts.record) fetchImpl = recordingFetch(path.resolve(opts.record), fetchImpl);
  return { fetchImpl, key };
}

/**
 * Steps 1 and 2: the site read and the brand read. Writes direction/proposals.json
 * at stage "style" (no directions yet) and direction/state.json.
 * @returns {Promise<{ projectDir, proposals, ledger, seconds }>}
 */
export async function prepareDirection(args, opts = {}) {
  const log = opts.log || ((s) => console.log(s));
  const t0 = Date.now();
  const projectDir = path.resolve(args.projectDir);
  const planPath = path.join(projectDir, 'plan.json');
  const plan = readJson(planPath);
  if (!plan?.video) throw new Error(`${planPath} has no video block; run the intake first (node plan/intake/serve.mjs ${projectDir})`);
  const dirDir = dirOf(projectDir);
  fs.mkdirSync(dirDir, { recursive: true });
  const ledger = new Ledger(args.cap, path.join(dirDir, 'cost.json'));
  const { fetchImpl, key } = transport({ ...args, fetchImpl: opts.fetchImpl, projectDir });

  // 1. the site
  let site = null;
  // the learnings kept from earlier videos for this brand (switched on in the dashboard) go to the directions prompt
  let video = { ...plan.video, intake: { ...(plan.video.intake || {}), learnings: learningsFor(plan.video) } };
  if (args.siteDir) { site = await serveStatic(path.resolve(args.siteDir)); video = { ...video, url: site.url }; log(`site fixture served at ${site.url}`); }
  let scout;
  try {
    const reportFile = path.join(projectDir, 'scout', 'report.json');
    // a re-run in agent mode (after the agent answered a task) reuses the site read it already made
    if ((args.skipScout || agentMode()) && fs.existsSync(reportFile)) { scout = readJson(reportFile); log('site read: reusing scout/report.json'); }
    else { log(`site read: ${video.url}`); scout = await readSite({ url: video.url, outDir: projectDir, maxPages: args.maxPages, log: (s) => log(`  ${s}`) }); }
  } finally { if (site) await site.close(); }
  if (args.siteDir) video = { ...video, url: plan.video.url }; // keep the brief's own address in the plan

  // 2. the brand read and the proposals
  log(`brand read (${args.cheapModel})`);
  const brandRes = await brandRead({ video, scout, projectDir, model: args.cheapModel, key, ledger, fetchImpl, log: (s) => log(`  ${s}`) });
  const brand = brandRes.data;
  writeJson(path.join(dirDir, 'brand-read.json'), brand);
  video = applyProposals(video, brand);
  if (video.intake?.proposed) for (const [f, p] of Object.entries(video.intake.proposed)) log(`  proposed ${f}: ${JSON.stringify(p.value)}`);

  const proposals = { ...baseProposals({ video, brand, scout, args }), stage: 'style', style: null, directions: [], dropped: [], reasoning: '' };
  writeJson(path.join(dirDir, 'proposals.json'), proposals);
  writeState(projectDir, { stage: 'style', style: null, chosen: null });
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  log(`${ledger.line()} · ${seconds}s`);
  return { projectDir, proposals, ledger, seconds };
}

/** Everything the screens and the directions call draw on, from the brief, the brand read and the site read. */
function baseProposals({ video, brand, scout, args }) {
  const scoutById = Object.fromEntries(scout.claims.map((c) => [c.id, c]));
  const pageTitle = Object.fromEntries(scout.pages.map((p) => [p.url, p.title]));
  const claims = brand.claims.filter((c) => scoutById[c.id]).map((c) => ({ id: c.id, text: scoutById[c.id].text, short: c.short, page: scoutById[c.id].page, page_title: pageTitle[scoutById[c.id].page] || '', kind: c.kind, use: c.use && c.kind !== 'sample' }));
  // the brief's own sources first (HTML mockups and screenshots the user uploaded at intake), then the site capture
  const given = Array.isArray(video.sources) ? video.sources : [];
  const sources = [...given, ...[...scout.pages.filter((p) => p.screenshot).map((p) => ({ id: p.id, kind: 'screenshot', path: p.screenshot, what: `${p.title || p.id} (${p.url})` })), ...(scout.logo ? [{ id: 'logo', kind: 'logo', path: scout.logo, what: `${video.product} logo` }] : [])].filter((s) => !given.some((g) => g.id === s.id))];
  const fonts = openFonts().map((f) => ({ family: f.family, weights: f.weights, faces: f.faces.map((x) => ({ name: path.basename(x.file), weight: x.weight, style: x.style })) }));
  return {
    generated_at: new Date().toISOString(), models: { brand_read: args.cheapModel, directions: args.model },
    video, brand, claims, sources, fonts, styles: styleList(), music: musicLibrary(), pace: paceFor(video.template), blueprints: blueprintList(), voice: voiceFor(video),
    site_fonts: scout.tokens?.fonts || { headings: null, body: null, mono: null },
    scout_notes: scout.notes, scout_pages: scout.pages.map((p) => ({ id: p.id, url: p.url, title: p.title })),
  };
}

/**
 * Steps 4 and 5, after the style is chosen: three directions inside the style,
 * judged, then a sketch storyboard and the signature render per direction.
 * Reads the project folder (plan.json, scout/report.json, direction/brand-read.json,
 * direction/proposals.json), so it runs from the CLI or from the server.
 * @param {string} projectDir
 * @param {string} choice a gallery id, 'brand' or 'auto'
 * @param {object} opts { model, cap, frames, fixtures, record, fetchImpl, log }
 * @returns {Promise<{ proposals, ledger, seconds }>}
 */
export async function proposeForStyle(projectDir, choice, opts = {}) {
  const log = opts.log || ((s) => console.log(s));
  const t0 = Date.now();
  projectDir = path.resolve(projectDir);
  const dirDir = dirOf(projectDir);
  const P = readJson(path.join(dirDir, 'proposals.json'));
  const scout = readJson(path.join(projectDir, 'scout', 'report.json'));
  const brand = P?.brand || readJson(path.join(dirDir, 'brand-read.json'));
  if (!P || !scout || !brand) throw new Error(`no site read in ${projectDir} yet; run node plan/direction/run.mjs ${projectDir} first`);
  const video = P.video;
  const style = resolveStyleChoice(choice);
  const model = opts.model || P.models?.directions || DEFAULT_MODEL;
  const cap = Number.isFinite(opts.cap) ? opts.cap : DEFAULT_CAP_USD;
  const ledger = ledgerFor(projectDir, cap);
  const { fetchImpl, key } = transport({ ...opts, projectDir });
  const { claims, sources, fonts, styles, music, pace, blueprints } = P;
  writeState(projectDir, { stage: 'style', style: { choice, resolved: style === 'brand' ? 'brand' : style ? style.id : null, at: new Date().toISOString() }, chosen: null, working: true });

  // 4. three directions inside the style, judged
  if (ledger.reached) throw new CapReached(ledger);
  log(`directions (${model}) · style: ${style === 'brand' ? 'derived from the brand' : style ? style.name : 'left to the skill'}`);
  const dirRes = await proposeDirections({ video, brand, claims: claims.filter((c) => c.use || c.kind === 'sample'), sources, fonts, styles, music, pace, blueprints, scout, projectDir, style, model, key, ledger, fetchImpl, log: (s) => log(`  ${s}`) });
  const judged = judge(dirRes.data, { fonts, claimIds: new Set(claims.map((c) => c.id)), styleIds: new Set(styles.map((s) => s.id)), musicFiles: music.map((m) => m.file), music, musicPick: video.intake?.music?.file || null, musicOwn: Boolean(video.intake?.music?.own?.path), template: video.template, claim: video.claim, style });
  log(`kept ${judged.directions.length} of ${dirRes.data.directions.length}: ${judged.directions.map((d) => d.name).join(' · ')}${judged.dropped.length ? ` (set aside: ${judged.dropped.map((d) => d.name).join(', ')})` : ''}`);

  // 5. sketches and the signature render
  fs.mkdirSync(path.join(dirDir, 'sketches'), { recursive: true });
  for (let i = 0; i < judged.directions.length; i++) {
    const d = judged.directions[i];
    const letter = LETTERS[i];
    const { css } = fontFaces(d, { urlPrefix: `../frames/${letter}/signature/fonts/` });
    fs.writeFileSync(path.join(dirDir, 'sketches', `${letter}.html`), renderSketch(d, video, { letter, fontCss: css }));
    d.sketch = `direction/sketches/${letter}.html`;
    log(`signature render ${letter} (${opts.frames || 'hyperframes'})`);
    const fr = await buildFrames({ direction: d, video, brand, projectDir, letter, mode: opts.frames || 'hyperframes', log: (s) => log(`  ${s}`) });
    d.frames = { files: fr.files, report: fr.report };
    if (fr.report.lint_errors) log(`  lint: ${fr.report.lint_errors} error(s), see ${fr.files.lint}`);
  }

  // the record; direction edits from an earlier proposal no longer apply
  const proposals = { ...P, generated_at: new Date().toISOString(), models: { ...(P.models || {}), directions: model }, stage: 'direction', style: { choice, resolved: style === 'brand' ? 'brand' : style ? style.id : null, definition: style && style !== 'brand' ? style : null }, directions: judged.directions, dropped: judged.dropped, reasoning: judged.reasoning };
  writeJson(path.join(dirDir, 'proposals.json'), proposals);
  const editsFile = path.join(dirDir, 'edits.json');
  const edits = readJson(editsFile, { edits: [] });
  writeJson(editsFile, { edits: (edits.edits || []).filter((e) => !String(e.path).startsWith('directions.')) });
  fs.writeFileSync(path.join(dirDir, 'reasoning.md'), `# Direction reasoning\n\nStatus: written by plan/direction/run.mjs on ${proposals.generated_at.slice(0, 10)}; models ${P.models?.brand_read || ''} (brand read) and ${model} (directions); video style ${style === 'brand' ? 'derived from the brand' : style ? `${style.name} (${style.id})` : 'left to the skill'}.\n\n## The model's summary\n\n${judged.reasoning}\n\n## The directions, judged\n\n${judged.directions.map((d, i) => `### ${LETTERS[i]} · ${d.name}\n\n${d.idea}\n\n- Signature moment rendered: ${d.frames?.report?.moment?.name || ''} (${d.frames?.report?.moment?.layout || ''} layout, ${d.signature.kind})\n- Serves the claim: ${d.judged.serves_claim}\n- Brand at its best: ${d.judged.brand_at_best}\n- A competitor could use it: ${d.judged.competitor_could_use}\n- Survives a bad day: ${d.judged.survives_bad_day}\n- Score: ${d.judged.score}/10${d.repairs?.length ? `\n- Adjusted locally: ${d.repairs.join('; ')}` : ''}\n`).join('\n')}${judged.dropped.length ? `\n## Set aside\n\n${judged.dropped.map((d) => `- ${d.name}: ${d.why}`).join('\n')}\n` : ''}\n## Cost\n\n${ledger.line()}\n`);
  writeState(projectDir, { stage: 'direction', style: proposals.style, chosen: null });
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  log(`${ledger.line()} · ${seconds}s`);
  log(`written: ${dirDir}`);
  return { proposals, ledger, seconds };
}

/**
 * Run the step. Returns { projectDir, proposals, ledger, seconds }.
 * @param {ReturnType<typeof parseArgs>} args
 * @param {{ log?: (s: string) => void, fetchImpl?: typeof fetch }} [opts]
 */
export async function runDirection(args, opts = {}) {
  const log = opts.log || ((s) => console.log(s));
  const t0 = Date.now();
  const prep = await prepareDirection(args, opts);
  let result = prep;
  if (args.style) {
    const r = await proposeForStyle(prep.projectDir, args.style, { model: args.model, cap: args.cap, frames: args.frames, fixtures: args.fixtures, record: args.record, fetchImpl: opts.fetchImpl, log });
    result = { projectDir: prep.projectDir, proposals: r.proposals, ledger: r.ledger, seconds: 0 };
  }
  result.seconds = Math.round((Date.now() - t0) / 100) / 10;
  if (args.serve) {
    const { url } = await listenOnFree((port) => startServer({ projectDir: prep.projectDir, port, costLine: result.ledger.line(), runOpts: { model: args.model, cap: args.cap, frames: args.frames, fixtures: args.fixtures, record: args.record, log } }), args.port);
    recordPage(prep.projectDir, 'direction', url);
    const state = readState(prep.projectDir);
    log(`Direction step: ${url}${state.stage || 'style'}${openInBrowser(`${url}${state.stage || 'style'}`) ? '  (opened in your browser)' : ''}`);
    log(`Confirm writes: ${path.join(prep.projectDir, 'plan.json')}  (Ctrl+C to stop)`);
  }
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectDir || !Number.isFinite(args.port) || !Number.isFinite(args.cap)) {
    console.error('usage: node plan/direction/run.mjs <project-dir> [--port 4322] [--model ...] [--cheap-model ...] [--cap 3.00] [--style <gallery-id>|brand|auto] [--frames hyperframes|playwright] [--site-dir <folder>] [--fixtures <dir>] [--record <dir>] [--skip-scout] [--no-serve]');
    process.exit(2);
  }
  runDirection(args).catch((err) => {
    exitIfAwaiting(err);
    console.error(err instanceof CapReached ? err.message : `Stopped: ${err.message}`);
    process.exit(1);
  });
}
