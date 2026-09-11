"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCopilot } from "@/components/copilot/copilot-context";
export function InterviewClient({ items }: { items: Array<{ id: string; title: string; company: string; status: string }> }) {
  const copilot = useCopilot();
  if (!items.length) return <p className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing to prep yet. Like or apply to a job first.</p>;
  return (
    <ul className="mt-6 divide-y rounded-xl border bg-card">
      {items.map((it) => (
        <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><Link href={`/jobs/${it.id}`} className="font-medium hover:underline">{it.title}</Link><p className="text-sm text-muted-foreground">{it.company} · {it.status}</p></div>
          <Button size="sm" onClick={() => copilot.open({ id: it.id, title: it.title, company: it.company }, "Prep me for an interview at this company")}>Prep with Belay</Button>
        </li>
      ))}
    </ul>
  );
}
