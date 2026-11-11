// page.mjs — the intake page and the confirmation page, as HTML strings.
// No external assets; the light/dark tokens are the ones plan/to-html.mjs uses.
// Every word a person reads is a plain word (D-55, D-64); field names stay in the JSON.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceOptions, loadCatalogue, findVoice } from '../../tts/catalogue.mjs';
import { THEME_TOGGLE } from '../ui/theme.mjs';

const e = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jsonForScript = (obj) => JSON.stringify(obj ?? null).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** What the user reads for each field in the file. */
export const LABELS = {
  product: 'Product name', url: 'Product address', product_type: 'Product type',
  viewer: 'Who it is for', claim: 'What it is (the core message)',
  pain_point: 'The problem it solves', proof_moment: 'The proof', cta: 'Call to action',
  template: 'Template', video_type: 'Video type', length_s: 'Length', narration: 'Narration', voice: 'Voice', voice_source: 'Voice source',
  register: 'Copy tone', autonomy: 'Autonomy level',
  look: 'Styles and effects', footage: 'Footage you already have', sign_in: 'Your app authentication', screens: 'Where the screens come from',
  reference: 'Reference video', project_name: 'Project name', format: 'Frame',
};

/** The curated music (music/curated.json, D-65) with each track's credit and its 12-second preview (music/samples/, scripts/music-samples.mjs). */
export function musicTracks() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'music');
  let tracks = [], credits = {};
  try { tracks = JSON.parse(fs.readFileSync(path.join(dir, 'curated.json'), 'utf8')).tracks || []; } catch { tracks = []; }
  try {
    const md = fs.readFileSync(path.join(dir, 'ATTRIBUTION.md'), 'utf8');
    for (const m of md.matchAll(/^\| ([^|]+\.(?:mp3|ogg)) \| [^|]+ \| ([^|]+) \| [^|]+ \| ([^|]+) \|$/gm)) credits[m[1].trim()] = { creator: m[2].trim(), licence: m[3].trim().split(' (')[0].replace(/^BY\b/, 'CC BY') };
  } catch { credits = {}; }
  return tracks.filter((t) => fs.existsSync(path.join(dir, t.file))).map((t) => {
    const sample = `${path.basename(t.file).replace(/\.[^.]+$/, '')}.mp3`;
    return { file: t.file, title: t.title, set: t.set || 'energetic', bpm: t.bpm, mood: t.mood || [], ...(credits[t.file] || {}), sample: fs.existsSync(path.join(dir, 'samples', sample)) ? sample : null };
  });
}

/** The folder of template thumbnails, served at /assets/ and referenced relatively so preview.html works too. */
export const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');

/** `template id \u2192 source name` from assets/templates/SOURCES.md, when it is there. */
export function readTemplateSources(file = path.join(ASSETS_DIR, 'templates', 'SOURCES.md')) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  const after = text.split(/Sources:\s*/)[1] ?? '';
  const out = {};
  for (const m of after.matchAll(/\b([a-z][a-z0-9-]*)=([^;]+?)(?=;|\.\s|\.?\s*$)/g)) out[m[1]] = m[2].trim();
  return out;
}
export const TEMPLATE_SOURCES = readTemplateSources();

/** The nine templates: the name shown, a one-line description, the typical length, and the suggested seconds. */
export const TEMPLATE_META = [
  { id: 'launch', name: 'Launch', desc: 'A hook, the reveal, the result in motion, the breadth, a punchline, the close.', typical: '20–30 s short, 45–60 s full', suggest: 30 },
  { id: 'feature-showcase', name: 'Feature showcase', desc: 'A hook, then numbered features at a fixed rhythm, then the close.', typical: '45–90 s', suggest: 60 },
  { id: 'feature-focus', name: 'Feature focus', desc: 'One feature end to end, before and after.', typical: '30–60 s', suggest: 45 },
  { id: 'product-tour', name: 'Product tour', desc: 'The main screens in order, usually narrated.', typical: '1–3 min', suggest: 120 },
  { id: 'explainer', name: 'Explainer', desc: 'The problem, the solution, how it works, usually narrated.', typical: '1–2 min', suggest: 90 },
  { id: 'milestone', name: 'Milestone / data story', desc: 'The number is the claim.', typical: '30–90 s', suggest: 45 },
  { id: 'kinetic-type', name: 'Kinetic type', desc: 'The words are the motion.', typical: '20–40 s', suggest: 30 },
  { id: 'talking-head-recut', name: 'Talking-head recut', desc: 'Your presenter footage with titles, captions and cards timed to the words.', typical: 'the length of your footage', suggest: null },
  { id: 'ad', name: 'Ad', desc: 'A hook in the first second, one proof, one call to action; works with the sound off.', typical: '6–15 s', suggest: 10 },
];

/** D-77: the four video types, each for the whole product or one feature; the length is indicative. */
export const VIDEO_TYPE_META = [
  { id: 'launch', name: 'Launch', desc: 'A hyped reveal of the product or a new feature: the hook, the reveal, the result in motion, the close.', typical: '20–60 s', suggest: { product: 45, feature: 30 } },
  { id: 'explainer', name: 'Explainer', desc: 'How it works: the problem, the product, the main screens in order. A full tour is an explainer at 1–3 min.', typical: '45 s–3 min', suggest: { product: 90, feature: 45 } },
  { id: 'spotlight', name: 'Spotlight', desc: 'Hyped like a launch, but built around a few values or features rather than an introduction.', typical: '30–90 s', suggest: { product: 60, feature: 40 } },
  { id: 'ad', name: 'Ad', desc: 'For paid placement: a hook in the first second, one proof, one call to action; works with the sound off.', typical: '6–30 s', suggest: { product: 15, feature: 15 } },
  // D-88: the fifth type
  { id: 'tutorial', name: 'Tutorial', desc: 'Step by step: how to use an area of the product, reach a goal or work a feature, with the cursor on every click.', typical: '1–5 min, longer in chapters', suggest: { product: 120, feature: 90 } },
];

/** D-89: what a tutorial covers, with the context each kind asks for. */
export const TUTORIAL_KIND_META = [
  { id: 'interface', name: 'An interface', desc: 'What you can do in one screen or area, e.g. the dashboard.' },
  { id: 'use-case', name: 'A use case', desc: 'A goal reached end to end, e.g. connect your mailbox, then set up an outbound sequence.' },
  { id: 'feature', name: 'A feature', desc: 'How one feature works, e.g. campaigns, or connecting Stripe and creating billing products.' },
];

export const NARRATION = [
  { id: 'narrated', value: 'voice', name: 'Narrated', desc: 'A voice carries the story; music underneath.' },
  { id: 'music-only', value: 'music-only', name: 'Music only', desc: 'No voice. The words are on screen.' },
  { id: 'both', value: 'hybrid', name: 'Both', desc: 'Narrated product scenes over a music-led open and close.' },
];

export const PRODUCT_TYPES = [
  { id: 'web-app', name: 'Web app', desc: 'Runs in the browser. Widescreen, 16:9; screens behind a login can be captured.' },
  { id: 'mobile-app', name: 'Mobile app', desc: 'Its screens shown inside a phone outline, in a wide or a vertical video (Format, under Video type).' },
  { id: 'website', name: 'Website only', desc: 'Nothing to sign into: the public site is what gets captured. Widescreen.' },
];

export const VOICE = [
  { id: 'female', name: 'Female' },
  { id: 'male', name: 'Male' },
  { id: 'none', name: 'No preference' },
];

export const VOICE_SOURCE = [
  { id: 'built-in', name: 'Free built-in voice', desc: 'Included; nothing to set up.' },
  { id: 'own-account', name: 'My own paid voice account', desc: 'e.g. ElevenLabs. The API key goes in the project’s env file, never here.' },
];

export const TONE = [
  { id: 'factual', name: 'Factual', example: 'Invite teammates from Settings; each gets an email link.' },
  { id: 'balanced', name: 'Balanced', example: 'Bring your whole team in with one invite.' },
  { id: 'bold', name: 'Bold', example: 'Your whole team on board before the coffee cools.' },
];

export const AUTONOMY = [
  { id: 'user-reviewed', value: 'review', name: 'User reviewed', desc: 'You approve the direction and the still frames before anything renders.' },
  { id: 'auto', value: 'director', name: 'Auto', desc: 'The skill self-reviews to a score and shows you the finished video.' },
];

export const LOOK_CHIPS = ['kinetic type', '3D elements', 'cinematic', 'minimal', 'neon', 'playful', 'corporate', 'warm', 'dark', 'light'];

const NARRATION_WORDS = { voice: 'narrated', 'music-only': 'music only', hybrid: 'narrated with music' };
const AUTONOMY_WORDS = { review: 'user reviewed', director: 'auto' };
const SIGN_IN_WORDS = {
  public: 'public website only',
  'own-browser': 'your own browser, through the extension',
  'dedicated-profile': 'a dedicated profile with a visible first sign-in',
  'hosted-live-view': 'the hosted live view (hosted app only)',
  token: 'an auth token or magic link sent by your app',
  'demo-account': 'a demo or test account, its sign-in in the project\'s env file',
};
const FOOTAGE_WORDS = { none: 'none needed; the skill records the product', upload: 'files you will upload', existing: 'videos the product already has', record: 'you will record some first' };
const PRODUCT_TYPE_WORDS = { 'web-app': 'web app · widescreen', 'mobile-app': 'mobile app · vertical frame in a phone outline', website: 'website only · the public site is captured' };
const VOICE_WORDS = { female: 'female', male: 'male', none: 'no preference' };
const VOICE_SOURCE_WORDS = { 'built-in': 'free built-in voice', 'own-account': 'your own paid voice account (key in the env file)' };

// ---------------------------------------------------------------------------
// Shared CSS: the same tokens as plan/to-html.mjs, phone-first
// ---------------------------------------------------------------------------
/** The page header: the logo (light and dark colourways, swapped by ui.css). */
export const UD_HEAD = '<header class="ud-head"><a href="/" aria-label="Ultrademo"><img class="ud-logo ud-logo--light" src="/ui/logos/ultrademo-horizontal-flow-light.svg" alt="Ultrademo" width="168" height="28"><img class="ud-logo ud-logo--dark" src="/ui/logos/ultrademo-horizontal-flow-dark.svg" alt="" width="168" height="28"></a>' + THEME_TOGGLE + '</header>';

// password managers (LastPass, 1Password, Bitwarden) must not offer to fill these: they are not logins
const NOFILL = 'autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"';

