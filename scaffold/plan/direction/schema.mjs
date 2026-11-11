// schema.mjs — the shapes the direction step reads and writes (step 2 of the five-step flow, D-44).
//
// Three groups: what the site read produces (`ScoutSchema`), what the model
// returns (`BrandReadSchema`, `DirectionsSchema`) and what the page confirms
// (`ChosenSchema`). `toPlanDirection()` and `toSceneSkeletons()` turn a chosen
// direction into the `direction` block and the `scenes[]` of plan/schema.mjs,
// which stays as it is (its fields are the contract; nothing here extends it).
//
// Field names are the working terms; the page shows the plain words (D-55).

import { z } from 'zod';
import { DIALS, HOOK_ANGLES, HOOK_ROUTES, BEATS, TEMPLATES, TRANSITIONS, countWords } from '../schema.mjs';

// ---------------------------------------------------------------------------
// Vocabularies the model chooses from (every one validated here, never free text)
// ---------------------------------------------------------------------------

/**
 * Signature-move kinds: each one has a parameterised GSAP implementation in
 * frames.mjs and maps to motion-style ids in the gallery. The model picks a
 * kind and describes the move in the product's own words.
 */
export const SIGNATURE_KINDS = /** @type {const} */ ({
  'pill-press-morph': { rules: ['cursor-click-ripple', 'press-release-spring', 'card-morph-anchor'], what: 'a cursor presses the product\'s own button and it morphs in place into its done state' },
  'counter-climb': { rules: ['counting-dynamic-scale', 'stat-bars-and-fills'], what: 'a cited number counts up and grows as it climbs, its label beside it' },
  'card-cascade': { rules: ['waterfall-entry', 'spring-pop-entrance'], what: 'three or four cards with real feature names cascade into a grid, each starting before the last settles' },
  'type-slam': { rules: ['kinetic-beat-slam', 'discrete-text-sequence'], what: 'the claim\'s words slam in one by one on the beat, each with its own entrance' },
  'window-push-in': { rules: ['multi-phase-camera', 'coordinate-target-zoom'], what: 'the rebuilt product window settles, then the camera pushes into one control as it changes state' },
  'line-draw-reveal': { rules: ['svg-path-draw', 'waterfall-entry'], what: 'an accent rule draws across and the headline rises through its mask behind it' },
  'token-swap': { rules: ['discrete-text-sequence', 'vertical-spring-ticker'], what: 'one fixed line whose accent word swaps through three real feature names' },
  'toast-stack': { rules: ['spring-pop-entrance', 'nudge-curve', 'anchored-layout-expand'], what: 'notices in the product\'s words arrive one after another and the stack nudges to make room' },
});

/** The sketch layouts each signature move sits best in (frames.mjs renders the move inside the moment's layout). */
export const SIGNATURE_LAYOUTS = {
  'pill-press-morph': ['pill-press', 'close-cta', 'product-window'],
  'counter-climb': ['hero-number', 'split', 'type-centred'],
  'card-cascade': ['cards', 'split', 'type-left'],
  'type-slam': ['type-centred', 'type-left', 'close-cta'],
  'window-push-in': ['product-window', 'pill-press', 'split'],
  'line-draw-reveal': ['type-left', 'type-centred', 'split'],
  'token-swap': ['type-centred', 'type-left', 'cards'],
  'toast-stack': ['product-window', 'pill-press', 'split'],
};

/**
 * The signature moment of a direction: the moment the signature move lives in.
 * Scored on the moment's own text naming the move (the model's word counts
 * most), the sketch layout the move suits, the move's words, and the proof
 * beat; the hook only when nothing else fits.
 * Returns { index, moment, score }.
 */
