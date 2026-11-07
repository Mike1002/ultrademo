// Shared pieces of the three gate pages: the milestone timeline, the brand line, and the CSS that keeps
// inputs visible and sections outlined on the dark glass. narrative.mjs (gate 1) and review.mjs (gates 2
// and 3) both use it, so the gates read as one product.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

export const STEPS = [
  {id: 'gather', label: 'Gather', sub: 'read-only capture'},
  {id: 'gate1', label: 'Gate 1', sub: 'story', gate: true},
  {id: 'stills', label: 'Stills', sub: 'nothing spent'},
  {id: 'gate2', label: 'Gate 2', sub: 'scenes', gate: true},
  {id: 'build', label: 'Build', sub: 'record, narrate, score'},
  {id: 'verify', label: 'Verify', sub: 'measured'},
  {id: 'gate3', label: 'Gate 3', sub: 'final', gate: true},
  {id: 'reuse', label: 'Reuse', sub: 'library'},
];

// A milestone timeline: steps before `current` are done, `current` is lit, the rest wait.
export const milestones = (current) => {
  const idx = Math.max(0, STEPS.findIndex((s) => s.id === current));
  return `<ol class="milestones" aria-label="Where this page sits in the loop">${STEPS.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : 'next'}${s.gate ? ' ms-gate' : ''}"><span class="dot">${i < idx ? '✓' : s.gate ? '◆' : ''}</span><b>${esc(s.label)}</b><small>${esc(s.sub)}</small></li>`).join('')}</ol>`;
};

export const brandLine = (text) => `<div class="brand"><span class="mark">U</span><b>Ultra<em>demo</em></b><span>· ${esc(text)}</span></div>`;

export const gateChip = (n, name) => `<span class="gatechip">Gate ${n} of 3 · ${esc(name)}</span>`;

// Appended after each page's own CSS. Inputs: light field on the dark glass with a visible border and a
// strong focus ring. Sections: a titled outline so each block reads as one thing. Milestones: dots on a
// line, done / now / next.
export const sharedCss = `
.gatechip{display:inline-block;font:600 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:#1c1a12;background:linear-gradient(180deg,#ffe28a,var(--yellow));border-radius:999px;padding:6px 14px;margin:0 0 14px}
.milestones{display:flex;list-style:none;margin:0 0 26px;padding:14px 6px 8px;gap:0;position:relative;border:1px solid var(--line);border-radius:16px;background:var(--glass);overflow-x:auto}
.milestones li{flex:1;min-width:92px;position:relative;text-align:center;padding:0 4px 4px}
.milestones li::before{content:"";position:absolute;top:13px;left:-50%;width:100%;height:2px;background:rgba(255,255,255,.12)}
.milestones li:first-child::before{display:none}
.milestones li.done::before{background:var(--yellow)}
.milestones li.now::before{background:linear-gradient(90deg,var(--yellow),rgba(247,201,72,.35))}
.milestones .dot{position:relative;z-index:1;display:grid;place-items:center;width:28px;height:28px;margin:0 auto 8px;border-radius:50%;border:2px solid rgba(255,255,255,.22);background:#15181d;color:#15181d;font:700 12px var(--mono)}
.milestones .done .dot{background:var(--yellow);border-color:var(--yellow);color:#1c1a12}
.milestones .now .dot{background:var(--yellow);border-color:#fff3c4;color:#1c1a12;box-shadow:0 0 0 6px rgba(247,201,72,.22)}
.milestones .next.ms-gate .dot{color:rgba(255,255,255,.35);border-style:dashed}
.milestones b{display:block;font:600 12px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.milestones .now b{color:var(--fg)}.milestones .done b{color:#e8d48a}
.milestones small{display:block;font:11px var(--sans);color:var(--muted);opacity:.8}
.milestones .ms-gate b{color:#d9c37a}.milestones .ms-gate.now b{color:var(--yellow)}
.panel,.card{border:1px solid rgba(255,255,255,.16);box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 0 0 1px rgba(0,0,0,.35),0 20px 50px rgba(0,0,0,.35)}
.panel h2,.panel h3:first-child,.card header h2{padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:14px}
.section-label{display:inline-block;font:600 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--yellow);margin:0 0 8px}
select,input.note,textarea.note,.review select,.review input{background:rgba(255,255,255,.09)!important;border:1px solid rgba(255,255,255,.28)!important;color:var(--fg)!important}
select:hover,input.note:hover,textarea.note:hover,.review select:hover,.review input:hover{border-color:rgba(255,255,255,.45)!important}
select:focus,input.note:focus,textarea.note:focus,.review select:focus,.review input:focus{border-color:var(--yellow)!important;box-shadow:0 0 0 3px rgba(247,201,72,.28)!important;background:rgba(255,255,255,.12)!important}
input.note::placeholder,textarea.note::placeholder,.review input::placeholder{color:rgba(243,241,234,.5)!important}
select option{background:#1a1d22;color:var(--fg)}
.decide label,.passes label{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.22)}
.decide label:has(input:checked){border-color:var(--yellow);background:rgba(247,201,72,.12)}
`;
