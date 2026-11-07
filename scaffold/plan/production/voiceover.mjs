#!/usr/bin/env node
// voiceover.mjs — the narration for a video built in agent mode: production/narration.json lists the lines,
// each placed in a scene ([{ "scene": id, "at": seconds into the scene, "text": "…", "say"?: "…" }]; "say" is the
// spoken form when a name needs help, e.g. "Loo-me-oh" for a brand spelled Lumio, which a voice might read wrong). Every line is voiced with
// the direction's voice through scaffold/tts (ElevenLabs, Pocket, Chatterbox), cached by voice and text, measured,
// and written to production/voice/voices.json as [{ id, scene, text, path, start_s, secs }] for the full render.
// A line that runs past the end of its scene, or into the next line, is reported (the scene or the line changes).
//   node --env-file-if-exists=.env plan/production/voiceover.mjs <project> [--voice elevenlabs:<id>]
// Paid voices cost credits per character; the cache means a line is paid for once.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveProvider } from '../../tts/providers.mjs';
import { voiceSpec, measureLoudness } from './audio.mjs';

const VOICE_LUFS = -16; // every line is brought to the same loudness before the mix (providers return lines from about -38 to -16 LUFS)

const secsOf = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim()) || 0;

export async function voiceover(projectDir, { voice = null, file = 'voices.json', log = console.log } = {}) {
  const plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'));
  const lines = JSON.parse(fs.readFileSync(path.join(projectDir, 'production', 'narration.json'), 'utf8'));
  const spec = voice || voiceSpec(plan.direction);
  if (!spec) throw new Error('no voice in the direction (direction.voice) and none given with --voice');
  const provider = resolveProvider(spec);
  const dir = path.join(projectDir, 'production', 'voice');
  fs.mkdirSync(dir, { recursive: true });
  // A brand name that opens a sentence is often stressed wrongly ; the same name
  // after a word ("Meet Lumio.") reads right. Lines that open a sentence with the product's name are flagged before voicing.
  const brand = String(plan.video?.product || '').trim();
  if (brand) {
    const opens = new RegExp(`(^|[.!?]\\s+)["'“]?${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    for (const l of lines) if (opens.test(l.text)) log(`warning: "${l.text.slice(0, 60)}…" (${l.scene}) opens a sentence with ${brand}; put a word before it ("Meet ${brand}.", "With ${brand}, …") so the voice stresses it right`);
  }
  const items = lines.map((l, i) => {
    const spoken = l.say || l.text;
    const hash = crypto.createHash('sha1').update(`${provider.sig}\n${spoken}`).digest('hex').slice(0, 12);
    return { id: `line-${String(i + 1).padStart(2, '0')}`, text: spoken, shown: l.text, out: path.join(dir, `${hash}.wav`), line: l };
  });
  const todo = items.filter((it) => !fs.existsSync(it.out));
  if (todo.length) {
    log(`voicing ${todo.length} line(s) with ${provider.label}${provider.paid ? ' (paid)' : ''}`);
    const res = await provider.synthesizeMany(todo);
    for (const it of todo) { const r = res.get(it.id); if (!r?.ok) throw new Error(`${it.id}: ${r?.error || 'no audio'}`); }
  }
  const byId = new Map(plan.scenes.map((s) => [s.id, s]));
  const out = items.map((it) => {
    const s = byId.get(it.line.scene);
    if (!s) throw new Error(`${it.id}: no scene ${it.line.scene}`);
    const start = Math.round((s.start_s + it.line.at) * 1000) / 1000;
    const secs = Math.round(secsOf(it.out) * 100) / 100;
    // tone "speaker": a line heard playing inside the product (a "Hear it" button, a recording): band-limited like a small speaker,
    // 6 dB under the narration and with a short room echo, so it does not sound like the narrator
    const speaker = it.line.tone === 'speaker';
    const norm = it.out.replace(/\.wav$/, `.n${-VOICE_LUFS}${speaker ? '.speaker' : ''}.wav`);
    if (!fs.existsSync(norm)) {
      const m = measureLoudness(it.out);
      if (!m) throw new Error(`${it.id}: could not measure ${it.out}`);
      const gain = (VOICE_LUFS - m.lufs - (speaker ? 6 : 0)).toFixed(2);
      const tone = speaker ? 'highpass=f=320,lowpass=f=3600,aecho=0.8:0.5:28:0.22,' : '';
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', it.out, '-af', `${tone}volume=${gain}dB,alimiter=limit=0.84:attack=2:release=50:level=false`, '-ar', '48000', norm], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`${it.id}: ${r.stderr}`);
    }
    return { id: it.id, scene: s.id, text: it.shown, said: it.text, path: path.relative(projectDir, norm), start_s: start, secs, scene_end_s: s.start_s + s.duration_s };
  });
  const problems = [];
  out.forEach((v, i) => {
    if (v.start_s + v.secs > v.scene_end_s + 0.35) problems.push(`${v.id} (${v.scene}) runs ${(v.start_s + v.secs - v.scene_end_s).toFixed(2)} s past its scene`);
    const next = out[i + 1];
    if (next && v.start_s + v.secs > next.start_s - 0.15) problems.push(`${v.id} runs into ${next.id}`);
  });
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ voice: spec, lines: out }, null, 1));
  for (const v of out) log(`${v.id} ${v.scene.padEnd(16)} ${v.start_s.toFixed(2)}–${(v.start_s + v.secs).toFixed(2)} s  "${v.text}"`);
  log(problems.length ? `problems:\n- ${problems.join('\n- ')}` : 'every line fits its scene');
  return { lines: out, problems };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const projectDir = path.resolve(args.find((a) => !a.startsWith('--')));
  const vi = args.indexOf('--voice');
  voiceover(projectDir, { voice: vi >= 0 ? args[vi + 1] : null }).then((r) => { process.exitCode = r.problems.length ? 1 : 0; }).catch((e) => { console.error(`Stopped: ${e.message}`); process.exit(1); });
}
