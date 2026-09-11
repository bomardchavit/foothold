import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the real anatomy (header, chip bar, cards with logo, chip line, title, six detail cells, four controls and the full-height dark panel) so the swap to data does not reflow. */
export default function JobsLoading() {
  return (
    <div className="flex" aria-busy="true" aria-label="Loading jobs">
      <div className="min-w-0 flex-1">
        <div className="border-b border-border/70 px-4 sm:px-6"><div className="flex h-14 max-w-[980px] items-center gap-7 sm:h-[68px]"><Skeleton className="hidden h-8 w-20 sm:block" /><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-20" /><Skeleton className="ml-auto hidden h-10 w-56 rounded-full sm:block xl:w-72" /></div></div>
        <div className="flex max-w-[980px] gap-2.5 overflow-hidden px-4 pt-4 sm:px-6 sm:pt-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-lg" />)}<Skeleton className="ml-auto h-9 w-32 shrink-0 rounded-lg" /></div>
        <div className="mt-5 max-w-[980px] space-y-4 px-4 sm:px-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card md:flex-row">
              <div className="flex-1 p-4 md:p-5 md:pb-4">
                <div className="flex gap-4"><Skeleton className="h-14 w-14 shrink-0 rounded-lg md:h-20 md:w-20" /><div className="flex-1 space-y-2.5 pt-0.5"><Skeleton className="h-5 w-40" /><Skeleton className="h-6 w-2/3 md:h-7" /><Skeleton className="h-4 w-1/2" /></div></div>
                <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className={j > 3 ? "hidden h-4 w-32 sm:block" : "h-4 w-32"} />)}</div>
                <div className="mt-5 flex items-center gap-3 border-t border-border/70 pt-4"><Skeleton className="h-4 w-36" /><div className="ml-auto flex items-center gap-2"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-9 w-28 rounded-full" /><Skeleton className="h-9 w-44 rounded-full" /></div></div>
              </div>
              <div className="flex w-full shrink-0 items-center gap-4 bg-[linear-gradient(165deg,oklch(0.32_0.035_40),oklch(0.17_0.02_40))] px-4 py-3.5 md:w-44 md:flex-col md:justify-center md:gap-3 md:py-6 2xl:w-48">
                <Skeleton className="h-14 w-14 rounded-full bg-white/10 md:h-20 md:w-20" /><div className="flex-1 space-y-2 md:w-full md:flex-none"><Skeleton className="h-3 w-24 bg-white/10 md:mx-auto" /><Skeleton className="h-3 w-full bg-white/10" /><Skeleton className="h-3 w-3/4 bg-white/10" /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="sticky top-0 hidden h-screen w-[300px] shrink-0 border-l border-border/70 xl:block"><div className="flex h-[68px] items-center gap-3 border-b border-border/70 px-5"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-28" /></div><div className="mt-6 px-5"><Skeleton className="h-5 w-40" /></div></div>
    </div>
  );
}
