// outline.mjs — the outline step (D-91, D-93): between the brief and the directions, the high-level sequence of the video.
// The moments in order (a tutorial's steps), what each needs (its source, a sign-in, a change of data in the product),
// grouped into chapters for a long video; the sign-in tested before any direction work; and, when a step would create
// or change data, the user's two confirmations (a demo or test account; these records are okay). Without them those
// steps are rebuilt from screens (the skill's read-only law 2 holds everywhere else).
//
// The outline lives in plan.video.intake.outline:
//   { status: 'proposed' | 'confirmed', moments: [...], chapters: [...], signin: { path, tested_at, results }, data_ok, confirmed_at }
import { z } from 'zod';
import { BEATS } from '../schema.mjs';

export const SOURCES = /** @type {const} */ (['live', 'mockup', 'figma', 'screenshot', 'site', 'rebuilt']);
/** Above this length a video is grouped into chapters (D-93). */
export const CHAPTER_FROM_S = 300;

export const OutlineMomentSchema = z.strictObject({
  name: z.string().min(1).max(80).describe('a short name, e.g. "Make a knowledge base"'),
  beat: z.enum(BEATS).describe('the kind of moment; every tutorial step is "step"'),
  what: z.string().min(1).max(400).describe('what is shown and what happens, in plain words; for a step: the screen, what is clicked or typed, what changes'),
  source: z.enum(SOURCES).describe('where its screens come from: live (the signed-in product or its site), mockup, figma, screenshot, site (the public site), rebuilt (drawn from the brand; no screen needed)'),
  url: z.string().max(500).describe('the product address that shows this screen, when known (live or site); empty when not known or not a screen'),
  sign_in: z.boolean().describe('true when its screen is behind the product\'s sign-in'),
  data_change: z.string().max(300).describe('empty when nothing in the product changes; else what this step creates, changes, sends or deletes, e.g. "creates a project named Launch video"'),
  seconds: z.number().positive().max(600).describe('about how long the moment runs'),
  chapter: z.string().max(80).describe('the chapter it belongs to; empty when the video has no chapters'),
});

export const OutlineAnswerSchema = z.strictObject({
  moments: z.array(OutlineMomentSchema).min(1).max(200),
  notes: z.string().max(1200).describe('anything the user should know: a screen you could not place, a step that is better rebuilt, a question'),
});

const list = (xs) => xs.filter(Boolean).join('; ');

/** The instructions for the outline task (the agent in agent mode, a model otherwise). */
export function outlineSystem() {
  return `You write the outline of a product video: its moments in order, what each shows, and what each needs to be made. You are planning, not writing copy: a moment's "what" says what the viewer sees and what happens, plainly. Return only one JSON object matching the schema.`;
}

export function outlinePrompt(video) {
  const it = video.intake || {};
  const t = it.tutorial || {};
  const tutorial = video.template === 'tutorial';
  const long = (video.length_s || 0) > CHAPTER_FROM_S;
  const brief = {
    product: video.product, url: video.url, video_type: it.video_type || video.template, scope: it.scope, feature: it.feature,
    length_s: video.length_s, length_fit: it.length_fit, viewer: video.viewer, claim: video.claim, pain_point: video.pain_point,
    proof_moment: video.proof_moment, cta: video.cta, narration: video.narration, motion_between: it.motion_between,
    screens_from: it.screens?.from, sign_in: it.sign_in?.path, notes: it.notes,
  };
  const sources = (video.sources || []).map((s) => `- ${s.id} (${s.kind}): ${s.what}`).join('\n') || '- none yet';
  const site = it.site ? `${it.site.title || ''}\n${(it.site.headings || []).join(' · ')}` : 'not read';
  return `# The brief
${JSON.stringify(brief, null, 1)}
${tutorial ? `
# The tutorial (D-88, D-89)
${JSON.stringify(t, null, 1)}
` : ''}
# Sources the user gave
${sources}

# The site, as read at the brief
${site}

# Rules
- The moments in viewing order, each with a beat from the schema. ${tutorial
    ? `This is a tutorial: an opening moment only when the tutorial's opening is "hook" (beat hook) or "message" (beat hook, a title card), and its "what" ends on the bridge into the first step (what the viewer is about to build, or a question the steps answer), so the first step never arrives unexplained; then one moment per step (beat "step"), in the order a user would take them${t.steps?.length ? ', starting from the steps the user listed (split or add steps only where one listed step hides several clicks)' : ''}; then a closing moment only when its closing is "message" or "cta" (beat close).`
    : 'Follow the shape of the video type: a hook, the moments that carry it, a close.'}
