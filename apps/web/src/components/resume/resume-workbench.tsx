"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { diffWords } from "diff";
import type { ResumeContent, ResumeBullet } from "@foothold/shared";
import type { ApplicationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveContent, diffStats } from "@/lib/resume/build";
import type { KeywordGap } from "@/lib/resume/gaps";
import type { Validation } from "@/lib/resume/tailor";
import { ResumePreview } from "./resume-preview";
import { saveJobAction, setStatusAction } from "@/app/actions/tracker";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DocMeta { id: string; kind: "BASE" | "TAILORED"; title: string; jobId: string | null; jobTitle: string | null; company: string | null; createdAt: string }

export function ResumeWorkbench({ doc, content, decisions: initial, gaps, validation, application }: { doc: DocMeta; content: ResumeContent; decisions: Record<string, boolean>; gaps: KeywordGap[]; validation: Validation | null; application: { id: string; status: ApplicationStatus; resumeDocumentId: string | null } | null }) {
  const [decisions, setDecisions] = useState<Record<string, boolean>>(initial);
  const [groundedOnly, setGroundedOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [app, setApp] = useState(application);
  const resolved = useMemo(() => resolveContent(content, decisions, groundedOnly), [content, decisions, groundedOnly]);
  const stats = useMemo(() => diffStats(content), [content]);
  const changed = [...content.experience.flatMap((e) => e.bullets.map((b) => ({ ...b, where: `${e.title}, ${e.company}` }))), ...content.projects.flatMap((p) => p.bullets.map((b) => ({ ...b, where: p.name })))].filter((b) => b.changeKind !== "unchanged");
  const addedSkills = content.skills.filter((s) => s.changeKind === "added");
  const decide = (id: string, v: boolean) => setDecisions((d) => ({ ...d, [id]: v }));
  const exportHref = (fmt: "pdf" | "docx") => `/api/resume/${doc.id}/export?format=${fmt}${groundedOnly ? "&grounded=1" : ""}`;

  async function saveDecisions(next = decisions) {
    setSaving(true);
    const res = await fetch(`/api/resume/${doc.id}/decisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisions: next }) });
    setSaving(false);
    if (!res.ok) { toast.error("Could not save"); return; }
    trackClient(EVENTS.tailoring_diff_accepted, { documentId: doc.id, accepted: Object.values(next).filter(Boolean).length });
    toast.success("Decisions saved");
  }
  function acceptAll(onlyGrounded: boolean) {
    const next: Record<string, boolean> = { ...decisions };
    for (const b of changed) next[b.bulletId] = onlyGrounded ? b.grounded : true;
    for (const s of addedSkills) next[`skill:${s.name}`] = onlyGrounded ? s.grounded : true;
    setDecisions(next); void saveDecisions(next);
  }
  async function useForApplication() {
    if (!doc.jobId) return;
    const r = app ? await setStatusAction(app.id, app.status, doc.id) : await saveJobAction(doc.jobId, "SAVED", doc.id);
    if (!r.ok) { toast.error(r.error); return; }
    setApp({ id: r.data.id, status: r.data.status, resumeDocumentId: doc.id });
    toast.success("This résumé is now attached to the application");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl">{doc.kind === "BASE" ? "Base résumé" : "Tailored résumé"}</h1>
            {doc.jobId && <p className="text-sm text-muted-foreground">For <Link href={`/jobs/${doc.jobId}`} className="underline">{doc.jobTitle} at {doc.company}</Link></p>}
            {validation && <p className="mt-1 text-xs text-muted-foreground">{validation.mode === "heuristic" ? "Rule-based tailoring (reordered by relevance). Add an Anthropic key for rewrites and expansions." : `AI tailoring · ${stats.reworded} reworded, ${stats.expanded} expanded, ${stats.added} added, ${stats.addedSkills} skills added · checker flagged ${stats.ungrounded} unverified item${stats.ungrounded === 1 ? "" : "s"}.`}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm"><a href={exportHref("pdf")} data-testid="export-pdf">Download PDF</a></Button>
            <Button asChild variant="outline" size="sm"><a href={exportHref("docx")} data-testid="export-docx">Download DOCX</a></Button>
            {doc.jobId && <Button size="sm" variant={app?.resumeDocumentId === doc.id ? "secondary" : "default"} onClick={useForApplication} data-testid="use-for-application">{app?.resumeDocumentId === doc.id ? "Attached to application" : "Use when applying"}</Button>}
          </div>
        </div>
        {doc.kind === "TAILORED" && (
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border bg-card p-3 text-sm">
            <label className="flex items-center gap-2"><Switch checked={groundedOnly} onCheckedChange={setGroundedOnly} data-testid="grounded-only" /> Grounded only <span className="text-xs text-muted-foreground">(hide expanded and added content)</span></label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => acceptAll(true)} disabled={saving}>Accept grounded</Button>
              <Button size="sm" variant="outline" onClick={() => acceptAll(false)} disabled={saving}>Accept all</Button>
              <Button size="sm" onClick={() => saveDecisions()} disabled={saving} data-testid="save-decisions">Save decisions</Button>
            </div>
          </div>
        )}
        <Tabs defaultValue={doc.kind === "TAILORED" ? "changes" : "gaps"}>
          <TabsList>
            <TabsTrigger value="changes" data-testid="tab-changes">Changes ({changed.length + addedSkills.length})</TabsTrigger>
            <TabsTrigger value="gaps">Keyword gaps ({gaps.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="changes" className="space-y-3">
            {changed.length === 0 && addedSkills.length === 0 && <p className="text-sm text-muted-foreground">{doc.kind === "BASE" ? "This is your profile as a résumé; nothing was changed." : "Bullets were reordered by relevance; no text was changed."}</p>}
            {changed.map((b) => (
              <DiffCard key={b.bulletId} bullet={b} where={b.where} accepted={decisions[b.bulletId] ?? true} onDecide={(v) => decide(b.bulletId, v)} />
            ))}
            {addedSkills.map((s) => (
              <div key={s.name} className={cn("rounded-lg border p-3 text-sm", !s.grounded && "border-ochre/60")} data-testid="diff-skill">
                <div className="flex items-center justify-between gap-2">
                  <span>Add skill <strong>{s.name}</strong> <KindBadge kind="added" grounded={s.grounded} /></span>
                  <Decide accepted={decisions[`skill:${s.name}`] ?? true} onDecide={(v) => decide(`skill:${s.name}`, v)} />
                </div>
                {s.reason && <p className="mt-1 text-xs text-muted-foreground">Why: {s.reason}</p>}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="gaps">
            {gaps.length === 0 ? <p className="text-sm text-muted-foreground">No gaps: every keyword in the posting appears in your profile.</p> : (
              <ul className="divide-y rounded-lg border bg-card text-sm">
                {gaps.map((g) => <li key={g.term} className="flex gap-3 p-3"><Badge variant={g.status === "missing" ? "outline" : "secondary"} className="shrink-0">{g.term}{g.required ? " *" : ""}</Badge><span className={g.status === "missing" ? "text-muted-foreground" : ""}>{g.suggestion}</span></li>)}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">* listed as required</p>
          </TabsContent>
        </Tabs>
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Preview{groundedOnly ? " · grounded only" : ""}</p>
        <ResumePreview content={resolved} highlight />
      </div>
    </div>
  );
}

function KindBadge({ kind, grounded }: { kind: ResumeBullet["changeKind"] | "added"; grounded: boolean }) {
  if (kind === "reworded") return <Badge variant="secondary">Reworded</Badge>;
  if (kind === "expanded") return <Badge variant="outline" className="border-ochre">Expanded · verify</Badge>;
  if (kind === "added") return <Badge variant="outline" className={grounded ? "border-slate" : "border-plum"}>{grounded ? "Added · grounded" : "Added · verify"}</Badge>;
  return null;
}
function Decide({ accepted, onDecide }: { accepted: boolean; onDecide: (v: boolean) => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button size="sm" variant={accepted ? "default" : "outline"} onClick={() => onDecide(true)} data-testid="accept">Keep</Button>
      <Button size="sm" variant={!accepted ? "default" : "outline"} onClick={() => onDecide(false)} data-testid="reject">Revert</Button>
    </div>
  );
}
function DiffCard({ bullet: b, where, accepted, onDecide }: { bullet: ResumeBullet; where: string; accepted: boolean; onDecide: (v: boolean) => void }) {
  const parts = useMemo(() => (b.sourceText ? diffWords(b.sourceText, b.text) : [{ value: b.text, added: true, removed: false }]), [b.sourceText, b.text]);
  return (
    <div className={cn("rounded-lg border bg-card p-3 text-sm", !b.grounded && "border-ochre/60", !accepted && "opacity-70")} data-testid="diff-card" data-kind={b.changeKind}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{where}</span><KindBadge kind={b.changeKind} grounded={b.grounded} />{b.keywords.map((k) => <Badge key={k} variant="outline" className="font-normal">{k}</Badge>)}</div>
        <Decide accepted={accepted} onDecide={onDecide} />
      </div>
      <p className="leading-relaxed">
        {parts.map((p, i) => (
          <span key={i} className={cn(p.added && "rounded bg-primary/15 px-0.5", p.removed && "rounded bg-destructive/10 px-0.5 line-through text-muted-foreground")}>{p.value}</span>
        ))}
      </p>
      {b.reason && (
        <Tooltip><TooltipTrigger asChild><p className="mt-1 cursor-help text-xs text-muted-foreground">Why: {b.reason.slice(0, 160)}{b.reason.length > 160 ? "…" : ""}</p></TooltipTrigger><TooltipContent className="max-w-sm text-xs">{b.reason}</TooltipContent></Tooltip>
      )}
      {!b.grounded && <p className="mt-1 text-xs text-ochre">Contains details not found in your profile. Keep it only if it is true.</p>}
    </div>
  );
}
