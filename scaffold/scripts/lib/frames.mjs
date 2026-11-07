// Rendered-frame checks: measurements on the delivered pixels, not on the
// plan. Shared by stills.mjs (before the paid build) and verify.mjs (on the delivered file).
// Frames are decoded once at a small size in grey; every check is a number against a threshold,
// and the thresholds are named here so a reader can argue with them.
import {spawnSync} from 'node:child_process';
import {isBeat, beatTiming, FPS} from '../../render/timing.mjs';

export const SAMPLE = {fps: 15, w: 240, h: 135};
// Mean absolute grey difference per pixel (0-255) between two frames.
export const STILL_TOL = 0.25; // mean grey change one second apart; used for the overall motion measure
export const STILL_CHANGE = 0.001; // fraction of pixels that changed by more than 10 levels over one second; below it, nothing visibly happened (a moving cursor alone is about 0.1%, typing 1-2%)
export const MOVING_TOL = 0.6; // mean grey change one sample apart (1/15 s): above it something is moving
export const FRAME0_MIN_CONTENT = 0.02; // fraction of pixels away from the background level
export const STILL_RUN_WARN = 1.2, STILL_RUN_FAIL = 2.0; // seconds a product scene may sit still
export const CAPTION_CPS = 17, CAPTION_MIN = 0.7; // characters per second, seconds on screen
export const HEADLINE_MAX_LINES = 2, SUB_MAX_CHARS = 80;
// Characters per headline line by layout at the renderer's sizes (full-bleed 118 px over 1600 px, captioned 56 px, split 84 px over 40%).
export const HEADLINE_CHARS_PER_LINE = {'full-bleed-type': 26, captioned: 48, pair: 48, split: 16, default: 26};
export const ZOOM_CAP = 1.5;

export function decodeFrames(file, {fps, w, h} = SAMPLE) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=${fps},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], {maxBuffer: 1 << 30});
  if (r.status !== 0) throw new Error(`ffmpeg decode failed: ${r.stderr?.toString().slice(0, 300)}`);
  const buf = r.stdout;
  const size = w * h;
  const n = Math.floor(buf.length / size);
  return {fps, w, h, n, at: (i) => buf.subarray(Math.max(0, Math.min(n - 1, i)) * size, (Math.max(0, Math.min(n - 1, i)) + 1) * size), secs: n / fps};
}

export const meanAbsDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
export const changedFraction = (a, b, tol = 10) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > tol) n++; return n / a.length; };
export const contentFraction = (f) => {
  const hist = new Uint32Array(256);
  for (const v of f) hist[v]++;
  let mode = 0;
  for (let i = 1; i < 256; i++) if (hist[i] > hist[mode]) mode = i;
  let far = 0;
  for (let i = 0; i < 256; i++) if (Math.abs(i - mode) > 24) far += hist[i];
  return far / f.length;
};

const isProductScene = (s) => !isBeat(s) ? s.media !== undefined || Boolean(s.screenshot) : ['product-in-frame', 'recording-action', 'split', 'card-fan', 'graphic', 'stat'].includes(s.visual ?? (s.sources?.length ? 'product-in-frame' : 'typographic'));
const wrapLines = (text, perLine) => {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + w).length > perLine) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w;
    }
    if (line) lines.push(line);
  }
  return lines;
};

