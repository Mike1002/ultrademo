// render.mjs — HyperFrames renders: the whole video to out/video.mp4, each
// scene alone to out/scenes/<id>.mp4 (through its scratch host), the
// event-frame stills (first frame, every motion-line boundary, last frame) and
// a frame sheet; plus the probe pages the DOM checks seek in a browser.

import { canvasOfProject } from './canvas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SCAFFOLD, HYPERFRAMES } from './craft.mjs';

const r3 = (n) => Math.round(n * 1000) / 1000;

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '') };
};

/** ffprobe a video: { frames, fps, width, height, duration, hasAudio } or null. */
export function probeVideo(file) {
  if (!fs.existsSync(file)) return null;
  const v = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,codec_name', '-of', 'json', file]);
  const a = run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file]);
  const d = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  try {
    const s = JSON.parse(v.out).streams[0];
    const [n, dd] = String(s.r_frame_rate).split('/').map(Number);
    return { frames: Number(s.nb_read_frames), fps: dd ? n / dd : n, width: s.width, height: s.height, codec: s.codec_name, duration: Number(String(d.out).trim()), hasAudio: /audio/.test(a.out) };
  } catch { return null; }
}

/** Render a HyperFrames project dir to `out`. Returns { ok, seconds, log }. */
export function renderProject(dir, out, { fps = 30, workers = 'auto', log = () => {} } = {}) {
  const t0 = Date.now();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try { fs.rmSync(out, { force: true }); } catch { /* none */ }
  const r = run('npx', ['--no-install', HYPERFRAMES, 'render', dir, '-o', out, '--fps', String(fps), '-w', String(workers), '--quiet'], SCAFFOLD);
  const ok = fs.existsSync(out) && fs.statSync(out).size > 0;
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  log(`render ${path.basename(out)}: ${ok ? 'ok' : 'FAILED'} in ${seconds}s`);
  return { ok, seconds, log: r.out.slice(-3000) };
}

/** The times the stills are taken at inside a scene: first frame, every motion-line boundary, last frame. */
export function eventTimes(scene, fps = 30) {
  const half = 1 / fps / 2;
  const ts = new Set([half]);
  for (const m of scene.motion) if (m.from_s > 0 && m.from_s < scene.duration_s) ts.add(r3(m.from_s + half));
  ts.add(r3(Math.max(half, scene.duration_s - 1 / fps + half)));
  return [...ts].sort((a, b) => a - b);
}

/** Extract one jpeg still at `t` seconds. */
export function still(video, t, out, { width = 640 } = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = run('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '3', out]);
  return r.code === 0 && fs.existsSync(out);
}

/** Event-frame stills per scene into out/stills/, named NN-<id>-tSS.SS.jpg; returns the list. */
export function sceneStills(plan, outDir, { fps = 30 } = {}) {
  const made = [];
  plan.scenes.forEach((s, i) => {
    const clip = path.join(outDir, 'scenes', `${s.id}.mp4`);
    if (!fs.existsSync(clip)) return;
    for (const t of eventTimes(s, fps)) {
      const file = path.join(outDir, 'stills', `${String(i + 1).padStart(2, '0')}-${s.id}-t${t.toFixed(2).padStart(6, '0')}.jpg`);
      if (still(clip, t, file)) made.push({ scene: s.id, t, file });
    }
  });
  return made;
}

/** One sheet of every still, six per row. */
export function frameSheet(stills, out, { cols = 6, width = 320 } = {}) {
  if (!stills.length) return false;
  const rows = Math.ceil(stills.length / cols);
  const list = path.join(path.dirname(out), 'stills.txt');
  fs.writeFileSync(list, stills.map((s) => `file '${s.file.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const r = run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=${width}:-2,pad=${width + 8}:ih+8:4:4:color=black,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', out]);
  try { fs.rmSync(list, { force: true }); } catch { /* none */ }
  return r.code === 0 && fs.existsSync(out);
}

/**
 * A probe page for one scene: the template's inner content on a standalone
 * page with the project's gsap, under <base href> so asset paths resolve.
 * The DOM checks open it in a browser and seek the timeline.
 */
export function probePage(projectDir, scene, { width = canvasOfProject(projectDir).W, height = canvasOfProject(projectDir).H } = {}) {
  const frame = fs.readFileSync(path.join(projectDir, 'compositions', 'frames', `${scene.id}.html`), 'utf8');
  const inner = (frame.match(/<template>([\s\S]*)<\/template>/) || [, frame])[1];
  const dir = path.join(projectDir, 'production', 'probe');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${scene.id}.html`);
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="UTF-8"><base href="../../"><script src="assets/gsap.min.js"></script><script>window.__timelines = window.__timelines || {}; window.__probeErrors = []; window.addEventListener('error', (e) => { window.__probeErrors.push(String(e.message || e.error || e)); });</script><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#000}#root{position:relative;width:${width}px;height:${height}px;overflow:hidden}</style></head><body>${inner}</body></html>`);
  return file;
}
