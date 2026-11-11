// page.mjs — the three screens of the direction step (D-65), the confirmation
// page and the static preview, as HTML strings.
//
// One card grammar across the step: the Linen tokens of plan/to-html.mjs, the
// same padding, border and radius on every card, equal heights within a row
// through the grid, long text clamped, every image or video in a 16:9 box.
// Every word a person reads is a plain word (D-55, D-64); the file on disk
// keeps the working field names. Choices are made by eye (D-56): the style
// previews, the signature render per direction, swatches, rendered type, a
// music player, a voice sample. One saturated-yellow action per screen (D-09).

import path from 'node:path';
import { DIALS, HOOK_ANGLES, HOOK_ROUTES, TRANSITIONS } from '../schema.mjs';
import { SIGNATURE_KINDS, readingTime, allocate, lengthRange, LETTERS, signatureMoment, momentRules } from './schema.mjs';
import { sketchColours, cellsHtml, sketchCss, frameHtml, setSketchFormat } from './sketch.mjs';
import { castFromDirection } from './schema.mjs';
import { loadCatalogue } from '../../tts/catalogue.mjs';
import { UD_HEAD, progressBar, musicTracks } from '../intake/page.mjs';

const e = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nice = (s) => String(s ?? '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const jsonForScript = (obj) => JSON.stringify(obj ?? null).replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028').replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
const fontSlug = (family) => String(family).toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Plain words (D-55, D-64; the tables plan/to-html.mjs uses). */
export const WORDS = {
  angle: { 'cold-open': 'Cold open: the product is already in use', 'result-first': 'Result first: the outcome before the how', 'big-claim': 'Big claim', contradiction: 'Contradiction: a common belief, flipped', pain: 'The pain, named', question: 'A question about the pain', 'direct-address': 'Speaks to the viewer directly', 'open-loop': 'An open question the video answers later', promise: 'A promise with its payoff', 'story-open': 'A person and a moment', reveal: 'Withhold, then reveal', 'social-proof': 'Social proof', fomo: 'Urgency' },
  route: { visual: 'what you see', spoken: 'what you hear', 'on-screen-text': 'on-screen text', sound: 'sound', edit: 'the cut' },
  close: { product: 'ends on the product', logo: 'ends on the logo', both: 'ends on the product, then the logo' },
  narration: { voice: 'narrated', 'music-only': 'music only, no narration', hybrid: 'narrated with music' },
  register: { factual: 'factual', balanced: 'balanced', bold: 'bold' },
  dial: { energy: 'Energy', density: 'Density', ground: 'Ground', depth: 'Depth', camera: 'Camera', type: 'Type', texture: 'Texture', colour: 'Colour', product_presence: 'Product presence', sound: 'Sound', voice: 'Voice' },
  field: { viewer: 'Who it is for', claim: 'The key claim', pain_point: 'The pain it solves', proof_moment: 'The aha moment', cta: 'Call to action', template: 'Template', length_s: 'Length', narration: 'Narration', register: 'Copy tone', product_type: 'Product type', look: 'The vibe' },
  transition: { cut: 'hard cut', crossfade: 'crossfade', 'zoom-through': 'zoom through', match: 'match cut', wipe: 'wipe' },
  set: { energetic: 'Energetic set', calm: 'Calm set' },
};
const w = (table, v) => WORDS[table]?.[v] || nice(v);

/** The tokens of plan/to-html.mjs, plus the pale selection surface (D-09), and the one card grammar. */
// the Production page: the working card (the same as the brief's), a row per scene with its still strip
const PRODUCTION_CSS = `
.working .work-head{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start}.working h2{margin:0 0 4px}.working p{margin:0}
.spin{width:28px;height:28px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--fg);animation:udspin .9s linear infinite;margin-top:4px}.spin.stop{animation:none;border-color:var(--fg);background:var(--action)}
@keyframes udspin{to{transform:rotate(360deg)}}
.work-steps{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:7px}.work-steps li{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14.5px}
.work-steps li::before{content:"";flex:none;width:16px;height:16px;border-radius:50%;border:1.5px solid var(--line)}
.work-steps li.now{color:var(--fg);font-weight:600}.work-steps li.now::before{border-color:var(--fg);border-top-color:transparent;animation:udspin .9s linear infinite}
.work-steps li.done{color:var(--fg)}.work-steps li.done::before{content:"✓";display:grid;place-items:center;font-size:11px;font-weight:800;line-height:1;color:var(--card);background:var(--fg);border-color:var(--fg)}
.prows{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:6px}
.prow{display:grid;grid-template-columns:14px minmax(0,220px) 120px minmax(0,1fr);gap:12px;align-items:center;padding:6px 8px;border:1px solid var(--line);border-radius:10px;background:var(--bg)}
.prow .pname{display:flex;flex-direction:column;min-width:0}.prow .pname small{color:var(--muted);font-size:12px}.prow .pstate{font-size:12.5px;color:var(--muted)}
.prow .pdot{width:10px;height:10px;border-radius:50%;background:var(--line)}.prow[data-state="written"] .pdot,.prow[data-state="built"] .pdot{background:#e0b23c}.prow[data-state="passes"] .pdot{background:#2f9e55}.prow[data-state="fixing"] .pdot{background:#d9622b}
.prow[data-state="passes"] .pstate{color:var(--fg);font-weight:600}.prow .pstrip{display:flex;gap:4px;overflow:hidden}.prow .pstrip img{display:block;flex:1 1 0;min-width:0;max-width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:4px;border:1px solid var(--line);cursor:zoom-in}
.light{position:fixed;inset:0;z-index:50;background:rgba(10,12,8,.82);display:flex;align-items:center;justify-content:center;padding:24px}.light[hidden]{display:none}
.light figure{margin:0;max-width:min(1200px,94vw)}.light img{display:block;width:100%;border-radius:8px;background:#fff}.light figcaption{display:flex;gap:10px;align-items:center;justify-content:center;color:#fff;margin-top:10px}.light figcaption button{padding:4px 12px}
@media(max-width:760px){.prow{grid-template-columns:14px 1fr auto}.prow .pstrip{grid-column:1/-1}}
.nudge{margin-top:16px;padding:12px 14px;border:1.5px dashed var(--fg);border-radius:var(--radius-md);background:var(--pale)}.nudge p{margin:0 0 8px}
.copyrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.copyrow code{font:500 14px var(--font-mono);padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card)}
details.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius-flow);padding:var(--space-4) var(--space-5);margin:14px 0}
details.saved-sum>summary{cursor:pointer;list-style:none;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}details.saved-sum>summary::-webkit-details-marker{display:none}
details.saved-sum>summary::before{content:"▸";color:var(--muted)}details.saved-sum[open]>summary::before{content:"▾"}details.saved-sum[open]>summary{margin-bottom:12px}
aside.info{margin:8px 0 0;padding:14px 18px;border:1px dashed var(--line);border-radius:var(--radius-md);color:var(--muted);font-size:14px}
aside.info h3{margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;font-family:var(--font-mono);font-weight:500}aside.info ul{margin:0;padding-left:18px}aside.info li{margin:3px 0}`;

