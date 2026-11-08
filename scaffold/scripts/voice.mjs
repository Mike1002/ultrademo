// Voice tier setup: one uv-managed Python environment per engine under voice/.envs/.
// Nothing is downloaded until the user picks a tier; this prints what a tier costs first.
//
//   npm run voice -- status
//   npm run voice -- setup pocket | chatterbox | align        (align = word timings + audit for any local voice)
//   npm run voice -- warm pocket | chatterbox                 (fetch the model weights now instead of on first use)
//   npm run voice -- warm chatterbox --clone                  (the cloned voices' model too: Maria, Cori)
//   npm run voice -- check elevenlabs                         (the key in .env is there and accepted; never printed)
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ENVS_DIR, VOICE_DIR, envPython, runJsonLines} from '../tts/providers.mjs';

const ENGINES = {
  pocket: {python: '3.12', env: 'pocket.txt', weights: '0.45 GB (Pocket TTS model + voice embeddings)', pkgs: '0.8 GB', note: 'runs on any CPU, about 0.15x realtime'},
  chatterbox: {python: '3.11', env: 'chatterbox.txt', weights: '3.2 GB default voice, +4.0 GB for clones (Chatterbox-Turbo)', pkgs: '1.0 GB (PyTorch)', note: 'usable speed needs CUDA or Apple silicon; on a plain CPU it is several times slower than realtime'},
  align: {python: '3.12', env: 'align.txt', weights: '0.15 GB (faster-whisper base.en)', pkgs: '0.2 GB', note: 'required for word-timed captions and the narration audit on every local voice'},
};

const findUv = () => {
  for (const c of ['uv', path.join(os.homedir(), '.local', 'bin', 'uv'), path.join(os.homedir(), '.cargo', 'bin', 'uv')]) {
    const r = spawnSync(c, ['--version'], {stdio: 'pipe'});
    if (r.status === 0) return c;
  }
  return null;
};
const uvInstallHint = process.platform === 'win32'
  ? 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
  : 'curl -LsSf https://astral.sh/uv/install.sh | sh    (or: brew install uv)';

const [cmd = 'status', engine] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (cmd === 'status') {
  const uv = findUv();
  console.log(`uv: ${uv ? execFileSync(uv, ['--version']).toString().trim() : 'not installed  -> ' + uvInstallHint}`);
  for (const [name, e] of Object.entries(ENGINES)) {
    const py = envPython(name);
    console.log(`${name.padEnd(11)} ${py ? 'ready' : 'not set up'}   packages ${e.pkgs}, weights ${e.weights}; ${e.note}`);
  }
  process.exit(0);
}

// npm run voice -- check elevenlabs: is the key in .env there, and does ElevenLabs accept it? Never prints the key.
if (cmd === 'check' && engine === 'elevenlabs') {
  const key = String(process.env.ELEVENLABS_API_KEY || '').trim();
  const where = path.join(VOICE_DIR, '..', '.env');
  if (!key) { console.log(`No ElevenLabs key yet: paste it after ELEVENLABS_API_KEY= in ${where} and save, then run this again.`); process.exit(1); }
  let res;
  try { res = await fetch('https://api.elevenlabs.io/v1/models', {headers: {'xi-api-key': key}, signal: AbortSignal.timeout(15000)}); }
  catch { console.log('Could not reach ElevenLabs (offline?). The key is in .env; it is checked again at the voiceover.'); process.exit(2); }
  if (res.ok) { console.log('ElevenLabs key works: the paid voices are ready.'); process.exit(0); }
  let status = '';
  try { status = (await res.json())?.detail?.status || ''; } catch {}
  if (status === 'missing_permissions') { console.log('ElevenLabs accepts the key, but it is restricted: allow Text to Speech, Voices and Sound Effects for it in your ElevenLabs settings (API keys).'); process.exit(1); }
  console.log(`ElevenLabs did not accept the key (${res.status}${status ? `, ${status}` : ''}): check it was pasted whole after ELEVENLABS_API_KEY= in ${where}, with nothing else on that line.`);
  process.exit(1);
}

if (!ENGINES[engine]) {
  console.error(`Usage: npm run voice -- setup|warm <${Object.keys(ENGINES).join('|')}>  |  npm run voice -- status`);
  process.exit(1);
}
const e = ENGINES[engine];

if (cmd === 'setup') {
  const uv = findUv();
  if (!uv) {
    console.error(`uv is required to manage the voice environments and is not installed.\nInstall it (single binary, macOS/Linux/Windows), then re-run:\n  ${uvInstallHint}`);
    process.exit(1);
  }
  const dir = path.join(ENVS_DIR, engine);
  mkdirSync(ENVS_DIR, {recursive: true});
  console.log(`Setting up ${engine}: packages about ${e.pkgs} now; model weights (${e.weights}) download on first use or with: npm run voice -- warm ${engine}`);
  console.log(`  ${e.note}`);
  execFileSync(uv, ['venv', '--python', e.python, dir], {stdio: 'inherit'});
  const py = envPython(engine);
  execFileSync(uv, ['pip', 'install', '--python', py, '-r', path.join(VOICE_DIR, 'engines', e.env)], {stdio: 'inherit'});
  console.log(`${engine} ready at ${dir}`);
  process.exit(0);
}

if (cmd === 'warm') {
  const py = envPython(engine);
  if (!py) { console.error(`${engine} is not set up. Run: npm run voice -- setup ${engine}`); process.exit(1); }
  console.log(`Fetching ${engine} weights (${e.weights}). This is the one-time download.`);
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ultrademo-warm-'));
  if (engine === 'align') {
    const wav = path.join(tmp, 'silence.wav');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '1', wav]);
    await runJsonLines(py, path.join(VOICE_DIR, 'align.py'), {model: 'base.en', items: [{id: 'warm', wav, text: 'hello'}]});
  } else {
    // --clone: the cloned voices' model (Maria, Cori; about 4 GB more), warmed with one of their own references
    const reference = path.join(VOICE_DIR, '..', 'tts', 'references', 'maria-kasper.wav');
    const clone = engine === 'chatterbox' && process.argv.includes('--clone');
    if (clone && !existsSync(reference)) { console.error(`The clone reference is missing: ${reference}`); process.exit(1); }
    const job = engine === 'pocket' ? {engine, voice: 'eve'}
      : clone ? {engine, voice: 'clone', reference, params: {exaggeration: 0.5, cfg_weight: 0.5}}
      : {engine, voice: 'default', params: {exaggeration: 0.5, cfg_weight: 0.5}};
    await runJsonLines(py, path.join(VOICE_DIR, 'synth.py'), {...job, items: [{id: 'warm', text: 'Ready.', out: path.join(tmp, 'warm.wav')}]}, {onLine: (o) => { if (o.done) console.log(`  device ${o.device}, sample rate ${o.sample_rate}`); }});
  }
  console.log(`${engine} weights are in place.`);
  process.exit(0);
}
console.error(`Unknown command ${cmd}`);
process.exit(1);
