// dashboard/page.mjs — ultrademo-dashboard.html: Videos, Brands and Learnings, from collectDashboard(). Two forms of
// the same page: live (served by dashboard/serve.mjs, the buttons act) and saved (the file beside projects/, rewritten
// after every step, opens from Finder; its buttons wait for the live page).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { uiCssInline, udHeadInline } from '../ui/inline.mjs';
import { DASH_CSS } from './style.mjs';
import { STAGES } from './data.mjs';
import { UD_HEAD } from '../intake/page.mjs';
import { updateCommand } from '../updates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCAFFOLD = path.join(HERE, '..', '..');
const FONTS = path.join(SCAFFOLD, '..', 'research', 'motion-craft', 'video-style-gallery', '_fonts');
export const LIVE_PORT = 4320;
// the skill's slash command in this folder (the working copy keeps v1 as /ultrademo beside /ultrademo-v2)
const SKILL = fs.existsSync(path.join(SCAFFOLD, '.claude', 'skills', 'ultrademo-v2')) ? 'ultrademo-v2' : 'ultrademo';
/** Claude Code's deep link: opens a terminal session in the skill folder with the request typed in (Enter sends it). */
export const claudeLink = (prompt) => `claude-cli://open?cwd=${encodeURIComponent(path.resolve(SCAFFOLD))}&q=${encodeURIComponent(`/${SKILL} ${prompt}`)}`;
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LOGO_MOTION_NAMES = { 'fade-rise': 'Fade and rise', 'scale-pop': 'Scale pop', 'mark-then-name': 'Mark, then name', 'wipe-bar': 'Wipe in', 'flash-reveal': 'Flash, then logo', glint: 'Glint', none: 'None' };
const KINDS = ['Review lesson', 'Spoken name', 'Cast', 'Effect', 'Exact wording', 'Other'];

/** @font-face for a brand's fonts when the font folder has them (400 and the heaviest weight). */
function fontFaces(families, url) {
  const out = [];
  for (const fam of new Set(families.filter(Boolean))) {
    const slug = fam.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let files = [];
    try { files = fs.readdirSync(path.join(FONTS, slug)).filter((f) => /-(\d{3})\.woff2$/.test(f)); } catch {}
    for (const f of files) out.push(`@font-face{font-family:"${fam}";src:url("${url(path.join(FONTS, slug, f))}") format("woff2");font-weight:${f.match(/-(\d{3})\.woff2$/)[1]};font-display:swap}`);
  }
  return out.join('\n');
}

