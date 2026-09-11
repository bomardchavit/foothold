"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function CreateBaseButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Button variant="outline" disabled={busy} data-testid="create-base" onClick={async () => {
      setBusy(true);
      const res = await fetch("/api/resume/base", { method: "POST" });
      setBusy(false);
      if (!res.ok) { toast.error("Could not build the résumé"); return; }
      const { id } = await res.json();
      router.push(`/resumes/${id}`);
    }}>{busy ? "Building…" : "Build base résumé"}</Button>
  );
}
