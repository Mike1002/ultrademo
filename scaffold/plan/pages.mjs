// pages.mjs — where a project's pages run. Each page server takes its usual port, or the next free one when another
// video's page holds it, and records its address in <project>/pages.json, so the other pages and the dashboard can link
// to it. Nothing here opens a port to anything but 127.0.0.1.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Start a server on `port`, or the next free port up to `tries` above it. start(port) resolves to { url, ... }. */
export async function listenOnFree(start, port, tries = 20) {
  for (let p = port, i = 0; ; p++, i++) {
    try { return await start(p); }
    catch (err) { if (err?.code !== 'EADDRINUSE' || i >= tries) throw err; }
  }
}

const file = (projectDir) => path.join(projectDir, 'pages.json');
export function pagesOf(projectDir) {
  try { return JSON.parse(fs.readFileSync(file(projectDir), 'utf8')); } catch { return {}; }
}
/** kind: intake | direction | review */
export function recordPage(projectDir, kind, url) {
  try {
    const all = { ...pagesOf(projectDir), [kind]: { url, pid: process.pid, at: new Date().toISOString() } };
    fs.writeFileSync(file(projectDir), JSON.stringify(all, null, 1) + '\n');
  } catch {}
}
/** Stop a project's page servers (its own and its vertical version's): only a process whose command line is one of our
 * page servers for this very folder is stopped, so a reused process number is never touched. Returns how many stopped. */
export function stopPages(projectDir) {
  let n = 0;
  for (const dir of [projectDir, path.join(projectDir, 'vertical')]) {
    for (const p of Object.values(pagesOf(dir))) {
      if (!pageAlive(p)) continue;
      let cmd = '';
      try { cmd = execFileSync('ps', ['-p', String(p.pid), '-o', 'command='], { encoding: 'utf8' }); } catch { continue; }
      if (!/plan\/(intake|direction|review)\/serve\.mjs|plan\/direction\/run\.mjs/.test(cmd) || !cmd.includes(path.basename(projectDir))) continue;
      try { process.kill(p.pid); n++; } catch {}
    }
  }
  return n;
}

/** Is the process that recorded the page still running? (The page may still be closed; a fetch tells for sure.) */
export function pageAlive(entry) {
  if (!entry?.pid) return false;
  try { process.kill(entry.pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
