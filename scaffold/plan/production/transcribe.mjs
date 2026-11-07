#!/usr/bin/env node
// transcribe.mjs — the listening check for a narrated video. Claude cannot hear audio, so the finished video's sound is
// transcribed by ElevenLabs speech-to-text (the user's own key, the same one the voices use) and set beside the script,
// line by line: what was written, what was heard, and whether the product's name came out right. Claude then reads the
// report (text) and fixes what was misheard (a `say` spelling, a reworded line). Only the video's audio is sent.
//   node --env-file-if-exists=.env plan/production/transcribe.mjs <project> [video file, default out/video.mp4]
// Writes production/look/transcript.json and transcript.md. Without a key it says so and exits 0 (the check is skipped).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [, , projectArg, videoArg] = process.argv;
if (!projectArg) { console.error('usage: node --env-file-if-exists=.env plan/production/transcribe.mjs <project> [video]'); process.exit(2); }
const project = path.resolve(projectArg);
const video = path.resolve(videoArg || path.join(project, 'out', 'video.mp4'));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.log('Listening check skipped: no ELEVENLABS_API_KEY in the env file. Ask the user to listen for the product name instead.'); process.exit(0); }
if (!fs.existsSync(video)) { console.error(`No video at ${video}; render it first.`); process.exit(1); }

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const plan = readJson(path.join(project, 'plan.json'), {});
const lines = readJson(path.join(project, 'production', 'narration.json'), []);
const product = plan.video?.product || '';

// the audio only, small: mono 64 kb/s mp3
const tmp = path.join(os.tmpdir(), `ud-listen-${process.pid}.mp3`);
const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '22050', '-b:a', '64k', tmp], { encoding: 'utf8' });
if (ff.status !== 0) { console.error(`ffmpeg could not read the audio: ${ff.stderr}`); process.exit(1); }

const form = new FormData();
form.append('model_id', 'scribe_v1');
form.append('tag_audio_events', 'false');
form.append('file', new Blob([fs.readFileSync(tmp)], { type: 'audio/mpeg' }), 'audio.mp3');
fs.rmSync(tmp, { force: true });
const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form });
if (!res.ok) { console.error(`ElevenLabs speech-to-text answered ${res.status}${res.status === 401 ? ' (the key was refused)' : ''}.`); process.exit(1); }
const stt = await res.json();
const words = (stt.words || []).filter((w) => w.type !== 'spacing' && w.type !== 'audio_event');

// each script line beside the words heard in its window (its start to the next line's start)
const startOf = Object.fromEntries((plan.scenes || []).map((s) => [s.id, Number(s.start_s) || 0]));
const timed = lines.map((l) => ({ ...l, t: (startOf[l.scene] ?? 0) + Number(l.at || 0) })).sort((a, b) => a.t - b.t);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const compact = (s) => norm(s).replace(/ /g, '');
const rows = timed.map((l, i) => {
  const end = i + 1 < timed.length ? timed[i + 1].t : Infinity;
  const heard = words.filter((w) => w.start >= l.t - 0.6 && w.start < end - 0.2).map((w) => w.text).join(' ').replace(/\s+([,.!?])/g, '$1').trim();
  const want = norm(l.text).split(' ').filter(Boolean), got = new Set(norm(heard).split(' '));
  const match = want.length ? Math.round((want.filter((w) => got.has(w)).length / want.length) * 100) : 100;
  const named = product && compact(l.text).includes(compact(product));
  const nameHeard = named ? compact(heard).includes(compact(product)) : null;
  return { scene: l.scene, at_s: Math.round(l.t * 10) / 10, script: l.text, heard, match, ...(named ? { product_named: true, product_heard: nameHeard } : {}) };
});
const misheard = rows.filter((r) => r.product_named && !r.product_heard);
const weak = rows.filter((r) => r.match < 80);
const out = { video: path.relative(project, video), product, transcript: stt.text || '', lines: rows, product_misheard: misheard.length, weak_lines: weak.length };
const look = path.join(project, 'production', 'look');
fs.mkdirSync(look, { recursive: true });
fs.writeFileSync(path.join(look, 'transcript.json'), JSON.stringify(out, null, 1) + '\n');
fs.writeFileSync(path.join(look, 'transcript.md'), [
  `# Listening check: ${product || 'the video'}`,
  '',
  `${rows.length} script lines; ${misheard.length ? `**the product name was misheard in ${misheard.length}**` : 'the product name was heard right wherever it is said'}; ${weak.length} line${weak.length === 1 ? '' : 's'} under 80% of the script's words.`,
  '',
  ...rows.map((r) => `- ${r.at_s} s · ${r.scene} · ${r.match}%${r.product_named ? (r.product_heard ? ' · name ok' : ' · **name misheard**') : ''}\n  - script: ${r.script}\n  - heard: ${r.heard || '(nothing)'}`),
  '',
].join('\n'));
console.log(`Listening check: ${rows.length} lines; product name misheard in ${misheard.length}; ${weak.length} weak line${weak.length === 1 ? '' : 's'}. Report: ${path.join(look, 'transcript.md')}`);
