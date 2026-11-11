// checks.mjs — the checks on the renders, written in plain words per scene.
//
// Pixel measures reuse scaffold/scripts/lib/frames.mjs (decode at 15 fps,
// 240×135 grey; meanAbsDiff, changedFraction, contentFraction and its
// thresholds). Motion per second is the mean grey change between consecutive samples
// (one-shot 2.70, team 3.42), still time is the share of one-second windows
// where nothing visibly happened (one-shot 0%, beat kit 9%), longest still is
// the longest run of samples with no change at all. DOM probes open each
// scene's frame in a headless browser, seek its timeline to the event times
// and read what is visible: the copy, every text box against the canvas, the
// carried element, and every number on screen against the plan.

import { canvasOf } from './canvas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodeFrames, meanAbsDiff, changedFraction, contentFraction, STILL_CHANGE, MOVING_TOL, FRAME0_MIN_CONTENT, HEADLINE_CHARS_PER_LINE, HEADLINE_MAX_LINES } from '../../scripts/lib/frames.mjs';
import { countWords } from '../schema.mjs';
import { BAND_NAMES, TUTORIAL_PACE, motionLevel } from '../direction/schema.mjs';
import { ROOT } from './craft.mjs';
import { CAPTION_CHOICES } from '../captions/styles.mjs';
import { probeVideo, probePage, eventTimes } from './render.mjs';
import { measureLoudness, MIX_TARGET_LUFS, TRUE_PEAK_DBTP } from './audio.mjs';
import { sceneComposition, transitionCollisions, pixelComposition } from './composition.mjs';
import { clipPlan } from './assemble.mjs';

export const STILL_SAMPLE_TOL = 0.05; // mean grey change between consecutive samples (1/15 s) below which nothing moved
export const DEAD_HOLD_S = 1.0;       // a still stretch this long is a dead hold: the scene goes to fix
const BANDS = path.join(ROOT, 'research/reference-videos/tools/bands-by-template.json');

const r2 = (n) => Math.round(n * 100) / 100;
const paletteValue = (e) => (typeof e === 'string' ? e : e.value);

/** The targets a video is checked against: D-43 for Launch, the direction's pace band otherwise, the measured band for words per second. */
export function targetsFor(plan) {
  const launch = plan.video.template === 'launch';
  const band = (() => { try { return JSON.parse(fs.readFileSync(BANDS, 'utf8')).by_template?.[BAND_NAMES[plan.video.template]] || null; } catch { return null; } })();
  const pb = plan.direction.pace_band;
  // D-88/D-90: a tutorial step holds long enough to follow; how long follows the motion level between scenes
  const tut = plan.video.template === 'tutorial' ? TUTORIAL_PACE[motionLevel(plan.video)] : null;
  return {
    template: plan.video.template,
    band_n: band?.n ?? 0,
    still_time_max: launch ? 0 : Math.min(1, (pb.still_time_max ?? 3) / 100),
    longest_still_s_max: launch ? 0.5 : tut ? tut.longest_still_s_max : 1.0,
    motion_per_s_min: launch ? 2.5 : pb.motion_per_s_min,
    words_per_second_max: band?.metrics?.words_per_second_on_screen?.high ?? 2.4,
    shots_per_min: pb.shots_per_min,
    lufs: MIX_TARGET_LUFS, lufs_tolerance: 1.5, true_peak_max: TRUE_PEAK_DBTP + 0.3,
    source: launch ? 'D-43 (still time 0%, motion per second at least 2.5, longest still under 0.5 s)' : 'the direction pace band',
  };
}

/** Motion statistics of a rendered file (or a window of it). */
export function motionStats(file) {
  const fr = decodeFrames(file);
  if (fr.n < 2) return { samples: fr.n, motion_per_s: 0, still_time: 1, longest_still_s: fr.secs, frame0_content: 0, end_motion: 0, dead_windows: 1 };
  let sum = 0, run = 0, longest = 0;
  for (let i = 0; i + 1 < fr.n; i++) {
    const d = meanAbsDiff(fr.at(i), fr.at(i + 1));
    sum += d;
    if (d < STILL_SAMPLE_TOL) { run++; longest = Math.max(longest, run); } else run = 0;
  }
  let dead = 0, windows = 0;
  for (let i = 0; i + fr.fps < fr.n; i++) { windows++; if (changedFraction(fr.at(i), fr.at(i + fr.fps)) < STILL_CHANGE) dead++; }
  const endMotion = fr.n >= 3 ? meanAbsDiff(fr.at(fr.n - 3), fr.at(fr.n - 2)) : 0;
  return {
    samples: fr.n, seconds: r2(fr.secs),
    motion_per_s: r2(sum / (fr.n - 1)),
    still_time: windows ? r2(dead / windows) : 0,
    longest_still_s: r2(longest / fr.fps),
    frame0_content: r2(contentFraction(fr.at(0))),
    end_motion: r2(endMotion),
  };
}