export function signatureMoment(d) {
  const kind = d.signature?.kind || 'pill-press-morph';
  const words = (d.signature?.words || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  const layouts = SIGNATURE_LAYOUTS[kind] || [];
  let best = { index: 0, moment: d.moments[0], score: -1 };
  d.moments.forEach((m, i) => {
    const text = [m.motion, m.sketch?.note, m.sketch?.picture, ...(m.order || []), m.name, m.goal].join(' ').toLowerCase();
    let score = 0;
    const li = layouts.indexOf(m.sketch?.kind);
    if (li >= 0) score += 2 - li * 0.5;
    if (text.includes(kind) || text.includes(kind.replace(/-/g, ' ')) || text.includes('signature')) score += 3;
    score += Math.min(2, words.filter((w) => text.includes(w)).length);
    if (m.beat === 'proof') score += 1;
    if (i === 0 && d.moments.length > 1) score -= 1.5;
    if (score > best.score) best = { index: i, moment: m, score };
  });
  return best;
}

/** Sketch cell kinds: the plain-shape layouts sketch.mjs can draw. */
export const SKETCH_KINDS = /** @type {const} */ ([
  'type-centred', 'type-left', 'hero-number', 'product-window', 'split', 'stack-problem', 'cards', 'close-cta', 'pill-press',
]);

/** Text entrances the look-check frames implement. */
export const TEXT_ANIMATIONS = /** @type {const} */ (['rise-mask', 'fade-up', 'slam', 'blur-in', 'scale-in', 'letters']);

/**
 * The spine per template (knowledge base §11), as beats from plan/schema.mjs
 * BEATS, with the role name the frame packet reads and the copy cap per beat
 * (doctrine COPY BUDGET: hook 6+5, reveal 5, result 6, bridge 4, punchline
 * 6+4, close brand+CTA). `repeat` marks the moment that fills the middle of a
 * longer video; the model adds one per extra feature.
 */
export const TEMPLATE_SPINES = {
  launch: [
    { beat: 'hook', role: 'hook', cap: 11 }, { beat: 'reveal', role: 'product_intro', cap: 5 }, { beat: 'proof', role: 'key_feature', cap: 6 },
    { beat: 'breadth', role: 'benefits', cap: 8, repeat: true }, { beat: 'punchline', role: 'punchline', cap: 10 }, { beat: 'close', role: 'cta', cap: 6 },
  ],
  'feature-showcase': [
    { beat: 'hook', role: 'hook', cap: 11 }, { beat: 'feature', role: 'key_feature', cap: 8, repeat: true }, { beat: 'close', role: 'cta', cap: 6 },
  ],
  'feature-focus': [
    { beat: 'hook', role: 'hook', cap: 11 }, { beat: 'problem', role: 'problem', cap: 10 }, { beat: 'feature', role: 'key_feature', cap: 8, repeat: true },
    { beat: 'proof', role: 'benefits', cap: 6 }, { beat: 'close', role: 'cta', cap: 6 },
  ],
  'product-tour': [
    { beat: 'hook', role: 'hook', cap: 11 }, { beat: 'feature', role: 'key_feature', cap: 8, repeat: true }, { beat: 'close', role: 'cta', cap: 6 },
  ],
  explainer: [
    { beat: 'hook', role: 'hook', cap: 11 }, { beat: 'problem', role: 'problem', cap: 10 }, { beat: 'reveal', role: 'product_intro', cap: 5 },
    { beat: 'feature', role: 'key_feature', cap: 8, repeat: true }, { beat: 'proof', role: 'social_proof', cap: 6 }, { beat: 'close', role: 'cta', cap: 6 },
  ],
  milestone: [
    { beat: 'hook', role: 'hook', cap: 11 }, { beat: 'proof', role: 'social_proof', cap: 6 }, { beat: 'reveal', role: 'benefits', cap: 8, repeat: true }, { beat: 'close', role: 'cta', cap: 6 },
  ],
  'kinetic-type': [
    { beat: 'hook', role: 'hook', cap: 8 }, { beat: 'punchline', role: 'benefits', cap: 6, repeat: true }, { beat: 'close', role: 'cta', cap: 6 },
  ],
  'talking-head-recut': [
    { beat: 'hook', role: 'hook', cap: 11 }, { beat: 'feature', role: 'key_feature', cap: 8, repeat: true }, { beat: 'close', role: 'cta', cap: 6 },
  ],
  ad: [
    { beat: 'hook', role: 'hook', cap: 8 }, { beat: 'proof', role: 'key_feature', cap: 6 }, { beat: 'cta', role: 'cta', cap: 6 },
  ],
  // D-88: an optional opening (a hook or an opening message), one moment per step, an optional closing message or call
  // to action; `optional` moments are left out when the brief says none (the step caption is "Step 2 · Click Invite")
  tutorial: [
    { beat: 'hook', role: 'hook', cap: 11, optional: true }, { beat: 'step', role: 'step', cap: 8, repeat: true },
    { beat: 'close', role: 'cta', cap: 10, optional: true },
  ],
};

/** Pace by energy (D-43's floor for high; softer positions below it). still_time_max is percent of runtime. */
export const PACE_BY_ENERGY = {
  calm: { motion_per_s_min: 1.5, still_time_max: 5 },
  steady: { motion_per_s_min: 2.0, still_time_max: 3 },
  high: { motion_per_s_min: 2.5, still_time_max: 1 },
  frantic: { motion_per_s_min: 3.0, still_time_max: 0 },
};

/** Template id → the name bands-by-template.json uses. */
export const BAND_NAMES = {
  launch: 'Launch', 'feature-showcase': 'Feature showcase', 'feature-focus': 'Feature focus', 'product-tour': 'Product tour',
  explainer: 'Explainer', milestone: 'Milestone / data story', 'kinetic-type': 'Kinetic type', 'talking-head-recut': 'Talking-head recut', ad: 'Ad',
  tutorial: 'Tutorial',
};

/** D-88, D-90: tutorials have no measured references yet; their pace is set by the motion level between scenes. A step
 * holds long enough to follow, so still time is allowed; with no motion between scenes only the transitions move. */
export const TUTORIAL_PACE = {
  none: { shots_per_min: [4, 10], median: 6, motion_per_s_min: 0.6, still_time_max: 30, longest_still_s_max: 4 },
  minimal: { shots_per_min: [5, 12], median: 8, motion_per_s_min: 1.0, still_time_max: 20, longest_still_s_max: 3 },
  full: { shots_per_min: [6, 14], median: 9, motion_per_s_min: 1.4, still_time_max: 12, longest_still_s_max: 2 },
};
export const MOTION_LEVELS = /** @type {const} */ (['none', 'minimal', 'full']);
/** The motion level for a video: the brief's choice for a tutorial or explainer (D-90), Minimal by default. */
export const motionLevel = (video) => {
  const m = video?.intake?.motion_between;
  return MOTION_LEVELS.includes(m) ? m : 'minimal';
};

/** Reading time for a line (doctrine TIMING): 0.3 s a word, 1.2 s floor, plus 0.4 s entrance and 0.2 s exit. */
export function readingTime(text) {
  const n = countWords(text);
  if (n === 0) return 0;
  return Math.round((Math.max(1.2, 0.3 * n) + 0.6) * 10) / 10;
}

// ---------------------------------------------------------------------------
// The site read (scout.mjs)
// ---------------------------------------------------------------------------

export const ScoutPageSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string(),
  headings: z.array(z.string()),
  labels: z.array(z.string()).describe('button and link labels, the product\'s own words'),
  sentences: z.array(z.string()),
  screenshot: z.string().nullable().describe('project-relative path of the viewport capture'),
});

