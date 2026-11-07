#!/usr/bin/env node
// sfx-call.mjs — the phone-call sound: a short, clear call opening read by two ElevenLabs library voices (not the
// narration voices), sped up a little, filtered to sound like a phone line, and faded out on the word "demo" (placed
// from the character timings ElevenLabs returns, not by ear). Writes sfx/phone-call.wav and its library entry.
// Needs ELEVENLABS_API_KEY in scaffold/.env (put there by the user).
//   node --env-file-if-exists=.env scripts/sfx-call.mjs [--short]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SFX = path.join(ROOT, 'sfx');
const TAKES = path.join(SFX, 'takes');
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY is not set. Add it to scaffold/.env (never paste it in chat).'); process.exit(1); }

const VOICES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tts', 'voices.json'), 'utf8'));
const voiceId = (id) => { const v = (VOICES.voices || VOICES).find((x) => x.id === id); return v.spec.split(':')[1]; };
// caller is heard close; the far end is a little thinner. gap = silence before the line (in the sped-up result).
const LINES = [
  { voice: 'kristen', text: 'Hi, am I speaking to John?', gap: 0.05, far: false },
  { voice: 'jesse', text: 'Yes?', gap: 0.22, far: true },
  { voice: 'kristen', text: 'Okay, great. This call is about your demo request, and I wanted to walk you through what happens next.', gap: 0.22, far: false },
];
// --short: a tighter wording for a 2–3 s slot, written to sfx/takes/ to compare (the library keeps the full one)
const SHORT = process.argv.includes('--short');
if (SHORT) LINES.splice(0, 3,
  { voice: 'kristen', text: 'Hi, is this John?', gap: 0.05, far: false },
  { voice: 'jesse', text: 'Yes?', gap: 0.2, far: true },
  { voice: 'kristen', text: 'Great, this call is about your demo request.', gap: 0.2, far: false });
const SPEED = 1.25;          // faster, same pitch (atempo)
const FADE_WORD = 'demo';     // the fade ends partway through this word, so it is never fully heard
const FADE_INTO = 0.45;       // the share of the word heard before silence
const FADE_LEN = 0.6;
const LOUDNESS = -24;         // LUFS: sits under narration and music

const run = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };

const dur = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout);
const isLetter = (c) => /[A-Za-z]/.test(c);

fs.mkdirSync(TAKES, { recursive: true });
// 1. each line on its own: cut from its first letter to its last (to partway through FADE_WORD on the fading line),
//    pauses capped at about 0.2 s, sped up, phone-filtered; the fading line's tail fades out
const parts = [];
let fadeWordFound = false;
for (const [i, l] of LINES.entries()) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId(l.voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: l.text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2 } }),
  });
  if (!res.ok) { console.error(`line ${i + 1}: ${res.status}`); process.exit(1); }
  const j = await res.json();
  const mp3 = path.join(TAKES, `phone-call-line-${i + 1}.mp3`);
  fs.writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
  const ch = j.alignment.characters, starts = j.alignment.character_start_times_seconds, ends = j.alignment.character_end_times_seconds;
  const first = ch.findIndex(isLetter), last = ch.length - 1 - [...ch].reverse().findIndex(isLetter);
  const from = Math.max(0, starts[first] - 0.03);
  let to = ends[last] + 0.06, fades = false;
  const w = l.text.indexOf(FADE_WORD);
  if (w >= 0) { to = starts[w] + (ends[w + FADE_WORD.length - 1] - starts[w]) * FADE_INTO; fades = true; fadeWordFound = true; }
  const wav = path.join(TAKES, `phone-call-line-${i + 1}.wav`);
  const filt = [`atrim=${from.toFixed(3)}:${to.toFixed(3)}`, 'asetpts=PTS-STARTPTS',
    'silenceremove=stop_periods=-1:stop_duration=0.2:stop_threshold=-38dB:stop_silence=0.16', `atempo=${SPEED}`,
    l.far ? 'highpass=f=400,lowpass=f=3000,acompressor=threshold=-20dB:ratio=4,volume=0.9' : 'highpass=f=300,lowpass=f=3400,acompressor=threshold=-20dB:ratio=3'];
  if (fades) filt.push(`areverse,afade=t=in:d=${FADE_LEN},areverse`);
  run(['-i', mp3, '-af', filt.join(','), '-ac', '1', '-ar', '48000', wav]);
  parts.push({ wav, gap: l.gap, fades });
}
if (!fadeWordFound) throw new Error(`no "${FADE_WORD}" in the lines`);

// 2. the lines in turn with their gaps, then a fixed gain to the target loudness (measured, so the fade stays a fade)
let t = 0;
for (const p of parts) { p.start = t + p.gap; t = p.start + dur(p.wav); }
const total = t, fadeStart = total - FADE_LEN;
const voice = path.join(TAKES, 'phone-call-voice.wav');
run([...parts.flatMap((p) => ['-i', p.wav]), '-filter_complex', `${parts.map((p, i) => `[${i}]adelay=${Math.round(p.start * 1000)}[l${i}]`).join(';')};${parts.map((_, i) => `[l${i}]`).join('')}amix=inputs=${parts.length}:normalize=0:duration=longest[v]`, '-map', '[v]', '-ac', '1', '-ar', '48000', voice]);
const meas = spawnSync('ffmpeg', ['-v', 'info', '-i', voice, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/);
const gain = LOUDNESS - Number(meas ? meas[1] : LOUDNESS);
const out = SHORT ? path.join(TAKES, 'phone-call-short.wav') : path.join(SFX, 'phone-call.wav');
run(['-i', voice, '-filter_complex', `[0]volume=${gain.toFixed(2)}dB[v];anoisesrc=color=pink:amplitude=0.006:d=${total.toFixed(3)}:r=48000,highpass=f=300,lowpass=f=3400[n];[v][n]amix=inputs=2:normalize=0:duration=longest,atrim=0:${total.toFixed(3)},afade=t=in:d=0.03,afade=t=out:st=${fadeStart.toFixed(3)}:d=${FADE_LEN}[out]`, '-map', '[out]', '-ac', '1', '-ar', '48000', out]);
const fadeEnd = total;

const length = dur(out);
if (SHORT) { console.log(`${path.relative(ROOT, out)} ${length.toFixed(2)} s, fade ${fadeStart.toFixed(2)}–${fadeEnd.toFixed(2)} s (not in the library)`); process.exit(0); }
const libFile = path.join(SFX, 'library.json');
const lib = JSON.parse(fs.readFileSync(libFile, 'utf8'));
const entry = {
  id: 'phone-call', file: 'phone-call.wav',
  situations: ['a call feature: a sample call playing under the scene, in the background ("Hi, am I speaking to John?" … "Yes?" … "Okay, great. This call is about your de…", fading out). Plays quieter and further back by default; never the main sound.'],
  tags: ['voice', 'call', 'dialogue'], length_s: Number(length.toFixed(2)), background: true, gain: 0.4,
  source: `ElevenLabs text to speech, ${new Date().toISOString().slice(0, 10)}, voices Kristen (caller) and Jesse (John), ${SPEED}x, phone-line filter by scripts/sfx-call.mjs`,
  licence: 'ElevenLabs output: commercial use on paid plans',
};
lib.sounds = lib.sounds.map((s) => (s.id === 'phone-call' ? entry : s));
fs.writeFileSync(libFile, JSON.stringify(lib, null, 1) + '\n');
console.log(`phone-call.wav ${entry.length_s} s, fade ${fadeStart.toFixed(2)}–${fadeEnd.toFixed(2)} s`);
