"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { MapPin, Briefcase, DollarSign, Building2, GraduationCap, Users, Ban, Heart, Sparkles, MoreHorizontal } from "lucide-react";
import type { ApplicationStatus, EmploymentType, H1bSignal, Seniority, WorkplaceType, CompanySize } from "@prisma/client";
import { SENIORITY_LABELS, EMPLOYMENT_TYPE_LABELS, WORKPLACE_TYPE_LABELS, COMPANY_SIZE_LABELS, type MatchBreakdown } from "@foothold/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { salaryLabel, QualityBadges } from "@/components/jobs/badges";
import { FitRing, FitSignalList, fitLabel, fitSignals } from "@/components/fit/fit-ring";
import { useCopilot } from "@/components/copilot/copilot-context";
import { hideJobAction, likeJobAction } from "@/app/actions/jobs";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { CompanyLogo } from "./company-logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface CardData {
  jobId: string; title: string; company: string; companyId: string; hasLogo: boolean; industry: string | null; companySize: CompanySize | null;
  location: string | null; extraLocations: number; city: string | null; region: string | null; isRemote: boolean; workplaceType: WorkplaceType; employmentType: EmploymentType; seniority: Seniority;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryPeriod: string | null; postedAt: string | null; applyUrl: string; qualityFlags: string[];
  h1b: { signal: H1bSignal; matchedName: string | null; approvals: number; years: number[] }; alumni: number; connections: number; breakdown: MatchBreakdown; applicationStatus: ApplicationStatus | null; hidden: boolean; sourceKind: string;
}

const circle = "focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background transition hover:bg-accent disabled:opacity-60";

/** One row of the feed. The card is a CSS container so the action row and detail grid adapt to the card's own width (the right rail toggles it), not the viewport. */
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
  const matched = d.breakdown.matchedSkills.length;
  const skillsText = `${matched} skill${matched === 1 ? "" : "s"} matched${d.breakdown.missingRequired.length ? ` · missing ${d.breakdown.missingRequired.slice(0, 2).join(", ")}${d.breakdown.missingRequired.length > 2 ? "…" : ""}` : ""}`;
  return (
    <article data-job-id={d.jobId} className="group @container flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_8px_28px_-10px_rgba(0,0,0,0.2)] md:flex-row" data-testid="match-card">
      <div className="min-w-0 flex-1 p-4 md:p-5 md:pb-4">
        <div className="flex gap-3.5 md:gap-4">
          <CompanyLogo companyId={d.companyId} name={d.company} hasLogo={d.hasLogo} className="h-14 w-14 text-[18px] md:h-20 md:w-20 md:text-[26px]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[12px] leading-5">
                {posted && <span className="rounded-md bg-muted px-2 py-0.5 text-muted-strong">{posted}</span>}
                {d.alumni > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-muted-strong">{d.alumni} school alumni</span>}
                {d.alumni === 0 && d.connections > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-muted-strong">{d.connections} connection{d.connections === 1 ? "" : "s"}</span>}
                {fresh && !d.qualityFlags.length && <span className="rounded-md bg-muted px-2 py-0.5 text-muted-strong">Early applicant</span>}
                {d.applicationStatus && d.applicationStatus !== "SAVED" && <span className="rounded-md bg-primary/12 px-2 py-0.5 font-semibold text-primary-strong">{d.applicationStatus.charAt(0) + d.applicationStatus.slice(1).toLowerCase()}</span>}
                <QualityBadges flags={d.qualityFlags} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button aria-label="More actions" className="focus-ring -mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground" data-testid="card-menu"><MoreHorizontal className="h-5 w-5" /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={hide}>{d.hidden ? "Restore job" : "Hide this job"}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={async () => { await navigator.clipboard.writeText(`${location.origin}/jobs/${d.jobId}`); toast.success("Link copied"); }}>Copy link</DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={d.applyUrl} target="_blank" rel="noopener noreferrer">Open original posting</a></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <h2 className="mt-1 line-clamp-2 text-[18px] font-semibold leading-tight tracking-[-0.01em] md:text-[22px]" style={{ fontFamily: "inherit" }}>
              <Link href={`/jobs/${d.jobId}`} className="focus-ring rounded-sm hover:underline" data-testid="match-title">{d.title}</Link>
            </h2>
            <p className="mt-1 truncate text-[14px] text-muted-foreground md:text-[15px]"><span className="font-medium text-foreground">{d.company}</span>{d.industry ? <> <span aria-hidden className="text-muted-foreground/70">/</span> {d.industry}</> : ""}</p>
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] @[720px]:grid-cols-3 md:mt-5 md:gap-x-6 md:gap-y-2.5 md:text-[15px]" aria-label="Role details">
          <Row icon={MapPin} label="Location" value={d.location ?? (d.isRemote ? "Remote" : "Location not stated")} muted={!d.location && !d.isRemote} extra={d.extraLocations > 0 ? `+${d.extraLocations} more` : undefined} />
          <Row icon={Briefcase} label="Employment type" value={d.employmentType === "UNKNOWN" ? "Type not stated" : EMPLOYMENT_TYPE_LABELS[d.employmentType]} muted={d.employmentType === "UNKNOWN"} />
          <Row icon={DollarSign} label="Compensation" value={salary ?? "Compensation not listed"} muted={!salary} />
          <Row icon={GraduationCap} label="Level" value={d.seniority === "UNKNOWN" ? "Level not stated" : SENIORITY_LABELS[d.seniority]} muted={d.seniority === "UNKNOWN"} />
          <Row icon={Building2} label="Workplace" value={WORKPLACE_TYPE_LABELS[workplace]} className="hidden @[480px]:flex" />
          <Row icon={Users} label="Company size" value={d.companySize ? `${COMPANY_SIZE_LABELS[d.companySize]} company` : fresh ? "Early applicant" : "Company size not stated"} muted={!d.companySize && !fresh} className="hidden @[480px]:flex" />
        </ul>
        <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-3.5 @[520px]:flex-row @[520px]:items-center md:mt-5 md:pt-4">
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground md:text-[14px]" title={skillsText}>{skillsText}</span>
          <div className="flex shrink-0 items-center gap-2">
            <Tooltip><TooltipTrigger asChild><button aria-label={d.hidden ? "Restore job" : "Hide job"} disabled={pending} onClick={hide} data-testid="hide-job" className={circle}><Ban className="h-4 w-4" /></button></TooltipTrigger><TooltipContent className="text-xs">{d.hidden ? "Restore" : "Hide this job"}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><button aria-label={liked ? "Unlike" : "Like"} aria-pressed={liked} disabled={pending} onClick={like} data-testid="like-job" className={cn(circle, liked && "border-primary text-primary")}><Heart className={cn("h-4 w-4", liked && "fill-current")} /></button></TooltipTrigger><TooltipContent className="text-xs">{liked ? "Remove from liked" : "Like and save to tracker"}</TooltipContent></Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => copilot.open(ctx, "Why do I match this role?")} data-testid="ask-why" aria-label="Ask Belay why I match this role"
                  className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-foreground text-[13px] font-bold uppercase tracking-wide text-background transition hover:opacity-90 @[780px]:w-auto @[780px]:px-4">
                  <Sparkles className="h-4 w-4" /><span className="hidden @[780px]:inline">Ask Belay</span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Ask Belay why you match</TooltipContent>
            </Tooltip>
            <a href={d.applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => { trackClient(EVENTS.job_viewed, { jobId: d.jobId, via: "apply" }); toast("Application page opened", { description: "Use the Foothold extension to fill the form, then review and submit it yourself." }); }} data-testid="apply-autofill"
              className="focus-ring inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full bg-primary px-3.5 text-[12px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm transition hover:brightness-110 @[520px]:flex-none @[520px]:px-4 @[520px]:text-[13px]">Apply with autofill</a>
          </div>
        </div>
      </div>
      <ScorePanel data={d} />
    </article>
  );
}

