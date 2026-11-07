#!/usr/bin/env node
// music-samples.mjs — a 12-second preview of every curated track (music/curated.json) for the intake page: cut from where
// the track's bed is usable (usable_from_s), faded in and out, all at -16 LUFS so the tracks compare by feel, not loudness.
// Writes music/samples/<track>.mp3; a preview already made is kept unless --force. Free: ffmpeg only.
//   node scripts/music-samples.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureLoudness } from '../plan/production/audio.mjs';

const MUSIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'music');
export const SAMPLE_S = 12;
export const sampleName = (file) => `${path.basename(file).replace(/\.[^.]+$/, '')}.mp3`;
const force = process.argv.includes('--force');
const tracks = JSON.parse(fs.readFileSync(path.join(MUSIC, 'curated.json'), 'utf8')).tracks;
fs.mkdirSync(path.join(MUSIC, 'samples'), { recursive: true });
for (const t of tracks) {
  const src = path.join(MUSIC, t.file), out = path.join(MUSIC, 'samples', sampleName(t.file));
  if (!fs.existsSync(src)) { console.log(`${t.title}: no file`); continue; }
  if (fs.existsSync(out) && !force) { console.log(`${t.title}: kept`); continue; }
  const cut = out.replace(/\.mp3$/, '.cut.wav');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Number(t.usable_from_s) || 0), '-t', String(SAMPLE_S), '-i', src, '-af', `afade=t=in:st=0:d=0.4,afade=t=out:st=${SAMPLE_S - 1.5}:d=1.5`, '-ar', '44100', cut]);
  const m = measureLoudness(cut);
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', cut, '-af', `volume=${(-16 - (m?.lufs ?? -16)).toFixed(2)}dB,alimiter=limit=0.84:level=false`, '-b:a', '160k', out]);
  fs.unlinkSync(cut);
  console.log(`${t.title}: ${sampleName(t.file)} (${m ? `${m.lufs} LUFS before levelling` : 'no measure'})`);
}
