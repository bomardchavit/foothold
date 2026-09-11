import { PageHeader, PAGE_CONTAINER } from "@/components/layout/page-header";
import Link from "next/link";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { topSkillGaps, componentAverages, fitDistribution } from "@/lib/insights/aggregate";
import { COMPONENT_LABELS } from "@foothold/shared";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const { user, profile } = await requireOnboarded();
  const [gaps, avg, dist, apps] = await Promise.all([topSkillGaps(profile.id), componentAverages(profile.id), fitDistribution(profile.id), prisma.application.groupBy({ by: ["status"], where: { userId: user.id }, _count: true })]);
  const maxGap = Math.max(1, ...gaps.gaps.map((g) => g.count));
  const maxDist = Math.max(1, ...dist.map((d) => d.count));
  const keys = ["skills", "semantic", "seniority", "years", "industry", "location"] as const;
  return (
    <div className={`${PAGE_CONTAINER} space-y-10`}>
      <PageHeader className="mb-0" title="Insights" description="What the market for your target roles asks for, and where you stand." />
      <section>
        <h2 className="text-xl">Skills you are missing most often</h2>
        <p className="mb-4 text-sm text-muted-foreground">Across your top {gaps.sampleSize} matches. Bars show how many of those postings list the skill; the darker part is where it is required.</p>
        {gaps.gaps.length === 0 ? <p className="text-sm text-muted-foreground">No gaps: your profile covers every skill in your top matches.</p> : (
          <ul className="space-y-2" data-testid="skill-gaps">
            {gaps.gaps.map((g) => (
              <li key={g.skill} className="grid grid-cols-[160px_1fr_60px] items-center gap-3 text-sm">
                <span className="truncate">{g.skill}</span>
                <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="relative h-full rounded-full bg-primary/40" style={{ width: `${(g.count / maxGap) * 100}%` }}><div className="h-full rounded-full bg-primary" style={{ width: `${(g.required / Math.max(1, g.count)) * 100}%` }} /></div></div>
                <span className="tabular-nums text-muted-foreground">{g.count}<span className="text-xs"> / {gaps.sampleSize}</span></span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Have one of these already? <Link className="underline" href="/settings/profile">Add it to your profile</Link> and your scores update.</p>
      </section>
      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl">Where you score, on average</h2>
          <p className="mb-4 text-sm text-muted-foreground">Mean component score across your top {avg?.n ?? 0} matches.</p>
          <ul className="space-y-2 text-sm">
            {keys.map((k) => (
              <li key={k} className="grid grid-cols-[130px_1fr_40px] items-center gap-3">
                <span>{COMPONENT_LABELS[k]}</span>
                <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(avg?.[k] ?? 0)}%` }} /></div>
                <span className="tabular-nums text-muted-foreground">{Math.round(avg?.[k] ?? 0)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xl">Fit distribution</h2>
          <p className="mb-4 text-sm text-muted-foreground">How your matches spread across the fit scale.</p>
          <ul className="space-y-1.5 text-sm">
            {dist.map((d) => <li key={d.bucket} className="grid grid-cols-[60px_1fr_40px] items-center gap-3"><span className="tabular-nums">{d.bucket}</span><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-slate" style={{ width: `${(d.count / maxDist) * 100}%` }} /></div><span className="tabular-nums text-muted-foreground">{d.count}</span></li>)}
          </ul>
        </div>
      </section>
      <section>
        <h2 className="text-xl">Your skills the market wants</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">{gaps.have.map((h) => <span key={h.skill} className="rounded-full border bg-secondary px-2.5 py-0.5 text-xs">{h.skill} · {h.count}</span>)}</div>
      </section>
      <section>
        <h2 className="text-xl">Pipeline</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">{["SAVED", "APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED"].map((s) => <span key={s} className="rounded-md border px-3 py-1.5">{s.charAt(0) + s.slice(1).toLowerCase()}: <strong>{apps.find((a) => a.status === s)?._count ?? 0}</strong></span>)}</div>
      </section>
    </div>
  );
}
