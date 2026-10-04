# Which Country Are You?

A tiny census taken by anyone. whichcountryareyou.com

No dependencies, no build step. Needs Node 22.13+ (uses the built-in `node:sqlite`).

```bash
npm run seed    # optional: fake demo votes so the pages look alive (local only)
npm run dev     # http://localhost:3000
npm run seed:clear   # remove the demo votes
```

## Where things live

| File | What |
| --- | --- |
| `questions.js` | Every question, option and reward. Add one here and it appears everywhere. |
| `server.js` | API (`/api/questions`, `/api/vote`), abuse limits, serves the app. |
| `db.js` | SQLite: one row per (question, device), plus a running tally. |
| `public/app.js` | The whole frontend. |
| `public/styles.css` | All styling. One `--h` hue variable drives the colour of everything. |

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

## Deploy

Any host that runs Node or Docker and has a persistent disk works. Fly.io example:

```bash
fly launch --no-deploy
fly volumes create data --size 1
# in fly.toml add:  [mounts] source="data" destination="/data"
fly secrets set SECRET=$(openssl rand -hex 32) SITE_URL=https://whichcountryareyou.com
fly deploy
```

Environment: `PORT`, `DB_PATH`, `SECRET`, `SITE_URL`, `TRUST_PROXY=1` (only behind a proxy that sets the client IP), `IP_CAP`, `RATE_PER_MIN`.

Back up the SQLite file (`votes.db`) regularly. It is the whole product.
