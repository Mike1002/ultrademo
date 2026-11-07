// Narration pipeline for one unit (a scene line or a slide line), provider-agnostic.
//
//   chunk -> synthesize (cached per chunk) -> align + audit -> regenerate divergent chunks
//        -> pace-normalise (pitch-preserving tempo stretch) -> loudness-normalise -> join
//
// Why chunks: local engines drift in pace across a long line and occasionally re-read a
// phrase; per-sentence generation keeps pace even, makes repeats rare, and lets the audit
// regenerate just the bad sentence. ElevenLabs is not chunked (native timings, one call).
// Raw synthesis is cached by (provider signature + chunk text + attempt); post-processing is
// derived from the cache, so changing the loudness target never re-bills a cloud voice.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {runAlign, alignPython} from './providers.mjs';

export const GAP_SECONDS = 0.35;        // silence between sentences inside one line
export const LOUDNESS_TARGET = -20;     // LUFS integrated; ElevenLabs voices land here
export const TRUE_PEAK = -1.5;          // dBTP
export const AUDIT_MIN_SIMILARITY = 0.9;
export const MAX_ATTEMPTS = 3;

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24);
const probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const wordsIn = (t) => t.trim().split(/\s+/).filter(Boolean).length;

// Split a narration line into sentences; long sentences split at " - " or "; "; tiny fragments merge back.
export function chunkText(text) {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
  const out = [];
  for (let p of parts) {
    if (wordsIn(p) > 28) {
      const sub = p.split(/\s+-\s+|;\s+/).filter(Boolean);
      if (sub.length > 1) { out.push(...sub.map((s) => s.trim())); continue; }
    }
    out.push(p.trim());
  }
  const merged = [];
  for (const p of out) {
    if (merged.length && wordsIn(p) < 3) merged[merged.length - 1] += ' ' + p;
    else merged.push(p);
  }
  return merged.filter(Boolean);
}

// A chunk fails the audit when the transcript diverges from the script by more than a word
// or two: a repeated or dropped phrase. Single-word replaces are pronunciation findings, kept
// as warnings (the user hears them in review), not regeneration triggers.
// Fail on a repeated or dropped phrase (a divergence of three words or more), or on two or more
// differing words when the ratio is also low. A single misheard word in a short sentence is a
// pronunciation warning, not a regeneration trigger: the transcriber is less reliable than the voice.
const auditVerdict = (a) => {
  if (!a?.ok) return {pass: true, reasons: ['not audited']};
  const reasons = [];
  const divs = a.divergences || [];
  const span = (d) => Math.max(wordsIn(d.script), wordsIn(d.heard));
  const differing = divs.reduce((n, d) => n + span(d), 0);
  for (const d of divs) if (span(d) >= 3) reasons.push(`${d.type} at ${d.at}s: script "${d.script}" heard "${d.heard}"`);
  if (a.similarity < AUDIT_MIN_SIMILARITY && differing >= 2 && !reasons.length) reasons.push(`similarity ${a.similarity} with ${differing} differing words`);
  return {pass: reasons.length === 0, reasons, warnings: divs.filter((d) => span(d) < 3).map((d) => `${d.type} at ${d.at}s: script "${d.script}" heard "${d.heard}"`)};
};

/**
 * Synthesize all units for a provider. units: [{id, text}] ; returns Map id -> result
 *   {audio (wav path), words|null, secs, chunks:[...], flags:[...], warnings:[...], cached}
 */
// Pronunciation map (storyboard.pronunciations: {"timeline": "time-line"}): applied to the text the
// engine hears, never to captions or to the audit, which keep the script. Whole words, case-insensitive.
export const pronouncer = (map = {}) => {
  const entries = Object.entries(map).filter(([k, v]) => k && typeof v === 'string');
  if (!entries.length) return (t) => t;
  const rx = entries.map(([k, v]) => [new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), v]);
  return (t) => rx.reduce((s, [r, v]) => s.replace(r, v), t);
};

