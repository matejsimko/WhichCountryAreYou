// Easter eggs. There are 8. Badge names stay hidden on the profile until you find them.
import { mark as markRaw } from './me.js';
import { sfx } from './sfx.js';
const mark = (k, v) => { markRaw(k, v); if (k === 'egg') sfx.egg(); };

const FLAGS = ['sk', 'br', 'jp', 'it', 'in', 'ke', 'ca', 'au', 'fr', 'ng', 'ar', 'de', 'gb', 'us', 'kr', 'za', 'pl', 'cz', 'gr', 'pt'];
const WORDS = {
  pizza: ['🍕'], coffee: ['☕'], tea: ['🍵'], dog: ['🐶', '🦴'], cat: ['🐱', '🐟'], party: ['🎉', '🎊', '🪩'], snow: ['❄️', '⛄'], love: ['💛', '🧡', '💚'], pineapple: ['🍍'], slovakia: ['🇸🇰', '🏔️', '🥃'],
};

export function initEggs({ toast, confetti }) {
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rain(items, n = 44, asImg = false) {
    if (reduce()) return;
    for (let i = 0; i < n; i++) {
      const el = document.createElement(asImg ? 'img' : 'span');
      el.className = 'rain';
      if (asImg) { el.src = `/flags/1x1/${items[i % items.length]}.svg`; el.alt = ''; } else el.textContent = items[i % items.length];
      const x = Math.random() * innerWidth, size = 22 + Math.random() * 26;
      el.style.cssText = `left:${x}px;font-size:${size}px;width:${asImg ? size + 8 : 'auto'};height:${asImg ? size + 8 : 'auto'}`;
      document.body.append(el);
      el.animate([
        { transform: `translate(0,-60px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${(Math.random() - 0.5) * 160}px, ${innerHeight + 80}px) rotate(${Math.random() * 540 - 270}deg)`, opacity: 1 },
      ], { duration: 2200 + Math.random() * 2200, delay: Math.random() * 900, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'both' }).onfinish = () => el.remove();
    }
  }

  // 1 + 2: Konami code, and typing a word anywhere on the page
  const konami = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let pos = 0, typed = '';
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    pos = k === konami[pos] ? pos + 1 : k === konami[0] ? 1 : 0;
    if (pos === konami.length) { pos = 0; rain(FLAGS, 60, true); toast('🕹️ ↑↑↓↓←→←→BA. A true classic.'); mark('egg', 'konami'); }
    if (k.length === 1) {
      typed = (typed + k).slice(-12);
      for (const [w, em] of Object.entries(WORDS)) if (typed.endsWith(w)) { typed = ''; rain(em, 40); toast(`${em[0]} You said ${w}.`); mark('egg', 'words'); }
    }
  });

  // 3 to 7: things to poke
  let pinnyClicks = 0, pinClicks = [], pennants = new Set(), flagsPoked = new Set();
  const regions = new Intl.DisplayNames(['en'], { type: 'region' });
  document.addEventListener('click', (e) => {
    const t = e.target;
    const pin = t.closest?.('.brand');
    if (pin) {
      const now = Date.now();
      pinClicks = pinClicks.filter((x) => now - x < 2500).concat(now);
      if (pinClicks.length >= 5) {
        pinClicks = [];
        const el = pin.querySelector('.brand-pin');
        el.classList.remove('fly'); void el.getBoundingClientRect(); el.classList.add('fly');
        toast('📍 Wheee!'); mark('egg', 'pin');
      }
    }
    const sun = t.closest?.('.sun');
    if (sun) {
      const on = sun.classList.toggle('cool');
      if (on) { toast('😎 Too cool for school.'); mark('egg', 'sun'); }
    }
    const pen = t.closest?.('.pennant');
    if (pen) {
      pen.classList.remove('spin'); void pen.offsetWidth; pen.classList.add('spin');
      const r = pen.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + r.height / 2);
      pennants.add(pen.querySelector('img').getAttribute('src'));
      if (pennants.size >= 5) { pennants.clear(); toast('🎏 Party flags! You really like those.'); mark('egg', 'bunting'); }
    }
    const fl = t.closest?.('.marquee-track .flag');
    if (fl) {
      const code = fl.getAttribute('src').match(/\/([a-z]{2})\.svg/)?.[1];
      if (code) {
        toast(`${regions.of(code.toUpperCase())}`);
        const r = fl.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top);
        flagsPoked.add(code);
        if (flagsPoked.size >= 8) { flagsPoked.clear(); rain(FLAGS.slice(0, 8), 30, true); toast('🚩 You poked eight flags. Respect.'); mark('egg', 'flagrail'); }
      }
    }
    const pinny = t.closest?.('.pinny');
    if (pinny) {
      const moods = ['happy', 'cool', 'party', 'sleepy', 'wow'];
      const i = (moods.indexOf(pinny.dataset.mood) + 1) % moods.length;
      pinny.dataset.mood = moods[i]; pinny.dataset.i = i;
      pinny.classList.remove('hop'); void pinny.getBoundingClientRect(); pinny.classList.add('hop');
      sfx.squeak(i + 2);
      if (moods[i] === 'party') { const r = pinny.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + 20); }
      pinnyClicks++;
      if (pinnyClicks === 7) { toast('🤝 Pinny likes you. A lot.'); mark('egg', 'pinny'); }
    }
  });

  // 8: for the curious
  window.secret = () => { mark('egg', 'console'); toast('🕵️ You read the console. Nice.'); return 'badge unlocked'; };
  console.log('%cWhich Country Are You?', 'font:700 20px system-ui;color:#0A5F55');
  console.log('%cPsst. Type secret() here for a surprise.', 'font:14px system-ui;color:#EE5A36');
}
