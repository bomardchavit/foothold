# Foothold — Phase 0 plan

Working name: **Foothold** (copilot: **Belay**). Trademark clearance is yours to run.

Anti-copy rules: warm paper/charcoal palette with a terracotta accent (no teal or green), serif display + sans body, top navigation (no left rail), match shown as a segmented "fit bar" (no percent ring), copilot as a right slide-over opened from a small dock, initials avatars (no logos). All copy original.

## 1. Stack decisions (deviations flagged)
- Next.js 15.5 App Router, TypeScript strict, Tailwind v4, shadcn/ui. Next 16 is current; pinned to 15 per spec, trivial to bump.
- Postgres 16 + pgvector (`pgvector/pgvector:pg16` image), Prisma with `Unsupported("vector(1024)")` and one typed raw-SQL module for vector ops; `pg_trgm` for fuzzy employer matching.
- **Auth: Auth.js v5 (NextAuth) over Clerk.** Reason: no third-party account for the 15-minute setup; Prisma adapter; Google + magic-link email (Resend in prod, link logged to console in dev); a credentials "dev login" provider enabled only outside production, for Playwright.
- **LLM: official `@anthropic-ai/sdk`, no wrapper.** `claude-opus-5` for resume parsing, copilot, tailoring, outreach; `claude-haiku-4-5` for bulk job-description parsing and the auxiliary entity extractor. Structured outputs via `messages.parse()` + zod, streaming via `messages.stream()`, prompt caching on the profile and job context blocks, server-side refusal fallbacks (`fallbacks: "default"`) on Opus calls. Every call logged to `LlmCall` (tokens, cost, task).
- **Embeddings: Voyage `voyage-3.5-lite`, 1024 dims**, behind an `Embedder` interface. Alternate: OpenAI `text-embedding-3-small` with `dimensions=1024` so the column never changes. When no key is set, a deterministic local hashed-n-gram embedder runs (dev/CI only, labeled in the UI).
- **Queue: BullMQ + Redis over Inngest.** Reason: self-hosted, no account, repeatable jobs built in. Queues: `resume-parse`, `embed`, `ingest`, `match`, `digest`. One worker process.
- Files: storage adapter; local disk in dev, S3-compatible in prod.
- PDF export via `@react-pdf/renderer` (real text, no headless Chrome). DOCX via `docx`.
- Monorepo, pnpm workspaces: `apps/web`, `apps/extension` (Vite + CRXJS, MV3), `packages/shared` (zod schemas, skill taxonomy, ATS field map, autofill profile type).
- Analytics: `posthog-js` (autocapture off, explicit events) + `posthog-node`.
- Tests: Vitest; Playwright runs with `LLM_MODE=fixture` so CI needs no keys.
- No HTML fetching anywhere. If one is ever added it goes through a robots.txt-checking client.

## 2. Data model (Prisma)
```
User, Account, Session, VerificationToken            (Auth.js)
CandidateProfile  1:1 User — name, contact, links, headline, summary,
                  targetRoles[], locations[], remotePref, seniority, workAuth,
                  needsSponsorship, salaryFloor, industries[], companySizes[],
                  yearsExperience (computed), lastFeedVisitAt, onboardingCompletedAt,
                  embedding vector(1024), version
Experience        profileId, company, title, location, startDate, endDate, isCurrent, order
Bullet            experienceId | projectId, text, order      <- identity for diffs and citations
Education         profileId, school, degree, field, start, end, gpa
Project           profileId, name, url, description
Skill             profileId, name, canonical, category, source(PARSED|MANUAL)
ResumeUpload      userId, fileName, mime, storageKey, rawText, parsedJson, status
ResumeDocument    userId, kind(BASE|TAILORED), jobId?, contentJson, diffJson, gapsJson,
                  validationJson, pdfKey?, docxKey?
Company           name, normalizedName (unique), domain?, industry, size,
                  h1bSignal(YES|LIKELY|UNKNOWN), h1bMatchedName?
JobSource         kind(GREENHOUSE|LEVER|ASHBY|ADZUNA|USAJOBS|SEED), slug, enabled, lastRunAt
IngestionRun      sourceId, startedAt, finishedAt, fetched, inserted, updated, errorsJson
Job               sourceId+externalId (unique), companyId, title, description, location,
                  city, region, country, isRemote, seniority, requiredSkills[],
                  preferredSkills[], yearsMin, yearsMax, salaryMin/Max/currency/period,
                  industry, postedAt, firstSeenAt, lastSeenAt, applyUrl, contentHash,
                  qualityFlags[], isLowQuality, embedding vector(1024), rawJson
H1bEmployer       fiscalYear, employerName, normalizedName, city, state,
                  initialApprovals, initialDenials, continuingApprovals, continuingDenials
MatchScore        profileId+jobId (unique), total, skills, semantic, seniority, years,
                  industry, location, breakdownJson, profileVersion, computedAt
CopilotConversation  userId, jobId?, title
CopilotMessage    conversationId, role, content, citationsJson, groundingStatus
Contact           userId, firstName, lastName, email?, currentCompany, title, schools[],
                  pastCompanies[], source(LINKEDIN_CSV|MANUAL), connectedOn, notes
OutreachDraft     userId, contactId, jobId?, kind(REFERRAL|COFFEE_CHAT|ALUMNI_INTRO), body, markedSentAt
Application      userId+jobId (unique), status, resumeDocumentId?, appliedAt
ApplicationEvent  applicationId, fromStatus?, toStatus, at
ApplicationNote   applicationId, body, createdAt
ExtensionToken    userId, tokenHash, lastUsedAt, revokedAt
DigestSend        userId, sentAt, jobIds[], openedAt
LlmCall           userId?, task, model, inputTokens, outputTokens, cacheReadTokens, costUsd, ok
```

