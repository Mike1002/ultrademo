// dashboard/data.mjs — everything the dashboard shows, read from the files the steps write: each project's plan, its
// stage (brief → direction → production → review → delivery), a still, its pages; the saved brands with their kit and
// story; the learnings kept per brand and the ones proposed at approval. Pure reads.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDS_DIR, listBrands, findBrandFor, domainOf } from '../brands.mjs';
import { listLearnings, readProposals, videoTitle } from '../learnings.mjs';
import { pagesOf, pageAlive } from '../pages.mjs';
import { cachedUpdate } from '../updates.mjs';
import { telemetryOn } from '../telemetry.mjs';

export const PROJECTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'projects');
export const STAGES = ['Brief', 'Outline', 'Direction', 'Production', 'Review', 'Delivery'];
const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
const exists = (f) => fs.existsSync(f);
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const TYPE = { launch: 'Launch', explainer: 'Explainer', spotlight: 'Spotlight', ad: 'Ad' };

/** The latest activity on a video: the newest file among the plan, the brief, the direction, the scenes, the stills, the
 * renders, the review and the tasks, in the video and its vertical version (one level deep in each, so it stays quick). */
function lastActivity(dir) {
  let t = 0;
  const look = (d) => { for (const f of ls(d)) { const m = mtime(path.join(d, f)); if (m > t) t = m; } };
  for (const base of [dir, path.join(dir, 'vertical')]) {
    for (const f of ['plan.json', 'brief-saved.json', 'intake.log']) t = Math.max(t, mtime(path.join(base, f)));
    for (const sub of ['direction', 'production/scenes', 'production/look', 'out', 'review', 'tasks']) look(path.join(base, sub));
  }
  return t;
}

// stages as STAGES above: 0 Brief, 1 Outline (D-91), 2 Direction, 3 Production, 4 Review, 5 Delivery
function stageOf(dir, plan) {
  if (readJson(path.join(dir, 'review', 'approved.json'))) return 5;
  if (exists(path.join(dir, 'out', 'video.mp4'))) return 4;
  if (exists(path.join(dir, 'direction', 'confirmed.json')) || plan.direction) return 3;
  // a video from before the outline step (no outline in its brief) goes straight on to the directions
  if (plan.video?.intake?.outline?.status === 'confirmed' || (plan.video && !plan.video.intake?.outline && exists(path.join(dir, 'direction', 'proposals.json')))) return 2;
  if (plan.video) return 1;
  return 0;
}

/** A still for the row: the last scene's last frame, else the stills sheet, else a direction frame. */
function stillOf(dir, plan) {
  const look = path.join(dir, 'production', 'look');
  const scenes = (plan.scenes || []).map((s) => s.id);
  for (const id of scenes.slice().reverse()) {
    const f = ls(look).filter((x) => x.startsWith(`${id}-t`) && x.endsWith('.png')).sort((a, b) => parseFloat(a.slice(id.length + 2)) - parseFloat(b.slice(id.length + 2)));
    if (f.length) return path.join(look, f[Math.max(0, f.length - 2)]);
  }
  if (exists(path.join(dir, 'out', 'joins.jpg'))) return path.join(dir, 'out', 'joins.jpg');
  for (const L of ['A', 'B', 'C']) { const f = ls(path.join(dir, 'direction', 'frames', L)).find((x) => /\.(png|jpg)$/.test(x)); if (f) return path.join(dir, 'direction', 'frames', L, f); }
  return null;
}

function noteOf(dir, plan, stage) {
  if (stage === 5) { const a = readJson(path.join(dir, 'review', 'approved.json'), {}); return { text: `Approved ${String(a.at || '').slice(0, 10)} · ${a.final_vertical ? 'landscape and vertical files ready' : 'final file ready'}`, final: a.final ? path.join(dir, 'out', 'final', a.final) : null, finalVertical: a.final_vertical ? path.join(dir, 'out', 'final', a.final_vertical) : null }; }
  if (stage === 4) {
    const notes = readJson(path.join(dir, 'review', 'comments.json'), {});
    const open = Object.values(notes || {}).flatMap((r) => r?.comments || []).filter((c) => c.status !== 'done').length;
    return { text: open ? `${open} comment${open === 1 ? '' : 's'} open` : 'Ready to review' };
  }
  if (stage === 3) {
    const n = (plan.scenes || []).length, built = (plan.scenes || []).filter((s) => exists(path.join(dir, 'production', 'scenes', `${s.id}.html`))).length;
    return { text: n ? `Building: ${built} of ${n} scenes written` : 'Production starting' };
  }
  if (stage === 2) {
    const p = readJson(path.join(dir, 'direction', 'proposals.json'));
    const n = (p?.directions || []).length;
    return { text: n ? `Pick a direction: ${n} waiting` : 'Claude is writing the directions' };
  }
  if (stage === 1) {
    const o = plan.video?.intake?.outline;
    if (!o) return { text: 'Claude is writing the outline' };
    const changes = (o.moments || []).filter((m) => m.data_change).length;
    return { text: `Check the outline: ${(o.moments || []).length} moments${changes ? `, ${changes} that change data` : ''}` };
  }
  return { text: 'Brief not saved yet' };
}

