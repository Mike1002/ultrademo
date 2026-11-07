// Ultrademo flow template.
// Copy to projects/<app>-<topic>-<YYYY-MM-DD-HHMM>/flow.mjs and adapt - the
// project folder name is the project name (timestamp = creation; retakes reuse
// the same folder, which preserves the TTS cache).
//
// Run: npm run capture -- <project>
// If the flow mutates app state, add a projects/<project>/reset.mjs recipe and
// run it before each retake.

const BASE = 'http://localhost:3000'; // NOTE: some frameworks (Next.js server
// actions) fail origin checks on 127.0.0.1 - prefer the localhost hostname.
// Credentials come from .env (run: cp .env.example .env), never hardcoded here.
// For SSO / human-check logins, drop `setup` and use `npm run login` instead;
// the capture then reuses that session via `profile: '<name>'` below.
const EMAIL = process.env.APP_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.APP_PASSWORD ?? 'change-me';

// Optional: blur sensitive content in-page (works in stills AND clips, and
// survives navigation/scrolling). Adapt the regex/selectors to your app.
const REDACT = `(() => {
  const RE = /@example\\.com/;
  const sweep = () => {
    for (const el of document.querySelectorAll('span,div,p,a,td,button')) {
      if (el.dataset.redacted) continue;
      if (el.children.length === 0 && RE.test(el.textContent)) {
        el.style.filter = 'blur(6px)';
        el.dataset.redacted = '1';
      }
    }
  };
  const start = () => {
    sweep();
    new MutationObserver(sweep).observe(document.body, {childList: true, subtree: true, characterData: true});
    setInterval(sweep, 400);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

export default {
  title: 'My App - product tour',
  template: 'product-tour', // 'launch' (18-22 s, beat spine) | 'feature-focus' (30-90 s) | 'product-tour' (90 s-4 min)

  // Story brief (optional, recommended): one viewer in a situation, the problem in their words,
  // the new way, the brand, the one decisive proof, the one next action.
  // brief: {audience: 'a founder whose new accounts live in email', painPoint: '...', solution: '...', brand: 'My App', proof: '...', cta: 'Try it free at myapp.com'},

  // Claims the script may use, each with its tier: 'shown' (the sources prove it), 'stated' (the
  // customer's own site says it; cite the page), 'question' (nothing shows or states it: the user
  // confirms, gives a source, or the line is cut). Never invent, never silently drop.
  // claims: [{text: 'Set up in under a minute', tier: 'stated', source: 'https://myapp.com/#pricing'}],

  // Pronunciation map: respellings sent to the voice engine only. Captions and the narration audit
  // keep the real word. Add entries when the audit reports a word heard differently.
  // pronunciations: {timeline: 'time-line', CRM: 'C R M'},

  // Voice tier for this project (overrides ULTRADEMO_VOICE): 'pocket:eve' | 'pocket:george' |
  // 'chatterbox:default' | 'chatterbox:clone=<10s.wav>' | 'elevenlabs[:voiceId]' | 'say'.
  // voice: 'pocket:george',

  // Music bed, looped to the programme length, faded, ducked under narration, final mix -16 LUFS.
  // File relative to this project folder or to the workspace music/ library (CC0 / CC-BY tracks with
  // ATTRIBUTION.md). Launch defaults to music; narrated Templates take it as an optional bed.
  // music: {file: 'bed.mp3', volume: 0.35, duck: true, fadeIn: 1.5, fadeOut: 2.5, bpm: 120},
  //   // with `bpm`, silent beat scenes snap to whole beats (`grid: 'bars'` for bars) so cuts land on the music.
  // sfx: [{file: 'click.wav', scene: 's3-action', offset: 1.2, gain: 0.8}],   // mixed when the file exists (sfx/ or this folder)
  // stage: 'light',            // backdrop for beat scenes: 'light' | 'dark' (default: problem and close acts dark)
  // captions: false,           // music-only films: the copy carries the message
  // reviewTimebox: '48 hours', // shown on the review page: silence after it is acceptance
  colorScheme: 'light', // or 'dark' - match your app's theme
  redactScript: REDACT, // omit if nothing needs masking

  // Optional presentation (all omittable; sensible defaults if absent):
  // brand: '#ffb224',                 // accent for slides + branded captions, or the full tokens for beat scenes:
  // brand: {name: 'My App', accent: '#ffb224', background: '#F5F1EB', ink: '#202321', font: 'sans', radius: 16, logo: 'captures/logo.png', url: 'myapp.com'},
  // caption: {theme: 'outline', size: 'md', position: 'bottom', highlight: 'dim'},
  //   // theme: 'outline' (default - light text + dark stroke, no box; over
  //   //   busy, text-dense screens prefer a background: 'pill' or 'bar')
  //   //   | 'pill' (dark chip) | 'bar' (full-width lower third)
  //   // size: 'sm' | 'md' | 'lg'; position: 'bottom' | 'top'
  //   // highlight (karaoke, ElevenLabs voice only): 'dim' (active word bright,
  //   //   rest dimmed) | 'pill' (brand chip under active word) | 'wipe' (accent
  //   //   sweeps across each word as spoken - recommended with ElevenLabs).
  //   //   Free voices ignore it and stay static.
  // intro: {title: 'My App - walkthrough', subtitle: 'A quick tour', script: '...'},
  //   // title card over a framed app screenshot (auto-filled from the first
  //   // captured scene; pass `screenshot: '<file>'` to override).
  //   // `layout: 'split'` puts the text on the left and the screenshot on the
  //   // right (nice when the first screen is tall/busy); default stacks them.
  //   // Vertical renders always stack regardless.
  //   // `script` narrates the card: the cold-open line (what the product is,
  //   // who it's for) plays here, starting ~0.75s after the card appears, and
  //   // the slide holds until the line finishes.
  // outro: {title: 'Thanks for watching', subtitle: 'Try it free', url: 'myapp.com', script: '...'},
  //   // `script` here carries the closing tagline + sign-off, so the spoken
  //   // CTA lands while the URL is on screen. The close sells YOUR product -
  //   // it never mentions Ultrademo or how the video was made.

  // Runs once before the scenes (not part of any clip window).
  setup: async (page) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard', {timeout: 20_000});
  },

  scenes: [
    // BEAT scene (Launch, Feature showcase): drawn by the story components, no page interaction of its
    // own. `sources` are stills: another scene's id, a captures/ file, or {url, fullPage, phone, selector}
    // captured read-only. visual: 'typographic' | 'product-in-frame' | 'split' | 'card-fan' | 'stat' | 'graphic';
    // layout: 'full-bleed-type' | 'captioned' | 'split' | 'product-only' | 'pair'; chrome: 'browser' | 'laptop' |
    // 'mobile' | 'none'; action {kind: 'click'|'type'|'scroll'|'reveal', target, x, y (percent)}; handoff
    // 'crossfade' | 'wipe' | 'cut'; `seconds` pins the length. The first scene enters instantly (hook on frame 0).
    // {id: 'b1-hook', media: 'beat', beat: 'hook', act: 'problem', visual: 'typographic', copy: {headline: 'Your new accounts still live in email.', accent: 'email'}, sceneGoal: 'the viewer sees their own mess', handoff: 'cut'},
    // {id: 'b2-reveal', media: 'beat', beat: 'reveal', act: 'reset', visual: 'product-in-frame', layout: 'captioned', chrome: 'browser', copy: {headline: 'One table for all of them.'}, sources: ['s1-intro'], labels: ['Companies']},
    // {id: 'b3-result', media: 'beat', beat: 'result', act: 'proof', visual: 'product-in-frame', layout: 'product-only', sources: [{url: `${BASE}/companies/42`, fullPage: true}], action: {kind: 'scroll', target: 'the record', seconds: 2.6}},
    // {id: 'b4-close', media: 'beat', beat: 'logo', act: 'close', visual: 'product-in-frame', layout: 'pair', chrome: 'laptop', copy: {headline: 'Try it free', sub: 'myapp.com'}, sources: ['s1-intro', {url: `${BASE}`, phone: true}]},

    // STILL scene: screenshot + Ken Burns zoom toward `target`.
    // Story fields (optional, any scene): beat 'hook'|'reveal'|'highlight'|'action'|'result'|'punchline'|'logo';
    // act 'problem'|'reset'|'proof'|'close'; visual 'recording-action'|'product-in-frame'|'typographic'|'graphic';
    // layout 'captioned'|'split'|'product-only'|'full-bleed-type'; copy {headline, accent, sub} on non-capture beats;
    // sceneGoal 'what the viewer needs to know here'; before/after (state before and after the action);
    // labels ['exact on-screen strings that must match']; noEcho: true (narration adds, never repeats the copy);
    // handoff 'crossfade'|'wipe'|'cut' (the transition the action causes); cue {music: 'hit'|'swell'|'rest'};
    // claims [{text, tier: 'shown'|'customer-stated'|'question', source}]; minReadTime, settleBefore, holdAfter
    // in seconds. They ride into storyboard.json, the review page and the app import untouched (same names).
    {
      id: 's1-intro',
      beat: 'hook',
      act: 'problem',
      sceneGoal: 'Where am I and why should I care',
      settleMs: 1500, // let the page settle before the screenshot
      target: 'h1', // zoom/cursor anchor; also clicked to advance unless action:'none'
      action: 'none', // 'none' = observe only; omit = click target to advance state
      zoom: 1.2,
      // Wrap exact on-screen strings (button labels, statuses, typed values) in
      // double quotes: captions tint them the literal color (default sky blue,
      // quote marks stripped) and the voice lifts them slightly. Quotes are for
      // UI literals only.
      script: 'This is the narration line - click "New thing" to start.',
    },

    // CLIP scene: real screen recording of the actions in `record`.
    {
      id: 's2-create-thing',
      media: 'clip',
      prepare: async (page) => {
        await page.goto(`${BASE}/things`); // unrecorded setup for the scene
      },
      settleMs: 1000,
      record: async (page, rec, ctx) => {
        await rec.click('a:has-text("New thing")'); // demo-paced, cursor logged
        await rec.type('input[name=name]', 'My first thing');
        await rec.pause(400);
        await rec.click('button:has-text("Create")');
        // Long waits (spinners, network) get jump-cut out of the clip:
        await rec.skipWhile(async () => {
          await page.waitForURL('**/things/**', {timeout: 30_000});
        });
        await rec.pause(1200); // let the payoff land on screen
        // Other helpers: rec.select, rec.moveTo (hover), rec.drag (sliders),
        // rec.clickPoint({x,y}) for iframe content.
      },
      after: async (page, ctx) => {
        ctx.thingUrl = page.url(); // stash values for later scenes
      },
      script: 'Creating something on camera - typing, clicks, and transitions are all real.',
    },

    // PHONE scene: renders a URL in a mobile viewport inside a phone bezel.
    {
      id: 's3-mobile',
      phone: true,
      url: (ctx) => ctx.thingUrl, // or a fixed string
      settleMs: 1000,
      durationHint: 3.5,
      script: 'And it works on a phone.',
    },
  ],
};

// PRODUCTION SAFETY, if you capture a live app:
// - never save settings/rules pages on camera; preview-only interactions
// - know which actions cost money/credits before recording them
// - stateful apps need a reset recipe so the flow is re-runnable
// - use redactScript for anything you would not show a stranger
