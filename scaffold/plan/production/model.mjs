// model.mjs — the model calls of the production step, through OpenRouter.
//
// The designer pass and every frame builder want a text answer (CSS, HTML),
// not a JSON object, so this is a sibling of plan/direction/propose.mjs's
// `callModel` rather than a reuse of it: same request shape, same ledger and
// cap (imported from there so one accounting rule holds across the steps),
// same key handling (OPENROUTER_API_KEY from the environment or app/.env.local,
// read and never printed). Recordings replay by call name so the default tests
// never pay; a recording fetch turns one live run into the fixtures.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Ledger, CapReached, loadKey, DEFAULT_MODEL } from '../direction/propose.mjs';

export { Ledger, CapReached, loadKey, DEFAULT_MODEL };
export const DEFAULT_CAP_USD = 5.0;
const API_ROOT = 'https://openrouter.ai/api/v1';
const TIMEOUT_MS = 420_000;
const CALL_HEADER = 'x-ultrademo-call';

/** A file name for a call name ("frame:03-watch-it" → "frame-03-watch-it"). */
export const recordName = (name) => String(name).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();

/**
 * One text call. `images` are { label, data (base64 jpeg) }. Returns the raw
 * text and the usage entry the ledger recorded. Throws CapReached before the
 * call when the cap is spent, and a plain Error when the provider refuses or
 * the answer was cut off by the output limit.
 */
export async function callText({ name, step = name, scene = null, model = DEFAULT_MODEL, key, system, prompt, images = [], ledger, maxOutputTokens = 16000, temperature = 0.4, fetchImpl = globalThis.fetch, log = () => {} }) {
  if (ledger?.reached) throw new CapReached(ledger);
  const body = {
    model,
    max_tokens: maxOutputTokens,
    temperature,
    reasoning: { enabled: false },
    usage: { include: true },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: [{ type: 'text', text: prompt }, ...images.flatMap((im) => [{ type: 'text', text: im.label }, { type: 'image_url', image_url: { url: `data:${im.type || 'image/jpeg'};base64,` + im.data } }])] },
    ],
  };
  const t0 = Date.now();
  let res;
  try {
    res = await fetchImpl(`${API_ROOT}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://ultrademo.net', 'X-Title': 'Ultrademo production step', [CALL_HEADER]: name },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    });
  } catch (err) {
    if (err?.name === 'AwaitingAgent' || err?.agent) throw err; // agent mode: the agent's turn, or its answer needs correcting
    throw new Error(`The model connection failed or timed out (${name}): ${err.message}`);
  }
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = String(j?.error?.metadata?.raw || j?.error?.message || '').slice(0, 400); } catch { /* no body */ }
    throw new Error(`OpenRouter answered ${res.status} for ${name}${res.status === 401 ? ' (the key was refused)' : res.status === 402 ? ' (no credit)' : res.status === 429 ? ' (rate limited)' : ''}${detail ? `: ${detail}` : ''}`);
  }
  const result = await res.json();
  const text = result.choices?.[0]?.message?.content ?? '';
  const usage = result.usage || {};
  const replayed = typeof result.id === 'string' && result.id.startsWith('recorded-');
  const entry = {
    name, step, scene, model,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    input_tokens: usage.prompt_tokens ?? null,
    output_tokens: usage.completion_tokens ?? null,
    cost_usd: replayed ? 0 : (typeof usage.cost === 'number' ? usage.cost : null),
    ...(replayed ? { replayed: true, recorded_cost_usd: usage.cost ?? null, recorded_seconds: result.recorded_seconds ?? null } : {}),
    finish_reason: result.choices?.[0]?.finish_reason ?? null,
    response_id: result.id ?? null,
  };
  ledger?.add(entry);
  log(`${name}: ${entry.input_tokens} in / ${entry.output_tokens} out · $${(entry.cost_usd ?? 0).toFixed(4)}${replayed ? ` (replayed; the recorded call cost $${Number(usage.cost ?? 0).toFixed(4)})` : ''} · ${entry.seconds}s`);
  if (entry.finish_reason === 'length') throw new Error(`${name}: the answer was cut off at ${maxOutputTokens} output tokens; the frame must be shorter`);
  if (!text.trim()) throw new Error(`${name}: the model returned an empty answer`);
  return { text, usage: entry };
}

/** Strip a surrounding code fence. */
export const stripFence = (s) => String(s).trim().replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '');

// ---------------------------------------------------------------------------
// Recorded runs
// ---------------------------------------------------------------------------

const nameOf = (init) => init?.headers?.[CALL_HEADER] || 'call';

/** A fetch that answers from `<dir>/<call-name>.json`; the default tests never pay. */
export function recordedFetch(dir) {
  const requests = [];
  const f = async (url, init) => {
    const name = nameOf(init);
    requests.push({ name, body: JSON.parse(init.body) });
    const file = path.join(dir, `${recordName(name)}.json`);
    if (!fs.existsSync(file)) return new Response(JSON.stringify({ error: { message: `no recording for ${name} in ${dir}` } }), { status: 404, headers: { 'content-type': 'application/json' } });
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Response(JSON.stringify({ id: `recorded-${recordName(name)}`, recorded_seconds: rec.seconds ?? null, choices: [{ finish_reason: rec.finish_reason || 'stop', message: { content: rec.content } }], usage: rec.usage || { prompt_tokens: 0, completion_tokens: 0, cost: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  f.requests = requests;
  return f;
}

/** A fetch that records real answers beside forwarding them; calls already recorded before the run are replayed. */
export function recordingFetch(dir, fetchImpl = globalThis.fetch) {
  fs.mkdirSync(dir, { recursive: true });
  const replay = recordedFetch(dir);
  const existing = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
  return async (url, init) => {
    const name = nameOf(init);
    if (existing.has(recordName(name))) return replay(url, init);
    const t0 = Date.now();
    const res = await fetchImpl(url, init);
    const clone = res.clone();
    try {
      const json = await clone.json();
      const body = JSON.parse(init.body);
      const content = json.choices?.[0]?.message?.content;
      if (content && json.choices?.[0]?.finish_reason !== 'length') fs.writeFileSync(path.join(dir, `${recordName(name)}.json`), JSON.stringify({ name, model: body.model, recorded_at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 100) / 10, usage: json.usage, finish_reason: json.choices?.[0]?.finish_reason ?? null, content }, null, 2) + '\n');
    } catch { /* not JSON; nothing recorded */ }
    return res;
  };
}

/** A screenshot as a model image; the media type is read from the file's first bytes (PNG, JPEG, WebP, GIF). */
export function imageOf(file, label) {
  let buf = fs.readFileSync(file);
  if (buf.length > 600_000) {
    // a large capture goes to the model as a 1600-wide JPEG (the model sees it downscaled anyway)
    const out = path.join(os.tmpdir(), `ultrademo-img-${path.basename(file).replace(/\W+/g, '-')}-${buf.length}.jpg`);
    if (!fs.existsSync(out)) spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', "scale='min(1600,iw)':-2", '-q:v', '3', out]);
    if (fs.existsSync(out)) buf = fs.readFileSync(out);
  }
  const type = buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : buf.slice(0, 3).toString() === 'GIF' ? 'image/gif' : 'image/jpeg';
  return { label, data: buf.toString('base64'), type };
}
