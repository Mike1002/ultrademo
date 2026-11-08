# Installing Ultrademo

About 15 minutes the first time, most of it downloads. Everything runs on your own computer.

Every route below ends in the same place: a workspace at `~/ultrademo` (the code, your videos and your key file) and a skill your agent uses to make videos in it. Pick the route that matches how you use your agent.

## Before you start

- **A Mac**, or Linux (less tested). On Windows, use WSL 2 with Ubuntu. Linux and WSL need one extra step: see [Linux and WSL](#linux-and-wsl).
- **Node.js 22.12 or newer**: the LTS installer from https://nodejs.org.
- **ffmpeg**: on a Mac, install Homebrew (https://brew.sh), then run `brew install ffmpeg` in Terminal. On Linux, use your package manager.
- **git**: on a Mac, run `git --version` once in Terminal and accept the offer to install the command line tools.
- **About 3 GB** of free disk space, plus 1.6 GB for the small set of free voices (about 6 GB for all of them).
- **A coding agent.** Claude Code is the one Ultrademo is built and tested with. It comes in three forms: the `claude` command in a terminal, the Code tab of the Claude desktop app, and the VS Code extension.

## Route A: Claude Code in a terminal

1. Install the skill for your user account, so it works from any folder:
   ```bash
   npx skills add ultrademo-hq/ultrademo -g -a claude-code
   ```
2. Start Claude Code anywhere: `claude`.
3. Ask for a video:
   > /ultrademo launch video of https://your-product.com
4. The first time, the skill checks your machine and asks before it sets up the workspace in `~/ultrademo`: it clones the repository and runs `npm run setup`. Say yes, or name another folder.
5. It then asks about voices (see [Voices](#voices)) and carries on with your video.

Next time, start Claude Code in the workspace (`cd ~/ultrademo/scaffold && claude`). The dashboard's buttons open Claude Code there.

## Route B: the Claude desktop app

The desktop app's **Code** tab runs Claude Code on your computer, with the same skills and settings as the terminal.

1. Open the Claude desktop app and go to the **Code** tab. Start a local session.
2. Choose any folder with the project folder control next to the prompt box (your home folder is fine), and send:
   > Set up Ultrademo from https://github.com/ultrademo-hq/ultrademo: clone it into ~/ultrademo and run npm run setup in its scaffold folder.

   Claude asks before it runs each command. Setup takes about 10 minutes.
3. When setup is done, choose **`~/ultrademo/scaffold`** as the project folder and start a new session there.
4. Ask for a video:
   > /ultrademo launch video of https://your-product.com

   Typing `/` lists the skill. You can also just ask in plain words.
5. The brief, direction and review pages open in your web browser. Claude in the desktop app follows what you do on them.

One difference from the terminal: the buttons on the saved dashboard (`ultrademo-dashboard.html`), such as **Start a new video**, open Claude Code in a terminal window. In the desktop app, use the live dashboard while a session runs, or type the request into the Code tab.

If you already use Route A, the skill is in the desktop app too: just ask for a video in any local session.

## Route C: by hand

```bash
git clone https://github.com/ultrademo-hq/ultrademo ~/ultrademo
cd ~/ultrademo/scaffold
npm run setup
claude
```

The workspace carries its own copy of the skill, so Claude Code picks it up when you open the `scaffold` folder in the terminal, the desktop app or VS Code.

## Other agents: Codex and Gemini CLI

Ultrademo's instructions are plain files that any agent can follow, and the workspace has an `AGENTS.md` (and a `GEMINI.md`) pointing at them. This is early: it is built and tested with Claude Code, and the review pages work best with an agent that can run commands in the background.

- **Codex:** do Route C, then run `codex` in `~/ultrademo/scaffold`. Or install the skill with `npx skills add ultrademo-hq/ultrademo -a codex` and ask for a video; it sets up the workspace the same way.
- **Gemini CLI:** do Route C, then run `gemini` in `~/ultrademo/scaffold`. Or install the skill with `npx skills add ultrademo-hq/ultrademo -a gemini-cli`.

With either one, the saved dashboard's buttons open Claude Code. Type the request into your agent instead.

The Claude chat app (claude.ai, outside the Code tab) cannot run Ultrademo. Its skills run in a cloud sandbox, which cannot open pages or run the video tools on your computer.

## Linux and WSL

Setup downloads the browsers but not the system libraries they need. A fresh Linux or WSL install often lacks them, and every capture then fails with an error such as `libnspr4.so: cannot open shared object file`. `npm run check` does not catch this yet: it reports the browser as ready because the file is there.

After setup, run this once in your own terminal (it asks for your password, so run it yourself rather than through your agent):

```bash
cd ~/ultrademo/scaffold && sudo npx playwright install-deps chromium
```

Then check that the browser really starts:

```bash
node -e "require('playwright').chromium.launch().then(b => b.close()).then(() => console.log('browser ok'))"
```

On WSL, the brief, direction and review pages open in your Windows browser: WSL 2 forwards `127.0.0.1` to Windows.

## Voices

A music-only video needs no voice. Your agent asks about voices during setup and sets up what you choose; you can also leave it for later, and the brief sets up a free voice when you pick it. You can hear every voice on the brief first.

- **Free voices, small set** (Mary, Eve, George, Alba, Stuart Bell; any computer; about 1.6 GB): `cd ~/ultrademo/scaffold && npm run setup -- --voices`.
- **All free voices** (adds James, Maria and Cori; Apple silicon or an NVIDIA card; about 6 GB, plus about 4 GB the first time Maria or Cori is used): `npm run setup -- --voices=all`.
- Both need **uv**, a small Python manager: `brew install uv` on a Mac. Setup tells you if it is missing.
- **Paid voices (ElevenLabs):** open `~/ultrademo/scaffold/.env` in a text editor and paste your own key after `ELEVENLABS_API_KEY=`, then save. In Finder, press Cmd+Shift+. to show hidden files. **Never paste a key into the chat.** Paid voices and generated sound effects use your ElevenLabs plan.

Without either one, narrated drafts use your computer's built-in voice as a stand-in.

## Check your setup

```bash
cd ~/ultrademo/scaffold && npm run check
```

It installs nothing. It shows what is ready and the fix for anything that is missing. When asking for help, paste its output, never your keys.

## Your videos

Each video has its own folder: `~/ultrademo/scaffold/projects/<name>/`. The finished file is `out/video.mp4`, with the vertical version, short cuts and thumbnails beside it, and approved versions in `out/final/`. The saved dashboard, `~/ultrademo/scaffold/ultrademo-dashboard.html`, lists them all.

## Usage statistics

Ultrademo sends anonymous usage statistics, on by default: which steps are reached, video types and formats, how long renders take, and where it fails. It never sends your product's address or name, your brief, scripts, frames, file paths or keys. Each event goes with a random install id made on your machine.

```bash
npm run telemetry -- show     # everything that was sent
npm run telemetry -- off      # switch it off (or set DO_NOT_TRACK=1)
```

The full list is in [scaffold/REQUIREMENTS.md](scaffold/REQUIREMENTS.md).

## Updating

Once a day the skill and the dashboard check whether a new version is out. The agent tells you what is new, and the dashboard shows a banner. Nothing updates without your yes. By hand:

```bash
cd ~/ultrademo && git pull && cd scaffold && npm run setup
```

Your videos, saved brands and key file are not part of the repository, so updating leaves them alone. If you installed the skill with `npx skills add`, also run `npx skills update`.

## Removing it

Delete the `~/ultrademo` folder (copy out any videos you want to keep first). Remove the skill with `npx skills remove ultrademo`. Setup also put two browsers in your user cache (Playwright's in `~/Library/Caches/ms-playwright` on a Mac, and the renderer's in `~/.cache/hyperframes`). Delete those too if nothing else uses them.

## Good to know

- The pages run only on your machine (`127.0.0.1`), never on the network.
- Your agent never saves, sends or deletes anything in your product while capturing it.
- Stuck? Tell your agent in the same session: "setup failed, here is the output", and paste the output, never your keys.
