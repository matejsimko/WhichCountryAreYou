// Admin panel: our own analytics, at /admin. Loaded only when you open it.
// Tabs: Overview, Audience, Acquisition, Product, Live. Everything is drawn with plain SVG, no libraries.

const RANGES = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];
const TABS = [['overview', 'Overview'], ['audience', 'Audience'], ['sources', 'Acquisition'], ['product', 'Product'], ['health', 'Health'], ['feedback', 'Feedback'], ['live', 'Live']];

// friendly names and groups for events
const EVENTS = {
  vote: ['Voting', 'Votes cast'], place_vote: ['Voting', 'City or region votes'], change_answer: ['Voting', 'Changed an answer'], search: ['Voting', 'Used search in a list'], sort: ['Voting', 'Sorted a list'], filter_group: ['Voting', 'Filtered cities/regions'],
  share_open: ['Sharing', 'Opened the share popup'], share_click: ['Sharing', 'Clicked a share option'], share_done: ['Sharing', 'Shared or copied (completed)'], share_image: ['Sharing', 'Saved or sent the share card'],
  tour_offer: ['Tutorial', 'Answered the tour offer'], tour_start: ['Tutorial', 'Started the tour'], tour_step: ['Tutorial', 'Tour steps viewed'], tour_done: ['Tutorial', 'Finished the tour'], tour_skip: ['Tutorial', 'Skipped the tour'],
  map_open: ['Map', 'Opened the map'], map_zoom: ['Map', 'Zoomed to a continent'], map_country: ['Map', 'Selected a country on the map'], map_question: ['Map', 'Switched the map question'],
  pinny_click: ['Pinny', 'Clicked Pinny'], pinny_drag: ['Pinny', 'Carried Pinny around'], pinny_passport: ['Pinny', 'Opened the passport from Pinny'], pinny_tour: ['Pinny', 'Started the tour from Pinny'], pinny_away: ['Pinny', 'Sent Pinny away'], pinny_feedback: ['Pinny', 'Opened feedback from Pinny'], feedback_open: ['Interface', 'Opened the feedback form'], feedback_sent: ['Interface', 'Sent feedback'],
  outbound: ['Interface', 'Clicked a link that leaves the site'], vote_error: ['Problems', 'Vote failed'], not_found: ['Problems', 'Opened a page that does not exist'], js_error: ['Problems', 'Browser errors'],
  badge: ['Passport and secrets', 'Badges unlocked'], egg: ['Passport and secrets', 'Easter eggs found'], sound: ['Interface', 'Toggled sound'],
};
const GROUPS = ['Voting', 'Sharing', 'Tutorial', 'Map', 'Pinny', 'Passport and secrets', 'Interface', 'Problems'];
const BREAKDOWN_LABEL = { share_click: ['ch', 'by option'], map_zoom: ['view', 'by continent'], egg: ['id', 'by secret'], tour_step: ['i', 'by step'], tour_skip: ['i', 'skipped at step'], sort: ['k', 'by sort'], filter_group: ['g', 'by filter'], tour_offer: ['a', 'answer'], vote: ['q', 'by question'], outbound: ['h', 'by site'], vote_error: ['s', 'by status'], place_vote: ['q', 'by country'], search: ['q', 'by question'] };

