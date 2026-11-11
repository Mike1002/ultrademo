#!/usr/bin/env node
// review/serve.mjs — the review page: play a project's finished video in the browser, pause anywhere, mark a spot on the
// frame (drag a box or click a pin) and write a comment. Comments carry the time, the scene (from plan.json) and the
// marked spot, and are saved in <project>/review/comments.json with a readable review/comments.md beside it, so the
// agent can read them and fix the scenes. A dependency-free local server, 127.0.0.1 only; writes are same-origin JSON under 200 KB.
//   node plan/review/serve.mjs <project> [--port 4330]
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { tokenEstimate } from '../production/progress.mjs';
import { openInBrowser } from '../open.mjs';
import { proposeLearnings, readProposals, keepLearnings } from '../learnings.mjs';
import { track, projectProps } from '../telemetry.mjs';
import { cachedUpdate, localVersion } from '../updates.mjs';
import { musicCredit } from '../production/audio.mjs';
import { BRANDS_DIR, findBrandFor } from '../brands.mjs';
import { startNewVideo } from '../newvideo.mjs';
import { refreshDashboard } from '../dashboard/build.mjs';
import { findVoice } from '../../tts/catalogue.mjs';
import { listenOnFree, recordPage } from '../pages.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendUi } from '../intake/serve.mjs';
import { renderReviewPage } from './page.mjs';

const MAX_BODY = 200_000;
const MAX_NOTES = 500;
const MAX_TEXT = 2000;
const VIDEO_NAME = /^[a-z0-9][a-z0-9-]*\.mp4$/;
// D-92: the thumbnail's comments sit beside the videos' in comments.json and comments.md, under this name
export const THUMB_KEY = 'thumbnail';
const thumbsMtime = (projectDir) => { try { const d = path.join(projectDir, 'out', 'thumbnails'); return Math.max(0, ...fs.readdirSync(d).filter((n) => n.endsWith('.png')).map((n) => fs.statSync(path.join(d, n)).mtimeMs)); } catch { return 0; } };

const send = (res, status, body, type = 'text/html; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(body);
};
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `http://${req.headers.host}`;
}

/** The finished videos in <project>/out (the full render only; the working copy video-render.mp4 is left out). */
export function listVideos(projectDir) {
  const out = path.join(projectDir, 'out');
  if (!fs.existsSync(out)) return [];
  return fs.readdirSync(out).filter((n) => VIDEO_NAME.test(n) && n !== 'video-render.mp4').sort((a, b) => (a === 'video.mp4' ? -1 : b === 'video.mp4' ? 1 : a.localeCompare(b)))
    .map((n) => { const st = fs.statSync(path.join(out, n)); return { name: n, size: st.size, mtime: st.mtime.toISOString() }; });
}

/** Scenes from plan.json for the timeline: id, name, start, length. */
function scenesOf(projectDir) {
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'));
    return { title: plan.video?.product || path.basename(projectDir), scenes: (plan.scenes || []).map((s) => ({ id: s.id, name: s.name, start: s.start_s, dur: s.duration_s })) };
  } catch { return { title: path.basename(projectDir), scenes: [] }; }
}

const COMMENTS = (projectDir) => path.join(projectDir, 'review', 'comments.json');
/** Saved comments per video; the first cut of this page wrote review/notes.json, read if comments.json is not there yet. */
export function readNotes(projectDir) {
  for (const f of [COMMENTS(projectDir), path.join(projectDir, 'review', 'notes.json')]) {
    try {
      const all = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const rec of Object.values(all)) if (rec.notes && !rec.comments) { rec.comments = rec.notes; delete rec.notes; }
      return all;
    } catch { /* next */ }
  }
  return {};
}

