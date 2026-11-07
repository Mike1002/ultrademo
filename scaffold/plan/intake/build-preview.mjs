#!/usr/bin/env node
// build-preview.mjs — write preview.html: the intake page with sample values and no server.
//
//   node plan/intake/build-preview.mjs
//
// The sample product is the Orbit fixture (D-03): "Invite your team", Jamie Dalton,
// Sam Kim, Morgan Lee. One field is left Unsure with a hint so the behaviour shows.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIntakePage } from './page.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const SAMPLE_VIDEO = {
  product: 'Orbit',
  url: 'https://orbit.example',
  template: 'launch',
  viewer: 'Teams setting up their first shared workspace',
  claim: 'Your whole team in, one invite',
  pain_point: 'Chasing sign-ups by email, one person at a time',
  proof_moment: 'Jamie sends one invite; Sam and Morgan appear in the workspace',
  cta: null,
  length_s: 30,
  narration: 'hybrid',
  autonomy: 'review',
  copy: { register: 'balanced' },
  sources: [],
  claims: [],
  format: '1920x1080',
  intake: {
    project_name: 'orbit-launch-2026-10-29',
    voice: { preference: 'female', source: 'built-in' },
    look: { words: 'kinetic type, dark, warm, the product doing the talking', chips: ['kinetic type', 'dark', 'warm'] },
    footage: { have: 'none', files: [], links: [], channel: '', wants_recording_recipe: true },
    sign_in: { path: 'dedicated-profile', token_note: '', browser: { chromium: true, label: 'Chrome' } },
    product_type: 'web-app',
    site: {
      title: 'Orbit – Invite your team in seconds',
      description: 'Orbit gives small teams one shared workspace. Invite everyone with a single link.',
      headings: ['Invite your team', 'One link, every teammate', 'See who joined, as they join', 'Start free'],
    },
    unsure: { cta: 'Unsure at intake; the direction step proposes it. Hint: probably Start free' },
    submitted_at: '2026-10-29T09:00:00.000Z',
  },
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = path.join(HERE, 'preview.html');
  fs.writeFileSync(out, renderIntakePage({ prefill: SAMPLE_VIDEO, projectDir: '', today: '2026-10-29', sample: true }));
  console.log(out);
}
