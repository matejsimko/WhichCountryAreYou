// The tutorial: Pinny walks you through the site, spotlighting one thing at a time.
// Offered on the first visit, and available any time from Pinny's panel or the passport page.
// The spotlight follows its target every frame, so scrolling, layout shifts and the lazy map can't throw it off.

const KEY = 'wcay_tour';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const visible = (list) => list.map((s) => document.querySelector(s)).find((e) => e && e.offsetParent !== null && e.getBoundingClientRect().width > 0);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export const tourState = () => { try { return localStorage.getItem(KEY); } catch { return 'done'; } };
const setState = (v) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };

const emit = (name, props) => dispatchEvent(new CustomEvent('wcay:track', { detail: { name, props } }));
export function initTour({ go, pinnySVG, esc, confetti, sfx, mark, toast }) {
  const STEPS = [
    { find: () => visible(['#finder-wrap']), title: 'Your country', text: 'Type it and press Enter. That is your first vote, and your flag lands on the map.', mood: 'wow' },
    { find: () => visible(['.grid .card']), title: 'Quick votes', text: 'Tap an answer. The bars show how the world voted. You can change it any time.', mood: 'cool' },
    { find: () => visible(['#map-slot .map-stage', '#map-slot']), title: 'The live map', text: 'Colors show votes. Zoom to a continent, tap a country, then pick your city.', mood: 'wow' },
    { find: () => visible(['.nav a[href="/explore"]', '.tabbar a[href="/explore"]']), title: 'All questions', text: 'There are 25 to explore, and new ones arrive often.', mood: 'happy' },
    { find: () => visible(['.nav a[href="/profile"]', '.tabbar a[href="/profile"]']), title: 'Your passport', text: 'Badges, time here and every answer you gave live here.', mood: 'cool' },
    { find: () => visible(['#sound']), title: 'Sound', text: 'Little sounds play when you hover and vote. Mute them here.', mood: 'happy' },
    { find: () => visible(['.guide-btn']), title: 'And me!', text: 'Tap me for a mini passport. Psst: 8 secrets are hiding around the site.', mood: 'party' },
  ];

  let i = 0, spot, card, active = false, target = null, raf = 0;
  let shown = null; // the rectangle currently drawn
  let tween = null; // glide between two targets
  let below = true; // which side of the target the card sits on
  let scrollAnim = 0;

  function build() {
    spot = document.createElement('div'); spot.className = 'tour-spot';
    card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Tutorial');
    document.body.append(spot, card);
  }

  const goalOf = (t) => { const r = t.getBoundingClientRect(); const pad = 10; return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 }; };

  function draw(v) {
    spot.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px)`;
    spot.style.width = `${v.w.toFixed(1)}px`;
    spot.style.height = `${v.h.toFixed(1)}px`;
    // the card sits under the target, or above when there's no room; phones get a bottom sheet
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (innerWidth <= 640) { card.classList.add('sheet'); card.style.left = '12px'; card.style.top = 'auto'; card.style.right = '12px'; card.style.bottom = 'calc(92px + env(safe-area-inset-bottom, 0px))'; return; }
    card.classList.remove('sheet'); card.style.right = 'auto'; card.style.bottom = 'auto';
    const gap = 16;
    const spaceBelow = innerHeight - (v.y + v.h) - gap - 8, spaceAbove = v.y - gap - 8;
    // switch sides only when the current side is too small AND the other side fits, so a tall target can't make it flip every frame
    if (below && spaceBelow < ch && spaceAbove >= ch) below = false;
    else if (!below && spaceAbove < ch && spaceBelow >= ch) below = true;
    let top;
    if (spaceBelow < ch && spaceAbove < ch) top = innerHeight - ch - 16; // neither side fits: sit in the bottom corner, over the target
    else top = below ? v.y + v.h + gap : v.y - gap - ch;
    top = Math.max(8, Math.min(innerHeight - ch - 8, top));
    const left = Math.max(12, Math.min(innerWidth - cw - 12, v.x + v.w / 2 - cw / 2));
    card.style.left = `${left.toFixed(1)}px`;
    card.style.top = `${top.toFixed(1)}px`;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!target || !document.contains(target)) { const t = STEPS[i]?.find(); if (t) target = t; else return; }
    const goal = goalOf(target);
    if (!shown) shown = { ...goal };
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms), e = ease(k);
      shown = { x: lerp(tween.from.x, goal.x, e), y: lerp(tween.from.y, goal.y, e), w: lerp(tween.from.w, goal.w, e), h: lerp(tween.from.h, goal.h, e) };
      if (k >= 1) tween = null;
    } else shown = goal;
    draw(shown);
  }

  // our own smooth scroll, so nothing (CSS scroll-behavior, lazy content) can cancel it
  function scrollToTarget(t, retry = false) {
    cancelAnimationFrame(scrollAnim);
    if (t.closest('.tabbar, .guide, .toast')) return; // fixed things are always in view
    const r = t.getBoundingClientRect();
    const tall = r.height > innerHeight * 0.6;
    // the header scrolls away with the page, so bring the page back to the top for its links
    const wanted = t.closest('.top') ? 0 : tall ? window.scrollY + r.top - 100 : window.scrollY + r.top - (innerHeight - r.height) / 2 + (innerWidth <= 640 ? -50 : 20);
    const max = document.documentElement.scrollHeight - innerHeight;
    const to = Math.max(0, Math.min(max, wanted));
    const from = window.scrollY;
    if (Math.abs(to - from) < 4) return;
    if (reduce()) { window.scrollTo(0, to); return; }
    const dur = Math.min(1100, 420 + Math.abs(to - from) * 0.35), t0 = performance.now();
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, lerp(from, to, ease(k)));
      if (k < 1) scrollAnim = requestAnimationFrame(step);
      else { document.documentElement.style.scrollBehavior = prev; if (!retry) setTimeout(() => { if (active && target === t) scrollToTarget(t, true); }, 350); }
    };
    scrollAnim = requestAnimationFrame(step);
  }

  let showId = 0;
  async function ready(t) {
    // the map loads when it scrolls into view and then grows; wait until it has its real size
    const slot = document.querySelector('#map-slot');
    if (!slot || (t !== slot && !t.classList.contains('map-stage')) || slot.querySelector('.map-stage')?.getBoundingClientRect().height > 100) return;
    scrollToTarget(slot);
    for (let k = 0; k < 40 && !(slot.querySelector('.map-stage')?.getBoundingClientRect().height > 100); k++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 250));
  }
  async function show(n) {
    const id = ++showId;
    i = n;
    const step = STEPS[i];
    const t = step.find();
    if (t) { await ready(t); if (id !== showId || !active) return; }
    if (!t) { return i < STEPS.length - 1 ? show(i + 1) : finish(); }
    const last = i === STEPS.length - 1;
    if (!card) return;
    card.innerHTML = `
      <div class="tour-head"><div class="tour-pinny" aria-hidden="true">${pinnySVG()}</div><div><p class="eyebrow">Step ${i + 1} of ${STEPS.length}</p><strong class="tour-title">${esc(step.title)}</strong></div></div>
      <p class="tour-text">${esc(step.text)}</p>
      <div class="tour-dots" aria-hidden="true">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tour-actions"><button class="link" type="button" data-t="skip">Skip tour</button><span><button class="btn alt mini" type="button" data-t="back" ${i === 0 ? 'disabled' : ''}>Back</button> <button class="btn mini" type="button" data-t="next">${last ? 'Finish' : 'Next'}</button></span></div>`;
    const mini = card.querySelector('.pinny');
    if (mini) mini.dataset.mood = step.mood || 'happy';
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    sfx.squeak(i + 1);
    emit('tour_step', { i: i + 1 });
    target = t;
    tween = shown ? { from: { ...shown }, t0: performance.now(), ms: reduce() ? 1 : 650 } : null;
    scrollToTarget(t);
  }

  function finish(done = true) {
    active = false;
    cancelAnimationFrame(raf); cancelAnimationFrame(scrollAnim);
    document.documentElement.style.scrollBehavior = '';
    spot?.classList.add('out'); card?.classList.add('out');
    const s = spot, c = card;
    setTimeout(() => { s?.remove(); c?.remove(); }, 350);
    spot = card = target = shown = tween = null;
    document.removeEventListener('keydown', onKey);
    setState(done ? 'done' : 'skipped');
    if (!done) emit('tour_skip', { i: i + 1 });
    if (done) { confetti(innerWidth / 2, innerHeight * 0.6); sfx.badge(); mark('tour'); toast('🎓 Tour complete! Badge unlocked.'); }
  }
  const onKey = (e) => {
    if (e.key === 'Escape') finish(false);
    else if ((e.key === 'ArrowRight' || e.key === 'Enter') && !e.target.closest?.('input, textarea, button')) next();
    else if (e.key === 'ArrowLeft') back();
  };
  const next = () => (i >= STEPS.length - 1 ? finish() : show(i + 1));
  const back = () => { if (i > 0) show(i - 1); };

  async function start() {
    if (active) return;
    active = true;
    if (location.pathname !== '/') {
      go('/');
      // wait for the landing page to render
      for (let k = 0; k < 30 && !document.querySelector('#finder-wrap'); k++) await new Promise((r) => setTimeout(r, 100));
    }
    emit('tour_start');
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = '';
    build();
    card.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]')?.dataset.t;
      if (t === 'next') next(); else if (t === 'back') back(); else if (t === 'skip') finish(false);
    });
    document.addEventListener('keydown', onKey);
    show(0);
    raf = requestAnimationFrame(frame);
  }

  return { start, get active() { return active; } };
}