const num01 = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
/** Check one note; returns the clean note or throws. */
export function cleanNote(n) {
  if (!n || typeof n !== 'object') throw new Error('a comment must be an object');
  const id = String(n.id || '');
  if (!/^[a-z0-9-]{4,40}$/.test(id)) throw new Error('a comment needs a plain id');
  if (typeof n.t !== 'number' || !Number.isFinite(n.t) || n.t < 0 || n.t > 36000) throw new Error('a comment needs a time in seconds');
  const text = String(n.text ?? '').slice(0, MAX_TEXT);
  const out = { id, t: Math.round(n.t * 1000) / 1000, text, status: ['done', 'addressed'].includes(n.status) ? 'done' : 'open', created: String(n.created || new Date().toISOString()).slice(0, 40) };
  // the conversation on a comment: the agent's notes on what changed and the reviewer's follow-ups, oldest first.
  // Only the agent marks a comment done (with a note); a follow-up from the reviewer opens it again.
  const thread = [];
  if (typeof n.reply === 'string' && n.reply.trim()) thread.push({ by: 'agent', text: n.reply.slice(0, 1000) });
  if (Array.isArray(n.thread)) for (const m of n.thread.slice(0, 40)) {
    if (!m || typeof m.text !== 'string' || !m.text.trim()) continue;
    thread.push({ by: m.by === 'agent' ? 'agent' : 'reviewer', text: m.text.slice(0, 1000), at: String(m.at || '').slice(0, 40) });
  }
  if (thread.length) out.thread = thread;
  if (typeof n.scene === 'string' && /^[a-z0-9-]{1,80}$/.test(n.scene)) out.scene = n.scene;
  if (n.both === true) out.both = true; // D-82: also apply to the other format (landscape or vertical)
  if (n.box) { const b = n.box; if (![b.x, b.y, b.w, b.h].every(num01) || b.x + b.w > 1.001 || b.y + b.h > 1.001) throw new Error('a box must sit inside the frame'); out.box = { x: b.x, y: b.y, w: b.w, h: b.h }; }
  if (n.pin) { const p = n.pin; if (![p.x, p.y].every(num01)) throw new Error('a pin must sit inside the frame'); out.pin = { x: p.x, y: p.y }; }
  return out;
}

/** The page's comments merged with the saved ones. The page owns the comment itself (its text, time, spot, and whether it
 * exists); the agent owns "done" and its notes. A note or follow-up on either side is kept; a new follow-up from the
 * reviewer opens the comment again, otherwise a comment the agent marked done stays done. */
export function mergeNotes(saved = [], incoming = []) {
  const byId = new Map(saved.map((n) => [n.id, n]));
  return incoming.map((n) => {
    const s = byId.get(n.id);
    if (!s) return n;
    const key = (m) => `${m.by}|${m.text}`;
    const have = new Set((s.thread || []).map(key));
    const extra = (n.thread || []).filter((m) => !have.has(key(m)));
    const thread = [...(s.thread || []), ...extra];
    const reopened = extra.some((m) => m.by === 'reviewer');
    const out = { ...n, status: reopened ? 'open' : s.status === 'done' ? 'done' : n.status };
    if (thread.length) out.thread = thread; else delete out.thread;
    return out;
  });
}

const clock = (t) => { const m = Math.floor(t / 60); const s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; };
const pct = (v) => `${Math.round(v * 100)}%`;
function writeNotes(projectDir, video, notes, meta) {
  const all = readNotes(projectDir);
  all[video] = { video_size: meta.size, video_mtime: meta.mtime, updated: new Date().toISOString(), comments: notes };
  fs.mkdirSync(path.join(projectDir, 'review'), { recursive: true });
  fs.writeFileSync(COMMENTS(projectDir), JSON.stringify(all, null, 1));
  const L = ['# Review comments', '', 'Written by the review page (`node plan/review/serve.mjs <project>`). [ ] open, [x] done by the agent. Under a comment, agent: is what was changed and follow-up: is the reviewer asking for more (or a revert); act on the latest follow-up only, keeping what was already done. Times are into the video; boxes and pins are fractions of the frame from the top-left.', ''];
  for (const [name, rec] of Object.entries(all)) {
    L.push(`## ${name} (${rec.comments.length} comment${rec.comments.length === 1 ? '' : 's'}, updated ${(rec.updated || '').slice(0, 16).replace('T', ' ')})`, '');
    for (const n of [...rec.comments].sort((a, b) => a.t - b.t)) {
      const where = n.box ? ` · box ${pct(n.box.x)},${pct(n.box.y)} ${pct(n.box.w)}×${pct(n.box.h)}` : n.pin ? ` · pin ${pct(n.pin.x)},${pct(n.pin.y)}` : '';
      L.push(`- [${n.status === 'done' ? 'x' : ' '}] ${name === THUMB_KEY ? 'the thumbnail (fix it in direction.thumbnail or thumbnail/override.css, then node plan/thumbnail/render.mjs <project>)' : `${clock(n.t)}${n.scene ? ` · ${n.scene}` : ''}`}${where}${n.both ? ' · also the other format' : ''} — ${n.text.replace(/\n+/g, ' ')}`);
      for (const m of n.thread || []) L.push(`  - ${m.by === 'agent' ? 'agent' : 'follow-up'}: ${m.text.replace(/\n+/g, ' ')}`);
    }
    L.push('');
  }
  fs.writeFileSync(path.join(projectDir, 'review', 'comments.md'), L.join('\n'));
}

