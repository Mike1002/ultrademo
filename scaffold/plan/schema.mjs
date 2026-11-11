// schema.mjs — the shape of plan.json, the Ultrademo video plan (D-47).
//
// One file per video. The intake page writes `video`, the direction page writes
// `direction`, production builds every `scenes[]` entry as code, the checks and
// the review page fill `measured` and `review`. Field names here are the working
// terms (beat, scene, blueprint, rule, dials); anything a user sees goes through
// the plain words in `vocabulary.mjs` (D-55).
//
// Zod 4 (already in scaffold/node_modules). Objects are strict: an unknown key
// is an error, which is what keeps a scene from carrying its own palette or
// canvas (rule 4 of the scene spec).

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Vocabularies (knowledge base section 11; decisions D-36, D-45, D-49, D-55)
// ---------------------------------------------------------------------------

/** The ten templates (tutorial: D-88). */
export const TEMPLATES = /** @type {const} */ ([
  'launch', 'feature-showcase', 'feature-focus', 'product-tour', 'explainer',
  'milestone', 'kinetic-type', 'talking-head-recut', 'ad', 'tutorial',
]);

/** Story beats a scene can serve (user word: moment). `step`: one step of a tutorial (D-88). */
export const BEATS = /** @type {const} */ ([
  'hook', 'problem', 'reveal', 'proof', 'breadth', 'feature', 'lifecycle',
  'comparison', 'punchline', 'cta', 'close', 'step',
]);

/** The thirteen opening hooks (D-36). */
export const HOOK_ANGLES = /** @type {const} */ ([
  'cold-open', 'result-first', 'big-claim', 'contradiction', 'pain', 'question',
  'direct-address', 'open-loop', 'promise', 'story-open', 'reveal', 'social-proof', 'fomo',
]);

/** The five ways a hook lands (D-36). */
export const HOOK_ROUTES = /** @type {const} */ (['visual', 'spoken', 'on-screen-text', 'sound', 'edit']);

/** Source kinds (D-47, D-48). */
export const SOURCE_KINDS = /** @type {const} */ ([
  'screenshot', 'recording', 'site-image', 'logo', 'recreated', 'footage', 'generated', 'mockup',
]);

/** Claim tiers (D-27, D-45). User words: seen in the product · stated on your site · needs your confirmation. */
export const CLAIM_TIERS = /** @type {const} */ (['shown', 'customer-stated', 'question']);

/** Visual kinds (D-49). These are already the user-facing words; the working terms were shown · recreated · illustrative. */
export const VISUAL_KINDS = /** @type {const} */ (['captured', 'rebuilt', 'illustration']);

/** Scene statuses. */
export const SCENE_STATUSES = /** @type {const} */ (['planned', 'sketched', 'built', 'approved', 'fix']);

/** Transition into a scene (HyperFrames' transition_in plus the cut catalogue). */
export const TRANSITIONS = /** @type {const} */ (['cut', 'crossfade', 'zoom-through', 'match', 'wipe']);

/** The eleven direction settings and their positions (knowledge base section 11). */
export const DIALS = /** @type {const} */ ({
  energy: ['calm', 'steady', 'high', 'frantic'],
  density: ['sparse', 'balanced', 'busy'],
  ground: ['flat', 'gradient-pools', 'textured', 'photographic'],
  depth: ['flat', 'layered', '3d'],
  camera: ['locked', 'one-move-per-shot', 'fluid', 'chase'],
  type: ['quiet', 'display-led', 'kinetic'],
  texture: ['none', 'glow', 'grain', 'glass', 'chromatic'],
  colour: ['brand-only', 'one-accent', 'duotone', 'full'],
  product_presence: ['product-led', 'mixed', 'concept-led'],
  sound: ['music-led', 'effects-led', 'quiet'],
  voice: ['none', 'narrated', 'presenter'],
});

/** Type roles a direction defines and a scene may reference. */
export const TYPE_ROLES = /** @type {const} */ (['display', 'text', 'mono']);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase words joined by hyphens');
const seconds = z.number().min(0);
const words = (max) => z.string().refine((s) => countWords(s) <= max, { message: `at most ${max} words` });

