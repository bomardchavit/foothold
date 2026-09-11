import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { CreateBaseButton } from "@/components/resume/create-base-button";
import { ResumeRowMenu } from "@/components/resume/resume-row-menu";

export const metadata = { title: "Résumés" };
export const dynamic = "force-dynamic";

interface Stats { reworded: number; expanded: number; added: number; addedSkills?: number }

export default async function ResumesPage() {
  const { user } = await requireOnboarded();
  const docs = await prisma.resumeDocument.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { job: { include: { company: true } } } });
  // One row per role (newest version) and one for the base résumé; older versions are counted, not listed.
  const groups = new Map<string, { latest: (typeof docs)[number]; versions: number }>();
  for (const d of docs) {
    const key = d.kind === "BASE" ? "base" : d.jobId ?? d.id;
    const g = groups.get(key);
    if (g) g.versions++; else groups.set(key, { latest: d, versions: 1 });
  }
  const rows = [...groups.values()].sort((a, b) => (a.latest.kind === b.latest.kind ? b.latest.createdAt.getTime() - a.latest.createdAt.getTime() : a.latest.kind === "BASE" ? 1 : -1));
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl">Résumés</h1><p className="mt-1 text-muted-foreground">A base résumé built from your profile, plus one tailored version per role. Every change is shown; unverified additions are labeled.</p></div>
        <CreateBaseButton hasBase={groups.has("base")} />
      </div>
      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="resumes-empty">No résumés yet. Build your base résumé, or open a job and choose “Tailor my résumé for this role”.</div>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-card" data-testid="resume-list">
          {rows.map(({ latest: d, versions }) => {
            const stats = (d.diffJson as { stats?: Stats } | null)?.stats;
            const changes = stats ? stats.reworded + stats.expanded + stats.added + (stats.addedSkills ?? 0) : 0;
            const when = formatDistanceToNowStrict(d.updatedAt, { addSuffix: true });
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="resume-row">
                <div className="min-w-0">
                  <Link href={`/resumes/${d.id}`} className="font-medium hover:underline" data-testid="resume-link">{d.title}</Link>
                  <p className="text-xs text-muted-foreground">
                    {d.kind === "BASE" ? "Base résumé" : `Tailored for ${d.job?.company.name ?? "a role"}`}{versions > 1 ? ` · v${versions}` : ""} · updated {when}{d.exportedAt ? " · exported" : ""}
                    {d.kind === "TAILORED" && stats && changes === 0 && <> · <span data-testid="no-changes">No changes needed, reordered only</span></>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {d.kind === "TAILORED" && stats && changes > 0 && (<>
                    {stats.reworded > 0 && <Badge variant="secondary">{stats.reworded} reworded</Badge>}
                    {stats.expanded > 0 && <Badge variant="outline" className="border-ochre text-foreground">{stats.expanded} expanded</Badge>}
                    {stats.added > 0 && <Badge variant="outline" className="border-plum">{stats.added} added</Badge>}
                    {(stats.addedSkills ?? 0) > 0 && <Badge variant="outline">{stats.addedSkills} skill{stats.addedSkills === 1 ? "" : "s"} added</Badge>}
                  </>)}
                  <Badge variant={d.kind === "BASE" ? "outline" : "default"}>{d.kind === "BASE" ? "Base" : "Tailored"}</Badge>
                  <ResumeRowMenu id={d.id} title={d.title} olderVersions={versions - 1} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
