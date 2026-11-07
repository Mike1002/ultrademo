// audio.mjs — narration and the music bed.
//
// Narration (video.narration voice or hybrid): each scene's voice line is
// generated per sentence with the chosen voice through scaffold/tts
// (synthesizeUnits chunks by sentence, caches, aligns with faster-whisper for
// word timings when the align environment exists, audits and joins), placed
// at the scene's start. The music bed starts at the track's usable-from
// offset (direction.music.usable_from_s, else scaffold/music/curated.json), fades in and out, ducks under the
// voice with a sidechain compressor, and the programme is mastered to
// -14 LUFS with a -1 dBTP true-peak limit in two loudnorm passes (the v1
// renderer's chain, retargeted from -16 to -14 and given the offset).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, SCAFFOLD } from './craft.mjs';

export const MIX_TARGET_LUFS = -14;
export const TRUE_PEAK_DBTP = -1.0;
const CURATED = path.join(SCAFFOLD, 'music', 'curated.json');
const MUSIC_DIR = path.join(SCAFFOLD, 'music');

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const r3 = (n) => Math.round(n * 1000) / 1000;

/** The music track the direction names: { file, title, usable_from_s, abs } or null. */
export function musicFor(direction, projectDir = null) {
  // the user's own track, kept in the project (project:assets/music/own-<name>.<ext>)
  const own = String(direction.music?.track || '').match(/^project:(assets\/music\/own-[a-z0-9-]+\.(?:mp3|wav|m4a|ogg|aac|flac))/i);
  if (own) {
    const abs = projectDir ? path.join(projectDir, own[1]) : null;
    return { file: path.basename(own[1]), title: String(direction.music.track).replace(/^\S+\s*\(?/, '').replace(/,.*$/, '') || 'Your track', usable_from_s: Number(direction.music.usable_from_s) || 0, abs: abs && fs.existsSync(abs) ? abs : null, own: true };
  }
  // a library track: a plain file name in music/ (no folders, no '..'), so a plan can never point outside the library
  const m = String(direction.music?.track || '').match(/^(?:music\/)?([A-Za-z0-9][\w.-]*\.(?:mp3|ogg|wav|m4a))(?=[\s(]|$)/i);
  if (!m) return null;
  const file = m[1];
  if (file.includes('..')) return null;
  const curated = fs.existsSync(CURATED) ? (JSON.parse(fs.readFileSync(CURATED, 'utf8')).tracks || []) : [];
  const entry = curated.find((t) => t.file === file) || {};
  // the plan's own field first (direction.music.usable_from_s), then the "bed starts at N s" note older plans carry, then curated.json
  const fromTrack = String(direction.music.track).match(/bed starts at (\d+(?:\.\d+)?)\s*s/);
  const usable_from_s = typeof direction.music.usable_from_s === 'number' ? direction.music.usable_from_s : fromTrack ? Number(fromTrack[1]) : Number(entry.usable_from_s || 0);
  const abs = path.join(MUSIC_DIR, file);
  return { file, title: entry.title || file, usable_from_s, abs: fs.existsSync(abs) ? abs : null, gain_db: Number.isFinite(Number(entry.gain_db)) ? Math.max(-12, Math.min(12, Number(entry.gain_db))) : 0, loop: entry.loop && entry.loop.end_s > entry.loop.start_s ? { start_s: Number(entry.loop.start_s), end_s: Number(entry.loop.end_s) } : null };
}

/** The library's credits (music/ATTRIBUTION.md): file → { title, creator, source, licence, licence_url }. */
export function musicAttributions(file = path.join(MUSIC_DIR, 'ATTRIBUTION.md')) {
  const out = {};
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of text.split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if (c.length < 7 || !/\.(mp3|ogg|wav|m4a)$/i.test(c[1])) continue;
    const lic = c[5].match(/^(.*?)\s*\((https?:\/\/[^)]+)\)\s*$/);
    out[c[1]] = { title: c[2], creator: c[3], source: c[4], licence: (lic ? lic[1] : c[5]).trim(), licence_url: lic ? lic[2] : '' };
  }
  return out;
}