function Row({ icon: Icon, label, value, muted, extra, className }: { icon: typeof MapPin; label: string; value: string; muted?: boolean; extra?: string; className?: string }) {
  return (
    <li className={cn("flex min-w-0 items-center gap-2", muted && "text-muted-foreground", className)}>
      <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">{label}: </span>
      <span className="truncate" title={value}>{value}</span>
      {extra && <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs text-muted-foreground">{extra}</span>}
    </li>
  );
}

/** Dark score panel: a strip under the card on phones (ring left, rows right), a column beside it from md up. */
export function ScorePanel({ data: d }: { data: CardData }) {
  const total = d.breakdown.total;
  const label = fitLabel(total);
  const signals = fitSignals({ h1b: d.h1b.signal, hasSalary: Boolean(d.salaryMin || d.salaryMax), alumni: d.alumni, breakdown: d.breakdown });
  return (
    <Link href={`/jobs/${d.jobId}`} data-testid="fit-bar" aria-label={`Fit ${total} of 100, ${label}`}
      className="focus-ring flex w-full shrink-0 items-center gap-4 bg-[linear-gradient(165deg,oklch(0.32_0.035_40),oklch(0.17_0.02_40))] px-4 py-3.5 text-white md:w-44 md:flex-col md:justify-center md:gap-3 md:py-6 md:text-center 2xl:w-48">
      <FitRing total={total} className="h-14 w-14 md:h-20 md:w-20" />
      <div className="min-w-0 flex-1 md:w-full md:flex-none">
        <p className="text-[12px] font-bold uppercase tracking-wider md:text-[13px]">{label}</p>
        <FitSignalList signals={signals} className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 md:mt-2.5 md:block md:space-y-1" />
      </div>
    </Link>
  );
}
