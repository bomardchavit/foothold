# Foothold

Find your footing in the job search. Foothold turns a résumé into a structured profile, ranks public job postings against it with a **visible fit breakdown**, answers questions through a copilot that **cites your profile line by line**, tailors your résumé per role with a **diff you approve**, tracks applications, surfaces people you already know at a company, and fills Greenhouse/Lever forms from a Chrome extension. You submit every application yourself.

Everything the AI produces shows what changed and why. Jobs come from public APIs and a seed dataset only. Contacts come from your own LinkedIn export or manual entry.

## Install it

| Surface | What it is | Updates |
|---|---|---|
| Web | The app itself, at your deployment's URL. | Continuous: every deploy. |
| Desktop | An Electron shell around that deployment (`apps/desktop`): own window, Dock icon, no tabs. | Checks GitHub Releases on launch and every 6 hours, downloads in the background, installs on restart. Screens come from the server, so most changes need no new installer. |
| Chrome extension | Autofill for Greenhouse, Lever, Ashby and Workday (`apps/extension`). | Chrome Web Store builds update themselves; an unpacked build has to be replaced by hand. |

`/download` lists the installers for the latest GitHub Release (and says so plainly when none is published yet).

```bash
npm run desktop              # run the desktop shell against a local server
npm run desktop:dist         # build installers into apps/desktop/release
FOOTHOLD_APP_URL=https://foothold.example.com npm run desktop:dist   # bake in the server for distribution
npm run build:extension      # dist/ for "Load unpacked" + a store-ready zip in apps/extension/release
```

On first launch the desktop app asks for a server address (or uses the one baked in at build time) and checks
`/api/version` before saving it. Magic-link emails open in the browser, not in the app, so the app has a
**File → Paste Sign-in Link…** screen; Google sign-in works in the window directly.

Deployment (Fly.io config, Postgres requirements, pointing the apps at it) is in
[docs/DEPLOY.md](docs/DEPLOY.md).

## Ship an update

```bash
npm run release -- minor     # bumps web, desktop and extension to one version, commits, tags
git push --follow-tags       # the tag builds and publishes installers; main deploys the server
```

`.github/workflows/release.yml` builds macOS, Windows and Linux installers and publishes them to the GitHub
Release that the desktop updater reads, then attaches the extension zip. `.github/workflows/deploy.yml` pushes
the server image to GHCR and deploys it (Fly.io config in `fly.toml`). Repository variable `FOOTHOLD_APP_URL`
is baked into the shipped desktop app and extension.

Signing, which affects how updates behave:

- **macOS**: without `MAC_CSC_LINK`/`APPLE_ID` secrets the build still publishes, but users see a Gatekeeper
  warning and silent auto-update does not work. With a Developer ID it is seamless.
- **Windows**: unsigned NSIS installs and auto-updates fine; SmartScreen warns on first run until the
  certificate (or reputation) exists.
- **Chrome**: only Web Store listings auto-update. Self-hosted CRX auto-update works on Edge and via
  enterprise policy, not stock Chrome.


## Run it in 15 minutes

Requirements: **Node 22+** and one of Docker, macOS, or your own PostgreSQL 17 with `pgvector` and `pg_trgm`.

```bash
git clone <this repo> foothold && cd foothold
npm install
node scripts/ensure-env.mjs            # creates apps/web/.env from .env.example

# Database, pick one:
docker compose up -d                   # A) Docker: pgvector/pgvector:pg17 on localhost:54329
npm run db:local                       # B) macOS, no Docker: downloads PostgreSQL 17 + pgvector once and starts it
#                                      # C) your own Postgres: set DATABASE_URL in apps/web/.env

npm run db:migrate                     # Prisma migrations (+ enables vector and pg_trgm)
npm run db:seed                        # 311 synthetic jobs, H-1B sample, demo user with matches
npm run dev                            # http://localhost:3000
```

Sign in at `/sign-in` with the **development login** (no email needed): `demo@foothold.local` is a seeded, fully onboarded profile. Any other address creates a fresh account and starts onboarding.

No API keys are required to run every flow: without `ANTHROPIC_API_KEY` the app uses rule-based parsing, a template copilot that still cites lines, and relevance-based tailoring. Add keys later and the same flows switch to Claude and Voyage embeddings.

