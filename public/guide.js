// Pinny the guide, a little flying pet.
// On the landing page he lives on the hill. When you scroll down he takes off and tags along; scroll back up and he flies home.
// On every other page he waits bottom right. Click him for your mini passport. Every so often he does something silly.
import { sfx } from './sfx.js';

const KEY = 'wcay_guide';
let hidden = false;
try { hidden = localStorage.getItem(KEY) === 'off'; } catch { /* ignore */ }
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function initGuide(ctx) {
  const { pinnySVG, esc, flagImg, level, fmtTime, getMe, evaluate, getList, mineMap, go, confetti, ACHIEVEMENTS, startTour, tourActive, tourState } = ctx;

  const el = document.createElement('div');
  el.className = 'guide';
  el.innerHTML = `<div class="guide-fly">
    <div class="guide-bubble" role="status" aria-live="polite" hidden></div>
    <div class="guide-panel" role="dialog" aria-label="Your mini passport" hidden></div>
    <button class="guide-btn" type="button" aria-label="Pinny, your guide. Open your passport">${pinnySVG()}</button>
  </div>`;
  document.body.append(el);
  const fly = el.querySelector('.guide-fly');
  const btn = el.querySelector('.guide-btn');
  const bubble = el.querySelector('.guide-bubble');
  const panel = el.querySelector('.guide-panel');
  const pin = el.querySelector('.pinny');
  el.hidden = hidden;

  // ---------- where he stands
  let side = 'right';
  let cur = { x: 0, y: 0 };
  let mode = 'float'; // 'float' = at the bottom of the screen with you, 'home' = sitting on the landing page hill
  let busy = false; // mid-flight
  const size = () => (innerWidth <= 640 ? [64, 76] : [84, 100]);
  const homeSpot = (s = side) => {
    const [w, h] = size();
    const bottom = innerWidth <= 640 ? 84 : 18;
    return { x: s === 'right' ? innerWidth - w - 14 : 14, y: innerHeight - h - bottom };
  };
  function setPos(p) { cur = p; el.style.transform = `translate(${p.x}px, ${p.y}px)`; }
  addEventListener('resize', () => { if (!busy && mode === 'float') setPos(homeSpot()); });

  // flies along an arc, spinning, and lands on `to`
  function flyTo(to, { ms = 1000, spin = 1, arc = 110 } = {}) {
    const from = { ...cur };
    busy = true;
    if (reduce()) { setPos(to); busy = false; return Promise.resolve(); }
    const mx = (from.x + to.x) / 2 + rnd(-40, 40), my = Math.min(from.y, to.y) - arc;
    el.style.visibility = 'visible';
    wings(true); trail(true);
    const a = el.animate([
      { transform: `translate(${from.x}px, ${from.y}px)` },
      { transform: `translate(${mx}px, ${my}px)`, offset: 0.5 },
      { transform: `translate(${to.x}px, ${to.y}px)` },
    ], { duration: ms, easing: 'cubic-bezier(.45,.05,.3,1)' });
    if (spin) btn.animate([{ transform: 'rotate(0)' }, { transform: `rotate(${360 * spin}deg) scale(1.15)`, offset: 0.55 }, { transform: `rotate(${360 * spin}deg)` }], { duration: ms, easing: 'ease-in-out' });
    sfx.whoosh();
    return a.finished.catch(() => {}).then(() => { setPos(to); busy = false; wings(false); trail(false); });
  }

  // ---------- the pinny on the landing page hill
  let homePin = null, homeVisible = false, forceFloat = false, hillIO;
  const homeRect = () => homePin?.getBoundingClientRect();
  function homeSpotFromHill() {
    const r = homeRect();
    const [w, h] = size();
    return r ? { x: r.left + r.width / 2 - w / 2, y: r.bottom - h + 6 } : homeSpot();
  }
  async function syncMode() {
    if (hidden || busy) return;
    const want = homePin && homeVisible && !forceFloat ? 'home' : 'float';
    if (want === mode) return;
    if (want === 'float') {
      // he jumps off the hill and flies to the corner
      const from = homeSpotFromHill();
      mode = 'float';
      setPos(from);
      homePin.style.visibility = 'hidden';
      await flyTo(homeSpot(), { ms: 1100, spin: 1 });
      if (current && !bubbleOpen() && !offering) say(current.dataset.guide, 3200);
    } else {
      // he flies back to the hill
      mode = 'home';
      bubble.hidden = true; panel.hidden = true;
      await flyTo(homeSpotFromHill(), { ms: 800, spin: -1, arc: 70 });
      homePin.style.visibility = '';
      el.style.visibility = 'hidden';
    }
  }

  // ---------- speech bubble (short on purpose)
  let bubbleTimer;
  const bubbleOpen = () => !bubble.hidden;
  function say(text, ms = 3600) {
    if (hidden || !text || mode === 'home') return;
    bubble.classList.remove('has-actions'); bubble.onclick = null;
    bubble.textContent = text;
    bubble.dataset.side = side;
    bubble.hidden = false;
    bubble.classList.remove('in'); void bubble.offsetWidth; bubble.classList.add('in');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
  }
  function mood(m) { if (pin && m) pin.dataset.mood = m; }
  const actor = () => (mode === 'home' && homePin ? homePin : pin); // whoever is on screen right now

  // eyes follow the pointer (every Pinny on the page)
  let mx = innerWidth / 2, my = innerHeight / 2, lookRaf = 0;
  function look() {
    lookRaf = 0;
    for (const p of document.querySelectorAll('.pinny')) {
      const eyes = p.querySelector('.p-eyes');
      const r = eyes?.getBoundingClientRect();
      if (!r || !r.width) continue;
      const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 200);
      const tr = `translate(${((dx / d) * 2.6 * k).toFixed(2)}px, ${((dy / d) * 2.2 * k).toFixed(2)}px)`;
      p.querySelectorAll('.p-look').forEach((l) => { l.style.transform = tr; });
    }
  }
  addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; if (!lookRaf) lookRaf = requestAnimationFrame(look); }, { passive: true });

  // little sparkles and hearts
  let live = 0;
  function spark(x, y, chars = ['✨', '⭐', '💛'], drift = 40) {
    if (reduce() || live > 28) return;
    live++;
    const s = document.createElement('span');
    s.className = 'spark';
    s.textContent = pick(chars);
    s.style.cssText = `left:${x}px;top:${y}px;font-size:${rnd(12, 22)}px`;
    document.body.append(s);
    s.animate([{ transform: 'translate(0,0) scale(.4) rotate(0)', opacity: 1 }, { transform: `translate(${rnd(-drift, drift)}px, ${-rnd(30, 70)}px) scale(1) rotate(${rnd(-40, 40)}deg)`, opacity: 0 }], { duration: rnd(700, 1100), easing: 'ease-out' }).onfinish = () => { s.remove(); live--; };
  }
  const centerOf = () => { const r = btn.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.7]; };
  let trailRaf = 0, lastTrail = 0;
  function trail(on) {
    cancelAnimationFrame(trailRaf);
    if (!on) return;
    const step = (t) => { if (t - lastTrail > 55) { lastTrail = t; const [x, y] = centerOf(); spark(x, y, ['✨', '⭐', '·'], 22); } trailRaf = requestAnimationFrame(step); };
    trailRaf = requestAnimationFrame(step);
  }
  const wings = (on) => pin?.classList.toggle('flying', on);

  // ---------- section tips
  let io, current = null, idleTimer, offering = false;
  function scan() {
    io?.disconnect();
    current = null;
    // the hill Pinny only exists on the landing page
    hillIO?.disconnect();
    homePin = document.querySelector('.hills .pinny');
    homeVisible = false;
    if (homePin) {
      // on the landing page he starts out sitting on the hill; the observer decides when he takes off
      mode = 'home';
      el.style.visibility = 'hidden';
      homePin.style.visibility = '';
      hillIO ||= new IntersectionObserver(onHill, { threshold: [0, 0.4] });
      hillIO.observe(homePin);
    } else {
      side = 'right';
      mode = 'float';
      el.style.visibility = 'visible';
      if (!busy) setPos(homeSpot());
    }
    const targets = [...document.querySelectorAll('[data-guide]')];
    if (!targets.length) return;
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || e.target === current) continue;
        const first = current === null;
        current = e.target;
        if (offering || tourActive?.() || mode === 'home') continue;
        mood(e.target.dataset.guideMood || 'happy');
        if (!first && !busy && panel.hidden) {
          side = side === 'right' ? 'left' : 'right';
          bubble.hidden = true;
          flyTo(homeSpot(), { ms: 900, spin: 1, arc: 80 }).then(() => say(e.target.dataset.guide));
        } else say(e.target.dataset.guide);
        poke();
      }
    }, { rootMargin: '-42% 0px -42% 0px' });
    targets.forEach((t) => io.observe(t));
  }
  function onHill(entries) {
    for (const e of entries) homeVisible = e.isIntersecting && e.intersectionRatio > 0.4;
    syncMode();
  }

  // ---------- falls asleep, and does silly things now and then
  function poke() {
    clearTimeout(idleTimer);
    if (pin?.dataset.mood === 'sleepy') mood('happy');
    idleTimer = setTimeout(() => { if (panel.hidden && mode === 'float' && !tourActive?.()) { mood('sleepy'); say('Zzz… tap me!', 3000); } }, 50000);
  }
  addEventListener('scroll', poke, { passive: true });

  const air = (ms) => { wings(true); trail(true); setTimeout(() => { wings(false); trail(false); }, ms); };
  const antics = {
    somersault() { fly.animate([{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-70px) rotate(180deg) scale(1.1)', offset: 0.45 }, { transform: 'translateY(0) rotate(360deg)' }], { duration: 950, easing: 'cubic-bezier(.3,.7,.4,1)' }); sfx.squeak(3); air(950); },
    orbit() {
      const r = 64, k = [];
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; k.push({ transform: `translate(${(r * Math.sin(a)).toFixed(1)}px, ${(r * (Math.cos(a) - 1)).toFixed(1)}px) rotate(${i * 30}deg)` }); }
      fly.animate(k, { duration: 2200, easing: 'ease-in-out' }); sfx.whoosh(); air(2200);
    },
    wander() {
      const dx = (side === 'right' ? -1 : 1) * rnd(120, 260), dy = -rnd(30, 150);
      fly.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${dx * 0.5}px, ${dy - 30}px) rotate(-14deg)`, offset: 0.25 }, { transform: `translate(${dx}px, ${dy}px) rotate(12deg)`, offset: 0.5 }, { transform: `translate(${dx * 0.4}px, ${dy * 0.6}px) rotate(-8deg)`, offset: 0.78 }, { transform: 'translate(0,0) rotate(0)' }], { duration: 3600, easing: 'ease-in-out' }); sfx.squeak(1); air(3600);
    },
    peek() {
      const dir = side === 'right' ? 1 : -1;
      fly.animate([{ transform: 'translateX(0) rotate(0)' }, { transform: `translateX(${dir * 66}px) rotate(${dir * 22}deg)`, offset: 0.3 }, { transform: `translateX(${dir * 66}px) rotate(${dir * 22}deg)`, offset: 0.7 }, { transform: 'translateX(0) rotate(0)' }], { duration: 2200, easing: 'ease-in-out' });
    },
    dance() {
      const k = []; for (let i = 0; i < 8; i++) k.push({ transform: `translateY(${i % 2 ? 0 : -14}px) rotate(${i % 2 ? 12 : -12}deg)` }); k.push({ transform: 'none' });
      fly.animate(k, { duration: 1300, easing: 'ease-in-out' }); sfx.squeak(2); mood('party'); setTimeout(() => mood('happy'), 1400);
    },
    loop() { // quick loop-the-loop in the air
      fly.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(-50px,-60px) rotate(-180deg)', offset: 0.35 }, { transform: 'translate(0,-110px) rotate(-360deg)', offset: 0.6 }, { transform: 'translate(0,0) rotate(-360deg)' }], { duration: 1500, easing: 'ease-in-out' }); sfx.whoosh(); air(1500);
    },
    yawn() { mood('yawn'); sfx.squeak(0); setTimeout(() => mood('happy'), 1700); },
    zoomies() {
      const d = side === 'right' ? -1 : 1, k = [];
      for (let i = 0; i < 8; i++) k.push({ transform: `translate(${(i % 2 ? 0 : d * rnd(90, 170))}px, ${-rnd(0, 60)}px) rotate(${i % 2 ? 8 : -14 * d}deg)` });
      k.push({ transform: 'none' });
      fly.animate(k, { duration: 1800, easing: 'ease-in-out' }); sfx.whoosh(); air(1800); mood('wow'); setTimeout(() => mood('happy'), 1900);
    },
    async chase() { // flies over to where your cursor is, says hi, goes back
      const [w, h] = size();
      const to = { x: Math.max(8, Math.min(innerWidth - w - 8, mx - w / 2 + (side === 'right' ? -70 : 70))), y: Math.max(70, Math.min(innerHeight - h - 8, my - h / 2)) };
      bubble.hidden = true;
      await flyTo(to, { ms: 1100, spin: 1, arc: 50 });
      mood('wow'); sfx.squeak(3); say('Boop!', 1400);
      await new Promise((r) => setTimeout(r, 1500));
      mood('happy');
      await flyTo(homeSpot(), { ms: 1000, spin: -1, arc: 60 });
    },
  };
  function scheduleFun() {
    setTimeout(() => {
      const ok = mode === 'float' && !busy && panel.hidden && !offering && !tourActive?.() && !document.hidden && !hidden && !reduce() && !bubbleOpen();
      if (ok) antics[pick(Object.keys(antics))]();
      scheduleFun();
    }, rnd(12000, 24000));
  }
  scheduleFun();

  // ---------- first visit: he jumps off the hill and offers a tour
  async function offer() {
    offering = true; forceFloat = true;
    await syncMode();
    mood('wow'); sfx.squeak(2);
    bubble.innerHTML = `<strong>Hi, I'm Pinny!</strong> Quick tour?<span class="offer-actions"><button class="btn mini" type="button" data-offer="yes">Yes!</button><button class="link" type="button" data-offer="no">Later</button></span>`;
    bubble.dataset.side = side; bubble.hidden = false; bubble.classList.add('has-actions'); bubble.classList.remove('in'); void bubble.offsetWidth; bubble.classList.add('in');
    clearTimeout(bubbleTimer);
    bubble.onclick = (e) => {
      const a = e.target.closest('[data-offer]')?.dataset.offer;
      if (!a) return;
      bubble.hidden = true; bubble.classList.remove('has-actions'); bubble.onclick = null; mood('happy');
      offering = false;
      if (a === 'yes') { forceFloat = true; startTour(); } else { forceFloat = false; try { localStorage.setItem('wcay_tour', 'skipped'); } catch { /* ignore */ } say('OK! Tap me later.', 3000); syncMode(); }
    };
  }
  function hello() {
    if (hidden || tourState() !== null) return;
    setTimeout(() => offer(), 2200);
  }
  // when the tour ends he may go home again
  setInterval(() => { if (forceFloat && !offering && !tourActive?.() && panel.hidden) { forceFloat = false; syncMode(); } }, 1200);

  // ---------- mini passport
  async function openPanel() {
    const list = await getList();
    const total = list.questions.length;
    const m = mineMap();
    const ev = evaluate(m, total);
    const me = getMe();
    const lv = level(ev.n, total);
    const flag = m.country ? m.country.toLowerCase() : null;
    panel.dataset.side = side;
    panel.innerHTML = `
      <button class="panel-x" type="button" aria-label="Close">&times;</button>
      <div class="gp-top"><div class="gp-avatar">${flag ? flagImg(flag) : '<span aria-hidden="true">🌍</span>'}</div><div><p class="eyebrow">Your passport</p><strong class="gp-title">${esc(lv.title)}</strong></div></div>
      <div class="xp" role="progressbar" aria-valuenow="${lv.pct}" aria-valuemin="0" aria-valuemax="100"><i style="--w:${lv.pct}"></i></div>
      <div class="gp-stats">
        <div><b class="num" data-count="${ev.n}">0</b><small>answers</small></div>
        <div><b class="num" data-count="${ev.earned.size}">0</b><small>badges</small></div>
        <div><b class="num">${fmtTime(me.playMs)}</b><small>time here</small></div>
      </div>
      <div class="gp-badges">${ACHIEVEMENTS.filter((a) => ev.earned.has(a.id)).slice(0, 8).map((a) => `<span title="${esc(a.n)}">${a.e}</span>`).join('') || '<small>No badges yet. Answer something!</small>'}</div>
      <div class="gp-actions"><button class="btn mini" type="button" data-open>Open my passport</button><button class="link" type="button" data-tour>Take the tour</button></div>
      <button class="link away" type="button" data-away>Send Pinny away</button>`;
    panel.hidden = false;
    panel.classList.remove('in'); void panel.offsetWidth; panel.classList.add('in');
    bubble.hidden = true;
    mood('cool');
    panel.querySelectorAll('[data-count]').forEach((n) => {
      const to = Number(n.dataset.count);
      if (reduce() || !to) { n.textContent = to; return; }
      const t0 = performance.now();
      const step = (now) => { const k = Math.min(1, (now - t0) / 700); n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  function closePanel() { panel.hidden = true; mood('happy'); }

  // circle wipe that grows from Pinny, then the passport page
  function iris() {
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    closePanel();
    if (reduce()) return go('/profile');
    const o = document.createElement('div');
    o.className = 'iris';
    o.style.setProperty('--x', `${x}px`); o.style.setProperty('--y', `${y}px`);
    document.body.append(o);
    sfx.whoosh();
    requestAnimationFrame(() => o.classList.add('grow'));
    setTimeout(() => { go('/profile'); o.classList.add('out'); setTimeout(() => o.remove(), 600); }, 520);
  }

  btn.addEventListener('click', () => {
    if (busy || justDragged) return;
    sfx.squeak(4);
    btn.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-26px) scale(.95,1.08)', offset: 0.4 }, { transform: 'translateY(0) scale(1.08,.92)', offset: 0.75 }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    if (!panel.hidden) return closePanel();
    const r = btn.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + 10);
    openPanel();
  });
  panel.addEventListener('click', (e) => {
    if (e.target.closest('.panel-x')) closePanel();
    if (e.target.closest('[data-open]')) iris();
    if (e.target.closest('[data-tour]')) { closePanel(); forceFloat = true; startTour(); }
    if (e.target.closest('[data-away]')) { hidden = true; el.hidden = true; if (homePin) homePin.style.visibility = ''; try { localStorage.setItem(KEY, 'off'); } catch { /* ignore */ } }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !e.target.closest('.guide')) closePanel(); });

  // ---------- reacts to what you do
  const LINES = { vote: ['Nice pick!', 'Ooh!', 'Good one!', 'Yes!'], badge: ['Badge!', 'Shiny!', 'Look at you!'], share: ['Thank you!', 'You rock!'], egg: ['You found one!', 'Sneaky!'] };
  function react(kind) {
    if (hidden) return;
    const a = actor();
    if (!a) return;
    a.classList.remove('hop'); void a.getBoundingClientRect(); a.classList.add('hop');
    a.dataset.mood = kind === 'badge' || kind === 'egg' ? 'party' : 'wow';
    setTimeout(() => { if (a.dataset.mood !== 'sleepy') a.dataset.mood = 'happy'; }, 1500);
    sfx.squeak(kind === 'vote' ? 2 : 4);
    if (mode === 'float' && !panel.hidden === false && !tourActive?.()) {
      const [x, y] = centerOf();
      for (let i = 0; i < 5; i++) setTimeout(() => spark(x, y - 40, ['✨', '⭐', '🎉']), i * 70);
      if (!bubbleOpen() || !bubble.classList.contains('has-actions')) say(pick(LINES[kind] || ['Yay!']), 1900);
    }
  }
  addEventListener('wcay:vote', () => react('vote'));
  addEventListener('wcay:badge', () => react('badge'));
  addEventListener('wcay:mark', (e) => { const k = e.detail?.kind; if (k === 'egg') react('egg'); else if (k === 'share') react('share'); });

  // ---------- pick him up and carry him around
  let drag = null, justDragged = false;
  btn.addEventListener('pointerdown', (e) => {
    if (busy || e.button > 0) return;
    drag = { sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, moved: false, id: e.pointerId };
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 7) { drag.moved = true; btn.setPointerCapture(e.pointerId); panel.hidden = true; bubble.hidden = true; mood('wow'); wings(false); el.classList.add('held'); sfx.squeak(5); }
    if (drag.moved) { setPos({ x: drag.ox + dx, y: drag.oy + dy }); fly.style.transform = `rotate(${Math.max(-18, Math.min(18, dx / 12))}deg)`; }
  });
  const drop = async (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    fly.style.transform = '';
    el.classList.remove('held');
    if (!moved) return;
    justDragged = true; setTimeout(() => { justDragged = false; }, 0);
    mood('party'); say('Wheee!', 1500);
    await flyTo(homeSpot(), { ms: 1100, spin: 1, arc: 90 });
    mood('happy');
  };
  btn.addEventListener('pointerup', drop);
  btn.addEventListener('pointercancel', drop);

  // ---------- pets: hover for a moment and you get hearts
  let petTimer = 0;
  btn.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearInterval(petTimer);
    petTimer = setInterval(() => { if (drag || busy || !panel.hidden) return; const [x, y] = centerOf(); spark(x, y - 50, ['💛', '🧡', '💚'], 26); sfx.squeak(0); }, 1500);
    setTimeout(() => {}, 0);
  });
  btn.addEventListener('pointerleave', () => clearInterval(petTimer));

  setPos(homeSpot());
  hello();
  return {
    scan,
    react,
    callBack() { hidden = false; el.hidden = false; try { localStorage.removeItem(KEY); } catch { /* ignore */ } mode = 'float'; el.style.visibility = 'visible'; setPos(homeSpot()); say("I'm back!"); },
    get hidden() { return hidden; },
  };
}
