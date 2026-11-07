# Skill page styles

The pages the skill shows the user (intake, direction, auditions, review) take their look from the Ultrademo design system: its style guide, Flow variant, light and dark.

- `tokens.json` is a copy of the guide's tokens. After the guide changes, copy it again and run `node plan/ui/build.mjs`, which writes `ui.css` (fonts, colour, space, radius and shadow tokens, and the shared pieces).
- Pages link `/ui/ui.css`; each skill server serves this folder at `/ui/` (only `ui.css`, `fonts/*.ttf`, `logos/*.svg`).
- `fonts/`: Unbounded (headings, 28 px and up only), Instrument Sans (text), JetBrains Mono (eyebrows, commands, file names). All three are under the SIL Open Font License 1.1, which allows bundling with software.
- `logos/`: the horizontal lockup and the icon, `flow-light` on light grounds and `flow-dark` on ink. Never retype the wordmark.

Rules from the guide that the pages follow: one lime primary action per screen; pink only for points (eyebrow dots, the play triangle); hard offset shadows, one per view; pill buttons and chips; 22 px corners on cards and frames; a 3 px focus ring.

Pages on the design system (2026-11-01): intake and brief-saved, the direction pages (style, direction, refine, confirmed), the voice audition page and the review page (`plan/review/`). Served pages link `/ui/ui.css` and use `UD_HEAD` from `plan/intake/page.mjs`; pages opened as files (auditions) inline the stylesheet with `inline.mjs`.
