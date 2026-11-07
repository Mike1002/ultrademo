// craft.mjs — the craft every builder reads: the frame contract, the renderer
// traps list from the motion gallery README (read at run time so it stays the
// gallery's own words), the motion doctrine, the shot blueprint for a scene
// (sliced from HyperFrames' blueprint files, Apache-2.0, frozen copy) and the
// gate-clean gallery code for the scene's motion styles (D-57: builders copy
// from frame.html files, never from the raw rules).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUR_BLUEPRINTS } from '../catalogue.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.ULTRADEMO_ROOT || path.resolve(HERE, '..', '..', '..');
export const SCAFFOLD = path.join(ROOT, 'scaffold');
export const GALLERY = path.join(ROOT, 'research/motion-craft/motion-gallery');
export const GALLERY_LIB = path.join(GALLERY, '_lib/gsap.min.js');
export const STYLE_GALLERY = path.join(ROOT, 'research/motion-craft/video-style-gallery');
export const FONTS_DIR = path.join(STYLE_GALLERY, '_fonts');
export const BLUEPRINTS_DIR = path.join(ROOT, 'research/motion-craft/2026-10-13-hyperframes-skills/skills/hyperframes-animation/blueprints');
export const HYPERFRAMES = 'hyperframes@0.8.145';
// HyperFrames runs pinned and quiet: no usage telemetry, no update check, no background self-install (it would replace
// the pinned version). Set here so every renderer call inherits it.
for (const k of ['HYPERFRAMES_NO_TELEMETRY', 'DO_NOT_TRACK', 'HYPERFRAMES_NO_UPDATE_CHECK', 'HYPERFRAMES_NO_AUTO_INSTALL']) process.env[k] ??= '1';


const readIf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');

/**
 * The renderer traps list: the gallery README's "What the sources' own code
 * gets wrong" section (both sources, with the renderer and gate findings),
 * verbatim. Required reading for every builder prompt.
 */
export function rendererTraps() {
  const md = readIf(path.join(GALLERY, 'README.md'));
  const start = md.indexOf('## What the sources');
  const end = md.indexOf('\n## Files', start);
  if (start < 0) return '(the motion gallery README was not found; the traps list is missing)';
  return md.slice(start, end > 0 ? end : undefined).trim();
}

