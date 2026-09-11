"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ensureBaseResumeAction } from "@/app/actions/resume";
import { toast } from "sonner";

/** Opens the base résumé: reuses the newest one while the profile is unchanged, builds a fresh one otherwise. */
export function CreateBaseButton({ hasBase }: { hasBase: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Button variant="outline" disabled={busy} data-testid="create-base" onClick={async () => {
      setBusy(true);
      const r = await ensureBaseResumeAction();
      setBusy(false);
      if (!r.ok) { toast.error(r.error); return; }
      if (r.data.reused) toast.info("Your base résumé already matches your profile. Opening it.");
      router.push(`/resumes/${r.data.id}`);
    }}>{busy ? "Building…" : hasBase ? "Open base résumé" : "Build base résumé"}</Button>
  );
}
