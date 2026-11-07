#!/usr/bin/env node
// save.mjs — write the brief without the page (a scripted run, or the skill answering the intake
// itself when the user left the run to it): the same buildVideo, the same checks, the same plan.json.
//   node plan/intake/save.mjs <project-dir> <brief.json>
// The brief has the page's fields (product, url, product_type, template, viewer, claim, pain_point,
// proof_moment, cta, length_s, narration, autonomy, tone, look, footage, sign_in, reference, voice);
// any field listed under "unsure" (with an optional hint) is left for the direction step to propose.
import fs from 'node:fs';
import path from 'node:path';
import { saveBrief } from './serve.mjs';
import { track, projectProps } from '../telemetry.mjs';

const [projectArg, briefArg] = process.argv.slice(2);
if (!projectArg || !briefArg) { console.error('usage: node plan/intake/save.mjs <project-dir> <brief.json>'); process.exit(2); }
const projectDir = path.resolve(projectArg);
fs.mkdirSync(projectDir, { recursive: true });
const r = saveBrief(projectDir, JSON.parse(fs.readFileSync(path.resolve(briefArg), 'utf8')));
if (!r.ok) { console.error(`Not saved:\n${r.problems.map((p) => `- ${typeof p === 'string' ? p : `${p.field || p.path || ''} ${p.what || p.message || JSON.stringify(p)}`}`).join('\n')}`); process.exit(1); }
console.log(`brief saved: ${r.video.product} · ${r.video.template} · ${r.video.length_s ?? '?'} s · ${r.video.narration ?? 'narration unsure'}`);
console.log(r.planPath);
await track('brief_saved', projectProps(path.dirname(r.planPath)));
