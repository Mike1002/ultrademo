// state.mjs — where the update check and the usage statistics keep their small files (.ultrademo/), and this version.
// Shared by plan/updates.mjs and plan/telemetry.mjs so neither has to import the other.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCAFFOLD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATE_DIR = process.env.ULTRADEMO_STATE_DIR || path.join(SCAFFOLD, '.ultrademo');
export function localVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(SCAFFOLD, 'package.json'), 'utf8')).version || '0.0.0'; } catch { return '0.0.0'; }
}
