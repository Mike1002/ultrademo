# plan/ — the video plan

The **video plan** (`plan.json`) is the one file every page reads and writes for a video: the brief, the chosen direction, and one block per scene with the story side, the shot side and the user's fields (layout, content, numbers with sources, font, mood, camera, sound, what continues, reading time). It is the source of truth; HyperFrames' `STORYBOARD.md` and `frame.md` are generated from it and never authored by hand. The file is JSON because the scaffold has no YAML parser and pages, not people, edit it.

Field names inside the file are the working terms (beat, scene, blueprint, rule, dials). Every message a person sees goes through `vocabulary.mjs`, which maps them to the plain words of D-55 (moment, shot blueprint, motion style, direction settings, needs your confirmation, what continues, reading time).

## Files

| File | What it does |
|---|---|
| `schema.mjs` | The zod 4 schema (`PlanSchema`) with every vocabulary as an exported constant (`TEMPLATES`, `BEATS`, `HOOK_ANGLES`, `HOOK_ROUTES`, `SOURCE_KINDS`, `CLAIM_TIERS`, `VISUAL_KINDS`, `TRANSITIONS`, `DIALS`, `TYPE_ROLES`) and JSDoc typedefs (`Plan`, `Video`, `Direction`, `Scene`, …) so editors show hints. `parsePlan(obj)` applies defaults and returns issues with dotted paths. |
| `validate.mjs` | `node plan/validate.mjs <plan.json> [--against <previous.json>] [--json]`. Schema first, then the rules below. One plain line per problem: scene id, what is wrong, how to fix. Exit 0 when nothing fails; notes never fail. |
| `to-storyboard.mjs` | `node plan/to-storyboard.mjs <plan.json> <out-dir>`. Validates, then writes `STORYBOARD.md` and `frame.md` in the shapes HyperFrames' assembler and frame packets read. Refuses an invalid plan and writes nothing. |
| `catalogue.mjs` | Read-only lookups: motion-style ids from `research/motion-craft/motion-gallery/index.json`, shot-blueprint ids from the HyperFrames `blueprints-index.md` plus our two (`ui-element-morph-cycle`, `object-role-relay`, D-49), video-style ids from `research/motion-craft/video-style-gallery/index.json`. Root is found from this folder or `ULTRADEMO_ROOT`. |
| `vocabulary.mjs` | Working term → the word the user sees. |

Run everything from `scaffold/` (zod resolves from `scaffold/node_modules`): `node --test plan/test.mjs`.

## The three blocks

**`video`** (the brief; written by the intake page): product, url, template (one of nine), viewer, claim (seven words or fewer), pain_point, proof_moment, cta, length_s, narration (voice · music-only · hybrid), autonomy (review · director; the user sees review mode · auto mode), copy.register (factual · balanced · bold; the user sees tone), reference, sources[] (id, kind, path, what), claims[] (id, text, tier, cite). Optional storyboard extras: format, fps, captions, message, arc.

**`direction`** (the look; written by the direction page): chosen, name, mood, canvas (light · dark), palette (roles → values; ground, ink and accent are required), type (display · text · mono, each a family or an object with weight, file and sizes), energy, pace_band, camera, signature_move, music, voice, close (product · logo · both), hook (angle from thirteen, route from five), sketches, banned[], dials (the eleven direction settings), video_style. Optional design-system prose for `frame.md`: ground, motion_grammar, rhythm, components[], composition_rules[], transition_overlap_s.

