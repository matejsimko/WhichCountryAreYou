// Which Country Are You? — tiny client-side app, no framework, no build step.
import { getMe, mark, startTracking, setUnlockHandler, evaluate, ACHIEVEMENTS, level, fmtTime, streak, EGGS_TOTAL } from './me.js';
import { openShare } from './share.js';
import { initEggs } from './eggs.js';
import { initGuide } from './guide.js';
import { initTour, tourState } from './tour.js';
import { initTracking, pageview } from './track.js';
import { sfx, initSfx } from './sfx.js';
import { openFeedback } from './feedback.js';
import { FAQ } from './faq.js';

const app = document.getElementById('app');
const root = document.documentElement;

// ---------- helpers
const flagEmoji = (c) => String.fromCodePoint(...[...c.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => n.toLocaleString('en-US');
const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
const emit = (name, props) => dispatchEvent(new CustomEvent('wcay:track', { detail: { name, props } }));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ARROW = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BACK = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 10H4m0 0 5-5m-5 5 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function pctText(p, precise) {
  if (p === 0) return '0%';
  if (precise) return p < 0.1 ? '<0.1%' : (p < 10 ? p.toFixed(1) : Math.round(p)) + '%';
  return p < 1 ? '<1%' : Math.round(p) + '%';
}
const setHue = (h) => root.style.setProperty('--h', h);

// flags: countries use their own code, languages and cuisines carry a `flag`
const flagOf = (o) => (o && (o.code ? o.code.toLowerCase() : o.flag)) || null;
const flagImg = (code, cls = '', shape = '1x1') => (code ? `<img class="flag ${cls}" src="/flags/${shape}/${esc(code)}.svg" alt="" width="32" height="32" loading="lazy" decoding="async">` : '');

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

const CONFETTI = ['#EE5A36', '#FFC233', '#41A9F0', '#46B864', '#8C55D9', '#FF6B9D', '#0F8A7A'];
function confetti(x, y) {
  if (reduceMotion()) return;
  for (let i = 0; i < 36; i++) {
    const el = document.createElement('i');
    el.className = 'confetti';
    el.style.background = CONFETTI[i % CONFETTI.length];
    if (i % 3 === 0) el.style.borderRadius = '50%';
    document.body.append(el);
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 240;
    const dx = Math.cos(a) * v;
    const up = Math.sin(a) * v - 140;
    el.animate([
      { transform: `translate(${x}px, ${y}px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x + dx * 0.6}px, ${y + up}px) rotate(${Math.random() * 300}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${x + dx}px, ${y + up + 380}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 700, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => el.remove();
  }
}

async function api(path, body) {
  const res = await fetch('/api' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status });
  return data;
}

// ---------- data cache
let listCache = null;
const detailCache = new Map();
const getList = async (fresh) => (listCache && !fresh ? listCache : (listCache = await api('/questions')));
async function getDetail(id, fresh) {
  if (!fresh && detailCache.has(id)) return detailCache.get(id);
  const d = await api('/questions/' + id);
  detailCache.set(id, d);
  return d;
}

// ---------- cut-paper scene (hero) ----------
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// a hill with a slightly torn edge; returns its outline and a height function so things can stand on it
function makeHill(W, H, baseY, amp, waves, seed) {
  const r = rng(seed);
  const p1 = r() * 6.28, p2 = r() * 6.28;
  const y = (x) => baseY + Math.sin((x / W) * waves * 6.283 + p1) * amp + Math.sin((x / W) * waves * 2.7 * 6.283 + p2) * amp * 0.3;
  let d = '';
  for (let x = -10, i = 0; x <= W + 10; x += 7, i++) d += `${i ? 'L' : 'M'}${x} ${(y(x) + (r() - 0.5) * 3).toFixed(1)}`;
  return { y, d: `${d}L${W + 10} ${H}L-10 ${H}Z` };
}
const layer = (hill, color, shadow = true) => `<g style="${shadow ? 'filter:drop-shadow(0 -3px 5px rgba(10,60,50,.2))' : ''}"><path d="${hill.d}" fill="#FFFCF5" transform="translate(0 -4)"/><path d="${hill.d}" fill="${color}"/></g>`;

const pine = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-3" y="-8" width="6" height="12" fill="#8A5A3C"/><path d="M0-58 17-22H-17Z M0-42 21-8H-21Z" fill="${c}"/></g>`;
const round = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-3" y="-30" width="6" height="34" fill="#8A5A3C"/><circle cy="-42" r="22" fill="${c}"/><circle cx="-9" cy="-48" r="8" fill="#fff" opacity=".18"/></g>`;
const cloud = (x, y, s, cls = '') => `<g transform="translate(${x} ${y}) scale(${s})"><g class="drift ${cls}" style="filter:drop-shadow(0 5px 4px rgba(60,40,10,.14))" fill="#fff"><circle cx="30" cy="40" r="24"/><circle cx="64" cy="26" r="30"/><circle cx="102" cy="40" r="24"/><rect x="30" y="40" width="72" height="24" rx="12"/></g></g>`;
const pole = (x, y, code, delay) => `<g transform="translate(${x} ${y})"><ellipse cy="2" rx="14" ry="3.5" fill="#0A5F55" opacity=".25"/><rect x="-1.5" y="-78" width="3" height="80" rx="1.5" fill="#FFFCF5"/><circle cy="-80" r="4" fill="#FFC233"/><g class="wave" style="animation-delay:${delay}s"><image href="/flags/4x3/${code}.svg" x="1.5" y="-76" width="44" height="33"/></g></g>`;

// sky: sun, clouds, a dotted flight path. Sits behind the title.
function skySVG() {
  const W = 1440, H = 760;
  const rays = Array.from({ length: 16 }, (_, i) => `<path d="M-9-88 0-118 9-88Z" transform="rotate(${i * 22.5})"/>`).join('');
  return `<svg class="sky" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">
    ${cloud(40, 330, 1.2)}${cloud(1180, 480, 0.8, 'b')}${cloud(150, 560, 0.7, 'b')}${cloud(1290, 170, 0.7)}${cloud(330, 190, 0.55)}
    <path d="M-20 620C220 500 420 700 700 560S1120 430 1480 540" fill="none" stroke="#EE5A36" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 14" opacity=".75"/>
    <g transform="translate(1260 520) rotate(-18)" style="filter:drop-shadow(0 4px 3px rgba(60,40,10,.25))"><path d="M0 0 54-18 24 26 18 8Z" fill="#fff"/><path d="M18 8 54-18" stroke="#E6DAC3" stroke-width="2"/></g>
  </svg>`;
}


// Pinny, the paper map pin. Moods are cycled by clicking (see eggs.js); CSS does the rest.
const pinny = (x, y, cls = '', k = 1.45) => `<g transform="translate(${x} ${y}) scale(${k})" class="pinny ${cls}" data-mood="happy" data-i="0" tabindex="0" role="img" aria-label="Pinny the map pin. Click for a new look.">
  <rect class="p-hit" x="-58" y="-132" width="116" height="146" fill="rgba(0,0,0,0)" pointer-events="all"/>
  <ellipse cy="3" rx="30" ry="6" fill="#0A5F55" opacity=".3"/>
  <g class="p-all"><g class="p-bob">
    <g class="p-wings"><path class="wing l" d="M-30-62C-64-100-92-72-74-48C-64-36-42-44-30-52Z" fill="#fff" stroke="#E6DAC3" stroke-width="2.5"/><path class="wing r" d="M30-62C64-100 92-72 74-48C64-36 42-44 30-52Z" fill="#fff" stroke="#E6DAC3" stroke-width="2.5"/></g>
    <rect x="22" y="-86" width="22" height="38" rx="9" fill="#0F8A7A" stroke="#0A5F55" stroke-width="2"/>
    <ellipse cx="-13" cy="-4" rx="11" ry="6.5" fill="#3A2A22"/><ellipse cx="13" cy="-4" rx="11" ry="6.5" fill="#3A2A22"/>
    <g class="p-arm l"><path d="M-33-54Q-48-50-50-38" fill="none" stroke="#C6431F" stroke-width="7" stroke-linecap="round"/></g>
    <path transform="translate(-40.8 -105) scale(3.4)" d="M12 1C6.2 1 1.5 5.7 1.5 11.5 1.5 19 12 28.5 12 28.5S22.5 19 22.5 11.5C22.5 5.7 17.8 1 12 1Z" fill="#EE5A36" style="filter:drop-shadow(0 3px 2px rgba(80,20,0,.3))"/>
    <g class="p-arm r"><path d="M33-54Q50-58 52-74" fill="none" stroke="#C6431F" stroke-width="7" stroke-linecap="round"/></g>
    <circle cy="-66" r="19" fill="#FFFCF5"/>
    <circle cx="-12" cy="-58" r="3.6" fill="#FF8FA8" opacity=".6"/><circle cx="12" cy="-58" r="3.6" fill="#FF8FA8" opacity=".6"/>
    <g class="p-eyes"><g class="p-eye"><g class="p-look"><circle cx="-7" cy="-70" r="4.4" fill="#243230"/><circle cx="-8.4" cy="-71.4" r="1.5" fill="#fff"/></g></g><g class="p-eye"><g class="p-look"><circle cx="7" cy="-70" r="4.4" fill="#243230"/><circle cx="5.6" cy="-71.4" r="1.5" fill="#fff"/></g></g></g>
    <g class="p-closed"><path d="M-12-70q5 4 10 0M2-70q5 4 10 0" fill="none" stroke="#243230" stroke-width="2.5" stroke-linecap="round"/></g>
    <path class="m-smile" d="M-7-59Q0-52 7-59" fill="none" stroke="#243230" stroke-width="2.8" stroke-linecap="round"/>
    <ellipse class="m-open" cy="-56" rx="5" ry="6" fill="#243230"/>
    <g class="p-cool"><rect x="-16" y="-77" width="14" height="10" rx="4" fill="#111"/><rect x="2" y="-77" width="14" height="10" rx="4" fill="#111"/><path d="M-2-73h4" stroke="#111" stroke-width="2.5"/><path d="M-12-74l4-1" stroke="#fff" stroke-width="1.6" opacity=".6"/></g>
    <g class="p-party"><path d="M-13-82 0-120 13-82Z" fill="#FFC233" stroke="#C98A00" stroke-width="1.5"/><path d="M-9-92 8-96M-6-104 5-108" stroke="#EE5A36" stroke-width="3.5" stroke-linecap="round"/><circle cy="-121" r="5" fill="#8C55D9"/></g>
    <g class="p-zzz"><text x="22" y="-100" font-family="Fredoka, sans-serif" font-weight="700" font-size="16" fill="#243230">z</text><text x="34" y="-114" font-family="Fredoka, sans-serif" font-weight="700" font-size="20" fill="#243230">Z</text></g>
  </g></g>
</g>`;

// layered torn-paper hills with trees, flagpoles and Pinny
function hillsSVG() {
  const W = 1440, H = 330;
  const back = makeHill(W, H, 96, 22, 1.3, 11);
  const mid = makeHill(W, H, 152, 26, 1.8, 23);
  const front = makeHill(W, H, 210, 22, 2.4, 37);
  const fore = makeHill(W, H, 282, 12, 3.1, 51);
  const midTrees = [90, 250, 640, 760, 1090, 1330].map((x, i) => pine(x, mid.y(x) + 6, 0.85 + (i % 3) * 0.16, i % 2 ? '#0F8A7A' : '#0B5F55')).join('');
  const frontTrees = [60, 330, 560, 880, 1010, 1240, 1390].map((x, i) => round(x, front.y(x) + 6, 0.75 + (i % 3) * 0.2, ['#FFC233', '#EE5A36', '#FF6B9D', '#FFC233', '#8C55D9', '#EE5A36', '#FFC233'][i])).join('');
  const px = 420;
  const rays = Array.from({ length: 16 }, (_, i) => `<path d="M-9-88 0-120 9-88Z" transform="rotate(${i * 22.5})"/>`).join('');
  return `<svg class="hills" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <g transform="translate(1180 70)" class="sun"><g class="spin" fill="#FFC233" opacity=".55">${rays}</g><circle r="66" fill="#FFC233" style="filter:drop-shadow(0 6px 6px rgba(120,70,0,.25))"/><circle r="50" fill="#FFD966"/><g class="shades"><rect x="-40" y="-14" width="32" height="24" rx="9" fill="#243230"/><rect x="8" y="-14" width="32" height="24" rx="9" fill="#243230"/><path d="M-8-6H8" stroke="#243230" stroke-width="4"/></g></g>
    ${layer(back, '#C4E9DC', false)}
    ${layer(mid, '#7AD2B4')}${midTrees}
    ${pole(1000, mid.y(1000) + 4, 'br', 0)}${pole(210, mid.y(210) + 4, 'jp', 0.7)}
    ${layer(front, '#1BA88F')}${frontTrees}
    ${pole(690, front.y(690) + 4, 'sk', 0.3)}${pole(1190, front.y(1190) + 4, 'ke', 1.1)}
    ${pinny(px, front.y(px) + 8)}
    ${layer(fore, '#FBF3E4')}
  </svg>`;
}

// flags strung across the top
const BUNTING = ['sk', 'br', 'jp', 'it', 'in', 'ke', 'ca', 'au', 'fr', 'ng', 'ar', 'de', 'gb', 'us', 'kr', 'za', 'pl', 'cz', 'gr', 'pt', 'tr', 'th', 'vn', 'eg', 'ma', 'pe', 'co', 'cl', 'no', 'se', 'fi', 'nl', 'hu', 'ie', 'ua', 'ph'];
function buildBunting(el) {
  const W = Math.max(320, el.clientWidth || window.innerWidth);
  const n = Math.max(6, Math.min(16, Math.round(W / 92)));
  const pw = Math.min(72, Math.max(46, (W / n) * 0.64));
  const sag = Math.min(44, W * 0.045);
  const y0 = 6;
  const H = Math.round(y0 + sag + pw * 1.25 + 16);
  const pick = [...BUNTING].sort(() => Math.random() - 0.5).slice(0, n);
  let html = `<svg class="bunting-string" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="M0 ${y0}Q${W / 2} ${y0 + 2 * sag} ${W} ${y0}" fill="none" stroke="#243230" stroke-opacity=".55" stroke-width="2"/></svg>`;
  pick.forEach((code, i) => {
    const t = (i + 0.5) / n;
    const x = t * W;
    const y = y0 + 4 * sag * t * (1 - t);
    const ang = (Math.atan((4 * sag * (1 - 2 * t)) / W) * 180) / Math.PI;
    html += `<div class="pennant" style="left:${(x - pw / 2).toFixed(1)}px;top:${(y - 2).toFixed(1)}px;--pw:${pw.toFixed(1)}px;--a:${ang.toFixed(1)}deg;--d:${(-i * 0.37).toFixed(2)}s"><img src="/flags/4x3/${code}.svg" alt="" width="${pw}" height="${pw * 1.25}"></div>`;
  });
  el.style.height = H + 'px';
  el.innerHTML = html;
}
let bunt;
window.addEventListener('resize', () => {
  clearTimeout(bunt);
  bunt = setTimeout(() => { const el = document.getElementById('bunting'); if (el) buildBunting(el); }, 200);
});

// footer: torn edge + a river of flags
function initFooter() {
  document.getElementById('foot-feedback')?.addEventListener('click', () => openFeedback());
  const r = rng(99);
  let d = '';
  for (let x = -10, i = 0; x <= 1450; x += 8, i++) d += `${i ? 'L' : 'M'}${x} ${(26 + Math.sin(x / 90) * 8 + Math.sin(x / 31) * 3 + (r() - 0.5) * 4).toFixed(1)}`;
  d += 'L1450 60L-10 60Z';
  document.getElementById('foot-edge').innerHTML = `<path d="${d}" fill="#FFFCF5" transform="translate(0 -4)"/><path d="${d}" fill="#0A5F55"/>`;
  const set = BUNTING.concat(['mx', 'ru', 'tw', 'ch', 'at', 'be', 'dk', 'ir', 'id', 'pk', 'ro', 'hr', 'rs'].filter((c) => !['mx'].includes(c)));
  const strip = set.map((c) => `<img class="flag" src="/flags/1x1/${c}.svg" alt="" width="44" height="44" loading="lazy">`).join('');
  document.getElementById('marquee').innerHTML = strip + strip;
}

// ---------- rewards: what you get after you vote (see questions.js)
function rewardHTML(r) {
  const parts = [];
  if (r.facts?.length) parts.push(`<p data-fact>${esc(r.facts[0])}</p>`);
  if (r.video) parts.push(`<iframe src="https://www.youtube-nocookie.com/embed/${esc(r.video)}" title="${esc(r.title || 'Video')}" loading="lazy" allowfullscreen></iframe>`);
  if (r.links?.length) parts.push(`<p>${r.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' · ')}</p>`);
  return `<div class="reward-top"><span class="eyebrow">For you</span>${r.facts?.length > 1 ? '<button class="link" data-more type="button">Another one</button>' : ''}</div>${parts.join('')}`;
}
function bindReward(el, r) {
  if (!r.facts || r.facts.length < 2) return;
  let i = 0;
  el.querySelector('[data-more]')?.addEventListener('click', () => {
    i = (i + 1) % r.facts.length;
    el.querySelector('[data-fact]').textContent = r.facts[i];
  });
}

// ---------- the vote block: a question's options that turn into its results
const SORTS = {
  votes: 'Most votes', fewest: 'Fewest', az: 'A to Z', za: 'Z to A',
};
function mountBlock(el, d, ctx = {}) {
  const isDuel = d.options.length === 2;
  const isCountries = d.kind === 'countries';
  const groups = [...new Set(d.options.map((o) => o.group).filter(Boolean))];
  const rolling = d.options.length > 14 || groups.length > 1; // long lists live in a scrolling roller with filters
  const CHUNK = 30;
  let mode = d.mine ? 'results' : 'vote';
  let filter = '';
  let group = '';
  let sort = '';
  let shown = CHUNK;
  let busy = false;
  let reward = null;

  el.classList.add('block');
  el.innerHTML = `${rolling ? `<div class="block-tools"><input class="block-search" id="search-${esc(d.id)}" type="search" placeholder="Search ${isCountries ? 'countries' : 'options'}" autocomplete="off" aria-label="Search"><div class="chips sortbar" role="group" aria-label="Sort"></div>${groups.length > 1 ? `<div class="chips groupbar" role="group" aria-label="Show"></div>` : ''}</div>` : ''}<div class="block-reward"></div><div class="block-body"></div><div class="block-foot"></div>`;
  const body = el.querySelector('.block-body');
  const foot = el.querySelector('.block-foot');
  const rewardEl = el.querySelector('.block-reward');
  const sortbar = el.querySelector('.sortbar');
  const groupbar = el.querySelector('.groupbar');

  const precise = isCountries;
  let view = []; // the rows the roller can show, in order
  let ranks = new Map();
  let total = 0, max = 0, showRes = false;

  const isLead = (o) => showRes && max > 0 && o.c === max;
  const mine = (o) => o.id === d.mine;
  function rowHTML(o) {
    const p = total ? (o.c / total) * 100 : 0;
    const w = showRes && max ? (o.c / max) * 100 : 0;
    const fl = flagOf(o);
    return `<li><button type="button" class="opt${isLead(o) ? ' is-lead' : ''}${mine(o) ? ' is-mine' : ''}" data-opt="${esc(o.id)}" style="--w:${w}" aria-pressed="${mine(o)}">
      <i class="opt-fill"></i>
      ${showRes && sortedByVotes() ? `<span class="opt-rank">${ranks.get(o.id)}</span>` : ''}
      ${fl ? flagImg(fl) : ''}${o.swatch ? `<span class="opt-swatch" style="background:${esc(o.swatch)}"></span>` : ''}${o.emoji ? `<span class="opt-emoji" aria-hidden="true">${o.emoji}</span>` : ''}
      <span class="opt-label">${esc(o.label)}${o.sub ? `<small class="opt-sub">${esc(o.sub)}</small>` : ''}${mine(o) ? '<span class="tag">you</span>' : ''}</span>
      ${showRes ? `<span class="opt-meta"><b>${pctText(p, precise)}</b><small>${fmt(o.c)}</small></span>` : ''}
    </button></li>`;
  }
  const curSort = () => sort || (showRes && d.options.length > 8 ? 'votes' : d.options.length > 8 ? 'az' : '');
  const sortedByVotes = () => curSort() === 'votes' || curSort() === 'fewest';

  function draw() {
    showRes = mode === 'results';
    total = Object.values(d.counts).reduce((a, b) => a + b, 0);
    d.total = total;
    let opts = d.options.map((o) => ({ ...o, c: d.counts[o.id] || 0 }));
    const byVotes = [...opts].sort((a, b) => b.c - a.c || a.label.localeCompare(b.label));
    ranks = new Map(byVotes.map((o, i) => [o.id, i + 1]));
    max = byVotes[0]?.c || 0;

    // sort chips: counts are hidden until you vote, so only alphabetical sorts exist before that
    if (rolling) {
      const avail = showRes ? ['votes', 'fewest', 'az', 'za'] : ['az', 'za'];
      if (!avail.includes(sort)) sort = '';
      const cur = curSort();
      sortbar.innerHTML = avail.map((k) => `<button class="chip" type="button" data-sort="${k}" aria-pressed="${k === cur}">${SORTS[k]}</button>`).join('');
    }
    if (groupbar) groupbar.innerHTML = ['', ...groups].map((g) => `<button class="chip" type="button" data-group="${esc(g)}" aria-pressed="${g === group}">${g || 'All'}</button>`).join('');
    if (group) opts = opts.filter((o) => o.group === group);
    const s = curSort();
    if (s === 'votes') opts = byVotes.filter((o) => !group || o.group === group);
    else if (s === 'fewest') opts = [...byVotes].reverse().filter((o) => !group || o.group === group);
    else if (s === 'za') opts.sort((a, b) => b.label.localeCompare(a.label));
    else if (s === 'az') opts.sort((a, b) => a.label.localeCompare(b.label));

    let podium = '';
    if (filter) {
      const f = norm(filter);
      opts = opts.filter((o) => norm(o.label).includes(f) || (o.sub && norm(o.sub).includes(f)) || (o.alt && norm(o.alt).includes(f)) || (o.code && norm(o.code) === f));
    } else if (showRes && isCountries && max > 0) {
      const top = byVotes.slice(0, 3).filter((o) => o.c > 0);
      if (top.length === 3) {
        podium = `<div class="podium">${top.map((o, i) => `<div class="pod${o.id === d.mine ? ' is-mine' : ''}">${flagImg(flagOf(o))}<span class="pod-medal">${i + 1}</span><span class="pod-name">${esc(o.label)}</span><span class="pod-pct">${pctText((o.c / total) * 100, true)}</span><span class="pod-n">${fmt(o.c)}</span></div>`).join('')}</div>`;
        if (s === 'votes') opts = opts.slice(3);
      }
    }
    view = opts;
    shown = CHUNK;

    el.className = `block ${ctx.className || ''} is-${showRes ? 'results' : 'vote'}`;

    if (isDuel) {
      body.innerHTML = `<div class="duel" role="group" aria-label="${esc(d.prompt)}">${opts.map((o, i) => {
        const p = total ? (o.c / total) * 100 : 50;
        const g = showRes ? 28 + p * 0.44 : 50;
        return `<button type="button" class="duel-opt hued${isLead(o) ? ' is-lead' : ''}${mine(o) ? ' is-mine' : ''}" data-opt="${esc(o.id)}" style="--g:${g};--h:${(d.hue + i * 80) % 360}" aria-pressed="${mine(o)}">
          ${o.emoji ? `<span class="duel-emoji" aria-hidden="true">${o.emoji}</span>` : ''}
          <span class="duel-label">${esc(o.label)}</span>
          ${showRes ? `<span class="duel-nums"><span class="duel-pct">${pctText(p)}</span><span class="duel-n">${fmt(o.c)}</span></span>` : ''}
          ${mine(o) ? '<span class="tag">you</span>' : ''}
        </button>`;
      }).join('')}</div>`;
    } else if (!opts.length && !podium) {
      body.innerHTML = '<p class="empty">Nothing matches that.</p>';
    } else if (rolling) {
      body.innerHTML = `${podium}<div class="roller" tabindex="0" role="region" aria-label="${esc(d.prompt)} options"><ul class="opts">${opts.slice(0, CHUNK).map(rowHTML).join('')}</ul></div><p class="roller-meta"></p>`;
      const roller = body.querySelector('.roller');
      const list = roller.querySelector('.opts');
      const meta = body.querySelector('.roller-meta');
      const updateMeta = () => { meta.textContent = opts.length > CHUNK ? `Showing ${Math.min(shown, opts.length)} of ${opts.length}. Scroll for more.` : `${opts.length} ${opts.length === 1 ? 'result' : 'results'}`; };
      updateMeta();
      roller.addEventListener('scroll', () => {
        if (shown < opts.length && roller.scrollTop + roller.clientHeight > roller.scrollHeight - 240) {
          list.insertAdjacentHTML('beforeend', opts.slice(shown, shown + CHUNK).map(rowHTML).join(''));
          shown += CHUNK;
          updateMeta();
        }
      }, { passive: true });
    } else {
      body.innerHTML = `${podium}<ul class="opts">${opts.map(rowHTML).join('')}</ul>`;
    }

    // animate bars from their resting state
    el.classList.remove('is-in');
    raf2(() => el.classList.add('is-in'));

    let note = '', btn = '';
    if (showRes) {
      note = `${fmt(total)} ${total === 1 ? 'answer' : 'answers'}${isCountries ? ' · tap a country to see what its people think' : ''}`;
      btn = d.mine ? '<button class="link" type="button" data-act="change">Change my answer</button>' : '<button class="link" type="button" data-act="vote">Add my answer</button>';
    } else {
      btn = d.mine ? '<button class="link" type="button" data-act="results">Back to results</button>' : '<button class="link" type="button" data-act="results">Just show me the results</button>';
      note = d.mine ? 'Pick another to change your answer.' : '';
    }
    foot.innerHTML = `${btn}${note ? `<span class="block-note">${note}</span>` : ''}`;

    if (reward && showRes) {
      rewardEl.innerHTML = `<div class="reward hued" style="--h:${d.hue}">${rewardHTML(reward)}</div>`;
      bindReward(rewardEl, reward);
    } else rewardEl.innerHTML = '';
  }

  async function choose(optionId, ev) {
    if (busy) return;
    busy = true;
    el.classList.add('is-busy');
    const changed = Boolean(d.mine) && d.mine !== optionId;
    try {
      const r = await api('/vote', { questionId: d.id, optionId });
      Object.assign(d, r);
      detailCache.set(d.id, d);
      if (listCache) { const s = listCache.questions.find((x) => x.id === d.id); if (s) Object.assign(s, { mine: d.mine, total: d.total, leader: d.leader }); else if (d.id.startsWith('place-')) (listCache.placeMine ||= {})[d.id] = d.mine; }
      mode = 'results';
      sort = '';
      reward = d.options.find((o) => o.id === optionId)?.reward || null;
      draw();
      sfx.vote();
      dispatchEvent(new CustomEvent('wcay:vote', { detail: voteDetail(d, optionId) }));
      if (ev) confetti(ev.clientX, ev.clientY);
      if (changed) mark('changed');
      ctx.onVoted?.(d);
      afterVote();
    } catch (err) {
      emit('vote_error', { s: err.status || 0 });
      toast(err.message);
    } finally {
      busy = false;
      el.classList.remove('is-busy');
    }
  }

  el.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-opt]');
    if (opt && mode === 'vote') return choose(opt.dataset.opt, e);
    if (opt && mode === 'results' && isCountries) return go('/c/' + opt.dataset.opt.toLowerCase());
    const gr = e.target.closest('[data-group]');
    if (gr) { group = gr.dataset.group; emit('filter_group', { g: group || 'all' }); return draw(); }
    const so = e.target.closest('[data-sort]');
    if (so) { sort = so.dataset.sort; emit('sort', { k: sort }); return draw(); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'results') { mode = 'results'; draw(); }
    if (act === 'change' || act === 'vote') { mode = 'vote'; reward = null; draw(); }
  });
  let searched = false;
  el.querySelector('.block-search')?.addEventListener('input', (e) => { filter = e.target.value.trim(); if (!searched && filter) { searched = true; emit('search', { q: d.id }); } draw(); });

  draw();
}

// ---------- hero: type your country, vote, land on the results
function mountFinder(el, d) {
  if (d.mine) {
    const mine = d.options.find((o) => o.id === d.mine);
    el.innerHTML = `<div class="finder-done">${flagImg(flagOf(mine))}<span class="display">You're ${esc(mine.label)}.</span><a class="btn" href="/q/country" data-link>See everyone else ${ARROW}</a></div>`;
    return;
  }
  el.innerHTML = `<label class="finder-label" for="finder">Start here. Where are you from?</label><div class="finder-box"><input id="finder" type="text" role="combobox" aria-expanded="false" aria-controls="finder-list" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type your country"><span class="finder-go">${ARROW}</span><ul class="finder-list" id="finder-list" role="listbox" hidden></ul></div>`;
  const input = el.querySelector('input');
  const list = el.querySelector('.finder-list');
  let matches = [];
  let idx = -1;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); idx = -1; };
  function render() {
    const q = norm(input.value.trim());
    if (!q) return close();
    const score = (o) => {
      const n = norm(o.label);
      if (n.startsWith(q)) return 0;
      if (n.split(/[\s-]/).some((w) => w.startsWith(q))) return 1;
      if (o.alt && norm(o.alt).includes(q)) return 2;
      if (n.includes(q)) return 3;
      return 9;
    };
    matches = d.options.map((o) => [score(o), o]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label)).slice(0, 6).map(([, o]) => o);
    if (!matches.length) return close();
    idx = 0;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    list.innerHTML = matches.map((o, i) => `<li role="presentation"><button type="button" role="option" aria-selected="${i === idx}" data-id="${esc(o.id)}">${flagImg(flagOf(o), 'sm')}${esc(o.label)}</button></li>`).join('');
  }
  const paint = () => list.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', i === idx));

  async function pick(id) {
    close();
    input.disabled = true;
    try {
      const r = await api('/vote', { questionId: 'country', optionId: id });
      detailCache.set('country', r);
      listCache = null;
      sfx.vote();
      dispatchEvent(new CustomEvent('wcay:vote', { detail: voteDetail(r, id) }));
      const rect = input.getBoundingClientRect();
      confetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      go('/q/country');
    } catch (err) {
      input.disabled = false;
      toast(err.message);
    }
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(); else { idx = (idx + 1) % matches.length; paint(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + matches.length) % matches.length; paint(); }
    else if (e.key === 'Enter' && !list.hidden && matches[idx]) { e.preventDefault(); pick(matches[idx].id); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-id]'); if (b) { e.preventDefault(); pick(b.dataset.id); } });
  input.addEventListener('blur', () => setTimeout(close, 120));
}

// ---------- views
const catLabel = (list, id) => list.categories.find((c) => c.id === id)?.label || '';

async function home() {
  const list = await getList(true);
  const country = await getDetail('country', true);
  const s = list.stats;
  const feat = await Promise.all(list.featured.map((id) => getDetail(id, true)));
  setHue(178);

  const top = country.options.map((o) => ({ ...o, c: country.counts[o.id] || 0 })).filter((o) => o.c > 0).sort((a, b) => b.c - a.c).slice(0, 8);

  app.innerHTML = `<div class="view">
    <section class="hero">
      ${skySVG()}
      <div class="bunting" id="bunting"></div>
      <div class="wrap hero-copy" data-guide="hero" data-guide-mood="wow">
        <h1 class="display title" aria-label="Which country are you?"><span class="w w1">Which</span> <span class="w w2">country</span><br><span class="w w3">are</span> <span class="w w4">you?</span></h1>
        <p class="hero-sub">Say where you're from. Vote on everything else. Watch the whole world answer.</p>
      </div>
      <div class="wrap finder-wrap"><div class="finder paper" id="finder-wrap"></div></div>
      ${hillsSVG()}
    </section>
    <div class="wrap">
      ${top.length ? `<section class="section" aria-labelledby="world" data-guide="leaders"><div class="section-head"><h2 id="world">Who's here so far</h2><a class="link" href="/q/country" data-link>See all countries</a></div><div class="sticker-row">${top.map((o, i) => `<a class="sticker" style="--i:${i}" href="/q/country" data-link>${flagImg(flagOf(o))}<span>${esc(o.label)}</span><small class="num">${pctText((o.c / country.total) * 100, true)}</small></a>`).join('')}</div></section>` : ''}
      <section class="section" aria-labelledby="mapt" data-guide="map" data-guide-mood="wow">
        <div class="section-head"><h2 id="mapt">Watch the world fill in</h2><a class="link" href="/map" data-link>Open the full map</a></div>
        <div id="map-slot" class="map-slot"></div>
      </section>
      <section class="section" aria-labelledby="quick" data-guide="quick" data-guide-mood="cool">
        <div class="section-head"><h2 id="quick">While you're here</h2><a class="link" href="/explore" data-link>All ${s.questions} questions</a></div>
        <div class="grid">${feat.map((d) => `<article class="card paper hued" style="--h:${d.hue}"><span class="card-tag">${esc(catLabel(list, d.category))}</span><h3 class="card-q"><a href="/q/${esc(d.id)}" data-link>${esc(d.prompt)}</a></h3><div data-block="${esc(d.id)}"></div></article>`).join('')}</div>
      </section>
      <section class="section" style="text-align:center" data-guide="more" data-guide-mood="party"><a class="btn" href="/explore" data-link>See every question ${ARROW}</a></section>
    </div></div>`;

  buildBunting(app.querySelector('#bunting'));
  mountFinder(app.querySelector('#finder-wrap'), country);
  app.querySelector('#finder-wrap').insertAdjacentHTML('beforeend', `<p class="hero-meta">${s.answers ? `<b class="num">${fmt(s.answers)}</b> answers · <b class="num">${s.countries}</b> countries so far · <b>${s.questions}</b> questions` : 'No answers yet. Be the first.'}</p>`);
  feat.forEach((d) => mountBlock(app.querySelector(`[data-block="${d.id}"]`), d));
  lazyMap(app.querySelector('#map-slot'), {});
}

// the interactive map is loaded only when someone gets near it
const mapCtx = () => ({ esc, fmt, pctText, flagImg, go, getList, getDetail, track: mark, toast, vote: async (questionId, optionId) => { const r = await api('/vote', { questionId, optionId }); detailCache.set(questionId, r); if (listCache) (listCache.placeMine ||= {})[questionId] = r.mine; sfx.vote(); dispatchEvent(new CustomEvent('wcay:vote', { detail: voteDetail(r, optionId) })); checkAchievements(); return r; }, celebrate: confetti });
function lazyMap(slot, opts) {
  const start = async () => {
    try { const { mountMap } = await import('/map.js'); await mountMap(slot, mapCtx(), opts); mark('map'); }
    catch (err) { console.error(err); slot.innerHTML = '<p class="empty">The map could not load. Try reloading.</p>'; }
  };
  if (!('IntersectionObserver' in window)) return start();
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '500px 0px' });
  io.observe(slot);
}

async function mapPage() {
  setHue(178);
  app.innerHTML = `<div class="view wrap map-page"><div class="page-head" data-guide="mappage" data-guide-mood="wow"><p class="eyebrow">The map</p><h1 class="display">The world, answered.</h1><p>Zoom in on a continent or tap a country to see how it voted.</p></div><div id="map-slot" class="map-slot"></div></div>`;
  const q = new URLSearchParams(location.search).get('q');
  await new Promise((r) => requestAnimationFrame(r));
  lazyMap(app.querySelector('#map-slot'), { wheel: true, question: q });
}

async function explore() {
  const list = await getList(true);
  setHue(178);
  let active = 'all';
  const draw = () => {
    const cats = list.categories.filter((c) => active === 'all' || c.id === active);
    app.querySelector('#cats').innerHTML = cats.map((c) => {
      const qs = list.questions.filter((q) => q.category === c.id);
      return `<section class="cat"><h2 class="eyebrow">${esc(c.label)}</h2><ul class="rows">${qs.map((q) => {
        const sub = q.total ? `${fmt(q.total)} answers${q.leader ? ` · ${esc(q.leader.label)} leads with ${pctText(q.leader.pct, q.kind === 'countries')}` : ''}` : 'No answers yet';
        return `<li><a class="row hued" style="--h:${q.hue}" href="/q/${esc(q.id)}" data-link><span class="row-main">${q.leader?.flag ? flagImg(q.leader.flag) : '<i class="row-dot"></i>'}<span class="row-prompt">${esc(q.prompt)}${q.mine ? ' <span class="tag">answered</span>' : ''}<span class="row-sub">${sub}</span></span></span><span class="row-bar" aria-hidden="true"><i style="--w:${q.leader ? q.leader.pct : 0}"></i></span><span class="row-go">${ARROW}</span></a></li>`;
      }).join('')}</ul></section>`;
    }).join('');
  };
  app.innerHTML = `<div class="view wrap"><div class="page-head" data-guide="explore" data-guide-mood="happy"><p class="eyebrow">${list.stats.questions} questions</p><h1 class="display">Ask the world anything.</h1><p>Every question, with the answers so far. Pick one.</p></div>
    <div class="chips explore-chips" id="chips"><button class="chip" type="button" data-cat="all" aria-pressed="true">Everything</button>${list.categories.map((c) => `<button class="chip" type="button" data-cat="${c.id}" aria-pressed="false">${esc(c.label)}</button>`).join('')}</div>
    <div id="cats"></div></div>`;
  app.querySelector('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    active = b.dataset.cat;
    app.querySelectorAll('#chips .chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
    draw();
  });
  draw();
}

async function questionPage(id) {
  const [d, list] = await Promise.all([getDetail(id, true), getList()]);
  setHue(d.hue);
  pageQ = d;
  document.title = `${d.prompt} · Which Country Are You?`;
  app.innerHTML = `<div class="view wrap q-page">
    <a class="back" href="${d.country ? '/q/country' : '/explore'}" data-link>${BACK} ${d.country ? 'Back to countries' : 'All questions'}</a>
    <div class="q-head hued" style="--h:${d.hue}" data-guide="qhead">
      <p class="eyebrow">${esc(catLabel(list, d.category))}</p>
      <h1 class="display q-title">${esc(d.prompt)}</h1>
      <div class="q-sum" id="sum"></div>
    </div>
    <div class="q-body" id="block" data-guide="results" data-guide-mood="cool"></div>
    <div class="q-after" id="after" data-guide="share" data-guide-mood="party"></div>
  </div>`;

  const sum = app.querySelector('#sum');
  const after = app.querySelector('#after');
  const drawSum = (dd) => {
    if (!dd.mine) { sum.textContent = dd.total ? `${fmt(dd.total)} people have answered.` : 'Nobody has answered yet. Be the first.'; return; }
    const mineOpt = dd.options.find((o) => o.id === dd.mine);
    const c = dd.counts[dd.mine] || 0;
    const p = dd.total ? (c / dd.total) * 100 : 0;
    const line = c <= 1 ? `You're the first to say <strong>${esc(mineOpt.label)}</strong>.` : `You and ${fmt(c - 1)} ${c - 1 === 1 ? 'other' : 'others'} said <strong>${esc(mineOpt.label)}</strong>, ${pctText(p, dd.kind === 'countries')} of ${fmt(dd.total)}.`;
    const fl = flagOf(mineOpt);
    const cc = dd.id === 'country' ? dd.mine.toLowerCase() : null;
    const placeLink = cc && listCache?.placeCountries?.includes(cc) ? `<a class="btn place-cta" href="/q/place-${cc}" data-link>${listCache.placeMine?.['place-' + cc] ? 'Change your city' : `Now pick your city or state`} ${ARROW}</a>` : '';
    sum.innerHTML = fl ? `<div class="you-card">${flagImg(fl)}<div><p class="eyebrow">You picked</p><div class="display">${esc(mineOpt.label)}</div></div></div><p style="margin:12px 0 0">${line}</p>${placeLink}` : line;
  };
  const drawAfter = (dd) => {
    const next = list.questions.find((q) => q.id !== dd.id && !q.mine);
    after.innerHTML = `${dd.mine && next ? `<a class="btn" href="/q/${esc(next.id)}" data-link>Next: ${esc(next.prompt)} ${ARROW}</a>` : ''}<button class="btn alt" type="button" id="share">Share this question</button>`;
    after.querySelector('#share').addEventListener('click', () => {
      const mo = dd.mineOpt;
      const text = dd.id === 'country' && mo ? `I'm from ${mo.label}${mo.flag ? ' ' + flagEmoji(mo.flag) : ''}. Which country are you?` : mo ? `${dd.prompt} I said ${mo.emoji ? mo.emoji + ' ' : ''}${mo.label}. What would you say?` : `${dd.prompt} Vote and see how the world answers.`;
      const cardData = mo ? { prompt: dd.prompt, answer: mo.label, emoji: mo.emoji, flag: mo.flag, kicker: dd.id === 'country' ? "I'm from" : 'I picked', pct: pctText(((dd.counts[dd.mine] || 0) / Math.max(1, dd.total)) * 100, dd.kind === 'countries'), total: dd.total } : null;
      openShare({ title: dd.prompt, text, url: location.origin + '/q/' + dd.id, toast, card: cardData });
    });
  };

  const onVoted = (dd) => {
    drawSum(dd);
    if (listCache) { const s = listCache.questions.find((q) => q.id === dd.id); if (s) s.mine = dd.mine; }
    drawAfter(dd);
  };
  drawSum(d);
  drawAfter(d);
  mountBlock(app.querySelector('#block'), d, { onVoted });
}

function about() {
  setHue(178);
  app.innerHTML = `<div class="view wrap"><div class="page-head" data-guide="about" data-guide-mood="happy"><p class="eyebrow">About</p><h1 class="display">A small experiment with the whole world.</h1></div>
  <div class="prose">
    <p>Which Country Are You started as a question: <em>how many different people can we get to answer the same simple questions?</em> Where are you from, cats or dogs, coffee or tea. No accounts, no sign-up, nothing to win. Just a place where anyone can drop in, vote, and see the internet answer back.</p>
    <h2>How it began</h2>
    <p>The domain was too good to leave alone. The idea was to start with one tiny question, which country are you, and see what happens when people send it to friends. If it spreads the way people really live, the votes should line up with where the world's population actually is. Lots of India, lots of the US, Brazil, Nigeria, Indonesia. Then the surprises: the small countries that punch above their weight because one person told the whole group chat.</p>
    <h2>What it could turn into</h2>
    <p>Right now you pick a country and answer a few questions. Next: pick your city or state, and filter everything by where people are from. How do Slovaks vote on coffee or tea compared with people from Brazil? What does Texas think about pineapple on pizza? The more people who join, the better those answers get.</p>
    <h2>How voting works</h2>
    <p>Each device gets one vote per question. You can change your answer any time. To keep the numbers from being flooded, a single network can only add a handful of new devices per question each day.</p>
    <h2>What we keep</h2>
    <p>A random ID in a cookie on your device, and your answers. We also keep a one-way hash of your network address that changes every day, so it can't be traced back to you or used to follow you around. No names, no emails, no accounts. Your passport (badges, time here) lives in your browser only.</p>
    <h2>Counting visits</h2>
    <p>To learn what works, we count visits with our own simple analytics. It uses no cookies and stores no IP address. A visitor is a one-way hash that changes every day, so nobody can be followed from one day to the next. We see which pages were opened, roughly where from (country and city, as reported by our host), the kind of device and browser, where the link came from, and what people did on the site, such as voting or sharing. We also measure how fast pages load and whether anything breaks, and which share button a visit came through (shared links end in ?s=name). If your browser sends "Do Not Track", we don't count you at all.</p>
    <h2>Take it with a grain of salt</h2>
    <p>Anyone can vote and nobody is verified, so this is a game and not a survey. It's still fun to watch the bars move.</p>
    <h2>Flags and credits</h2>
    <p>Flag artwork comes from the open-source flag-icons project (MIT). Map outlines come from Natural Earth (public domain). Social icons come from Simple Icons (CC0). Where a language or cuisine gets a flag, it's just the best-known country for it, not a claim about who owns it.</p>
    <h2>Frequently asked questions</h2>
    ${FAQ.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
    <p>Pinny, the pin on the hill, says hi. Try clicking things. Some of them do something.</p>
  </div></div>`;
}

function notFound() {
  setHue(178);
  emit('not_found');
  app.innerHTML = `<div class="view wrap"><div class="page-head"><p class="eyebrow">404</p><h1 class="display">That page isn't on the map.</h1><p><a class="btn" href="/" data-link>Back home</a></p></div></div>`;
}




// ---------- a country's page: what do its people think, compared with the world?
async function countryPage(code) {
  setHue(172);
  const [d, list] = await Promise.all([api('/country/' + code), getList()]);
  const flag = code.toLowerCase();
  const name = d.label.replace(/^the /, '');
  document.title = `What people from ${name} think · Which Country Are You?`;
  const catName = (id) => catLabel(list, id);
  const pct = (v) => (v < 1 ? '<1' : Math.round(v)) + '%';

  if (d.hidden) {
    app.innerHTML = `<div class="view wrap cpage"><a class="back" href="/q/country" data-link>${BACK} Back to countries</a>
      <div class="cp-hero" data-guide="cpage"><div class="cp-flag">${flagImg(flag)}</div><div><p class="eyebrow">People from</p><h1 class="display">${esc(d.label)}</h1></div></div>
      <p class="cp-low">Only ${fmt(d.voters)} ${d.voters === 1 ? 'person has' : 'people have'} said they are from ${esc(name)} so far. Once ${d.minVoters} do, you will see what they think and how they differ from the world.</p>
      <p><a class="btn" href="/" data-link>Say you are from ${esc(name)} ${ARROW}</a></p></div>`;
    return;
  }

  // what stands out: the biggest gaps between this country and the world
  const stand = [];
  for (const q of d.questions) for (const t of q.top) if (q.total >= 20 && t.n >= 5) stand.push({ q, t, diff: t.pct - t.world });
  stand.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  const seenQ = new Set();
  const top3 = stand.filter((s) => Math.abs(s.diff) >= 6 && !seenQ.has(s.q.id) && seenQ.add(s.q.id)).slice(0, 3); // one card per question

  const row = (t, max, duelColor) => `<div class="cq-row">
    <i class="cq-fill" style="--w:${max ? (t.pct / max) * 100 : 0}"></i>
    ${t.flag ? flagImg(t.flag, 'sm') : t.swatch ? `<span class="opt-swatch sm" style="background:${esc(t.swatch)}"></span>` : t.emoji ? `<span class="opt-emoji" aria-hidden="true">${t.emoji}</span>` : ''}
    <span class="cq-label">${esc(t.label)}</span>
    <span class="cq-nums"><b>${pct(t.pct)}</b><small>world ${pct(t.world)}</small>${Math.abs(t.pct - t.world) >= 6 ? `<em class="${t.pct > t.world ? 'up' : 'down'}">${t.pct > t.world ? '+' : ''}${Math.round(t.pct - t.world)}</em>` : ''}</span></div>`;

  const cats = [...new Set(d.questions.map((q) => q.category))];
  app.innerHTML = `<div class="view wrap cpage">
    <a class="back" href="/q/country" data-link>${BACK} Back to countries</a>
    <div class="cp-hero" data-guide="cpage">
      <div class="cp-flag">${flagImg(flag)}</div>
      <div><p class="eyebrow">People from</p><h1 class="display">${esc(d.label)}</h1>
        <p class="cp-meta"><b class="num">${fmt(d.voters)}</b> voters · <b>#${d.rank}</b> of ${list.stats.countries} countries</p></div>
    </div>
    <div class="cp-actions"><button class="btn" type="button" id="cp-share">Share this page</button><a class="btn alt" href="/map" data-link>See on the map</a></div>
    ${top3.length ? `<section class="section" data-guide="cstand"><div class="section-head"><h2>What makes ${esc(name)} different</h2></div><div class="stand-row">${top3.map((s) => `<div class="stand paper hued" style="--h:${s.q.hue}"><span class="stand-e">${s.t.flag ? flagImg(s.t.flag) : s.t.emoji || '✨'}</span><p class="stand-line"><b>${pct(s.t.pct)}</b> say <b>${esc(s.t.label)}</b></p><p class="stand-q">${esc(s.q.prompt)}</p><p class="stand-cmp ${s.diff > 0 ? 'up' : 'down'}">${s.diff > 0 ? '+' : ''}${Math.round(s.diff)} vs the world (${pct(s.t.world)})</p></div>`).join('')}</div></section>` : ''}
    ${cats.map((c) => `<section class="section"><div class="section-head"><h2>${esc(catName(c))}</h2></div><div class="cq-grid">${d.questions.filter((q) => q.category === c).map((q) => { const max = Math.max(...q.top.map((t) => t.pct), 1); return `<article class="cq paper hued" style="--h:${q.hue}"><h3 class="cq-q"><a href="/q/${esc(q.id)}" data-link>${esc(q.prompt)}</a></h3><div class="cq-rows">${q.top.map((t) => row(t, max)).join('')}</div><p class="cq-foot">${fmt(q.total)} ${esc(name)} answers</p></article>`; }).join('')}</div></section>`).join('')}
    <p class="fine">Based on people who said they are from ${esc(name)} on this device. Small groups are hidden. This is a game, not a survey.</p>
  </div>`;

  app.querySelector('#cp-share')?.addEventListener('click', () => {
    const s = top3[0];
    const text = s ? `People from ${name}: ${pct(s.t.pct)} say ${s.t.label} (${s.diff > 0 ? '+' : ''}${Math.round(s.diff)} vs the world). Which country are you?` : `What do people from ${name} think? See how they vote.`;
    openShare({ title: `What people from ${name} think`, text, url: location.origin + '/c/' + flag, toast });
  });
  requestAnimationFrame(() => requestAnimationFrame(() => app.classList.add('cp-in')));
}

// ---------- Pinny's brain: messages that depend on what you've actually done
let pageQ = null; // the question page currently open
function guideTip(key) {
  const qs = listCache?.questions || [];
  const total = qs.length || 25;
  const n = qs.filter((q) => q.mine).length;
  const left = total - n;
  const cname = qs.find((q) => q.id === 'country')?.mineOpt?.label;
  const q = pageQ;
  const lvl = level(n, total);
  switch (key) {
    case 'hero': return !cname ? 'Start here. Type your country!' : n < 4 ? `Welcome, ${cname}! Try a quick vote.` : left ? `Welcome back! ${left} questions left.` : 'Welcome back, you did them all!';
    case 'leaders': {
      const c = detailCache.get('country');
      if (cname && c) { const sorted = Object.entries(c.counts).sort((x, y) => y[1] - x[1]); const rank = sorted.findIndex(([id]) => id === c.mine) + 1; if (rank) return `${cname} is #${rank} so far.`; }
      return "These lead so far. Where's yours?";
    }
    case 'map': return cname ? `Find ${cname}. Zoom in for cities.` : 'The map fills up as people vote.';
    case 'quick': return n === 0 ? 'Tap an answer. You can change it later.' : n < total ? `${n} of ${total} done. Keep going!` : 'All done. Change any answer you like.';
    case 'more': return left ? `${left} more to answer. Hungry?` : 'You answered everything!';
    case 'explore': return left ? `${left} still unanswered. Pick one!` : 'All answered! Revisit one?';
    case 'qhead':
      if (!q) return 'Pick an answer!';
      if (q.kind === 'places') return q.mine ? 'Pin dropped! Change it anytime.' : 'Find your city or region.';
      if (q.kind === 'countries') return q.mine ? 'Got it! Change it anytime.' : 'Find your country. Type to search.';
      if (q.kind === 'duel') return q.mine ? 'Locked in. Change it anytime.' : 'Pick a side!';
      return q.mine ? 'Locked in. Change it anytime.' : 'Pick one. Change it anytime.';
    case 'results': return q?.mine ? (q.options.length > 14 ? 'Search, sort or scroll the list.' : 'This is how the world voted.') : 'Vote to reveal the results.';
    case 'share': return q?.mine ? "Share it! I'll make a picture." : 'Vote first, then share it!';
    case 'mappage': return cname ? `Tap ${cname}, then pick your city.` : 'Scroll to zoom. Tap a country.';
    case 'passport': return `${lvl.title}. ${n} of ${total} answered.`;
    case 'badges': {
      const ev = evaluate(mineMap(), total);
      const next = ACHIEVEMENTS.find((a) => !ev.earned.has(a.id) && !a.secret);
      return next ? `Next badge: ${next.n}. ${next.d}` : 'All badges! Now hunt the secrets.';
    }
    case 'about': return 'Why this exists. Short read!';
    case 'cpage': return 'See how they differ from the world!';
    case 'cstand': return 'The biggest gaps vs the world.';
    default: return key;
  }
}
const reactLine = (kind, d) => {
  if (kind === 'vote' && d) {
    if (d.id === 'country') return `Welcome, ${d.label}!`;
    if (d.kind === 'places') return `${d.label}! Pin dropped.`;
    if (d.duel) return d.pct >= 50 ? `Team ${d.label}! ${d.pct}% agree.` : `Bold! Only ${d.pct}% agree.`;
    return `${d.label}! ${d.pct}% agree.`;
  }
  if (kind === 'badge') return d?.names?.length > 1 ? `${d.names.length} new badges!` : `Badge: ${d?.names?.[0] || 'new one'}!`;
  if (kind === 'egg') return `Secret found! ${getMe().eggs.length} of ${EGGS_TOTAL}.`;
  if (kind === 'share') return 'Thanks for sharing!';
  return null;
};
const voteDetail = (r, optionId) => { const o = r.options.find((x) => x.id === optionId); const tot = Object.values(r.counts).reduce((s, v) => s + v, 0) || 1; return { id: r.id, label: o?.label || '', kind: r.kind, duel: r.options.length === 2, pct: Math.round(((r.counts[optionId] || 0) / tot) * 100) }; };

// ---------- badges
const mineMap = () => ({ ...Object.fromEntries((listCache?.questions || []).filter((q) => q.mine).map((q) => [q.id, q.mine])), ...(listCache?.placeMine || {}) });
let toastQueue = Promise.resolve();
function checkAchievements() {
  if (!listCache) return;
  const { fresh } = evaluate(mineMap(), listCache.questions.length);
  if (!fresh.length) return;
  const lines = fresh.length > 2 ? [`🏅 ${fresh.length} new badges! Open your passport.`] : fresh.map((b) => `${b.e} Badge unlocked: ${b.n}`);
  sfx.badge();
  dispatchEvent(new CustomEvent('wcay:badge', { detail: { names: fresh.map((b) => b.n) } }));
  for (const line of lines) toastQueue = toastQueue.then(() => { toast(line); confetti(innerWidth / 2, innerHeight * 0.7); return new Promise((r) => setTimeout(r, 3300)); });
}
const afterVote = () => checkAchievements();
setUnlockHandler(checkAchievements);

let profileTimer;
async function profilePage() {
  setHue(178);
  const list = await getList(true);
  const total = list.questions.length;
  const m = mineMap();
  const ev = evaluate(m, total);
  const me = getMe();
  const lv = level(ev.n, total);
  const flag = m.country ? m.country.toLowerCase() : null;
  const eggs = me.eggs.length;
  const earnedCount = ev.earned.size;
  const tiles = [
    ['🗳️', 'Answered', `${ev.n}/${total}`], ['⏱️', 'Time here', '<span id="pt"></span>'], ['📅', 'Days visited', new Set(me.days).size], ['🔥', 'Best streak', `${streak()} ${streak() === 1 ? 'day' : 'days'}`],
    ['🥚', 'Secrets found', `${eggs}/${EGGS_TOTAL}`], ['📣', 'Times shared', me.shares], ['🔄', 'Changed my mind', me.changed],
  ];
  app.innerHTML = `<div class="view wrap profile">
    <div class="page-head" data-guide="passport" data-guide-mood="cool"><p class="eyebrow">Your passport</p><h1 class="display">${esc(lv.title)}</h1></div>
    <section class="passport paper">
      <div class="pp-avatar">${flag ? flagImg(flag) : '<span aria-hidden="true">🌍</span>'}</div>
      <div class="pp-main"><strong>${ev.n} of ${total} questions answered</strong><div class="xp" role="progressbar" aria-valuenow="${lv.pct}" aria-valuemin="0" aria-valuemax="100"><i style="--w:${lv.pct}"></i></div><span>${earnedCount} of ${ACHIEVEMENTS.length} badges collected</span></div>
      <button class="btn alt" type="button" id="share-pp">Share my passport</button>
    </section>
    <div class="stat-grid">${tiles.map(([e, l, v]) => `<div class="stat"><span class="stat-e" aria-hidden="true">${e}</span><b class="num">${v}</b><small>${l}</small></div>`).join('')}</div>
    <div class="section-head" style="margin-top:44px"><h2>Badges</h2><span class="block-note">${earnedCount}/${ACHIEVEMENTS.length}</span></div>
    <div class="badges" data-guide="badges" data-guide-mood="party">${ACHIEVEMENTS.map((a) => {
      const on = ev.earned.has(a.id);
      const hide = a.secret && !on;
      return `<div class="badge ${on ? 'on' : 'off'}"><span class="badge-ic" aria-hidden="true">${hide ? '❓' : a.e}</span><strong>${hide ? 'Secret' : esc(a.n)}</strong><small>${hide ? 'Keep exploring. Poke things.' : esc(a.d)}</small></div>`;
    }).join('')}</div>
    <div class="section-head" style="margin-top:44px"><h2>Your answers</h2></div>
    ${ev.n ? `<ul class="rows">${list.questions.filter((q) => q.mine).map((q) => `<li><a class="row hued" style="--h:${q.hue}" href="/q/${esc(q.id)}" data-link><span class="row-main">${q.mineOpt?.flag ? flagImg(q.mineOpt.flag) : q.mineOpt?.swatch ? `<span class="opt-swatch" style="background:${esc(q.mineOpt.swatch)}"></span>` : q.mineOpt?.emoji ? `<span class="opt-emoji big" aria-hidden="true">${q.mineOpt.emoji}</span>` : '<i class="row-dot"></i>'}<span class="row-prompt">${esc(q.prompt)}<span class="row-sub">You said <strong>${esc(q.mineOpt?.label || '')}</strong></span></span></span><span class="row-go">${ARROW}</span></a></li>`).join('')}</ul>` : '<p class="empty">Nothing yet. <a href="/explore" data-link>Answer a question</a> and your passport starts to fill.</p>'}
    <p class="pp-actions">${guide?.hidden ? '<button class="btn alt" type="button" id="call-pinny">Call Pinny back</button> ' : ''}<button class="btn alt" type="button" id="take-tour">Take the tour</button></p>
    <p class="fine">Badges, time and streaks are saved in this browser only. Your votes stay counted on the server either way.</p>
  </div>`;
  const pt = app.querySelector('#pt');
  const tick = () => { pt.textContent = fmtTime(getMe().playMs); };
  tick();
  clearInterval(profileTimer);
  profileTimer = setInterval(() => (document.body.contains(pt) ? tick() : clearInterval(profileTimer)), 1000);
  app.querySelector('#take-tour')?.addEventListener('click', () => tour.start());
  app.querySelector('#call-pinny')?.addEventListener('click', (e) => { guide.callBack(); e.target.remove(); });
  app.querySelector('#share-pp').addEventListener('click', () => openShare({ title: 'My passport', text: `I'm a ${lv.title} on Which Country Are You: ${ev.n}/${total} answered, ${earnedCount} badges. What's your passport?`, url: location.origin, toast }));
}

// ---------- router
const routes = [
  [/^\/$/, () => home()],
  [/^\/explore\/?$/, () => explore()],
  [/^\/map\/?$/, () => mapPage()],
  [/^\/profile\/?$/, () => profilePage()],
  [/^\/admin\/?$/, async () => { setHue(178); document.title = 'Admin'; const m = await import('/admin.js'); await m.mountAdmin(app, { esc, fmt, flagImg }); }],
  [/^\/c\/([a-z]{2})\/?$/, (m) => countryPage(m[1])],
  [/^\/q\/([a-z0-9-]+)\/?$/, (m) => questionPage(m[1])],
  [/^\/about\/?$/, () => about()],
];

const TITLES = { '/': 'Which Country Are You?', '/explore': 'Every question', '/map': 'The map', '/profile': 'Your passport', '/about': 'About' };
async function render() {
  const path = location.pathname;
  if (!path.startsWith('/admin')) pageview(path);
  if (!path.startsWith('/q/')) pageQ = null;
  const t = TITLES[path.replace(/\/$/, '') || '/'];
  document.title = t ? (t === 'Which Country Are You?' ? t : `${t} · Which Country Are You?`) : 'Which Country Are You?';
  document.querySelectorAll('.nav a, .tabbar a').forEach((a) => (a.getAttribute('href') === path ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  for (const [re, fn] of routes) {
    const m = re.exec(path);
    if (m) {
      try { await fn(m); checkAchievements(); guide?.scan(); } catch (err) { app.innerHTML = `<div class="view wrap page-head"><h1 class="display">${err.status === 404 ? "That question isn't here." : 'Something broke.'}</h1><p>${esc(err.message)}</p><p><a class="btn" href="/" data-link>Back home</a></p></div>`; }
      return;
    }
  }
  notFound();
}

function go(path) {
  if (path === location.pathname) return;
  history.pushState(null, '', path);
  window.scrollTo(0, 0);
  render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('popstate', render);
initFooter();
startTracking();
initTracking();
initSfx();
initEggs({ toast, confetti });
let guide = null;
const pinnySVG = () => `<svg viewBox="-62 -134 124 150" width="100%" height="100%" aria-hidden="true">${pinny(0, 0, 'mate', 1)}</svg>`;
const tour = initTour({ go, pinnySVG, esc, confetti, sfx, mark, toast });
guide = initGuide({ tipFor: guideTip, lineFor: reactLine, pinnySVG, startTour: () => tour.start(), tourActive: () => tour.active, tourState, esc, fmt, flagImg, level, fmtTime, getMe, evaluate, getList, mineMap, go, confetti, ACHIEVEMENTS });
render();
