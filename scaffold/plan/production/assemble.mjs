// assemble.mjs — index.html from the plan and the built frames: every scene as
// a sub-composition clip, the transitions the plan names on the master
// timeline (crossfade, cut, zoom-through, wipe; match is a cut whose carry
// element makes the join), the overlap per direction.transition_overlap_s,
// the narration and the music bed as <audio> elements so the Studio preview
// has sound. The final mix (ducking, fades, -14 LUFS) is made after the render
// with ffmpeg in audio.mjs, so the <audio> elements are for preview only.
//
// GL shader transitions: HyperFrames' @hyperframes/shader-transitions package
// (0.8.145, pinned in scaffold/package.json, Apache-2.0) is used only when it
// resolves from scaffold/ and ULTRADEMO_SHADERS=1 (opt-in since 2026-10-29: the
// whip-pan and warp shaders smeared both sides of a test seam for a third
// of a second, so each shader is tested before it is switched on): its IIFE build is
// copied to assets/, and HyperShader.init() takes every boundary, a shader from
// the whitelist below for the overlapping ones and a near-instant entry for
// cuts. Otherwise every transition is CSS on the clip wrappers (transform,
// opacity, filter, clip-path).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { hostHtml, setFrameDuration } from './frames.mjs';
import { SCAFFOLD } from './craft.mjs';

const r3 = (n) => Math.round(n * 1000) / 1000;
const paletteValue = (e) => (typeof e === 'string' ? e : e.value);

/** Whether shader transitions are on: opted in with ULTRADEMO_SHADERS=1 and the package installed in scaffold/. */
export function shaderTransitionsAvailable() {
  if (process.env.ULTRADEMO_SHADERS !== '1') return false;
  return Boolean(shaderBundle());
}

/** The package's IIFE build (global HyperShader), or null. */
export function shaderBundle() {
  try {
    const main = createRequire(path.join(SCAFFOLD, 'package.json')).resolve('@hyperframes/shader-transitions');
    const file = path.join(path.dirname(main), 'index.global.js');
    return fs.existsSync(file) ? file : null;
  } catch { return null; }
}

/**
 * The shaders a product video may use: dissolves, directional pushes, zoom-throughs, irises and light.
 * Left out on purpose: ridged-burn (sparks), glitch, swirl-vortex, thermal-distortion (too loud for a product).
 */
export const SHADER_WHITELIST = ['cross-warp-morph', 'domain-warp', 'whip-pan', 'cinematic-zoom', 'gravitational-lens', 'sdf-iris', 'light-leak', 'flash-through-white', 'chromatic-split', 'ripple-waves'];

/**
 * The shader for one boundary: one primary per energy for most crossfades (60–70% of the changes),
 * one accent into the proof or signature scene, zoom-through and wipe by their own kind; cuts and match cuts take none.
 */
export function shaderFor(kind, { energy = 'steady', accent = false } = {}) {
  if (kind === 'zoom-through') return 'cinematic-zoom';
  if (kind === 'wipe') return energy === 'high' ? 'whip-pan' : 'sdf-iris';
  if (kind !== 'crossfade') return null;
  if (accent) return energy === 'high' ? 'cinematic-zoom' : 'light-leak';
  return energy === 'high' ? 'whip-pan' : 'cross-warp-morph';
}

/** The transition kinds the plan may name and how they are built. */
export const TRANSITION_KINDS = {
  cut: { overlap: false },
  match: { overlap: false },
  crossfade: { overlap: true },
  'zoom-through': { overlap: true },
  wipe: { overlap: true },
};

/**
 * GSAP lines for one boundary on the master timeline. The incoming clip sits
 * on a higher track than the outgoing, so it composites on top.
 * @param {{ kind: string, from: string, to: string, at: number, dur: number, width: number, energy: string }} b
 */
export function transitionGsap(b) {
  const OLD = `"#el-${b.from}"`, NEW = `"#el-${b.to}"`;
  const T = r3(b.at), D = r3(b.dur);
  switch (b.kind) {
    case 'crossfade':
      return [
        `tl.fromTo(${NEW}, { opacity: 0 }, { opacity: 1, duration: ${D}, ease: "power2.inOut" }, ${T});`,
        `tl.fromTo(${OLD}, { opacity: 1 }, { opacity: 0, duration: ${D}, ease: "power2.inOut", immediateRender: false }, ${T});`,
      ];
    case 'zoom-through':
      return [
        `tl.fromTo(${OLD}, { scale: 1, opacity: 1, filter: "blur(0px)" }, { scale: 2.2, opacity: 0, filter: "blur(10px)", duration: ${D}, ease: "power3.in", immediateRender: false }, ${T});`,
        `tl.fromTo(${NEW}, { scale: 0.6, opacity: 0, filter: "blur(10px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: ${D}, ease: "power3.out" }, ${T});`,
      ];
    case 'wipe':
      return [
        `tl.fromTo(${NEW}, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: ${D}, ease: "power3.inOut" }, ${T});`,
        `tl.fromTo(${OLD}, { x: 0 }, { x: ${-Math.round(b.width * 0.08)}, duration: ${D}, ease: "power3.inOut", immediateRender: false }, ${T});`,
      ];
    default:
      return [];
  }
}

