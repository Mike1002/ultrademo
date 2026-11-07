// learnings.mjs — what a finished video teaches the next one for the same brand. At approval the review server proposes
// what the plan already says (the cast, the logo motion, the voice, the facts with their sources); Claude adds review
// lessons from the comments (review/lessons.json). The user keeps the ones they want on the Delivery card or in the
// dashboard; kept learnings live with the brand (brands/<slug>/learnings.json), each with its source, and can be
// switched off, edited or removed. The direction step reads the ones that are on.
import fs from 'node:fs';
import path from 'node:path';
import { BRANDS_DIR, findBrandFor, brandFromVideo, saveBrandProfile, readBrandProfile } from './brands.mjs';

export const KINDS = ['Cast', 'Logo motion', 'Voice', 'Spoken name', 'Review lesson', 'Effect', 'Exact wording', 'Facts', 'Other'];
const MAX_TEXT = 400;
const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
const kindOf = (k) => (KINDS.includes(k) ? k : 'Other');
const newId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const LOGO_MOTION_NAMES = { 'fade-rise': 'Fade and rise', 'scale-pop': 'Scale pop', 'mark-then-name': 'Mark, then name', 'wipe-bar': 'Wipe in', 'flash-reveal': 'Flash, then logo', glint: 'Glint', none: 'None' };

/** The video's name as the dashboard lists it: the title from the brief, else the video type. */
export function videoTitle(video = {}) {
  const it = video.intake || {};
  if (it.title) return it.title;
  const t = it.video_type || video.template || 'video';
  return `${t.charAt(0).toUpperCase()}${t.slice(1).replace(/-/g, ' ')} video`;
}

const proposalsFile = (projectDir) => path.join(projectDir, 'review', 'learnings.json');
const lessonsFile = (projectDir) => path.join(projectDir, 'review', 'lessons.json');

/** What the plan itself says is worth keeping (no model): cast, logo motion, voice, facts. */
export function planLearnings(plan = {}, { voiceName = (id) => id } = {}) {
  const d = plan.direction || {}, v = plan.video || {};
  const out = [];
  if (Array.isArray(d.cast) && d.cast.length) out.push({ kind: 'Cast', text: d.cast.map((c) => `${c.name}: ${c.role}`).join(' · ') });
  if (d.logo_motion) out.push({ kind: 'Logo motion', text: LOGO_MOTION_NAMES[d.logo_motion] || d.logo_motion, value: d.logo_motion });
  if (v.intake?.voice?.id && v.narration !== 'music-only') out.push({ kind: 'Voice', text: voiceName(v.intake.voice.id) || v.intake.voice.id });
  const facts = (v.claims || []).filter((c) => c.text && c.tier !== 'needs-confirmation');
  if (facts.length) out.push({ kind: 'Facts', text: `${facts.length} fact${facts.length === 1 ? '' : 's'} with their sources, for the brand card`, facts: facts.map((c) => ({ text: c.text, cite: c.cite || '' })) });
  return out;
}

/** Write the proposals at approval (deterministic items); Claude's lessons join them when review/lessons.json appears. */
export function proposeLearnings(projectDir, { voiceName, now = new Date() } = {}) {
  const plan = readJson(path.join(projectDir, 'plan.json'), {});
  const items = planLearnings(plan, { voiceName }).map((x) => ({ id: newId(), ...x }));
  const rec = { from: `${videoTitle(plan.video)} · approved ${now.toISOString().slice(0, 10)}`, project: path.basename(projectDir), title: videoTitle(plan.video), at: now.toISOString(), status: 'open', items };
  writeJson(proposalsFile(projectDir), rec);
  return readProposals(projectDir);
}

/** The open proposals with Claude's lessons merged in (review/lessons.json: [{kind, text}], written after approval). */
export function readProposals(projectDir) {
  const rec = readJson(proposalsFile(projectDir));
  if (!rec) return null;
  const lessons = readJson(lessonsFile(projectDir), []);
  const have = new Set(rec.items.map((i) => i.text));
  const extra = (Array.isArray(lessons) ? lessons : []).slice(0, 8).map((l, i) => ({ id: `lesson-${i}`, kind: kindOf(l.kind || 'Review lesson'), text: clean(l.text), lesson: true })).filter((l) => l.text && !have.has(l.text));
  return { ...rec, items: [...rec.items, ...extra], lessons_pending: !fs.existsSync(lessonsFile(projectDir)) };
}

