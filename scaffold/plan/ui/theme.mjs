// theme.mjs — the light/dark switch in every page's header. The choice is kept in a cookie on 127.0.0.1 (shared by the
// pages on their different ports) and in localStorage (for pages opened as files); with no choice the system setting
// rules. ui.css already carries both themes (:root[data-theme="light"|"dark"]).
const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8z"/></svg>';

export const THEME_TOGGLE = `<button type="button" class="ud-theme" aria-label="Switch between light and dark" title="Light or dark"></button><script>(function(){
  var K = 'ud-theme', r = document.documentElement, b = document.currentScript.previousElementSibling;
  function read(){ var m = document.cookie.match(/(?:^|; )ud-theme=(light|dark)/); if (m) return m[1]; try { return localStorage.getItem(K); } catch (e) { return null; } }
  function save(t){ document.cookie = 'ud-theme=' + t + '; path=/; max-age=31536000; SameSite=Lax'; try { localStorage.setItem(K, t); } catch (e) {} }
  function now(){ return r.getAttribute('data-theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  function draw(){ var dark = now() === 'dark'; b.innerHTML = dark ? ${JSON.stringify(SUN)} : ${JSON.stringify(MOON)}; b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); }
  var s = read(); if (s === 'light' || s === 'dark') r.setAttribute('data-theme', s);
  draw();
  b.addEventListener('click', function(){ var t = now() === 'dark' ? 'light' : 'dark'; r.setAttribute('data-theme', t); save(t); draw(); });
})();</script>`;
