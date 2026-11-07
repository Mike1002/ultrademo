#!/usr/bin/env node
// confirm.mjs — confirm a direction without the pages (a scripted run, or the skill when the user
// left the choice to it): writes the direction block and the scene outlines into plan.json, exactly
// as the Confirm button does.
//   node plan/direction/confirm.mjs <project-dir> <A|B|C>
import path from 'node:path';
import { confirmDirection } from './serve.mjs';

const [projectArg, pick] = process.argv.slice(2);
const index = { A: 0, B: 1, C: 2, 1: 0, 2: 1, 3: 2 }[String(pick || '').toUpperCase()];
if (!projectArg || index === undefined) { console.error('usage: node plan/direction/confirm.mjs <project-dir> <A|B|C>'); process.exit(2); }
const r = confirmDirection(path.resolve(projectArg), index);
if (!r.ok) { console.error(`Not confirmed:\n${r.problems.map((p) => `- ${p.what}${p.fix ? ` (${p.fix})` : ''}`).join('\n')}`); process.exit(1); }
console.log(`confirmed direction ${String(pick).toUpperCase()}: ${r.plan.direction.name}; ${r.plan.scenes.length} scenes, ${r.plan.video.length_s} s`);
for (const p of r.problems || []) console.log(`note: ${p.scene ? `${p.scene}: ` : ''}${p.what}`);
console.log(r.planPath);
await import('../telemetry.mjs').then((t) => t.track('direction_confirmed', t.projectProps(path.resolve(projectArg)))).catch(() => {});
