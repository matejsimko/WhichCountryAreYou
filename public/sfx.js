// Tiny synthesized sounds (Web Audio, no files). Quiet on purpose. Starts only after the first click or tap,
// as browsers require, and can be muted from the header button.

const KEY = 'wcay_sound';
let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* ignore */ }

function audio() {
  if (!enabled) return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx.state === 'running' || ctx.state === 'suspended' ? ctx : null;
}

function tone(freq, dur = 0.09, { type = 'sine', vol = 0.05, slide = 0, delay = 0 } = {}) {
  const c = audio();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let lastHover = 0;
const NOTES = { C: 523.25, D: 587.33, E: 659.25, G: 783.99, A: 880, C2: 1046.5, E2: 1318.5 };

export const sfx = {
  get on() { return enabled; },
  set(v) { enabled = v; try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* ignore */ } if (v) { audio(); sfx.click(); } },
  unlock() { audio(); },
  hover() { const n = performance.now(); if (n - lastHover < 70) return; lastHover = n; tone(620 + Math.random() * 120, 0.05, { type: 'triangle', vol: 0.014 }); },
  click() { tone(420, 0.08, { type: 'sine', vol: 0.06, slide: 1.8 }); },
  vote() { [NOTES.C, NOTES.E, NOTES.G, NOTES.C2].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.06, delay: i * 0.07 })); },
  badge() { [NOTES.G, NOTES.C2, NOTES.E2].forEach((f, i) => tone(f, 0.22, { type: 'square', vol: 0.03, delay: i * 0.11 })); tone(NOTES.E2, 0.5, { type: 'triangle', vol: 0.04, delay: 0.33 }); },
  squeak(i = 0) { const base = 520 + i * 90; tone(base, 0.09, { type: 'sine', vol: 0.06, slide: 1.9 }); tone(base * 1.5, 0.1, { type: 'sine', vol: 0.05, slide: 0.8, delay: 0.09 }); },
  egg() { [NOTES.E, NOTES.G, NOTES.E2, NOTES.C2].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.025, delay: i * 0.06 })); },
  whoosh() { tone(900, 0.35, { type: 'sawtooth', vol: 0.015, slide: 0.25 }); },
};

// one-time wiring: unlock on first gesture, hover ticks, click pops, mute button
export function initSfx() {
  const btn = document.getElementById('sound');
  const paint = () => { if (btn) { btn.textContent = enabled ? '🔊' : '🔇'; btn.setAttribute('aria-pressed', String(enabled)); btn.setAttribute('aria-label', enabled ? 'Sound on. Turn off' : 'Sound off. Turn on'); } };
  paint();
  btn?.addEventListener('click', () => { sfx.set(!enabled); paint(); });
  addEventListener('pointerdown', () => sfx.unlock(), { once: true });
  addEventListener('keydown', () => sfx.unlock(), { once: true });

  const HOVERABLE = '.opt, .duel-opt, .chip, .btn, .sticker, .row, .share-btn, .badge.on, .tabbar a, .nav a, .brand, .pennant, .marquee-track .flag, .map-zoom button, .block-foot .link';
  let last = null, lastPinnyAt = 0;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const pinny = e.target.closest?.('.pinny');
    if (pinny) {
      // time-based, so a body that wiggles under the pointer can't re-trigger the squeak over and over
      const now = performance.now();
      if (now - lastPinnyAt > 1400) sfx.squeak(Number(pinny.dataset.i || 0));
      lastPinnyAt = now;
      last = pinny;
      return;
    }
    const t = e.target.closest?.(HOVERABLE);
    if (t && t !== last) { last = t; sfx.hover(); } else if (!t) last = null;
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('.pinny, #sound')) return;
    if (e.target.closest?.('.chip, .btn, .share-btn, .tabbar a, .nav a, .map-zoom button, .sticker, .row')) sfx.click();
  });
}
