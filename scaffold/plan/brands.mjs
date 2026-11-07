// brands.mjs — saved brands: the kit (logo, colours, fonts, logo motion) and the story (who it is for, the problem,
// what it is, the proof, the call to action, exact wording) kept once per product, so the next brief starts from it.
// Kept as brands/<slug>/brand.json with the logo beside it, in the skill's folder (next to projects/). The brief offers
// a saved brand, everything stays editable, and saving a brief asks before it changes the saved brand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BRANDS_DIR = process.env.ULTRADEMO_BRANDS_DIR || path.join(HERE, '..', 'brands');
const LOGO_EXT = /\.(svg|png|jpg|webp)$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function brandSlug(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'brand';
}
export const domainOf = (url) => { try { return new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Every saved brand, newest first. */
export function listBrands(dir = BRANDS_DIR) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => SLUG_RE.test(n)).map((n) => readBrandProfile(n, dir)).filter(Boolean)
    .sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));
}

export function readBrandProfile(slug, dir = BRANDS_DIR) {
  if (!SLUG_RE.test(String(slug))) return null;
  const p = readJson(path.join(dir, slug, 'brand.json'));
  return p && p.name ? { ...p, slug } : null;
}

/** The saved brand for a product: same site address first, then the same name. */
export function findBrandFor({ url, product } = {}, dir = BRANDS_DIR) {
  const d = domainOf(url), all = listBrands(dir);
  return (d && all.find((b) => b.domain === d)) || (product && all.find((b) => b.slug === brandSlug(product))) || null;
}

/** A brand profile from a plan's video block (the brief as saved). Keywords, facts and the logo motion come later, from
 * the finished video, and are kept when the profile is updated from a brief. */
export function brandFromVideo(video = {}, prev = null) {
  const it = video.intake || {};
  const b = it.brand || {};
  const unsure = it.unsure || {};
  const keep = (k, v) => (k in unsure ? (prev?.story?.[k] ?? null) : (str(v) || null));
  return {
    version: 1,
    name: str(video.product) || prev?.name || '',
    url: str(video.url) || prev?.url || '',
    domain: domainOf(video.url) || prev?.domain || '',
    product_type: it.product_type || prev?.product_type || null,
    logo: b.logo || null,
    logo_motion: prev?.logo_motion ?? null,
    colors: { ...(b.colors || {}) },
    fonts: { ...(b.fonts || {}) },
    story: {
      viewer: keep('viewer', video.viewer),
      claim: keep('claim', video.claim),
      pain_point: keep('pain_point', video.pain_point),
      proof_moment: keep('proof_moment', video.proof_moment),
      cta: keep('cta', video.cta),
      exact: { tagline: str(it.exact?.tagline), lines: (it.exact?.lines || []).map(str).filter(Boolean) },
    },
    tone: video.copy?.register || prev?.tone || null,
    voice: it.voice ? { preference: it.voice.preference || null, id: it.voice.id || null } : (prev?.voice ?? null),
    keywords: prev?.keywords || [],
    facts: prev?.facts || [],
  };
}

const LABEL = {
  name: 'product name', url: 'site address', product_type: 'product type', logo: 'logo',
  'colors.brand': 'brand colour', 'colors.accent': 'accent colour', 'colors.ground': 'background colour', 'colors.ink': 'text colour',
  'fonts.display': 'headings font', 'fonts.body': 'body font',
  'story.viewer': 'who it is for', 'story.claim': 'what it is', 'story.pain_point': 'the problem', 'story.proof_moment': 'the proof',
  'story.cta': 'call to action', 'story.exact': 'exact wording', tone: 'tone', voice: 'voice',
};

/** What the brief would change in the saved brand, in plain words. Fields the brief leaves empty change nothing. The
 * logo counts as changed when its file differs (the brief's copy is compared with the saved one). */
