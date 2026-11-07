#!/usr/bin/env node
// to-storyboard.mjs — write HyperFrames' STORYBOARD.md and frame.md from a plan.
//
//   node plan/to-storyboard.mjs <plan.json> <out-dir>
//
// The plan is the source of truth (D-47); nothing is authored in the storyboard
// directly. The output keeps the section shapes HyperFrames' assembler
// and frame packets read it unchanged: frontmatter, a title, a Source line, a
// "## Video direction" block, then one "## Frame N — Name" per scene with the
// field bullets their builder reads and the time-coded Scene lines.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan, formatReport } from './validate.mjs';

const STATUS_MAP = { planned: 'outline', sketched: 'outline', built: 'animated', approved: 'animated', fix: 'animated' };

const t = (n) => Number(n).toFixed(1);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const paletteValue = (e) => (typeof e === 'string' ? e : e.value);
const paletteUse = (e) => (typeof e === 'string' ? '' : e.use ?? '');
const typeFamily = (r) => (typeof r === 'string' ? r : r.family);
const typeWeight = (r) => (typeof r === 'string' ? '' : r.weight ?? '');

/** Compose the frontmatter + direction + frames markdown. @param {import('./schema.mjs').Plan} plan */
export function renderStoryboard(plan) {
  const { video, direction, scenes } = plan;
  const title = `${video.product} — ${video.template.replace(/-/g, ' ')} video`;
  const arc = video.arc ?? [...new Set(scenes.map((s) => s.beat))].map(cap).join(' → ');
  const music = direction.music.track + (direction.music.bpm ? ` (${direction.music.bpm} bpm)` : '');

  const out = [];
  out.push('---');
  out.push(`title: ${title}`);
  out.push(`format: ${video.format}`);
  out.push(`fps: ${video.fps}`);
  out.push(`duration: ${video.length_s}`);
  out.push(`arc: ${arc}`);
  out.push(`message: ${video.message ?? video.claim}`);
  out.push(`music: ${music}`);
  out.push(`captions: ${video.captions}`);
  out.push('---');
  out.push('');
  out.push(`# ${title}`);
  out.push('');
  out.push(sourceLine(plan));
  out.push('');
  out.push('## Video direction');
  out.push('');
  out.push(`- **Palette**: ${paletteLine(direction)}`);
  out.push(`- **Type**: ${typeLine(direction)}`);
  out.push(`- **Motion grammar**: ${direction.motion_grammar ?? `${direction.camera}. Energy ${direction.energy}; ${direction.pace_band.shots_per_min[0]}–${direction.pace_band.shots_per_min[1]} shots per minute, at least ${direction.pace_band.motion_per_s_min} motion per second, nothing still longer than ${direction.pace_band.still_time_max} s.`}`);
  out.push(`- **Rhythm**: ${direction.rhythm ?? rhythmLine(scenes)}`);
  out.push(`- **Real vs recreated**: ${realVsRebuiltLine(scenes)}`);
  if (direction.banned.length) out.push(`- **Negative list**: ${direction.banned.map((b) => (b.toLowerCase().startsWith('no ') || b.toLowerCase().startsWith('nothing') || b.toLowerCase().startsWith('avoid') ? b : `no ${b}`)).join(', ')}.`);
  out.push(`- **Transitions**: ${transitionsLine(plan)}`);
  out.push(`- **Signature move**: ${direction.signature_move}.`);
  out.push(`- **Hook**: ${direction.hook.angle.replace(/-/g, ' ')}, landed through ${direction.hook.route.replace(/-/g, ' ')}. Close on ${direction.close}.`);
  out.push('');

  scenes.forEach((s, i) => {
    out.push(`## Frame ${i + 1} — ${s.name}`);
    out.push(`- scene: ${s.caption ?? s.layout}`);
    out.push(`- voiceover: ${JSON.stringify(s.voice)}`);
    out.push(`- duration: ${t(s.duration_s)}`);
    out.push(`- transition_in: ${s.transition_in}`);
    out.push(`- status: ${STATUS_MAP[s.status]}`);
    out.push(`- src: compositions/frames/${s.id}.html`);
    out.push(`- type: ${s.role}`);
    if (s.persuasion) out.push(`- persuasion: ${s.persuasion}`);
    out.push(`- beat: ${s.mood}`);
    out.push(`- blueprint: ${blueprintLine(s)}`);
    out.push(`- focal: ${focalLine(s, plan)}`);
    const roles = rolesLine(s);
    if (roles) out.push(`- roles: ${roles}`);
    if (s.sound.sfx.length) out.push(`- sfx: ${s.sound.sfx.join(', ')}`);
    if (s.blueprint_note) out.push(`${s.blueprint_posture === 'adapt' ? 'Adapt' : 'Note'}: ${s.blueprint_note}`);
    [...s.motion].sort((a, b) => a.from_s - b.from_s).forEach((m, k) => {
      out.push(`Scene ${k + 1} (${t(m.from_s)}–${t(m.to_s)}s): ${m.what}`);
    });
    out.push('');
  });

  return out.join('\n').replace(/\n+$/, '');
}