/** Share of pixels near a hex colour in one frame of a video (320×180, rgb). */
export function colourShare(file, t, hex) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=320:180,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const buf = r.stdout;
  if (!buf || buf.length < 3) return 0;
  const m = String(hex).replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const [cr, cg, cb] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  let hit = 0;
  for (let i = 0; i + 2 < buf.length; i += 3) {
    if (Math.abs(buf[i] - cr) + Math.abs(buf[i + 1] - cg) + Math.abs(buf[i + 2] - cb) < 72) hit++;
  }
  return hit / (buf.length / 3);
}

const normWord = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
const wordsOf = (s) => String(s || '').split(/\s+/).map(normWord).filter(Boolean);
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'its', 'it', 'this', 'that', 'in', 'on', 'to']);

/** Numeric tokens in a text: "12,480", "60%", "3", "$4M". */
export function numberTokens(text) {
  // a number stands on its own: not inside a word, a slug or a URL ("9f2k", "v2", "orbit.app/join/9f2k" carry none)
  return [...String(text).matchAll(/(?<![\p{L}\p{N}/._-])(?:[$€£]\s?)?\d[\d,.]*\s?(?:%|[kKmM]\b|x\b|\+)?(?![\p{L}\p{N}/_-])/gu)].map((m) => m[0].replace(/\s+/g, '').replace(/[.,]$/, '')).filter((t) => /\d/.test(t));
}
const numKey = (t) => String(t).replace(/[,\s$€£]/g, '').toLowerCase();

// ---------------------------------------------------------------------------
// DOM probes
// ---------------------------------------------------------------------------

const PROBE_SCRIPT = `() => {
  const W = window.innerWidth, H = window.innerHeight;
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const txt = n.textContent.replace(/\\s+/g, ' ').trim();
    if (!txt) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,template,svg')) continue;
    let op = 1, ok = true, e = el, clip = null;
    while (e && e !== document.body) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') { ok = false; break; }
      op *= parseFloat(cs.opacity || '1');
      if (!clip && (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || (cs.clipPath && cs.clipPath !== 'none'))) clip = e.getBoundingClientRect();
      e = e.parentElement;
    }
    if (!ok || op < 0.4) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (clip) {
      const ix = Math.max(0, Math.min(r.right, clip.right) - Math.max(r.left, clip.left));
      const iy = Math.max(0, Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top));
      if (ix * iy < 0.6 * r.width * r.height) continue;
    }
    const cs = getComputedStyle(el);
    const inside = r.left >= -2 && r.top >= -2 && r.right <= W + 2 && r.bottom <= H + 2;
    out.push({ text: txt, inside, product: Boolean(el.closest('[data-product]')), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], size: Math.round(parseFloat(cs.fontSize)) });
  }
  return out;
}`;

/**
 * Probe every scene's frame: visible text at the event times. Returns
 * { [sceneId]: { ok, error?, times: [{ t, items }] } }.
 */
