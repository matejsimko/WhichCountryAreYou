// The tutorial: Pinny walks you through the site, spotlighting one thing at a time.
// Offered on the first visit, and available any time from Pinny's panel or the passport page.

const KEY = 'wcay_tour';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const visible = (list) => list.map((s) => document.querySelector(s)).find((e) => e && e.offsetParent !== null && e.getBoundingClientRect().width > 0);

export const tourState = () => { try { return localStorage.getItem(KEY); } catch { return 'done'; } };
const setState = (v) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };

export function initTour({ go, pinnySVG, esc, confetti, sfx, mark, toast }) {
  const STEPS = [
    { find: () => visible(['#finder-wrap']), title: 'Your country', text: 'Type it, press Enter.', mood: 'wow' },
    { find: () => visible(['.grid .card']), title: 'Quick votes', text: 'Tap an answer. Bars grow.', mood: 'cool' },
    { find: () => visible(['#map-slot']), title: 'Live map', text: 'Zoom, drag, tap a country.', mood: 'wow' },
    { find: () => visible(['.nav a[href="/explore"]', '.tabbar a[href="/explore"]']), title: 'Questions', text: '25 to explore.', mood: 'happy' },
    { find: () => visible(['.nav a[href="/profile"]', '.tabbar a[href="/profile"]']), title: 'Passport', text: 'Badges, time, streaks.', mood: 'cool' },
    { find: () => visible(['#sound']), title: 'Sounds', text: 'Mute them here.', mood: 'happy' },
    { find: () => visible(['.guide-btn']), title: 'And me!', text: 'Tap me anytime. 8 secrets hide here.', mood: 'party' },
  ];

  let i = 0, spot, card, active = false;

  function build() {
    spot = document.createElement('div'); spot.className = 'tour-spot';
    card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Tutorial');
    document.body.append(spot, card);
  }

  function place(target) {
    const pad = 10;
    const r = target.getBoundingClientRect();
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (innerWidth <= 640) { card.style.left = '12px'; card.style.right = '12px'; card.style.top = 'auto'; card.style.bottom = 'calc(88px + env(safe-area-inset-bottom, 0px))'; card.classList.add('sheet'); return; }
    card.classList.remove('sheet');
    card.style.right = 'auto'; card.style.bottom = 'auto';
    const below = r.bottom + pad + 16 + ch < innerHeight;
    const top = below ? r.bottom + pad + 16 : Math.max(12, r.top - pad - 16 - ch);
    const left = Math.min(innerWidth - cw - 12, Math.max(12, r.left + r.width / 2 - cw / 2));
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function show(n) {
    i = n;
    const step = STEPS[i];
    const target = step.find();
    if (!target) { return i < STEPS.length - 1 ? show(i + 1) : finish(); }
    const last = i === STEPS.length - 1;
    card.innerHTML = `
      <div class="tour-head"><div class="tour-pinny" aria-hidden="true">${pinnySVG()}</div><div><p class="eyebrow">Step ${i + 1} of ${STEPS.length}</p><strong class="tour-title">${esc(step.title)}</strong></div></div>
      <p class="tour-text">${esc(step.text)}</p>
      <div class="tour-dots" aria-hidden="true">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tour-actions"><button class="link" type="button" data-t="skip">Skip tour</button><span><button class="btn alt mini" type="button" data-t="back" ${i === 0 ? 'disabled' : ''}>Back</button> <button class="btn mini" type="button" data-t="next">${last ? 'Finish' : 'Next'}</button></span></div>`;
    const mini = card.querySelector('.pinny');
    if (mini) mini.dataset.mood = step.mood || 'happy';
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    sfx.squeak(i + 1);
    target.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
    place(target);
    // the page may still be scrolling or the map still mounting: settle the spotlight afterwards
    clearTimeout(show.t1); clearTimeout(show.t2);
    show.t1 = setTimeout(() => place(step.find() || target), 450);
    show.t2 = setTimeout(() => place(step.find() || target), 1100);
  }

  function finish(done = true) {
    active = false;
    spot?.classList.add('out'); card?.classList.add('out');
    setTimeout(() => { spot?.remove(); card?.remove(); spot = card = null; }, 350);
    document.removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    setState(done ? 'done' : 'skipped');
    if (done) { confetti(innerWidth / 2, innerHeight * 0.6); sfx.badge(); mark('tour'); toast('🎓 Tour complete! Badge unlocked.'); }
  }
  const onKey = (e) => {
    if (e.key === 'Escape') finish(false);
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (!e.target.closest?.('input, textarea')) next(); }
    else if (e.key === 'ArrowLeft') back();
  };
  const onResize = () => { const t = STEPS[i].find(); if (t) place(t); };
  const next = () => (i >= STEPS.length - 1 ? finish() : show(i + 1));
  const back = () => { if (i > 0) show(i - 1); };

  async function start() {
    if (active) return;
    active = true;
    if (location.pathname !== '/') { go('/'); await new Promise((r) => setTimeout(r, 900)); }
    window.scrollTo({ top: 0 });
    build();
    card.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]')?.dataset.t;
      if (t === 'next') next(); else if (t === 'back') back(); else if (t === 'skip') finish(false);
    });
    document.addEventListener('keydown', onKey);
    addEventListener('resize', onResize);
    show(0);
  }

  return { start, get active() { return active; } };
}
