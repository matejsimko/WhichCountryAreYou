// Interactive world map. Loaded on demand by app.js.
// Country outlines come from /map.json (built by scripts/build-map.js); everything else is plain SVG + a tiny camera.

const VIEWS = [['world', 'World'], ['europe', 'Europe'], ['asia', 'Asia'], ['africa', 'Africa'], ['na', 'North America'], ['sa', 'South America'], ['oceania', 'Oceania']];
const VIEW_CONTINENT = { europe: 'EU', asia: 'AS', africa: 'AF', na: 'NA', sa: 'SA', oceania: 'OC' };
const CONTINENT_NAME = { EU: 'Europe', AS: 'Asia', AF: 'Africa', NA: 'North America', SA: 'South America', OC: 'Oceania' };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function mountMap(el, ctx, opts = {}) {
  const { esc, fmt, pctText, flagImg } = ctx;
  const [data, list] = await Promise.all([fetch('/map.json').then((r) => r.json()), ctx.getList()]);
  const mapQs = list.questions.filter((q) => q.kind === 'countries');
  let qid = mapQs.some((q) => q.id === opts.question) ? opts.question : 'country';
  let detail = await ctx.getDetail(qid, true);

  const byCode = new Map(data.countries.map((c) => [c.c, c]));
  const world = data.views.world;
  const WORLD_W = world[2];
  const MIN_W = WORLD_W / 60;

  el.classList.add('map');
  el.innerHTML = `
    <div class="map-bar">
      <div class="chips map-views" role="group" aria-label="Zoom to">${VIEWS.map(([k, l]) => `<button class="chip" type="button" data-view="${k}" aria-pressed="${k === 'world'}">${l}</button>`).join('')}</div>
      ${mapQs.length > 1 ? `<div class="chips map-qs" role="group" aria-label="Question">${mapQs.map((q) => `<button class="chip" type="button" data-q="${esc(q.id)}" aria-pressed="${q.id === qid}">${esc(q.prompt)}</button>`).join('')}</div>` : ''}
    </div>
    <div class="map-stage">
      <div class="map-sky" aria-hidden="true"><i class="map-cloud c1"></i><i class="map-cloud c2"></i><i class="map-plane"></i></div>
      <svg class="map-svg" viewBox="${world.join(' ')}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g class="lands">${data.countries.map((c) => `<path class="land" data-c="${c.c}" d="${c.d}" style="--x:${(c.p[0] / 1000).toFixed(2)}"/>`).join('')}</g>
        <g class="map-pin" hidden><g class="pin-bob"><circle class="pin-ring" r="10"/><path d="M0 0C-6-8-12-13-12-20a12 12 0 0 1 24 0C12-13 6-8 0 0Z" fill="#EE5A36" stroke="#fff" stroke-width="2"/><circle cy="-20" r="4.5" fill="#fff"/></g></g>
      </svg>
      <div class="map-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">&minus;</button><button type="button" data-zoom="reset" aria-label="Show the whole world">&#8962;</button></div>
      <div class="map-tip" hidden></div>
      <div class="map-card" hidden></div>
      <div class="map-legend" aria-hidden="true"><span>fewer</span><i></i><span>more</span></div>
      <p class="map-hint">${opts.wheel ? 'Scroll to zoom, drag to move' : 'Ctrl + scroll to zoom, drag to move'}</p>
    </div>
    <div class="map-top"></div>`;

  const stage = el.querySelector('.map-stage');
  const svg = el.querySelector('.map-svg');
  const lands = el.querySelector('.lands');
  const pin = el.querySelector('.map-pin');
  const tip = el.querySelector('.map-tip');
  const card = el.querySelector('.map-card');
  const topEl = el.querySelector('.map-top');
  const landEl = new Map([...svg.querySelectorAll('.land')].map((p) => [p.dataset.c, p]));
  landEl.forEach((p) => p.style.setProperty('--d', `${(Number(p.style.getPropertyValue('--x')) * 0.9).toFixed(2)}s`));
  requestAnimationFrame(() => stage.classList.add('is-in'));

  // ---------- data -> colour
  let counts = {}, total = 0, max = 0, ranks = new Map();
  function loadCounts() {
    counts = detail.counts;
    total = Object.values(counts).reduce((a, b) => a + b, 0);
    max = Math.max(0, ...Object.values(counts));
    ranks = new Map(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c], i) => [c, i + 1]));
    stage.style.setProperty('--h', detail.hue);
  }
  function paint() {
    loadCounts();
    landEl.forEach((p, code) => {
      const v = counts[code] || 0;
      if (!v) { p.style.fill = ''; return; }
      const t = Math.sqrt(v / max);
      p.style.fill = `oklch(${(0.93 - 0.38 * t).toFixed(3)} ${(0.06 + 0.15 * t).toFixed(3)} ${detail.hue})`;
    });
    // your own answer gets a pin
    const mine = detail.mine && byCode.get(detail.mine);
    pin.toggleAttribute('hidden', !mine);
    if (mine) { pin.dataset.x = mine.p[0]; pin.dataset.y = mine.p[1]; }
    placePin();
    drawTop();
    if (selected) showCard(selected, false);
  }

  // ---------- camera (the viewBox)
  let vb = { x: world[0], y: world[1], w: world[2], h: world[3] };
  let aspect = 2;
  let anim = 0;
  let view = 'world';
  let selected = null;

  function measure() { const r = stage.getBoundingClientRect(); aspect = r.width / Math.max(1, r.height); return r; }
  function fit(box, pad = 1.08) {
    const bw = box[2] * pad, bh = box[3] * pad;
    const w = bw / bh > aspect ? bw : bh * aspect;
    return { x: box[0] + box[2] / 2 - w / 2, y: box[1] + box[3] / 2 - w / aspect / 2, w, h: w / aspect };
  }
  function clamp(v) {
    const maxW = fit(world).w;
    const w = Math.min(maxW, Math.max(MIN_W, v.w)), h = w / aspect;
    const cx = Math.min(world[0] + world[2] * 1.1, Math.max(world[0] - world[2] * 0.1, v.x + v.w / 2));
    const cy = Math.min(world[1] + world[3] * 1.1, Math.max(world[1] - world[3] * 0.1, v.y + v.h / 2));
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  function render() {
    svg.setAttribute('viewBox', `${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(2)} ${vb.h.toFixed(2)}`);
    stage.classList.toggle('is-zoomed', vb.w < fit(world).w * 0.85);
    placePin();
  }
  function placePin() {
    if (pin.hasAttribute('hidden') || !pin.dataset.x) return;
    const s = vb.w / stage.clientWidth; // keep the pin the same size on screen
    pin.setAttribute('transform', `translate(${pin.dataset.x} ${pin.dataset.y}) scale(${s})`);
  }
  function animateTo(target, ms = 1000) {
    cancelAnimationFrame(anim);
    target = clamp(target);
    if (reduceMotion() || ms === 0) { vb = target; return render(); }
    const a = { ...vb, cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 };
    const b = { cx: target.x + target.w / 2, cy: target.y + target.h / 2, w: target.w };
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      const w = a.w * Math.pow(b.w / a.w, e); // zoom evenly, in ratio terms
      const cx = a.cx + (b.cx - a.cx) * e, cy = a.cy + (b.cy - a.cy) * e;
      vb = { x: cx - w / 2, y: cy - w / aspect / 2, w, h: w / aspect };
      render();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function setView(k) {
    view = k;
    if (k !== 'country') selectCountry(null, false);
    el.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === k));
    if (VIEW_CONTINENT[k]) topCont = VIEW_CONTINENT[k]; else if (k === 'world') topCont = null;
    drawTop();
    animateTo(fit(data.views[k], k === 'world' ? 1.02 : 1.06));
  }
  function zoomAt(cx, cy, factor) {
    const r = stage.getBoundingClientRect();
    const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
    const w = Math.min(fit(world).w, Math.max(MIN_W, vb.w * factor)), h = w / aspect;
    vb = clamp({ x: vb.x + vb.w * fx - w * fx, y: vb.y + vb.h * fy - h * fy, w, h });
    render();
  }
  function markCustom() { if (view !== 'country') { view = 'custom'; el.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false')); } }

  // ---------- selecting a country
  let topCont = null;
  function showCard(code, animate = true) {
    const c = byCode.get(code);
    const v = counts[code] || 0;
    const opt = detail.options.find((o) => o.id === code);
    const rank = ranks.get(code);
    card.innerHTML = `${flagImg(code.toLowerCase())}<div class="map-card-text"><strong>${esc(opt?.label || c.n)}</strong><span>${v ? `${pctText((v / total) * 100, true)} · ${fmt(v)} ${v === 1 ? 'vote' : 'votes'} · #${rank} of ${ranks.size}` : 'No votes yet'}</span></div>${detail.mine === code ? '<span class="tag">you</span>' : ''}<button class="map-card-x" type="button" aria-label="Close">&times;</button>`;
    card.hidden = false;
    if (animate) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
  }
  function selectCountry(code, zoom = true) {
    if (selected) landEl.get(selected)?.classList.remove('is-selected');
    selected = code;
    if (!code) { card.hidden = true; return; }
    const c = byCode.get(code);
    const p = landEl.get(code);
    p.classList.add('is-selected');
    lands.appendChild(p); // draw on top so the outline isn't covered by neighbours
    showCard(code);
    if (c.k && CONTINENT_NAME[c.k]) { topCont = c.k; drawTop(); }
    if (zoom) {
      view = 'country';
      el.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      const [x0, y0, x1, y1] = c.b;
      const w = Math.max(x1 - x0, 46), h = Math.max(y1 - y0, 46 / aspect);
      animateTo(fit([(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h], 1.7));
    }
  }

  // ---------- top countries in the area you're looking at
  function drawTop() {
    const pool = data.countries.filter((c) => (counts[c.c] || 0) > 0 && (!topCont || c.k === topCont));
    pool.sort((a, b) => counts[b.c] - counts[a.c]);
    const rows = pool.slice(0, 7);
    topEl.innerHTML = rows.length
      ? `<p class="eyebrow">Top in ${topCont ? CONTINENT_NAME[topCont] : 'the world'}</p><div class="sticker-row">${rows.map((c, i) => `<button class="sticker" type="button" style="--i:${i}" data-pick="${c.c}">${flagImg(c.c.toLowerCase())}<span>${esc(detail.options.find((o) => o.id === c.c)?.label || c.n)}</span><small class="num">${pctText((counts[c.c] / total) * 100, true)}</small></button>`).join('')}</div>`
      : `<p class="eyebrow">${total ? 'No votes in this area yet' : 'No votes yet. Be the first and watch the map light up.'}</p>`;
  }

  // ---------- pointer: hover, drag, pinch, click
  const pointers = new Map();
  let dragging = false, moved = 0, pinchDist = 0, justDragged = false;

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  svg.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) { hover(e); return; }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) { cancelAnimationFrame(anim); markCustom(); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinchDist / d); }
      pinchDist = d; dragging = true; return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (!dragging && moved > 6) { dragging = true; svg.setPointerCapture(e.pointerId); stage.classList.add('is-dragging'); hideTip(); }
    if (dragging) {
      cancelAnimationFrame(anim); markCustom();
      const r = stage.getBoundingClientRect();
      vb = clamp({ ...vb, x: vb.x - (dx * vb.w) / r.width, y: vb.y - (dy * vb.h) / r.height });
      render();
    } else hover(e);
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (dragging && pointers.size === 0) { justDragged = true; setTimeout(() => (justDragged = false), 0); dragging = false; stage.classList.remove('is-dragging'); }
    pinchDist = 0;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
  svg.addEventListener('click', (e) => {
    if (justDragged) return;
    const land = e.target.closest('.land');
    if (!land) { selectCountry(null); return; }
    selectCountry(land.dataset.c === selected ? null : land.dataset.c);
  });
  svg.addEventListener('dblclick', (e) => { e.preventDefault(); markCustom(); const r = stage.getBoundingClientRect(); const t = clamp({ x: vb.x + (vb.w * (e.clientX - r.left)) / r.width - vb.w / 4, y: vb.y + (vb.h * (e.clientY - r.top)) / r.height - vb.h / 4, w: vb.w / 2, h: vb.h / 2 }); animateTo(t, 500); });
  svg.addEventListener('wheel', (e) => {
    if (!opts.wheel && !(e.ctrlKey || e.metaKey)) return; // let the page scroll normally
    e.preventDefault();
    cancelAnimationFrame(anim); markCustom();
    zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
  }, { passive: false });

  function hover(e) {
    if (e.pointerType !== 'mouse' || dragging) return;
    const land = e.target.closest?.('.land');
    if (!land) return hideTip();
    const code = land.dataset.c;
    const c = byCode.get(code);
    const v = counts[code] || 0;
    const opt = detail.options.find((o) => o.id === code);
    tip.innerHTML = `${flagImg(code.toLowerCase(), 'sm')}<span><strong>${esc(opt?.label || c.n)}</strong><small>${v ? `${pctText((v / total) * 100, true)} · ${fmt(v)}` : 'no votes yet'}</small></span>`;
    tip.hidden = false;
    const r = stage.getBoundingClientRect();
    const x = Math.min(r.width - tip.offsetWidth - 8, e.clientX - r.left + 14);
    const y = Math.max(8, e.clientY - r.top - tip.offsetHeight - 12);
    tip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
  }
  const hideTip = () => { tip.hidden = true; };

  // ---------- buttons
  el.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-view]');
    if (v) return setView(v.dataset.view);
    const z = e.target.closest('[data-zoom]');
    if (z) {
      markCustom();
      if (z.dataset.zoom === 'reset') return setView('world');
      const k = z.dataset.zoom === 'in' ? 0.5 : 2;
      const c = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      const w = vb.w * k;
      return animateTo({ x: c.x - w / 2, y: c.y - w / aspect / 2, w, h: w / aspect }, 500);
    }
    const q = e.target.closest('[data-q]');
    if (q && q.dataset.q !== qid) {
      qid = q.dataset.q;
      el.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.q === qid));
      detail = await ctx.getDetail(qid, true);
      paint();
      return;
    }
    if (e.target.closest('.map-card-x')) return selectCountry(null);
    const pick = e.target.closest('[data-pick]');
    if (pick) { stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); selectCountry(pick.dataset.pick); }
  });
  new ResizeObserver(() => { const old = aspect; measure(); if (Math.abs(old - aspect) > 0.01) { vb = clamp({ x: vb.x, y: vb.y, w: vb.w, h: vb.w / aspect }); if (view !== 'custom' && view !== 'country') { vb = clamp(fit(data.views[view] || world, view === 'world' ? 1.02 : 1.06)); } render(); } }).observe(stage);

  measure();
  vb = clamp(fit(world, 1.02));
  render();
  paint();
}
