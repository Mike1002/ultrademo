#!/usr/bin/env node
// validate.mjs — check a video plan against the schema and the rules.
//
//   node plan/validate.mjs <plan.json> [--against <previous-plan.json>] [--json]
//
// Prints one plain-language line per problem (scene id, what is wrong, how to
// fix it) and exits 1 when anything fails. Warnings never fail. `--against`
// compares with an earlier copy so that a scene already built only changes in
// `measured`, `review` and `status`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlan, countWords, TYPE_ROLES } from './schema.mjs';
import { VideoSchema } from './schema.mjs';
import { loadCatalogue } from './catalogue.mjs';
import { plain } from './vocabulary.mjs';

const TIME_TOLERANCE_S = 0.05;   // float slack inside a scene and between scenes
const LENGTH_TOLERANCE_S = 0.3;  // scenes must sum to length_s within this

/** Fields a built scene may still change (rule 9 of the scene spec). */
const MUTABLE_AFTER_BUILT = new Set(['measured', 'review', 'status']);
const BUILT_OR_LATER = new Set(['built', 'approved', 'fix']);

const CAPTURED_SOURCE_KINDS = new Set(['screenshot', 'recording', 'site-image', 'logo', 'footage']);

/**
 * @typedef {{ level: 'error' | 'warning', scene: string, what: string, fix: string }} Problem
 */

/**
 * Run every rule. Pure: takes a parsed plan, returns problems.
 * @param {import('./schema.mjs').Plan} plan
 * @param {{ catalogue?: ReturnType<typeof loadCatalogue>, previous?: import('./schema.mjs').Plan | null }} [opts]
 * @returns {Problem[]}
 */
