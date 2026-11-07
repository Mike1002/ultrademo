// One timing model for the whole pipeline. Demo.tsx (the renderer), render.mjs, verify.mjs,
// review.mjs and stills.mjs all import this file, so a scene lasts exactly as many frames in
// the review page, the stills, the render and the verify block. Plain ESM so Node scripts and
// the Remotion bundle share it; `timing.d.mts` carries the types.
export const FPS = 30;
export const HOLD_AFTER_AUDIO = 0.7; // breathing room after a narration line
export const HOLD_AFTER_CLIP = 0.4; // settle after a clip finishes
export const SLIDE_SECONDS = 3; // minimum intro / outro card
export const SLIDE_LEAD_IN = 0.75; // narrated cards: voice starts this long after the card lands
export const MAX_CLIP_RATE = 1.3; // a clip that outlasts its narration speeds up, capped here

// Beat scenes (Launch and Feature showcase): reading floors and event timing as
// defaults the storyboard can override per scene through `timing`.
export const READ_PER_WORD = 0.25;
export const READ_MIN = 1.0;
export const BEAT_DEFAULTS = {entrance: 0.42, settleBefore: 0.55, pause: 0.45, action: 0.4, holdAfter: 1.0, exit: 0.3, minimum: 1.5};
export const HANDOFF_SECONDS = 0.2; // crossfade / wipe length between beat scenes
export const BEAT_VISUALS = ['typographic', 'product-in-frame', 'split', 'card-fan', 'stat', 'graphic'];

const words = (t) => (t ? String(t).trim().split(/\s+/).filter(Boolean).length : 0);
const round = (secs) => Math.round(secs * FPS) / FPS;

export const isBeat = (s) => s.media === 'beat';

// Effective event timing of a beat: defaults, then `timing`, then the flat per-scene shorthands.
export const beatTiming = (s, index = -1) => {
  const t = {...BEAT_DEFAULTS, ...(s.timing || {})};
  if (s.settleBefore != null) t.settleBefore = s.settleBefore;
  if (s.holdAfter != null) t.holdAfter = s.holdAfter;
  if (s.minReadTime != null) t.minReadTime = s.minReadTime;
  // The hook must be readable on frame 0, so the first scene of a
  // video enters instantly unless the storyboard says otherwise.
  if (index === 0 && s.timing?.entrance == null) t.entrance = 0;
  const a = s.action;
  if (a && a.kind === 'scroll') t.action = a.seconds ?? 2.6;
  else if (a && a.kind === 'type') t.action = Math.max(0.6, String(a.text || a.target || '').length * 0.055);
  else if (a && a.kind === 'reveal') t.action = a.seconds ?? 0.8;
  return t;
};

// Seconds the copy needs to be read: 0.25 s per word, 1.0 s floor.
export const readSeconds = (s) => {
  const n = words(s.copy?.headline) + words(s.copy?.sub) + words((s.labels || []).join(' ')) + words(s.stat?.label) + (s.stats || []).reduce((n, x) => n + words(x.label) + words(x.caption) + 1, 0) + (s.goal?.messages || []).reduce((n, m) => n + words(m.text), 0);
  const floor = s.minReadTime ?? s.timing?.minReadTime ?? 0;
  return Math.max(floor, n ? Math.max(READ_MIN, n * READ_PER_WORD) : 0);
};

// A beat lasts as long as its narration, or as long as its copy and action need. `seconds`
// (or the older `durationHint`) pins it; the derived value is the floor either way.
export const beatSeconds = (s, index = -1) => {
  const t = beatTiming(s, index);
  const event = s.action ? t.settleBefore + t.pause + t.action : 0;
  const derived = Math.max(t.minimum, t.entrance + readSeconds(s) + event + t.holdAfter + t.exit);
  if (s.audioDuration) return round(Math.max(derived, s.audioDuration + HOLD_AFTER_AUDIO));
  const pinned = s.seconds ?? s.durationHint;
  return round(pinned != null ? Math.max(pinned, t.minimum) : derived);
};

