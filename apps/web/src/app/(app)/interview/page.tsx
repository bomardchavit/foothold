import { PageHeader, PAGE_CONTAINER } from "@/components/layout/page-header";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { statusLabel } from "@/lib/tracker/status";
import { InterviewList, type InterviewItem } from "@/components/copilot/interview-list";

export const metadata = { title: "Interview prep" };
export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const { user, profile } = await requireOnboarded();
  const apps = await prisma.application.findMany({ where: { userId: user.id, status: { in: ["APPLIED", "SCREENING", "INTERVIEW"] } }, orderBy: { updatedAt: "desc" }, include: { job: { include: { company: true } } }, take: 20 });
  const top = apps.length ? [] : await prisma.matchScore.findMany({ where: { profileId: profile.id, job: { isLowQuality: false, closedAt: null } }, orderBy: { total: "desc" }, take: 5, include: { job: { include: { company: true } } } });
  const base = apps.length
    ? apps.map((a) => ({ id: a.job.id, title: a.job.title, company: a.job.company.name, status: statusLabel(a.status) }))
    : top.map((m) => ({ id: m.job.id, title: m.job.title, company: m.job.company.name, status: `${m.total}% fit` }));
  // A saved Belay conversation for the job means prep already started; the row offers to continue it.
  const convs = await prisma.copilotConversation.findMany({ where: { userId: user.id, jobId: { in: base.map((b) => b.id) }, messages: { some: {} } }, select: { jobId: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
  const prepAt = new Map<string, Date>();
  for (const c of convs) if (c.jobId && !prepAt.has(c.jobId)) prepAt.set(c.jobId, c.updatedAt);
  const items: InterviewItem[] = base.map((b) => ({ ...b, prepStartedAgo: prepAt.has(b.id) ? formatDistanceToNowStrict(prepAt.get(b.id)!, { addSuffix: true }) : null }));
  return (
    <div className={PAGE_CONTAINER}>
      <PageHeader title="Interview prep" description={<>Belay builds likely questions from the posting and points at the story in your profile to use for each. {apps.length ? "Showing your active applications." : "No active applications yet, so here are your top matches."} <Link className="underline" href="/tracker">Tracker</Link></>} />
      <InterviewList items={items} />
    </div>
  );
}
