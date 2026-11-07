# plan/intake/ — the intake page

The intake page collects the brief in the user's words and writes the `video` block of `plan.json` (`plan/schema.mjs`), plus a few intake-only fields under `video.intake`. The direction step reads the file next. The page uses plain words only, says "video" and never "film", names no competitor, and shows no field name.

## Run

From `scaffold/`:

```
node --env-file-if-exists=.env plan/intake/serve.mjs <project-dir> [--port 4321]   # the env file only tells the page an ElevenLabs key exists
```

It prints the URL (`http://127.0.0.1:4321/`), serves the page, and writes `<project-dir>/plan.json` when the brief is saved. The server binds to 127.0.0.1 only, carries no dependency, loads no external asset (the template thumbnails come from `assets/` on this server at `GET /assets/…`, plain names and image types only), and refuses a POST whose `Origin` is another page. Stop it with Ctrl+C.

A static preview with sample values and no server: open `plan/intake/preview.html`. Rebuild it after changing the page with `node plan/intake/build-preview.mjs`.

## Files

| File | What it does |
|---|---|
| `serve.mjs` | The server and the logic: `buildVideo(brief)`, `validateVideo(video)`, `mergePlan(existing, video)`, `saveBrief(dir, brief)`, `readSite(url)`, `parseSite(html)`, `startServer({ projectDir, port })`. Routes: `GET /` (the page, prefilled from an existing plan), `GET /assets/…` (the thumbnails), `POST /api/read-site`, `POST /api/submit`, `GET /saved` (the confirmation). |
| `page.mjs` | `renderIntakePage()` and `renderSavedPage()`, the template list with descriptions and typical lengths, the plain labels, `readTemplateSources()` (the caption per template from `assets/templates/SOURCES.md`). Same light/dark tokens as `plan/to-html.mjs`; works at phone width. |
| `assets/templates/` | One 4-second GIF per template, shown as a 160-px thumbnail in its card with the caption `example: <source>`; `SOURCES.md` names the sources. Referenced relatively (`assets/templates/<id>.gif`) so `preview.html` shows them too. Lazy-loaded. |
| `build-preview.mjs` | Writes `preview.html` from the Orbit sample. |
| `preview.html` | The static preview. |

## What the page asks

Twelve sections that open one at a time: each has a Continue button, and a closed one shows what it holds in a line; a save problem opens the section it is in. A progress bar at the top shows the five stages (Brief, Direction, Production, Review, Delivery). The page opens in the browser by itself (`plan/open.mjs`; `--no-open` to skip).

1. **Your product:** the address (required) and **Read my site**, which fetches the page and fills what is still empty: the product name (the title part that spells the domain wins: "Northwind" for northwind.io) and the core message (the description as a sentence). A line under the site box says what was filled. Then the product type and name.
1b. **Your brand:** after Read my site, a real browser opens the home page (the direction step's site read, one page) and fills the logo (the home link's image, also from a CDN, or an inline SVG; SVG cleaned of scripts; kept as `assets/brand/logo.<ext>`), the colours (the logo's own vivid fill is the brand colour; never the browser's default link blue or a grey) and the fonts. The user can upload another logo (`assets/brand/logo-own.<ext>`, SVG cleaned, 5 MB) and edit every colour and font. Saved as `video.intake.brand`; the logo becomes the `logo` source; the directions start from it.
2. **Where the screens come from:** the live site or app, HTML mockups and screenshots (uploaded and checked; a mockup gets a full-page screenshot), a Figma file (paid plan).
3. **The story:** what it is (the core message), who it is for, the problem, the proof. Free text with no word limit: notes the direction step writes from. Left empty, a field is proposed (as if Unsure). The site's lines sit in a closed "Lines from your site" box; clicking one fills the field you were last in without moving the page.
4. **Exact wording:** tagline, call to action, lines that must appear; used exactly as written (`video.cta`, `video.intake.exact`).
5. **Video type:** Launch, Explainer, Spotlight or Ad, for the whole product or one feature (named), with an indicative length. The type and scope set the story spine (`template`): launch → launch; ad → ad; spotlight → feature-showcase (feature-focus for one feature); explainer → explainer (product-tour above 120 s, feature-focus for one feature).
6. **Voice and music**. 7. **How it's made:** tone and autonomy. 8. **Styles and effects:** the look in words and chips; effects lively, subtle or none. 9. **Footage:** a talking head, an avatar, live action or b-roll if the user has it. 10. **App authentication.** 11. **Reference video.** 12. **Project name.**

Every text field tells password managers (LastPass, 1Password, Bitwarden) to stay out.

## Still to add

- **D-74 and D-75 at intake:** ask whether statistics may be used and whether their source may be named (commercial sources off by default, research sources on), and collect numbers that need confirming in one list ("proceed" confirms).
- The progress bar on the direction, production and review pages.

## What it writes

`video.*` as `plan/schema.mjs` defines it: `product`, `url`, `template`, `viewer`, `claim`, `pain_point`, `proof_moment`, `cta`, `length_s`, `narration` (voice · music-only · hybrid), `autonomy` (review · director), `copy.register`, `reference` when given, `format` (`1080x1920` for a mobile app, otherwise `1920x1080`, D-59). `sources[]` and `claims[]` are not collected here; an existing plan's are carried over, otherwise they are empty.

