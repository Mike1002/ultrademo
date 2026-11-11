import path from 'node:path';
// review/page.mjs — the review page: the player, the frame you can mark, the timeline with scenes and comments, the
// comments list, and a full-screen view. On the design system (/ui/ui.css, Flow, light and dark). Everything the user types is rendered with
// textContent; the data block is JSON with "<" escaped.
import { UD_HEAD, progressBar } from '../intake/page.mjs';
import { safeLink } from '../updates.mjs';

const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtK = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The offer from the release file (plan/updates.mjs, links on our own hosts only), tagged with where it was clicked. */
export function offerLink(offer, from, version = '') {
  if (!offer?.url || !safeLink(offer.url)) return '';
  try { const u = new URL(safeLink(offer.url)); u.searchParams.set('ref', 'skill'); u.searchParams.set('from', from); if (version) u.searchParams.set('v', version); return u.toString(); } catch { return ''; }
}
const offerHtml = (offer, from, version) => { const href = offerLink(offer, from, version); return href ? `<span class="rv-offer">${esc(offer.text)} <a class="rv-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(offer.button)}</a></span>` : ''; };

export function renderReviewPage({ project, videos, video, videoPath = null, title, scenes, tokens = null, approved = null, thumbs = [], cuts = [], offer = null, version = '', credit = null, view = 'auto' }) {
  const isCut = /^cut-\d+\.mp4$/.test(video?.name || '');
  const cutFinal = isCut ? cuts.find((c) => c.video === video.name) : null;
  const final = !/^cut-\d+\.mp4$/.test(video?.name || '') && approved && video && (approved.video === video.name || (approved.videos || []).includes(video.name)) ? approved : null;
  // D-82: a landscape video with its vertical version: a format switch instead of the file picker
  const hasV = videos.some((v) => v.name === 'video-vertical.mp4') && videos.some((v) => v.name === 'video.mp4');
  const isV = video?.name === 'video-vertical.mp4';
  const formats = hasV ? ['video.mp4', 'video-vertical.mp4'] : [];
  const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
  // the Delivery view is its own screen once the video is approved; ?review=1 opens the review page again to change something
  const anyFinal = approved && approved.final ? approved : null;
  const delivery = Boolean(anyFinal) && view !== 'review';
  const qs = anyFinal ? '&review=1' : '';
  const cutVids = videos.filter((v) => /^cut-\d+\.mp4$/.test(v.name));
  const restVids = videos.filter((v) => !formats.includes(v.name) && !/^cut-\d+\.mp4$/.test(v.name) && !(hasV ? false : v.name === 'video.mp4'));
  const cutLabel = (n) => n.replace(/^cut-(\d+)\.mp4$/, '$1 s cut');
  const tabs = [
    ...(hasV ? [{ name: 'video.mp4', label: 'Landscape', meta: '16:9', tall: false }, { name: 'video-vertical.mp4', label: 'Vertical', meta: '9:16', tall: true }] : videos.some((v) => v.name === 'video.mp4') ? [{ name: 'video.mp4', label: 'Video', meta: '', tall: false }] : []),
    ...restVids.map((v) => ({ name: v.name, label: v.name.replace(/\.mp4$/, ''), meta: '', tall: false })),
    ...cutVids.map((v) => ({ name: v.name, label: cutLabel(v.name), meta: hasV ? '9:16' : '', tall: hasV })),
  ];
  const shape = (tall) => `<span class="rv-shape" aria-hidden="true"><i style="${tall ? 'width:10px;height:17px' : 'width:22px;height:13px'}"></i></span>`;
  const tabRow = tabs.length > 1 || hasV ? `<div class="rv-tabs" role="tablist" aria-label="Format">${tabs.map((t) => `<a role="tab" class="rv-tab" href="?v=${esc(t.name)}${qs}" aria-selected="${t.name === video?.name}">${shape(t.tall)}${esc(t.label)}${t.meta ? ` <small>${esc(t.meta)}</small>` : ''}</a>`).join('')}${hasV && !isCut ? `<button type="button" class="rv-tab" id="rv-sbs" aria-pressed="false" title="Play the other format beside this one, in step"><span class="rv-shape" aria-hidden="true"><i style="width:18px;height:11px"></i><i style="width:8px;height:14px"></i></span>Side by side</button>` : ''}</div>` : '';
  // one approval finishes every format and cut
  const scope = [...(hasV ? ['16:9', '9:16'] : []), ...cutVids.map((v) => `the ${cutLabel(v.name)}`)];
  const scopeLine = scope.length > 1 ? `Approves all ${scope.length === 2 ? 'both' : scope.length === 3 ? 'three' : scope.length}: ${scope.slice(0, -1).join(', ')} and ${scope[scope.length - 1]}` : 'Keeps a dated final copy that stays as it is';
  const curLabel = (tabs.find((t) => t.name === video?.name) || { label: video?.name || '' }).label.toLowerCase();
  const dlMenu = videoPath ? `<div class="rv-dl"><button class="rv-btn" type="button" id="rv-dlbtn" aria-expanded="false" aria-haspopup="true">⤓ Download</button><div class="rv-dlmenu" id="rv-dlmenu" hidden><a id="rv-dl" href="/video/${esc(video.name)}" download="${esc(project)}-${esc(video.name)}">Download this version (${esc(curLabel)}, .mp4)</a><button type="button" id="rv-cpath">Copy the file path</button><code title="${esc(videoPath)}">…/${esc(videoPath.split(/[\\/]/).slice(-3).join('/'))}</code>${offer && offerLink(offer, 'review', version) ? `<a href="${esc(offerLink(offer, 'review', version))}" target="_blank" rel="noopener noreferrer">${esc(offer.text)} ${esc(offer.button)} ↗</a>` : ''}</div></div>` : '';
  const data = { project, video: delivery ? null : video?.name || null, videoPath, scenes, formats: isCut ? [] : formats, approveAll: [...(hasV ? formats : video ? [video.name === 'video-vertical.mp4' ? 'video.mp4' : video.name] : []), ...cutVids.map((v) => v.name)].filter((n, i, a) => a.indexOf(n) === i && !(isCut && false)) };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review · ${esc(title)}</title>
<link rel="stylesheet" href="/ui/ui.css">
<style>
body{margin:0;background:var(--surface-soft);color:var(--text);font-family:var(--ud-body)}
/* the same header and container rhythm as the intake page: logo inside the content column, 28 px under it */
.ud-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 22px}
main{max-width:1180px;margin:0 auto;padding:22px 28px 36px}
.rv-top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:12px}
.rv-top h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(26px,3.4vw,34px);letter-spacing:-.035em;line-height:1.04;margin:8px 0 0}
.rv-file{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:-6px 0 18px;font-size:14px}
.rv-flabel{font:500 12px var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)}
.rv-file code{font:13px var(--font-mono);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(640px,100%)}
a.rv-btn{text-decoration:none;display:inline-block}
.rv-pick{display:flex;align-items:center;gap:10px;font-size:15px;color:var(--text-muted)}
.rv-pick select{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-pill);padding:8px 14px}
.rv-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:stretch}
@media (max-width:1000px){.rv-grid{grid-template-columns:1fr}.rv-side{contain:none;max-height:80vh}}
.rv-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);overflow:hidden}
.rv-stage{position:relative;background:#000}
.rv-frame{position:relative;aspect-ratio:16/9;width:100%;margin:0 auto}
.rv-frame video{position:absolute;inset:0;width:100%;height:100%;display:block}
.rv-frame.v{aspect-ratio:9/16;width:auto;height:min(76vh,860px)}
.rv-stage.sbs{display:flex;gap:12px;align-items:center;justify-content:center;padding:12px}.rv-stage.sbs .rv-frame{margin:0;flex:none}
.rv-other{position:relative;flex:none}.rv-other video{position:absolute;inset:0;width:100%;height:100%;display:block}.rv-otherlab{position:absolute;left:8px;bottom:8px;white-space:nowrap;max-width:calc(100% - 16px);overflow:hidden;text-overflow:ellipsis;font:600 11px var(--font-mono);color:#fff;background:rgba(0,0,0,.55);padding:3px 8px;border-radius:999px}
.rv-sbs[aria-pressed="true"]{background:var(--text)!important;color:var(--surface)!important}
.rv-fmt{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--surface)}.rv-fmt a{padding:7px 14px;font:600 13px var(--ud-body);color:var(--text-muted);text-decoration:none}.rv-fmt a.on{background:var(--text);color:var(--surface)}
.rv-both{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:8px 0 0;color:var(--text-muted)}.rv-both b{color:var(--text);font-weight:600}
/* full screen: the player fills the screen, the frame keeps 16:9, the controls and timeline stay below it */
.rv-player:fullscreen{display:flex;flex-direction:column;border:0;border-radius:0;background:#000}
.rv-player:fullscreen .rv-stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}
.rv-player:fullscreen .rv-frame{width:min(100vw,calc((100vh - 120px) * 16 / 9))}
.rv-player:fullscreen .rv-ctrl,.rv-player:fullscreen .rv-line{background:var(--surface)}
.rv-player:fullscreen .rv-line{margin:0;padding:0 16px 14px;height:46px}
#rv-over{position:absolute;inset:0;cursor:default;touch-action:none}
#rv-over.marking{cursor:crosshair;background:rgba(12,14,9,0.08);outline:3px solid var(--focus);outline-offset:-3px}
.rv-box{position:absolute;border:3px solid var(--play);border-radius:6px;pointer-events:auto;cursor:pointer}
#rv-over.marking .rv-box,#rv-over.marking .rv-pin{pointer-events:none}
.rv-num{position:absolute;min-width:24px;height:24px;padding:0 6px;border-radius:12px;background:var(--play);color:#fff;font:700 13px/24px var(--ud-body);text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:auto;cursor:pointer;transform:translate(-50%,-50%)}
.rv-num.done{background:var(--green)}
#rv-over.marking .rv-num{pointer-events:none}
#rv-over.hide .rv-box,#rv-over.hide .rv-pin,#rv-over.hide .rv-num{display:none}
#rv-over.hide .rv-box.draft{display:block}
.rv-n{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:var(--play);color:#fff;font:700 12px var(--ud-body)}
.rv-note.done .rv-n{background:var(--green)}
.rv-fu{display:none;margin-top:10px}
.rv-fu.on{display:block}
.rv-fu textarea{width:100%;box-sizing:border-box;min-height:64px;resize:vertical;font:15px/1.4 var(--ud-body);color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.rv-fu .row{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.rv-msg{margin-top:8px;padding:8px 10px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.45;color:var(--text);background:var(--surface-soft)}
.rv-msg.agent{border-left:3px solid var(--green)}
.rv-msg.reviewer{border-left:3px solid var(--play)}
.rv-msg b{display:block;font:600 11px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px}
.rv-x{white-space:nowrap}
.rv-box.done{border-color:var(--green)}
.rv-box.draft{border-style:dashed}
.rv-pin{position:absolute;width:26px;height:26px;margin:-26px 0 0 -13px;pointer-events:auto;cursor:pointer}
.rv-pin:before{content:"";position:absolute;inset:0;background:var(--play);border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35)}
.rv-pin.done:before{background:var(--green)}
.rv-tag{position:absolute;transform:translateY(-100%);margin-top:-6px;max-width:320px;padding:6px 10px;border-radius:10px;background:var(--surface);color:var(--text);font-size:14px;line-height:1.35;box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;white-space:normal}
.rv-hint{position:absolute;left:50%;top:16px;transform:translateX(-50%);padding:8px 14px;border-radius:var(--radius-pill);background:var(--ink);color:#fff;font-size:14px;pointer-events:none;display:none}
#rv-over.marking + .rv-hint{display:block}
.rv-ctrl{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--line)}
.rv-btn{font:600 14px var(--ud-body);color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-pill);padding:8px 14px;cursor:pointer;white-space:nowrap}
.rv-btn:hover{border-color:var(--text)}
.rv-btn:disabled{opacity:.4;cursor:default}
.rv-btn:focus-visible,.rv-x:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.rv-btn.primary{background:var(--action);color:var(--on-action);border-color:var(--ink);box-shadow:0 3px 0 var(--ink)}
.rv-btn.icon{width:38px;padding:8px 0;text-align:center}
/* the markers switch and the copy buttons wear the markers' colour so they are easy to find */
.rv-btn.mark{border:2px solid var(--play)}
.rv-btn.mark[aria-pressed="false"]{border-style:dashed;color:var(--text-muted)}
.rv-time{font:500 13px var(--font-mono);color:var(--text-muted);min-width:108px}
.rv-sp{flex:1}
.rv-speed{display:inline-flex;align-items:center;gap:6px}
.rv-rate{font:500 14px var(--font-mono);min-width:44px;text-align:center;color:var(--text)}
.rv-line{position:relative;height:46px;margin:0 16px 14px;cursor:pointer}
.rv-track{position:absolute;left:0;right:0;top:20px;height:6px;border-radius:3px;background:var(--line)}
.rv-fill{position:absolute;left:0;top:20px;height:6px;border-radius:3px;background:var(--text);width:0}
.rv-head{position:absolute;top:13px;width:4px;height:20px;margin-left:-2px;border-radius:2px;background:var(--text)}
.rv-sc{position:absolute;top:0;height:46px;border-left:1px solid var(--line)}
.rv-sc span{position:absolute;left:4px;top:30px;font:500 10px var(--font-mono);color:var(--text-muted);white-space:nowrap;overflow:hidden;max-width:100%}
.rv-mk{position:absolute;top:14px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--play);border:2px solid var(--surface);cursor:pointer}
.rv-mk.done{background:var(--green)}
.rv-mk.sel{box-shadow:0 0 0 3px var(--focus)}
/* the comments panel is exactly as tall as the player beside it (contain:size keeps its list from stretching the row); the list scrolls inside */
.rv-side{padding:16px;display:flex;flex-direction:column;box-sizing:border-box;contain:size;min-height:420px}
.rv-side > *{flex:none}
.rv-side h2{margin:0;font:700 18px var(--ud-body)}
.rv-sub{margin:3px 0 12px;font-size:13px;color:var(--text-muted)}
.rv-stale{display:none;margin:0 0 12px;padding:10px 12px;border-radius:12px;background:var(--cream);color:#5c4a00;font-size:14px}
.rv-comp{display:none;margin-bottom:16px;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--surface-soft)}
.rv-comp.on{display:block}
.rv-comp .meta{font:500 13px var(--font-mono);color:var(--text-muted);margin-bottom:8px}
.rv-comp textarea{width:100%;box-sizing:border-box;min-height:96px;resize:vertical;font:16px/1.45 var(--ud-body);color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.rv-comp .row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.rv-side .rv-list{list-style:none;margin:0;padding:0 2px 0 0;display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
.rv-note{padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.rv-note.sel{border-color:var(--text)}
.rv-note{cursor:pointer}
.rv-note.now{border-color:var(--play);box-shadow:0 0 0 2px var(--play)}
.rv-note.done .txt{color:var(--text-muted);text-decoration:line-through}
/* comment status pill */
.rv-badge{display:inline-block;padding:2px 10px;border-radius:var(--radius-pill);font:600 12px var(--ud-body);background:var(--pink-blush);color:#b0124f;white-space:nowrap}
.rv-badge.done{background:var(--mint-soft);color:#1f7a35}
.rv-reply{margin-top:8px;padding:8px 10px;border-left:3px solid var(--blue);background:var(--surface-soft);border-radius:0 8px 8px 0;font-size:14px;line-height:1.45;color:var(--text)}

.rv-player:fullscreen .rv-comp.on{position:absolute;right:24px;top:24px;width:400px;z-index:6;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.rv-player{position:relative}
.rv-note .top{display:flex;align-items:center;gap:5px;margin-bottom:6px;flex-wrap:wrap;row-gap:6px}
.rv-t{font:600 12px var(--font-mono);color:var(--text);background:var(--surface-highlight);border:0;border-radius:var(--radius-pill);padding:3px 8px;cursor:pointer}
.rv-scn{min-width:0;flex-basis:0;font:500 12px var(--font-mono);color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.rv-x{border:0;background:none;color:var(--text-muted);font:500 13px var(--ud-body);cursor:pointer;padding:2px 4px}
.rv-x:hover{color:var(--text)}
.rv-note .txt{font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
.rv-empty{padding:18px;border:1px dashed var(--line);border-radius:14px;color:var(--text-muted);font-size:14px;line-height:1.5}
.rv-keys summary{cursor:pointer;color:var(--text-muted)}
.rv-del{font-size:14px;padding:2px 4px;margin-left:auto}
.rv-keys{margin-top:10px;font-size:12px;color:var(--text-muted);line-height:1.6}
.rv-keys kbd{font:500 12px var(--font-mono);border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:0 5px}
.rv-saved{font:500 12px var(--font-mono);color:var(--text-muted)}
.rv-credit{margin:14px 0 0;font-size:14px}.rv-credit p{margin:4px 0 0}.rv-credit code{white-space:normal;overflow-wrap:anywhere}
.rv-final{padding:20px 24px;margin:0 0 18px;border:1.5px solid var(--text)}.rv-final h2{font-family:var(--ud-display);margin:4px 0 6px;font-size:26px}.rv-final p{margin:0}
.rv-approve{background:var(--text)!important;color:var(--surface)!important;border-color:var(--text)!important;margin-left:auto}
.rv-sendrow{margin-top:12px;display:flex;flex-direction:column;gap:8px}.rv-send{background:var(--text)!important;color:var(--surface)!important;border-color:var(--text)!important;align-self:flex-start}.rv-send:disabled{opacity:.5}
.rv-sendstat{font-size:13px;display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}.rv-sendstat>span:not(.rv-spin){flex:1;min-width:0}.rv-sendstat:empty{display:none}.rv-spin{flex:none;width:14px;height:14px;margin-top:2px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--text);animation:rvspin .9s linear infinite}@keyframes rvspin{to{transform:rotate(360deg)}}
.rv-sendstat .nudge{width:100%;padding:8px 10px;border:1.5px dashed var(--text);border-radius:10px}.rv-sendstat code{font:500 12.5px var(--font-mono)}
.rv-tokens{margin:6px 0 0;font-size:13px;color:var(--text-muted)}
.rv-next{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:-10px 0 18px;font-size:13.5px;color:var(--text-muted)}.rv-next.on{color:var(--text);padding:8px 12px;border:1px solid var(--text);border-radius:10px}.rv-offer{display:inline-flex;gap:8px;align-items:center;color:var(--text)}
.rv-none{padding:40px;text-align:center;color:var(--text-muted)}
.rv-learn{margin:16px 0 0;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.rv-learn h3{margin:0 0 2px;font-size:16px}
.rv-llist{list-style:none;margin:10px 0;padding:0;display:grid;gap:6px}.rv-llist li{display:grid;grid-template-columns:auto 120px minmax(0,1fr);gap:10px;align-items:center}
.rv-llist .k{font:600 11px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)}.rv-llist input[type=text]{width:100%;font:inherit;font-size:14px;padding:5px 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
.rv-thcard{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:18px;padding:16px;margin-top:16px;align-items:start}.rv-thcard img{width:100%;height:auto;border-radius:8px;border:1px solid var(--line);display:block}.rv-thside h2{margin:0;font:700 18px var(--ud-body)}.rv-thadd{display:flex;gap:8px;margin-top:10px;align-items:flex-end}.rv-thadd textarea{flex:1;min-height:52px;font:inherit;font-size:14px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text)}@media (max-width:760px){.rv-thcard{grid-template-columns:1fr}}
.rv-thumbs{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:14px 0 0}.rv-thumb{display:flex;flex-direction:column;gap:4px;text-decoration:none;color:var(--text-muted);font-size:12px}.rv-thumb img{height:84px;width:auto;border-radius:6px;border:1px solid var(--line);display:block}
.rv-next{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0 4px}
.rv-llist li.off input[type=text]{color:var(--text-muted);text-decoration:line-through}.rv-lacts{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
@media(max-width:700px){.rv-llist li{grid-template-columns:auto 1fr}.rv-llist li input[type=text]{grid-column:1/-1}}
.rv-head2{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.rv-head2 h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(26px,3.4vw,34px);letter-spacing:-.035em;line-height:1.05;margin:6px 0 0}
.rv-apwrap{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.rv-apwrap .rv-btn.primary{font-size:16px;padding:12px 22px}
.rv-apnote{font-size:13px;color:var(--text-muted);max-width:360px;text-align:right}.rv-apnote.on{color:var(--text)}.rv-apnote a{color:var(--text)}
.rv-row2{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.rv-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:4px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.rv-tab{display:inline-flex;align-items:center;gap:9px;font:600 14px var(--ud-body);color:var(--text-muted);background:transparent;border:0;border-radius:10px;padding:8px 14px 8px 10px;cursor:pointer;text-decoration:none}
.rv-tab small{font:500 11px var(--font-mono);opacity:.75}
.rv-tab[aria-selected="true"],.rv-tab[aria-pressed="true"]{background:var(--ink);color:#fff}
.rv-tab:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.rv-shape{display:inline-flex;gap:3px;align-items:center}.rv-shape i{display:block;border:2px solid currentColor;border-radius:3px}
.rv-dl{position:relative}
.rv-dlmenu{position:absolute;right:0;top:calc(100% + 6px);z-index:8;min-width:300px;max-width:420px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.14);padding:6px}
.rv-dlmenu a,.rv-dlmenu button{display:block;width:100%;box-sizing:border-box;text-align:left;font:500 14px var(--ud-body);color:var(--text);background:none;border:0;border-radius:8px;padding:9px 10px;cursor:pointer;text-decoration:none}
.rv-dlmenu a:hover,.rv-dlmenu button:hover{background:var(--surface-soft)}
.rv-dlmenu code{display:block;font:12px var(--font-mono);color:var(--text-muted);padding:2px 10px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rv-btn.dark{background:var(--ink);color:#fff;border-color:var(--ink)}
.rv-details{margin-top:18px;font-size:13px;color:var(--text-muted)}.rv-details summary{cursor:pointer;font-size:14px}.rv-details > div{margin-top:8px;display:grid;gap:6px}.rv-details code{font:12px var(--font-mono);overflow-wrap:anywhere}.rv-details kbd{font:500 12px var(--font-mono);border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:0 5px}
.dv-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:16px;margin-bottom:20px}
@media (max-width:820px){.dv-head{grid-template-columns:1fr}}
.dv-head h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(26px,3.4vw,34px);letter-spacing:-.035em;line-height:1.05;margin:6px 0 0}
.dv-head p{margin:6px 0 0;color:var(--text-muted)}
.dv-acts{display:flex;gap:10px;align-items:center;padding-top:22px;flex-wrap:wrap;justify-content:flex-end}
.dv-acts .rv-btn.dark{font-size:16px;padding:12px 22px}
.dv-formats{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.dv-card{flex:none;max-width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);overflow:hidden;display:flex;flex-direction:column}
.dv-card video{display:block;height:360px;max-width:100%;background:#000}
.dv-card video.land{width:640px}.dv-card video.tall{width:203px}
@media (max-width:760px){.dv-card video{height:auto}.dv-card video.land{width:100%}}
.dv-card .body{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px}
.dv-card .body b{display:block;font-size:15px}.dv-card .body span{font-size:13px;color:var(--text-muted)}
.dv-sec{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);padding:16px 18px;margin-bottom:16px}
.dv-sec h2{font-size:17px;margin:0 0 4px}.dv-sec > p{margin:0;font-size:13px;color:var(--text-muted)}
.dv-thumbs{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
.dv-thumbs button{border:1px solid var(--line);background:var(--surface-soft);border-radius:10px;padding:6px;cursor:zoom-in;text-align:left;font:500 12px var(--font-mono);color:var(--text-muted)}
.dv-thumbs img{display:block;height:110px;width:auto;border-radius:6px;margin-bottom:6px}
.dv-lb{position:fixed;inset:0;z-index:40;background:rgba(12,14,9,.82);display:grid;place-items:center;padding:24px}
.dv-lb[hidden]{display:none}
.dv-lb figure{margin:0;max-width:min(1100px,92vw);text-align:center}
.dv-lb img{max-width:100%;max-height:72vh;border-radius:10px;display:block;margin:0 auto 14px}
.dv-lb .acts{display:flex;gap:10px;justify-content:center}
.dv-kept{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dv-kept .tick{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--green);color:#fff;font-size:13px;margin-right:8px}
.dv-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid var(--line);font-size:14px}
.dv-foot a{color:var(--text)}
[hidden]{display:none!important}
</style></head><body>
<main>
<div class="ud-pin">${UD_HEAD}${progressBar(delivery ? 'delivery' : 'review')}</div>
 ${delivery ? (() => { const fs = [{ file: anyFinal.final, label: hasV ? 'Landscape' : 'Video', meta: `${hasV ? '16:9 · ' : ''}${anyFinal.length_s ? `${anyFinal.length_s} s · ` : ''}${mb(anyFinal.size_bytes)}`, tall: false, primary: true }, ...(anyFinal.final_vertical ? [{ file: anyFinal.final_vertical, label: 'Vertical', meta: `9:16${anyFinal.length_s ? ` · ${anyFinal.length_s} s` : ''}`, tall: true }] : []), ...cuts.map((c) => ({ file: c.final, label: cutLabel(c.video), meta: `${hasV ? '9:16 · ' : ''}${c.video.replace(/^cut-(\d+)\.mp4$/, '$1')} s`, tall: hasV }))]; const z = (t) => (t.match(/(\d+x\d+)\.png$/) || [])[1] || ''; const use = { '1280x720': 'YouTube', '1200x630': 'links', '1080x1080': 'feeds', '1080x1920': 'Shorts' }; return `
 <div class="dv-head"><div><div class="ud-eyebrow">Delivery</div><h1>Your video is final</h1><p>${esc(title)} · approved ${esc(anyFinal.at.slice(0, 10))}${anyFinal.length_s ? ` · ${esc(anyFinal.length_s)} s` : ''} · ${fs.length === 1 ? 'one file' : `${fs.length} formats`}${anyFinal.open_comments ? ` · ${esc(anyFinal.open_comments)} comment${anyFinal.open_comments === 1 ? '' : 's'} left open` : ''}. These copies stay as they are if the video is rendered again.</p></div>
 <div class="dv-acts">${offer && offerLink(offer, 'delivery', version) ? `<a class="rv-btn" href="${esc(offerLink(offer, 'delivery', version))}" target="_blank" rel="noopener noreferrer" title="${esc(offer.text)}">Shareable link · ${esc(offer.button)}</a>` : ''}<button class="rv-btn dark" type="button" id="rv-new">Start a new video</button></div></div>
 <p class="rv-tokens" id="rv-new-st" aria-live="polite" style="margin:-10px 0 12px;text-align:right"></p>
 <div class="dv-formats">${fs.map((f) => `<div class="dv-card"><video class="${f.tall ? 'tall' : 'land'}" src="/final/${esc(f.file)}" controls preload="metadata" playsinline></video><div class="body"><div><b>${esc(f.label)}</b><span>${esc(f.meta)}</span></div><a class="rv-btn${f.primary ? ' primary' : ''}" href="/final/${esc(f.file)}" download="${esc(f.file)}" aria-label="Download the ${esc(f.label.toLowerCase())} video">⤓${f.primary ? ' Download' : ''}</a></div></div>`).join('')}</div>
 ${credit ? `<section class="dv-sec"><h2>Music credit</h2><p>This track's licence (${esc(credit.licence)}) asks you to credit the artist wherever the video is posted, for example in its description:</p><div class="rv-file" style="margin:10px 0 0"><code id="rv-credit-t">${esc(credit.text)}</code><button class="rv-btn" id="rv-ccredit">Copy credit</button></div></section>` : ''}
 ${thumbs.length ? `<section class="dv-sec"><h2>Thumbnails</h2><p>Click one to see it full size.</p><div class="dv-thumbs">${thumbs.map((t) => `<button type="button" data-src="/thumbs/${esc(t)}" data-name="${esc(t)}"><img src="/thumbs/${esc(t)}" alt="">${esc(z(t).replace('x', ' × '))}${use[z(t)] ? ` · ${use[z(t)]}` : ''}</button>`).join('')}</div></section>` : ''}
 <section class="dv-sec" id="rv-learn" hidden><div id="rv-learn-open"><h2>Remember for the next video</h2><p id="rv-learn-sub">Untick what should not carry over, and edit any line. Kept learnings live with the brand; you can switch them off or remove them in the dashboard.</p>
 <ul class="rv-llist" id="rv-learn-list"></ul>
 <div class="rv-lacts"><button class="rv-btn dark" type="button" id="rv-learn-keep">Save for this brand</button><span class="rv-tokens" id="rv-learn-st" aria-live="polite"></span></div></div>
 <div class="dv-kept" id="rv-learn-done" hidden><span><span class="tick">✓</span><b id="rv-learn-n"></b> <span class="rv-tokens">The next video for this brand starts from them.</span></span><button class="rv-btn" type="button" id="rv-learn-edit">Edit</button></div></section>
 <div class="dv-foot"><a href="?review=1">← Back to review to change something</a>${tokens && (tokens.read || tokens.written) ? `<span class="rv-tokens" style="margin:0">Made with about ${fmtK(tokens.read)} tokens read and ${fmtK(tokens.written)} written by Claude on your plan (estimated; /cost in Claude Code shows the exact session use).</span>` : ''}</div>
 <div class="dv-lb" id="dv-lb" hidden><figure><img id="dv-lb-img" alt=""><div class="acts"><a class="rv-btn dark" id="dv-lb-dl" download>⤓ Download this size</a><button class="rv-btn" type="button" id="dv-lb-x">Close</button></div></figure></div>`; })() : `
 <div class="rv-head2"><div><div class="ud-eyebrow">Review</div><h1>${esc(title)}</h1></div>
 ${videoPath ? `<div class="rv-apwrap"><button class="rv-btn primary" id="rv-approve">${anyFinal ? 'Approve again' : 'Approve and finish'}</button><span class="rv-apnote" id="rv-apnote">${anyFinal ? `Approved ${esc(anyFinal.at.slice(0, 10))} · <a href="?">see Delivery</a>` : esc(scopeLine)}</span></div>` : ''}</div>
 ${tabRow || dlMenu ? `<div class="rv-row2">${tabRow || '<span></span>'}${dlMenu}</div>` : ''}`}
 ${delivery ? '' : video ? `<div class="rv-grid">
  <section class="rv-card rv-player" id="rv-player" aria-label="Player">
   <div class="rv-stage" id="rv-stage"><div class="rv-frame${isV ? ' v' : ''}">
    <video id="rv-vid" src="/video/${esc(video.name)}" preload="auto" playsinline></video>
    <div id="rv-over" aria-hidden="true"></div>
    <div class="rv-hint">Optional: drag a box or click to drop a pin on what needs fixing.</div>
   </div>${hasV ? `<div class="rv-frame rv-other${isV ? '' : ' v'}" id="rv-other" hidden><video id="rv-vid2" src="/video/${isV ? 'video.mp4' : 'video-vertical.mp4'}" preload="auto" muted playsinline></video><span class="rv-otherlab">${isV ? 'Landscape' : 'Vertical'} · muted</span></div>` : ''}</div>
   <div class="rv-ctrl">
    <button class="rv-btn icon" id="rv-play" aria-label="Play">▶</button>
    <button class="rv-btn icon" id="rv-back" aria-label="Back one frame">‹</button>
    <button class="rv-btn icon" id="rv-fwd" aria-label="Forward one frame">›</button>
    <span class="rv-time" id="rv-time">00:00.0 / 00:00.0</span>
    <span class="rv-speed"><button class="rv-btn icon" id="rv-slower" aria-label="Slower" title="Slower ([)">−</button><span class="rv-rate" id="rv-rate" aria-live="polite">1×</span><button class="rv-btn icon" id="rv-faster" aria-label="Faster" title="Faster (])">+</button></span>
    <span class="rv-sp"></span>
    <button class="rv-btn mark" id="rv-marks" aria-pressed="true" title="Show or hide the comment markers on the video (M)">Markers on</button>
    <button class="rv-btn icon" id="rv-full" aria-label="Full screen" title="Full screen (F)">⛶</button>
    <button class="rv-btn dark" id="rv-add">Add comment</button>
   </div>
   <div class="rv-line" id="rv-line" aria-label="Timeline"><div class="rv-track"></div><div class="rv-fill" id="rv-fill"></div><div id="rv-scs"></div><div class="rv-head" id="rv-head"></div><div id="rv-mks"></div></div>
  </section>
  <aside class="rv-card rv-side" aria-label="Comments">
   <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px"><h2>Comments</h2><span class="rv-saved" id="rv-saved"></span></div>
   <p class="rv-sub" id="rv-count">Pause anywhere and add a comment.</p>
   <p class="rv-stale" id="rv-stale">This is a newer render than some comments. Done comments say what was changed; if one needs more, add a follow-up.</p>
   <div class="rv-comp" id="rv-comp"><div class="meta" id="rv-cmeta"></div><textarea id="rv-text" placeholder="What should change here?"></textarea>${hasV ? `<label class="rv-both"><input type="checkbox" id="rv-both" checked><span><b>Also apply to the ${isV ? 'landscape' : 'vertical'} version</b>. Keep it ticked for wording, timing and sound; untick it for a layout fix that belongs to this frame only.</span></label>` : ''}<div class="row"><button class="rv-btn" id="rv-cancel">Cancel</button><button class="rv-btn dark" id="rv-save">Save comment</button></div></div>
   <ul class="rv-list" id="rv-list"></ul>
   <div class="rv-sendrow"><button class="rv-btn rv-send" id="rv-send">Send to Claude to fix</button><div class="rv-sendstat" id="rv-sendstat" aria-live="polite"></div></div>
   <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><button class="rv-btn mark" id="rv-copyopen" title="Copy the open comments as text">Copy open</button><button class="rv-btn mark" id="rv-copy" title="Copy every comment as text">Copy all</button></div>
  </aside>
 </div>
 ${thumbs.length ? `<section class="rv-card rv-thcard" aria-label="Thumbnail"><img src="/thumbs/${esc(thumbs.find((x) => /1280x720/.test(x)) || thumbs[0])}" alt="The thumbnail" id="rv-thimg"><div class="rv-thside"><h2>Thumbnail</h2><p class="rv-sub">The picture before the video plays. Ask for a change and it goes to Claude with your other comments.</p><ul class="rv-list" id="rv-thlist"></ul><div class="rv-thadd"><textarea id="rv-thtext" placeholder="e.g. Use the dashboard screen instead of the homepage; a bigger title"></textarea><button class="rv-btn dark" type="button" id="rv-thsave">Add</button></div></div></section>` : ''}
 <details class="rv-details"><summary>Details</summary><div>${tokens && (tokens.read || tokens.written) ? `<span>Made with about ${fmtK(tokens.read)} tokens read and ${fmtK(tokens.written)} written by Claude on your plan (estimated from ${tokens.tasks} tasks and the scene code; /cost in Claude Code shows the exact session use).</span>` : ''}${videoPath ? `<code>${esc(videoPath)}</code>` : ''}<span>Keyboard: <kbd>Space</kbd> play/pause · <kbd>N</kbd> new comment · <kbd>F</kbd> full screen · <kbd>M</kbd> markers · <kbd>[</kbd> <kbd>]</kbd> speed · <kbd>,</kbd> <kbd>.</kbd> one frame · <kbd>Esc</kbd> cancel</span></div></details>` : '<div class="rv-card rv-none">No finished video yet: render one with <code>node plan/production/scene.mjs whole &lt;project&gt;</code>.</div>'}
</main>
<script type="application/json" id="rv-data">${json(data)}</script>
<script>
(function(){
  var D0 = JSON.parse(document.getElementById('rv-data').textContent);
  // the download menu: this version, its path, and the shareable-link offer
  var dlb = document.getElementById('rv-dlbtn'), dlm = document.getElementById('rv-dlmenu');
  if (dlb) {
    dlb.addEventListener('click', function(ev){ ev.stopPropagation(); dlm.hidden = !dlm.hidden; dlb.setAttribute('aria-expanded', String(!dlm.hidden)); });
    document.addEventListener('click', function(ev){ if (!dlm.hidden && !dlm.contains(ev.target)) { dlm.hidden = true; dlb.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && !dlm.hidden) { dlm.hidden = true; dlb.setAttribute('aria-expanded', 'false'); } });
  }
  // a draft downloaded before approval: say so under the Approve button, once
  var dl = document.getElementById('rv-dl'), apn = document.getElementById('rv-apnote'), ap = document.getElementById('rv-approve');
  if (dl && apn && ap && ap.textContent === 'Approve and finish') dl.addEventListener('click', function(){ apn.classList.add('on'); apn.innerHTML = 'You downloaded this version as a draft. If it is the one, press <b>Approve and finish</b> to keep the final copies.'; });
  // one approval finishes every format and cut
  if (ap) ap.addEventListener('click', function(){
    var names = D0.approveAll && D0.approveAll.length ? D0.approveAll : [D0.video];
    Promise.all(names.map(function(nm){ return fetch('/api/comments?v=' + encodeURIComponent(nm), { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){ return { nm: nm, open: (j.comments || []).filter(function(n){ return n.status !== 'done'; }).length }; }).catch(function(){ return { nm: nm, open: 0 }; }); })).then(function(rs){
      var open = rs.reduce(function(a, r){ return a + r.open; }, 0);
      var label = function(nm){ return nm === 'video-vertical.mp4' ? 'vertical' : /^cut-/.test(nm) ? nm.replace(/^cut-(\d+)\.mp4$/, '$1 s cut') : 'landscape'; };
      var where = rs.filter(function(r){ return r.open; }).map(function(r){ return r.open + ' on the ' + label(r.nm) + ' version'; }).join(' and ');
      if (open && !confirm('Still open: ' + where + '. Approve and finish anyway?')) return;
      var was = ap.textContent; ap.disabled = true; ap.textContent = 'Finishing…';
      var main = names.filter(function(n){ return !/^cut-/.test(n); })[0] || names[0];
      return fetch('/api/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ video: main, all: true }) }).then(function(r){ return r.json(); }).then(function(a){ if (a.ok) location.href = location.pathname; else { ap.disabled = false; ap.textContent = was; alert(a.error || 'Could not finish.'); } });
    });
  });
  // Delivery: thumbnails open full size, with their own download
  var lbx = document.getElementById('dv-lb');
  if (lbx) {
    Array.prototype.forEach.call(document.querySelectorAll('.dv-thumbs button'), function(b){ b.addEventListener('click', function(){ document.getElementById('dv-lb-img').src = b.dataset.src; var d = document.getElementById('dv-lb-dl'); d.href = b.dataset.src; d.setAttribute('download', b.dataset.name); lbx.hidden = false; document.getElementById('dv-lb-x').focus(); }); });
    document.getElementById('dv-lb-x').addEventListener('click', function(){ lbx.hidden = true; });
    lbx.addEventListener('click', function(ev){ if (ev.target === lbx) lbx.hidden = true; });
    document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') lbx.hidden = true; });
  }
  var cc = document.getElementById('rv-ccredit');
  if (cc) cc.addEventListener('click', function(){ var t = document.getElementById('rv-credit-t').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ cc.textContent = 'Copied'; setTimeout(function(){ cc.textContent = 'Copy credit'; }, 1500); }); });
  // Delivery: the learnings proposed at approval (Claude's review lessons join while the card is open); after saving it folds to one line
  var lb = document.getElementById('rv-learn');
  if (lb) {
    var list = document.getElementById('rv-learn-list'), st = document.getElementById('rv-learn-st'), keepBtn = document.getElementById('rv-learn-keep'), openBox = document.getElementById('rv-learn-open'), done = document.getElementById('rv-learn-done'), drawn = {}, tries = 0;
    function row(it){
      var li = document.createElement('li'); li.dataset.id = it.id;
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.kind !== 'Cast' || true; cb.setAttribute('aria-label', 'Keep');
      var k = document.createElement('span'); k.className = 'k'; k.textContent = it.kind;
      var tx = document.createElement('input'); tx.type = 'text'; tx.value = it.text; tx.setAttribute('aria-label', it.kind);
      if (it.kind === 'Facts') tx.readOnly = true;
      cb.addEventListener('change', function(){ li.classList.toggle('off', !cb.checked); });
      li.appendChild(cb); li.appendChild(k); li.appendChild(tx); return li;
    }
    function fold(n, brand){ document.getElementById('rv-learn-n').textContent = 'Kept ' + n + ' for ' + (brand || 'this brand') + '.'; openBox.hidden = true; done.hidden = false; }
    function load(){
      fetch('/api/learnings', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){
        var p = j.proposals; if (!p) return;
        lb.hidden = false;
        p.items.forEach(function(it){ if (!drawn[it.id]) { drawn[it.id] = 1; list.appendChild(row(it)); } });
        if (p.status === 'kept') { fold(p.kept || 0, p.brand); return; }
        st.textContent = p.lessons_pending ? 'Claude is adding lessons from your comments…' : '';
        if (p.lessons_pending && tries++ < 60) setTimeout(load, 5000);
      }).catch(function(){});
    }
    keepBtn.addEventListener('click', function(){
      var picks = Array.prototype.map.call(list.querySelectorAll('li'), function(li){ return { id: li.dataset.id, keep: li.querySelector('input[type=checkbox]').checked, text: li.querySelector('input[type=text]').value }; });
      keepBtn.disabled = true; st.textContent = 'Saving…';
      fetch('/api/learnings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ picks: picks }) }).then(function(r){ return r.json(); }).then(function(a){
        keepBtn.disabled = false;
        if (!a.ok) { st.textContent = a.error || 'Could not save.'; return; }
        st.textContent = ''; fold(a.kept, a.brand);
      }).catch(function(){ st.textContent = 'Could not reach the page server.'; keepBtn.disabled = false; });
    });
    document.getElementById('rv-learn-edit').addEventListener('click', function(){ done.hidden = true; openBox.hidden = false; });
    load();
  }
  var nv = document.getElementById('rv-new');
  if (nv) nv.addEventListener('click', function(){
    var st = document.getElementById('rv-new-st'); nv.disabled = true; st.textContent = 'Opening a new brief…';
    fetch('/api/new-video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(function(r){ return r.json(); }).then(function(j){
      if (!j.ok) { st.textContent = j.error || 'Could not start a new video.'; nv.disabled = false; return; }
      location.href = j.url;
    }).catch(function(){ st.textContent = 'Could not reach the page server.'; nv.disabled = false; });
  });
  var pin = document.querySelector('.ud-pin'); if (pin) window.addEventListener('scroll', function(){ pin.classList.toggle('stuck', window.scrollY > 8); }, { passive: true });
})();
(function(){
var D = JSON.parse(document.getElementById('rv-data').textContent);
if (!D.video) return;
var $ = function(id){ return document.getElementById(id); };
var vid = $('rv-vid'), over = $('rv-over'), line = $('rv-line'), list = $('rv-list'), comp = $('rv-comp'), text = $('rv-text');
var home = comp.parentNode, homeNext = comp.nextSibling;
var FPS = 30, notes = [], sel = null, mode = 'idle', draft = null, drag = null, rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
function clock(t){ t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); }
function sceneAt(t){ var s = null; D.scenes.forEach(function(x){ if (t >= x.start - 0.001 && t < x.start + x.dur) s = x; }); return s; }
function uid(){ return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function el(tag, cls, txt){ var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
// ---- saving
var saveTimer = null;
function save(){
  clearTimeout(saveTimer); $('rv-saved').textContent = 'Saving…';
  saveTimer = setTimeout(function(){
    fetch('/api/comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ video: D.video, comments: notes }) })
      .then(function(r){ return r.json(); }).then(function(j){ $('rv-saved').textContent = j.ok ? 'Saved' : ('Not saved: ' + j.error); })
      .catch(function(){ $('rv-saved').textContent = 'Not saved: the review server stopped'; });
  }, 250);
}
var lastSeen = '';
// side by side: the other format plays beside this one, muted and kept in step with it
(function(){
  var btn = document.getElementById('rv-sbs'), v2 = document.getElementById('rv-vid2'), box = document.getElementById('rv-other'), stage = document.getElementById('rv-stage');
  if (!btn || !v2) return;
  var on = false; try { on = localStorage.getItem('rv-sbs') === '1'; } catch (err) {}
  function follow(){ if (on && Math.abs(v2.currentTime - vid.currentTime) > 0.2) v2.currentTime = vid.currentTime; }
  var main = stage.querySelector('.rv-frame');
  // both frames the same height, together filling the stage's width (16:9 beside 9:16), no taller than 62% of the window
  function size(){
    [main, box].forEach(function(f){ f.style.width = ''; f.style.height = ''; });
    if (!on) return;
    var avail = stage.clientWidth - 24 - 12, h = Math.min(avail / (16 / 9 + 9 / 16), window.innerHeight * 0.62);
    [main, box].forEach(function(f){ var r = f.classList.contains('v') ? 9 / 16 : 16 / 9; f.style.height = Math.floor(h) + 'px'; f.style.width = Math.floor(h * r) + 'px'; });
  }
  window.addEventListener('resize', function(){ size(); if (typeof drawOverlay === 'function') drawOverlay(); });
  function apply(){
    box.hidden = !on; stage.classList.toggle('sbs', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); size();
    if (on) { v2.playbackRate = vid.playbackRate; v2.currentTime = vid.currentTime; if (!vid.paused) v2.play().catch(function(){}); } else v2.pause();
    if (typeof drawOverlay === 'function') drawOverlay();
  }
  btn.addEventListener('click', function(){ on = !on; try { localStorage.setItem('rv-sbs', on ? '1' : '0'); } catch (err) {} apply(); });
  vid.addEventListener('play', function(){ if (on) { follow(); v2.play().catch(function(){}); } });
  vid.addEventListener('pause', function(){ v2.pause(); follow(); });
  vid.addEventListener('seeked', follow);
  vid.addEventListener('timeupdate', follow);
  vid.addEventListener('ratechange', function(){ v2.playbackRate = vid.playbackRate; });
  apply();
})();
fetch('/api/comments?v=' + encodeURIComponent(D.video)).then(function(r){ return r.json(); }).then(function(j){ notes = j.comments || []; lastSeen = JSON.stringify(notes); if (j.stale) $('rv-stale').style.display = 'block'; render(); });
// Claude marks comments done and adds notes in the file: pick them up every few seconds, never while you are writing
setInterval(function(){
  if (mode !== 'idle' || draft || document.querySelector('.rv-fu.on') || document.hidden) return;
  fetch('/api/comments?v=' + encodeURIComponent(D.video), { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){
    var fresh = JSON.stringify(j.comments || []);
    if (fresh === lastSeen || mode !== 'idle' || draft || document.querySelector('.rv-fu.on')) return;
    var before = {}; notes.forEach(function(n){ before[n.id] = n.status; });
    var doneNow = (j.comments || []).filter(function(n){ return n.status === 'done' && before[n.id] && before[n.id] !== 'done'; }).length;
    notes = j.comments || []; lastSeen = fresh; render(); drawOverlay();
    if (doneNow) { $('rv-saved').textContent = 'Claude marked ' + doneNow + ' comment' + (doneNow === 1 ? '' : 's') + ' done'; }
  }).catch(function(){});
}, 4000);
// ---- the frame overlay: notes near the playhead, the selected note, the draft
function numOf(id){ return notes.findIndex(function(x){ return x.id === id; }) + 1; }
function drawOverlay(){
  over.textContent = '';
  var t = vid.currentTime;
  // a comment's box shows only around its own moment (about half a second either side), selected or not
  var show = notes.filter(function(n){ return Math.abs(n.t - t) < 0.5; });
  if (draft) show = show.concat([Object.assign({ draft: true }, draft)]);
  show.forEach(function(n){
    var cls = (n.status === 'done' ? ' done' : '') + (n.draft ? ' draft' : '');
    if (n.box){ var b = el('div', 'rv-box' + cls); b.style.left = n.box.x * 100 + '%'; b.style.top = n.box.y * 100 + '%'; b.style.width = n.box.w * 100 + '%'; b.style.height = n.box.h * 100 + '%'; if (!n.draft) b.dataset.id = n.id; over.appendChild(b); }
    if (n.pin){ var p = el('div', 'rv-pin' + cls); p.style.left = n.pin.x * 100 + '%'; p.style.top = n.pin.y * 100 + '%'; if (!n.draft) p.dataset.id = n.id; over.appendChild(p); }
    // a small numbered bubble at the box's top-left corner (or beside the pin), kept inside the frame; the text is in the list
    if (!n.draft && (n.box || n.pin)){ var a = n.box || n.pin; var g = el('div', 'rv-num' + cls, String(numOf(n.id))); g.dataset.id = n.id; g.title = n.text; g.style.left = Math.min(0.98, Math.max(0.02, a.x + (n.pin ? 0.018 : 0))) * 100 + '%'; g.style.top = Math.min(0.96, Math.max(0.04, a.y - (n.pin ? 0.06 : 0))) * 100 + '%'; over.appendChild(g); }
  });
}
function frac(e){ var r = over.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; }
over.addEventListener('pointerdown', function(e){
  if (mode !== 'marking'){ var hit = e.target.dataset && e.target.dataset.id; if (hit){ selectComment(hit, true); } else toggle(); return; }
  drag = frac(e); over.setPointerCapture(e.pointerId);
});
over.addEventListener('pointermove', function(e){ if (mode !== 'marking' || !drag) return; var p = frac(e); draft.box = { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }; delete draft.pin; drawOverlay(); });
over.addEventListener('pointerup', function(e){
  if (mode !== 'marking' || !drag) return;
  var p = frac(e);
  if (Math.abs(p.x - drag.x) < 0.01 && Math.abs(p.y - drag.y) < 0.01){ delete draft.box; draft.pin = { x: p.x, y: p.y }; }
  drag = null; meta(); drawOverlay(); text.focus();
});
// ---- the composer
function startNote(){
  vid.pause(); var t = vid.currentTime, s = sceneAt(t);
  draft = { id: uid(), t: Math.round(t * 1000) / 1000, scene: s ? s.id : undefined, text: '', status: 'open', created: new Date().toISOString() };
  compose();
}
function meta(){
  var s = draft.scene ? D.scenes.find(function(x){ return x.id === draft.scene; }) : null;
  $('rv-cmeta').textContent = clock(draft.t) + (s ? ' · ' + s.name : '') + (draft.box ? ' · box marked' : draft.pin ? ' · pin marked' : ' · whole frame (drag on the video to mark a spot)');
}
// the comment box opens at once; the video stays markable (drag a box or click a pin) while it is open
function compose(){
  mode = 'marking'; over.classList.add('marking');
  var fs = document.fullscreenElement; if (fs) fs.appendChild(comp); else if (comp.parentNode !== home) home.insertBefore(comp, homeNext);
  meta(); comp.classList.add('on'); text.value = draft.text || ''; text.focus(); drawOverlay();
}
function cancel(){ mode = 'idle'; draft = null; over.classList.remove('marking'); comp.classList.remove('on'); drawOverlay(); }
function commit(){
  var v = text.value.trim(); if (!v){ text.focus(); return; }
  draft.text = v;
  var both = document.getElementById('rv-both'); if (both) { if (both.checked) draft.both = true; else delete draft.both; }
  var i = notes.findIndex(function(n){ return n.id === draft.id; });
  if (i >= 0) notes[i] = draft; else notes.push(draft);
  sel = draft.id; mode = 'idle'; draft = null; over.classList.remove('marking'); comp.classList.remove('on'); save(); render();
}
$('rv-add').addEventListener('click', startNote);
$('rv-cancel').addEventListener('click', cancel);
$('rv-save').addEventListener('click', commit);
text.addEventListener('keydown', function(e){ if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(); if (e.key === 'Escape') cancel(); });
// ---- the list and the timeline markers
function seek(t){ vid.currentTime = Math.max(0, Math.min(t, vid.duration || t)); }
function render(){
  notes.sort(function(a, b){ return a.t - b.t; });
  list.textContent = '';
  var c = { open: 0, done: 0 }; notes.forEach(function(n){ if (n.status === 'addressed') n.status = 'done'; c[n.status] = (c[n.status] || 0) + 1; });
  $('rv-copyopen').style.display = c.done && c.open ? '' : 'none';
  if (window.__updSend) window.__updSend(c.open || 0);
  $('rv-count').textContent = notes.length ? (notes.length + ' comment' + (notes.length === 1 ? '' : 's') + ': ' + c.open + ' open, ' + c.done + ' done') : 'Pause anywhere and add a comment.';
  if (!notes.length){ list.appendChild(el('li', 'rv-empty', 'No comments yet. Press Add comment (or N): the video pauses and the comment box opens; drag on the video to mark a spot if you like.')); }
  notes.forEach(function(n){
    var li = el('li', 'rv-note' + (n.status === 'done' ? ' done' : '') + (n.id === sel ? ' sel' : '')); li.dataset.id = n.id;
    li.addEventListener('click', function(e){ if (e.target.closest('button')) return; selectComment(n.id, false); });
    var top = el('div', 'top');
    var tb = el('button', 'rv-t', clock(n.t)); tb.addEventListener('click', function(){ selectComment(n.id, false); });
    var s = n.scene ? D.scenes.find(function(x){ return x.id === n.scene; }) : null;
    top.appendChild(el('span', 'rv-n', String(numOf(n.id)))); top.appendChild(tb); top.appendChild(el('span', 'rv-scn', s ? s.name : ''));
    top.appendChild(el('span', 'rv-badge' + (n.status === 'done' ? ' done' : ''), n.status === 'done' ? 'Done' : 'Open'));
    var fu = null;
    // only the agent marks a comment done; on a done comment the reviewer adds a follow-up (more changes, or a revert)
    var act = n.status === 'done' ? el('button', 'rv-x', 'Follow up') : el('button', 'rv-x', 'Edit');
    act.addEventListener('click', function(){ if (n.status === 'done'){ fu.classList.add('on'); fu.querySelector('textarea').focus(); } else { vid.pause(); seek(n.t); draft = JSON.parse(JSON.stringify(n)); compose(); } });
    var del = el('button', 'rv-x rv-del', '✕'); del.setAttribute('aria-label', 'Delete comment'); del.title = 'Delete'; del.addEventListener('click', function(){ if (!confirm('Delete this comment?')) return; notes = notes.filter(function(x){ return x.id !== n.id; }); save(); render(); });
    top.appendChild(act); top.appendChild(del);
    li.appendChild(top);
    li.appendChild(el('div', 'txt', n.text));
    var th = (n.thread || []).slice(); if (n.reply && !th.length) th.push({ by: 'agent', text: n.reply });
    th.forEach(function(m){ var d = el('div', 'rv-msg ' + (m.by === 'agent' ? 'agent' : 'reviewer')); d.appendChild(el('b', null, m.by === 'agent' ? 'Changed' : 'Follow-up')); d.appendChild(document.createTextNode(m.text)); li.appendChild(d); });
    fu = el('div', 'rv-fu'); var ta = el('textarea'); ta.placeholder = 'What else should change, or what should be reverted?'; var row = el('div', 'row'); var cb = el('button', 'rv-btn', 'Cancel'); var sb = el('button', 'rv-btn primary', 'Send follow-up');
    cb.addEventListener('click', function(){ fu.classList.remove('on'); });
    sb.addEventListener('click', function(){ var v = ta.value.trim(); if (!v){ ta.focus(); return; } n.thread = th.concat([{ by: 'reviewer', text: v, at: new Date().toISOString() }]); delete n.reply; n.status = 'open'; save(); render(); });
    ta.addEventListener('keydown', function(e){ e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sb.click(); if (e.key === 'Escape') fu.classList.remove('on'); });
    row.appendChild(cb); row.appendChild(sb); fu.appendChild(ta); fu.appendChild(row); li.appendChild(fu);
    list.appendChild(li);
  });
  var mks = $('rv-mks'); mks.textContent = '';
  var d = vid.duration || 1;
  notes.forEach(function(n){ var m = el('div', 'rv-mk' + (n.status === 'done' ? ' done' : '') + (n.id === sel ? ' sel' : '')); m.style.left = (n.t / d * 100) + '%'; m.title = clock(n.t) + ' ' + n.text; m.addEventListener('pointerdown', function(e){ e.stopPropagation(); }); m.addEventListener('click', function(e){ e.stopPropagation(); selectComment(n.id, true); }); mks.appendChild(m); });
  drawOverlay();
}
// select a comment: jump the video to its frame and bring its card into view
function selectComment(id, scroll){
  var n = notes.find(function(x){ return x.id === id; }); if (!n) return;
  sel = id; vid.pause(); seek(n.t); render();
  if (scroll){ var li = list.querySelector('[data-id="' + id + '"]'); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
// while the video plays, the comment at the playhead lights up in the list and scrolls into view
var nowId = null;
function follow(){
  var t = vid.currentTime, hit = null;
  notes.forEach(function(n){ if (n.t <= t + 0.25 && t - n.t < 3) hit = n.id; });
  if (hit === nowId) return; nowId = hit;
  list.querySelectorAll('.rv-note.now').forEach(function(x){ x.classList.remove('now'); });
  if (hit){ var li = list.querySelector('[data-id="' + hit + '"]'); if (li){ li.classList.add('now'); list.scrollTo({ top: li.offsetTop - list.offsetTop - 4, behavior: 'smooth' }); } }
}
// while playing, check every frame (timeupdate alone fires only about four times a second)
function loop(){ if (!vid.paused){ follow(); requestAnimationFrame(loop); } }
vid.addEventListener('play', function(){ requestAnimationFrame(loop); });
function drawScenes(){
  var box = $('rv-scs'); box.textContent = ''; var d = vid.duration || 1;
  D.scenes.forEach(function(s){ var c = el('div', 'rv-sc'); c.style.left = (s.start / d * 100) + '%'; c.style.width = (s.dur / d * 100) + '%'; c.title = s.name; c.appendChild(el('span', null, s.id.slice(0, 2))); box.appendChild(c); });
}
// ---- the player
function tick(){
  var d = vid.duration || 0, t = vid.currentTime;
  $('rv-time').textContent = clock(t) + ' / ' + clock(d);
  var f = d ? t / d * 100 : 0; $('rv-fill').style.width = f + '%'; $('rv-head').style.left = f + '%';
  $('rv-play').textContent = vid.paused ? '▶' : '❚❚'; $('rv-play').setAttribute('aria-label', vid.paused ? 'Play' : 'Pause');
  drawOverlay(); follow();
}
vid.addEventListener('timeupdate', tick); vid.addEventListener('play', tick); vid.addEventListener('pause', tick); vid.addEventListener('seeked', tick);
vid.addEventListener('loadedmetadata', function(){ drawScenes(); render(); tick(); });
function toggle(){ if (mode !== 'idle') return; if (vid.paused) vid.play(); else vid.pause(); }
$('rv-play').addEventListener('click', toggle);
// one frame per click; held down, the frames keep stepping (after a short delay, about 20 frames a second)
function holdStep(btn, dir){
  var t1 = null, t2 = null;
  function step(){ vid.pause(); seek(vid.currentTime + dir / FPS); }
  function stop(){ clearTimeout(t1); clearInterval(t2); t1 = t2 = null; }
  btn.addEventListener('pointerdown', function(e){ e.preventDefault(); step(); stop(); t1 = setTimeout(function(){ t2 = setInterval(step, 50); }, 350); });
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(function(ev){ btn.addEventListener(ev, stop); });
  btn.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); step(); } });
}
holdStep($('rv-back'), -1);
holdStep($('rv-fwd'), 1);
// speed in both directions: 0.25× to 2×
function speed(step){ var i = rates.indexOf(vid.playbackRate); if (i < 0) i = rates.indexOf(1); i = Math.max(0, Math.min(rates.length - 1, i + step)); vid.playbackRate = rates[i]; $('rv-rate').textContent = rates[i] + '×'; $('rv-slower').disabled = i === 0; $('rv-faster').disabled = i === rates.length - 1; }
$('rv-slower').addEventListener('click', function(){ speed(-1); });
$('rv-faster').addEventListener('click', function(){ speed(1); });
function lineSeek(e){ var r = line.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * (vid.duration || 0)); }
var scrubbing = false;
line.addEventListener('pointerdown', function(e){ scrubbing = true; line.setPointerCapture(e.pointerId); lineSeek(e); });
line.addEventListener('pointermove', function(e){ if (scrubbing) lineSeek(e); });
line.addEventListener('pointerup', function(){ scrubbing = false; });
document.addEventListener('keydown', function(e){
  if (e.target === text || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === ' '){ e.preventDefault(); toggle(); }
  else if (e.key === 'n' || e.key === 'N'){ e.preventDefault(); if (mode === 'idle') startNote(); }
  else if (e.key === 'f' || e.key === 'F'){ e.preventDefault(); full(); }
  else if (e.key === 'm' || e.key === 'M'){ toggleMarks(); }
  else if (e.key === '['){ speed(-1); }
  else if (e.key === ']'){ speed(1); }
  else if (e.key === ','){ vid.pause(); seek(vid.currentTime - 1 / FPS); }
  else if (e.key === '.'){ vid.pause(); seek(vid.currentTime + 1 / FPS); }
  else if (e.key === 'Escape'){ cancel(); }
});
// ---- full screen: the whole player (frame, controls, timeline), so comments can be marked there too
function full(){ var p = $('rv-player'); if (document.fullscreenElement) document.exitFullscreen(); else if (p.requestFullscreen) p.requestFullscreen(); }
$('rv-full').addEventListener('click', full);
document.addEventListener('fullscreenchange', function(){ if (!document.fullscreenElement && comp.parentNode !== home) home.insertBefore(comp, homeNext); else if (document.fullscreenElement && comp.classList.contains('on')) document.fullscreenElement.appendChild(comp); $('rv-full').textContent = document.fullscreenElement ? '✕' : '⛶'; $('rv-full').setAttribute('aria-label', document.fullscreenElement ? 'Leave full screen' : 'Full screen'); });
// ---- markers on the video on or off (the draft box still shows while marking)
var marks = true;
function toggleMarks(){ marks = !marks; over.classList.toggle('hide', !marks); $('rv-marks').textContent = marks ? 'Markers on' : 'Markers off'; $('rv-marks').setAttribute('aria-pressed', String(marks)); }
$('rv-marks').addEventListener('click', toggleMarks);
// ---- the video file's path on disk
var cp = $('rv-cpath'); if (cp) cp.addEventListener('click', function(){ navigator.clipboard.writeText(D.videoPath).then(function(){ cp.textContent = 'Copied'; setTimeout(function(){ cp.textContent = 'Copy the file path'; }, 1500); }); });
// ---- copy every comment as text, for chat or a ticket
function copyComments(btn, onlyOpen, label){
  var lines = ['Review comments: ' + D.project + ' (' + D.video + ')' + (onlyOpen ? ', open only' : '')];
  notes.forEach(function(n){ if (onlyOpen && n.status === 'done') return; var s = n.scene ? D.scenes.find(function(x){ return x.id === n.scene; }) : null; lines.push((n.status === 'done' ? '[x] ' : '[ ] ') + numOf(n.id) + '. ' + clock(n.t) + (s ? ' · ' + s.name : '') + ' — ' + n.text); (n.thread || []).forEach(function(m){ lines.push('    ' + (m.by === 'agent' ? 'changed: ' : 'follow-up: ') + m.text); }); });
  navigator.clipboard.writeText(lines.join('\\n')).then(function(){ btn.textContent = 'Copied'; setTimeout(function(){ btn.textContent = label; }, 1500); });
}
$('rv-copy').addEventListener('click', function(){ copyComments($('rv-copy'), false, 'Copy all'); });
$('rv-copyopen').addEventListener('click', function(){ copyComments($('rv-copyopen'), true, 'Copy open'); });
// ---- D-92: comments on the thumbnail (saved beside the video's; sent with them)
(function(){
  var list = document.getElementById('rv-thlist'); if (!list) return;
  var notes = [];
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function draw(){
    list.innerHTML = notes.map(function(n){ var a = (n.thread || []).filter(function(m){ return m.by === 'agent'; }).pop(); return '<li class="rv-note' + (n.status === 'done' ? ' done' : '') + '"><div>' + (n.status === 'done' ? '✓ ' : '') + esc(n.text) + '</div>' + (a ? '<div class="rv-sub">Claude: ' + esc(a.text) + '</div>' : '') + '</li>'; }).join('');
    window.__thOpen = notes.filter(function(n){ return n.status !== 'done'; }).length;
    if (window.__updSend) window.__updSend();
  }
  function save(){ return fetch('/api/thumbnail-comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comments: notes }) }).then(function(r){ return r.json(); }); }
  fetch('/api/thumbnail-comments', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){ notes = j.comments || []; draw(); });
  document.getElementById('rv-thsave').addEventListener('click', function(){
    var ta = document.getElementById('rv-thtext'), text = ta.value.trim(); if (!text) return;
    notes.push({ id: 'th-' + Date.now().toString(36), t: 0, text: text, status: 'open', created: new Date().toISOString() });
    ta.value = ''; draw(); save();
  });
})();

// ---- send the open comments to Claude; follow the fix until a new version of the video is out
(function(){
  var btn = $('rv-send'), stat = $('rv-sendstat'), sent = null, polling = false;
  window.__updSend = function(open){ if (typeof open === 'number') window.__vOpen = open; if (sent) return; var all = (window.__vOpen || 0) + (window.__thOpen || 0); btn.disabled = !all; btn.textContent = all ? 'Send to Claude to fix (' + all + ')' : 'Nothing open to send'; };
  function hhmm(t){ var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function show(s){
    sent = s; btn.disabled = true; btn.textContent = 'Sent to Claude';
    stat.innerHTML = '<span class="rv-spin" aria-hidden="true"></span><span>Sent ' + s.open + ' comment' + (s.open === 1 ? '' : 's') + ' at ' + hhmm(s.at) + '. Claude is fixing ' + (s.open === 1 ? 'it' : 'them') + '; the new version appears here when it is rendered.</span>';
    if (!polling) { polling = true; poll(); }
  }
  function poll(){
    fetch('/api/status?v=' + encodeURIComponent(D.video), { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){
      if (!sent) return;
      if (j.video_mtime < sent.at && sent.thumbnail && j.thumb_mtime > sent.at && !(sent.open - sent.thumbnail)) { stat.innerHTML = '<b>The thumbnail is redrawn.</b> <button class="rv-btn primary" type="button" id="rv-reload">Load it</button>'; $('rv-reload').addEventListener('click', function(){ location.reload(); }); return; }
      if (j.video_mtime > sent.at) { stat.innerHTML = '<b>A new version is ready.</b> <button class="rv-btn primary" type="button" id="rv-reload">Load it</button>'; $('rv-reload').addEventListener('click', function(){ location.reload(); }); return; }
      if (!j.working && Date.now() - sent.at > 5 * 60 * 1000 && !stat.querySelector('.nudge')) {
        var n = el('div', 'nudge'); n.innerHTML = 'Claude has not started yet. Paste this into the Claude chat: <code>the comments are ready to fix</code> <button class="rv-btn" type="button">Copy</button>';
        n.querySelector('button').addEventListener('click', function(ev){ (navigator.clipboard ? navigator.clipboard.writeText('the comments are ready to fix') : Promise.reject()).then(function(){ ev.target.textContent = 'Copied'; }); });
        stat.appendChild(n);
      }
      if (j.working && stat.querySelector('.nudge')) stat.querySelector('.nudge').remove();
      setTimeout(poll, 5000);
    }).catch(function(){ setTimeout(poll, 8000); });
  }
  btn.addEventListener('click', function(){
    btn.disabled = true; btn.textContent = 'Sending…';
    Promise.resolve(typeof flush === 'function' ? flush() : null).then(function(){ return save(); }).catch(function(){}).then(function(){
      return fetch('/api/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ video: D.video }) }).then(function(r){ return r.json(); });
    }).then(function(j){ if (j && j.ok) show(j); else { btn.disabled = false; window.__updSend(notes.filter(function(n){ return n.status !== 'done'; }).length); stat.textContent = (j && j.error) || 'Could not send.'; } });
  });
  // a batch sent earlier and not yet answered by a new version: show it again after a reload
  fetch('/api/status?v=' + encodeURIComponent(D.video), { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){ if (j.submitted && j.submitted.video === D.video && j.video_mtime < j.submitted.at) show(j.submitted); });
})();
})();
</script>
</body></html>`;
}
