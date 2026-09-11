"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Progress } from "@/components/ui/progress";

export function TailorRunner({ jobId, title, company }: { jobId: string; title: string; company: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(8);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const tick = setInterval(() => setPct((p) => Math.min(92, p + Math.max(1, Math.round((92 - p) / 12)))), 700);
    fetch("/api/resume/tailor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Tailoring failed"); setPct(100); router.replace(`/resumes/${j.id}`); })
      .catch((e) => setError(e.message))
      .finally(() => clearInterval(tick));
    return () => clearInterval(tick);
  }, [jobId, router]);
  return (
    <div className="mx-auto max-w-lg py-16 text-center" data-testid="tailor-runner">
      <h1 className="text-2xl">Tailoring your résumé</h1>
      <p className="mt-2 text-sm text-muted-foreground">for {title} at {company}</p>
      <Progress className="mt-6" value={pct} />
      <p className="mt-3 text-xs text-muted-foreground">Reordering bullets, mirroring the posting&apos;s language, and checking every change against your profile.</p>
      {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
