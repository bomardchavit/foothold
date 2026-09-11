# Deploying Foothold

The server is one container plus a Postgres with `pgvector`. The desktop app and the extension are thin
clients: once the server is up, every change you deploy reaches them without anyone downloading anything.

## What the server needs

| Thing | Why | Note |
|---|---|---|
| Postgres 15+ with `pgvector` and `pg_trgm` | Job/profile embeddings and fuzzy search | The first migration runs `CREATE EXTENSION`, so the roles just need permission. Neon, Supabase, Fly Postgres and RDS all work. |
| A persistent disk | Company logos, uploaded résumés, generated PDFs | `STORAGE_DIR`, 2-3 GB is plenty. |
| An always-on process | The scraper scheduler runs in-process every `SCRAPE_INTERVAL_MIN` | Scale-to-zero hosts stop the crawl; keep one machine running. |

Required environment: `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_URL` and `APP_URL`
(both the public URL). Optional: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`/`OPENAI_API_KEY`, `AUTH_RESEND_KEY`,
`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `CRON_SECRET`, `ADZUNA_*`, `USAJOBS_API_KEY`,
`NEXT_PUBLIC_POSTHOG_KEY`. Every AI feature falls back to a deterministic implementation without keys.

## Fly.io

Install flyctl once (`brew install flyctl`, or the installer at https://fly.io/docs/flyctl/install/), then:

```bash
fly auth login
fly launch --no-deploy --copy-config --name foothold --region iad   # reads fly.toml, creates the app
fly volumes create foothold_data --size 3 --region iad              # logos, résumés, exports

# Postgres: Fly's own, or paste a Neon/Supabase URL instead of these two lines
fly postgres create --name foothold-db --region iad --initial-cluster-size 1
fly postgres attach foothold-db --app foothold                      # sets DATABASE_URL

fly secrets set AUTH_SECRET="$(openssl rand -base64 32)" \
  AUTH_URL="https://foothold.fly.dev" APP_URL="https://foothold.fly.dev"
fly deploy
fly open /api/version                                               # {"app":"foothold",...}
```

Migrations run on every boot, so a deploy never needs a separate step.

Then hand deploys to CI: create a token with `fly tokens create deploy -x 8760h` and save it as the
`FLY_API_TOKEN` repository secret. After that, every push to `main` deploys (`.github/workflows/deploy.yml`).

## Point the apps at the deployment

Set the repository **variable** `FOOTHOLD_APP_URL` to the public URL. It is baked into the desktop app and
the extension at build time, so new installs connect with no setup:

```bash
gh variable set FOOTHOLD_APP_URL --body "https://foothold.fly.dev"
npm run release -- patch && git push --follow-tags   # rebuild installers with the URL baked in
```

People who already installed the app keep their own server setting (Foothold → Server…), and the updater
brings them the new shell either way.

## First run in production

```bash
fly ssh console -C "npm run ingest -w apps/web -- bootstrap"   # register ~130 US employers and ingest
fly ssh console -C "npm run h1b:load -w apps/web"              # USCIS sponsorship data (optional)
```

`DEV_LOGIN` must stay unset in production: it is ignored when `NODE_ENV=production`, and without an email
provider the magic-link URL is printed to the server log instead of being sent.

## Other hosts

Any host that runs the Dockerfile works the same way: Railway, Render, a VPS with
`docker compose`, or Kubernetes. The image is also published to
`ghcr.io/bomardchavit/foothold:latest` on every push to `main`.

Vercel needs two changes first: the in-process scheduler in `apps/web/src/instrumentation.ts` has to become a
cron hitting an ingest route, and `STORAGE_DIR` has to be swapped for Blob storage in `apps/web/src/lib/storage.ts`.
