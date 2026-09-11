"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Ban, Heart, Sparkles, FileText, Check } from "lucide-react";
import type { ApplicationStatus } from "@prisma/client";
import { FitRing, FitSignalList, fitLabel, type FitSignal } from "@/components/fit/fit-ring";
import { useCopilot } from "@/components/copilot/copilot-context";
import { hideJobAction, likeJobAction } from "@/app/actions/jobs";
import { saveJobAction, setStatusAction } from "@/app/actions/tracker";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LABELS: Record<ApplicationStatus, string> = { SAVED: "Saved", APPLIED: "Applied", SCREENING: "Screening", INTERVIEW: "Interview", OFFER: "Offer", REJECTED: "Rejected" };
const TRACKED: ApplicationStatus[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"];
const circle = "focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background transition hover:bg-accent disabled:opacity-60";

/** The job page's sticky card: the same ring, label and signal rows as the feed card, the apply pill, hide/like, and one status control. */
export function JobScoreCard({ job, total, signals, application, hidden: initialHidden }: { job: { id: string; title: string; company: string; applyUrl: string }; total: number; signals: FitSignal[]; application: { id: string; status: ApplicationStatus } | null; hidden: boolean }) {
  const [app, setApp] = useState(application);
  const [hidden, setHidden] = useState(initialHidden);
  const [pending, start] = useTransition();
  const copilot = useCopilot();
  const ctx = { id: job.id, title: job.title, company: job.company };
  const liked = app?.status === "SAVED";
  const tracked = app ? TRACKED.includes(app.status) : false;

  const setStatus = (status: ApplicationStatus) => start(async () => {
    const r = app ? await setStatusAction(app.id, status) : await saveJobAction(job.id, status);
    if (!r.ok) { toast.error(r.error); return; }
    setApp(r.data);
    toast.success(status === "SAVED" ? "Saved to your tracker" : `Marked as ${LABELS[status].toLowerCase()}`);
  });
  const like = () => start(async () => {
    const next = !liked;
    const r = await likeJobAction(job.id, next);
    if (!r.ok) { toast.error(r.error); return; }
    setApp(next ? { id: app?.id ?? "pending", status: "SAVED" } : null);
  });
  const hide = () => start(async () => {
    const next = !hidden;
    const r = await hideJobAction(job.id, next);
    if (!r.ok) { toast.error(r.error); return; }
    setHidden(next);
    toast.success(next ? "Hidden from your feed" : "Back in your feed");
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid="job-score-card">
      <div className="flex items-center gap-4 bg-[linear-gradient(165deg,oklch(0.32_0.035_40),oklch(0.17_0.02_40))] px-5 py-5 text-white">
        <FitRing total={total} className="h-20 w-20" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold uppercase tracking-wider">{fitLabel(total)}</p>
          <FitSignalList signals={signals} className="mt-2 space-y-1" />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" data-testid="apply-autofill"
            onClick={() => { trackClient(EVENTS.job_viewed, { jobId: job.id, via: "apply" }); toast("Application page opened", { description: "Use the Foothold extension to fill the form, then review and submit it yourself." }); }}
            className="focus-ring inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-full bg-primary px-4 text-[13px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm transition hover:brightness-110">Apply with autofill</a>
          <button aria-label={hidden ? "Restore job" : "Hide job"} title={hidden ? "Restore to feed" : "Hide from feed"} disabled={pending} onClick={hide} data-testid="hide-job" className={cn(circle, hidden && "border-foreground bg-foreground text-background")}><Ban className="h-4 w-4" /></button>
          <button aria-label={liked ? "Unlike" : "Like"} aria-pressed={liked} title={liked ? "Remove from liked" : "Like and save to tracker"} disabled={pending} onClick={like} data-testid="like-job" className={cn(circle, liked && "border-primary text-primary")}><Heart className={cn("h-4 w-4", liked && "fill-current")} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/resumes/new?jobId=${job.id}`} data-testid="tailor-button" className="focus-ring inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-[13px] font-semibold transition hover:bg-accent"><FileText className="h-4 w-4" />Tailor résumé</Link>
          <button onClick={() => copilot.open(ctx, "Why do I match this role?")} data-testid="ask-why" className="focus-ring inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-foreground px-3 text-[13px] font-semibold text-background transition hover:opacity-90"><Sparkles className="h-4 w-4" />Ask Belay</button>
        </div>
        {tracked && app ? (
          <Link href="/tracker" className="focus-ring flex h-10 items-center justify-center gap-2 rounded-full bg-primary/12 text-[13px] font-semibold text-primary-strong transition hover:bg-primary/18" data-testid="application-status"><Check className="h-4 w-4" />{LABELS[app.status]} · open in tracker</Link>
        ) : (
          <div className="grid grid-cols-2 overflow-hidden rounded-full border border-border text-[13px] font-semibold" role="group" aria-label="Application status">
            <button disabled={pending} onClick={() => (liked ? setStatus("SAVED") : like())} aria-pressed={liked} data-testid="save-job" className={cn("focus-ring h-10 transition", liked ? "bg-accent text-foreground" : "hover:bg-accent/60")}>{liked ? "Saved" : "Save"}</button>
            <button disabled={pending} onClick={() => setStatus("APPLIED")} data-testid="mark-applied" className="focus-ring h-10 border-l border-border transition hover:bg-accent/60">I applied</button>
          </div>
        )}
        {hidden && <p className="text-xs text-muted-foreground">Hidden from your feed. <button className="underline" onClick={hide}>Restore</button></p>}
        <p className="text-[11px] leading-4 text-muted-foreground">Foothold never submits applications for you. The extension fills the form; you review and submit it.</p>
      </div>
    </div>
  );
}
