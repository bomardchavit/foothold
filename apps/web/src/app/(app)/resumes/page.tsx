import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { CreateBaseButton } from "@/components/resume/create-base-button";

export const metadata = { title: "Résumés" };
export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const { user } = await requireOnboarded();
  const docs = await prisma.resumeDocument.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { job: { include: { company: true } } } });
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl">Résumés</h1><p className="mt-1 text-muted-foreground">A base résumé built from your profile, plus one tailored version per role. Every change is shown; unverified additions are labeled.</p></div>
        <CreateBaseButton />
      </div>
      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="resumes-empty">No résumés yet. Build your base résumé, or open a job and choose “Tailor my résumé for this role”.</div>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-card" data-testid="resume-list">
          {docs.map((d) => {
            const stats = (d.diffJson as { stats?: { reworded: number; expanded: number; added: number } } | null)?.stats;
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={`/resumes/${d.id}`} className="font-medium hover:underline" data-testid="resume-link">{d.title}</Link>
                  <p className="text-xs text-muted-foreground">{d.kind === "BASE" ? "Base résumé" : `Tailored for ${d.job?.company.name ?? "a role"}`} · {formatDistanceToNowStrict(d.createdAt, { addSuffix: true })}{d.exportedAt ? " · exported" : ""}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {d.kind === "TAILORED" && stats && (<><Badge variant="secondary">{stats.reworded} reworded</Badge>{stats.expanded > 0 && <Badge variant="outline" className="border-ochre text-foreground">{stats.expanded} expanded</Badge>}{stats.added > 0 && <Badge variant="outline" className="border-plum">{stats.added} added</Badge>}</>)}
                  <Badge variant={d.kind === "BASE" ? "outline" : "default"}>{d.kind === "BASE" ? "Base" : "Tailored"}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
