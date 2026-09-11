import { Skeleton } from "@/components/ui/skeleton";
export default function JobsLoading() {
  return (
    <div className="px-4 pt-5 sm:px-6" aria-busy="true" aria-label="Loading jobs">
      <div className="flex items-center gap-6"><Skeleton className="h-8 w-24" /><Skeleton className="h-6 w-32" /><Skeleton className="h-6 w-20" /><Skeleton className="h-6 w-20" /></div>
      <div className="mt-6 flex flex-wrap gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-32 rounded-lg" />)}</div>
      <div className="mt-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex overflow-hidden rounded-xl border bg-card">
            <div className="flex-1 p-5"><div className="flex gap-4"><Skeleton className="h-20 w-20 rounded-lg" /><div className="flex-1 space-y-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-1/2" /></div></div><div className="mt-5 grid grid-cols-3 gap-4"><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" /></div></div>
            <Skeleton className="hidden w-48 rounded-none md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
