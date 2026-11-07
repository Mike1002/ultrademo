#!/usr/bin/env node
// build-preview.mjs — write preview.html: the three screens of the direction
// step for the recorded Orbit run, in one static page with tabs, no server.
//
//   node plan/direction/build-preview.mjs
//
// Assets are referenced relatively: the signature renders and sketches from
// fixtures/orbit-run/project/direction/, the style previews from the
// video-style gallery, the fonts from its _fonts folder, the music from
// scaffold/music. Edits stay on the page; choosing and confirming write nothing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProposals, readState, ASSET_ROOTS, motionGallery } from './serve.mjs';
import { renderPreview } from './page.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.join(HERE, 'fixtures', 'orbit-run', 'project');
const rel = (abs) => path.relative(HERE, abs).split(path.sep).join('/') + '/';

export function buildPreview(out = path.join(HERE, 'preview.html')) {
  const P = loadProposals(PROJECT);
  if (!P) throw new Error(`no recorded run at ${PROJECT}; run node plan/direction/run.mjs on it first`);
  const assets = { project: rel(PROJECT), gallery: rel(ASSET_ROOTS.gallery), motion: rel(ASSET_ROOTS.motion), fonts: rel(ASSET_ROOTS.fonts), music: rel(ASSET_ROOTS.music), voice: rel(ASSET_ROOTS.voice) };
  const cost = fs.existsSync(path.join(PROJECT, 'direction', 'cost.json')) ? JSON.parse(fs.readFileSync(path.join(PROJECT, 'direction', 'cost.json'), 'utf8')) : null;
  const recorded = (cost?.calls || []).map((c) => `${c.name} $${Number(c.recorded_cost_usd ?? c.cost_usd ?? 0).toFixed(4)}`).join(', ');
  const state = { ...readState(PROJECT), stage: 'direction', chosen: 0 };
  const html = renderPreview({ proposals: P, assets, state, motion: motionGallery(), costLine: `Recorded run through OpenRouter (2026-10-29): ${recorded || 'no cost line'}.` });
  fs.writeFileSync(out, html);
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) console.log(buildPreview());
