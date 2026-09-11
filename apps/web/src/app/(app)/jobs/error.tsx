"use client";
import { Button } from "@/components/ui/button";
export default function JobsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-8 text-center" role="alert">
      <h2 className="text-xl">We couldn&apos;t load your jobs</h2>
      <p className="mt-2 text-sm text-muted-foreground">{/timeout|network|fetch/i.test(error.message) ? "The connection timed out. Check that the database and dev server are running." : "Something went wrong on our side."}</p>
      <p className="mt-1 text-xs text-muted-foreground">{error.digest ? `Reference: ${error.digest}` : error.message.slice(0, 160)}</p>
      <Button className="mt-5" onClick={reset}>Try again</Button>
    </div>
  );
}
