#!/usr/bin/env node
// telemetry.mjs — anonymous usage statistics: which steps people reach, which video types and formats they make, where
// it fails. On by default, said so at setup; off with `npm run telemetry -- off`, ULTRADEMO_TELEMETRY=0 or DO_NOT_TRACK=1.
// Only the events and fields listed below can be sent: never the product's address or name, the brief, scripts, frames,
// file paths, keys or error messages. Every event is also written to .ultrademo/events.jsonl, so the user can see exactly
// what was sent. The install is a random id made here, not derived from the machine.
//   npm run telemetry -- status | on | off | show | reset (a new random id)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { STATE_DIR, localVersion } from './state.mjs';

// The collector (collector/ in the Ultrademo tree, live on api.ultrademo.net since 2026-11-07). An override must be https;
// test runs send nowhere unless a test sets one.
const DEFAULT_ENDPOINT = 'https://api.ultrademo.net/skill/events';
const override = process.env.ULTRADEMO_TELEMETRY_URL || '';
export const ENDPOINT = /^https:\/\//.test(override) ? override : process.env.NODE_TEST_CONTEXT ? null : DEFAULT_ENDPOINT;
const SETTINGS = () => path.join(STATE_DIR, 'settings.json');
const LOG = () => path.join(STATE_DIR, 'events.jsonl');

const ONE = (...v) => (x) => (v.includes(x) ? x : undefined);
const INT = (max) => (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : undefined);
const BOOL = (x) => (typeof x === 'boolean' ? x : undefined);
const CODE = (x) => (typeof x === 'string' && /^[a-z0-9_]{1,40}$/.test(x) ? x : undefined);
export const FIELDS = {
  video_type: ONE('launch', 'explainer', 'spotlight', 'ad', 'other'),
  format: ONE('landscape', 'vertical', 'both'),
  autonomy: ONE('review', 'director'),
  voice: ONE('paid', 'free', 'standin', 'none'),
  sources: (x) => (Array.isArray(x) ? [...new Set(x.filter((s) => ['live', 'html', 'screenshots', 'figma'].includes(s)))].sort() : undefined),
  length_s: INT(600), scenes: INT(60), comments: INT(500), rounds: INT(100), render_s: INT(36000),
  cut: BOOL, vertical: BOOL, from_brand: BOOL, voices_free: BOOL, voices_paid: BOOL,
  step: ONE('setup', 'brief', 'direction', 'production', 'render', 'review'), code: CODE,
};
export const EVENTS = {
  setup_done: ['voices_free', 'voices_paid'],
  brief_saved: ['video_type', 'format', 'autonomy', 'voice', 'sources', 'length_s', 'from_brand'],
  direction_confirmed: ['video_type', 'format', 'autonomy', 'scenes', 'length_s'],
  video_rendered: ['video_type', 'format', 'voice', 'scenes', 'length_s', 'render_s', 'cut', 'vertical'],
  comments_sent: ['video_type', 'comments', 'rounds'],
  approved: ['video_type', 'format', 'comments', 'rounds', 'cut'],
  step_failed: ['step', 'code'],
};

export function settings() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')); } catch {}
  if (!s.install_id) {
    s = { install_id: crypto.randomUUID(), telemetry: true, created_at: new Date().toISOString().slice(0, 10), notice_shown: false, ...s };
    try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(SETTINGS(), JSON.stringify(s, null, 1) + '\n'); } catch {}
  }
  return s;
}
/** A new random id: what was sent before can no longer be tied to this install. */
export function resetId() {
  const before = settings();
  const s = { ...before, install_id: crypto.randomUUID() };
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS(), JSON.stringify(s, null, 1) + '\n');
  return { ...s, old_id: before.install_id };
}
const NOTICE = 'Ultrademo sends anonymous usage statistics (steps reached, video types and formats; never your product, words, frames or keys). See them: npm run telemetry -- show. Switch off: npm run telemetry -- off.';

/** Setup names the statistics itself, so the first event does not repeat the notice. */
export function markNoticeShown() {
  try { const s = settings(); if (s.notice_shown === false) fs.writeFileSync(SETTINGS(), JSON.stringify({ ...s, notice_shown: true }, null, 1) + '\n'); } catch {}
}

export function setTelemetry(on) {
  const s = { ...settings(), telemetry: Boolean(on) };
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS(), JSON.stringify(s, null, 1) + '\n');
  return s;
}

/** On unless the user switched it off here, or with ULTRADEMO_TELEMETRY=0 or DO_NOT_TRACK=1 (and never in CI). */
export function telemetryOn() {
  if (process.env.DO_NOT_TRACK === '1' || process.env.ULTRADEMO_TELEMETRY === '0' || process.env.CI) return false;
  return settings().telemetry !== false;
}

