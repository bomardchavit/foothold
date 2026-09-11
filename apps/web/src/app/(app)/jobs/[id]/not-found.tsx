import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function JobNotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 pt-24 text-center">
      <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-strong">Job not found</p>
      <h1 className="mt-2 text-3xl">This job is gone</h1>
      <p className="mt-2 text-muted-foreground">The posting was removed or the link is wrong. Roles that close are taken out of your feed automatically.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button asChild size="lg"><Link href="/jobs">Back to jobs</Link></Button>
        <Button asChild variant="outline" size="lg"><Link href="/tracker">Open tracker</Link></Button>
      </div>
    </div>
  );
}
