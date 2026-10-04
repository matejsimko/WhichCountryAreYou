// Your passport: playtime, streaks and badges. Lives in this browser only (no accounts).
// Votes themselves are tied to the device cookie on the server; everything else here is just for fun.

const KEY = 'wcay_me_v1';
const fresh = () => ({ tour: false, first: Date.now(), playMs: 0, days: [], zoomed: [], eggs: [], shares: 0, changed: 0, mapOpened: false, night: false, unlocked: [] });
let me = fresh();
try { me = { ...me, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* private mode: fine */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch { /* ignore */ } };

export const getMe = () => me;
export const EGGS_TOTAL = 8;

let onUnlock = () => {};
export const setUnlockHandler = (fn) => { onUnlock = fn; };

export function startTracking() {
  const today = new Date().toISOString().slice(0, 10);
  if (!me.days.includes(today)) me.days.push(today);
  if (new Date().getHours() < 5) me.night = true;
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (!document.hidden) me.playMs += Math.min(now - last, 2500);
    last = now;
  }, 1000);
  setInterval(save, 5000);
  addEventListener('pagehide', save);
  save();
}

// events: 'egg' id, 'zoom' continent, 'share', 'changed', 'map'
export function mark(kind, value) {
  if (kind === 'egg' && !me.eggs.includes(value)) me.eggs.push(value);
  else if (kind === 'zoom' && !me.zoomed.includes(value)) me.zoomed.push(value);
  else if (kind === 'share') me.shares++;
  else if (kind === 'changed') me.changed++;
  else if (kind === 'map') me.mapOpened = true;
  else if (kind === 'tour') me.tour = true;
  else return;
  save();
  dispatchEvent(new CustomEvent('wcay:mark', { detail: { kind, value } }));
  onUnlock();
}