const CSS = `
/* The Ultrademo design system, Flow (plan/ui/ui.css, linked first): the page's names map onto its role tokens. */
:root{--bg:var(--surface-soft);--card:var(--surface);--fg:var(--text);--muted:var(--text-muted);--pale:var(--surface-highlight);--good:#2f7a3d;--bad:#b23a2e;--mid:#8a6400}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--good:#6cc27c;--bad:#ff8a7a;--mid:#e0b23c}}
:root[data-theme="dark"]{--good:#6cc27c;--bad:#ff8a7a;--mid:#e0b23c}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 var(--ud-body)}
main{max-width:860px;margin:0 auto;padding:28px 16px 120px}
h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(30px,5vw,44px);letter-spacing:-.035em;line-height:1.04;margin:10px 0 10px;text-wrap:balance}h2{font-family:var(--ud-display);font-weight:800;font-size:28px;letter-spacing:-.03em;line-height:1.1;margin:0 0 8px}
.ud-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 28px}
.lead{color:var(--muted);margin:0 0 6px}.notice{background:var(--pale);border:1px solid var(--line);border-radius:var(--radius-md);padding:12px 16px;margin:14px 0 22px;font-size:14.5px}
.muted{color:var(--muted)}.small{font-size:12.5px}.mono{font:500 12.5px var(--font-mono)}
section.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius-flow);padding:var(--space-5);margin:0 0 var(--space-5)}
section.card.hero{border:1.5px solid var(--text);box-shadow:var(--shadow-block)}
@media(max-width:520px){section.card{padding:var(--space-4)}}
section.card>.help{color:var(--muted);font-size:13.5px;margin:0 0 12px}
.field{margin:14px 0 0}.field:first-of-type{margin-top:0}
.lab{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:4px}
.lab label,.lab .l{font-weight:600;font-size:14px}.lab .hint{color:var(--muted);font-size:12.5px;font-weight:400}
.unsure{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--muted);cursor:pointer;white-space:nowrap}.unsure input{margin:0}
input[type=text],input[type=url],input[type=number],textarea,select{width:100%;font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-md);padding:10px 12px;outline:none}
input:focus,textarea:focus{border-color:var(--fg)}textarea{min-height:68px;resize:vertical}
.field.is-unsure input,.field.is-unsure textarea{background:var(--card);border-style:dashed;color:var(--muted)}
.row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start}
.counter{font-size:12.5px;color:var(--muted);margin-top:3px}.counter.over{color:var(--bad)}
button{font:600 14px/1 var(--ud-body);cursor:pointer;border-radius:var(--radius-pill);padding:10px 16px;min-height:40px;border:0;background:transparent;color:var(--fg);box-shadow:inset 0 0 0 1.5px var(--fg);transition:transform .3s var(--ud-ease)}button:hover{transform:translateY(-1px)}
button.primary{background:var(--action);box-shadow:inset 0 0 0 1.5px var(--ud-action-edge);color:var(--on-action);font-size:15.5px;padding:14px 24px;min-height:48px}
button.primary:disabled{opacity:.6;cursor:wait}
button.quiet{box-shadow:inset 0 0 0 1px var(--line);color:var(--fg);background:var(--card);padding:7px 12px;min-height:32px;font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:13px;background:var(--bg);cursor:pointer;user-select:none}
.chip.on{background:var(--pale);border-color:var(--fg)}
.opts{display:grid;grid-template-columns:1fr;gap:8px;margin-top:6px}
@media(min-width:640px){.opts.two{grid-template-columns:1fr 1fr}.opts.three{grid-template-columns:1fr 1fr 1fr}}
@media(min-width:640px){.opts.vgrid{grid-template-columns:1fr 1fr}}@media(min-width:900px){.opts.vgrid{grid-template-columns:1fr 1fr 1fr}}
.opts.vgrid{gap:6px}.opts.vgrid .opt{padding:8px 10px;gap:8px}.opts.vgrid .opt>div{min-width:0}
.vtop{display:flex;align-items:center;justify-content:space-between;gap:6px}.vtop b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vdesc{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vmeta{display:block;font-size:11.5px;color:var(--muted);opacity:.8}.vsetup{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}
.vopt button.play{flex:none;min-width:30px;height:26px;padding:0 9px;font-size:12px;line-height:1;border-radius:999px}
.vopt[hidden]{display:none}.vopt .tag{font-style:normal;font-weight:600;font-size:11px;background:var(--pale);border:1px solid var(--line);border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:1px}
.opt{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;border:1px solid var(--line);border-radius:var(--radius-md);padding:12px 14px;background:var(--bg);cursor:pointer}
.opt input[type=radio],.opt input[type=checkbox],.unsure input{accent-color:var(--fg)}
.opt input{margin:4px 0 0}.opt b{display:block;font-size:14px}.opt span{display:block;color:var(--muted);font-size:12.5px}.opt .ex{font-style:italic;color:var(--fg);margin-top:2px}
.opt:has(input:checked){background:var(--pale);border-color:var(--fg);box-shadow:inset 0 0 0 0.5px var(--fg)}
.opt .thumb{margin:8px 0 0;max-width:100%}.opt .thumb img{display:block;width:160px;max-width:100%;height:auto;aspect-ratio:16/9;border:1px solid var(--line);border-radius:6px;background:var(--card);object-fit:cover}
button.link{background:none;border:0;padding:0;font:inherit;color:var(--muted);text-decoration:underline;cursor:pointer}
.opt .thumb figcaption{display:block;color:var(--muted);font-size:11.5px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.opt.off{opacity:.55;cursor:not-allowed}.tag{display:inline-block;font-size:11px;border:1px solid var(--line);border-radius:999px;padding:0 7px;margin-left:6px;color:var(--muted);vertical-align:middle}
.sub{margin:10px 0 0 0;padding:12px;border:1px dashed var(--line);border-radius:10px;background:var(--card)}
.sub h3{margin:0 0 6px;font-size:14px}.sub ul,.sub ol{margin:6px 0 0;padding-left:20px}.sub li{margin:3px 0}
/* the logo and the stage bar stay at the top while the page scrolls */
.ud-pin{position:sticky;top:0;z-index:20;background:var(--bg);margin:-28px -16px 18px;padding:14px 16px 10px;border-bottom:1px solid transparent}
.ud-pin.stuck{border-bottom-color:var(--line);box-shadow:0 4px 14px rgba(0,0,0,.05)}.ud-pin .ud-head{margin-bottom:8px}
.working .work-head{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start}.working h2{margin:0 0 4px}.working p{margin:0}
.spin{width:28px;height:28px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--fg);animation:udspin 0.9s linear infinite;margin-top:4px}
.spin.stop{animation:none;border-color:var(--fg);background:var(--action)}
@keyframes udspin{to{transform:rotate(360deg)}}
.work-steps{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:8px}
.work-steps li{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14.5px}
.work-steps li::before{content:"";flex:none;width:16px;height:16px;border-radius:50%;border:1.5px solid var(--line)}
.work-steps li.now{color:var(--fg);font-weight:600}.work-steps li.now::before{border-color:var(--fg);border-top-color:transparent;animation:udspin 0.9s linear infinite}
.work-steps li.done{color:var(--fg)}.work-steps li.done::before{content:"✓";display:grid;place-items:center;font-size:11px;font-weight:800;line-height:1;color:var(--card);background:var(--fg);border-color:var(--fg)}
.nudge{margin-top:18px;padding:12px 14px;border:1.5px dashed var(--fg);border-radius:var(--radius-md);background:var(--pale)}.nudge p{margin:0 0 8px}
.copyrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.copyrow code{font:500 14px var(--font-mono);padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card)}
.spin-sm{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--fg);animation:udspin .9s linear infinite;vertical-align:-1px;margin-right:4px}
details.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius-flow);padding:var(--space-4) var(--space-5);margin:0 0 var(--space-4)}
details.saved-sum>summary{cursor:pointer;list-style:none;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}details.saved-sum>summary::-webkit-details-marker{display:none}
details.saved-sum>summary::before{content:"▸";color:var(--muted)}details.saved-sum[open]>summary::before{content:"▾"}details.saved-sum[open]>summary{margin-bottom:12px}
aside.info{margin:8px 0 0;padding:14px 18px;border-left:0;border:1px dashed var(--line);border-radius:var(--radius-md);color:var(--muted);font-size:14px}
aside.info h3{margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;font-family:var(--font-mono);font-weight:500}aside.info ul{margin:0;padding-left:18px}aside.info li{margin:3px 0}
.brandgrid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:18px}@media(max-width:760px){.brandgrid{grid-template-columns:1fr}}
.logoprev{min-height:90px;border:1px solid var(--line);border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;padding:14px}.logoprev img{max-width:100%;max-height:64px}
.swatches{display:grid;grid-template-columns:1fr 1fr;gap:8px}.swatch{display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer}.swatch span{display:flex;flex-direction:column}.swatch code{font:500 11.5px var(--font-mono);color:var(--muted)}
.swatch input[type=color]{width:38px;height:38px;border:0;padding:0;background:none;cursor:pointer}.swatch input[type=color]::-webkit-color-swatch-wrapper{padding:0}.swatch input[type=color]::-webkit-color-swatch{border:1px solid var(--line);border-radius:8px}
.ud-progress{list-style:none;display:flex;gap:6px;flex-wrap:wrap;margin:0;padding:0;font-size:13px}
.ud-progress li{display:flex;align-items:center;gap:6px;padding:5px 12px 5px 6px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:var(--card)}
.ud-progress li span{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--bg);font-size:11.5px;font-weight:700}
.ud-progress li.now{color:var(--fg);border-color:var(--fg);font-weight:600}.ud-progress li.now span{background:var(--fg);color:var(--card)}
.ud-progress li.done{color:var(--fg)}.ud-progress li.done span{background:var(--pale)}
section.card.acc{padding:0}
section.card.acc>.sec-head{all:unset;box-sizing:border-box;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;width:100%;padding:var(--space-4) var(--space-5);cursor:pointer}
section.card.acc>.sec-head:focus-visible{outline:2px solid var(--fg);outline-offset:-2px;border-radius:var(--radius-flow)}
.sec-head .n{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;border:1px solid var(--line);font-size:12.5px;font-weight:700}
.sec-head h2{margin:0;font-size:20px}.sec-head .sum{grid-column:2;color:var(--muted);font-size:13.5px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sec-head .chev{grid-row:1;grid-column:3;color:var(--muted);transition:transform .15s}
section.card.acc.open>.sec-head .chev{transform:rotate(180deg)}section.card.acc.open>.sec-head .sum{display:none}
section.card.acc.filled>.sec-head .n{background:var(--pale)}
section.card.acc>.sec-body{display:none;padding:0 var(--space-5) var(--space-5)}section.card.acc.open>.sec-body{display:block}
.sec-next{margin-top:18px}
details.sitelines{margin:0 0 12px;border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:var(--bg)}details.sitelines summary{cursor:pointer;font-weight:600;font-size:13.5px}
#autofill-note{margin-top:8px}#autofill-note:empty{display:none}
.site{margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);display:none}.site.on{display:block}
.site b{display:block;font-size:13px}.site .desc{font-size:13.5px;margin:4px 0}
.detect{font-size:13.5px;margin:0 0 8px;padding:8px 10px;border-radius:8px;background:var(--bg);border:1px solid var(--line)}
.bar{position:sticky;bottom:0;background:var(--bg);padding:12px 0 16px;border-top:1px solid var(--line);display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.bar .status{color:var(--muted);font-size:13.5px}.bar .status.bad{color:var(--bad)}
.problems{background:var(--card);border:1px solid var(--bad);border-radius:10px;padding:10px 14px;margin:0 0 14px;display:none}.problems.on{display:block}.problems ul{margin:4px 0 0;padding-left:18px}
.kv{display:grid;grid-template-columns:150px 1fr;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}.kv:last-child{border-bottom:0}.kv>span{color:var(--muted);font:500 11.5px/1.4 var(--font-mono);text-transform:uppercase;letter-spacing:.1em;padding-top:4px}
@media(max-width:520px){.kv{grid-template-columns:1fr;gap:2px}}
.pill{display:inline-block;font-size:12px;border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin-left:6px;background:var(--bg)}
.pill.unsure{border-style:dashed;color:var(--muted)}
ol.next{padding-left:20px}ol.next li{margin:4px 0}
code{font:500 12.5px var(--font-mono);background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
`;

// ---------------------------------------------------------------------------
// The intake page
// ---------------------------------------------------------------------------

/**
 * @param {{ prefill?: any, projectDir?: string, today?: string, sample?: boolean }} opts
 *   prefill: an existing `video` block (nulls and `intake` honoured); sample: static preview, no server.
 */
/** D-79: one progress bar across the pages: Brief → Direction → Production → Review → Delivery. */
export const STAGES = [['brief', 'Brief'], ['outline', 'Outline'], ['direction', 'Direction'], ['production', 'Production'], ['review', 'Review'], ['delivery', 'Delivery']];
export function progressBar(current) {
  const at = STAGES.findIndex(([id]) => id === current);
  return `<ol class="ud-progress" aria-label="Where you are">${STAGES.map(([id, name], i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}"${i === at ? ' aria-current="step"' : ''}><span>${i + 1}</span>${e(name)}</li>`).join('')}</ol>`;
}

export function renderIntakePage(opts = {}) {
  const { prefill = null, projectDir = '', today = new Date().toISOString().slice(0, 10), sample = false, brands = [] } = opts;
  // the voices to hear and pick (D-71): free ones always, ElevenLabs ones when the project has a key
  const elevenlabs = opts.elevenlabs ?? false;
  const voices = opts.voices ?? voiceOptions({ elevenlabs, ...(opts.engines ? { engines: opts.engines } : {}) });
  const sampleLine = loadCatalogue().sample_line;
  const tracks = opts.music ?? musicTracks();
  const trackCard = (t) => `<label class="opt vopt"><input type="radio" name="music" value="${e(t.file)}"><div><div class="vtop"><b>${e(t.title)}</b>${t.sample ? `<button type="button" class="quiet play" data-sample="music-samples/${e(t.sample)}" aria-label="Play the ${e(t.title)} preview" title="Play a 12-second preview">▶</button>` : ''}</div><span class="vdesc" title="${e((t.mood || []).join(', '))}">${e((t.mood || []).join(', '))}</span><span class="vmeta" title="${t.creator ? `${e(t.creator)}, ${e(t.licence)}` : ''}">${t.set === 'calm' ? 'Calm' : 'Energetic'}${t.bpm ? ` · ${e(Math.round(t.bpm))} bpm` : ''}</span></div></label>`;
  const recOf = (v) => (v.recommended ?? v.house) && v.paid === elevenlabs;
  const houseOf = (g) => (voices.find((v) => recOf(v) && v.gender === g) || voices.find((v) => v.gender === g) || {}).id || '';
  // a free voice whose engine is not set up yet says so: picking it sets it up after the brief is saved (the agent runs it)
  const setupNote = (v) => (!v.paid && v.ready === false && v.setup ? `<span class="vsetup">Sets up when picked · ${e(v.setup.size)}</span>` : '');
  const voiceCard = (v) => `<label class="opt vopt" data-gender="${e(v.gender)}"><input type="radio" name="voice_id" value="${e(v.id)}" data-paid="${v.paid ? 1 : 0}"${!v.paid && v.ready === false ? ' data-setup="1"' : ''}><div><div class="vtop"><b>${e(v.name)}${recOf(v) ? ' <em class="tag">recommended</em>' : ''}</b>${v.sample ? `<button type="button" class="quiet play" data-sample="voice-samples/${e(v.sample)}" aria-label="Play the ${e(v.name)} sample" title="Play the sample">▶</button>` : ''}</div><span class="vdesc" title="${e(v.desc)}">${e(v.desc)}</span><span class="vmeta">${e(v.accent)} · ${v.paid ? 'ElevenLabs' : 'Free'}</span>${setupNote(v)}</div></label>`;


  const text = (field, label, hint, { multi = false, placeholder = '' } = {}) => `
<div class="field" data-field="${field}">
  <div class="lab"><label for="f-${field}">${e(label)}</label><span class="unsure"><input type="checkbox" data-unsure="${field}"> Unsure</span></div>
  ${multi
    ? `<textarea id="f-${field}" name="${field}" placeholder="${e(placeholder)}"></textarea>`
    : `<input type="text" id="f-${field}" name="${field}" placeholder="${e(placeholder)}" ${NOFILL}>`}
  ${hint ? `<div class="hint small muted">${hint}</div>` : ''}
</div>`;

  const area = (field, label, hint, placeholder) => `
<div class="field" data-field="${field}">
  <div class="lab"><label for="f-${field}">${e(label)}</label><span class="unsure"><input type="checkbox" data-unsure="${field}"> Unsure</span></div>
  <textarea id="f-${field}" name="${field}" rows="2" placeholder="${e(placeholder)}" ${NOFILL}></textarea>
  ${hint ? `<div class="hint small muted">${hint}</div>` : ''}
</div>`;
  const typeOpts = VIDEO_TYPE_META.map((t) => `
<label class="opt"><input type="radio" name="video_type" value="${t.id}" data-suggest-product="${t.suggest.product}" data-suggest-feature="${t.suggest.feature}"><div><b>${e(t.name)}</b><span>${e(t.desc)}</span><span>Typically ${e(t.typical)}.</span></div></label>`).join('')
    + `<label class="opt"><input type="radio" name="video_type" value="unsure"><div><b>Unsure</b><span>The direction step picks one from your brief and your site.</span></div></label>`;

  const thumb = (t) => {
    if (!fs.existsSync(path.join(ASSETS_DIR, 'templates', `${t.id}.gif`))) return '';
    return `<figure class="thumb"><img src="assets/templates/${e(t.id)}.gif" width="160" loading="lazy" decoding="async" alt="A four-second example of the ${e(t.name.toLowerCase())} template"></figure>`;
  };
  const templateOpts = TEMPLATE_META.map((t) => `
<label class="opt"><input type="radio" name="template" value="${t.id}" data-suggest="${t.suggest ?? ''}"><div><b>${e(t.name)}</b><span>${e(t.desc)}</span><span>Typically ${e(t.typical)}.</span>${thumb(t)}</div></label>`).join('')
    + `<label class="opt"><input type="radio" name="template" value="unsure"><div><b>Unsure</b><span>The direction step picks one from your brief and your site.</span></div></label>`;

  const radioOpts = (name, items, extra = '') => items.map((it) => `
