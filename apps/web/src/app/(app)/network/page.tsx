import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { NetworkClient, type ContactRow } from "@/components/network/network-client";

export const metadata = { title: "Network" };
export const dynamic = "force-dynamic";

export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ contact?: string; jobId?: string; company?: string }> }) {
  const { user } = await requireOnboarded();
  const sp = await searchParams;
  const [contacts, jobs, drafts] = await Promise.all([
    prisma.contact.findMany({ where: { userId: user.id }, orderBy: [{ currentCompany: "asc" }, { lastName: "asc" }] }),
    prisma.job.findMany({ where: { OR: [{ applications: { some: { userId: user.id } } }, { matches: { some: { profile: { userId: user.id }, total: { gte: 60 } } } }] }, select: { id: true, title: true, company: { select: { name: true } } }, take: 60, orderBy: { firstSeenAt: "desc" } }),
    prisma.outreachDraft.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20, include: { contact: true, job: { select: { title: true } } } }),
  ]);
  const rows: ContactRow[] = contacts.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, currentCompany: c.currentCompany, title: c.title, schools: c.schools, pastCompanies: c.pastCompanies, linkedinUrl: c.linkedinUrl, notes: c.notes, source: c.source }));
  return (
    <div className="px-4 pt-6 sm:px-6"><NetworkClient contacts={rows} jobs={jobs.map((j) => ({ id: j.id, label: `${j.title} · ${j.company.name}` }))}
      drafts={drafts.map((d) => ({ id: d.id, kind: d.kind, subject: d.subject, body: d.body, contact: `${d.contact.firstName} ${d.contact.lastName}`, job: d.job?.title ?? null, sentAt: d.markedSentAt?.toISOString() ?? null }))}
      initialContactId={sp.contact ?? null} initialJobId={sp.jobId ?? null} initialCompany={sp.company ?? ""} /></div>
  );
}