const agentName = () => (process.env.CLAUDECODE ? 'claude-code' : process.env.CODEX_HOME || process.env.CODEX_SANDBOX ? 'codex' : process.env.GEMINI_CLI ? 'gemini-cli' : 'other');

/** The event exactly as it would be sent: unknown events and fields are dropped, every value is checked. */
export function buildEvent(name, props = {}) {
  if (!EVENTS[name]) return null;
  const clean = {};
  for (const k of EVENTS[name]) { const v = FIELDS[k](props[k]); if (v !== undefined) clean[k] = v; }
  return {
    event: name, props: clean, install_id: settings().install_id, version: localVersion(),
    os: process.platform, arch: process.arch, node: Number(process.versions.node.split('.')[0]), agent: agentName(),
    day: new Date().toISOString().slice(0, 10),
  };
}

/** Records one event; never throws and never holds a step up for more than two seconds. */
export async function track(name, props = {}, { fetchImpl = globalThis.fetch } = {}) {
  try {
    if (!telemetryOn()) return null;
    if (process.env.NODE_TEST_CONTEXT && !process.env.ULTRADEMO_TELEMETRY_TEST) return null; // the test runs record nothing
    const ev = buildEvent(name, props);
    if (!ev) return null;
    const sent = Boolean(ENDPOINT);
    // whichever step sends first says so once, in case setup (which names it too) was skipped
    const s = settings();
    if (s.notice_shown === false) { console.error(NOTICE); fs.writeFileSync(SETTINGS(), JSON.stringify({ ...s, notice_shown: true }, null, 1) + '\n'); }
    fs.mkdirSync(STATE_DIR, { recursive: true });
    try { if (fs.statSync(LOG()).size > 1e6) fs.renameSync(LOG(), LOG() + '.old'); } catch {} // the local record stays small
    fs.appendFileSync(LOG(), JSON.stringify({ ...ev, sent_to: sent ? ENDPOINT : 'nowhere yet (kept here only)' }) + '\n');
    if (sent) await fetchImpl(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev), signal: AbortSignal.timeout(2000) }).catch(() => {});
    return ev;
  } catch { return null; }
}

/** The fields a project's plan gives every event (read from plan.json; nothing free-text leaves this function). */
export function projectProps(projectDir) {
  let v = {}, plan = {};
  try { plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8')); v = plan.video || {}; } catch {}
  const t = String(v.template || '').toLowerCase();
  const video_type = ['launch', 'explainer', 'spotlight', 'ad'].find((x) => t.includes(x)) || (t ? 'other' : undefined);
  const f = String(v.format || '');
  const format = /both/i.test(f) ? 'both' : /vertical|1080x1920|9:16/i.test(f) ? 'vertical' : f ? 'landscape' : undefined;
  let voice;
  if (/music|none|silent/i.test(String(v.narration || ''))) voice = 'none';
  else {
    const id = String(v.intake?.voice?.id || '').toLowerCase();
    let provider = '';
    try { const all = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tts', 'voices.json'), 'utf8')); const list = Array.isArray(all) ? all : all.voices || Object.values(all); provider = (list.find((x) => x && String(x.id || x.name || '').toLowerCase() === id) || {}).provider || ''; } catch {}
    voice = provider === 'elevenlabs' ? 'paid' : provider ? 'free' : id ? 'standin' : undefined;
  }
  const kinds = { screenshot: 'screenshots', screenshots: 'screenshots', html: 'html', figma: 'figma', live: 'live', capture: 'live', site: 'live' };
  const sources = [...new Set((v.sources || []).map((s) => kinds[String(s?.kind || '').toLowerCase()]).filter(Boolean))];
  return { video_type, format, autonomy: v.autonomy, voice, sources, length_s: v.length_s, scenes: Array.isArray(plan.scenes) ? plan.scenes.length : undefined };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] || 'status';
  if (cmd === 'on' || cmd === 'off') { setTelemetry(cmd === 'on'); console.log(`Usage statistics ${cmd}.`); }
  else if (cmd === 'reset') { const r = resetId(); console.log(`New install id made: what was sent before is no longer tied to this install. To have the earlier events deleted, email hello@ultrademo.net with the old id: ${r.old_id}`); }
  else if (cmd === 'show') { try { process.stdout.write(fs.readFileSync(LOG(), 'utf8')); } catch { console.log('Nothing recorded yet.'); } }
  else console.log(`Usage statistics: ${telemetryOn() ? 'on' : 'off'}${process.env.DO_NOT_TRACK === '1' ? ' (DO_NOT_TRACK is set)' : ''}. Sent to: ${ENDPOINT || 'nowhere yet; events are kept in ' + LOG()}. See them: npm run telemetry -- show. Switch off: npm run telemetry -- off.`);
}