/** Stream a video with byte ranges so the browser can seek. */
function sendVideo(req, res, file) {
  const size = fs.statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const base = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
  if (!range) { res.writeHead(200, { ...base, 'content-length': size }); fs.createReadStream(file).pipe(res); return; }
  let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
  let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : size - 1;
  if (!Number.isFinite(start) || start < 0 || start >= size || end < start) { res.writeHead(416, { 'content-range': `bytes */${size}` }); res.end(); return; }
  end = Math.min(end, size - 1);
  res.writeHead(206, { ...base, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
  fs.createReadStream(file, { start, end }).pipe(res);
}

export function startServer({ projectDir, port = 4330, host = '127.0.0.1', brandsDir = BRANDS_DIR }) {
  projectDir = path.resolve(projectDir);
  // the approved video (D-79 Delivery): a dated copy in out/final/ that later renders cannot overwrite
  const approvedFile = path.join(projectDir, 'review', 'approved.json');
  const approved = () => { try { const a = JSON.parse(fs.readFileSync(approvedFile, 'utf8')); return fs.existsSync(path.join(projectDir, 'out', 'final', a.final)) ? a : null; } catch { return null; } };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/') {
        const videos = listVideos(projectDir);
        const pick = videos.find((v) => v.name === url.searchParams.get('v')) || videos[0] || null;
        return send(res, 200, renderReviewPage({ project: path.basename(projectDir), videos, video: pick, videoPath: pick ? path.join(projectDir, 'out', pick.name) : null, ...scenesOf(projectDir), tokens: tokenEstimate(projectDir), approved: approved(), offer: cachedUpdate().offer, version: localVersion(), view: url.searchParams.get('review') ? 'review' : 'auto', credit: (() => { try { return musicCredit(projectDir); } catch { return null; } })(), cuts: (() => { try { return JSON.parse(fs.readFileSync(path.join(projectDir, 'review', 'cuts.json'), 'utf8')).filter((c) => fs.existsSync(path.join(projectDir, 'out', 'final', c.final))); } catch { return []; } })(), thumbs: (() => { try { return fs.readdirSync(path.join(projectDir, 'out', 'thumbnails')).filter((f) => /^[a-z0-9-]+-thumbnail-\d+x\d+\.png$/.test(f)).sort(); } catch { return []; } })() }));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/ui/')) return sendUi(res, url.pathname);
      if (req.method === 'GET' && url.pathname.startsWith('/video/')) {
        const name = decodeURIComponent(url.pathname.slice('/video/'.length));
        if (!VIDEO_NAME.test(name)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
        const file = path.join(projectDir, 'out', name);
        if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
        return sendVideo(req, res, file);
      }
      if (req.method === 'GET' && url.pathname.startsWith('/thumbs/')) {
        // D-82: the thumbnails made with the final video
        const name = decodeURIComponent(url.pathname.slice('/thumbs/'.length));
        const file = path.join(projectDir, 'out', 'thumbnails', name);
        if (!/^[a-z0-9-]+-thumbnail-\d+x\d+\.png$/.test(name) || !fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
        return send(res, 200, fs.readFileSync(file), 'image/png');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/final/')) {
        const name = decodeURIComponent(url.pathname.slice('/final/'.length));
        if (!/^[a-z0-9][a-z0-9._-]{0,120}\.mp4$/i.test(name)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
        const file = path.join(projectDir, 'out', 'final', name);
        if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
        return sendVideo(req, res, file);
      }
      if (req.method === 'GET' && url.pathname === '/api/comments') {
        const name = url.searchParams.get('v') || '';
        if (!VIDEO_NAME.test(name)) return sendJson(res, 400, { ok: false, error: 'which video?' });
        const rec = readNotes(projectDir)[name];
        const meta = listVideos(projectDir).find((v) => v.name === name);
        const stale = Boolean(rec && meta && (rec.video_size !== meta.size || rec.video_mtime !== meta.mtime));
        return sendJson(res, 200, { ok: true, comments: rec?.comments || [], stale });
      }
      if (req.method === 'GET' && url.pathname === '/api/thumbnail-comments') return sendJson(res, 200, { ok: true, comments: readNotes(projectDir)[THUMB_KEY]?.comments || [] });
      if (req.method === 'POST' && !sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'refused: the request came from another page' });
      if (req.method === 'GET' && url.pathname === '/api/status') {
        // where a sent batch of comments stands: sent, Claude at work (a scene or the loop log changed), a new version out
        const name = url.searchParams.get('v') || '';
        let sub = null; try { sub = JSON.parse(fs.readFileSync(path.join(projectDir, 'review', 'submitted.json'), 'utf8')); } catch {}
        const mt = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
        const vfile = VIDEO_NAME.test(name) ? path.join(projectDir, 'out', name) : null;
        let working = false;
        if (sub) { try { working = mt(path.join(projectDir, 'production', 'loop-log.md')) > sub.at || fs.readdirSync(path.join(projectDir, 'production', 'scenes')).some((f) => mt(path.join(projectDir, 'production', 'scenes', f)) > sub.at); } catch {} }
        return sendJson(res, 200, { ok: true, submitted: sub, working, video_mtime: vfile ? mt(vfile) : 0, thumb_mtime: thumbsMtime(projectDir) });
      }
      if (req.method === 'POST' && url.pathname === '/api/submit') {
        // the open comments go to Claude: the agent's `wait.mjs … comments` exits on this file
        const body = JSON.parse((await readBody(req)) || '{}');
        const name = String(body.video || '');
        if (!VIDEO_NAME.test(name)) return sendJson(res, 400, { ok: false, error: 'which video?' });
        const all = readNotes(projectDir);
        const openOf = (k) => (all[k]?.comments || []).filter((n) => n.status !== 'done').length;
        // D-92: the thumbnail's open comments go with the video's
        const thumbOpen = openOf(THUMB_KEY);
        const open = openOf(name) + thumbOpen;
        if (!open) return sendJson(res, 400, { ok: false, error: 'no open comments to send' });
        const info = { at: Date.now(), video: name, open, thumbnail: thumbOpen };
        fs.mkdirSync(path.join(projectDir, 'review'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'review', 'submitted.json'), JSON.stringify(info) + '\n');
        track('comments_sent', { video_type: projectProps(projectDir).video_type, comments: open });
        console.log(`Comments sent to Claude: ${open} open on ${name}; read ${path.join(projectDir, 'review', 'comments.md')}`);
        return sendJson(res, 200, { ok: true, ...info });
      }
      if (req.method === 'GET' && url.pathname === '/api/learnings') return sendJson(res, 200, { ok: true, proposals: readProposals(projectDir) });
      if (req.method === 'POST' && url.pathname === '/api/learnings') {
        const body = JSON.parse((await readBody(req)) || '{}');
        try {
          const r = keepLearnings(projectDir, Array.isArray(body.picks) ? body.picks.slice(0, 50) : [], { dir: brandsDir });
          console.log(`Learnings kept for ${r.brand}: ${r.kept}.`);
          refreshDashboard(projectDir);
          return sendJson(res, 200, { ok: true, ...r });
        } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }); }
      }
      if (req.method === 'POST' && url.pathname === '/api/new-video') {
        try {
          let plan = {}; try { plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8')); } catch {}
          const n = await startNewVideo({ projectsDir: path.dirname(projectDir), brand: findBrandFor(plan.video || {}, brandsDir), product: plan.video?.product, brandsDir });
          fs.mkdirSync(path.join(projectDir, 'review'), { recursive: true });
          fs.writeFileSync(path.join(projectDir, 'review', 'next.json'), JSON.stringify(n, null, 1) + '\n');
          console.log(`New video started: ${n.project}. Its brief page: ${n.url} (open in the user's browser). Run node plan/wait.mjs ${n.project} brief in the background and start the direction step when it exits.`);
          return sendJson(res, 200, { ok: true, url: n.open, project: path.basename(n.project) });
        } catch (err) { return sendJson(res, 500, { ok: false, error: `Could not start a new video: ${err.message}` }); }
      }
      if (req.method === 'POST' && url.pathname === '/api/approve') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const name = String(body.video || '');
        if (!VIDEO_NAME.test(name) || !fs.existsSync(path.join(projectDir, 'out', name))) return sendJson(res, 400, { ok: false, error: 'no such video' });
        const day = new Date().toISOString().slice(0, 10);
        // D-82: a social cut's final copy (review/cuts.json); the video's approval finishes every cut too
        const approveCut = (cutName) => {
          const slugC = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
          const finalC = `${slugC}-final-${day}-${cutName.replace(/\.mp4$/, '')}.mp4`;
          fs.mkdirSync(path.join(projectDir, 'out', 'final'), { recursive: true });
          fs.copyFileSync(path.join(projectDir, 'out', cutName), path.join(projectDir, 'out', 'final', finalC));
          const cf = path.join(projectDir, 'review', 'cuts.json');
          let cuts = []; try { cuts = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch {}
          cuts = [...cuts.filter((c) => c.video !== cutName), { video: cutName, final: finalC, at: new Date().toISOString() }];
          fs.mkdirSync(path.dirname(cf), { recursive: true });
          fs.writeFileSync(cf, JSON.stringify(cuts, null, 1) + '\n');
          console.log(`Cut approved: ${path.join(projectDir, 'out', 'final', finalC)}`);
          return finalC;
        };
        if (/^cut-\d+\.mp4$/.test(name)) {
          const finalC = approveCut(name);
          track('approved', { ...projectProps(projectDir), cut: true });
          return sendJson(res, 200, { ok: true, cut: true, video: name, final: finalC });
        }
        const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
        // D-82: with a vertical version, one approval finishes both formats. Approving the vertical approves video.mp4 beside it;
        // approving any landscape version (video.mp4, or another voice such as video-killian.mp4) finishes the vertical too,
        // and the vertical takes that version's soundtrack (it was rendered under video.mp4's), so the two finals match.
        const V = 'video-vertical.mp4', out = (n) => path.join(projectDir, 'out', n);
        const main = name === V ? 'video.mp4' : name;
        const both = fs.existsSync(out(V)) && fs.existsSync(out(main));
        if (name === V && !both) return sendJson(res, 400, { ok: false, error: 'the vertical version needs its landscape video.mp4 beside it' });
        const final = `${slug}-final-${day}.mp4`;
        const finalVertical = both ? `${slug}-final-${day}-vertical.mp4` : null;
        fs.mkdirSync(path.join(projectDir, 'out', 'final'), { recursive: true });
        if (finalVertical && main !== 'video.mp4') {
          const mux = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', out(V), '-i', out(main), '-map', '0:v', '-map', '1:a?', '-c', 'copy', '-shortest', '-movflags', '+faststart', path.join(projectDir, 'out', 'final', finalVertical)], { encoding: 'utf8' });
          if (mux.status !== 0) return sendJson(res, 500, { ok: false, error: `Could not give the vertical video the approved soundtrack: ${(mux.stderr || '').slice(0, 300)}` });
        } else if (finalVertical) fs.copyFileSync(out(V), path.join(projectDir, 'out', 'final', finalVertical));
        fs.copyFileSync(out(main), path.join(projectDir, 'out', 'final', final));
        const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(projectDir, 'out', 'final', final)], { encoding: 'utf8' });
        const cutNames = fs.readdirSync(path.join(projectDir, 'out')).filter((f) => /^cut-\d+\.mp4$/.test(f)).sort();
        const cutFinals = cutNames.map((c) => ({ video: c, final: approveCut(c) }));
        const open = (both ? [main, V] : [name]).concat(cutNames).reduce((a, v) => a + (readNotes(projectDir)[v]?.comments || []).filter((n) => n.status !== 'done').length, 0);
        const info = { at: new Date().toISOString(), video: main, ...(both ? { videos: [main, V], final_vertical: finalVertical } : {}), ...(cutFinals.length ? { cuts: cutFinals } : {}), final, length_s: Math.round(Number(probe.stdout) * 10) / 10 || null, size_bytes: fs.statSync(path.join(projectDir, 'out', 'final', final)).size, open_comments: open };
        fs.mkdirSync(path.dirname(approvedFile), { recursive: true });
        fs.writeFileSync(approvedFile, JSON.stringify(info, null, 1) + '\n');
        // what this video teaches the next one: proposed now from the plan; Claude adds its review lessons
        try { proposeLearnings(projectDir, { voiceName: (id) => findVoice(id)?.name || id }); } catch {}
        refreshDashboard(projectDir);
        track('approved', { ...projectProps(projectDir), comments: Object.values(readNotes(projectDir)).reduce((a, v) => a + (v?.comments || []).length, 0), cut: false });
        console.log(`Video approved: ${path.join(projectDir, 'out', 'final', final)}${open ? ` (${open} comment${open === 1 ? '' : 's'} left open)` : ''}. Next: write the review lessons (review/lessons.json) for the Delivery card.`);
        return sendJson(res, 200, { ok: true, ...info });
      }
      // D-92: comments on the thumbnail (same shape and merge as a video's; the time is 0)
      if (req.method === 'POST' && url.pathname === '/api/thumbnail-comments') {
        if (!/^application\/json/.test(req.headers['content-type'] || '')) return sendJson(res, 415, { ok: false, error: 'JSON only' });
        const body = JSON.parse((await readBody(req)) || '{}');
        if (!Array.isArray(body.comments) || body.comments.length > 100) return sendJson(res, 400, { ok: false, error: 'comments must be a list' });
        const notes = mergeNotes(readNotes(projectDir)[THUMB_KEY]?.comments || [], body.comments.map((n) => cleanNote({ ...n, t: 0 })).map((n) => ({ ...n, scene: 'thumbnail' })));
        writeNotes(projectDir, THUMB_KEY, notes, { size: 0, mtime: 0 });
        return sendJson(res, 200, { ok: true, saved: notes.length });
      }
      if (req.method === 'POST' && url.pathname === '/api/comments') {
        if (!/^application\/json/.test(req.headers['content-type'] || '')) return sendJson(res, 415, { ok: false, error: 'JSON only' });
        const body = JSON.parse((await readBody(req)) || '{}');
        const meta = listVideos(projectDir).find((v) => v.name === body.video);
        if (!meta) return sendJson(res, 400, { ok: false, error: 'no such video' });
        if (!Array.isArray(body.comments) || body.comments.length > MAX_NOTES) return sendJson(res, 400, { ok: false, error: 'comments must be a list' });
        // merged with what is on disk, so a page that has not seen the agent's latest marks never undoes them
        const notes = mergeNotes(readNotes(projectDir)[meta.name]?.comments || [], body.comments.map(cleanNote));
        writeNotes(projectDir, meta.name, notes, meta);
        return sendJson(res, 200, { ok: true, saved: notes.length });
      }
      return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const p = server.address().port;
      resolve({ server, port: p, url: `http://${host}:${p}/`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir || !fs.existsSync(dir)) { console.error('usage: node plan/review/serve.mjs <project> [--port 4330]'); process.exit(1); }
  const pi = args.indexOf('--port');
  listenOnFree((p) => startServer({ projectDir: dir, port: p }), pi >= 0 ? Number(args[pi + 1]) : 4330).then((s) => {
    recordPage(path.resolve(dir), 'review', s.url);
    const opened = openInBrowser(s.url);
    console.log(`review page: ${s.url}  (${opened ? 'opened in your browser; ' : ''}comments go to ${path.join(path.resolve(dir), 'review', 'comments.md')}; Ctrl+C to stop)`);
  }).catch((e) => { console.error(`Stopped: ${e.message}`); process.exit(1); });
}