export const ScoutSchema = z.object({
  url: z.string(),
  read_at: z.string(),
  pages: z.array(ScoutPageSchema),
  claims: z.array(z.object({ id: z.string(), text: z.string(), page: z.string(), why: z.string() })),
  tokens: z.object({
    ground: z.string().nullable(), ink: z.string().nullable(),
    accent_candidates: z.array(z.object({ value: z.string(), count: z.number(), from: z.string() })),
    css_variables: z.record(z.string(), z.string()),
    fonts: z.object({ headings: z.string().nullable(), body: z.string().nullable(), mono: z.string().nullable() }),
  }),
  logo: z.string().nullable(),
  notes: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Model output 1: the brand read and the proposals for Unsure fields (cheap model)
// ---------------------------------------------------------------------------

/** The brief fields the direction step may propose when they were left Unsure at intake. */
export const PROPOSABLE = /** @type {const} */ (['viewer', 'claim', 'pain_point', 'proof_moment', 'cta', 'template', 'length_s', 'narration', 'register', 'product_type', 'look']);

export const BrandReadSchema = z.object({
  summary: z.string().describe('what the product is and for whom, two sentences, from the site'),
  tone_words: z.array(z.string()).describe('three words the site\'s own voice uses'),
  product_words: z.object({
    nav: z.array(z.string()).describe('up to six navigation labels, exactly as on the site'),
    buttons: z.array(z.string()).describe('up to four button labels, exactly as on the site'),
    features: z.array(z.string()).describe('up to six feature names, exactly as on the site'),
    entities: z.array(z.string()).describe('names of people, teams or objects the site shows inside its product (sample values)'),
  }),
  claims: z.array(z.object({
    id: z.string(), use: z.boolean().describe('worth citing in a video'),
    kind: z.enum(['capability', 'case-study', 'result', 'milestone', 'sample']),
    short: z.string().describe('the claim in at most ten words, no more than the page says'),
  })),
  palette_roles: z.object({
    ground: z.string(), ink: z.string(), accent: z.string(),
    primary: z.string().nullable().describe('the button colour when it differs from the accent'),
    warm: z.string().nullable().describe('a second brand colour, if the site has one'),
  }).describe('hex values taken from the tokens, assigned to roles'),
  proposals: z.object({
    viewer: z.string().nullable(), claim: z.string().nullable(), pain_point: z.string().nullable(), proof_moment: z.string().nullable(), cta: z.string().nullable(),
    template: z.enum(TEMPLATES).nullable(), length_s: z.number().nullable(), narration: z.enum(['voice', 'music-only', 'hybrid']).nullable(),
    register: z.enum(['factual', 'balanced', 'bold']).nullable(), product_type: z.enum(['web-app', 'mobile-app', 'website']).nullable(),
    look: z.string().nullable(),
  }).describe('a value for every field marked Unsure, null for the rest'),
  why: z.array(z.object({ field: z.string(), why: z.string() })).describe('one line per proposal: where it came from'),
});

// ---------------------------------------------------------------------------
// Model output 2: three directions (planning model)
// ---------------------------------------------------------------------------

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a six-digit hex colour');

/**
 * The direction schemas come in two builds. `strict` uses z.enum everywhere and
 * is what the step validates against after local repair. `loose` keeps the same
 * shape with plain strings where the strict one has enums: it is the schema sent
 * to the model, because Anthropic's structured-output grammar refuses a schema
 * this size with every enum expanded ("compiled grammar is too large").
 */
export function buildDirectionSchemas(strict = true) {
  const pick = (values) => (strict ? z.enum(values) : z.string().describe(`one of: ${values.join(', ')}`));
  const MomentSchema = z.object({
    beat: pick(BEATS),
    name: z.string().describe('the moment\'s title, two to four words'),
    goal: z.string().describe('what the viewer understands by the end, one sentence'),
    duration_s: z.number().describe('seconds; the list sums to the video length'),
    copy: z.object({
      headline: z.string(), accent: z.string().nullable().describe('a substring of the headline to emphasise, or null'),
      sub: z.string().nullable(), kicker: z.string().nullable().describe('a small mono label, uppercase, or null'),
    }),
    reads: z.string().describe('what the viewer takes in, in plain words'),
    voice: z.string().optional().describe('the narration line said over this moment; empty or absent on a music-only brief; never echoes the copy'),
    carry: z.object({ element: z.string(), action: z.string() }).nullable().describe('what continues into the next moment; null only on the last'),
    visuals: z.array(z.object({
      ref: z.string().describe('a source id for captured, or a label for rebuilt and illustration'),
      kind: pick(['captured', 'rebuilt', 'illustration']),
    })),
    claims: z.array(z.string()).describe('claim ids this moment relies on'),
    blueprint: z.string().describe('a shot-blueprint id, or "composed"'),
    transition_in: pick(TRANSITIONS).describe('how this moment comes in; "cut" on the first'),
    motion: z.string().describe('the motion across the whole moment, in plain words; name the product\'s own parts'),
    camera: z.string().describe('the camera in a few words: fixed, slow push, one move, follows the cursor'),
    sound: z.string().describe('the sound cue, in a few words'),
    order: z.array(z.string()).describe('order of arrival: three to six short steps'),
    sketch: z.object({
      kind: pick(SKETCH_KINDS),
      pill: z.string().nullable().describe('a button label when the layout has one'),
      lines: z.array(z.string()).describe('up to four short labels for boxes, cards, rows or notices'),
      note: z.string().nullable().describe('one motion or camera note drawn as an arrow'),
      meaning: z.string(), feeling: z.string(), picture: z.string(), objects: z.string(), colours: z.string().describe('palette roles, not values'),
    }),
  });
  const DirectionProposalSchema = z.object({
    name: z.string().describe('two to four words'),
    mood: z.string().describe('the look in a line: three words the builders obey'),
    idea: z.string().describe('the idea that makes this direction different from the other two, two sentences'),
    canvas: pick(['light', 'dark']),
    palette: z.array(z.object({ role: z.string(), value: strict ? hex : z.string().describe('six-digit hex'), use: z.string() })).describe('ground, ink, accent required; extend for video (surface, muted, line, primary, glow)'),
    type: z.object({
      display: z.string(), text: z.string(), mono: z.string(),
      why: z.string().describe('the tension the pairing carries'),
    }).describe('families from the open-font list only'),
    text_animation: pick(TEXT_ANIMATIONS),
    energy: pick(DIALS.energy),
    camera: z.string().describe('the camera rule for the whole video, one line'),
    signature: z.object({
      kind: pick(Object.keys(SIGNATURE_KINDS)),
      what: z.string().describe('the move in this product\'s words'),
      words: z.array(z.string()).describe('the real words the move uses: a button label, three feature names, three notices, or the headline'),
      number: z.string().nullable().describe('for counter-climb only: the cited number as written, else null'),
      number_claim: z.string().nullable().describe('for counter-climb only: the claim id, else null'),
    }),
    hook: z.object({ angle: pick(HOOK_ANGLES), route: pick(HOOK_ROUTES), line: z.string().describe('the opening in plain words') }),
    close: pick(['product', 'logo', 'both']),
    closing_shot: z.string().describe('the last thing on screen, in plain words'),
    video_style: z.string().nullable().describe('a video-style gallery id this look is based on, or null when derived from the brand'),
    dials: z.object(Object.fromEntries(Object.entries(DIALS).map(([k, v]) => [k, pick(v)]))),
    words_to_settings: z.array(z.object({ word: z.string(), setting: z.string(), position: z.string() })).describe('each of the user\'s own look words next to the setting it set'),
    music: z.object({ file: z.string().describe('a file name from the music list'), why: z.string() }),
    banned: z.array(z.string()).describe('five to eight things this video never does'),
    cast: z.array(z.object({ name: z.string(), role: z.string() })).optional().describe('the people and companies the video shows (example data, D-74): each name with its one role, e.g. "Kristy Medina: the employee who refers"; one name, one role across the whole video'),
    ground: z.string().describe('the background treatment in words'),
    motion_grammar: z.string().describe('eases, entrance lengths, staggers, what never happens'),
    moments: z.array(MomentSchema),
    judged: z.object({
      serves_claim: z.string(), brand_at_best: z.string(), competitor_could_use: z.string(), survives_bad_day: z.string(),
      score: z.number().describe('1 to 10 after the four questions'),
    }),
  });
  const DirectionsSchema = z.object({
    directions: z.array(DirectionProposalSchema).describe('exactly three, different in idea, not palette'),
    reasoning: z.string().describe('a short summary of how the three were chosen and judged, for the record'),
  });
  return { MomentSchema, DirectionProposalSchema, DirectionsSchema };
}

const STRICT = buildDirectionSchemas(true);
const LOOSE = buildDirectionSchemas(false);
export const MomentSchema = STRICT.MomentSchema;
export const DirectionProposalSchema = STRICT.DirectionProposalSchema;
export const DirectionsSchema = STRICT.DirectionsSchema;
/** The model-facing build (strings where the strict one has enums). */
export const DirectionsModelSchema = LOOSE.DirectionsSchema;

// ---------------------------------------------------------------------------
// The confirm payload and the chosen record
// ---------------------------------------------------------------------------

export const ChosenSchema = z.object({ chosen: z.number().int().min(0) });

// ---------------------------------------------------------------------------
// Proposal → plan blocks
// ---------------------------------------------------------------------------

const LETTERS = ['A', 'B', 'C', 'D'];

/** Normalise durations so the moments are contiguous and sum to length_s exactly (0.1 s grid). */
/** The length the brief allows (D-81): exact; about (±10%, the default); or no more than the length (down to 60% of it). */
export function lengthRange(video) {
  const L = Number(video?.length_s) || 30;
  const fit = video?.intake?.length_fit || 'about';
  const r1 = (x) => Math.round(x * 10) / 10;
  if (fit === 'exact') return { fit, target: L, lo: L, hi: L };
  if (fit === 'max') return { fit, target: L, lo: r1(L * 0.6), hi: L };
  return { fit: 'about', target: L, lo: r1(L * 0.9), hi: r1(L * 1.1) };
}

/** Start and length per moment. Inside the brief's range the moments keep their own timings; outside it they are scaled
 * to the nearest edge. Without a range they fill length_s exactly (the old behaviour). */
export function allocate(moments, length_s, range = null) {
  const raw = moments.map((m) => Math.max(1.2, Number(m.duration_s) || 0));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const lo = range?.lo ?? length_s, hi = range?.hi ?? length_s;
  const total = Math.round((sum < lo ? lo : sum > hi ? hi : sum) * 10) / 10;
  const scaled = raw.map((d) => Math.round((d * total / sum) * 10) / 10);
  let diff = Math.round((total - scaled.reduce((a, b) => a + b, 0)) * 10) / 10;
  // put the rounding remainder on the longest moment
  const longest = scaled.indexOf(Math.max(...scaled));
  scaled[longest] = Math.round((scaled[longest] + diff) * 10) / 10;
  let start = 0;
  return scaled.map((d) => { const s = Math.round(start * 10) / 10; start += d; return { start_s: s, duration_s: d }; });
}

/**
 * Motion lines that cover the whole duration: the order-of-arrival steps spread
 * over the moving part, then the readable pause as its own line (rule 3).
 */
export function motionLines(moment, duration_s, hold_s, extraRuleIds = []) {
  const steps = (moment.order || []).filter(Boolean);
  const moving = Math.max(0.6, duration_s - hold_s);
  const lines = [];
  if (steps.length === 0) {
    lines.push({ from_s: 0, to_s: round1(moving), what: moment.motion || 'the moment arrives' });
  } else {
    const per = moving / steps.length;
    steps.forEach((step, i) => {
      const from = round1(i * per), to = round1(i === steps.length - 1 ? moving : (i + 1) * per);
      const rule = extraRuleIds[i] ? ` (→ ${extraRuleIds[i]})` : '';
      lines.push({ from_s: from, to_s: to, what: `${step}${rule}` });
    });
  }
  lines.push({ from_s: round1(moving), to_s: round1(duration_s), what: 'hold: everything settled so the viewer can read; subtle jitter only' });
  return lines;
}

const round1 = (n) => Math.round(n * 10) / 10;
const slug = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'moment';

/**
 * The plan's `direction` block from a chosen proposal.
 * @param {object} d the proposal (DirectionProposalSchema, with page edits applied)
 * @param {object} ctx { letter, video, fonts: {family → {file, weight}}, fontsByRole?: {display|text|mono → {file, weight}}, music: {file, title, bpm, beat_strength, licence}, pace: {shots_per_min:[lo,hi]}, voice: {tier, voice, sample}, sketchesPath }
 */
// ---- the cast: the names a direction already uses in its scenes, for when it names no cast of its own
const NOT_A_NAME = new Set(['The', 'Their', 'Your', 'Our', 'Every', 'Each', 'This', 'That', 'A', 'An', 'One', 'Test', 'Start', 'Free', 'Plan', 'Monthly', 'Yearly', 'Provider', 'Website', 'Saved', 'Logo', 'Agent', 'Agents', 'Client', 'Clients', 'Billing', 'Portal', 'Portals', 'Card', 'Cards', 'Settings', 'Dashboard', 'New', 'Pro', 'Team', 'Home', 'Pricing', 'Features', 'About', 'Calls', 'Numbers', 'USD', 'EUR', 'GBP', 'API', 'APIs', 'AI']);
const COMPANY_WORD = /\b(Dental|Realty|HVAC|Clinic|Agency|Inc|Ltd|LLC|Studio|Labs|Co|Group|Partners|Law|Health|Plumbing|Roofing|Salon|Spa|Fitness|Motors|Homes|Bakery|Cafe|Café|Media|Capital|Solutions|Consulting|Insurance|Logistics|Foods|Pets|Vet|Legal)\b/;

/** Pure: the people and companies a direction's scenes already name (sketch lines, "named X", "the X agent", portals
 * "for A, B and C"), each with a guessed role, in order of first use. Not the product itself. */
export function castFromDirection(d, product = '') {
  const found = new Map();
  const add = (name, role) => { const n = String(name).trim().replace(/[.,;:]+$/, ''); if (!n || n.length > 40 || NOT_A_NAME.has(n) || (product && n.toLowerCase() === String(product).toLowerCase())) return; if (!found.has(n)) found.set(n, role); };
  const nameRun = /^[A-Z][\w'&.-]*(?: [A-Z][\w'&.-]*){1,2}$/;
  for (const m of d.moments || []) {
    const text = [m.reads, m.motion, m.carry?.element, ...(m.order || []), ...(m.visuals || []).map((v) => v.ref), m.copy?.headline, m.copy?.sub].filter(Boolean).join(' · ');
    const isClient = /portal|client|customer/i.test(`${text} ${m.sketch?.objects || ''}`);
    for (const x of text.matchAll(/\bnamed ([A-Z][\w-]+(?: [A-Z][\w-]+)?)/g)) add(x[1], /agent/i.test(text) ? 'the voice agent (example)' : 'a person (example)');
    for (const x of text.matchAll(/\b(?:the )?([A-Z][a-z]+) (?:agent|card)\b/g)) add(x[1], 'the voice agent (example)');
    for (const x of text.matchAll(/\b(?:for|from|with) ([A-Z][\w&'-]+(?: [A-Z][\w&'-]+){0,2}(?:, [A-Z][\w&'-]+(?: [A-Z][\w&'-]+){0,2})*(?:,? and [A-Z][\w&'-]+(?: [A-Z][\w&'-]+){0,2})?)/g)) {
      for (const part of x[1].split(/, | and /)) if (nameRun.test(part.trim()) || COMPANY_WORD.test(part)) add(part.trim(), isClient ? "the agency's client (example)" : 'a company (example)');
    }
    for (const line of m.sketch?.lines || []) {
      const l = String(line).trim();
      if (nameRun.test(l) && !l.split(' ').every((w) => NOT_A_NAME.has(w))) add(l, COMPANY_WORD.test(l) || isClient ? "the agency's client (example)" : 'a name (example)');
      else if (/^[A-Z][a-z]+$/.test(l) && found.has(l)) add(l, found.get(l));
    }
  }
  return [...found.entries()].map(([name, role]) => ({ name, role })).slice(0, 12);
}