## 3. API surface
Server Actions handle in-app mutations (profile edits, tracker moves, notes, contacts). Route handlers where streaming, uploads, tokens, or cron are involved:

| Route | Purpose |
|---|---|
| `POST /api/resume/upload`, `GET /api/resume/upload/:id` | upload, queue parse, poll status |
| `GET/PUT /api/profile`, `POST /api/profile/complete` | profile CRUD; complete triggers embed + match |
| `GET /api/jobs` (filters, paging), `GET /api/jobs/:id` | feed; detail with breakdown, comparison, gaps |
| `GET /api/feed/new` | ranked jobs since `lastFeedVisitAt` |
| `GET /api/insights/skill-gaps` | aggregate over the top 100 matches |
| `POST /api/copilot/chat` (SSE) | streaming grounded chat; conversation persisted |
| `POST /api/resume/base`, `POST /api/resume/tailor` | generate; tailor returns diff + validation |
| `POST /api/resume/:id/decisions` | accept or reject diff hunks |
| `GET /api/resume/:id/export?format=pdf|docx` | export |
| `GET /api/jobs/:id/keyword-gaps` | gap list with grounded suggestions |
| `POST /api/contacts/import`, `GET /api/companies/:id/insiders` | CSV import; insider graph |
| `POST /api/outreach`, `POST /api/outreach/:id/mark-sent` | drafts; the user marks sent |
| `GET/POST /api/applications`, `PATCH /api/applications/:id` | tracker |
| `POST /api/extension/pair`, `GET /api/extension/profile`, `POST /api/extension/track` | pairing-code auth, autofill profile, record an application |
| `POST /api/ingest/run` (admin), `POST /api/cron/digest` (CRON_SECRET) | ops |

## 4. Component tree
```
app/
  (marketing)/page                    landing
  (auth)/sign-in                      Google + magic link
  (app)/layout                        TopNav · CopilotDock · Toaster · PostHogProvider
    onboarding/[step]                 UploadStep -> ReviewStep(ProfileEditor) -> PreferencesStep -> Done
    feed/                             FilterRail · MatchList(MatchCard -> FitBar) · JobSheet(JobDetail)
    jobs/[id]/                        JobHeader · FitBar · BreakdownPanel(EvidenceList) · ComparisonTable
                                      · KeywordGapList · InsidersPanel · TailorButton · TrackButton
    insights/                         SkillGapChart · TopMatchesSummary
    resumes/, resumes/[id]            ResumeList · ResumePreview · DiffView(DiffHunk) · ExportMenu
    tracker/                          KanbanBoard(Column -> ApplicationCard) · ApplicationDrawer(Timeline, Notes)
    network/                          ContactsTable · ImportCsvDialog · InsiderMatches · OutreachComposer
    settings/                         ProfileEditor · Preferences · ExtensionPairing · DataSources · DangerZone
components/
  fit/        FitBar, FitSegment, EvidenceList, UnknownBadge
  copilot/    CopilotDock, ChatPanel, MessageList, CitationChip, GroundingBanner, PromptChips
  resume/     ResumeRenderer (preview + PDF share it), DiffView, DiffHunk, GapRow
  jobs/       MatchCard, JobDetail, QualityFlagBadge, H1bBadge, Filters
  profile/    ProfileEditor (Experience, Bullet, Education, Project, Skill editors)
lib/
  llm/        client, tasks/*, fixtures/, grounding/{contextLines, checker}
  matching/   score.ts (pure), calibration.ts, skills/{taxonomy, normalize, implies}
  ingest/     sources/{greenhouse, lever, ashby, adzuna, usajobs, seed}, parseJob, quality
  h1b/        load, match
  resume/     build, tailor, diff, export/{pdf, docx}
  queue/      queues, workers
  analytics/  events.ts (typed event names)
```

