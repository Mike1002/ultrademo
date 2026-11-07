// The voice catalogue (tts/voices.json, D-71): the voices a user can hear and pick at intake, each with one sample
// reading the same line (tts/samples/<id>.mp3, made by scripts/voice-samples.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CATALOGUE_FILE = path.join(HERE, 'voices.json');
export const SAMPLES_DIR = path.join(HERE, 'samples');
export const FREE_PROVIDERS = new Set(['pocket', 'chatterbox', 'say']);

export const loadCatalogue = () => JSON.parse(fs.readFileSync(CATALOGUE_FILE, 'utf8'));

/** True when the process can use ElevenLabs: a key is in its environment. The key itself never leaves this check. */
export const elevenlabsReady = (env = process.env) => Boolean(env.ELEVENLABS_API_KEY && String(env.ELEVENLABS_API_KEY).trim());

/** The voices this user can pick: the free ones always, ElevenLabs ones when a key is present; each with its sample file if made. */
export function voiceOptions({ elevenlabs = elevenlabsReady() } = {}) {
  return loadCatalogue().voices
    .filter((v) => FREE_PROVIDERS.has(v.provider) || (v.provider === 'elevenlabs' && elevenlabs))
    .map((v) => ({ ...v, paid: !FREE_PROVIDERS.has(v.provider), sample: fs.existsSync(path.join(SAMPLES_DIR, `${v.id}.mp3`)) ? `${v.id}.mp3` : null }));
}

export const findVoice = (id) => loadCatalogue().voices.find((v) => v.id === id) || null;

/** The default pick: the house voice for the gender preference (female when none), paid when a key is present. */
export function defaultVoice(preference = 'none', { elevenlabs = elevenlabsReady() } = {}) {
  const gender = preference === 'male' ? 'male' : 'female';
  const options = voiceOptions({ elevenlabs });
  return options.find((v) => v.house && v.gender === gender && (elevenlabs ? v.paid : !v.paid)) || options.find((v) => v.house && v.gender === gender) || options[0] || null;
}