/** Pure: a renamed cast member renamed in every scene of the direction ({ name, was } rows from the refine page);
 * returns a copy with the cast stripped of `was`. Whole words only, so "Marcus" never touches "Marcuses". */
export function renameCast(d) {
  const rows = (Array.isArray(d.cast) ? d.cast : []).filter((c) => c && c.was && c.name && c.was !== c.name);
  const out = JSON.parse(JSON.stringify(d));
  if (rows.length) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fix = (v) => (typeof v === 'string' ? rows.reduce((t, c) => t.replace(new RegExp(`(^|[^\\w])${esc(c.was)}(?![\\w])`, 'g'), `$1${c.name}`), v)
      : Array.isArray(v) ? v.map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v);
    out.moments = fix(out.moments);
    for (const k of ['idea', 'closing_shot', 'signature', 'hook']) if (out[k] !== undefined) out[k] = fix(out[k]);
  }
  if (Array.isArray(out.cast)) out.cast = out.cast.map((c) => ({ name: c.name, role: c.role }));
  return out;
}

export function toPlanDirection(d, ctx) {
  const palette = {};
  for (const p of d.palette) palette[slug(p.role)] = { value: p.value, use: p.use };
  for (const role of ['ground', 'ink', 'accent']) if (!palette[role]) palette[role] = { value: role === 'ground' ? (d.canvas === 'dark' ? '#101216' : '#f7f6f2') : role === 'ink' ? (d.canvas === 'dark' ? '#f2f1ec' : '#1a1a1a') : '#f2c200', use: `${role} (filled in)` };
  const typeRole = (family, use, role) => {
    const f = ctx.fontsByRole?.[role] || ctx.fonts?.[family];
    return f ? { family, weight: f.weight, file: f.file, sizes: use } : { family, sizes: use };
  };
  // a tutorial's motion and still time follow its motion level between scenes (D-90), not the direction's energy
  const pace = ctx.video?.template === 'tutorial' ? TUTORIAL_PACE[motionLevel(ctx.video)] : (PACE_BY_ENERGY[d.energy] || PACE_BY_ENERGY.steady);
  return {
    chosen: ctx.letter,
    name: d.name,
    mood: d.mood,
    canvas: d.canvas,
    palette,
    type: {
      display: typeRole(d.type.display, [{ use: 'headlines', size: '72–130 px', tracking: '-0.02em', line_height: '1.04' }], 'display'),
      text: typeRole(d.type.text, [{ use: 'body and UI text', size: '24–30 px' }], 'text'),
      mono: typeRole(d.type.mono, [{ use: 'kicker / data label', size: '18–22 px, uppercase', tracking: '0.18em' }], 'mono'),
    },
    energy: d.energy,
    pace_band: { shots_per_min: ctx.pace.shots_per_min, motion_per_s_min: pace.motion_per_s_min, still_time_max: pace.still_time_max },
    camera: d.camera,
    signature_move: d.signature.what,
    music: {
      track: ctx.music.own ? `project:${ctx.music.path} (${ctx.music.title}, your licence)` : `music/${ctx.music.file} (${ctx.music.title}, ${ctx.music.licence})`,
      ...(ctx.music.bpm ? { bpm: ctx.music.bpm } : {}),
      ...(typeof ctx.music.beat_strength === 'number' ? { beat_strength: ctx.music.beat_strength } : {}),
      switches_at: [],
    },
    voice: ctx.voice,
    close: d.close,
    hook: { angle: d.hook.angle, route: d.hook.route },
    sketches: ctx.sketchesPath,
    banned: d.banned,
    ...(['fade-rise', 'scale-pop', 'mark-then-name', 'wipe-bar', 'flash-reveal', 'glint', 'none'].includes(d.logo_motion) ? { logo_motion: d.logo_motion } : {}),
    ...(d.thumbnail && ['info', 'headline', 'product', 'versus', 'moment'].includes(d.thumbnail.layout) ? { thumbnail: { layout: d.thumbnail.layout, intro: d.thumbnail.intro === true, ...(String(d.thumbnail.title || '').trim() ? { title: String(d.thumbnail.title).trim().slice(0, 140) } : {}), ...(String(d.thumbnail.line || '').trim() ? { line: String(d.thumbnail.line).trim().slice(0, 200) } : {}), ...(/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(d.thumbnail.screen || '')) ? { screen: String(d.thumbnail.screen) } : {}) } } : {}),
    cast: (Array.isArray(d.cast) && d.cast.length ? d.cast : castFromDirection(d, ctx?.video?.product)).map((c) => ({ name: String(c?.name || '').trim(), role: String(c?.role || '').trim() })).filter((c) => c.name && c.role).slice(0, 16),
    dials: d.dials,
    ...(d.video_style ? { video_style: d.video_style } : {}),
    ground: d.ground,
    motion_grammar: d.motion_grammar,
    rhythm: d.moments.map((m, i) => `${String(i + 1).padStart(2, '0')} ${m.name}: ${m.beat}`).join('; '),
    transition_overlap_s: 0.4,
    components: [],
    composition_rules: [`Signature move: ${d.signature.what}`, `Opening hook: ${d.hook.line}`, `Closing shot: ${d.closing_shot}`],
  };
}

