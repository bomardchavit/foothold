"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock, SlidersHorizontal, HelpCircle, ChevronDown } from "lucide-react";
import { SENIORITY_LABELS, SENIORITY_VALUES, EMPLOYMENT_TYPE_LABELS, WORKPLACE_TYPE_LABELS } from "@foothold/shared";
import type { FeedFilters } from "@/lib/jobs/query";
import { YEARS_BUCKETS, filtersToParams } from "@/lib/jobs/query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

const LOCATIONS = ["United States", "Remote", "San Francisco, CA", "New York, NY", "Seattle, WA", "Austin, TX", "Boston, MA", "Chicago, IL", "Los Angeles, CA", "Denver, CO", "Washington, DC", "Atlanta, GA"];
const ROLE_SUGGESTIONS = ["Software Engineer", "Backend Engineer", "Frontend Engineer", "Full-Stack Engineer", "Product Manager", "Data Scientist", "Data Analyst", "Data Engineer", "Machine Learning Engineer", "Product Designer", "DevOps Engineer", "Security Engineer"];

const TRIGGER = "focus-ring shrink-0 rounded-lg";
const OPTION = "focus-ring block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent";

/** Grey chip bar: one horizontal scroller of filter chips (fade at the edge, no scrollbar), with All Filters, help and Sort pinned outside it on the right. */
export function FilterBar({ filters, industries, targetRoles, hiddenCount, lowQualityHidden }: { filters: FeedFilters; industries: string[]; targetRoles: string[]; hiddenCount: number; lowQualityHidden: number }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const apply = (patch: Partial<FeedFilters>) => {
    const next = { ...filters, ...patch, page: 1 };
    const params = filtersToParams(next);
    const sf = sp.get("sf"); if (sf) params.sf = sf;
    router.push(`${path}?${new URLSearchParams(params).toString()}`);
  };
  const toggle = <K extends "seniority" | "industry" | "type" | "work" | "roles" | "h1b">(k: K, v: string) => {
    const arr = filters[k] as string[];
    apply({ [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] } as Partial<FeedFilters>);
  };
  const chip = (label: string, count?: number, active?: boolean) => (
    <span className={cn("inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg px-3.5 text-[14px] transition-colors", active ? "bg-accent font-medium text-foreground" : "bg-muted hover:bg-accent/70")}>
      {label}{count ? <span className="text-muted-strong">(+{count})</span> : null}<ChevronDown aria-hidden className="ml-0.5 h-3.5 w-3.5 text-muted-strong" />
    </span>
  );
  const roleOptions = [...new Set([...targetRoles, ...ROLE_SUGGESTIONS])];
  return (
    <div className="flex max-w-[980px] flex-wrap items-center gap-2.5 px-4 pt-4 sm:px-6 sm:pt-5" data-testid="filter-rail">
      <div className="relative min-w-0 basis-full after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-linear-to-l after:from-background after:to-transparent sm:flex-1 sm:basis-0">
        <div className="scrollbar-none flex items-center gap-2.5 overflow-x-auto pr-10">
          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Filter by location" data-testid="chip-location">{chip(filters.loc || (filters.remote ? "Remote" : "Location"), 0, Boolean(filters.loc || filters.remote))}</button></PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2 p-3">
              <Input placeholder="City, state or country" defaultValue={filters.loc} onKeyDown={(e) => { if (e.key === "Enter") apply({ loc: (e.target as HTMLInputElement).value, remote: false }); }} />
              <div className="flex flex-wrap gap-1">{LOCATIONS.map((l) => <button key={l} className={cn("focus-ring rounded-full border px-2 py-0.5 text-xs hover:bg-accent", filters.loc === l && "bg-accent")} onClick={() => apply(l === "Remote" ? { loc: "", remote: true } : { loc: l, remote: false })}>{l}</button>)}</div>
              {(filters.loc || filters.remote) && <Button variant="ghost" size="sm" onClick={() => apply({ loc: "", remote: false })}>Clear</Button>}
            </PopoverContent></Popover>

          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Filter by role" data-testid="chip-roles">{chip(filters.roles[0] ?? "Roles", Math.max(0, filters.roles.length - 1), filters.roles.length > 0)}</button></PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-1 p-3">
              {roleOptions.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.roles.includes(r)} onCheckedChange={() => toggle("roles", r)} /> {r}</label>)}
              <Input placeholder="Other role, Enter" className="mt-2" onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) toggle("roles", v); } }} />
            </PopoverContent></Popover>

          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Filter by level" data-testid="chip-level">{chip(filters.seniority[0] ? SENIORITY_LABELS[filters.seniority[0]] : "Level", Math.max(0, filters.seniority.length - 1), filters.seniority.length > 0)}</button></PopoverTrigger>
            <PopoverContent align="start" className="w-60 space-y-1 p-3">{SENIORITY_VALUES.filter((s) => s !== "UNKNOWN").map((s) => <label key={s} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.seniority.includes(s)} onCheckedChange={() => toggle("seniority", s)} /> {SENIORITY_LABELS[s]}</label>)}</PopoverContent></Popover>

          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Filter by job type" data-testid="chip-type">{chip(filters.type[0] ? EMPLOYMENT_TYPE_LABELS[filters.type[0]] : "Job Type", Math.max(0, filters.type.length - 1), filters.type.length > 0)}</button></PopoverTrigger>
            <PopoverContent align="start" className="w-56 space-y-1 p-3">{(["FULL_TIME", "INTERNSHIP", "CONTRACT", "PART_TIME", "TEMPORARY"] as const).map((t) => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.type.includes(t)} onCheckedChange={() => toggle("type", t)} /> {EMPLOYMENT_TYPE_LABELS[t]}</label>)}</PopoverContent></Popover>

          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Filter by workplace" data-testid="chip-work">{chip(filters.work[0] ? WORKPLACE_TYPE_LABELS[filters.work[0]] : "Workplace", Math.max(0, filters.work.length - 1), filters.work.length > 0)}</button></PopoverTrigger>
            <PopoverContent align="start" className="w-52 space-y-1 p-3">{(["ONSITE", "HYBRID", "REMOTE"] as const).map((w) => <label key={w} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.work.includes(w)} onCheckedChange={() => toggle("work", w)} /> {WORKPLACE_TYPE_LABELS[w]}</label>)}</PopoverContent></Popover>

          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Filter by date posted" data-testid="chip-posted">{chip(filters.posted ? `Past ${filters.posted} day${filters.posted === 1 ? "" : "s"}` : "Date Posted", 0, Boolean(filters.posted))}</button></PopoverTrigger>
            <PopoverContent align="start" className="w-48 space-y-1 p-3">{[[null, "Any time"], [1, "Past 24 hours"], [3, "Past 3 days"], [7, "Past week"], [30, "Past month"]].map(([v, l]) => <button key={String(v)} className={cn(OPTION, filters.posted === v && "bg-accent")} onClick={() => apply({ posted: v as number | null })}>{l}</button>)}</PopoverContent></Popover>

          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Filter by industry" data-testid="chip-industry">{chip(filters.industry[0] ?? "Industry", Math.max(0, filters.industry.length - 1), filters.industry.length > 0)}</button></PopoverTrigger>
            <PopoverContent align="start" className="max-h-80 w-64 space-y-1 overflow-y-auto p-3">{industries.map((i) => <label key={i} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.industry.includes(i)} onCheckedChange={() => toggle("industry", i)} /> {i}</label>)}</PopoverContent></Popover>

          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Filter by years of experience" data-testid="chip-years">{chip(filters.years ? YEARS_BUCKETS.find((b) => b[0] === filters.years)?.[1] ?? "Experience" : "Experience", 0, Boolean(filters.years))}</button></PopoverTrigger>
            <PopoverContent align="start" className="w-48 space-y-1 p-3">{[["", "Any"], ...YEARS_BUCKETS.map((b) => [b[0], b[1]])].map(([v, l]) => <button key={v} className={cn(OPTION, filters.years === v && "bg-accent")} onClick={() => apply({ years: v })}>{l}</button>)}</PopoverContent></Popover>

          <button onClick={() => apply({ hidden: !filters.hidden })} data-testid="chip-hidden" aria-pressed={filters.hidden} className={cn("focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[14px] transition-colors", filters.hidden ? "bg-accent font-medium text-foreground" : "bg-muted hover:bg-accent/70")}>
            <Lock aria-hidden className="h-4 w-4 text-muted-strong" /> Hidden Jobs{hiddenCount ? ` (${hiddenCount})` : ""}
          </button>
        </div>
      </div>

      <div className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto">
        <AllFilters filters={filters} apply={apply} toggle={toggle} lowQualityHidden={lowQualityHidden} />
        <Tooltip><TooltipTrigger asChild><button className="focus-ring rounded-full text-muted-strong hover:text-foreground" aria-label="How matching works"><HelpCircle className="h-5 w-5" /></button></TooltipTrigger><TooltipContent className="max-w-xs text-xs">Fit is six weighted components: skills, profile relevance, level, years, industry, location. Open any job to see the evidence for each.</TooltipContent></Tooltip>
        <div className="ml-auto sm:ml-0">
          <Popover><PopoverTrigger asChild><button className={TRIGGER} aria-label="Sort jobs" data-testid="sort">{chip(filters.sort === "newest" ? "Newest" : "Recommended", 0, false)}</button></PopoverTrigger>
            <PopoverContent align="end" className="w-44 space-y-1 p-2">{[["fit", "Recommended"], ["newest", "Newest"]].map(([v, l]) => <button key={v} className={cn(OPTION, filters.sort === v && "bg-accent")} onClick={() => apply({ sort: v as "fit" | "newest" })}>{l}</button>)}</PopoverContent></Popover>
        </div>
      </div>
    </div>
  );
}

