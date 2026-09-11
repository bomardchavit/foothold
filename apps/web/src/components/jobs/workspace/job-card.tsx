"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { MapPin, Briefcase, DollarSign, Building2, GraduationCap, Ban, Heart, Sparkles, Check, Dot, MoreHorizontal, CalendarDays } from "lucide-react";
import type { ApplicationStatus, EmploymentType, H1bSignal, Seniority, WorkplaceType, CompanySize } from "@prisma/client";
import { SENIORITY_LABELS, EMPLOYMENT_TYPE_LABELS, WORKPLACE_TYPE_LABELS, COMPANY_SIZE_LABELS, type MatchBreakdown } from "@foothold/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { salaryLabel, QualityBadges } from "@/components/jobs/badges";
import { useCopilot } from "@/components/copilot/copilot-context";
import { hideJobAction, likeJobAction } from "@/app/actions/jobs";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { CompanyLogo } from "./company-logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface CardData {
  jobId: string; title: string; company: string; companyId: string; industry: string | null; companySize: CompanySize | null;
  location: string | null; extraLocations: number; city: string | null; region: string | null; isRemote: boolean; workplaceType: WorkplaceType; employmentType: EmploymentType; seniority: Seniority;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryPeriod: string | null; postedAt: string | null; applyUrl: string; qualityFlags: string[];
  h1b: { signal: H1bSignal; matchedName: string | null; approvals: number; years: number[] }; alumni: number; connections: number; breakdown: MatchBreakdown; applicationStatus: ApplicationStatus | null; hidden: boolean; sourceKind: string;
}

