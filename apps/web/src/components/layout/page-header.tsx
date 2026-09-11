import { cn } from "@/lib/utils";

/** One container for every non-workspace route: left-aligned, same gutter as the jobs workspace, so the content edge never jumps between pages. */
export const PAGE_CONTAINER = "w-full max-w-[1120px] px-4 pt-6 sm:px-6";

export function PageHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