/** The frame contract as a builder must write it (sub-composition form, HyperFrames 0.8.145). */
export const FRAME_CONTRACT = `## The frame contract (HyperFrames sub-composition; lint runs on it)

Write ONE file: a HyperFrames sub-composition. Everything the runtime needs sits INSIDE one <template> element, in this order:
1. <style> with this scene's own CSS only (the kit CSS is inlined above it by the pipeline; do not repeat it; you may add scene-specific rules and override kit values on your own ids).
2. <div id="root" data-composition-id="SCENE_ID" data-width="1920" data-height="1080" data-duration="SCENE_DURATION"> … </div> — style the root by #root (never by a class): position:absolute; inset:0; overflow:hidden; background: the ground colour.
3. <script> wrapped in an IIFE: build exactly ONE paused timeline, const tl = gsap.timeline({ paused: true }); add every tween at an absolute time; and only then register it: window.__timelines["SCENE_ID"] = tl; (the key equals the root's data-composition-id). Build synchronously (no document.fonts.ready wrapper; the fonts are local files and the renderer waits for them).

Rules the linter and the renderer enforce (an error here costs a repair call):
- Every id in the file starts with the scene's letter prefix given below (e.g. id="s03thechase-card"): all scenes are assembled into one page, and an id that starts with a digit is not a valid CSS selector ("#01-card" throws in querySelectorAll and the timeline never registers).
- gsap.fromTo with explicit from-states for every entrance; never tl.from(); never rely on a CSS-hidden start. A second fromTo on the same target and property carries immediateRender: false.
- Never put a CSS transform on an element GSAP tweens on x/y/scale/rotation (lint error gsap_css_transform_conflict). Position with left/top (minus half the size to centre) and let GSAP own the transform. Centre with flex or inset, not translate(-50%,-50%).
- Never tween width, height, top, left: use scale, x/y, clip-path, opacity, filter, backgroundPosition, strokeDashoffset. Transformed elements are block-level and sized.
- No CSS transition, no @keyframes, no repeat:-1, no yoyo loops, no Math.random, no Date.now, no setTimeout, no fetch, no <br> in body text, no external URLs. Deterministic: every frame is a pure function of the timeline time.
- Time-driven content (counters, typing, discrete states) is written from a pure renderAt(t) and ALSO wraps tl.render so a cold seek repaints:
  function renderAt(t){ /* write DOM from t */ } renderAt(0);
  tl.to({k:0},{k:1,duration:SCENE_DURATION,ease:"none",onUpdate:()=>renderAt(tl.time())},0);
  const baseRender = tl.render; tl.render = function(){ const r = baseRender.apply(this, arguments); renderAt(this.time()); return r; };
- Never tween visibility, display or autoAlpha; never tween the root. Hide an element with opacity 0 in its fromTo from-state, not with a tl.set at time 0 (gsap_timeline_set_initial_hide) and not with a CSS opacity:0 that a later tween then "inherits".
- GSAP cannot interpolate var(): write literal hex values inside tweens (the palette values are listed below); CSS may use the kit variables.
- A full-screen overlay (inset:0) must not start visible (gsap_fullscreen_overlay_starts_visible); give it opacity 0 in its from-state.
- Intentional overlaps (a stacked copy, a cursor over a button, a glow behind a card) carry data-layout-allow-overlap on the overlapping element itself, and covered text carries data-layout-allow-occlusion on that text node, or check reports content_overlap / text_occluded.
- Fonts: use only the families the kit declares (@font-face lives in the kit CSS); font-family names must match the kit exactly.
- Images: only the asset paths listed below, relative to the project root (assets/scout/…). An image needs motion treatment (a push, a pan, a device frame, a parallax layer); never a flat raw screenshot.
- Keep the file under 350 lines. No comments longer than a line. No markdown, no prose outside the file.`;

/** The doctrine summary (motion-language Part 2 and 3, video-composition, Sartini's rules, D-67). */
export const DOCTRINE = `## Motion doctrine (binding)

- Smooth beats bouncy: power3.out / expo.out long-tail settles by default; back.out only where the plan's motion grammar names a snap (a pill morph, a press).
- No front-loading: at t=0 only what the first motion line names is on screen; every further piece arrives on its own line's window, into the back half of the scene too. The motion lines in the spec cover the whole duration; follow them window by window.
- Vary the choreography: at least three different eases and directions per scene; entrances longer than exits; the slowest move three times slower than the fastest.
- Aliveness during a pause is subtle jitter or one bounded move on the hero (2–6 px, sine.inOut, finite); never lazy breathing, never a slow pan in the back half, never many elements floating independently. But nothing may sit dead: the measured target is still time 0% and no stretch stiller than 0.5 s, so a hold is a slow settle, a glow that blooms, a cursor that drifts, one pill that pulses, not a frozen frame.
- Video is not a web page: headlines 64–200 px (the opening line about 60–80% of the frame width), body 28–42 px, labels 18–24 px, borders 2–4 px, decorative opacity 12–25%, padding 60–140 px. Two focal points, three layers (ground treatment, content, foreground accents), anchor to edges or a clear grid; no nav bars, no scrollbars, no browser chrome unless the scene rebuilds the product window on purpose.
- Keep the bottom 17% free of copy that must be read (caption band); keep every element inside 1920×1080 at every moment (the checker samples every motion-line boundary).
- The copy is on screen by the time its reading window says, and stays legible until the window ends; the hook scene's headline is already visible on frame 0 (an entrance from blur or scale, not from opacity 0).
- The seams: the next scene's transition overlaps your last frame for 0.4 s (the host holds it), and your first 0.4 s overlaps the previous scene's last frame. So in your last 0.4–0.6 s everything except the carried element travels out (slides, scales or pushes off its region; not a fade in place), and by your final frame only the ground and the carried element remain; in your first 0.3 s only the ground and the carried element are on screen, and new content lands after that. Two scenes' content must never sit in the same place at the same time.
- Numbers on screen are only the plan's numbers (and labels the product itself shows, listed below); no invented statistics, no dates, no fake counts.
- How the motion number is earned: the checker measures the mean grey change between frames 1/15 s apart on a 240×135 copy; a headline blurring in on a black field measures about 0.2, a reference launch video 2.7. Reaching 2.5 needs large areas in continuous motion for the whole scene: a slow camera push or drift on the whole stage (scale 1 → 1.05–1.08 over the scene on a .stage wrapper), the ground pools travelling, cards and rows arriving across the frame rather than fading in place, a cursor that keeps moving, light that sweeps. Fades and blurs alone measure as still.
- When a headline is split into word spans, keep a real space between the spans (a text node " " between the closing and the next opening tag, plus margin-right: 0.28em on each span as a backstop), or the words run together on screen ("Chasingsign-ups" is the failure).
- Something changes at least every 0.5 s, and the scene has exactly one camera move (a push, a pull or a pan on the .stage wrapper) across its duration; motion is earned by travel and by state change (rows arrive, a pill turns, a number climbs, a cursor crosses and presses), never by fading or blurring in place.
- Say video, never film, in any on-screen word.`;

