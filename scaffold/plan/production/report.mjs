// report.mjs — out/report.md: what was built, the checks per scene, cost and
// wall time against the D-62 working targets, and what the review page shows
// next. Plain words (D-55, D-64); the output is a video, never a film (D-37).

const fmtS = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s * 10) / 10} s`);

/** The D-62 working target for a first draft, by length. */
export function draftTarget(lengthS) {
  if (lengthS <= 30) return { seconds: 8 * 60, label: 'under 8 minutes for a 20–30 s video' };
  if (lengthS <= 60) return { seconds: 15 * 60, label: 'under 15 minutes for a 45–60 s video' };
  return { seconds: 15 * 60 + (lengthS - 60) * 15, label: `about ${Math.round((15 * 60 + (lengthS - 60) * 15) / 60)} minutes for a ${lengthS} s video (extrapolated from D-62)` };
}

/**
 * @param {object} args { plan, checks, cost, timings: {steps: {name: seconds}, wall_s}, kit: {files, repaired}, builds: [{id, ok, repaired, calls, seconds, problems}], assembled, mix, voices, stoppedAtCap, only }
 */
export function reportMarkdown({ plan, checks, cost, timings, kit, builds = [], assembled = null, mix = null, voices = [], stoppedAtCap = false, only = null, rounds = [] }) {
  const { video, direction } = plan;
  const target = draftTarget(video.length_s);
  const L = [];
  L.push(`# Production report — ${video.product} ${video.template.replace(/-/g, ' ')} video (${video.length_s} s)`);
  L.push('');
  L.push(`Status: ${stoppedAtCap ? `stopped at the cost cap of $${cost.cap_usd.toFixed(2)} after $${cost.total_usd.toFixed(4)}; what was built is below` : only ? `scene ${only} rebuilt (scoped revision)` : 'first draft built'} on ${new Date().toISOString().slice(0, 16).replace('T', ' ')}. Direction "${direction.name}" (${direction.chosen}), ${direction.canvas} canvas, ${video.narration}. Model ${cost.model || ''}.`);
  L.push('');
  L.push('## What was built');
  L.push('');
  if (kit) L.push(`- The kit (designer pass${kit.repaired ? ', one repair' : ''}): kit/tokens.css, kit/components.css, kit/components.html, kit/README.md${kit.parts ? ` — ${kit.parts}` : ''}.`);
  const ok = builds.filter((b) => b.ok).length;
  L.push(`- Frames: ${ok} of ${builds.length} built (${builds.filter((b) => b.repaired).length} needed a repair call); compositions/frames/<id>.html.`);
  for (const b of builds.filter((x) => !x.ok)) L.push(`  - ${b.id} failed: ${b.problems[0]?.split('\n')[0] || 'unknown'}`);
  if (assembled) L.push(`- index.html: ${assembled.clips.length} scenes, ${assembled.boundaries.length} transition(s) (${[...new Set(assembled.boundaries.map((b) => b.shader ? `${b.kind} as the ${b.shader} shader` : b.kind))].join(', ') || 'cuts only'}) with ${assembled.overlap} s overlap; ${assembled.shaderCount ? `${assembled.shaderCount} through @hyperframes/shader-transitions, the rest CSS` : assembled.shader ? 'CSS transitions (the shader package is installed but not used for these boundaries)' : 'CSS transitions (the shader package is not installed)'}.`);
  if (voices.length) L.push(`- Narration: ${voices.filter((v) => v.path).length} of ${voices.length} lines generated and placed per scene.`);
  if (mix) L.push(`- Sound: ${mix.ok ? `${mix.music ? `music bed ${mix.music.file} from ${mix.music.usable_from_s} s` : 'no bed'}${mix.voices ? `, ducked under ${mix.voices} voice line(s)` : ''}, mastered to ${mix.target_lufs} LUFS (${mix.two_pass ? 'two passes' : 'one pass'}); measured ${mix.measured?.lufs ?? '?'} LUFS, true peak ${mix.measured?.true_peak_dbtp ?? '?'} dBTP` : mix.reason}.`);
  if (checks?.video?.rendered) L.push(`- Renders: out/video.mp4 (${checks.video.frames} frames, ${checks.video.duration} s), out/scenes/<id>.mp4 per scene, event-frame stills in out/stills/, out/sheet.jpg.`);
  else L.push('- Renders: the whole video did not render; see out/checks.md.');
  L.push('');
  L.push('## The whole video, measured');
  L.push('');
  if (checks?.video?.rendered) {
    L.push('| Measure | Value | Target |');
    L.push('|---|---|---|');
    L.push(`| Motion per second | ${checks.video.motion_per_s} | at least ${checks.targets.motion_per_s_min} |`);
    L.push(`| Still time | ${Math.round(checks.video.still_time * 100)}% | ${Math.round(checks.targets.still_time_max * 100)}% |`);
    L.push(`| Longest still | ${checks.video.longest_still_s} s | under ${checks.targets.longest_still_s_max} s |`);
    L.push(`| Shots per minute | ${checks.video.shots_per_min} | ${checks.targets.shots_per_min.join('–')} |`);
    L.push(`| Loudness | ${checks.video.loudness ? `${checks.video.loudness.lufs} LUFS, peak ${checks.video.loudness.true_peak_dbtp} dBTP` : 'no audio'} | ${checks.targets.lufs} LUFS, peak under ${checks.targets.true_peak_max} dBTP |`);
    L.push('');
    L.push(`Targets from ${checks.targets.source}.`);
  }
  L.push('');
  L.push('## Scenes');
  L.push('');
  L.push('| Scene | Status | Motion/s | Still | Longest still | Copy on frame 0 | Copy through its reading time | Inside the canvas | Numbers | What continues | Composition | Build |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of checks?.scenes || []) {
    const m = s.measured;
    const b = builds.find((x) => x.id === s.id);
    const yn = (v) => (v === true ? 'yes' : v === false ? 'no' : v === 'unchecked' ? 'by eye' : '—');
    L.push(`| ${s.id} ${s.name} | ${s.status === 'built' ? 'built' : `fix: ${s.reason}`} | ${m.motion_per_s ?? '—'} | ${m.still_time !== undefined ? `${Math.round(m.still_time * 100)}%` : '—'} | ${m.longest_still_s ?? '—'} s | ${yn(m.frame0_copy)} | ${yn(m.copy_through_reads)} | ${yn(m.overlays_inside)} | ${yn(m.numbers_ok)} | ${yn(m.carry_present)} | ${m.composition_ok === undefined ? '—' : m.composition_ok ? 'ok' : `${m.composition_failures ?? ''} problem(s)`} | ${b ? `${b.calls} call(s), ${fmtS(b.seconds)}${b.repaired ? ', repaired' : ''}${b.fixed ? ', rebuilt in the fix round' : ''}` : '—'} |`);
  }
  L.push('');
  L.push(`${checks?.summary?.built ?? 0} built, ${checks?.summary?.fix ?? 0} to fix. The full list of checks per scene is in out/checks.md.`);
  L.push('');
  if (rounds.length) {
    L.push('## Rounds');
    L.push('');
    L.push(rounds.length > 1 ? `Round 1 checked every scene; round 2 rebuilt each scene with a hard failure once (its failures and stills in the prompt), re-rendered it and checked everything again. At most two rounds per scene. Round 1's full checks are in out/checks-round1.md.` : 'One round: no scene had a hard failure the fix round could address, or the fix round was off.');
    L.push('');
    const r1 = rounds[0], r2 = rounds[1] || null;
    L.push(`| Scene | Round 1 | ${r2 ? 'Round 2 |' : ''}`);
    L.push(`|---|---|${r2 ? '---|' : ''}`);
    for (const s1 of r1.scenes) {
      const s2 = r2?.scenes.find((x) => x.id === s1.id);
      const skip = r2?.not_rebuilt?.find((x) => x.id === s1.id);
      const cell = (x) => (x.status === 'built' ? 'built' : `fix: ${x.reason}`);
      L.push(`| ${s1.id} | ${cell(s1)} | ${r2 ? `${r2.rebuilt?.includes(s1.id) ? 'rebuilt → ' : skip ? `not rebuilt (${skip.why}) → ` : ''}${s2 ? cell(s2) : '—'} |` : ''}`);
    }
    if (r2?.video && r1.video) { L.push(''); L.push(`The whole video: motion per second ${r1.video.motion_per_s} → ${r2.video.motion_per_s}, still time ${Math.round(r1.video.still_time * 100)}% → ${Math.round(r2.video.still_time * 100)}%, longest still ${r1.video.longest_still_s} s → ${r2.video.longest_still_s} s.`); }
    L.push('');
  }
  L.push('## Cost and time');
  L.push('');
  const steps = timings?.steps || {};
  L.push(`Wall time ${fmtS(timings?.wall_s ?? 0)} against the D-62 working target of ${target.label}${timings?.wall_s > target.seconds ? ` — over by ${fmtS(timings.wall_s - target.seconds)}` : ' — within it'}. D-62 is provisional: a working figure, not a gate.`);
  L.push('');
  L.push('| Step | Wall time | Model cost |');
  L.push('|---|---|---|');
  for (const [name, sec] of Object.entries(steps)) {
    const c = (cost.calls || []).filter((x) => x.step === name).reduce((a, x) => a + (x.cost_usd || 0), 0);
    L.push(`| ${name} | ${fmtS(sec)} | ${c ? `$${c.toFixed(4)}` : '—'} |`);
  }
  L.push(`| total | ${fmtS(timings?.wall_s ?? 0)} | $${cost.total_usd.toFixed(4)} of a $${cost.cap_usd.toFixed(2)} cap (${cost.input_tokens} in / ${cost.output_tokens} out tokens, ${(cost.calls || []).length} calls) |`);
  if ((cost.calls || []).some((c) => c.replayed)) L.push('');
  if ((cost.calls || []).some((c) => c.replayed)) L.push(`Replayed from a recording: the recorded calls cost $${(cost.calls || []).reduce((a, c) => a + (c.recorded_cost_usd || 0), 0).toFixed(4)} and took ${fmtS((cost.calls || []).reduce((a, c) => a + (c.recorded_seconds || 0), 0))} of model time when they were made.`);
  L.push('');
  L.push('## What the review page shows next');
  L.push('');
  L.push('The whole video, then every scene playable on its own with its measured numbers beside it (motion per second, still time, longest still, words per second), its event-frame stills, the self QA lines above, what continues into the next scene, and the facts the scene relies on. Verdicts per scene: ok, ok with a note, or fix; a fix re-renders that scene only (`node plan/production/run.mjs <project> --only <scene-id>`). Approved scenes go to the library (D-46).');
  L.push('');
  return L.join('\n');
}
