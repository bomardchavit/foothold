import Link from "next/link";
import { similarRoles } from "@/lib/jobs/similar";
import { companyHasLogo } from "@/lib/jobs/logo";
import { CompanyLogo } from "@/components/jobs/workspace/company-logo";
import { FitRing } from "@/components/fit/fit-ring";

/** Top roles in the same title family, ranked by this profile's fit. */
export async function SimilarRoles({ profileId, userId, job }: { profileId: string; userId: string; job: { id: string; normalizedTitle: string } }) {
  const rows = await similarRoles(profileId, userId, job, 4);
  if (!rows.length) return null;
  return (
    <section data-testid="similar-roles">
      <h2 className="mb-3 text-xl">Similar roles</h2>
      <ul className="divide-y divide-border/70 rounded-2xl border border-border/80 bg-card">
        {rows.map((r) => (
          <li key={r.jobId}>
            <Link href={`/jobs/${r.jobId}`} className="focus-ring flex items-center gap-3 rounded-2xl p-3 transition hover:bg-accent/50">
              <CompanyLogo companyId={r.job.companyId} name={r.job.company.name} hasLogo={companyHasLogo(r.job.company)} className="h-11 w-11 text-[14px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{r.job.title}</p>
                <p className="truncate text-[13px] text-muted-foreground">{r.job.company.name}{r.job.location ? ` · ${r.job.location}` : r.job.isRemote ? " · Remote" : ""}</p>
              </div>
              <FitRing total={r.total} tone="light" className="h-11 w-11 text-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