<label class="opt"><input type="radio" name="${name}" value="${it.id}"><div><b>${e(it.name)}</b>${it.desc ? `<span>${e(it.desc)}</span>` : ''}${it.example ? `<span class="ex">“${e(it.example)}”</span>` : ''}</div></label>`).join('')
    + `<label class="opt"><input type="radio" name="${name}" value="unsure"><div><b>Unsure</b><span>${extra || 'The direction step proposes it.'}</span></div></label>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brief · Ultrademo</title>
<link rel="stylesheet" href="/ui/ui.css"><style>${CSS}</style></head><body><main>
<div class="ud-pin">${UD_HEAD}
${progressBar('brief')}</div>
<h1>Tell us about the video</h1>
<p class="lead">This brief goes into your video plan; the direction step reads it and comes back with two or three directions you can pick from and edit.</p>
<div class="notice">Not sure about something? Tick <b>Unsure</b> next to it. Anything you type there is kept as a hint, and the direction step proposes the rest from your site. Only the product address is required.</div>
${sample ? '<div class="notice"><b>Static preview.</b> Sample values, no server: nothing here reads a site or saves.</div>' : ''}
<audio id="voice-player" preload="none"></audio>
<div class="problems" id="problems"><b>A few things to fix before saving</b><ul id="problem-list"></ul></div>

<section class="card hero" id="s-product">
  <h2>Your product</h2>
  <p class="help">Give the address and we read the page title and headings to suggest the rest. Nothing else is read here.</p>
  ${brands.length ? `<div class="field savedbrand" data-field="saved_brand">
    <div class="lab"><label for="f-saved-brand">Start from a saved brand</label><span class="hint">fills the brand and the story; change anything for this video</span></div>
    <div class="row"><select id="f-saved-brand"><option value="">Choose a brand</option>${brands.map((b) => `<option value="${e(b.slug)}" data-domain="${e(b.domain || '')}">${e(b.name)}${b.domain ? ` · ${e(b.domain)}` : ''}</option>`).join('')}</select><button type="button" id="use-brand">Use this brand</button></div>
    <div class="small muted" id="saved-brand-status"></div>
  </div>` : ''}
  <div class="field" data-field="url">
    <div class="lab"><label for="f-url">Product address</label><span class="hint">required</span></div>
    <div class="row"><input type="url" id="f-url" name="url" placeholder="https://" autocomplete="off" inputmode="url"><button type="button" id="read-site">Read my site</button></div>
    <div class="small muted" id="read-status"></div>
    <div class="site" id="site">
      <b id="site-title"></b>
      <div class="desc muted" id="site-desc"></div>
      <div class="small" id="autofill-note"></div>
    </div>
  </div>
  <div class="field" data-field="product_type">
    <div class="lab"><span class="l">Product type</span><span class="hint">sets the frame and what the capture can reach</span></div>
    <div class="opts three">${radioOpts('product_type', PRODUCT_TYPES, 'Decided from the site.')}</div>
  </div>
  <div class="field" data-field="product">
    <div class="lab"><label for="f-product">Product name</label><span class="unsure"><input type="checkbox" data-unsure="product"> Unsure</span></div>
    <input type="text" id="f-product" name="product" placeholder="As it appears on your site" autocomplete="off">
    <div class="chips" id="product-suggestions"></div>
  </div>
</section>

<section class="card" id="s-brand">
  <h2>Your brand</h2>
  <p class="help">Read from your site when you press Read my site; change anything that is off. The directions start from these, and you can refine them there.</p>
  <div class="small muted" id="brand-status">Press <b>Read my site</b> above and your logo, colours and fonts appear here.</div>
  <div class="brandgrid">
    <div class="field" data-field="logo">
      <div class="lab"><span class="l">Logo</span></div>
      <div class="logoprev" id="logo-prev"><span class="muted small">No logo yet</span></div>
      <input type="hidden" id="f-logo">
      <label class="small" style="display:block;margin-top:8px">Use a different logo <input type="file" id="f-logo-file" accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"></label>
      <div class="small muted" id="logo-status"></div>
    </div>
    <div class="field" data-field="colors">
      <div class="lab"><span class="l">Colours</span></div>
      <div class="swatches">${[['brand', 'Brand colour'], ['accent', 'Accent'], ['ground', 'Background'], ['ink', 'Text']].map(([k, l]) => `<label class="swatch"><input type="color" id="f-col-${k}" data-col="${k}" value="#ffffff"><span>${l}<code id="hex-${k}"></code></span></label>`).join('')}</div>
    </div>
    <div class="field" data-field="fonts">
      <div class="lab"><span class="l">Fonts</span></div>
      <div class="lab small" style="margin-top:4px"><label for="f-font-display">Headings</label></div><input type="text" id="f-font-display" placeholder="e.g. Inter" ${NOFILL}>
      <div class="lab small" style="margin-top:8px"><label for="f-font-body">Body text</label></div><input type="text" id="f-font-body" placeholder="e.g. Inter" ${NOFILL}>
    </div>
  </div>
</section>

<section class="card" id="s-screens">
  <h2>Where the screens come from</h2>
  <p class="help">Pick every source you have. The video shows your product's real screens, taken from these.</p>
  <div class="field" data-field="screens">
    <div class="opts">
      <label class="opt"><input type="checkbox" name="screens" value="live" checked><div><b>The live site or app</b><span>The skill opens it and captures the screens it needs (sign-in further down, if any).</span></div></label>
      <label class="opt"><input type="checkbox" name="screens" value="mockups"><div><b>HTML mockups</b><span>Pages your team built for a feature that is not live yet. Each one is opened and used like a screen of the app.</span></div></label>
      <label class="opt"><input type="checkbox" name="screens" value="screenshots"><div><b>Screenshots</b><span>Images of the product you already have.</span></div></label>
      <label class="opt"><input type="checkbox" name="screens" value="figma"><div><b>A Figma file</b><span>Needs a paid Figma plan: the free plan's limit stops the export part-way.</span></div></label>
    </div>
    <div class="sub" id="screens-upload" hidden>
      <div class="lab"><label for="f-screen-files">Your files</label><span class="hint">HTML up to 15 MB, PNG, JPEG or WebP up to 25 MB; copied into this project only</span></div>
      <input type="file" id="f-screen-files" multiple accept=".html,.htm,.png,.jpg,.jpeg,.webp,text/html,image/png,image/jpeg,image/webp">
      <ul class="small" id="screen-list" style="margin:8px 0 0;padding-left:18px"></ul>
      <div class="small muted" id="screen-status"></div>
    </div>
    <div class="sub" id="screens-figma" hidden>
      <div class="lab"><label for="f-figma">Figma file link</label></div>
      <input type="url" id="f-figma" name="figma_url" placeholder="https://www.figma.com/design/…" autocomplete="off">
    </div>
  </div>
</section>

<section class="card" id="s-story">
  <h2>The story</h2>
  <p class="help">In your own words, as long or short as you like. These are notes the video is built from; the on-screen words and the narration are written from them. Anything that must appear word for word goes in the next section.</p>
  <details class="sitelines" id="site-lines-box" hidden><summary>Lines from your site</summary><div class="small muted">Click one to put it in the story field you were last in.</div><div class="chips" id="site-lines"></div></details>
  ${area('claim', LABELS.claim, 'What the product or the feature does, and why it matters.', 'Ultrademo turns your product into a finished launch video from its own screens, and remakes it when the UI changes.')}
  ${area('viewer', LABELS.viewer, 'The person watching.', 'Founders and product marketers shipping a new feature.')}
  ${area('pain_point', LABELS.pain_point, 'What the viewer puts up with today.', 'A demo video takes days in an editor and is out of date by the next release.')}
  ${area('proof_moment', LABELS.proof_moment, 'What on screen makes it believable: a result, a before and after, a number.', 'A finished video appears from nothing more than the product\'s address.')}
</section>

<section class="card" id="s-exact">
  <h2>Exact wording</h2>
  <p class="help">Optional. Words used exactly as you write them, never reworded.</p>
  <div class="field" data-field="tagline">
    <div class="lab"><label for="f-tagline">Tagline</label><span class="hint">optional</span></div>
    <input type="text" id="f-tagline" name="tagline" placeholder="Always-current demo videos" ${NOFILL}>
  </div>
  <div class="field" data-field="cta">
    <div class="lab"><label for="f-cta">Call to action</label><span class="unsure"><input type="checkbox" data-unsure="cta"> Unsure</span></div>
    <input type="text" id="f-cta" name="cta" placeholder="Make your first video" ${NOFILL}>
    <div class="hint small muted">The words on the last frame (the button text or the address).</div>
  </div>
  <div class="field" data-field="exact_lines">
    <div class="lab"><label for="f-exact_lines">Lines that must appear</label><span class="hint">optional, one per line</span></div>
    <textarea id="f-exact_lines" name="exact_lines" rows="3" placeholder="A slogan, a legal line, a product name spelled a certain way" ${NOFILL}></textarea>
  </div>
</section>

<section class="card" id="s-type">
  <h2>Video type</h2>
  <p class="help">Pick the kind of video and what it covers; the length follows, and you can change it.</p>
  <div class="field" data-field="video_type">
    <div class="opts two">${typeOpts}</div>
  </div>
  <div class="field" data-field="scope">
    <div class="lab"><span class="l">What it covers</span></div>
    <div class="opts two"><label class="opt"><input type="radio" name="scope" value="product" checked><div><b>The whole product</b><span>What it is and what it does.</span></div></label><label class="opt"><input type="radio" name="scope" value="feature"><div><b>One feature</b><span>A feature you shipped or are about to ship.</span></div></label></div>
    <div class="sub" id="feature-sub" hidden>
      <div class="lab"><label for="f-feature">Which feature</label></div>
      <input type="text" id="f-feature" name="feature" placeholder="e.g. Custom dashboards for your clients" ${NOFILL}>
    </div>
  </div>
  <div class="field" data-field="tutorial" id="tutorial-sub" hidden>
    <div class="lab"><span class="l">What the tutorial covers</span><span class="hint">the steps are settled on the next page, the outline</span></div>
    <div class="opts three">${TUTORIAL_KIND_META.map((k) => `<label class="opt"><input type="radio" name="tut_kind" value="${k.id}"><div><b>${e(k.name)}</b><span>${e(k.desc)}</span></div></label>`).join('')}</div>
    <div class="tutf" data-kinds="interface"><div class="lab"><label for="f-tut-area">Which screen or area</label></div><input type="text" id="f-tut-area" placeholder="e.g. The dashboard" ${NOFILL}></div>
    <div class="tutf" data-kinds="interface use-case feature"><div class="lab"><label for="f-tut-goal" id="tut-goal-label">The goal</label></div><input type="text" id="f-tut-goal" placeholder="e.g. A support agent that answers from your own content" ${NOFILL}></div>
    <div class="tutf" data-kinds="use-case"><div class="lab"><label for="f-tut-start">Where it starts</label></div><input type="text" id="f-tut-start" placeholder="e.g. Signed in, an empty workspace" ${NOFILL}></div>
    <div class="tutf" data-kinds="use-case"><div class="lab"><label for="f-tut-end">The end result</label></div><input type="text" id="f-tut-end" placeholder="e.g. The agent answering a real question" ${NOFILL}></div>
    <div class="tutf" data-kinds="use-case feature"><div class="lab"><label for="f-tut-pre">What has to be in place first</label><span class="hint">optional</span></div><input type="text" id="f-tut-pre" placeholder="e.g. A connected mailbox" ${NOFILL}></div>
    <div class="tutf" data-kinds="feature interface"><div class="lab"><label for="f-tut-understand">Afterwards, the viewer can…</label></div><input type="text" id="f-tut-understand" placeholder="e.g. Create a campaign and see who opened it" ${NOFILL}></div>
    <div class="tutf" data-kinds="interface use-case feature"><div class="lab"><label for="f-tut-steps">The steps, if you know them</label><span class="hint">optional, one per line; else Ultrademo proposes them</span></div><textarea id="f-tut-steps" rows="3" placeholder="Make a knowledge base&#10;Add your content&#10;Create the agent" ${NOFILL}></textarea></div>
    <div class="tutf" data-kinds="interface use-case feature"><div class="lab"><label for="f-tut-leave">Leave out</label><span class="hint">optional</span></div><input type="text" id="f-tut-leave" placeholder="e.g. Voice and phone numbers" ${NOFILL}></div>
    <div class="tutf" data-kinds="interface use-case feature"><div class="lab"><label for="f-tut-docs">Your help docs for this</label><span class="hint">optional, a link; read like your site</span></div><input type="url" id="f-tut-docs" placeholder="https://docs.your-product.com/…" ${NOFILL}></div>
    <div class="tutf" data-kinds="interface use-case feature"><div class="lab"><span class="l">Opening</span></div><div class="opts three">${[['hook', 'A hook', 'why this is worth doing; best for a use case'], ['message', 'An opening message', 'a title card naming what you will be able to do'], ['none', 'None', 'start on the first step']].map(([v, n, d]) => `<label class="opt"><input type="radio" name="tut_opening" value="${v}"><div><b>${n}</b><span>${d}</span></div></label>`).join('')}</div></div>
    <div class="tutf" data-kinds="interface use-case feature"><div class="lab"><span class="l">Closing</span></div><div class="opts three">${[['message', 'A closing message', 'drives the point home'], ['cta', 'A call to action', 'what to do next'], ['none', 'None', 'end on the result']].map(([v, n, d]) => `<label class="opt"><input type="radio" name="tut_closing" value="${v}"><div><b>${n}</b><span>${d}</span></div></label>`).join('')}</div></div>
  </div>
  <div class="field" data-field="motion_between" id="motion-sub" hidden>
    <div class="lab"><span class="l">Motion between scenes</span><span class="hint">the cursor, the click ring and the zoom on the click stay at every level</span></div>
    <div class="opts three">${[['none', 'None', 'the scene transitions only; still feels finished'], ['minimal', 'Minimal', 'the camera glides from one step to the next; the cursor carries across'], ['full', 'Full', 'animated title cards and motion graphics between steps or sections']].map(([v, n, d]) => `<label class="opt"><input type="radio" name="motion_between" value="${v}"${v === 'minimal' ? ' checked' : ''}><div><b>${n}${v === 'minimal' ? ' <em class="tag">default</em>' : ''}</b><span>${d}</span></div></label>`).join('')}</div>
  </div>
  <div class="field" data-field="formats">
    <div class="lab"><span class="l">Format</span><span class="hint">vertical is for Shorts, Reels and TikTok</span></div>
    <div class="opts three">${[['landscape', 'Landscape', '16:9, for YouTube, your site and decks'], ['vertical', 'Vertical', '9:16, for phones'], ['both', 'Both', 'one video, laid out again for 9:16: close to twice the scene-building work']].map(([v, l, d]) => `<label class="opt"><input type="radio" name="formats" value="${v}"><div><b>${l}</b><span>${d}</span></div></label>`).join('')}</div>
  </div>
  <div class="field" data-field="cut">
    <div class="lab"><span class="l">Social cut</span><span class="hint">a short version from the same scenes, after the video</span></div>
    <div class="opts three">${[['', 'None', 'just the video'], ['15', '15 seconds', 'the hook, the reveal and the call to action'], ['30', '30 seconds', 'the hook, a proof or two and the call to action']].map(([v, l, d]) => `<label class="opt"><input type="radio" name="cut" value="${v}"${v === '' ? ' checked' : ''}><div><b>${l}</b><span>${d}. Music and on-screen words, no narration; vertical when the video has a vertical version.</span></div></label>`).join('')}</div>
  </div>
  <div class="field" data-field="length_s">
    <div class="lab"><label for="f-length_s">Length in seconds</label><span class="unsure"><input type="checkbox" data-unsure="length_s"> Unsure</span></div>
    <div class="opts three lenfit">${[['about', 'About', 'within 10% either way; the scenes keep the lengths that read best'], ['max', 'No more than', 'up to this length, shorter if it reads better'], ['exact', 'Exactly', 'to the second, e.g. for an ad slot']].map(([v, n, d]) => `<label class="opt"><input type="radio" name="length_fit" value="${v}"${v === 'about' ? ' checked' : ''}><div><b>${n}</b><span>${d}</span></div></label>`).join('')}</div>
    <div class="row" style="margin-top:8px"><input type="number" id="f-length_s" name="length_s" min="3" step="1" inputmode="numeric" placeholder="30"><span class="small muted" id="length-hint" style="padding-top:10px"></span></div>
  </div>
