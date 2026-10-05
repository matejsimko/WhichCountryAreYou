// Our own analytics, client side. Cookieless: nothing is stored in the browser and no id is created.
// The server derives an anonymous, daily-changing visitor hash. "Do Not Track" is respected.
// Other modules report events with: dispatchEvent(new CustomEvent('wcay:track', { detail: { name, props } })).

let off = navigator.doNotTrack === '1' || window.doNotTrack === '1';
try { if (localStorage.getItem('wcay_notrack') === '1') off = true; } catch { /* ignore */ } // set when you sign in to the admin, so your own visits don't count

let landing = true;
let path = null;
let active = 0, since = null, maxScroll = 0;

function send(obj) {
  if (off) return;
  const data = JSON.stringify(obj);
  try { if (navigator.sendBeacon && navigator.sendBeacon('/api/t', data)) return; } catch { /* fall through */ }
  fetch('/api/t', { method: 'POST', body: data, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
}

function flushDuration() {
  if (since !== null) { active += performance.now() - since; since = null; }
  if (path && active > 800) send({ k: 'dur', p: path, d: Math.round(Math.min(active, 1800000)), x: { sd: Math.round(maxScroll) } });
  active = 0; maxScroll = 0;
}

export function pageview(p) {
  flushDuration();
  path = p;
  since = document.hidden ? null : performance.now();
  const u = {};
  if (landing) {
    const q = new URLSearchParams(location.search);
    u.s = q.get('utm_source') || q.get('ref') || q.get('source') || undefined;
    u.m = q.get('utm_medium') || undefined;
    u.c = q.get('utm_campaign') || undefined;
    if (q.get('s')) { // someone shared a link with us: remember which channel it came through
      u.s = q.get('s').slice(0, 20).toLowerCase(); u.m = 'share'; u.c = u.c || 'share';
      q.delete('s');
      try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch { /* ignore */ }
    }
  }
  send({ k: 'pv', p, r: landing ? document.referrer : '', u, w: innerWidth, l: navigator.language, e: landing ? 1 : 0 });
  landing = false;
}

export function track(name, props) {
  send({ k: 'ev', n: name, p: location.pathname, x: props });
}

// ---------- performance (Core Web Vitals) and errors
function initHealth() {
  const first = location.pathname;
  if (first.startsWith('/admin')) return;
  let lcp = 0, cls = 0, inp = 0;
  const watch = (type, fn, extra = {}) => { try { new PerformanceObserver((l) => fn(l.getEntries())).observe({ type, buffered: true, ...extra }); } catch { /* not supported */ } };
  watch('largest-contentful-paint', (e) => { lcp = e[e.length - 1].startTime; });
  watch('layout-shift', (e) => { for (const x of e) if (!x.hadRecentInput) cls += x.value; });
  watch('event', (e) => { for (const x of e) inp = Math.max(inp, x.duration); }, { durationThreshold: 40 });
  let sent = false;
  const flush = () => {
    if (sent) return;
    sent = true;
    const nav = performance.getEntriesByType('navigation')[0];
    send({ k: 'ev', n: 'perf', p: first, x: { lcp: Math.round(lcp), cls: Math.round(cls * 1000) / 1000, inp: Math.round(inp), ttfb: nav ? Math.round(nav.responseStart) : 0, load: nav ? Math.round(nav.loadEventEnd) : 0 } });
  };
  addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  addEventListener('pagehide', flush);

  let errs = 0;
  const report = (m, f, l) => {
    if (errs++ >= 5 || /ResizeObserver loop/i.test(String(m))) return;
    track('js_error', { m: String(m).slice(0, 90), f: String(f || '').split('/').pop().slice(0, 40), l: l || 0 });
  };
  addEventListener('error', (e) => report(e.message, e.filename, e.lineno));
  addEventListener('unhandledrejection', (e) => report('promise: ' + (e.reason?.message || e.reason), '', 0));

  // links that leave the site
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    try { const u = new URL(a.href, location.href); if (u.origin !== location.origin && /^https?:$/.test(u.protocol)) track('outbound', { h: u.hostname.replace(/^www\./, '').slice(0, 60) }); } catch { /* ignore */ }
  }, { capture: true });
}

export function initTracking() {
  initHealth();
  addEventListener('wcay:track', (e) => track(e.detail?.name, e.detail?.props));

  // how far down the page people get, and how long the tab is actually visible
  addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    if (h > 0) maxScroll = Math.max(maxScroll, Math.min(100, ((scrollY) / h) * 100));
    else maxScroll = 100;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (since !== null) { active += performance.now() - since; since = null; } flushDuration(); }
    else since = performance.now();
  });
  addEventListener('pagehide', flushDuration);

  // the app already announces its main moments
  addEventListener('wcay:vote', (e) => {
    const d = e.detail || {};
    track(d.kind === 'places' ? 'place_vote' : 'vote', { q: d.id });
  });
  addEventListener('wcay:badge', (e) => track('badge', { n: e.detail?.names?.length || 1 }));
  addEventListener('wcay:mark', (e) => {
    const { kind, value } = e.detail || {};
    if (kind === 'egg') track('egg', { id: value });
    else if (kind === 'share') track('share_done');
    else if (kind === 'zoom') track('map_zoom', { view: value });
    else if (kind === 'map') track('map_open');
    else if (kind === 'tour') track('tour_done');
    else if (kind === 'changed') track('change_answer');
  });
}