export function checkRules(plan, opts = {}) {
  const catalogue = opts.catalogue ?? loadCatalogue();
  /** @type {Problem[]} */
  const problems = [];
  const error = (scene, what, fix) => problems.push({ level: 'error', scene, what, fix });
  const warn = (scene, what, fix) => problems.push({ level: 'warning', scene, what, fix });

  const { video, direction, scenes } = plan;
  const sourceIds = new Map(video.sources.map((s) => [s.id, s]));
  const claimIds = new Map(video.claims.map((c) => [c.id, c]));
  const refExists = (ref) => sourceIds.has(ref) || claimIds.has(ref);

  for (const file of catalogue.missing) {
    warn('video', `catalogue file not found: ${file}`, `${plain('blueprint')}, ${plain('rule')} and ${plain('video_style')} ids cannot be checked until it exists`);
  }

  // ---- video level ---------------------------------------------------------
  const sceneIds = new Set();
  for (const s of scenes) {
    if (sceneIds.has(s.id)) error(s.id, 'duplicate scene id', 'give every scene its own id');
    sceneIds.add(s.id);
  }
  for (const c of video.claims) {
    if (c.tier !== 'question' && !c.cite.trim()) {
      error('video', `claim "${c.id}" is ${plain(c.tier)} but has no citation`, 'add where it is stated, or set its tier to question until it is confirmed');
    }
  }
  if (direction.video_style && catalogue.videoStyles.size && !catalogue.videoStyles.has(direction.video_style)) {
    error('direction', `${plain('video_style')} "${direction.video_style}" is not in the video-style gallery`, 'pick an id from research/motion-craft/video-style-gallery/index.json or remove it');
  }

  // ---- timeline ------------------------------------------------------------
  if (scenes[0].start_s > TIME_TOLERANCE_S) {
    error(scenes[0].id, `the first scene starts at ${scenes[0].start_s} s`, 'the first scene starts at 0');
  }
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1];
    const expected = prev.start_s + prev.duration_s;
    if (Math.abs(scenes[i].start_s - expected) > TIME_TOLERANCE_S) {
      error(scenes[i].id, `starts at ${fmt(scenes[i].start_s)} s but the previous scene ends at ${fmt(expected)} s`, `set start_s to ${fmt(expected)} so the scenes are contiguous`);
    }
  }
  const total = scenes.reduce((a, s) => a + s.duration_s, 0);
  if (Math.abs(total - video.length_s) > LENGTH_TOLERANCE_S) {
    error('video', `the scenes add up to ${fmt(total)} s but length_s is ${fmt(video.length_s)} s`, `adjust a scene's duration or set length_s to ${fmt(total)} (within ${LENGTH_TOLERANCE_S} s)`);
  }

  // ---- opening hook --------------------------------------------------------
  if (scenes[0].beat !== 'hook') {
    error(scenes[0].id, `the opening scene is a ${plain('beat')} of kind "${scenes[0].beat}"`, `the first scene carries the ${plain('hook angle')}: set its beat to "hook"`);
  }

  // ---- per scene -----------------------------------------------------------
  scenes.forEach((s, i) => {
    const last = i === scenes.length - 1;

    // numbers cite an existing claim or source
    for (const n of s.numbers) {
      if (!refExists(n.cite)) {
        error(s.id, `the number "${n.value}" cites "${n.cite}", which is not a claim or source id`, 'cite a claim from video.claims or a source from video.sources, or add one');
      }
    }
    // carry: the element that continues should be something this scene actually shows
    if (s.carry && s.carry.element) {
      const hay = [...(s.content || []), ...(s.visuals || []).map((v) => v.ref), s.layout || ''].join(' ').toLowerCase();
      const words = String(s.carry.element).toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2);
      if (words.length && !words.some((wd) => hay.includes(wd))) {
        warn(s.id, `"continues into the next scene" names "${s.carry.element}", which this scene does not show`, 'name something that is on screen in this scene, or add it to the scene content');
      }
    }
    // question-tier claims: scene stays, status may not be approved
    const citedClaims = [...s.numbers.map((n) => n.cite), ...s.claims].filter((c) => claimIds.has(c)).map((c) => claimIds.get(c));
    const questions = citedClaims.filter((c) => c.tier === 'question' && c.kind !== 'sample');
    if (questions.length) {
      const list = questions.map((q) => `"${q.id}"`).join(', ');
      if (s.status === 'approved') {
        error(s.id, `approved while claim ${list} still ${plain('question')}`, 'confirm the claim (set its tier and citation) before approving, or set the scene status back to built');
      } else {
        warn(s.id, `claim ${list} ${plain('question')}; the scene is kept and marked unconfirmed`, 'confirm it on the review page before approving');
      }
    }
    for (const c of s.claims) {
      if (!claimIds.has(c)) error(s.id, `claims lists "${c}", which is not in video.claims`, 'add the claim or remove the reference');
    }
    for (const src of s.sources) {
      if (!sourceIds.has(src)) error(s.id, `sources lists "${src}", which is not in video.sources`, 'add the source or remove the reference');
    }

    // motion covers the whole duration with no gap
    const lines = [...s.motion].sort((a, b) => a.from_s - b.from_s);
    if (lines[0].from_s > TIME_TOLERANCE_S) {
      error(s.id, `motion starts at ${fmt(lines[0].from_s)} s, leaving a dead ${plain('hold')} at the start`, 'start the first motion line at 0.0');
    }
    let reach = lines[0].to_s;
    for (let k = 1; k < lines.length; k++) {
      if (lines[k].from_s - reach > TIME_TOLERANCE_S) {
        error(s.id, `nothing happens between ${fmt(reach)} s and ${fmt(lines[k].from_s)} s (a dead ${plain('hold')})`, 'extend the previous motion line or add one for that window');
      }
      reach = Math.max(reach, lines[k].to_s);
    }
    if (s.duration_s - reach > TIME_TOLERANCE_S) {
      error(s.id, `motion ends at ${fmt(reach)} s but the scene lasts ${fmt(s.duration_s)} s (a dead ${plain('hold')})`, 'add a motion line to the end of the scene, even if it is the readable pause');
    }
    if (reach - s.duration_s > TIME_TOLERANCE_S) {
      error(s.id, `motion runs to ${fmt(reach)} s, past the scene's ${fmt(s.duration_s)} s`, 'shorten the last motion line or lengthen the scene');
    }
    if (s.hold_s > s.duration_s + TIME_TOLERANCE_S) {
      error(s.id, `${plain('hold_s')} of ${fmt(s.hold_s)} s is longer than the scene`, 'set hold_s to the readable pause after the last change');
    }
    for (const r of s.reads) {
      if (r.to_s > s.duration_s + TIME_TOLERANCE_S || r.to_s <= r.from_s) {
        error(s.id, `${plain('reads')} window ${fmt(r.from_s)}–${fmt(r.to_s)} s does not fit inside the scene`, 'keep from_s < to_s ≤ duration_s');
      }
    }
    for (const c of s.cue ?? []) {
      if (c.at_s > s.duration_s + TIME_TOLERANCE_S) {
        error(s.id, `cue at ${fmt(c.at_s)} s is past the end of the scene`, 'move the cue inside the scene');
      }
    }

    // words
    const used = countWords(s.copy.headline) + countWords(s.copy.sub ?? '');
    if (used > s.copy.words_max) {
      error(s.id, `headline and sub use ${used} words; the cap is ${s.copy.words_max}`, 'cut the copy or raise words_max on the direction page');
    }

    // font, palette, canvas come from the direction block
    for (const role of Object.keys(s.font)) {
      if (!TYPE_ROLES.includes(role) || !(role in direction.type)) {
        error(s.id, `font names a type role "${role}" the direction does not define`, `use one of ${TYPE_ROLES.join(', ')}`);
      }
    }
    const hexHits = findHex(s);
    if (hexHits.length) {
      error(s.id, `names a colour by value (${hexHits.slice(0, 3).join(', ')}) in ${hexHits.length > 3 ? 'several fields' : 'its text'}`, 'name the palette role from the direction block instead (ink, accent, …)');
    }

    // blueprint and rules exist
    if (s.blueprint !== 'composed' && catalogue.blueprints.size && !catalogue.blueprints.has(s.blueprint)) {
      error(s.id, `${plain('blueprint')} "${s.blueprint}" is not in the HyperFrames index or ours`, 'pick an id from blueprints-index.md, one of ours, or write "composed" and list the motion styles');
    }
    if (s.blueprint === 'composed' && s.rules.length === 0) {
      error(s.id, `${plain('blueprint')} is "composed" but no ${plain('rules')} are listed`, 'list the motion styles the scene is composed from');
    }
    for (const r of s.rules) {
      if (catalogue.rules.size && !catalogue.rules.has(r)) {
        error(s.id, `${plain('rule')} "${r}" is not in the motion gallery`, 'pick an id from research/motion-craft/motion-gallery/index.json');
      }
    }
    // inline "(→ id)" mentions should be declared in rules[] (or be the blueprint)
    for (const line of s.motion) {
      // ids are hyphenated words; a prose arrow ("→ the speakers") is not a citation
      for (const m of line.what.matchAll(/→\s*([a-z0-9]+(?:-[a-z0-9]+)+)/g)) {
        const ref = m[1];
        if (!s.rules.includes(ref) && ref !== s.blueprint) {
          warn(s.id, `motion text cites "${ref}" but rules[] does not list it`, 'add it to rules[] so the frame packet inlines its recipe');
        }
      }
    }

    // visuals
    for (const v of s.visuals) {
      if (v.kind === 'captured') {
        const src = sourceIds.get(v.ref);
        if (!src) error(s.id, `captured visual "${v.ref}" is not a source id`, 'a captured visual must point at a source in video.sources');
        else if (!CAPTURED_SOURCE_KINDS.has(src.kind)) error(s.id, `captured visual "${v.ref}" points at a ${src.kind} source`, 'captured means a real capture: screenshot, recording, site-image, logo or footage');
      }
      if (v.kind === 'illustration') {
        if (!v.exists || v.exists.length === 0) {
          error(s.id, `illustration "${v.ref}" lists nothing in exists[]`, 'list the claim or source ids proving what it depicts exists');
        } else {
          for (const e of v.exists) {
            if (!refExists(e)) error(s.id, `illustration "${v.ref}" says it exists per "${e}", which is not a claim or source id`, 'cite an id from video.claims or video.sources');
          }
        }
      }
      if (v.focal && v.kind === 'captured' && !sourceIds.has(v.ref)) {
        error(s.id, `focal visual "${v.ref}" has no source`, 'point the focal visual at a source');
      }
    }
    if (s.numbers.length && s.visuals.length && s.visuals.every((v) => v.kind === 'illustration')) {
      error(s.id, 'shows a number on an illustration-only scene', 'an illustration never carries a number (D-49): add a captured or rebuilt visual, or move the number');
    }
    if (s.focal?.ref && !sourceIds.has(s.focal.ref)) {
      error(s.id, `focal.ref "${s.focal.ref}" is not a source id`, 'point focal at a source in video.sources');
    }

    // carry
    if (!last && !s.carry) {
      error(s.id, `no ${plain('carry')} into the next scene`, 'say which element continues and what it does (carry.element, carry.action)');
    }
    if (last && s.carry) {
      warn(s.id, `the last scene has a ${plain('carry')}`, 'nothing follows the last scene; remove it unless the video loops');
    }

    // voice
    if (video.narration === 'music-only' && s.voice.trim()) {
      error(s.id, 'has a voice line but the video is music-only', 'clear voice, or set video.narration to voice or hybrid');
    }
    if (s.voice.trim() && s.copy.headline.trim() && s.voice.trim().toLowerCase() === s.copy.headline.trim().toLowerCase()) {
      error(s.id, 'the voice line echoes the headline', 'narration never repeats the words on screen; say the next thing');
    }
  });

  // ---- frozen after built --------------------------------------------------
  if (opts.previous) {
    const prevById = new Map(opts.previous.scenes.map((s) => [s.id, s]));
    for (const s of scenes) {
      const before = prevById.get(s.id);
      if (!before || !BUILT_OR_LATER.has(before.status)) continue;
      const changed = Object.keys({ ...before, ...s }).filter((k) => !MUTABLE_AFTER_BUILT.has(k) && JSON.stringify(before[k]) !== JSON.stringify(s[k]));
      if (changed.length) {
        error(s.id, `was already ${before.status} and changed ${changed.join(', ')}`, 'after a scene is built only measured, review and status may change; set status to fix and rebuild if the scene itself must change');
      }
    }
    for (const before of opts.previous.scenes) {
      if (BUILT_OR_LATER.has(before.status) && !sceneIds.has(before.id)) {
        error(before.id, `was ${before.status} and has been removed`, 'a built scene is removed on the review page with a fix verdict, not deleted from the plan');
      }
    }
  }

  return problems;
}

