// serve.mjs — the direction step's server: three screens and the confirm logic (D-65).
//
//   node plan/direction/serve.mjs <project-dir> [--port 4322] [--fixtures <dir>] [--frames playwright] [--model ...] [--cap 3.00]
//
// Routes: /style (pick a video style), /direction (pick a direction), /refine
// (refine the chosen direction, confirm), /confirmed; "/" sends the user to
// where they are (direction/state.json). Serves direction/proposals.json with
// direction/edits.json applied, saves edits as they are typed, proposes the
// directions when a style is chosen (through run.mjs), and on confirm writes
// the chosen direction and the scene skeletons into <project-dir>/plan.json
// after plan/validate.mjs passes. Same pattern as plan/intake/serve.mjs:
// 127.0.0.1 only, no dependency, no external asset, POSTs from another origin
// refused, writes through a temp file and a rename.

import fs from 'node:fs';
import { openInBrowser } from '../open.mjs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validatePlan } from '../validate.mjs';
import { loadCatalogue, ROOT as CAT_ROOT } from '../catalogue.mjs';
import { findVoice, defaultVoice, SAMPLES_DIR } from '../../tts/catalogue.mjs';
import { sendUi } from '../intake/serve.mjs';
import { toPlanDirection, toSceneSkeletons, copyProblems, LETTERS, DirectionProposalSchema, renameCast } from './schema.mjs';
import { renderStylePage, renderDirectionPage, renderRefinePage, renderConfirmedPage } from './page.mjs';
import { renderSketch } from './sketch.mjs';
import { openFonts, fontFaces, displayWeight, FONTS_DIR } from './frames.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.ULTRADEMO_ROOT || CAT_ROOT;
const MAX_BODY = 2_000_000;

export const ASSET_ROOTS = {
  gallery: path.join(ROOT, 'research/motion-craft/video-style-gallery'),
  motion: path.join(ROOT, 'research/motion-craft/motion-gallery'),
  fonts: FONTS_DIR,
  music: path.join(ROOT, 'scaffold/music'),
  voice: SAMPLES_DIR,
};
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
export const STAGES = ['style', 'direction', 'refine', 'confirmed'];

// ---------------------------------------------------------------------------
// thumbnails (D-82): the five layouts of the refine page's card, or one layout in every size for its lightbox
const thumbJobs = new Map();
async function thumbPreviews(projectDir, P, i, layout) {
  const { renderThumbs, thumbContent, lookFor, TALL } = await import('../thumbnail/render.mjs');
  const { LAYOUTS, SIZES } = await import('../thumbnail/layouts.mjs');
  const crypto = await import('node:crypto');
  const d = P.directions[i];
  const letter = 'ABC'[i] || 'A';
  const sig = path.join(dirOf(projectDir), 'frames', letter, 'signature.jpg');
  const frame = fs.existsSync(sig) ? pathToFileURL(sig).href : null;
  const content = thumbContent({ projectDir, video: P.video, direction: d, beats: (d.moments || []).map((m) => ({ beat: m.beat, copy: m.copy })), frame });
  const look = lookFor(projectDir, d);
  const vertical = (P.video.intake?.formats || []).includes('vertical');
  const one = LAYOUTS.some((l) => l.id === layout);
  const sizes = one ? [...SIZES, ...(vertical ? [TALL] : [])] : [SIZES[0]];
  const layouts = one ? [layout] : LAYOUTS.map((l) => l.id);
  const key = crypto.createHash('sha1').update(JSON.stringify({ look, content: { ...content, logo: (content.logo || '').length }, layouts, sizes: sizes.map((z) => z.id), v: 1 })).digest('hex').slice(0, 12);
  const dir = path.join(dirOf(projectDir), 'thumbs', key);
  const names = layouts.flatMap((l) => sizes.map((z) => `${l}-${z.id}.png`));
  if (!names.every((n) => fs.existsSync(path.join(dir, n)))) {
    if (!thumbJobs.has(key)) thumbJobs.set(key, renderThumbs({ look, content, layouts, sizes, outDir: dir }).finally(() => thumbJobs.delete(key)));
    await thumbJobs.get(key);
  }
  const base = `/project/${path.relative(projectDir, dir).split(path.sep).join('/')}/`;
  return { base, files: names.map((n) => base + n), sizes: sizes.map((z) => ({ id: z.id, label: z.label, use: z.use })), defaults: { title: content.title, line: content.line } };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return file;
}