export async function mountAdmin(root, { esc, fmt, flagImg }) {
  if (!document.getElementById('adm-css')) {
    const l = document.createElement('link'); l.id = 'adm-css'; l.rel = 'stylesheet'; l.href = '/admin.css'; document.head.append(l);
  }
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const country = (c) => { try { return names.of(c); } catch { return c; } };
  const flag = (c) => (c && /^[A-Z]{2}$/.test(c) ? `<img class="flag sm" src="/flags/1x1/${c.toLowerCase()}.svg" alt="" width="22" height="22" onerror="this.style.visibility='hidden'">` : '<span class="flag sm blank"></span>');
  const api = async (p, opts) => { const r = await fetch('/api/admin/' + p, opts); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Error'), { status: r.status }); return j; };

  const me = await api('me').catch(() => ({ configured: false, admin: false }));
  if (!me.admin) return loginView(root, me, esc, () => mountAdmin(root, { esc, fmt, flagImg }));

  // question names, for readable labels
  const qnames = {};
  try { const l = await (await fetch('/api/questions')).json(); for (const q of l.questions) qnames[q.id] = q.prompt; } catch { /* labels fall back to ids */ }
  const qname = (id) => (id && id.startsWith('place-') ? `Where in ${country(id.slice(6).toUpperCase())}?` : qnames[id] || id);

  let state = { days: Number(sessionStorage.getItem('adm_days')) || 7, tab: (location.hash || '#overview').slice(1), data: null, loading: false, live: null };
  if (!TABS.some(([k]) => k === state.tab)) state.tab = 'overview';

  // ---------- small helpers
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const dur = (ms) => { if (!ms) return '0:00'; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const delta = (cur, prev) => { if (!prev && !cur) return { t: '0%', c: 'flat' }; if (!prev) return { t: 'new', c: 'up' }; const d = ((cur - prev) / prev) * 100; return { t: `${d >= 0 ? '+' : ''}${Math.abs(d) < 10 ? d.toFixed(1) : Math.round(d)}%`, c: d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat' }; };
  const ago = (ts) => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
  const shortDay = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const bars = (rows, { label = (r) => r.k, value = (r) => r.n, total, color = 'var(--teal)', fmtv = fmt, icon } = {}) => {
    const max = Math.max(1, ...rows.map(value));
    const tot = total ?? rows.reduce((a, r) => a + value(r), 0);
    return rows.length ? `<ul class="bars">${rows.map((r) => `<li><span class="bar-fill" style="width:${(value(r) / max) * 100}%;background:${color}"></span><span class="bar-l">${icon ? icon(r) : ''}${esc(label(r))}</span><span class="bar-n">${fmtv(value(r))}<small>${tot ? pct(value(r), tot) + '%' : ''}</small></span></li>`).join('')}</ul>` : '<p class="empty">No data yet.</p>';
  };

  // ---------- charts (SVG)
  function lineChart({ labels, series, height = 230, bars: asBars = false }) {
    const W = 860, H = height, pl = 44, pr = 12, pt = 14, pb = 28;
    const iw = W - pl - pr, ih = H - pt - pb;
    const max = Math.max(1, ...series.flatMap((s) => s.data));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
    const n = labels.length, x = (i) => (asBars ? pl + ((i + 0.5) / n) * iw : pl + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)), y = (v) => pt + ih - (v / nice) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => nice * t);
    const step = Math.max(1, Math.ceil(n / 7));
    const paths = series.map((s) => {
      if (asBars) { const bw = Math.max(2, (iw / n) * 0.62); return s.data.map((v, i) => `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, pt + ih - y(v)).toFixed(1)}" rx="3" fill="${s.color}"></rect>`).join(''); }
      const d = s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
      const area = s.area ? `<path d="${d}L${x(n - 1).toFixed(1)} ${pt + ih}L${x(0).toFixed(1)} ${pt + ih}Z" fill="${s.color}" opacity=".13"></path>` : '';
      return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"></path>${n <= 31 ? s.data.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="#fff" stroke="${s.color}" stroke-width="2"></circle>`).join('') : ''}`;
    }).join('');
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    return `<div class="chart" id="${id}" ${asBars ? 'data-bars="1"' : ''} data-labels='${esc(JSON.stringify(labels))}' data-series='${esc(JSON.stringify(series.map((s) => ({ l: s.label, c: s.color, d: s.data }))))}'>
      <svg viewBox="0 0 ${W} ${H}" role="img">
        ${ticks.map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid"></line><text x="${pl - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" class="tick">${t >= 1000 ? fmt(Math.round(t)) : Math.round(t * 10) / 10}</text>`).join('')}
        ${labels.map((l, i) => (i % step === 0 || i === n - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="tick">${esc(shortDay(l))}</text>` : '')).join('')}
        ${paths}
        <line class="cursor" x1="0" x2="0" y1="${pt}" y2="${pt + ih}" style="display:none"></line>
        <rect class="hit" x="${pl}" y="${pt}" width="${iw}" height="${ih}" fill="transparent"></rect>
      </svg><div class="tip" hidden></div>
      <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div></div>`;
  }
  function wireCharts(scope) {
    scope.querySelectorAll('.chart').forEach((c) => {
      const labels = JSON.parse(c.dataset.labels), series = JSON.parse(c.dataset.series);
      const svg = c.querySelector('svg'), tip = c.querySelector('.tip'), cur = c.querySelector('.cursor'), hit = c.querySelector('.hit');
      const W = 860, pl = 44, pr = 12;
      hit.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        const i = c.dataset.bars ? Math.max(0, Math.min(labels.length - 1, Math.floor(((px - pl) / (W - pl - pr)) * labels.length))) : Math.max(0, Math.min(labels.length - 1, Math.round(((px - pl) / (W - pl - pr)) * (labels.length - 1))));
        const cx = c.dataset.bars ? pl + ((i + 0.5) / labels.length) * (W - pl - pr) : pl + (labels.length === 1 ? (W - pl - pr) / 2 : (i / (labels.length - 1)) * (W - pl - pr));
        cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); cur.style.display = '';
        tip.innerHTML = `<b>${esc(shortDay(labels[i]))}</b>${series.map((s) => `<span><i style="background:${s.c}"></i>${esc(s.l)} <b>${fmt(s.d[i])}</b></span>`).join('')}`;
        tip.hidden = false;
        const left = (cx / W) * r.width;
        tip.style.left = `${Math.min(r.width - 150, Math.max(0, left - 70))}px`;
      });
      hit.addEventListener('pointerleave', () => { tip.hidden = true; cur.style.display = 'none'; });
    });
  }
  const spark = (data, color) => {
    const W = 120, H = 34, max = Math.max(1, ...data), n = data.length;
    const d = data.map((v, i) => `${i ? 'L' : 'M'}${(n === 1 ? W / 2 : (i / (n - 1)) * W).toFixed(1)} ${(H - 3 - (v / max) * (H - 8)).toFixed(1)}`).join('');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}"><path d="${d}L${W} ${H}L0 ${H}Z" fill="${color}" opacity=".12"></path><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  };

  // ---------- views
  const card = (title, body, { cls = '', sub = '', right = '' } = {}) => `<section class="acard ${cls}"><header><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${right}</header>${body}</section>`;

  function kpiCards(d) {
    const c = d.kpi.cur, p = d.kpi.prev, s = d.series;
    const cards = [
      ['Visitors', c.visitors, p.visitors, fmt, s.map((x) => x.visitors), 'var(--teal)', 'People who opened the site (unique per day)'],
      ['Pageviews', c.views, p.views, fmt, s.map((x) => x.views), 'var(--tomato)', 'Pages opened in total'],
      ['Votes cast', c.votes, p.votes, fmt, s.map((x) => x.votes), 'var(--sun)', 'Answers saved in the database'],
      ['Voters', c.voters, p.voters, fmt, s.map((x) => x.voters), 'var(--grape)', 'Visitors who voted at least once'],
      ['Vote rate', pct(c.voters, c.visitors), pct(p.voters, p.visitors), (v) => v + '%', null, 'var(--leaf)', 'Share of visitors who voted'],
      ['Share rate', pct(c.sharers, c.visitors), pct(p.sharers, p.visitors), (v) => v + '%', null, 'var(--pink)', 'Visitors who opened the share popup'],
      ['Avg time on site', c.avgDur, p.avgDur, dur, null, 'var(--sky)', 'Per visit (30 minute windows)'],
      ['Bounce rate', pct(c.bounces, c.sessions), pct(p.bounces, p.sessions), (v) => v + '%', null, '#999', 'Visits that did one page view and nothing else', true],
    ];
    return `<div class="kpis">${cards.map(([l, v, pv, f, sp, col, hint, inv]) => { const dl = delta(v, pv); const c2 = inv ? (dl.c === 'up' ? 'down' : dl.c === 'down' ? 'up' : 'flat') : dl.c; return `<div class="kpi" title="${esc(hint)}"><span class="kpi-l">${l}</span><b class="kpi-v">${f(v)}</b><span class="kpi-d ${c2}">${dl.t}<small> vs previous ${d.range.days === 1 ? 'day' : d.range.days + ' days'}</small></span>${sp ? spark(sp, col) : ''}</div>`; }).join('')}</div>`;
  }

  function insights(d) {
    const out = [];
    const c = d.kpi.cur;
    if (!c.visitors) return '<p class="empty">No visits recorded in this period yet.</p>';
    const tc = d.countries[0]; if (tc) out.push(`<b>${esc(country(tc.code))}</b> brings the most visitors (${pct(tc.visitors, d.countries.reduce((a, r) => a + r.visitors, 0))}% of located visits).`);
    const ch = d.channels.find((x) => x.name !== 'Direct'); if (ch) out.push(`Best source so far: <b>${esc(ch.name)}</b> (${fmt(ch.visitors)} visitors).`);
    const peak = d.hours.indexOf(Math.max(...d.hours)); if (Math.max(...d.hours) > 0) out.push(`Busiest hour: <b>${hourLabel(peak)}</b>.`);
    const topQ = d.questions[0]; if (topQ) out.push(`Most answered question: <b>${esc(qname(topQ.q))}</b> (${fmt(topQ.n)} votes).`);
    if (c.visitors >= 5) out.push(`<b>${pct(c.voters, c.visitors)}%</b> of visitors vote and <b>${pct(c.sharers, c.visitors)}%</b> open the share popup.`);
    const mob = d.devices.find((x) => x.k === 'Phone'); if (mob) out.push(`<b>${pct(mob.n, d.devices.reduce((a, r) => a + r.n, 0))}%</b> of visitors are on a phone.`);
    const inapp = d.browsers.filter((b) => / app$/.test(b.k)); if (inapp.length) out.push(`In-app browsers: ${inapp.map((b) => `${esc(b.k.replace(' app', ''))} ${fmt(b.n)}`).join(', ')}.`);
    return `<ul class="insights">${out.map((t) => `<li>${t}</li>`).join('')}</ul>`;
  }
  const tzOff = -new Date().getTimezoneOffset() / 60;
  const hourLabel = (utcH) => { const h = (((utcH + tzOff) % 24) + 24) % 24; return `${String(Math.floor(h)).padStart(2, '0')}:00`; };

  function funnel(d) {
    const f = d.funnel, top = f[0].n || 1;
    return `<ol class="funnel">${f.map((s, i) => `<li><div class="f-bar" style="width:${Math.max(3, (s.n / top) * 100)}%"></div><span class="f-l">${esc(s.label)}</span><span class="f-n"><b>${fmt(s.n)}</b> <small>${pct(s.n, top)}%${i && s.n <= f[i - 1].n ? ` · ${pct(s.n, f[i - 1].n)}% of previous` : ''}</small></span></li>`).join('')}</ol>`;
  }

  function retentionCard(d) {
    const r = d.retention;
    if (!r.devices) return '<p class="empty">No votes yet.</p>';
    return `<div class="agrid two"><div>
        <div class="bignums"><div><b>${pct(r.back2, r.devices)}%</b><span>voted on 2+ different days</span></div><div><b>${pct(r.back3, r.devices)}%</b><span>voted on 3+ different days</span></div><div><b>${fmt(r.devices)}</b><span>devices that voted, all time</span></div></div>
        <p class="note">Answers per device</p>${bars(r.dist.map((x) => ({ k: x.k, n: x.n })), { color: 'var(--grape)' })}</div>
      <div>${lineChart({ labels: r.series.map((x) => x.day), series: [{ label: 'New voting devices', color: '#0F8A7A', data: r.series.map((x) => x.fresh), area: true }, { label: 'Returning voting devices', color: '#8C55D9', data: r.series.map((x) => x.back), area: true }] })}</div></div>`;
  }

  function overviewTab(d) {
    const labels = d.series.map((x) => x.day);
    return `${card('At a glance', insights(d), { cls: 'wide' })}
      ${kpiCards(d)}
      <div class="agrid two">
        ${card('Traffic', lineChart({ labels, series: [{ label: 'Visitors', color: '#0F8A7A', data: d.series.map((x) => x.visitors), area: true }, { label: 'Pageviews', color: '#EE5A36', data: d.series.map((x) => x.views) }] }), { sub: 'Per day' })}
        ${card('Votes', lineChart({ labels, series: [{ label: 'Votes', color: '#F0A800', data: d.series.map((x) => x.votes) }], bars: true }), { sub: 'Answers saved per day' })}
      </div>
      ${card('Do people come back?', retentionCard(d), { cls: 'wide', sub: 'Based on the votes people leave (the device cookie the site already needs to count one vote each), not on tracking' })}
      <div class="agrid two">
        ${card('From visit to share', funnel(d), { sub: 'Unique visitors at each step' })}
        ${card('The product so far', `<div class="bignums"><div><b>${fmt(d.totals.votes)}</b><span>votes in total</span></div><div><b>${fmt(d.totals.countries)}</b><span>countries on the map</span></div><div><b>${fmt(d.totals.devices)}</b><span>devices that voted</span></div></div>${bars(d.questions.slice(0, 6), { label: (r) => qname(r.q), value: (r) => r.n, color: 'var(--sun)' })}`, { sub: 'All time, from the votes tables' })}
      </div>`;
  }

  function audienceTab(d) {
    const tot = d.countries.reduce((a, r) => a + r.visitors, 0);
    const weekNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hourBars = lineChartHours(d.hours);
    return `<div class="agrid two">
        ${card('Countries', bars(d.countries.slice(0, 15), { label: (r) => country(r.code), value: (r) => r.visitors, total: tot, icon: (r) => flag(r.code), color: 'var(--teal)' }), { sub: 'Visitors by country (from the host\'s edge headers)', right: `<span class="pill">${d.countries.length} countries</span>` })}
        ${card('Cities', bars(d.cities.slice(0, 15), { label: (r) => `${r.city}, ${country(r.country)}`, value: (r) => r.visitors, icon: (r) => flag(r.country), color: 'var(--leaf)' }))}
      </div>
      <div class="agrid three">
        ${card('Devices', bars(d.devices))}
        ${card('Browsers', bars(d.browsers, { color: 'var(--grape)' }), { sub: 'Includes in-app browsers (Instagram, TikTok…)' })}
        ${card('Operating systems', bars(d.os, { color: 'var(--sky)' }))}
      </div>
      <div class="agrid three">
        ${card('Languages', bars(d.langs, { color: 'var(--pink)' }))}
        ${card('Screen width', bars(d.widths, { color: 'var(--tomato)' }))}
        ${card('Pages per visit', `<div class="bignums one"><div><b>${d.kpi.cur.sessions ? (d.kpi.cur.views / d.kpi.cur.sessions).toFixed(1) : '0'}</b><span>pageviews per visit</span></div><div><b>${fmt(d.kpi.cur.sessions)}</b><span>visits</span></div></div>`)}
      </div>
      <div class="agrid two">
        ${card('Time of day', hourBars, { sub: `Visitors by hour, your local time (UTC${tzOff >= 0 ? '+' : ''}${tzOff})` })}
        ${card('Day of week', `<ul class="bars">${(() => { const max = Math.max(1, ...d.weekdays); return d.weekdays.map((n, i) => `<li><span class="bar-fill" style="width:${(n / max) * 100}%;background:var(--sun)"></span><span class="bar-l">${weekNames[i]}</span><span class="bar-n">${fmt(n)}</span></li>`).join(''); })()}</ul>`)}
      </div>`;
  }
  function lineChartHours(hours) {
    const order = Array.from({ length: 24 }, (_, i) => i).sort((a, b) => ((a + tzOff + 24) % 24) - ((b + tzOff + 24) % 24));
    const max = Math.max(1, ...hours);
    return `<div class="hours">${order.map((h) => `<div class="hr" title="${hourLabel(h)}: ${hours[h]}"><i style="height:${Math.max(2, (hours[h] / max) * 100)}%"></i><span>${(h + tzOff + 24) % 24 === Math.round((h + tzOff + 24) % 24) && Math.round((h + tzOff + 24) % 24) % 3 === 0 ? String(Math.round((h + tzOff + 24) % 24) % 24).padStart(2, '0') : ''}</span></div>`).join('')}</div>`;
  }

  function sourcesTab(d) {
    const tot = d.channels.reduce((a, r) => a + r.visitors, 0);
    const v = d.viral, shareClicks = d.breakdown?.share_click?.ch || {};
    const viral = card('Viral loop: do shares bring new people?', `<div class="bignums"><div><b>${fmt(v.visitors)}</b><span>visitors who arrived through a shared link</span></div><div><b>${(v.share * 100).toFixed(1)}%</b><span>of all visitors</span></div><div><b>${v.sharers ? v.perSharer.toFixed(2) : '0'}</b><span>new visitors per person who shared</span></div></div>
      <div class="agrid two"><div><p class="note">Arrived via (share channel)</p>${bars(v.bySource.map((x) => ({ k: x.s, n: x.n })), { color: 'var(--tomato)' })}</div><div><p class="note">Share options clicked</p>${bars(Object.entries(shareClicks).sort((p, q) => q[1] - p[1]).map(([k, n]) => ({ k, n })), { color: 'var(--grape)' })}</div></div>`, { cls: 'wide', sub: 'Every link people share ends in ?s=channel. Above 1.0 new visitors per sharer, the product spreads by itself' });
    return `${viral}<div class="agrid two">
      ${card('Where visitors come from', bars(d.channels, { label: (r) => r.name, value: (r) => r.visitors, total: tot, color: 'var(--tomato)' }), { sub: 'Referrers and campaign tags, grouped' })}
      ${card('Landing pages', bars(d.entries, { label: (r) => r.path, value: (r) => r.n, color: 'var(--teal)' }), { sub: 'The first page of a visit' })}
    </div>
    ${card('Campaigns (UTM links)', d.campaigns.length ? `<table class="atable"><thead><tr><th>Campaign</th><th>Source</th><th>Medium</th><th class="r">Visitors</th></tr></thead><tbody>${d.campaigns.map((r) => `<tr><td>${esc(r.campaign)}</td><td>${esc(r.source || '')}</td><td>${esc(r.medium || '')}</td><td class="r">${fmt(r.visitors)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No tagged links yet. Add <code>?utm_source=x&amp;utm_campaign=launch</code> to a link you post and it shows up here.</p>', { cls: 'wide', sub: 'Tag every link you post so you know which post worked' })}
    <div class="agrid two">
      ${card('Link builder', `<form class="utm" id="utm"><label>Page<input id="utm-p" value="https://whichcountryareyou.com/"></label><label>Source<input id="utm-s" placeholder="x, reddit, whatsapp"></label><label>Campaign<input id="utm-c" placeholder="launch"></label><div class="utm-out"><code id="utm-o"></code><button class="abtn" type="button" id="utm-copy">Copy</button></div></form>`, { sub: 'Build a tagged link in one step' })}
      ${card('Social previews', `<p class="note">Link previews use <code>/og.png</code>. Paste the site into X, WhatsApp and Facebook once to check the image and title look right.</p><p class="note"><a href="/og.png" target="_blank" rel="noopener">Open the preview image</a></p>`)}
    </div>`;
  }

  function productTab(d) {
    const byGroup = new Map();
    for (const e of d.events) { if (e.name === 'perf') continue; const [g, label] = EVENTS[e.name] || ['Other', e.name]; (byGroup.get(g) || byGroup.set(g, []).get(g)).push({ ...e, label }); }
    const groups = [...GROUPS, 'Other'].filter((g) => byGroup.has(g));
    const evCards = groups.map((g) => card(g, `<table class="atable"><thead><tr><th>Event</th><th class="r">Times</th><th class="r">People</th></tr></thead><tbody>${byGroup.get(g).map((e) => {
      const bd = BREAKDOWN_LABEL[e.name]; let sub = '';
      if (bd && d.breakdown[e.name]?.[bd[0]]) { const m = Object.entries(d.breakdown[e.name][bd[0]]).sort((a, b) => b[1] - a[1]).slice(0, 6); sub = `<tr class="sub"><td colspan="3">${bd[1]}: ${m.map(([k, n]) => `${esc(bd[0] === 'q' ? (e.name === 'place_vote' ? qname(k) : qname(k)) : k)} <b>${fmt(n)}</b>`).join(' · ')}</td></tr>`; }
      return `<tr><td>${esc(e.label)}</td><td class="r">${fmt(e.n)}</td><td class="r">${fmt(e.u)}</td></tr>${sub}`;
    }).join('')}</tbody></table>`)).join('');
    const tourStart = d.events.find((e) => e.name === 'tour_start')?.u || 0, tourDone = d.events.find((e) => e.name === 'tour_done')?.u || 0;
    return `<div class="agrid two">
      ${card('Top pages', `<table class="atable"><thead><tr><th>Page</th><th class="r">Views</th><th class="r">Visitors</th><th class="r">Avg time</th><th class="r">Scroll</th></tr></thead><tbody>${d.pages.map((r) => `<tr><td>${esc(r.path)}</td><td class="r">${fmt(r.views)}</td><td class="r">${fmt(r.visitors)}</td><td class="r">${r.avgDur ? dur(r.avgDur) : '-'}</td><td class="r">${r.scroll ? r.scroll + '%' : '-'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No data yet.</td></tr>'}</tbody></table>`, { sub: 'Scroll = how far down people get on average' })}
      ${card('Most voted questions', bars(d.questions.slice(0, 14), { label: (r) => qname(r.q), value: (r) => r.n, color: 'var(--sun)' }), { sub: 'All time' })}
    </div>
    ${tourStart ? card('Tutorial completion', `<div class="bignums one"><div><b>${fmt(tourStart)}</b><span>started</span></div><div><b>${fmt(tourDone)}</b><span>finished</span></div><div><b>${pct(tourDone, tourStart)}%</b><span>completion</span></div></div>`) : ''}
    <div class="agrid two">${evCards || card('Events', '<p class="empty">No events recorded yet.</p>')}</div>`;
  }

  function healthTab(d) {
    const LIM = { lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500], ttfb: [800, 1800] };
    const rate = (m, v) => (v == null ? 'na' : !LIM[m] ? 'na' : v <= LIM[m][0] ? 'good' : v <= LIM[m][1] ? 'mid' : 'poor');
    const fv = (m, v) => (v == null ? '-' : m === 'cls' ? v.toFixed(3) : v >= 1000 ? (v / 1000).toFixed(2) + ' s' : Math.round(v) + ' ms');
    const rows = [['lcp', 'Largest paint (LCP)', 'How fast the main content shows. Good: under 2.5 s'], ['inp', 'Responsiveness (INP)', 'How quickly taps and clicks react. Good: under 200 ms'], ['cls', 'Layout shift (CLS)', 'Does the page jump while loading. Good: under 0.1'], ['ttfb', 'Server response (TTFB)', 'How fast the server answers. Good: under 0.8 s'], ['load', 'Full load', 'Everything loaded']];
    const P = d.perf;
    const cell = (grp, m) => { const x = P[grp][m]; if (!x || x.p75 == null) return '<td class="r">-</td>'; const good = x.n ? Math.round((x.good / x.n) * 100) : null; return `<td class="r"><span class="rate ${rate(m, x.p75)}">${fv(m, x.p75)}</span>${good != null && LIM[m] ? `<small class="gd">${good}% good</small>` : ''}</td>`; };
    const n = P.all.lcp?.n || 0;
    const perf = card('Speed (what real visitors experience)', n ? `<table class="atable perf"><thead><tr><th>Metric</th><th class="r">Everyone</th><th class="r">Phones</th><th class="r">Desktop</th></tr></thead><tbody>${rows.map(([m, l, h]) => `<tr><td>${l}<small class="hint">${h}</small></td>${cell('all', m)}${cell('Phone', m)}${cell('Desktop', m)}</tr>`).join('')}</tbody></table><p class="note">Typical (75th percentile) values from ${fmt(n)} page loads. Green is good, amber needs work, red is poor.</p>` : '<p class="empty">No measurements yet. They arrive as visitors load pages.</p>', { cls: 'wide', sub: 'Core Web Vitals, measured in the visitor\'s own browser' });
    const errs = card('Browser errors', d.errors.length ? `<table class="atable"><thead><tr><th>Error</th><th>File</th><th class="r">Times</th><th class="r">People</th><th>Browser</th><th class="r">Last</th></tr></thead><tbody>${d.errors.map((e) => `<tr><td>${esc(e.m || '')}</td><td>${esc(e.f || '')}</td><td class="r">${fmt(e.n)}</td><td class="r">${fmt(e.u)}</td><td>${esc(e.browser || '')}</td><td class="r">${ago(e.last)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No browser errors recorded in this period.</p>', { cls: 'wide', sub: 'JavaScript errors people hit, so you can fix them before anyone complains' });
    return `${perf}${errs}<div class="agrid three">
      ${card('Pages that do not exist (404)', bars(d.notFound.map((x) => ({ k: x.path, n: x.n })), { color: 'var(--tomato)' }), { sub: 'Broken links and typos' })}
      ${card('Failed votes', bars(d.voteErrors.map((x) => ({ k: 'HTTP ' + x.s, n: x.n })), { color: 'var(--tomato)' }), { sub: '429 means a rate limit was hit' })}
      ${card('Links that leave the site', bars(d.outbound.map((x) => ({ k: x.h, n: x.n })), { color: 'var(--sky)' }))}
    </div>`;
  }

  const KIND = { idea: '💡 Idea', bug: '🐛 Bug', love: '💛 Love', other: '💬 Other' };
  function feedbackTab() {
    const items = state.fb;
    if (!items) { api('feedback').then((r) => { state.fb = r.items; if (state.tab === 'feedback') root.querySelector('.abody').innerHTML = feedbackTab(); }).catch(() => {}); return '<div class="loading"><i></i><i></i><i></i></div>'; }
    if (!items.length) return card('Feedback', '<p class="empty">Nothing yet. Messages sent from the site (footer link or Pinny) land here.</p>');
    const row = (x) => `<li class="fbk${x.done ? ' done' : ''}"><div class="fbh"><b>${KIND[x.kind] || KIND.other}</b><span>${x.country ? flag(x.country) + esc(country(x.country)) : ''}</span><span>${esc(x.page || '')}</span><span>${ago(x.ts)}</span></div><p>${esc(x.message)}</p>${x.contact ? `<p class="fbc">Reply to: <b>${esc(x.contact)}</b></p>` : ''}<div class="fba"><button class="abtn" data-fb="${x.done ? 'open' : 'done'}" data-id="${x.id}">${x.done ? 'Reopen' : 'Mark done'}</button><button class="abtn ghost" data-fb="delete" data-id="${x.id}">Delete</button></div></li>`;
    return card('Feedback', `<ul class="fbl">${items.map(row).join('')}</ul>`, { cls: 'wide', sub: `${items.filter((x) => !x.done).length} open, ${items.length} total` });
  }

  function liveTab() {
    const L = state.live || state.data;
    const feed = L.feed || [];
    const icon = (e) => { const n = e.name || ''; return e.kind === 'pv' ? '👁️' : n.startsWith('vote') || n === 'place_vote' ? '🗳️' : n.startsWith('share') ? '📣' : n.startsWith('tour') ? '🎓' : n.startsWith('map') ? '🗺️' : n.startsWith('pinny') ? '📍' : n === 'badge' ? '🏅' : n === 'egg' ? '🥚' : '✨'; };
    const text = (e) => { if (e.kind === 'pv') return `Viewed <b>${esc(e.path)}</b>`; const [, label] = EVENTS[e.name] || ['', e.name]; let p = ''; try { const j = e.props ? JSON.parse(e.props) : null; if (j) p = ' · ' + Object.entries(j).map(([k, v]) => `${k}: ${v}`).join(', '); } catch { /* ignore */ } return `${esc(label)}${esc(p)}`; };
    return `<div class="live-hero"><div class="live-n"><span class="dot"></span><b>${fmt(L.live)}</b></div><p>${L.live === 1 ? 'person' : 'people'} on the site in the last 5 minutes</p></div>
      ${card('Activity', feed.length ? `<ul class="feed">${feed.map((e) => `<li><span class="fi">${icon(e)}</span><span class="ft">${text(e)}</span><span class="fw">${flag(e.country)}${e.city ? esc(e.city) + ', ' : ''}${e.country ? esc(country(e.country)) : 'Unknown'}</span><span class="fd">${esc(e.device || '')}</span><span class="fa">${ago(e.ts)}</span></li>`).join('')}</ul>` : '<p class="empty">Nothing yet. Open the site in another tab and it appears here.</p>', { cls: 'wide', sub: 'Updates every few seconds' })}`;
  }

  // ---------- page shell
  function shell() {
    const d = state.data;
    const range = RANGES.map(([n, l]) => `<button class="rng${state.days === n ? ' on' : ''}" data-days="${n}">${l}</button>`).join('');
    const tabs = TABS.map(([k, l]) => `<button class="tab${state.tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('');
    const body = !d ? '<div class="loading"><i></i><i></i><i></i></div>' : ({ overview: overviewTab, audience: audienceTab, sources: sourcesTab, product: productTab, health: healthTab, feedback: feedbackTab, live: liveTab }[state.tab])(d);
    const foot = d ? `<footer class="afoot">${fmt(d.totals.events)} analytics events stored${d.totals.first ? ` since ${new Date(d.totals.first).toLocaleDateString()}` : ''}${d.totals.last ? `. Last event ${ago(d.totals.last)}` : ''}. Data is first-party, cookieless and anonymous (visitors are a daily hash, IPs are never stored). Updated ${ago(d.generatedAt)}.</footer>` : '';
    root.innerHTML = `<div class="adm view">
      <header class="atop"><div class="atitle"><h1>Analytics</h1><span class="live-pill" id="live-pill"><i></i><b>${d ? fmt(d.live) : '…'}</b> online</span></div>
        <div class="atools"><div class="rngs">${range}</div><button class="abtn" id="refresh" title="Refresh">Refresh</button><a class="abtn" href="/api/admin/export?days=${state.days}">Export CSV</a><button class="abtn ghost" id="logout">Sign out</button></div></header>
      <nav class="atabs">${tabs}</nav>
      <div class="abody">${body}</div>${foot}</div>`;
    wireCharts(root);
    wireUtm();
  }
  function wireUtm() {
    const f = root.querySelector('#utm'); if (!f) return;
    const upd = () => { try { const u = new URL(root.querySelector('#utm-p').value || location.origin); const s = root.querySelector('#utm-s').value.trim(), c = root.querySelector('#utm-c').value.trim(); if (s) u.searchParams.set('utm_source', s); if (c) u.searchParams.set('utm_campaign', c); root.querySelector('#utm-o').textContent = u.toString(); } catch { root.querySelector('#utm-o').textContent = 'Enter a full URL'; } };
    f.addEventListener('input', upd); upd();
    root.querySelector('#utm-copy').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(root.querySelector('#utm-o').textContent); e.target.textContent = 'Copied'; setTimeout(() => (e.target.textContent = 'Copy'), 1500); } catch { /* ignore */ } });
  }

  async function load() {
    state.loading = true;
    try { state.data = await api('stats?days=' + state.days); }
    catch (err) { if (err.status === 401) return mountAdmin(root, { esc, fmt, flagImg }); root.querySelector('.abody').innerHTML = `<p class="empty">Could not load the numbers: ${esc(err.message)}</p>`; return; }
    finally { state.loading = false; }
    shell();
  }
  async function loadLive() {
    try { state.live = await api('live'); const pill = root.querySelector('#live-pill b'); if (pill) pill.textContent = fmt(state.live.live); if (state.tab === 'live' && state.data) { root.querySelector('.abody').innerHTML = liveTab(); } } catch { /* ignore */ }
  }

  root.onclick = async (e) => {
    const r = e.target.closest('[data-days]'); if (r) { state.days = Number(r.dataset.days); sessionStorage.setItem('adm_days', state.days); state.data = null; shell(); return load(); }
    const t = e.target.closest('[data-tab]'); if (t) { state.tab = t.dataset.tab; history.replaceState(null, '', '#' + state.tab); shell(); return; }
    const fb = e.target.closest('[data-fb]'); if (fb) { await api('feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: Number(fb.dataset.id), action: fb.dataset.fb }) }).catch(() => {}); state.fb = null; root.querySelector('.abody').innerHTML = feedbackTab(); return; }
    if (e.target.closest('#refresh')) { state.fb = null; }
    if (e.target.closest('#refresh')) { state.data = null; shell(); return load(); }
    if (e.target.closest('#logout')) { await api('logout', { method: 'POST' }).catch(() => {}); try { localStorage.removeItem('wcay_notrack'); } catch { /* ignore */ } return mountAdmin(root, { esc, fmt, flagImg }); }
  };

  shell();
  await load();
  clearInterval(window.__admTimer); clearInterval(window.__admLive);
  window.__admTimer = setInterval(() => { if (!document.hidden && document.body.contains(root.querySelector('.adm'))) load(); else if (!root.querySelector('.adm')) clearInterval(window.__admTimer); }, 60000);
  window.__admLive = setInterval(() => { if (!document.hidden && root.querySelector('.adm')) loadLive(); else if (!root.querySelector('.adm')) clearInterval(window.__admLive); }, 5000);
}

// ---------- sign in
function loginView(root, me, esc, done) {
  root.innerHTML = `<div class="adm view"><div class="alogin"><h1>Admin</h1>
    ${me.configured ? '<p>Enter your admin key to see the analytics.</p><form id="lf"><input id="key" type="password" autocomplete="current-password" placeholder="Admin key" autofocus><button class="abtn pri" type="submit">Sign in</button></form><p class="err" id="err"></p>'
      : '<p class="err">Admin is switched off. Add an <code>ADMIN_TOKEN</code> environment variable in Vercel (Settings, Environment Variables) with a long random value, redeploy, then come back here.</p>'}
    <p class="fine">Your own visits are not counted once you sign in on this browser.</p></div></div>`;
  const f = root.querySelector('#lf');
  f?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#err');
    err.textContent = '';
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: root.querySelector('#key').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not sign in');
      try { localStorage.setItem('wcay_notrack', '1'); } catch { /* ignore */ }
      done();
    } catch (x) { err.textContent = x.message; }
  });
}
