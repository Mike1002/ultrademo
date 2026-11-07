#!/usr/bin/env node
// remix.mjs — the same video with different music, without rendering the frames again: reuses out/video-render.mp4
// (the silent render from `scene.mjs whole`), the narration and the sound-effect cues, and mixes them with another track.
// Writes out/video-<name>.mp4 beside video.mp4 (which is left as it is); the review page lists it as another version.
//   node plan/production/remix.mjs <project> --music <library file> [--name <name>]
import fs from 'node:fs';
import path from 'node:path';
import { mixAudio, musicFor, sceneCues } from './audio.mjs';

const args = process.argv.slice(2);
const projectDir = path.resolve(args.find((x) => !x.startsWith('--')) || '');
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const file = opt('music');
const stop = (m) => { console.error(m); process.exit(1); };
if (!file || !fs.existsSync(path.join(projectDir, 'plan.json'))) stop('usage: node plan/production/remix.mjs <project> --music <library file> [--name <name>]');
const silent = path.join(projectDir, 'out', 'video-render.mp4');
if (!fs.existsSync(silent)) stop(`no silent render at ${silent}: run scene.mjs whole first`);
const music = musicFor({ music: { track: file } }, projectDir);
if (!music?.abs) stop(`${file} is not a track in the music library`);
const name = String(opt('name') || `music-${path.basename(music.file).replace(/\.[^.]+$/, '')}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60);

const plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'));
let t = 0;
const scenes = plan.scenes.map((s) => { const n = { ...s, start_s: t }; t = Math.round((t + s.duration_s) * 1000) / 1000; return n; });
const voicesFile = path.join(projectDir, 'production', 'voice', 'voices.json');
const voices = fs.existsSync(voicesFile) ? JSON.parse(fs.readFileSync(voicesFile, 'utf8')).lines.map((v) => ({ ...v, path: path.join(projectDir, v.path) })) : [];
const sfx = sceneCues(projectDir, scenes);
const out = path.join(projectDir, 'out', `video-${name}.mp4`);
const mix = mixAudio({ video: silent, out, duration: t, music, voices, sfx });
if (!mix.ok) stop(`mix failed: ${mix.reason}`);
console.log(`${music.title}: ${voices.length} narration line(s), ${sfx.length} effect(s); ${mix.measured?.lufs ?? '?'} LUFS, true peak ${mix.measured?.true_peak_dbtp ?? '?'} dBTP`);
console.log(out);
