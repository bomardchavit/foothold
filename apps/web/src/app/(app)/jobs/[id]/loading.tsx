import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the job page anatomy (back link, logo + title header, meta row, sticky score card, analysis rows) so the swap to data does not reflow. */
export default function JobLoading() {
  return (
    <div className="px-4 pt-5 sm:px-6" aria-busy="true" aria-label="Loading job">
      <div className="mx-auto grid max-w-[1180px] gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr]">
        <header className="min-w-0">
          <Skeleton className="h-4 w-12" />
          <div className="mt-3 flex gap-4"><Skeleton className="h-16 w-16 shrink-0 rounded-lg sm:h-20 sm:w-20" /><div className="flex-1 space-y-2 pt-1"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-3/4" /><Skeleton className="h-4 w-1/3" /></div></div>
          <div className="mt-4 flex flex-wrap gap-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}</div>
        </header>
        <aside className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card">
            <div className="flex items-center gap-4 bg-[linear-gradient(165deg,oklch(0.32_0.035_40),oklch(0.17_0.02_40))] px-5 py-5"><Skeleton className="h-20 w-20 rounded-full bg-white/10" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-24 bg-white/10" /><Skeleton className="h-3 w-full bg-white/10" /><Skeleton className="h-3 w-3/4 bg-white/10" /></div></div>
            <div className="space-y-3 p-4"><Skeleton className="h-10 w-full rounded-full" /><div className="grid grid-cols-2 gap-2"><Skeleton className="h-10 rounded-full" /><Skeleton className="h-10 rounded-full" /></div><Skeleton className="h-10 w-full rounded-full" /></div>
          </div>
          <Skeleton className="h-40 w-full rounded-2xl" />
        </aside>
        <article className="min-w-0 space-y-8 lg:col-start-1">
          <div className="rounded-2xl border border-border/80 bg-card p-5"><Skeleton className="h-6 w-40" /><div className="mt-5 space-y-5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex gap-3"><Skeleton className="h-6 w-6 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-full" /></div></div>)}</div></div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </article>
      </div>
    </div>
  );
}
