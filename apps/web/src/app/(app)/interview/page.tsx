import Link from "next/link";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { InterviewClient } from "@/components/jobs/workspace/interview-client";

export const metadata = { title: "Interview prep" };
export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const { user, profile } = await requireOnboarded();
  const apps = await prisma.application.findMany({ where: { userId: user.id, status: { in: ["APPLIED", "SCREENING", "INTERVIEW"] } }, orderBy: { updatedAt: "desc" }, include: { job: { include: { company: true } } }, take: 20 });
  const top = apps.length ? [] : await prisma.matchScore.findMany({ where: { profileId: profile.id, job: { isLowQuality: false } }, orderBy: { total: "desc" }, take: 5, include: { job: { include: { company: true } } } });
  const items = (apps.length ? apps.map((a) => ({ id: a.job.id, title: a.job.title, company: a.job.company.name, status: a.status as string })) : top.map((m) => ({ id: m.job.id, title: m.job.title, company: m.job.company.name, status: `${m.total}% fit` })));
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
      <h1 className="text-3xl">Interview prep</h1>
      <p className="mt-1 text-muted-foreground">Belay builds likely questions from the posting and points at the story in your profile to use for each. {apps.length ? "Showing your active applications." : "No active applications yet, so here are your top matches."} <Link className="underline" href="/tracker">Tracker</Link></p>
      <InterviewClient items={items} />
    </div>
  );
}