/** Compose for video, not web (D-67), with the composition checks in plain words so the builder designs to them. */
export const COMPOSITION = `## Compose for video, not for a web page (binding; checked on the rendered frames)

Build every scene as a full-frame stage, in layers:
- A background layer that fills 1920×1080: the ground and its pools or texture (mark purely decorative layers data-decor="1": glows, pools, grain, grids, light sweeps). Mark a drawn graphic with no text in it (a meter fill, a progress bar, a selection frame) data-shape="1", and the wrapper of a rebuilt product surface made of several panels data-product="1", so the composition checks read them as content and as one product.
- A midground that carries the message: the headline and the product part, sized and placed for a video frame.
- Foreground accents that make it produced: a kicker or label, a rule that draws, a cursor, a pill, a toast.
Nothing floats alone in a corner; the composition is balanced on the frame, never a web layout pinned to the top-left with the rest empty. On a product moment the product part (the rebuilt window, the captured screen in its device frame, the card) fills most of the frame: at least 40% of the width, usually 60–75%. Every container you draw (a card, a panel, a window, a box, a button) has its content in it from the moment it is visible: never an empty box, an outline ghosting in, or a placeholder rectangle.

What the checker measures on your rendered frames, every 0.25 s (a failure that lasts more than 0.5–0.75 s sends the scene back for a rebuild):
1. Every visible container has content: text, an image, or child parts with their own ink. A painted box with nothing inside fails.
2. Balance: the primary content covers a sensible share of the frame (at least 30% of its width or height, and 5% of its area) and its centre of mass sits in the middle third of the frame, unless the scene's layout names left, right, top, bottom, a split or a corner. Content anchored in a corner fails.
3. What the layout centres (or a scene's single primary element) is centred horizontally within 2% of the frame (38 px). Centre with flex or symmetric left/right positions, and keep a button the same width on both sides of the centre.
4. Nothing within 4% of the frame edges (77 px left and right, 43 px top and bottom), except the brand mark and labels the layout puts there (mark those with data-edge="1"; a logo carries data-brand="1"). A small element far from everything else (more than a fifth of the frame away, in the outer band) floats alone and fails: the mark sits with the content it signs, unless the layout puts it in a corner.
5. Transitions: during the 0.4 s overlap with the neighbouring scene, your content and theirs must not sit in the same region at the same time. Clear the stage before your end (everything but the carried element travels out) and land new content only after your first 0.3 s.
6. Scale: the headline at the direction's headline size or larger (never under it); on a product moment the product part at least 40% of the frame width at its largest.
Text must stay inside the canvas, readable through its reading window.`;

/**
 * A shot blueprint, sliced: intent, duration, the shot structure, the rule
 * mapping, and only the "roles served" lines that mention the scene's role.
 * @returns {string}
 */