export async function probeScenes({ plan, projectDir, log = () => {} }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const out = {};
  try {
    const cv = canvasOf(plan);
    const page = await browser.newPage({ viewport: { width: cv.W, height: cv.H } });
    page.on('pageerror', () => {});
    for (const s of plan.scenes) {
      const file = path.join(projectDir, 'compositions', 'frames', `${s.id}.html`);
      if (!fs.existsSync(file)) { out[s.id] = { ok: false, error: 'no frame file', times: [] }; continue; }
      const probe = probePage(projectDir, s);
      const rec = { ok: true, times: [] };
      try {
        await page.goto('file://' + probe, { waitUntil: 'load' });
        await page.waitForFunction((id) => Boolean(window.__timelines && window.__timelines[id]), s.id, { polling: 50, timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        const times = new Set([0.03, ...eventTimes(s, plan.video.fps).slice(1, -1), ...s.reads.map((r) => Math.max(0.03, Math.min(s.duration_s - 0.03, r.to_s - 0.1))), Math.max(0.03, s.duration_s - 0.05), ...(s === plan.scenes[0] && plan.direction?.thumbnail?.intro ? [Math.min(s.duration_s - 0.03, INTRO_S + 0.4)] : [])]);
        for (const t of [...times].sort((a, b) => a - b)) {
          await page.evaluate(([id, tt]) => { const tl = window.__timelines[id]; tl.pause(); tl.seek(tt, false); if (tl.render) tl.render(tt, false, false); }, [s.id, t]);
          await page.waitForTimeout(30);
          const items = await page.evaluate(`(${PROBE_SCRIPT})()`);
          rec.times.push({ t: r2(t), items });
        }
        // D-88: a tutorial step's clicks, each measured at its own moment
        if (plan.video.template === 'tutorial' && s.beat === 'step') {
          rec.clicks = [];
          const marks = await page.evaluate(`(${CLICK_TIMES_SCRIPT})()`);
          for (const mk of marks) {
            const at = Number.isFinite(mk.at) ? Math.max(0, Math.min(s.duration_s - 0.03, mk.at)) : null;
            if (at === null) { rec.clicks.push({ label: mk.label, at: '?', missing: 'it has no data-click-at time' }); continue; }
            await page.evaluate(([id, tt]) => { const tl = window.__timelines[id]; tl.pause(); tl.seek(tt, false); if (tl.render) tl.render(tt, false, false); }, [s.id, at]);
            await page.waitForTimeout(30);
            rec.clicks.push({ label: mk.label, at: r2(at), ...(await page.evaluate(`(${CLICK_MEASURE_SCRIPT})(${JSON.stringify(mk.label)})`)) });
          }
        }
      } catch (err) {
        rec.ok = false;
        rec.error = `the frame could not be probed: ${String(err.message).split('\n')[0]}`;
      }
      out[s.id] = rec;
      log(`probe ${s.id}: ${rec.ok ? `${rec.times.length} time(s)` : rec.error}`);
    }
  } finally { await browser.close(); }
  return out;
}

/** How far the cursor's tip may sit outside its target at the moment of a click, in px. */
export const CLICK_TOLERANCE_PX = 6;

/**
 * D-88: the tutorial checks for one scene. A step scene's caption starts with its number ("Step 2 · Click Invite"),
 * every click is marked on its target (data-click, with data-click-at in seconds) and the cursor (data-cursor) sits on
 * the target at that moment; the number of steps matches the confirmed outline. Pure: `probe.clicks` comes from probeScenes.
 * @returns {{ findings: {check: string, level: string, text: string}[], hard: string[] }}
 */
export function tutorialFindings(plan, s, probe) {
  const out = { findings: [], hard: [] };
  if (plan.video.template !== 'tutorial' || s.beat !== 'step') return out;
  const steps = plan.scenes.filter((x) => x.beat === 'step');
  const n = steps.indexOf(s) + 1;
  const m = String(s.copy.headline || '').match(/^\s*Step\s+(\d+)\b/i);
  if (!m) { out.findings.push({ check: 'tutorial', level: 'fail', text: `the caption should start with "Step ${n}" (e.g. "Step ${n} · Click Invite")` }); out.hard.push('caption without its step number'); }
  else if (Number(m[1]) !== n) { out.findings.push({ check: 'tutorial', level: 'fail', text: `the caption says step ${m[1]} but this is step ${n}` }); out.hard.push('step number out of order'); }
  else out.findings.push({ check: 'tutorial', level: 'pass', text: `caption numbered: step ${n}` });
  if (probe && probe.ok) {
    const clicks = probe.clicks || [];
    if (!clicks.length) { out.findings.push({ check: 'click', level: 'fail', text: 'no click marked: put data-click="<what>" and data-click-at="<seconds>" on the element the cursor clicks, and data-cursor="1" on the cursor' }); out.hard.push('no click marked'); }
    for (const c of clicks) {
      if (c.missing) { out.findings.push({ check: 'click', level: 'fail', text: `at ${c.at} s, ${c.missing}` }); out.hard.push(`click "${c.label}": ${c.missing}`); }
      else if (c.off > CLICK_TOLERANCE_PX) { out.findings.push({ check: 'click', level: 'fail', text: `at ${c.at} s the cursor is ${Math.round(c.off)} px off "${c.label}"` }); out.hard.push(`cursor off "${c.label}"`); }
      else out.findings.push({ check: 'click', level: 'pass', text: `at ${c.at} s the cursor is on "${c.label}"` });
    }
  }
  const o = plan.video.intake?.outline;
  const outlineSteps = o?.status === 'confirmed' ? o.moments.filter((x) => x.beat === 'step').length : 0;
  if (n === 1 && outlineSteps && outlineSteps !== steps.length) out.findings.push({ check: 'tutorial', level: 'warn', text: `the video has ${steps.length} step(s), the confirmed outline ${outlineSteps}` });
  return out;
}

/** The click probe for a step scene (run inside the page): each [data-click] at its data-click-at time, the cursor's tip
 * (its box's top-left, where an arrow points) against the target's box. */
export const CLICK_TIMES_SCRIPT = `() => [...document.querySelectorAll('[data-click]')].map((el) => ({ label: el.getAttribute('data-click') || 'target', at: Number(el.getAttribute('data-click-at')) }))`;
export const CLICK_MEASURE_SCRIPT = `(label) => {
  const el = [...document.querySelectorAll('[data-click]')].find((x) => (x.getAttribute('data-click') || 'target') === label);
  const cur = document.querySelector('[data-cursor]');
  if (!el) return { missing: 'the target is gone' };
  if (!cur) return { missing: 'no cursor (data-cursor) on screen' };
  const a = el.getBoundingClientRect(), c = cur.getBoundingClientRect();
  const vis = (n) => { const st = getComputedStyle(n); return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05; };
  if (!vis(el) || a.width < 2 || a.height < 2) return { missing: 'the target is not visible at the click' };
  if (!vis(cur)) return { missing: 'the cursor is not visible at the click' };
  const x = c.left, y = c.top;
  const dx = x < a.left ? a.left - x : x > a.right ? x - a.right : 0;
  const dy = y < a.top ? a.top - y : y > a.bottom ? y - a.bottom : 0;
  return { off: Math.hypot(dx, dy) };
}`;

/** The thumbnail intro's length on the first scene (D-82; the brief asks for about 1.5 s). */
export const INTRO_S = 1.5;
const visibleWords = (items) => new Set(items.flatMap((it) => wordsOf(it.text)));
const coverage = (words, visible) => { const w = words.filter((x) => x.length); if (!w.length) return 1; return w.filter((x) => visible.has(x)).length / w.length; };
const at = (rec, t) => { let best = null; for (const x of rec?.times || []) if (!best || Math.abs(x.t - t) < Math.abs(best.t - t)) best = x; return best; };

/**
 * The composition findings per scene (D-67): the scene's own (empty boxes,
 * balance, centring, edges, scale) and the transitions it hands over (a
 * collision is the outgoing scene's to fix, and a note on the incoming one).
 * `composition` is probeComposition's record; only scenes with a record take part.
 * @returns {{ [sceneId]: { findings: object[], measured: object } }}
 */
export function compositionFindings(plan, composition = {}) {
  const live = plan.scenes.filter((s) => composition[s.id]);
  let t = 0;
  const timed = live.map((s) => { const n = { ...s, start_s: t }; t = Math.round((t + s.duration_s) * 1000) / 1000; return n; });
  const out = {};
  for (const s of timed) out[s.id] = sceneComposition(s, composition[s.id], plan);
  if (timed.length > 1) {
    const { boundaries } = clipPlan({ ...plan, scenes: timed });
    for (const b of boundaries) {
      const from = timed.find((x) => x.id === b.from), to = timed.find((x) => x.id === b.to);
      const hits = transitionCollisions({ from, to, kind: b.kind, overlap: b.dur, recFrom: composition[b.from], recTo: composition[b.to], startInVideo: to.start_s });
      for (const h of hits) {
        out[from.id].findings.push({ ...h, text: `${from.id}: ${h.text}` });
        out[to.id].findings.push({ ...h, level: 'warn', text: `${to.id} (incoming): ${h.text}` });
      }
    }
  }
  return out;
}

/**
 * Run every check. Returns the checks record and the per-scene status.
 * @param {object} args { plan, projectDir, outDir, probes, composition (probeComposition's record), buildResults (by id), voices, mix }
 */
export function runChecks({ plan, projectDir, outDir, probes = {}, composition = null, buildResults = {}, voices = [], mix = null }) {
  const targets = targetsFor(plan);
  const comp = composition ? compositionFindings(plan, composition) : {};
  const accent = paletteValue(plan.direction.palette.accent);
  const allowedNumbers = new Map();
  for (const s of plan.scenes) for (const n of s.numbers) { allowedNumbers.set(numKey(n.value), `the plan (${s.id}, cites ${n.cite})`); for (const t of numberTokens(n.value)) allowedNumbers.set(numKey(t), `the plan (${s.id}, cites ${n.cite})`); }
  for (const c of plan.video.claims) for (const t of numberTokens(c.text)) allowedNumbers.set(numKey(t), `claim ${c.id}${c.kind === 'sample' ? ' (sample)' : ''}`);
  const siteNumbers = new Set();
  try {
    const scout = JSON.parse(fs.readFileSync(path.join(projectDir, 'scout', 'report.json'), 'utf8'));
    for (const p of scout.pages || []) for (const sent of [...(p.sentences || []), ...(p.labels || []), ...(p.headings || [])]) for (const t of numberTokens(sent)) siteNumbers.add(numKey(t));
  } catch { /* no scout */ }
  const sceneWords = Object.fromEntries(plan.scenes.map((s) => [s.id, [...wordsOf(s.copy.headline), ...wordsOf(s.copy.sub)]]));

  const scenes = [];
  plan.scenes.forEach((s, i) => {
    const F = [];
    const add = (check, level, text, value) => F.push({ check, level, text, ...(value !== undefined ? { value } : {}) });
    const hard = [];
    const measured = {};
    const build = buildResults[s.id] || null;
    const clip = path.join(outDir, 'scenes', `${s.id}.mp4`);
    const probe = probes[s.id] || null;
    const headline = wordsOf(s.copy.headline);

    // build and lint
    if (!build || !build.ok) {
      const why = build?.problems?.[0]?.split('\n')[0] || 'the frame was not built';
      add('build', 'fail', `the scene was not built: ${why}`);
      hard.push(`not built (${why})`);
    } else {
      add('lint', build.lint.errors ? 'fail' : 'pass', `lint ${build.lint.errors} error(s), ${build.lint.warnings} warning(s)${build.repaired ? ' after one repair' : ''}`, build.lint.errors);
      if (build.lint.errors) hard.push(`lint reports ${build.lint.errors} error(s)`);
      if (build.check) add('check', build.check.errors ? 'warn' : 'pass', `hyperframes check: ${build.check.errors} error(s), ${build.check.warnings} warning(s)${build.check.text ? ` — ${build.check.text.split('\n')[0]}` : ''}`, build.check.errors);
      measured.lint_errors = build.lint.errors;
      measured.check_errors = build.check?.errors ?? -1;
    }

    // the render of this scene alone
    const pv = probeVideo(clip);
    if (!pv) {
      add('render', 'fail', 'the scene clip was not rendered');
      hard.push('no render');
    } else {
      const expect = Math.round(s.duration_s * plan.video.fps);
      add('render', Math.abs(pv.frames - expect) <= 1 ? 'pass' : 'warn', `rendered ${pv.frames} frames at ${pv.fps} fps (${s.duration_s} s expects ${expect})`, pv.frames);
      const m = motionStats(clip);
      Object.assign(measured, { motion_per_s: m.motion_per_s, still_time: m.still_time, longest_still_s: m.longest_still_s });
      add('motion', m.motion_per_s >= targets.motion_per_s_min ? 'pass' : 'warn', `motion per second ${m.motion_per_s} (target at least ${targets.motion_per_s_min})`, m.motion_per_s);
      if (m.motion_per_s === 0) { add('motion', 'fail', 'the clip is static: nothing moves'); hard.push('static clip'); }
      add('stillTime', m.still_time <= targets.still_time_max ? 'pass' : 'warn', `still time ${Math.round(m.still_time * 100)}% of one-second windows (target ${Math.round(targets.still_time_max * 100)}%)`, m.still_time);
      const dead = m.longest_still_s > DEAD_HOLD_S;
      add('longestStill', dead ? 'fail' : m.longest_still_s > targets.longest_still_s_max ? 'warn' : 'pass', `longest still ${m.longest_still_s} s (target under ${targets.longest_still_s_max} s; a dead hold over ${DEAD_HOLD_S} s fails)`, m.longest_still_s);
      if (dead) hard.push(`a dead hold of ${m.longest_still_s} s`);
      add('cutStill', m.end_motion < MOVING_TOL ? 'pass' : 'warn', `motion ${m.end_motion} in the last sample before the cut (still under ${MOVING_TOL}); the next scene's transition overlaps this end`, m.end_motion);
      measured.cut_still = m.end_motion;
      if (i === 0) {
        add('frame0', m.frame0_content >= FRAME0_MIN_CONTENT ? 'pass' : 'fail', `frame 0 content ${(m.frame0_content * 100).toFixed(1)}% of pixels away from the background (minimum ${FRAME0_MIN_CONTENT * 100}%)`, m.frame0_content);
        if (m.frame0_content < FRAME0_MIN_CONTENT) hard.push('frame 0 is empty');
      }
    }

    // copy limits (the plan's cap and the wrap heuristic)
    const used = countWords(s.copy.headline) + countWords(s.copy.sub ?? '');
    add('copyCap', used <= s.copy.words_max ? 'pass' : 'fail', `${used} words on screen against a cap of ${s.copy.words_max}`, used);
    if (used > s.copy.words_max) hard.push('copy over its cap');
    const perLine = HEADLINE_CHARS_PER_LINE.default;
    const lines = Math.ceil(String(s.copy.headline).length / perLine);
    if (lines > HEADLINE_MAX_LINES) add('copy', 'warn', `the headline is long enough to wrap to ${lines} lines at about ${perLine} characters per line: "${s.copy.headline}"`);

    // DOM probes: copy on frame 0, copy through the reading window, overlays inside, numbers, carry
    if (!probe || !probe.ok) {
      add('probe', 'warn', probe?.error || 'the frame could not be probed, so the copy, overlay, number and carry checks did not run');
    } else {
      // with the thumbnail intro on (D-82), the first 1.5 s is the thumbnail picture: the headline is checked just after it
      const intro = i === 0 && Boolean(plan.direction?.thumbnail?.intro);
      const first = at(probe, intro ? Math.min(s.duration_s - 0.03, INTRO_S + 0.4) : 0.03);
      const cov0 = coverage(headline, visibleWords(first.items));
      measured.frame0_copy = cov0 >= 0.5;
      if (i === 0) {
        add('frame0Copy', cov0 >= 0.5 ? 'pass' : 'fail', `${Math.round(cov0 * 100)}% of the headline's words readable on ${intro ? `the first frame after the thumbnail intro (${first.t} s)` : 'frame 0'} ("${s.copy.headline}")`, r2(cov0));
        if (cov0 < 0.5) hard.push('the headline is not on frame 0');
      } else add('frame0Copy', 'info', `${Math.round(cov0 * 100)}% of the headline's words on the scene's first frame`, r2(cov0));
      let readOk = true;
      for (const r of s.reads) {
        const rec = at(probe, Math.max(0.03, Math.min(s.duration_s - 0.03, r.to_s - 0.1)));
        const cov = coverage(headline, visibleWords(rec.items));
        const ok = cov >= (headline.length > 6 ? 0.85 : 0.99);
        if (!ok) readOk = false;
        add('readingTime', ok ? 'pass' : 'fail', `at ${rec.t} s (end of "${r.what}") ${Math.round(cov * 100)}% of the headline's words are readable`, r2(cov));
      }
      measured.copy_through_reads = readOk;
      if (!readOk) hard.push('the copy leaves before its reading window ends');
      const outside = [];
      for (const tm of probe.times) for (const it of tm.items) if (!it.inside) outside.push(`"${it.text.slice(0, 30)}" at ${tm.t} s (${it.rect.join(',')})`);
      measured.overlays_inside = outside.length === 0;
      add('overlays', outside.length ? 'fail' : 'pass', outside.length ? `text outside the canvas: ${outside.slice(0, 3).join('; ')}${outside.length > 3 ? ` and ${outside.length - 3} more` : ''}` : `every text box stays inside ${canvasOf(plan).label} at every event frame`);
      if (outside.length) hard.push('text outside the canvas');
      // D-94: with burned-in captions the scene keeps the caption band free (look.mjs samples it at every build)
      if (CAPTION_CHOICES.includes(plan.video.intake?.caption_style) && plan.video.intake.caption_style !== 'none' && projectDir) {
        let band = null;
        try { band = JSON.parse(fs.readFileSync(path.join(projectDir, 'production', 'look', `${s.id}-boxes.json`), 'utf8')).caption_band ?? null; } catch { /* not built with boxes */ }
        if (band === null) add('captionBand', 'warn', 'the caption band was not measured: build the scene again');
        else {
          add('captionBand', band.length ? 'fail' : 'pass', band.length ? band.slice(0, 3).join('; ') : 'the caption band stays free for the burned-in captions');
          if (band.length) hard.push('content in the caption band');
        }
      }
      // numbers
      const seen = new Map();
      // D-74: numbers inside a product part (data-product) are example data in the product's own UI, free to write; they are
      // noted, never failed. Numbers in headlines, copy and overlays are claims: unsourced ones are flagged for the user.
      const uiSample = new Map();
      for (const tm of probe.times) for (const it of tm.items) for (const tok of numberTokens(it.text)) {
        if (it.product) { if (!uiSample.has(numKey(tok)) && !allowedNumbers.has(numKey(tok))) uiSample.set(numKey(tok), { tok, t: tm.t, text: it.text.slice(0, 40) }); continue; }
        if (!seen.has(numKey(tok))) seen.set(numKey(tok), { tok, t: tm.t, text: it.text.slice(0, 40) });
      }
      const bad = [], sample = [], small = [], counting = [];
      // a counter climbing to a cited number shows the steps on the way: same unit, at or below the scene's own figure
      // (a count lands on "$20,000,000" an instant before its cited "+" appends)
      const counts = /count|climb|tick|tally|roll(s|ing)? up|odometer/i.test([...(s.motion || []).map((m) => m.what), ...(s.content || [])].join(' '));
      const unit = (t) => (/^[$€£]/.test(t) ? t[0] : '') + (/%$/.test(t) ? '%' : '');
      const valueOf = (t) => Number(String(t).replace(/[^\d.]/g, ''));
      const ceilings = s.numbers.flatMap((n) => numberTokens(n.value)).map((t) => ({ u: unit(t), v: valueOf(t) }));
      for (const [k, v] of seen) {
        if (allowedNumbers.has(k)) continue;
        if (counts && ceilings.some((c) => c.u === unit(v.tok) && valueOf(v.tok) <= c.v)) { counting.push(v); continue; }
        const plain = Number(k.replace(/[^\d.]/g, ''));
        if (siteNumbers.has(k)) sample.push(v);
        else if (Number.isFinite(plain) && plain < 10 && !/[%$€£kmx+]/i.test(k)) small.push(v);
        else bad.push(v);
      }
      measured.numbers_ok = bad.length === 0;
      if (bad.length) add('claims', 'warn', `numbers in the copy with no source in the plan (list them for the user): ${bad.map((b) => `"${b.tok}" at ${b.t} s in "${b.text}"`).join('; ')}`);
      else add('claims', 'pass', seen.size ? `every number in the copy is in the plan (${[...seen.values()].map((v) => v.tok).join(', ')})` : 'no numbers in the copy');
      if (uiSample.size) add('claims', 'info', `example data inside the product UI: ${[...uiSample.values()].slice(0, 8).map((b) => `"${b.tok}"`).join(', ')}${uiSample.size > 8 ? ` and ${uiSample.size - 8} more` : ''}`);
      if (sample.length) add('claims', 'warn', `sample values from the site, not claims: ${sample.map((b) => `"${b.tok}"`).join(', ')}`);
      if (counting.length) add('claims', 'info', `counter steps on the way to a cited number: ${counting.slice(0, 4).map((b) => `"${b.tok}"`).join(', ')}${counting.length > 4 ? ` and ${counting.length - 4} more` : ''}`);
      if (small.length) add('claims', 'info', `small counts on screen: ${small.map((b) => `"${b.tok}" in "${b.text}"`).join('; ')}`);
      // words per second on screen (visible text at the last event frame against the duration)
      const last = at(probe, s.duration_s - 0.05);
      const wps = r2(visibleWords(last.items).size / s.duration_s);
      measured.words_per_s = wps;
      add('wordsPerSecond', wps <= targets.words_per_second_max ? 'pass' : 'warn', `${wps} words per second on screen (band high ${targets.words_per_second_max})`, wps);
    }

    // carry into the next scene
    const next = plan.scenes[i + 1];
    if (next && s.carry) {
      const pa = probes[s.id], pb = probes[next.id];
      const want = wordsOf(s.carry.element).filter((w) => !STOP.has(w) && w.length > 2);
      const isHeadline = /headline|copy|line/.test(s.carry.element.toLowerCase());
      const needles = isHeadline ? sceneWords[s.id] : want;
      let verdict = null, how = '';
      if (pa?.ok && pb?.ok && needles.length) {
        const endA = visibleWords(at(pa, s.duration_s - 0.05).items), startB = visibleWords(at(pb, 0.03).items);
        const hitA = needles.some((w) => endA.has(w)), hitB = needles.some((w) => startB.has(w));
        if (hitA && hitB) { verdict = true; how = `"${s.carry.element}" is on the last frame of ${s.id} and the first frame of ${next.id}`; }
        else if (hitA || hitB) { verdict = false; how = `"${s.carry.element}" is ${hitA ? 'on the last frame of this scene but not on the first frame of the next' : 'on the first frame of the next scene but not on the last frame of this one'}`; }
      }
      if (verdict === null) {
        const clipB = path.join(outDir, 'scenes', `${next.id}.mp4`);
        if (fs.existsSync(clip) && fs.existsSync(clipB)) {
          const a = colourShare(clip, Math.max(0, s.duration_s - 0.05), accent), b = colourShare(clipB, 0.02, accent);
          verdict = a >= 0.0015 && b >= 0.0015;
          how = `${verdict ? 'the accent colour is present on both sides of the seam' : `the accent colour is ${a < 0.0015 ? 'missing on the last frame of this scene' : 'missing on the first frame of the next'}`} (${(a * 100).toFixed(2)}% / ${(b * 100).toFixed(2)}% of pixels); "${s.carry.element}" has no words to find, so this is the colour check`;
        }
      }
      measured.carry_present = verdict === null ? 'unchecked' : verdict;
      add('carry', verdict === null ? 'warn' : verdict ? 'pass' : 'warn', verdict === null ? `could not check that "${s.carry.element}" continues; look at the seam stills` : how);
    }

    // narration placement
    const v = voices.find((x) => x.id === s.id);
    if (v) {
      if (!v.path) add('voice', 'fail', `the voice line was not generated: ${(v.flags || []).join('; ')}`);
      else add('voice', v.over ? 'warn' : 'pass', `${v.secs.toFixed(1)} s of voice from ${v.start_s} s${v.over ? `, running ${v.over} s past the scene` : ''}${v.words ? ', word timings aligned' : ', no word timings'}${v.flags?.length ? `; flags: ${v.flags.join('; ')}` : ''}`, v.secs);
      measured.voice_s = v.secs;
    }

    // composition on the rendered frames (D-67)
    const cf = comp[s.id];
    if (cf) {
      const fails = cf.findings.filter((f) => f.level === 'fail');
      for (const f of cf.findings) add(f.check, f.level, f.text);
      if (!cf.findings.length) add('composition', 'pass', 'composition: every box filled, the content balanced and inside the margins, centred where the layout centres it, headline and product at video scale, no collision in the transitions');
      Object.assign(measured, Object.fromEntries(Object.entries(cf.measured).filter(([, v]) => v !== null && v !== undefined)));
      measured.composition_ok = fails.length === 0;
      if (fails.length) hard.push(`composition: ${fails.length} problem(s) on the rendered frames (${[...new Set(fails.map((f) => f.type))].join(', ')})`);
    }

    // D-88: a tutorial step names its number and lands every click on its target
    const tf = tutorialFindings(plan, s, probe);
    for (const f of tf.findings) add(f.check, f.level, f.text);
    hard.push(...tf.hard);

    const status = hard.length ? 'fix' : 'built';
    measured.status_reason = hard.join('; ') || 'all hard checks pass';
    scenes.push({ id: s.id, name: s.name, status, reason: measured.status_reason, measured, checks: F, hard, composition_findings: cf ? cf.findings.map(({ check, level, type, text, start_s, end_s }) => ({ check, level, type, text, ...(start_s !== undefined ? { start_s, end_s } : {}) })) : [] });
  });

  // the whole video
  const videoFile = path.join(outDir, 'video.mp4');
  const pv = probeVideo(videoFile);
  const video = { file: 'out/video.mp4', rendered: Boolean(pv), checks: [] };
  const vadd = (check, level, text, value) => video.checks.push({ check, level, text, ...(value !== undefined ? { value } : {}) });
  if (pv) {
    const expect = Math.round(plan.scenes.reduce((a, s) => a + s.duration_s, 0) * plan.video.fps);
    Object.assign(video, { frames: pv.frames, fps: pv.fps, duration: r2(pv.duration), width: pv.width, height: pv.height, has_audio: pv.hasAudio, expected_frames: expect });
    vadd('frames', Math.abs(pv.frames - expect) <= 2 ? 'pass' : 'warn', `${pv.frames} frames at ${pv.fps} fps (${expect} expected for ${plan.video.length_s} s)`, pv.frames);
    const m = motionStats(videoFile);
    Object.assign(video, { motion_per_s: m.motion_per_s, still_time: m.still_time, longest_still_s: m.longest_still_s, frame0_content: m.frame0_content });
    vadd('motion', m.motion_per_s >= targets.motion_per_s_min ? 'pass' : 'warn', `motion per second ${m.motion_per_s} (target at least ${targets.motion_per_s_min})`, m.motion_per_s);
    vadd('stillTime', m.still_time <= targets.still_time_max ? 'pass' : 'warn', `still time ${Math.round(m.still_time * 100)}% (target ${Math.round(targets.still_time_max * 100)}%)`, m.still_time);
    vadd('longestStill', m.longest_still_s <= targets.longest_still_s_max ? 'pass' : 'warn', `longest still ${m.longest_still_s} s (target under ${targets.longest_still_s_max} s)`, m.longest_still_s);
    vadd('frame0', m.frame0_content >= FRAME0_MIN_CONTENT ? 'pass' : 'fail', `frame 0 content ${(m.frame0_content * 100).toFixed(1)}%`, m.frame0_content);
    const shots = r2(plan.scenes.length / (pv.duration / 60));
    video.shots_per_min = shots;
    vadd('shotsPerMinute', shots >= targets.shots_per_min[0] && shots <= targets.shots_per_min[1] ? 'pass' : 'info', `${shots} shots per minute (band ${targets.shots_per_min[0]}–${targets.shots_per_min[1]})`, shots);
    const loud = pv.hasAudio ? measureLoudness(videoFile) : null;
    video.loudness = loud;
    if (!loud) vadd('loudness', 'warn', 'the video has no audio track');
    else {
      const okI = Math.abs(loud.lufs - targets.lufs) <= targets.lufs_tolerance;
      const okTp = loud.true_peak_dbtp === null || loud.true_peak_dbtp <= targets.true_peak_max;
      vadd('loudness', okI && okTp ? 'pass' : 'warn', `${loud.lufs} LUFS integrated (target ${targets.lufs} ± ${targets.lufs_tolerance}), true peak ${loud.true_peak_dbtp ?? '?'} dBTP (limit ${TRUE_PEAK_DBTP})`, loud.lufs);
    }
    if (mix && mix.ok === false) vadd('mix', 'warn', mix.reason);
    try {
      const pc = pixelComposition(videoFile);
      video.pixel_composition = pc;
      vadd('composition', pc.corner_share > 0.05 || pc.small_share > 0.2 ? 'warn' : 'pass', `pixel composition (edge map, 2 frames per second): content anchored in a corner ${Math.round(pc.corner_share * 100)}% of the time, off the middle third ${Math.round(pc.off_balance_share * 100)}%, crowding an edge ${Math.round(pc.edge_crowded_share * 100)}%, small (under 12% of the frame) ${Math.round(pc.small_share * 100)}%; content box ${Math.round(pc.mean_bbox_share * 100)}% of the frame on average`);
    } catch { /* the decode failed; the motion checks already said so */ }
  } else vadd('render', 'fail', 'out/video.mp4 was not rendered');

  const summary = { built: scenes.filter((s) => s.status === 'built').length, fix: scenes.filter((s) => s.status === 'fix').length, hard_checks: ['build', 'lint', 'render', 'static clip', 'dead hold over 1 s', 'copy cap', 'frame-0 copy (first scene)', 'copy through its reading window', 'text inside the canvas', 'unsourced numbers flagged (D-74, a warning)', 'composition (empty boxes, balance, centring, edges, scale, transition overlap)'] };
  return { generated_at: new Date().toISOString(), targets, video, scenes, summary };
}

/** Write scenes[].measured and status back into the plan (nothing else changes). */
export function applyToPlan(planObj, checks) {
  const byId = new Map(checks.scenes.map((s) => [s.id, s]));
  for (const s of planObj.scenes) {
    const c = byId.get(s.id);
    if (!c) continue;
    s.measured = Object.fromEntries(Object.entries(c.measured).filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v)));
    s.status = c.status;
  }
  return planObj;
}

