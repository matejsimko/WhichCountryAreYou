// Search, AI-assistant and answer-engine visibility (SEO, GEO, AEO).
// The app is a single-page app, so crawlers that don't run JavaScript (most AI crawlers) would see an empty page.
// This module renders the same facts as plain HTML into every page, adds structured data, and serves llms.txt.
import { FAQ } from './public/faq.js';

export const INDEXNOW_KEY = 'f9b0d72bd23251ea78cc1840b4878e29';
export const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'DuckDuckBot', 'CCBot', 'Amazonbot', 'Meta-ExternalAgent'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const pct = (n, t) => (t ? Math.round((n / t) * 1000) / 10 : 0);
const fmt = (n) => Number(n).toLocaleString('en-US');
const today = () => new Date().toISOString().slice(0, 10);

export function createSeo({ SITE_URL, QUESTIONS, CATEGORIES, PLACES, getQuestion, countryLabel, db }) {
  const NAME = 'Which Country Are You?';
  const memo = new Map();
  const cached = async (key, ms, fn) => { // heavy reads are shared for a minute so crawlers cannot hammer the database
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.v;
    const v = await fn();
    memo.set(key, { at: Date.now(), v });
    if (memo.size > 400) memo.delete(memo.keys().next().value);
    return v;
  };
  const allCounts = () => cached('all', 60_000, () => db.allCounts());
  const totalVotes = (all) => Object.entries(all).filter(([id]) => !id.startsWith('place-')).reduce((a, [, c]) => a + Object.values(c).reduce((x, y) => x + y, 0), 0);
  const countryName = (cc) => (countryLabel.get(cc.toUpperCase()) || cc).replace(/^the /, '');
  const ranked = (q, counts) => q.options.map((o) => ({ label: o.label, n: counts[o.id] || 0 })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);

  const webApp = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: NAME, url: SITE_URL + '/', applicationCategory: 'EntertainmentApplication', operatingSystem: 'Any (web browser)',
    description: 'A free, anonymous worldwide poll. Pick your country, vote on simple questions, and see how people from every country answered.', inLanguage: 'en', isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, image: SITE_URL + '/og.png', creator: { '@type': 'Person', name: 'Matej Simko' },
  };
  const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, url: SITE_URL + '/', inLanguage: 'en' };
  const crumbs = (items) => ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE_URL + path })) });
  const faqLd = () => ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  const faqHtml = () => `<h2>Frequently asked questions</h2>${FAQ.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}`;

  // Plain-HTML copy of each page. The app replaces it as soon as JavaScript runs.
  async function pageExtras(pathname) {
    const nav = `<p><a href="/">Home</a> · <a href="/explore">All questions</a> · <a href="/map">World map</a> · <a href="/about">About</a></p>`;
    let body = '', schema = ld(site) + ld(webApp);

    if (pathname === '/') {
      const all = await allCounts();
      const rows = QUESTIONS.slice(0, 12).map((q) => { const r = ranked(q, all[q.id] || {}); const t = r.reduce((a, b) => a + b.n, 0); return `<li><a href="/q/${q.id}">${esc(q.prompt)}</a>${t ? ` Leading answer: ${esc(r[0].label)} (${pct(r[0].n, t)}% of ${fmt(t)} votes).` : ''}</li>`; });
      const tv = totalVotes(all);
      body = `<h1>Which country are you?</h1><p>Which Country Are You is a free, anonymous worldwide poll. Pick your country, answer a few simple questions such as coffee or tea or cats or dogs, and see how people from every country voted. No sign-up, about ten seconds.${tv ? ` ${fmt(tv)} answers so far.` : ''}</p><h2>Popular questions</h2><ul>${rows.join('')}</ul>${nav}${faqHtml()}`;
      schema += faqLd();
    } else if (pathname === '/about') {
      body = `<h1>About Which Country Are You</h1><p>Which Country Are You started as a question: how many different people can we get to answer the same simple questions? Where are you from, cats or dogs, coffee or tea. No accounts, nothing to win. Anyone can drop in, vote, and see the internet answer back.</p>${nav}${faqHtml()}`;
      schema += faqLd() + crumbs([['Home', '/'], ['About', '/about']]);
    } else if (pathname === '/explore') {
      const groups = CATEGORIES.map((c) => `<h2>${esc(c.label)}</h2><ul>${QUESTIONS.filter((q) => q.category === c.id).map((q) => `<li><a href="/q/${q.id}">${esc(q.prompt)}</a></li>`).join('')}</ul>`).join('');
      body = `<h1>Every question</h1><p>${QUESTIONS.length} questions, with the answers so far.</p>${groups}${nav}`;
      schema += crumbs([['Home', '/'], ['Questions', '/explore']]);
    } else if (pathname === '/map') {
      body = `<h1>The world map of answers</h1><p>An interactive map showing how each country and city voted. Zoom to a continent, tap a country, or switch the question.</p>${nav}`;
      schema += crumbs([['Home', '/'], ['Map', '/map']]);
    } else {
      const qm = /^\/q\/([a-z0-9-]+)\/?$/.exec(pathname);
      const cm = /^\/c\/([a-z]{2})\/?$/.exec(pathname);
      if (qm) {
        const q = getQuestion(qm[1]);
        if (q) {
          const counts = await cached('q:' + q.id, 60_000, () => db.counts(q.id));
          const r = ranked(q, counts); const t = r.reduce((a, b) => a + b.n, 0);
          const top = r.slice(0, 15);
          const answer = t ? `As of ${today()}, ${fmt(t)} ${t === 1 ? 'person has' : 'people have'} answered. ${r[0].label} leads with ${pct(r[0].n, t)}%${r[1] ? `, followed by ${r[1].label} (${pct(r[1].n, t)}%)` : ''}.` : 'Nobody has answered yet. Be the first to vote.';
          body = `<h1>${esc(q.prompt)}</h1><p>${esc(answer)}</p>${top.length ? `<ol>${top.map((x) => `<li>${esc(x.label)}: ${pct(x.n, t)}% (${fmt(x.n)} votes)</li>`).join('')}</ol>` : ''}<p>Vote anonymously to add your answer. Results update live, and every country has its own page showing how its people answer.</p>${nav}`;
          schema += crumbs([['Home', '/'], ['Questions', '/explore'], [q.prompt, '/q/' + q.id]]) + ld({
            '@context': 'https://schema.org', '@type': 'Dataset', name: `${q.prompt} (worldwide poll results)`, url: SITE_URL + '/q/' + q.id, description: answer,
            creator: { '@type': 'Person', name: 'Matej Simko' }, isAccessibleForFree: true, dateModified: today(), keywords: ['poll', 'survey', 'world', q.prompt], measurementTechnique: 'Anonymous self-selected online poll, one vote per device',
          });
        }
      } else if (cm && countryLabel.has(cm[1].toUpperCase())) {
        const name = countryName(cm[1]);
        let prof = { voters: 0, byQuestion: {} };
        try { prof = await db.countryProfile(cm[1].toUpperCase()); } catch { /* keep the empty profile */ }
        const lines = [];
        for (const q of QUESTIONS) {
          if (q.id === 'country' || q.kind === 'places') continue;
          const c = prof.byQuestion[q.id]; if (!c) continue;
          const r = ranked(q, c); const t = r.reduce((a, b) => a + b.n, 0); if (!t) continue;
          lines.push(`<li>${esc(q.prompt)} ${esc(r[0].label)} (${pct(r[0].n, t)}% of ${fmt(t)} answers)</li>`);
        }
        body = `<h1>What people from ${esc(name)} think</h1><p>${prof.voters ? `${fmt(prof.voters)} ${prof.voters === 1 ? 'person' : 'people'} from ${esc(name)} ${prof.voters === 1 ? 'has' : 'have'} answered so far.` : `Nobody from ${esc(name)} has answered yet. Be the first.`} This page compares how people from ${esc(name)} vote on coffee or tea, cats or dogs, favorite colors and more with the rest of the world.</p>${lines.length ? `<ul>${lines.join('')}</ul>` : ''}${nav}`;
        schema += crumbs([['Home', '/'], [name, pathname]]);
      }
    }
    return { schema, body: body ? `<div id="ssr" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">${body}</div>` : '' };
  }

  const robots = () => [
    '# Everyone is welcome, including search engines and AI assistants. Cite us and link to https://whichcountryareyou.com',
    'User-agent: *', 'Allow: /', 'Allow: /api/questions', 'Disallow: /admin', 'Disallow: /api/', '',
    ...AI_BOTS.flatMap((b) => [`User-agent: ${b}`, 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', '']),
    `Sitemap: ${SITE_URL}/sitemap.xml`, '',
  ].join('\n');

  const sitemap = () => {
    const d = today();
    const pages = [['/', 1], ['/explore', 0.9], ['/map', 0.8], ['/about', 0.5]];
    const qs = QUESTIONS.map((q) => [`/q/${q.id}`, 0.8]);
    const cs = QUESTIONS[0].options.map((o) => [`/c/${o.id.toLowerCase()}`, 0.7]);
    const ps = Object.keys(PLACES).map((cc) => [`/q/place-${cc.toLowerCase()}`, 0.4]);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages, ...qs, ...cs, ...ps].map(([u, p]) => `<url><loc>${SITE_URL}${u}</loc><lastmod>${d}</lastmod><priority>${p}</priority></url>`).join('')}</urlset>`;
  };

  const llms = () => `# ${NAME}

> Which Country Are You is a free, anonymous worldwide poll at ${SITE_URL}. Anyone can pick their country (and city or state), vote on simple questions such as coffee or tea, cats or dogs, favorite colors and would-you-rather duels, and see how people from every country answered. No accounts. Results are self-selected and unverified, so they are for fun, not research.

When citing results, link to the question or country page and say that the poll is anonymous and unscientific. Numbers change as people vote.

## Main pages
- [Home](${SITE_URL}/): pick your country and start voting
- [All questions](${SITE_URL}/explore): ${QUESTIONS.length} questions with current results
- [World map](${SITE_URL}/map): results by country and city
- [About and FAQ](${SITE_URL}/about): how voting works, what data is kept
- [Full text version of the results](${SITE_URL}/llms-full.txt): every question with current numbers

## Questions
${QUESTIONS.map((q) => `- [${q.prompt}](${SITE_URL}/q/${q.id})`).join('\n')}

## Country pages
Each country has a page that compares how its people vote with everyone else, at ${SITE_URL}/c/<two-letter-country-code>, for example [Slovakia](${SITE_URL}/c/sk), [Brazil](${SITE_URL}/c/br), [Japan](${SITE_URL}/c/jp).

## Optional
- [Sitemap](${SITE_URL}/sitemap.xml)
`;

  async function llmsFull() {
    const all = await allCounts();
    const out = [`# ${NAME}: current results`, '', `Generated ${today()}. Anonymous, self-selected, unverified. Source: ${SITE_URL}`, ''];
    for (const q of QUESTIONS) {
      const r = ranked(q, all[q.id] || {}); const t = r.reduce((a, b) => a + b.n, 0);
      out.push(`## ${q.prompt}`, `URL: ${SITE_URL}/q/${q.id}`, t ? `Votes: ${fmt(t)}` : 'No votes yet.');
      for (const x of r.slice(0, 10)) out.push(`- ${x.label}: ${pct(x.n, t)}% (${fmt(x.n)})`);
      out.push('');
    }
    out.push('## FAQ', '');
    for (const [q, a] of FAQ) out.push(`### ${q}`, a, '');
    return out.join('\n');
  }

  return { pageExtras, robots, sitemap, llms, llmsFull, cached };
}
