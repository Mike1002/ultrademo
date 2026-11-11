// serve.mjs — the outline page's server (D-91). 127.0.0.1 only; POSTs from another origin are refused.
//   GET  /            the page (a waiting page until the outline is written)
//   GET  /shot/<path>  a screenshot from the sign-in test (outline/reach/*.jpg only)
//   POST /api/confirm  { moments, demo_account, creates_ok } → the confirmed outline in plan.json, outline/confirmed.json
//   POST /api/retest   run the sign-in test again
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { readPlan, writePlan, sendUi } from '../intake/serve.mjs';
import { listenOnFree, recordPage } from '../pages.mjs';
import { renderOutlinePage } from './page.mjs';
import { confirmOutline } from './outline.mjs';
import { testReach } from './signin.mjs';

const sameOrigin = (req) => !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
const sendJson = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = (req, max = 2_000_000) => new Promise((resolve, reject) => {
  let n = 0; const chunks = [];
  req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject);
});

export function startOutlineServer({ projectDir, port = 4325, host = '127.0.0.1', now = () => new Date(), chromium = null }) {
  projectDir = path.resolve(projectDir);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/') {
        const { plan } = readPlan(projectDir);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(renderOutlinePage({ video: plan?.video || {}, outline: plan?.video?.intake?.outline || null }));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/ui/')) return sendUi(res, url.pathname);
      if (req.method === 'GET' && url.pathname.startsWith('/shot/')) {
        const rel = decodeURIComponent(url.pathname.slice(6));
        if (!/^outline\/reach\/\d{2,3}\.jpg$/.test(rel)) { res.writeHead(404); return res.end(); }
        const f = path.join(projectDir, rel);
        if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
        return fs.createReadStream(f).pipe(res);
      }
      if (req.method === 'POST' && !sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'refused: the request came from another page' });
      if (req.method === 'POST' && url.pathname === '/api/confirm') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const { plan } = readPlan(projectDir);
        if (!plan?.video) return sendJson(res, 409, { ok: false, error: 'There is no brief yet.' });
        const r = confirmOutline(plan, { moments: body.moments, demo_account: body.demo_account === true, creates_ok: body.creates_ok === true }, now());
        if (!r.ok) return sendJson(res, 400, { ok: false, problems: r.problems });
        writePlan(projectDir, plan);
        fs.mkdirSync(path.join(projectDir, 'outline'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'outline', 'confirmed.json'), JSON.stringify({ at: r.outline.confirmed_at, moments: r.outline.moments.length, data_ok: r.outline.data_ok }, null, 1) + '\n');
        return sendJson(res, 200, { ok: true, moments: r.outline.moments.length, data_ok: r.outline.data_ok });
      }
      if (req.method === 'POST' && url.pathname === '/api/retest') {
        const { plan } = readPlan(projectDir);
        if (!plan?.video?.intake?.outline) return sendJson(res, 409, { ok: false, error: 'There is no outline yet.' });
        plan.video.intake.outline.signin = await testReach(plan, projectDir, { chromium, now: now() });
        writePlan(projectDir, plan);
        return sendJson(res, 200, { ok: true, signed_in: plan.video.intake.outline.signin.signed_in });
      }
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
    } catch (err) {
      sendJson(res, 500, { ok: false, error: 'Something went wrong on the outline page.' });
    }
  });
  const start = (p) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, host, () => { server.off('error', reject); const u = `http://${host}:${p}/`; recordPage(projectDir, 'outline', u); resolve({ server, url: u, port: p, close: () => new Promise((r) => server.close(r)) }); });
  });
  return listenOnFree(start, port);
}