export function brandChanges(saved, fresh, { projectDir = '', dir = BRANDS_DIR } = {}) {
  if (!saved) return [];
  const out = [];
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const cmp = (key, a, b) => { if (b != null && b !== '' && !same(a, b)) out.push(LABEL[key] || key); };
  cmp('name', saved.name, fresh.name);
  cmp('url', saved.url, fresh.url);
  cmp('product_type', saved.product_type, fresh.product_type);
  for (const k of ['brand', 'accent', 'ground', 'ink']) cmp(`colors.${k}`, saved.colors?.[k]?.toLowerCase(), fresh.colors?.[k]?.toLowerCase());
  for (const k of ['display', 'body']) cmp(`fonts.${k}`, saved.fonts?.[k], fresh.fonts?.[k]);
  for (const k of ['viewer', 'claim', 'pain_point', 'proof_moment', 'cta']) cmp(`story.${k}`, saved.story?.[k], fresh.story?.[k]);
  const ex = fresh.story?.exact;
  if (ex && (ex.tagline || ex.lines?.length)) cmp('story.exact', saved.story?.exact, ex);
  cmp('tone', saved.tone, fresh.tone);
  if (fresh.voice?.id || fresh.voice?.preference) cmp('voice', saved.voice, fresh.voice);
  if (fresh.logo && projectDir) {
    let a = null, b = null;
    try { a = fs.readFileSync(path.join(projectDir, fresh.logo)); } catch {}
    try { b = saved.logo ? fs.readFileSync(path.join(dir, saved.slug, saved.logo)) : null; } catch {}
    if (a && (!b || !a.equals(b))) out.push(LABEL.logo);
  }
  return out;
}

/** Save (or update) a brand from a brief. The logo is copied from the project beside brand.json. */
export function saveBrandProfile(profile, { projectDir = '', dir = BRANDS_DIR, now = new Date(), from = '' } = {}) {
  const slug = profile.slug && SLUG_RE.test(profile.slug) ? profile.slug : brandSlug(profile.name);
  const bdir = path.join(dir, slug);
  fs.mkdirSync(bdir, { recursive: true });
  const prev = readBrandProfile(slug, dir);
  let logo = prev?.logo || null;
  if (profile.logo && projectDir && LOGO_EXT.test(profile.logo)) {
    const src = path.join(projectDir, profile.logo);
    if (fs.existsSync(src)) {
      const ext = path.extname(profile.logo);
      for (const f of fs.readdirSync(bdir)) if (/^logo(-own)?\.(svg|png|jpg|webp)$/.test(f)) fs.rmSync(path.join(bdir, f));
      logo = `${profile.logo.includes('-own') ? 'logo-own' : 'logo'}${ext}`;
      fs.copyFileSync(src, path.join(bdir, logo));
    }
  }
  const { slug: _s, ...rest } = profile;
  const out = { ...rest, logo, saved_at: now.toISOString(), from: from || prev?.from || '' };
  fs.writeFileSync(path.join(bdir, 'brand.json'), JSON.stringify(out, null, 1) + '\n');
  return { ...out, slug };
}

/** Use a saved brand in a project: its logo is copied into the project (assets/brand/) and the brief's fields are
 * returned, for the intake page to fill. */
export function brandForBrief(slug, projectDir, dir = BRANDS_DIR) {
  const p = readBrandProfile(slug, dir);
  if (!p) return null;
  let logo = null;
  if (p.logo && /^logo(-own)?\.(svg|png|jpg|webp)$/.test(p.logo)) {
    const src = path.join(dir, p.slug, p.logo);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(projectDir, 'assets', 'brand'), { recursive: true });
      logo = `assets/brand/${p.logo}`;
      fs.copyFileSync(src, path.join(projectDir, logo));
    }
  }
  return {
    slug: p.slug, name: p.name, url: p.url, product: p.name, product_type: p.product_type,
    viewer: p.story?.viewer || '', claim: p.story?.claim || '', pain_point: p.story?.pain_point || '', proof_moment: p.story?.proof_moment || '', cta: p.story?.cta || '',
    exact: p.story?.exact || { tagline: '', lines: [] },
    brand: { logo, colors: p.colors || {}, fonts: p.fonts || {} },
    tone: p.tone, voice: p.voice,
  };
}
