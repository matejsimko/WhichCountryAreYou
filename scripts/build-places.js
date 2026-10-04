// Builds public/places.json: the cities (and states/regions) people can pick after choosing a country.
// Source: Natural Earth "populated places" (public domain). Run:  node scripts/build-places.js path/to/ne_10m_populated_places_simple.geojson
// Same projection as build-map.js, so every place already has its x,y on the map.
import fs from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import isoCountries from 'i18n-iso-countries';

const src = process.argv[2];
if (!src) { console.error('Usage: node scripts/build-places.js <populated_places.geojson>'); process.exit(1); }
const gj = JSON.parse(fs.readFileSync(src, 'utf8'));
const projection = geoNaturalEarth1().fitWidth(1000, { type: 'Sphere' });
const r1 = (n) => Math.round(n * 10) / 10;

const alpha2 = (p) => {
  if (p.adm0_a3 === 'KOS' || p.adm0_a3 === 'XKX') return 'XK';
  return isoCountries.alpha3ToAlpha2(p.adm0_a3) || (p.iso_a2 && p.iso_a2 !== '-99' ? p.iso_a2 : null);
};
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// countries where states/provinces matter enough to offer them too
const REGIONS = new Set(['US', 'CA', 'AU', 'DE', 'BR', 'MX', 'IN', 'CN', 'RU', 'JP', 'AR', 'ES', 'IT', 'FR', 'GB', 'PL', 'ID', 'NG', 'ZA', 'TR', 'KR', 'UA', 'SK', 'CZ', 'AT', 'CH']);
const byCountry = new Map();
for (const f of gj.features) {
  const p = f.properties;
  const cc = alpha2(p);
  if (!cc) continue;
  (byCountry.get(cc) ?? byCountry.set(cc, []).get(cc)).push({ p, ll: [p.longitude, p.latitude] });
}

const out = {};
let cities = 0, regions = 0;
for (const [cc, list] of byCountry) {
  const rows = [];
  // cities: biggest first; always the capital and at least 8, then everything over 250k, with a cap
  const cap = cc === 'US' ? 140 : ['IN', 'CN', 'BR', 'RU', 'DE', 'GB', 'FR', 'JP', 'MX'].includes(cc) ? 60 : 36;
  const seen = new Set();
  const sorted = [...list].sort((a, b) => b.p.pop_max - a.p.pop_max);
  for (const { p, ll } of sorted) {
    const key = p.nameascii + '|' + p.adm1name;
    if (seen.has(key)) continue;
    const isCap = p.adm0cap === 1;
    if (rows.length >= cap) break;
    if (!(isCap || rows.length < 8 || p.pop_max >= 250000)) continue;
    seen.add(key);
    const [x, y] = projection(ll) || [];
    if (x === undefined) continue;
    rows.push([`c${p.ne_id}`, p.name, p.adm1name || '', r1(x), r1(y), p.pop_max, 'c']);
    cities++;
  }
  if (REGIONS.has(cc)) {
    const caps = list.filter(({ p }) => /Admin-1 capital|Admin-1 region capital/.test(p.featurecla) || p.adm0cap === 1);
    const names = new Map();
    for (const { p, ll } of caps) if (p.adm1name && !names.has(p.adm1name)) names.set(p.adm1name, { p, ll });
    if (names.size >= 5) {
      for (const [name, { p, ll }] of names) {
        const [x, y] = projection(ll) || [];
        if (x === undefined) continue;
        rows.push([`r-${slug(name)}`, name, '', r1(x), r1(y), p.pop_max, 'r']);
        regions++;
      }
    }
  }
  if (rows.length) out[cc] = rows;
}
fs.writeFileSync('public/places.json', JSON.stringify(out));
const kb = Math.round(fs.statSync('public/places.json').size / 1024);
console.log(`${Object.keys(out).length} countries, ${cities} cities, ${regions} regions, ${kb} KB`);
console.log('US:', out.US.filter((r) => r[6] === 'r').length, 'states,', out.US.filter((r) => r[6] === 'c').length, 'cities. SK:', out.SK.map((r) => r[1]).join(', '));
