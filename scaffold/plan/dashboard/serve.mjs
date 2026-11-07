#!/usr/bin/env node
// dashboard/serve.mjs — the live dashboard: your videos, saved brands and learnings, with buttons that act (start a
// new video, keep proposed learnings, switch a learning off, edit, remove, add). A dependency-free local server,
// 127.0.0.1 only; writes are same-origin JSON. Pictures and final files are served only from the projects, brands and
// font folders. Each change also rewrites the saved copy (ultrademo-dashboard.html).
//   node plan/dashboard/serve.mjs [--port 4320] [--no-open]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectDashboard, PROJECTS_DIR } from './data.mjs';
import { renderDashboard, SCAFFOLD, LIVE_PORT } from './page.mjs';
import { writeDashboard } from './build.mjs';
import { BRANDS_DIR, readBrandProfile } from '../brands.mjs';
import { updateLearning, addLearning, keepLearnings } from '../learnings.mjs';
import { startNewVideo } from '../newvideo.mjs';
import { listenOnFree, stopPages } from '../pages.mjs';
import { openInBrowser } from '../open.mjs';
import { sendUi } from '../intake/serve.mjs';

const MAX_BODY = 100_000;
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const FONTS = path.join(SCAFFOLD, '..', 'research', 'motion-craft', 'video-style-gallery', '_fonts');
const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra });
  res.end(body);
};
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
const within = (file, dir) => { const r = path.relative(dir, file); return Boolean(r) && !r.startsWith('..') && !path.isAbsolute(r); };
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const sameOrigin = (req) => !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;

