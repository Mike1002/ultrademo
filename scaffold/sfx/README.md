# Sound effects

The library (`library.json`, 21 sounds): twelve UI sounds synthesised with ffmpeg by `scripts/sfx-make.mjs` (key-1, key-2, key-3, click, press, pop, pop-high, whoosh, chime, warn, notice, tick; the licence is ours), and nine generated with ElevenLabs by `scripts/sfx-generate.mjs` (aww-crowd, gasp-crowd, cheer-small, sparkle, confetti, level-up, mouse-click, typing, phone-call; ElevenLabs output, commercial use on paid plans). Each generated sound was checked blind by an audio model before it went in; takes that did not sound like their name (a bubble pop, an air whoosh) were left out, and the synthesised pop and whoosh stand in.

A scene lists its cues in `production/scenes/<id>.cues.json` as `[{ "sfx": id, "at": seconds into the scene, "gain": 1 }]`. `plan/production/whole.mjs` places them on the timeline and `audio.mjs` mixes them on their own bus (`sfxLevel` 0.7), dipping about 4 dB while the voice speaks; `whole.mjs` writes the pre-master stems and reports any effect that is buried. A project can override or add a sound with `<project>/sfx/<id>.wav`.

Adding a sound: add a recipe to `sfx-make.mjs` if it can be synthesised well; otherwise add a prompt to `sfx-generate.mjs`, generate takes (`--takes 2 <id>`), check them by ear or blind with the audio model, and `--pick <id> <k>`; or take it from a licence-clean source and add its entry by hand with source and licence. Nothing goes in unlisted.

The reaction layer (human reactions cued to narration words, Approach v2) is reserved: `storyboard.reaction` is carried through untouched and not rendered until a source of reaction footage exists.