/**
 * Scene skeletons from the moments: status sketched, contiguous times summing
 * to length_s, carry on every scene but the last, motion covering the duration.
 * @param {object} d the chosen proposal
 * @param {object} ctx { video, caps: beat→cap, catalogue: {rules:Set, blueprints:Set}, sourceIds:Set, claimIds:Set }
 */
/**
 * The motion styles a moment uses: the ones the user picked on the Refine
 * screen (moment.rules, D-56/D-67) when they exist in the gallery, else the
 * signature move's styles by the moment's blueprint (composed: all of them,
 * or a spring entrance; a named blueprint: the first two).
 * @param {object} d the direction proposal
 * @param {object} m the moment
 * @param {{ rules: Set<string>, blueprints: Set<string> }} catalogue
 */
// what each beat is for, in the motion gallery's purpose words: the fallback picks a scene's motion styles by it
const BEAT_PURPOSE = { hook: 'Attention', problem: 'Attention', reveal: 'Branding', proof: 'Explanation', demo: 'Explanation', feature: 'Explanation', breadth: 'Sequence', compare: 'Comparison', number: 'Data evidence', result: 'Feedback', punchline: 'Emphasis', close: 'Branding', cta: 'Branding' };
const stableHash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export function momentRules(d, m, catalogue, index = 0) {
  const picked = Array.isArray(m.rules) ? [...new Set(m.rules.filter((r) => catalogue.rules.has(r)))] : [];
  if (picked.length) return picked;
  // no motion styles named for this scene: two from the gallery that fit its beat, different from scene to scene (the old
  // fallback gave every scene the direction's signature pair, so all scenes looked the same). Families by beat; never a
  // transition (that is how the scene comes in, set apart); the direction's own signature styles first where they fit.
  const FAMILIES = { hook: ['Typography', 'Emphasis', 'Entrance & Exit'], problem: ['Typography', 'Emphasis'], reveal: ['Typography', '3D & Depth', 'Entrance & Exit', 'Texture & Style'],
    proof: ['UI Demo', 'Explainer'], demo: ['UI Demo', 'Explainer'], feature: ['UI Demo', 'Explainer'], breadth: ['UI Demo', 'Explainer', '3D & Depth'], number: ['Data'], result: ['Data', 'UI Demo'],
    compare: ['Data', 'Explainer'], punchline: ['Typography', 'Emphasis'], close: ['UI Demo', 'Typography', 'Entrance & Exit'], cta: ['UI Demo', 'Entrance & Exit'] };
  const fams = FAMILIES[m.beat] || ['UI Demo', 'Typography'];
  const want = BEAT_PURPOSE[m.beat] || 'Explanation';
  const entries = (catalogue.entries || []).filter((x) => catalogue.rules.has(x.id) && fams.includes(x.family));
  if (entries.length >= 2) {
    const sig = (SIGNATURE_KINDS[d.signature?.kind]?.rules || []).filter((r) => entries.some((x) => x.id === r));
    const fit = entries.filter((x) => (x.purpose || []).includes(want)).map((x) => x.id).sort();
    const pool = (fit.length >= 2 ? fit : entries.map((x) => x.id).sort()).filter((x) => !sig.includes(x));
    const start = stableHash(`${d.name || ''}|${m.beat}|${index}`) % Math.max(1, pool.length);
    return [...sig, pool[start], pool[(start + 1) % pool.length]].filter((x, k, a) => x && a.indexOf(x) === k).slice(0, 2);
  }
  const blueprint = catalogue.blueprints.has(m.blueprint) ? m.blueprint : 'composed';
  const sigRules = (SIGNATURE_KINDS[d.signature?.kind]?.rules || []).filter((r) => catalogue.rules.has(r));
  return blueprint === 'composed' ? (sigRules.length ? sigRules : ['spring-pop-entrance']) : sigRules.slice(0, 2);
}

