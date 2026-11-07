#!/usr/bin/env node
// audition.mjs — the same video in several voices, to choose one by ear: every voice reads the project's narration
// (production/narration.json), each is mixed with the music and sound effects over the picture already rendered by
// whole.mjs (out/video-render.mp4; no new render), and out/auditions/index.html plays them side by side.
//   node --env-file-if-exists=.env plan/production/audition.mjs <project> [--set <folder>] <name>=elevenlabs:<voice-id>[|note] [...]
// Each set is its own folder under out/ (default out/auditions), so a later run never overwrites an earlier comparison.
// Paid voices cost credits per character; each line is voiced once per voice (cached). The video's own narration
// (production/voice/voices.json) is not touched: pick a voice, set direction.voice, run voiceover.mjs and whole.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceover } from './voiceover.mjs';
import { mixAudio, musicFor, sceneCues } from './audio.mjs';
import { uiCssInline, udHeadInline } from '../ui/inline.mjs';

export async function audition(projectDir, voices, { set = 'auditions', log = console.log } = {}) {
  const plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'));
  const silent = path.join(projectDir, 'out', 'video-render.mp4');
  if (!fs.existsSync(silent)) throw new Error(`${silent} not found; run whole.mjs once first`);
  let t = 0;
  const scenes = plan.scenes.map((s) => { const n = { ...s, start_s: t }; t = Math.round((t + s.duration_s) * 1000) / 1000; return n; });
  const music = musicFor(plan.direction, projectDir);
  const sfx = sceneCues(projectDir, scenes, log);
  const dir = path.join(projectDir, 'out', set);
  fs.mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const [i, v] of voices.entries()) {
    const slug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    log(`\n${v.name} (${v.spec})`);
    const r = await voiceover(projectDir, { voice: v.spec, file: `voices-${slug}.json`, log: () => {} });
    const lines = r.lines.map((l) => ({ ...l, path: path.join(projectDir, l.path) }));
    const file = `${String(i + 1).padStart(2, '0')}-${slug}.mp4`;
    const mix = mixAudio({ video: silent, out: path.join(dir, file), duration: t, music: music?.abs ? { abs: music.abs, usable_from_s: music.usable_from_s } : null, voices: lines, sfx });
    const pace = lines.reduce((a, l) => a + l.text.split(/\s+/).length, 0) / lines.reduce((a, l) => a + l.secs, 0);
    rows.push({ name: v.name, spec: v.spec, note: v.note || '', file, words_per_s: Math.round(pace * 100) / 100, problems: r.problems, lufs: mix.measured?.lufs });
    log(`  ${file}: ${rows.at(-1).words_per_s} words/s${r.problems.length ? `; ${r.problems.join('; ')}` : '; every line fits its scene'}`);
  }
  writeAuditionPage(dir, plan, rows);
  fs.writeFileSync(path.join(dir, 'auditions.json'), JSON.stringify(rows, null, 1));
  return { dir, rows };
}

/** The comparison page for a set of auditions (rows from auditions.json). */
export function writeAuditionPage(dir, plan, rows) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice auditions</title>
<style>${uiCssInline()}
body{margin:0;background:var(--surface-soft);color:var(--text);font:16px/1.5 var(--ud-body)}main{max-width:1200px;margin:0 auto;padding:24px 16px 48px}
.ud-head{margin:0 0 22px}h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(28px,4vw,40px);letter-spacing:-.035em;line-height:1.05;margin:10px 0 8px}p{color:var(--text-muted);margin:0 0 22px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr));gap:16px}
.c{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);padding:16px}.c h2{font-size:17px;font-weight:600;margin:0}.c small{color:var(--text-muted);display:block;margin:2px 0 10px}video{width:100%;border-radius:var(--radius-md);display:block;border:1px solid var(--line)}.warn{color:var(--pink-strong)}</style></head>
<body><main>${udHeadInline()}<span class="ud-eyebrow">Voice auditions</span><h1>${esc(plan.video.product)} in every voice</h1><p>The same picture, music and sound effects; only the voice changes. Pace is words per second of speech.</p><div class="grid">
${rows.map((r) => `<div class="c"><h2>${esc(r.name)}</h2><small>${esc(r.note)}${r.note ? ' · ' : ''}${r.words_per_s} words/s${r.problems.length ? ` · <span class="warn">${esc(r.problems.length)} line(s) run long</span>` : ''}</small><video controls preload="metadata" src="${esc(r.file)}"></video></div>`).join('\n')}
</div></main></body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const si = argv.indexOf('--set');
  const set = si >= 0 ? argv.splice(si, 2)[1] : 'auditions';
  if (argv.includes('--page-only')) {
    // rebuild the page from the saved results (no voicing, no mixing)
    const projectDir = path.resolve(argv.find((a) => !a.startsWith('--')));
    const dir = path.join(projectDir, 'out', set);
    writeAuditionPage(dir, JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(dir, 'auditions.json'), 'utf8')));
    console.log(path.join(dir, 'index.html'));
    process.exit(0);
  }
  const [projectArg, ...specs] = argv;
  if (!projectArg || !specs.length) { console.error('usage: node plan/production/audition.mjs <project> <name>=<voice spec>[|note] ...'); process.exit(2); }
  const voices = specs.map((s) => { const [nameSpec, note] = s.split('|'); const k = nameSpec.indexOf('='); return { name: nameSpec.slice(0, k), spec: nameSpec.slice(k + 1), note }; });
  audition(path.resolve(projectArg), voices, { set }).then((r) => console.log(`\n${path.join(r.dir, 'index.html')}`)).catch((e) => { console.error(`Stopped: ${e.message}`); process.exit(1); });
}
