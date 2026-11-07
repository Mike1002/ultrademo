// propose.mjs — the model calls of the direction step, through OpenRouter.
//
// Request shape and accounting follow app/src/server/director/provider.ts
// (OpenRouter /chat/completions, response_format json_schema strict,
// provider.require_parameters, usage.cost from OpenRouter's usage field) and
// the models the October proofs used (app/quality/2026-10-11-story-engine-3b):
// a Sonnet-class model for planning, Gemini Flash Lite for cheap passes.
//
// Every response is parsed as JSON and validated against a zod schema before
// use; a failed parse retries once with the parse error quoted, then fails
// plainly. A ledger adds every call's tokens and dollars; a hard cap stops the
// run before the next call once reached.
//
// The key is read from app/.env.local (OPENROUTER_API_KEY) or the environment
// and is never printed or written.

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BrandReadSchema, DirectionsSchema, DirectionsModelSchema, DirectionProposalSchema, SIGNATURE_KINDS, TEMPLATE_SPINES, SKETCH_KINDS, TEXT_ANIMATIONS } from './schema.mjs';
import { brandReadSystem, brandReadPrompt, directionsSystem, directionsPrompt, templateLength } from './doctrine.mjs';
import { DIALS, HOOK_ANGLES, HOOK_ROUTES, BEATS, TRANSITIONS, countWords } from '../schema.mjs';

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';
export const DEFAULT_CHEAP_MODEL = 'google/gemini-3.1-flash-lite';
export const DEFAULT_CAP_USD = 3.0;
const API_ROOT = 'https://openrouter.ai/api/v1';
const TIMEOUT_MS = 180_000;

/** Load OPENROUTER_API_KEY from the environment or app/.env.local. Returns null when absent; never logs it. */
export function loadKey(root) {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = path.join(root, 'app', '.env.local');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim() || null;
  }
  return null;
}

/** JSON schema in the strict subset OpenRouter forwards (zod 4 emits required + additionalProperties:false). */
export function jsonSchemaOf(schema) {
  const json = z.toJSONSchema(schema, { target: 'draft-7' });
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (!v || typeof v !== 'object') return v;
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (['$schema', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern'].includes(k)) continue;
      out[k] = strip(x);
    }
    return out;
  };
  return strip(json);
}

/** The cost ledger: one line per call, a total, and the cap. */
const fmtTokens = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export class Ledger {
  constructor(capUSD = DEFAULT_CAP_USD, file = null) {
    this.cap_usd = capUSD;
    this.calls = [];
    this.file = file; // one ledger per run; the file is rewritten after every call
  }
  get total_usd() { return Math.round(this.calls.reduce((a, c) => a + (c.cost_usd || 0), 0) * 1e6) / 1e6; }
  get reached() { return this.total_usd >= this.cap_usd; }
  add(entry) {
    this.calls.push(entry);
    if (this.file) fs.writeFileSync(this.file, JSON.stringify(this.toJSON(), null, 2) + '\n');
  }
  toJSON() {
    const tokens = this.calls.reduce((a, c) => ({ input: a.input + (c.input_tokens || 0), output: a.output + (c.output_tokens || 0) }), { input: 0, output: 0 });
    return { cap_usd: this.cap_usd, total_usd: this.total_usd, input_tokens: tokens.input, output_tokens: tokens.output, calls: this.calls };
  }
  line() {
    const t = this.toJSON();
    // agent mode: the user's own Claude did the work; nothing is charged per call, the tokens are estimates
    if (t.total_usd === 0 && this.calls.some((c) => c.estimated)) return `About ${fmtTokens(t.input_tokens)} tokens read and ${fmtTokens(t.output_tokens)} written by Claude on your plan (estimated from ${this.calls.length} task${this.calls.length === 1 ? '' : 's'}; /cost in Claude Code shows the session's exact use)`;
    return `Cost: $${t.total_usd.toFixed(4)} of a $${this.cap_usd.toFixed(2)} cap · ${t.input_tokens} in / ${t.output_tokens} out tokens · ${this.calls.length} call${this.calls.length === 1 ? '' : 's'}`;
  }
}

export class CapReached extends Error {
  constructor(ledger) { super(`Stopped: the cost cap of $${ledger.cap_usd.toFixed(2)} was reached ($${ledger.total_usd.toFixed(4)} spent). Raise --cap to continue.`); this.name = 'CapReached'; }
}

