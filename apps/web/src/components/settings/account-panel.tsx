"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteAccountAction, sendTestDigestAction, recomputeMatchesAction } from "@/app/actions/settings";
import { toast } from "sonner";

export function AccountPanel({ email, llmMode, embeddings, onboarded }: { email: string | null; llmMode: string; embeddings: string; onboarded: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Daily digest</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">Once a day (13:00 UTC) you get an email with new matches scoring 50+. Nothing is sent when there is nothing new.</p>
          <Button variant="outline" size="sm" disabled={pending || !onboarded} onClick={() => start(async () => { const r = await sendTestDigestAction(); if (r.ok) toast.success(r.data.sent ? "Digest sent (or printed to the server console without an email key)." : "No new matches to send."); else toast.error(r.error); })}>Send me a digest now</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Engines</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Language model: <strong>{llmMode === "anthropic" ? "Anthropic Claude" : llmMode === "fixture" ? "test fixtures" : "rule-based fallback"}</strong>{llmMode !== "anthropic" && <span className="text-muted-foreground"> — set ANTHROPIC_API_KEY to enable AI parsing, the full copilot, and résumé rewrites.</span>}</p>
          <p>Embeddings: <strong>{embeddings}</strong>{embeddings === "local" && <span className="text-muted-foreground"> — set VOYAGE_API_KEY (or OPENAI_API_KEY) for semantic relevance.</span>}</p>
          <Button variant="outline" size="sm" disabled={pending || !onboarded} onClick={() => start(async () => { const r = await recomputeMatchesAction(); if (r.ok) toast.success("Matches recomputed"); else toast.error(r.error); })}>Recompute my matches</Button>
        </CardContent>
      </Card>
      <Card className="border-destructive/40">
        <CardHeader><CardTitle>Delete account</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">Removes your profile, uploads, résumés, applications, contacts and drafts. This cannot be undone. Type <code>{email}</code> to confirm.</p>
          <div className="flex gap-2"><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={email ?? ""} className="max-w-xs" /><Button variant="destructive" disabled={pending || confirm !== email} onClick={() => start(async () => { const r = await deleteAccountAction(confirm); if (!r.ok) toast.error(r.error); })}>Delete everything</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