</section>

<section class="card" id="s-sound">
  <h2>Voice and music</h2>
  <div class="field" data-field="narration">
    <div class="lab"><span class="l">Narration</span></div>
    <div class="opts three">${radioOpts('narration', NARRATION, 'Usually music only for a launch or an ad, narrated for a tour or an explainer.')}</div>
    <div class="sub" id="voice-sub" hidden>
      <div class="lab"><span class="l">${e(LABELS.voice)}</span></div>
      <div class="opts three">${VOICE.map((v) => `<label class="opt"><input type="radio" name="voice" value="${v.id}"><div><b>${e(v.name)}</b></div></label>`).join('')}</div>
      <div class="hint small muted" style="margin:12px 0 8px">Listen, then pick. Every voice reads the same line: “${e(sampleLine)}”</div>
      <div class="opts vgrid" id="voice-cards" data-house-female="${e(houseOf('female'))}" data-house-male="${e(houseOf('male'))}">${voices.map(voiceCard).join('')}</div>
      <div class="hint small muted" style="margin-top:8px">${elevenlabs ? 'ElevenLabs voices are read with your own account; the key stays in the project’s env file.' : 'Have an ElevenLabs account? Put the key in the project’s <span class="mono">.env</span> file as <span class="mono">ELEVENLABS_API_KEY</span> and open this page again to hear its voices. The key never goes in this form.'}</div>
    </div>
  </div>
  <div class="field" data-field="music">
    <div class="lab"><span class="l">Music</span><span class="hint">a 12-second preview of each track; every track is CC0: free to use, no credit needed</span></div>
    <div class="opts vgrid"><label class="opt vopt"><input type="radio" name="music" value="auto"><div><b>Let the direction choose <em class="tag">recommended</em></b><span>Picked to fit the look and pace of the direction you choose.</span></div></label>${tracks.filter((t) => t.set !== 'calm').map(trackCard).join('')}${tracks.filter((t) => t.set === 'calm').map(trackCard).join('')}<label class="opt vopt"><input type="radio" name="music" value="own"><div><b>Use my own track</b><span>A track you hold a licence for, e.g. from Epidemic Sound, Artlist or a Free To Use commercial licence.</span></div></label></div>
    <div class="sub" id="own-sub" hidden>
      <div class="lab"><label for="f-own-file">Your track</label><span class="hint">MP3, WAV, M4A, OGG, AAC or FLAC, up to 60 MB; it is copied into this project only</span></div>
      <input type="file" id="f-own-file" accept=".mp3,.wav,.m4a,.ogg,.aac,.flac,audio/*">
      <div class="small muted" id="own-status" style="margin-top:6px"></div>
      <label class="unsure" style="margin-top:10px;white-space:normal"><input type="checkbox" id="f-own-licence"> My licence covers commercial videos (ads, launch videos, posts for a business). Credit lines, if the licence asks for them, are mine to add.</label>
      <input type="hidden" id="f-own-path"><input type="hidden" id="f-own-title">
    </div>
  </div>
</section>

<section class="card" id="s-make">
  <h2>How it's made</h2>
  <div class="field" data-field="register">
    <div class="lab"><span class="l">Copy tone</span><span class="hint">facts are always checked; this sets how far the rest may stretch</span></div>
    <div class="opts two">${radioOpts('tone', TONE)}</div>
  </div>
  <div class="field" data-field="autonomy">
    <div class="lab"><span class="l">Autonomy level</span></div>
    <div class="opts three">${radioOpts('autonomy', AUTONOMY)}</div>
  </div>
</section>

<section class="card" id="s-look">
  <h2>Styles and effects</h2>
  <p class="help">The feel of the video, in your words. Tap a few examples or write freely; the direction step shows you the video and motion styles as rendered frames to pick from.</p>
  <div class="field" data-field="look">
    <div class="lab"><label for="f-look">Describe it</label><span class="unsure"><input type="checkbox" data-unsure="look"> Unsure</span></div>
    <textarea id="f-look" name="look" placeholder="Glowing letters on black, a slow camera, the product doing the talking"></textarea>
    <div class="chips" id="look-chips">${LOOK_CHIPS.map((c) => `<span class="chip" data-chip="${e(c)}">${e(c)}</span>`).join('')}</div>
  </div>
  <div class="field" data-field="effects">
    <div class="lab"><span class="l">Effects</span><span class="hint">a visual and a sound when something happens: money paid, a task done, a launch</span></div>
    <div class="opts three"><label class="opt"><input type="radio" name="effects" value="lively" checked><div><b>Lively</b><span>Bursts, confetti, reactions where the story has a moment.</span></div></label><label class="opt"><input type="radio" name="effects" value="subtle"><div><b>Subtle</b><span>Small and quick; for explainers and serious products.</span></div></label><label class="opt"><input type="radio" name="effects" value="none"><div><b>None</b><span>No effects; interface sounds only.</span></div></label></div>
  </div>
</section>

<section class="card" id="s-footage">
  <h2>Footage you already have</h2>
  <p class="help">Optional. The skill captures and rebuilds the product itself; add footage only if you have it: a talking head, an avatar video, live action or b-roll. Screen recordings, camera footage, or videos already published.</p>
  <div class="field" data-field="footage">
    <div class="opts">
      <label class="opt"><input type="radio" name="footage" value="none"><div><b>None needed: the skill records the product itself</b><span>Screens are captured and rebuilt from the site, the app or your mockups. The usual choice.</span></div></label>
      <label class="opt"><input type="radio" name="footage" value="upload"><div><b>I'll upload files</b><span>Screen recordings or camera footage on this machine.</span></div></label>
      <label class="opt"><input type="radio" name="footage" value="existing"><div><b>The product already has published videos</b><span>A YouTube channel, or links to videos you own.</span></div></label>
      <label class="opt"><input type="radio" name="footage" value="record"><div><b>I'll record some first</b><span>Show me how, then I'll list the files before the direction step.</span></div></label>
      <label class="opt"><input type="radio" name="footage" value="unsure"><div><b>Unsure</b><span>The direction step asks again once it has read the site.</span></div></label>
    </div>
    <div class="sub" id="footage-upload" hidden>
      <h3>Where the files are</h3>
      <textarea name="footage_files" placeholder="One path per line, e.g. ~/Movies/invite-flow.mov"></textarea>
      <div class="small muted">Full paths on this machine. They are read when the direction step runs, not now.</div>
    </div>
    <div class="sub" id="footage-existing" hidden>
      <h3>Where they live</h3>
      <div class="lab"><label for="f-footage_channel">YouTube channel address (optional)</label></div>
      <input type="url" id="f-footage_channel" name="footage_channel" placeholder="https://www.youtube.com/@yourchannel" inputmode="url">
      <div class="small muted">Other links can be listed below.</div>
      <div class="lab" style="margin-top:8px"><label for="f-footage_links">Other links</label></div>
      <textarea id="f-footage_links" name="footage_links" placeholder="Links to videos you own, one per line"></textarea>
      <div class="small muted">Only videos you own. Videos already online stay there; we read their captions and link to the moment.</div>
    </div>
    <div class="sub" id="footage-record" hidden>
      <div id="recipe">
        <h3 style="margin-top:10px">How to record, briefly</h3>
        <ol>
          <li><b>Screen.</b> Mac: press Shift-Command-5 and choose “Record Selected Portion”, then draw the box around the product window. Windows: press Win-Alt-R, or use the Snipping Tool’s record mode. If you want your camera in the same take, OBS Studio works on both; it is optional.</li>
          <li><b>Phone screen.</b> iPhone: Control Centre, the record button (add it under Settings → Control Centre first). Android: Screen record in the quick settings panel. Record upright; the frame goes into a phone outline for you.</li>
          <li><b>Camera.</b> Face a window or a lamp, camera at eye level, 1080p, a quiet room, the mic within arm's reach. A 20-second test first, then listen back.</li>
          <li><b>What to show.</b> The proof moment above, slowly: deliberate cursor, no notifications, demo data instead of real customers, a reset state before each take. One action per take is easier to cut than one long take.</li>
          <li><b>Save</b> as .mov or .mp4 and list the paths above under “I'll upload files” when you have them.</li>
        </ol>
      </div>
    </div>
  </div>
</section>

<section class="card" id="s-signin">
  <h2>Your app authentication</h2>
  <p class="help">Only needed when the video shows screens behind a login. The capture never uses a stored password; you sign in yourself, once.</p>
  <div class="detect" id="detect">Checking which browser this is…</div>
  <div class="detect" id="website-note" hidden>You chose “website only” as the product type, so the video is made from the public site and there is nothing to sign into. “Public website only” has been selected for you. If part of the site sits behind a login, pick another option.</div>
  <div class="field" data-field="sign_in">
    <div class="opts" id="signin-opts">
      <label class="opt"><input type="radio" name="sign_in" value="public"><div><b>Public website only</b><span>Nothing behind a login needs to appear.</span></div></label>
      <label class="opt" data-needs="chromium"><input type="radio" name="sign_in" value="own-browser"><div><b>Use my own browser</b><span>Through the Chrome extension, the capture runs in the browser you are already signed into. No second sign-in.</span></div></label>
      <label class="opt"><input type="radio" name="sign_in" value="dedicated-profile"><div><b>A dedicated profile, signed in once by hand</b><span id="profile-note">A real Chrome window opens the first time; you sign in (Google sign-in and two-factor included) and later runs reuse it silently.</span></div></label>
      <label class="opt off"><input type="radio" name="sign_in" value="hosted-live-view" disabled><div><b>Sign in on the hosted live view<span class="tag">hosted app only</span></b><span>A live view of the capture browser where you sign in by hand. Not part of the local skill.</span></div></label>
      <label class="opt"><input type="radio" name="sign_in" value="token"><div><b>An auth token or magic link sent by your app</b><span>An API key, a magic link or a demo account your app provides. It goes into the project's env file, never into this page.</span></div></label>
      <label class="opt"><input type="radio" name="sign_in" value="demo-account"><div><b>A demo or test account</b><span>Its email and password go in this video's env file, never into this page or the chat; Ultrademo signs in with them.</span></div></label>
      <label class="opt"><input type="radio" name="sign_in" value="unsure"><div><b>Unsure</b><span>The direction step asks once it knows which screens the video needs.</span></div></label>
    </div>
    <div class="sub" id="token-sub" hidden>
      <h3>How your app issues it</h3>
      <input type="text" name="token_note" placeholder="e.g. a magic link from the admin page; a read-only API key" maxlength="500">
      <div class="small muted">Describe it only. The value itself belongs in the project's env file.</div>
    </div>
    <div class="sub" id="demo-sub" hidden>
      <h3>The demo account</h3>
      <p class="small">Use an account made for demos or testing: the outline asks before anything is created in it. Open the file, fill in the lines after <code>DEMO_EMAIL=</code> and <code>DEMO_PASSWORD=</code> (and <code>DEMO_SIGNIN_URL=</code> if the sign-in page is elsewhere), save it, then check.</p>
      <div class="row"><button type="button" class="quiet" id="demo-open">Open the file</button><button type="button" class="quiet" id="demo-check">Check</button><span class="small" id="demo-state" aria-live="polite"></span></div>
      <div class="small muted" id="demo-path"></div>
    </div>
  </div>
</section>

<section class="card" id="s-ref">
  <h2>Reference video</h2>
  <div class="field" data-field="reference">
    <div class="lab"><label for="f-reference">A video you like</label><span class="hint">optional</span></div>
    <input type="text" id="f-reference" name="reference" placeholder="A link or a file path" autocomplete="off">
    <div class="hint small muted">Its pace and feel are measured and offered as one of the directions.</div>
  </div>
</section>

<section class="card" id="s-notes">
  <h2>Anything else</h2>
  <div class="field" data-field="notes">
    <div class="lab"><label for="f-notes">Comments and notes for the video</label><span class="hint">optional</span></div>
    <textarea id="f-notes" name="notes" rows="4" placeholder="Anything Claude should know: what to stress or avoid, an audience detail, a feature to show first, a competitor never to mention…" ${NOFILL}></textarea>
    <div class="hint small muted">Read by the direction step with the rest of the brief.</div>
  </div>
</section>