/** checks.md: plain words per scene (D-55: moment, motion style, what continues, reading time, self QA). */
export function checksMarkdown(checks, plan) {
  const L = [];
  L.push(`# Self QA — ${plan.video.product} ${plan.video.template.replace(/-/g, ' ')} video`);
  L.push('');
  L.push(`Status: measured ${checks.generated_at.slice(0, 16).replace('T', ' ')} on the rendered video. Targets: ${checks.targets.source}; words per second band high ${checks.targets.words_per_second_max}; loudness ${checks.targets.lufs} LUFS.`);
  L.push('');
  L.push('## The whole video');
  L.push('');
  if (checks.video.rendered) L.push(`${checks.video.frames} frames, ${checks.video.duration} s at ${checks.video.fps} fps. Motion per second ${checks.video.motion_per_s}; still time ${Math.round(checks.video.still_time * 100)}%; longest still ${checks.video.longest_still_s} s; ${checks.video.shots_per_min} shots per minute${checks.video.loudness ? `; ${checks.video.loudness.lufs} LUFS, true peak ${checks.video.loudness.true_peak_dbtp} dBTP` : '; no audio'}.`);
  for (const c of checks.video.checks) L.push(`- ${mark(c.level)} ${c.text}`);
  L.push('');
  L.push(`## Scenes: ${checks.summary.built} built, ${checks.summary.fix} to fix`);
  for (const s of checks.scenes) {
    L.push('');
    L.push(`### ${s.id} — ${s.name}: ${s.status === 'built' ? 'built' : `fix (${s.reason})`}`);
    for (const c of s.checks) L.push(`- ${mark(c.level)} ${c.text}`);
  }
  L.push('');
  L.push(`Hard checks (a failure sends the scene to fix): ${checks.summary.hard_checks.join(', ')}. Everything else is a note for the review page.`);
  return L.join('\n') + '\n';
}

const mark = (level) => ({ pass: 'ok', warn: 'note', fail: 'FAIL', info: 'info' }[level] || level);
