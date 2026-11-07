// canvas.mjs — the frame a project's scenes are built on, from plan.video.format ("1920x1080" landscape, "1080x1920"
// vertical). Every viewport, check and prompt in production reads it here instead of assuming 1920×1080 (D-82).
import fs from 'node:fs';
import path from 'node:path';

export function canvasOf(plan) {
  const [w, h] = String(plan?.video?.format || '1920x1080').split('x').map(Number);
  const W = w > 0 ? w : 1920, H = h > 0 ? h : 1080;
  return { W, H, vertical: H > W, label: `${W}×${H}` };
}

export function canvasOfProject(projectDir) {
  try { return canvasOf(JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8'))); } catch { return canvasOf(null); }
}

/** A labelled box within m px of the frame's edge (the look check), on this frame's size, not 1920×1080. */
export function nearEdge(b, cv, m = 40) {
  return b.x < m || b.y < m || b.x + b.w > cv.W - m || b.y + b.h > cv.H - m;
}

/** How a vertical frame is laid out: read by the designer, the scene builder and the brief. */
export function verticalNote(cv) {
  return `This video is vertical, ${cv.label} (9:16, for phones: Shorts, Reels, TikTok). Stack instead of placing side by side: the headline in the top third, the product below it at the full width; type larger than in a landscape video (headlines 96–140 px, body 40–48 px, labels 30 px and up); margins 72 px left and right, 160 px at the top; keep the bottom 20% free of copy that must be read (the platform's buttons and captions sit there) and the right 120 px free of anything important (the like and share column). A wide product screen is shown by lifting its parts at full width one after another, never shrunk whole to fit.`;
}

/** A prompt written for 1920×1080, for this frame: the sizes swapped and, for a vertical frame, the layout note added. */
export function forCanvas(text, cv) {
  if (cv.W === 1920 && cv.H === 1080) return text;
  const out = String(text).replaceAll('1920×1080', cv.label).replaceAll('data-width="1920" data-height="1080"', `data-width="${cv.W}" data-height="${cv.H}"`);
  return cv.vertical ? `${out}\n\n${verticalNote(cv)}` : out;
}