// items: the timeline() items; frames: decodeFrames(); sb: the storyboard.
// Returns {findings: [{check, level: pass|warn|fail|info, scene, text, value}], measures: {...}, risk: {...}}.
export function runChecks(sb, items, frames) {
  const F = [];
  const add = (check, level, scene, text, value) => F.push({check, level, scene, text, ...(value !== undefined ? {value} : {})});
  const fi = (secs) => Math.round(secs * frames.fps);
  const total = items.reduce((n, it) => n + it.secs, 0);
  const scenes = items.filter((it) => it.kind === 'scene');
  const first = items[0];

  // 1. Hook copy on frame 0: the plan puts copy there, and the pixels show content there.
  const planned = first?.kind === 'intro' ? first.item.title : first?.item.copy?.headline ?? (first?.item.script ? null : undefined);
  const c0 = contentFraction(frames.at(0));
  if (first && isBeat(first.item) && !first.item.copy?.headline) add('frame0', 'fail', first.id, `the opening beat has no copy; the hook must be readable on frame 0`);
  else if (planned === null) add('frame0', 'warn', first?.id, 'the film opens on a capture scene with narration; no hook copy is planned for frame 0');
  add('frame0', c0 >= FRAME0_MIN_CONTENT ? 'pass' : 'fail', first?.id, `frame 0 content ${(c0 * 100).toFixed(1)}% of pixels away from the background (minimum ${FRAME0_MIN_CONTENT * 100}%)${planned ? `; planned copy "${String(planned).slice(0, 60)}"` : ''}`, +c0.toFixed(4));

  // 2. Liveness: in product scenes nothing stays still for more than about a second.
  const stillRuns = {};
  for (const it of scenes) {
    if (!isProductScene(it.item)) continue;
    const a = fi(it.start), b = Math.min(frames.n - 1, fi(it.start + it.secs) - 1);
    let longest = 0, run = 0;
    for (let i = a; i + frames.fps <= b; i++) {
      const d = changedFraction(frames.at(i), frames.at(i + frames.fps));
      if (d < STILL_CHANGE) { run += 1 / frames.fps; longest = Math.max(longest, run + 1); } else run = 0;
    }
    stillRuns[it.id] = +longest.toFixed(2);
    const level = longest > STILL_RUN_FAIL ? 'fail' : longest > STILL_RUN_WARN ? 'warn' : 'pass';
    if (level !== 'pass' || it.secs > 3) add('liveness', level, it.id, `longest still stretch ${longest.toFixed(1)} s in a ${it.secs.toFixed(1)} s product scene (warn over ${STILL_RUN_WARN} s, fail over ${STILL_RUN_FAIL} s)`, +longest.toFixed(2));
  }

  // 3. Label hold with the camera still: the last second of a labelled or copy-bearing scene does not move.
  for (const it of scenes) {
    const s = it.item;
    const labelled = (s.labels?.length || s.copy?.headline) && it.secs >= 1.2;
    if (!labelled) continue;
    const b = Math.min(frames.n - 1, fi(it.start + it.secs) - 1), a = Math.max(0, b - frames.fps);
    let maxd = 0;
    for (let i = a; i < b; i++) maxd = Math.max(maxd, meanAbsDiff(frames.at(i), frames.at(i + 1)));
    const t = isBeat(s) ? beatTiming(s, it.index) : null;
    const holdOk = !t || t.holdAfter >= 1.0;
    add('labelHold', maxd < MOVING_TOL && holdOk ? 'pass' : 'warn', it.id, `last second: max motion ${maxd.toFixed(2)} (still under ${MOVING_TOL})${t ? `; holdAfter ${t.holdAfter.toFixed(2)} s` : ''}${s.labels?.length ? `; labels ${s.labels.map((l) => `"${l}"`).join(', ')}` : ''}`, +maxd.toFixed(3));
  }

  // 4. Caption and copy limits: 17 characters per second, 0.7 s minimum, two short headline lines, no orphan.
  for (const it of items) {
    const s = it.item;
    if (s.script && (s.audio || !isBeat(s))) {
      const secs = s.audioDuration ?? it.secs;
      const cps = s.script.length / Math.max(0.1, secs);
      if (secs < CAPTION_MIN) add('captions', 'fail', it.id, `caption on screen ${secs.toFixed(2)} s (minimum ${CAPTION_MIN} s)`);
      add('captions', cps > CAPTION_CPS ? 'warn' : 'pass', it.id, `caption ${s.script.length} characters over ${secs.toFixed(1)} s = ${cps.toFixed(1)} chars/s (limit ${CAPTION_CPS})`, +cps.toFixed(1));
    }
    if (s.copy?.headline) {
      const lay = s.layout ?? (s.visual === 'typographic' || !s.visual ? 'full-bleed-type' : 'captioned');
      const perLine = lay === 'full-bleed-type' && s.copy.headline.length > 40 ? 33 : HEADLINE_CHARS_PER_LINE[lay] ?? HEADLINE_CHARS_PER_LINE.default;
      const lines = wrapLines(s.copy.headline, perLine);
      const orphan = lines.length > 1 && lines[lines.length - 1].split(' ').length === 1;
      if (lines.length > HEADLINE_MAX_LINES) add('copy', 'warn', it.id, `headline wraps to ${lines.length} lines at about ${perLine} characters per line in this layout: "${s.copy.headline}"`);
      if (orphan) add('copy', 'warn', it.id, `headline ends on a one-word line ("${lines[lines.length - 1]}")`);
      if ((s.copy.sub || '').length > SUB_MAX_CHARS) add('copy', 'warn', it.id, `sub line is ${s.copy.sub.length} characters (limit ${SUB_MAX_CHARS})`);
      if (lines.length <= HEADLINE_MAX_LINES && !orphan && (s.copy.sub || '').length <= SUB_MAX_CHARS) add('copy', 'pass', it.id, `copy within limits (${lines.length} line${lines.length === 1 ? '' : 's'}${s.copy.sub ? `, sub ${s.copy.sub.length} chars` : ''})`);
    }
    // Narration must not echo the on-screen copy.
    if (s.script && s.copy?.headline) {
      const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3);
      const a = new Set(norm(s.copy.headline + ' ' + (s.copy.sub || ''))), b = norm(s.script);
      const shared = b.filter((w) => a.has(w)).length;
      if (a.size && shared / a.size >= 0.6) add('echo', 'warn', it.id, `narration repeats the on-screen copy (${shared} of ${a.size} copy words spoken); narration adds, never echoes`);
    }
  }

  // 5. Nothing moving at a cut: the two samples before each boundary are still.
  for (let k = 1; k < items.length; k++) {
    const b = fi(items[k].start);
    if (b - 2 < 0 || b >= frames.n) continue;
    const d = meanAbsDiff(frames.at(b - 2), frames.at(b - 1));
    add('cutStill', d < MOVING_TOL ? 'pass' : 'warn', items[k - 1].id, `motion ${d.toFixed(2)} in the last sample before the cut to ${items[k].id} (still under ${MOVING_TOL})`, +d.toFixed(3));
  }

  // 6. Structural craft checks from the plan.
  for (const it of scenes) {
    const z = it.item.focus?.zoom;
    if (z && z > ZOOM_CAP) add('zoom', 'warn', it.id, `zoom ${z}x exceeds the ${ZOOM_CAP}x cap`);
  }
  if (scenes.length >= 4) {
    const half = scenes.slice(Math.floor(scenes.length / 2));
    const dark = half.some((it) => it.item.stage === 'dark' || (!it.item.stage && !sb.stage && ['problem', 'close'].includes(it.item.act)) || (sb.stage === 'dark' && isBeat(it.item)));
    if (sb.template === 'launch' || sb.template === 'feature-showcase') add('darkScene', dark ? 'pass' : 'info', null, dark ? 'one dark-stage scene in the second half' : 'no dark-stage scene in the second half (a default, not a law)');
  }
  const last = scenes[scenes.length - 1];
  if (last) {
    const closesOnProduct = !isBeat(last.item) || isProductScene(last.item);
    add('productClose', closesOnProduct ? 'pass' : sb.outro ? 'info' : 'warn', last.id, closesOnProduct ? `the final scene shows the product (${last.item.visual ?? last.item.media})` : `the final scene is ${last.item.visual ?? 'a card'}, not the product; defaults to a product close`);
  }

  // Slideshow-risk score: repetition, weak motion, typography over-reliance, static holds,
  // identical transitions, decoration without product. 0 is a video, 100 is a slideshow.
  const kinds = scenes.map((it) => isBeat(it.item) ? it.item.visual ?? 'typographic' : it.item.media ?? 'still');
  let repeats = 0;
  for (let i = 2; i < kinds.length; i++) if (kinds[i] === kinds[i - 1] && kinds[i] === kinds[i - 2]) repeats++;
  const typographic = kinds.filter((k) => k === 'typographic').length / Math.max(1, kinds.length);
  const handoffs = scenes.map((it) => isBeat(it.item) ? it.item.handoff ?? 'crossfade' : 'cut');
  const identical = new Set(handoffs).size === 1 && scenes.length >= 4 ? 1 : 0;
  const stillSecs = Object.values(stillRuns).reduce((n, v) => n + Math.max(0, v - 1), 0);
  let motion = 0, cnt = 0;
  for (let i = 0; i + frames.fps < frames.n; i += Math.max(1, Math.floor(frames.fps / 3))) { motion += meanAbsDiff(frames.at(i), frames.at(i + frames.fps)); cnt++; }
  const meanMotion = cnt ? motion / cnt : 0;
  const productSecs = scenes.filter((it) => isProductScene(it.item)).reduce((n, it) => n + it.secs, 0);
  const risk = {
    repetition: Math.min(25, repeats * 12),
    typography: Math.round(Math.max(0, typographic - 0.4) * 60),
    staticHolds: Math.min(25, Math.round(stillSecs * 6)),
    identicalTransitions: identical * 10,
    weakMotion: meanMotion < 1.5 ? 15 : meanMotion < 3 ? 6 : 0,
    decorationWithoutProduct: productSecs / Math.max(1, total) < 0.4 ? 20 : 0,
  };
  const score = Math.min(100, Object.values(risk).reduce((n, v) => n + v, 0));
  add('slideshowRisk', score >= 40 ? 'fail' : score >= 25 ? 'warn' : 'pass', null, `slideshow risk ${score}/100 (${Object.entries(risk).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'no penalties'}); must be under 40 before a full render`, score);

  return {findings: F, measures: {frame0Content: +c0.toFixed(4), stillRuns, meanMotion: +meanMotion.toFixed(2), productShare: +(productSecs / Math.max(1, total)).toFixed(2)}, risk: {score, ...risk}};
}

export const summarise = (findings) => {
  const n = (l) => findings.filter((f) => f.level === l).length;
  return `${n('fail')} fail, ${n('warn')} warn, ${n('pass')} pass`;
};

export const FRAME_FPS = FPS;