## 5. Match score in plain English
Six components, each 0–100, weighted: skills 35, profile relevance 20, seniority 15, years 10, industry 10, location 10.

- **Skills.** Required skills matched divided by required (75% of the component) plus preferred matched divided by preferred (25%). Matching uses a canonical taxonomy with aliases (JS = JavaScript, k8s = Kubernetes) and a curated implication map used for matching only (Next.js implies React). Evidence shown: matched, missing required, missing preferred.
- **Profile relevance.** Cosine similarity between the profile embedding (headline, target roles, skills, bullets) and the job embedding (title, description, skills), rescaled linearly between two calibration constants derived from the seed corpus. The constants live in one file.
- **Seniority.** Both sides mapped to a ladder (intern 0 to principal 5; manager track 3 to 6). Same rung 100, one apart 70, two apart 35, further 0.
- **Years.** Candidate years computed from date ranges with overlaps merged and internships at half weight. Inside the job's range 100; each year short costs 25; more than five years over the max scores 70.
- **Industry.** Company industry in the candidate's list 100; adjacent per a small taxonomy 50; otherwise 20.
- **Location.** Remote job and candidate accepts remote 100 (onsite-preferring candidate 70). Otherwise city match 100, same state 60, same country 25, else 0. Hybrid counts as onsite.
- **Unknowns.** If the candidate stated no preference (industry "any", no locations) the component is dropped and weights renormalize. If the job lacks the data, the component scores 50 and is labeled "unknown".
- The card always shows the segmented bar; the detail view shows every evidence line. Nothing shows a bare number.
- **Candidate set.** For a profile, pgvector ANN retrieves the top 500 eligible jobs (60 days or newer, not low-quality); rules score those. Recomputed on profile save, and for new jobs after each ingest run.

## 6. Best-fit tailoring with labeled expansion (changed at Phase 0 review)
The original hard rule ("never add a skill, tool, employer, title, date or metric") was replaced at the user's request: the tailored résumé should be the candidate's **best possible fit**, expanding on their experience toward the posting, downloadable for inspiration. What stays enforced in code:
- **Structure-locked assembly.** The model only returns bullet rewrites, ordering, a skill list, headline and summary. Employers, titles, dates and schools are copied from the profile by code and cannot change.
- **Classifier, not rejecter.** Every generated bullet is checked against the profile (taxonomy skills, numeric tokens). Anything the checker cannot ground is labeled **Expanded — verify** (or **Added — verify**) with the model's stated inference, even if the model called it a rewording. Nothing is silently accepted.
- **User decides.** The diff view shows original vs. new per bullet with keep/revert; "Grounded only" strips all unverified content from the preview and exports; `resolveContent` applies decisions at export time.
- **Copilot stays cited.** Belay's answers must cite `[P#]`/`[J#]`/`[M#]` lines; the checker validates ids, claimed skills and numbers, retries once with Claude, and replaces still-ungrounded sentences.

## 7. Ingestion, quality, H1B
- Sources, public APIs only: Greenhouse boards API (no key; the Phase 2 source), Lever postings API, Ashby posting API, Adzuna (key + attribution footer), USAJobs (key + user-agent), seed JSON (about 300 postings across 40 companies). One `JobSource` row per board slug, raw payloads archived.
- Parse: regex first pass (years, salary, remote), then Haiku structured extraction, cached by content hash; Batches API for backfills.
- Quality flags: NO_COMPANY_DOMAIN, DUPLICATE_ACROSS_COMPANIES (same title and near-duplicate description under three or more companies in 30 days), STALE (over 60 days, or unseen for 14), SPAM_PATTERN (regex list, tiny descriptions, absurd salary spans). Hidden by default; the toggle shows the count.
- H1B: loader for the USCIS Employer Data Hub CSV (500-row sample committed, full file optional). YES = normalized-name match with approvals in the last three fiscal years, LIKELY = trigram similarity at or above 0.6, else UNKNOWN. The badge shows the matched USCIS name and years.

