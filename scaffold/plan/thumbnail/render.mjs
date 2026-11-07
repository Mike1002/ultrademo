#!/usr/bin/env node
// thumbnail/render.mjs — the video's thumbnail (D-82), drawn from the plan in the direction's look: the refine page's card
// renders the five layouts as previews; production renders the chosen one in every size with the finished video (a real
// frame for "a moment from the video") and, when the user asked for it, the opening frame scene 1 starts on.
//   node plan/thumbnail/render.mjs <project>            out/thumbnails/<name>-thumbnail-<size>.png (after the whole render)
//   node plan/thumbnail/render.mjs <project> --intro    assets/thumbnail-intro.png at the video's own frame (before production)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SIZES, LAYOUTS, thumbLook, thumbnailHtml, fontFaces, logoDataUrl } from './layouts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const GALLERY = path.join(ROOT, 'research', 'motion-craft', 'video-style-gallery');
const FONTS = path.join(GALLERY, '_fonts');
export const TALL = { id: 'tall', w: 1080, h: 1920, label: '1080 × 1920', use: 'Shorts and Reels cover' };
const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** The size of a PNG or JPEG from its header (no image library). */
export function imageSize(file) {
  let b; try { b = fs.readFileSync(file); } catch { return null; }
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/** A short line from notes: the first sentence, at most `max` words. */
export function shortLine(text, max = 9) {
  const first = str(text).split(/(?<=[.!?])\s+/)[0] || '';
  const words = first.replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean);
  return words.length ? `${words.slice(0, max).join(' ')}${words.length > max ? '…' : ''}` : '';
}

/** What the thumbnail says and shows, from the plan: the user's own title and line when given on the card, else the
 * core message; the opening hook; the reveal; the problem and the answer; the logo, a captured screen, a frame. */
export function thumbContent({ projectDir, video = {}, direction = {}, beats = [], frame = null }) {
  const it = video.intake || {};
  const t = direction.thumbnail || {};
  const copyOf = (b) => b?.copy || {};
  const reveal = beats.find((b) => b.beat === 'reveal') || beats[1] || beats[0];
  const answer = beats.length > 2 ? beats[beats.length - 2] : reveal;
  const sentences = str(video.claim).split(/(?<=[.!?])\s+/);
  const logoPath = (video.sources || []).find((s) => s.kind === 'logo')?.path || it.brand?.logo || null;
  let logo = null;
  if (logoPath && fs.existsSync(path.join(projectDir, logoPath))) { try { logo = logoDataUrl(path.join(projectDir, logoPath)); } catch {} }
  // a captured screen: the one the card names (thumbnail.screen, a source id), else the first screenshot or mockup shot
  // the plan names; its top (the hero of a long page)
  const usable = (s) => ['screenshot', 'mockup'].includes(s.kind) && /\.(png|jpe?g)$/i.test(s.path || '') && fs.existsSync(path.join(projectDir, s.path));
  const shot = (video.sources || []).find((s) => t.screen && s.id === t.screen && usable(s)) || (video.sources || []).find(usable);
  let screen = null;
  if (shot) {
    const file = path.join(projectDir, shot.path);
    const sz = imageSize(file) || { w: 1440, h: 900 };
    screen = { src: pathToFileURL(file).href, iw: sz.w, ih: sz.h, crop: { x: 0, y: 0, w: sz.w, h: Math.min(sz.h, Math.round(sz.w * 0.62)) } };
  }
  const type = it.video_type || video.template || 'video';
  const len = Number(video.length_s) || 0;
  return {
    product: video.product, domain: (() => { try { return new URL(video.url).host.replace(/^www\./, ''); } catch { return ''; } })(), logo,
    title: str(t.title) || shortLine(sentences[0], 8) || video.product,
    titleAccent: '',
    line: str(t.line) || shortLine(sentences[1], 10) || str(video.cta),
    meta: `${type.charAt(0).toUpperCase()}${type.slice(1)} video${len ? ` · ${len >= 60 ? `${Math.round(len / 6) / 10} min` : `${Math.round(len)} s`}` : ''}`,
    kicker: shortLine(video.viewer, 5) || `${type} video`,
    hook: { text: copyOf(beats[0]).headline || video.pain_point || video.product, accent: copyOf(beats[0]).accent || '' },
    headline: { text: copyOf(reveal).headline || video.product, accent: copyOf(reveal).accent || '' },
    pain: copyOf(beats[0]).headline || shortLine(video.pain_point, 10),
    answer: { text: copyOf(answer).headline || shortLine(video.proof_moment, 10) },
    screen: screen || { src: frame || '', iw: 16, ih: 9 },
    frame: frame || screen?.src || '',
  };
}

/** Render layouts × sizes to PNG files in outDir. look: from thumbLook. Returns the files. */
export async function renderThumbs({ look, content, layouts = LAYOUTS.map((l) => l.id), sizes = [SIZES[0]], outDir, name = (l, s) => `${l}-${s.id}.png` }) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(path.join(outDir, '_html'), { recursive: true });
  const faces = fontFaces(look, FONTS);
  const browser = await chromium.launch();
  const files = [];
  try {
    const page = await browser.newPage();
    for (const layout of layouts) for (const size of sizes) {
      const html = path.join(outDir, '_html', `${layout}-${size.id}.html`);
      fs.writeFileSync(html, thumbnailHtml({ layout, size, look, content, faces }));
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.goto(pathToFileURL(html).href);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.waitForTimeout(80);
      const out = path.join(outDir, name(layout, size));
      await page.screenshot({ path: out });
      files.push(out);
    }
  } finally { await browser.close(); }
  return files;
}

