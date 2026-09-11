import { Skeleton } from "@/components/ui/skeleton";
export default function JobsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading jobs">
      <div className="flex h-[76px] items-center gap-7 border-b border-border/70 px-6"><Skeleton className="h-8 w-24" /><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-20" /><Skeleton className="ml-auto h-10 w-64 rounded-full" /></div>
      <div className="flex flex-wrap gap-2.5 px-6 pt-5">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-9 w-32 rounded-lg" />)}</div>
      <div className="mt-5 space-y-4 px-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex overflow-hidden rounded-2xl border border-border/80 bg-card">
            <div className="flex-1 p-5"><div className="flex gap-4"><Skeleton className="h-20 w-20 rounded-lg" /><div className="flex-1 space-y-3 pt-1"><Skeleton className="h-4 w-44" /><Skeleton className="h-6 w-1/2" /></div></div><div className="mt-6 flex gap-4"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-40" /></div><div className="mt-8 flex justify-end"><Skeleton className="h-9 w-40 rounded-full" /></div></div>
            <Skeleton className="m-2 hidden w-48 rounded-xl md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
