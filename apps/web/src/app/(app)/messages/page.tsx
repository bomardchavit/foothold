import { PageHeader, PAGE_CONTAINER } from "@/components/layout/page-header";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { newSinceLastVisit } from "@/lib/jobs/query";

export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const { user, profile } = await requireOnboarded();
  const [digests, events, fresh] = await Promise.all([
    prisma.digestSend.findMany({ where: { userId: user.id }, orderBy: { sentAt: "desc" }, take: 10 }),
    prisma.applicationEvent.findMany({ where: { application: { userId: user.id } }, orderBy: { at: "desc" }, take: 20, include: { application: { include: { job: { include: { company: true } } } } } }),
    newSinceLastVisit(profile.id, profile.lastFeedVisitAt, 5),
  ]);
  const items = [
    ...fresh.map((m) => ({ at: m.job.firstSeenAt, text: `New match: ${m.job.title} at ${m.job.company.name} (${m.total}% fit)`, href: `/jobs/${m.jobId}` })),
    ...events.map((e) => ({ at: e.at, text: `${e.application.job.title} at ${e.application.job.company.name} moved to ${e.toStatus.charAt(0) + e.toStatus.slice(1).toLowerCase()}`, href: "/tracker" })),
    ...digests.map((d) => ({ at: d.sentAt, text: `Daily digest sent with ${d.jobIds.length} new matches`, href: "/jobs" })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return (
    <div className={PAGE_CONTAINER}>
      <PageHeader title="Messages" description="New matches, application updates and digests." />
      {items.length === 0 ? <p className="max-w-3xl rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing yet. New matches and tracker updates land here.</p> : (
        <ul className="max-w-3xl divide-y rounded-2xl border bg-card">
          {items.map((it, i) => <li key={i} className="flex items-center justify-between gap-4 p-4 text-sm"><Link href={it.href} className="hover:underline">{it.text}</Link><span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNowStrict(it.at, { addSuffix: true })}</span></li>)}
        </ul>
      )}
    </div>
  );
}
