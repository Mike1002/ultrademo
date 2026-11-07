#!/usr/bin/env node
// dashboard/build.mjs — writes the saved dashboard, ultrademo-dashboard.html beside the projects folder. The steps call
// refreshDashboard(projectDir) after they change something (brief saved, brand saved, direction confirmed, video
// approved, learnings kept), so the file opens from Finder with the latest state even when nothing is running.
//   node plan/dashboard/build.mjs [projects-dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectDashboard, PROJECTS_DIR } from './data.mjs';
import { renderDashboard } from './page.mjs';
import { BRANDS_DIR } from '../brands.mjs';

export function writeDashboard({ projectsDir = PROJECTS_DIR, brandsDir = BRANDS_DIR } = {}) {
  const out = path.join(path.dirname(path.resolve(projectsDir)), 'ultrademo-dashboard.html');
  fs.writeFileSync(out, renderDashboard(collectDashboard({ projectsDir, brandsDir }), { live: false }));
  return out;
}

/** After a step: rewrite the saved dashboard for the projects folder this project sits in. Only for a real projects/
 * folder (tests and loose folders are left alone); never throws. */
export function refreshDashboard(projectDir) {
  try {
    // a vertical version (<project>/vertical/) belongs to its landscape project
    const dir = path.resolve(projectDir);
    const projectsDir = path.dirname(/^(vertical|cut-\d+)$/.test(path.basename(dir)) ? path.dirname(dir) : dir);
    if (path.basename(projectsDir) !== 'projects') return null;
    return writeDashboard({ projectsDir });
  } catch { return null; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(writeDashboard({ projectsDir: process.argv[2] || PROJECTS_DIR }));
}