`video.intake`, read by the direction step only:

| Key | Holds |
|---|---|
| `project_name` | the proposed or edited name |
| `product_type` | `web-app` · `mobile-app` · `website`, or `null` when Unsure |
| `voice` | `{ preference: female · male · none, source: built-in · own-account }`; present only when narration is voice or hybrid, absent otherwise. Never a key: `own-account` means the key lives in the project's env file |
| `look` | `{ words, chips[] }` (the page calls it the vibe) |
| `footage` | `{ have: none · upload · existing, files[], links[], channel, wants_recording_recipe }` |
| `sign_in` | `{ path: public · own-browser · dedicated-profile · hosted-live-view · token, token_note, browser: { chromium, label }, note? }`. Never a credential: a token path stores only how the app issues it. A website-only product defaults to `public` (an Unsure path included) and carries `note: "Website only: the capture is of the public site."`; an explicit other path is kept. |
| `site` | what "Read my site" returned: `{ title, description, headings[] }` |
| `unsure` | one entry per field left Unsure: the note the direction step reads |
| `submitted_at` | ISO time |

## What "Unsure" does

Every field but the address has it (a checkbox beside a text field, an option in a choice). An Unsure field is stored as `null`, and `video.intake.unsure.<field>` holds the note `Unsure at intake; the direction step proposes it.` followed by `Hint: …` when the user typed something anyway. The page says this once at the top, not per field. On a later visit the page prefills from the plan and shows the hint back in the field with Unsure ticked.

## Validation

The video block is checked against `VideoSchema` from `plan/schema.mjs` on a **schema view**: `intake` removed and each Unsure `null` replaced by a placeholder, because the schema is strict and its text fields require a value. Problems come back one plain line each (what, and how to fix) and nothing is written until they are clear. When the plan already holds a direction and scenes, the whole file is also run through `plan/validate.mjs` and its lines are shown on the confirmation page as notes; they never block the brief.

Until `plan/schema.mjs` accepts an `intake` key and nulls on the Unsure fields, `node plan/validate.mjs` on a fresh intake-only plan will report the strict-object and empty-scene issues; that is expected at this step and goes away once the direction step fills the fields. The change is one line in the schema (`intake: z.record(z.string(), z.unknown()).optional()` plus `.nullable()` on the Unsure fields) and is deliberately not made from here.

## Merge

An existing `plan.json` is read first. Its `direction`, `scenes[]`, and the old video block's `sources[]`, `claims[]`, `fps`, `captions`, `message` and `arc` survive; the new brief replaces the rest of `video`. Without an existing plan the file is `{ version: 1, video, scenes: [] }` with no `direction` key. A file that is not valid JSON is never overwritten: the save fails with its path. Writes go through a temp file and a rename.

## Sign-in detection

Client-side, from `navigator.userAgentData.brands` when the browser has it and the user-agent string otherwise. A Chromium-family browser (Chrome, Edge, Brave, Arc, Opera) sees the "use my own browser" path; Safari and Firefox do not, and the page says why and that the dedicated profile works for them with Chrome installed and their password manager filling into that window. The hosted live view is listed, marked "hosted app only", and cannot be chosen in the skill. The detection result is stored under `sign_in.browser` so the direction step knows what the page offered.

## Not here

No file upload (paths are listed, files are read by the direction step). No claims or source assets (the direction step pulls them from the site). No direction, no scenes. No sign-in itself: the page records the chosen path only.

## Reminder

The template thumbnails in `assets/templates/` are temporary examples cut from reference videos we measured, shown without source labels. Replace each with Ultrademo's own render for that template as the templates are proven (see `assets/templates/SOURCES.md`).

## Voices

When the video is narrated, the page shows a card per voice with a sample to play: every sample reads "Did you ship a new feature? Let Ultrademo turn your product into a launch video, ready to post." The free voices (Eve, Mary, Maria, Cori, George, Alba, Stuart, James; Mary and James recommended) always show; the ElevenLabs voices (Rachelle, Killian and six more) show when the project's env file has `ELEVENLABS_API_KEY`. The page learns only that the key exists, never its value. Female, Male or No preference filters the cards. The pick is saved as `intake.voice.id`, and its source (free or the user's own account) follows from the voice. The catalogue is `tts/voices.json`; samples are made by `node --env-file-if-exists=.env scripts/voice-samples.mjs` and served from `/voice-samples/<id>.mp3`.

## Music

The Music field offers every curated track (`music/curated.json`) with a 12-second preview (`music/samples/`, `node scripts/music-samples.mjs`, served from `/music-samples/<track>.mp3`), its mood, tempo and credit. "Let the direction choose" is the default. A picked track is saved as `intake.music.file` (only curated files are kept) and every direction uses it.

**Your own track.** The last music card, "Use my own track", takes a file the user holds a licence for. The page uploads it to the local server (`POST /api/music-upload`, same origin only, up to 60 MB, MP3/WAV/M4A/OGG/AAC/FLAC), which keeps it only if ffprobe finds an audio stream of 10 s or more, as `assets/music/own-<name>.<ext>` in the project. The brief saves `intake.music.own` `{path, title, licensed}`; the user must tick that their licence covers commercial videos. Every direction then uses it (music file `own`), the plan names it `project:assets/music/own-….mp3`, and the mix reads it from the project. Credit lines the licence asks for are the user's to add.
