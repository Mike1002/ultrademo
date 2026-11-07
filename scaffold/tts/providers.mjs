// Voice providers behind one shape (the `VoiceProvider` contract,
// adapted to the skill): every provider turns text into WAV files in a batch and says whether
// it returned native word timings. Chunking, caching, the alignment audit, pace and loudness
// live in narration.mjs, not here.
//
// A provider spec is a string the user or the skill chooses at intake:
//   pocket:eve | pocket:george | pocket:<path.wav>       default free tier, CPU
//   chatterbox:default | chatterbox:clone=<path.wav>     expressive free tier, GPU / Apple silicon
//   elevenlabs | elevenlabs:<voiceId>                    premium, user's own key in .env
//   say | say:<macOS voice>                              zero-install placeholder (macOS only)
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VOICE_DIR = path.join(ROOT, 'voice');
export const ENVS_DIR = path.join(VOICE_DIR, '.envs');

export const envPython = (engine) => {
  const dir = path.join(ENVS_DIR, engine);
  const bin = process.platform === 'win32' ? path.join(dir, 'Scripts', 'python.exe') : path.join(dir, 'bin', 'python');
  return existsSync(bin) ? bin : null;
};

const toWav = (input, out) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-ac', '1', out]);

// Run a batch Python job that prints one JSON line per item; resolve to a Map id -> line.
export const runJsonLines = (python, script, job, {onLine} = {}) =>
  new Promise((resolve, reject) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ultrademo-voice-'));
    const jobFile = path.join(dir, 'job.json');
    writeFileSync(jobFile, JSON.stringify(job));
    const child = spawn(python, [script, jobFile], {env: {...process.env, HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET ?? '1', PYTHONUNBUFFERED: '1'}});
    const out = new Map();
    let buf = '', errBuf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.done !== undefined) out.set('__done', obj);
          else out.set(obj.id, obj);
          onLine?.(obj);
        } catch {}
      }
    });
    child.stderr.on('data', (d) => { errBuf += d.toString(); if (errBuf.length > 20000) errBuf = errBuf.slice(-20000); });
    child.on('error', reject);
    child.on('close', (code) => {
      const done = out.get('__done');
      if (!done || code !== 0 && !done.done) {
        const tail = errBuf.split('\n').filter((l) => l && !/warn/i.test(l)).slice(-12).join('\n');
        return reject(new Error(`${path.basename(script)} exited ${code} before finishing.\n${tail}`));
      }
      resolve(out);
    });
  });

const elevenlabsWords = (al) => {
  if (!al?.characters?.length) return null;
  const {characters: ch, character_start_times_seconds: st, character_end_times_seconds: en} = al;
  const words = [];
  let cur = null;
  for (let i = 0; i < ch.length; i++) {
    if (/\s/.test(ch[i])) { if (cur) { words.push(cur); cur = null; } continue; }
    if (!cur) cur = {w: '', start: st[i], end: en[i]};
    cur.w += ch[i]; cur.end = en[i];
  }
  if (cur) words.push(cur);
  return words.length ? words : null;
};

