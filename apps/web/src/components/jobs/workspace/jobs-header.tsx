"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Search, Puzzle } from "lucide-react";
import type { FeedTab } from "@/lib/jobs/query";
import { cn } from "@/lib/utils";

const TABS: Array<[FeedTab, string]> = [["recommended", "Recommended"], ["liked", "Liked"], ["applied", "Applied"], ["external", "External"]];

export function JobsHeader({ tab, counts, q }: { tab: FeedTab; counts: { liked: number; applied: number; external: number }; q: string }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") n.delete(k); else n.set(k, v); }
    n.delete("page");
    router.push(`${path}?${n.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3" data-testid="jobs-header">
      <div className="flex items-center gap-2">
        <h1 className="font-heading text-[26px] font-bold uppercase tracking-tight" style={{ fontFamily: "inherit" }}>Jobs</h1>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Job lists">
        {TABS.map(([key, label]) => {
          const count = key === "liked" ? counts.liked : key === "applied" ? counts.applied : key === "external" ? counts.external : null;
          const active = tab === key;
          return (
            <button key={key} onClick={() => go({ tab: key === "recommended" ? null : key, hidden: null })} data-testid={`tab-${key}`}
              className={cn("relative flex h-10 shrink-0 items-center gap-2 text-[15px] font-medium transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
              {count != null && <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", active ? "bg-foreground text-background" : "bg-muted text-foreground")}>{count}</span>}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-foreground" />}
            </button>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <label className="relative block w-full min-w-56 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input defaultValue={q} placeholder="Search by title or company" data-testid="filter-q" className="h-10 w-full rounded-full border bg-muted/60 pl-9 pr-3 text-sm outline-none ring-primary/40 focus:bg-background focus:ring-2"
            onKeyDown={(e) => { if (e.key === "Enter") go({ q: (e.target as HTMLInputElement).value }); }} onBlur={(e) => { if (e.target.value !== q) go({ q: e.target.value }); }} />
        </label>
        <Link href="/settings/extension" className="hidden items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 md:inline-flex"><Puzzle className="h-4 w-4" /> Autofill extension <ChevronRight className="h-4 w-4" /></Link>
      </div>
    </div>
  );
}