export function JobCard({ data: d }: { data: CardData }) {
  const [gone, setGone] = useState(false);
  const [liked, setLiked] = useState(d.applicationStatus === "SAVED");
  const [pending, start] = useTransition();
  const copilot = useCopilot();
  const salary = salaryLabel(d.salaryMin, d.salaryMax, d.salaryCurrency, d.salaryPeriod);
  const posted = d.postedAt ? formatDistanceToNowStrict(new Date(d.postedAt), { addSuffix: true }) : null;
  const fresh = d.postedAt ? Date.now() - new Date(d.postedAt).getTime() < 3 * 86400_000 : false;
  const ctx = { id: d.jobId, title: d.title, company: d.company };
  if (gone) return null;
  const hide = () => start(async () => { const r = await hideJobAction(d.jobId, !d.hidden); if (r.ok) { setGone(true); toast.success(d.hidden ? "Job restored" : "Job hidden", { action: { label: "Undo", onClick: () => { void hideJobAction(d.jobId, d.hidden); setGone(false); } } }); } });
  const like = () => start(async () => { const next = !liked; setLiked(next); const r = await likeJobAction(d.jobId, next); if (!r.ok) { setLiked(!next); toast.error(r.error); } });
  const workplace = d.workplaceType === "UNKNOWN" ? (d.isRemote ? "REMOTE" : "ONSITE") : d.workplaceType;
  return (
    <article data-job-id={d.jobId} className="group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_8px_28px_-10px_rgba(0,0,0,0.2)] md:flex-row" data-testid="match-card">
      <div className="min-w-0 flex-1 p-5 pb-4">
        <div className="flex gap-4">
          <CompanyLogo companyId={d.companyId} name={d.company} size={80} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[12px] leading-5">
                {posted && <span className="rounded-md bg-muted px-2 py-0.5 text-foreground/70">{posted}</span>}
                {d.alumni > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-foreground/70">{d.alumni} school alumni</span>}
                {d.alumni === 0 && d.connections > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-foreground/70">{d.connections} connection{d.connections === 1 ? "" : "s"}</span>}
                {fresh && !d.qualityFlags.length && <span className="rounded-md bg-muted px-2 py-0.5 text-foreground/70">Early applicant</span>}
                {d.applicationStatus && d.applicationStatus !== "SAVED" && <span className="rounded-md bg-primary/15 px-2 py-0.5 font-medium text-primary">{d.applicationStatus.charAt(0) + d.applicationStatus.slice(1).toLowerCase()}</span>}
                <QualityBadges flags={d.qualityFlags} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button aria-label="More actions" className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground" data-testid="card-menu"><MoreHorizontal className="h-5 w-5" /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={hide}>{d.hidden ? "Restore job" : "Hide this job"}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={async () => { await navigator.clipboard.writeText(`${location.origin}/jobs/${d.jobId}`); toast.success("Link copied"); }}>Copy link</DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={d.applyUrl} target="_blank" rel="noopener noreferrer">Open original posting</a></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <h2 className="mt-1 truncate text-[22px] font-semibold leading-tight tracking-[-0.01em]" style={{ fontFamily: "inherit" }}>
              <Link href={`/jobs/${d.jobId}`} className="hover:underline" data-testid="match-title">{d.title}</Link>
            </h2>
            <p className="mt-1 truncate text-[15px] text-muted-foreground"><span className="font-medium text-foreground">{d.company}</span>{d.industry ? <> <span className="text-foreground/50">/</span> {d.industry}</> : ""}{d.companySize ? ` · ${COMPANY_SIZE_LABELS[d.companySize].split(" ")[0]} company` : ""}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2.5 text-[15px] sm:grid-cols-2 lg:grid-cols-3">
          <Row icon={MapPin} label={d.location ?? (d.isRemote ? "Remote" : "Location not stated")} extra={d.extraLocations > 0 ? `+${d.extraLocations} more` : undefined} />
          <Row icon={Briefcase} label={d.employmentType === "UNKNOWN" ? "Not specified" : EMPLOYMENT_TYPE_LABELS[d.employmentType]} />
          <Row icon={DollarSign} label={salary ?? "Compensation not listed"} muted={!salary} />
          <Row icon={Building2} label={WORKPLACE_TYPE_LABELS[workplace]} />
          <Row icon={GraduationCap} label={d.seniority === "UNKNOWN" ? "Level not stated" : SENIORITY_LABELS[d.seniority]} muted={d.seniority === "UNKNOWN"} />
          <Row icon={CalendarDays} label={posted ? `Posted ${posted}` : "Posting date unknown"} muted={!posted} />
        </dl>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <span className="text-[14px] text-muted-foreground">{d.breakdown.matchedSkills.length} skills matched{d.breakdown.missingRequired.length ? ` · missing ${d.breakdown.missingRequired.slice(0, 2).join(", ")}${d.breakdown.missingRequired.length > 2 ? "…" : ""}` : ""}</span>
          <div className="flex items-center gap-2">
            <Tooltip><TooltipTrigger asChild><button aria-label={d.hidden ? "Restore job" : "Hide job"} disabled={pending} onClick={hide} data-testid="hide-job" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background transition hover:bg-accent"><Ban className="h-4 w-4" /></button></TooltipTrigger><TooltipContent className="text-xs">{d.hidden ? "Restore" : "Hide this job"}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><button aria-label={liked ? "Unlike" : "Like"} aria-pressed={liked} disabled={pending} onClick={like} data-testid="like-job" className={cn("flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background transition hover:bg-accent", liked && "border-primary text-primary")}><Heart className={cn("h-4 w-4", liked && "fill-current")} /></button></TooltipTrigger><TooltipContent className="text-xs">{liked ? "Remove from liked" : "Like and save to tracker"}</TooltipContent></Tooltip>
            <button onClick={() => copilot.open(ctx, "Why do I match this role?")} data-testid="ask-why" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-bold uppercase tracking-wide text-background transition hover:opacity-90"><Sparkles className="h-4 w-4" /> Ask Belay</button>
            <a href={d.applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => { trackClient(EVENTS.job_viewed, { jobId: d.jobId, via: "apply" }); toast("Application page opened", { description: "Use the Foothold extension to fill the form, then review and submit it yourself." }); }} data-testid="apply-autofill"
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm transition hover:brightness-110">Apply with autofill</a>
          </div>
        </div>
      </div>
      <ScorePanel data={d} />
    </article>
  );
}

function Row({ icon: Icon, label, muted, extra }: { icon: typeof MapPin; label: string; muted?: boolean; extra?: string }) {
  return <div className={cn("flex min-w-0 items-center gap-2", muted && "text-muted-foreground")}><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{label}</span>{extra && <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs text-muted-foreground">{extra}</span>}</div>;
}

export function ScorePanel({ data: d }: { data: CardData }) {
  const total = d.breakdown.total;
  const label = total >= 75 ? "Strong match" : total >= 55 ? "Good match" : "Fair match";
  const r = 34, c = 2 * Math.PI * r, dash = (total / 100) * c;
  const bullets: Array<{ ok: boolean; text: string }> = [];
  if (d.h1b.signal === "YES") bullets.push({ ok: true, text: "H1B sponsor" });
  else if (d.h1b.signal === "LIKELY") bullets.push({ ok: true, text: "H1B sponsor likely" });
  else bullets.push({ ok: false, text: "No H1B data" });
  bullets.push(d.salaryMin || d.salaryMax ? { ok: true, text: "Comp. & benefits" } : { ok: false, text: "Comp. not listed" });
  if (d.alumni > 0) bullets.push({ ok: true, text: `${d.alumni} alumni inside` });
  const weak = d.breakdown.components.filter((x) => x.status === "scored" && x.score < 50).map((x) => x.label.toLowerCase());
  return (
    <Link href={`/jobs/${d.jobId}`} className="flex w-full shrink-0 flex-col items-center justify-center gap-3 bg-[linear-gradient(165deg,oklch(0.32_0.035_40),oklch(0.17_0.02_40))] px-5 py-6 text-center text-white md:w-48" data-testid="fit-bar" aria-label={`Fit ${total} of 100, ${label}`}>
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90"><circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="5" /><circle cx="40" cy="40" r={r} fill="none" stroke="oklch(0.8 0.15 48)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} className="transition-[stroke-dasharray] duration-700" /></svg>
        <div className="absolute inset-0 flex items-center justify-center text-[22px] font-bold tabular-nums" data-testid="fit-total">{total}<span className="text-xs font-medium">%</span></div>
      </div>
      <p className="text-[13px] font-bold uppercase tracking-wider">{label}</p>
      <ul className="w-full space-y-1 text-left text-[12px]">
        {bullets.map((b) => <li key={b.text} data-testid={/h1b/i.test(b.text) ? "h1b-badge" : undefined} className={cn("flex items-center gap-1.5", !b.ok && "text-white/60")}>{b.ok ? <Check className="h-3.5 w-3.5 text-[oklch(0.82_0.14_48)]" /> : <Dot className="h-3.5 w-3.5" />}{b.text}</li>)}
        {weak.length > 0 && <li className="flex items-center gap-1.5 text-white/60"><Dot className="h-3.5 w-3.5" />Weak: {weak.slice(0, 2).join(", ")}</li>}
      </ul>
    </Link>
  );
}
