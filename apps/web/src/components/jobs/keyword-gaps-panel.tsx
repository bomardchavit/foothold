import { ChevronDown } from "lucide-react";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeKeywordGaps, type KeywordGap } from "@/lib/resume/gaps";
import { Badge } from "@/components/ui/badge";

/** Missing terms as one chip row per group; the entries that come with a concrete suggestion (already in a bullet, or implied by a tool you list) expand. */
export async function KeywordGapsPanel({ jobId }: { jobId: string }) {
  const { profile } = await requireOnboarded();
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) return null;
  const gaps = await computeKeywordGaps(profile, job);
  if (!gaps.length) return <p className="rounded-2xl border border-border/80 bg-card p-4 text-sm text-muted-foreground">Every keyword we could find in the posting already appears in your profile.</p>;
  const missingReq = gaps.filter((g) => g.status === "missing" && g.required);
  const missingPref = gaps.filter((g) => g.status === "missing" && !g.required);
  const actionable = gaps.filter((g) => g.status !== "missing");
  const row = (label: string, list: KeywordGap[]) => list.length ? (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3">
      <span className="w-full text-[12px] font-semibold uppercase tracking-wider text-muted-strong sm:w-40 sm:pt-1">{label}</span>
      <div className="flex flex-wrap gap-1">{list.map((g) => <Badge key={g.term} variant="outline" className="border-dashed text-muted-foreground">{g.term}</Badge>)}</div>
    </div>
  ) : null;
  return (
    <div className="divide-y divide-border/70 rounded-2xl border border-border/80 bg-card text-[14px]" data-testid="keyword-gaps">
      {row("Missing, required", missingReq)}
      {row("Missing, nice to have", missingPref)}
      {actionable.length > 0 && (
        <div className="px-4 py-3">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-strong">Name these explicitly</span>
          <ul className="mt-1.5 space-y-1">
            {actionable.map((g) => (
              <li key={g.term}>
                <details className="group">
                  <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded-md py-1 [&::-webkit-details-marker]:hidden">
                    <Badge variant="secondary">{g.term}</Badge>
                    <span className="text-muted-foreground">{g.status === "have" ? "already in a bullet" : "implied by a tool you list"}{g.required ? " · required" : ""}</span>
                    <ChevronDown aria-hidden className="ml-auto h-4 w-4 text-muted-strong transition group-open:rotate-180" />
                  </summary>
                  <p className="pb-2 pl-1 text-muted-foreground">{g.suggestion}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
