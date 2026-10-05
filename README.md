# Which Country Are You?

A tiny census taken by anyone. whichcountryareyou.com

One dependency (`@libsql/client`), no build step. Needs Node 20+.

```bash
npm run seed    # optional: fake demo votes so the pages look alive (local only)
npm run dev     # http://localhost:3000
npm run seed:clear   # remove the demo votes
```

## Where things live

| File | What |
| --- | --- |
| `questions.js` | Every question, option and reward. Add one here and it appears everywhere. |
| `core.js` | The request handler: API (`/api/questions`, `/api/vote`), abuse limits, pages. |
| `dev-server.js` | Local/Docker server around `core.js`. |
| `api/index.js` | Vercel function around `core.js`. |
| `db.js` | libSQL (local file or Turso): one row per (question, device), plus a running tally. |
| `templates/index.html` | HTML shell (meta tags are filled in per page). |
| `public/site.js` | The whole frontend. |
| `public/styles.css` | All styling. One `--h` hue variable drives the colour of everything. |

## The map

`/map` and the landing page show an interactive world map: coloured by votes for any country question, smooth zoom to continents and countries, drag, pinch and Ctrl+scroll zoom, your own answer pinned. Outlines live in `public/map.json`, built from Natural Earth with `npm run build:map` (dev dependencies only; the result is committed). `public/map.js` is loaded only when the map scrolls into view.

## Country pages

`/c/sk`, `/c/us`, ... show what the people from a country answer, next to the world's answers, with a "what makes it different" strip of the biggest gaps. Built by joining votes on the device that said it is from that country (`countryProfile` in `db.js`, cached for 60 s, endpoint `/api/country/:cc`). Groups under 5 voters are hidden. Tap a country in the country results or on the map to open its page. In local demo data the seed script invents linked "people" so the pages have something to show.

## Pinny, the pet

`public/guide.js` is a flying companion. On the landing page he sits on the hill; scroll down and he takes off (wings, sparkle trail) and tags along, switching sides with a short tip per section. Elsewhere he waits bottom right. Eyes follow the cursor, hovering gets hearts, you can pick him up and carry him, he reacts to votes, badges and secrets, falls asleep when you stop, and now and then does a trick (somersault, orbit, loop, zoomies, chase, yawn, peek, dance). Click him for a mini passport that wipes into the full passport. `public/tour.js` is the 1-minute tutorial he offers on the first visit.

## Sharing

The share popup (`public/share.js`) offers WhatsApp, X, Instagram (copies the link), Facebook, Telegram, Reddit, email and copy link. For answered questions it also draws a personal image card in the browser (`public/card.js`, 1080x1350) that can be saved or, on phones, shared directly. Link previews use `public/og.png`, drawn by `npm run build:og -- path/to/Fredoka.ttf`.

## Cities, states and regions

After choosing a country you can pick where in it you are from. Every country has its own question `place-xx` (for example `/q/place-us`), built on demand from `public/places.json`: the biggest cities, capitals, and states or regions where they matter (all 50 US states plus DC). Data comes from Natural Earth (public domain), built with `npm run build:places -- path/to/ne_10m_populated_places_simple.geojson`. On the map, zooming to a country shows its cities as dots sized by votes, with name tags for the main ones, and you can vote right from the map.

## Analytics and admin panel

Our own, first-party analytics (`analytics.js`, `public/track.js`) and an admin panel at `/admin` (`public/admin.js`). Cookieless and anonymous: a visitor is a hash of secret + day + IP + browser that changes daily, IPs are never stored, "Do Not Track" is respected, and bots are ignored. Geography comes from Vercel's edge headers. It records pageviews, time on page and scroll depth, referrers and UTM tags, device/browser/OS/language, and product events (votes, shares by channel, tour, map, Pinny, secrets).

