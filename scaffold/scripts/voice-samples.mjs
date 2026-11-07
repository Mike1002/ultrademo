#!/usr/bin/env node
// voice-samples.mjs — one sample per voice in tts/voices.json, all reading the catalogue's sample line (D-71), saved as
// tts/samples/<id>.mp3 at -16 LUFS for the intake page. A sample already made is kept unless --force; ElevenLabs voices
// need the key in .env (each costs about 100 characters, once); free voices need their local engine installed.
//   node --env-file-if-exists=.env scripts/voice-samples.mjs [--force] [id ...]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveProvider } from '../tts/providers.mjs';
import { loadCatalogue, SAMPLES_DIR } from '../tts/catalogue.mjs';
import { measureLoudness } from '../plan/production/audio.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const cat = loadCatalogue();
fs.mkdirSync(SAMPLES_DIR, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrademo-samples-'));
const report = [];
for (const v of cat.voices.filter((x) => !only.length || only.includes(x.id))) {
  const out = path.join(SAMPLES_DIR, `${v.id}.mp3`);
  if (fs.existsSync(out) && !force) { report.push(`${v.id}: kept`); continue; }
  let provider;
  try { provider = resolveProvider(v.spec); } catch (e) { report.push(`${v.id}: skipped (${e.message.split('.')[0]})`); continue; }
  if (provider.ready && !provider.ready()) { report.push(`${v.id}: skipped (${provider.setupHint || 'engine not installed'})`); continue; }
  const wav = path.join(tmp, `${v.id}.wav`);
  const res = await provider.synthesizeMany([{ id: v.id, text: cat.sample_say || cat.sample_line, out: wav }]);
  const r = res.get(v.id);
  if (!r?.ok || !fs.existsSync(wav)) { report.push(`${v.id}: failed (${r?.error || 'no audio'})`); process.exitCode = 1; continue; }
  const m = measureLoudness(wav);
  const gain = m ? (-16 - m.lufs).toFixed(2) : '0';
  const enc = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-af', `silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,volume=${gain}dB,alimiter=limit=0.84:level=false`, '-ac', '1', '-ar', '44100', '-b:a', '128k', out], { encoding: 'utf8' });
  if (enc.status !== 0) { report.push(`${v.id}: encode failed`); process.exitCode = 1; continue; }
  const secs = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim());
  report.push(`${v.id}: ${secs.toFixed(1)} s`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(report.join('\n'));