<section class="card" id="s-name">
  <h2>Title and project name</h2>
  <div class="field" data-field="title">
    <div class="lab"><label for="f-title">Video title</label><span class="hint">optional</span></div>
    <input type="text" id="f-title" name="title" maxlength="120" placeholder="e.g. Launch video, Billing feature, Q4 update" autocomplete="off">
    <div class="hint small muted">How the video is listed in your dashboard. It is not shown in the video itself.</div>
  </div>
  <div class="field" data-field="project_name">
    <div class="lab"><label for="f-project_name">Name</label><span class="unsure"><input type="checkbox" data-unsure="project_name"> Unsure</span></div>
    <input type="text" id="f-project_name" name="project_name" autocomplete="off" spellcheck="false">
    <div class="hint small muted">Proposed from the product, the title (or the video type) and today's date. It names the folder and the finished files.</div>
  </div>
</section>

<div class="bar">
  <button type="button" id="bar-next" hidden>Next section</button>
  <button type="button" class="primary" id="save">Save and continue to direction</button>
  <span class="status" id="save-status">${projectDir ? `Saves to <span class="mono">${e(projectDir)}/plan.json</span>` : ''}</span>
</div>
</main>
<script>
window.__PREFILL__ = ${jsonForScript(prefill)};
window.__TODAY__ = ${jsonForScript(today)};
window.__SAMPLE__ = ${sample ? 'true' : 'false'};
(function(){
  var $ = function(s, r){ return (r||document).querySelector(s); };
  var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
  var lastStoryField = 'claim';
  var siteRead = null;
  var lengthTouched = false;
  var nameTouched = false;

  function countWords(s){ return String(s||'').trim().split(/\\s+/).filter(function(w){ return /[\\p{L}\\p{N}]/u.test(w); }).length; }
  function slug(s){ return String(s||'').toLowerCase().normalize('NFKD').replace(/[^\\p{L}\\p{N}]+/gu,'-').replace(/^-+|-+$/g,'') || 'product'; }
  function radio(name){ var el = $('input[name="'+name+'"]:checked'); return el ? el.value : ''; }
  function setRadio(name, value){ var el = $('input[name="'+name+'"][value="'+value+'"]'); if (el && !el.disabled) { el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); } }

  // ---- browser detection (D-60): only the sign-in paths that apply are shown
  function detectBrowser(){
    var ua = navigator.userAgent || '';
    var brands = (navigator.userAgentData && navigator.userAgentData.brands || []).map(function(b){ return b.brand; });
    var chromium = brands.some(function(b){ return /Chromium|Google Chrome|Microsoft Edge|Brave|Opera/i.test(b); });
    if (!brands.length) chromium = /Chrome\\/|Chromium\\/|CriOS\\//.test(ua) && !/Firefox\\//.test(ua);
    var label = 'a browser we could not identify';
    if (/Edg\\//.test(ua) || brands.some(function(b){ return /Edge/i.test(b); })) label = 'Edge';
    else if (brands.some(function(b){ return /Brave/i.test(b); }) || navigator.brave) label = 'Brave';
    else if (/OPR\\//.test(ua)) label = 'Opera';
    else if (chromium) label = 'Chrome (or another browser built on it)';
    else if (/Firefox\\//.test(ua)) label = 'Firefox';
    else if (/Safari\\//.test(ua) && /Apple/.test(navigator.vendor || '')) label = 'Safari';
    return { chromium: chromium, label: label };
  }
  var browser = detectBrowser();
  $('#detect').innerHTML = browser.chromium
    ? 'You are in <b>' + browser.label + '</b>, so the capture can run inside this browser through the extension.'
    : 'You are in <b>' + browser.label + '</b>. The extension path needs Chrome, Edge, Brave or Arc, so it is not offered; the dedicated profile works here (Chrome must be installed; your password manager, iCloud Passwords included, can fill into that window).';
  $$('[data-needs="chromium"]').forEach(function(el){ if (!browser.chromium) el.remove(); });

  // ---- Unsure toggles
  $$('[data-unsure]').forEach(function(box){
    box.addEventListener('change', function(){
      var field = box.getAttribute('data-unsure');
      var wrap = $('.field[data-field="'+field+'"]');
      var input = wrap && (wrap.querySelector('input[type=text],input[type=number],textarea'));
      wrap.classList.toggle('is-unsure', box.checked);
      if (input) {
        if (box.checked) { input.setAttribute('data-ph', input.placeholder); input.placeholder = 'Anything you do know goes here as a hint (optional)'; }
        else if (input.getAttribute('data-ph') != null) input.placeholder = input.getAttribute('data-ph');
      }
    });
  });
  function isUnsure(field){ var b = $('[data-unsure="'+field+'"]'); return !!(b && b.checked); }

  // the story has no word limits (the direction step writes the on-screen words from it)
  function updateClaim(){}

  // ---- story field focus memory (for site lines)
  ['viewer','claim','pain_point','proof_moment'].forEach(function(f){ var el = $('#f-'+f); el.addEventListener('focus', function(){ lastStoryField = f; }); });

  // ---- video type and scope → suggested length, project name
  var lengthEl = $('#f-length_s'), lengthHint = $('#length-hint');
  lengthEl.addEventListener('input', function(){ lengthTouched = true; });
  function suggestLength(){
    var el = $('input[name="video_type"]:checked'); if (!el) return;
    if (el.value === 'unsure') { lengthHint.textContent = 'Suggested once the video type is known.'; return; }
    var s = el.getAttribute('data-suggest-' + (radio('scope') || 'product'));
    lengthHint.textContent = 'Suggested for this video: ' + s + ' s.';
    if (!lengthTouched) lengthEl.value = s;
  }
  function scopeBranch(){ $('#feature-sub').hidden = radio('scope') !== 'feature'; }
  // D-88 to D-90: the tutorial block, the motion level (tutorial and explainer), the kind's own fields and suggestions
  var tutTouched = { opening: false, closing: false };
  $$('input[name="tut_opening"]').forEach(function(r){ r.addEventListener('change', function(){ tutTouched.opening = true; }); });
  $$('input[name="tut_closing"]').forEach(function(r){ r.addEventListener('change', function(){ tutTouched.closing = true; }); });
  function tutorialBranch(){
    var t = radio('video_type');
    $('#tutorial-sub').hidden = t !== 'tutorial';
    $('#motion-sub').hidden = t !== 'tutorial' && t !== 'explainer';
    var k = radio('tut_kind');
    $$('#tutorial-sub .tutf').forEach(function(f){ f.hidden = !k || f.getAttribute('data-kinds').split(' ').indexOf(k) < 0; });
    $('#tut-goal-label').textContent = k === 'interface' ? 'What it is for' : k === 'feature' ? 'The feature' : 'The goal';
    if (k && !tutTouched.opening) setRadio('tut_opening', k === 'use-case' ? 'hook' : 'message');
    if (k && !tutTouched.closing) setRadio('tut_closing', k === 'use-case' ? 'message' : 'none');
  }
  $$('input[name="tut_kind"]').forEach(function(r){ r.addEventListener('change', tutorialBranch); });
  $$('input[name="video_type"]').forEach(function(r){ r.addEventListener('change', tutorialBranch); });
  // D-93: no cap on the length; a long video is built in chapters
  lengthEl.addEventListener('input', function(){ var n = Number(lengthEl.value); if (n > 300) lengthHint.textContent = 'A long video: the outline groups its moments into chapters, each built and checked on its own.'; });
  $$('input[name="scope"]').forEach(function(r){ r.addEventListener('change', function(){ scopeBranch(); suggestLength(); }); });
  var nameEl = $('#f-project_name');
  nameEl.addEventListener('input', function(){ nameTouched = true; });
  function proposeName(){
    if (nameTouched) return;
    var t = radio('video_type'); var p = $('#f-product').value; var ti = $('#f-title') ? $('#f-title').value.trim() : '';
    nameEl.value = slug(p || 'product') + '-' + (ti ? slug(ti).split('-').slice(0, 4).join('-') : (t && t !== 'unsure' ? t : 'video')) + '-' + window.__TODAY__;
  }
  if ($('#f-title')) $('#f-title').addEventListener('input', proposeName);
  $$('input[name="video_type"]').forEach(function(r){ r.addEventListener('change', function(){ suggestLength(); proposeName(); }); });
  $('#f-product').addEventListener('input', proposeName);

  // ---- look chips
  var look = $('#f-look');
  $$('#look-chips .chip').forEach(function(c){
    c.addEventListener('click', function(){
      c.classList.toggle('on');
      var word = c.getAttribute('data-chip');
      var words = look.value.split(/,\\s*/).map(function(s){ return s.trim(); }).filter(Boolean);
      if (c.classList.contains('on')) { if (words.indexOf(word) < 0) words.push(word); }
      else words = words.filter(function(w){ return w !== word; });
      look.value = words.join(', ');
    });
  });

  // ---- footage branches
  function footageBranch(){
    var v = radio('footage');
    $('#footage-upload').hidden = v !== 'upload';
    $('#footage-existing').hidden = v !== 'existing';
    $('#footage-record').hidden = v !== 'record';
  }
  $$('input[name="footage"]').forEach(function(r){ r.addEventListener('change', footageBranch); });


  // ---- sign-in branches
  function signInBranch(){ $('#token-sub').hidden = radio('sign_in') !== 'token'; $('#demo-sub').hidden = radio('sign_in') !== 'demo-account'; if (radio('sign_in') === 'demo-account') demoCheck(); }
  // D-93: the demo account's sign-in is in the env file; the page only learns whether each line is filled in
  function demoShow(s){
    if (!s || !s.ok) { $('#demo-state').textContent = 'Could not check the file.'; return; }
    $('#demo-path').textContent = s.path;
    $('#demo-state').textContent = s.email && s.password ? '✓ The email and password are in the file.' : s.exists ? 'Not filled in yet: ' + [!s.email && 'email', !s.password && 'password'].filter(Boolean).join(' and ') + '.' : 'No file yet: press Open the file.';
  }
  function demoCheck(){ fetch('/api/demo-account').then(function(r){ return r.json(); }).then(demoShow).catch(function(){ demoShow(null); }); }
  $('#demo-open').addEventListener('click', function(){ fetch('/api/demo-account/open', { method: 'POST' }).then(function(r){ return r.json(); }).then(demoShow).catch(function(){ demoShow(null); }); });
  $('#demo-check').addEventListener('click', demoCheck);
  $$('input[name="sign_in"]').forEach(function(r){ r.addEventListener('change', signInBranch); });

  // ---- narration → voice follow-ups (shown for Narrated and Both only)
  function voiceBranch(){
    var n = radio('narration');
    var on = n === 'narrated' || n === 'both';
    $('#voice-sub').hidden = !on;
    if (on) { if (!radio('voice')) setRadio('voice', 'none'); voiceFilter(); }
  }
  $$('input[name="narration"]').forEach(function(r){ r.addEventListener('change', voiceBranch); });
  // the gender preference filters the voice cards; a hidden pick moves to the recommended voice of that gender
  var cards = $('#voice-cards');
  function voiceFilter(){
    if (!cards) return;
    var g = radio('voice') || 'none';
    $$('#voice-cards .vopt').forEach(function(c){ c.hidden = g !== 'none' && c.getAttribute('data-gender') !== g; });
    var pick = $('#voice-cards input[name="voice_id"]:checked');
    if (!pick || pick.closest('.vopt').hidden) setRadio('voice_id', cards.getAttribute(g === 'male' ? 'data-house-male' : 'data-house-female'));
  }
  $$('input[name="voice"]').forEach(function(r){ r.addEventListener('change', voiceFilter); });
  // one sample plays at a time; pressing again stops it
  var player = $('#voice-player'), playing = null;
  // ---- screens: HTML mockups and screenshots are uploaded to the local server, checked, and kept in the project
  var screenUploads = [];
  function screensBranch(){
    var on = $$('input[name="screens"]:checked').map(function(c){ return c.value; });
    $('#screens-upload').hidden = on.indexOf('mockups') < 0 && on.indexOf('screenshots') < 0;
    $('#screens-figma').hidden = on.indexOf('figma') < 0;
  }
  function drawScreens(){
    var ul = $('#screen-list'); ul.textContent = '';
    screenUploads.forEach(function(u, k){
      var li = document.createElement('li');
      li.textContent = (u.kind === 'mockup' ? 'Mockup: ' : 'Screenshot: ') + u.title + (u.kind === 'mockup' ? (u.shot ? ' (screenshot taken)' : ' (no screenshot yet)') : '') + ' ';
      var x = document.createElement('button'); x.type = 'button'; x.className = 'link'; x.textContent = 'remove';
      x.addEventListener('click', function(){ screenUploads.splice(k, 1); drawScreens(); });
      li.appendChild(x); ul.appendChild(li);
    });
  }
  $$('input[name="screens"]').forEach(function(c){ c.addEventListener('change', screensBranch); });
  var screenFiles = $('#f-screen-files');
  if (screenFiles) screenFiles.addEventListener('change', function(){
    var files = [].slice.call(screenFiles.files || []); var st = $('#screen-status');
    if (!files.length) return;
    if (location.protocol === 'file:') { st.textContent = 'Static preview: nothing is uploaded.'; return; }
    var left = files.length; st.textContent = 'Uploading ' + left + ' file' + (left === 1 ? '' : 's') + '… (a mockup takes a few seconds: it is opened to take its screenshot)';
    files.reduce(function(p, file){
      return p.then(function(){
        return fetch('/api/source-upload?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })
          .then(function(r){ return r.json(); })
          .then(function(j){ if (j.ok) { screenUploads.push({ path: j.path, shot: j.shot, kind: j.kind, title: j.title }); drawScreens(); } else st.textContent = file.name + ': ' + (j.error || 'could not be used'); })
          .catch(function(){ st.textContent = 'The upload did not reach the page server.'; })
          .then(function(){ left--; if (!left && !/:/.test(st.textContent.split('…')[0])) st.textContent = 'Ready.'; });
      });
    }, Promise.resolve()).then(function(){ screenFiles.value = ''; });
  });
  // ---- your own music track: shown when chosen; the file is uploaded to the local server, checked, and kept in the project
  function ownBranch(){ var on = radio('music') === 'own'; $('#own-sub').hidden = !on; }
  $$('input[name="music"]').forEach(function(r){ r.addEventListener('change', ownBranch); });
  var ownFile = $('#f-own-file');
  if (ownFile) ownFile.addEventListener('change', function(){
    var file = ownFile.files && ownFile.files[0]; if (!file) return;
    var st = $('#own-status'); st.textContent = 'Uploading ' + file.name + '…';
    if (location.protocol === 'file:') { st.textContent = 'Static preview: nothing is uploaded.'; return; }
    fetch('/api/music-upload?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })
      .then(function(r){ return r.json(); })
      .then(function(j){ if (j.ok) { $('#f-own-path').value = j.path; $('#f-own-title').value = j.title; st.textContent = 'Ready: ' + j.title + ' (' + Math.floor(j.seconds / 60) + ':' + String(j.seconds % 60).padStart(2, '0') + ').'; } else { $('#f-own-path').value = ''; st.textContent = j.error || 'That file could not be used.'; } })
      .catch(function(){ st.textContent = 'The upload did not reach the page server.'; });
  });
  function stopPlay(){ if (playing) { playing.textContent = '▶'; playing = null; } }
  if (player) player.addEventListener('ended', stopPlay);
  $$('button.play').forEach(function(b){ b.addEventListener('click', function(ev){
    ev.preventDefault();
    var same = playing === b;
    player.pause(); stopPlay();
    if (same) return;
    player.src = b.getAttribute('data-sample'); player.currentTime = 0;
    var p = player.play(); if (p && p.catch) p.catch(function(){ stopPlay(); });
    playing = b; b.textContent = '■';
    var r = b.closest('.vopt').querySelector('input'); if (r) { r.checked = true; r.dispatchEvent(new Event('change', {bubbles:true})); }
  }); });

  // ---- product type → frame note, and "website only" preselects the public path
  var signInTouched = false;
  $$('input[name="sign_in"]').forEach(function(r){ r.addEventListener('click', function(){ signInTouched = true; }); });
  function productTypeBranch(){
    var t = radio('product_type');
    var website = t === 'website';
    $('#website-note').hidden = !website;
    if (website) { setRadio('sign_in', 'public'); signInTouched = false; }
  }
  $$('input[name="product_type"]').forEach(function(r){ r.addEventListener('change', productTypeBranch); });

  // ---- read my site
  function showSite(site){
    siteRead = site;
    var box = $('#site'); box.classList.add('on');
    $('#site-title').textContent = site.title || site.site_name || '(no title found)';
    $('#site-desc').textContent = site.description || '';
    var lines = $('#site-lines'); lines.innerHTML = '';
    var all = (site.description ? [site.description] : []).concat(site.headings || []);
    all.forEach(function(line){
      var c = document.createElement('span'); c.className = 'chip'; c.textContent = line;
      // fills the story field you were last in, without moving the page
      c.addEventListener('click', function(){ var el = $('#f-'+lastStoryField); el.value = line; el.dispatchEvent(new Event('input')); refreshSummaries(); });
      lines.appendChild(c);
    });
    $('#site-lines-box').hidden = !all.length;
    var sug = $('#product-suggestions'); sug.innerHTML = '';
    (site.product_suggestions || []).forEach(function(name){
      var c = document.createElement('span'); c.className = 'chip'; c.textContent = name;
      c.addEventListener('click', function(){ $('#f-product').value = name; proposeName(); });
      sug.appendChild(c);
    });
    // fill what is still empty from the site, and say what was filled so the user checks it as they go
    var filled = [];
    if (!$('#f-product').value && site.product_suggestions && site.product_suggestions[0]) { $('#f-product').value = site.product_suggestions[0]; proposeName(); filled.push('product name'); }
    // the site's description reads as a sentence: "a | b | c" becomes "a. b. c."
    var msg = (site.description || (site.headings || [])[0] || '').split(/\\s+[|·•]\\s+/).join('. ').replace(/\\s+,/g, ',').replace(/\\.\\./g, '.');
    if (msg && !$('#f-claim').value && !isUnsure('claim')) { $('#f-claim').value = msg; filled.push('what it is'); }
    $('#autofill-note').textContent = filled.length ? 'Filled from your site: ' + filled.join(' and ') + '. Check them as you go; change anything that is off.' : '';
    refreshSummaries();
  }
  $('#read-site').addEventListener('click', function(){
    var url = $('#f-url').value.trim(); var st = $('#read-status');
    if (!url) { st.textContent = 'Enter the address first.'; return; }
    if (!/^https?:\\/\\//i.test(url)) { url = 'https://' + url; $('#f-url').value = url; }
    if (window.__SAMPLE__) { st.textContent = 'The static preview does not read sites.'; return; }
    st.textContent = 'Reading…';
    fetch('/api/read-site', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ url: url }) })
      .then(function(r){ return r.json(); })
      .then(function(j){ if (!j.ok) { st.textContent = j.error || 'Could not read the site.'; return; } st.textContent = 'Read.'; showSite(j.site); readBrand(url); })
      .catch(function(){ st.textContent = 'Could not reach the page server.'; });
  });

  // ---- the pinned header shows a line under it once the page has scrolled
  var pin = $('.ud-pin');
  if (pin) window.addEventListener('scroll', function(){ pin.classList.toggle('stuck', window.scrollY > 8); }, { passive: true });

  // ---- password managers: every field here is a note, not a login (set on all of them, the server's too)
  $$('input[type=text],input[type=url],input[type=number],textarea').forEach(function(el){
    el.setAttribute('autocomplete', 'off'); el.setAttribute('data-lpignore', 'true'); el.setAttribute('data-1p-ignore', 'true'); el.setAttribute('data-bwignore', 'true'); el.setAttribute('data-form-type', 'other');
  });

  // ---- sections open one at a time (D-79); a closed one shows what it holds in a line
  var SECTIONS = [];
  function val(id){ var el = $('#f-'+id); return el ? el.value.trim() : ''; }
  function pickedName(name){ var el = $('input[name="'+name+'"]:checked'); var b = el && el.closest('label') && el.closest('label').querySelector('b'); return b ? b.childNodes[0].textContent.trim() : ''; }
  var SUMMARY = {
    's-product': function(){ return [val('product'), val('url'), pickedName('product_type')].filter(Boolean).join(' · '); },
    's-brand': function(){ var f = $('#f-logo').value; var c = $('#hex-brand').textContent; var font = $('#f-font-display').value; return f || c || font ? [f ? 'logo' : 'no logo yet', c, font].filter(Boolean).join(' · ') : ''; },
    's-screens': function(){ var on = $$('input[name="screens"]:checked').map(function(c){ return c.closest('label').querySelector('b').textContent; }); return on.join(', ') + (screenUploads.length ? ' · ' + screenUploads.length + ' file' + (screenUploads.length === 1 ? '' : 's') : ''); },
    's-story': function(){ return val('claim') || (isUnsure('claim') ? 'Unsure: proposed from your site' : ''); },
    's-exact': function(){ return [val('tagline') && '“' + val('tagline') + '”', val('cta') && 'Call to action: ' + val('cta')].filter(Boolean).join(' · ') || 'Nothing word for word'; },
    's-type': function(){ var t = pickedName('video_type'); var fit = { about: 'about ', max: 'up to ', exact: '' }[radio('length_fit') || 'about']; return t ? t + ' · ' + (radio('scope') === 'feature' ? (val('feature') || 'one feature') : 'the whole product') + (val('length_s') ? ' · ' + fit + val('length_s') + ' s' : '') + ({ landscape: ' · landscape', vertical: ' · vertical', both: ' · landscape and vertical' }[radio('formats')] || '') + (radio('cut') ? ' · ' + radio('cut') + ' s cut' : '') : ''; },
    's-sound': function(){ var v = radio('narration') !== 'music-only' ? pickedName('voice_id') : ''; return [pickedName('narration'), v, pickedName('music')].filter(Boolean).join(' · '); },
    's-make': function(){ return [pickedName('tone'), pickedName('autonomy')].filter(Boolean).join(' · '); },
    's-look': function(){ return [val('look'), 'effects ' + (radio('effects') || 'lively')].filter(Boolean).join(' · '); },
    's-footage': function(){ return pickedName('footage'); },
    's-signin': function(){ return pickedName('sign_in'); },
    's-ref': function(){ return val('reference') || 'None'; },
    's-notes': function(){ var n = val('notes'); return n ? (n.length > 90 ? n.slice(0, 90) + '…' : n) : 'None'; },
    's-name': function(){ var t = val('title'); return (t ? t + ' · ' : '') + val('project_name'); }
  };
  function refreshSummaries(){
    SECTIONS.forEach(function(s){ var f = SUMMARY[s.id]; var t = f ? f() : ''; s.querySelector('.sec-head .sum').textContent = t || 'Not filled in yet'; s.classList.toggle('filled', !!t); });
  }
  function openSection(sec, scroll){
    SECTIONS.forEach(function(s){ var on = s === sec; s.classList.toggle('open', on); s.querySelector('.sec-head').setAttribute('aria-expanded', String(on)); });
    // the save bar always offers the next section, so a long section never hides the way on
    var at = SECTIONS.indexOf(sec), barNext = $('#bar-next');
    barNext.hidden = at < 0 || at >= SECTIONS.length - 1;
    if (!barNext.hidden) barNext.textContent = 'Next: ' + SECTIONS[at + 1].querySelector('.sec-head h2').textContent;
    refreshSummaries();
    if (sec && scroll) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function buildAccordion(){
    var cards = $$('main > section.card');
    cards.forEach(function(sec, i){
      var h2 = sec.querySelector(':scope > h2'); var title = h2 ? h2.textContent : '';
      if (h2) h2.remove();
      var body = document.createElement('div'); body.className = 'sec-body';
      while (sec.firstChild) body.appendChild(sec.firstChild);
      var head = document.createElement('button'); head.type = 'button'; head.className = 'sec-head'; head.setAttribute('aria-expanded', 'false');
      head.innerHTML = '<span class="n">' + (i + 1) + '</span><h2></h2><span class="chev" aria-hidden="true">▾</span><span class="sum"></span>';
      head.querySelector('h2').textContent = title;
      sec.classList.add('acc'); sec.appendChild(head); sec.appendChild(body);
      head.addEventListener('click', function(){ openSection(sec.classList.contains('open') ? null : sec); });
      if (i < cards.length - 1) {
        var nx = document.createElement('button'); nx.type = 'button'; nx.className = 'sec-next'; nx.textContent = 'Continue';
        nx.addEventListener('click', function(){ openSection(cards[i + 1], true); });
        body.appendChild(nx);
      }
      SECTIONS.push(sec);
    });
    $('#bar-next').addEventListener('click', function(){ var at = SECTIONS.findIndex(function(s){ return s.classList.contains('open'); }); if (at >= 0 && at < SECTIONS.length - 1) openSection(SECTIONS[at + 1], true); });
    openSection(cards[0]);
    document.addEventListener('input', refreshSummaries); document.addEventListener('change', refreshSummaries);
  }

  // ---- the brand: read in a real browser after the text read; the user's own edits always win
  var brandTouched = {};
  function setLogo(path, which){ $('#f-logo').value = path || ''; $('#logo-prev').innerHTML = path ? '<img alt="Your logo" src="/brand/logo?which=' + which + '&t=' + Date.now() + '">' : '<span class="muted small">No logo found. Upload one: the video shows it in the opening and the close.</span>'; refreshSummaries(); }
  function setCol(k, v){ if (!v || brandTouched['col-' + k]) return; $('#f-col-' + k).value = v; $('#hex-' + k).textContent = v; }
  ['brand','accent','ground','ink'].forEach(function(k){ var el = $('#f-col-' + k); el.addEventListener('input', function(){ brandTouched['col-' + k] = true; $('#hex-' + k).textContent = el.value; }); });
  ['display','body'].forEach(function(k){ $('#f-font-' + k).addEventListener('input', function(){ brandTouched['font-' + k] = true; }); });
  function readBrand(url){
    if (window.__SAMPLE__) return;
    var st = $('#brand-status'); st.innerHTML = '<span class="spin-sm" aria-hidden="true"></span> Reading your logo, colours and fonts… (about 20 seconds)';
    fetch('/api/brand-read', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ url: url }) })
      .then(function(r){ return r.json(); })
      .then(function(j){
        if (!j.ok) { st.textContent = (j.error || 'Could not read the brand.') + ' Upload your logo and set the colours by hand.'; return; }
        var b = j.brand;
        if (!savedBrandUsed && (!$('#f-logo').value || $('#f-logo').value.indexOf('-own') < 0)) setLogo(b.logo, 'site');
        Object.keys(b.colors || {}).forEach(function(k){ setCol(k, b.colors[k]); });
        ['display','body'].forEach(function(k){ if (!brandTouched['font-' + k] && b.fonts && b.fonts[k]) $('#f-font-' + k).value = b.fonts[k]; });
        st.textContent = b.logo ? 'Found your logo, colours and fonts. Check them; change anything that is off.' : 'Found your colours and fonts, but no logo on the home page. Upload your logo below.';
        refreshSummaries();
      })
      .catch(function(){ st.textContent = 'Could not reach the page server.'; });
  }
  var logoFile = $('#f-logo-file');
  logoFile.addEventListener('change', function(){
    var file = logoFile.files && logoFile.files[0]; if (!file) return; var st = $('#logo-status');
    if (location.protocol === 'file:') { st.textContent = 'Static preview: nothing is uploaded.'; return; }
    st.textContent = 'Uploading ' + file.name + '…';
    fetch('/api/logo-upload?name=' + encodeURIComponent(file.name), { method: 'POST', body: file }).then(function(r){ return r.json(); })
      .then(function(j){ if (j.ok) { setLogo(j.path, 'own'); st.textContent = 'Using your logo.'; } else st.textContent = j.error || 'That file could not be used.'; })
      .catch(function(){ st.textContent = 'The upload did not reach the page server.'; });
  });

  // ---- gather the brief
  function gather(){
    var unsure = {};
    function mark(field, hint){ unsure[field] = hint || ''; }
    function tx(field){ var el = $('#f-'+field); var v = el ? el.value.trim() : ''; if (isUnsure(field)) { mark(field, v); return ''; } return v; }
    var b = {
      url: $('#f-url').value.trim(),
      product: tx('product'), viewer: tx('viewer'), claim: tx('claim'), pain_point: tx('pain_point'), proof_moment: tx('proof_moment'), cta: tx('cta'),
      video_type: radio('video_type') || 'unsure', scope: radio('scope') || 'product', feature: $('#f-feature').value.trim(),
      tutorial: radio('video_type') === 'tutorial' ? { kind: radio('tut_kind') || '', area: $('#f-tut-area').value.trim(), goal: $('#f-tut-goal').value.trim(), start: $('#f-tut-start').value.trim(), end: $('#f-tut-end').value.trim(), prerequisites: $('#f-tut-pre').value.trim(), understand: $('#f-tut-understand').value.trim(), steps: $('#f-tut-steps').value, leave_out: $('#f-tut-leave').value.trim(), docs: $('#f-tut-docs').value.trim(), opening: radio('tut_opening') || '', closing: radio('tut_closing') || '' } : null,
      motion_between: radio('video_type') === 'tutorial' || radio('video_type') === 'explainer' ? (radio('motion_between') || 'minimal') : '',
      template: radio('video_type') && radio('video_type') !== 'unsure' ? '' : 'unsure',
      exact: { tagline: $('#f-tagline').value.trim(), lines: $('#f-exact_lines').value },
      effects: radio('effects') || 'lively',
      notes: $('#f-notes').value.trim(),
      length_fit: radio('length_fit') || 'about',
      formats: radio('formats') || '',
      cut: radio('cut') || '',
      brand: { logo: $('#f-logo').value, colors: { brand: $('#f-col-brand').value, accent: $('#f-col-accent').value, ground: $('#f-col-ground').value, ink: $('#f-col-ink').value }, fonts: { display: $('#f-font-display').value.trim(), body: $('#f-font-body').value.trim() } },
      length_s: isUnsure('length_s') ? null : (lengthEl.value === '' ? null : Number(lengthEl.value)),
      narration: radio('narration') || 'unsure',
      voice: (function(){ var r = $('#voice-cards input[name="voice_id"]:checked'); return { preference: radio('voice') || 'none', id: r ? r.value : '', source: r && r.getAttribute('data-paid') === '1' ? 'own-account' : 'built-in' }; })(),
      music: radio('music') === 'own' ? { file: null, own: { path: $('#f-own-path').value, title: $('#f-own-title').value, licensed: $('#f-own-licence').checked } } : { file: radio('music') && radio('music') !== 'auto' ? radio('music') : null },
      tone: radio('tone') || 'unsure',
      autonomy: radio('autonomy') || 'unsure',
      look: { words: look.value.trim(), chips: $$('#look-chips .chip.on').map(function(c){ return c.getAttribute('data-chip'); }) },
      footage: { have: radio('footage') || 'unsure', files: $('textarea[name="footage_files"]').value, links: $('textarea[name="footage_links"]').value, channel: $('input[name="footage_channel"]').value.trim() },
      screens: { from: $$('input[name="screens"]:checked').map(function(c){ return c.value; }), uploads: screenUploads, figma_url: $('#f-figma').value.trim() },
      sign_in: { path: radio('sign_in') || 'unsure', token_note: $('input[name="token_note"]').value.trim(), browser: browser },
      reference: $('#f-reference').value.trim(),
      product_type: radio('product_type') || 'unsure',
      title: $('#f-title') ? $('#f-title').value.trim() : '',
      project_name: tx('project_name'),
      site: siteRead ? { title: siteRead.title, description: siteRead.description, headings: siteRead.headings } : null,
      unsure: unsure
    };
    if (isUnsure('length_s')) mark('length_s', lengthEl.value);
    if (isUnsure('look')) mark('look', look.value.trim());
    if (b.video_type === 'unsure') mark('template');
    if (b.narration === 'unsure') mark('narration');
    if (b.tone === 'unsure') mark('register');
    if (b.autonomy === 'unsure') mark('autonomy');
    if (b.footage.have === 'unsure') mark('footage');
    if (b.sign_in.path === 'unsure') mark('sign_in');
    if (b.product_type === 'unsure') mark('product_type');
    return b;
  }

  // ---- a saved brand: fills the kit and the story (never the video's own choices: type, length, sound)
  var savedBrandUsed = false;
  function applyBrand(b){
    savedBrandUsed = true;
    function set(id, v){ var el = $('#f-' + id); if (el && v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }
    set('url', b.url); set('product', b.product);
    ['viewer', 'claim', 'pain_point', 'proof_moment', 'cta'].forEach(function(k){ set(k, b[k]); });
    if (b.exact) { if (b.exact.tagline) $('#f-tagline').value = b.exact.tagline; if ((b.exact.lines || []).length) $('#f-exact_lines').value = b.exact.lines.join('\\n'); }
    if (b.product_type) setRadio('product_type', b.product_type);
    if (b.tone) setRadio('tone', b.tone);
    if (b.voice) { if (b.voice.preference) setRadio('voice', b.voice.preference); if (b.voice.id) setRadio('voice_id', b.voice.id); }
    var k = b.brand || {};
    if (k.logo) setLogo(k.logo, k.logo.indexOf('-own') >= 0 ? 'own' : 'site');
    Object.keys(k.colors || {}).forEach(function(c){ var el = $('#f-col-' + c); if (!el) return; el.value = k.colors[c]; $('#hex-' + c).textContent = k.colors[c]; brandTouched['col-' + c] = true; });
    ['display', 'body'].forEach(function(f){ if (k.fonts && k.fonts[f]) { $('#f-font-' + f).value = k.fonts[f]; brandTouched['font-' + f] = true; } });
    $('#brand-status').textContent = 'From your saved brand ' + b.name + '. Change anything for this video; saving the brief asks before it updates the brand.';
    updateClaim(); proposeName(); refreshSummaries();
  }
  var brandSel = $('#f-saved-brand');
  if (brandSel) {
    $('#use-brand').addEventListener('click', function(){
      var slug = brandSel.value, st = $('#saved-brand-status');
      if (!slug) { st.textContent = 'Choose a brand first.'; return; }
      st.textContent = 'Filling the brief…';
      fetch('/api/brand-use', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: slug }) })
        .then(function(r){ return r.json(); })
        .then(function(j){ if (!j.ok) { st.textContent = j.error || 'Could not use that brand.'; return; } applyBrand(j.brand); st.textContent = 'Filled from ' + j.brand.name + ': the brand and the story. Everything stays editable.'; })
        .catch(function(){ st.textContent = 'Could not reach the page server.'; });
    });
    // a new video started from the Delivery card arrives with its brand (?brand=slug) and starts from it
    var qb = new URLSearchParams(location.search).get('brand');
    if (qb && !window.__PREFILL__) { brandSel.value = qb; if (brandSel.value === qb) $('#use-brand').click(); }
    // typing the address of a saved brand suggests it
    $('#f-url').addEventListener('change', function(){
      if (savedBrandUsed) return;
      var d = ''; try { d = new URL($('#f-url').value).hostname.replace(/^www\\./, ''); } catch (err) {}
      var opt = d && Array.prototype.slice.call(brandSel.options).find(function(o){ return o.getAttribute('data-domain') === d; });
      if (opt) { brandSel.value = opt.value; $('#saved-brand-status').textContent = 'You have ' + opt.textContent.split(' · ')[0] + ' saved. Press Use this brand to start from it.'; }
    });
  }

  // ---- prefill from an existing plan
  function prefill(v){
    if (!v) return;
    var unsure = (v.intake && v.intake.unsure) || {};
    function put(field, value){ var el = $('#f-'+field); if (!el) return; if (value != null && value !== '') el.value = value; var b = $('[data-unsure="'+field+'"]'); if (b && unsure[field] != null) { b.checked = true; b.dispatchEvent(new Event('change')); var m = /Hint: (.*)$/.exec(unsure[field]); if (m && el) el.value = m[1]; } }
    put('url', v.url); put('product', v.product); put('viewer', v.viewer); put('claim', v.claim); put('pain_point', v.pain_point); put('proof_moment', v.proof_moment); put('cta', v.cta);
    var itp = v.intake || {};
    setRadio('video_type', itp.video_type || ({ launch: 'launch', ad: 'ad', explainer: 'explainer', 'product-tour': 'explainer', 'feature-focus': 'explainer', 'feature-showcase': 'spotlight' })[v.template] || 'unsure');
    setRadio('scope', itp.scope || (v.template === 'feature-focus' ? 'feature' : 'product'));
    if (itp.feature) $('#f-feature').value = itp.feature;
    if (itp.tutorial) {
      var tu = itp.tutorial;
      setRadio('tut_kind', tu.kind || '');
      [['area', tu.area], ['goal', tu.goal], ['start', tu.start], ['end', tu.end], ['pre', tu.prerequisites], ['understand', tu.understand], ['leave', tu.leave_out], ['docs', tu.docs]].forEach(function(p){ if (p[1]) $('#f-tut-' + p[0]).value = p[1]; });
      if (tu.steps && tu.steps.length) $('#f-tut-steps').value = tu.steps.join('\\n');
      if (tu.opening) { setRadio('tut_opening', tu.opening); tutTouched.opening = true; }
      if (tu.closing) { setRadio('tut_closing', tu.closing); tutTouched.closing = true; }
    }
    if (itp.motion_between) setRadio('motion_between', itp.motion_between);
    if (itp.exact) { $('#f-tagline').value = itp.exact.tagline || ''; $('#f-exact_lines').value = (itp.exact.lines || []).join('\\n'); }
    if (itp.effects) setRadio('effects', itp.effects);
    if (itp.notes) $('#f-notes').value = itp.notes;
    if (itp.length_fit) setRadio('length_fit', itp.length_fit);
    if (itp.formats) setRadio('formats', itp.formats.length > 1 ? 'both' : itp.formats[0]);
    if (itp.cut) setRadio('cut', String(itp.cut));
    if (itp.brand) {
      if (itp.brand.logo) setLogo(itp.brand.logo, itp.brand.logo.indexOf('-own') >= 0 ? 'own' : 'site');
      Object.keys(itp.brand.colors || {}).forEach(function(k){ $('#f-col-' + k).value = itp.brand.colors[k]; $('#hex-' + k).textContent = itp.brand.colors[k]; brandTouched['col-' + k] = true; });
      ['display','body'].forEach(function(k){ if (itp.brand.fonts && itp.brand.fonts[k]) { $('#f-font-' + k).value = itp.brand.fonts[k]; brandTouched['font-' + k] = true; } });
      $('#brand-status').textContent = 'Saved with the brief. Change anything that is off.';
    }
    if (v.length_s != null) { lengthEl.value = v.length_s; lengthTouched = true; } put('length_s', null);
    var nar = { voice: 'narrated', 'music-only': 'music-only', hybrid: 'both' }; setRadio('narration', nar[v.narration] || 'unsure');
    if (v.intake && v.intake.voice) { setRadio('voice', v.intake.voice.preference || 'none'); if (v.intake.voice.id) setRadio('voice_id', v.intake.voice.id); }
    var mu = (v.intake && v.intake.music) || {};
    if (mu.own) { setRadio('music', 'own'); $('#f-own-path').value = mu.own.path || ''; $('#f-own-title').value = mu.own.title || ''; $('#f-own-licence').checked = !!mu.own.licensed; $('#own-status').textContent = mu.own.path ? 'Using ' + (mu.own.title || mu.own.path) + '.' : ''; }
    else setRadio('music', mu.file || 'auto');
    setRadio('tone', (v.copy && v.copy.register) || 'unsure');
    setRadio('autonomy', { review: 'user-reviewed', director: 'auto' }[v.autonomy] || 'unsure');
    var it = v.intake || {};
    if (it.screens) {
      $$('input[name="screens"]').forEach(function(c){ c.checked = (it.screens.from || []).indexOf(c.value) >= 0; });
      screenUploads = (it.screens.uploads || []).slice(); drawScreens();
      if (it.screens.figma_url) $('#f-figma').value = it.screens.figma_url;
      screensBranch();
    }
    if (it.look) { look.value = it.look.words || ''; (it.look.chips || []).forEach(function(w){ var c = $('#look-chips .chip[data-chip="'+w+'"]'); if (c) c.classList.add('on'); }); } put('look', null);
    if (it.footage) { setRadio('footage', it.footage.have || 'none'); $('textarea[name="footage_files"]').value = (it.footage.files || []).join('\\n'); $('textarea[name="footage_links"]').value = (it.footage.links || []).join('\\n'); $('input[name="footage_channel"]').value = it.footage.channel || ''; } else if (unsure.footage != null) setRadio('footage', 'unsure');
    if (it.sign_in) { setRadio('sign_in', it.sign_in.path || 'public'); signInTouched = true; $('input[name="token_note"]').value = it.sign_in.token_note || ''; } else if (unsure.sign_in != null) setRadio('sign_in', 'unsure');
    if (v.reference) $('#f-reference').value = v.reference;
    // product type; an older plan that only knew "mobile" maps across
    var pt = it.product_type || (it.mobile === true ? 'mobile-app' : it.mobile === false ? 'web-app' : '');
    setRadio('product_type', pt || (unsure.product_type != null || unsure.mobile != null ? 'unsure' : ''));
    if (it.title && $('#f-title')) $('#f-title').value = it.title;
    if (it.project_name) { nameEl.value = it.project_name; nameTouched = true; } put('project_name', null);
    if (it.site) showSite(it.site);
    updateClaim();
  }
  prefill(window.__PREFILL__);
  if (!radio('tone')) setRadio('tone', 'balanced');
  if (!radio('music')) setRadio('music', 'auto');
  if (!radio('autonomy')) setRadio('autonomy', 'user-reviewed');
  if (!radio('product_type')) setRadio('product_type', 'web-app');
  if (!radio('footage')) setRadio('footage', 'none');
  if (!radio('formats')) setRadio('formats', 'landscape');
  if (!radio('sign_in')) setRadio('sign_in', 'public');
  suggestLength(); proposeName(); footageBranch(); signInBranch(); voiceBranch(); ownBranch(); productTypeBranch(); scopeBranch(); tutorialBranch(); updateClaim();
  buildAccordion();

  // ---- save
  var saveBtn = $('#save'), saveStatus = $('#save-status');
  function showProblems(list){
    var box = $('#problems'), ul = $('#problem-list'); ul.innerHTML = '';
    list.forEach(function(p){ var li = document.createElement('li'); li.textContent = (p.what || p) + (p.fix ? ' — ' + p.fix : ''); ul.appendChild(li); });
    box.classList.toggle('on', list.length > 0);
    // open the section that holds the first problem
    var first = list.find(function(p){ return p.field; });
    var wrap = first && $('.field[data-field="' + first.field + '"]');
    if (wrap && wrap.closest('section.card')) openSection(wrap.closest('section.card'));
    if (list.length) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  saveBtn.addEventListener('click', function(){
    var b = gather();
    var local = [];
    if (!b.url) local.push({ what: 'The product address is empty', fix: 'it is the one thing the page needs' });
    if (local.length) { showProblems(local); return; }
    if (window.__SAMPLE__) { showProblems([]); saveStatus.textContent = 'Static preview: nothing is saved. The brief would be: ' + JSON.stringify(b).slice(0, 200) + '…'; return; }
    saveBtn.disabled = true; saveStatus.textContent = 'Saving…'; saveStatus.classList.remove('bad');
    fetch('/api/submit', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(b) })
      .then(function(r){ return r.json(); })
      .then(function(j){
        saveBtn.disabled = false;
        if (j.ok) { showProblems([]); window.location.href = j.next || '/saved'; return; }
        saveStatus.textContent = j.error || 'Not saved yet.'; saveStatus.classList.add('bad');
        showProblems(j.problems || [{ what: j.error || 'Not saved' }]);
      })
      .catch(function(){ saveBtn.disabled = false; saveStatus.textContent = 'Could not reach the page server.'; saveStatus.classList.add('bad'); });
  });
})();
</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// The confirmation page
// ---------------------------------------------------------------------------