/**
 * One structured call. `images` are { label, data (base64 jpeg) }. Validates
 * with `schema`; on a parse failure retries once with the error quoted.
 * @returns {Promise<{ data: any, raw: string, usage: object }>}
 */
export async function callModel({ name, model, key, system, prompt, images = [], schema, ledger, maxOutputTokens = 9000, reasoning = 'off', fetchImpl = globalThis.fetch, log = () => {} }) {
  if (ledger?.reached) throw new CapReached(ledger);
  const jsonSchema = jsonSchemaOf(schema);
  let plainJson = false; // set when the provider refuses the strict grammar; the schema then travels in the prompt
  const ask = async (extra) => {
    const body = {
      model,
      max_tokens: maxOutputTokens,
      ...(plainJson ? {} : { provider: { require_parameters: true } }),
      ...(reasoning === 'off' ? { reasoning: { enabled: false } } : reasoning === 'auto' ? {} : { reasoning: { effort: reasoning } }),
      usage: { include: true },
      messages: [
        { role: 'system', content: system + (plainJson ? `\n\nReturn only one JSON object, no prose and no code fence, matching this JSON schema exactly (every property present, null where allowed, no extra keys):\n${JSON.stringify(jsonSchema)}` : '') },
        { role: 'user', content: [{ type: 'text', text: prompt + (extra ? `\n\n${extra}` : '') }, ...images.flatMap((im) => [{ type: 'text', text: im.label }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + im.data } }])] },
      ],
      ...(plainJson ? {} : { response_format: { type: 'json_schema', json_schema: { name: 'ultrademo_direction', strict: true, schema: jsonSchema } } }),
    };
    const t0 = Date.now();
    let res;
    try {
      res = await fetchImpl(`${API_ROOT}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://ultrademo.net', 'X-Title': 'Ultrademo direction step', 'x-ultrademo-call': name }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
    } catch (err) {
      if (err?.name === 'AwaitingAgent' || err?.agent) throw err; // agent mode: the agent's turn, or its answer needs correcting
      throw new Error(`The model connection failed or timed out (${name}): ${err.message}`);
    }
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = String(j?.error?.metadata?.raw || j?.error?.message || '').slice(0, 400); } catch { /* no body */ }
      if (res.status === 400 && !plainJson && /grammar is too large|json_schema|structured outputs/i.test(detail)) {
        log(`${name}: the provider refused the strict schema (${detail.slice(0, 80)}…); asking for plain JSON with the schema in the prompt`);
        plainJson = true;
        return ask(extra);
      }
      throw new Error(`OpenRouter answered ${res.status} for ${name}${res.status === 401 ? ' (the key was refused)' : res.status === 402 ? ' (no credit)' : res.status === 429 ? ' (rate limited)' : ''}${detail ? `: ${detail}` : ''}`);
    }
    const result = await res.json();
    const text = result.choices?.[0]?.message?.content ?? '';
    const usage = result.usage || {};
    const replayed = typeof result.id === 'string' && result.id.startsWith('recorded-');
    const entry = {
      name, model, seconds: Math.round((Date.now() - t0) / 100) / 10,
      input_tokens: usage.prompt_tokens ?? null, output_tokens: usage.completion_tokens ?? null, ...(usage.estimated ? { estimated: true } : {}),
      cost_usd: replayed ? 0 : (typeof usage.cost === 'number' ? usage.cost : null),
      ...(replayed ? { replayed: true, recorded_cost_usd: usage.cost ?? null } : {}),
      finish_reason: result.choices?.[0]?.finish_reason ?? null, response_id: result.id ?? null,
    };
    ledger?.add(entry);
    log(`${name}: ${entry.input_tokens} in / ${entry.output_tokens} out · $${(entry.cost_usd ?? 0).toFixed(4)}${replayed ? ` (replayed; the recorded call cost $${Number(usage.cost ?? 0).toFixed(4)})` : ''} · ${entry.seconds}s`);
    return { text, usage: entry };
  };
  let last = await ask('');
  for (let attempt = 0; attempt < 2; attempt++) {
    let parsed;
    try { parsed = parseJsonLenient(last.text); } catch (err) {
      if (attempt === 1) throw new Error(`${name}: the model did not return JSON twice (${err.message})`);
      if (ledger?.reached) throw new CapReached(ledger);
      last = await ask(`Your previous answer was not valid JSON (${err.message}). Return only the JSON object.`);
      continue;
    }
    const check = schema.safeParse(parsed);
    if (check.success) return { data: check.data, raw: last.text, usage: last.usage };
    const issues = check.error.issues.slice(0, 12).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    if (attempt === 1) throw new Error(`${name}: the model's JSON did not match the schema twice (${issues})`);
    if (ledger?.reached) throw new CapReached(ledger);
    last = await ask(`Your previous answer did not match the schema: ${issues}. Return the corrected JSON object only.`);
  }
  throw new Error(`${name}: no valid answer`);
}

