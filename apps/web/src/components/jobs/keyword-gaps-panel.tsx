import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeKeywordGaps } from "@/lib/resume/gaps";
import { Badge } from "@/components/ui/badge";

export async function KeywordGapsPanel({ jobId }: { jobId: string }) {
  const { profile } = await requireOnboarded();
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) return null;
  const gaps = await computeKeywordGaps(profile, job);
  if (!gaps.length) return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Every keyword we could find in the posting already appears in your profile.</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card" data-testid="keyword-gaps">
      {gaps.map((g) => (
        <li key={g.term} className="flex flex-wrap items-start gap-3 p-3 text-sm">
          <Badge variant={g.status === "have" ? "secondary" : "outline"} className="mt-0.5 shrink-0">{g.term}</Badge>
          <span className={g.status === "missing" ? "text-muted-foreground" : ""}>{g.suggestion}</span>
        </li>
      ))}
    </ul>
  );
}
