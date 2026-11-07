#!/usr/bin/env node
// sfx-make.mjs — the in-house sound-effect library: every sound synthesised with ffmpeg from a recipe in this file,
// so nothing is downloaded and the licence is ours (CC0-equivalent). Writes sfx/<id>.wav (48 kHz mono) and
// sfx/library.json (id, file, situations, tags, length, recipe). Add a sound by adding a recipe and running again.
//   node scripts/sfx-make.mjs
// Sounds that cannot be synthesised well (voices, crowd reactions, a phone call) come from ElevenLabs' sound
// generator or a licensed source when a video needs them; they are added to library.json with their source and licence.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sfx');
const SR = 48000;

// recipe: an aevalsrc expression (t in seconds) over a duration, then an ffmpeg filter chain
const R = [
  { id: 'key-1', situations: ['typing', 'text typed into a field', 'a character appears'], tags: ['ui', 'typing', 'soft'], d: 0.05,
    expr: '(random(1)*2-1)*exp(-t*160)', af: 'highpass=f=1800,lowpass=f=7000,volume=0.55' },
  { id: 'key-2', situations: ['typing (variation)'], tags: ['ui', 'typing', 'soft'], d: 0.05,
    expr: '(random(2)*2-1)*exp(-t*190)', af: 'highpass=f=2300,lowpass=f=8000,volume=0.5' },
  { id: 'key-3', situations: ['typing (variation)'], tags: ['ui', 'typing', 'soft'], d: 0.05,
    expr: '(random(3)*2-1)*exp(-t*140)', af: 'highpass=f=1500,lowpass=f=6000,volume=0.55' },
  { id: 'click', situations: ['a cursor clicks', 'a toggle or tab is selected'], tags: ['ui', 'click', 'crisp'], d: 0.06,
    expr: '((random(4)*2-1)*0.6+sin(2*PI*2400*t)*0.5)*exp(-t*120)', af: 'highpass=f=900,volume=0.7' },
  { id: 'press', situations: ['a button is pressed', 'a call to action is pressed'], tags: ['ui', 'press', 'thud'], d: 0.14,
    expr: 'sin(2*PI*(140+120*exp(-t*40))*t)*exp(-t*28)*0.9+(random(5)*2-1)*exp(-t*150)*0.35', af: 'lowpass=f=6000,volume=0.8' },
  { id: 'pop', situations: ['a card, row or chip appears', 'a new page pops up', 'pop pop pop for a sequence'], tags: ['ui', 'pop', 'bright'], d: 0.12,
    expr: 'sin(2*PI*(320+700*exp(-t*45))*t)*exp(-t*32)', af: 'volume=0.7' },
  { id: 'pop-high', situations: ['a small item appears', 'a check or badge pops'], tags: ['ui', 'pop', 'high'], d: 0.1,
    expr: 'sin(2*PI*(520+1100*exp(-t*55))*t)*exp(-t*40)', af: 'volume=0.6' },
  { id: 'whoosh', situations: ['a part lifts out of the screen', 'a card slides in fast', 'a camera move'], tags: ['transition', 'air'], d: 0.42,
    expr: '(random(6)*2-1)*sin(PI*t/0.42)', af: 'highpass=f=350,lowpass=f=3200,volume=0.45' },
  { id: 'chime', situations: ['success', 'a check lands', 'published'], tags: ['ui', 'success', 'bright'], d: 0.45,
    expr: '(sin(2*PI*1318.5*t)*exp(-t*9)*0.6+sin(2*PI*1975.5*(t-0.07))*exp(-(t-0.07)*9)*0.5*gte(t,0.07))', af: 'volume=0.55' },
  { id: 'warn', situations: ['a warning or error appears', 'your brand is missing', 'something goes wrong'], tags: ['ui', 'error', 'low'], d: 0.32,
    expr: '(sin(2*PI*196*t)+0.4*sin(2*PI*392*t))*(lt(t,0.11)+gte(t,0.17)*lt(t,0.28))*exp(-t*3)', af: 'lowpass=f=2500,volume=0.55' },
  { id: 'notice', situations: ['a notification or toast lands', 'a message arrives'], tags: ['ui', 'notify', 'soft'], d: 0.38,
    expr: '(sin(2*PI*880*t)*0.7+sin(2*PI*1760*t)*0.25)*exp(-t*10)', af: 'volume=0.5' },
  { id: 'tick', situations: ['a counter steps', 'a small marker moves'], tags: ['ui', 'tick', 'tiny'], d: 0.03,
    expr: 'sin(2*PI*3200*t)*exp(-t*260)', af: 'volume=0.45' },
  { id: 'blip', situations: ['something travels along a line', 'data passes from one place to another'], tags: ['ui', 'transfer', 'bright'], d: 0.4,
    expr: '(sin(2*PI*988*t)*lt(t,0.09)*exp(-t*14)+sin(2*PI*1319*t)*gte(t,0.12)*lt(t,0.21)*exp(-(t-0.12)*14)+sin(2*PI*1760*t)*gte(t,0.24)*exp(-(t-0.24)*11))*0.8', af: 'volume=0.75' },
];

fs.mkdirSync(DIR, { recursive: true });
const lib = [];
for (const r of R) {
  const file = path.join(DIR, `${r.id}.wav`);
  const res = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=exprs='${r.expr}':s=${SR}:d=${r.d}`, '-af', `${r.af},afade=t=out:st=${Math.max(0, r.d - 0.01)}:d=0.01`, '-ac', '1', '-ar', String(SR), file], { encoding: 'utf8' });
  if (res.status !== 0) { console.error(`${r.id}: ${res.stderr}`); process.exitCode = 1; continue; }
  lib.push({ id: r.id, file: `${r.id}.wav`, situations: r.situations, tags: r.tags, length_s: r.d, source: 'in-house, synthesised by scripts/sfx-make.mjs', licence: 'ours (CC0-equivalent)', recipe: { expr: r.expr, filters: r.af } });
}
// sounds from elsewhere (scripts/sfx-generate.mjs, licensed files) stay in the library
const libFile = path.join(DIR, 'library.json');
const kept = fs.existsSync(libFile) ? JSON.parse(fs.readFileSync(libFile, 'utf8')).sounds.filter((s) => !s.source.startsWith('in-house') && !lib.some((x) => x.id === s.id)) : [];
fs.writeFileSync(libFile, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), note: 'Pick by situation; a scene lists its cues in production/scenes/<id>.cues.json as [{ "sfx": id, "at": seconds into the scene, "gain": 1, "dur"?: seconds to play }].', sounds: [...lib, ...kept] }, null, 1) + '\n');
console.log(`${lib.length} sounds in ${DIR}`);
