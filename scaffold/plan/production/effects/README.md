# Effects

- `effects.js`: the visuals. `UDFX.play(tl, name, opts)` draws the effect on the scene's own GSAP timeline, so it renders frame by frame and seeks correctly; nothing is random.
- `catalogue.json`: the 25 effects in five groups (Celebrate, Reactions, Status, Movement, Interface), each with its event, when to use it and its sound (an id in `sfx/library.json`). Sparkle is a burst of stars; the stamp reads "Approved" unless given a `label` (`cited` still works as its old name); the reactions are thumbs up, hearts, high five and smiley; click and typing cover the cursor pressing a button and text typed into a field; the sound wave plays under any audio moment (a call, a voice, a recording), behind a card with `behind: true`, for `dur` seconds (the audio's length).
- `gallery.html`: every effect looping on a small sample from Ultrademo itself, with its sound to press and a Lively / Subtle switch. Rebuild with `node plan/production/effects/gallery.mjs`; open it as a file.

## In a scene

```js
// the money effect where the payout turns Paid (3.2 s), drawn inside the close-up layer
UDFX.play(tl, 'money', { in: document.getElementById('s09-cuw'), target: document.querySelector('#s09-cuw .s09-chip'), at: 3.22 });
```

The build inlines `effects.js` into any frame that calls `UDFX.play` (`finishFrame` in `frames.mjs`), once; nothing else is needed. Add the effect's sound to the scene's `.cues.json` at the same time (the catalogue names it). Options: `in` (required), `at`, `target` or `x`/`y`, `to` (pulse, send), `w`/`h` (erase, glint), `size`, `level` (`lively` or `subtle`), `label` and `color` (the stamp), `colors` (the sparkle burst), `count` (stars, bell), `hold`, `hide` (erase also fades the target), `cursor` (click draws the pointer arriving), `text` and `cps` (typing), `dur`, `w`, `h`, `color` and `behind` (sound wave).

The gallery ends with "Sounds without a visual": every library sound no effect uses (interface cues, the crowd aww and gasp, the phone call), listed from `sfx/library.json` so it stays current.

Text drawn by an effect (the $ signs, the stamp, the bell count) takes the scene's own font unless `font` is given. The gallery's samples use the brand fonts: Bricolage Grotesque for titles and numbers (`plan/ui/fonts/`, OFL), Instrument Sans for text.

The phone call is made by `node --env-file-if-exists=.env scripts/sfx-call.mjs`: a call opening read by two library voices (Kristen calls, Jesse answers as John), filtered like a phone line, fading out on the third line.

Effect sounds are fuller than the tiny interface sounds (`tick`, `pop`, `notice`), which stay for quick cues inside the product UI. Typing's sound runs 3 s: give its cue a `dur` that matches the typing.

## Adding an effect

Write `FX.<name>` in `effects.js` (deterministic, every tween on `tl`, elements created up front with `opacity:0` and `data-decor`), add a catalogue entry with an existing sound (or generate one with `scripts/sfx-generate.mjs --takes 3 <id>` and pick it after a blind listening check), rebuild the gallery, and run `node --test plan/production/test.mjs` (the effects test checks every catalogue entry has its code and its sound).