export function streak() {
  const days = [...new Set(me.days)].sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    const t = Date.parse(d);
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const is = (c, q, o) => c.mine[q] === o;
export const ACHIEVEMENTS = [
  { id: 'tour', e: '🎓', n: 'Orientation', d: 'Finish the tour with Pinny.', t: (c) => c.me.tour },
  { id: 'first', e: '🗳️', n: 'First vote', d: 'Answer your first question.', t: (c) => c.n >= 1 },
  { id: 'five', e: '🖐️', n: 'High five', d: 'Answer 5 questions.', t: (c) => c.n >= 5 },
  { id: 'ten', e: '🔟', n: 'Double digits', d: 'Answer 10 questions.', t: (c) => c.n >= 10 },
  { id: 'all', e: '🏆', n: 'Completionist', d: 'Answer every question.', t: (c) => c.n >= c.total },
  { id: 'country', e: '🌍', n: 'Passport stamped', d: 'Say which country you are.', t: (c) => !!c.mine.country },
  { id: 'home', e: '🏘️', n: 'Hometown hero', d: 'Pick your city or state.', t: (c) => c.hasPlace },
  { id: 'trip', e: '✈️', n: 'Wanderlust', d: 'Pick a place to fly tomorrow.', t: (c) => !!c.mine['dream-trip'] },
  { id: 'food', e: '🍜', n: 'Foodie', d: 'Pick a favorite cuisine and a best-food country.', t: (c) => !!c.mine.cuisine && !!c.mine['best-food'] },
  { id: 'kind', e: '💛', n: 'Good vibes', d: 'Name the country with the nicest people.', t: (c) => !!c.mine['nicest-people'] },
  { id: 'lang', e: '🗣️', n: 'Mother tongue', d: 'Pick your first language.', t: (c) => !!c.mine.language },
  { id: 'dog', e: '🐶', n: 'Dog person', d: 'Pick dogs, twice or once.', t: (c) => is(c, 'cats-or-dogs', 'dogs') || is(c, 'favorite-animal', 'dog') },
  { id: 'cat', e: '🐱', n: 'Cat person', d: 'Pick cats.', t: (c) => is(c, 'cats-or-dogs', 'cats') || is(c, 'favorite-animal', 'cat') },
  { id: 'coffee', e: '☕', n: 'Runs on coffee', d: 'Pick coffee over tea.', t: (c) => is(c, 'coffee-or-tea', 'coffee') },
  { id: 'tea', e: '🍵', n: 'Tea time', d: 'Pick tea over coffee.', t: (c) => is(c, 'coffee-or-tea', 'tea') },
  { id: 'owl', e: '🦉', n: 'Night owl', d: 'Admit you are a night owl.', t: (c) => is(c, 'morning-or-night', 'night-owl') },
  { id: 'bird', e: '🌅', n: 'Early bird', d: 'Admit you are a morning person.', t: (c) => is(c, 'morning-or-night', 'morning-person') },
  { id: 'brave', e: '🍍', n: 'Brave palate', d: 'Pineapple on pizza, always.', t: (c) => is(c, 'pineapple-on-pizza', 'yes-always') },
  { id: 'purist', e: '🍕', n: 'Pizza purist', d: 'Pineapple on pizza, never.', t: (c) => is(c, 'pineapple-on-pizza', 'never') },
  { id: 'mind', e: '🔄', n: 'Changed my mind', d: 'Change one of your answers.', t: (c) => c.me.changed >= 1 },
  { id: 'map', e: '🗺️', n: 'Cartographer', d: 'Open the map.', t: (c) => c.me.mapOpened },
  { id: 'nav', e: '🧭', n: 'Navigator', d: 'Zoom to every continent on the map.', t: (c) => c.me.zoomed.length >= 6 },
  { id: 'share', e: '📣', n: 'Spread the word', d: 'Share a question or your passport.', t: (c) => c.me.shares >= 1 },
  { id: 'cozy', e: '🛋️', n: 'Getting cozy', d: 'Spend 10 minutes here.', t: (c) => c.me.playMs >= 600000 },
  { id: 'local', e: '🏡', n: 'Local', d: 'Spend an hour here in total.', t: (c) => c.me.playMs >= 3600000 },
  { id: 'regular', e: '📅', n: 'Regular', d: 'Visit on 3 different days.', t: (c) => new Set(c.me.days).size >= 3 },
  { id: 'night', e: '🌙', n: 'Midnight visitor', d: 'Show up between midnight and 5am.', t: (c) => c.me.night, secret: true },
  { id: 'egg3', e: '🥚', n: 'Egg hunter', d: 'Find 3 secrets.', t: (c) => c.me.eggs.length >= 3, secret: true },
  { id: 'eggs', e: '🐣', n: 'Easter bunny', d: 'Find every secret.', t: (c) => c.me.eggs.length >= EGGS_TOTAL, secret: true },
];

export const LEVELS = [[0, 'Tourist'], [1, 'Newcomer'], [5, 'Wanderer'], [10, 'Explorer'], [16, 'Globetrotter'], [22, 'Ambassador'], [999, 'Citizen of the World']];
export function level(n, total) {
  let cur = LEVELS[0], next = LEVELS[1];
  for (let i = 0; i < LEVELS.length; i++) {
    const need = Math.min(LEVELS[i][0], total);
    if (n >= need) { cur = LEVELS[i]; next = LEVELS[i + 1] || null; }
  }
  if (n >= total) return { title: 'Citizen of the World', pct: 100 };
  const from = cur[0], to = next ? Math.min(next[0], total) : total;
  return { title: cur[1], pct: Math.min(100, Math.round(((n - from) / Math.max(1, to - from)) * 100)) };
}

// Work out which badges are earned; returns the ones that are new since last time.
export function evaluate(mineMap, total) {
  const c = { mine: mineMap, n: Object.keys(mineMap).filter((k) => !k.startsWith('place-')).length, hasPlace: Object.keys(mineMap).some((k) => k.startsWith('place-')), total, me };
  const have = new Set(me.unlocked);
  const now = ACHIEVEMENTS.filter((a) => a.t(c));
  const fresh = now.filter((a) => !have.has(a.id));
  if (fresh.length) { me.unlocked = now.map((a) => a.id); save(); }
  return { earned: new Set(now.map((a) => a.id)), fresh, n: c.n };
}
