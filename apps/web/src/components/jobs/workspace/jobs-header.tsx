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
    <div className="flex min-h-[76px] flex-wrap items-center gap-x-7 gap-y-2 border-b border-border/70 px-6 py-3" data-testid="jobs-header">
      <div className="flex items-center gap-2.5">
        <h1 className="text-[26px] font-extrabold uppercase tracking-[-0.02em]" style={{ fontFamily: "inherit" }}>Jobs</h1>
        <ChevronRight className="h-4 w-4 text-foreground/50" strokeWidth={2.5} />
      </div>
      <nav className="flex h-[52px] items-center gap-7 overflow-x-auto" aria-label="Job lists">
        {TABS.map(([key, label]) => {
          const count = key === "liked" ? counts.liked : key === "applied" ? counts.applied : key === "external" ? counts.external : null;
          const active = tab === key;
          return (
            <button key={key} onClick={() => go({ tab: key === "recommended" ? null : key, hidden: null })} data-testid={`tab-${key}`}
              className={cn("relative flex h-full shrink-0 items-center gap-2 text-[16px] font-semibold transition-colors", active ? "text-foreground" : "text-foreground/60 hover:text-foreground")}>
              {label}
              {count != null && <span className={cn("flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[12px] font-bold", "bg-foreground text-background")}>{count}</span>}
              {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-foreground" />}
            </button>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <label className="relative block w-56 xl:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input defaultValue={q} placeholder="Search by title or company" data-testid="filter-q" className="h-10 w-full rounded-full border border-transparent bg-muted pl-10 pr-4 text-[14px] outline-none transition focus:border-border focus:bg-background"
            onKeyDown={(e) => { if (e.key === "Enter") go({ q: (e.target as HTMLInputElement).value }); }} onBlur={(e) => { if (e.target.value !== q) go({ q: e.target.value }); }} />
        </label>
        <Link href="/settings/extension" className="hidden h-10 items-center gap-2 rounded-full bg-primary pl-2 pr-3 text-[14px] font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 xl:inline-flex">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25"><Puzzle className="h-3.5 w-3.5" /></span> Autofill for every application <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