const CSS = `
/* The Ultrademo design system, Flow (plan/ui/ui.css, linked first): the page's names map onto its role tokens. */
:root{--bg:var(--surface-soft);--card:var(--surface);--fg:var(--text);--muted:var(--text-muted);--pale:var(--surface-highlight);--good:#2f7a3d;--bad:#b23a2e;--mid:#8a6400}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--good:#6cc27c;--bad:#ff8a7a;--mid:#e0b23c}}
:root[data-theme="dark"]{--good:#6cc27c;--bad:#ff8a7a;--mid:#e0b23c}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--fg);font:15.5px/1.5 var(--ud-body);overflow-x:hidden}
.ud-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 22px}
main{max-width:1280px;margin:0 auto;padding:22px 16px 120px;min-width:0}
h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(28px,4vw,40px);letter-spacing:-.035em;line-height:1.05;margin:4px 0 8px;text-wrap:balance}h2{font-size:16px;margin:0;line-height:1.3}h3{font-size:12px;margin:0;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
.lead{color:var(--muted);margin:0 0 14px}.lead a,.steps a,.links a{color:inherit}
.muted{color:var(--muted)}.small{font-size:12.5px}.mono{font:500 12.5px var(--font-mono)}
.steps{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;padding:0;list-style:none}.steps li{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)}.steps a,.steps span.step{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 10px;text-decoration:none;color:var(--muted);background:var(--card)}.steps .on{background:var(--pale);border-color:var(--fg);color:var(--fg)}.steps .done{color:var(--fg)}
.notice{background:var(--pale);border:1px solid var(--line);border-radius:var(--radius-md);padding:10px 14px;margin:0 0 16px;font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius-flow);padding:18px;min-width:0;display:flex;flex-direction:column;gap:10px;margin:0;position:relative}.card.sel{border-color:var(--fg);background:var(--pale);box-shadow:inset 0 0 0 1px var(--fg)}.card>*{min-width:0}
.grid{display:grid;gap:14px;align-items:stretch;margin:0 0 16px}.cols-3{grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))}.cols-4{grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr))}.dirs{grid-template-columns:1fr}
.card.dir{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:22px;align-items:start}.dir .dinfo{display:flex;flex-direction:column;gap:8px}
@media(max-width:900px){.card.dir{grid-template-columns:1fr}}
.dir details.why{grid-column:1/-1;margin:0}.whygrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 28px;margin-top:8px}.whygrid .kv{grid-template-columns:200px 1fr}@media(max-width:900px){.whygrid{grid-template-columns:1fr}}
.dstory h3{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.skstrip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.vert .skstrip{grid-template-columns:repeat(6,minmax(0,1fr))}.vert .media{aspect-ratio:9/16;width:auto;max-width:100%;height:min(520px,70vh);margin:0 auto}@media(max-width:1100px){.skstrip{grid-template-columns:repeat(2,minmax(0,1fr))}}
.skm{margin:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card)}.skm figcaption{padding:6px 8px 8px;font-size:12px;line-height:1.35}
.skm figcaption b{display:block;font-size:12.5px}.skm figcaption span{color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.media{aspect-ratio:16/9;width:100%;border-radius:8px;border:1px solid var(--line);background:#000;overflow:hidden;position:relative;flex:none}.media video,.media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;margin:0}.media.brand{background:var(--bg)}
.clamp1,.clamp2,.clamp3{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;overflow-wrap:anywhere}.clamp1{-webkit-line-clamp:1}.clamp2{-webkit-line-clamp:2}.clamp3{-webkit-line-clamp:3}
.wrap{overflow-wrap:anywhere}
.pill{display:inline-block;font-size:12px;border:1px solid var(--line);border-radius:999px;padding:1px 8px;background:var(--bg);vertical-align:middle;white-space:nowrap}.pill.proposed{border-style:dashed;color:var(--mid);border-color:var(--mid)}.pill.beat{background:var(--pale)}
.tags{display:flex;flex-wrap:wrap;gap:4px}.tags span{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:1px 8px;color:var(--muted);white-space:nowrap}
[contenteditable]{border-bottom:1px dashed var(--line);padding:0 2px;min-width:1ch;outline:none;border-radius:3px}[contenteditable]:focus{background:var(--pale);border-bottom-color:var(--fg)}
input[type=text],input[type=number],textarea,select{font:inherit;font-size:13.5px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:5px 8px;outline:none;max-width:100%;min-width:0}input:focus,textarea:focus,select:focus{border-color:var(--fg)}textarea{width:100%;min-height:52px;resize:vertical}select{width:100%}
input[type=color]{width:30px;height:24px;border:1px solid var(--line);border-radius:6px;padding:0;background:none;vertical-align:middle;flex:none}
button{font:600 14px/1.1 var(--ud-body);cursor:pointer;border-radius:999px;padding:9px 15px;border:1.5px solid var(--fg);background:var(--card);color:var(--fg)}button:disabled{opacity:.5;cursor:not-allowed}
button.primary{background:var(--action);border-color:var(--ud-action-edge);color:var(--on-action);font-weight:600;padding:13px 24px}
button.quiet{border-color:var(--line);color:var(--muted);padding:5px 10px;font-size:13px}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--bg);padding:12px 16px 16px;border-top:1px solid var(--line);display:flex;align-items:center;gap:12px;flex-wrap:wrap;z-index:5}.bar .status{color:var(--muted);font-size:13.5px;flex:1 1 200px;min-width:0}.bar .status.bad{color:var(--bad)}
.status.working{display:inline-flex;align-items:center;gap:10px;color:var(--fg)}.status .spin{flex:none;width:18px;height:18px;border-radius:50%;border:2.5px solid var(--line);border-top-color:var(--fg);animation:udspin .9s linear infinite}
@keyframes udspin{to{transform:rotate(360deg)}}
.status .nudge{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:6px;padding:6px 10px;border:1.5px dashed var(--fg);border-radius:10px;background:var(--pale)}.status .nudge code{font:500 13px var(--font-mono)}.status .nudge button{padding:4px 12px}
.problems{background:var(--card);border:1px solid var(--bad);border-radius:12px;padding:10px 14px;margin:0 0 14px;display:none}.problems.on{display:block}.problems ul{margin:4px 0 0;padding-left:18px}
.kv{display:grid;grid-template-columns:130px 1fr;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}.kv:last-child{border-bottom:0}.kv>span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em;padding-top:3px}.kv>div{min-width:0;overflow-wrap:anywhere}
@media(max-width:560px){.kv{grid-template-columns:1fr;gap:2px}}
details>summary{cursor:pointer;color:var(--muted);font-size:13.5px}details.fold{border-top:1px solid var(--line);padding-top:8px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px}.filters select{width:auto}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:13px;background:var(--card);cursor:pointer;user-select:none;white-space:nowrap}.chip.on{background:var(--pale);border-color:var(--fg)}
.stylecard{cursor:pointer}.stylecard .name{font-weight:600;font-size:14.5px}.stylecard .meta{display:flex;justify-content:space-between;gap:8px;align-items:center}
.brandframe{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:8% 9%;gap:6%}.brandframe .h{font-weight:800;font-size:clamp(14px,2.2cqw,26px);line-height:1.05;letter-spacing:-.02em}.brandframe .p{display:inline-block;border-radius:999px;padding:3% 6%;font-size:clamp(9px,1.2cqw,13px);font-weight:600;align-self:flex-start}.brandframe .sw{display:flex;gap:4px}.brandframe .sw i{width:12%;aspect-ratio:1;border-radius:3px;border:1px solid rgba(0,0,0,.15)}
.dir .letter{font:700 12px ui-monospace,Menlo,monospace;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:1px 6px;background:var(--bg)}.dir .name{font-size:19px;font-weight:700;line-height:1.2}.dir .look{color:var(--muted);font-size:13.5px}
.dir ol.moments{margin:0;padding-left:20px;font-size:13.5px}.dir ol.moments li{margin:2px 0}.dir ol.moments b{font-weight:600}
.dir .choose{align-self:flex-start;margin-top:auto}
.swgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}.sw{display:flex;align-items:flex-start;gap:6px;padding:4px 2px;background:var(--bg);min-width:0}.sw div{display:flex;flex-direction:column;line-height:1.2;min-width:0;font-size:12px}.sw b{font-weight:600;overflow-wrap:anywhere}.sw small{color:var(--muted);font-size:11px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.typerow{display:grid;grid-template-columns:64px 1fr;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}.typerow>div{min-width:0}.typerow:last-child{border-bottom:0}.typerow .role{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.typerow .sample{line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.typerow select{font-size:12.5px;margin-top:3px}
.dials{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}.dial{border:1px solid var(--line);border-radius:8px;padding:5px 7px;background:var(--bg);min-width:0}.dial em{display:block;font-style:normal;font-size:11px;color:var(--muted)}.dial select{font-size:12.5px;padding:3px 5px;margin-top:2px}.dial .said{display:block;font-size:11.5px;margin-top:3px;color:var(--mid);overflow-wrap:anywhere}.dial.said-on{border-color:var(--mid)}
.yousaid{font-size:13px;margin:0}.yousaid span{display:inline-block;background:var(--pale);border:1px solid var(--line);border-radius:999px;padding:1px 9px;margin:2px 4px 2px 0;font-size:12.5px}
.mrow{display:grid;grid-template-columns:170px minmax(0,1.3fr) 200px minmax(0,1fr);gap:12px;padding:12px 0;border-top:1px solid var(--line);align-items:start}.mrow:first-of-type{border-top:0;padding-top:0}.mrow>div{min-width:0}@media(max-width:900px){.mrow{grid-template-columns:1fr 1fr}}@media(max-width:560px){.mrow{grid-template-columns:1fr}}
.mrow .num{font:700 12px ui-monospace,Menlo,monospace;color:var(--muted)}.mrow .mname{font-weight:600;font-size:14.5px}.mrow .copy{padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:8px}.mrow .copy .h{font-size:21px;font-weight:700;line-height:1.15;overflow-wrap:anywhere}.mrow .copy .s{color:var(--muted);margin-top:4px;overflow-wrap:anywhere}.mrow .copy .k{font:600 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.counter{font-size:12px;color:var(--bad);font-weight:600;margin-top:4px;display:none}.counter.over{display:block}
.mrow .timing{font-size:13px}.mrow .timing input{width:64px;padding:2px 6px;font-size:12.5px}.mrow .timing em{display:block;font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.mrow .carry{font-size:13px}.mrow .carry em{display:block;font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.more{grid-column:1/-1}.more .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;font-size:13px;margin-top:6px}@media(max-width:560px){.more .grid2{grid-template-columns:1fr}}.more em{display:block;font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.more textarea{min-height:40px;font-size:13px}
audio{width:100%;display:block;margin-top:2px}
.sk .grid{margin:10px 0 0}
ol.next{padding-left:20px;margin:0}ol.next li{margin:4px 0}
code{font:12.5px ui-monospace,Menlo,monospace;background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
.srcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.srcgrid figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}.srcgrid img{width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;display:block;background:#fff}.srcgrid figcaption{padding:5px 8px;font-size:12px}
.tabs{display:flex;gap:6px;margin:0 0 14px;flex-wrap:wrap}.tabs button{padding:6px 14px}.tabs button.on{background:var(--pale);border-color:var(--fg)}
.screen[hidden]{display:none}
.todo{background:var(--pale);border:1.5px solid var(--fg);border-radius:var(--radius-md);padding:10px 14px;margin:0 0 16px;font-size:14px}
.sechead{font-family:var(--ud-display);font-size:22px;letter-spacing:-.02em;margin:22px 0 4px}
.scenes{display:grid;gap:12px;margin-top:10px}
.scene.mrow{display:block;background:var(--card);border:1px solid var(--line);border-radius:var(--radius-flow);padding:14px 18px 10px}
.shead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.shead .num{font:700 12.5px ui-monospace,Menlo,monospace;color:var(--muted)}.shead .mname{font-weight:700;font-size:16px}
.shead .stime{margin-left:auto;font-size:13px;white-space:nowrap}.shead .stime input{width:58px;padding:3px 6px;font-size:13px}
.sgoal{margin:4px 0 8px;color:var(--muted);font-size:13px}
.frow{display:grid;grid-template-columns:150px minmax(0,1fr);gap:14px;padding:9px 0;border-top:1px solid var(--line);align-items:start}
.flab{font-size:12.5px;font-weight:600;padding-top:4px}.flab small{display:block;font-weight:400;color:var(--muted);font-size:11.5px}
.frow.needs .copy{border:1.5px solid var(--fg);background:var(--bg)}.frow.needs .mtile{border-color:var(--fg)}
.frow .pair{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:14px}.frow .pair small,.frow small{display:block;color:var(--muted);font-size:11.5px;margin-bottom:2px}
.frow select{max-width:340px}.frow .ed [contenteditable]{border-bottom:1px dashed var(--line)}
.facts{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.facts .pill.on{background:var(--pale);border-color:var(--fg)}
.factpick{width:100%}.factpick summary{display:inline;cursor:pointer;font-size:12.5px;text-decoration:underline;color:var(--muted)}.factpick[open] summary{margin-bottom:6px}
@media(max-width:640px){.frow{grid-template-columns:1fr;gap:4px}.frow .pair{grid-template-columns:1fr}}
.allhead{display:flex;gap:10px;align-items:center}
.autopick{display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:repeating-linear-gradient(135deg,var(--pale) 0 12px,var(--bg) 12px 24px);font-weight:700;font-size:18px;text-align:center}.autopick small{font-weight:400;font-size:12px;color:var(--muted)}
/* overall style settings: three columns, the settings card two wide */
.grid.overall{grid-template-columns:repeat(3,minmax(0,1fr))}
.lmgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.lmopt{display:flex;flex-direction:column;gap:3px;cursor:pointer;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--card)}.lmopt.on{border:1.5px solid var(--fg);background:var(--pale)}
.thgrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.thopt{display:flex;flex-direction:column;gap:3px;cursor:pointer;border:1px solid var(--line);border-radius:10px;padding:6px;background:var(--card)}.thopt.on{border:1.5px solid var(--fg);background:var(--pale)}
.thimg{position:relative;display:block;aspect-ratio:16/9;border-radius:6px;overflow:hidden;background:var(--line)}.thimg img{width:100%;height:100%;object-fit:cover;display:block;opacity:0}.thimg.ready img{opacity:1}.thimg.ready .thwait{display:none}.thwait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted)}
.thopt b{font-size:12.5px;line-height:1.25}.thopt small{font-size:11.5px;color:var(--muted);line-height:1.3}
.thtext{display:grid;grid-template-columns:1fr 1fr;gap:8px}.thtext label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}.thtext input{font-size:14px}
.thask{display:grid;gap:4px;font-size:12px;color:var(--muted)}.thask label{font-size:12px}.thaskrow{display:flex;gap:8px;align-items:flex-end}.thaskrow textarea{flex:1;font:inherit;font-size:14px;color:var(--ink,inherit);padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:transparent;min-height:44px}.thtext select{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}
.thintro{display:flex;gap:8px;align-items:center;font-size:13.5px}.thtag{font:600 11px ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--line);border-radius:999px;padding:2px 8px;margin-right:6px}
.thlb{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:60;padding:24px}.thlb[hidden]{display:none}.thlbin{position:relative;background:var(--card);border-radius:14px;padding:16px;max-width:1200px;width:100%;max-height:90vh;overflow:auto}.thx{position:absolute;right:8px;top:6px;font-size:22px;border:0;background:none;cursor:pointer;color:var(--fg)}.thlbimgs{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}.thlbimgs figure{margin:0;flex:1 1 220px}.thlbimgs img{width:100%;border-radius:6px;border:1px solid var(--line)}.thlbimgs figcaption{font-size:12px;color:var(--muted)}
@media(max-width:900px){.thgrid{grid-template-columns:repeat(3,1fr)}.thtext{grid-template-columns:1fr}}
.lmopt b{font-size:13px}.lmopt small{font-size:11.5px;color:var(--muted);line-height:1.3}
.lmstage{position:relative;aspect-ratio:16/9;border-radius:7px;overflow:hidden;background:var(--lm-ground);display:flex;align-items:center;justify-content:center;border:1px solid var(--line)}
.lmstage img{width:72%;max-height:46%;object-fit:contain;position:relative;z-index:1}
.lmstage .lmflash,.lmstage .lmbar,.lmstage .lmglint{position:absolute;opacity:0;z-index:2;pointer-events:none}
.lm-fade-rise img{animation:lmFade 3s cubic-bezier(.2,.8,.2,1) infinite}@keyframes lmFade{0%,8%{opacity:0;transform:translateY(14px)}30%,85%{opacity:1;transform:none}100%{opacity:0}}
.lm-scale-pop img{animation:lmPop 3s infinite}@keyframes lmPop{0%,8%{opacity:0;transform:scale(.5)}22%{opacity:1;transform:scale(1.08)}30%,85%{opacity:1;transform:scale(1)}100%{opacity:0}}
.lm-mark-then-name img{animation:lmMark 3s infinite}@keyframes lmMark{0%,6%{clip-path:inset(0 100% 0 0);opacity:1}18%,30%{clip-path:inset(0 82% 0 0)}55%,88%{clip-path:inset(0 0 0 0)}100%{clip-path:inset(0 0 0 0);opacity:0}}
.lm-wipe-bar img{animation:lmWipe 3s infinite}.lm-wipe-bar .lmbar{top:0;bottom:0;width:10%;background:var(--lm-brand);animation:lmBar 3s infinite}
@keyframes lmWipe{0%,8%{clip-path:inset(0 100% 0 0)}40%,85%{clip-path:inset(0 0 0 0)}100%{clip-path:inset(0 0 0 0);opacity:0}}@keyframes lmBar{0%,8%{left:0;opacity:1}40%{left:92%;opacity:1}45%,100%{left:92%;opacity:0}}
.lm-flash-reveal .lmflash{inset:0;background:var(--lm-brand);animation:lmFlash 3s infinite}.lm-flash-reveal img{animation:lmAfter 3s infinite}
@keyframes lmFlash{0%,6%{opacity:0}12%{opacity:1}24%,100%{opacity:0}}@keyframes lmAfter{0%,18%{opacity:0;transform:scale(1.04)}30%,85%{opacity:1;transform:none}100%{opacity:0}}
.lm-glint img{animation:lmGl 3s infinite}@keyframes lmGl{0%,6%{opacity:0}18%,88%{opacity:1}100%{opacity:0}}
.lm-glint .lmglint{top:-20%;bottom:-20%;width:18%;left:-20%;transform:skewX(-20deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);animation:lmSweep 3s infinite}@keyframes lmSweep{0%,30%{left:-20%;opacity:1}62%{left:110%;opacity:1}63%,100%{opacity:0}}
.lm-none img{animation:lmNone 3s steps(1) infinite}@keyframes lmNone{0%,8%{opacity:0}9%,90%{opacity:1}100%{opacity:0}}
.castrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto;gap:6px;margin:0 0 6px}.castrow input{min-width:0}.castdel{padding:2px 10px}.grid.overall .span3{grid-column:1/-1;display:flex}.grid.overall .span3>.card{flex:1}
.assetrow{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;align-items:start}@media(max-width:800px){.assetrow{grid-template-columns:1fr}}
.logobox{margin:0;border:1px solid var(--line);border-radius:10px;background:#fff;padding:18px;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;min-height:110px}.logobox img{max-width:100%;max-height:60px}.logobox figcaption{font-size:12px;color:var(--muted)}
#card-assets .srcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}#card-assets .srcgrid img{width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:8px}#card-assets figure{margin:0}#card-assets figcaption{font-size:12px}.grid.overall .span2{grid-column:span 2;display:flex}.grid.overall .span2>.card{flex:1}
@media(max-width:1000px){.grid.overall{grid-template-columns:1fr}.grid.overall .span2{grid-column:auto}}
.span2 .dials{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.otherways{margin:14px 0}.otherbox{margin-top:10px;max-width:760px}.otherbox h3{margin:0 0 4px;font-size:16px}.otherbox textarea{width:100%;box-sizing:border-box;margin:10px 0;font:inherit;font-size:15px;line-height:1.45;padding:10px 12px;border:1.5px solid var(--ink);border-radius:10px;background:var(--surface);color:var(--text);resize:vertical}.otherbox .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.otherbox button.dark{background:var(--ink);color:#fff;border:1px solid var(--ink);border-radius:999px;padding:9px 16px;font:600 14px var(--ud-body);cursor:pointer}#card-sound h3{margin:0 0 6px}#card-sound .soundvoice{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
/* colour swatches: the colour itself, no box around it */
.sw{background:none!important}.sw input[type=color]{width:34px;height:26px;border:0;padding:0;border-radius:6px;cursor:pointer}
.sw input[type=color]::-webkit-color-swatch-wrapper{padding:0}.sw input[type=color]::-webkit-color-swatch{border:1px solid var(--line);border-radius:6px}
/* every editable text in a scene looks like a field */
.scene .more [contenteditable],.scene .pair [contenteditable]{display:block;min-height:34px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);border-bottom-style:solid!important}
.scene .pair .ed{display:flex;flex-direction:column;gap:6px}
#card-hook [contenteditable]{display:block;margin-top:6px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}.scene .more textarea,.scene .own textarea{width:100%;min-height:58px}
.scene .own{width:100%;margin-top:6px}
/* compact motion tiles in a scene: a small preview with the name and Change beside it */
.scene .motionrow{display:flex;flex-wrap:wrap;gap:8px}.scene .mtile{flex-direction:row;width:300px;align-items:center}
.scene .mtile .mthumb{width:112px;flex:none;aspect-ratio:16/9}.scene .mtile figcaption{flex:1;min-width:0;padding:6px 10px;gap:6px}
.frow select{max-width:520px;width:100%}
/* the direction step's own three screens read as tabs under the stage bar */
.steps{gap:0;margin:0 0 12px}.steps li+li::before{content:"›";color:var(--muted);margin:0 8px}
.steps a,.steps span.step{border:0!important;background:none!important;padding:0!important;font-size:13px}.steps a.on{font-weight:700;color:var(--fg);text-decoration:underline;text-underline-offset:4px}
.motionrow{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px}.motionrow>em{display:block;width:100%;font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.mtile{margin:0;width:150px;max-width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;flex-direction:column}.mtile .mthumb,.mopt .mthumb{aspect-ratio:16/9;width:100%;background:#000;position:relative;overflow:hidden}.mthumb video,.mthumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.mtile figcaption{padding:6px 8px;display:flex;flex-direction:column;gap:4px;font-size:12.5px}.mtile figcaption b{font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.mtile figcaption span{color:var(--muted);font-size:11.5px}.mtile .changemotion{align-self:flex-start}
.shelf{position:fixed;inset:0;background:rgba(20,19,17,.45);z-index:20;display:flex;align-items:flex-end;justify-content:center}.shelf[hidden]{display:none}.shelf .sheet{background:var(--card);border:1px solid var(--line);border-radius:14px 14px 0 0;width:min(1200px,100%);max-height:86vh;overflow:auto;padding:16px 16px 22px}
.shelf .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}.shelf h3{margin:14px 0 8px}.optgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr));gap:10px}
.mopt{margin:0;background:var(--bg);border:1px solid var(--line);border-radius:8px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column}.mopt:hover,.mopt:focus{border-color:var(--fg);outline:none}.mopt.on{border-color:var(--fg);background:var(--pale);box-shadow:inset 0 0 0 1px var(--fg)}.mopt figcaption{padding:6px 8px;font-size:12.5px;display:flex;flex-direction:column;gap:2px}.mopt figcaption b{font-weight:600}.mopt figcaption span{color:var(--muted);font-size:11.5px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
`;

