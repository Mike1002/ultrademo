// The voice catalogue (tts/voices.json, D-71): the voices a user can hear and pick at intake, each with one sample
// reading the same line (tts/samples/<id>.mp3, made by scripts/voice-samples.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CATALOGUE_FILE = path.join(HERE, 'voices.json');
export const SAMPLES_DIR = path.join(HERE, 'samples');
export const FREE_PROVIDERS = new Set(['pocket', 'chatterbox', 'say']);

export const loadCatalogue = () => JSON.parse(fs.readFileSync(CATALOGUE_FILE, 'utf8'));

/** True when ElevenLabs can be used: a key is in this process's environment, or filled in in the workspace's .env (read
 * fresh, so a key saved while a page is open counts at once). Only whether it is there is looked at; the key never leaves. */
export const ENV_FILE = path.join(HERE, '..', '.env');
export const elevenlabsReady = (env = process.env, file = ENV_FILE) => {
  if (env.ELEVENLABS_API_KEY && String(env.ELEVENLABS_API_KEY).trim()) return true;
  // [ \t]* and not \s*: \s would run past an empty line's end into the next line and count that as the key
  try { return /^ELEVENLABS_API_KEY=[ \t]*\S/m.test(fs.readFileSync(file, 'utf8')); } catch { return false; }
};

// The free voices come in two sets (set up at install, or when a voice from a set is picked on the brief):
//   small: Pocket, any computer, about 1.6 GB with the word-timing aligner   npm run setup -- --voices
//   all:   adds Chatterbox (James, Maria, Cori), Apple silicon or NVIDIA      npm run setup -- --voices=all
export const VOICE_SETS = {
  pocket: { set: 'small', size: 'about 1.6 GB', setup: 'npm run setup -- --voices' },
  chatterbox: { set: 'all', size: 'about 4 GB more', setup: 'npm run setup -- --voices=all' },
};
const envReady = (engine) => ['bin/python', 'Scripts/python.exe'].some((p) => fs.existsSync(path.join(HERE, '..', 'voice', '.envs', engine, p)));
/** Whether Chatterbox can run at a usable speed here: Apple silicon, or an NVIDIA card. */
let capableCache = null;
export const chatterboxCapable = () => (capableCache ??= (process.platform === 'darwin' && process.arch === 'arm64')
  || spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore' }).status === 0);
/** Which free voice engines are set up on this machine, and whether Chatterbox could be. */
export const engineState = () => ({ pocket: envReady('pocket'), chatterbox: envReady('chatterbox'), capable: chatterboxCapable(), say: process.platform === 'darwin' });

/** The voices this user can pick: the free ones (Chatterbox only where it can run), ElevenLabs ones when a key is present;
 * each with its sample file, whether it is ready to use, what setting it up costs, and the recommended pick per gender
 * (the house voice; for the free male voice, James when Chatterbox is set up, else George). */
export function voiceOptions({ elevenlabs = elevenlabsReady(), engines = engineState() } = {}) {
  const list = loadCatalogue().voices
    .filter((v) => (FREE_PROVIDERS.has(v.provider) && (v.provider !== 'chatterbox' || engines.capable || engines.chatterbox)) || (v.provider === 'elevenlabs' && elevenlabs))
    .map((v) => {
      const paid = !FREE_PROVIDERS.has(v.provider);
      const ready = paid ? true : Boolean(engines[v.provider]);
      // Maria and Cori are clones: on top of James's model they need the clone model (about 4 GB more), fetched with --clone
      const cloned = v.provider === 'chatterbox' && String(v.spec || '').includes('clone=');
      const setup = ready ? null : cloned ? { ...VOICE_SETS.chatterbox, size: 'about 8 GB more' } : VOICE_SETS[v.provider] || null;
      return { ...v, paid, ready, setup, sample: fs.existsSync(path.join(SAMPLES_DIR, `${v.id}.mp3`)) ? `${v.id}.mp3` : null };
    });
  const pick = (gender, paid) => {
    const of = list.filter((v) => v.gender === gender && v.paid === paid);
    if (paid) return of.find((v) => v.house) || of[0];
    // free: the house voice when its engine is ready; else the stand-in of the small set (house_fallback), else the house voice
    return of.find((v) => v.house && v.ready) || of.find((v) => v.house_fallback) || of.find((v) => v.house) || of[0];
  };
  const rec = new Set(['female', 'male'].flatMap((g) => [pick(g, true), pick(g, false)]).filter(Boolean).map((v) => v.id));
  return list.map((v) => ({ ...v, recommended: rec.has(v.id) }));
}

export const findVoice = (id) => loadCatalogue().voices.find((v) => v.id === id) || null;

/** The default pick: the recommended voice for the gender preference (female when none), paid when a key is present. */
export function defaultVoice(preference = 'none', { elevenlabs = elevenlabsReady(), engines = engineState() } = {}) {
  const gender = preference === 'male' ? 'male' : 'female';
  const options = voiceOptions({ elevenlabs, engines });
  return options.find((v) => v.recommended && v.gender === gender && v.paid === elevenlabs) || options.find((v) => v.recommended && v.gender === gender) || options[0] || null;
}
