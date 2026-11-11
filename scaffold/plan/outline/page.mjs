// page.mjs — the outline page (D-91): the moments in order, editable; what each needs and whether its screen was
// reached; chapters for a long video (D-93); and, when a step changes data, the two confirmations. Confirm sends the
// edited moments and the ticks to /api/confirm.
import { UD_HEAD, progressBar } from '../intake/page.mjs';
import { BEATS } from '../schema.mjs';
import { SOURCES, dataChanges, chaptersOf } from './outline.mjs';

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SOURCE_WORDS = { live: 'The product, signed in', mockup: 'An HTML mockup', figma: 'Figma', screenshot: 'A screenshot', site: 'The public site', rebuilt: 'Drawn, no screen' };
const BEAT_WORDS = { hook: 'Opening', step: 'Step', close: 'Closing', cta: 'Call to action', problem: 'Problem', reveal: 'Reveal', proof: 'Proof', breadth: 'Breadth', feature: 'Feature', lifecycle: 'Lifecycle', comparison: 'Comparison', punchline: 'Punchline' };
const STATE = { reached: ['ok', 'Screen reached'], 'not-reached': ['bad', 'Screen not reached'], 'at-capture': ['wait', 'Checked when capturing'], 'not-placed': ['wait', 'Found when capturing'], 'not-needed': ['quiet', 'No screen needed'] };
const SIGN_PATH_WORDS = { 'own-browser': ['Sign-in: through your own browser', 'The screens behind the sign-in are checked when the steps are captured.'], 'dedicated-profile': ['Sign-in: a dedicated profile', 'The screens behind the sign-in are checked when the steps are captured.'], token: ['Sign-in: a token or link', 'The screens behind the sign-in are checked when the steps are captured.'], public: ['Public pages only', 'No sign-in is needed.'] };
const NOFILL = 'autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"';
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const CSS = `
body{margin:0;background:var(--surface-soft);color:var(--text);font-family:var(--ud-body)}
h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(26px,3.4vw,34px);letter-spacing:-.035em;line-height:1.05;margin:18px 0 6px}
h2{font-family:var(--ud-display);font-weight:800;letter-spacing:-.02em;font-size:20px}
main{max-width:1060px;margin:0 auto;padding:0 20px 120px}
button.primary{font:600 16px var(--ud-body);padding:12px 22px;border-radius:999px;background:var(--action);color:var(--on-action);border:1px solid var(--ink);cursor:pointer;white-space:nowrap;flex:none}
code{font-size:.92em}
.lead{color:var(--muted);max-width:68ch}
.sum{display:flex;flex-wrap:wrap;gap:10px 22px;margin:14px 0 20px;font-size:14px}
.sum b{font-weight:600}
.signin{display:flex;gap:16px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin:0 0 20px;background:var(--surface)}
.signin.bad{border-color:#d33;background:color-mix(in srgb,#d33 6%,var(--surface))}
.signin .si-t b{display:block;font-size:15px;margin-bottom:2px}.signin .si-t span{font-size:14px;color:var(--muted)}
.signin .si-m{display:flex;gap:12px;align-items:center;flex:none;font-size:13px;color:var(--muted);white-space:nowrap}
.chap{margin:26px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);display:flex;justify-content:space-between}
.mom{display:grid;gap:14px;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:12px 0;background:var(--surface)}
.mom.change{border-color:#e0a100;box-shadow:inset 4px 0 0 #e0a100}
.mom input[type=text],.mom textarea,.mom select{font:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--surface-soft);color:inherit;min-width:0;width:100%;box-sizing:border-box}
.mhead{display:flex;gap:10px;align-items:center}
.mom .n{flex:none;width:28px;height:28px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-weight:700;font-size:13px}
.mom input.name{flex:1 1 auto;font-weight:600;font-size:15px;background:transparent}
.mom select.beat{flex:none;width:150px}
.secw{flex:none;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}.mom input.secs{width:60px;text-align:right}
.tools{flex:none;display:flex;gap:4px;margin-left:4px}
.mbody{display:grid;gap:14px;padding-left:38px}
.fld{display:grid;gap:6px}
.lbl{font-size:13px;font-weight:500}.lbl i{font-style:normal;font-weight:400;color:var(--muted)}
.mom textarea{min-height:64px;resize:vertical;line-height:1.45}
.srcrow{display:grid;grid-template-columns:220px minmax(0,1fr) auto;gap:10px;align-items:center}
.chk{display:flex;gap:6px;align-items:center;font-size:13px;white-space:nowrap}
.hint{font-size:12px;color:var(--muted)}
.mfoot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-left:38px;padding-top:12px;border-top:1px dashed var(--line)}
.mom .shot{width:180px;aspect-ratio:16/10;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--line)}
.badge{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}
.badge.ok{border-color:#2f8f4e;color:#2f8f4e}.badge.bad{border-color:#d33;color:#d33}.badge.wait{color:var(--muted)}.badge.quiet{opacity:.6}
.why{font-size:13px;color:var(--muted)}
.tools button,.add{font:inherit;font-size:13px;border:1px solid var(--line);background:transparent;border-radius:8px;padding:5px 10px;cursor:pointer;color:inherit}
.changebox{border:2px solid #e0a100;border-radius:14px;padding:18px 20px;margin:26px 0;background:color-mix(in srgb,#e0a100 7%,var(--surface-soft))}
.changebox ul{margin:10px 0 14px 18px;line-height:1.6}
.changebox.flash{animation:none;box-shadow:0 0 0 6px color-mix(in srgb,#e0a100 35%,transparent);transition:box-shadow .3s}
.changebox{transition:box-shadow .6s}
.changebox label{display:flex;gap:10px;align-items:flex-start;margin:8px 0}
.bar #msg{flex:1 1 auto;min-width:0}
.bar{position:sticky;bottom:0;display:flex;gap:14px;align-items:center;justify-content:flex-end;padding:14px 0;background:var(--surface-soft);border-top:1px solid var(--line)}
@media (max-width:700px){
  .signin{flex-direction:column;align-items:flex-start}
  .mhead{flex-wrap:wrap}.mom input.name{flex:1 1 100%;order:2}.mom .n{order:1}.mom select.beat{order:3;flex:1 1 auto;width:auto}.secw{order:4}.tools{order:5;margin-left:auto}
  .mbody,.mfoot{padding-left:0;margin-left:0}
  .srcrow{grid-template-columns:1fr}
  .bar{flex-wrap:wrap}
}
.notes{font-size:14px;border-left:3px solid var(--line);padding:4px 12px;color:var(--muted);margin:12px 0}
`;