const dirOf = (projectDir) => path.join(projectDir, 'direction');

/** The motion gallery's index entries (D-57), read once; the Refine screen's motion picker shows them. */
let motionEntries = null;
export function motionGallery() {
  if (motionEntries) return motionEntries;
  const file = path.join(ASSET_ROOTS.motion, 'index.json');
  motionEntries = fs.existsSync(file) ? (readJson(file).entries || []) : [];
  return motionEntries;
}

/** Where the user is: direction/state.json ({ stage, style, chosen }). */
export function readState(projectDir) {
  return readJson(path.join(dirOf(projectDir), 'state.json'), { stage: 'style', style: null, chosen: null });
}
export function writeState(projectDir, state) {
  return writeJson(path.join(dirOf(projectDir), 'state.json'), { ...readState(projectDir), ...state, at: new Date().toISOString() });
}

/** The voice for this brief: Eve or George on the free tier, the user's own account otherwise. */
export function voiceFor(video, { engines } = {}) {
  if (video.narration === 'music-only' || !video.narration) return { tier: 'none', label: 'None (music only)' };
  // the voice the user heard and picked at intake (D-71), or the recommended voice for their preference and source
  const pref = video.intake?.voice?.preference || 'none';
  const source = video.intake?.voice?.source || 'built-in';
  const v = findVoice(video.intake?.voice?.id) || defaultVoice(pref, { elevenlabs: source === 'own-account', ...(engines ? { engines } : {}) });
  if (!v) return { tier: 'none', label: 'No voice available' };
  const paid = v.provider === 'elevenlabs';
  const sample = `${v.id}.mp3`;
  return {
    tier: paid || v.provider === 'chatterbox' ? 'expressive' : 'standard', voice: v.spec, id: v.id,
    label: `${v.name} · ${paid ? 'ElevenLabs, your account (key in the project env file)' : 'Free (built-in)'}`,
    sample: fs.existsSync(path.join(ASSET_ROOTS.voice, sample)) ? sample : null,
  };
}

/** proposals.json with edits.json applied, the voice recomputed from the (edited) brief. */
export function loadProposals(projectDir) {
  const P = readJson(path.join(dirOf(projectDir), 'proposals.json'));
  if (!P) return null;
  const edits = readJson(path.join(dirOf(projectDir), 'edits.json'), { edits: [] });
  const out = applyEdits(P, edits.edits || []);
  out.voice = voiceFor(out.video);
  // the user's own track (intake.music.own) heads the music list, played from the project
  const own = out.video?.intake?.music?.own;
  if (own?.path) out.music = [{ file: 'own', own: true, path: own.path, src: `/project/${own.path}`, title: `${own.title || 'Your track'} (your track)`, set: 'energetic', usable_from_s: 0, mood: ['your track'], licence: 'your licence' }, ...(out.music || []).filter((m) => m.file !== 'own')];
  return out;
}

const BAD_SEGMENT = /^(__proto__|constructor|prototype)$/;
const ALLOWED_ROOT = new Set(['video', 'directions', 'claims']);

/** Set a dotted path on the proposals; only video.*, directions.* and claims.<id>.use may change. Pure. */
export function applyEdits(P, edits) {
  const out = JSON.parse(JSON.stringify(P));
  for (const { path: p, value } of edits) {
    const segs = String(p).split('.');
    if (!ALLOWED_ROOT.has(segs[0]) || segs.some((s) => BAD_SEGMENT.test(s))) continue;
    if (segs[0] === 'claims') {
      const c = (out.claims || []).find((x) => x.id === segs[1]);
      if (c && segs[2] === 'use') c.use = Boolean(value);
      continue;
    }
    let cur = out;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = Array.isArray(cur) ? Number(segs[i]) : segs[i];
      if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') { cur = null; break; }
      cur = cur[k];
    }
    if (!cur) continue;
    const last = Array.isArray(cur) ? Number(segs[segs.length - 1]) : segs[segs.length - 1];
    cur[last] = value === '' && (last === 'sub' || last === 'accent' || last === 'kicker') ? null : value;
  }
  return out;
}