function fmt(n) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? r.toFixed(1) : String(r);
}

function findHex(scene) {
  const hits = [];
  const re = /#[0-9a-fA-F]{3,8}\b/g;
  const texts = [scene.layout, ...scene.content, scene.copy.headline, scene.copy.sub ?? '', scene.copy.accent ?? '', scene.camera, ...Object.values(scene.font), ...scene.motion.map((m) => m.what)];
  for (const t of texts) for (const m of String(t).matchAll(re)) hits.push(m[0]);
  return hits;
}

/**
 * Validate a plan object end to end: schema first, then rules.
 * @param {unknown} input
 * @param {{ catalogue?: ReturnType<typeof loadCatalogue>, previous?: unknown }} [opts]
 * @returns {{ ok: boolean, plan: import('./schema.mjs').Plan | null, problems: Problem[] }}
 */
export function validatePlan(input, opts = {}) {
  // Intake stage: only the brief exists. Check the video block, note what is still Unsure, and stop there.
  if (input && typeof input === 'object' && !input.direction && (!input.scenes || input.scenes.length === 0)) {
    const r = VideoSchema.safeParse(input.video);
    if (!r.success) {
      return { ok: false, plan: null, problems: r.error.issues.map((i) => ({ level: 'error', scene: 'video', what: `video.${i.path.join('.')}: ${i.message}`, fix: 'fix the field so it matches the schema (see README.md)' })) };
    }
    const unsure = Object.entries(r.data).filter(([, v]) => v === null).map(([k]) => k);
    const problems = unsure.map((k) => ({ level: 'warning', scene: 'video', what: `"${k.replace(/_/g, ' ')}" was left Unsure at intake`, fix: 'the direction step proposes it; confirm it on the direction page' }));
    problems.push({ level: 'warning', scene: 'plan', what: 'stage: intake only; no direction or scenes yet', fix: 'run the direction step next' });
    return { ok: true, plan: null, problems };
  }
  const parsed = parsePlan(input);
  if (!parsed.ok) {
    return {
      ok: false,
      plan: null,
      problems: parsed.issues.map((i) => ({ level: 'error', scene: sceneFromPath(i.path, input), what: `${i.path}: ${i.message}`, fix: 'fix the field so it matches the schema (see README.md)' })),
    };
  }
  let previous = null;
  if (opts.previous) {
    const p = parsePlan(opts.previous);
    if (p.ok) previous = p.plan;
  }
  const problems = checkRules(parsed.plan, { catalogue: opts.catalogue, previous });
  return { ok: !problems.some((p) => p.level === 'error'), plan: parsed.plan, problems };
}