/** @font-face for every open font, so the typography selects and samples render each family. */
function allFontFaces(fonts, fontsBase) {
  return fonts.flatMap((f) => f.faces.map((face) => `@font-face{font-family:"${f.family}";src:url("${fontsBase}${fontSlug(f.family)}/${face.name}") format("woff2");font-weight:${face.weight};font-style:${face.style};font-display:swap}`)).join('\n');
}

const styleName = (P) => (P.style?.resolved === 'brand' ? 'derived from your brand' : P.style?.resolved ? ((P.styles || []).find((s) => s.id === P.style.resolved)?.name || P.style.resolved) : P.style ? 'the style the skill chose per direction' : 'no style chosen yet');

/**
 * The "Change motion" shelf for one motion style (D-56, D-67): eight others of
 * the same family that share a purpose (topped up from the same family, then
 * the same purpose), ranked by shared purposes, shared tags and energy; plus
 * the gallery's own "like this" neighbours. Ids only; the page shows names.
 * @param {string} id the motion style chosen now
 * @param {object[]} entries the motion gallery's index entries
 * @param {{ n?: number, exclude?: string[] }} [opts]
 * @returns {{ same: string[], like: string[] }}
 */
export function motionShelf(id, entries, { n = 8, exclude = [] } = {}) {
  const e = entries.find((x) => x.id === id);
  if (!e) return { same: [], like: [] };
  const skip = new Set([id, ...exclude]);
  const purp = new Set(e.purpose_norm || e.purpose || []);
  const tags = new Set(e.tags || []);
  const score = (x) => [(x.purpose_norm || x.purpose || []).filter((p) => purp.has(p)).length, (x.tags || []).filter((t) => tags.has(t)).length, x.energy === e.energy ? 1 : 0];
  const rank = (list) => list.map((x) => ({ x, s: score(x) })).sort((a, b) => b.s[0] - a.s[0] || b.s[1] - a.s[1] || b.s[2] - a.s[2] || (a.x.tier || 9) - (b.x.tier || 9) || String(a.x.name).localeCompare(String(b.x.name))).map((r) => r.x.id);
  const pool = entries.filter((x) => !skip.has(x.id) && x.preview);
  const fam = pool.filter((x) => x.family_group === e.family_group);
  const sharesPurpose = (x) => (x.purpose_norm || x.purpose || []).some((p) => purp.has(p));
  const out = [];
  for (const list of [fam.filter(sharesPurpose), fam.filter((x) => !sharesPurpose(x)), pool.filter((x) => x.family_group !== e.family_group && sharesPurpose(x))]) {
    for (const i of rank(list)) { if (out.length >= n) break; if (!out.includes(i)) out.push(i); }
  }
  // "like this": the gallery's own neighbours not already on the shelf, then their neighbours, up to five
  const ok = (x) => !skip.has(x) && !out.includes(x) && entries.some((y) => y.id === x && y.preview);
  const like = [];
  for (const x of e.like || []) if (ok(x) && !like.includes(x)) like.push(x);
  for (const x of e.like || []) for (const y of entries.find((z) => z.id === x)?.like || []) if (like.length < 5 && ok(y) && !like.includes(y)) like.push(y);
  return { same: out, like: like.slice(0, 5) };
}

