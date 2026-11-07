// The "verify" step after a see-and-fix loop: lint, renderer check, a real scene render and the composition checks, for chosen scenes.
// Usage: node plan/production/verify.mjs <project-dir> <scene-id>[,<scene-id>...] [--no-render]
import fs from 'node:fs';
import path from 'node:path';
import { scratchHost, lintProject, checkProject } from './frames.mjs';
import { renderProject, probeVideo } from './render.mjs';
import { probeComposition, sceneComposition } from './composition.mjs';
import { probeScenes, runChecks } from './checks.mjs';

const args = process.argv.slice(2);
const [projectArg, idsArg] = args.filter((a) => !a.startsWith('--'));
const projectDir = path.resolve(projectArg);
const plan = JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'));
const ids = idsArg.split(',');
const scenes = plan.scenes.filter((s) => ids.includes(s.id));
const outDir = path.join(projectDir, 'production', 'look');
fs.mkdirSync(outDir, { recursive: true });
const report = {};
for (const s of scenes) {
  const dir = scratchHost(projectDir, plan, s);
  const lint = lintProject(dir);
  const check = checkProject(dir);
  const r = { lint: { errors: lint.errors, warnings: lint.warnings, text: lint.text }, check: { errors: check.errors, warnings: check.warnings, text: check.text } };
  if (!args.includes('--no-render')) {
    fs.mkdirSync(path.join(outDir, 'scenes'), { recursive: true });
    const out = path.join(outDir, 'scenes', `${s.id}.mp4`);
    const t0 = Date.now();
    const rr = renderProject(dir, out, { fps: plan.video.fps, workers: 2 });
    r.render = { ok: rr.ok, seconds: Math.round((Date.now() - t0) / 100) / 10, file: out, probe: rr.ok ? probeVideo(out) : rr };
  }
  report[s.id] = r;
}
const comp = await probeComposition({ plan: { ...plan, scenes }, projectDir });
for (const s of scenes) report[s.id].composition = sceneComposition(s, comp[s.id], plan);
// the scene checks the pipeline runs (copy, reading windows, numbers, motion, still holds), on the same scenes
const probes = await probeScenes({ plan: { ...plan, scenes }, projectDir });
const buildResults = Object.fromEntries(scenes.map((s) => [s.id, { id: s.id, ok: true, lint: report[s.id].lint, check: report[s.id].check, problems: [] }]));
// the whole plan, so each scene is checked in its place (frame-0 rules apply to the first scene of the video only)
const checks = runChecks({ plan, projectDir, outDir, probes, composition: comp, buildResults });
for (const sc of checks.scenes) if (report[sc.id]) report[sc.id].checks = sc;
for (const [id, r] of Object.entries(report)) {
  console.log(`\n== ${id}`);
  console.log(`lint: ${r.lint.errors} error(s), ${r.lint.warnings} warning(s)${r.lint.text ? '\n' + r.lint.text : ''}`);
  console.log(`check: ${r.check.errors} error(s), ${r.check.warnings} warning(s)${r.check.text ? '\n' + r.check.text : ''}`);
  if (r.render) console.log(`render: ${r.render.ok ? 'ok' : 'FAILED'} in ${r.render.seconds} s ${r.render.ok ? JSON.stringify(r.render.probe) : JSON.stringify(r.render.probe).slice(0, 800)}`);
  const c = r.composition;
  console.log(`composition: ${c.findings.length} finding(s) over ${c.samples} samples; measured ${JSON.stringify(c.measured)}`);
  for (const f of c.findings) console.log('  - ' + f.text);
  const k = r.checks;
  if (k) {
    console.log(`scene checks: ${k.status}${k.status_reason ? ` (${k.status_reason})` : ''}`);
    for (const f of (k.findings || []).filter((f) => f.level !== 'pass')) console.log(`  - ${f.level} ${f.check}: ${f.text}`);
  }
}
// keep the records of scenes checked in earlier runs; this run replaces only its own scenes
const verifyFile = path.join(outDir, 'verify.json');
let prior = {};
try { prior = JSON.parse(fs.readFileSync(verifyFile, 'utf8')); } catch { /* first run */ }
fs.writeFileSync(verifyFile, JSON.stringify({ ...prior, ...report }, null, 1));