export function toSceneSkeletons(d, ctx) {
  const spine = TEMPLATE_SPINES[ctx.video.template] || TEMPLATE_SPINES.launch;
  const capFor = (beat) => (spine.find((s) => s.beat === beat) || {}).cap ?? 8;
  const roleFor = (beat) => (spine.find((s) => s.beat === beat) || {}).role ?? beat;
  const slots = allocate(d.moments, ctx.video.length_s, lengthRange(ctx.video));
  const usedIds = new Set();
  return d.moments.map((m, i) => {
    const last = i === d.moments.length - 1;
    const { start_s, duration_s } = slots[i];
    const headline = m.copy.headline || '';
    const sub = m.copy.sub || '';
    const hold_s = Math.min(1.4, Math.max(0.6, Math.round((0.25 + 0.08 * countWords(headline + ' ' + sub)) * 10) / 10));
    let id = `${String(i + 1).padStart(2, '0')}-${slug(m.name).split('-').slice(0, 2).join('-')}`;
    while (usedIds.has(id)) id += '-b';
    usedIds.add(id);
    const blueprint = ctx.catalogue.blueprints.has(m.blueprint) ? m.blueprint : 'composed';
    const rules = momentRules(d, m, ctx.catalogue, i);
    const visuals = (m.visuals || []).map((v) => {
      if (v.kind === 'captured' && !ctx.sourceIds.has(v.ref)) return { ref: slug(v.ref), kind: 'rebuilt', note: 'no capture of this yet; rebuilt until one exists' };
      if (v.kind === 'illustration') {
        const exists = (m.claims || []).filter((c) => ctx.claimIds.has(c));
        if (!exists.length) return { ref: slug(v.ref), kind: 'rebuilt' };
        return { ref: slug(v.ref), kind: 'illustration', exists };
      }
      return { ref: v.kind === 'captured' ? v.ref : slug(v.ref), kind: v.kind, ...(i === 0 ? {} : {}) };
    });
    if (visuals.length && !visuals.some((v) => v.focal)) visuals[0].focal = true;
    const claims = (m.claims || []).filter((c) => ctx.claimIds.has(c));
    const reads = [{ from_s: 0, to_s: duration_s, what: m.reads || m.goal }];
    return {
      id,
      name: m.name,
      beat: i === 0 ? 'hook' : m.beat,
      role: roleFor(i === 0 ? 'hook' : m.beat),
      goal: m.goal,
      caption: m.sketch?.picture || m.goal,
      start_s,
      duration_s,
      transition_in: i === 0 ? 'cut' : (TRANSITIONS.includes(m.transition_in) ? m.transition_in : 'crossfade'),
      layout: m.sketch?.picture || m.motion,
      content: (m.order && m.order.length ? m.order : [m.motion]).map(String),
      copy: { headline, ...(m.copy.accent ? { accent: m.copy.accent } : {}), ...(sub ? { sub } : {}), words_max: m.words_max || capFor(m.beat) },
      numbers: [],
      // the narration line as written by the direction and edited on the refine page; production voices it
      voice: typeof m.voice === 'string' ? m.voice.trim().slice(0, 600) : '',
      sources: visuals.filter((v) => v.kind === 'captured').map((v) => v.ref),
      claims,
      keywords: (Array.isArray(m.keywords) ? m.keywords : []).map((k) => String(k).trim()).filter(Boolean).slice(0, 12),
      visuals,
      blueprint,
      ...(blueprint !== 'composed' ? { blueprint_posture: 'adapt', blueprint_note: m.motion } : {}),
      rules,
      font: { display: 'headline', text: sub ? 'sub' : 'UI text', mono: m.copy.kicker ? 'kicker, uppercase' : 'labels' },
      mood: m.sketch?.feeling || d.mood,
      camera: m.camera || 'locked',
      motion: motionLines(m, duration_s, hold_s, rules),
      sound: { cue: m.sound || '', sfx: [] },
      hold_s,
      ...(last ? {} : { carry: m.carry && m.carry.element ? m.carry : { element: 'the accent colour', action: 'carries into the next moment' } }),
      reads,
      checks: ['copy readable at phone width', `nothing still longer than the final ${hold_s} s pause`],
      style_tags: [m.beat, d.signature.kind],
      status: 'sketched',
    };
  });
}

/** Copy problems against the caps, one plain line each (the page shows them live; confirm refuses on them). */
export function copyProblems(d, template) {
  const spine = TEMPLATE_SPINES[template] || TEMPLATE_SPINES.launch;
  const out = [];
  d.moments.forEach((m, i) => {
    const cap = m.words_max || (spine.find((s) => s.beat === m.beat) || {}).cap || 8;
    const n = countWords(`${m.copy.headline || ''} ${m.copy.sub || ''}`);
    if (n > cap) out.push({ moment: i, what: `Moment ${i + 1} "${m.name}" has ${n} words on screen; the limit is ${cap}`, fix: 'shorten the headline or the second line' });
  });
  return out;
}

export { LETTERS };