/** The outline page. `outline` is plan.video.intake.outline (with signin results once tested). */
export function renderOutlinePage({ video, outline, waiting = false }) {
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outline · Ultrademo</title>
<link rel="stylesheet" href="/ui/ui.css"><style>${CSS}</style></head><body><main><div class="ud-pin">${UD_HEAD}${progressBar('outline')}</div>`;
  if (waiting || !outline) {
    return `${head}<h1>The outline</h1><p class="lead">Ultrademo is writing the outline from your brief: the moments in order and what each one needs. This page fills in by itself.</p><p class="small muted" id="w">Waiting…</p></main><script>setTimeout(function(){ location.reload(); }, 3000);</script></body></html>`;
  }
  const ms = outline.moments || [];
  const results = outline.signin?.results || {};
  const total = ms.reduce((a, m) => a + (m.seconds || 0), 0);
  const changes = dataChanges(outline);
  const chapters = chaptersOf(outline);
  const confirmed = outline.status === 'confirmed';
  const signBad = outline.signin && outline.signin.signed_in === false;
  const tutorial = video.template === 'tutorial';
  const opt = (list, words, v) => list.map((x) => `<option value="${x}"${x === v ? ' selected' : ''}>${e(words[x] || x)}</option>`).join('');
  const card = (m, i) => {
    const r = results[i] || null;
    const [cls, word] = r ? (STATE[r.state] || ['wait', r.state]) : ['wait', outline.signin ? '—' : 'Not tested yet'];
    return `<div class="mom${m.data_change ? ' change' : ''}" data-i="${i}">
<div class="mhead"><span class="n">${i + 1}</span><input type="text" class="name" value="${e(m.name)}" aria-label="Title of this moment" ${NOFILL}><select class="beat" aria-label="Kind of moment">${opt(BEATS, BEAT_WORDS, m.beat)}</select><label class="secw"><input type="text" class="secs" value="${e(m.seconds)}" aria-label="Seconds" ${NOFILL}>s</label><div class="tools"><button type="button" data-act="up" title="Move up">↑</button><button type="button" data-act="down" title="Move down">↓</button><button type="button" data-act="del" title="Remove">✕</button></div></div>
<div class="mbody">
  <div class="fld"><span class="lbl">What happens on screen <i>(This is the outline for the scene, not the narration: the script will be written in the next page)</i></span><textarea class="what" aria-label="What happens on screen" ${NOFILL}>${e(m.what)}</textarea></div>
  <div class="fld"><span class="lbl">Where its screens come from</span><div class="srcrow"><select class="source" aria-label="Where its screens come from">${opt(SOURCES, SOURCE_WORDS, m.source)}</select><input type="text" class="url" value="${e(m.url)}" placeholder="Page address, e.g. ${e((video.url || 'https://app.example.com').replace(/\/$/, ''))}/agents" aria-label="The page's address in your product" ${NOFILL}><label class="chk"><input type="checkbox" class="sign"${m.sign_in ? ' checked' : ''}> Behind your sign-in</label></div><span class="hint">The page address is optional: left empty, it is found when capturing.</span></div>
  <div class="fld"><span class="lbl">What it creates or changes in your product</span><input type="text" class="change" value="${e(m.data_change)}" placeholder="Nothing: it only looks" aria-label="What it creates or changes" ${NOFILL}></div>
  ${chapters.length || m.chapter ? `<div class="fld"><span class="lbl">Chapter</span><input type="text" class="chapter" value="${e(m.chapter)}" aria-label="Chapter" ${NOFILL}></div>` : '<input type="hidden" class="chapter" value="">'}
</div>
<div class="mfoot"><span class="badge ${cls}">${e(word)}</span>${r?.why ? `<span class="why">${e(r.why[0].toUpperCase() + r.why.slice(1))}.</span>` : ''}${r?.shot ? `<img class="shot" src="/shot/${e(r.shot)}" alt="">` : ''}</div>
</div>`;
  };
  let body = '', lastChap = null;
  ms.forEach((m, i) => {
    if (m.chapter && m.chapter !== lastChap) { const c = chapters.find((x) => x.name === m.chapter); body += `<div class="chap"><span>${e(m.chapter)}</span><span>${c ? clock(c.seconds) : ''}</span></div>`; lastChap = m.chapter; }
    body += card(m, i);
  });
  const tested = new Date(outline.signin?.tested_at || 0);
  const testedWords = outline.signin ? `Tested ${tested.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${String(tested.getHours()).padStart(2, '0')}:${String(tested.getMinutes()).padStart(2, '0')}` : '';
  const [signTitle, signText] = signBad ? ['The sign-in did not work', `${outline.signin.why || ''}. Fix it on the brief or in the env file, then test again.`]
    : outline.signin?.signed_in ? ['Signed in with the demo account', 'Each screen below shows whether it was reached.']
    : SIGN_PATH_WORDS[outline.signin?.path] || ['Sign-in', ''];
  const signLine = !outline.signin ? '' : `<div class="signin${signBad ? ' bad' : ''}"><div class="si-t"><b>${e(signTitle)}</b><span>${e(signText)}</span></div><div class="si-m"><span>${e(testedWords)}</span><button type="button" class="add" id="retest">Test again</button></div></div>`;
  const changeBox = changes.length ? `<section class="changebox" id="changebox">
<h2 style="margin:0 0 4px">${changes.length} step${changes.length === 1 ? '' : 's'} would change data in your product</h2>
<p class="small" style="margin:0">To show these, Ultrademo would create or change the following in the signed-in account:</p>
<ul>${changes.map((c) => `<li><b>Step ${c.index + 1}, ${e(c.name)}:</b> ${e(c.change)}</li>`).join('')}</ul>
<label><input type="checkbox" id="ok-demo"${outline.data_ok?.demo_account ? ' checked' : ''}> <span><b>This sign-in is a demo or test account.</b> Nothing real is affected.</span></label>
<label><input type="checkbox" id="ok-create"${outline.data_ok?.creates_ok ? ' checked' : ''}> <span><b>Creating these records is okay.</b> Only what is listed above; nothing is deleted or sent.</span></label>
<p class="small muted" style="margin:6px 0 0">Click the checkboxes to allow Ultrademo to follow through the action sequence. Otherwise the steps that need to show data inputs will be illustrated (rebuilt) without actually navigating your app.</p>
</section>` : '';
  return `${head}
<h1>The outline</h1>
<p class="lead">The ${tutorial ? 'steps' : 'moments'} of your video in order, and what each one needs. Change anything: rename, reorder, add or remove. The directions and the narration script are written from what you confirm here, on the next page.</p>
<div class="sum"><span><b>${ms.length}</b> ${tutorial ? 'moments' : 'moments'}</span><span>about <b>${clock(total)}</b>${video.length_s ? ` against ${clock(video.length_s)}` : ''}</span>${chapters.length ? `<span><b>${chapters.length}</b> chapters</span>` : ''}${changes.length ? `<span><b>${changes.length}</b> change data</span>` : ''}${confirmed ? '<span><b>Confirmed</b></span>' : ''}</div>
${outline.notes ? `<p class="notes">${e(outline.notes)}</p>` : ''}
${signLine}
<div id="moments">${body}</div>
<button type="button" class="add" id="add">+ Add a moment</button>
${changeBox}
<div class="bar"><span class="small muted" id="msg" aria-live="polite"></span><button type="button" class="primary" id="confirm">${confirmed ? 'Confirm again' : 'Confirm the outline'}</button></div>
</main>
<script>
(function(){
  var $ = function(s, r){ return (r || document).querySelector(s); }, $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var box = $('#moments');
  function renumber(){ $$('.mom', box).forEach(function(m, i){ $('.n', m).textContent = i + 1; }); }
  box.addEventListener('click', function(ev){
    var b = ev.target.closest('button[data-act]'); if (!b) return;
    var m = b.closest('.mom'), act = b.getAttribute('data-act');
    if (act === 'up' && m.previousElementSibling && m.previousElementSibling.classList.contains('mom')) box.insertBefore(m, m.previousElementSibling);
    if (act === 'down' && m.nextElementSibling) box.insertBefore(m.nextElementSibling, m);
    if (act === 'del' && $$('.mom', box).length > 1) m.remove();
    renumber();
  });
  $('#add').addEventListener('click', function(){
    var last = $$('.mom', box).pop(); var c = last.cloneNode(true);
    $('.name', c).value = 'New moment'; $('.what', c).value = ''; $('.url', c).value = ''; $('.change', c).value = ''; $('.sign', c).checked = false;
    $('.badge', c).textContent = 'Not tested yet'; $('.badge', c).className = 'badge wait'; var w = $('.why', c); if (w) w.remove(); var s = $('.shot', c); if (s) s.remove();
    c.classList.remove('change'); box.appendChild(c); renumber(); $('.name', c).focus();
  });
  box.addEventListener('input', function(ev){ if (ev.target.classList.contains('change')) ev.target.closest('.mom').classList.toggle('change', !!ev.target.value.trim()); });
  function moments(){ return $$('.mom', box).map(function(m){ return { name: $('.name', m).value, beat: $('.beat', m).value, what: $('.what', m).value, source: $('.source', m).value, url: $('.url', m).value, sign_in: $('.sign', m).checked, data_change: $('.change', m).value, seconds: Number($('.secs', m).value), chapter: $('.chapter', m).value }; }); }
  var msg = $('#msg'), warned = false;
  // the ticks change what Confirm does: both ticked, the steps are followed through; otherwise they are rebuilt
  var confirmWord = $('#confirm').textContent;
  function ticksChanged(){
    var both = $('#ok-demo') && $('#ok-demo').checked && $('#ok-create') && $('#ok-create').checked;
    if (both) { warned = false; msg.textContent = ''; $('#confirm').textContent = confirmWord; }
    else if (warned) $('#confirm').textContent = 'Confirm without them';
  }
  ['#ok-demo', '#ok-create'].forEach(function(s){ var c = $(s); if (c) c.addEventListener('change', ticksChanged); });
  $('#confirm').addEventListener('click', function(){
    var body = { moments: moments(), demo_account: $('#ok-demo') ? $('#ok-demo').checked : false, creates_ok: $('#ok-create') ? $('#ok-create').checked : false };
    var changes = body.moments.filter(function(m){ return m.data_change.trim(); }).length;
    // without both ticks, say what happens and ask for a second click (no pop-up)
    if (changes && !(body.demo_account && body.creates_ok) && !warned) {
      warned = true;
      msg.textContent = 'Click the checkboxes to allow Ultrademo to follow through the action sequence. Otherwise the steps that need to show data inputs will be illustrated (rebuilt) without actually navigating your app.';
      $('#confirm').textContent = 'Confirm without them';
      // take them to the checkboxes
      var cb = $('#changebox');
      if (cb) { cb.scrollIntoView({ behavior: 'smooth', block: 'center' }); cb.classList.add('flash'); setTimeout(function(){ cb.classList.remove('flash'); }, 1600); var first = $('#ok-demo'); if (first && !first.checked) setTimeout(function(){ first.focus({ preventScroll: true }); }, 450); }
      return;
    }
    msg.textContent = 'Saving…';
    fetch('/api/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function(r){ return r.json(); }).then(function(r){
      msg.textContent = r.ok ? 'Confirmed. Ultrademo is writing the directions; the direction page opens when they are ready.' : (r.problems || [r.error]).join(' ');
      if (r.ok) $('#confirm').textContent = 'Confirm again';
    }).catch(function(){ msg.textContent = 'Could not save: is the outline page still running?'; });
  });
  var rt = $('#retest'); if (rt) rt.addEventListener('click', function(){ msg.textContent = 'Testing the sign-in…'; fetch('/api/retest', { method: 'POST' }).then(function(r){ return r.json(); }).then(function(r){ if (r.ok) location.reload(); else msg.textContent = r.error || 'The test did not run.'; }); });
})();
</script></body></html>`;
}
