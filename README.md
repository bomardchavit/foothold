# Foothold

Find your footing in the job search. Foothold turns a résumé into a structured profile, ranks public job postings against it with a **visible fit breakdown**, answers questions through a copilot that **cites your profile line by line**, tailors your résumé per role with a **diff you approve**, tracks applications, surfaces people you already know at a company, and fills Greenhouse/Lever forms from a Chrome extension. You submit every application yourself.

Everything the AI produces shows what changed and why. Jobs come from public APIs and a seed dataset only. Contacts come from your own LinkedIn export or manual entry.

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
npm run scrape -- discover stripe.com              # find the ATS a company uses, register it, ingest
npm run scrape -- careers https://example.com/careers
npm run scrape -- greenhouse:stripe                # one source by kind:slug
npm run scrape                                     # every enabled source once
npm run scrape:watch                               # every 30 minutes (or run `npm run worker` for the 6-hourly schedule)
npm run scrape -- export                           # data/exports/jobs.json, normalized
```

Each posting is normalized (title, company, location, remote/hybrid/onsite, employment type, level, required/preferred skills, years, salary, posting date, apply URL, source), deduplicated by content hash, by near-duplicate fingerprint across sources, and across companies (agency reposts), quality-flagged (stale, scam patterns, missing employer domain), embedded, and scored for every onboarded profile. Headless rendering needs Chromium once: `npx playwright install chromium` in `apps/web`. Tune with `SCRAPER_MIN_DELAY_MS`, `SCRAPER_MAX_PAGES`, `SCRAPER_CONTACT`.

## Seeding and data

- `npm run db:seed` loads `data/seed/jobs.json` (311 fictional postings across 40 fictional companies, including stale, scam-pattern and cross-agency duplicate examples), `data/seed/h1b_sample.csv` (a small illustrative slice shaped like the USCIS H-1B Employer Data Hub), 25 curated Greenhouse/Lever/Ashby boards (disabled until you enable them), and the demo user.
- Regenerate the synthetic dataset: `node scripts/generate-seed.mjs`.
- Real jobs: Settings → Job sources → enable a board and press Run, or `npm run ingest -- greenhouse:stripe`. `npm run ingest` runs every enabled source. Runs also happen every 6 hours when the worker is on.
- Real H-1B data: download the CSV from the [USCIS H-1B Employer Data Hub](https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub) and run `npm run h1b:load -- path/to/file.csv`.
- Sample résumés for testing: `data/seed/resumes/*.txt|pdf|docx`.

## Phase demos

| Phase | What to try |
|---|---|
| 1 Profile | Sign in with a new email → upload `data/seed/resumes/priya_natarajan.pdf` → review the structured profile (every field editable) → set preferences. |
| 2 Matching | `/feed`: ranked cards with the six-segment fit bar. Open a job: full breakdown with evidence, you-vs-requirements table, keyword gaps. Filters: fit threshold, posted-within, location, remote, seniority, industry, salary, H-1B signal, low-quality toggle. |
| 3 Copilot | On a job, “Ask Belay why I match”. Every claim carries `[P#]`/`[J#]`/`[M#]` chips; hover to see the source line. Try gaps, cover letter, interview prep, should I apply. |
| 4 Résumé AI | On a job, “Tailor my résumé”. Changes tab shows per-bullet diffs labeled Reworded / Expanded / Added; keep or revert each; “Grounded only” strips unverified content; export PDF or DOCX. |
| 5 Tracker + Insights | `/tracker` kanban with timestamps, notes, résumé used. `/insights`: skills you are missing most across your top 100 matches. |
| 6 Network | `/network`: import a LinkedIn `Connections.csv` or add contacts; job pages show people who work(ed) there with shared school/employer; draft referral, coffee-chat and alumni messages. |
| 7 Extension | `npm run build:extension`, load `apps/extension/dist` unpacked in Chrome, pair it in Settings → Chrome extension, open a Greenhouse or Lever application and press Fill. |
| 8 Signals + digest | H-1B badges on cards (USCIS exact match = sponsors, fuzzy = likely). Low-quality listings hidden by default. Digest: Settings → “Send me a digest now”, or `POST /api/cron/digest` with `Authorization: Bearer $CRON_SECRET`. |

## How the score works

Six components, each 0–100, weighted skills 35 / profile relevance 20 / seniority 15 / years 10 / industry 10 / location 10. Weights renormalize when a component does not apply (no location preference, no industry preference, no embeddings yet). Unknown job data scores 50 and is labeled. Skills use a canonical taxonomy with aliases and an implication map for matching only (Next.js counts as React). Details: `packages/shared/src/scoring.ts`.

## How grounding is enforced (in code)

- **Copilot**: context is line-numbered (P = profile, J = posting, M = breakdown). After each answer, `apps/web/src/lib/copilot/grounding.ts` validates every citation id, checks that any claimed skill or number exists in the profile, and flags uncited claims. With Claude, a failing answer is regenerated once with the violations; still-ungrounded sentences are replaced with “I can't ground this from your profile.” The UI shows the status.
- **Tailoring**: the model only returns bullet rewrites, ordering, skills and a summary; employers, titles and dates are copied from the profile by code. Every rewritten bullet passes a classifier: a new tool/skill or number not in the profile forces the label **Expanded** (or **Added**) with the reason shown. You decide per bullet, and “Grounded only” exports strip them.

## Architecture

`apps/web` (Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, Prisma + pgvector, Auth.js, Anthropic SDK, pg-boss) · `apps/extension` (Manifest V3, Vite + CRXJS) · `packages/shared` (zod schemas, skill taxonomy, scoring, ATS field patterns shared with the extension) · `data/seed`.

Background jobs (parse, embed, match, ingest, digest) run inline after the request by default; set `JOBS_MODE=queue` and run `npm run worker` for a separate process with scheduled ingestion (every 6 h) and digests (13:00 UTC).

## Deployment

- **Web**: any Node 22 host. `npm ci && npm run build -w apps/web && npm run start -w apps/web` with `DATABASE_URL` pointing at Postgres 17 + pgvector and `AUTH_URL`/`APP_URL` set to the public origin. A `Dockerfile` is included: `docker build -t foothold . && docker run -p 3000:3000 --env-file apps/web/.env foothold`.
- **Worker**: run `npm run worker -w apps/web` as a second process with `JOBS_MODE=queue` on the web app; it owns ingestion every 6 h and digests at 13:00 UTC. Without a worker, background work runs inline after each request and `npm run scrape:watch` keeps jobs fresh.
- **Migrations**: `npm run db:migrate` on deploy (Prisma `migrate deploy`).
- **Digest cron** without a worker: `POST /api/cron/digest` with `Authorization: Bearer $CRON_SECRET`.

## Tests

```bash
npm run typecheck
npm test                 # Vitest: scoring, taxonomy, parsers, quality flags, grounding, tailoring classifier
npm run e2e              # Playwright: onboard, match, tailor (needs the DB seeded; starts the dev server)
```

## Analytics events

`user_signed_up`, `onboarding_step_completed`, `profile_completed`, `feed_viewed` (retention anchor: weekly return), `job_viewed`, `match_breakdown_opened`, `low_quality_toggled`, `copilot_asked`, `resume_tailored`, `tailoring_diff_accepted`, `resume_exported` (activation: first tailored export), `application_status_changed`, `outreach_sent`, `contacts_imported`, `extension_paired`, `extension_autofill_used`, `digest_sent`.

## Data and legal notes

Jobs: Greenhouse Job Board API, Lever Postings API, Ashby Posting API, Adzuna (attribution required in your UI if you enable it), USAJobs, plus the fictional seed set. No HTML scraping anywhere. H-1B: public USCIS data. Contacts: your own export. Résumé text is sent only to the Anthropic API when a key is configured. Account deletion removes everything.

## Known limits

Résumé parsing without a key is rule-based (best on single-column résumés). Semantic relevance without an embeddings key uses a local hashed embedding, so calibrate expectations (the other five components carry the score). The extension targets Greenhouse and Lever; Ashby and Workday pages are detected but field coverage is partial.
