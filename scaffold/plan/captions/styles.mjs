// styles.mjs — the caption styles (reviewed 2026-11-11 on research/motion-craft/caption-styles/), shared by the brief
// page's preview and the captions layer of the video. One definition per style: what the brief page says about it,
// the fonts it needs, how it groups words into captions, its CSS and its per-frame motion.
//
// Sizes are in cqh (1% of the frame's height) inside #cap-root, so one definition serves 1920×1080 and 1080×1920.
// Every caption sits inside the caption band (CAPTION_BAND): the bottom of a landscape frame, and above the platforms'
// own buttons in a vertical one. Scenes keep that band free when the video has burned-in captions.
// Example inputs (sample data typed into the product, listed in narration.json `inputs`) take each style's `.lit` colour.

/** The band captions live in, as fractions of the frame height (top, bottom). */
export const CAPTION_BAND = { landscape: [0.76, 1.0], vertical: [0.58, 0.8] };

/**
 * Fonts each style needs: the family the review approved and a bundled open font that stands in for it until that
 * family is in the font library (craft.mjs openFonts). `weights` are the faces used.
 */
export const STYLES = [
  { id: 'clean', name: 'Clean', family: 'Subtitle', desc: 'Broadcast subtitles: a full line at a time, white with a dark outline. Calm and readable for explainers and tutorials.',
    font: { family: 'Inter', fallback: 'Inter', weights: ['600'] }, group: { mode: 'line', max: 42 } },
  { id: 'band', name: 'Band', family: 'Lower third', desc: 'A dark band across the bottom with the brand colour along its top edge. Good over busy screens.',
    font: { family: 'DM Sans', fallback: 'Hanken Grotesk', weights: ['400', '600', '700'] }, group: { mode: 'line', max: 48 } },
  { id: 'box', name: 'Box', family: 'Subtitle', desc: 'Each line on its own rounded dark box. Readable over any frame, with a modern feel.',
    font: { family: 'Plus Jakarta Sans', fallback: 'Outfit', weights: ['800'] }, group: { mode: 'line', max: 36 } },
  { id: 'karaoke', name: 'Karaoke', family: 'Word by word', desc: 'The line shows faint on a soft dark backing and fills in word by word as it is spoken.',
    font: { family: 'Inter', fallback: 'Inter', weights: ['900'] }, group: { mode: 'line', max: 34 } },
  { id: 'highlight', name: 'Highlight', family: 'Word by word', desc: 'Short capitalised chunks; a box in the brand colour jumps to each word as it is spoken.',
    font: { family: 'Montserrat', fallback: 'Inter', weights: ['800'] }, group: { mode: 'chunk', max: 4 } },
  { id: 'punch', name: 'Punch', family: 'Bold social', desc: 'One to three huge words at a time with a thick outline; the spoken word turns yellow. The high-energy look of social feeds.',
    font: { family: 'Montserrat', fallback: 'Inter', weights: ['900'] }, group: { mode: 'chunk', max: 3 }, reveal: true },
  { id: 'pop', name: 'Pop', family: 'Word by word', desc: 'Words bounce up one by one as they are spoken, in a rounded heavy font. Playful, for ads and social cuts.',
    font: { family: 'Poppins', fallback: 'Outfit', weights: ['800'] }, group: { mode: 'chunk', max: 4 }, reveal: true },
  { id: 'type', name: 'Typewriter', family: 'Reveal', desc: 'Letters type out in step with the voice in a monospace font, with a caret. Suits developer tools and technical products.',
    font: { family: 'JetBrains Mono', fallback: 'JetBrains Mono', weights: ['500'] }, group: { mode: 'line', max: 40 }, reveal: true },
  { id: 'underline', name: 'Underline', family: 'Editorial', desc: 'A serif line in dark ink on a small cream card, with an underline in the brand colour sliding under each spoken word. Quiet and premium.',
    font: { family: 'Instrument Serif', fallback: 'Instrument Serif', weights: ['400'], italic: true }, group: { mode: 'line', max: 40 } },
  { id: 'neon', name: 'Neon', family: 'Word by word', desc: 'A frosted dark pill; spoken words light up with a glow. For dark interfaces and AI products.',
    font: { family: 'Sora', fallback: 'Space Grotesk', weights: ['600'] }, group: { mode: 'line', max: 38 } },
];
export const STYLE_IDS = STYLES.map((s) => s.id);
export const CAPTION_CHOICES = ['none', ...STYLE_IDS];
export const styleById = (id) => STYLES.find((s) => s.id === id) || null;

