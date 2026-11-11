// Render the whole video once, after every scene and join has passed: assemble index.html from the plan
// (CSS transitions unless ULTRADEMO_SHADERS=1), render it, mix the music bed, and save a still at every join.
// Usage: node plan/production/whole.mjs <project-dir>
import fs from 'node:fs';
import path from 'node:path';
import { assembleIndex } from './assemble.mjs';
import { buildCaptions } from '../captions/captions.mjs';
import { renderProject } from './render.mjs';
import { mixAudio, musicFor, sceneCues } from './audio.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(process.argv[2]);
const plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'));
let t = 0;
const scenes = plan.scenes.map((s) => { const n = { ...s, start_s: t }; t = Math.round((t + s.duration_s) * 1000) / 1000; return n; });
const full = { ...plan, scenes };
const music = musicFor(plan.direction, projectDir);
if (music?.abs && !music.own) { fs.mkdirSync(path.join(projectDir, 'assets', 'music'), { recursive: true }); fs.copyFileSync(music.abs, path.join(projectDir, 'assets', 'music', music.file)); }
// D-94: word timings, the caption files and (when the brief chose a style) the burned-in captions layer
try {
  const cap = await buildCaptions(projectDir, full);
  console.log(cap.files ? `captions: ${cap.cues} caption(s) (${cap.timing} timings) in out/captions.srt and .vtt${cap.layer ? `; burned in as ${cap.style}` : ''}` : `captions: none (${cap.reason})`);
} catch (e) { console.log(`captions: not made (${e.message})`); }
const a = assembleIndex({ plan: full, projectDir, voices: [], music: null });
console.log(`assembled ${a.clips.length} scenes, ${a.boundaries.length} overlapping transition(s), ${a.total} s`);
const outDir = path.join(projectDir, 'out');
fs.mkdirSync(outDir, { recursive: true });
const silent = path.join(outDir, 'video-render.mp4');
const t0 = Date.now();
const r = renderProject(projectDir, silent, { fps: plan.video.fps, workers: 'auto' });
console.log(`render ${r.ok ? 'ok' : 'FAILED'} in ${Math.round((Date.now() - t0) / 1000)} s`);
if (!r.ok) process.exit(1);
// the narration (production/voice/voices.json from voiceover.mjs) and the sound-effect cues of every scene
const voicesFile = path.join(projectDir, 'production', 'voice', 'voices.json');
const voices = fs.existsSync(voicesFile) ? JSON.parse(fs.readFileSync(voicesFile, 'utf8')).lines.map((v) => ({ ...v, path: path.join(projectDir, v.path) })) : [];
const sfx = sceneCues(projectDir, scenes);
console.log(`narration: ${voices.length} line(s); sound effects: ${sfx.length} cue(s)`);
// keep the previous cut: out/versions/video-<when it was rendered>.mp4 (a review compares cuts; a render never destroys one)
const prev = path.join(outDir, 'video.mp4');
if (fs.existsSync(prev)) {
  const when = new Date(fs.statSync(prev).mtimeMs).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  fs.mkdirSync(path.join(outDir, 'versions'), { recursive: true });
  fs.renameSync(prev, path.join(outDir, 'versions', `video-${when}.mp4`));
}
const stems = path.join(projectDir, 'production', 'look', 'stems');
// D-82: a vertical version (<project>/vertical/) takes the landscape video's soundtrack as it is, so the narration, music
// and effects match to the frame and nothing is generated twice; the result is also copied to the landscape project's
// out/video-vertical.mp4, where the review page shows it beside the landscape cut
const verticalOf = plan.video.intake?.vertical_of ? path.dirname(projectDir) : null;
if (verticalOf) {
  const soundtrack = path.join(verticalOf, 'out', 'video.mp4');
  if (!fs.existsSync(soundtrack)) { console.error(`no landscape video at ${soundtrack}: render it first (scene.mjs whole ${verticalOf})`); process.exit(1); }
  const m = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-i', soundtrack, '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'copy', '-c:a', 'copy', '-shortest', path.join(outDir, 'video.mp4')], { encoding: 'utf8' });
  if (m.status !== 0) { console.error(`could not add the soundtrack: ${m.stderr}`); process.exit(1); }
  fs.copyFileSync(path.join(outDir, 'video.mp4'), path.join(verticalOf, 'out', 'video-vertical.mp4'));
  console.log(`soundtrack: from ${soundtrack}; copied to ${path.join(verticalOf, 'out', 'video-vertical.mp4')}`);
}
// D-82: a social cut (<project>/cut-<n>/) is mixed as usual (music and effects, no narration) and copied beside the video
const mix = verticalOf ? { ok: true, measured: { lufs: 'as the landscape video' } } : mixAudio({ video: silent, out: path.join(outDir, 'video.mp4'), duration: a.total, music: music?.abs ? music : null, voices, sfx, stems: sfx.length ? stems : null }); // music: the whole track record, loop points and level (gain_db) too
// is every effect heard? its peak against the music and voice under it (pre-master): less than 6 dB above them (3 dB while
// the voice speaks, when the effects dip so the words stay clear), it is buried
if (!verticalOf && sfx.length && fs.existsSync(path.join(stems, 'effects.wav'))) {
  const stat = (f, a, b) => { const o = spawnSync('ffmpeg', ['-nostats', '-i', f, '-af', `atrim=${a}:${b},astats=metadata=0`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr; const g = (re) => Number((o.match(re) || [])[1]); return { peak: g(/Peak level dB:\s*(-?[\d.]+)/), rms: g(/RMS level dB:\s*(-?[\d.]+)/) }; };
  const rows = sfx.filter((c) => c.id !== 'tick' && !c.background).map((c) => {
    const w = Math.min(c.dur || 0.3, 0.5);
    const fx = stat(path.join(stems, 'effects.wav'), c.at, c.at + w), bed = stat(path.join(stems, 'music-voice.wav'), c.at, c.at + w);
    const voiced = voices.some((v) => c.at < v.start_s + v.secs && c.at + w > v.start_s);
    return { scene: c.scene, sfx: c.id, at: c.at, voiced, fx_peak: fx.peak, under_rms: bed.rms, margin_db: Math.round((fx.peak - bed.rms) * 10) / 10 };
  });
  const buried = rows.filter((r) => !(r.margin_db >= (r.voiced ? 3 : 6)));
  fs.writeFileSync(path.join(projectDir, 'production', 'look', 'sfx.json'), JSON.stringify(rows, null, 1));
  console.log(buried.length ? `effects buried under the music and voice (peak less than 6 dB above them, 3 dB under the voice):\n${buried.map((r) => `- ${r.scene} ${r.sfx} at ${r.at.toFixed(2)} s: ${r.margin_db} dB`).join('\n')}` : `every effect is heard: 6 dB or more above the music, 3 dB or more while the voice speaks`);
}
if (verticalOf) console.log('mix: the landscape video\'s soundtrack, as it is');
else console.log(mix.ok ? `mix: ${mix.measured?.lufs ?? '?'} LUFS, true peak ${mix.measured?.true_peak_dbtp ?? '?'} dBTP (${music?.file || 'no music'})` : `mix: ${mix.reason}`);
if (!mix.ok) fs.copyFileSync(silent, path.join(outDir, 'video.mp4'));
// a sheet of stills either side of every join
const joins = scenes.slice(1).map((s) => s.start_s);
const [fw, fh] = String(plan.video.format || '1920x1080').split('x').map(Number);
const vertSheet = fh > fw;
const dir = path.join(outDir, 'joins'); fs.mkdirSync(dir, { recursive: true });
const files = [];
for (const j of joins) for (const d of [-0.15, 0.15]) { const f = path.join(dir, `j${String(Math.round((j + d) * 100)).padStart(5, '0')}.png`); spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, j + d)), '-i', path.join(outDir, 'video.mp4'), '-frames:v', '1', '-vf', vertSheet ? 'scale=270:-2' : 'scale=480:-2', f]); files.push(f); }
const list = path.join(dir, 'list.txt'); fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n') + '\n');
spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', vertSheet ? 'pad=278:488:4:4:color=#333333,tile=8x3' : 'pad=488:278:4:4:color=#333333,tile=4x6', '-frames:v', '1', path.join(outDir, 'joins.jpg')]);
// D-82: the thumbnail in every size, with a real frame for "a moment from the video" (the landscape project makes them,
// in 1080×1920 too when there is a vertical version; a vertical version or a cut does not)
if (!verticalOf && !plan.video.intake?.cut_of) {
  const th = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'thumbnail', 'render.mjs'), projectDir], { encoding: 'utf8' });
  console.log(th.status === 0 ? th.stdout.trim() : `thumbnails: not made (${(th.stderr || '').trim().split('\n')[0]})`);
}
const cutOf = plan.video.intake?.cut_of ? path.dirname(projectDir) : null;
if (cutOf) { fs.copyFileSync(path.join(outDir, 'video.mp4'), path.join(cutOf, 'out', `${path.basename(projectDir)}.mp4`)); console.log(`copied to ${path.join(cutOf, 'out', `${path.basename(projectDir)}.mp4`)}`); }
console.log(path.join(outDir, 'video.mp4'));