function sourceLine(plan) {
  const { video } = plan;
  const host = safeHost(video.url);
  const narr = { 'music-only': 'No narration; music only.', voice: 'Narrated.', hybrid: 'Narrated in part; music carries the rest.' }[video.narration];
  return `Source: ${host} (public site and its own product imagery). ${narr} Every number on screen cites a claim or a source in the plan. Audience is ${video.viewer}. Claim: ${video.claim}. Pain point: ${video.pain_point}. Proof moment: ${video.proof_moment}. Call to action: ${video.cta}. Tone: ${video.copy.register}.`;
}

function safeHost(u) {
  try { return new URL(u).host; } catch { return u; }
}

function paletteLine(d) {
  const p = d.palette;
  const parts = [`from \`frame.md\` — ground \`${paletteValue(p.ground)}\` (${d.canvas} canvas), ink \`${paletteValue(p.ink)}\`; ONE accent (\`${paletteValue(p.accent)}\`) ${paletteUse(p.accent) || 'for accent words and hero numbers'}`];
  for (const [role, e] of Object.entries(p)) {
    if (['ground', 'ink', 'accent'].includes(role)) continue;
    parts.push(`${role} \`${paletteValue(e)}\`${paletteUse(e) ? ` ${paletteUse(e)}` : ''}`);
  }
  return parts.join('; ') + '.';
}

function typeLine(d) {
  const r = d.type;
  const w = (x) => (typeWeight(x) ? ` ${typeWeight(x)}` : '');
  return `${typeFamily(r.display)}${w(r.display)} for display, ${typeFamily(r.text)}${w(r.text)} for UI and body, ${typeFamily(r.mono)}${w(r.mono)} for kickers and labels. Short copy.`;
}

function rhythmLine(scenes) {
  return scenes.map((s, i) => `${String(i + 1).padStart(2, '0')} ${s.beat} (${s.mood})`).join(', ') + '.';
}

function realVsRebuiltLine(scenes) {
  const kinds = new Set(scenes.flatMap((s) => s.visuals.map((v) => v.kind)));
  const parts = [];
  if (kinds.has('captured')) parts.push('captured visuals stay real (cropped, framed, pushed), never redrawn or relabelled');
  if (kinds.has('rebuilt')) {
    const rebuilt = [...new Set(scenes.flatMap((s) => s.visuals.filter((v) => v.kind === 'rebuilt').map((v) => v.ref.replace(/-/g, ' '))))];
    parts.push(`only the moving parts are rebuilt in HTML in the product's colours with its real labels: ${rebuilt.join(', ')}`);
  }
  if (kinds.has('illustration')) parts.push('illustrations carry mood and the camera, never a number or the proof of a feature');
  return (parts.join('. ') || 'typography only') + '.';
}

function transitionsLine(plan) {
  const { direction, scenes } = plan;
  const counts = {};
  for (const s of scenes.slice(1)) counts[s.transition_in] = (counts[s.transition_in] ?? 0) + 1;
  const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'crossfade';
  const others = scenes.slice(1).filter((s) => s.transition_in !== main).map((s, _, arr) => `frame ${String(scenes.indexOf(s) + 1).padStart(2, '0')} enters with a ${s.transition_in}`);
  return `frames overlap ${direction.transition_overlap_s} s with a ${main} injected at the root${others.length ? ` (${others.join('; ')})` : ''}.`;
}

function blueprintLine(s) {
  if (s.blueprint === 'composed') return 'compose';
  const posture = s.blueprint_posture ? ` (${cap(s.blueprint_posture)})` : '';
  return `${s.blueprint}${posture}`;
}

function focalLine(s, plan) {
  const bySource = new Map(plan.video.sources.map((x) => [x.id, x]));
  const focalVisual = s.visuals.find((v) => v.focal);
  const ref = s.focal?.ref ?? focalVisual?.ref;
  const note = s.focal?.note ?? focalVisual?.note;
  if (ref && bySource.has(ref)) return `${bySource.get(ref).path}${note ? ` (${note})` : ''}`;
  if (ref) return `${ref}${note ? ` (${note})` : ''}`;
  return `none${note ? ` (${note})` : ''}`;
}

function rolesLine(s) {
  return s.visuals.filter((v) => v.role).map((v) => `${v.ref} = ${v.role}`).join('; ');
}

