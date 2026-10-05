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
  }
  send({ k: 'pv', p, r: landing ? document.referrer : '', u, w: innerWidth, l: navigator.language, e: landing ? 1 : 0 });
  landing = false;
}

export function track(name, props) {
  send({ k: 'ev', n: name, p: location.pathname, x: props });
}

export function initTracking() {
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
