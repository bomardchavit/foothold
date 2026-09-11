import Link from "next/link";
import type { FeedTab } from "@/lib/jobs/query";

export function EmptyState({ tab, hidden, filtered, computing }: { tab: FeedTab; hidden: boolean; filtered: boolean; computing: boolean }) {
  let title = "No roles match these filters"; let body: React.ReactNode = "Loosen a filter or clear them all.";
  if (computing) { title = "Scoring roles against your profile"; body = "This takes a few seconds. The page refreshes on its own."; }
  else if (hidden) { title = "No hidden jobs"; body = "Jobs you hide with the ⊘ button show up here so you can restore them."; }
  else if (tab === "liked" && !filtered) { title = "Nothing liked yet"; body = "Tap the heart on a job to save it here and in your tracker."; }
  else if (tab === "applied" && !filtered) { title = "No applications yet"; body = <>Mark a job as applied from its page, or track one from the <Link className="underline" href="/settings/extension">extension</Link>.</>; }
  else if (tab === "external" && !filtered) { title = "No external jobs"; body = "Jobs you track from other sites with the extension appear here."; }
  const clearHref = tab === "recommended" ? "/jobs" : `/jobs?tab=${tab}`;
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center" data-testid="feed-empty">
      <p className="text-lg font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      {filtered && !computing && (
        <Link href={clearHref} data-testid="clear-filters" className="focus-ring mt-5 inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition hover:opacity-90">Clear all filters</Link>
      )}
    </div>
  );
}
