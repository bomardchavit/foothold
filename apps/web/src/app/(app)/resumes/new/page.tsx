import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { TailorRunner } from "@/components/resume/tailor-runner";

export const metadata = { title: "Tailoring…" };

export default async function NewTailoredPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  await requireOnboarded();
  const { jobId } = await searchParams;
  if (!jobId) notFound();
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) notFound();
  return <TailorRunner jobId={job.id} title={job.title} company={job.company.name} />;
}