export function renderSavedPage(opts = {}) {
  const { plan, planPath = '', projectDir = '', notes = [], missing = false, brand = null } = opts;
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brief saved · Ultrademo</title><link rel="stylesheet" href="/ui/ui.css"><style>${CSS}</style></head><body><main>`;
  if (missing || !plan?.video) {
    return `${head}<div class="ud-pin">${UD_HEAD}${progressBar('brief')}</div><h1>No brief yet</h1><p class="lead">Nothing has been saved to <span class="mono">${e(folderOrNone(projectDir))}</span>. <a href="/">Back to the brief</a>.</p></main></body></html>`;
  }
  const v = plan.video;
  const it = v.intake ?? {};
  const unsure = it.unsure ?? {};
  const pill = (field) => (field in unsure ? `<span class="pill unsure">Unsure · the direction step proposes it</span>` : '');
  const val = (field, text) => (field in unsure ? `<span class="muted">—</span>${pill(field)}${hintOf(unsure[field])}` : text);
  const hintOf = (note) => { const m = /Hint: (.*)$/.exec(note || ''); return m ? ` <span class="muted small">your hint: ${e(m[1])}</span>` : ''; };
  const tmpl = TEMPLATE_META.find((t) => t.id === v.template);
  const rows = [
    [LABELS.product, val('product', e(v.product))],
    [LABELS.url, `<a href="${e(v.url)}">${e(v.url)}</a>`],
    ...(it.screens ? [[LABELS.screens, e([
      ...(it.screens.from || []).map((x) => ({ live: 'the live site or app', mockups: 'HTML mockups', screenshots: 'screenshots', figma: 'a Figma file' })[x] || x),
    ].join(', ')) + (it.screens.uploads?.length ? `<ul class="small" style="margin:6px 0 0;padding-left:18px">${it.screens.uploads.map((u) => `<li>${u.kind === 'mockup' ? 'Mockup' : 'Screenshot'}: ${e(u.title)}</li>`).join('')}</ul>` : '')]] : []),
    [LABELS.product_type, val('product_type', it.product_type ? e(PRODUCT_TYPE_WORDS[it.product_type] ?? it.product_type) : '<span class="muted">—</span>')],
    [LABELS.viewer, val('viewer', e(v.viewer))],
    [LABELS.claim, val('claim', e(v.claim))],
    [LABELS.pain_point, val('pain_point', e(v.pain_point))],
    [LABELS.proof_moment, val('proof_moment', e(v.proof_moment))],
    [LABELS.cta, val('cta', e(v.cta))],
    [LABELS.video_type, it.video_type ? `${e(VIDEO_TYPE_META.find((t) => t.id === it.video_type)?.name ?? it.video_type)} · ${it.scope === 'feature' ? `one feature${it.feature ? `: ${e(it.feature)}` : ''}` : 'the whole product'}` : val('template', e(tmpl?.name ?? v.template))],
    ...(it.exact && (it.exact.tagline || it.exact.lines?.length) ? [['Exact wording', e([it.exact.tagline, ...(it.exact.lines || [])].filter(Boolean).join(' · '))]] : []),
    ['Effects', e(it.effects || 'lively')],
    [LABELS.length_s, val('length_s', v.length_s != null ? `${e(v.length_s)} seconds` : '<span class="muted">the length of the footage</span>')],
    [LABELS.narration, val('narration', e(NARRATION_WORDS[v.narration] ?? v.narration))],
    ...(it.voice ? [[LABELS.voice, findVoice(it.voice.id) ? `${e(findVoice(it.voice.id).name)} · ${e(VOICE_SOURCE_WORDS[it.voice.source] ?? it.voice.source)}` : `${e(VOICE_WORDS[it.voice.preference] ?? it.voice.preference)} · ${e(VOICE_SOURCE_WORDS[it.voice.source] ?? it.voice.source)}`]] : []),
    ['Music', it.music?.file ? e((musicTracks().find((t) => t.file === it.music.file) || { title: it.music.file }).title) : 'the direction chooses'],
    [LABELS.register, val('register', e(v.copy?.register ?? ''))],
    [LABELS.autonomy, val('autonomy', e(AUTONOMY_WORDS[v.autonomy] ?? v.autonomy))],
    [LABELS.look, val('look', it.look ? `${e(it.look.words || '')}${it.look.chips?.length ? ` <span class="muted small">(${e(it.look.chips.join(', '))})</span>` : ''}` || '<span class="muted">nothing yet</span>' : '')],
    [LABELS.footage, val('footage', it.footage ? `${e(FOOTAGE_WORDS[it.footage.have] ?? it.footage.have)}${it.footage.files?.length ? `<br><span class="small mono">${it.footage.files.map(e).join('<br>')}</span>` : ''}${it.footage.channel ? `<br><span class="small">${e(it.footage.channel)}</span>` : ''}${it.footage.links?.length ? `<br><span class="small">${it.footage.links.map(e).join('<br>')}</span>` : ''}` : '')],
    [LABELS.sign_in, val('sign_in', it.sign_in ? `${e(SIGN_IN_WORDS[it.sign_in.path] ?? it.sign_in.path)}${it.sign_in.token_note ? ` <span class="muted small">(${e(it.sign_in.token_note)})</span>` : ''}${it.sign_in.note ? ` <span class="muted small">· ${e(it.sign_in.note)}</span>` : ''}${it.sign_in.browser?.label ? ` <span class="muted small">· filled in from ${e(it.sign_in.browser.label)}</span>` : ''}` : '')],
    [LABELS.reference, val('reference', v.reference ? e(v.reference) : '<span class="muted">none</span>')],
    ...(it.title ? [['Video title', e(it.title)]] : []),
    ...(it.cut ? [['Social cut', `${e(it.cut)} seconds, after the video`]] : []),
    ...(it.formats ? [['Format', e(it.formats.length > 1 ? 'Landscape and vertical' : it.formats[0] === 'vertical' ? 'Vertical (9:16)' : 'Landscape (16:9)')]] : []),
    [LABELS.project_name, val('project_name', `<span class="mono">${e(it.project_name ?? '')}</span>`)],
  ];
  const unsureCount = Object.keys(unsure).length;
  const kept = [];
  if (plan.direction) kept.push('the direction already in the plan');
  if (Array.isArray(plan.scenes) && plan.scenes.length) kept.push(`${plan.scenes.length} scene${plan.scenes.length === 1 ? '' : 's'}`);
  if (v.sources?.length) kept.push(`${v.sources.length} source asset${v.sources.length === 1 ? '' : 's'}`);
  if (v.claims?.length) kept.push(`${v.claims.length} claim${v.claims.length === 1 ? '' : 's'}`);
  const noteRows = notes.map((n) => `<li>${e(n.scene)}: ${e(n.what)} <span class="muted small">${e(n.fix)}</span></li>`).join('');
  return `${head}
<div class="ud-pin">${UD_HEAD}
${progressBar('direction')}</div>
<h1>Brief saved</h1>
${kept.length ? `<p class="lead">Kept untouched: ${e(kept.join(', '))}.</p>` : ''}
<section class="card hero working" id="next-step" aria-live="polite">
  <div class="work-head"><span class="spin" id="spin" aria-hidden="true"></span><div><h2 id="work-title">Claude is preparing your directions</h2>
  <p id="next-status">Nothing to do here. The direction page opens in your browser by itself when it is ready, usually in a few minutes.</p></div></div>
  <ol class="work-steps">
    <li data-step="started">Claude picks up the brief</li>
    <li data-step="site">Reads your site</li>
    <li data-step="brand">Reads the brand: colours, type and the claims it can cite</li>
    <li data-step="directions">Writes two or three directions</li>
    <li data-step="ready">Opens the direction page</li>
  </ol>
  <div class="nudge" id="nudge" hidden>
    <p><b>Claude has not started yet.</b> Paste this into the Claude chat:</p>
    <div class="copyrow"><code id="nudge-text">the brief is saved${projectDir ? ` for projects/${e(path.basename(projectDir))}` : ''}</code><button type="button" id="nudge-copy">Copy</button></div>
  </div>
</section>
${brandAsk(brand)}
<details class="card saved-sum"><summary><b>What you saved</b> <span class="muted small">${rows.length} items${unsureCount ? ` · ${unsureCount} left for the direction step to propose` : ''} · ${e(planPath)}</span></summary>
${rows.map(([k, x]) => `<div class="kv"><span>${e(k)}</span><div>${x}</div></div>`).join('')}
<p style="margin-top:14px"><a href="/">Back to the brief</a> to change anything; saving again merges into the same file.</p></details>
${noteRows ? `<details class="card saved-sum"><summary><b>Notes from the full plan check</b> <span class="muted small">these do not block the brief</span></summary><ul>${noteRows}</ul></details>` : ''}
<aside class="info" aria-label="About the next step"><h3>About the next step</h3>
<ul>
  <li>Claude reads your site and pulls the claims it can cite, marking each as seen in the product, stated on your site, or needing your confirmation.</li>
  ${v.reference ? '<li>It measures the reference video you gave: its pace, cuts and energy become one of the directions.</li>' : ''}
  ${unsureCount ? '<li>It proposes what you left empty or Unsure, with your hints, for you to edit.</li>' : ''}
  ${it.footage?.have === 'upload' || it.footage?.have === 'existing' ? '<li>It reads the footage you named: a transcript, in and out points, and where each clip fits.</li>' : ''}
  <li>The direction page shows two or three directions that differ in idea: a sketch storyboard each, type and colour, pace, music${v.narration === 'music-only' ? '' : ', voice'} and rendered frames, so you pick by eye.</li>
  <li>There you pick one and can edit anything before production: the words, the motion, the type.</li>
</ul></aside>
</main>
<script>
// the loader follows the direction step from the files it writes (/api/progress); the direction page itself runs on
// port 4322 once it is ready (and opens on its own). After five minutes with no sign of Claude, the copy box shows.
(function(){
  var DIRECTION = 'http://127.0.0.1:4322/', NUDGE_MS = 5 * 60 * 1000, ORDER = ['started', 'site', 'brand', 'directions', 'ready'];
  var title = document.getElementById('work-title'), st = document.getElementById('next-status'), nudge = document.getElementById('nudge'), spin = document.getElementById('spin');
  var done = false;
  function mark(state){
    var current = ORDER.findIndex(function(k){ return !state[k]; });
    document.querySelectorAll('.work-steps li').forEach(function(li, i){
      li.className = state[ORDER[i]] ? 'done' : i === current ? 'now' : '';
    });
  }
  function ready(){
    done = true; mark({ started: 1, site: 1, brand: 1, directions: 1, ready: 1 });
    spin.classList.add('stop'); nudge.hidden = true;
    title.textContent = 'Your directions are ready';
    st.innerHTML = 'The direction page opened in another tab. If not, <a href="' + DIRECTION + '">open it here</a>.';
  }
  function poll(){
    if (done) return;
    // this project's own direction page (pages.json); the usual port only once this project's directions are written
    fetch('/api/progress', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(p){
      mark(p);
      if (p.direction_url) DIRECTION = p.direction_url;
      var waited = Date.now() - (p.saved_at || Date.now());
      nudge.hidden = !!p.started || waited < NUDGE_MS;
      if (p.started) st.textContent = 'Claude is on it. Nothing to do here; the direction page opens by itself when it is ready.';
      if (!p.direction_url && !p.directions) return;
      return fetch(DIRECTION, { mode: 'no-cors', cache: 'no-store' }).then(ready, function(){});
    }).catch(function(){}).then(function(){ if (!done) setTimeout(poll, 4000); });
  }
  document.getElementById('nudge-copy').addEventListener('click', function(ev){
    var b = ev.currentTarget, t = document.getElementById('nudge-text').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ b.textContent = 'Copied'; }, function(){ b.textContent = 'Select and copy'; });
    setTimeout(function(){ b.textContent = 'Copy'; }, 2000);
  });
  mark({});
  poll();
})();
</script>
</body></html>`;
}

function folderOrNone(p) { return p || '(no project folder)'; }

/** The saved page's brand card: save a new brand, or update the saved one with what this brief changed. */
function brandAsk(b) {
  if (!b || !b.name) return '';
  if (b.status === 'same') return `<p class="small muted">Uses your saved brand ${e(b.name)}, unchanged.</p>`;
  const changed = b.status === 'changed';
  const list = (b.changes || []).join(', ');
  return `<section class="card" id="brand-ask"><h2>${changed ? `Update your saved brand ${e(b.name)}?` : `Save ${e(b.name)} as a brand?`}</h2>
<p class="help">${changed ? `This brief changes ${e(list)}. Update the brand so the next video starts from these, or keep the saved one; this video uses what you entered either way.` : 'The next brief can start from its logo, colours, fonts and story. Everything stays editable per video.'}</p>
<div class="row"><button type="button" data-act="save">${changed ? 'Update the brand' : 'Save the brand'}</button><button type="button" class="quiet" data-act="skip" data-done="${changed ? 'Kept the saved brand as it was.' : 'Not saved. You can save it from the next brief.'}">${changed ? 'Keep the saved brand' : 'Not now'}</button></div>
<p class="small muted" id="brand-ask-status" aria-live="polite"></p></section>`;
}
