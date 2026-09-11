"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import { deleteOlderVersionsAction } from "@/app/actions/resume";

/**
 * Runs one tailoring pass and lands on the workbench. Foothold keeps one tailored résumé per job: when this is a
 * re-tailor, the earlier version is replaced and any application attached to it is re-pointed at the new one.
 */
export function TailorRunner({ jobId, title, company, replaces }: { jobId: string; title: string; company: string; replaces: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(8);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const tick = setInterval(() => setPct((p) => Math.min(92, p + Math.max(1, Math.round((92 - p) / 12)))), 700);
    fetch("/api/resume/tailor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) })
      .then(async (r) => {
        const j = (await r.json()) as { id?: string; error?: string };
        if (!r.ok || !j.id) throw new Error(j.error ?? "Tailoring failed");
        if (replaces) await deleteOlderVersionsAction(j.id).catch(() => undefined);
        setPct(100);
        router.replace(`/resumes/${j.id}`);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Tailoring failed"))
      .finally(() => clearInterval(tick));
    return () => clearInterval(tick);
  }, [jobId, replaces, router]);
  return (
    <div className="mx-auto max-w-lg py-16 text-center" data-testid="tailor-runner">
      <h1 className="text-2xl">{replaces ? "Re-tailoring your résumé" : "Tailoring your résumé"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">for {title} at {company}</p>
      <Progress className="mt-6" value={pct} />
      <p className="mt-3 text-xs text-muted-foreground">Reordering bullets, mirroring the posting&apos;s language, and checking every change against your profile.{replaces ? " The earlier version for this role will be replaced." : ""}</p>
      {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
