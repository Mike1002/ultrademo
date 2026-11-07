#!/usr/bin/env node
// updates.mjs — is there a newer Ultrademo? Asks at most once a day, caches the answer, and never updates anything by itself.
// The answer is a small JSON file (`latest.json`) published with each release:
//   { "version": "0.3.0", "notes": "Hosted links for your videos", "offer": { "text": "…", "button": "…", "url": "https://ultrademo.net/…" } }
// It is data: every field is checked, trimmed and shown as plain text; links go only to the hosts below.
//   node plan/updates.mjs            one line for the agent: up to date, or what is new and how to update
//   node plan/updates.mjs --json     the same as JSON          (--force asks again even if asked today)
// ULTRADEMO_NO_UPDATE_CHECK=1 switches the check off; ULTRADEMO_UPDATE_URL points it elsewhere (for testing).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCAFFOLD, STATE_DIR, localVersion } from './state.mjs';
export { SCAFFOLD, STATE_DIR, localVersion };
// The collector on api.ultrademo.net (collector/ in the Ultrademo tree) serves the release file.
const httpsOnly = (u) => (/^https:\/\//.test(String(u || '')) ? u : '');
export const UPDATE_URL = httpsOnly(process.env.ULTRADEMO_UPDATE_URL) || 'https://api.ultrademo.net/skill/latest';
const CACHE = () => path.join(STATE_DIR, 'update.json');
const DAY = 24 * 3600 * 1000;
// links an offer may carry: our own site, or our own GitHub organisation; nothing else
const LINK_HOSTS = new Set(['ultrademo.net', 'www.ultrademo.net']);


/** 1 when a is newer than b, -1 when older, 0 when the same (plain x.y.z). */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0), pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}

// release text is data from the network: plain words and simple punctuation only, nothing that reads as code or a command
const text = (v, max) => (typeof v === 'string' ? v.replace(/[^A-Za-z0-9 .,;:'()\-+/&%!?]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
export function safeLink(u) {
  try {
    const x = new URL(String(u));
    if (x.protocol !== 'https:' || x.username || x.password || x.port) return '';
    const ours = LINK_HOSTS.has(x.hostname) || (x.hostname === 'github.com' && x.pathname.startsWith('/ultrademo-hq/'));
    return ours ? x.toString() : '';
  } catch { return ''; }
}

/** The published file, checked: a version, short notes and an optional offer whose link stays on our own hosts. */
export function sanitizeLatest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const version = /^\d+\.\d+\.\d+$/.test(String(raw.version || '')) ? String(raw.version) : null;
  if (!version) return null;
  const out = { version, notes: text(raw.notes, 120) };
  const o = raw.offer;
  if (o && typeof o === 'object') {
    const url = safeLink(o.url);
    const t = text(o.text, 140), button = text(o.button, 40);
    if (url && t && button) out.offer = { text: t, button, url };
  }
  return out;
}

// the cache is checked again on every read: it may have been written by an older version, or by hand
function readCache() { try { const c = JSON.parse(fs.readFileSync(CACHE(), 'utf8')); return { at: Number(c.at) || 0, latest: sanitizeLatest(c.latest) }; } catch { return null; } }
function writeCache(c) { try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(CACHE(), JSON.stringify(c) + '\n'); } catch { /* read-only: ask again next time */ } }

/** What the last check found, without asking again (the pages use this). */
export function cachedUpdate() {
  const c = readCache();
  return c ? describe(c.latest) : describe(null);
}

function describe(latest) {
  const current = localVersion();
  const newer = Boolean(latest && compareVersions(latest.version, current) > 0);
  return { current, latest: latest?.version || null, newer, notes: newer ? latest.notes || '' : '', offer: latest?.offer || null, git: fs.existsSync(path.join(SCAFFOLD, '..', '.git')) };
}

/** Asks at most once a day (or when forced); a failed or slow answer leaves the last one in place. */
export async function checkForUpdate({ force = false, fetchImpl = globalThis.fetch } = {}) {
  if (process.env.ULTRADEMO_NO_UPDATE_CHECK === '1') return { ...cachedUpdate(), off: true };
  const c = readCache();
  if (!force && c && Date.now() - (c.at || 0) < DAY) return describe(c.latest);
  try {
    // with usage statistics on, the check also says which install asked (a random id), so active installs can be counted;
    // with them off it says only the version
    const headers = { accept: 'application/json', 'x-ultrademo-version': localVersion() };
    try { const t = await import('./telemetry.mjs'); if (t.telemetryOn()) headers['x-ultrademo-install'] = t.settings().install_id; } catch {}
    const r = await fetchImpl(UPDATE_URL, { signal: AbortSignal.timeout(3000), headers, redirect: 'error' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (Number(r.headers?.get?.('content-length') || 0) > 8192) throw new Error('too large');
    const body = await r.text();
    if (body.length > 8192) throw new Error('too large');
    const latest = sanitizeLatest(JSON.parse(body));
    writeCache({ at: Date.now(), latest });
    return describe(latest);
  } catch {
    writeCache({ at: Date.now() - DAY + 3600 * 1000, latest: c?.latest || null }); // offline or failed: try again in an hour
    return describe(c?.latest || null);
  }
}

/** The shell command to update, built from fixed parts and a quoted path only. */
export function updateCommand(workspace = path.join(SCAFFOLD, '..')) {
  const q = (p) => `'${String(p).replace(/'/g, `'\\''`)}'`;
  return `cd ${q(workspace)} && git pull && cd scaffold && npm run setup`;
}

/** The line for the agent. The release notes are not in it: they are data from the network, shown on the dashboard only. */
export function updateLine(u, workspace = path.join(SCAFFOLD, '..')) {
  if (!u.newer) return `Ultrademo ${u.current} is up to date.`;
  const how = u.git ? updateCommand(workspace) : 'download the new version from https://github.com/ultrademo-hq/ultrademo/releases';
  return `Ultrademo ${u.latest} is out (this is ${u.current}); what is new is on the dashboard. Offer the update; never update without a yes. To update: ${how}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  try {
    const u = await checkForUpdate({ force: a.includes('--force') });
    console.log(a.includes('--json') ? JSON.stringify(u) : updateLine(u));
  } catch { console.log('Update check unavailable; carry on.'); }
}