## 8. Analytics
Events: `profile_completed`, `job_viewed`, `match_breakdown_opened`, `copilot_asked`, `resume_tailored`, `tailoring_diff_accepted`, `application_status_changed`, `outreach_sent` (fires when the user marks a draft sent; we never send), plus `feed_viewed`, `resume_exported`, `extension_autofill_used`, `digest_sent`.
Activation: first `resume_exported` with `kind=tailored`. Retention anchor: `feed_viewed` in a later week than signup.

## 9. Repo, setup, tests
- `docker-compose.yml` (pgvector + redis), annotated `.env.example`, `pnpm setup` = install, migrate, seed. Required key: `ANTHROPIC_API_KEY`. Optional: Voyage, Google OAuth, Resend, PostHog, Adzuna, USAJobs.
- Vitest: scoring, normalizer, checker (adversarial fixtures), parsers, quality rules, H1B matcher. Playwright: onboard, match, tailor on the fixture LLM. GitHub Actions runs everything on service containers.

## 10. Ten biggest risks
Schedule risk is not counted; each phase has a fixed MVP and a checkpoint.
1. **Resume parsing on real PDFs.** Multi-column layouts, tables, icon fonts, and ligatures wreck text extraction, and every downstream feature inherits the errors. Mitigation: text layer via unpdf, fallback to page images through Opus 5 vision when the text layer is empty or garbled, per-field confidence, mandatory review step, a ten-resume golden corpus.
2. **Fabrication slipping past the checker.** Paraphrase-level inflation ("expert", "led") and rewritten numbers are the hard cases. Mitigation: structure-locked generation, numeric invariance, taxonomy plus entity extraction, adversarial fixtures, fallback to the original bullet.
3. **Public source fragility.** ATS boards are per-company slugs that appear and vanish; Adzuna and USAJobs need keys and attribution. Mitigation: seed data first, JobSource table, archived raw payloads, tolerant parsers.
4. **Job parsing consistency and cost.** Free-text descriptions yield inconsistent skills, years, and seniority. Mitigation: regex first pass, Haiku structured extraction, content-hash cache, Batches for backfills, daily parse cap.
5. **Score calibration.** Scores bunching at 60–80, or a provider switch shifting the semantic component. Mitigation: calibration constants from the seed corpus, golden ranking tests, evidence always visible, re-embed on provider change.
6. **H1B name matching.** Legal names versus brands and subsidiaries. Mitigation: normalization plus trigram tiers, never a "no", the matched name shown.
7. **Extension brittleness.** ATS markup changes, React-controlled inputs, embedded iframes, file inputs. Mitigation: per-ATS adapters, native value setter plus input events, DataTransfer for resume upload, per-field status with a copy fallback, snapshot tests; Greenhouse and Lever only.
8. **Integration friction.** Auth.js v5 with Next 15, Prisma with pgvector raw SQL, magic-link email in dev. Mitigation: vector ops in one module, console email transport, dev login for tests.
9. **LLM cost and abuse.** Opus 5 per turn, unbounded chats, ingestion parsing. Mitigation: prompt caching, per-user daily quotas, Haiku for bulk, LlmCall accounting.
10. **Legal and privacy.** Trade dress, source ToS and attribution, resume PII. Mitigation: the brand rules above, attribution footer, user-owned data only, account deletion wipes everything, resumes leave the system only to the Anthropic API.

## Phase demos
Your build order, unchanged. Each phase ends with a README section "Run the Phase N demo".

## Decisions taken at execution
1. Name/brand: Foothold, copilot Belay, terracotta/paper palette, top navigation.
2. Repo at `~/foothold`, **npm workspaces** (pnpm was not installed; npm keeps the stranger setup to one tool).
3. Queue: **pg-boss on Postgres** instead of BullMQ + Redis (no Redis on this machine; one service fewer). Inline job mode by default, worker optional.
4. Local database: no Docker on this machine, so `npm run db:local` downloads PostgreSQL 17 + pgvector (Postgres.app binaries) and runs it on :54329; Docker Compose remains the documented default.
5. Tailoring: best-fit with labeled expansions (section 6).
6. API keys: none available; everything runs on rule-based engines (`LLM_MODE=auto` falls back to heuristic) and switches to Claude/Voyage when keys are added.
