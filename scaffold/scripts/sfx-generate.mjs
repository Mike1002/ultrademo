#!/usr/bin/env node
// sfx-generate.mjs — the sounds the in-house synth cannot make well (a crowd "aww", a cheer, a real mouse click, typing,
// a phone call) generated once with ElevenLabs' sound generator and kept in sfx/ with their prompt and source in
// library.json. A sound already in the library is not generated again (credits are spent once).
//   node --env-file-if-exists=.env scripts/sfx-generate.mjs [id ...]            generate the missing sounds straight into the library
//   node --env-file-if-exists=.env scripts/sfx-generate.mjs --takes 2 <id ...>  takes to sfx/takes/ for a listening check
//   node scripts/sfx-generate.mjs --pick <id> <k>                                the chosen take into the library
//   node scripts/sfx-generate.mjs --peaks                                        every generated sound's peak back to -3 dBFS
// ElevenLabs bills per generation; their sound effects may be used commercially on paid plans (check the account's plan).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sfx');
const LIB = path.join(DIR, 'library.json');

// id, the prompt, length in seconds, situations it fits, tags
export const GENERATED = [
  { id: 'aww-crowd', d: 2.0, influence: 0.8, text: "Audience aww sound effect, a crowd of people saying awww in disappointment", situations: ['a let-down: the brand is missing, traffic drops, a number falls'], tags: ['reaction', 'crowd', 'sad'] },
  { id: 'gasp-crowd', d: 1.2, text: 'A small audience gasping in surprise together, short, no music', situations: ['a surprising number or reveal'], tags: ['reaction', 'crowd', 'surprise'] },
  { id: 'cheer-small', d: 2.2, text: 'A small group cheering and clapping briefly in celebration, upbeat, no music', situations: ['a goal reached', 'a win lands', 'the brand gets chosen'], tags: ['reaction', 'crowd', 'celebration'] },
  { id: 'check-done', d: 0.9, influence: 0.85, text: 'Satisfying app success sound: a soft click followed by a bright two-note confirmation chime, clean, no music', situations: ['a task is done', 'a check lands'], tags: ['success', 'ui'] },
  { id: 'clock-ticks', d: 1.4, influence: 0.85, text: 'A clock ticking quickly four times then a soft bell ding, clean, close up, no music', situations: ['time saved', 'scheduling'], tags: ['time', 'tick'] },
  { id: 'notify', d: 1.0, influence: 0.85, text: 'Pleasant mobile phone notification sound, a warm two-tone ding, clean, no music', situations: ['a notification arrives', 'someone is notified'], tags: ['notify', 'ui'] },
  { id: 'reaction-pop', d: 0.7, influence: 0.85, text: 'A bright bubbly pop with a playful little upward boing, cartoon reaction sound, short, no music', situations: ['a reaction appears', 'thumbs up, smiley, hearts'], tags: ['reaction', 'pop', 'playful'] },
  { id: 'high-five', d: 0.8, influence: 0.9, text: 'Two hands slapping together in a high five, one crisp loud palm slap, close up, no music', situations: ['a high five', 'a win between people'], tags: ['reaction', 'slap'] },
  { id: 'lock-click', d: 1.2, influence: 0.9, text: 'A key turning in a door lock and the deadbolt sliding shut with a solid mechanical clunk, close up, no music', situations: ['security', 'something is locked or protected'], tags: ['security', 'click'] },
  { id: 'rise', d: 1.2, influence: 0.8, text: 'A short bright rising synth tone sweeping upward, positive and clean, interface sound, no music', situations: ['a number goes up', 'growth'], tags: ['growth', 'positive', 'tone'] },
  { id: 'ka-ching', d: 1.6, influence: 0.85, text: 'Old mechanical cash register opening: the cha-ching bell rings as the cash drawer slides open with coins jingling, short, no music', situations: ['a bonus or payout is paid', 'money arrives', 'a sale lands'], tags: ['money', 'reward', 'bright'] },
  { id: 'sparkle', d: 1.5, influence: 0.8, text: "Magic sparkle twinkle sound effect, shimmering glitter chimes", situations: ['sparkles on screen', 'a badge or result shines', 'something is generated'], tags: ['celebration', 'magic', 'bright'] },
  { id: 'confetti', d: 1.2, text: 'A party popper bursting with confetti, celebratory, short and clean', situations: ['confetti on screen', 'a milestone'], tags: ['celebration', 'burst'] },
  { id: 'level-up', d: 1.2, text: 'A short bright rising success chime, like reaching a goal in an app, clean', situations: ['a goal reached', 'the tagline lands', 'a metric hits its target'], tags: ['success', 'bright', 'rising'] },
  { id: 'mouse-click', d: 0.5, text: 'A single crisp computer mouse click, close up, clean, no room noise', situations: ['a cursor clicks a button, tab or chip'], tags: ['ui', 'click', 'real'] },
  { id: 'typing', d: 3.0, text: 'Fast typing on a modern laptop keyboard, close up, clean, steady rhythm, no room noise', situations: ['text typed into a field (cut to the typing with dur)'], tags: ['ui', 'typing', 'real'] },
  { id: 'bubble-pop', d: 0.6, influence: 0.8, text: "Bubble pop sound effect", situations: ['a card, row or chip appears', 'pop pop pop for a run'], tags: ['ui', 'pop', 'soft'] },
  { id: 'whoosh-air', d: 1.0, influence: 0.8, text: "Whoosh sound effect, fast swoosh", situations: ['a part lifts out of a screen', 'a panel slides in mid-scene'], tags: ['transition', 'air'] },
  { id: 'phone-call', d: 3.0, influence: 0.8, text: "Muffled phone conversation, a man talking through a telephone speaker", situations: ['a call feature: a few seconds of the call under the scene'], tags: ['ambience', 'voice', 'call'] },
];

