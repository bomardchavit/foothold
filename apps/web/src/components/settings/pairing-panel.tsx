"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPairingCodeAction, revokeTokenAction } from "@/app/actions/settings";
import { toast } from "sonner";

export function PairingPanel({ tokens }: { tokens: Array<{ id: string; name: string; createdAgo: string; lastUsedAgo: string | null }> }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader><CardTitle>Pairing</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending} data-testid="generate-code" onClick={() => start(async () => { const r = await createPairingCodeAction(); if (r.ok) setCode(r.data.code); else toast.error(r.error); })}>Generate pairing code</Button>
          {code && <span className="rounded-md border bg-accent px-3 py-1.5 font-mono text-lg tracking-[0.3em]" data-testid="pairing-code">{code}</span>}
          {code && <span className="text-xs text-muted-foreground">Valid for 10 minutes, single use.</span>}
        </div>
        <div>
          <p className="mb-1 font-medium">Paired extensions</p>
          {tokens.length === 0 ? <p className="text-muted-foreground">None yet.</p> : (
            <ul className="divide-y rounded-md border">{tokens.map((t) => <li key={t.id} className="flex items-center justify-between p-2"><span>{t.name} · paired {t.createdAgo}{t.lastUsedAgo ? ` · used ${t.lastUsedAgo}` : ""}</span><Button size="sm" variant="ghost" className="text-destructive" onClick={() => start(async () => { await revokeTokenAction(t.id); })}>Revoke</Button></li>)}</ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