function AllFilters({ filters, apply, toggle, lowQualityHidden }: { filters: FeedFilters; apply: (p: Partial<FeedFilters>) => void; toggle: (k: "h1b", v: string) => void; lowQualityHidden: number }) {
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(filters.min);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // The slider commits once the user pauses, not on every arrow key or drag frame.
  const changeMin = (v: number) => { setMin(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => apply({ min: v }), 400); };
  const active = Number(Boolean(filters.min)) + Number(Boolean(filters.salary)) + filters.h1b.length + Number(filters.lowq);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button data-testid="chip-all" className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-foreground px-3.5 text-[14px] font-medium text-background transition hover:opacity-90"><SlidersHorizontal aria-hidden className="h-4 w-4" /> All Filters{active ? ` (${active})` : ""}</button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle className="font-heading text-xl">All filters</SheetTitle></SheetHeader>
        <div className="space-y-6 px-4 pb-8 text-sm">
          <div><div className="flex justify-between"><label htmlFor="filter-min" className="font-medium">Minimum fit</label><span className="tabular-nums text-muted-foreground">{min}</span></div>
            <input id="filter-min" type="range" min={0} max={100} step={5} value={min} className="mt-1 w-full accent-primary" data-testid="filter-min" onChange={(e) => changeMin(Number(e.target.value))} /></div>
          <div><span className="font-medium">Salary at least (USD / year)</span><Input className="mt-1" type="number" step={10000} defaultValue={filters.salary ?? ""} placeholder="e.g. 150000" onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== filters.salary) apply({ salary: v }); }} /></div>
          <div><span className="font-medium">H-1B sponsor signal</span>
            <div className="mt-1 space-y-1">{(["YES", "LIKELY", "UNKNOWN"] as const).map((s) => <label key={s} className="flex items-center gap-2"><Checkbox checked={filters.h1b.includes(s)} onCheckedChange={() => toggle("h1b", s)} data-testid={`filter-h1b-${s}`} /> {s === "YES" ? "Sponsors (USCIS approvals, last 3 FY)" : s === "LIKELY" ? "Likely (fuzzy name match)" : "Unknown"}</label>)}</div></div>
          <label className="flex items-center justify-between border-t pt-4"><span>Show low-quality listings{lowQualityHidden > 0 ? ` (${lowQualityHidden})` : ""}</span><Switch checked={filters.lowq} onCheckedChange={(v) => { trackClient(EVENTS.low_quality_toggled, { show: v }); apply({ lowq: v }); }} data-testid="filter-lowq" /></label>
          <Button variant="outline" className="w-full" onClick={() => { setMin(0); apply({ min: 0, salary: null, h1b: [], lowq: false, loc: "", remote: false, seniority: [], industry: [], type: [], work: [], roles: [], years: "", posted: null, q: "" }); setOpen(false); }}>Reset all filters</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
