import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { contentOf, decisionsOf } from "@/lib/resume/service";
import { ResumeWorkbench } from "@/components/resume/resume-workbench";
import type { KeywordGap } from "@/lib/resume/gaps";
import type { Validation } from "@/lib/resume/tailor";

export const dynamic = "force-dynamic";

export default async function ResumeDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireOnboarded();
  const { id } = await params;
  const doc = await prisma.resumeDocument.findFirst({ where: { id, userId: user.id }, include: { job: { include: { company: true } } } });
  if (!doc) notFound();
  const apps = doc.jobId ? await prisma.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId: doc.jobId } }, select: { id: true, status: true, resumeDocumentId: true } }) : null;
  return (
    <div className="px-4 pt-6 sm:px-6">
      <div className="mb-4 text-sm text-muted-foreground"><Link href="/resumes" className="underline">Résumés</Link> / {doc.title}</div>
      <ResumeWorkbench
        doc={{ id: doc.id, kind: doc.kind, title: doc.title, jobId: doc.jobId, jobTitle: doc.job?.title ?? null, company: doc.job?.company.name ?? null, createdAt: doc.createdAt.toISOString() }}
        content={contentOf(doc)} decisions={decisionsOf(doc)} gaps={(doc.gapsJson as KeywordGap[] | null) ?? []} validation={(doc.validationJson as Validation | null) ?? null}
        application={apps}
      />
    </div>
  );
}
