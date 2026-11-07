// Ultrademo TTS step.
// Reads a project storyboard, narrates every unit (scene lines, intro/outro slides) through
// the chosen voice provider, and writes audio/audioDuration/words back into the storyboard.
//
// Voice is chosen, never guessed: --voice <spec>, else ULTRADEMO_VOICE in .env, else the
// storyboard's own `voice`, else a menu with the setup command for each tier. Specs:
//   pocket:eve | pocket:george         default free tier (CPU)         npm run voice -- setup pocket
//   chatterbox:default                 expressive free tier (GPU)      npm run voice -- setup chatterbox
//   chatterbox:clone=<10s.wav>         expressive, cloned voice
//   elevenlabs[:<voiceId>]             premium, ELEVENLABS_API_KEY in .env
//   say                                macOS placeholder
//
// Pipeline (tts/narration.mjs): sentence chunks -> synth (cached) -> align + audit -> regenerate
// divergent chunks -> pace + loudness normalise -> join. Unchanged lines are fully cached.
//
// Usage: npm run tts -- <project> [--voice <spec>] [--redo <sceneId,...|all>] [--only <sceneId,...>]
//   --only synthesises just those units (the one voice-sample line heard at gate 2) and leaves the rest untouched.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync, renameSync} from 'node:fs';
import path from 'node:path';
import {resolveProvider} from './providers.mjs';
import {synthesizeUnits, pronouncer} from './narration.mjs';

const args = process.argv.slice(2);
const project = args.find((a) => !a.startsWith('--'));
if (!project) {
  console.error('Usage: npm run tts -- <project> [--voice <spec>] [--redo <sceneId,sceneId|all>] (slide ids: intro-slide, outro-slide)');
  process.exit(1);
}
const flag = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const redoArg = flag('redo');
const redo = new Set(redoArg ? redoArg.split(',') : []);
const onlyArg = flag('only');
const only = new Set(onlyArg ? onlyArg.split(',') : []);

const assetsDir = path.resolve('projects', project, 'assets');
const sbPath = path.join(assetsDir, 'storyboard.json');
const storyboard = JSON.parse(readFileSync(sbPath, 'utf8'));
const audioDir = path.join(assetsDir, 'audio');
mkdirSync(audioDir, {recursive: true});

const spec = flag('voice') || process.env.ULTRADEMO_VOICE || storyboard.voice;
if (!spec) {
  console.error(
    'No voice chosen. Pick a tier (nothing is downloaded until you do):\n' +
      '  pocket:eve | pocket:george     free, runs on any laptop CPU (~0.5 GB)   -> npm run voice -- setup pocket\n' +
      '  chatterbox:default             free, expressive, needs GPU/Apple silicon (~4 GB) -> npm run voice -- setup chatterbox\n' +
      '  elevenlabs[:<voiceId>]         premium, your own key in .env\n' +
      '  say                            macOS placeholder, no install\n' +
      'Then: npm run tts -- <project> --voice <spec>   (or set ULTRADEMO_VOICE in .env)',
  );
  process.exit(1);
}
const provider = resolveProvider(spec);
if (provider.ready && !provider.ready()) {
  console.error(`${provider.label} is not set up yet. Run: ${provider.setupHint}`);
  process.exit(1);
}
console.log(`TTS: ${provider.label}`);

// Narratable units: every scene, plus the intro/outro slides when they carry a script.
const units = [
  ...(storyboard.intro?.script ? [{id: 'intro-slide', obj: storyboard.intro}] : []),
  ...storyboard.scenes.filter((s) => !s.skip).map((scene) => ({id: scene.id, obj: scene})),
  ...(storyboard.outro?.script ? [{id: 'outro-slide', obj: storyboard.outro}] : []),
].filter((u) => u.obj.script).filter((u) => !only.size || only.has(u.id));
if (only.size && !units.length) { console.error(`--only: none of ${[...only].join(', ')} is a narrated unit`); process.exit(1); }

const force = new Set(redo.has('all') ? units.map((u) => u.id) : [...redo]);
const results = await synthesizeUnits(
  provider,
  units.map((u) => ({id: u.id, text: u.obj.script})),
  {cacheDir: path.join(audioDir, '.chunks'), outDir: audioDir, log: (m) => console.log(m), force, onEngine: (o) => console.log(`  engine ${o.engine} on ${o.device}, ${o.sample_rate} Hz`),
   // storyboard.pronunciations: {"timeline": "time-line"}; engine input only, captions and audit keep the script
   pronounce: pronouncer(storyboard.pronunciations)},
);
if (storyboard.pronunciations && Object.keys(storyboard.pronunciations).length) console.log(`  pronunciations applied: ${Object.entries(storyboard.pronunciations).map(([k, v]) => `${k} → ${v}`).join(', ')}`);

const report = {voice: provider.id, generated: new Date().toISOString(), units: {}};
let failed = 0;
for (const {id, obj: scene} of units) {
  const r = results.get(id);
  if (!r?.ok) { failed++; console.log(`${id}: FAILED ${r?.error ?? ''}`); continue; }
  const rel = `audio/${id}.mp3`;
  const mp3 = path.join(assetsDir, rel);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', r.audio, '-codec:a', 'libmp3lame', '-q:a', '3', mp3]);
  scene.audio = rel;
  scene.audioDuration = r.secs;
  if (r.words) { scene.words = r.words; writeFileSync(`${mp3}.words.json`, JSON.stringify(r.words)); } else delete scene.words;
  report.units[id] = {secs: r.secs, chunks: r.chunks, flags: r.flags, warnings: r.warnings, words: Boolean(r.words)};
  const tag = [r.cached ? 'cached' : null, r.words ? '+words' : 'static captions', r.flags.length ? `FLAGGED ${r.flags.length}` : null].filter(Boolean).join(', ');
  console.log(`${id}: ${r.secs.toFixed(2)}s (${tag})`);
  for (const f of r.flags) console.log(`    ! ${f}`);
  for (const w of r.warnings) console.log(`    · ${w}`);
}
storyboard.voice = provider.id;
// A partial run (--only) merges into the existing report instead of replacing it.
const reportPath = path.join(audioDir, 'report.json');
if (only.size && existsSync(reportPath)) { const prev = JSON.parse(readFileSync(reportPath, 'utf8')); report.units = {...(prev.units || {}), ...report.units}; }
writeFileSync(reportPath, JSON.stringify(report, null, 2));

// atomic write: a crash mid-write must never truncate the storyboard
writeFileSync(`${sbPath}.tmp`, JSON.stringify(storyboard, null, 2));
renameSync(`${sbPath}.tmp`, sbPath);
console.log(`storyboard.json updated (${units.length - failed}/${units.length} units)${failed ? '; some units failed, see above' : ''}`);
const flagged = Object.values(report.units).filter((u) => u.flags.length).length;
if (flagged) console.log(`${flagged} unit(s) carry audit flags: listen to them on the review page before rendering (npm run review -- ${project}).`);
process.exit(failed ? 1 : 0);