const peakDb = (f) => Number((spawnSync('ffmpeg', ['-nostats', '-i', f, '-af', 'astats=metadata=0', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/Peak level dB:\s*(-?[\d.]+|-inf)/) || [])[1]);
export function setPeak(f, target) {
  const tmp = f.replace(/\.wav$/, '.tmp.wav');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-af', `volume=${(target - peakDb(f)).toFixed(2)}dB`, tmp]);
  fs.renameSync(tmp, f);
}

async function generate(key, g, wav) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: g.text, duration_seconds: g.d, prompt_influence: g.influence ?? 0.6 }),
  });
  if (!res.ok) throw new Error(`${g.id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const mp3 = wav.replace(/\.wav$/, '.src.mp3');
  fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  // mono 48 kHz, the silence at the start trimmed so the cue time is the sound's onset, the peak set to -3 dBFS
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-af', 'silenceremove=start_periods=1:start_threshold=-60dB', '-ac', '1', '-ar', '48000', wav], { encoding: 'utf8' });
  if (r.status !== 0 || !(peakDb(wav) > -90)) throw new Error(`${g.id}: no audio after trimming ${r.stderr || ''}`);
  setPeak(wav, -3);
  return mp3;
}

const entry = (g) => ({ id: g.id, file: `${g.id}.wav`, situations: g.situations, tags: g.tags, length_s: g.d, source: `ElevenLabs sound generation, ${new Date().toISOString().slice(0, 10)}, prompt: "${g.text}"`, licence: 'ElevenLabs output: commercial use on paid plans' });

// Generation is a guess: --takes N writes N takes per sound to sfx/takes/ for a listening check (by ear, or a model asked
// blind what it hears), and --pick <id> <k> puts the chosen take in the library.
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--peaks') { for (const g of GENERATED) if (fs.existsSync(path.join(DIR, `${g.id}.wav`))) setPeak(path.join(DIR, `${g.id}.wav`), -3); return; }
  const lib = JSON.parse(fs.readFileSync(LIB, 'utf8'));
  const save = () => { lib.updated = new Date().toISOString().slice(0, 10); fs.writeFileSync(LIB, JSON.stringify(lib, null, 1) + '\n'); };
  if (args[0] === '--pick') {
    const g = GENERATED.find((x) => x.id === args[1]);
    const take = path.join(DIR, 'takes', `${args[1]}-${args[2]}.wav`);
    if (!g || !fs.existsSync(take)) throw new Error(`no take ${args[1]}-${args[2]}`);
    fs.copyFileSync(take, path.join(DIR, `${g.id}.wav`));
    lib.sounds = lib.sounds.filter((s) => s.id !== g.id).concat([entry(g)]);
    save(); console.log(`${g.id}: take ${args[2]} in the library`); return;
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set. Add it to .env (never paste it in chat).');
  const ti = args.indexOf('--takes');
  const takes = ti >= 0 ? Number(args[ti + 1]) : 0;
  const only = args.filter((a, i) => !a.startsWith('--') && !(ti >= 0 && i === ti + 1));
  if (takes) {
    fs.mkdirSync(path.join(DIR, 'takes'), { recursive: true });
    for (const g of GENERATED.filter((x) => only.includes(x.id))) for (let k = 1; k <= takes; k++) {
      const wav = path.join(DIR, 'takes', `${g.id}-${k}.wav`);
      try { fs.unlinkSync(await generate(key, g, wav)); console.log(`${g.id}-${k}: ok`); } catch (e) { console.error(e.message); process.exitCode = 1; }
    }
    return;
  }
  for (const g of GENERATED.filter((x) => (!only.length || only.includes(x.id)) && !lib.sounds.some((s) => s.id === x.id))) {
    try { fs.unlinkSync(await generate(key, g, path.join(DIR, `${g.id}.wav`))); lib.sounds.push(entry(g)); console.log(`${g.id}: ok`); } catch (e) { console.error(e.message); process.exitCode = 1; }
  }
  save();
}

main().catch((e) => { console.error(`Stopped: ${e.message}`); process.exit(1); });
