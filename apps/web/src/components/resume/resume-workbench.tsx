"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { diffWords } from "diff";
import type { ResumeContent, ResumeBullet } from "@foothold/shared";
import type { ApplicationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveContent, diffStats } from "@/lib/resume/build";
import type { KeywordGap } from "@/lib/resume/gaps";
import type { Validation } from "@/lib/resume/tailor";
import { ResumePreview } from "./resume-preview";
import { saveJobAction, attachResumeAction } from "@/app/actions/tracker";
import { updateResumeContentAction, ensureBaseResumeAction, type ResumePatch } from "@/app/actions/resume";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DocMeta { id: string; kind: "BASE" | "TAILORED"; title: string; jobId: string | null; jobTitle: string | null; company: string | null; createdAt: string }
type Tab = "changes" | "gaps" | "edit";

export function ResumeWorkbench({ doc, content: initialContent, decisions: initial, gaps, validation, application, stale, olderVersions }: {
  doc: DocMeta; content: ResumeContent; decisions: Record<string, boolean>; gaps: KeywordGap[]; validation: Validation | null;
  application: { id: string; status: ApplicationStatus; resumeDocumentId: string | null } | null; stale: boolean; olderVersions: number;
}) {
  const router = useRouter();
  const isBase = doc.kind === "BASE";
  const [content, setContent] = useState(initialContent);
  const [decisions, setDecisions] = useState<Record<string, boolean>>(initial);
  const [groundedOnly, setGroundedOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [app, setApp] = useState(application);
  const [focusBullet, setFocusBullet] = useState<string | null>(null);
  const resolved = useMemo(() => resolveContent(content, decisions, groundedOnly), [content, decisions, groundedOnly]);
  const stats = useMemo(() => diffStats(content), [content]);
  const changed = useMemo(() => [...content.experience.flatMap((e) => e.bullets.map((b) => ({ ...b, where: `${e.title}, ${e.company}` }))), ...content.projects.flatMap((p) => p.bullets.map((b) => ({ ...b, where: p.name })))].filter((b) => b.changeKind !== "unchanged"), [content]);
  const addedSkills = content.skills.filter((s) => s.changeKind === "added");
  const hasChanges = changed.length + addedSkills.length > 0;
  // With nothing to accept or reject (rule-based tailoring, or a base résumé) the useful place to land is the gaps or the editor.
  const [tab, setTab] = useState<Tab>(isBase ? "edit" : hasChanges ? "changes" : "gaps");
  const decide = (id: string, v: boolean) => setDecisions((d) => ({ ...d, [id]: v }));
  const exportHref = (fmt: "pdf" | "docx") => `/api/resume/${doc.id}/export?format=${fmt}${groundedOnly ? "&grounded=1" : ""}`;
  const skillNames = useMemo(() => new Set(content.skills.map((s) => s.name.toLowerCase())), [content.skills]);

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
  /** Every inline edit goes through the server, which re-checks the text against the profile and persists it. */
  async function patch(p: ResumePatch): Promise<boolean> {
    setSaving(true);
    const r = await updateResumeContentAction(doc.id, p);
    setSaving(false);
    if (!r.ok) { toast.error(r.error); return false; }
    setContent(r.data.content); setDecisions(r.data.decisions);
    return true;
  }
  async function addSkill(term: string) {
    if (await patch({ addSkills: [term] })) toast.success(`Added ${term} to this résumé's skills`);
  }
  async function useForApplication() {
    if (!doc.jobId) return;
    const r = app ? await attachResumeAction(app.id, doc.id) : await saveJobAction(doc.jobId, "SAVED", doc.id);
    if (!r.ok) { toast.error(r.error); return; }
    setApp({ id: r.data.id, status: r.data.status, resumeDocumentId: doc.id });
    toast.success(app ? "This résumé is now attached to the application" : "Saved to your tracker with this résumé attached");
  }
  async function rebuildBase() {
    const r = await ensureBaseResumeAction();
    if (!r.ok) { toast.error(r.error); return; }
    router.push(`/resumes/${r.data.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl">{isBase ? "Base résumé" : "Tailored résumé"}</h1>
            {doc.jobId && <p className="text-sm text-muted-foreground">For <Link href={`/jobs/${doc.jobId}`} className="underline">{doc.jobTitle} at {doc.company}</Link>{olderVersions > 0 ? ` · newest of ${olderVersions + 1} versions` : ""}</p>}
            {!isBase && validation && (
              <p className="mt-1 text-xs text-muted-foreground">
                {validation.mode === "heuristic"
                  ? "Rule-based tailoring: your bullets and skills were reordered by relevance and the text is your own. Use Keyword gaps and Edit to finish it; add an Anthropic key for AI rewrites."
                  : `AI tailoring · ${stats.reworded} reworded, ${stats.expanded} expanded, ${stats.added} added, ${stats.addedSkills} skills added · checker flagged ${stats.ungrounded} unverified item${stats.ungrounded === 1 ? "" : "s"}.`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm"><a href={exportHref("pdf")} data-testid="export-pdf">Download PDF</a></Button>
            <Button asChild variant="outline" size="sm"><a href={exportHref("docx")} data-testid="export-docx">Download DOCX</a></Button>
            {!isBase && doc.jobId && <Button asChild variant="outline" size="sm"><Link href={`/resumes/new?jobId=${doc.jobId}&force=1`} title="Runs tailoring again from your current profile and replaces this version" data-testid="retailor">Re-tailor</Link></Button>}
            {doc.jobId && <Button size="sm" variant={app?.resumeDocumentId === doc.id ? "secondary" : "default"} onClick={useForApplication} data-testid="use-for-application">{app?.resumeDocumentId === doc.id ? "Attached to application" : "Use when applying"}</Button>}
          </div>
        </div>
        {stale && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ochre/60 bg-accent p-3 text-sm" data-testid="stale-banner">
            <span>Your profile changed after this résumé was built.</span>
            {isBase ? <Button size="sm" variant="outline" onClick={rebuildBase}>Rebuild from profile</Button> : doc.jobId && <Button asChild size="sm" variant="outline"><Link href={`/resumes/new?jobId=${doc.jobId}&force=1`}>Re-tailor from current profile</Link></Button>}
          </div>
        )}
        {!isBase && hasChanges && (
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border bg-card p-3 text-sm">
            <label className="flex items-center gap-2"><Switch checked={groundedOnly} onCheckedChange={setGroundedOnly} data-testid="grounded-only" /> Grounded only <span className="text-xs text-muted-foreground">(hide expanded and added content)</span></label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => acceptAll(true)} disabled={saving}>Accept grounded</Button>
              <Button size="sm" variant="outline" onClick={() => acceptAll(false)} disabled={saving}>Accept all</Button>
              <Button size="sm" onClick={() => saveDecisions()} disabled={saving} data-testid="save-decisions">Save decisions</Button>
            </div>
          </div>
        )}
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {!isBase && <TabsTrigger value="changes" data-testid="tab-changes">Changes ({changed.length + addedSkills.length})</TabsTrigger>}
            {!isBase && <TabsTrigger value="gaps" data-testid="tab-gaps">Keyword gaps ({gaps.length})</TabsTrigger>}
            <TabsTrigger value="edit" data-testid="tab-edit">Edit</TabsTrigger>
            <span className="ml-2 self-center text-xs text-muted-foreground" aria-live="polite">{saving ? "Saving…" : ""}</span>
          </TabsList>
          {!isBase && (
            <TabsContent value="changes" className="space-y-3">
              {!hasChanges && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="no-changes">
                  <p className="font-medium text-foreground">No changes needed to the text.</p>
                  <p className="mt-1">Bullets and skills were reordered so the most relevant come first. Close the remaining <button type="button" className="underline" onClick={() => setTab("gaps")}>keyword gaps</button> or <button type="button" className="underline" onClick={() => setTab("edit")}>edit the wording</button> yourself; every edit is checked against your profile.</p>
                </div>
              )}
              {changed.map((b) => (
                <DiffCard key={b.bulletId} bullet={b} where={b.where} accepted={decisions[b.bulletId] ?? true} onDecide={(v) => decide(b.bulletId, v)} onEdit={() => { setFocusBullet(b.bulletId); setTab("edit"); }} />
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
          )}
          {!isBase && (
            <TabsContent value="gaps">
              {gaps.length === 0 ? <p className="text-sm text-muted-foreground">No gaps: every keyword in the posting appears in your profile.</p> : (
                <ul className="divide-y rounded-lg border bg-card text-sm" data-testid="gap-list">
                  {gaps.map((g) => {
                    const covered = skillNames.has(g.term.toLowerCase());
                    const evidenceExists = Boolean(g.evidenceBulletId) && [...content.experience, ...content.projects].some((s) => s.bullets.some((b) => b.bulletId === g.evidenceBulletId));
                    return (
                      <li key={g.term} className="flex flex-wrap items-start gap-3 p-3" data-testid="gap-row">
                        <Badge variant={g.status === "missing" ? "outline" : "secondary"} className="shrink-0">{g.term}{g.required ? " *" : ""}</Badge>
                        <span className={cn("min-w-0 flex-1", g.status === "missing" && "text-muted-foreground")}>{g.suggestion}</span>
                        <span className="flex shrink-0 gap-1">
                          {covered ? <Badge variant="outline" className="font-normal" data-testid="gap-covered">In your skills</Badge> : (
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => addSkill(g.term)} data-testid="gap-add-skill" title={g.status === "missing" ? "Adds it labeled as unverified; keep it only if you have really used it" : "Adds it to this résumé's skills"}>Add to skills</Button>
                          )}
                          {evidenceExists && <Button size="sm" variant="ghost" onClick={() => { setFocusBullet(g.evidenceBulletId!); setTab("edit"); }} data-testid="gap-edit-bullet">Edit that bullet</Button>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">* listed as required. Skills you add here go into this résumé only; skills marked unverified are highlighted in the preview.</p>
            </TabsContent>
          )}
          <TabsContent value="edit">
            {isBase && <p className="mb-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-testid="base-note">Built from your profile. Open a job and choose <em>Tailor my résumé for this role</em> to get a targeted version; <Link href="/jobs" className="underline">see your matches</Link>.</p>}
            <Editor content={content} decisions={decisions} saving={saving} onPatch={patch} focusBullet={focusBullet} onFocused={() => setFocusBullet(null)} />
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

/** Inline editor: summary, headline, every bullet and the skill list. Fields save when they lose focus. */
function Editor({ content, decisions, saving, onPatch, focusBullet, onFocused }: { content: ResumeContent; decisions: Record<string, boolean>; saving: boolean; onPatch: (p: ResumePatch) => Promise<boolean>; focusBullet: string | null; onFocused: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newSkill, setNewSkill] = useState("");
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  useEffect(() => {
    if (!focusBullet) return;
    const el = refs.current.get(focusBullet);
    if (!el) return;
    el.focus(); el.setSelectionRange(el.value.length, el.value.length); el.scrollIntoView({ block: "center", behavior: "smooth" });
    onFocused();
  }, [focusBullet, onFocused]);
  const draft = (key: string, current: string) => drafts[key] ?? current;
  const setDraft = (key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v }));
  const clearDraft = (key: string) => setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
  async function commitField(key: "headline" | "summary", current: string | null) {
    const v = drafts[key]; if (v === undefined) return;
    if (v.trim() === (current ?? "")) { clearDraft(key); return; }
    if (await onPatch({ [key]: v })) clearDraft(key);
  }
  async function commitBullet(b: ResumeBullet) {
    const v = drafts[b.bulletId]; if (v === undefined) return;
    if (v.trim() === b.text.trim()) { clearDraft(b.bulletId); return; }
    if (await onPatch({ bullets: [{ bulletId: b.bulletId, text: v }] })) { clearDraft(b.bulletId); if (!v.trim()) toast.success("Bullet removed from this résumé"); }
  }
  async function addSkills(raw: string) {
    const items = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    if (await onPatch({ addSkills: items })) setNewSkill("");
  }
  const sections = [
    ...content.experience.map((e) => ({ id: e.experienceId, heading: `${e.title}, ${e.company}`, sub: e.dateRange, bullets: e.bullets })),
    ...content.projects.map((p) => ({ id: p.projectId, heading: p.name, sub: p.description ?? "", bullets: p.bullets })),
  ];
  return (
    <div className="space-y-5" data-testid="resume-editor">
      <div className="grid gap-3">
        <div>
          <Label htmlFor="resume-headline">Headline</Label>
          <Input id="resume-headline" className="mt-1" value={draft("headline", content.headline ?? "")} onChange={(e) => setDraft("headline", e.target.value)} onBlur={() => commitField("headline", content.headline)} maxLength={200} disabled={saving} data-testid="edit-headline" />
        </div>
        <div>
          <Label htmlFor="resume-summary">Summary</Label>
          <Textarea id="resume-summary" className="mt-1" rows={3} value={draft("summary", content.summary ?? "")} onChange={(e) => setDraft("summary", e.target.value)} onBlur={() => commitField("summary", content.summary)} maxLength={2000} disabled={saving} data-testid="edit-summary" />
        </div>
      </div>
      {sections.map((s) => (
        <section key={s.id} className="rounded-lg border bg-card p-3">
          <p className="text-sm font-medium">{s.heading}</p>
          {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
          <div className="mt-2 space-y-2">
            {s.bullets.map((b) => {
              const edited = b.changeKind !== "unchanged";
              const kept = decisions[b.bulletId] ?? true;
              return (
                <div key={b.bulletId} className={cn("rounded-md border p-2", !b.grounded && "border-ochre/60")} data-testid="edit-bullet">
                  <Textarea ref={(el) => { if (el) refs.current.set(b.bulletId, el); else refs.current.delete(b.bulletId); }} rows={2} className="min-h-0" value={draft(b.bulletId, b.text)} onChange={(e) => setDraft(b.bulletId, e.target.value)} onBlur={() => commitBullet(b)} maxLength={600} disabled={saving} data-testid="edit-bullet-text" />
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {edited && <KindBadge kind={b.changeKind} grounded={b.grounded} />}
                    {edited && !kept && <span>Reverted in the preview</span>}
                    {edited && b.changeKind !== "added" && b.text !== b.sourceText && <button type="button" className="underline" onClick={() => onPatch({ bullets: [{ bulletId: b.bulletId, text: b.sourceText }] })}>Restore original</button>}
                    {!b.grounded && <span className="text-ochre">Mentions something your profile does not; keep it only if it is true.</span>}
                    <button type="button" className="ml-auto underline" onClick={() => onPatch({ bullets: [{ bulletId: b.bulletId, text: "" }] })}>Remove from résumé</button>
                  </div>
                </div>
              );
            })}
            {s.bullets.length === 0 && <p className="text-xs text-muted-foreground">No bullets left in this section.</p>}
          </div>
        </section>
      ))}
      <section>
        <Label>Skills</Label>
        <div className="mt-1 flex flex-wrap gap-1.5" data-testid="edit-skills">
          {content.skills.map((s) => (
            <span key={s.name} className={cn("inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-0.5 text-xs", s.changeKind === "added" && !s.grounded && "border-ochre")} data-testid="edit-skill">
              {s.name}{s.changeKind === "added" && <span className="text-muted-foreground">{s.grounded ? " · added" : " · verify"}</span>}
              <button type="button" aria-label={`Remove ${s.name}`} className="text-muted-foreground hover:text-foreground" disabled={saving} onClick={() => onPatch({ removeSkills: [s.name] })}>×</button>
            </span>
          ))}
        </div>
        <Input className="mt-2 max-w-sm" value={newSkill} placeholder="Add a skill and press Enter" disabled={saving} data-testid="edit-skill-input" onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); void addSkills(newSkill); } }} onBlur={() => newSkill && void addSkills(newSkill)} />
        <p className="mt-1 text-xs text-muted-foreground">Skills added here go into this résumé only. To change what matching uses, <Link href="/settings/profile" className="underline">edit your profile</Link>.</p>
      </section>
    </div>
  );
}

function KindBadge({ kind, grounded }: { kind: ResumeBullet["changeKind"] | "added"; grounded: boolean }) {
  if (kind === "reworded") return <Badge variant="secondary">{grounded ? "Reworded" : "Reworded · verify"}</Badge>;
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
function DiffCard({ bullet: b, where, accepted, onDecide, onEdit }: { bullet: ResumeBullet; where: string; accepted: boolean; onDecide: (v: boolean) => void; onEdit: () => void }) {
  const parts = useMemo(() => (b.sourceText ? diffWords(b.sourceText, b.text) : [{ value: b.text, added: true, removed: false }]), [b.sourceText, b.text]);
  return (
    <div className={cn("rounded-lg border bg-card p-3 text-sm", !b.grounded && "border-ochre/60", !accepted && "opacity-70")} data-testid="diff-card" data-kind={b.changeKind}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{where}</span><KindBadge kind={b.changeKind} grounded={b.grounded} />{b.keywords.map((k) => <Badge key={k} variant="outline" className="font-normal">{k}</Badge>)}</div>
        <div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button><Decide accepted={accepted} onDecide={onDecide} /></div>
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
