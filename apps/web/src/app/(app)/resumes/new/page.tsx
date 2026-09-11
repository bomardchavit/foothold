import { notFound, redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { contentOf } from "@/lib/resume/service";
import { TailorRunner } from "@/components/resume/tailor-runner";
import { builtFromCurrentProfile } from "../freshness";

export const metadata = { title: "Tailoring…" };
export const dynamic = "force-dynamic";

/**
 * One tailored résumé per job: if a version already exists and the profile has not changed since, open it
 * instead of running tailoring again. `force=1` (the workbench's "Re-tailor") always runs and replaces it.
 */
export default async function NewTailoredPage({ searchParams }: { searchParams: Promise<{ jobId?: string; force?: string }> }) {
  const { user, profile } = await requireOnboarded();
  const { jobId, force } = await searchParams;
  if (!jobId) notFound();
  const [job, existing] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, include: { company: true } }),
    prisma.resumeDocument.findFirst({ where: { userId: user.id, jobId, kind: "TAILORED" }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!job) notFound();
  if (existing && force !== "1" && builtFromCurrentProfile(contentOf(existing), profile)) redirect(`/resumes/${existing.id}`);
  return <TailorRunner jobId={job.id} title={job.title} company={job.company.name} replaces={Boolean(existing)} />;
}