## Environment variables (`apps/web/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres 17 with pgvector. Default matches docker compose and `db:local`. |
| `AUTH_SECRET`, `AUTH_URL` | yes | Auth.js. Change the secret in production. |
| `DEV_LOGIN` | dev | `true` shows the password-less dev login (ignored in production). |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | no | Google sign-in. |
| `AUTH_RESEND_KEY`, `EMAIL_FROM` | no | Magic-link and digest email via Resend. Without it, links and digests print to the server console. |
| `LLM_MODE` | no | `auto` (default: Anthropic when a key is set, else heuristic), `anthropic`, `heuristic`, `fixture` (tests). |
| `ANTHROPIC_API_KEY` | no | Enables Claude for résumé parsing, the copilot, tailoring, outreach. `LLM_MODEL_MAIN` (default `claude-opus-5`), `LLM_MODEL_BULK` (default `claude-haiku-4-5` for job parsing). |
| `EMBEDDINGS_PROVIDER`, `VOYAGE_API_KEY`, `OPENAI_API_KEY` | no | `auto` uses Voyage `voyage-3.5-lite` (1024-d) if set, else OpenAI `text-embedding-3-small` at 1024-d, else a deterministic local embedding. |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | no | Analytics. No-op when empty. |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT` | no | Extra job sources. Greenhouse, Lever and Ashby boards need no keys. |
| `JOBS_MODE` | no | `inline` (default: background work runs after the response) or `queue` (pg-boss; run `npm run worker`). |
| `STORAGE_DIR`, `CRON_SECRET`, `APP_URL` | no | Upload storage dir, cron auth for `/api/cron/digest`, public URL used in emails and the extension. |

## Jobs workspace

`/jobs` is the main screen: left navigation, `JOBS › Recommended · Liked · Applied · External` tabs with counts, a filter chip bar (location, roles, level, job type, workplace, date posted, industry, years of experience, hidden jobs, all filters), sort, and job cards with a score panel (percent ring, Strong/Good/Fair match, H-1B and compensation signals, alumni inside). Hide (⊘) and like (♥) act instantly with undo; the right rail keeps saved filter combinations. Skeleton loading, an error boundary with retry, and per-tab empty states are built in; the layout collapses to a top bar + drawer below 1024px.

## Scraper pipeline

Everything comes from public APIs or robots.txt-compliant crawling, with one identified user agent (`FootholdBot`), one request at a time per host, Crawl-delay honoured, and backoff on 429/503. There is deliberately **no proxy or user-agent rotation and no anti-bot circumvention**: a site that blocks the bot is reported, not evaded.

| Source | How | Slug |
|---|---|---|
| Greenhouse, Lever, Ashby | official public job-board JSON APIs | board token / site / board name |
| SmartRecruiters, Workable | public posting APIs | company identifier / subdomain |
| Workday | the JSON the career site itself uses, only where robots.txt allows `/wday/cxs/` | `tenant.wd5/SiteName` |
| Any careers site | crawl job links + sitemap, read schema.org `JobPosting` JSON-LD, render with headless Chromium when the page is JS-only | careers page URL |
| Adzuna, USAJobs | keyed APIs | search query |

```bash
npm run scrape -- bootstrap                        # register + ingest ~130 curated US employers (Settings → Job sources has a button for it)
npm run scrape -- discover stripe.com              # find the ATS a company uses, register it, ingest
npm run scrape -- careers https://example.com/careers
npm run scrape -- greenhouse:stripe                # one source by kind:slug
npm run scrape                                     # every enabled source once
npm run scrape -- poll                             # one scheduler tick: only the sources whose turn has come
npm run scrape:watch                               # every 30 minutes (or run `npm run worker` for the 6-hourly schedule)
npm run scrape -- export                           # data/exports/jobs.json, normalized
npm run scrape -- logos --retry                    # every company gets a logo (site icon → favicon services → generated mark); --retry re-probes generated marks
npm run scrape -- logos --revalidate               # re-check stored logos against the shape rules, replace share banners and broken files
npm run scrape -- industries                       # curated employer industries and headcount buckets overwrite keyword guesses and blanks
npm run scrape -- prune                            # retire postings outside JOBS_COUNTRIES
npm run scrape -- reparse                          # re-run the parser over stored postings after a parser change (no refetch), re-score changed rows
```

Postings a board stops returning are marked closed and drop out of the feed, scoring, digests and similar-roles (rows a user tracked are kept, with a "No longer listed" badge on the job page).

**Runs on its own, every ten minutes.** While the app is running, an in-process scheduler ticks every
`SCRAPE_INTERVAL_MIN` minutes (default 10) and polls every source whose turn has come, API boards first so a slow site
crawl never delays the rest. Boards are asked what changed before anything is parsed:

| Board | How a poll works | Cost when nothing changed |
|---|---|---|
| Greenhouse | index endpoint (12× smaller, carries `updated_at` per posting) + `If-None-Match`; changed postings fetched one by one | one small request, nothing parsed |
| Ashby, Lever | whole board with `If-None-Match` | one small request, nothing parsed |
| SmartRecruiters | posting list polled, only new ids opened | one list request |
| Careers sites, Workday | full crawl, hourly rather than every tick | n/a |

Measured across 103 live sources: a steady tick polls 82 in about 3.5 minutes and 71 of them answer "no change".
Postings that vanish from a board are closed and drop out of the feed. Per-source timeouts, a tick budget and a
failure backoff keep one bad board from holding up a tick, and `/jobs` shows how many roles arrived today and when the
boards were last checked. With `JOBS_MODE=queue` the worker takes over on its own schedule. `JOBS_COUNTRIES=US` (default) keeps only US-located, remote, or unplaceable postings and prunes the rest. Company logos are fetched from each company's own site (apple-touch-icon / icon links / favicon, robots-compliant) and served from `/api/logo/:companyId`, with a public favicon service as fallback and an initials tile after that. **No API keys are involved in scraping**; only Adzuna/USAJobs (extra sources) and Anthropic/Voyage (AI features) need keys.