**`scenes[]`** (one animated page each): id (also the composition file name), name (the frame heading), beat, role, persuasion, goal, caption, start_s, duration_s, transition_in, layout, content[], copy {headline, accent, sub, words_max}, numbers[] {value, cite}, voice, sources[], claims[], visuals[] {ref, kind captured · rebuilt · illustration, exists[], role, focal, note}, blueprint (an id or "composed"), blueprint_posture, blueprint_note, focal {ref, note}, rules[], font (keyed by the direction's type roles), mood, camera, motion[] {from_s, to_s, what}, sound {cue, sfx[]}, hold_s, carry {element, action}, reads[] {from_s, to_s, what}, cue[] {at_s, what}, checks[], style_tags[], status (planned · sketched · built · approved · fix), measured, review {verdict, note}.

## Who reads and writes what

| Page | Reads | Writes |
|---|---|---|
| Intake | template defaults | `video.*` |
| Direction | `video.*`, the claims, the sources, the measured reference | `direction.*`, the sketches, `scenes[].copy.words_max` |
| Production (designer pass, then frame builders) | all of it; `to-storyboard.mjs` hands HyperFrames its storyboard and `frame.md` | `scenes[].status = built`, the frame files |
| Checks | the renders | `scenes[].measured` |
| Review | all of it, the renders, the measurements | `scenes[].review`, `status = approved` or `fix` |

## The rules, in plain language

1. **Claims cite something; example data does not**. Each entry in `numbers[]` names a claim or a source id that exists. Numbers inside a product part (`data-product`) are example data and need no entry; a number in the copy with no source is a warning listed for the user.
2. **A claim that needs your confirmation keeps its scene.** The scene is reported as unconfirmed (a note, not a failure) and cannot be approved until the claim gets a tier and a citation. A claim that is seen in the product or stated on the site must carry its citation.
3. **Motion covers the whole scene.** The time-ranged `motion[]` lines start at 0, reach the scene's duration and leave no gap. Lines may overlap. A gap is a dead pause and fails before anything is built. The readable pause at the end is itself a motion line ("hold").
4. **Copy stays under its cap.** Words in headline plus sub (punctuation-only tokens such as `·` do not count) are at most `words_max`.
5. **Look comes from the direction block.** A scene has no palette or canvas keys (the schema rejects them), its `font` keys are the direction's type roles (display, text, mono), and its text never names a colour by value; it names the palette role.
6. **Blueprints and motion styles exist.** `blueprint` is an id from HyperFrames' index, one of ours, or "composed" (then `rules[]` must not be empty). Every id in `rules[]` is in the motion gallery. An inline `(→ id)` in a motion line that is not in `rules[]` is a note, so the frame packet can inline its recipe.
7. **A video style exists** in the video-style gallery when `direction.video_style` is set.
8. **Three kinds of visual**. A captured visual points at a real capture (screenshot, recording, site-image, logo, footage). An illustration lists `exists[]` ids that resolve and never carries a number: a scene whose only visuals are illustrations may not have `numbers[]`.
9. **The opening scene carries the hook**: `scenes[0].beat` is `hook`, and the direction block states the opening hook and how it lands.
10. **What continues.** Every scene but the last has `carry`; a carry on the last scene is a note.
11. **Time adds up.** Scenes are contiguous (each starts where the previous ends, within 0.05 s) and their durations sum to `video.length_s` within 0.3 s.
12. **Voice.** A music-only video has no voice lines, and a voice line never repeats the headline.
13. **Built scenes freeze.** With `--against <previous.json>`, a scene that was built, approved or fix in the previous copy may change only `measured`, `review` and `status`; a built scene may not be removed. Without `--against` this rule cannot run, since a single file holds no history.

## What the generator writes

`STORYBOARD.md`: frontmatter (`title`, `format`, `fps`, `duration`, `arc`, `message`, `music`, `captions`), the title, a Source line built from the brief, a `## Video direction` block (Palette, Type, Motion grammar, Rhythm, Real vs recreated, Negative list from `banned[]`, Transitions, Signature move, Hook), then one `## Frame N — Name` per scene with `scene`, `voiceover`, `duration`, `transition_in`, `status`, `src`, `type` (from `role`), `persuasion`, `beat` (from `mood`, HyperFrames' emotional beat), `blueprint` (with the posture, or `compose`), `focal` (the focal visual's source path, or none with a note), `roles` (from visuals with a role), `sfx` when any, an `Adapt:` line from `blueprint_note`, and the `Scene N (a–bs): …` lines from `motion[]` in time order. Status maps planned and sketched → `outline`, built, approved and fix → `animated`.

`frame.md`: palette by role, type with `@font-face` when files are given and a size table, components, motion grammar, composition rules, the negative list, and the direction settings line.

## Deliberately not in v1 of this module

- No pages. The intake, direction and review pages that write the file come later; this is the file, its checks and its export.
- No reverse import (`STORYBOARD.md` → `plan.json`). The storyboard is an output only.
- No `SCRIPT.md` for narration; HyperFrames' TTS step owns it. `scenes[].voice` is the guide line only.
- No measurement, rubric or frame checks; they fill `measured` and are separate scripts.
- No history inside the file. Rule 13 needs a previous copy on disk; a lock hash per built scene is a possible later addition.
- No check that an illustration's `exists[]` proves the right thing, or that copy stays in register: those are review-page judgements, not file rules.
- No social or ad cuts replacing the opening hook: one video, one hook, for now.
- Our two shot blueprints are a list in `catalogue.mjs` until the gallery carries them.