export function collectDashboard({ projectsDir = PROJECTS_DIR, brandsDir = BRANDS_DIR } = {}) {
  const brands = listBrands(brandsDir);
  const videos = [];
  for (const name of ls(projectsDir)) {
    const dir = path.join(projectsDir, name);
    // _removed holds the videos taken off the dashboard (moved, never deleted)
    if (name.startsWith('.') || name === '_removed' || !fs.statSync(dir).isDirectory()) continue;
    const plan = readJson(path.join(dir, 'plan.json'), {});
    if (!plan.video && !exists(path.join(dir, 'intake.log'))) continue;
    const v = plan.video || {};
    const it = v.intake || {};
    let stage = stageOf(dir, plan);
    let note = noteOf(dir, plan, stage);
    // D-82: a vertical version being made (<project>/vertical/) after the landscape video: production until it is
    // rendered, then review until an approval covers both formats
    const vplan = readJson(path.join(dir, 'vertical', 'plan.json'));
    const approvedBoth = Boolean(readJson(path.join(dir, 'review', 'approved.json'))?.final_vertical);
    if (vplan && !approvedBoth) {
      const n = (vplan.scenes || []).length;
      const written = (vplan.scenes || []).filter((s) => exists(path.join(dir, 'vertical', 'production', 'scenes', `${s.id}.html`))).length;
      if (exists(path.join(dir, 'out', 'video-vertical.mp4'))) { stage = 4; note = { ...note, text: 'Vertical version ready to review beside the landscape one' }; }
      else { stage = 3; note = { ...note, text: written ? `Building the vertical version: ${written} of ${n} scenes written` : 'Setting up the vertical version' }; }
    }
    const brand = v.url || v.product ? findBrandFor(v, brandsDir) : null;
    const pages = pagesOf(dir);
    const live = Object.fromEntries(Object.entries(pages).filter(([, p]) => pageAlive(p)).map(([k, p]) => [k, p.url]));
    const length = v.length_s ? `${v.length_s >= 60 ? `${Math.floor(v.length_s / 60)}:${String(Math.round(v.length_s % 60)).padStart(2, '0')}` : `${Math.round(v.length_s)} s`}` : '';
    videos.push({
      project: name, dir, stage, note: note.text, final: note.final || null, finalVertical: note.finalVertical || null,
      // what Watch plays: the final file once approved, else the latest render (and the vertical one beside it)
      watch: note.final || (exists(path.join(dir, 'out', 'video.mp4')) ? path.join(dir, 'out', 'video.mp4') : null),
      cuts: ls(path.join(dir, 'out')).filter((f) => /^cut-\d+\.mp4$/.test(f)).sort().map((f) => path.join(dir, 'out', f)),
      watchVertical: note.finalVertical || (exists(path.join(dir, 'out', 'video-vertical.mp4')) ? path.join(dir, 'out', 'video-vertical.mp4') : null),
      brand: brand?.name || v.product || 'New video', brandSlug: brand?.slug || null,
      title: plan.video ? videoTitle(v) : 'New video',
      type: [TYPE[it.video_type] || (v.template ? v.template.replace(/-/g, ' ') : ''), it.scope === 'feature' ? `one feature${it.feature ? `: ${it.feature}` : ''}` : (it.video_type ? 'whole product' : ''), length].filter(Boolean).join(' · '),
      still: stillOf(dir, plan), live,
      updated: lastActivity(dir),
      proposals: readProposals(dir),
    });
  }
  videos.sort((a, b) => b.updated - a.updated);
  const brandOut = brands.map((b) => {
    const mine = videos.filter((v) => v.brandSlug === b.slug);
    const kept = listLearnings(b.slug, brandsDir);
    const proposed = mine.filter((v) => v.proposals && v.proposals.status === 'open').map((v) => ({ project: v.project, ...v.proposals }));
    return { ...b, logoFile: b.logo ? path.join(brandsDir, b.slug, b.logo) : null, videos: mine.length, learnings: kept, proposed };
  });
  return { videos, brands: brandOut, at: new Date().toISOString(), domainOf, update: cachedUpdate(), telemetry: telemetryOn() };
}
