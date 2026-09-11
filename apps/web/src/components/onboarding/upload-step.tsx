"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { startBlankProfileAction } from "@/app/actions/profile";
import { cn } from "@/lib/utils";

type Phase = "idle" | "uploading" | "parsing" | "done" | "error";

export function UploadStep({ hasExisting, redirectTo = "/onboarding?step=review" }: { hasExisting: boolean; redirectTo?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ experience: number; education: number; skills: number; mode: string | null } | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null); setFileName(file.name); setPhase("uploading");
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/resume/upload", { method: "POST", body: fd });
    if (!res.ok) { setError((await res.json().catch(() => ({ error: res.statusText }))).error ?? "Upload failed"); setPhase("error"); return; }
    const { id } = (await res.json()) as { id: string };
    setPhase("parsing");
    const started = Date.now();
    while (Date.now() - started < 120_000) {
      await new Promise((r) => setTimeout(r, 1200));
      const s = await fetch(`/api/resume/upload/${id}`).then((r) => r.json()) as { status: string; error?: string; summary?: { experience: number; education: number; skills: number }; mode?: string };
      if (s.status === "DONE") { setSummary({ ...s.summary!, mode: s.mode ?? null }); setPhase("done"); trackClient(EVENTS.onboarding_step_completed, { step: "upload", mode: s.mode }); return; }
      if (s.status === "FAILED") { setError(s.error ?? "Parsing failed"); setPhase("error"); return; }
    }
    setError("Parsing is taking too long. Try again or start from a blank profile."); setPhase("error");
  }

  useEffect(() => { if (phase === "done") { const t = setTimeout(() => router.push(redirectTo), 900); return () => clearTimeout(t); } }, [phase, redirectTo, router]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void upload(f); }}
        className={cn("rounded-2xl border-2 border-dashed p-10 text-center transition-colors", drag ? "border-primary bg-accent" : "border-border bg-card")}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="hidden" data-testid="resume-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        {phase === "idle" || phase === "error" ? (
          <>
            <p className="text-lg">Drop your résumé here</p>
            <p className="mt-1 text-sm text-muted-foreground">PDF or DOCX, up to 8 MB</p>
            <Button className="mt-4" onClick={() => inputRef.current?.click()} data-testid="choose-file">Choose file</Button>
          </>
        ) : (
          <div className="mx-auto max-w-sm space-y-3">
            <p className="text-sm font-medium">{fileName}</p>
            <Progress value={phase === "uploading" ? 25 : phase === "parsing" ? 65 : 100} />
            <p className="text-sm text-muted-foreground" data-testid="upload-status">{phase === "uploading" ? "Uploading…" : phase === "parsing" ? "Reading and structuring your résumé…" : `Parsed ${summary?.experience ?? 0} roles, ${summary?.education ?? 0} schools, ${summary?.skills ?? 0} skills${summary?.mode === "heuristic" ? " (rule-based parser; add an Anthropic key for the AI parser)" : ""}.`}</p>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {hasExisting && <Button variant="outline" size="sm" onClick={() => router.push(redirectTo)}>Keep my current profile</Button>}
        <Button variant="outline" onClick={async () => { await startBlankProfileAction(); router.push("/onboarding?step=review"); }}>Start from a blank profile instead</Button>
      </div>
    </div>
  );
}