function sceneFromPath(p, input) {
  const m = /^scenes\.(\d+)/.exec(p);
  if (!m) return p.split('.')[0] || 'plan';
  const s = input?.scenes?.[Number(m[1])];
  return s?.id ?? `scenes[${m[1]}]`;
}

/** One line per problem, plain words. */
export function formatReport(problems) {
  if (!problems.length) return 'ok: no problems';
  return problems.map((p) => `${p.level === 'error' ? 'FAIL' : 'note'}  ${p.scene}: ${p.what}. Fix: ${p.fix}`).join('\n');
}

// ---- CLI -----------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const againstIdx = args.indexOf('--against');
  const against = againstIdx >= 0 ? args[againstIdx + 1] : null;
  const asJson = args.includes('--json');
  if (!file) {
    console.error('usage: node plan/validate.mjs <plan.json> [--against <previous-plan.json>] [--json]');
    process.exit(2);
  }
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  const previous = against ? JSON.parse(fs.readFileSync(against, 'utf8')) : undefined;
  const result = validatePlan(input, { previous });
  if (asJson) console.log(JSON.stringify({ ok: result.ok, problems: result.problems }, null, 2));
  else {
    console.log(formatReport(result.problems));
    const errors = result.problems.filter((p) => p.level === 'error').length;
    const notes = result.problems.length - errors;
    console.log(`${result.ok ? 'PASS' : 'FAIL'}: ${errors} problem${errors === 1 ? '' : 's'}, ${notes} note${notes === 1 ? '' : 's'}${result.plan ? `, ${result.plan.scenes.length} scenes, ${result.plan.video.length_s} s` : ''}`);
  }
  process.exit(result.ok ? 0 : 1);
}
