// style.mjs — the dashboard's styles (the agreed layout prototype), shared by the live page and the prototype.
export const DASH_CSS = `body{margin:0;background:var(--surface-soft);color:var(--text);font-family:var(--ud-body)}
main{max-width:1180px;margin:0 auto;padding:0 28px 60px}
.ud-pin{padding-top:16px}
.top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:18px 0 14px}
h1{font-family:var(--ud-display);font-weight:800;font-size:clamp(28px,3.6vw,40px);letter-spacing:-.035em;margin:0 0 6px}
.live{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--text-muted)}.live i{width:9px;height:9px;border-radius:50%;background:#2f9e55;box-shadow:0 0 0 4px rgba(47,158,85,.18)}
.live.off i{background:#a3a3a3;box-shadow:none}
.newbtn{font:700 15px var(--ud-body);padding:13px 22px;border-radius:999px;border:0;background:var(--action);color:var(--on-action);box-shadow:inset 0 0 0 1.5px var(--ud-action-edge);cursor:pointer}
.muted{color:var(--text-muted)}.small{font-size:13px}
.tabs button{border-radius:0!important;border:0!important;border-bottom:2.5px solid transparent!important;background:none!important}.tabs button.on{border-bottom-color:var(--text)!important}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:8px 0 18px}.tabs button{font:600 14.5px var(--ud-body);background:none;border:0;padding:10px 14px;color:var(--text-muted);cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-1px}
.tabs button.on{color:var(--text);border-bottom-color:var(--text)}.tabs button .n{font:500 12px var(--font-mono);margin-left:4px;color:var(--text-muted)}.tabs .waiting{background:var(--action);color:var(--on-action);border-radius:999px;padding:1px 7px;font-size:11.5px;margin-left:4px}
.view[hidden]{display:none}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}.filters button{font:500 13px var(--ud-body);border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 12px;cursor:pointer;color:var(--text)}.filters button.on{border-color:var(--text);font-weight:600}
button{font:600 13px var(--ud-body);border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:999px;padding:7px 13px;cursor:pointer}button.dark{background:var(--text);color:var(--surface);border-color:var(--text)}button.quiet{border-color:transparent;background:none;color:var(--text-muted);padding:4px 8px}
.vlist{display:grid;gap:10px}.vrow{display:grid;grid-template-columns:176px minmax(0,1fr) 220px auto;gap:18px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);padding:12px 16px 12px 12px}
.vthumb{aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:var(--surface-soft);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted)}.vthumb img{width:100%;height:100%;object-fit:cover}
.vtitle{font-size:16px}.vnote{font-size:13px;margin-top:4px}
.sdots{display:flex;align-items:center;gap:4px}.sdots i{width:22px;height:6px;border-radius:3px;background:var(--line)}.sdots i.done{background:var(--text)}.sdots i.now{background:var(--action);box-shadow:inset 0 0 0 1px var(--ud-action-edge)}.sdots b{font-size:12.5px;margin-left:6px}
.vacts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
@media(max-width:900px){.vrow{grid-template-columns:120px 1fr}.vstage,.vacts{grid-column:1/-1;justify-content:flex-start}}
.bgrid{display:grid;gap:14px}.bcard{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);padding:16px;display:grid;grid-template-columns:300px minmax(0,1fr);gap:22px}
.bid{display:flex;flex-direction:column;gap:10px}@media(max-width:860px){.bcard{grid-template-columns:1fr}}
.bstory{display:flex;flex-direction:column;gap:8px}
.slist,.bkit{list-style:none;margin:0;padding:0}.slist li{display:grid;grid-template-columns:150px minmax(0,1fr);gap:14px;padding:8px 0;border-top:1px solid var(--line);align-items:baseline}.slist li:first-child{border-top:0;padding-top:0}
.slist .st{font-size:14px;line-height:1.45}.slist .q{display:block}
@media(max-width:700px){.slist li{grid-template-columns:1fr;gap:2px}}
.bkit li{display:flex;align-items:center;gap:10px;padding:5px 0;font-size:14px}.bkit .sl{min-width:84px}.fsamp{display:inline-grid;place-items:center;width:34px;height:28px;border:1px solid var(--line);border-radius:6px;font-size:16px;background:var(--surface-soft)}
.bcard:not(.open) .kchips .extra{display:none}.bcard.open .kchips .more{display:none}
.lmark{display:inline-flex}.lm-fade{animation:lmf 3.2s ease-in-out infinite}@keyframes lmf{0%,6%{opacity:0;transform:translateY(8px)}24%,86%{opacity:1;transform:none}100%{opacity:0}}
.sf{display:flex;flex-direction:column;gap:3px}.sl{font:600 11px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)}.sf p{margin:0;font-size:14px;line-height:1.45}
.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.bcard.open .clamp{display:block}
.kchips{display:flex;flex-wrap:wrap;gap:6px}.kchips span{font-size:12.5px;border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:var(--surface-soft)}.kchips .more{font-weight:600}
.bcard:not(.open) .kchips span:nth-child(n+8):not(.more){display:none}.showall{align-self:flex-start}
.blogo{height:76px;border-radius:10px;background:#fff;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;padding:12px}.blogo img{max-height:44px;max-width:80%}
.bname{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.bname b{font-size:17px}
.bsw{display:flex;align-items:center;gap:6px}.bsw span[style]{width:22px;height:22px;border-radius:6px;border:1px solid var(--line)}.bsw .small{margin-left:6px}
.bstats{display:flex;gap:12px;flex-wrap:wrap;font-size:13px}.waiting{background:var(--action);color:var(--on-action);border-radius:999px;padding:1px 8px;font-size:12px}
.bacts{display:flex;gap:6px;flex-wrap:wrap}
.lbrand{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-flow);padding:16px 18px;margin:0 0 14px}.lbrand h3{margin:0 0 10px;font-size:17px}
.lprop{border:1.5px solid var(--text);background:var(--surface-highlight);border-radius:12px;padding:12px 14px;margin:0 0 12px}.lprop>div:first-child{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}
.lprop ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}.lprop label{display:flex;gap:10px;align-items:baseline;font-size:14px;cursor:pointer}.lpacts{display:flex;gap:8px;margin-top:10px}
.lkind{flex:none;font:600 11px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);min-width:110px}
.llist{list-style:none;margin:0;padding:0}.lrow{display:grid;grid-template-columns:120px minmax(0,1fr) 210px auto auto auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:14px}.lrow:first-child{border-top:0}
.lrow.off .ltext{color:var(--text-muted);text-decoration:line-through}.lsw{display:flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer}
.addl{margin-top:6px}
@media(max-width:800px){.lrow{grid-template-columns:1fr auto auto auto}.lrow .lkind,.lrow .lsrc{grid-column:1/-1}}
.foot{margin-top:28px;font-size:12.5px;color:var(--text-muted)}
.proto{background:var(--surface-highlight);border:1px dashed var(--line);border-radius:10px;padding:8px 12px;font-size:13px;margin:12px 0 0}
`;
