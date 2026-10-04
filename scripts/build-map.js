// Builds public/map.json (country outlines as SVG paths) from Natural Earth data. Run once: npm run build:map
// The result is committed, so the site itself needs none of these dev dependencies.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import isoCountries from 'i18n-iso-countries';
import { countries as continents } from 'countries-list';

const require = createRequire(import.meta.url);
const topo = require('world-atlas/countries-50m.json');

const W = 1000;
const fc = feature(topo, topo.objects.countries);
const features = fc.features.filter((f) => f.id !== '010'); // no Antarctica

const projection = geoNaturalEarth1().fitWidth(W, { type: 'Sphere' });
const path = geoPath(projection).digits(1);
const r1 = (n) => Math.round(n * 10) / 10;

// numeric id (ISO 3166-1) -> alpha-2; Kosovo has no id in this dataset
const alpha2 = (f) => (f.id ? isoCountries.numericToAlpha2(String(f.id).padStart(3, '0')) : f.properties.name === 'Kosovo' ? 'XK' : null);

const out = [];
const skipped = [];
for (const f of features) {
  const code = alpha2(f);
  if (!code) { skipped.push(f.properties.name); continue; }
  const d = path(f);
  if (!d) continue;
  // zoom target and pin position come from the largest piece (so Alaska, Svalbard, Guiana don't stretch them)
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })) : [f.geometry];
  const main = polys.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
  const [[x0, y0], [x1, y1]] = path.bounds(main);
  const [cx, cy] = path.centroid(main);
  out.push({ c: code, n: f.properties.name, k: continents[code]?.continent || null, d, b: [r1(x0), r1(y0), r1(x1), r1(y1)], p: [r1(cx), r1(cy)] });
}

// continent views, as lon/lat boxes -> projected boxes
const BOXES = {
  world: null,
  europe: [-25, 34, 45, 72],
  asia: [25, -11, 150, 62],
  africa: [-20, -36, 55, 38],
  na: [-170, 7, -50, 75],
  sa: [-85, -57, -33, 14],
  oceania: [110, -48, 180, 2],
};
const views = {};
for (const [k, b] of Object.entries(BOXES)) {
  if (!b) {
    const [[x0, y0], [x1, y1]] = path.bounds({ type: 'FeatureCollection', features });
    views[k] = [r1(x0), r1(y0), r1(x1 - x0), r1(y1 - y0)];
    continue;
  }
  const [lo0, la0, lo1, la1] = b;
  const pts = [];
  for (let i = 0; i <= 8; i++) for (const lat of [la0, la1]) pts.push(projection([lo0 + ((lo1 - lo0) * i) / 8, lat]));
  for (let i = 0; i <= 8; i++) for (const lon of [lo0, lo1]) pts.push(projection([lon, la0 + ((la1 - la0) * i) / 8]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  views[k] = [r1(x0), r1(y0), r1(x1 - x0), r1(y1 - y0)];
}

fs.writeFileSync('public/map.json', JSON.stringify({ views, countries: out }));
const kb = Math.round(fs.statSync('public/map.json').size / 1024);
console.log(`${out.length} countries, ${kb} KB. Skipped (no ISO code): ${skipped.join(', ') || 'none'}`);