/** The direction's look: its colours and fonts, its video style's background, the project's kit ground once it exists. */
export function lookFor(projectDir, direction) {
  const style = direction.video_style ? readJson(path.join(GALLERY, direction.video_style, 'style.json')) : null;
  let kitCss = '';
  try { kitCss = fs.readFileSync(path.join(projectDir, 'kit', 'tokens.css'), 'utf8'); } catch {}
  return thumbLook(direction, { style, kitCss });
}

/** After the whole render: the chosen layout in every size (and 1080×1920 when the video has a vertical version), with a
 * real frame from the video for "a moment from the video". Returns the files. */
export async function finalThumbnails(projectDir) {
  const plan = readJson(path.join(projectDir, 'plan.json'));
  if (!plan?.direction) throw new Error('no confirmed direction in plan.json');
  const outDir = path.join(projectDir, 'out', 'thumbnails');
  fs.mkdirSync(outDir, { recursive: true });
  const layout = plan.direction.thumbnail?.layout || 'info';
  // a frame from the middle of the reveal (else the second scene), from the finished video
  let frame = null;
  const video = path.join(projectDir, 'out', 'video.mp4');
  const scenes = plan.scenes || [];
  const at = scenes.find((s) => s.beat === 'reveal') || scenes[1] || scenes[0];
  if (fs.existsSync(video) && at) {
    let t = 0; for (const s of scenes) { if (s === at) break; t += Number(s.duration_s) || 0; }
    const f = path.join(outDir, 'frame.jpg');
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t + (Number(at.duration_s) || 2) * 0.6), '-i', video, '-frames:v', '1', '-q:v', '2', f]);
    if (r.status === 0) frame = pathToFileURL(f).href;
  }
  // and the same moment from the vertical version, for the 9:16 cover
  let frameTall = null;
  const vvideo = path.join(projectDir, 'out', 'video-vertical.mp4');
  if (fs.existsSync(vvideo) && at) {
    let t = 0; for (const s of scenes) { if (s === at) break; t += Number(s.duration_s) || 0; }
    const f = path.join(outDir, 'frame-vertical.jpg');
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t + (Number(at.duration_s) || 2) * 0.6), '-i', vvideo, '-frames:v', '1', '-q:v', '2', f]);
    if (r.status === 0) frameTall = pathToFileURL(f).href;
  }
  const content = { ...thumbContent({ projectDir, video: plan.video, direction: plan.direction, beats: scenes.map((s) => ({ beat: s.beat, copy: s.copy })), frame }), frameTall };
  const vertical = (plan.video.intake?.formats || []).includes('vertical') || fs.existsSync(path.join(projectDir, 'vertical', 'plan.json'));
  const sizes = [...SIZES, ...(vertical ? [TALL] : [])];
  const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
  const files = await renderThumbs({ look: lookFor(projectDir, plan.direction), content, layouts: [layout], sizes, outDir, name: (l, s) => `${slug}-thumbnail-${s.w}x${s.h}.png` });
  fs.rmSync(path.join(outDir, '_html'), { recursive: true, force: true });
  return files;
}

/** Before production, when the user asked the video to open on its thumbnail: assets/thumbnail-intro.png at the video's
 * own frame, for scene 1 to show for about 1.5 s. */
export async function introFrame(projectDir) {
  const plan = readJson(path.join(projectDir, 'plan.json'));
  const t = plan?.direction?.thumbnail;
  if (!t?.intro) return null;
  const [w, h] = String(plan.video.format || '1920x1080').split('x').map(Number);
  const tmp = path.join(projectDir, 'production', 'thumbnail');
  const scenes = plan.scenes || [];
  const content = thumbContent({ projectDir, video: plan.video, direction: plan.direction, beats: scenes.map((s) => ({ beat: s.beat, copy: s.copy })) });
  const [file] = await renderThumbs({ look: lookFor(projectDir, plan.direction), content, layouts: [t.layout], sizes: [{ id: 'intro', w, h }], outDir: tmp });
  fs.mkdirSync(path.join(projectDir, 'assets'), { recursive: true });
  const out = path.join(projectDir, 'assets', 'thumbnail-intro.png');
  fs.copyFileSync(file, out);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node plan/thumbnail/render.mjs <project> [--intro]'); process.exit(2); }
  const projectDir = path.resolve(dir);
  (process.argv.includes('--intro') ? introFrame(projectDir).then((f) => console.log(f ? `Opening frame: ${f}` : 'The video does not open on its thumbnail (refine page).'))
    : finalThumbnails(projectDir).then((fs_) => console.log(`Thumbnails:\n${fs_.join('\n')}`)))
    .catch((err) => { console.error(`Stopped: ${err.message}`); process.exit(1); });
}
