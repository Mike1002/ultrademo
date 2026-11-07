// newvideo.mjs — start the next video: a new project folder and its brief page on a free port, filled from a saved
// brand when there is one. Used by the Delivery card (Start a new video) and the dashboard (New video on a brand). The
// brief page runs on its own (no browser of its own: the page that asked goes there); its address goes in pages.json.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BRANDS_DIR, brandSlug } from './brands.mjs';

const INTAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'intake', 'serve.mjs');
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.unref(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
async function waitUp(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return true; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  return false;
}

/** { projectsDir, brand (a saved brand profile or null), product } → { project, url, open, pid, brand, at } */
export async function startNewVideo({ projectsDir, brand = null, product = '', brandsDir = BRANDS_DIR, now = new Date() }) {
  const base = `${brandSlug(brand?.name || product || 'video')}-${now.toISOString().slice(0, 10)}`;
  let name = base, n = 2;
  while (fs.existsSync(path.join(projectsDir, name))) name = `${base}-${n++}`;
  const dir = path.join(projectsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  const port = await freePort();
  const log = fs.openSync(path.join(dir, 'intake.log'), 'a');
  const child = spawn(process.execPath, [INTAKE, dir, '--port', String(port)], { detached: true, stdio: ['ignore', log, log], env: { ...process.env, ULTRADEMO_NO_OPEN: '1', ...(brandsDir !== BRANDS_DIR ? { ULTRADEMO_BRANDS_DIR: brandsDir } : {}) } });
  child.unref();
  const url = `http://127.0.0.1:${port}/`;
  if (!(await waitUp(url))) { try { process.kill(child.pid); } catch {} throw new Error('the brief page did not start'); }
  return { project: dir, url, open: `${url}${brand ? `?brand=${encodeURIComponent(brand.slug)}` : ''}`, pid: child.pid, brand: brand?.slug || null, at: now.toISOString() };
}

// CLI, for a session started from the dashboard: a new project and its brief page, opened in the browser.
//   node plan/newvideo.mjs [--brand <slug>]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { readBrandProfile } = await import('./brands.mjs');
  const { openInBrowser } = await import('./open.mjs');
  const i = process.argv.indexOf('--brand');
  const brand = i >= 0 ? readBrandProfile(process.argv[i + 1]) : null;
  if (i >= 0 && !brand) { console.error(`No saved brand "${process.argv[i + 1]}".`); process.exit(1); }
  const n = await startNewVideo({ projectsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'projects'), brand });
  console.log(`New video: ${n.project}\nBrief page: ${n.open}${openInBrowser(n.open) ? '  (opened in your browser)' : ''}\nNext: node plan/wait.mjs ${n.project} brief (in the background), then the direction step.`);
}