export function blueprintText(id, role = '') {
  if (OUR_BLUEPRINTS.includes(id)) return OUR_BLUEPRINT_TEXT[id] || '';
  const md = readIf(path.join(BLUEPRINTS_DIR, `${id}.md`));
  if (!md) return `(blueprint "${id}" has no file; compose from the motion styles)`;
  const section = (name) => {
    const i = md.indexOf(`**${name}**`);
    if (i < 0) return '';
    const next = md.indexOf('\n**', i + name.length + 4);
    return md.slice(i, next > 0 ? next : undefined).trim();
  };
  const roleLines = section('roles served').split('\n').filter((l) => l.startsWith('- ') && (!role || l.toLowerCase().includes(role.toLowerCase().replace(/_/g, '_')) || l.toLowerCase().includes(role.toLowerCase().replace(/_/g, ' '))));
  const parts = [`# ${id}`, section('intent'), roleLines.length ? `**roles served (the ones for this scene's role)**\n${roleLines.slice(0, 4).join('\n')}` : '', section('duration'), section('shot structure'), section('rule mapping')].filter(Boolean);
  let text = parts.join('\n\n');
  if (text.length > 9000) text = text.slice(0, 9000) + '\n… (sliced)';
  return text;
}

const OUR_BLUEPRINT_TEXT = {
  'ui-element-morph-cycle': `# ui-element-morph-cycle (ours, D-49)\n**intent**: the camera pushes into a real control of the product, a code twin fades over it at identical geometry, and the container morphs through the functions it unlocks (paint-only container morph with two-edge springs; labels leave before and enter after the container; icon morphs; a cursor press on cue). Boundary states are snapshotted ±1 frame. Only functions the product really has.`,
  'object-role-relay': `# object-role-relay (ours, D-49)\n**intent**: one object on a plain ground becomes, in turn, button → spinner → check → player → slider → toggle → segmented control → chart card → command palette → button; an illustration of breadth, allowed only when every role shown is a real feature. No captured product in the shot; carries mood and the camera's destination, never a number.`,
};

/** The gallery index, read once. */
let galleryIndex = null;
export function galleryEntries() {
  if (galleryIndex) return galleryIndex;
  const file = path.join(GALLERY, 'index.json');
  galleryIndex = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')).entries || []) : [];
  return galleryIndex;
}

/** The gate-clean code of one motion style (frame.html + its one line), or null. */
export function galleryCode(id) {
  const entries = galleryEntries();
  const e = entries.find((x) => x.id === id) || entries.find((x) => (x.aliases || []).some((a) => String(a).replace(/^awesome-ai-motion:/, '') === id));
  if (!e) return null;
  const file = path.join(GALLERY, e.frame || `${e.id}/frame.html`);
  if (!fs.existsSync(file)) return null;
  return { id: e.id, name: e.name, one_line: e.one_line || '', html: fs.readFileSync(file, 'utf8') };
}

/** Motion-style ids a scene cites: rules[] plus inline "(→ id)" references, deduplicated, at most `max`. */
export function sceneRuleIds(scene, max = 3) {
  const ids = [...(scene.rules || [])];
  for (const line of scene.motion || []) for (const m of String(line.what).matchAll(/→\s*([a-z0-9]+(?:-[a-z0-9]+)+)/g)) ids.push(m[1]);
  return [...new Set(ids)].slice(0, max);
}

/** Open fonts of the style gallery: family → faces (absolute files). */
export function openFonts() {
  const file = path.join(FONTS_DIR, 'fonts.json');
  if (!fs.existsSync(file)) return [];
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.entries(j.fetched || {}).map(([family, v]) => ({
    family,
    faces: (v.faces || []).map((f) => ({ file: path.join(FONTS_DIR, path.relative('_fonts', f.file)), weight: String(f.weight), style: f.style })),
  }));
}

/** The video-style definition from the gallery, compact, or null. */
export function styleDefinition(id) {
  if (!id || !/^[a-z0-9-]+$/.test(id)) return null;
  const file = path.join(STYLE_GALLERY, id, 'style.json');
  if (!fs.existsSync(file)) return null;
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { id: s.id || id, name: s.name || id, canvas: s.canvas, mood: s.mood || [], palette: s.palette || {}, type: s.type || {}, easing: s.easing || null, rhythm: s.rhythm || null, transition: s.transition || null, text_animation: s.text_animation || null, shape: s.shape || null, atmosphere: s.atmosphere || [], notes: s.notes || '' };
}
