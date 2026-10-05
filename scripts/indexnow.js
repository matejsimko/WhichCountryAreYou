// Tells Bing, Yandex and other IndexNow search engines (and the AI tools built on them) that our pages exist or changed.
// Run after a deploy:  node scripts/indexnow.js            (all sitemap pages)
//                      node scripts/indexnow.js /q/coffee-or-tea /about
import { INDEXNOW_KEY } from '../seo.js';

const SITE = (process.env.SITE_URL || 'https://whichcountryareyou.com').replace(/\/$/, '');
let urls = process.argv.slice(2).map((p) => (p.startsWith('http') ? p : SITE + p));
if (!urls.length) {
  const xml = await (await fetch(SITE + '/sitemap.xml')).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
for (let i = 0; i < urls.length; i += 9000) {
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls.slice(i, i + 9000) }),
  });
  console.log(`IndexNow: sent ${Math.min(9000, urls.length - i)} urls, HTTP ${r.status}`);
}
