// vocabulary.mjs — working term → the word a user sees (D-55, knowledge base §14).
//
// Field names in plan.json stay internal. Every message the validator prints
// goes through `plain()` so a page or the skill can show it unchanged.

export const PLAIN = {
  beat: 'moment',
  scene: 'scene',
  spec: 'video plan',
  plan: 'video plan',
  blueprint: 'shot blueprint',
  rule: 'motion style',
  rules: 'motion styles',
  'named style': 'video style',
  video_style: 'video style',
  dials: 'direction settings',
  register: 'tone',
  carry: 'what continues',
  reads: 'reading time',
  cue: 'timed to the music',
  seam: 'transition',
  hold: 'pause',
  hold_s: 'pause',
  'hook angle': 'opening hook',
  'hook route': 'how it lands',
  review: 'review mode',
  director: 'auto mode',
  shown: 'seen in the product',
  'customer-stated': 'stated on your site',
  question: 'needs your confirmation',
};

/** Plain word for a working term; the term itself when there is none. */
export function plain(term) {
  return PLAIN[term] ?? term;
}