/**
 * The clip list with overlaps: each scene starts at its plan start; an
 * outgoing scene is extended by the overlap when the next scene's transition
 * overlaps. Tracks rise with the order so the incoming composites on top.
 */
export function clipPlan(plan) {
  const overlap = plan.direction.transition_overlap_s ?? 0.4;
  const clips = plan.scenes.map((s, i) => ({ id: s.id, start: s.start_s, duration: s.duration_s, base: s.duration_s, track: i + 1, transition_in: s.transition_in }));
  const boundaries = [];
  for (let i = 1; i < clips.length; i++) {
    const kind = TRANSITION_KINDS[clips[i].transition_in] ? clips[i].transition_in : 'crossfade';
    if (!TRANSITION_KINDS[kind].overlap) continue;
    clips[i - 1].duration = r3(clips[i - 1].base + overlap);
    boundaries.push({ kind, from: clips[i - 1].id, to: clips[i].id, at: clips[i].start, dur: overlap });
  }
  return { clips, boundaries, overlap };
}

/**
 * Write index.html (and hyperframes.json) for the whole video; stamps every
 * frame root's data-duration to its clip length so no sub-composition blanks.
 * @param {object} args { plan, projectDir, voices: [{id, path, start_s, secs}], music: {path, usable_from_s, volume} | null }
 * @returns {{ file: string, clips, boundaries, shader: boolean }}
 */
export function assembleIndex({ plan, projectDir, voices = [], music = null }) {
  const [width, height] = plan.video.format.split('x').map(Number);
  const { clips, boundaries, overlap } = clipPlan(plan);
  const total = r3(plan.scenes.reduce((a, s) => a + s.duration_s, 0));
  for (const c of clips) setFrameDuration(path.join(projectDir, 'compositions', 'frames', `${c.id}.html`), c.duration);
  const shader = shaderTransitionsAvailable();
  let transitions;
  let shaderCount = 0;
  let scripts = '';
  if (shader && clips.length > 1) {
    // every boundary is an entry (the package wants scenes.length === transitions.length + 1); cuts are near-instant swaps
    fs.mkdirSync(path.join(projectDir, 'assets'), { recursive: true });
    fs.copyFileSync(shaderBundle(), path.join(projectDir, 'assets', 'shader-transitions.js'));
    scripts = '<script src="assets/shader-transitions.js"></script>';
    const accentTo = plan.scenes.find((s) => s.beat === 'proof')?.id || null;
    const entries = [];
    for (let i = 1; i < clips.length; i++) {
      const b = boundaries.find((x) => x.to === clips[i].id);
      if (!b) { entries.push({ time: r3(clips[i].start), duration: 0.001, ease: 'none' }); continue; }
      const name = shaderFor(b.kind, { energy: plan.direction.energy, accent: b.to === accentTo });
      b.shader = name && SHADER_WHITELIST.includes(name) ? name : null;
      if (b.shader) shaderCount++;
      entries.push({ time: r3(b.at), duration: r3(b.dur), ...(b.shader ? { shader: b.shader } : {}), ease: 'power2.inOut' });
    }
    const accent = paletteValue(plan.direction.palette.accent);
    transitions = `    HyperShader.init({ bgColor: ${JSON.stringify(paletteValue(plan.direction.palette.ground))}, accentColor: ${JSON.stringify(/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#ffffff')}, scenes: ${JSON.stringify(clips.map((c) => `el-${c.id}`))}, transitions: ${JSON.stringify(entries)}, timeline: tl });`;
  } else {
    transitions = boundaries.flatMap((b) => transitionGsap({ ...b, width, energy: plan.direction.energy })).map((l) => `    ${l}`).join('\n');
  }
  const audio = [];
  for (const v of voices) {
    if (!v.path) continue;
    audio.push(`  <audio id="voice-${v.id}" src="${v.path}" data-start="${r3(v.start_s)}" data-duration="${r3(Math.min(v.secs, total - v.start_s))}" data-track-index="50" data-volume="1"></audio>`);
  }
  if (music?.path) {
    audio.push(`  <audio id="bgm" src="${music.path}" data-start="0" data-duration="${total}" data-track-index="60" data-volume="${music.volume ?? (voices.length ? 0.18 : 0.6)}"${music.usable_from_s ? ` data-media-start="${music.usable_from_s}"` : ''}></audio>`);
  }
  const html = hostHtml({ clips, duration: total, ground: paletteValue(plan.direction.palette.ground), width, height, fps: plan.video.fps, transitions, audio: audio.join('\n'), scripts });
  fs.writeFileSync(path.join(projectDir, 'index.html'), html);
  fs.writeFileSync(path.join(projectDir, 'hyperframes.json'), JSON.stringify({ paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: false } }) + '\n');
  return { file: path.join(projectDir, 'index.html'), clips, boundaries, overlap, shader, shaderCount, total };
}