/** "5 min ago", "3 h ago", "yesterday", "4 days ago", or the date. */
function ago(ms, nowIso) {
  const s = Math.max(0, (Date.parse(nowIso) - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

/** A newer version, from the daily check (plan/updates.mjs): what is new and the command; nothing installs by itself. */
export function updateBanner(u) {
  if (!u?.newer) return '';
  const cmd = u.git ? updateCommand(path.resolve(SCAFFOLD, '..')) : '';
  return `<div class="upd" role="status"><b>Ultrademo ${e(u.latest)} is out</b><span>${u.notes ? `${e(u.notes)}. ` : ''}You have ${e(u.current)}. Ask Claude to update, or run:</span>${cmd ? `<code>${e(cmd)}</code>` : '<a href="https://github.com/ultrademo-hq/ultrademo/releases">Download the new version</a>'}</div>`;
}

export function renderDashboard(data, { live = false } = {}) {
  // pictures: the live page serves them (/img), the saved file points at them on disk
  const url = (abs) => (live ? `/img?p=${encodeURIComponent(path.relative(SCAFFOLD, abs))}` : pathToFileURL(abs).href);
  const dis = live ? '' : ' disabled title="Works in the live dashboard: press Open in Claude Code above"';
  // the saved copy cannot start anything itself: its buttons open Claude Code with the request typed in
  const ask = (prompt, label, cls = '') => `<a class="btn ${cls} ask" href="${e(claudeLink(prompt))}" data-copy="${e(`/${SKILL} ${prompt}`)}">${label}</a>`;
  const { videos, brands } = data;
  const proposedCount = brands.reduce((n, b) => n + b.proposed.reduce((m, p) => m + p.items.length, 0), 0);

  const stageDots = (k) => `<span class="sdots" title="${STAGES[k]}">${STAGES.map((s, i) => `<i class="${i < k ? 'done' : i === k ? 'now' : ''}"></i>`).join('')}<b>${STAGES[k]}</b></span>`;
  const pageFor = (v) => (v.stage >= 3 ? v.live.review : v.stage >= 1 ? (v.live.direction || v.live.intake) : v.live.intake);
  const resume = (v) => `Continue the video "${v.title}" for ${v.brand} in projects/${v.project}`;
  const videoRows = videos.map((v) => {
    const page = pageFor(v);
    const play = (f) => (live ? `/watch?p=${encodeURIComponent(path.relative(SCAFFOLD, f))}` : pathToFileURL(f).href);
    const dl = (f) => (live ? `/final?p=${encodeURIComponent(path.relative(SCAFFOLD, f))}` : pathToFileURL(f).href);
    const acts = [
      v.watch ? `<a class="btn dark" href="${e(play(v.watch))}" target="_blank" rel="noopener">${v.watchVertical ? 'Watch 16:9' : 'Watch'}</a>` : '',
      v.watchVertical ? `<a class="btn dark" href="${e(play(v.watchVertical))}" target="_blank" rel="noopener">Watch 9:16</a>` : '',
      ...(v.cuts || []).map((f) => `<a class="btn" href="${e(play(f))}" target="_blank" rel="noopener">Watch the ${e(path.basename(f).replace(/^cut-(\d+)\.mp4$/, '$1 s'))} cut</a>`),
      page ? `<a class="btn ${v.watch ? '' : 'dark'}" href="${e(page)}" target="_blank" rel="noopener">${v.stage === 4 ? 'Open Delivery' : 'Open its page'}</a>` : '',
      v.stage < 4 && !page ? (live ? `<button type="button" class="copy" data-copy="${e(resume(v))}" title="Paste into Claude Code to carry on">Copy a line for Claude</button>` : ask(`continue the video "${v.title}" for ${v.brand} in projects/${v.project}`, 'Continue in Claude Code', v.watch ? '' : 'dark')) : '',
      ...[[v.final, v.finalVertical ? 'Download 16:9' : 'Download'], [v.finalVertical, 'Download 9:16']].filter(([f]) => f).map(([f, l]) => `<a class="btn" href="${e(dl(f))}" download>${l}</a>`),
      live ? `<button type="button" class="quiet vremove" data-project="${e(v.project)}" data-title="${e(`${v.brand} · ${v.title}`)}">Remove</button>` : '',
    ].join('');
    return `<article class="vrow" data-brand="${e(v.brandSlug || '')}" data-stage="${v.stage}"><div class="vthumb">${v.still ? (v.watch ? `<a href="${e(play(v.watch))}" target="_blank" rel="noopener" title="Watch"><img src="${e(url(v.still))}" alt="" loading="lazy"></a>` : `<img src="${e(url(v.still))}" alt="" loading="lazy">`) : '<span>Not built yet</span>'}</div>
<div class="vmain"><div class="vtitle"><b>${e(v.brand)}</b> · ${e(v.title)}</div><div class="muted small">${e(v.type || v.project)}${v.updated ? ` · updated ${e(ago(v.updated, data.at))}` : ''}</div><div class="vnote">${e(v.note)}</div></div>
<div class="vstage">${stageDots(v.stage)}</div><div class="vacts">${acts}</div></article>`;
  }).join('') || '<p class="muted">No videos yet. Press Start a new video, or type /ultrademo in Claude Code.</p>';

  const item = (label, text) => (text ? `<li><span class="sl">${e(label)}</span><span class="st clamp">${text}</span></li>` : '');
  const brandCards = brands.map((b) => {
    const st = b.story || {};
    const ex = st.exact || {};
    const facts = (b.facts || []).map((f) => f.text);
    const words = [...(b.keywords || []), ...facts];
    const cols = ['brand', 'accent', 'ground', 'ink'].map((k) => b.colors?.[k]).filter(Boolean);
    return `<article class="bcard" id="brand-${e(b.slug)}">
<div class="bid"><div class="blogo"><span class="lmark lm-fade">${b.logoFile ? `<img src="${e(url(b.logoFile))}" alt="${e(b.name)} logo">` : `<b>${e(b.name)}</b>`}</span></div>
<div class="bname"><b>${e(b.name)}</b><span class="muted small">${e(b.domain || b.url)}</span></div>
<ul class="bkit">
${cols.length ? `<li><span class="sl">Colours</span><span class="bsw">${cols.map((c) => `<span style="background:${e(c)}" title="${e(c)}"></span>`).join('')}</span></li>` : ''}
${b.fonts?.display ? `<li><span class="sl">Headings</span><span class="fsamp" style="font-family:'${e(b.fonts.display)}',system-ui;font-weight:800">Aa</span><span>${e(b.fonts.display)}</span></li>` : ''}
${b.fonts?.body ? `<li><span class="sl">Body text</span><span class="fsamp" style="font-family:'${e(b.fonts.body)}',system-ui">Aa</span><span>${e(b.fonts.body)}</span></li>` : ''}
<li><span class="sl">Logo motion</span><span>${e(LOGO_MOTION_NAMES[b.logo_motion] || 'Not chosen yet')}</span></li>
</ul>
<div class="bstats"><span>${b.videos} video${b.videos === 1 ? '' : 's'}</span><span>${b.learnings.length} learning${b.learnings.length === 1 ? '' : 's'}${b.proposed.length ? ` · <b class="waiting">${b.proposed.reduce((n, p) => n + p.items.length, 0)} to confirm</b>` : ''}</span><span class="muted">updated ${e(String(b.saved_at || '').slice(0, 10))}</span></div>
<div class="bacts">${live ? `<button type="button" class="dark newvid" data-brand="${e(b.slug)}">New video</button>` : ask(`start a new video for ${b.name} (saved brand: ${b.slug})`, 'New video', 'dark')}<button type="button" class="golearn" data-brand="${e(b.slug)}">Learnings</button></div>
<p class="muted small" style="margin:0">To change the brand, start a new video: the brief starts from it, and saving asks before it updates the brand.</p></div>
<div class="bstory"><ul class="slist">${item('Who it is for', e(st.viewer))}${item('The problem', e(st.pain_point))}${item('What it is', e(st.claim))}${item('The proof', e(st.proof_moment))}${item('Call to action', e(st.cta))}${ex.tagline || ex.lines?.length ? item('Exact wording', [ex.tagline, ...(ex.lines || [])].filter(Boolean).map((x) => `<span class="q">"${e(x)}"</span>`).join('')) : ''}
${words.length ? `<li><span class="sl">Keywords and facts · ${words.length}</span><span class="kchips">${words.map((f, k) => `<span class="${k >= 7 ? 'extra' : ''}">${e(f)}</span>`).join('')}${words.length > 7 ? `<span class="more">+${words.length - 7} more</span>` : ''}</span></li>` : ''}</ul>
<button type="button" class="quiet showall">Show all</button></div></article>`;
  }).join('') || '<p class="muted">No saved brands yet. Saving a brief offers to keep its brand.</p>';

  const learnRow = (slug, l) => `<li class="lrow${l.on ? '' : ' off'}" data-brand="${e(slug)}" data-id="${e(l.id)}"><span class="lkind">${e(l.kind)}</span><span class="ltext">${e(l.text)}</span><span class="lsrc muted small">${e(l.from)}</span><label class="lsw"><input type="checkbox" class="ltog" ${l.on ? 'checked' : ''}${dis}><span>${l.on ? 'On' : 'Off'}</span></label><button type="button" class="quiet ledit"${dis}>Edit</button><button type="button" class="quiet ldel"${dis}>Remove</button></li>`;
  const learnBlocks = brands.map((b) => `<section class="lbrand" id="learn-${e(b.slug)}"><h3>${e(b.name)}</h3>
${b.proposed.map((p) => `<div class="lprop" data-project="${e(p.project)}"><div><b>Proposed from the ${e(p.from)}</b><span class="muted small">Read from the approved video and your comments. Keep what is right; untick or edit the rest.</span></div>
<ul>${p.items.map((it) => `<li data-id="${e(it.id)}"><label><input type="checkbox" checked${dis}><span class="lkind">${e(it.kind)}</span><input type="text" class="ptext" value="${e(it.text)}"${it.kind === 'Facts' ? ' readonly' : ''}${dis}></label></li>`).join('')}</ul>
<div class="lpacts"><button type="button" class="dark pkeep"${dis}>Keep the ticked ones</button></div></div>`).join('')}
<ul class="llist">${b.learnings.map((l) => learnRow(b.slug, l)).join('') || '<li class="muted small" style="padding:8px 0">Nothing kept yet.</li>'}</ul>
<form class="ladd" data-brand="${e(b.slug)}"><select${dis}>${KINDS.map((k) => `<option>${e(k)}</option>`).join('')}</select><input type="text" placeholder="Add a learning for the next ${e(b.name)} video" maxlength="400"${dis}><button type="submit"${dis}>Add</button></form></section>`).join('') || '<p class="muted">Learnings appear here once a video is approved and you keep some.</p>';

  const families = brands.flatMap((b) => [b.fonts?.display, b.fonts?.body]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ultrademo dashboard</title>
${live ? '<link rel="stylesheet" href="/ui/ui.css">' : ''}<style>${live ? '' : uiCssInline()}
${DASH_CSS}
${fontFaces(families, url)}
.topacts{display:flex;gap:10px;align-items:center;flex-wrap:wrap}a.newbtn{text-decoration:none}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--text);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;max-width:560px;box-shadow:0 8px 30px rgba(0,0,0,.25)}
a.btn{font:600 13px var(--ud-body);border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:999px;padding:7px 13px;text-decoration:none;display:inline-block}a.btn.dark{background:var(--text);color:var(--surface);border-color:var(--text)}
button[disabled],input[disabled],select[disabled]{opacity:.55;cursor:not-allowed}
.lprop li label{display:grid;grid-template-columns:auto 110px minmax(0,1fr);gap:10px;align-items:center}.ptext,.ladd input,.ledit-in{font:inherit;font-size:14px;padding:5px 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);width:100%;box-sizing:border-box}
.ladd{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:8px;margin-top:10px}.ladd select{font:inherit;font-size:13px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text)}
.vrow.hide,.vrow[hidden]{display:none}
.upd{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:0 0 16px;padding:10px 14px;border:1px solid var(--line);border-left:3px solid var(--text);border-radius:10px;background:var(--surface);font-size:14px}.upd code{font-size:12.5px;padding:3px 6px;border-radius:6px;background:var(--line);overflow-wrap:anywhere}
</style></head><body><main>
<div class="ud-pin">${live ? UD_HEAD : udHeadInline()}</div>
<div class="top"><div><h1>Your videos</h1>${live ? '<span class="live"><i></i>Live: the buttons work while Claude Code runs the skill.</span>' : `<span class="live off" id="saved-note"><i></i>A saved copy, written ${e(data.at.slice(0, 16).replace('T', ' '))}. Its buttons open Claude Code with the request typed in: press Enter there.</span>`}</div>${live ? '<button class="newbtn newvid" type="button" data-brand="">Start a new video</button>' : `<span class="topacts">${ask('open the dashboard', 'Open in Claude Code')}${ask('start a new video', 'Start a new video', 'newbtn')}</span>`}</div>
${updateBanner(data.update)}<nav class="tabs" role="tablist"><button class="on" data-view="videos">Videos<span class="n">${videos.length}</span></button><button data-view="brands">Brands<span class="n">${brands.length}</span></button><button data-view="learnings">Learnings${proposedCount ? `<span class="waiting">${proposedCount} to confirm</span>` : ''}</button></nav>
<section class="view" id="v-videos"><div class="filters"><button class="on" data-f="">All</button>${brands.map((b) => `<button data-f="b:${e(b.slug)}">${e(b.name)}</button>`).join('')}<button data-f="s:open">In progress</button><button data-f="s:final">Final</button></div><div class="vlist">${videoRows}</div></section>
<section class="view" id="v-brands" hidden><div class="bgrid">${brandCards}</div></section>
<section class="view" id="v-learnings" hidden>${learnBlocks}<p class="foot">Claude uses only the learnings that are on. Each one says which video it came from; switch it off for a while, edit it, or remove it.</p></section>
<p class="foot">Usage statistics are ${data.telemetry ? 'on: anonymous counts of steps, video types and formats, never your product, words or frames. Switch off: <code>npm run telemetry -- off</code>' : 'off'}.</p>
<p class="foot">${live ? 'The saved copy, ultrademo-dashboard.html beside the projects folder, is rewritten after every step, so it opens from Finder even when nothing is running.' : 'This file is rewritten after every step.'}</p>
</main>
<script>
(function(){
  var LIVE = ${live ? 'true' : 'false'};
  function $$(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function view(v){ $$('.tabs button').forEach(function(x){ x.classList.toggle('on', x.dataset.view === v); }); $$('.view').forEach(function(x){ x.hidden = x.id !== 'v-' + v; }); }
  $$('.tabs button').forEach(function(b){ b.addEventListener('click', function(){ view(b.dataset.view); }); });
  $$('.filters button').forEach(function(b){ b.addEventListener('click', function(){
    $$('.filters button').forEach(function(x){ x.classList.toggle('on', x === b); });
    var f = b.dataset.f;
    $$('.vrow').forEach(function(r){ var s = Number(r.dataset.stage); r.hidden = f.indexOf('b:') === 0 ? r.dataset.brand !== f.slice(2) : f === 's:open' ? s >= 4 : f === 's:final' ? s < 4 : false; });
  }); });
  $$('.showall').forEach(function(b){ b.addEventListener('click', function(){ var c = b.closest('.bcard'); c.classList.toggle('open'); b.textContent = c.classList.contains('open') ? 'Show less' : 'Show all'; }); });
  $$('.golearn').forEach(function(b){ b.addEventListener('click', function(){ view('learnings'); var t = document.getElementById('learn-' + b.dataset.brand); if (t) t.scrollIntoView({ behavior: 'smooth' }); }); });
  $$('.copy').forEach(function(b){ b.addEventListener('click', function(){ (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).then(function(){ b.textContent = 'Copied: paste it in Claude Code'; }, function(){ prompt('Copy this line into Claude Code:', b.dataset.copy); }); }); });
  $$('a.ask').forEach(function(a){ a.addEventListener('click', function(){
    try { navigator.clipboard.writeText(a.dataset.copy); } catch (err) {}
    var t = document.createElement('div'); t.className = 'toast';
    t.textContent = 'Opening Claude Code with the request typed in: press Enter there. Nothing opened? The line is copied: paste it into Claude Code in the scaffold folder.';
    document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 9000);
  }); });
  if (!LIVE) {
    // the saved copy points to the live dashboard when it is running
    fetch('http://127.0.0.1:${LIVE_PORT}/api/ping', { mode: 'no-cors', cache: 'no-store' }).then(function(){ var n = document.getElementById('saved-note'); if (n) n.innerHTML = '<i></i>The live dashboard is running: <a href="http://127.0.0.1:${LIVE_PORT}/">open it</a> to use the buttons.'; }).catch(function(){});
    return;
  }
  function post(u, body){ return fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function(r){ return r.json(); }); }
  function done(j){ if (j && j.ok) location.reload(); else alert((j && j.error) || 'That did not work.'); }
  $$('.newvid').forEach(function(b){ b.addEventListener('click', function(){ b.disabled = true; b.textContent = 'Opening a brief…'; post('/api/new-video', { brand: b.dataset.brand || null }).then(function(j){ if (j.ok) location.href = j.url; else { b.disabled = false; alert(j.error); } }); }); });
  $$('.vremove').forEach(function(b){ b.addEventListener('click', function(){
    if (!confirm('Remove "' + b.dataset.title + '" from the dashboard?\\n\\nIts pages stop and its folder moves to projects/_removed (with its final files, if any). Nothing is deleted: move it back from Finder, or empty _removed when you are sure.')) return;
    b.disabled = true; post('/api/remove', { project: b.dataset.project }).then(done);
  }); });
  $$('.ltog').forEach(function(i){ i.addEventListener('change', function(){ var r = i.closest('.lrow'); post('/api/learning', { brand: r.dataset.brand, id: r.dataset.id, on: i.checked }).then(done); }); });
  $$('.ldel').forEach(function(b){ b.addEventListener('click', function(){ var r = b.closest('.lrow'); if (confirm('Remove this learning?')) post('/api/learning', { brand: r.dataset.brand, id: r.dataset.id, remove: true }).then(done); }); });
  $$('.ledit').forEach(function(b){ b.addEventListener('click', function(){
    var r = b.closest('.lrow'), t = r.querySelector('.ltext');
    if (b.textContent === 'Save') { post('/api/learning', { brand: r.dataset.brand, id: r.dataset.id, text: r.querySelector('.ledit-in').value }).then(done); return; }
    var inp = document.createElement('input'); inp.className = 'ledit-in'; inp.value = t.textContent; t.textContent = ''; t.appendChild(inp); inp.focus(); b.textContent = 'Save';
  }); });
  $$('.pkeep').forEach(function(b){ b.addEventListener('click', function(){
    var box = b.closest('.lprop');
    var picks = Array.prototype.map.call(box.querySelectorAll('li[data-id]'), function(li){ return { id: li.dataset.id, keep: li.querySelector('input[type=checkbox]').checked, text: li.querySelector('.ptext').value }; });
    b.disabled = true; post('/api/learnings-keep', { project: box.dataset.project, picks: picks }).then(done);
  }); });
  $$('.ladd').forEach(function(f){ f.addEventListener('submit', function(ev){ ev.preventDefault(); var t = f.querySelector('input').value.trim(); if (!t) return; post('/api/learning-add', { brand: f.dataset.brand, kind: f.querySelector('select').value, text: t }).then(done); }); });
})();
</script></body></html>`;
}