export function saveEdits(projectDir, edits) {
  const file = path.join(dirOf(projectDir), 'edits.json');
  const cur = readJson(file, { edits: [] });
  const list = cur.edits || [];
  for (const ed of edits) {
    if (!ed || typeof ed.path !== 'string') continue;
    const i = list.findIndex((x) => x.path === ed.path);
    const entry = { path: ed.path, value: ed.value, at: new Date().toISOString() };
    if (i >= 0) list[i] = entry; else list.push(entry);
  }
  writeJson(file, { edits: list });
  return list.length;
}

// ---------------------------------------------------------------------------
// Confirm: proposals + edits → plan.json
// ---------------------------------------------------------------------------

/**
 * Build the plan from the chosen direction and write it when it validates.
 * @returns {{ ok: true, planPath, plan, problems } | { ok: false, problems }}
 */
export function confirmDirection(projectDir, chosen, opts = {}) {
  const P = loadProposals(projectDir);
  if (!P) return { ok: false, problems: [{ what: 'no proposals in this project yet', fix: 'run node plan/direction/run.mjs <project-dir> first' }] };
  // a cast member renamed on the refine page is renamed in every scene before the plan is written
  const d = renameCast(P.directions[chosen]);
  if (!d) return { ok: false, problems: [{ what: `there is no direction ${chosen + 1}`, fix: 'choose one of the directions shown' }] };
  const parsed = DirectionProposalSchema.safeParse(stripExtras(d));
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 8).map((i) => ({ what: `${i.path.join('.')}: ${i.message}`, fix: 'fix the field on the page' })) };
  const video = JSON.parse(JSON.stringify(P.video));
  const letter = LETTERS[chosen];
  const copy = copyProblems(d, video.template);
  if (copy.length) return { ok: false, problems: copy };

  // claims: ticked on the page, or cited by a moment
  const cited = new Set(d.moments.flatMap((m) => m.claims || []));
  const claims = (P.claims || []).filter((c) => c.use || cited.has(c.id)).map((c) => ({ id: c.id, text: c.short || c.text, tier: 'customer-stated', cite: `${c.page} — "${c.text}"`, kind: c.kind || 'capability' }));
  const claimIds = new Set(claims.map((c) => c.id));
  const sources = P.sources || [];
  const sourceIds = new Set(sources.map((s) => s.id));

  // fonts: copy the chosen faces into the project so plan.html renders them
  const assetsDir = path.join(projectDir, 'assets', 'fonts');
  const { files } = fontFaces(d, { copyTo: assetsDir });
  const all = openFonts();
  // one face per role, so a family shared by display and text keeps its heavy weight for headlines only (body text 400, labels 500)
  const fontCtx = {}, fontsByRole = {};
  for (const role of ['display', 'text', 'mono']) {
    const family = d.type[role];
    const names = files[family];
    if (!names) continue;
    const f = all.find((x) => x.family === family);
    const want = role === 'display' ? displayWeight(family, f?.weights || []) : role === 'mono' ? 500 : 400;
    const face = (f?.faces || []).map((x, i) => ({ ...x, name: names[i] })).filter((x) => x.name && x.style === 'normal').sort((a, b) => Math.abs(Number(a.weight) - want) - Math.abs(Number(b.weight) - want))[0];
    if (!face) continue;
    fontsByRole[role] = { file: `assets/fonts/${face.name}`, weight: Number(face.weight) };
    if (!fontCtx[family]) fontCtx[family] = fontsByRole[role];
  }

  // music from the curated list; the bed starts at the track's usable-from offset
  const musicEntry = (P.music || []).find((m) => m.file === d.music.file) || { file: d.music.file, title: d.music.file, licence: '', usable_from_s: 0 };
  const catalogue = opts.catalogue || loadCatalogue();
  const voice = P.voice || voiceFor(video);
  const direction = toPlanDirection(d, { letter, video, fonts: fontCtx, fontsByRole, music: musicEntry, pace: P.pace || { shots_per_min: [12, 24] }, voice: { tier: voice.tier, ...(voice.voice ? { voice: voice.voice } : {}), ...(voice.sample ? { sample: voice.sample } : {}) }, sketchesPath: `direction/sketches/${letter}.html` });
  if (musicEntry.usable_from_s) { direction.music.track = `${direction.music.track}; bed starts at ${musicEntry.usable_from_s} s`; direction.music.usable_from_s = Number(musicEntry.usable_from_s); }
  const scenes = toSceneSkeletons(d, { video, catalogue, sourceIds, claimIds });

  // the brief: edited fields, proposals noted as confirmed
  const intake = { ...(video.intake || {}) };
  if (intake.unsure) {
    for (const field of Object.keys(intake.unsure)) {
      if (intake.proposed?.[field]) intake.unsure[field] = `${intake.unsure[field]} Proposed by the direction step and confirmed on the direction page.`;
    }
  }
  // the video is as long as its scenes (inside the brief's range, D-81); the brief's own length is kept as the target
  const actual = Math.round(scenes.reduce((a, s) => a + s.duration_s, 0) * 10) / 10;
  if (Math.abs(actual - Number(video.length_s)) > 0.05) intake.length_target = Number(video.length_s);
  const planVideo = { ...video, length_s: actual, sources, claims, intake };
  const existing = readJson(path.join(projectDir, 'plan.json'), {});
  const plan = { ...existing, version: 1, video: planVideo, direction, scenes };
  const check = validatePlan(JSON.parse(JSON.stringify(plan)), { catalogue });
  if (!check.ok) return { ok: false, problems: check.problems.filter((p) => p.level === 'error').map((p) => ({ what: `${p.scene}: ${p.what}`, fix: p.fix })) };
  const planPath = writeJson(path.join(projectDir, 'plan.json'), plan);
  // the chosen sketch is also written on its own so the plan's `sketches` path resolves
  const sketchFile = path.join(dirOf(projectDir), 'sketches', `${letter}.html`);
  if (!fs.existsSync(sketchFile)) { fs.mkdirSync(path.dirname(sketchFile), { recursive: true }); fs.writeFileSync(sketchFile, renderSketch(d, video, { letter })); }
  writeJson(path.join(dirOf(projectDir), 'chosen.json'), { chosen, letter, name: d.name, video_style: P.style?.resolved === 'brand' ? 'brand' : (d.video_style || 'brand'), music: { file: musicEntry.file, title: musicEntry.title, usable_from_s: musicEntry.usable_from_s || 0 }, at: new Date().toISOString() });
  writeState(projectDir, { stage: 'confirmed', chosen });
  return { ok: true, planPath, plan, problems: check.problems };
}

