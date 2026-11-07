# Review page

```
node plan/review/serve.mjs <project> [--port 4330]
```

It prints the URL (`http://127.0.0.1:4330/`). The page plays `<project>/out/*.mp4` (the full render, not `video-render.mp4`) with a picker when there is more than one, and draws the plan's scenes on the timeline.

- **Add a comment:** press Add comment (or N). The video pauses and the comment box opens at once; while it is open you can drag a box on the video or click to drop a pin (optional); Save comment (or Cmd/Ctrl+Enter), Esc to cancel.
- **Find a comment:** click its card or its dot on the timeline and the video jumps to that frame; click a box or pin on the video and its card is selected and scrolled into view. While the video plays, the comment the playhead has reached lights up and the list scrolls it to the top. A box shows only within about half a second of its moment. Comments are listed in time order.
- **Full screen:** the ⛶ button (or F) fills the screen with the frame, controls and timeline; adding a comment there marks the frame in full screen, then returns to the page to type it.
- **Statuses:** Open (pink) or Done (green). Only the agent marks a comment Done, with a note under it saying what changed. On a Done comment the reviewer clicks Follow up to ask for more or for a revert; the comment opens again with the whole conversation kept, so the agent acts on the latest follow-up and does not redo earlier work. Edit (open comments) and Delete.
- **Markers:** each box or pin carries a small numbered bubble (inside the frame) matching the number on its card; the full text is in the list. Markers on/off (or M) hides them to watch the video clean.
- **The file:** the page shows the video's path on disk with Copy path, and Download.
- **Share:** Copy all comments, or Copy open comments once some are done (for the next round), puts them on the clipboard as a plain list.
- Keys: Space play/pause, N new comment, F full screen, M markers, `,` `.` (or the ‹ › buttons) one frame back or forward, held down to keep stepping, Esc cancel. `[` `]` slower and faster; speed runs 0.25× to 2× with − and + beside it.

Comments are saved as you go to `<project>/review/comments.json` (per video, with the render's size and time, so comments written on an earlier render are flagged; the first cut's `notes.json` is read and carried over) and `<project>/review/comments.md`, one line per comment: `- [ ] 01:23.4 · 07-one-place · box 55%,42% 35%×20% — text` (`[x]` done; under a comment, `agent:` lines say what changed and `follow-up:` lines are the reviewer's later asks). The agent reads `comments.md`, takes the frame at that time from the video (`ffmpeg -ss <t> -i out/video.mp4 -frames:v 1`), fixes the scene, re-renders, sets the comment to `done` and adds `{by: 'agent', text}` to its `thread` in `comments.json`; if the reviewer follows up, the agent acts on the follow-up only.

Security: 127.0.0.1 only; the video route takes a plain file name in `out/` only and serves byte ranges; writes are same-origin JSON under 200 KB; each comment is checked (plain id, time, text capped at 2,000 characters, box and pin inside the frame) and rendered with `textContent`. No uploads.

Files: `serve.mjs` (server, `comments.json`, `comments.md`), `page.mjs` (the page, on the design system), `test.mjs` (`node --test plan/review/test.mjs`).
