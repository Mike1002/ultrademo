# Building scenes in agent mode

You (the agent running the skill) write every scene yourself, look at it, fix it, and only then move on. Nothing is built blind and nothing is judged from code alone: a scene is done when its frames look right and the checks agree.

## The order

0. `node plan/learnings.mjs <project>`: the learnings the user kept from earlier videos for this brand (cast, spoken names, review lessons). Follow each one in every scene unless the brief says otherwise.
1. `node plan/production/scene.mjs prepare <project>`: copies the assets, asks you for the kit (a designer task in `<project>/tasks/`; answer it and run again), and writes one brief per scene in `production/briefs/`.
2. For each scene, in video order:
   1. Read its brief and open every asset it lists. For a product screenshot, open it at full size and crop the parts you will point at.
   2. Write `production/scenes/<id>.html`.
   3. `node plan/production/scene.mjs build <project> <id>`: builds the frame, saves stills at eight times and a strip, and measures every labelled element every 0.1 s for overlaps and edge crowding.
   4. Look: open the strip, then the full-size still of every moment that matters (each entrance, each highlight, the end). Fix what is wrong and build again. Repeat until the stills look right and the overlap check is clean.
   5. `node plan/production/scene.mjs check <project> <id>`: lint, the renderer's check, a real render, the composition checks and the scene checks. A hard failure goes back to step 4.
   6. `node plan/production/scene.mjs joins <project> <id>`: the join with each neighbour that exists. Ghosting or an empty stretch goes back to step 4 (on either side of the join).
   7. Write one line per round in `production/loop-log.md` (what you saw, what you changed).
3. `node plan/production/scene.mjs joins <project>` for every join, then `node plan/production/scene.mjs whole <project>`: the one full render with the music bed, and `out/joins.jpg`, a sheet of stills 0.15 s either side of every join. Look at the sheet: if many joins show near-empty frames, the rhythm is off (see Timing) and the fix goes into the scenes, not the joins.
4. `node plan/production/scene.mjs status <project>` at any time.

Stop rule: six fix rounds on one scene without a clean look means the design of the scene is wrong. Rebuild it from its brief on the grid rather than patch it again, and say so in the loop log.

## Vertical

