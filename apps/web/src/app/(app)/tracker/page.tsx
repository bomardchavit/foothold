import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { KanbanBoard, type BoardApplication, type BoardResume } from "@/components/tracker/kanban-board";

export const metadata = { title: "Tracker" };
export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const { user } = await requireOnboarded();
  const [apps, docs] = await Promise.all([
    prisma.application.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, include: { job: { include: { company: true } }, resumeDocument: { select: { id: true, title: true } }, events: { orderBy: { at: "asc" } }, notes: { orderBy: { createdAt: "desc" } } } }),
    prisma.resumeDocument.findMany({ where: { userId: user.id }, select: { id: true, title: true, kind: true, jobId: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const data: BoardApplication[] = apps.map((a) => ({
    id: a.id, status: a.status, jobId: a.jobId, title: a.job.title, company: a.job.company.name, location: a.job.location, applyUrl: a.job.applyUrl,
    appliedAt: a.appliedAt?.toISOString() ?? null, updatedAt: a.updatedAt.toISOString(), source: a.source,
    resume: a.resumeDocument ? { id: a.resumeDocument.id, title: a.resumeDocument.title } : null,
    events: a.events.map((e) => ({ id: e.id, from: e.fromStatus, to: e.toStatus, at: e.at.toISOString(), note: e.note })),
    notes: a.notes.map((n) => ({ id: n.id, body: n.body, at: n.createdAt.toISOString() })),
  }));
  return (
    <div className="px-4 pt-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl">Application tracker</h1><p className="mt-1 text-sm text-muted-foreground">Every status change is timestamped. Drag a card between columns or open it to change its status, attach a résumé and add notes.</p></div>
        <p className="text-sm text-muted-foreground">{data.length} application{data.length === 1 ? "" : "s"}</p>
      </div>
      <KanbanBoard applications={data} resumes={docs.map((d): BoardResume => ({ id: d.id, title: d.title, kind: d.kind, jobId: d.jobId, createdAt: d.createdAt.toISOString() }))} />
    </div>
  );
}
