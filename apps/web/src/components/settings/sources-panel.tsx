"use client";
import { useState, useTransition } from "react";
import type { JobSourceKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toggleSourceAction, runSourceAction, addSourceAction, refreshH1bAction, bootstrapUsAction, refreshLogosAction } from "@/app/actions/settings";
import { toast } from "sonner";

interface Src { id: string; kind: JobSourceKind; slug: string; name: string | null; enabled: boolean; jobs: number; lastRun: string | null; lastStatus: string | null; lastCounts: string | null }
const HELP: Record<string, string> = { GREENHOUSE: "board token from boards.greenhouse.io/<token>", LEVER: "site name from jobs.lever.co/<site>", ASHBY: "board name from jobs.ashbyhq.com/<name>", ADZUNA: "search query, e.g. 'product manager'", USAJOBS: "keyword query, e.g. 'data scientist'", CAREERS: "careers page URL (robots.txt-compliant JSON-LD crawl)", SMARTRECRUITERS: "company identifier from jobs.smartrecruiters.com/<id>", WORKABLE: "subdomain from apply.workable.com/<subdomain>", WORKDAY: "tenant.wd5/SiteName from the career site URL", BAMBOOHR: "subdomain from <subdomain>.bamboohr.com/careers" };

export function SourcesPanel({ sources, keys, scheduler, countries, curatedCount }: { sources: Src[]; keys: { adzuna: boolean; usajobs: boolean }; scheduler: { everyMin: number; mode: string }; countries: string; curatedCount: number }) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [kind, setKind] = useState<JobSourceKind>("GREENHOUSE");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  return (
    <div className="space-y-6 text-sm">
      <div className="rounded-xl border bg-card p-4">
        <p className="font-medium">Automatic scraping</p>
        <p className="mt-1 text-muted-foreground">{scheduler.mode === "queue" ? "The worker process runs every enabled source every 6 hours." : scheduler.everyMin ? `Every enabled source runs every ${scheduler.everyMin} minutes while the app is running (SCRAPE_INTERVAL_MIN).` : "In-app scheduling is off (SCRAPE_INTERVAL_MIN=0); run sources by hand or start the worker."} Jobs outside <code>{countries}</code> are skipped (JOBS_COUNTRIES). No keys are needed for any of this.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} data-testid="bootstrap-us" onClick={() => start(async () => { const r = await bootstrapUsAction(); if (r.ok) toast.success(`Bootstrapping ${curatedCount} curated US companies in the background. Refresh this page to watch sources appear.`); else toast.error(r.error); })}>Bootstrap {curatedCount} US companies</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await refreshLogosAction(); if (r.ok) toast.success(`Fetched ${r.data.resolved} logos`); })}>Fetch missing logos</Button>
        </div>
      </div>
      <p className="text-muted-foreground">Public job APIs and robots-compliant crawling only: Greenhouse, Lever, Ashby, SmartRecruiters and Workable boards need no keys; a careers URL is crawled for schema.org JobPosting data. Use <code>npm run scrape -- discover company.com</code> to find where a company hosts its jobs. Adzuna and USAJobs need keys in <code>.env</code>{!keys.adzuna && " (Adzuna: not set)"}{!keys.usajobs && " (USAJobs: not set)"}. Enabled sources run every 6 hours when the worker is on, or when you press Run.</p>
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addSourceAction({ kind, slug, name }); if (r.ok) { setSlug(""); setName(""); toast.success("Source added"); } else toast.error(r.error); }); }}>
        <div><label className="text-xs text-muted-foreground">Kind</label><select className="mt-1 block h-9 rounded-md border bg-background px-2" value={kind} onChange={(e) => setKind(e.target.value as JobSourceKind)}>{["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "WORKABLE", "WORKDAY", "BAMBOOHR", "CAREERS", "ADZUNA", "USAJOBS"].map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}</select></div>
        <div className="min-w-56"><label className="text-xs text-muted-foreground">{HELP[kind]}</label><Input className="mt-1" value={slug} onChange={(e) => setSlug(e.target.value)} required data-testid="source-slug" /></div>
        <div><label className="text-xs text-muted-foreground">Display name</label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="submit" disabled={pending}>Add source</Button>
      </form>
      <ul className="divide-y rounded-xl border bg-card" data-testid="sources-list">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-medium"><Badge variant="outline" className="mr-2 font-normal">{s.kind.toLowerCase()}</Badge>{s.name ?? s.slug} <span className="text-xs text-muted-foreground">({s.slug})</span></p>
              <p className="text-xs text-muted-foreground">{s.jobs} jobs{s.lastRun ? ` · last run ${s.lastRun}: ${s.lastStatus ?? ""}${s.lastCounts ? ` (${s.lastCounts})` : ""}` : " · never run"}</p>
            </div>
            <div className="flex items-center gap-3">
              {s.kind !== "SEED" && s.kind !== "MANUAL" && <Switch checked={s.enabled} onCheckedChange={(v) => start(async () => { await toggleSourceAction(s.id, v); })} />}
              {s.kind !== "MANUAL" && <Button size="sm" variant="outline" disabled={running === s.id} onClick={async () => { setRunning(s.id); const r = await runSourceAction(s.id); setRunning(null); if (r.ok) toast.success(`${r.data.fetched} fetched, ${r.data.inserted} new, ${r.data.updated} updated${r.data.errors ? `, ${r.data.errors} errors` : ""}`); else toast.error(r.error); }}>{running === s.id ? "Running…" : "Run now"}</Button>}
            </div>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border bg-card p-4">
        <p className="font-medium">H-1B employer data</p>
        <p className="text-xs text-muted-foreground">Load the USCIS Employer Data Hub CSV with <code>npm run h1b:load -- path/to/file.csv</code>, then refresh company signals.</p>
        <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => start(async () => { const r = await refreshH1bAction(); if (r.ok) toast.success(`Refreshed ${r.data.companies} companies`); })}>Refresh sponsorship signals</Button>
      </div>
    </div>
  );
}