/** The stepper at the top of every screen. */
function stepper(current, state, { embed = false } = {}) {
  const stage = state?.stage || 'style';
  const order = ['style', 'direction', 'refine'];
  const reach = (s) => order.indexOf(s) <= order.indexOf(stage === 'confirmed' ? 'refine' : stage);
  const labels = { style: '1 · Video style', direction: '2 · Direction', refine: '3 · Refine' };
  return `<ol class="steps">${order.map((s) => `<li>${reach(s) ? `<a href="${embed ? `#${s}` : `/${s}`}" data-tab="${s}" class="${s === current ? 'on' : 'done'}">${labels[s]}</a>` : `<span class="step">${labels[s]}</span>`}</li>`).join('')}</ol>`;
}

/** The shared client code: the edit queue, the word counters. Scoped to one screen root `R`. */
const COMMON_JS = `
function countWords(s){return String(s||'').trim().split(/\\s+/).filter(function(w){return /[\\p{L}\\p{N}]/u.test(w)}).length}
var statusEl=R.querySelector('.status');var timer=null,queue=[];
function setStatus(t,bad){if(statusEl){statusEl.textContent=t;statusEl.classList.toggle('bad',!!bad);}}
function save(path,value){if(SAMPLE){setStatus('Static preview: edits stay on this page.');return;}queue.push({path:path,value:value});clearTimeout(timer);timer=setTimeout(flush,350);}
function flush(){var batch=queue;queue=[];if(!batch.length)return Promise.resolve();return fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({edits:batch})}).then(function(r){return r.json()}).then(function(j){setStatus(j.ok?'Saved.':('Not saved: '+(j.error||'')),!j.ok)}).catch(function(err){setStatus('Not saved: '+err.message,true)});}
function valueOf(el){if(el.type==='checkbox')return el.checked;if(el.type==='number')return Number(el.value);if(el.dataset.list)return el.value.split('\\n').map(function(s){return s.trim()}).filter(Boolean);if(el.isContentEditable)return el.textContent.trim();return el.value;}
R.querySelectorAll('[data-path]').forEach(function(el){var ev=el.isContentEditable||el.tagName==='TEXTAREA'||el.type==='text'||el.type==='number'?'input':'change';el.addEventListener(ev,function(){if(el.dataset.claimref){var boxes=[].slice.call(R.querySelectorAll('[data-claimref="'+el.dataset.claimref+'"]'));boxes.forEach(function(b){b.closest('label').classList.toggle('on',b.checked)});save(el.dataset.path,boxes.filter(function(b){return b.checked}).map(function(b){return b.value}));}else save(el.dataset.path,valueOf(el));updateCounters();});});
function updateCounters(){R.querySelectorAll('[data-copy-counter]').forEach(function(c){var m=c.closest('.mrow');var h=m.querySelector('.copy .h [contenteditable]').textContent;var s=m.querySelector('.copy .s [contenteditable]');var n=countWords(h+' '+(s?s.textContent:''));var cap=Number(c.dataset.cap);c.textContent=n+' words on screen; the limit is '+cap;c.classList.toggle('over',n>cap);});}
updateCounters();
function post(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()});}
`;

// ---------------------------------------------------------------------------
// Screen 1: pick a video style
// ---------------------------------------------------------------------------

/** The "derived from your brand" card's frame: the brand's own palette and type, no preset. */
function brandFrame(P) {
  const pr = P.brand?.palette_roles || {};
  const ground = pr.ground || '#f7f6f2', ink = pr.ink || '#1a1a1a', accent = pr.accent || '#f2c200', primary = pr.primary || accent, warm = pr.warm || null;
  const fam = P.site_fonts?.headings || P.fonts?.[0]?.family || 'system-ui';
  const sws = [ground, ink, accent, primary, warm].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  return `<div class="media brand" style="background:${e(ground)};container-type:inline-size"><div class="brandframe"><div class="h" style="color:${e(ink)};font-family:'${e(fam)}',system-ui">${e(P.video.product || 'Your product')}</div><span class="p" style="background:${e(primary)};color:#fff">${e(String(P.video.cta || 'Start').split(/[:.!?]/)[0].split(/\s+/).slice(0, 3).join(' '))}</span><div class="sw">${sws.map((v) => `<i style="background:${e(v)}"></i>`).join('')}</div></div></div>`;
}

export function buildStyleScreen(opts) {
  const { proposals: P, assets, state = {}, sample = false, live = true, embed = false } = opts;
  const styles = P.styles || [];
  const moods = [...new Set(styles.flatMap((s) => s.mood))].sort();
  const chosen = state?.style?.choice || P.style?.choice || null;
  const tone = (P.brand?.tone_words || []).slice(0, 3);
  const brandCanvas = (() => { const g = P.brand?.palette_roles?.ground || '#ffffff'; const n = parseInt(g.slice(1), 16); const l = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; return l < 128 ? 'dark' : 'light'; })();
  const cards = [
    `<article class="card stylecard${chosen === 'auto' ? ' sel' : ''}" data-choice="auto" data-mood="" data-canvas="" tabindex="0"><div class="media autopick"><span>Ultrademo picks</span><small>the closest style for each direction</small></div><div class="meta"><div class="name">Let the skill choose</div><span class="pill">any</span></div><div class="small muted clamp2">Each of the three directions gets the style that fits its idea best.</div></article>`,
    `<article class="card stylecard${chosen === 'brand' ? ' sel' : ''}" data-choice="brand" data-mood="${e(tone.join(' '))}" data-canvas="${brandCanvas}" tabindex="0">${brandFrame(P)}<div class="meta"><div class="name clamp1">Your brand</div><span class="pill">${brandCanvas}</span></div><div class="small muted clamp2">Your site's own colours and type.</div></article>`,
    ...styles.map((s) => `<article class="card stylecard${chosen === s.id ? ' sel' : ''}" data-choice="${e(s.id)}" data-mood="${e(s.mood.join(' '))}" data-canvas="${e(s.canvas)}" tabindex="0"><div class="media"><video src="${e(assets.gallery + s.id + '/preview.mp4')}" poster="${e(assets.gallery + s.id + '/poster.jpg')}" muted loop playsinline preload="none"></video></div><div class="meta"><div class="name clamp1">${e(s.name)}</div><span class="pill">${e(s.canvas)}</span></div><div class="tags">${s.mood.map((m) => `<span>${e(m)}</span>`).join('')}</div></article>`),
  ];
  const body = `<section class="screen" id="screen-style">
${stepper('style', state, { embed })}
<h1>Pick a video style</h1>
<p class="lead">The ${e(nice(P.video.template).toLowerCase())} video of ${e(P.video.product)}, ${e(P.video.length_s)} seconds, ${e(w('narration', P.video.narration))}. Every preview is the same 10-second strip, so only the look changes. Pick one, or let the skill choose; the directions are then proposed to fit it.${sample ? ' <b>Static preview:</b> a recorded run, no server.' : ''}</p>
<div class="filters"><span class="chips" id="canvaschips"><span class="chip on" data-canvas="">All</span><span class="chip" data-canvas="light">Light</span><span class="chip" data-canvas="dark">Dark</span></span><select id="moodsel" aria-label="Mood"><option value="">Any mood</option>${moods.map((m) => `<option value="${e(m)}">${e(m)}</option>`).join('')}</select><span class="small muted" id="stylecount"></span></div>
<div class="grid cols-4" id="stylegrid">${cards.join('\n')}</div>
<div class="bar"><button type="button" class="primary" id="stylego" ${chosen ? '' : 'disabled'}>${chosen ? (chosen === 'auto' ? 'Propose directions; the skill picks the style' : `Propose directions in ${chosen === 'brand' ? 'your brand\'s look' : 'this style'}`) : 'Pick a style above'}</button><span class="status">${sample ? 'Static preview: nothing is proposed here.' : live ? 'Proposing the directions takes a minute or two and one model call.' : 'The style is saved; the directions are proposed from the command line.'}</span></div>
</section>`;
  const script = `(function(){var R=document.getElementById('screen-style');var SAMPLE=${sample ? 'true' : 'false'};${COMMON_JS}
var chosen=${jsonForScript(chosen)};var go=R.querySelector('#stylego');
function label(){if(!chosen)return 'Pick a style above';if(chosen==='auto')return 'Propose directions; the skill picks the style';var c=R.querySelector('.stylecard[data-choice="'+chosen+'"] .name');return 'Propose directions in '+(chosen==='brand'?"your brand's look":(c?'“'+c.textContent+'”':'this style'));}
R.querySelectorAll('.stylecard').forEach(function(card){var v=card.querySelector('video');
card.addEventListener('click',function(){chosen=card.dataset.choice;R.querySelectorAll('.stylecard').forEach(function(x){x.classList.toggle('sel',x===card)});go.disabled=false;go.textContent=label();});
card.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();card.click();}});
if(v){card.addEventListener('mouseenter',function(){v.play().catch(function(){})});card.addEventListener('mouseleave',function(){if(!card.dataset.visible)v.pause()});}});
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(en){var v=en.target.querySelector('video');if(!v)return;if(en.intersectionRatio>=0.6){en.target.dataset.visible='1';v.play().catch(function(){})}else{delete en.target.dataset.visible;v.pause();}})},{threshold:[0,0.6]});R.querySelectorAll('.stylecard').forEach(function(c){io.observe(c)});}
var canvas='',mood='';function filter(){var n=0;R.querySelectorAll('.stylecard').forEach(function(c){var ok=c.dataset.choice==='auto'||(!canvas||c.dataset.canvas===canvas)&&(!mood||(c.dataset.mood||'').split(' ').indexOf(mood)>=0);c.style.display=ok?'':'none';if(ok)n++;});R.querySelector('#stylecount').textContent=n+' of '+R.querySelectorAll('.stylecard').length;}
R.querySelectorAll('#canvaschips .chip').forEach(function(ch){ch.addEventListener('click',function(){R.querySelectorAll('#canvaschips .chip').forEach(function(x){x.classList.remove('on')});ch.classList.add('on');canvas=ch.dataset.canvas;filter();})});
R.querySelector('#moodsel').addEventListener('change',function(ev){mood=ev.target.value;filter();});filter();
function working(on,text){if(!statusEl)return;if(!on){statusEl.classList.remove('working');return;}statusEl.classList.remove('bad');statusEl.classList.add('working');statusEl.innerHTML='<span class="spin" aria-hidden="true"></span><span></span>';statusEl.lastChild.textContent=text;}
function nudge(){if(!statusEl||statusEl.querySelector('.nudge'))return;var n=document.createElement('span');n.className='nudge';n.innerHTML='Your AI agent has not picked it up yet. Paste this into its chat: <code>a direction task is waiting</code> <button type="button">Copy</button>';n.querySelector('button').addEventListener('click',function(ev){var b=ev.currentTarget;(navigator.clipboard?navigator.clipboard.writeText('a direction task is waiting'):Promise.reject()).then(function(){b.textContent='Copied'},function(){b.textContent='Select and copy'});setTimeout(function(){b.textContent='Copy'},2000);});statusEl.appendChild(n);}
function propose(choice){if(SAMPLE){setStatus('Static preview: the recorded run proposed its directions with the style left to the skill; open the Direction tab.');if(window.__showTab)window.__showTab('direction');return;}go.disabled=true;var t0=Date.now();
working(true,'Your AI agent is writing your directions'+(choice==='auto'?'':' in this style')+'. This takes a few minutes; the page carries on by itself when they are ready.');
(function attempt(){post('/api/style',{choice:choice}).then(function(j){if(j.ok){location.href=j.next;return;}
if(j.waiting||j.busy){if(Date.now()-t0>4*60*1000)nudge();setTimeout(attempt,6000);return;}
working(false);setStatus(j.error||'Could not propose the directions.',!j.saved);go.disabled=false;}).catch(function(err){working(false);setStatus('Could not propose the directions: '+err.message,true);go.disabled=false;});})();}
go.addEventListener('click',function(){if(chosen)propose(chosen)});
})();`;
  return { title: `Video style · ${P.video.product}`, body, script };
}

// ---------------------------------------------------------------------------
// Screen 2: pick a direction
// ---------------------------------------------------------------------------

export function buildDirectionScreen(opts) {
  const { proposals: P, assets, state = {}, sample = false, embed = false } = opts;
  const dirs = P.directions || [];
  const styleById = Object.fromEntries((P.styles || []).map((s) => [s.id, s]));
  const fixed = P.style?.resolved; // an id, 'brand', or null (the skill chose per direction)
  const card = (d, i) => {
    const letter = LETTERS[i];
    const fr = d.frames?.files || {};
    const mo = d.frames?.report?.moment || signatureMoment(d);
    const momentName = mo.name || d.moments[mo.index]?.name || '';
    const media = fr.signature_mp4 ? `<video src="${e(assets.project + fr.signature_mp4)}" poster="${fr.signature ? e(assets.project + fr.signature) : ''}" muted loop autoplay playsinline preload="metadata"></video>` : fr.signature ? `<img src="${e(assets.project + fr.signature)}" alt="The signature moment of direction ${letter}">` : `<div class="muted small" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">no render</div>`;
    const styleLine = !fixed && d.video_style && styleById[d.video_style] ? `<div class="small muted">Video style: ${e(styleById[d.video_style].name)}</div>` : !fixed && !d.video_style ? '<div class="small muted">Video style: derived from your brand</div>' : '';
    const sc = sketchColours(d);
    return `<article class="card dir${state?.chosen === i ? ' sel' : ''}" id="dir-${letter}" data-index="${i}"><div class="dinfo">
<div><span class="letter">Direction ${letter}</span></div>
<div class="name clamp2">${e(d.name)}</div>
<div class="look clamp1">${e(d.mood)}</div>
<p class="clamp3" style="margin:0">${e(d.idea)}</p>
<div class="small clamp2"><b>Signature move:</b> ${e(d.signature.what)}</div>
<div class="media">${media}</div>
<div class="small muted">One scene rendered in this look: <b>${e(momentName)}</b>. The storyboard shows every scene.</div>
${styleLine}

<button type="button" class="choose" data-choose="${i}">${state?.chosen === i ? 'Chosen · refine it' : 'Choose this direction'}</button>
</div>
<div class="dstory sk"><style>${sketchCss(d, sc).replace(/\.sk /g, `#dir-${letter} .sk `)}</style><h3>The storyboard · ${d.moments.length} scenes, ${e(P.video.length_s)} s</h3><div class="skstrip">${d.moments.map((m, j) => `<figure class="skm"><div class="frame" style="background:${sc.canvas}">${frameHtml(m, d, sc)}</div><figcaption><b>${j + 1}. ${e(m.name)}</b><span>${e(m.reads || m.goal)}</span></figcaption></figure>`).join('')}</div>
<p class="small muted" style="margin:8px 0 0">Sketches with the real words and colours; boxes stand for the product's screens.</p></div>
<details class="fold why"><summary>Why this direction</summary><div class="small whygrid"><div class="kv"><span>Does it carry your message?</span><div>${e(d.judged.serves_claim)}</div></div><div class="kv"><span>Does it show your brand at its best?</span><div>${e(d.judged.brand_at_best)}</div></div><div class="kv"><span>Could a competitor use the same video? (should be no)</span><div>${e(d.judged.competitor_could_use)}</div></div><div class="kv"><span>Does it still work when watched muted, small or half-attended?</span><div>${e(d.judged.survives_bad_day)}</div></div><div class="kv"><span>Claude's overall score</span><div>${e(d.judged.score)} out of 10</div></div><div class="kv"><span>Opening hook</span><div>${e(d.hook.line)}</div></div><div class="kv"><span>Closing shot</span><div>${e(d.closing_shot)}</div></div>${(d.repairs || []).length ? `<div class="kv"><span>Adjusted</span><div>${d.repairs.map(e).join('<br>')}</div></div>` : ''}</div></details>
</article>`;
  };
  const empty = `<div class="notice">No directions yet. <a href="${embed ? '#style' : '/style'}" data-tab="style">Pick a video style</a> first; the directions are proposed to fit it.</div>`;
  const body = `<section class="screen" id="screen-direction">
${stepper('direction', state, { embed })}
<h1>Pick a direction</h1>
<p class="lead">${dirs.length} direction${dirs.length === 1 ? '' : 's'} for the ${e(nice(P.video.template).toLowerCase())} video of ${e(P.video.product)}, ${fixed === 'brand' ? 'in a look derived from your brand' : fixed ? `inside the video style ${e(styleName(P))}` : 'each in the video style the skill found closest'}. Each is a different idea, not a different colour; the render under each is its own signature moment. <a href="${embed ? '#style' : '/style'}" data-tab="style">Change the video style</a>.</p>
${dirs.length ? `<div class="grid dirs">${dirs.map(card).join('\n')}</div>` : empty}
${(P.dropped || []).length ? `<p class="small muted">Also considered and set aside: ${P.dropped.map((d) => `${e(d.name)} (${e(d.why)})`).join('; ')}.</p>` : ''}
<div class="otherways"><button type="button" class="quiet" id="otherways" aria-expanded="false" aria-controls="otherways-box">Show me other ways</button><div class="card otherbox" id="otherways-box" hidden><h3>What should the new directions do differently?</h3><p class="small muted">Optional. Say what you are looking for: the message to lead with, what to show more or less of, a feeling. Three new directions are written to your note; these three are saved in the project folder (direction/set-aside), not deleted.</p><textarea id="otherways-text" rows="4" maxlength="800" placeholder="e.g. Lead with how easy it is to make a high-quality video with AI; keep the re-run to one scene"></textarea><div class="row"><button type="button" class="dark" id="otherways-go">Propose new directions</button><button type="button" class="quiet" id="otherways-cancel">Cancel</button><span class="small muted" id="otherways-note" aria-live="polite"></span></div></div></div>
<div class="bar"><span class="status">${sample ? 'Static preview: choosing opens the Refine tab.' : 'Choose a direction to refine it; nothing is written until you confirm.'}</span>${opts.costLine ? `<span class="small muted">${e(opts.costLine)}</span>` : ''}</div>
</section>`;
  const script = `(function(){var R=document.getElementById('screen-direction');var SAMPLE=${sample ? 'true' : 'false'};${COMMON_JS}
R.querySelectorAll('.choose').forEach(function(b){b.addEventListener('click',function(){var i=Number(b.dataset.choose);R.querySelectorAll('.dir').forEach(function(d){d.classList.toggle('sel',Number(d.dataset.index)===i)});if(SAMPLE){if(window.__showTab)window.__showTab('refine');return;}b.disabled=true;setStatus('Opening the refine screen…');post('/api/choose',{chosen:i}).then(function(j){if(j.ok){location.href=j.next;return;}setStatus(j.error||'Could not choose.',true);b.disabled=false;}).catch(function(err){setStatus('Could not choose: '+err.message,true);b.disabled=false;});});});
var ob=R.querySelector('#otherways'),box=R.querySelector('#otherways-box'),og=R.querySelector('#otherways-go'),on=R.querySelector('#otherways-note');ob.addEventListener('click',function(){box.hidden=!box.hidden;ob.setAttribute('aria-expanded',String(!box.hidden));if(!box.hidden)R.querySelector('#otherways-text').focus();});R.querySelector('#otherways-cancel').addEventListener('click',function(){box.hidden=true;ob.setAttribute('aria-expanded','false');});og.addEventListener('click',function(){if(SAMPLE){on.textContent='Static preview: nothing is proposed.';return;}var note=R.querySelector('#otherways-text').value.trim(),t0=Date.now(),sent=false;og.disabled=true;on.textContent='Your AI agent is writing three new directions. This takes a few minutes; the page carries on by itself when they are ready.';(function attempt(){post('/api/more',{note:note,again:sent}).then(function(j){sent=true;if(j.ok){location.href=j.next;return;}if(j.waiting||j.busy){if(Date.now()-t0>4*60*1000)on.textContent='Still waiting. If nothing happens, paste this into the chat with your AI agent: a direction task is waiting';setTimeout(attempt,6000);return;}on.textContent=j.error||'Could not propose new directions.';og.disabled=false;}).catch(function(err){on.textContent='Could not propose new directions: '+err.message;og.disabled=false;});})();});
})();`;
  return { title: `Direction · ${P.video.product}`, body, script };
}

// ---------------------------------------------------------------------------
// Screen 3: refine the chosen direction, confirm
// ---------------------------------------------------------------------------

// the narration row on the refine page: how long each line runs against its scene (about 2.6 words a second until it is heard,
// then the voice's real length), and "Hear it", which voices the line once into the production cache (/api/hear)
const VOICE_UI = String.raw`<style>
.vline textarea{width:100%;box-sizing:border-box;font:inherit;font-size:15px;line-height:1.45;color:var(--text);background:var(--surface);border:1.5px solid var(--ink);border-radius:10px;padding:9px 11px;min-height:58px;resize:vertical}
.vfit{display:flex;align-items:center;gap:10px;margin-top:7px;font-size:12px;color:var(--text-muted);flex-wrap:wrap}
.vbar{position:relative;width:120px;height:6px;border-radius:3px;background:var(--line);overflow:hidden}.vbar i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--green)}
.vfit.over .vbar i{background:var(--pink)}.vfit.over .vtxt{color:#b0004a;font-weight:600}
</style><script>(function(){
function dur(j){var el=document.querySelector('[data-path$="moments.'+j+'.duration_s"]');return el?Number(el.value)||0:0;}
function fit(j,measured){var ta=document.querySelector('[data-voice="'+j+'"]'),box=document.querySelector('[data-vfit="'+j+'"]');if(!ta||!box)return;
 var words=(ta.value.trim().match(/\S+/g)||[]).length,est=measured!=null?measured:Math.round(words/2.6*10)/10,d=dur(j),room=Math.max(0.5,d-0.5),over=words>0&&est>room;
 box.classList.toggle('over',over);box.querySelector('.vbar i').style.width=Math.min(100,Math.round(est/room*100))+'%';
 box.querySelector('.vtxt').textContent=!words?'No line yet':(measured!=null?'':'about ')+est+' s'+(over?': the scene is '+d+' s. Shorten the line, or make the scene longer.':' of '+d+' s');}
document.querySelectorAll('[data-voice]').forEach(function(ta){var j=ta.dataset.voice;ta.addEventListener('input',function(){fit(j);});fit(j);});
document.querySelectorAll('[data-path$=".duration_s"]').forEach(function(el){el.addEventListener('input',function(){var m=el.dataset.path.match(/moments\.(\d+)\.duration_s/);if(m)fit(m[1]);});});
document.querySelectorAll('[data-hear]').forEach(function(b){b.addEventListener('click',function(){var j=b.dataset.hear,ta=document.querySelector('[data-voice="'+j+'"]'),au=b.parentNode.querySelector('audio'),was=b.textContent;
 b.disabled=true;b.textContent='Voicing…';
 fetch('/api/hear',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:ta.value})}).then(function(r){return r.json();}).then(function(x){b.disabled=false;b.textContent=was;
  if(!x.ok){b.parentNode.querySelector('.vtxt').textContent=x.error||'Could not voice it.';return;}fit(j,x.secs);au.src=x.url;au.play().catch(function(){});
 }).catch(function(){b.disabled=false;b.textContent=was;});});});
})();</script>`;

export function buildRefineScreen(opts) {
  const { proposals: P, assets, state = {}, sample = false, embed = false } = opts;
  const video = P.video;
  const fonts = P.fonts || [];
  const music = P.music || [];
  const proposed = video.intake?.proposed || {};
  const i = Number.isInteger(state?.chosen) && P.directions?.[state.chosen] ? state.chosen : 0;
  const d = P.directions?.[i];
  const letter = LETTERS[i];
  const dw = (fam) => { const f = fonts.find((x) => x.family === fam); const ws = (f?.weights || []).map((x) => Number(String(x).replace('i', ''))).filter(Number.isFinite); return ws.length ? Math.max(...ws) : 700; };
  const ed = (path, value, { tag = 'span', cls = '' } = {}) => `<${tag} contenteditable="true" data-path="${e(path)}" class="${cls}">${e(value)}</${tag}>`;
  const sel = (path, value, options, { cls = '', words = null } = {}) => `<select data-path="${e(path)}" class="${cls}">${options.map((o) => { const v = typeof o === 'object' ? o.value : o; const label = typeof o === 'object' ? o.label : (words ? words(v) : nice(v)); return `<option value="${e(v)}"${v === value ? ' selected' : ''}>${e(label)}</option>`; }).join('')}</select>`;
  const pp = (field) => (proposed[field] ? `<span class="pill proposed" title="${e(proposed[field].why || '')}">proposed</span>` : '');
  if (!d) {
    const body = `<section class="screen" id="screen-refine">${stepper('refine', state, { embed })}<h1>Refine</h1><div class="notice">No direction chosen yet. <a href="${embed ? '#direction' : '/direction'}" data-tab="direction">Pick a direction</a> first.</div></section>`;
    return { title: `Refine · ${video.product}`, body, script: '' };
  }
  const p = (f) => `directions.${i}.${f}`;
  const claims = P.claims || [];
  const range = lengthRange(video);
  const slots = allocate(d.moments, video.length_s, range);
  const total = Math.round(slots.reduce((a, x) => a + x.duration_s, 0) * 10) / 10;
  const rangeWords = range.fit === 'exact' ? `exactly ${video.length_s} s` : range.fit === 'max' ? `no more than ${video.length_s} s` : `about ${video.length_s} s (${range.lo}–${range.hi} s)`;
  const bp = P.blueprints || [];

  // the motion styles per moment, from the motion gallery (D-56, D-67)
  const motion = opts.motion || [];
  const motionById = new Map(motion.map((x) => [x.id, x]));
  const catalogue = { rules: new Set(motion.map((x) => x.id)), blueprints: new Set((P.blueprints || []).map((b) => b.id)), entries: motion.map((x) => ({ id: x.id, purpose: x.purpose || [], energy: x.energy, family: x.family_group || x.family })) };
  const chosenRules = d.moments.map((mo, j) => (motion.length ? momentRules(d, mo, catalogue, j) : []));
  const shelves = {};
  const needed = new Set(chosenRules.flat());
  for (const id of [...needed]) { shelves[id] = motionShelf(id, motion, { n: 10 }); for (const x of [...shelves[id].same, ...shelves[id].like]) needed.add(x); }
  const MOTION = Object.fromEntries([...new Set([...needed, ...motion.map((x) => x.id)])].filter((id) => motionById.has(id)).map((id) => { const x = motionById.get(id); return [id, { name: x.name, family: x.family_group || x.family, energy: x.energy, line: x.one_line || '', preview: x.preview, poster: x.poster }]; }));
  const mtile = (id, j, k) => { const x = MOTION[id]; if (!x) return ''; return `<figure class="mtile" data-moment="${j}" data-slot="${k}" data-id="${e(id)}"><div class="mthumb"><video muted loop playsinline autoplay preload="metadata" poster="${e(assets.motion + x.poster)}" src="${e(assets.motion + x.preview)}"></video></div><figcaption><b title="${e(x.line)}">${e(x.name)}</b><button type="button" class="quiet changemotion" data-moment="${j}" data-slot="${k}">Change</button></figcaption></figure>`; };
  const motionRow = (j) => (chosenRules[j].length ? `<div class="motionrow" data-moment="${j}">${chosenRules[j].map((id, k) => mtile(id, j, k)).join('')}</div>` : '<span class="muted">Composed by Claude from the direction</span>');
  // sound: a plain choice, with the model's own suggestion kept as one of the options
  const SOUND_PRESETS = ['music only', 'music with interface sounds (clicks, pops)', 'music hits on each word', 'music with an effect sound', 'voice over music', 'music drops away, quiet beat'];
  const soundSel = (j, cur) => `<select data-path="${p(`moments.${j}.sound`)}">${(SOUND_PRESETS.includes(cur) || !cur ? [] : [cur]).concat(SOUND_PRESETS).map((o) => `<option value="${e(o)}"${o === cur ? ' selected' : ''}>${e(o === cur && !SOUND_PRESETS.includes(cur) ? `Suggested: ${o}` : o.replace(/^\w/, (c) => c.toUpperCase()))}</option>`).join('')}</select>`;
  const field = (label, body, { hint = '', input = false } = {}) => `<div class="frow${input ? ' needs' : ''}"><div class="flab">${label}${hint ? `<small>${hint}</small>` : ''}</div><div class="fval">${body}</div></div>`;

  // the narration is written here, before production: one line per scene, with how well it fits the scene and a way to hear it
  const narratedV = video.narration && video.narration !== 'music-only';
  const voiceRow = (mo, j) => (narratedV ? field('Narration', `<div class="vline"><textarea rows="2" data-path="${p(`moments.${j}.voice`)}" data-voice="${j}" placeholder="What the voice says over this scene, said the way you would say it">${e(mo.voice || '')}</textarea><div class="vfit" data-vfit="${j}"><span class="vbar"><i></i></span><span class="vtxt"></span><button type="button" class="quiet vhear" data-hear="${j}">▶ Hear it</button><audio preload="none" hidden></audio></div></div>`, { hint: 'said over this scene', input: true }) : '');
  // the scenes: one card each, a label column and a value column; what needs the user is styled as an input
  const rows = d.moments.map((mo, j) => {
    const cap = mo.words_max || 8;
    const rt = readingTime(`${mo.copy.headline} ${mo.copy.sub || ''}`);
    const used = claims.filter((c) => (mo.claims || []).includes(c.id));
    return `<article class="scene mrow" data-moment="${j}">
