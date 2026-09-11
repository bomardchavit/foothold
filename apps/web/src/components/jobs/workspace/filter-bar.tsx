"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, EyeOff, SlidersHorizontal, HelpCircle } from "lucide-react";
import { SENIORITY_LABELS, SENIORITY_VALUES, EMPLOYMENT_TYPE_LABELS, WORKPLACE_TYPE_LABELS } from "@foothold/shared";
import type { FeedFilters } from "@/lib/jobs/query";
import { YEARS_BUCKETS, filtersToParams } from "@/lib/jobs/query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
    <span className={cn("inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 text-[14px] transition-colors", active ? "border-primary/40 bg-accent font-medium" : "bg-muted/60 hover:bg-accent/60")}>
      {label}{count ? <span className="text-muted-foreground">(+{count})</span> : null}<ChevronDown className="h-4 w-4 text-muted-foreground" />
    </span>
  );
  const roleOptions = [...new Set([...targetRoles, ...ROLE_SUGGESTIONS])];
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="filter-rail">
      <Popover><PopoverTrigger asChild><button data-testid="chip-location">{chip(filters.loc || (filters.remote ? "Remote" : "Location"), 0, Boolean(filters.loc || filters.remote))}</button></PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-2 p-3">
          <Input placeholder="City, state or country" defaultValue={filters.loc} onKeyDown={(e) => { if (e.key === "Enter") apply({ loc: (e.target as HTMLInputElement).value, remote: false }); }} />
          <div className="flex flex-wrap gap-1">{LOCATIONS.map((l) => <button key={l} className={cn("rounded-full border px-2 py-0.5 text-xs hover:bg-accent", filters.loc === l && "bg-accent")} onClick={() => apply(l === "Remote" ? { loc: "", remote: true } : { loc: l, remote: false })}>{l}</button>)}</div>
          {(filters.loc || filters.remote) && <Button variant="ghost" size="sm" onClick={() => apply({ loc: "", remote: false })}>Clear</Button>}
        </PopoverContent></Popover>

      <Popover><PopoverTrigger asChild><button data-testid="chip-roles">{chip(filters.roles[0] ?? "Roles", Math.max(0, filters.roles.length - 1), filters.roles.length > 0)}</button></PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-1 p-3">
          {roleOptions.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.roles.includes(r)} onCheckedChange={() => toggle("roles", r)} /> {r}</label>)}
          <Input placeholder="Other role, Enter" className="mt-2" onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) toggle("roles", v); } }} />
        </PopoverContent></Popover>

      <Popover><PopoverTrigger asChild><button data-testid="chip-level">{chip(filters.seniority[0] ? SENIORITY_LABELS[filters.seniority[0]] : "Level", Math.max(0, filters.seniority.length - 1), filters.seniority.length > 0)}</button></PopoverTrigger>
        <PopoverContent align="start" className="w-60 space-y-1 p-3">{SENIORITY_VALUES.filter((s) => s !== "UNKNOWN").map((s) => <label key={s} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.seniority.includes(s)} onCheckedChange={() => toggle("seniority", s)} /> {SENIORITY_LABELS[s]}</label>)}</PopoverContent></Popover>

      <Popover><PopoverTrigger asChild><button data-testid="chip-type">{chip(filters.type[0] ? EMPLOYMENT_TYPE_LABELS[filters.type[0]] : "Job type", Math.max(0, filters.type.length - 1), filters.type.length > 0)}</button></PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1 p-3">{(["FULL_TIME", "INTERNSHIP", "CONTRACT", "PART_TIME", "TEMPORARY"] as const).map((t) => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.type.includes(t)} onCheckedChange={() => toggle("type", t)} /> {EMPLOYMENT_TYPE_LABELS[t]}</label>)}</PopoverContent></Popover>

      <Popover><PopoverTrigger asChild><button data-testid="chip-work">{chip(filters.work[0] ? WORKPLACE_TYPE_LABELS[filters.work[0]] : "Workplace", Math.max(0, filters.work.length - 1), filters.work.length > 0)}</button></PopoverTrigger>
        <PopoverContent align="start" className="w-52 space-y-1 p-3">{(["ONSITE", "HYBRID", "REMOTE"] as const).map((w) => <label key={w} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.work.includes(w)} onCheckedChange={() => toggle("work", w)} /> {WORKPLACE_TYPE_LABELS[w]}</label>)}</PopoverContent></Popover>

      <Popover><PopoverTrigger asChild><button data-testid="chip-posted">{chip(filters.posted ? `Past ${filters.posted} day${filters.posted === 1 ? "" : "s"}` : "Date posted", 0, Boolean(filters.posted))}</button></PopoverTrigger>
        <PopoverContent align="start" className="w-48 space-y-1 p-3">{[[null, "Any time"], [1, "Past 24 hours"], [3, "Past 3 days"], [7, "Past week"], [30, "Past month"]].map(([v, l]) => <button key={String(v)} className={cn("block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent", filters.posted === v && "bg-accent")} onClick={() => apply({ posted: v as number | null })}>{l}</button>)}</PopoverContent></Popover>

      <Popover><PopoverTrigger asChild><button data-testid="chip-industry">{chip(filters.industry[0] ?? "Industry", Math.max(0, filters.industry.length - 1), filters.industry.length > 0)}</button></PopoverTrigger>
        <PopoverContent align="start" className="max-h-80 w-64 space-y-1 overflow-y-auto p-3">{industries.map((i) => <label key={i} className="flex items-center gap-2 text-sm"><Checkbox checked={filters.industry.includes(i)} onCheckedChange={() => toggle("industry", i)} /> {i}</label>)}</PopoverContent></Popover>

      <Popover><PopoverTrigger asChild><button data-testid="chip-years">{chip(filters.years ? YEARS_BUCKETS.find((b) => b[0] === filters.years)?.[1] ?? "Years" : "Years of experience", 0, Boolean(filters.years))}</button></PopoverTrigger>
        <PopoverContent align="start" className="w-48 space-y-1 p-3">{[["", "Any"], ...YEARS_BUCKETS.map((b) => [b[0], b[1]])].map(([v, l]) => <button key={v} className={cn("block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent", filters.years === v && "bg-accent")} onClick={() => apply({ years: v })}>{l}</button>)}</PopoverContent></Popover>

      <button onClick={() => apply({ hidden: !filters.hidden })} data-testid="chip-hidden" className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[14px] transition-colors", filters.hidden ? "border-primary/40 bg-accent font-medium" : "bg-chart-3/30 hover:bg-chart-3/40")}>
        <EyeOff className="h-4 w-4" /> Hidden jobs{hiddenCount ? ` (${hiddenCount})` : ""}
      </button>

      <AllFilters filters={filters} apply={apply} toggle={toggle} lowQualityHidden={lowQualityHidden} />

      <Tooltip><TooltipTrigger asChild><button className="text-muted-foreground" aria-label="How matching works"><HelpCircle className="h-5 w-5" /></button></TooltipTrigger><TooltipContent className="max-w-xs text-xs">Fit is six weighted components: skills, profile relevance, level, years, industry, location. Open any job to see the evidence for each.</TooltipContent></Tooltip>

      <div className="ml-auto">
        <Popover><PopoverTrigger asChild><button data-testid="sort">{chip(filters.sort === "newest" ? "Newest" : "Recommended", 0, false)}</button></PopoverTrigger>
          <PopoverContent align="end" className="w-44 space-y-1 p-2">{[["fit", "Recommended"], ["newest", "Newest"]].map(([v, l]) => <button key={v} className={cn("block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent", filters.sort === v && "bg-accent")} onClick={() => apply({ sort: v as "fit" | "newest" })}>{l}</button>)}</PopoverContent></Popover>
      </div>
    </div>
  );
}

function AllFilters({ filters, apply, toggle, lowQualityHidden }: { filters: FeedFilters; apply: (p: Partial<FeedFilters>) => void; toggle: (k: "h1b", v: string) => void; lowQualityHidden: number }) {
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(filters.min);
  const active = Number(Boolean(filters.min)) + Number(Boolean(filters.salary)) + filters.h1b.length + Number(filters.lowq);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button onClick={() => setOpen(true)} data-testid="chip-all" className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-medium text-primary-foreground transition hover:brightness-110", "bg-primary")}><SlidersHorizontal className="h-4 w-4" /> All filters{active ? ` (${active})` : ""}</button>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle className="font-heading text-xl">All filters</SheetTitle></SheetHeader>
        <div className="space-y-6 px-4 pb-8 text-sm">
          <div><div className="flex justify-between"><span className="font-medium">Minimum fit</span><span className="tabular-nums text-muted-foreground">{min}</span></div>
            <input type="range" min={0} max={100} step={5} value={min} className="mt-1 w-full accent-primary" data-testid="filter-min" onChange={(e) => setMin(Number(e.target.value))} onMouseUp={() => apply({ min })} onTouchEnd={() => apply({ min })} onKeyUp={() => apply({ min })} /></div>
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