- source: where its screens come from. Prefer what the user gave (${list([it.screens?.from?.join(', '), (video.sources || []).length ? 'their uploads' : ''])}); "live" for the signed-in product, "site" for public pages, "rebuilt" for a moment with no product screen (a title card, a closing message).
- url: the product address of the screen when you know it from the site or the brief; empty otherwise. Never guess a private address.
- sign_in: true when the screen is behind the product's sign-in.
- data_change: say plainly what a step creates, changes, sends or deletes in the product (a record, a connection, a message). Name what it creates with the example data you would use. Empty when it only looks. A step that must change data to be shown is fine: the user is asked to confirm a demo account before anything is created.
- seconds: what the moment needs to be followed${tutorial ? ' (a step: the caption read, the click seen, the result visible)' : ''}. The total should land near ${video.length_s || 'the length'} s, but never squeeze a step to fit: a little over is better than rushed.
- chapter: ${long ? `this video runs past ${CHAPTER_FROM_S / 60} minutes, so group the moments into chapters of a few minutes each, named by what they cover; every moment carries its chapter name.` : 'empty (a video of this length has no chapters).'}
- notes: anything to flag for the user (a screen you could not place, a step you would rather rebuild, a question).`;
}

/** The moments that would create or change data in the product. */
export const dataChanges = (outline) => (outline?.moments || []).map((m, i) => ({ index: i, name: m.name, change: m.data_change })).filter((x) => x.change);

/** Chapters in order of first appearance, with their moments and total seconds. */
export function chaptersOf(outline) {
  const out = [];
  (outline?.moments || []).forEach((m, i) => {
    if (!m.chapter) return;
    let c = out.find((x) => x.name === m.chapter);
    if (!c) out.push((c = { name: m.chapter, moments: [], seconds: 0 }));
    c.moments.push(i);
    c.seconds += m.seconds || 0;
  });
  return out;
}

/** Store a proposed outline in the plan (a new proposal replaces the old one; confirmations reset). */
export function applyOutline(plan, answer, now = new Date()) {
  const moments = answer.moments.map((m) => ({ ...m }));
  plan.video.intake = { ...(plan.video.intake || {}), outline: { status: 'proposed', moments, notes: answer.notes || '', proposed_at: now.toISOString() } };
  return plan.video.intake.outline;
}

/** Sanitise the moments the page sends back (the user's edits: order, text, added and removed moments). */
export function editedMoments(input) {
  const arr = Array.isArray(input) ? input : [];
  const one = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  return arr.slice(0, 200).map((m) => ({
    name: one(m?.name, 80) || 'Moment',
    beat: BEATS.includes(m?.beat) ? m.beat : 'step',
    what: one(m?.what, 400) || one(m?.name, 80) || 'Moment',
    source: SOURCES.includes(m?.source) ? m.source : 'rebuilt',
    url: /^https?:\/\//.test(one(m?.url, 500)) ? one(m.url, 500) : '',
    sign_in: Boolean(m?.sign_in),
    data_change: one(m?.data_change, 300),
    seconds: Math.max(1, Math.min(600, Number(m?.seconds) || 8)),
    chapter: one(m?.chapter, 80),
  }));
}

/**
 * Confirm the outline: the user's moments and, when any step changes data, the two confirmations. Returns
 * { ok, problems, outline }. Without both ticks the outline is still confirmed, but every data change is marked to be
 * rebuilt from screens instead of performed (rebuild: true), and the capture refuses to perform it.
 */
export function confirmOutline(plan, { moments, demo_account = false, creates_ok = false } = {}, now = new Date()) {
  const o = plan.video.intake?.outline;
  if (!o) return { ok: false, problems: ['There is no outline to confirm yet.'] };
  const ms = moments ? editedMoments(moments) : o.moments;
  if (!ms.length) return { ok: false, problems: ['The outline needs at least one moment.'] };
  const changes = ms.filter((m) => m.data_change);
  const allowed = changes.length > 0 && demo_account === true && creates_ok === true;
  const out = {
    ...o, status: 'confirmed', moments: ms.map((m) => (m.data_change ? { ...m, rebuild: !allowed } : m)),
    data_ok: changes.length ? { demo_account: demo_account === true, creates_ok: creates_ok === true, allowed, creates: changes.map((m) => m.data_change), at: now.toISOString() } : null,
    confirmed_at: now.toISOString(),
  };
  plan.video.intake.outline = out;
  return { ok: true, problems: [], outline: out };
}

/** Whether a step may change data during capture: only confirmed, only on the demo account, only what was listed. */
export function mayChange(plan, momentIndex) {
  const o = plan?.video?.intake?.outline;
  const m = o?.moments?.[momentIndex];
  return Boolean(o?.status === 'confirmed' && m?.data_change && !m.rebuild && o.data_ok?.allowed);
}

/** Director mode: the outline confirms itself unless a step changes data, which always waits for the user. */
export const autoConfirmable = (outline) => dataChanges(outline).length === 0;