/** Page-only keys the proposal schema does not know. */
function stripExtras(d) {
  const { frames, sketch, repairs, words_max, ...rest } = d;
  return { ...rest, moments: (rest.moments || []).map(({ words_max: _w, ...m }) => m) };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const send = (res, status, body, type = 'text/html; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }); res.end(body); };
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
const redirect = (res, to) => { res.writeHead(302, { location: to, 'cache-control': 'no-store' }); res.end(); };

/** A file under a root, plain names only, with Range support for media. */
function sendFile(req, res, root, rel) {
  if (!/^[\w][\w./ -]*$/.test(rel) || rel.includes('..')) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  const file = path.resolve(root, rel);
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type || !file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  const size = fs.statSync(file).size;
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && /^(video|audio)\//.test(type)) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1, 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'max-age=600', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `http://${req.headers.host}`;
}

/** The asset URL prefixes the pages use on the server. */
export const SERVER_ASSETS = { project: '/project/', gallery: '/gallery/', motion: '/motion/', fonts: '/fonts/', music: '/music/', voice: '/voice/' };

/**
 * Start the direction server. Resolves with { server, url, port, close }.
 * `runOpts` ({ model, cap, frames, fixtures, record, log }) is what proposing
 * the directions on a style choice needs; without it the choice is saved and
 * the page says how to continue from the CLI.
 * @param {{ projectDir: string, port?: number, host?: string, costLine?: string, runOpts?: object }} opts
 */
export function startServer(opts) {
  const projectDir = path.resolve(opts.projectDir);
  const host = opts.host ?? '127.0.0.1';
  let busy = false;
  let hearing = false;
  const costLineOf = () => { const cost = readJson(path.join(dirOf(projectDir), 'cost.json')); return cost ? `Cost of this run: $${Number(cost.total_usd || 0).toFixed(4)} (${cost.input_tokens || 0} in / ${cost.output_tokens || 0} out tokens)` : (opts.costLine || ''); };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const p = url.pathname;
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
        const st = readState(projectDir);
        return redirect(res, `/${STAGES.includes(st.stage) ? st.stage : 'style'}`);
      }
      if (req.method === 'GET' && ['/style', '/direction', '/refine'].includes(p)) {
        const P = loadProposals(projectDir);
        if (!P) return send(res, 404, `<p>No site read yet in ${projectDir}. Run <code>node plan/direction/run.mjs ${projectDir}</code>.</p>`);
        const state = readState(projectDir);
        const common = { proposals: P, assets: SERVER_ASSETS, projectDir, state, costLine: costLineOf(), live: Boolean(opts.runOpts), motion: motionGallery() };
        if (p === '/style') return send(res, 200, renderStylePage(common));
        if (p === '/direction') return send(res, 200, renderDirectionPage(common));
        return send(res, 200, renderRefinePage(common));
      }
      if (req.method === 'GET' && p.startsWith('/project/')) return sendFile(req, res, projectDir, decodeURIComponent(p.slice('/project/'.length)));
      if (req.method === 'GET' && p.startsWith('/ui/')) return sendUi(res, p);
      for (const [key, root] of Object.entries(ASSET_ROOTS)) {
        if (req.method === 'GET' && p.startsWith(`/${key}/`)) return sendFile(req, res, root, decodeURIComponent(p.slice(key.length + 2)));
      }
      if (req.method === 'GET' && p === '/confirmed') {
        const plan = readJson(path.join(projectDir, 'plan.json'));
        const chosen = readJson(path.join(dirOf(projectDir), 'chosen.json'));
        if (!plan?.direction || !chosen) return send(res, 404, renderConfirmedPage({ missing: true, projectDir }));
        let problems = [];
        try { problems = validatePlan(JSON.parse(JSON.stringify(plan))).problems; } catch { problems = []; }
        return send(res, 200, renderConfirmedPage({ plan, planPath: path.join(projectDir, 'plan.json'), problems, chosen: chosen.chosen, projectDir }));
      }
      if (req.method === 'GET' && p === '/api/thumbs') {
        // D-82: the thumbnail previews for the refine page's card, in the chosen direction's look (cached by what they show)
        const P = loadProposals(projectDir);
        if (!P) return sendJson(res, 404, { ok: false, error: 'no directions yet' });
        const st = readState(projectDir);
        const i = Number.isInteger(st.chosen) && P.directions?.[st.chosen] ? st.chosen : 0;
        const layout = String(url.searchParams.get('layout') || '');
        try { return sendJson(res, 200, { ok: true, ...(await thumbPreviews(projectDir, P, i, layout)) }); }
        catch (err) { return sendJson(res, 500, { ok: false, error: `Could not draw the thumbnails: ${err.message}` }); }
      }
      if (req.method === 'GET' && p === '/api/state') return sendJson(res, 200, { ...readState(projectDir), busy });
      if (req.method === 'GET' && p === '/api/production') {
        const { productionProgress } = await import('../production/progress.mjs');
        return sendJson(res, 200, { ok: true, ...productionProgress(projectDir) });
      }
      if (req.method === 'POST' && !sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'refused: the request came from another page' });
      if (req.method === 'POST' && p === '/api/save') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const n = saveEdits(projectDir, Array.isArray(body.edits) ? body.edits : [body]);
        return sendJson(res, 200, { ok: true, edits: n });
      }
      // "Hear it" on the refine page: one narration line in the chosen voice, written into the production voice cache under the same
      // key voiceover.mjs uses (the voice's signature and the words), so a line heard here is not voiced, or paid for, again
      if (req.method === 'POST' && p === '/api/hear') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
        if (!text) return sendJson(res, 400, { ok: false, error: 'Write the line first.' });
        const v = loadProposals(projectDir)?.voice;
        if (!v || v.tier === 'none' || !v.voice) return sendJson(res, 400, { ok: false, error: 'This video is music only.' });
        const { voiceSpec } = await import('../production/audio.mjs');
        const { resolveProvider } = await import('../../tts/providers.mjs');
        let provider;
        try { provider = resolveProvider(voiceSpec({ voice: v })); } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }); }
        const { createHash } = await import('node:crypto');
        const dir = path.join(projectDir, 'production', 'voice');
        fs.mkdirSync(dir, { recursive: true });
        const hash = createHash('sha1').update(`${provider.sig}\n${text}`).digest('hex').slice(0, 12);
        const out = path.join(dir, `${hash}.wav`);
        if (!fs.existsSync(out)) {
          if (hearing) return sendJson(res, 429, { ok: false, error: 'Still voicing the last line.' });
          hearing = true;
          try {
            const r = await provider.synthesizeMany([{ id: 'hear', text, out }]);
            const x = r.get('hear');
            if (!x?.ok || !fs.existsSync(out)) return sendJson(res, 502, { ok: false, error: x?.error || 'The voice gave no audio.' });
          } catch (err) {
            return sendJson(res, 502, { ok: false, error: provider.paid ? `Could not reach the voice (${err.message}). A paid voice needs its key in the project's .env file.` : err.message });
          } finally { hearing = false; }
        }
        const { spawnSync } = await import('node:child_process');
        const secs = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout) || null;
        return sendJson(res, 200, { ok: true, url: `/project/production/voice/${hash}.wav`, secs: secs && Math.round(secs * 10) / 10, paid: Boolean(provider.paid) });
      }
      // "Show me other ways": the user's note for new directions; the current answer is kept beside, dated, never deleted
      if (req.method === 'POST' && p === '/api/more') {
        const body = JSON.parse((await readBody(req)) || '{}');
        if (busy) return sendJson(res, 409, { ok: false, busy: true, error: 'directions are already being proposed; wait for them' });
        if (!opts.runOpts) return sendJson(res, 400, { ok: false, error: 'Start the direction pages with plan/direction/run.mjs to propose new directions.' });
        const file = path.join(dirOf(projectDir), 'proposals.json');
        const P0 = readJson(file);
        if (!P0) return sendJson(res, 400, { ok: false, error: 'no directions yet' });
        if (!body.again) {
          const note = String(body.note || '').replace(/\s+/g, ' ').trim().slice(0, 800);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          fs.mkdirSync(path.join(dirOf(projectDir), 'set-aside'), { recursive: true });
          fs.writeFileSync(path.join(dirOf(projectDir), 'set-aside', `proposals-${stamp}.json`), JSON.stringify(P0, null, 1) + '\n');
          const ans = path.join(projectDir, 'tasks', 'directions.answer.json');
          if (fs.existsSync(ans)) fs.renameSync(ans, path.join(projectDir, 'tasks', `directions.answer.set-aside-${stamp}.json`));
          const asks = [...(P0.video.intake?.direction_asks || []), { note, set_aside: (P0.directions || []).map((d) => d.name), at: new Date().toISOString() }].slice(-4);
          P0.video.intake = { ...(P0.video.intake || {}), direction_asks: asks };
          writeJson(file, P0);
        }
        const choice = readState(projectDir).style?.choice || 'auto';
        busy = true;
        try {
          const { proposeForStyle } = await import('./run.mjs');
          const r = await proposeForStyle(projectDir, choice, opts.runOpts);
          return sendJson(res, 200, { ok: true, next: '/direction', directions: r.proposals.directions.map((d) => d.name) });
        } catch (err) {
          if (err.name === 'AwaitingAgent') {
            console.log(`Task waiting for Claude: ${err.task} (write the answer to ${err.answer}); the user asked for other directions`);
            return sendJson(res, 202, { ok: false, waiting: true, task: path.basename(err.task) });
          }
          return sendJson(res, 500, { ok: false, error: err.message });
        } finally { busy = false; }
      }
      if (req.method === 'POST' && p === '/api/style') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const choice = String(body.choice || 'auto');
        if (!/^[a-z0-9-]+$/.test(choice)) return sendJson(res, 400, { ok: false, error: 'choose a style from the gallery, "brand" or "auto"' });
        if (busy) return sendJson(res, 409, { ok: false, busy: true, error: 'directions are already being proposed; wait for them' });
        if (!opts.runOpts) {
          writeState(projectDir, { style: { choice, resolved: choice === 'auto' ? null : choice, at: new Date().toISOString() } });
          return sendJson(res, 200, { ok: false, saved: true, error: `Style saved. Propose the directions from the command line: node plan/direction/run.mjs ${projectDir} --skip-scout --style ${choice}` });
        }
        busy = true;
        try {
          const { proposeForStyle } = await import('./run.mjs');
          const r = await proposeForStyle(projectDir, choice, opts.runOpts);
          return sendJson(res, 200, { ok: true, next: '/direction', directions: r.proposals.directions.map((d) => d.name), cost: r.ledger.line() });
        } catch (err) {
          // agent mode: Claude is the model; the step waits for its answer file. The page retries quietly and carries on
          // once the answer is there; this line is what Claude watches for (SKILL.md, step 2)
          if (err.name === 'AwaitingAgent') {
            console.log(`Task waiting for Claude: ${err.task} (write the answer to ${err.answer})`);
            return sendJson(res, 202, { ok: false, waiting: true, task: path.basename(err.task) });
          }
          writeState(projectDir, { stage: 'style', working: false });
          return sendJson(res, 500, { ok: false, error: err.message });
        } finally { busy = false; }
      }
      if (req.method === 'POST' && p === '/api/choose') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const chosen = Number(body.chosen);
        const P = loadProposals(projectDir);
        if (!Number.isInteger(chosen) || chosen < 0 || !P?.directions?.[chosen]) return sendJson(res, 400, { ok: false, error: 'choose one of the directions shown' });
        writeState(projectDir, { stage: 'refine', chosen });
        return sendJson(res, 200, { ok: true, next: '/refine' });
      }
      if (req.method === 'POST' && p === '/api/confirm') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const chosen = Number.isInteger(Number(body.chosen)) && body.chosen !== undefined && body.chosen !== null ? Number(body.chosen) : readState(projectDir).chosen;
        if (!Number.isInteger(chosen) || chosen < 0) return sendJson(res, 400, { ok: false, error: 'choose a direction first' });
        let result;
        try { result = confirmDirection(projectDir, chosen); } catch (err) { return sendJson(res, 500, { ok: false, error: err.message }); }
        if (!result.ok) return sendJson(res, 400, { ok: false, problems: result.problems });
        // the Production page follows from this moment; the agent's `wait.mjs … confirmed` exits on this file
        fs.writeFileSync(path.join(dirOf(projectDir), 'confirmed.json'), JSON.stringify({ at: Date.now(), chosen }) + '\n');
        import('../dashboard/build.mjs').then((m) => m.refreshDashboard(projectDir)).catch(() => {});
        import('../telemetry.mjs').then((t) => t.track('direction_confirmed', t.projectProps(projectDir))).catch(() => {});
        console.log(`Direction confirmed: ${result.planPath}. Next: production (node plan/production/scene.mjs prepare ${projectDir}).`);
        return sendJson(res, 200, { ok: true, planPath: result.planPath, next: '/confirmed' });
      }
      return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(opts.port ?? 4322, host, () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://${host}:${port}/`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const projectDir = args.find((a) => !a.startsWith('--'));
  const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
  const port = Number(flag('--port', 4322));
  if (!projectDir || !Number.isFinite(port)) { console.error('usage: node plan/direction/serve.mjs <project-dir> [--port 4322] [--fixtures <dir>] [--frames playwright] [--model ...] [--cap 3.00]'); process.exit(2); }
  const runOpts = { model: flag('--model', undefined), cap: Number(flag('--cap', 3)), frames: flag('--frames', 'hyperframes'), fixtures: flag('--fixtures', null), record: flag('--record', null) };
  import('../pages.mjs').then(({ listenOnFree, recordPage }) => listenOnFree((p) => startServer({ projectDir, port: p, runOpts }), port).then((r) => { recordPage(path.resolve(projectDir), 'direction', r.url); return r; })).then(({ url }) => {
    console.log(`Direction step: ${url}${openInBrowser(url) ? '  (opened in your browser)' : ''}`);
    console.log(`Writes: ${path.resolve(projectDir, 'plan.json')} on confirm  (Ctrl+C to stop)`);
  }).catch((err) => { console.error(err.message); process.exit(1); });
}
