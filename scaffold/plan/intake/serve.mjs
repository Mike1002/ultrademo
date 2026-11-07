#!/usr/bin/env node
// serve.mjs — the intake page of the skill v2: the first of the five steps.
//
//   node plan/intake/serve.mjs <project-dir> [--port 4321]
//
// Starts a dependency-free local HTTP server (127.0.0.1 only), prints the URL,
// serves the page, receives the brief, validates the `video` block against the
// plan schema, merges it into <project-dir>/plan.json (never dropping a
// direction or scenes already there) and shows a confirmation page.
//
// Everything a user sees uses the plain words of D-55 and D-64. The file on
// disk keeps the working field names of plan/schema.mjs.

import fs from 'node:fs';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VideoSchema, countWords, TEMPLATES } from '../schema.mjs';
import { validatePlan } from '../validate.mjs';
import { openInBrowser } from '../open.mjs';
import { listenOnFree, recordPage, pagesOf } from '../pages.mjs';
import { refreshDashboard } from '../dashboard/build.mjs';
import { track, projectProps } from '../telemetry.mjs';
import { BRANDS_DIR, listBrands, findBrandFor, brandFromVideo, brandChanges, saveBrandProfile, brandForBrief } from '../brands.mjs';
import { renderIntakePage, renderSavedPage, TEMPLATE_META, LABELS, ASSETS_DIR, musicTracks } from './page.mjs';
import { findVoice, defaultVoice, elevenlabsReady, voiceOptions, SAMPLES_DIR } from '../../tts/catalogue.mjs';

const MAX_BODY = 1_000_000;        // bytes a POST may carry
const MAX_TRACK = 60_000_000;      // bytes an uploaded music track may carry
const MAX_MOCKUP = 15_000_000;     // bytes an uploaded HTML mockup may carry
const MAX_IMAGE = 25_000_000;      // bytes an uploaded screenshot may carry
/** Where an uploaded track lives in the project; the only own-track path a brief may name. */
export const OWN_TRACK = /^assets\/music\/own-[a-z0-9-]{1,60}\.(mp3|wav|m4a|ogg|aac|flac)$/;
// screens the user gives (HTML mockups of features not live yet, screenshots): only paths the upload makes are kept
export const SOURCE_FILE = /^assets\/sources\/[a-z0-9-]{1,64}\.(html|png|jpg|webp)$/;
const SCREEN_FROM = ['live', 'mockups', 'screenshots', 'figma'];
// D-77: the four video types; each maps to the story spine the later steps know (template)
export const VIDEO_TYPES = ['launch', 'explainer', 'spotlight', 'ad'];
export function templateFor(type, scope, length_s) {
  if (type === 'launch') return 'launch';
  if (type === 'ad') return 'ad';
  if (type === 'spotlight') return scope === 'feature' ? 'feature-focus' : 'feature-showcase';
  if (type === 'explainer') return scope === 'feature' ? 'feature-focus' : length_s && length_s > 120 ? 'product-tour' : 'explainer';
  return null;
}
const MAX_SITE_BYTES = 1_000_000;  // bytes read from the product site
const SITE_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// The brief → the video block
// ---------------------------------------------------------------------------

/** Fields of the video block the page can mark Unsure, with the placeholder the schema view uses. */
const UNSURE_PLACEHOLDER = {
  product: 'unsure', viewer: 'unsure', claim: 'unsure', pain_point: 'unsure', proof_moment: 'unsure',
  cta: 'unsure', template: 'launch', length_s: 30, narration: 'voice', autonomy: 'review', register: 'balanced',
};

/** Intake-only fields that may be Unsure (stored only in video.intake). */
const INTAKE_UNSURE = new Set(['look', 'footage', 'sign_in', 'product_type', 'reference', 'project_name']);

const PRODUCT_TYPES = ['web-app', 'mobile-app', 'website'];
const VOICE_PREFERENCES = ['female', 'male', 'none'];
const VOICE_SOURCES = ['built-in', 'own-account'];
const WEBSITE_SIGN_IN_NOTE = 'Product type is website only: the video is made from the public site; nothing to sign into.';

const DEFAULT_NOTE = 'Unsure at intake; the direction step proposes it.';

export function slug(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'product';
}

export function todayISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** `<product>-<template>-<date>`, with "video" standing in for an Unsure template. */
export function proposeProjectName(product, template, date = todayISO()) {
  return `${slug(product || 'product')}-${template || 'video'}-${date}`;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : str(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));

/**
 * Turn the submitted brief into the `video` block. Unsure fields become null
 * with a note under `video.intake.unsure`. Pure.
 * @param {any} brief the JSON the page posts
 * @param {{ existingVideo?: any, now?: Date }} [opts]
 */