export async function synthesizeUnits(provider, units, {cacheDir, outDir, log = () => {}, force = new Set(), onEngine = () => {}, pronounce = (t) => t}) {
  mkdirSync(cacheDir, {recursive: true});
  mkdirSync(outDir, {recursive: true});
  const audit = provider.native ? false : Boolean(alignPython());
  if (!provider.native && !audit) log('  (align environment missing: captions will be static and the narration audit is skipped; run `npm run voice -- setup align`)');

  // 1. Plan chunks and find what is already cached.
  const plan = [];
  for (const u of units) {
    const chunks = provider.chunked ? chunkText(u.text) : [u.text];
    chunks.forEach((text, i) => plan.push({unit: u.id, i, text, engineText: pronounce(text), attempt: 0}));
  }
  const rawPath = (c) => path.join(cacheDir, `${sha(`${provider.sig}\n${c.engineText}\n${c.attempt}`)}.wav`);
  const metaPath = (c) => rawPath(c).replace(/\.wav$/, '.json');
  const needs = plan.filter((c) => force.has(c.unit) || !existsSync(rawPath(c)) || !existsSync(metaPath(c)));

  // 2. Synthesize, audit, regenerate (bounded). Each loop handles only the chunks still failing.
  let pending = needs.map((c) => ({...c}));
  for (let attempt = 0; attempt < MAX_ATTEMPTS && pending.length; attempt++) {
    const items = pending.map((c) => ({id: `${c.unit}#${c.i}`, text: c.engineText, out: rawPath(c), seed: attempt ? 1000 + attempt * 7919 + c.i : null}));
    log(`  synthesizing ${items.length} chunk(s)${attempt ? ` (attempt ${attempt + 1})` : ''} with ${provider.label}`);
    const res = await provider.synthesizeMany(items, {onLine: (o) => { if (o.id && !o.ok) log(`    ${o.id}: ${o.error}`); if (o.done && o.device && attempt === 0) onEngine(o); }});
    let aligned = new Map();
    if (audit) {
      const ok = items.filter((it) => res.get(it.id)?.ok);
      if (ok.length) {
        // Audit against the script, not the respelled engine text.
        const scriptOf = new Map(pending.map((c) => [`${c.unit}#${c.i}`, c.text]));
        aligned = await runAlign(ok.map((it) => ({id: it.id, wav: it.out, text: scriptOf.get(it.id) ?? it.text})));
        const broken = [...aligned.values()].filter((a) => a && a.ok === false);
        if (broken.length) log(`    alignment failed for ${broken.length}/${ok.length} chunk(s): ${broken[0].error} (captions stay static, audit skipped; re-run npm run voice -- setup align)`);
      }
    }
    const next = [];
    for (const c of pending) {
      const id = `${c.unit}#${c.i}`;
      const r = res.get(id);
      if (!r?.ok) { next.push(c); continue; }
      const a = aligned.get(id) ?? null;
      const verdict = auditVerdict(a);
      const meta = {text: c.text, engineText: c.engineText !== c.text ? c.engineText : undefined, attempt: c.attempt, secs: probe(rawPath(c)), words: r.words ?? a?.words ?? null, audit: a ? {similarity: a.similarity, heard: a.heard, divergences: a.divergences} : null, verdict};
      writeFileSync(metaPath(c), JSON.stringify(meta));
      if (!verdict.pass && attempt < MAX_ATTEMPTS - 1) {
        log(`    ${id}: audit failed (${verdict.reasons.join('; ')}), regenerating`);
        const retry = {...c, attempt: c.attempt + 1};
        next.push(retry);
        // remember the best so far: keep the file, the retry writes to a new attempt path
        plan[plan.findIndex((p) => p.unit === c.unit && p.i === c.i)].attempt = retry.attempt;
      } else if (!verdict.pass) {
        log(`    ${id}: still diverges after ${MAX_ATTEMPTS} attempts, flagged (${verdict.reasons.join('; ')})`);
      }
    }
    pending = next;
  }

  // 3. Post-process per chunk (tempo, loudness), then join per unit.
  const results = new Map();
  for (const u of units) {
    const chunks = plan.filter((p) => p.unit === u.id).sort((a, b) => a.i - b.i);
    // pick the best attempt available for each chunk (last written passes, else the best similarity)
    const picked = chunks.map((c) => {
      let best = null;
      for (let a = c.attempt; a >= 0; a--) {
        const cand = {...c, attempt: a};
        if (!existsSync(metaPath(cand))) continue;
        const m = JSON.parse(readFileSync(metaPath(cand), 'utf8'));
        // Re-judge cached chunks by the current rule, not the verdict stored when they were made.
        if (m.audit) m.verdict = auditVerdict({ok: true, ...m.audit});
        if (!best || m.verdict?.pass && !best.meta.verdict?.pass || (m.audit?.similarity ?? 1) > (best.meta.audit?.similarity ?? 1)) best = {c: cand, meta: m};
        if (m.verdict?.pass) break;
      }
      return best;
    });
    if (picked.some((p) => !p)) { results.set(u.id, {ok: false, error: 'a chunk never synthesized'}); continue; }

    const flags = [], warnings = [];
    const processed = [];
    let offset = 0;
    const words = [];
    let anyWords = true;
    for (const {c, meta} of picked) {
      const raw = rawPath(c);
      // Trim the engine's own leading/trailing silence (local engines pad generously), keeping a
      // short pad, so pace is measured on speech and the sentence gap we add is the only gap.
      const trimmed = path.join(outDir, `.${sha(raw + 'trim')}.trim.wav`);
      // Leading edge: tight (-38 dB, keep 0.08 s). Trailing edge: gentle (-45 dB, keep 0.3 s) so a final
      // consonant's decay survives, then a 0.25 s pad; without it the last word of a line was cut off.
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.08,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3,areverse,apad=pad_dur=0.25', trimmed]);
      const trimmedSecs = probe(trimmed);
      const lead = meta.words?.length ? Math.max(0, meta.words[0].start - 0.08) : null; // alignment offset lost by the trim
      let file = trimmed, secs = trimmedSecs, scale = 1;
      // pace: measured over the aligned speech span (first word to last word) on sentences long
      // enough for the number to mean something; short fragments are pause-dominated and never
      // stretched. Stretch is pitch-preserving and bounded to what still sounds natural.
      const nWords = wordsIn(c.text);
      const span = meta.words?.length > 1 ? meta.words[meta.words.length - 1].end - meta.words[0].start : 0;
      const speechSecs = span > 0.5 && span <= trimmedSecs + 0.05 ? span : trimmedSecs;
      if (provider.paceBand && nWords >= 8 && speechSecs > 0.4) {
        const wpm = (nWords / speechSecs) * 60;
        const [lo, hi] = provider.paceBand;
        const target = wpm > hi ? hi : wpm < lo ? lo : null;
        if (target) {
          const tempo = Math.min(1.12, Math.max(0.84, target / wpm));
          if (Math.abs(1 - tempo) > 0.04) {
            const stretched = path.join(outDir, `.${sha(raw + tempo)}.tempo.wav`);
            execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', trimmed, '-af', `atempo=${tempo.toFixed(3)}`, stretched]);
            file = stretched; scale = 1 / tempo; secs = trimmedSecs * scale;
            warnings.push(`chunk ${c.i}: pace ${Math.round(wpm)} wpm, stretched ${tempo.toFixed(2)}x to ${Math.round(wpm * tempo)} wpm`);
          }
        }
      }
      // loudness: one target for every voice so a tier switch never changes the mix
      const normed = path.join(outDir, `.${sha(file + LOUDNESS_TARGET)}.norm.wav`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-af', `loudnorm=I=${LOUDNESS_TARGET}:TP=${TRUE_PEAK}:LRA=11`, '-ar', '44100', normed]);
      secs = probe(normed);
      processed.push(normed);
      if (meta.words) for (const w of meta.words) words.push({w: w.w, start: +Math.max(offset, offset + (w.start - lead) * scale).toFixed(3), end: +Math.min(offset + secs, offset + (w.end - lead) * scale).toFixed(3)});
      else anyWords = false;
      if (!meta.verdict?.pass) flags.push(`chunk ${c.i}: ${meta.verdict?.reasons?.join('; ')}`);
      for (const w of meta.verdict?.warnings || []) warnings.push(`chunk ${c.i}: ${w}`);
      offset += secs + GAP_SECONDS;
    }
    // join with gaps
    const outWav = path.join(outDir, `${u.id}.wav`);
    if (processed.length === 1) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', processed[0], outWav]);
    else {
      const inputs = processed.flatMap((f) => ['-i', f]);
      const filter = processed.map((_, i) => `[${i}:a]${i < processed.length - 1 ? `apad=pad_dur=${GAP_SECONDS}` : 'anull'}[a${i}]`).join(';') + ';' + processed.map((_, i) => `[a${i}]`).join('') + `concat=n=${processed.length}:v=0:a=1[o]`;
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[o]', outWav]);
    }
    for (const f of processed) rmSync(f, {force: true});
    for (const f of readdirSafe(outDir).filter((n) => /\.(tempo|trim)\.wav$/.test(n))) rmSync(path.join(outDir, f), {force: true});
    results.set(u.id, {ok: true, audio: outWav, secs: probe(outWav), words: anyWords && words.length ? words : null, chunks: picked.map(({c, meta}) => ({i: c.i, text: c.text, attempt: c.attempt, secs: meta.secs, similarity: meta.audit?.similarity ?? null})), flags, warnings, cached: !needs.some((n) => n.unit === u.id)});
  }
  return results;
}

function readdirSafe(d) { try { return readdirSync(d); } catch { return []; } }
