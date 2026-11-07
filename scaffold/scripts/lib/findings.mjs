// Turns the rendered-frame checks and the critique into rows a person can act on: what the issue is,
// whether it is a problem, what was done or will be done, and whether it needs the user. Used by the gate
// pages so no reader has to interpret a raw measurement.

export const CHECK_NAMES = {
  frame0: 'The hook is on screen from the first frame',
  liveness: 'Product scenes keep moving (nothing sits still long enough to feel like a slideshow)',
  labelHold: 'Labels and headlines hold still for their last second so they can be read',
  captions: 'Captions stay on long enough and are not too fast to read',
  copy: 'Headlines fit in two lines with no single word left alone on the last line',
  echo: 'Narration adds to the words on screen instead of repeating them',
  cutStill: 'Nothing is mid-movement when a scene cuts',
  zoom: 'Zooms stay gentle (at most 1.5x)',
  darkScene: 'A darker scene in the second half for contrast',
  productClose: 'The video ends on the product',
  slideshowRisk: 'Overall, the video reads as a video and not a slideshow',
};

// One plain sentence for a finding, from its measurement.
const describe = (c) => {
  const n = (re) => (c.text.match(re) || [])[1];
  switch (c.check) {
    case 'liveness': return `This scene sits still for ${n(/stretch ([\d.]+) s/)} s at one point. We aim for under 1.2 s; over 2 s starts to feel like a slideshow.`;
    case 'labelHold': return `Something is still moving in the final second (usually the cursor or the camera), while the viewer is trying to read it.`;
    case 'cutStill': return `Something is still moving at the moment this scene cuts to the next.`;
    case 'frame0': return c.level === 'fail' ? `The opening frame does not show the hook clearly.` : `The opening frame shows the hook.`;
    case 'copy': return c.text.replace(/^headline/, 'The headline').replace(/^sub line/, 'The second line');
    case 'captions': return c.text.replace(/^caption/, 'The caption');
    case 'echo': return `The narration repeats the words already on screen.`;
    case 'slideshowRisk': return `Slideshow risk is ${c.value}/100; under 40 is fine.`;
    case 'productClose': return c.text;
    default: return c.text;
  }
};

const DEFAULT_ACTION = {
  fail: {status: 'will-fix', action: 'Must be fixed before the video is rendered. Fixed in the next round of stills.'},
  warn: {status: 'ok', action: 'Within tolerance. Left as is unless you want it changed.'},
  info: {status: 'ok', action: 'For information only.'},
};

export const STATUS = {
  fixed: {label: 'Fixed', cls: 'ok'},
  ok: {label: 'Fine as is', cls: 'ok'},
  'will-fix': {label: 'Will fix', cls: 'warn'},
  cannot: {label: 'Can’t fix', cls: 'bad'},
  ask: {label: 'Needs your call', cls: 'ask'},
};

// rows: [{where, issue, action, status, question?, source: 'check'|'critique'|'note'}]
export function findingRows(checks = [], critique = null) {
  const items = critique?.items ?? (critique?.worst ?? []).map((w) => ({at: w.at, issue: w.problem, action: w.fix, status: 'will-fix'}));
  const rows = items.map((it) => ({where: it.at, issue: it.issue, action: it.action, status: it.status ?? 'will-fix', question: it.question, source: it.source ?? 'critique'}));
  for (const c of checks.filter((x) => x.level !== 'pass')) {
    // A critique item that names this scene and check type covers the check; skip the raw duplicate.
    if (items.some((it) => it.covers?.includes(`${c.check}:${c.scene ?? ''}`))) continue;
    const d = DEFAULT_ACTION[c.level] ?? DEFAULT_ACTION.info;
    rows.push({where: c.scene ?? 'whole video', issue: describe(c), action: d.action, status: d.status, source: 'check', check: c.check});
  }
  const order = {ask: 0, 'will-fix': 1, cannot: 2, fixed: 3, ok: 4};
  return rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
}

export const passedChecks = (checks = []) => {
  const byCheck = new Map();
  for (const c of checks) { const e = byCheck.get(c.check) ?? {pass: 0, other: 0}; c.level === 'pass' ? e.pass++ : e.other++; byCheck.set(c.check, e); }
  return [...byCheck.entries()].filter(([, e]) => e.other === 0).map(([k]) => CHECK_NAMES[k] ?? k);
};

export const SCORE_MEANING = {
  hook: 'Does the first frame earn the next three seconds?',
  readability: 'Can you read every word and find the product at phone size?',
  motion: 'Does the motion feel smooth and purposeful?',
  variety: 'Do the scenes look different enough from each other?',
  composition: 'Is each frame well arranged, with nothing cramped or lost?',
  brand: 'Does it look like their product and their brand?',
  sync: 'Do the cuts and moments land with the music or voice?',
};
