# What Ultrademo needs and what it does on your machine

No Docker and no cloud account are needed; everything runs locally. `npm run check` tells you what is ready.

## Required
- **Node.js 22.12** or newer.
- **ffmpeg and ffprobe** on the PATH (audio mix, video probe, stills).
- **git**, to get the workspace and its updates.
- **npm packages** from `package.json`, pinned to exact versions with `package-lock.json` and installed with `npm ci`. Playwright downloads its Chromium once.
- **HyperFrames** renders the scenes: `hyperframes@0.8.145`, installed with the rest and run as `npx --no-install hyperframes@0.8.145` (never fetched at render time). Every call runs with its usage telemetry, update check and background self-install switched off (`HYPERFRAMES_NO_TELEMETRY`, `DO_NOT_TRACK`, `HYPERFRAMES_NO_UPDATE_CHECK`, `HYPERFRAMES_NO_AUTO_INSTALL`). It keeps its own headless Chrome in `~/.hyperframes` or `~/.cache/hyperframes`.
- **First time:** `npm run setup` checks Node, ffmpeg and disk space, runs `npm ci`, installs both browsers and creates `.env` from `.env.example` for you to fill in.

## Optional
- **ElevenLabs** for the paid voices and generated sound effects: put `ELEVENLABS_API_KEY` in `scaffold/.env` yourself. The pages only learn whether the key exists, never its value.
- **Free voices**: `npm run setup -- --voices` sets up Pocket (any CPU) and word timings in their own Python environments under `voice/.envs/`, about 1.6 GB. It needs [uv](https://docs.astral.sh/uv/). Chatterbox (`npm run voice -- setup chatterbox`, about 4 GB more) needs a GPU or Apple silicon. Without any voice set up, narration uses the computer's built-in voice as a stand-in.
- **Figma** as a source needs a paid Figma plan (the free plan's call limit stops an export part-way).

## What it runs
- Local pages on **127.0.0.1 only**, never on the network: dashboard (port 4320), brief (4321), direction (4322), review (4330), each taking the next free port when its own is busy. Plain Node `http`, no server packages. Writes are accepted only from the page itself (same origin), as JSON with size limits. Uploads are checked and capped: your own music track must be real audio (60 MB); an HTML mockup must look like a page (15 MB) and is opened once in headless Chromium for a screenshot; a screenshot must carry a PNG, JPEG or WebP signature (25 MB). Uploads are kept in the project and never served back. File routes accept plain names in fixed folders only.
- Child processes: `ffmpeg`, `ffprobe`, `npx --no-install hyperframes`, Chromium through Playwright, `git` for updates (only when you agree), and Python for the free voices.
- Network: reading the product's public site when you press "Read my site" or capture it (its logo too, from wherever the site hosts it); ElevenLabs when a paid voice or sound is generated, and for the listening check (the finished video's audio only, for speech to text); GitHub when you update; the daily update check (`plan/updates.mjs`: sends the version, plus the random install id while usage statistics are on; off with `ULTRADEMO_NO_UPDATE_CHECK=1`); and the usage statistics below. Nothing else is sent anywhere.
- **Usage statistics** (`plan/telemetry.mjs`), on by default: a fixed list of events (setup done, brief saved, direction confirmed, video rendered, comments sent, approved, a step failed). Each carries checked fields only: video type, format, autonomy, voice kind (paid, free, stand-in or none), source kinds, length, scene and comment counts, render time, an error code, plus the version, operating system, Node major version, agent name, the day, and a random install id made on this machine. Never addresses, names, brief or script text, frames, file paths, keys or error messages. Every event is also written to `.ultrademo/events.jsonl`. `npm run telemetry -- show` lists them; `npm run telemetry -- off`, `ULTRADEMO_TELEMETRY=0` or `DO_NOT_TRACK=1` switches it off.
- Files: everything is written inside the workspace (`scaffold/projects/<name>/`, `scaffold/brands/`, `scaffold/.ultrademo/` for the update check, the install id and the usage record); keys stay in the `.env` file you fill in.
