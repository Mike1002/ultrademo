#!/usr/bin/env node
// setup.mjs — first-time setup on a new machine, and the check you can run any time after.
//   npm run setup               checks Node, ffmpeg and disk; installs the pinned packages and both browsers;
//                               creates .env from .env.example for the user to fill in (keys never go through the chat)
//   npm run setup -- --voices   also sets up the free voices, small set (Pocket on any CPU, plus word timings; about 1.6 GB, needs uv)
//   npm run setup -- --voices=all   the small set plus Chatterbox (James, Maria, Cori; Apple silicon or NVIDIA; about 4 GB more)
//                               (with the packages already installed, --voices only adds the voices: no npm ci, no browsers)
//   npm run check               installs nothing: says what is ready and what is missing, with the fix for each
// Usage statistics are on by default and named in the summary (plan/telemetry.mjs: what is sent, how to switch off).
// It never downloads and runs a remote script: uv, Node and ffmpeg are named with their install command for the user.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const VOICES = args.some((a) => a === '--voices' || a.startsWith('--voices='));
const VOICES_ALL = args.includes('--voices=all');
const CAPABLE = (process.platform === 'darwin' && process.arch === 'arm64') || spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore' }).status === 0;
const MAC = process.platform === 'darwin';

const ok = (m) => console.log(`  ✓ ${m}`);
const note = (m) => console.log(`  · ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const missing = [];
const fail = (m) => { console.error(`  ✗ ${m}`); missing.push(m); if (!CHECK) finish(1); };
const has = (cmd, a = ['-version']) => spawnSync(cmd, a, { encoding: 'utf8' }).status === 0;

console.log(CHECK ? 'Ultrademo check' : 'Ultrademo setup');

// 1. the machine
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22) fail(`Node ${process.versions.node} is too old: install Node 22.12 or newer from https://nodejs.org (the LTS installer), then run this again.`);
else if (major === 22 && minor < 12) warn(`Node ${process.versions.node}: the renderer asks for 22.12 or newer. It usually works; if a render fails, update Node from https://nodejs.org.`);
else ok(`Node ${process.versions.node}`);

if (has('ffmpeg') && has('ffprobe')) ok('ffmpeg and ffprobe');
else fail(MAC ? 'ffmpeg is missing: install Homebrew (https://brew.sh), run `brew install ffmpeg`, then run this again.'
  : 'ffmpeg is missing: install it with your package manager (for example `sudo apt install ffmpeg`), then run this again.');

try {
  const st = fs.statfsSync(HERE);
  const free = (st.bavail * st.bsize) / 1e9;
  if (free < 3) warn(`${free.toFixed(1)} GB free on this disk: setup and a few videos need about 3 GB (the free voices about 1.6 GB more).`);
  else ok(`${free.toFixed(0)} GB free on this disk`);
} catch { /* older Node without statfs: skip */ }

// 2. packages and browsers
const QUIET = { HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_NO_AUTO_INSTALL: '1' };
const run = (cmd, a) => { const r = spawnSync(cmd, a, { cwd: HERE, stdio: 'inherit', env: { ...process.env, ...QUIET } }); if (r.status !== 0) fail(`${cmd} ${a.join(' ')} failed (see above).`); };
const pkgsReady = ['playwright', 'hyperframes', 'sharp'].every((p) => fs.existsSync(path.join(HERE, 'node_modules', p))); // sharp since 0.2.1 (uncursor.mjs)
const chromiumReady = async () => {
  try { const { chromium } = await import(path.join(HERE, 'node_modules', 'playwright', 'index.mjs')); return fs.existsSync(chromium.executablePath()); } catch { return false; }
};
if (CHECK) {
  if (pkgsReady) ok('packages'); else fail('the packages are not installed: run `npm run setup`.');
  if (pkgsReady && await chromiumReady()) ok('browser for capture and checks'); else if (pkgsReady) fail('the capture browser is not installed: run `npm run setup`.');
} else if (VOICES && pkgsReady && await chromiumReady()) {
  ok('packages and browsers already installed: adding the voices only');
} else {
  console.log('  installing the pinned packages (npm ci)…');
  run('npm', ['ci', '--no-audit', '--no-fund']);
  ok('packages');
  console.log('  installing the browser the capture and checks use…');
  run('npx', ['--no-install', 'playwright', 'install', 'chromium']);
  console.log('  installing the browser the renderer uses…');
  run('npx', ['--no-install', 'hyperframes@0.8.145', 'browser', 'ensure']);
  ok('browsers');
}

// 3. the env file (created empty; only whether a key is filled in is ever looked at, never its value)
const env = path.join(HERE, '.env');
if (!fs.existsSync(env)) {
  if (CHECK) fail('there is no .env file: run `npm run setup`.');
  else { fs.copyFileSync(path.join(HERE, '.env.example'), env); fs.chmodSync(env, 0o600); ok(`.env created: ${env}`); }
} else ok('.env is in place');
const keyFilled = (name) => { try { return new RegExp(`^${name}=\\S+`, 'm').test(fs.readFileSync(env, 'utf8')); } catch { return false; } };

// 4. voices
const VOICE_ENVS = path.join(HERE, 'voice', '.envs');
const voiceReady = (engine) => ['bin/python', 'Scripts/python.exe'].some((p) => fs.existsSync(path.join(VOICE_ENVS, engine, p)));
const uv = ['uv', path.join(os.homedir(), '.local', 'bin', 'uv'), path.join(os.homedir(), '.cargo', 'bin', 'uv')].find((c) => has(c, ['--version']));
const uvHint = MAC ? '`brew install uv`' : 'the installer at https://docs.astral.sh/uv/getting-started/installation/';
if (VOICES && !CHECK) {
  const engines = ['pocket', 'align'];
  if (VOICES_ALL && CAPABLE) engines.push('chatterbox');
  else if (VOICES_ALL) warn('James, Maria and Cori need Apple silicon or an NVIDIA card to run at a usable speed: setting up the small set only.');
  if (!uv) warn(`the free voices need uv (a small Python manager): install it with ${uvHint}, then run \`npm run setup -- ${VOICES_ALL ? '--voices=all' : '--voices'}\` again.`);
  else for (const engine of engines) {
    if (voiceReady(engine)) continue;
    const r = spawnSync(process.execPath, ['scripts/voice.mjs', 'setup', engine], { cwd: HERE, stdio: 'inherit' });
    if (r.status !== 0) { warn(`the ${engine} voice setup failed (see above); the rest works without it.`); continue; }
    // James's model downloads now rather than in the middle of the first video (Maria and Cori add theirs on first use)
    if (engine === 'chatterbox') spawnSync(process.execPath, ['scripts/voice.mjs', 'warm', engine], { cwd: HERE, stdio: 'inherit' });
  }
}
// 5. usage statistics: on by default, said so here once; the ids and the record live in .ultrademo/
let tel = null;
try { tel = await import('../plan/telemetry.mjs'); } catch {}
if (tel && !CHECK) tel.markNoticeShown();
if (tel && !CHECK && !missing.length) await tel.track('setup_done', { voices_free: voiceReady('pocket'), voices_paid: fs.existsSync(env) && keyFilled('ELEVENLABS_API_KEY') });
finish(missing.length ? 1 : 0);

function finish(code) {
  const paid = fs.existsSync(env) && keyFilled('ELEVENLABS_API_KEY');
  const free = voiceReady('pocket');
  const big = voiceReady('chatterbox');
  const freeLine = free
    ? `yes: Mary, Eve, George, Alba, Stuart Bell${big ? ', James, Maria, Cori' : CAPABLE ? ' (James, Maria and Cori: `npm run setup -- --voices=all`, about 4 GB more)' : ''}`
    : `no: optional; \`npm run setup -- --voices\` sets up the small set (about 1.6 GB)${CAPABLE ? ', `--voices=all` adds James, Maria and Cori (about 4 GB more)' : ''}${uv ? '' : `; needs uv: ${uvHint}`}`;
  console.log(`
What is ready
  Videos               ${missing.length ? 'not yet: fix the ✗ lines above' : 'yes'}
  Paid voices          ${paid ? 'yes (ElevenLabs key found in .env)' : 'no: optional; paste your own ElevenLabs key into .env after ELEVENLABS_API_KEY='}
  Free voices          ${freeLine}
  Music-only videos    ${missing.length ? 'not yet' : 'yes, no voice needed'}
${!paid && !free ? `\n  Without either voice, narrated videos use your computer's built-in voice${MAC ? ' (macOS say)' : ''} as a stand-in.\n` : ''}
  Usage statistics     ${tel?.telemetryOn() ? 'on: anonymous counts of the steps you reach, video types and formats, never your product, words, frames or keys. See them: npm run telemetry -- show. Switch off: npm run telemetry -- off' : 'off'}

  Keys go in ${env}
  Never paste a key into the chat.
${code === 0 && !CHECK ? `
Next: ask your agent for a video, for example "Make a launch video of https://your-product.com".
  Claude Code in the terminal:  cd ${HERE} && claude
  Claude desktop app:           Code tab, choose the folder ${HERE}
` : ''}`);
  process.exit(code);
}