const learningsFile = (slug, dir) => path.join(dir, slug, 'learnings.json');
export function listLearnings(slug, dir = BRANDS_DIR) {
  return readJson(learningsFile(slug, dir), { items: [] }).items || [];
}
function writeLearnings(slug, items, dir) { writeJson(learningsFile(slug, dir), { items }); }

/** Keep the ticked proposals (with the user's edits) for the project's brand, saving the brand first if it is new.
 * picks: [{id, text, keep}]. Logo motion and facts also update the brand card. */
export function keepLearnings(projectDir, picks = [], { dir = BRANDS_DIR, now = new Date() } = {}) {
  const prop = readProposals(projectDir);
  if (!prop) throw new Error('nothing proposed for this video yet');
  const plan = readJson(path.join(projectDir, 'plan.json'), {});
  let brand = findBrandFor(plan.video || {}, dir);
  if (!brand) brand = saveBrandProfile(brandFromVideo(plan.video || {}), { projectDir, dir, now, from: path.basename(projectDir) });
  const byId = new Map(picks.map((p) => [String(p.id), p]));
  const kept = [];
  let profile = readBrandProfile(brand.slug, dir);
  for (const item of prop.items) {
    const p = byId.get(item.id);
    if (!p || !p.keep) continue;
    const text = clean(p.text ?? item.text) || item.text;
    if (item.kind === 'Logo motion' && item.value) profile = { ...profile, logo_motion: item.value };
    if (item.kind === 'Facts') { profile = { ...profile, facts: item.facts || [] }; continue; }
    kept.push({ id: newId(), kind: item.kind, text, from: `${prop.title} · ${now.toISOString().slice(0, 10)}`, project: prop.project, on: true, at: now.toISOString() });
  }
  // saving again for the same video (Edit on the Delivery card) replaces what it kept before, instead of adding a second copy
  const all = listLearnings(brand.slug, dir).filter((l) => l.project !== prop.project);
  // a kind that holds one value (cast, logo motion, voice) replaces the older one instead of piling up
  const single = new Set(['Cast', 'Logo motion', 'Voice']);
  const merged = [...all.filter((l) => !(single.has(l.kind) && kept.some((k) => k.kind === l.kind))), ...kept];
  writeLearnings(brand.slug, merged, dir);
  if (profile) saveBrandProfile(profile, { dir, now });
  writeJson(proposalsFile(projectDir), { ...readJson(proposalsFile(projectDir)), status: 'kept', kept_at: now.toISOString(), kept: kept.length });
  return { brand: brand.name, slug: brand.slug, kept: kept.length };
}

/** Change one kept learning: { on, text } — or remove it. */
export function updateLearning(slug, id, change = {}, dir = BRANDS_DIR) {
  const items = listLearnings(slug, dir);
  const i = items.findIndex((l) => l.id === id);
  if (i < 0) return null;
  if (change.remove) { items.splice(i, 1); writeLearnings(slug, items, dir); return { removed: true }; }
  if (typeof change.on === 'boolean') items[i].on = change.on;
  if (typeof change.text === 'string' && clean(change.text)) items[i].text = clean(change.text);
  writeLearnings(slug, items, dir);
  return items[i];
}
export function addLearning(slug, { kind, text }, dir = BRANDS_DIR, now = new Date()) {
  if (!readBrandProfile(slug, dir) || !clean(text)) return null;
  const item = { id: newId(), kind: kindOf(kind), text: clean(text), from: `Added by you · ${now.toISOString().slice(0, 10)}`, on: true, at: now.toISOString() };
  writeLearnings(slug, [...listLearnings(slug, dir), item], dir);
  return item;
}

/** The learnings that are on, for a video's brand, as the direction step reads them. */
export function learningsFor(video = {}, dir = BRANDS_DIR) {
  const b = findBrandFor(video, dir);
  if (!b) return [];
  return listLearnings(b.slug, dir).filter((l) => l.on).map((l) => ({ kind: l.kind, text: l.text, from: l.from }));
}

// CLI: the learnings that are on for a project's brand, for Claude to follow while it builds.
//   node plan/learnings.mjs <project>
import { fileURLToPath } from 'node:url';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node plan/learnings.mjs <project>'); process.exit(2); }
  const plan = readJson(path.join(path.resolve(dir), 'plan.json'), {});
  const list = learningsFor(plan.video || {});
  console.log(list.length ? `Learnings kept for ${plan.video?.product} (follow each unless the brief says otherwise):\n${list.map((l) => `- ${l.kind}: ${l.text} (${l.from})`).join('\n')}` : 'No learnings kept for this brand yet.');
}