export function startServer({ port = LIVE_PORT, host = '127.0.0.1', projectsDir = PROJECTS_DIR, brandsDir = BRANDS_DIR } = {}) {
  projectsDir = path.resolve(projectsDir);
  const saved = () => { try { if (path.basename(projectsDir) === 'projects') writeDashboard({ projectsDir, brandsDir }); } catch {} };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, renderDashboard(collectDashboard({ projectsDir, brandsDir }), { live: true }));
      if (req.method === 'GET' && url.pathname === '/api/ping') return sendJson(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname.startsWith('/ui/')) return sendUi(res, url.pathname);
      if (req.method === 'GET' && url.pathname === '/watch') {
        // play a video in the browser (with seeking): an mp4 in a project's out/ or out/final/
        const file = path.resolve(SCAFFOLD, url.searchParams.get('p') || '');
        const rel = path.relative(projectsDir, file).split(path.sep);
        const ok = path.extname(file).toLowerCase() === '.mp4' && within(file, projectsDir) && (rel[1] === 'out' || (rel[1] === 'vertical' && rel[2] === 'out')) && rel.length <= 5;
        if (!ok || !fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
        const size = fs.statSync(file).size;
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        const head = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
        if (m) {
          const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
          const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          if (!(start <= end && start < size)) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
          res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
          return fs.createReadStream(file, { start, end }).pipe(res);
        }
        res.writeHead(200, { ...head, 'content-length': size });
        return fs.createReadStream(file).pipe(res);
      }
      if (req.method === 'GET' && (url.pathname === '/img' || url.pathname === '/final')) {
        // pictures and fonts from the projects, brands and font folders; final videos from projects/*/out/final/
        const file = path.resolve(SCAFFOLD, url.searchParams.get('p') || '');
        const ext = path.extname(file).toLowerCase();
        const ok = url.pathname === '/final'
          ? ext === '.mp4' && within(file, projectsDir) && path.basename(path.dirname(file)) === 'final'
          : Boolean(TYPES[ext]) && (within(file, projectsDir) || within(file, brandsDir) || within(file, FONTS));
        if (!ok || !fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
        // a picture never runs as a page here (an SVG from a site could carry script)
        const headers = { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" };
        if (url.pathname === '/final') headers['content-disposition'] = `attachment; filename="${path.basename(file).replace(/"/g, '')}"`;
        return send(res, 200, fs.readFileSync(file), url.pathname === '/final' ? 'video/mp4' : TYPES[ext], headers);
      }
      if (req.method !== 'POST') return send(res, 404, 'not found', 'text/plain; charset=utf-8');
      if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'refused: the request came from another page' });
      const body = JSON.parse((await readBody(req)) || '{}');
      const slug = String(body.brand || '');
      if (url.pathname === '/api/learning') {
        const r = updateLearning(slug, String(body.id || ''), { on: body.on, text: body.text, remove: body.remove === true }, brandsDir);
        if (!r) return sendJson(res, 404, { ok: false, error: 'No such learning.' });
        saved(); return sendJson(res, 200, { ok: true });
      }
      if (url.pathname === '/api/learning-add') {
        const r = addLearning(slug, { kind: body.kind, text: body.text }, brandsDir);
        if (!r) return sendJson(res, 400, { ok: false, error: 'Write the learning first.' });
        saved(); return sendJson(res, 200, { ok: true });
      }
      if (url.pathname === '/api/learnings-keep') {
        const name = String(body.project || '');
        const dir = path.join(projectsDir, name);
        if (!/^[A-Za-z0-9][\w.-]{0,120}$/.test(name) || !fs.existsSync(path.join(dir, 'plan.json'))) return sendJson(res, 404, { ok: false, error: 'No such video.' });
        const r = keepLearnings(dir, Array.isArray(body.picks) ? body.picks.slice(0, 50) : [], { dir: brandsDir });
        console.log(`Learnings kept for ${r.brand}: ${r.kept}.`);
        saved(); return sendJson(res, 200, { ok: true, ...r });
      }
      if (url.pathname === '/api/remove') {
        // not a delete: the folder moves to projects/_removed/ (the dashboard does not list it; move it back from Finder)
        const name = String(body.project || '');
        const dir = path.join(projectsDir, name);
        if (!/^[A-Za-z0-9][\w.-]{0,120}$/.test(name) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return sendJson(res, 404, { ok: false, error: 'No such video.' });
        const stopped = stopPages(dir);
        const bin = path.join(projectsDir, '_removed');
        fs.mkdirSync(bin, { recursive: true });
        let to = path.join(bin, name), k = 2;
        while (fs.existsSync(to)) to = path.join(bin, `${name}-${k++}`);
        fs.renameSync(dir, to);
        console.log(`Removed from the dashboard: ${name} (moved to ${to}${stopped ? `; ${stopped} page${stopped === 1 ? '' : 's'} stopped` : ''}).`);
        saved(); return sendJson(res, 200, { ok: true, moved_to: to, stopped });
      }
      if (url.pathname === '/api/new-video') {
        const brand = slug ? readBrandProfile(slug, brandsDir) : null;
        const n = await startNewVideo({ projectsDir, brand, brandsDir });
        // a session waiting with `wait.mjs projects next` picks it up
        fs.writeFileSync(path.join(projectsDir, '.next-video.json'), JSON.stringify(n, null, 1) + '\n');
        console.log(`New video started from the dashboard: ${n.project}. Its brief page: ${n.url}. Run node plan/wait.mjs ${n.project} brief in the background and start the direction step when it exits.`);
        saved(); return sendJson(res, 200, { ok: true, url: n.open, project: path.basename(n.project) });
      }
      return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const { port: p } = server.address();
      resolve({ server, port: p, url: `http://${host}:${p}/`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--port');
  listenOnFree((p) => startServer({ port: p }), pi >= 0 ? Number(args[pi + 1]) : LIVE_PORT).then((s) => {
    try { writeDashboard(); } catch {}
    // once a day: a newer version shows as a banner on both copies of the dashboard (never installed by itself)
    import('../updates.mjs').then((u) => u.checkForUpdate()).then((u) => { if (u.newer) { try { writeDashboard(); } catch {} console.log(`Update available: Ultrademo ${u.latest} (this is ${u.current}).`); } }).catch(() => {});
    console.log(`Dashboard: ${s.url}${openInBrowser(s.url) ? '  (opened in your browser)' : ''}  (Ctrl+C to stop)`);
  }).catch((err) => { console.error(`Stopped: ${err.message}`); process.exit(1); });
}
