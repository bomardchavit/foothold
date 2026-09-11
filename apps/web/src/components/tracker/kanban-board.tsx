"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict, format } from "date-fns";
import type { ApplicationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { setStatusAction, addNoteAction, deleteApplicationAction } from "@/app/actions/tracker";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface BoardApplication {
  id: string; status: ApplicationStatus; jobId: string; title: string; company: string; location: string | null; applyUrl: string; appliedAt: string | null; updatedAt: string; source: string;
  resume: { id: string; title: string } | null; events: Array<{ id: string; from: ApplicationStatus | null; to: ApplicationStatus; at: string; note: string | null }>; notes: Array<{ id: string; body: string; at: string }>;
}
const COLUMNS: Array<[ApplicationStatus, string]> = [["SAVED", "Saved"], ["APPLIED", "Applied"], ["SCREENING", "Screening"], ["INTERVIEW", "Interview"], ["OFFER", "Offer"], ["REJECTED", "Rejected"]];
const LABEL = Object.fromEntries(COLUMNS) as Record<ApplicationStatus, string>;

export function KanbanBoard({ applications, resumes }: { applications: BoardApplication[]; resumes: Array<{ id: string; title: string; kind: string; jobId: string | null }> }) {
  const [apps, setApps] = useState(applications);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = apps.find((a) => a.id === openId) ?? null;

  function move(id: string, status: ApplicationStatus, resumeDocumentId?: string | null) {
    const prev = apps;
    setApps((xs) => xs.map((a) => (a.id === id ? { ...a, status, updatedAt: new Date().toISOString(), events: [...a.events, { id: `tmp-${Date.now()}`, from: a.status, to: status, at: new Date().toISOString(), note: null }] } : a)));
    start(async () => {
      const r = await setStatusAction(id, status, resumeDocumentId);
      if (!r.ok) { setApps(prev); toast.error(r.error); }
    });
  }
  if (apps.length === 0) return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="tracker-empty">Nothing tracked yet. Save a job from your matches or mark one as applied.</div>;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="kanban">
        {COLUMNS.map(([status, label]) => {
          const items = apps.filter((a) => a.status === status);
          return (
            <section key={status} className={cn("min-h-40 rounded-xl border bg-muted/40 p-2", dragId && "border-dashed")} data-testid={`column-${status}`}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragId) { move(dragId, status); setDragId(null); } }}>
              <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-medium">{label}<span className="text-xs text-muted-foreground">{items.length}</span></h2>
              <ul className="space-y-2">
                {items.map((a) => (
                  <li key={a.id} draggable onDragStart={() => setDragId(a.id)} onDragEnd={() => setDragId(null)} onClick={() => setOpenId(a.id)}
                    className="cursor-pointer rounded-lg border bg-card p-3 text-sm shadow-sm hover:shadow" data-testid="application-card">
                    <p className="font-medium leading-tight">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.company}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDistanceToNowStrict(new Date(a.updatedAt), { addSuffix: true })}{a.resume ? " · résumé attached" : ""}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg" data-testid="application-drawer">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="font-heading text-xl">{open.title}</SheetTitle>
                <SheetDescription>{open.company}{open.location ? ` · ${open.location}` : ""} · <Link href={`/jobs/${open.jobId}`} className="underline">view job</Link> · <a href={open.applyUrl} target="_blank" rel="noopener noreferrer" className="underline">apply page</a></SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-1 pb-8">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {COLUMNS.map(([s, l]) => <Button key={s} size="sm" variant={open.status === s ? "default" : "outline"} disabled={pending} onClick={() => move(open.id, s)} data-testid={`status-${s}`}>{l}</Button>)}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Résumé used</p>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={open.resume?.id ?? ""} onChange={(e) => { const id = e.target.value || null; const doc = resumes.find((r) => r.id === id); setApps((xs) => xs.map((a) => (a.id === open.id ? { ...a, resume: doc ? { id: doc.id, title: doc.title } : null } : a))); move(open.id, open.status, id); }}>
                    <option value="">None recorded</option>
                    {resumes.map((r) => <option key={r.id} value={r.id}>{r.title}{r.kind === "BASE" ? " (base)" : ""}</option>)}
                  </select>
                  {open.appliedAt && <p className="mt-1 text-xs text-muted-foreground">Applied {format(new Date(open.appliedAt), "PPP")}{open.source === "EXTENSION" ? " via the extension" : ""}</p>}
                </div>
                <NoteBox applicationId={open.id} notes={open.notes} onAdded={(n) => setApps((xs) => xs.map((a) => (a.id === open.id ? { ...a, notes: [n, ...a.notes] } : a)))} />
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Timeline</p>
                  <ol className="space-y-1 text-sm" data-testid="timeline">
                    {[...open.events].reverse().map((e) => <li key={e.id} className="flex justify-between gap-3"><span>{e.from ? `${LABEL[e.from]} → ` : ""}<Badge variant="secondary">{LABEL[e.to]}</Badge></span><span className="text-xs text-muted-foreground">{format(new Date(e.at), "PP p")}</span></li>)}
                  </ol>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => start(async () => { const r = await deleteApplicationAction(open.id); if (r.ok) { setApps((xs) => xs.filter((a) => a.id !== open.id)); setOpenId(null); } })}>Remove from tracker</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function NoteBox({ applicationId, notes, onAdded }: { applicationId: string; notes: BoardApplication["notes"]; onAdded: (n: BoardApplication["notes"][number]) => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Recruiter name, interview dates, what to prepare…" data-testid="note-input" />
      <Button size="sm" className="mt-2" disabled={pending || !text.trim()} data-testid="add-note" onClick={() => start(async () => { const body = text; const r = await addNoteAction(applicationId, body); if (r.ok) { onAdded({ id: `tmp-${Date.now()}`, body, at: new Date().toISOString() }); setText(""); } else toast.error(r.error); })}>Add note</Button>
      <ul className="mt-3 space-y-2 text-sm">{notes.map((n) => <li key={n.id} className="rounded-md border p-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{format(new Date(n.at), "PP p")}</p></li>)}</ul>
    </div>
  );
}