export function resolveProvider(spec) {
  const [engine, ...rest] = String(spec || '').split(':');
  const arg = rest.join(':');
  switch (engine) {
    case 'elevenlabs': {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) throw new Error('ELEVENLABS_API_KEY is not set. Add it to .env (never paste it in chat).');
      const voiceId = arg || process.env.ELEVENLABS_VOICE_ID || 'UM3TOcm5kcELI84GFoAz';
      const model = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2';
      const stability = process.env.ELEVENLABS_STABILITY ?? '0.45';
      const similarity = process.env.ELEVENLABS_SIMILARITY ?? '0.75';
      return {
        id: `elevenlabs:${voiceId}`, kind: 'cloud', native: true, chunked: false, paceBand: null,
        sig: `elevenlabs:${voiceId}:${model}:${stability}:${similarity}`,
        label: `ElevenLabs (voice ${voiceId})`, paid: true,
        async synthesizeMany(items) {
          const out = new Map();
          for (const it of items) {
            const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
              method: 'POST', headers: {'xi-api-key': key, 'Content-Type': 'application/json'},
              body: JSON.stringify({text: it.text, model_id: model, voice_settings: {stability: Number(stability), similarity_boost: Number(similarity)}}),
            });
            if (!res.ok) { out.set(it.id, {ok: false, error: `ElevenLabs ${res.status}: ${await res.text()}`}); continue; }
            const data = await res.json();
            const mp3 = it.out.replace(/\.wav$/, '.src.mp3');
            await writeFile(mp3, Buffer.from(data.audio_base64, 'base64'));
            toWav(mp3, it.out);
            out.set(it.id, {ok: true, words: elevenlabsWords(data.alignment)});
          }
          return out;
        },
      };
    }
    case 'pocket': {
      const voice = arg || 'eve';
      const python = envPython('pocket');
      return {
        id: `pocket:${voice}`, kind: 'local', native: false, chunked: true, paceBand: [170, 215],
        sig: `pocket:3.3.0:${voice}`, label: `Pocket TTS (${voice}, local CPU)`, paid: false,
        ready: () => Boolean(python), setupHint: 'npm run voice -- setup pocket',
        async synthesizeMany(items, {onLine} = {}) {
          const res = await runJsonLines(python, path.join(VOICE_DIR, 'synth.py'), {engine: 'pocket', voice, items}, {onLine});
          return new Map(items.map((it) => [it.id, res.get(it.id) ?? {ok: false, error: 'no result'}]));
        },
      };
    }
    case 'chatterbox': {
      const python = envPython('chatterbox');
      // a clone reference: an absolute path, a path from where the command runs, or one inside the skill (tts/references/...)
      const ref = arg.startsWith('clone=') ? arg.slice(6) : null;
      const clone = ref ? (existsSync(path.resolve(ref)) ? path.resolve(ref) : path.join(ROOT, ref)) : null;
      const voice = clone ? 'clone' : 'default';
      const params = {exaggeration: Number(process.env.CHATTERBOX_EXAGGERATION ?? 0.5), cfg_weight: Number(process.env.CHATTERBOX_CFG ?? 0.5)};
      if (clone && !existsSync(clone)) throw new Error(`Chatterbox clone reference not found: ${clone}`);
      return {
        id: clone ? `chatterbox:clone=${path.basename(clone)}` : 'chatterbox:default', kind: 'local', native: false, chunked: true,
        // The default voice reads at ~256 wpm; stretch into this band.
        paceBand: [210, 230],
        sig: `chatterbox:0.1.7:${voice}:${clone ? readFileSync(clone).length : ''}:${params.exaggeration}:${params.cfg_weight}`,
        label: clone ? `Chatterbox-Turbo clone of ${path.basename(clone)} (local GPU)` : 'Chatterbox default voice (local GPU)', paid: false,
        ready: () => Boolean(python), setupHint: 'npm run voice -- setup chatterbox',
        async synthesizeMany(items, {onLine} = {}) {
          const res = await runJsonLines(python, path.join(VOICE_DIR, 'synth.py'), {engine: 'chatterbox', voice, reference: clone, params, items}, {onLine});
          return new Map(items.map((it) => [it.id, res.get(it.id) ?? {ok: false, error: 'no result'}]));
        },
      };
    }
    case 'say': {
      if (process.platform !== 'darwin') throw new Error('say is macOS only. Choose pocket, chatterbox or elevenlabs.');
      const voice = arg || null;
      return {
        id: voice ? `say:${voice}` : 'say', kind: 'placeholder', native: false, chunked: true, paceBand: null,
        sig: `say:${voice ?? 'default'}`, label: 'macOS say (placeholder voice)', paid: false, ready: () => true,
        async synthesizeMany(items) {
          const out = new Map();
          for (const it of items) {
            const aiff = it.out.replace(/\.wav$/, '.aiff');
            execFileSync('say', [...(voice ? ['-v', voice] : []), '-o', aiff, it.text]);
            toWav(aiff, it.out);
            out.set(it.id, {ok: true, words: null});
          }
          return out;
        },
      };
    }
    default:
      throw new Error(`Unknown voice "${spec}". Use pocket:<voice>, chatterbox:default, chatterbox:clone=<wav>, elevenlabs[:<voiceId>] or say.`);
  }
}

// Parity with the app's VoiceProvider contract (app/src/server/media/contracts.ts): the same shape
// with the app's method names, layered over the batch call the skill uses internally.
//   listVoices() -> [{id, name, language}]
//   synthesize({text, voiceId, language}) -> {audio: Buffer (wav), mime, wordTimestamps: [{word, start, end}]}
//   clone({audio, name, consent}) -> Voice   (Chatterbox only; consent must be true)
export function asContract(provider) {
  const voices = {
    pocket: [{id: 'eve', name: 'Eve', language: 'en'}, {id: 'george', name: 'George', language: 'en'}],
    chatterbox: [{id: 'default', name: 'Chatterbox default', language: 'en'}],
    say: [], elevenlabs: [],
  };
  const engine = provider.id.split(':')[0];
  return {
    id: provider.id,
    async listVoices() { return voices[engine] ?? []; },
    async synthesize({text, voiceId, language = 'en'}) {
      const {mkdtempSync, readFileSync} = await import('node:fs');
      const dir = mkdtempSync(path.join(os.tmpdir(), 'ultrademo-synth-'));
      const out = path.join(dir, 'line.wav');
      const res = await provider.synthesizeMany([{id: 'line', text, out}]);
      const r = res.get('line');
      if (!r?.ok) throw new Error(r?.error ?? 'synthesis failed');
      let words = r.words ?? null;
      if (!words && alignPython()) {
        const a = (await runAlign([{id: 'line', wav: out, text}])).get('line');
        words = a?.ok ? a.words : null;
      }
      return {audio: readFileSync(out), mime: 'audio/wav', wordTimestamps: (words ?? []).map((w) => ({word: w.w, start: w.start, end: w.end})), voiceId, language};
    },
    async clone({audio, name, consent}) {
      if (!consent) throw new Error('clone requires consent: true from the voice owner');
      if (engine !== 'chatterbox') throw new Error(`${engine} cannot clone voices; use chatterbox`);
      const {mkdirSync, writeFileSync} = await import('node:fs');
      const dir = path.join(VOICE_DIR, 'references');
      mkdirSync(dir, {recursive: true});
      const file = path.join(dir, `${name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.wav`);
      writeFileSync(file, audio);
      return {id: `chatterbox:clone=${file}`, name, language: 'en', requiresVerification: true};
    },
  };
}

// The alignment audit runs for every non-native provider when the align environment exists.
export const alignPython = () => envPython('align');
export const runAlign = (items, {onLine} = {}) => runJsonLines(alignPython(), path.join(VOICE_DIR, 'align.py'), {model: process.env.ULTRADEMO_ALIGN_MODEL ?? 'base.en', items}, {onLine});
