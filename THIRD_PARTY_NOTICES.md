# Third-party notices

Ultrademo, a brand by ReferScout Inc., is released under the Apache License 2.0 (`scaffold/LICENSE`). It builds on the work below; each keeps its own licence.

## HyperFrames, by HeyGen, Inc.: Apache License 2.0
The renderer (the `hyperframes` and `@hyperframes/shader-transitions` npm packages). The shot blueprints in `research/motion-craft/2026-10-13-hyperframes-skills/`, and the rule set and presets that some motion styles and video styles adapt, come from the HyperFrames skills; they were reworded, re-rendered and adapted to Ultrademo's look. The licence text is in `research/motion-craft/2026-10-13-hyperframes-skills/LICENSE`.

## FrameJam, by Moritz Kremb: MIT License
Several video styles are adapted from FrameJam presets (palettes, type, rhythm, transitions), re-rendered on Ultrademo's own strip.

```
MIT License

Copyright (c) 2026 Moritz Kremb

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## awesome-ai-motion, by gongnyang: MIT License
Many motion styles re-implement techniques from this library, rebuilt to be seek-safe and rendered in Ultrademo's look.

```
MIT License

Copyright (c) 2026 gongnyang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Third-party files bundled in lib/ keep their own licenses. See ATTRIBUTIONS.md.
```

## GSAP, by GreenSock
`gsap.min.js` is bundled for the galleries and copied into each project, under GSAP's standard licence (the terms are in the file's header and at https://gsap.com/standard-license).

## Fonts: SIL Open Font License 1.1
The gallery fonts are listed with their sources in `research/motion-craft/video-style-gallery/_fonts/LICENCES.md`; the page fonts in `scaffold/plan/ui/fonts/FONTS.md`.

## Music: CC0
Every track is CC0 (public domain dedication): free to use commercially, no credit needed. Each track's creator and source: `scaffold/music/ATTRIBUTION.md`.

## Sound effects and voice samples
Twelve sounds are made with ffmpeg by `scaffold/scripts/sfx-make.mjs` (ours). The other sounds and the voice samples were generated with ElevenLabs.

## npm packages
playwright (Apache-2.0), zod (MIT) and the HyperFrames packages above, installed by `npm run setup`.
