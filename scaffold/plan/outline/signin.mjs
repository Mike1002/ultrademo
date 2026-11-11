// signin.mjs — the outline's sign-in test (D-91, D-93): right after the brief, try to reach every screen the outline
// needs, so a failing login shows on the outline page, not in production. Read-only: it signs in and looks, never
// clicks anything that changes data.
//   public site           each page is fetched
//   demo-account          signs in with the demo account in <project>/.env (DEMO_EMAIL, DEMO_PASSWORD, DEMO_SIGNIN_URL)
//                         through the product's own sign-in form, then opens each screen in the same session
//   own-browser, dedicated-profile, token, hosted-live-view: the sign-in happens at capture, in the user's browser or
//                         session; the outline says so
// The password is read only here, typed only into the product's password field and never printed, logged or saved.
import fs from 'node:fs';
import path from 'node:path';

const AT_CAPTURE = { 'own-browser': 'you sign in through your own browser, so this screen is checked when the steps are captured', 'dedicated-profile': 'you sign in through a profile, so this screen is checked when the steps are captured', token: 'checked when the steps are captured, with the token or link in the env file', 'hosted-live-view': 'hosted app only' };
const BLOCKED = /verify you are human|are you a robot|captcha|access denied|unusual traffic|cf-chl|checking your browser/i;