The frame is `plan.video.format`: 1920×1080, or 1080×1920 for a vertical video (the brief's Format: Vertical, or a mobile app). Every check, still and render follows it; the brief of each scene names it.

- **Vertical only:** build the project as usual on 1080×1920.
- **Both:** finish the landscape video first (every scene passes, every join is clean, the whole render is out). Then `node plan/production/scene.mjs vertical <project>` sets up `<project>/vertical/`: the same plan, timings, words and assets on 1080×1920. Run the same loop on that folder: `prepare` (a kit for the tall frame: start from the landscape kit, resize the type, margins and ground), then each scene written again for the tall frame (read the landscape scene beside it; keep its timings, words, claims, numbers and sound cues; change only the layout and the moves), build, look, fix, check, joins, and `whole` on the vertical folder: it takes the landscape soundtrack and copies the result to `<project>/out/video-vertical.mp4`, where the review page shows it beside the landscape video.
- The tall frame, in short: stack instead of side by side; the headline in the top third, the product below at full width; type larger (headlines 96–140 px, body 40–48 px); margins 72 px left and right, 160 px at the top; the bottom 20% and the right 120 px free of anything that must be read (the platform's buttons sit there). Show a wide product screen by lifting its parts at full width one after another, never by shrinking the whole screen.

## Thumbnail

The user picks the thumbnail on the refine page (`plan.direction.thumbnail`: layout, title, line, intro). The whole render makes it in every size by itself (`out/thumbnails/`: 1280×720, 1080×1080, 1200×630, and 1080×1920 with a vertical version; `node plan/thumbnail/render.mjs <project>` makes them again). When `intro` is on, `prepare` writes `assets/thumbnail-intro.png` at the video's frame and the first scene's brief says to open on it: show it full frame for about 1.5 s, then move into the scene without a hard cut. Look at the thumbnails with the joins sheet.

## Social cuts

When the brief asks for one (`video.intake.cut`: 15 or 30), make it after the video (and its vertical version). Pick the scenes, in order: the hook first (it must land in the first second), the reveal, for 30 s one or two proofs, and the call to action last. `node plan/production/scene.mjs cut <project> <15|30> <scene>,<scene>,...` sets up `<project>/cut-<n>/`: the plan with the lengths scaled to fit, vertical when the video has a vertical version, no narration (the on-screen words carry it), the source scenes' code and sound cues as the start. Retime each scene's code to its new length (shorter holds, quicker moves; the same words, claims and numbers), then the same loop on that folder (build, look, check, joins) and `whole`: it is mixed with the music and effects and copied to `<project>/out/cut-<n>.mp4`, where the review page lists it.

## Tutorials

A tutorial follows the confirmed outline (`plan.video.intake.outline`): one step scene per step, in its order, with an optional opening and closing. Each step's brief says its number, what happens, whether its data change may be performed, and the motion level.

- **Capture each step's states, not a recording.** For every step: the screen before the click, after it, and any field filled in, as full screenshots at 2× (`deviceScaleFactor: 2`), saved as `assets/steps/<NN>-before.png`, `<NN>-after.png`. Retry one step at a time; loading never goes on screen. Where the screens come from follows the brief: the signed-in product, HTML mockups (open them in the browser and click through their states), Figma, or the user's screenshots.
  - Signed in with the user's own browser: through the browser extension, in their session. These screenshots include the mouse pointer, a still copy that would sit beside the scene's own cursor. After capturing, run `node plan/production/uncursor.mjs <project>` (from `assets/steps/` to `assets/clean/`; `--from`, `--to` for other folders), open `assets/clean/uncursor-sheet.png` and look at every patch, and use the copies in `assets/clean/` in the scenes. A capture it lists as kept still shows the pointer: show it only while that spot is covered (the drawn cursor resting on it, a typed field or a cut-out from another capture over it), or not at all. Clicks are always shown by the scene's drawn cursor, ring and zoom, never by a pointer in a screenshot.
  - A demo account: a short Playwright script that signs in with `signIn()` from `plan/outline/signin.mjs` (it reads `<project>/.env` itself; never read, print or type the password yourself), then opens each step's address and captures it.
  - **Changing data:** perform a step's change only when `mayChange(plan, i)` in `plan/outline/outline.mjs` says so, and only what the outline lists. Otherwise build the after state from the before state and the product's own components. Never delete or send anything.
- **The step scene.** The full screen in its window; the cursor travels to the target and clicks (a ring) or types (a rebuilt field filling in `renderAt`); the part that changes lifts forward a little (never crop the screen); the after state settles; the caption is the headline, "Step 2 · Click Invite", in the headline band, and stays readable through the scene. Mark the click for the check (`data-click`, `data-click-at`, `data-cursor`): the cursor's tip is on the target at that moment.
- **Hold to be followed.** Each step gives the caption time to be read, the click time to be seen and the result time to register; the pace targets for tutorials allow longer holds than a launch (they follow the motion level). Never rush a step to meet the length.
- **Motion between scenes** (the brief says which):
  - None: the scene transitions only (match, crossfade, zoom-through); the camera does not move; still the cursor, the click ring and the target zoom.
  - Minimal (default): the camera glides from the last step's target to this one, so start the stage where the previous scene ended; the cursor carries across the cut from its last position (record it in `carry`); the step number counts or slides in.
  - Full: as Minimal, plus interstitials (a kinetic title card naming the next section, a lifted UI part, a small animated diagram) as their own short scenes from the motion library, in the direction's style.
- **Chapters** (a video past five minutes): build and check one chapter at a time, in order, then the joins and the whole video; `node plan/production/scene.mjs chapters <project>` cuts each chapter out of the finished video as its own file.

## The scene file

- A `<style>`, the `<div id="root" data-composition-id="<id>" data-width="1920" data-height="1080" data-duration="<plan duration>">`, and one `<script>`. No `<template>`: the build wraps it and inlines the kit.
- Prefix every id and class with the scene (`s07-…`) so scenes never collide on one page.
- One paused GSAP timeline, registered as `window.__timelines["<id>"]`. Seek-safe only: no CSS transitions or keyframe animations, no `Math.random`, no `Date`, no timers. Particles and waveforms are derived from their index.
- Anything computed per frame (counters, typing, bars, meters, waveforms) goes in one `renderAt(t)` called from a proxy tween's `onUpdate` over the whole duration **and** from a `tl.render` override, so any seek lands on the right value. Call `renderAt(0)` once at load.
- Set start states with `tl.set(..., 0)`. A later tween on a property something else already animates uses `immediateRender: false`, or its start value shows on frame 0 (a ring visible before it should be).
- The kit gives the ground (`.ground`, `.ground__pool--blue|teal`, `.ground__grid`, `.ground__grain`), the fonts and the tokens. Use the palette's values; never a colour the direction does not have.

## The grid and the ground

- 1920×1080. Margins 112 px left and right; nothing labelled within 40 px of any edge (the check measures it, including mid-move).
- The headline band sits top-left at x 112, y 96–110, at or above the direction's headline size (72 px minimum, usually 84–110). Two full-width lines; never a narrow box that wraps a line early or leaves one word hanging. A third line means the type is too big for the band: shorten nothing, set it smaller.
- The body sits below, from about y 320 to at most y 1010. Centre only what the layout says to centre, and then centre it to the pixel.
- Every scene has the same ground: the same pool placement (blue top-right at `top:-520px; right:-300px`, teal bottom-left at `bottom:-560px; left:-420px`, unless the direction sets others), outside the camera stage so it does not scale. That is what lets a scene clear to the ground and the next build from it without a jump.
- The camera is a slow push on the stage, at most 1.04 over the scene. When a scene follows a match cut from a pushed scene, start the stage at the scale the previous one ended on.

## Product visuals

- Never zoom or crop a screenshot so the frame cuts through the UI (half a sidebar, a cut-off card): it looks unprofessional. Keep the full screenshot on screen and **lift the part out**: an enlarged copy cut from the full-resolution capture, starting exactly over its source, floating forward with a soft shadow while the window dims, then settling back. This is how the products' own videos do it. Capture at 2× or more so a lifted copy stays sharp at 1.5–2×.
- A lifted part comes alive (review 2, 2026-11-01): rebuild it in HTML at the capture's layout pixels, with the product's own strings, colours and example values, and animate it while it is lifted (a gauge draws and counts, rows slide in, a chip is picked, a button is pressed, cards land one by one). Size it in layout px with `transform-origin: 0 0`, start it at the screenshot's display factor exactly over its source, lift it to about 1.0–1.3 of layout size, end every animation in the screenshot's state before it settles back. No `will-change` on a lifted part (it would rasterise small and blur when scaled). A still copy of the pixels is the fallback when the part cannot be rebuilt faithfully. A lifted part may cover only its own window: lift a subset (five of six calendar columns) rather than spill over another element.
- A captured screenshot keeps its own shape. Size the window to the image, or fill it with `object-fit: cover` (from the top, `object-position: 50% 0`), so there is never an empty band in a product window. When a page ends in blank space, zoom it slightly from the top.
- Callouts point at measured parts. Open the screenshot at full resolution, crop the part, read its box in the image's own pixels, and scale by displayed width ÷ natural width (plus the window bar's height). Write the source boxes in a comment at the top of the style.
- A callout is an outline drawn on the measured part with a label chip beside it (inside the window, over dark or empty UI, never over a face or key text). Never a line ending in empty space, never a line that runs off the frame.
- A rebuilt element over a screenshot (a meter that climbs, a number that counts) sits exactly on the product's own element, at its measured box, so it reads as the product moving, not as a second copy.
- A grid of rebuilt panels is one product surface: wrap it in one element with `data-product="1"`.

## Truth on screen

- Words and numbers come from the plan: the headline, the content lines, the numbers with their citations, the product's own labels in its screenshots. Example data inside the product UI is yours to write: plausible names, amounts and dates, one consistent story across scenes, no lorem ipsum. Claims in the headline or voice are not: no "Built in", platform names nobody cited or a rating the site does not state; an unsourced claim goes in the assumptions for the user.
- The brief's story fields (`video.claim`, `viewer`, `pain_point`, `proof_moment`) are notes to write from; `video.cta` and `video.intake.exact` (tagline, lines) appear on screen exactly as written. `video.intake.effects` sets the effects for the whole video: `lively` (the catalogue's effects where the story has a moment), `subtle` (the subtle level, fewer of them), `none` (interface sounds only, no effect visuals).
- The logo is the `logo` source (from the brief: captured from the site or given by the user); never redraw it. `plan.direction.logo_motion` is how it arrives in the reveal and the close: `fade-rise` (opacity 0→1 and 14 px up, 0.6 s, ease-out), `scale-pop` (0.5→1.08→1, back.out), `mark-then-name` (clip from the left: the mark first, a beat, then the name), `wipe-bar` (a brand-colour bar sweeps left to right and the logo is revealed behind it), `flash-reveal` (a frame-wide flash of the brand colour, then the logo settles from 1.04), `glint` (the logo fades in, a light band sweeps across), `none` (a cut).
- The cast is `plan.direction.cast` (names and roles, set or edited on the refine page): use exactly those names in those roles; invent a new person only for a role the cast does not cover, and add them to the cast note in the loop log.
- People on screen: one name keeps one role across the whole video (the referring employee is never shown as a recipient or a candidate); no person appears twice in one list unless the row says why; whose screen it is stays clear (a chat shows the other person's name at the top, the phone owner's messages on the right). Example numbers add up across scenes (a funnel's first stage matches the referral count; per-person counts look real). A statistic from a commercial or competitor source is used without naming the source on screen, and a best case is framed as one.
- A counter climbs to a cited number and may pass lower values on the way. Do not show a placeholder value (`$0.0M`) before the count starts: start the count when its text appears.

## Story inside a scene

- The cursor lands on what it presses (its tip inside the button at the press time) and is drawn above everything, dialogs included (give it the highest z-index in the scene). Look at the press frame, not just the strip.
- The video ends on its last frame in full colour: no fade to the ground at the end.
- An event gets its effect from the effects library (D-78, `plan/production/effects/`): money for paid or earned, confetti for hired or approved, a check for done, a shield for security, an erase sweep for deletion, and the rest of `catalogue.json`. Call `UDFX.play(tl, name, {in, target, at})` and add the catalogue's sound to the cues at the same time; never hand-write an effect a catalogue entry covers. Use the video's level (lively, subtle or none).
- Show growth as a chart rather than a number in the headline; a chart starts at 0% unless the data is real. Size an app window to its content: no empty half windows.

- Progress, never return. An opening that states, then illustrates, then asks, then answers moves forward one idea per beat; cutting back to a frame already shown (to add a highlight) reads as a detour. When the hook has a statement and a question, give them separate beats (or scenes): statement with its illustration, then the question on its own, then the answer.

## Timing and rhythm

- The main content arrives within the first 0.35 s: the headline starts by 0.05 s and the body by 0.35 s. A scene that shows only its first headline word for half a second, after another scene that cleared, reads as a dip.
- Balance from the start: when several cards or windows make up the body, bring them in together (dimmed if they wait their turn) and light them in sequence. One card alone on one side for a second fails the balance check, and it should.
- One focal action at a time. In a grid, guide the eye: the active card lifts and lights, the others dim to about half; the highlight hops between cards (fade out, move, fade in), never glides, because a paused frame mid-glide shows an outline between two cards.
- The headline stays readable (opacity 0.4 or more) to the end of each read window, less 0.1 s; the brief lists the windows.
- Exits sit in the last 0.3 s: the body first, the headline last and fast (0.08–0.12 s, words staggered by a few ms). The last scene fades to the ground in its last 0.25 s.
- Copy that fades between two states should not linger: a toast that has been read leaves before the next element lands in its space.

## Voice and sound

- Narration: the scene's `voice` line in `plan.json`, and `production/narration.json` as `[{scene, at, text, say?}]`. `say` is the spoken form when a name trips the voice ("Loo-me-oh" for a brand spelled Lumio, "Loo-me-oh dot A I" for lumio.ai); check the analyser's transcript for the brand name after the first render. `node --env-file-if-exists=.env plan/production/voiceover.mjs <project>` voices, caches (a line is paid for once), normalises every line to -16 LUFS and reports a line that overruns its scene; lengthen the scene or shorten the line, never squeeze the voice.
- Speak to the buyer: in a video for one audience (recruiters), the other roles are in the third person ("the candidate gets an email and decides"). Name the benefit, not only the mechanism ("…are deleted. Their privacy comes first."). When the product's flow is not on the site, check it with the user before writing the line.
- Lines follow the narration rules: never the headline's words, a human read-aloud pass, a closing line that lands on something concrete.
- Never open a sentence with the product's name: voices stress a sentence-initial name wrongly (a brand name at the start of a sentence often comes out wrong), and the audio model cannot hear the difference, so the check is in the writing. Put a word before it ("Meet Lumio.", "With Lumio, …"); `voiceover.mjs` warns about any line that does.
- Sound effects: every scene gets `production/scenes/<id>.cues.json`, `[{sfx, at, gain, dur?}]`, timed to its own tweens. rules from review 3:
  - A sound only for something the viewer sees happen: no sound on a scene's entrance or exit (the first 0.15 s, the last 0.3 s), so nothing plays on a cut by itself.
  - Every visible click or press gets `mouse-click` (a low `press` alone is not heard). Typing gets the `typing` take cut to the typing with `dur`. A card, row or chip that lands gets `pop` (a quick run for a sequence), small ones `pop-high`; a counter ticks; a lift gets `whoosh`.
  - Emotion where the story has it: `aww-crowd` on a let-down (the brand missing, a drop), `gasp-crowd` on a surprising number, `sparkle` + `cheer-small` on a win with sparkles on screen, `confetti` on a milestone, `level-up` on the tagline or a goal reached, `phone-call` under a call feature (a background sound: it plays at gain 0.4, thinner and a little roomy, like a sample recording, and the buried check skips it; keep it under the narration, never raise it to compete: the measured reference is one caller line, about 2.7 s, thin phone line, under the music, cut in and out, shown with a call card, a running timer and a waveform). Draw the sparkles or confetti too: the sound follows a picture.
  - Pick from `scaffold/sfx/library.json` by situation. A sound the library lacks is generated with `scripts/sfx-generate.mjs --takes 2 <id>` (ElevenLabs), each take checked blind (an audio model asked "what do you hear?" without being told, when one is set up; otherwise the user listens) and kept with `--pick` only when it is what its name says; failed takes stay out.
  - After the whole render, `whole.mjs` lists any effect buried under the music and voice (`production/look/sfx.json`): raise its gain until it clears 6 dB (3 dB while the voice speaks; the effects dip under the voice so they never mask a word). Then the listening check (you cannot hear audio): `node --env-file-if-exists=.env plan/production/transcribe.mjs <project>` transcribes the video with ElevenLabs speech-to-text (the user's key) and writes `production/look/transcript.md`, each script line beside what was heard; read it, and fix every misheard product name (a `say` spelling) and every line under 80%. Without a key it says so: ask the user to listen for the name.

## Joins

- Default: a **match** cut. The scene clears to the ground in its last 0.3 s and the next builds from the same ground. Set `transition_in: "match"` on the next scene in `plan.json`.
- A straight **cut** when both sides are full at the boundary (a headline into a number): no exit needed, the change is the beat.
- A **crossfade** only when the two layouts share no regions; otherwise the outgoing headline ghosts under the incoming one. Shader transitions stay off (`ULTRADEMO_SHADERS` unset).
- Record what continues honestly in the scene's `carry` (for a match cut: the ground and its glows).

## Markers the checks read

| Marker | On | Why |
|---|---|---|
| `data-look="name"` | every element whose overlap matters: headline, cards, chips, toasts, product window, counters | the overlap and edge check. Put it on the visible content box, not a full-width wrapper (a `left:0; right:0` box reads as touching both edges). |
| `data-shape="1"` | drawn graphics with no text: meter fills, progress bars, selection frames, outline boxes, window bars, placeholder blocks | otherwise they read as empty boxes |
| `data-product="1"` | the wrapper of a rebuilt product made of several panels or rows | the product-width check measures the surface, not one panel |
| `data-decor="1"` | glows, rings, ripples, cursors, dimming layers, decorative lines | left out of the composition checks |
| `data-brand="1"` | logos and wordmarks | allowed near edges, not counted as content |

## What to look for in every strip

Overlaps and ghosts; outlines or lines pointing at nothing; empty boxes and empty bands; text squeezed, wrapped early or ragged; text too small to read (under about 20 px, product screenshots aside); anything crowding an edge; a paused mid-move frame that looks like a mistake; an empty or near-empty first frame; a hold over a second with nothing moving; a placeholder value; a start value showing on frame 0.

## When a check disagrees with your eyes

Change the scene, unless the check is plainly misreading the frame (a drawn shape read as an empty box, a full-width wrapper read as edge crowding, a layout word read as an instruction). Then use the right marker, or describe the layout honestly in the plan. Fix a checker only when the misreading is general, add a test for it, and note it in the loop log. Never change a claim, a number or a citation to pass a check.