/** The credit line a video's music asks for, or null: CC0 tracks and the user's own track need none. */
export function musicCredit(projectDir) {
  let plan = {};
  try { plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8')); } catch { return null; }
  if (!plan.direction) return null;
  const m = musicFor(plan.direction, projectDir);
  if (!m || m.own) return null;
  const a = musicAttributions()[m.file];
  if (!a || !/\bBY\b/.test(a.licence) || /CC0/i.test(a.licence)) return null;
  const licence = /^CC\b/.test(a.licence) ? a.licence : `CC ${a.licence}`;
  return { ...a, licence, text: `Music: "${a.title}" by ${a.creator} (${a.source}), licensed under ${licence}${a.licence_url ? ` (${a.licence_url})` : ''}` };
}

/** The voice spec for the direction's voice choice (pocket:<name>, chatterbox:default, elevenlabs[:id], say). */
export function voiceSpec(direction) {
  if (process.env.ULTRADEMO_VOICE) return process.env.ULTRADEMO_VOICE;
  const v = direction.voice || {};
  if (!v.tier || v.tier === 'none') return null;
  if (v.voice && v.voice.includes(':')) return v.voice;
  if (v.tier === 'expressive' || v.tier === 'presenter') return v.voice ? `chatterbox:clone=${v.voice}` : 'chatterbox:default';
  return `pocket:${(v.voice || 'eve').toLowerCase()}`;
}

/**
 * Narrate every scene with a voice line. Returns [{ id, path (project-relative mp3), start_s, secs, words, flags }].
 * `provider` may be injected (tests); otherwise resolved from the voice spec.
 */
export async function narrate({ plan, projectDir, provider = null, log = () => {} }) {
  const { video, direction, scenes } = plan;
  if (!['voice', 'hybrid'].includes(video.narration)) return [];
  const units = scenes.filter((s) => s.voice.trim()).map((s) => ({ id: s.id, text: s.voice.trim() }));
  if (!units.length) return [];
  const spec = voiceSpec(direction);
  if (!provider) {
    if (!spec) throw new Error('The video is narrated but the direction names no voice; set direction.voice or ULTRADEMO_VOICE');
    const { resolveProvider } = await import(path.join(SCAFFOLD, 'tts', 'providers.mjs'));
    provider = resolveProvider(spec);
    if (provider.ready && !provider.ready()) throw new Error(`${provider.label} is not set up yet. Run: ${provider.setupHint}`);
  }
  const { synthesizeUnits } = await import(path.join(SCAFFOLD, 'tts', 'narration.mjs'));
  const outDir = path.join(projectDir, 'assets', 'voice');
  fs.mkdirSync(outDir, { recursive: true });
  log(`narration: ${units.length} line(s) with ${provider.label || provider.id}`);
  const results = await synthesizeUnits(provider, units, { cacheDir: path.join(projectDir, 'production', 'voice-cache'), outDir, log: (m) => log(`  ${m}`), force: new Set(), onEngine: () => {} });
  const out = [];
  for (const s of scenes) {
    const r = results.get(s.id);
    if (!r) continue;
    if (!r.ok) { out.push({ id: s.id, path: null, start_s: s.start_s, secs: 0, words: null, flags: [r.error || 'failed'] }); continue; }
    const mp3 = path.join(outDir, `${s.id}.mp3`);
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', r.audio, '-codec:a', 'libmp3lame', '-q:a', '3', mp3]);
    const lead = (s.cue || []).find((c) => /voice|say|speak|line/i.test(c.what))?.at_s ?? 0.15;
    if (r.words) fs.writeFileSync(`${mp3}.words.json`, JSON.stringify(r.words));
    out.push({ id: s.id, path: `assets/voice/${s.id}.mp3`, start_s: r3(s.start_s + lead), secs: r.secs, words: r.words || null, flags: r.flags || [], over: r.secs + lead > s.duration_s ? r3(r.secs + lead - s.duration_s) : 0 });
  }
  return out;
}

/** Integrated loudness and true peak of a file's audio: { lufs, true_peak_dbtp, lra } or null. */
export function measureLoudness(file) {
  const r = run('ffmpeg', ['-nostats', '-i', file, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']);
  const i = r.out.match(/I:\s*(-?[\d.]+)\s*LUFS/g);
  const lra = r.out.match(/LRA:\s*([\d.]+)\s*LU/g);
  const tp = r.out.match(/Peak:\s*(-?[\d.]+)\s*dBFS/g);
  if (!i) return null;
  const last = (arr) => Number(arr[arr.length - 1].match(/-?[\d.]+/)[0]);
  return { lufs: last(i), lra: lra ? last(lra) : null, true_peak_dbtp: tp ? last(tp) : null };
}

/**
 * Mix the bed and the voices under the rendered video, master to -14 LUFS.
 * Writes `out` (video copied, audio AAC). Returns the mix record.
 * @param {object} args { video, out, duration, music: {abs, usable_from_s, volume?}, voices: [{path(abs), start_s}] }
 */
const LOOP_XFADE = 0.06;
const trackLength = (f) => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return Number(r.stdout) || 0; };

/** The music bed's filter, from usable_from_s. When the video runs longer than the track, a track with loop points
 * (curated.json `loop`, cut on the beat) repeats from start_s to end_s, with a short crossfade at each join so no repeat
 * has a gap or a click; a track without them repeats whole, as before. */
export function bedFilter(input, music, dur, vol, fadeIn, fadeOut, length = trackLength(music.abs)) {
  vol = r3(vol * 10 ** ((Number(music.gain_db) || 0) / 20)); // the track's own level, brought to -13 LUFS (curated.json gain_db)
  const from = r3(music.usable_from_s || 0);
  const tail = `atrim=0:${dur},asetpts=N/SR/TB,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(3)}:d=${fadeOut},volume=${vol}[bed]`;
  const L = music.loop;
  const ok = L && L.end_s > L.start_s + 1 && L.end_s <= (length || Infinity) + 0.01 && from < L.end_s;
  if (!ok || length - from >= dur) return [`${input}atrim=start=${from},asetpts=N/SR/TB,aloop=loop=-1:size=2147483647,${tail}`];
  const seg = L.end_s - L.start_s;
  const repeats = Math.min(80, Math.ceil(Math.max(0, dur - (L.end_s - from)) / (seg - LOOP_XFADE)) + 1);
  const parts = [`${input}asplit=${repeats + 1}${Array.from({ length: repeats + 1 }, (_, k) => `[m${k}]`).join('')}`,
    `[m0]atrim=start=${from}:end=${r3(L.end_s)},asetpts=PTS-STARTPTS[p0]`];
  for (let k = 1; k <= repeats; k++) parts.push(`[m${k}]atrim=start=${r3(L.start_s)}:end=${r3(L.end_s)},asetpts=PTS-STARTPTS[p${k}]`);
  let last = 'p0';
  for (let k = 1; k <= repeats; k++) { parts.push(`[${last}][p${k}]acrossfade=d=${LOOP_XFADE}:c1=tri:c2=tri[x${k}]`); last = `x${k}`; }
  parts.push(`[${last}]${tail}`);
  return parts;
}

export function mixAudio({ video, out, duration, music = null, voices = [], sfx = [], sfxLevel = 0.7, stems = null, volume = null, fadeIn = 1.2, fadeOut = 2.0 }) {
  const dur = r3(duration);
  const inputs = ['-i', video];
  const filters = [];
  const voiceInputs = voices.filter((v) => v.path && fs.existsSync(v.path));
  let idx = 1;
  let bedLabel = null, voiceLabel = null;
  if (music?.abs && fs.existsSync(music.abs)) {
    inputs.push('-i', music.abs);
    const vol = volume ?? music.volume ?? (voiceInputs.length ? 0.35 : 0.9);
    filters.push(...bedFilter(`[${idx}:a]`, music, dur, vol, fadeIn, fadeOut));
    bedLabel = '[bed]';
    idx++;
  }
  if (voiceInputs.length) {
    const labels = [];
    voiceInputs.forEach((v, k) => {
      inputs.push('-i', v.path);
      filters.push(`[${idx}:a]aresample=48000,adelay=${Math.round(v.start_s * 1000)}:all=1[v${k}]`);
      labels.push(`[v${k}]`);
      idx++;
    });
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,atrim=0:${dur},apad=whole_dur=${dur}[voice0]`);
    voiceLabel = '[voice0]';
  }
  const sfxInputs = sfx.filter((c) => c.abs && fs.existsSync(c.abs));
  let mix;
  if (bedLabel && voiceLabel) {
    // the voice keys the compressor on the bed, then rides on top of the ducked bed (and keys the effects, below)
    filters.push(`${voiceLabel}asplit=${sfxInputs.length ? 3 : 2}[voiceA][voiceB]${sfxInputs.length ? '[voiceC]' : ''}`);
    filters.push(`${bedLabel}[voiceA]sidechaincompress=threshold=0.02:ratio=4:attack=60:release=900:makeup=1[ducked]`);
    filters.push(`[ducked][voiceB]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`);
    mix = '[mix]';
  } else if (bedLabel) mix = bedLabel;
  else if (voiceLabel && sfxInputs.length) { filters.push(`${voiceLabel}asplit=2[voiceM][voiceC]`); mix = '[voiceM]'; }
  else if (voiceLabel) mix = voiceLabel;
  else return { ok: false, reason: 'no music and no narration; the video stays silent', lufs: null };
  // sound effects: each cue delayed to its time, summed on their own bus, laid over the ducked bed and the voice.
  // sfxLevel 0.7 (about -3 dB): a pop or click peaks 6 dB or more above the music under it, so it is heard. While the voice
  // speaks, the effects dip about 4 dB so they never mask a word (louder effects made a brand name mishear in the
  // transcript). whole.mjs reports any cue that is buried.
  if (sfxInputs.length) {
    const labels = [];
    sfxInputs.forEach((c, k) => {
      inputs.push('-i', c.abs);
      // dur: play only the first dur seconds (a typing take cut to the typing), with a short fade
      const cut = c.dur ? `atrim=0:${r3(c.dur)},afade=t=out:st=${Math.max(0, r3(c.dur - 0.06))}:d=0.06,` : '';
      // background: thinner and a little roomy, like a recording played back, not a sound in the scene
      const far = c.background ? 'highpass=f=380,lowpass=f=2600,aecho=0.8:0.5:38:0.22,' : '';
      filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=mono,${far}${cut}volume=${((c.gain ?? 1) * sfxLevel).toFixed(3)},adelay=${Math.round(c.at * 1000)}:all=1[s${k}]`);
      labels.push(`[s${k}]`);
      idx++;
    });
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,atrim=0:${dur},apad=whole_dur=${dur}[sfxraw]`);
    if (voiceLabel) filters.push(`[sfxraw][voiceC]sidechaincompress=threshold=0.06:ratio=2:attack=5:release=250:makeup=1[sfxbus]`);
    else filters.push('[sfxraw]anull[sfxbus]');
    // stems: the music and voice mix and the effects bus before mastering, for checking that every effect is heard
    if (stems) {
      fs.mkdirSync(stems, { recursive: true });
      run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', mix, '-ac', '1', path.join(stems, 'music-voice.wav'), '-map', '[sfxbus]', '-ac', '1', path.join(stems, 'effects.wav')]);
    }
    filters.push(`${mix}[sfxbus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[withsfx]`);
    mix = '[withsfx]';
  }
  // pass 1: measure
  const measure = run('ffmpeg', ['-y', '-nostats', ...inputs, '-filter_complex', `${filters.join(';')};${mix}loudnorm=I=${MIX_TARGET_LUFS}:TP=${TRUE_PEAK_DBTP}:LRA=11:print_format=json[out]`, '-map', '[out]', '-f', 'null', '-']);
  let measured = null;
  try {
    const i = measure.out.lastIndexOf('{');
    const j = measure.out.indexOf('}', i);
    measured = i >= 0 && j > i ? JSON.parse(measure.out.slice(i, j + 1)) : null;
  } catch { measured = null; }
  const ln = measured && Number.isFinite(Number(measured.input_i))
    ? `loudnorm=I=${MIX_TARGET_LUFS}:TP=${TRUE_PEAK_DBTP}:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
    : `loudnorm=I=${MIX_TARGET_LUFS}:TP=${TRUE_PEAK_DBTP}:LRA=11`;
  // loudnorm's own true-peak ceiling is loose in linear mode; a limiter after it holds the -1 dBTP line. It runs at 4x the
  // sample rate so the peaks between samples (sharp effect transients, then the AAC encode) stay under the line too.
  const r = run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${filters.join(';')};${mix}${ln},aresample=192000,alimiter=limit=${Math.pow(10, (TRUE_PEAK_DBTP - 1.5) / 20).toFixed(4)}:attack=1:release=60:level=false,aresample=48000[out]`, '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', out]);
  if (r.code !== 0 || !fs.existsSync(out)) return { ok: false, reason: `ffmpeg mix failed: ${r.out.slice(-600)}`, lufs: null };
  const final = measureLoudness(out);
  return { ok: true, target_lufs: MIX_TARGET_LUFS, true_peak_limit_dbtp: TRUE_PEAK_DBTP, measured: final, music: music ? { file: path.basename(music.abs || ''), usable_from_s: music.usable_from_s || 0 } : null, voices: voiceInputs.length, sfx: sfxInputs.length, two_pass: Boolean(measured) };
}

/**
 * The sound-effect cues of every scene (production/scenes/<id>.cues.json) placed on the video's timeline, each resolved to
 * a file: the project's own sfx/<id>.wav first, then scaffold/sfx/library.json. scenes carry their start_s.
 */
export function sceneCues(projectDir, scenes, log = console.log) {
  const SFX_DIR = path.join(SCAFFOLD, 'sfx');
  const library = fs.existsSync(path.join(SFX_DIR, 'library.json')) ? JSON.parse(fs.readFileSync(path.join(SFX_DIR, 'library.json'), 'utf8')).sounds : [];
  const sfx = [];
  for (const s of scenes) {
    const f = path.join(projectDir, 'production', 'scenes', `${s.id}.cues.json`);
    if (!fs.existsSync(f)) continue;
    for (const c of JSON.parse(fs.readFileSync(f, 'utf8'))) {
      const own = path.join(projectDir, 'sfx', `${c.sfx}.wav`);
      const lib = library.find((x) => x.id === c.sfx);
      const abs = fs.existsSync(own) ? own : lib ? path.join(SFX_DIR, lib.file) : null;
      if (!abs) { log(`sfx: no sound "${c.sfx}" (${s.id})`); continue; }
      if (c.at < 0 || c.at > s.duration_s) continue;
      // a background sound (the library marks it: a sample call under a call feature) plays at its own default gain
      // and further back, and is never reported as buried
      const bg = Boolean(lib?.background) && !fs.existsSync(own);
      sfx.push({ abs, at: Math.round((s.start_s + c.at) * 1000) / 1000, gain: c.gain ?? (bg ? lib.gain ?? 0.4 : 1), dur: c.dur || null, scene: s.id, id: c.sfx, background: bg });
    }
  }
  return sfx;
}