/** The default per video type (the brief preselects it; the user changes it): ads are watched muted in feeds. */
export const DEFAULT_CAPTIONS = { ad: 'punch' };
export const defaultCaptionsFor = (videoType) => DEFAULT_CAPTIONS[videoType] || 'none';

/**
 * The CSS for one style, scoped to `#cap-root.s-<id>`; `family` maps an approved family to the one actually loaded.
 * `accent` is the brand colour (direction palette accent or primary).
 */
export function styleCss(id, { family = (f) => f, accent = '#45792a' } = {}) {
  const s = styleById(id);
  if (!s) return '';
  const F = (name, generic = 'sans-serif') => `"${family(name)}",${generic}`;
  const R = `#cap-root.s-${id}`;
  const base = `#cap-root{position:absolute;inset:0;container-type:size;pointer-events:none;--accent:${accent}}
#cap-root .cap{position:absolute;left:0;right:0;display:flex;justify-content:center;text-align:center}
#cap-root .cue{display:inline-block;max-width:86cqw}
#cap-root .w{display:inline-block;white-space:pre;position:relative}
#cap-root.v .cue{max-width:80cqw}`;
  const css = {
    clean: `${R} .cap{bottom:7cqh}
${R} .cue{font:600 5.6cqh/1.25 ${F('Inter')};color:#fff;-webkit-text-stroke:.3cqh rgba(0,0,0,.78);paint-order:stroke fill;text-shadow:0 .3cqh 1.4cqh rgba(0,0,0,.7)}
${R} .lit{color:#ffd84d}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:3.4cqh}`,
    band: `${R} .cap{bottom:0;justify-content:flex-start}
${R} .cue{max-width:none;width:100%;text-align:left;padding:2.4cqh 7cqw 3cqh;background:linear-gradient(90deg,rgba(20,26,17,.92),rgba(20,26,17,.78));border-top:.7cqh solid var(--accent);font:400 5cqh/1.3 ${F('DM Sans')};color:#f4f6f1}
${R} .lit{color:#9fd47a;font-weight:700}
${R}.v .cap{bottom:20cqh} ${R}.v .cue{font-size:3cqh;padding:2cqh 7cqw 2.4cqh}`,
    box: `${R} .cap{bottom:6.5cqh}
${R} .cue{font:800 5.4cqh/1.55 ${F('Plus Jakarta Sans')};color:#fff}
${R} .line{background:rgba(12,12,12,.86);padding:.6cqh 2.2cqh;border-radius:1.4cqh;box-decoration-break:clone;-webkit-box-decoration-break:clone}
${R} .lit{color:#7fe0a4}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:3.3cqh}`,
    karaoke: `${R} .cap{bottom:7cqh}
${R} .cue{font:900 6.2cqh/1.3 ${F('Inter')};letter-spacing:-.015em;padding:1cqh 2.6cqh 1.3cqh;border-radius:1.6cqh;background:rgba(16,18,14,.62)}
${R} .w{color:transparent;background:linear-gradient(90deg,#fff calc(var(--p,0)*100%),rgba(255,255,255,.38) calc(var(--p,0)*100%));-webkit-background-clip:text;background-clip:text}
${R} .w.lit{background:linear-gradient(90deg,#ffd84d calc(var(--p,0)*100%),rgba(255,216,77,.38) calc(var(--p,0)*100%));-webkit-background-clip:text;background-clip:text}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:3.7cqh}`,
    highlight: `${R} .cap{bottom:6cqh}
${R} .cue{font:800 7.2cqh/1.3 ${F('Montserrat')};text-transform:uppercase;color:#fff;letter-spacing:-.01em;-webkit-text-stroke:.4cqh rgba(0,0,0,.85);paint-order:stroke fill;text-shadow:0 .4cqh 1.2cqh rgba(0,0,0,.45)}
${R} .w{padding:0 .9cqh;margin:0 -.2cqh;border-radius:1cqh;z-index:1}
${R} .w.on{background:var(--accent);text-shadow:none;-webkit-text-stroke:0}
${R} .w.lit{color:#ffe14d}
${R} .w.lit.on{background:#ffe14d;color:#1b1c18}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:4.4cqh}`,
    punch: `${R} .cap{bottom:6cqh}
${R} .cue{font:900 9.5cqh/1.05 ${F('Montserrat')};text-transform:uppercase;color:#fff;-webkit-text-stroke:.6cqh #000;paint-order:stroke fill;text-shadow:0 .8cqh 0 rgba(0,0,0,.55)}
${R} .w.on{color:#ffe14d}
${R} .w.lit{color:#5cf08e}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:6cqh}`,
    pop: `${R} .cap{bottom:6cqh}
${R} .cue{font:800 7.4cqh/1.15 ${F('Poppins')};color:#fff;-webkit-text-stroke:.45cqh #111;paint-order:stroke fill}
${R} .w{transform-origin:50% 80%}
${R} .lit{color:#ff9bd2}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:4.8cqh}`,
    type: `${R} .cap{bottom:7cqh}
${R} .cue{font:500 4.6cqh/1.4 ${F('JetBrains Mono', 'monospace')};color:#e8ffe0;background:rgba(10,14,9,.88);padding:1.6cqh 2.6cqh;border-radius:1.2cqh;border:.25cqh solid rgba(159,212,122,.45);text-align:left}
${R} .lit{color:#ffd84d}
${R} .caret{display:inline-block;width:.5em;height:1.05em;background:#9fd47a;vertical-align:-.15em;margin-left:.05em}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:2.9cqh}`,
    underline: `${R} .cap{bottom:7cqh}
${R} .cue{font:400 6.6cqh/1.25 ${F('Instrument Serif', 'serif')};color:#1b1c18;background:#fbf8f0;padding:.9cqh 3.2cqh 1.3cqh;border-radius:.8cqh;box-shadow:0 1cqh 3cqh rgba(0,0,0,.22),0 0 0 .15cqh rgba(0,0,0,.06)}
${R} .w::after{content:"";position:absolute;left:.1em;right:.25em;bottom:.04em;height:.55cqh;border-radius:.3cqh;background:var(--accent);transform:scaleX(var(--u,0));transform-origin:0 50%}
${R} .lit{font-style:italic;color:var(--accent)}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:4.4cqh}`,
    neon: `${R} .cap{bottom:8cqh}
${R} .cue{font:600 5.6cqh/1.4 ${F('Sora')};color:rgba(255,255,255,.62);background:rgba(8,10,20,.72);padding:1.2cqh 3cqh;border-radius:99cqh;border:.2cqh solid rgba(140,255,170,.25)}
${R} .w.on,${R} .w.past{color:#fff}
${R} .w.on{text-shadow:0 0 1.2cqh #6dff9a,0 0 3cqh #2ecc71}
${R} .lit{color:#ffe68a}
${R} .w.lit.on{text-shadow:0 0 1.2cqh #ffd84d,0 0 3cqh #ff9f1a}
${R}.v .cap{bottom:21cqh} ${R}.v .cue{font-size:3.3cqh}`,
  };
  return `${base}\n${css[id]}`;
}