export function buildVideo(brief, opts = {}) {
  const b = brief && typeof brief === 'object' ? brief : {};
  const unsureIn = b.unsure && typeof b.unsure === 'object' ? b.unsure : {};
  const unsure = {};
  const isUnsure = (field) => Object.prototype.hasOwnProperty.call(unsureIn, field);
  const note = (field) => {
    const hint = str(unsureIn[field]);
    return hint ? `${DEFAULT_NOTE} Hint: ${hint}` : DEFAULT_NOTE;
  };
  // the story and the call to action are notes the direction step builds on: left empty, they are proposed (as if Unsure)
  const PROPOSED_WHEN_EMPTY = ['product', 'viewer', 'claim', 'pain_point', 'proof_moment', 'cta'];
  const text = (field, raw) => {
    if (isUnsure(field) || (PROPOSED_WHEN_EMPTY.includes(field) && !str(raw))) { unsure[field] = note(field); return null; }
    return str(raw);
  };
  const choice = (field, raw, allowed) => {
    if (isUnsure(field) || raw === 'unsure') { unsure[field] = note(field); return null; }
    const v = str(raw);
    return allowed.includes(v) ? v : (v || null);
  };

  const product = text('product', b.product);
  let length_s = null;
  if (isUnsure('length_s')) unsure.length_s = note('length_s');
  else {
    const n = b.length_s === '' || b.length_s == null ? NaN : Number(b.length_s);
    length_s = Number.isFinite(n) && n > 0 ? n : null;
    // left empty (no video type picked yet), the length is proposed like any other empty field
    if (length_s === null) unsure.length_s = note('length_s');
  }
  // a video type (D-77) sets the spine; a brief from before D-77 still sends the template itself
  const typeGiven = VIDEO_TYPES.includes(str(b.video_type)) ? templateFor(str(b.video_type), str(b.scope), length_s) : null;
  const template = typeGiven ?? choice('template', b.video_type === 'unsure' ? 'unsure' : b.template, TEMPLATES);

  const narrationMap = { narrated: 'voice', 'music-only': 'music-only', both: 'hybrid', voice: 'voice', hybrid: 'hybrid' };
  const narrationRaw = isUnsure('narration') || b.narration === 'unsure' ? 'unsure' : narrationMap[str(b.narration)] || str(b.narration);
  const narration = choice('narration', narrationRaw, ['voice', 'music-only', 'hybrid']);
  const autonomyMap = { 'user-reviewed': 'review', auto: 'director', review: 'review', director: 'director' };
  const autonomyRaw = isUnsure('autonomy') || b.autonomy === 'unsure' ? 'unsure' : autonomyMap[str(b.autonomy)] || str(b.autonomy);
  const autonomy = choice('autonomy', autonomyRaw, ['review', 'director']);
  const register = choice('register', b.tone ?? b.register, ['factual', 'balanced', 'bold']);

  // voice: only when a voice is in the video (narrated or both); hidden on the page and absent from the file otherwise
  const voiceIn = b.voice && typeof b.voice === 'object' ? b.voice : {};
  const voice = narration === 'voice' || narration === 'hybrid' ? {
    preference: VOICE_PREFERENCES.includes(str(voiceIn.preference)) ? str(voiceIn.preference) : 'none',
    // never a key: own-account means the key lives in the project's env file
    source: VOICE_SOURCES.includes(str(voiceIn.source)) ? str(voiceIn.source) : 'built-in',
  } : null;
  // the voice the user heard and picked (D-71): a catalogue id; its source follows from the voice, not from the form
  if (voice) {
    const picked = findVoice(str(voiceIn.id)) || defaultVoice(voice.preference, { elevenlabs: voice.source === 'own-account' || elevenlabsReady() });
    if (picked) { voice.id = picked.id; voice.source = picked.provider === 'elevenlabs' ? 'own-account' : 'built-in'; }
  }

  // the track the user heard and picked, or null to let the direction choose; only a curated file is kept
  const musicFile = str(b.music?.file);
  const music = { file: musicTracks().some((t) => t.file === musicFile) ? musicFile : null };
  // or the user's own track (uploaded through /api/music-upload into the project): only a path the upload makes is kept
  const own = b.music?.own && typeof b.music.own === 'object' ? b.music.own : null;
  if (own && OWN_TRACK.test(str(own.path))) {
    music.file = null;
    music.own = { path: str(own.path), title: str(own.title).slice(0, 80) || path.basename(str(own.path)), licensed: own.licensed === true };
  }

  // intake-only fields
  const formats = { landscape: ['landscape'], vertical: ['vertical'], both: ['landscape', 'vertical'] }[str(b.formats)] || null;
  const product_type = isUnsure('product_type') || b.product_type === 'unsure' || !PRODUCT_TYPES.includes(str(b.product_type)) ? null : str(b.product_type);
  if (product_type === null && (isUnsure('product_type') || b.product_type === 'unsure')) unsure.product_type = note('product_type');
  const look = isUnsure('look') ? null : { words: str(b.look?.words ?? b.look), chips: list(b.look?.chips ?? []) };
  if (isUnsure('look')) unsure.look = note('look');
  const footageIn = b.footage && typeof b.footage === 'object' ? b.footage : {};
  const footage = isUnsure('footage') || footageIn.have === 'unsure' ? null : {
    have: ['none', 'upload', 'existing', 'record'].includes(str(footageIn.have)) ? str(footageIn.have) : 'none',
    files: list(footageIn.files),
    links: list(footageIn.links),
    channel: str(footageIn.channel),
  };
  if (footage === null) unsure.footage = note('footage');
  const signIn = b.sign_in && typeof b.sign_in === 'object' ? b.sign_in : {};
  const SIGN_IN_PATHS = ['public', 'own-browser', 'dedicated-profile', 'hosted-live-view', 'token'];
  const website = product_type === 'website';
  // a website-only product has nothing to sign into: an Unsure or missing path defaults to public, with a note
  const signInUnsure = (isUnsure('sign_in') || signIn.path === 'unsure') && !website;
  const sign_in = signInUnsure ? null : {
    path: SIGN_IN_PATHS.includes(str(signIn.path)) ? str(signIn.path) : 'public',
    // never the token itself: only how the product issues it
    token_note: str(signIn.token_note).slice(0, 500),
    browser: { chromium: Boolean(signIn.browser?.chromium), label: str(signIn.browser?.label).slice(0, 80) },
  };
  if (sign_in === null) unsure.sign_in = note('sign_in');
  if (sign_in && website && sign_in.path === 'public') sign_in.note = WEBSITE_SIGN_IN_NOTE;
  const reference = isUnsure('reference') ? null : str(b.reference);
  if (isUnsure('reference')) unsure.reference = note('reference');
  const project_name = isUnsure('project_name') ? null : (str(b.project_name) || proposeProjectName(product, template, todayISO(opts.now)));
  if (isUnsure('project_name')) unsure.project_name = note('project_name');

  const existing = opts.existingVideo && typeof opts.existingVideo === 'object' ? opts.existingVideo : {};
  // D-77: the video type and its scope (the whole product or one feature); the story spine (template) follows from them
  const video_type = VIDEO_TYPES.includes(str(b.video_type)) ? str(b.video_type) : null;
  const scope = ['product', 'feature'].includes(str(b.scope)) ? str(b.scope) : 'product';
  const feature = scope === 'feature' ? str(b.feature).slice(0, 200) : '';
  // words used exactly as written (a tagline, the call to action, lines that must appear); the story fields are not
  const exactIn = b.exact && typeof b.exact === 'object' ? b.exact : {};
  const exact = { tagline: str(exactIn.tagline).slice(0, 200), lines: list(exactIn.lines).slice(0, 12).map((l) => l.slice(0, 300)) };
  // D-78: how much the effects show for the whole video
  const effects = ['lively', 'subtle', 'none'].includes(str(b.effects)) ? str(b.effects) : 'lively';
  // where the screens come from (the live product, HTML mockups, screenshots, Figma); uploads become sources the later
  // steps read: a mockup as itself (open it for its strings and states) and its full-page screenshot
  const screensIn = b.screens && typeof b.screens === 'object' ? b.screens : {};
  const uploads = (Array.isArray(screensIn.uploads) ? screensIn.uploads : []).filter((u) => u && SOURCE_FILE.test(str(u.path))).slice(0, 24).map((u) => ({
    path: str(u.path), kind: str(u.path).endsWith('.html') ? 'mockup' : 'screenshot',
    shot: SOURCE_FILE.test(str(u.shot)) && str(u.shot).endsWith('.png') ? str(u.shot) : null,
    title: str(u.title).replace(/\s+/g, ' ').slice(0, 120) || path.basename(str(u.path)),
  }));
  const figmaUrl = /^https:\/\/(www\.)?figma\.com\//.test(str(screensIn.figma_url)) ? str(screensIn.figma_url).slice(0, 500) : '';
  const screens = { from: list(screensIn.from).filter((x) => SCREEN_FROM.includes(x)), uploads, ...(figmaUrl ? { figma_url: figmaUrl } : {}) };
  if (!screens.from.length) screens.from = uploads.length ? [] : ['live'];
  const slugOf = (p) => path.basename(p, path.extname(p));
  const uploadSources = uploads.flatMap((u) => u.kind === 'mockup'
    ? [{ id: `mockup-${slugOf(u.path)}`, kind: 'mockup', path: u.path, what: `HTML mockup: ${u.title} (open it in the browser for its exact strings, states and layout)` },
      ...(u.shot ? [{ id: `mockup-${slugOf(u.path)}-shot`, kind: 'screenshot', path: u.shot, what: `Full-page screenshot of the ${u.title} mockup, as it first opens` }] : [])]
    : [{ id: `shot-${slugOf(u.path)}`, kind: 'screenshot', path: u.path, what: `Screenshot: ${u.title}` }]);
  // the brand (logo, colours, fonts): read from the site and confirmed or changed by the user
  const brandIn = b.brand && typeof b.brand === 'object' ? b.brand : {};
  const hex = (v) => (HEX.test(str(v)) ? str(v).toLowerCase() : null);
  const brand = {
    logo: BRAND_LOGO.test(str(brandIn.logo)) ? str(brandIn.logo) : null,
    colors: Object.fromEntries(['brand', 'accent', 'ground', 'ink'].map((k) => [k, hex(brandIn.colors?.[k])]).filter(([, v]) => v)),
    fonts: Object.fromEntries(['display', 'body'].map((k) => [k, str(brandIn.fonts?.[k]).replace(/[^\w .'-]/g, '').slice(0, 60)]).filter(([, v]) => v)),
  };
  const logoSource = brand.logo ? [{ id: 'logo', kind: 'logo', path: brand.logo, what: `${product || 'The product'} logo${brand.logo.includes('-own') ? ' (given by the user)' : ' (from the site)'}` }] : [];
  const keptSources = (Array.isArray(existing.sources) ? existing.sources : []).filter((s) => !SOURCE_FILE.test(str(s.path)) && !(brand.logo && s.id === 'logo'));
  const site = b.site && typeof b.site === 'object' ? {
    title: str(b.site.title).slice(0, 300),
    description: str(b.site.description).slice(0, 1000),
    headings: list(b.site.headings).slice(0, 24),
  } : (existing.intake?.site ?? null);

  const video = {
    product,
    url: str(b.url),
    template,
    viewer: text('viewer', b.viewer),
    claim: text('claim', b.claim),
    pain_point: text('pain_point', b.pain_point),
    proof_moment: text('proof_moment', b.proof_moment),
    cta: text('cta', b.cta),
    length_s,
    narration,
    autonomy,
    copy: { register: register ?? null },
    ...(reference ? { reference } : {}),
    sources: [...logoSource, ...keptSources, ...uploadSources],
    claims: Array.isArray(existing.claims) ? existing.claims : [],
    // D-82: the format picked at intake (vertical only builds 9:16; both builds landscape first, then lays it out again).
    // The product type no longer sets it: a mobile app shows in a wide frame as well 
    format: formats ? (formats.length === 1 && formats[0] === 'vertical' ? '1080x1920' : '1920x1080') : (existing.format ?? '1920x1080'),
    ...(existing.fps ? { fps: existing.fps } : {}),
    ...(existing.captions ? { captions: existing.captions } : {}),
    ...(existing.message ? { message: existing.message } : {}),
    ...(existing.arc ? { arc: existing.arc } : {}),
    intake: {
      ...(str(b.title) ? { title: str(b.title).slice(0, 120) } : {}),
      project_name,
      product_type,
      ...(voice ? { voice } : {}),
      music,
      look,
      footage,
      screens,
      ...(video_type ? { video_type, scope, ...(feature ? { feature } : {}) } : {}),
      exact,
      effects,
      brand,
      length_fit: ['about', 'max', 'exact'].includes(str(b.length_fit)) ? str(b.length_fit) : 'about',
      ...(formats ? { formats } : {}),
      ...(['15', '30'].includes(str(b.cut)) ? { cut: Number(b.cut) } : {}),
      ...(str(b.notes) ? { notes: str(b.notes).slice(0, 2000) } : {}),
      sign_in,
      site,
      unsure,
      submitted_at: (opts.now ?? new Date()).toISOString(),
    },
  };
  return video;
}

/**
 * The view of a video block the strict schema accepts: `intake` removed and
 * every Unsure null replaced by a placeholder. Used only for validation.
 */
export function schemaView(video) {
  const v = { ...video };
  const unsure = v.intake?.unsure ?? {};
  delete v.intake;
  for (const [field, placeholder] of Object.entries(UNSURE_PLACEHOLDER)) {
    if (field === 'register') {
      if (v.copy?.register == null && 'register' in unsure) v.copy = { register: placeholder };
      continue;
    }
    if (v[field] === null && field in unsure) v[field] = placeholder;
  }
  if (v.copy && v.copy.register == null) v.copy = { register: 'balanced' };
  if (v.reference === null || v.reference === '') delete v.reference;
  return v;
}

/**
 * Validate the video block with the plan schema (the only block the intake
 * writes; scenes may be empty at this stage). One plain line per problem.
 * @returns {{ ok: boolean, problems: Array<{ field: string, what: string, fix: string }> }}
 */
export function validateVideo(video) {
  const problems = [];
  const unsure = video.intake?.unsure ?? {};
  // empty but not Unsure: say so in plain words before the schema does
  for (const field of Object.keys(UNSURE_PLACEHOLDER)) {
    const value = field === 'register' ? video.copy?.register : video[field];
    if ((value === null || value === '') && !(field in unsure)) {
      problems.push({ field, what: `${LABELS[field]} is empty`, fix: 'fill it in, or tick Unsure and the direction step proposes it' });
    }
  }
  if (video.intake?.music?.own && !video.intake.music.own.licensed) problems.push({ field: 'music', what: 'Your own track needs your licence confirmed', fix: 'tick that your licence covers commercial videos, or pick a track from the library' });
  if (!video.url) problems.push({ field: 'url', what: `${LABELS.url} is empty`, fix: 'the product address is the one thing the page needs' });
  if (video.template === 'talking-head-recut' && (!video.intake?.footage || video.intake.footage.have === 'none')) {
    problems.push({ field: 'footage', what: 'The Talking-head recut needs presenter footage from you', fix: 'choose where the files are, the published videos, or "I\'ll record some first"' });
  }
  if (video.claim && countWords(video.claim) > 60) {
    problems.push({ field: 'claim', what: `${LABELS.claim} has ${countWords(video.claim)} words`, fix: 'a sentence or two is plenty; the direction step writes the on-screen words from it' });
  }
  if (video.length_s !== null && !(video.length_s > 0)) {
    problems.push({ field: 'length_s', what: `${LABELS.length_s} is not a number of seconds`, fix: 'enter whole seconds, e.g. 30' });
  }
  const seen = new Set(problems.map((p) => p.field));
  const r = VideoSchema.safeParse(schemaView(video));
  if (!r.success) {
    for (const issue of r.error.issues) {
      const field = issue.path.map(String).join('.') || 'video';
      const key = field.startsWith('copy.') ? 'register' : field;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({ field: key, what: `${LABELS[key] ?? field}: ${issue.message}`, fix: 'fix the field and save again' });
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Merge the new video block into an existing plan. Direction and scenes are
 * kept exactly; sources and claims survive from the old video block.
 */
export function mergePlan(existing, video) {
  const base = existing && typeof existing === 'object' ? existing : null;
  if (!base) return { version: 1, video, scenes: [] };
  const merged = { ...base, version: base.version ?? 1, video };
  if (!Array.isArray(merged.scenes)) merged.scenes = [];
  return merged;
}

/** Read <dir>/plan.json. Returns { plan: null } when absent; throws on unreadable JSON so nothing is clobbered. */
export function readPlan(projectDir) {
  const planPath = path.join(projectDir, 'plan.json');
  if (!fs.existsSync(planPath)) return { planPath, plan: null };
  const raw = fs.readFileSync(planPath, 'utf8');
  try {
    return { planPath, plan: JSON.parse(raw) };
  } catch (err) {
    throw new Error(`${planPath} is not valid JSON (${err.message}); nothing was written`);
  }
}

export function writePlan(projectDir, plan) {
  fs.mkdirSync(projectDir, { recursive: true });
  const planPath = path.join(projectDir, 'plan.json');
  const tmp = `${planPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(plan, null, 2) + '\n');
  fs.renameSync(tmp, planPath);
  return planPath;
}

/**
 * Save a brief: build, validate, merge, write. Returns what the page shows.
 * Nothing is written when validation fails or the existing file is unreadable.
 */
export function saveBrief(projectDir, brief, opts = {}) {
  const { plan: existing } = readPlan(projectDir);
  const video = buildVideo(brief, { existingVideo: existing?.video, now: opts.now });
  const check = validateVideo(video);
  if (!check.ok) return { ok: false, problems: check.problems, video };
  const merged = mergePlan(existing, video);
  const planPath = writePlan(projectDir, merged);
  return { ok: true, planPath, plan: merged, video, notes: fullPlanNotes(merged) };
}

/** When a direction and scenes already exist, run the full plan check (notes only; the intake never blocks on them). */
export function fullPlanNotes(plan) {
  if (!plan.direction || !Array.isArray(plan.scenes) || plan.scenes.length === 0) return [];
  try {
    const view = { ...plan, video: schemaView(plan.video) };
    return validatePlan(view).problems;
  } catch (err) {
    return [{ level: 'warning', scene: 'plan', what: `the full plan check could not run (${err.message})`, fix: 'run node plan/validate.mjs on the file' }];
  }
}

// ---------------------------------------------------------------------------
// Reading the product site: title, description, h1/h2 only
// ---------------------------------------------------------------------------

const decode = (s) => String(s ?? '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', trade: '™' };
    if (ent[0] === '#') { const n = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return named[ent.toLowerCase()] ?? m;
  })
  .replace(/\s+/g, ' ').trim();
const stripTags = (s) => decode(String(s).replace(/<[^>]*>/g, ' '));

/** Pure: pull title, description and h1/h2 lines out of an HTML string; with the page address, the product name that
 * matches the domain ranks first ("Northwind" for northwind.io, not the title's tagline). */
export function parseSite(html, url = '') {
  const h = String(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const title = stripTags(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const meta = (attr, name) => {
    const re = new RegExp(`<meta[^>]*\\b${attr}\\s*=\\s*["']${name}["'][^>]*>`, 'i');
    const tag = h.match(re)?.[0];
    if (!tag) return '';
    return decode(tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1] ?? '');
  };
  const description = meta('name', 'description') || meta('property', 'og:description') || '';
  const siteName = meta('property', 'og:site_name');
  const ogTitle = meta('property', 'og:title');
  const headings = [];
  for (const m of h.matchAll(/<(h[12])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = stripTags(m[2]);
    if (t && t.length <= 200 && !headings.includes(t)) headings.push(t);
    if (headings.length >= 12) break;
  }
  const suggestions = [];
  const push = (s) => { const t = str(s); if (t && t.length <= 60 && !suggestions.includes(t)) suggestions.push(t); };
  push(siteName);
  for (const part of title.split(/\s+[|–—·•:-]\s+/)) push(part);
  push(ogTitle.split(/\s+[|–—·•:-]\s+/)[0]);
  // the domain's own word (northwind.io → northwind): a candidate that spells it wins; else a short one
  let host = '';
  try { host = new URL(String(url)).hostname.replace(/^www\./, '').split('.')[0].toLowerCase(); } catch {}
  const compact = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rank = (s) => (host && compact(s) === host ? 0 : host && compact(s).includes(host) ? 1 : s.split(/\s+/).length <= 3 ? 2 : 3);
  const ranked = suggestions.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s);
  return { title, description, site_name: siteName, headings, product_suggestions: ranked.slice(0, 4) };
}

/** Fetch the product URL and parse it. Only http(s); capped size and time. */
export async function readSite(url, fetchImpl = globalThis.fetch) {
  let u;
  try { u = new URL(String(url)); } catch { throw new Error('that is not a web address'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('only http and https addresses can be read');
  const res = await fetchImpl(u.toString(), {
    redirect: 'follow',
    signal: AbortSignal.timeout(SITE_TIMEOUT_MS),
    headers: { 'user-agent': 'Ultrademo intake (local)', accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`the site answered ${res.status}`);
  const finalUrl = res.url || u.toString();
  const type = res.headers.get('content-type') || '';
  if (type && !/html|xml/i.test(type)) throw new Error(`the address returned ${type.split(';')[0]}, not a page`);
  let html = '';
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let size = 0;
    while (size < MAX_SITE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      html += dec.decode(value, { stream: true });
    }
    try { await reader.cancel(); } catch { /* already done */ }
  } else {
    html = (await res.text()).slice(0, MAX_SITE_BYTES);
  }
  return { url: u.toString(), ...parseSite(html, finalUrl) };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * The user's own music track (D-72 follow-up): the raw file body of a same-origin POST, at most 60 MB, with an audio
 * extension; saved under assets/music/own-<name>.<ext> only after ffprobe finds an audio stream of 10 s or more.
 * Nothing is played or executed; a file that is not audio is deleted.
 */
async function saveOwnTrack(projectDir, req, name) {
  const ext = path.extname(String(name)).toLowerCase().slice(1);
  if (!['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(ext)) { req.resume(); return { ok: false, error: 'Choose an MP3, WAV, M4A, OGG, AAC or FLAC file.' }; }
  const slug = path.basename(String(name), path.extname(String(name))).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'track';
  const rel = `assets/music/own-${slug}.${ext}`;
  const dir = path.join(projectDir, 'assets', 'music');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.upload-${process.pid}-${Date.now()}.${ext}`);
  try {
    await new Promise((resolve, reject) => {
      let size = 0;
      const out = fs.createWriteStream(tmp);
      req.on('data', (c) => { size += c.length; if (size > MAX_TRACK) { reject(new Error('too large')); req.destroy(); out.destroy(); } });
      req.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      req.pipe(out);
    });
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', tmp], { encoding: 'utf8' });
    const info = JSON.parse(probe.stdout || '{}');
    const secs = Number(info.format?.duration || 0);
    if (!info.streams?.length || secs < 10) throw new Error(secs ? 'shorter than 10 seconds' : 'not an audio file');
    fs.renameSync(tmp, path.join(projectDir, rel));
    return { ok: true, path: rel, title: path.basename(String(name), path.extname(String(name))).slice(0, 80), seconds: Math.round(secs) };
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    return { ok: false, error: err.message === 'too large' ? 'The file is over 60 MB.' : `That file can't be used: ${err.message}.` };
  }
}

// ---- the brand (logo, colours, fonts), read from the site's home page in a real browser and kept under assets/brand/
export const BRAND_LOGO = /^assets\/brand\/logo(-own)?\.(svg|png|jpg|webp)$/;
const HEX = /^#[0-9a-f]{6}$/i;
const toHex = (c) => { const m = String(c).trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/); if (!m) return null; const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1]; return `#${h}`; };
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}
const vivid = (hex) => { const { s, l } = hsl(hex); return s > 0.3 && l > 0.18 && l < 0.82 && !['#0000ee', '#551a8b', '#0000ff'].includes(hex); };

/** Pure: the brand colours from the site's tokens and the logo's own fills. The logo's most used vivid colour is the brand
 * colour; the next vivid one (logo or site) the accent; ground and ink from the page. Browser default link colours and
 * greys never win. */
export function brandColours(tokens = {}, logoSvg = '') {
  const count = new Map();
  for (const m of String(logoSvg).matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?(#[0-9a-f]{3,6})\b/gi)) { const h = toHex(m[1]); if (h && vivid(h)) count.set(h, (count.get(h) || 0) + 1); }
  const fromLogo = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const fromSite = (tokens.accent_candidates || []).map((x) => toHex(x.value)).filter((h) => h && vivid(h));
  const vars = Object.values(tokens.css_variables || {}).map(toHex).filter((h) => h && vivid(h));
  const order = [...new Set([...fromLogo, ...fromSite, ...vars])];
  return {
    brand: order[0] || toHex(tokens.ink) || '#111111',
    accent: order.find((h) => h !== order[0]) || order[0] || '#1674f8',
    ground: toHex(tokens.ground) || '#ffffff',
    ink: toHex(tokens.ink) || '#111111',
  };
}

/** Read the brand from the home page (a real browser, one page): the logo into assets/brand/, the colours and fonts. */
export async function readBrand(projectDir, url) {
  const { readSite } = await import('../direction/scout.mjs');
  const tmp = path.join(projectDir, 'intake-read');
  const r = await readSite({ url, outDir: tmp, maxPages: 1, log: () => {} });
  let logo = null, svg = '';
  if (r.logo) {
    const ext = path.extname(r.logo).slice(1);
    fs.mkdirSync(path.join(projectDir, 'assets', 'brand'), { recursive: true });
    logo = `assets/brand/logo.${ext}`;
    fs.copyFileSync(path.join(tmp, r.logo), path.join(projectDir, logo));
    if (ext === 'svg') svg = fs.readFileSync(path.join(projectDir, logo), 'utf8');
  }
  const t = r.tokens || {};
  return { logo, colors: brandColours(t, svg), fonts: { display: t.fonts?.headings || '', body: t.fonts?.body || t.fonts?.headings || '' } };
}

/** The user's own logo: an SVG (cleaned of scripts) or a PNG, JPEG or WebP, up to 5 MB; kept as assets/brand/logo-own.<ext>. */
async function saveLogo(projectDir, req, name) {
  const ext = { svg: 'svg', png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' }[path.extname(String(name)).toLowerCase().slice(1)];
  if (!ext) { req.resume(); return { ok: false, error: 'Choose an SVG, PNG, JPEG or WebP file.' }; }
  const chunks = []; let size = 0;
  try {
    await new Promise((resolve, reject) => { req.on('data', (c) => { size += c.length; if (size > 5_000_000) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); }); req.on('end', resolve); req.on('error', reject); });
    let body = Buffer.concat(chunks);
    if (ext === 'svg') {
      const text = body.toString('utf8');
      if (!/<svg\b/i.test(text.slice(0, 4000))) throw new Error('it is not an SVG');
      const { cleanSvg } = await import('../direction/scout.mjs');
      body = Buffer.from(cleanSvg(text), 'utf8');
    } else {
      const okSig = ext === 'png' ? body[0] === 0x89 && body.toString('latin1', 1, 4) === 'PNG' : ext === 'jpg' ? body[0] === 0xff && body[1] === 0xd8 : body.toString('latin1', 0, 4) === 'RIFF' && body.toString('latin1', 8, 12) === 'WEBP';
      if (!okSig) throw new Error(`it is not a ${ext.toUpperCase()} image`);
    }
    const dir = path.join(projectDir, 'assets', 'brand');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (/^logo-own\./.test(f)) fs.rmSync(path.join(dir, f));
    fs.writeFileSync(path.join(dir, `logo-own.${ext}`), body);
    return { ok: true, path: `assets/brand/logo-own.${ext}` };
  } catch (err) {
    return { ok: false, error: err.message === 'too large' ? 'The file is over 5 MB.' : `That file can't be used: ${err.message}.` };
  }
}

/** How far the direction step has got since the brief was saved, from the files it writes (newer than the save):
 * started (anything in tasks/, scout/ or direction/), the site read (scout/report.json), the brand read
 * (direction/brand-read.json), the directions (direction/proposals.json with directions). The page polls it. */
export function directionProgress(projectDir, savedAt) {
  const newer = (rel) => { try { return fs.statSync(path.join(projectDir, rel)).mtimeMs >= savedAt - 1000; } catch { return false; } };
  const anyNewer = (dir) => { try { return fs.readdirSync(path.join(projectDir, dir)).some((f) => newer(path.join(dir, f))); } catch { return false; } };
  let directions = false;
  if (newer('direction/proposals.json')) { try { directions = (JSON.parse(fs.readFileSync(path.join(projectDir, 'direction', 'proposals.json'), 'utf8')).directions || []).length > 0; } catch {} }
  const site = newer('scout/report.json'), brand = newer('direction/brand-read.json');
  return { saved_at: savedAt, started: site || brand || directions || anyNewer('tasks') || anyNewer('scout') || anyNewer('direction'), site, brand, directions };
}

/** An HTML mockup or a screenshot the user gives as a screen source: kept in the project under assets/sources/, checked
 * (an HTML file must look like a page; an image must carry a PNG, JPEG or WebP signature), never served back. A mockup
 * also gets a full-page screenshot (Chromium at 1440 wide), so the later steps can use it like a capture. */
async function saveSource(projectDir, req, name) {
  const ext0 = path.extname(String(name)).toLowerCase().slice(1);
  const ext = { htm: 'html', html: 'html', png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' }[ext0];
  if (!ext) { req.resume(); return { ok: false, error: 'Choose an HTML mockup (.html) or a screenshot (PNG, JPEG or WebP).' }; }
  const max = ext === 'html' ? MAX_MOCKUP : MAX_IMAGE;
  const base = path.basename(String(name), path.extname(String(name))).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || 'screen';
  const dir = path.join(projectDir, 'assets', 'sources');
  fs.mkdirSync(dir, { recursive: true });
  let slug = base;
  for (let k = 2; fs.existsSync(path.join(dir, `${slug}.${ext}`)); k++) slug = `${base}-${k}`;
  const rel = `assets/sources/${slug}.${ext}`;
  const tmp = path.join(dir, `.upload-${process.pid}-${Date.now()}.${ext}`);
  try {
    await new Promise((resolve, reject) => {
      let size = 0;
      const out = fs.createWriteStream(tmp);
      req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('too large')); req.destroy(); out.destroy(); } });
      req.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      req.pipe(out);
    });
    const head = Buffer.alloc(4096);
    const fd = fs.openSync(tmp, 'r'); const n = fs.readSync(fd, head, 0, 4096, 0); fs.closeSync(fd);
    let title = path.basename(String(name), path.extname(String(name))).slice(0, 120);
    if (ext === 'html') {
      const text = head.subarray(0, n).toString('utf8');
      if (!/<(!doctype\s+html|html|head|body|div|main|section)\b/i.test(text)) throw new Error('it does not look like an HTML page');
      const t = fs.readFileSync(tmp, 'utf8').match(/<title[^>]*>([^<]{1,200})<\/title>/i);
      if (t) title = t[1].replace(/\s+/g, ' ').trim();
    } else {
      const sig = head.subarray(0, 12);
      const okSig = ext === 'png' ? sig[0] === 0x89 && sig.toString('latin1', 1, 4) === 'PNG'
        : ext === 'jpg' ? sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff
        : sig.toString('latin1', 0, 4) === 'RIFF' && sig.toString('latin1', 8, 12) === 'WEBP';
      if (!okSig) throw new Error(`it is not a ${ext.toUpperCase()} image`);
    }
    fs.renameSync(tmp, path.join(projectDir, rel));
    let shot = null, note = '';
    if (ext === 'html') {
      try { shot = await shootMockup(path.join(projectDir, rel), path.join(dir, `${slug}.png`)) ? `assets/sources/${slug}.png` : null; }
      catch (err) { note = `no screenshot yet (${err.message.split('\n')[0]}); the direction step can take one`; }
    }
    return { ok: true, path: rel, shot, kind: ext === 'html' ? 'mockup' : 'screenshot', title, ...(note ? { note } : {}) };
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    return { ok: false, error: err.message === 'too large' ? `The file is over ${Math.round(max / 1e6)} MB.` : `That file can't be used: ${err.message}.` };
  }
}

/** Full-page screenshot of a local HTML mockup, as it first opens (its own scripts run; it may load its own fonts). */
async function shootMockup(file, out) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(400);
    // many mockups scroll inside a panel, not the page: grow the window by the longest inner scroll so the shot holds it all
    const extra = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('*')].map((e) => {
      const oy = getComputedStyle(e).overflowY;
      return (oy === 'auto' || oy === 'scroll') && e.clientHeight > 200 ? e.scrollHeight - e.clientHeight : 0;
    })));
    if (extra > 0) { await page.setViewportSize({ width: 1440, height: Math.min(900 + extra, 6000) }); await page.waitForTimeout(300); }
    await page.screenshot({ path: out, fullPage: true });
    return true;
  } finally { await browser.close(); }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const send = (res, status, body, type = 'text/html; charset=utf-8') => {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(body);
};
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');

/** Files under plan/intake/assets/ (the template thumbnails). Only plain names inside that folder; nothing else on disk. */
const ASSET_TYPES = { '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function sendAsset(res, pathname) {
  const rel = decodeURIComponent(pathname.slice('/assets/'.length));
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*\.[a-z0-9]+$/i.test(rel)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  const file = path.resolve(ASSETS_DIR, rel);
  const type = ASSET_TYPES[path.extname(file).toLowerCase()];
  if (!type || !file.startsWith(ASSETS_DIR + path.sep) || !fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=3600', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

/** The design system's files (plan/ui/): ui.css, fonts/*.ttf and logos/*.svg, by plain name only. */
const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const UI_TYPES = { '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
export function sendUi(res, pathname) {
  const rel = decodeURIComponent(pathname.slice('/ui/'.length));
  if (!/^(ui\.css|fonts\/[A-Za-z0-9-]+\.ttf|logos\/[a-z0-9-]+\.svg)$/.test(rel)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  const file = path.join(UI_DIR, rel);
  if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  res.writeHead(200, { 'content-type': UI_TYPES[path.extname(file)], 'cache-control': 'max-age=3600', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

/** The voice samples (tts/samples/<id>.mp3) and music previews (music/samples/<track>.mp3). Only a plain name inside that folder; nothing else on disk. */
const MUSIC_SAMPLES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'music', 'samples');
function sendSample(res, pathname, dir = SAMPLES_DIR, prefix = '/voice-samples/') {
  const name = decodeURIComponent(pathname.slice(prefix.length));
  if (!/^[a-z0-9-]+\.mp3$/.test(name)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'max-age=3600', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

/** A POST from another origin (a web page in the same browser) is refused. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl, tests, same-origin form posts without the header
  const host = req.headers.host;
  return origin === `http://${host}`;
}

/**
 * Start the intake server. Resolves with { server, url, port, close }.
 * @param {{ projectDir: string, port?: number, host?: string, fetchImpl?: typeof fetch, now?: () => Date }} opts
 */
export function startServer(opts) {
  const projectDir = path.resolve(opts.projectDir);
  const host = opts.host ?? '127.0.0.1';
  const brandsDir = opts.brandsDir ?? BRANDS_DIR;
  // the saved brand this brief matches, and what saving it would change (for the "update the brand?" card)
  const brandState = (video) => {
    const saved = findBrandFor(video, brandsDir);
    if (!saved) return { status: 'new', name: video.product, changes: [] };
    const changes = brandChanges(saved, brandFromVideo(video, saved), { projectDir, dir: brandsDir });
    return { status: changes.length ? 'changed' : 'same', name: saved.name, slug: saved.slug, changes };
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/') {
        let prefill = null;
        try { prefill = readPlan(projectDir).plan?.video ?? null; } catch { prefill = null; }
        const elevenlabs = opts.elevenlabs ?? elevenlabsReady();
        const brands = listBrands(brandsDir).map((b) => ({ slug: b.slug, name: b.name, domain: b.domain }));
        return send(res, 200, renderIntakePage({ prefill, projectDir, today: todayISO(opts.now?.()), elevenlabs, voices: voiceOptions({ elevenlabs }), brands }));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/assets/')) return sendAsset(res, url.pathname);
      if (req.method === 'GET' && url.pathname.startsWith('/ui/')) return sendUi(res, url.pathname);
      if (req.method === 'GET' && url.pathname.startsWith('/voice-samples/')) return sendSample(res, url.pathname);
      if (req.method === 'GET' && url.pathname.startsWith('/music-samples/')) return sendSample(res, url.pathname, MUSIC_SAMPLES_DIR, '/music-samples/');
      if (req.method === 'GET' && url.pathname === '/saved') {
        let plan = null;
        try { plan = readPlan(projectDir).plan; } catch { plan = null; }
        if (!plan?.video) return send(res, 404, renderSavedPage({ missing: true, projectDir }));
        return send(res, 200, renderSavedPage({ plan, planPath: path.join(projectDir, 'plan.json'), projectDir, notes: fullPlanNotes(plan), brand: brandState(plan.video) }));
      }
      if (req.method === 'POST' && !sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'refused: the request came from another page' });
      if (req.method === 'POST' && url.pathname === '/api/read-site') {
        const body = JSON.parse((await readBody(req)) || '{}');
        try {
          const site = await readSite(body.url, opts.fetchImpl);
          return sendJson(res, 200, { ok: true, site });
        } catch (err) {
          return sendJson(res, 200, { ok: false, error: `Could not read the site: ${err.message}` });
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/music-upload') {
        const r = await saveOwnTrack(projectDir, req, url.searchParams.get('name') || 'track');
        return sendJson(res, r.ok ? 200 : 400, r);
      }
      if (req.method === 'GET' && url.pathname === '/brand/logo') {
        // the logo as a picture: only the two fixed names, no scripts even if one slipped through
        const rel = ['assets/brand/logo-own', 'assets/brand/logo'].flatMap((b) => ['svg', 'png', 'jpg', 'webp'].map((x) => `${b}.${x}`)).find((f) => fs.existsSync(path.join(projectDir, f)) && (url.searchParams.get('which') !== 'site' || !f.includes('-own')) && (url.searchParams.get('which') !== 'own' || f.includes('-own')));
        if (!rel) return send(res, 404, 'no logo', 'text/plain; charset=utf-8');
        const type = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[path.extname(rel).slice(1)];
        res.writeHead(200, { 'content-type': type, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
        return res.end(fs.readFileSync(path.join(projectDir, rel)));
      }
      if (req.method === 'GET' && url.pathname === '/api/progress') {
        // the save time is kept apart from plan.json, which later steps rewrite
        let savedAt = 0;
        try { savedAt = JSON.parse(fs.readFileSync(path.join(projectDir, 'brief-saved.json'), 'utf8')).at; } catch { try { savedAt = fs.statSync(path.join(projectDir, 'plan.json')).mtimeMs; } catch {} }
        return sendJson(res, 200, { ok: true, ...directionProgress(projectDir, savedAt), direction_url: pagesOf(projectDir).direction?.url || null });
      }
      if (req.method === 'POST' && url.pathname === '/api/brand-read') {
        const body = JSON.parse((await readBody(req)) || '{}');
        try { return sendJson(res, 200, { ok: true, brand: await readBrand(projectDir, String(body.url || '')) }); }
        catch (err) { return sendJson(res, 200, { ok: false, error: `Could not read the brand: ${err.message.split('\n')[0]}` }); }
      }
      if (req.method === 'POST' && url.pathname === '/api/logo-upload') {
        const r = await saveLogo(projectDir, req, url.searchParams.get('name') || 'logo');
        return sendJson(res, r.ok ? 200 : 400, r);
      }
      if (req.method === 'POST' && url.pathname === '/api/source-upload') {
        const r = await saveSource(projectDir, req, url.searchParams.get('name') || 'screen');
        return sendJson(res, r.ok ? 200 : 400, r);
      }
      if (req.method === 'POST' && url.pathname === '/api/brand-use') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const brand = brandForBrief(String(body.slug || ''), projectDir, brandsDir);
        return brand ? sendJson(res, 200, { ok: true, brand }) : sendJson(res, 404, { ok: false, error: 'No saved brand by that name.' });
      }
      if (req.method === 'POST' && url.pathname === '/api/brand-save') {
        const video = readPlan(projectDir).plan?.video;
        if (!video) return sendJson(res, 400, { ok: false, error: 'Save the brief first.' });
        const saved = findBrandFor(video, brandsDir);
        const b = saveBrandProfile({ ...brandFromVideo(video, saved), ...(saved ? { slug: saved.slug } : {}) }, { projectDir, dir: brandsDir, now: opts.now?.() || new Date(), from: path.basename(projectDir) });
        console.log(`Brand ${saved ? 'updated' : 'saved'}: ${b.name} (${path.join(brandsDir, b.slug)}).`);
        refreshDashboard(projectDir);
        return sendJson(res, 200, { ok: true, name: b.name, slug: b.slug, updated: Boolean(saved) });
      }
      if (req.method === 'POST' && url.pathname === '/api/submit') {
        const body = JSON.parse((await readBody(req)) || '{}');
        let result;
        try {
          result = saveBrief(projectDir, body, { now: opts.now?.() });
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: err.message });
        }
        if (!result.ok) return sendJson(res, 400, { ok: false, problems: result.problems });
        fs.writeFileSync(path.join(projectDir, 'brief-saved.json'), JSON.stringify({ at: Date.now() }) + '\n');
        refreshDashboard(projectDir);
        track('brief_saved', { ...projectProps(projectDir), from_brand: (() => { try { return Boolean(findBrandFor(JSON.parse(fs.readFileSync(result.planPath, 'utf8')).video, brandsDir)); } catch { return false; } })() });
        // the agent watches this server's output for this line and starts the direction step by itself
        console.log(`Brief saved: ${result.planPath}. Next: the direction step (node plan/direction/run.mjs ${projectDir}).`);
        return sendJson(res, 200, { ok: true, planPath: result.planPath, next: '/saved' });
      }
      return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(opts.port ?? 4321, host, () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        url: `http://${host}:${port}/`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// ---- CLI -----------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const projectDir = args.find((a) => !a.startsWith('--'));
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 4321;
  if (!projectDir || !Number.isFinite(port)) {
    console.error('usage: node plan/intake/serve.mjs <project-dir> [--port 4321] [--no-open]');
    process.exit(2);
  }
  listenOnFree((p) => startServer({ projectDir, port: p }), port).then(({ url }) => {
    recordPage(path.resolve(projectDir), 'intake', url);
    console.log(`Intake page: ${url}${openInBrowser(url) ? '  (opened in your browser)' : ''}`);
    console.log(`Writes: ${path.resolve(projectDir, 'plan.json')}  (Ctrl+C to stop)`);
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

export { TEMPLATE_META, LABELS };