const stripFence = (s) => String(s).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

/** JSON.parse, then once more after mending the slips a long hand-written answer makes (a stray ";" after a value, a trailing comma). */
export function parseJsonLenient(text) {
  const t = stripFence(text);
  try { return JSON.parse(t); } catch (err) {
    const mended = t.replace(/("|\d|true|false|null|\]|\})\s*;\s*(,|\n\s*[,}\]])/g, '$1$2').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(mended); } catch { throw err; }
  }
}

/** The screenshots the user gave at intake (an HTML mockup's full-page shot, their own images), as model images. */
function givenImages(video, projectDir, n) {
  return (video.sources || []).filter((s) => s.kind === 'screenshot' && /\.(png|jpe?g|webp)$/i.test(s.path) && fs.existsSync(path.join(projectDir, s.path)))
    .slice(0, n).map((s) => imageOf(path.join(projectDir, s.path), `Screen the user gave: ${s.what}`));
}

/** A screenshot as a model image (jpeg already; Playwright wrote it at 1280×800). */
export function imageOf(file, label) {
  return { label, data: fs.readFileSync(file).toString('base64') };
}

// ---------------------------------------------------------------------------
// Call 1: the brand read and the proposals for Unsure fields
// ---------------------------------------------------------------------------

export async function brandRead({ video, scout, projectDir, model = DEFAULT_CHEAP_MODEL, key, ledger, fetchImpl, log }) {
  const unsure = video.intake?.unsure ?? {};
  const images = [...scout.pages.slice(0, 3).filter((p) => p.screenshot).map((p) => imageOf(path.join(projectDir, p.screenshot), `Screenshot: ${p.title || p.id} (${p.url})`)), ...givenImages(video, projectDir, 2)];
  return callModel({ name: 'brand-read', model, key, system: brandReadSystem(), prompt: brandReadPrompt({ video, scout, unsure }), images, schema: BrandReadSchema, ledger, maxOutputTokens: 4000, fetchImpl, log });
}

/** Apply the brand read's proposals to the video block: null fields become proposed values, marked under intake.proposed. */
export function applyProposals(video, brand) {
  const v = JSON.parse(JSON.stringify(video));
  v.intake = v.intake || {};
  v.intake.proposed = v.intake.proposed || {};
  const why = Object.fromEntries((brand.why || []).map((w) => [w.field, w.why]));
  const set = (field, value, target = v) => {
    if (value === null || value === undefined || value === '') return;
    target[field] = value;
    v.intake.proposed[field] = { value, why: why[field] || 'proposed by the direction step from the site' };
  };
  const p = brand.proposals || {};
  for (const f of ['viewer', 'claim', 'pain_point', 'proof_moment', 'cta', 'template', 'narration']) if (v[f] === null || v[f] === undefined) set(f, p[f]);
  if (v.length_s === null || v.length_s === undefined) set('length_s', p.length_s ? Math.round(p.length_s) : null);
  if (!v.copy) v.copy = { register: null };
  if (v.copy.register === null || v.copy.register === undefined) { if (p.register) { v.copy.register = p.register; v.intake.proposed.register = { value: p.register, why: why.register || 'proposed from the site\'s tone' }; } }
  if (v.intake.product_type === null || v.intake.product_type === undefined) { if (p.product_type) { v.intake.product_type = p.product_type; v.intake.proposed.product_type = { value: p.product_type, why: why.product_type || 'proposed from the site' }; v.format = p.product_type === 'mobile-app' ? '1080x1920' : '1920x1080'; } }
  if (v.intake.look === null || v.intake.look === undefined) { if (p.look) { v.intake.look = { words: p.look, chips: [] }; v.intake.proposed.look = { value: p.look, why: why.look || 'proposed from the site\'s own look' }; } }
  // last-resort defaults so the step can continue; each is marked as proposed
  if (!v.template) set('template', 'launch');
  if (!v.length_s) set('length_s', { launch: 30, 'feature-showcase': 60, 'feature-focus': 45, 'product-tour': 120, explainer: 90, milestone: 45, 'kinetic-type': 30, 'talking-head-recut': 60, ad: 10 }[v.template] || 30);
  if (!v.narration) set('narration', v.template === 'launch' || v.template === 'ad' || v.template === 'kinetic-type' ? 'music-only' : 'voice');
  if (!v.copy.register) v.copy.register = 'balanced';
  v.intake.voice = { preference: 'none', source: 'built-in', ...(v.intake.voice || {}) };
  if (!v.claim) set('claim', (v.intake?.site?.headings?.[0] || v.product || 'Your product, in motion').split(/\s+/).slice(0, 7).join(' '));
  if (!v.viewer) set('viewer', brand.summary.split(/[.]/)[0]);
  if (!v.cta) set('cta', (brand.product_words?.buttons?.[0]) || 'Start free');
  if (!v.pain_point) set('pain_point', 'doing this by hand, one step at a time');
  if (!v.proof_moment) set('proof_moment', brand.product_words?.features?.[0] || 'the product doing its main job');
  return v;
}

// ---------------------------------------------------------------------------
// Call 2: three directions, then the judge
// ---------------------------------------------------------------------------

/**
 * The directions call. `style` is the user's choice from the style screen: a
 * gallery definition, 'brand', or null (the model chooses). The prompt is
 * written to <projectDir>/direction/directions-prompt.md so what the model was
 * asked can be read and tested.
 */
export async function proposeDirections({ video, brand, claims, sources, fonts, styles, music, pace, blueprints, scout, projectDir, style = null, model = DEFAULT_MODEL, key, ledger, fetchImpl, log }) {
  const spine = TEMPLATE_SPINES[video.template] || TEMPLATE_SPINES.launch;
  const prompt = directionsPrompt({ video, brand, claims, sources, fonts, styles, music, pace, blueprints, spine, templateLength: templateLength(video.template), siteFonts: scout.tokens.fonts, style });
  const system = directionsSystem();
  fs.mkdirSync(path.join(projectDir, 'direction'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'direction', 'directions-prompt.md'), `# Directions prompt\n\nStatus: what the directions call was asked, written by plan/direction/propose.mjs; the model ${model}; the style choice ${style === 'brand' ? 'derived from the brand' : style?.id ? style.id : 'left to the skill'}.\n\n## System\n\n${system}\n\n## User\n\n${prompt}\n`);
  const given = givenImages(video, projectDir, 2);
  const images = [...given, ...scout.pages.slice(0, given.length ? 1 : 2).filter((p) => p.screenshot).map((p) => imageOf(path.join(projectDir, p.screenshot), `Screenshot: ${p.title || p.id}`))];
  return callModel({ name: 'directions', model, key, system, prompt, images, schema: DirectionsModelSchema, ledger, maxOutputTokens: 16000, fetchImpl, log });
}

/**
 * The judge: keep the directions that pass the four questions (the model's
 * own answers; a "yes" on "could a competitor use it unchanged" or a score
 * under 6 drops one), at least two, at most three, best first. Also repairs
 * what can be repaired locally: fonts off the list, unknown ids, caps.
 */
export function judge(result, ctx) {
  const scored = result.directions.map((d, i) => {
    const copyable = /^\s*(yes|it could|probably yes)/i.test(d.judged.competitor_could_use);
    const score = Number(d.judged.score) || 0;
    return { d: repair(d, ctx), i, score: copyable ? Math.min(score, 5) : score, kept: !copyable && score >= 6 };
  }).sort((a, b) => b.score - a.score);
  let kept = scored.filter((s) => s.kept);
  if (kept.length < 2) kept = scored.slice(0, 2);
  kept = kept.slice(0, 3);
  const dropped = scored.filter((s) => !kept.includes(s)).map((s) => ({ name: s.d.name, why: /yes/i.test(s.d.judged.competitor_could_use) ? 'a competitor could use it unchanged' : `scored ${s.score} on the four questions` }));
  return { directions: kept.map((s) => s.d), dropped, reasoning: result.reasoning };
}

const near = (family, list, fallback) => (list.includes(family) ? family : (list.find((f) => f.toLowerCase().startsWith(String(family || '').toLowerCase().split(' ')[0])) || fallback));

/** Local repairs so the plan validates: fonts on the list, ids that exist, caps, carry, the first moment a hook. */
export function repair(d, ctx) {
  const out = JSON.parse(JSON.stringify(d));
  const families = ctx.fonts.map((f) => f.family);
  const subs = [];
  for (const role of ['display', 'text', 'mono']) {
    const want = out.type[role];
    const fallback = role === 'display' ? 'Archivo Black' : role === 'text' ? 'Geist' : 'Geist Mono';
    const got = near(want, families, fallback);
    if (got !== want) { subs.push(`${role}: ${want} → ${got}`); out.type[role] = got; }
  }
  if (!SIGNATURE_KINDS[out.signature.kind]) out.signature.kind = 'pill-press-morph';
  if (out.signature.kind === 'counter-climb' && !(out.signature.number_claim && ctx.claimIds.has(out.signature.number_claim))) { out.signature.kind = 'type-slam'; subs.push('signature: counter-climb needs a cited number; changed to type-slam'); }
  if (ctx.style === 'brand') { if (out.video_style) subs.push(`video style ${out.video_style} dropped: the look is derived from the brand, as chosen`); out.video_style = null; }
  else if (ctx.style && typeof ctx.style === 'object') {
    if (out.video_style !== ctx.style.id) { subs.push(`video style set to ${ctx.style.id}, as chosen`); out.video_style = ctx.style.id; }
    if (ctx.style.canvas && out.canvas !== ctx.style.canvas) { subs.push(`canvas set to ${ctx.style.canvas}, the chosen style's`); out.canvas = ctx.style.canvas; }
  } else if (out.video_style && !ctx.styleIds.has(out.video_style)) { subs.push(`video style ${out.video_style} is not in the gallery; derived from the brand instead`); out.video_style = null; }
  out.dials = out.dials || {};
  for (const [k, positions] of Object.entries(DIALS)) if (!positions.includes(out.dials[k])) out.dials[k] = positions[0];
  if (!DIALS.energy.includes(out.energy)) out.energy = out.dials.energy;
  if (ctx.musicOwn) {
    if (out.music?.file !== 'own') subs.push("music set to the user's own track, as chosen at intake");
    out.music = { ...(out.music || { why: '' }), file: 'own' };
  } else if (ctx.musicPick && ctx.musicFiles.includes(ctx.musicPick) && out.music?.file !== ctx.musicPick) {
    subs.push(`music set to ${ctx.musicPick}, the user's pick at intake`);
    out.music = { ...(out.music || { why: '' }), file: ctx.musicPick };
  }
  if (!ctx.musicOwn && !ctx.musicFiles.includes(out.music?.file)) {
    const set = ['calm', 'still'].includes(out.energy) ? 'calm' : 'energetic';
    const pick = (ctx.music || []).find((m) => m.set === set) || null;
    const file = pick ? pick.file : ctx.musicFiles[0];
    subs.push(`music ${out.music?.file || '(none)'} is not on the curated list; ${pick ? `${pick.title} (${set} set)` : 'the first track'} stands in`);
    out.music = { ...(out.music || { why: '' }), file };
  }
  if (!['light', 'dark'].includes(out.canvas)) out.canvas = 'light';
  if (!['product', 'logo', 'both'].includes(out.close)) out.close = 'product';
  if (!TEXT_ANIMATIONS.includes(out.text_animation)) out.text_animation = 'rise-mask';
  out.palette = (out.palette || []).map((p) => ({ ...p, value: /^#[0-9a-fA-F]{6}$/.test(p.value) ? p.value : (/^#[0-9a-fA-F]{3}$/.test(p.value) ? '#' + p.value.slice(1).split('').map((c) => c + c).join('') : '#888888') }));
  if (!HOOK_ANGLES.includes(out.hook.angle)) out.hook.angle = 'cold-open';
  if (!HOOK_ROUTES.includes(out.hook.route)) out.hook.route = 'visual';
  if (!out.palette.some((p) => p.role === 'ground')) out.palette.unshift({ role: 'ground', value: out.canvas === 'dark' ? '#101216' : '#f7f6f2', use: 'base ground' });
  if (!out.palette.some((p) => p.role === 'ink')) out.palette.push({ role: 'ink', value: out.canvas === 'dark' ? '#f2f1ec' : '#1a1a1a', use: 'text' });
  if (!out.palette.some((p) => p.role === 'accent')) out.palette.push({ role: 'accent', value: '#f2c200', use: 'accent' });
  const spine = TEMPLATE_SPINES[ctx.template] || TEMPLATE_SPINES.launch;
  out.moments = (out.moments || []).filter((m) => m && m.copy);
  if (!out.moments.length) out.moments = [{ beat: 'hook', name: 'Hook', goal: 'the hook', duration_s: 3, copy: { headline: ctx.claim || '', accent: null, sub: null, kicker: null }, reads: '', carry: null, visuals: [], claims: [], blueprint: 'composed', transition_in: 'cut', motion: 'type lands', camera: 'locked', sound: '', order: ['headline lands'], sketch: { kind: 'type-centred', pill: null, lines: [], note: null, meaning: '', feeling: '', picture: '', objects: '', colours: '' } }];
  out.moments[0].beat = 'hook';
  out.moments.forEach((m, i) => {
    if (!BEATS.includes(m.beat)) m.beat = i === 0 ? 'hook' : i === out.moments.length - 1 ? 'close' : 'feature';
    if (!TRANSITIONS.includes(m.transition_in)) m.transition_in = i === 0 ? 'cut' : 'crossfade';
    m.sketch = m.sketch || {};
    if (!SKETCH_KINDS.includes(m.sketch.kind)) m.sketch.kind = m.beat === 'close' || m.beat === 'cta' ? 'close-cta' : 'type-centred';
    m.visuals = (m.visuals || []).map((v) => ({ ref: String(v.ref || 'element'), kind: ['captured', 'rebuilt', 'illustration'].includes(v.kind) ? v.kind : 'rebuilt' }));
    m.words_max = (spine.find((s) => s.beat === m.beat) || {}).cap || 8;
    m.claims = (m.claims || []).filter((c) => ctx.claimIds.has(c));
    if (i === out.moments.length - 1) m.carry = null;
    else if (!m.carry || !m.carry.element) m.carry = { element: 'the accent colour', action: 'carries into the next moment' };
    if (i === 0) m.transition_in = 'cut';
  });
  const strict = DirectionProposalSchema.safeParse(out);
  if (!strict.success) subs.push(...strict.error.issues.slice(0, 5).map((i) => `could not repair ${i.path.join('.')}: ${i.message}`));
  out.repairs = subs;
  return out;
}

/** The words-on-screen count for a moment's copy, for the page counter. */
export function copyCount(m) {
  return countWords(`${m.copy?.headline || ''} ${m.copy?.sub || ''}`);
}

// ---------------------------------------------------------------------------
// Recorded runs: replay the model from fixtures (tests, the static preview)
// ---------------------------------------------------------------------------

const callName = (body) => (/three directions/i.test(body.messages?.[0]?.content || '') ? 'directions' : 'brand-read');

/** A fetch that answers from recorded responses keyed by call name; the default tests never pay. */
export function recordedFetch(dir) {
  const requests = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    const name = callName(body);
    requests.push({ name, body });
    const file = path.join(dir, `${name}.json`);
    if (!fs.existsSync(file)) return new Response(JSON.stringify({ error: `no recording for ${name}` }), { status: 404 });
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Response(JSON.stringify({ id: `recorded-${name}`, choices: [{ finish_reason: 'stop', message: { content: typeof rec.content === 'string' ? rec.content : JSON.stringify(rec.content) } }], usage: rec.usage || { prompt_tokens: 0, completion_tokens: 0, cost: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  f.requests = requests;
  return f;
}

/** A fetch that records real responses next to forwarding them, so one live run becomes the fixtures. */
export function recordingFetch(dir, fetchImpl = globalThis.fetch) {
  fs.mkdirSync(dir, { recursive: true });
  const replay = recordedFetch(dir);
  // only recordings that existed before this run are replayed, so a retry inside the run never gets the answer it just rejected
  const existing = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
  return async (url, init) => {
    const name0 = callName(JSON.parse(init.body));
    if (existing.has(name0)) return replay(url, init);
    const res = await fetchImpl(url, init);
    const clone = res.clone();
    try {
      const json = await clone.json();
      const body = JSON.parse(init.body);
      const name = callName(body);
      const content = json.choices?.[0]?.message?.content;
      if (content) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ model: body.model, recorded_at: new Date().toISOString(), usage: json.usage, content: safeJson(content) }, null, 2) + '\n');
    } catch { /* not JSON; nothing recorded */ }
    return res;
  };
}

const safeJson = (s) => { try { return parseJsonLenient(s); } catch { return s; } };
