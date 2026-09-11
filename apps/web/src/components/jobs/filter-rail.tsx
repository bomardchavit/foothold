"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SENIORITY_LABELS, SENIORITY_VALUES } from "@foothold/shared";
import type { FeedFilters } from "@/lib/jobs/query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";

export function FilterRail({ filters, industries, hidden }: { filters: FeedFilters; industries: string[]; hidden: number }) {
  const router = useRouter(); const path = usePathname();
  const [f, setF] = useState(filters);
  useEffect(() => setF(filters), [filters]);
  const apply = useCallback((next: FeedFilters) => {
    const sp = new URLSearchParams();
    if (next.min) sp.set("min", String(next.min));
    if (next.posted) sp.set("posted", String(next.posted));
    if (next.loc) sp.set("loc", next.loc);
    if (next.remote) sp.set("remote", "1");
    if (next.seniority.length) sp.set("seniority", next.seniority.join(","));
    if (next.industry.length) sp.set("industry", next.industry.join(","));
    if (next.salary) sp.set("salary", String(next.salary));
    if (next.h1b.length) sp.set("h1b", next.h1b.join(","));
    if (next.q) sp.set("q", next.q);
    if (next.lowq) sp.set("lowq", "1");
    if (next.sort !== "fit") sp.set("sort", next.sort);
    router.push(`${path}?${sp.toString()}`);
  }, [router, path]);
  const update = (patch: Partial<FeedFilters>) => { const next = { ...f, ...patch, page: 1 }; setF(next); apply(next); };
  const toggleIn = <K extends "seniority" | "industry" | "h1b">(k: K, v: FeedFilters[K][number]) => {
    const arr = f[k] as string[];
    update({ [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] } as Partial<FeedFilters>);
  };
  return (
    <div className="space-y-5 text-sm" data-testid="filter-rail">
      <div className="flex items-center justify-between"><h2 className="font-medium">Filters</h2><Button variant="ghost" size="sm" onClick={() => apply({ ...f, min: 0, posted: null, loc: "", remote: false, seniority: [], industry: [], salary: null, h1b: [], q: "", lowq: false, page: 1, sort: "fit" })}>Reset</Button></div>
      <div><Label>Search title or company</Label><Input className="mt-1" defaultValue={f.q} placeholder="e.g. backend, Northwind" data-testid="filter-q" onKeyDown={(e) => { if (e.key === "Enter") update({ q: (e.target as HTMLInputElement).value }); }} onBlur={(e) => { if (e.target.value !== f.q) update({ q: e.target.value }); }} /></div>
      <div>
        <div className="flex justify-between"><Label>Minimum fit</Label><span className="tabular-nums text-muted-foreground">{f.min}</span></div>
        <input type="range" min={0} max={100} step={5} value={f.min} className="mt-1 w-full accent-primary" data-testid="filter-min" onChange={(e) => setF({ ...f, min: Number(e.target.value) })} onMouseUp={() => apply({ ...f, page: 1 })} onTouchEnd={() => apply({ ...f, page: 1 })} onKeyUp={() => apply({ ...f, page: 1 })} />
      </div>
      <div><Label>Posted within</Label>
        <select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={f.posted ?? ""} onChange={(e) => update({ posted: e.target.value ? Number(e.target.value) : null })} data-testid="filter-posted">
          <option value="">Any time</option><option value="1">24 hours</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
        </select></div>
      <div><Label>Location</Label><Input className="mt-1" defaultValue={f.loc} placeholder="City, state, or Remote" onBlur={(e) => { if (e.target.value !== f.loc) update({ loc: e.target.value }); }} onKeyDown={(e) => { if (e.key === "Enter") update({ loc: (e.target as HTMLInputElement).value }); }} /></div>
      <label className="flex items-center justify-between"><span>Remote only</span><Switch checked={f.remote} onCheckedChange={(v) => update({ remote: v })} data-testid="filter-remote" /></label>
      <div><Label>Seniority</Label>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {SENIORITY_VALUES.filter((s) => s !== "UNKNOWN").map((s) => <label key={s} className="flex items-center gap-2"><Checkbox checked={f.seniority.includes(s)} onCheckedChange={() => toggleIn("seniority", s)} /> {SENIORITY_LABELS[s]}</label>)}
        </div></div>
      <div><Label>Industry</Label>
        <div className="mt-1 max-h-44 space-y-1 overflow-y-auto pr-1">
          {industries.map((i) => <label key={i} className="flex items-center gap-2"><Checkbox checked={f.industry.includes(i)} onCheckedChange={() => toggleIn("industry", i)} /> {i}</label>)}
        </div></div>
      <div><Label>Salary at least (USD)</Label><Input className="mt-1" type="number" step={10000} defaultValue={f.salary ?? ""} placeholder="e.g. 150000" onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== f.salary) update({ salary: v }); }} /></div>
      <div><Label>H-1B sponsor signal</Label>
        <div className="mt-1 space-y-1">
          {(["YES", "LIKELY", "UNKNOWN"] as const).map((s) => <label key={s} className="flex items-center gap-2"><Checkbox checked={f.h1b.includes(s)} onCheckedChange={() => toggleIn("h1b", s)} data-testid={`filter-h1b-${s}`} /> {s === "YES" ? "Yes (USCIS approvals, last 3 FY)" : s === "LIKELY" ? "Likely (fuzzy name match)" : "Unknown"}</label>)}
        </div></div>
      <div><Label>Sort</Label>
        <select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={f.sort} onChange={(e) => update({ sort: e.target.value as FeedFilters["sort"] })}>
          <option value="fit">Best fit</option><option value="newest">Newest</option>
        </select></div>
      <label className="flex items-center justify-between border-t pt-4"><span>Show low-quality listings{hidden > 0 ? ` (${hidden})` : ""}</span><Switch checked={f.lowq} onCheckedChange={(v) => { trackClient(EVENTS.low_quality_toggled, { show: v }); update({ lowq: v }); }} data-testid="filter-lowq" /></label>
    </div>
  );
}
