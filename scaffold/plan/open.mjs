// open.mjs — opens a page the skill serves in the user's default browser, so they never copy an address by hand.
// Skipped with --no-open, ULTRADEMO_NO_OPEN=1 or in CI. Only our own 127.0.0.1 pages are ever opened.
import { spawn } from 'node:child_process';

export function openInBrowser(url, argv = process.argv) {
  if (argv.includes('--no-open') || process.env.ULTRADEMO_NO_OPEN === '1' || process.env.CI || process.env.NODE_TEST_CONTEXT) return false;
  if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) return false;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch { return false; }
}