// Snap a beat length up to the music grid: whole beats, or whole bars when grid is 'bars'.
export const snapToGrid = (secs, bpm, grid = 'beats') => {
  if (!bpm) return secs;
  const unit = (60 / bpm) * (grid === 'bars' ? 4 : 1);
  return round(Math.ceil(secs / unit - 1e-6) * unit);
};

export const narrationSeconds = (s) => (s.audioDuration ?? s.durationHint ?? 4) + HOLD_AFTER_AUDIO;

export const clipRate = (s) => {
  const clip = s.clipDuration ?? 0;
  const n = narrationSeconds(s);
  if (!clip || clip <= n) return 1;
  return Math.min(MAX_CLIP_RATE, clip / n);
};

export const sceneSeconds = (s, index = -1) => {
  if (isBeat(s)) return beatSeconds(s, index);
  const clip = s.clipDuration ? s.clipDuration / clipRate(s) + HOLD_AFTER_CLIP : 0;
  return Math.max(1, Math.round(Math.max(narrationSeconds(s), clip) * FPS)) / FPS;
};

export const sceneFrames = (s, index = -1) => Math.max(FPS, Math.round(sceneSeconds(s, index) * FPS));

export const slideSeconds = (slide) =>
  slide ? (slide.audioDuration ? Math.max(SLIDE_SECONDS, Math.round((SLIDE_LEAD_IN + slide.audioDuration + HOLD_AFTER_AUDIO) * FPS) / FPS) : SLIDE_SECONDS) : 0;
export const slideFrames = (slide) => Math.round(slideSeconds(slide) * FPS);

// Every item of a storyboard in order with its start and length, the one timeline everything reads.
export const timeline = (sb) => {
  const items = [];
  let t = 0;
  if (sb.intro) { const secs = slideSeconds(sb.intro); items.push({id: 'intro-slide', kind: 'intro', start: t, secs, item: sb.intro}); t += secs; }
  const scenes = (sb.scenes || []).filter((s) => !s.skip);
  scenes.forEach((s, i) => { const secs = sceneSeconds(s, i); items.push({id: s.id, kind: 'scene', start: t, secs, item: s, index: i}); t += secs; });
  if (sb.outro) { const secs = slideSeconds(sb.outro); items.push({id: 'outro-slide', kind: 'outro', start: t, secs, item: sb.outro}); t += secs; }
  return {items, total: round(t)};
};

export const totalFrames = (sb) => Math.round(timeline(sb).total * FPS);

// The plan's own event frames for stills and checks: opening, each entrance, trigger and payoff,
// and the closing frame. Times are on the film timeline, in seconds.
export const eventFrames = (sb) => {
  const {items, total} = timeline(sb);
  const out = [{id: 'opening', at: 0, scene: items[0]?.id}];
  for (const it of items) {
    const s = it.item;
    if (it.kind !== 'scene') { out.push({id: `${it.id}-landed`, at: it.start + Math.min(0.8, it.secs / 2), scene: it.id}); continue; }
    const t = isBeat(s) ? beatTiming(s, it.index) : null;
    if (t) {
      out.push({id: `${it.id}-entrance`, at: it.start + Math.min(t.entrance + 0.05, it.secs - 1 / FPS), scene: it.id});
      out.push({id: `${it.id}-settled`, at: it.start + Math.max(0, it.secs - 0.35), scene: it.id});
      if (s.action) {
        out.push({id: `${it.id}-trigger`, at: it.start + Math.min(t.settleBefore + t.pause, it.secs - 1 / FPS), scene: it.id});
        out.push({id: `${it.id}-payoff`, at: it.start + Math.min(t.settleBefore + t.pause + t.action + 0.2, it.secs - 1 / FPS), scene: it.id});
      }
    } else {
      out.push({id: `${it.id}-mid`, at: it.start + it.secs / 2, scene: it.id});
    }
  }
  out.push({id: 'closing', at: Math.max(0, total - 1 / FPS), scene: items[items.length - 1]?.id});
  return out;
};
