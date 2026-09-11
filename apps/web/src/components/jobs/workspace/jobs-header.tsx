"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Search, Puzzle, X } from "lucide-react";
import type { FeedTab } from "@/lib/jobs/query";
import { cn } from "@/lib/utils";

const TABS: Array<[FeedTab, string]> = [["recommended", "Recommended"], ["liked", "Liked"], ["applied", "Applied"], ["external", "External"]];

/** Workspace header: JOBS › tabs with count pills on the left, search (and the extension link) on the right. Shares its 68px height with the right rail's user row. */
export function JobsHeader({ tab, counts, q }: { tab: FeedTab; counts: { liked: number; applied: number; external: number }; q: string }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const [query, setQuery] = useState(q);
  useEffect(() => { setQuery(q); }, [q]);
  const go = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") n.delete(k); else n.set(k, v); }
    n.delete("page");
    router.push(`${path}?${n.toString()}`);
  };
  return (
    <div className="border-b border-border/70 px-4 sm:px-6" data-testid="jobs-header">
      <div className="flex min-h-14 max-w-[980px] flex-wrap items-center gap-x-6 sm:min-h-[68px]">
        <div className="hidden items-center gap-2.5 sm:flex">
          <h1 className="text-[26px] font-extrabold uppercase tracking-[-0.02em]" style={{ fontFamily: "inherit" }}>Jobs</h1>
          <ChevronRight aria-hidden className="h-4 w-4 text-muted-strong" strokeWidth={2.5} />
        </div>
        {/* Tabs scroll sideways on narrow screens; the right-edge fade signals that more tabs exist. */}
        <div className="relative min-w-0 flex-1 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-linear-to-l after:from-background after:to-transparent sm:flex-none sm:after:hidden">
          <nav className="scrollbar-none flex h-12 items-center gap-5 overflow-x-auto pr-8 sm:h-[68px] sm:gap-7 sm:pr-0" aria-label="Job lists">
            {TABS.map(([key, label]) => {
              const count = key === "liked" ? counts.liked : key === "applied" ? counts.applied : key === "external" ? counts.external : null;
              const active = tab === key;
              return (
                <button key={key} onClick={() => go({ tab: key === "recommended" ? null : key, hidden: null })} data-testid={`tab-${key}`} aria-current={active ? "page" : undefined}
                  className={cn("focus-ring relative flex h-full shrink-0 items-center gap-2 text-[14px] font-semibold transition-colors sm:text-[16px]", active ? "text-foreground" : "text-muted-strong hover:text-foreground")}>
                  {label}
                  {count != null && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-bold text-background sm:h-[22px] sm:min-w-[22px] sm:text-[12px]">{count}</span>}
                  {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-foreground" />}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex basis-full items-center gap-4 pb-3 sm:ml-auto sm:basis-auto sm:pb-0">
          <label className="relative block w-full sm:w-56 xl:w-72">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search jobs by title or company" placeholder="Search by title or company" data-testid="filter-q" type="search" enterKeyHint="search"
              className="h-10 w-full rounded-full border border-transparent bg-muted pl-10 pr-10 text-[14px] outline-none transition focus:border-border focus:bg-background focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
              onKeyDown={(e) => { if (e.key === "Enter") go({ q: (e.target as HTMLInputElement).value }); }} onBlur={(e) => { if (e.target.value !== q) go({ q: e.target.value }); }} />
            {query && (
              <button type="button" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(""); go({ q: null }); }} data-testid="clear-q"
                className="focus-ring absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            )}
          </label>
          <Link href="/settings/extension" className="focus-ring hidden h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card pl-1.5 pr-3 text-[14px] font-semibold text-foreground transition hover:bg-accent xl:inline-flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/12 text-primary"><Puzzle className="h-3.5 w-3.5" /></span> Autofill for every application <ChevronRight aria-hidden className="h-4 w-4 text-muted-strong" />
          </Link>
        </div>
      </div>
    </div>
  );
}