/** The demo account from the project's env file (only the three DEMO_ lines are read; values never leave this module). */
export function readDemoAccount(projectDir) {
  let text = '';
  try { text = fs.readFileSync(path.join(projectDir, '.env'), 'utf8'); } catch { return null; }
  const val = (k) => { const m = text.match(new RegExp(`^${k}=[ \\t]*(.*)$`, 'm')); return m ? m[1].trim().replace(/^(["'])(.*)\1$/, '$2') : ''; };
  const a = { email: val('DEMO_EMAIL'), password: val('DEMO_PASSWORD'), signin_url: val('DEMO_SIGNIN_URL') };
  return a.email && a.password ? a : null;
}

const needsCheck = (m) => (m.source === 'live' || m.source === 'site') && (m.url || m.sign_in);

/**
 * Test the outline's screens. Returns { path, tested_at, signed_in, why, results: { [index]: { state, why, shot? } } }
 * state: reached | not-reached | at-capture | not-placed (no address known; found during capture) | not-needed
 */
export async function testReach(plan, projectDir, { chromium = null, fetchImpl = globalThis.fetch, now = new Date(), timeoutMs = 20000 } = {}) {
  const video = plan.video;
  const o = video.intake?.outline || { moments: [] };
  const signPath = video.intake?.sign_in?.path || 'public';
  const out = { path: signPath, tested_at: now.toISOString(), signed_in: null, why: '', results: {} };
  const todo = o.moments.map((m, i) => [m, i]).filter(([m]) => needsCheck(m));
  o.moments.forEach((m, i) => { if (!needsCheck(m)) out.results[i] = { state: 'not-needed', why: m.source === 'rebuilt' ? '' : `from ${m.source}` }; });
  if (!todo.length) return out;

  // behind a sign-in, with a session the test cannot hold: said plainly, checked at capture
  if (AT_CAPTURE[signPath]) {
    for (const [m, i] of todo) out.results[i] = m.sign_in ? { state: 'at-capture', why: AT_CAPTURE[signPath] } : await fetchCheck(m, fetchImpl, timeoutMs);
    return out;
  }
  if (signPath !== 'demo-account') {
    for (const [m, i] of todo) out.results[i] = m.sign_in ? { state: 'not-reached', why: 'behind a sign-in, but the brief says public site only: pick a sign-in on the brief' } : await fetchCheck(m, fetchImpl, timeoutMs);
    return out;
  }

  // demo account: sign in through the product's own form, then open each screen in that session
  const account = readDemoAccount(projectDir);
  if (!account) {
    out.signed_in = false; out.why = 'the demo account is not filled in yet: open the env file from the brief and fill in DEMO_EMAIL and DEMO_PASSWORD';
    for (const [, i] of todo) out.results[i] = { state: 'not-reached', why: out.why };
    return out;
  }
  if (!chromium) ({ chromium } = await import('playwright'));
  const shotDir = path.join(projectDir, 'outline', 'reach');
  fs.mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const s = await signIn(page, account.signin_url || video.url, account, timeoutMs);
    out.signed_in = s.ok; out.why = s.why;
    for (const [m, i] of todo) {
      if (!m.url) { out.results[i] = { state: 'not-placed', why: 'no address yet; the capture finds the page' }; continue; }
      if (!s.ok && m.sign_in) { out.results[i] = { state: 'not-reached', why: s.why }; continue; }
      out.results[i] = await visit(page, m.url, path.join(shotDir, `${String(i + 1).padStart(2, '0')}.jpg`), timeoutMs, projectDir);
    }
  } finally { await browser.close(); }
  return out;
}

async function fetchCheck(m, fetchImpl, timeoutMs) {
  if (!m.url) return { state: 'not-placed', why: 'no address yet; the capture finds the page' };
  try {
    const r = await fetchImpl(m.url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? { state: 'reached', why: '' } : { state: 'not-reached', why: `the page answered ${r.status}` };
  } catch { return { state: 'not-reached', why: 'the page could not be reached' }; }
}

const PASSWORD = 'input[type="password"]';
const SUBMIT = 'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue"), button:has-text("Next")';
/** Submit the form a field is in: its sign-in button when there is one (Enter alone does not submit a form with two
 * fields and no button), else Enter. */
async function submit(page, field) {
  const form = field.locator('xpath=ancestor::form[1]');
  const scope = (await form.count()) ? form : page;
  const btn = scope.locator(SUBMIT).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  else await field.press('Enter');
}
const IDENTITY = 'input[type="email"], input[autocomplete="username"], input[autocomplete="email"], input[name*="email" i], input[name*="user" i], input[name*="login" i], input[id*="email" i], input[id*="user" i]';

/** Sign in through the form on `url`: the identity field, the password field (on the same step or the next), submit. */
export async function signIn(page, url, account, timeoutMs = 20000) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(800);
    if (BLOCKED.test(await page.content())) return { ok: false, why: 'the site blocked the automated browser; use your own browser or a dedicated profile on the brief' };
    const id = page.locator(IDENTITY).first();
    if (!(await id.count())) return { ok: false, why: 'no sign-in form found at the sign-in address; set DEMO_SIGNIN_URL in the env file' };
    await id.fill(account.email);
    let pw = page.locator(PASSWORD).first();
    if (!(await pw.isVisible().catch(() => false))) {
      // a two-step form: the email first, then the password
      await submit(page, id);
      await pw.waitFor({ state: 'visible', timeout: Math.min(8000, timeoutMs) }).catch(() => {});
      pw = page.locator(PASSWORD).first();
      if (!(await pw.isVisible().catch(() => false))) return { ok: false, why: 'the sign-in asked for something other than a password (a code, a link or single sign-on): use your own browser or a dedicated profile on the brief' };
    }
    await pw.fill(account.password);
    await submit(page, pw);
    await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(800);
    if (BLOCKED.test(await page.content())) return { ok: false, why: 'the site blocked the automated browser after sign-in; use your own browser or a dedicated profile on the brief' };
    if (await page.locator(PASSWORD).first().isVisible().catch(() => false)) return { ok: false, why: 'the sign-in was refused: check the email and password in the env file' };
    return { ok: true, why: '' };
  } catch {
    // never the error text itself: it could carry what was typed
    return { ok: false, why: 'the sign-in page did not load or answer in time' };
  }
}

async function visit(page, url, shot, timeoutMs, projectDir) {
  try {
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: Math.min(10000, timeoutMs) }).catch(() => {});
    if (await page.locator(PASSWORD).first().isVisible().catch(() => false)) return { state: 'not-reached', why: 'it sent the browser back to the sign-in' };
    if (r && r.status() >= 400) return { state: 'not-reached', why: `the page answered ${r.status()}` };
    await page.screenshot({ path: shot, type: 'jpeg', quality: 70 });
    return { state: 'reached', why: '', shot: path.relative(projectDir, shot).split(path.sep).join('/') };
  } catch { return { state: 'not-reached', why: 'the page did not load in time' }; }
}
