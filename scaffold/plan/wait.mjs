#!/usr/bin/env node
// wait.mjs — the agent's way to wait for the user's pages without watching a log: run it in the background and it exits
// (which the agent's harness reports) the moment the thing it waits for is there. Nothing is read or sent anywhere.
//   node plan/wait.mjs <project> brief     exits when the brief is saved (brief-saved.json newer than the start)
//   node plan/wait.mjs <project> confirmed exits when the user confirms a direction (direction/confirmed.json): start production
//   node plan/wait.mjs <project> comments  exits when the user sends the open comments from the review page to fix
//   node plan/wait.mjs <project> approved  exits when the user approves the video on the review page (review/approved.json)
//   node plan/wait.mjs <project> next      exits when the user presses Start a new video on the Delivery card (review/next.json);
//                                          with the projects folder in place of a project, on the dashboard (projects/.next-video.json)
//   node plan/wait.mjs <project> task      exits when a page started a model step that waits for the agent: a
//                                          tasks/<name>.task.md with no answer newer than it; prints both paths
//   [--timeout <minutes>] (default 60): exits with code 2 when nothing came
import fs from 'node:fs';
import path from 'node:path';

const [, , projectArg, what = 'task', ...rest] = process.argv;
if (!projectArg || !['brief', 'task', 'confirmed', 'approved', 'comments', 'next'].includes(what)) { console.error('usage: node plan/wait.mjs <project> brief|task|confirmed|approved|comments|next [--timeout <minutes>]'); process.exit(2); }
const project = path.resolve(projectArg);
const ti = rest.indexOf('--timeout');
const deadline = Date.now() + (ti >= 0 ? Number(rest[ti + 1]) : 60) * 60_000;
const started = Date.now();
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

/** A task with no answer, or an answer older than the task (the page asked again). */
export function pendingTask(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.task.md')); } catch { return null; }
  for (const f of names.sort((a, b) => mtime(path.join(dir, b)) - mtime(path.join(dir, a)))) {
    const base = f.replace(/\.task\.md$/, '');
    const task = path.join(dir, f);
    const answer = ['json', 'txt'].map((x) => path.join(dir, `${base}.answer.${x}`)).find((a) => fs.existsSync(a));
    if (!answer || mtime(answer) < mtime(task)) return { task, answer: answer || path.join(dir, `${base}.answer.json`) };
  }
  return null;
}

const tick = () => {
  if (what === 'comments') {
    const f = path.join(project, 'review', 'submitted.json');
    if (mtime(f) >= started - 1000) { console.log(`Comments sent to Claude: read ${path.join(project, 'review', 'comments.md')}, fix every open comment by the scene loop, mark each done with a note, re-render the whole video; the review page shows the new version by itself.`); process.exit(0); }
  } else if (what === 'approved') {
    const f = path.join(project, 'review', 'approved.json');
    if (mtime(f) >= started - 1000) { let a = {}; try { a = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {} console.log(`Video approved: ${path.join(project, 'out', 'final', a.final || '')}${a.open_comments ? ` (${a.open_comments} comment(s) left open)` : ''}. Wrap up: tell the user where the final file is, note it in the loop log, stop the page servers.`); process.exit(0); }
  } else if (what === 'next') {
    const f = [path.join(project, 'review', 'next.json'), path.join(project, '.next-video.json')].find((x) => mtime(x) >= started - 1000);
    if (f) { let n = {}; try { n = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {} console.log(`New video started: ${n.project}. Its brief page is open in the user's browser (${n.url}). Run node plan/wait.mjs ${n.project} brief in the background, then start the direction step for that project when it exits.`); process.exit(0); }
  } else if (what === 'confirmed') {
    const f = path.join(project, 'direction', 'confirmed.json');
    if (mtime(f) >= started - 1000) { console.log(`Direction confirmed: ${path.join(project, 'plan.json')}. Start production now (step 3); the user's Production page follows your progress.`); process.exit(0); }
  } else if (what === 'brief') {
    const f = path.join(project, 'brief-saved.json');
    if (mtime(f) >= started - 1000) { console.log(`Brief saved: ${path.join(project, 'plan.json')}. Start the direction step now.`); process.exit(0); }
  } else {
    const t = pendingTask(path.join(project, 'tasks'));
    if (t) { console.log(`Task waiting for Claude: ${t.task} (write the answer to ${t.answer}). The page carries on by itself once it is there.`); process.exit(0); }
  }
  if (Date.now() > deadline) { console.log(`Nothing yet (${what}); run again to keep waiting.`); process.exit(2); }
  setTimeout(tick, 1500);
};
tick();
