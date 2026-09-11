"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCopilot } from "@/components/copilot/copilot-context";

export interface InterviewItem { id: string; title: string; company: string; status: string; prepStartedAgo: string | null }

/** Rows of roles to prepare for; a row with a saved Belay conversation continues it instead of starting over. */
export function InterviewList({ items }: { items: InterviewItem[] }) {
  const copilot = useCopilot();
  if (!items.length) return <p className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing to prep yet. Like or apply to a job first.</p>;
  return (
    <ul className="mt-6 divide-y rounded-xl border bg-card" data-testid="interview-list">
      {items.map((it) => (
        <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <Link href={`/jobs/${it.id}`} className="font-medium hover:underline">{it.title}</Link>
            <p className="text-sm text-muted-foreground">{it.company} · <Badge variant="secondary" className="font-normal">{it.status}</Badge>{it.prepStartedAgo && <span> · prep started {it.prepStartedAgo}</span>}</p>
          </div>
          <Button size="sm" variant={it.prepStartedAgo ? "outline" : "default"} onClick={() => copilot.open({ id: it.id, title: it.title, company: it.company }, it.prepStartedAgo ? undefined : "Prep me for an interview at this company")} data-testid="prep-with-belay">
            {it.prepStartedAgo ? "Continue prep" : "Prep with Belay"}
          </Button>
        </li>
      ))}
    </ul>
  );
}