/** Count the words of a line the way the validator does (whitespace-separated tokens). */
export function countWords(s) {
  return String(s ?? '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// ---------------------------------------------------------------------------
// video — the brief (written by the intake page)
// ---------------------------------------------------------------------------

export const SourceSchema = z.strictObject({
  id,
  kind: z.enum(SOURCE_KINDS),
  path: z.string().min(1).describe('project-relative path, e.g. assets/control-room.png'),
  what: z.string().min(1).describe('what the picture shows, in plain words'),
});

export const ClaimSchema = z.strictObject({
  id,
  text: z.string().min(1),
  tier: z.enum(CLAIM_TIERS),
  cite: z.string().describe('where the fact is stated; may be empty only while the tier is question'),
  kind: z.enum(['capability', 'case-study', 'result', 'milestone', 'sample']).optional().describe('what kind of claim; "sample" is a value shown in the rebuilt UI, not a claim the video makes'),
  note: z.string().optional(),
});

export const VideoSchema = z.strictObject({
  product: z.string().min(1),
  url: z.string().url(),
  template: z.enum(TEMPLATES),
  viewer: z.string().min(1).nullable().describe("who it is for, in the site's own words; null while Unsure at intake"),
  claim: z.string().min(1).nullable().describe("the core message in the user's own words (no word limit; the direction step writes the on-screen lines from it); null while Unsure at intake"),
  pain_point: z.string().min(1).nullable(),
  proof_moment: z.string().min(1).nullable(),
  cta: z.string().min(1).nullable(),
  length_s: z.number().positive().nullable(),
  narration: z.enum(['voice', 'music-only', 'hybrid']).nullable(),
  autonomy: z.enum(['review', 'director']).describe('user words: review mode | auto mode'),
  copy: z.strictObject({
    register: z.enum(['factual', 'balanced', 'bold']).default('balanced').describe('user word: tone (D-45)'),
  }).default({ register: 'balanced' }),
  reference: z.string().optional().describe('path to a reference video, if the user gave one'),
  sources: z.array(SourceSchema).default([]),
  claims: z.array(ClaimSchema).default([]),
  // Storyboard frontmatter extras. Optional; the generator has defaults.
  format: z.string().regex(/^\d+x\d+$/).default('1920x1080'),
  fps: z.number().int().positive().default(30),
  captions: z.enum(['enabled', 'disabled']).default('disabled'),
  message: z.string().optional().describe('one-line thesis for the storyboard; defaults to claim'),
  arc: z.string().optional().describe('narrative arc line; defaults to the beats in order'),
  intake: z.record(z.string(), z.unknown()).optional().describe('intake-only notes (Unsure fields, site read, sign-in path); read by the direction step'),
});

// ---------------------------------------------------------------------------
// direction — the look (written by the direction page)
// ---------------------------------------------------------------------------

const PaletteEntry = z.union([
  z.string().min(1),
  z.strictObject({ value: z.string().min(1), use: z.string().optional() }),
]);

const TypeRole = z.union([
  z.string().min(1),
  z.strictObject({
    family: z.string().min(1),
    weight: z.union([z.string(), z.number()]).optional(),
    file: z.string().optional().describe('project-relative font file for @font-face'),
    note: z.string().optional(),
    sizes: z.array(z.strictObject({
      use: z.string().min(1),
      size: z.string().min(1),
      tracking: z.string().optional(),
      line_height: z.string().optional(),
    })).optional(),
  }),
]);

export const DirectionSchema = z.strictObject({
  chosen: z.string().min(1).describe('which of the offered directions was picked, e.g. "B"'),
  name: z.string().min(1),
  mood: z.string().min(1).describe('three words the builders obey'),
  canvas: z.enum(['light', 'dark']),
  palette: z.record(z.string(), PaletteEntry)
    .refine((p) => ['ground', 'ink', 'accent'].every((k) => k in p), { message: 'palette needs ground, ink and accent roles' }),
  type: z.strictObject({ display: TypeRole, text: TypeRole, mono: TypeRole }),
  energy: z.enum(DIALS.energy),
  pace_band: z.strictObject({
    shots_per_min: z.tuple([z.number().min(0), z.number().min(0)]),
    motion_per_s_min: z.number().min(0),
    still_time_max: z.number().min(0),
  }),
  camera: z.string().min(1),
  signature_move: z.string().min(1),
  music: z.strictObject({
    track: z.string().min(1),
    bpm: z.number().positive().optional(),
    beat_strength: z.number().min(0).max(1).optional(),
    usable_from_s: z.number().min(0).optional().describe('where the bed starts in the track, seconds (a slow build skipped); 0 when it starts at the top'),
    switches_at: z.array(seconds).default([]),
  }),
  voice: z.strictObject({
    tier: z.enum(['none', 'standard', 'expressive', 'presenter']),
    voice: z.string().optional(),
    sample: z.string().optional(),
  }),
  close: z.enum(['product', 'logo', 'both']),
  hook: z.strictObject({ angle: z.enum(HOOK_ANGLES), route: z.enum(HOOK_ROUTES) }),
  sketches: z.string().optional().describe('folder or glob of the sketch storyboard the user reviewed'),
  banned: z.array(z.string().min(1)).default([]),
  thumbnail: z.strictObject({
    layout: z.enum(['info', 'headline', 'product', 'versus', 'moment']),
    intro: z.boolean().default(false),
    title: z.string().max(140).optional(),
    line: z.string().max(200).optional(),
    screen: z.string().min(1).optional().describe('the source id of the screen shown in it; else the first screenshot'),
  }).optional().describe('D-82: the thumbnail picked on the refine page; intro opens the video on it for about 1.5 s (taken from scene 1)'),
  logo_motion: z.enum(['fade-rise', 'scale-pop', 'mark-then-name', 'wipe-bar', 'flash-reveal', 'glint', 'none']).optional().describe('how the logo arrives in the reveal and the close (refine page)'),
  cast: z.array(z.strictObject({ name: z.string().min(1), role: z.string().min(1) })).default([]).describe('the people and companies on screen, each with one role (refine page); production uses exactly these'),
  dials: z.strictObject({
    energy: z.enum(DIALS.energy),
    density: z.enum(DIALS.density),
    ground: z.enum(DIALS.ground),
    depth: z.enum(DIALS.depth),
    camera: z.enum(DIALS.camera),
    type: z.enum(DIALS.type),
    texture: z.enum(DIALS.texture),
    colour: z.enum(DIALS.colour),
    product_presence: z.enum(DIALS.product_presence),
    sound: z.enum(DIALS.sound),
    voice: z.enum(DIALS.voice),
  }),
  video_style: id.optional().describe('a video-style gallery id the direction is based on'),
  // Design-system prose for frame.md and the storyboard's direction section. Optional.
  ground: z.string().optional().describe('background treatment in words'),
  motion_grammar: z.string().optional(),
  rhythm: z.string().optional(),
  transition_overlap_s: z.number().min(0).default(0.4),
  components: z.array(z.strictObject({ name: z.string().min(1), spec: z.string().min(1) })).default([]),
  composition_rules: z.array(z.string().min(1)).default([]),
});

// ---------------------------------------------------------------------------
// scenes[] — one animated page each
// ---------------------------------------------------------------------------

export const VisualSchema = z.strictObject({
  ref: id.describe('a source id (captured) or a label for a rebuilt or illustrated element'),
  kind: z.enum(VISUAL_KINDS),
  exists: z.array(id).optional().describe('claim or source ids proving what an illustration depicts exists'),
  role: z.string().optional().describe("the element's job in the shot, e.g. cutout, supporting"),
  focal: z.boolean().optional().describe('the hero of the shot'),
  note: z.string().optional(),
});

export const MotionLineSchema = z.strictObject({
  from_s: seconds,
  to_s: seconds,
  what: z.string().min(1).describe('what is on screen and what moves in this window; cite motion styles inline as (→ id)'),
}).refine((m) => m.to_s > m.from_s, { message: 'to_s must be after from_s' });

export const SceneSchema = z.strictObject({
  id: id.describe('frame id, e.g. 03-raised; also the composition file name'),
  name: z.string().min(1).describe('the frame title in the storyboard heading'),
  beat: z.enum(BEATS),
  role: z.string().min(1).describe("the blueprint role it serves, e.g. social_proof"),
  persuasion: z.string().optional().describe("HyperFrames' persuasion label for the frame packet"),
  goal: z.string().min(1).describe('the takeaway, one sentence'),
  caption: z.string().optional().describe('one-line contact-sheet caption for the storyboard; defaults to layout'),
  start_s: seconds,
  duration_s: z.number().positive(),
  transition_in: z.enum(TRANSITIONS),
  layout: z.string().min(1),
  content: z.array(z.string().min(1)).min(1).describe('what is in the shot, in order of appearance'),
  copy: z.strictObject({
    headline: z.string(),
    accent: z.string().optional(),
    sub: z.string().optional(),
    words_max: z.number().int().positive(),
  }),
  numbers: z.array(z.strictObject({
    value: z.string().min(1),
    cite: id.describe('a claim id or a source id'),
  })).default([]),
  voice: z.string().default('').describe('the narration line; empty when music-only; never echoes the copy'),
  sources: z.array(id).default([]),
  claims: z.array(id).default([]).describe('claim ids this scene relies on beyond its numbers'),
  keywords: z.array(z.string().min(1)).default([]).describe("words or facts the user asked this scene to show, in their own words (refine page); shown as written"),
  visuals: z.array(VisualSchema).default([]),
  blueprint: z.string().min(1).describe('a shot-blueprint id or "composed"'),
  blueprint_posture: z.enum(['reproduce', 'adapt']).optional(),
  blueprint_note: z.string().optional().describe('what is kept and what changes when adapting'),
  focal: z.strictObject({ ref: id.optional(), note: z.string().optional() }).optional(),
  rules: z.array(id).default([]).describe('motion style ids'),
  font: z.partialRecord(z.enum(TYPE_ROLES), z.string().min(1)).default({}),
  mood: z.string().min(1).describe('the emotional beat'),
  camera: z.string().min(1),
  motion: z.array(MotionLineSchema).min(1),
  sound: z.strictObject({ cue: z.string().default(''), sfx: z.array(z.string()).default([]) }).default({ cue: '', sfx: [] }),
  hold_s: seconds,
  carry: z.strictObject({ element: z.string().min(1), action: z.string().min(1) }).optional(),
  reads: z.array(z.strictObject({ from_s: seconds, to_s: seconds, what: z.string().min(1) })).default([]),
  cue: z.array(z.strictObject({ at_s: seconds, what: z.string().min(1) })).optional(),
  checks: z.array(z.string().min(1)).default([]),
  style_tags: z.array(z.string().min(1)).default([]),
  status: z.enum(SCENE_STATUSES),
  measured: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  review: z.strictObject({
    verdict: z.enum(['ok', 'ok-with-note', 'fix']),
    note: z.string().default(''),
  }).optional(),
});

export const PlanSchema = z.strictObject({
  version: z.literal(1).default(1),
  video: VideoSchema,
  direction: DirectionSchema,
  scenes: z.array(SceneSchema).min(1),
});

/**
 * @typedef {z.infer<typeof PlanSchema>} Plan
 * @typedef {z.infer<typeof VideoSchema>} Video
 * @typedef {z.infer<typeof DirectionSchema>} Direction
 * @typedef {z.infer<typeof SceneSchema>} Scene
 * @typedef {z.infer<typeof SourceSchema>} Source
 * @typedef {z.infer<typeof ClaimSchema>} Claim
 * @typedef {z.infer<typeof VisualSchema>} Visual
 * @typedef {z.infer<typeof MotionLineSchema>} MotionLine
 */

/**
 * Parse a plan object. Returns `{ ok: true, plan }` with defaults applied, or
 * `{ ok: false, issues }` where every issue has a dotted `path` and a `message`.
 * @param {unknown} input
 * @returns {{ ok: true, plan: Plan } | { ok: false, issues: Array<{ path: string, message: string }> }}
 */
export function parsePlan(input) {
  const result = PlanSchema.safeParse(input);
  if (result.success) return { ok: true, plan: result.data };
  const issues = result.error.issues.map((i) => ({
    path: i.path.map(String).join('.') || '(root)',
    message: i.message,
  }));
  return { ok: false, issues };
}
