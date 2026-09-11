"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { ApplicationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCopilot } from "@/components/copilot/copilot-context";
import { saveJobAction, setStatusAction } from "@/app/actions/tracker";
import { toast } from "sonner";

const LABELS: Record<ApplicationStatus, string> = { SAVED: "Saved", APPLIED: "Applied", SCREENING: "Screening", INTERVIEW: "Interview", OFFER: "Offer", REJECTED: "Rejected" };

export function JobActions({ job, application }: { job: { id: string; title: string; company: string; applyUrl: string }; application: { id: string; status: ApplicationStatus } | null }) {
  const [app, setApp] = useState(application);
  const [pending, start] = useTransition();
  const copilot = useCopilot();
  const ctx = { id: job.id, title: job.title, company: job.company };
  const save = (status: ApplicationStatus) => start(async () => {
    const r = app ? await setStatusAction(app.id, status) : await saveJobAction(job.id, status);
    if (!r.ok) { toast.error(r.error); return; }
    setApp(r.data);
    toast.success(status === "SAVED" ? "Saved to your tracker" : `Marked as ${LABELS[status].toLowerCase()}`);
  });
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Button asChild className="w-full" size="lg"><Link href={`/resumes/new?jobId=${job.id}`} data-testid="tailor-button">Tailor my résumé for this role</Link></Button>
        <Button variant="outline" className="w-full" onClick={() => copilot.open(ctx, "Why do I match this role?")} data-testid="ask-why">Ask Belay why I match</Button>
        <Button variant="outline" className="w-full" onClick={() => copilot.open(ctx, "Should I apply?")}>Should I apply?</Button>
        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          {!app || app.status === "REJECTED" ? (
            <Button variant="secondary" disabled={pending} onClick={() => save("SAVED")} data-testid="save-job">Save</Button>
          ) : (
            <Button variant="secondary" disabled className="truncate">{LABELS[app.status]}</Button>
          )}
          <Button variant="secondary" disabled={pending || app?.status === "APPLIED"} onClick={() => save("APPLIED")} data-testid="mark-applied">I applied</Button>
        </div>
        <Button asChild variant="ghost" className="w-full"><a href={job.applyUrl} target="_blank" rel="noopener noreferrer">Open the application page ↗</a></Button>
        <p className="text-[11px] text-muted-foreground">Foothold never submits applications for you. Use the extension to fill the form, then review and submit it yourself.</p>
        {app && <p className="text-xs"><Link className="underline" href="/tracker">In your tracker as {LABELS[app.status]}</Link></p>}
      </CardContent>
    </Card>
  );
}