/**
 * The engine, as source for a page: groups words into captions and draws the caption at time t. Seek-safe: everything
 * is computed from t (no transitions, no timers), so a paused or seeked frame is right.
 *   CAPTIONS.groups(words, group) → [{ ws, start, end }]
 *   CAPTIONS.render(styleDef, capEl, t, groups) draws into capEl (the .cap element)
 */
export const ENGINE_JS = `window.CAPTIONS = (function(){
  function groups(words, g){
    var out=[], cur=[];
    function len(ws){ return ws.map(function(w){return w.text}).join(' ').length; }
    for (var i=0;i<words.length;i++){
      var w=words[i], next=cur.concat([w]);
      var full = g.mode==='line' ? len(next)>g.max : next.length>g.max;
      if (cur.length && full){
        var k=-1;
        for (var j=cur.length-1;j>=2;j--){ if (/[,;:]$/.test(cur[j].text)){ k=j; break; } }
        if (k>=0 && k<cur.length-1){ out.push(cur.slice(0,k+1)); cur=cur.slice(k+1).concat([w]); } else { out.push(cur); cur=[w]; }
      } else cur=next;
      var brk=(/[.!?]$/.test(w.text) && !/^(?:[A-Za-z]\\.){2,}[,;:]?$/.test(w.text)) || (g.mode==='chunk' && /,$/.test(w.text));
      var gap=words[i+1] && words[i+1].start - w.end > 0.45;
      if (brk || gap){ out.push(cur); cur=[]; }
    }
    if (cur.length) out.push(cur);
    return out.map(function(ws,i,a){ var last=ws[ws.length-1]; return { ws: ws, start: ws[0].start-0.08, end: a[i+1] ? Math.min(a[i+1][0].start-0.02, last.end+1.2) : last.end+1.2 }; });
  }
  function ease(x){ return 1-Math.pow(1-x,3); }
  function back(x){ var c=1.9; x=Math.min(1,Math.max(0,x)); return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2); }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function render(style, cap, t, gs){
    var g=null, key=-1;
    for (var k=0;k<gs.length;k++){ if (t>=gs[k].start && t<gs[k].end){ g=gs[k]; key=k; break; } }
    if (!g){ if (cap._k!==null){ cap.innerHTML=''; cap._k=null; } return; }
    if (cap._k!==key){
      cap._k=key;
      var inner=g.ws.map(function(w,i){ return '<span class="w'+(w.lit?' lit':'')+'">'+esc(w.text)+'</span>'; }).join(' ');
      cap.innerHTML = style.id==='box' ? '<span class="cue"><span class="line">'+inner+'</span></span>' : '<span class="cue">'+inner+(style.id==='type'?'<span class="caret"></span>':'')+'</span>';
      cap._ws=[].slice.call(cap.querySelectorAll('.w'));
    }
    var spans=cap._ws;
    g.ws.forEach(function(w,i){
      var el=spans[i], dur=Math.max(0.12,w.end-w.start);
      var p=Math.min(1,Math.max(0,(t-w.start)/dur));
      var on=t>=w.start-0.03 && (i===g.ws.length-1 ? t<w.end+0.35 : t<g.ws[i+1].start-0.01);
      el.classList.toggle('on',on); el.classList.toggle('past',t>=w.end && !on);
      if (style.id==='karaoke') el.style.setProperty('--p',p.toFixed(3));
      if (style.id==='underline') el.style.setProperty('--u',on?ease(Math.min(1,(t-w.start)/0.18)).toFixed(3):0);
      if (style.id==='punch'){ var a=t-w.start; el.style.visibility=a>=-0.02?'visible':'hidden'; var s=a<0?1:1+0.25*(1-ease(Math.min(1,a/0.16))); el.style.transform='scale('+s.toFixed(3)+')'; }
      if (style.id==='pop'){ var b=t-w.start+0.04; el.style.visibility=b>=0?'visible':'hidden'; var q=back(b/0.32); el.style.transform='translateY('+((1-q)*60).toFixed(1)+'%) scale('+(0.6+0.4*q).toFixed(3)+')'; el.style.opacity=Math.min(1,Math.max(0,b/0.12)).toFixed(2); }
      if (style.id==='type'){ var n=w.text.length, shown=t<w.start?0:Math.max(1,Math.min(n,Math.ceil(p*n))); el.textContent=w.text.slice(0,shown); el.style.display=shown?'inline-block':'none'; }
    });
    if (style.id==='type'){ var c=cap.querySelector('.caret'); if (c) c.style.opacity=(Math.floor(t*2.2)%2)?0.25:1; }
  }
  return { groups: groups, render: render };
})();`;
