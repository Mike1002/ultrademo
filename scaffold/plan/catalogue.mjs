// catalogue.mjs — read-only lookups into the galleries and the HyperFrames copy.
//
// The validator needs three id sets: motion styles (rules), shot blueprints and
// video styles. They live outside scaffold/ and are treated as data; nothing
// here writes. The project root is found from this file's location
// (scaffold/plan → ../..) or from ULTRADEMO_ROOT.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.ULTRADEMO_ROOT || path.resolve(HERE, '..', '..');

export const PATHS = {
  motionGallery: 'research/motion-craft/motion-gallery/index.json',
  videoStyleGallery: 'research/motion-craft/video-style-gallery/index.json',
  blueprintsIndex: 'research/motion-craft/2026-10-13-hyperframes-skills/skills/hyperframes-animation/blueprints-index.md',
};

/**
 * Our own shot blueprints (D-49). They have no gallery file yet; when the
 * gallery takes them over, drop this list and let the index carry them.
 */
export const OUR_BLUEPRINTS = ['ui-element-morph-cycle', 'object-role-relay'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Load the three id sets. Missing files are reported, not thrown, so the
 * validator can print one plain line instead of a stack trace.
 * @param {string} [root]
 * @returns {{ rules: Set<string>, blueprints: Set<string>, videoStyles: Set<string>, missing: string[] }}
 */
export function loadCatalogue(root = ROOT) {
  const missing = [];
  const rules = new Set();
  const entries = []; // { id, purpose, energy, family } per motion style, for the per-scene fallback (schema.momentRules)
  const blueprints = new Set(OUR_BLUEPRINTS);
  const videoStyles = new Set();

  const mg = path.join(root, PATHS.motionGallery);
  if (fs.existsSync(mg)) {
    for (const e of readJson(mg).entries ?? []) {
      rules.add(e.id);
      entries.push({ id: e.id, purpose: e.purpose || [], energy: e.energy, family: e.family_group || e.family });
      for (const a of e.aliases ?? []) rules.add(String(a).replace(/^awesome-ai-motion:/, ''));
    }
  } else missing.push(PATHS.motionGallery);

  const vs = path.join(root, PATHS.videoStyleGallery);
  if (fs.existsSync(vs)) {
    for (const e of readJson(vs).entries ?? []) videoStyles.add(e.id);
  } else missing.push(PATHS.videoStyleGallery);

  const bp = path.join(root, PATHS.blueprintsIndex);
  if (fs.existsSync(bp)) {
    const md = fs.readFileSync(bp, 'utf8');
    for (const m of md.matchAll(/<blueprint id="([a-z0-9-]+)"/g)) blueprints.add(m[1]);
  } else missing.push(PATHS.blueprintsIndex);

  return { rules, blueprints, videoStyles, entries, missing };
}