<header class="shead"><span class="num">Scene ${String(j + 1).padStart(2, '0')}</span><span class="pill beat">${e(nice(mo.beat))}</span><span class="mname">${ed(p(`moments.${j}.name`), mo.name)}</span>
<span class="stime"><input type="number" step="0.5" min="1" data-path="${p(`moments.${j}.duration_s`)}" value="${e(slots[j].duration_s)}" title="Claude proposed ${e(mo.duration_s)} s; the video stays within the length you set in the brief" aria-label="Scene length in seconds"> s <span class="mono muted">${slots[j].start_s.toFixed(1)}–${(slots[j].start_s + slots[j].duration_s).toFixed(1)} s</span></span></header>
<p class="sgoal">${e(mo.goal)}</p>
${field('On screen', `<div class="copy" style="font-family:'${e(d.type.display)}',system-ui">${mo.copy.kicker !== null ? `<div class="k" style="font-family:'${e(d.type.mono)}',monospace">${ed(p(`moments.${j}.copy.kicker`), mo.copy.kicker || '')}</div>` : ''}<div class="h" style="font-weight:${dw(d.type.display)}">${ed(p(`moments.${j}.copy.headline`), mo.copy.headline)}</div><div class="s" style="font-family:'${e(d.type.text)}',system-ui">${ed(p(`moments.${j}.copy.sub`), mo.copy.sub || '')}</div><div class="counter" data-copy-counter="${j}" data-cap="${cap}"></div></div>`, { hint: `about ${rt} s to read`, input: true })}
${voiceRow(mo, j)}
${field('Motion style', motionRow(j), { hint: 'how things move', input: true })}
${field('Transition', `<div class="pair"><div><small>Comes in with</small>${sel(p(`moments.${j}.transition_in`), mo.transition_in, TRANSITIONS, { words: (v) => w('transition', v) })}</div><div><small>Continues into the next scene</small>${mo.carry ? `<span class="ed">${ed(p(`moments.${j}.carry.element`), mo.carry.element)}${ed(p(`moments.${j}.carry.action`), mo.carry.action)}</span>` : '<span class="muted">Last scene; nothing carries</span>'}</div></div>`)}
${field('Sound', soundSel(j, mo.sound))}
${field('Keywords and facts', `<div class="facts"><span class="factsum" data-factsum="${j}">${used.length ? used.map((c) => `<span class="pill on">${e(c.short || c.text)}</span>`).join(' ') : '<span class="pill">None</span>'}</span>${claims.length ? `<details class="factpick"><summary>Change</summary><span class="chips">${claims.map((c) => `<label class="chip ${(mo.claims || []).includes(c.id) ? 'on' : ''}"><input type="checkbox" hidden data-claimref="${j}" data-path="${p(`moments.${j}.claims`)}" value="${e(c.id)}" ${(mo.claims || []).includes(c.id) ? 'checked' : ''}>${e(c.short || c.text)}</label>`).join('')}</span></details>` : ''}<div class="own"><small>Your own words or facts for this scene, one per line, shown as written</small><textarea rows="2" data-list="1" data-path="${p(`moments.${j}.keywords`)}" placeholder="e.g. Live in under 60 minutes">${e((mo.keywords || []).join('\n'))}</textarea></div></div>`, { hint: 'from your site, or your own' })}
<details class="more"><summary>More about this scene</summary><div class="grid2">
<div><em>Motion, in words</em><textarea data-path="${p(`moments.${j}.motion`)}">${e(mo.motion)}</textarea></div>
<div><em>What the viewer takes in</em>${mo.reads ? ed(p(`moments.${j}.reads`), mo.reads) : '<span class="muted">—</span>'}</div>
<div><em>Accent word</em>${ed(p(`moments.${j}.copy.accent`), mo.copy.accent || '')}</div>
<div><em>Camera movement</em>${ed(p(`moments.${j}.camera`), mo.camera)}</div>
<div><em>Shot blueprint</em>${sel(p(`moments.${j}.blueprint`), mo.blueprint, ['composed', ...bp.map((b) => b.id)], { words: (v) => (v === 'composed' ? 'Composed from motion styles' : nice(v)) })}</div>
<div><em>Visuals</em>${(mo.visuals || []).map((v) => `<span class="pill">${e(v.ref)} · ${e(v.kind === 'rebuilt' ? 'rebuilt in code' : v.kind)}</span>`).join(' ') || '<span class="muted">type only</span>'}</div>
</div></details>
</article>`;
  }).join('');

  // the six cards
  const swatches = d.palette.map((pa, k) => `<div class="sw"><input type="color" value="${e(pa.value)}" data-path="${p(`palette.${k}.value`)}" aria-label="${e(nice(pa.role))}"><div><b>${e(nice(pa.role))}</b><small>${e(pa.use)}</small></div></div>`).join('');
  const typeRow = (role, text, size) => `<div class="typerow"><div class="role">${e(role === 'text' ? 'Body' : role === 'mono' ? 'Labels' : 'Display')}</div><div><div class="sample" style="font-family:'${e(d.type[role])}',system-ui;font-size:${size};font-weight:${role === 'display' ? dw(d.type.display) : role === 'mono' ? 500 : 400}${role === 'mono' ? ';letter-spacing:.14em;text-transform:uppercase' : ''}">${e(text)}</div>${sel(p(`type.${role}`), d.type[role], fonts.map((f) => f.family), { cls: 'fontsel' })}</div></div>`;
  const typeRows = typeRow('display', d.moments[0]?.copy?.headline || video.claim, '26px') + typeRow('text', video.viewer || d.idea, '15px') + typeRow('mono', `${video.product} · ${video.cta || ''}`, '12px');
  const m = music.find((x) => x.file === d.music.file) || { file: d.music.file, title: d.music.file, set: 'energetic', usable_from_s: 0, mood: [] };
  const musicMeta = (x) => `${x.title} · ${w('set', x.set)} · ${x.bpm ? `${x.bpm} bpm` : ''}${typeof x.beat_strength === 'number' ? ` · beat ${x.beat_strength}` : ''}${x.usable_from_s ? ` · bed starts at ${x.usable_from_s} s` : ''}`;
  const musicCard = `<div class="card" id="card-music"><h2>Music</h2>${sel(p('music.file'), d.music.file, music.map((x) => ({ value: x.file, label: `${x.title} · ${w('set', x.set)} · ${x.bpm} bpm` })), { cls: 'musicsel' })}<audio controls preload="none" src="${e(m.src || assets.music + d.music.file)}" id="music-player" data-from="${e(m.usable_from_s || 0)}"></audio><div class="small muted" id="musicmeta">${e(musicMeta(m))}</div><div class="tags" id="musictags">${(m.mood || []).map((t) => `<span>${e(t)}</span>`).join('')}</div>${m.note ? `<div class="small muted" id="musicnote">${e(m.note)}</div>` : '<div class="small muted" id="musicnote"></div>'}<div class="small muted">${e(d.music.why)}</div></div>`;
  const voice = P.voice || { tier: 'none', label: 'None (music only)' };
  const narrated = video.narration && video.narration !== 'music-only';
  const voiceCard = `<div class="card" id="card-voice"><h2>Narration</h2><div>${e(w('narration', video.narration))}${pp('narration')}</div>${narrated ? `<div><h3>Voice</h3>${sel('video.intake.voice.id', voice.id || '', loadCatalogue().voices.filter((x) => x.provider !== 'elevenlabs' || video.intake?.voice?.source === 'own-account').map((x) => ({ value: x.id, label: `${x.name} · ${x.gender === 'male' ? 'male' : 'female'}, ${x.accent} · ${x.provider === 'elevenlabs' ? 'ElevenLabs' : 'Free'}` })))}</div>${voice.sample ? `<audio controls preload="none" src="${e(assets.voice + voice.sample)}"></audio>` : '<div class="small muted">No sample on this machine yet.</div>'}` : '<div class="small muted">The music carries the video; the copy on screen does the talking.</div>'}</div>`;
  const hookCard = `<div class="card" id="card-hook"><h2>Opening hook and closing shot</h2><div><h3>Opening hook</h3>${sel(p('hook.angle'), d.hook.angle, HOOK_ANGLES, { words: (v) => w('angle', v) })}<div class="small" style="margin-top:4px">lands through ${sel(p('hook.route'), d.hook.route, HOOK_ROUTES, { words: (v) => w('route', v) })}</div><div class="small wrap" style="margin-top:6px">${ed(p('hook.line'), d.hook.line)}</div></div><div><h3>Closing shot</h3>${sel(p('close'), d.close, ['product', 'logo', 'both'], { words: (v) => w('close', v) })}<div class="small wrap" style="margin-top:6px">${ed(p('closing_shot'), d.closing_shot)}</div></div></div>`;
  const said = (d.words_to_settings || []);
  // the model's "setting" is free text ("canvas: dark", "text_animation: rise-mask"); map its words to the setting they set
  const ALSO = { ground: ['canvas', 'background'], type: ['text_animation', 'text animation', 'typography', 'font'], colour: ['palette', 'color', 'accent'], sound: ['music', 'beat'], voice: ['narration', 'narrated'], camera: ['push', 'pan', 'locked'], product_presence: ['product'], texture: ['grain', 'glow'] };
  const saidFor = (k) => said.filter((x) => { const s = String(x.setting || '').toLowerCase(); const keys = [k, k.replace('_', ' '), w('dial', k).toLowerCase(), ...(ALSO[k] || [])]; return keys.some((key) => new RegExp(`(^|[^a-z_])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(s)); });
  const matched = new Set();
  const dials = Object.entries(DIALS).map(([k, positions]) => { const hits = saidFor(k); hits.forEach((h) => matched.add(h)); return `<div class="dial${hits.length ? ' said-on' : ''}"><em>${e(w('dial', k))}</em>${sel(p(`dials.${k}`), d.dials[k], positions)}${hits.length ? `<span class="said">you said “${hits.map((h) => e(h.word)).join('”, “')}”</span>` : ''}</div>`; }).join('');
  const unmatched = said.filter((x) => !matched.has(x));
  const settingsCard = `<div class="card" id="card-settings"><h2>Direction settings</h2>${unmatched.length ? `<p class="yousaid">You said: ${unmatched.map((x) => `<span>${e(x.word)} → ${e(x.setting)}</span>`).join('')}</p>` : ''}<div class="dials">${dials}</div><div><h3>Energy and text</h3><div class="small">${sel(p('energy'), d.energy, DIALS.energy)} <span class="muted">· text entrance</span> ${sel(p('text_animation'), d.text_animation, ['rise-mask', 'fade-up', 'slam', 'blur-in', 'scale-in', 'letters'])}</div></div></div>`;
  // the people and companies on screen: one name, one role; edited here, used as written in production
  // the direction's own cast, else the names its scenes already use (saved as soon as the user edits or confirms)
  const castGiven = Array.isArray(d.cast) && d.cast.length > 0;
  const cast = castGiven ? d.cast : castFromDirection(d, video.product);
 const castRow = (c) => `<div class="castrow" data-was="${e(c.was || c.name || '')}"><input type="text" class="castname" value="${e(c.name || '')}" placeholder="Name" aria-label="Name"><input type="text" class="castrole" value="${e(c.role || '')}" placeholder="Their role in the story" aria-label="Role"><button type="button" class="quiet castdel" aria-label="Remove">×</button></div>`;
  const castCard = `<div class="card" id="card-cast" data-castpath="${e(p('cast'))}"><h2>People and names</h2><p class="help">The people and companies the video shows. Each keeps one role across every scene; change any name here.</p><div class="castlist">${cast.map(castRow).join('')}</div>${!castGiven && cast.length ? '<p class="small castfound">Found in the scenes. Check each role; your changes apply to every scene.</p>' : ''}${cast.length ? '' : '<p class="small muted castempty">No people or companies named in these scenes yet. Add the ones you want, or leave it to production.</p>'}<button type="button" class="quiet" id="castadd">Add a person or company</button></div>`;
  const soundCard = `<div class="card" id="card-sound"><h2>Music and voice</h2>${musicCard.replace(/^<div class="card" id="card-music"><h2>Music<\/h2>/, '<h3>Music</h3>').replace(/<\/div>$/, '')}<div class="soundvoice">${voiceCard.replace(/^<div class="card" id="card-voice"><h2>Narration<\/h2>/, '<h3>Narration</h3>').replace(/<\/div>$/, '')}</div></div>`;
  const coloursCard = `<div class="card" id="card-colours"><h2>Colours</h2><div class="swgrid">${swatches}</div><div class="small muted clamp2">${e(d.ground)}</div></div>`;
  const typeCard = `<div class="card" id="card-type"><h2>Typography</h2><div>${typeRows}</div><div class="small muted clamp2">${e(d.type.why)}</div></div>`;

  // folds: the sketch storyboard, the brief, the facts, the bans, what was read
  const c = sketchColours(d);
  const briefRows = [
    ['Product', `${e(video.product)} · <a href="${e(video.url)}">${e(video.url)}</a>`],
    ['Who it is for', `${ed('video.viewer', video.viewer)}${pp('viewer')}`],
    ['What it is', `${ed('video.claim', video.claim)}${pp('claim')}`],
    ['The problem it solves', `${ed('video.pain_point', video.pain_point)}${pp('pain_point')}`],
    ['The proof', `${ed('video.proof_moment', video.proof_moment)}${pp('proof_moment')}`],
    ['Call to action', `${ed('video.cta', video.cta)}${pp('cta')}`],
    ['Template and length', `${e(nice(video.template))}${pp('template')} · <input type="number" data-path="video.length_s" value="${e(video.length_s)}" min="5" max="300" style="width:80px"> seconds${pp('length_s')}`],
    ['Copy tone', `${sel('video.copy.register', video.copy?.register || 'balanced', ['factual', 'balanced', 'bold'])}${pp('register')}`],
    ['The vibe, your words', video.intake?.look?.words ? `${e(video.intake.look.words)}${pp('look')}` : '<span class="muted">none given</span>'],
  ];
  const claimRows = claims.map((cl) => `<li><label><input type="checkbox" data-path="claims.${e(cl.id)}.use" ${cl.use ? 'checked' : ''}> ${e(cl.short || cl.text)}</label> <span class="muted small">· ${e(cl.page_title || cl.page)}${cl.kind === 'sample' ? ' · a sample value shown in the product, not a claim' : ''}</span></li>`).join('');
  const srcCards = (P.sources || []).filter((s) => s.kind !== 'logo').map((s) => s.kind === 'mockup' ? `<figure><div class="muted small" style="padding:18px 10px;border:1px dashed var(--line);border-radius:8px">HTML mockup, opened for its screens</div><figcaption><b>${e(nice(s.id))}</b> <span class="muted">${e(s.kind)}</span></figcaption></figure>` : `<figure><img src="${e(assets.project + s.path)}" alt="${e(s.what)}" loading="lazy"><figcaption><b>${e(nice(s.id))}</b> <span class="muted">${e(s.kind)}</span></figcaption></figure>`).join('');
  const logoSrc = (P.sources || []).find((s) => s.kind === 'logo');
  const assetsCard = `<div class="card" id="card-assets"><h2>Your screens</h2><p class="help">What the video is built from: captured from your site${(P.sources || []).some((s) => s.kind === 'mockup' || /^shot-|^mockup-/.test(s.id)) ? ' and the files you gave' : ''}. The scenes rebuild these screens in code with your own words.</p>
<div class="srcgrid">${srcCards}</div></div>`;
  const LOGO_MOTIONS = [['fade-rise', 'Fade and rise', 'calm, works with any logo'], ['scale-pop', 'Scale pop', 'a springy pop in'], ['mark-then-name', 'Mark, then name', 'the icon first, then the name reveals left to right'], ['wipe-bar', 'Wipe in', 'a bar in your brand colour wipes the logo in'], ['flash-reveal', 'Flash, then logo', 'a flash of brand colour, then the logo'], ['glint', 'Glint', 'the logo appears and a light sweeps across it'], ['none', 'None', 'the logo simply appears']];
  const curLogoMotion = d.logo_motion || 'fade-rise';
  const brandCol = (d.palette || []).find((x) => /primary|brand|accent/i.test(x.role))?.value || '#1674f8';
  const groundCol = (d.palette || []).find((x) => /ground/i.test(x.role))?.value || '#ffffff';
  const logoMotionCard = `<div class="card" id="card-logomotion"><h2>Logo motion</h2>${logoSrc ? `<p class="help">How your logo arrives in the reveal and the close. Each plays your own logo; pick one.</p><div class="lmgrid" style="--lm-brand:${e(brandCol)};--lm-ground:${e(groundCol)}">${LOGO_MOTIONS.map(([id, name, line]) => `<label class="lmopt${id === curLogoMotion ? ' on' : ''}"><input type="radio" name="logo_motion" value="${id}" data-path="${e(p('logo_motion'))}" ${id === curLogoMotion ? 'checked' : ''} hidden><div class="lmstage lm-${id}"><span class="lmflash"></span><span class="lmbar"></span><img src="${e(assets.project + logoSrc.path)}" alt=""><span class="lmglint"></span></div><b>${e(name)}</b><small>${e(line)}</small></label>`).join('')}</div>` : '<p class="help">No logo yet. Add it in the brief (Your brand) and the motions show here with your own logo.</p>'}</div>`;
  // D-82: the thumbnail, drawn by the server in this direction's look (/api/thumbs); the choice and the words are saved
  // with the direction as thumbnail: { layout, intro, title, line }
  const th = d.thumbnail || {};
  const thLayouts = [['info', 'Informational', 'Logo, title, product'], ['headline', 'Big headline', 'The hook, large'], ['product', 'Product and headline', 'Tilted screen, headline'], ['versus', 'Problem → answer', 'Pain, then answer'], ['moment', 'A moment from the video', 'A frame from the video']];
  const thVertical = (video.intake?.formats || []).includes('vertical');
  // D-92: the captured screens the thumbnail can show
  const thScreens = (video.sources || []).filter((s) => ['screenshot', 'mockup'].includes(s.kind) && /\.(png|jpe?g)$/i.test(s.path || '')).slice(0, 40);
  const thumbCard = `<div class="card" id="card-thumb" data-thpath="${e(p('thumbnail'))}"><h2>Thumbnail</h2><p class="help">The picture before the video plays, in this direction's look. Click one to choose it; click again to see every size.</p>
<div class="thgrid">${thLayouts.map(([id, name, line]) => `<label class="thopt${(th.layout || 'info') === id ? ' on' : ''}" data-layout="${id}"><span class="thimg"><img alt="" data-thimg="${id}"><span class="thwait">Drawing…</span></span><b>${e(name)}</b><small>${e(line)}</small></label>`).join('')}</div>
<div class="thtext"><label>Title <input type="text" id="th-title" maxlength="140" value="${e(th.title || '')}" placeholder="from your core message"></label><label>Line <input type="text" id="th-line" maxlength="200" value="${e(th.line || '')}" placeholder="from your core message"></label></div>
${thScreens.length ? `<div class="thtext"><label>Screen <select id="th-screen"><option value="">The first screenshot</option>${thScreens.map((s) => `<option value="${e(s.id)}"${th.screen === s.id ? ' selected' : ''}>${e(s.what || s.id)}</option>`).join('')}</select></label></div>` : ''}
<div class="thask"><label for="th-ask">Ask for a change</label><div class="thaskrow"><textarea id="th-ask" rows="2" placeholder="e.g. Use the dashboard, not the homepage; a bigger title"></textarea><button type="button" class="quiet" id="th-askgo">Ask Claude</button></div><div class="small muted" id="th-askstate" aria-live="polite"></div></div>
<label class="thintro"><input type="checkbox" id="th-intro"${th.intro ? ' checked' : ''}> <span><b>Open the video with this thumbnail</b> <span class="muted">About 1.5 s, taken from scene 1.</span></span></label>
<div class="thgen small muted"><span class="thtag">Connect a video AI service/API</span> for a generated picture option</div>
<p class="small muted" style="margin:0">Saved with the final video in 1280 × 720, 1080 × 1080 and 1200 × 630${thVertical ? ', and 1080 × 1920 for the vertical version' : ''}.</p></div>
<div class="thlb" id="thlb" hidden><div class="thlbin"><button type="button" class="thx" aria-label="Close">×</button><div class="thlbimgs" id="thlbimgs"></div></div></div>`;
  const styleLine = P.style?.resolved === 'brand' ? 'a look derived from your brand' : d.video_style ? `the video style ${e((P.styles || []).find((s) => s.id === d.video_style)?.name || d.video_style)}` : 'a look derived from your brand';

  const body = `<section class="screen" id="screen-refine">
${stepper('refine', state, { embed })}
<h1>Refine: ${ed(p('name'), d.name)}</h1>
<p class="lead">Direction ${letter}, ${ed(p('mood'), d.mood)}, in ${styleLine}. ${e(d.idea)} Everything here can be edited; the build follows what is written. <a href="${embed ? '#direction' : '/direction'}" data-tab="direction">Pick a different direction</a>.${sample ? ' <b>Static preview:</b> edits stay on this page.' : ''}</p>
<div class="problems" id="problems"><b>A few things to fix before confirming</b><ul id="problem-list"></ul></div>
<section id="card-moments"><div class="todo"><b>What to check:</b> each scene's words on screen and its motion style. The boxes with a dark edge are yours to change; everything else is optional and saves as you type.</div>
<h2 class="sechead">The scenes · ${d.moments.length} in ${e(total)} seconds</h2><p class="help">The brief asked for ${e(rangeWords)}. Scenes keep their own lengths while the total stays in that range; past its edge they are scaled back together.</p><div class="scenes">${rows}</div>${narratedV ? VOICE_UI : ''}<div class="card"><details class="fold"><summary>Sketch storyboard${d.sketch ? ` · <a href="${e(assets.project + d.sketch)}" target="_blank">open on its own</a>` : ''}</summary><div class="sk"><div class="grid">${cellsHtml(d, video, c)}</div></div></details></div></section>
<h2 class="sechead">Overall style settings</h2>
<div class="grid overall">${coloursCard}${typeCard}${soundCard}${hookCard}<div class="span2">${settingsCard}</div>${castCard}<div class="span2">${logoMotionCard}</div><div class="span2">${thumbCard}</div><div class="span3">${assetsCard}</div></div>
<div class="card"><details class="fold" style="border-top:0;padding-top:0"><summary>Not in this video (${(d.banned || []).length})</summary><textarea data-path="${p('banned')}" data-list="1" style="margin-top:8px">${e((d.banned || []).join('\n'))}</textarea></details>
<details class="fold"><summary>The brief, with the values proposed from your site</summary><div style="margin-top:8px">${briefRows.map(([k, x]) => `<div class="kv"><span>${e(k)}</span><div>${x}</div></div>`).join('')}</div></details>
<details class="fold"><summary>Keywords and facts from your site (${claims.length})</summary><p class="small muted">Read from your site, each with the page it comes from. Untick one and no moment may cite it. These are the facts you stand behind.</p><ul>${claimRows || '<li class="muted">none found on the public pages</li>'}</ul></details>
<details class="fold"><summary>Notes from the site read</summary><p class="small muted" style="margin-top:8px">${e((P.scout_notes || []).join(' '))}${opts.costLine ? ` · ${e(opts.costLine)}` : ''}</p></details></div>
<div class="shelf" id="motionshelf" hidden role="dialog" aria-label="Change motion"><div class="sheet"><div class="head"><div><h2 id="shelftitle">Change motion</h2><div class="small muted" id="shelfnote">Pick by eye; the choice is saved for this moment.</div></div><button type="button" class="quiet" id="shelfclose">Close</button></div><h3>Same family, same purpose</h3><div class="optgrid" id="shelfsame"></div><h3>More like this</h3><div class="optgrid" id="shelflike"></div><h3 class="allhead"><button type="button" class="quiet" id="shelfallbtn">Browse all motion styles</button><select id="shelffam" hidden aria-label="Family"></select></h3><div class="optgrid" id="shelfall" hidden></div></div></div>
<div class="bar"><button type="button" class="primary" id="confirm">Confirm direction ${letter} and write the plan</button><span class="status">${sample ? 'Static preview: nothing is saved.' : 'Edits save as you type.'}</span></div>
</section>`;
  const script = `(function(){var R=document.getElementById('screen-refine');var SAMPLE=${sample ? 'true' : 'false'};${COMMON_JS}
(function(){var card=R.querySelector('#card-thumb');if(!card||SAMPLE)return;var path=card.getAttribute('data-thpath');var lb=document.getElementById('thlb');
var on=card.querySelector('.thopt.on');var cur={layout:on?on.getAttribute('data-layout'):'info'};
function state(){var sc=card.querySelector('#th-screen');return {layout:cur.layout,intro:card.querySelector('#th-intro').checked,title:card.querySelector('#th-title').value.trim(),line:card.querySelector('#th-line').value.trim(),screen:sc?sc.value:''};}
function save(){return fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:path,value:state()})});}
function load(){fetch('/api/thumbs',{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){if(!j.ok)return;j.files.forEach(function(f){var id=f.split('/').pop().replace('-wide.png','');var im=card.querySelector('img[data-thimg="'+id+'"]');if(im){im.onload=function(){im.parentNode.classList.add('ready');};im.src=f;}});if(j.defaults){card.querySelector('#th-title').placeholder=j.defaults.title||'';card.querySelector('#th-line').placeholder=j.defaults.line||'';}}).catch(function(){});}
function open(id){var box=document.getElementById('thlbimgs');box.innerHTML='<p class="small muted">Drawing every size…</p>';lb.hidden=false;fetch('/api/thumbs?layout='+encodeURIComponent(id),{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){if(!j.ok){box.textContent=j.error||'Could not draw the sizes.';return;}box.innerHTML=j.files.map(function(f,k){var z=j.sizes[k]||{};return '<figure><img src="'+f+'" alt=""><figcaption>'+(z.label||'')+' · '+(z.use||'')+'</figcaption></figure>';}).join('');});}
card.querySelectorAll('.thopt').forEach(function(o){o.addEventListener('click',function(ev){ev.preventDefault();var id=o.getAttribute('data-layout');if(cur.layout===id){open(id);return;}cur.layout=id;card.querySelectorAll('.thopt').forEach(function(x){x.classList.toggle('on',x===o);});save();});});
card.querySelector('#th-intro').addEventListener('change',save);
var scSel=card.querySelector('#th-screen');if(scSel)scSel.addEventListener('change',function(){save().then(load);});
// D-92: a change in words; Claude makes it (fields or the video's own thumbnail style) and answers here
var ask=card.querySelector('#th-ask'),askState=card.querySelector('#th-askstate'),askPoll=null;
function askShow(j){if(!j||!j.ok)return;if(j.pending){askState.textContent='Sent to Claude: '+j.request+' (it changes the thumbnail and answers here).';if(!askPoll)askPoll=setInterval(function(){fetch('/api/thumb-request',{cache:'no-store'}).then(function(r){return r.json();}).then(function(k){if(k.ok&&!k.pending){clearInterval(askPoll);askPoll=null;askShow(k);load();}});},3000);}else if(j.answer){askState.textContent='Claude: '+j.answer;}}
card.querySelector('#th-askgo').addEventListener('click',function(){var text=ask.value.trim();if(!text)return;fetch('/api/thumb-request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:text,path:path})}).then(function(r){return r.json();}).then(function(j){if(j.ok){ask.value='';askShow(j);}else askState.textContent=j.error||'Could not send it.';});});
fetch('/api/thumb-request',{cache:'no-store'}).then(function(r){return r.json();}).then(askShow).catch(function(){});
var tm=null;['#th-title','#th-line'].forEach(function(sel){card.querySelector(sel).addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(function(){save().then(load);},900);});});
lb.addEventListener('click',function(ev){if(ev.target===lb||ev.target.classList.contains('thx'))lb.hidden=true;});
load();})();
R.querySelectorAll('.lmopt input').forEach(function(r){r.addEventListener('change',function(){R.querySelectorAll('.lmopt').forEach(function(l){l.classList.toggle('on',l.querySelector('input').checked)});});});
(function(){var cc=R.querySelector('#card-cast');if(!cc)return;var list=cc.querySelector('.castlist');
function saveCast(){var rows=[].slice.call(list.querySelectorAll('.castrow')).map(function(r){var o={name:r.querySelector('.castname').value.trim(),role:r.querySelector('.castrole').value.trim()};if(r.dataset.was)o.was=r.dataset.was;return o}).filter(function(c){return c.name||c.role});save(cc.dataset.castpath,rows);var em=cc.querySelector('.castempty');if(em)em.hidden=rows.length>0;}
function wire(r){r.querySelectorAll('input').forEach(function(i){i.addEventListener('input',saveCast)});r.querySelector('.castdel').addEventListener('click',function(){r.remove();saveCast();});}
list.querySelectorAll('.castrow').forEach(wire);
cc.querySelector('#castadd').addEventListener('click',function(){var r=document.createElement('div');r.className='castrow';r.innerHTML='<input type="text" class="castname" placeholder="Name" aria-label="Name"><input type="text" class="castrole" placeholder="Their role in the story" aria-label="Role"><button type="button" class="quiet castdel" aria-label="Remove">×</button>';list.appendChild(r);wire(r);r.querySelector('input').focus();});})();
R.querySelectorAll('[data-claimref]').forEach(function(box){box.addEventListener('change',function(){var j=box.dataset.claimref;var on=[].slice.call(R.querySelectorAll('[data-claimref="'+j+'"]')).filter(function(b){return b.checked});box.closest('label').classList.toggle('on',box.checked);var sum=R.querySelector('[data-factsum="'+j+'"]');if(sum)sum.innerHTML=on.length?on.map(function(b){var sp=document.createElement('span');sp.className='pill on';sp.textContent=b.parentNode.textContent;return sp.outerHTML}).join(' '):'<span class="pill">None</span>';});});
var MUSIC=${jsonForScript(music)};var MUSIC_BASE=${jsonForScript(assets.music)};var CHOSEN=${i};
var MOTION=${jsonForScript(MOTION)};var SHELVES=${jsonForScript(shelves)};var RULES=${jsonForScript(chosenRules)};var MOTION_BASE=${jsonForScript(assets.motion)};
(function(){var shelf=R.querySelector('#motionshelf');if(!shelf)return;var cur=null;
function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function opt(id,on){var x=MOTION[id];if(!x)return '';return '<figure class="mopt'+(on?' on':'')+'" tabindex="0" data-id="'+esc(id)+'"><div class="mthumb"><video muted loop playsinline preload="none" poster="'+esc(MOTION_BASE+x.poster)+'" src="'+esc(MOTION_BASE+x.preview)+'"></video></div><figcaption><b>'+esc(x.name)+'</b><span>'+esc(x.family)+' · '+esc(x.energy)+' · '+esc(x.line)+'</span></figcaption></figure>';}
function open(j,k){var id=RULES[j][k];var sh=SHELVES[id]||{same:[],like:[]};cur={j:j,k:k};var others=RULES[j].filter(function(r,i){return i!==k});
R.querySelector('#shelftitle').textContent='Change motion: '+((MOTION[id]||{}).name||'');
R.querySelector('#shelfsame').innerHTML=sh.same.filter(function(x){return others.indexOf(x)<0}).slice(0,8).map(function(x){return opt(x,false)}).join('');
R.querySelector('#shelflike').innerHTML=sh.like.filter(function(x){return others.indexOf(x)<0}).map(function(x){return opt(x,false)}).join('')||'<span class="muted small">no neighbours listed</span>';
shelf.hidden=false;shelf.querySelectorAll('video').forEach(function(v){try{v.play()}catch(e){}});}
function browseAll(){var all=R.querySelector('#shelfall'),fam=R.querySelector('#shelffam');var ids=Object.keys(MOTION);var fams=[];ids.forEach(function(id){var f=MOTION[id].family;if(fams.indexOf(f)<0)fams.push(f)});fams.sort();
fam.innerHTML='<option value="">All families ('+ids.length+')</option>'+fams.map(function(f){return '<option>'+esc(f)+'</option>'}).join('');fam.hidden=false;
function draw(){var f=fam.value;all.innerHTML=ids.filter(function(id){return !f||MOTION[id].family===f}).map(function(id){return opt(id,false)}).join('');all.hidden=false;}
fam.onchange=draw;draw();R.querySelector('#shelfallbtn').hidden=true;}
function close(){shelf.hidden=true;R.querySelector('#shelfall').hidden=true;R.querySelector('#shelfall').innerHTML='';R.querySelector('#shelffam').hidden=true;R.querySelector('#shelfallbtn').hidden=false;shelf.querySelectorAll('video').forEach(function(v){try{v.pause()}catch(e){}});cur=null;}
function pick(id){if(!cur)return;var j=cur.j,k=cur.k;var next=RULES[j].slice();next[k]=id;next=next.filter(function(x,i){return next.indexOf(x)===i});RULES[j]=next;save('directions.'+CHOSEN+'.moments.'+j+'.rules',next);
var tile=R.querySelector('.mtile[data-moment="'+j+'"][data-slot="'+k+'"]');var x=MOTION[id];if(tile&&x){tile.dataset.id=id;var v=tile.querySelector('video');v.poster=MOTION_BASE+x.poster;v.src=MOTION_BASE+x.preview;try{v.play()}catch(e){}tile.querySelector('b').textContent=x.name;tile.querySelector('b').title=x.line||'';}
close();}
R.querySelectorAll('.changemotion').forEach(function(b){b.addEventListener('click',function(){open(Number(b.dataset.moment),Number(b.dataset.slot))})});
R.querySelector('#shelfallbtn').addEventListener('click',browseAll);
shelf.addEventListener('mouseover',function(ev){var f=ev.target.closest('#shelfall .mopt');if(f){var v=f.querySelector('video');if(v&&v.paused)v.play().catch(function(){});}});
shelf.addEventListener('click',function(ev){var f=ev.target.closest('.mopt');if(f){pick(f.dataset.id);return;}if(ev.target===shelf)close();});
shelf.addEventListener('keydown',function(ev){if(ev.key==='Escape')close();if(ev.key==='Enter'){var f=ev.target.closest('.mopt');if(f)pick(f.dataset.id);}});
R.querySelector('#shelfclose').addEventListener('click',close);})();
R.querySelectorAll('.fontsel').forEach(function(s){s.addEventListener('change',function(){var role=(s.dataset.path.match(/type\\.(\\w+)$/)||[])[1];var sample=s.closest('.typerow').querySelector('.sample');sample.style.fontFamily="'"+s.value+"',system-ui";if(role==='display')R.querySelectorAll('.mrow .copy').forEach(function(c){c.style.fontFamily="'"+s.value+"',system-ui"});})});
var player=R.querySelector('#music-player');function seekBed(){if(player){var f=Number(player.dataset.from||0);if(f&&player.currentTime<f)player.currentTime=f;}}
if(player){player.addEventListener('loadedmetadata',seekBed);player.addEventListener('play',seekBed);}
var msel=R.querySelector('.musicsel');if(msel)msel.addEventListener('change',function(){var m=MUSIC.find(function(x){return x.file===msel.value});if(!m)return;player.dataset.from=m.usable_from_s||0;player.src=m.src||MUSIC_BASE+m.file;R.querySelector('#musicmeta').textContent=m.title+' · '+(m.set==='calm'?'Calm set':'Energetic set')+(m.bpm?' · '+m.bpm+' bpm':'')+(typeof m.beat_strength==='number'?' · beat '+m.beat_strength:'')+(m.usable_from_s?' · bed starts at '+m.usable_from_s+' s':'');R.querySelector('#musictags').innerHTML=(m.mood||[]).map(function(t){return '<span>'+t+'</span>'}).join('');R.querySelector('#musicnote').textContent=m.note||'';});
var confirmBtn=R.querySelector('#confirm');
confirmBtn.addEventListener('click',function(){if(SAMPLE){setStatus('Static preview: confirming writes nothing here. Run node plan/direction/run.mjs <project-dir>.');return;}confirmBtn.disabled=true;setStatus('Writing the plan…');clearTimeout(timer);Promise.resolve(flush()).then(function(){return post('/api/confirm',{chosen:CHOSEN})}).then(function(j){if(j.ok){location.href=j.next;return;}var list=R.querySelector('#problem-list');list.innerHTML=(j.problems||[{what:j.error||'could not confirm',fix:''}]).map(function(p){return '<li>'+(p.what||'')+' <span class="muted small">'+(p.fix||'')+'</span></li>'}).join('');R.querySelector('#problems').classList.add('on');window.scrollTo({top:0,behavior:'smooth'});setStatus('Fix the items at the top, then confirm again.',true);confirmBtn.disabled=false;}).catch(function(err){setStatus('Could not confirm: '+err.message,true);confirmBtn.disabled=false;});});
})();`;
  const css = sketchCss(d, c).replace(/\.sk /g, '#screen-refine .sk ');
  return { title: `Refine · ${video.product}`, body, script, css };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function wrap({ title, fonts, assets, css = '', bodies, scripts, vertical = false }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title>
<link rel="stylesheet" href="/ui/ui.css"><style>${allFontFaces(fonts || [], assets.fonts)}
${CSS}
${css}</style></head><body${vertical ? ' class="vert"' : ''}><main>
<div class="ud-pin">${UD_HEAD}
${progressBar('direction')}</div>
${bodies.join('\n')}
</main>
<script>
(function(){var pin=document.querySelector('.ud-pin');if(pin)window.addEventListener('scroll',function(){pin.classList.toggle('stuck',window.scrollY>8)},{passive:true});})();
${scripts.join('\n')}
</script></body></html>`;
}

export function renderStylePage(opts) {
  const vertical = setSketchFormat(opts.proposals.video?.format);
  const s = buildStyleScreen(opts);
  return wrap({ title: s.title, fonts: opts.proposals.fonts, assets: opts.assets, bodies: [s.body], scripts: [s.script], vertical });
}

export function renderDirectionPage(opts) {
  const vertical = setSketchFormat(opts.proposals.video?.format);
  const s = buildDirectionScreen(opts);
  return wrap({ title: s.title, fonts: opts.proposals.fonts, assets: opts.assets, bodies: [s.body], scripts: [s.script], vertical });
}

export function renderRefinePage(opts) {
  const vertical = setSketchFormat(opts.proposals.video?.format);
  const s = buildRefineScreen(opts);
  return wrap({ title: s.title, fonts: opts.proposals.fonts, assets: opts.assets, css: s.css || '', bodies: [s.body], scripts: [s.script], vertical });
}

/** The three screens in one static page with tabs (the preview; no server). */
export function renderPreview(opts) {
  const o = { ...opts, sample: true, embed: true };
  const vertical = setSketchFormat(opts.proposals.video?.format);
  const st = buildStyleScreen(o), di = buildDirectionScreen(o), re = buildRefineScreen(o);
  const start = ['style', 'direction', 'refine'].includes(opts.state?.stage) ? opts.state.stage : 'direction';
  const tabs = `<div class="tabs" id="tabs"><button type="button" data-tab="style">1 · Video style</button><button type="button" data-tab="direction">2 · Direction</button><button type="button" data-tab="refine">3 · Refine</button><span class="small muted" style="align-self:center">Static preview of a recorded run: three screens, no server.</span></div>`;
  const tabJs = `window.__showTab=function(name){document.querySelectorAll('.screen').forEach(function(s){s.hidden=s.id!=='screen-'+name});document.querySelectorAll('#tabs button').forEach(function(b){b.classList.toggle('on',b.dataset.tab===name)});history.replaceState(null,'','#'+name);window.scrollTo(0,0);};
document.querySelectorAll('[data-tab]').forEach(function(el){el.addEventListener('click',function(ev){ev.preventDefault();window.__showTab(el.dataset.tab)})});
window.__showTab((location.hash||'').replace('#','')||${jsonForScript(start)});`;
  return wrap({ title: `Direction step · ${opts.proposals.video.product} (preview)`, fonts: opts.proposals.fonts, assets: opts.assets, css: re.css || '', bodies: [tabs, st.body, di.body, re.body], scripts: [st.script, di.script, re.script, tabJs] , vertical });
}

/** The confirmation page after the plan is written. */
export function renderConfirmedPage({ plan, planPath, problems = [], chosen = null, missing = false, projectDir = '' }) {
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Production · Ultrademo</title><link rel="stylesheet" href="/ui/ui.css"><style>${CSS}${PRODUCTION_CSS}</style></head><body><main><div class="ud-pin">${UD_HEAD}${progressBar('production')}</div>`;
  if (missing || !plan?.direction) return `${head}<h1>No direction chosen yet</h1><p class="lead">Nothing has been written to the plan in <span class="mono">${e(projectDir)}</span>. <a href="/direction">Back to the directions</a>.</p></main></body></html>`;
  const d = plan.direction;
  const scenes = plan.scenes || [];
  const notes = problems.filter((p) => p.level === 'warning');
  const trackFile = String(d.music.track).split(';')[0].split(' (')[0].trim();
  const track = musicTracks().find((t) => trackFile.endsWith(t.file));
  const rows = scenes.map((s, i) => `<li class="prow" data-scene="${e(s.id)}"><span class="pdot"></span><span class="pname"><b>${i + 1}. ${e(s.name)}</b><small>${e(nice(s.beat))} · ${e(s.start_s)}–${e(Math.round((s.start_s + s.duration_s) * 10) / 10)} s</small></span><span class="pstate">Waiting</span><span class="pstrip"></span></li>`).join('');
  return `${head}<h1>Direction ${e(d.chosen)} chosen: ${e(d.name)}</h1>
<section class="card hero working" aria-live="polite">
  <div class="work-head"><span class="spin" id="spin" aria-hidden="true"></span><div><h2 id="work-title">Claude is building your video</h2><p id="work-status">Nothing to do here. Each scene appears below as it is built; the review page opens by itself when the whole video is ready.</p></div></div>
  <ol class="work-steps"><li data-step="started">Your AI agent picks up the plan</li><li data-step="kit">The kit: your colours, type and the product's screens rebuilt in code</li><li data-step="scenes">The scenes, one by one (<span id="scount">0</span> of ${scenes.length})</li><li data-step="joins">The joins between scenes, checked</li><li data-step="video">The whole video: music, voice and sound</li><li data-step="review">The review page</li></ol>
  <ul class="prows">${rows}</ul>
  <div class="nudge" id="nudge" hidden><p><b>Claude has not started yet.</b> Paste this into the Claude chat:</p><div class="copyrow"><code id="nudge-text">the direction is confirmed</code><button type="button" id="nudge-copy">Copy</button></div></div>
  <p class="small muted" id="tokens" style="margin:14px 0 0"></p>
</section>
<div class="light" id="light" hidden role="dialog" aria-label="Frames"><figure><img id="light-img" alt=""><figcaption><button type="button" data-step="-1" aria-label="Previous frame">‹</button><span id="light-cap"></span><button type="button" data-step="1" aria-label="Next frame">›</button><button type="button" id="light-close">Close</button></figcaption></figure></div>
<details class="card saved-sum"><summary><b>What was written</b> <span class="muted small">${scenes.length} scenes · ${e(plan.video.length_s)} s · ${e(planPath)}</span></summary>
<div class="kv"><span>The look in a line</span><div>${e(d.mood)} · ${e(d.canvas)} canvas${d.video_style ? ` · video style ${e(nice(d.video_style))}` : ' · derived from your brand'}</div></div>
<div class="kv"><span>Signature move</span><div>${e(d.signature_move)}</div></div>
<div class="kv"><span>Opening hook</span><div>${e(w('angle', d.hook.angle))}; lands through ${e(w('route', d.hook.route))}</div></div>
<div class="kv"><span>Closing shot</span><div>${e(w('close', d.close))}</div></div>
${d.logo_motion ? `<div class="kv"><span>Logo motion</span><div>${e(nice(d.logo_motion))}</div></div>` : ''}
${d.thumbnail ? `<div class="kv"><span>Thumbnail</span><div>${e({ info: 'Informational', headline: 'Big headline', product: 'Product and headline', versus: 'Problem → answer', moment: 'A moment from the video' }[d.thumbnail.layout] || d.thumbnail.layout)}${d.thumbnail.intro ? ' · the video opens on it' : ''}</div></div>` : ''}
${(d.cast || []).length ? `<div class="kv"><span>People and names</span><div>${d.cast.map((c) => `${e(c.name)} <span class="muted small">${e(c.role)}</span>`).join(' · ')}</div></div>` : ''}
<div class="kv"><span>Typography</span><div>${['display', 'text', 'mono'].map((r) => e(typeof d.type[r] === 'string' ? d.type[r] : d.type[r].family)).join(' · ')}</div></div>
<div class="kv"><span>Music</span><div>${e(track?.title || nice(path.basename(trackFile, path.extname(trackFile))))}${d.music.bpm ? ` · ${d.music.bpm} bpm` : ''}</div></div>
<div class="kv"><span>Narration</span><div>${e(d.voice?.tier === 'none' ? 'None (music only)' : (() => { const x = loadCatalogue().voices.find((y) => y.spec === d.voice?.voice); return x ? `${x.name} · ${x.provider === 'elevenlabs' ? 'ElevenLabs, your account' : 'Free'}` : d.voice?.voice || 'Free voice'; })())}</div></div>
<div class="kv"><span>Facts cited</span><div>${(plan.video.claims || []).filter((c) => c.kind !== 'sample').length} from your site</div></div>
${notes.length ? `<div class="kv"><span>Notes from the plan check</span><div><ul style="margin:0;padding-left:18px">${notes.map((n) => `<li>${e(n.scene)}: ${e(n.what)} <span class="muted small">${e(n.fix)}</span></li>`).join('')}</ul></div></div>` : ''}
<p class="small" style="margin-top:12px"><a href="/refine">Back to refine</a> or <a href="/direction">pick another direction</a>; confirming again rewrites the direction and the scenes.</p></details>
<aside class="info" aria-label="About production"><h3>About production</h3><ul>
<li>Each scene is written as a small animated page over your kit, following its sketch, then built into frames.</li>
<li>Every scene and every join between scenes is checked before you see it: frames at each event, how long anything sits still, words per second, and the facts it cites.</li>
<li>The review page shows the whole video; you comment on a moment and a spot on the frame, and Claude fixes it.</li>
</ul></aside>
</main>
<script>
(function(){
  var REVIEW = 'http://127.0.0.1:4330/', NUDGE_MS = 5 * 60 * 1000, done = false;
  var title = document.getElementById('work-title'), st = document.getElementById('work-status'), nudge = document.getElementById('nudge'), spin = document.getElementById('spin');
  var WORDS = { waiting: 'Waiting', written: 'Written', built: 'Built, checking', passes: 'Built ✓', fixing: 'Fixing a check' };
  function mark(p){
    var order = ['started', 'kit', 'scenes', 'joins', 'video', 'review'];
    var state = { started: p.started, kit: p.kit, scenes: p.scenes && p.scenes.length && p.scenes_done === p.scenes.length, joins: p.joins_needed === 0 ? p.scenes_done === p.scenes.length : p.joins >= p.joins_needed, video: !!p.video, review: !!p.review };
    var cur = order.findIndex(function(k){ return !state[k]; });
    document.querySelectorAll('.work-steps li').forEach(function(li, i){ li.className = state[order[i]] ? 'done' : i === cur ? 'now' : ''; });
    document.getElementById('scount').textContent = p.scenes_done || 0;
    (p.scenes || []).forEach(function(s){
      var row = document.querySelector('.prow[data-scene="' + s.id + '"]'); if (!row) return;
      row.dataset.state = s.state; row.querySelector('.pstate').textContent = WORDS[s.state] || s.state;
      // the frames in one line, redrawn whenever they are rewritten; an image that fails to load is tried again
      if (!(s.frames || []).length && s.strip) s.frames = [s.strip];
      var key = (s.frames || []).join('|') + '#' + (s.version || 0);
      if ((s.frames || []).length && row.dataset.key !== key) {
        row.dataset.key = key;
        var box = row.querySelector('.pstrip'); box.innerHTML = '';
        s.frames.forEach(function(f, k){ var im = new Image(); im.alt = s.name + ', frame ' + (k + 1); im.loading = 'lazy'; im.src = '/project/' + f + '?v=' + (s.version || Date.now()); im.dataset.tries = '0';
          im.onerror = function(){ var n = Number(im.dataset.tries) + 1; im.dataset.tries = n; if (n < 4) setTimeout(function(){ im.src = '/project/' + f + '?r=' + Date.now(); }, 1500 * n); };
          im.addEventListener('click', function(){ openLight(s, k); }); box.appendChild(im); });
      }
    });
    if (p.tokens) document.getElementById('tokens').textContent = 'About ' + fmt(p.tokens.read) + ' tokens read and ' + fmt(p.tokens.written) + ' written by Claude on this video so far (estimated from ' + p.tokens.tasks + ' tasks and the scene code; /cost in Claude Code shows the exact session use).';
  }
  function fmt(n){ return n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
  // a scene's frames large: click a frame, step with the arrows, Escape closes
  var light = document.getElementById('light'), lightImg = document.getElementById('light-img'), lightCap = document.getElementById('light-cap'), cur = null;
  function showLight(){ lightImg.src = '/project/' + cur.s.frames[cur.k] + '?v=' + (cur.s.version || 0); lightCap.textContent = cur.s.name + ' · frame ' + (cur.k + 1) + ' of ' + cur.s.frames.length; }
  function openLight(s, k){ cur = { s: s, k: k }; showLight(); light.hidden = false; }
  light.addEventListener('click', function(ev){ if (ev.target === light || ev.target.id === 'light-close') light.hidden = true; if (ev.target.dataset.step) { cur.k = (cur.k + Number(ev.target.dataset.step) + cur.s.frames.length) % cur.s.frames.length; showLight(); } });
  document.addEventListener('keydown', function(ev){ if (light.hidden) return; if (ev.key === 'Escape') light.hidden = true; if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { cur.k = (cur.k + (ev.key === 'ArrowRight' ? 1 : -1) + cur.s.frames.length) % cur.s.frames.length; showLight(); } });
  function ready(){ done = true; spin.classList.add('stop'); nudge.hidden = true; title.textContent = 'Your video is ready for review'; st.innerHTML = 'The review page opened in another tab. If not, <a href="' + REVIEW + '">open it here</a>.'; }
  function poll(){
    if (done) return;
    fetch('/api/production', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(p){
      fetch(REVIEW, { mode: 'no-cors', cache: 'no-store' }).then(function(){ p.review = true; mark(p); if (p.video) ready(); }, function(){ mark(p); });
      nudge.hidden = !!p.started || Date.now() - (p.confirmed_at || Date.now()) < NUDGE_MS;
      if (p.started && !done) st.textContent = 'Claude is on it. Nothing to do here; each scene appears below as it is built.';
    }).catch(function(){}).then(function(){ setTimeout(poll, 5000); });
  }
  document.getElementById('nudge-copy').addEventListener('click', function(ev){ var b = ev.currentTarget; (navigator.clipboard ? navigator.clipboard.writeText('the direction is confirmed') : Promise.reject()).then(function(){ b.textContent = 'Copied'; }, function(){ b.textContent = 'Select and copy'; }); setTimeout(function(){ b.textContent = 'Copy'; }, 2000); });
  var pin = document.querySelector('.ud-pin'); if (pin) window.addEventListener('scroll', function(){ pin.classList.toggle('stuck', window.scrollY > 8); }, { passive: true });
  poll();
})();
</script></body></html>`;
}