/** Compose frame.md, the design system, from the direction block. @param {import('./schema.mjs').Plan} plan */
export function renderFrame(plan) {
  const { video, direction } = plan;
  const out = [];
  out.push(`# frame.md — ${video.product} ${video.template.replace(/-/g, ' ')} video design system`);
  out.push('');
  out.push(`The look of every frame. Direction "${direction.name}" (${direction.chosen}); mood: ${direction.mood}. Canvas ${video.format.replace('x', 'x')}, ${video.fps} fps, ${direction.canvas}.`);
  out.push('');
  out.push('## Palette (by role)');
  out.push('');
  out.push('| Role | Value | Use |');
  out.push('|---|---|---|');
  for (const [role, e] of Object.entries(direction.palette)) {
    out.push(`| ${role} | \`${paletteValue(e)}\` | ${paletteUse(e)} |`);
  }
  out.push('');
  if (direction.ground) {
    out.push(`Background treatment: ${direction.ground}`);
    out.push('');
  }
  out.push('## Type');
  out.push('');
  const faces = Object.entries(direction.type).filter(([, r]) => typeof r !== 'string' && r.file);
  if (faces.length) {
    out.push('```css');
    for (const [, r] of faces) {
      out.push(`@font-face { font-family: "${r.family}"; src: url("${r.file}") format("woff2"); font-weight: ${r.weight ?? 400}; }`);
    }
    out.push('```');
    out.push('');
  }
  out.push('| Role | Family | Weight | Size (1080p) | Tracking |');
  out.push('|---|---|---|---|---|');
  for (const [role, r] of Object.entries(direction.type)) {
    const fam = typeFamily(r);
    const weight = typeWeight(r) || '';
    const sizes = typeof r === 'string' ? [] : r.sizes ?? [];
    if (!sizes.length) out.push(`| ${role} | ${fam} | ${weight} | | |`);
    for (const sz of sizes) {
      out.push(`| ${role} · ${sz.use} | ${fam} | ${weight} | ${sz.size} | ${[sz.tracking, sz.line_height ? `line-height ${sz.line_height}` : ''].filter(Boolean).join(', ')} |`);
    }
    if (typeof r !== 'string' && r.note) out.push(`| | | | | ${r.note} |`);
  }
  out.push('');
  out.push('## Components');
  out.push('');
  if (direction.components.length) for (const c of direction.components) out.push(`- **${c.name}**: ${c.spec}`);
  else out.push('- (none declared; the builder uses the type ramp and palette roles above)');
  out.push('');
  out.push('## Motion grammar');
  out.push('');
  out.push(`- Energy ${direction.energy}; pace band ${direction.pace_band.shots_per_min[0]}–${direction.pace_band.shots_per_min[1]} shots per minute, motion ≥ ${direction.pace_band.motion_per_s_min} per second, nothing still longer than ${direction.pace_band.still_time_max} s.`);
  out.push(`- Camera: ${direction.camera}.`);
  out.push(`- Signature move: ${direction.signature_move}.`);
  if (direction.motion_grammar) out.push(`- ${direction.motion_grammar}`);
  out.push(`- Music: ${direction.music.track}${direction.music.bpm ? `, ${direction.music.bpm} bpm` : ''}${direction.music.switches_at.length ? `, switches at ${direction.music.switches_at.join(', ')} s` : ''}.`);
  out.push('');
  if (direction.composition_rules.length) {
    out.push('## Composition rules');
    out.push('');
    for (const r of direction.composition_rules) out.push(`- ${r}`);
    out.push('');
  }
  out.push('## Negative list');
  out.push('');
  if (direction.banned.length) for (const b of direction.banned) out.push(`- ${b}`);
  else out.push('- (nothing banned)');
  out.push('');
  out.push('## Direction settings');
  out.push('');
  out.push(Object.entries(direction.dials).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ') + (direction.video_style ? ` · video style: ${direction.video_style}` : ''));
  return out.join('\n').replace(/\n+$/, '');
}

/**
 * Validate, then write STORYBOARD.md and frame.md into outDir.
 * @returns {{ ok: boolean, problems: import('./validate.mjs').Problem[], files: string[] }}
 */
export function generate(input, outDir) {
  const result = validatePlan(input);
  if (!result.ok) return { ok: false, problems: result.problems, files: [] };
  fs.mkdirSync(outDir, { recursive: true });
  const sb = path.join(outDir, 'STORYBOARD.md');
  const fr = path.join(outDir, 'frame.md');
  fs.writeFileSync(sb, renderStoryboard(result.plan) + '\n');
  fs.writeFileSync(fr, renderFrame(result.plan) + '\n');
  return { ok: true, problems: result.problems, files: [sb, fr] };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [file, outDir] = process.argv.slice(2);
  if (!file || !outDir) {
    console.error('usage: node plan/to-storyboard.mjs <plan.json> <out-dir>');
    process.exit(2);
  }
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = generate(input, outDir);
  if (!r.ok) {
    console.log(formatReport(r.problems));
    console.log('FAIL: the plan does not validate; nothing written');
    process.exit(1);
  }
  const notes = r.problems.filter((p) => p.level === 'warning');
  if (notes.length) console.log(formatReport(notes));
  console.log(`wrote ${r.files.join(' and ')}`);
}