Admin: set an `ADMIN_TOKEN` environment variable (a long random string) in Vercel and redeploy, then open `/admin` and sign in with it. Without `ADMIN_TOKEN` the panel is off. Tabs: Overview (KPIs vs the previous period, traffic and votes charts, funnel, do-people-come-back from the votes table), Audience (countries, cities, devices, time of day), Acquisition (channels, viral loop from share links tagged `?s=channel`, UTM campaigns, link builder), Product (pages, top questions, events), Health (Core Web Vitals, browser errors, 404s, failed votes, outbound links), Live (who is on the site now). CSV export of raw events. Signing in on a browser excludes your own visits from the counts there. Locally the key is `dev-admin`.

## Passport, badges and secrets

`/profile` is the passport: level, playtime, streaks and 27 badges (`public/me.js`, saved in `localStorage`, no accounts). Badges unlock from your answers and from small actions (opening the map, zooming to every continent, sharing). There are 8 hidden easter eggs in `public/eggs.js`. The share popup is `public/share.js`; brand icons are from simple-icons (CC0).

Long lists (countries, languages, animals) scroll inside their own box with search and sort chips and load 30 rows at a time.

## Look and feel

Cut-paper world, light only (no dark mode, on purpose). Cream paper with a map-doodle backdrop (`public/doodles.svg`), torn-edge hills and a swinging bunting of flags in the hero (drawn in `public/app.js`: `skySVG`, `hillsSVG`, `buildBunting`), chunky paper strips for answers, confetti on every vote.

Flags are self-hosted in `public/flags/` (from [flag-icons](https://github.com/lipis/flag-icons), MIT, licence included). Countries use their ISO code; languages and cuisines carry a `flag` in `questions.js`. Add a flag to any option the same way.

## How abuse is limited

- One vote per question per device (cookie). Changing your answer replaces it.
- A one-way hash of the IP, salted with `SECRET` and the date, caps new devices per question per network per day (`IP_CAP`, default 6). Raw IPs are never stored.
- Votes per minute per network are rate limited (`RATE_PER_MIN`).

This stops casual griefing, not a determined attacker with many IPs. If it ever matters, add Cloudflare Turnstile on the vote endpoint.

## Rewards (the "you voted dogs, here are dog videos" idea)

Any option in `questions.js` can have a `reward`: `{ facts: [...] }`, `{ video: 'YOUTUBE_ID' }` or `{ links: [...] }`. It shows right after voting. Colors, cats and dogs have starter facts.

## Deploy on Vercel + Turso

Votes need a real database, because Vercel functions have no disk that survives. Turso is SQLite in the cloud with a free tier.

1. Create a database at turso.tech (or `turso db create wcay`), then get its URL and a token (`turso db show wcay --url`, `turso db tokens create wcay`).
2. In Vercel: Project, Settings, Environment Variables. Add for Production (and Preview if you want):
   - `TURSO_DATABASE_URL` = `libsql://...`
   - `TURSO_AUTH_TOKEN` = the token
   - `SECRET` = any long random string (used to hash IPs)
   - `SITE_URL` = `https://whichcountryareyou.com`
3. Redeploy. Tables are created automatically on the first request.
4. Settings, Domains: add `whichcountryareyou.com`.

The frontend is `public/site.js` and the local server `dev-server.js` on purpose: Vercel auto-detects files named `app.js` / `server.js` / `index.js` as the app entrypoint and would run them as the function. `api/index.js` is the only function; `vercel.json` routes the API, pages and sitemap to it, and static files come from `public/`.

## Local server / Docker

`npm run dev` uses a local file (`data/votes.db`). The Dockerfile does the same with the file on a mounted volume at `/data`, for hosts like Fly.io or Railway.

Environment: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SECRET`, `SITE_URL`, `ADMIN_TOKEN`, `IP_CAP`, `RATE_PER_MIN`, `PORT`, `TRUST_PROXY=1` (only behind a proxy that sets the client IP; automatic on Vercel).

Back up the database regularly. It is the whole product.
