// progress.mjs — how far production has got since the direction was confirmed, from the files it writes (only files newer
// than the confirm count): the kit, each scene written, built and checked (with its still strip once there), the joins,
// the whole video. The Production page polls it (direction server, /api/production). Pure reads; nothing is written.
import fs from 'node:fs';
import path from 'node:path';

const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

/** Tokens Claude used on this project, estimated (about four characters a token, 1,600 a picture): every task it read
 * and answered, and the scene code it wrote. The exact figure for a session is Claude Code's /cost. */
export function tokenEstimate(projectDir) {
  let read = 0, written = 0, tasks = 0;
  const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
  const dir = path.join(projectDir, 'tasks');
  let names = [];
  try { names = fs.readdirSync(dir); } catch {}
  for (const f of names) {
    if (f.endsWith('.task.md')) { tasks++; read += size(path.join(dir, f)) / 4; }
    else if (/-image-\d+\.(png|jpe?g|webp)$/.test(f)) read += 1600;
    else if (/\.answer\.(json|txt)$/.test(f)) written += size(path.join(dir, f)) / 4;
  }
  try { for (const f of fs.readdirSync(path.join(projectDir, 'production', 'scenes'))) if (f.endsWith('.html')) written += size(path.join(projectDir, 'production', 'scenes', f)) / 4; } catch {}
  return { read: Math.round(read), written: Math.round(written), tasks };
}

export function productionProgress(projectDir) {
  const since = (readJson(path.join(projectDir, 'direction', 'confirmed.json')) || {}).at || 0;
  const fresh = (f) => mtime(f) >= since - 1000;
  const plan = readJson(path.join(projectDir, 'plan.json'), { scenes: [] });
  const verify = readJson(path.join(projectDir, 'production', 'look', 'verify.json'), {});
  const look = path.join(projectDir, 'production', 'look');
  const scenes = (plan.scenes || []).map((s) => {
    const written = fresh(path.join(projectDir, 'production', 'scenes', `${s.id}.html`));
    const built = written && fresh(path.join(projectDir, 'compositions', 'frames', `${s.id}.html`));
    const v = verify[s.id];
    const checked = built && Boolean(v);
    const stripFile = path.join(look, `${s.id}-strip.jpg`);
    const strip = fresh(stripFile) ? `production/look/${s.id}-strip.jpg` : null;
    // the scene's own frames, in time order, for a one-line strip; the version changes when they are rewritten
    let frames = [];
    try { frames = fs.readdirSync(look).filter((f) => f.startsWith(`${s.id}-t`) && f.endsWith('.png') && fresh(path.join(look, f))).sort((a, b) => parseFloat(a.slice(s.id.length + 2)) - parseFloat(b.slice(s.id.length + 2))).map((f) => `production/look/${f}`); } catch {}
    return { id: s.id, name: s.name, beat: s.beat, state: checked ? (v.checks?.status === 'built' ? 'passes' : 'fixing') : built ? 'built' : written ? 'written' : 'waiting', strip, frames, version: Math.round(mtime(stripFile)) };
  });
  const kit = fresh(path.join(projectDir, 'kit', 'tokens.css'));
  let tasks = false;
  try { tasks = fs.readdirSync(path.join(projectDir, 'tasks')).some((f) => fresh(path.join(projectDir, 'tasks', f))); } catch {}
  const joins = (() => { try { return fs.readdirSync(look).filter((f) => /^join-.*\.json$/.test(f) && fresh(path.join(look, f))).length; } catch { return 0; } })();
  const scenesDone = scenes.length > 0 && scenes.every((s) => s.state === 'passes');
  // the whole video counts only once every scene passes and the file is newer than the last scene built
  const lastScene = Math.max(0, ...(plan.scenes || []).map((s) => mtime(path.join(projectDir, 'compositions', 'frames', `${s.id}.html`))));
  const video = scenesDone && mtime(path.join(projectDir, 'out', 'video.mp4')) >= lastScene;
  return {
    tokens: tokenEstimate(projectDir),
    confirmed_at: since,
    started: kit || tasks || scenes.some((s) => s.state !== 'waiting'),
    kit, scenes, joins, joins_needed: Math.max(0, scenes.length - 1),
    scenes_done: scenes.filter((s) => s.state === 'passes').length,
    video: video ? 'out/video.mp4' : null,
  };
}
