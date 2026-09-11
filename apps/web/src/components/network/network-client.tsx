"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OutreachKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagInput } from "@/components/profile/tag-input";
import { ConfirmDialog } from "@/components/providers/confirm-dialog";
import { saveContactAction, deleteContactAction, draftOutreachAction, markOutreachSentAction } from "@/app/actions/network";
import { toast } from "sonner";

export interface ContactRow { id: string; firstName: string; lastName: string; email: string | null; currentCompany: string | null; title: string | null; schools: string[]; pastCompanies: string[]; linkedinUrl: string | null; notes: string | null; source: string }
interface Draft { id: string; kind: OutreachKind; subject: string | null; body: string; contact: string; job: string | null; sentAt: string | null }
const KINDS: Array<[OutreachKind, string]> = [["REFERRAL", "Referral ask"], ["COFFEE_CHAT", "Coffee chat"], ["ALUMNI_INTRO", "Alumni intro"]];

export function NetworkClient({ contacts, jobs, drafts, initialContactId, initialJobId, initialCompany }: { contacts: ContactRow[]; jobs: Array<{ id: string; label: string }>; drafts: Draft[]; initialContactId: string | null; initialJobId: string | null; initialCompany: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialCompany);
  const [selected, setSelected] = useState<string | null>(initialContactId);
  const [jobId, setJobId] = useState<string>(initialJobId ?? "");
  const [kind, setKind] = useState<OutreachKind>("REFERRAL");
  const [draft, setDraft] = useState<{ id: string; subject: string | null; body: string } | null>(null);
  const [pending, start] = useTransition();
  const filtered = useMemo(() => contacts.filter((c) => !q || `${c.firstName} ${c.lastName} ${c.currentCompany ?? ""} ${c.title ?? ""} ${c.pastCompanies.join(" ")}`.toLowerCase().includes(q.toLowerCase())), [contacts, q]);
  const contact = contacts.find((c) => c.id === selected) ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-3xl">Network</h1><p className="mt-1 text-sm text-muted-foreground">Your own contacts only: a LinkedIn connections export or people you add by hand. We never scrape.</p></div>
          <div className="flex gap-2"><ImportDialog onDone={() => router.refresh()} /><ContactDialog onSaved={() => router.refresh()} onDeleted={(id) => { if (selected === id) { setSelected(null); setDraft(null); } router.refresh(); }} /></div>
        </div>
        <Input placeholder="Search name, company, title…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 max-w-sm" data-testid="contact-search" />
        {contacts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="contacts-empty">No contacts yet. Export your LinkedIn connections (Settings → Data privacy → Get a copy of your data → Connections) and import the CSV here.</div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card" data-testid="contact-list">
            {filtered.map((c) => (
              <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 text-sm ${selected === c.id ? "bg-accent" : ""}`}>
                <div className="min-w-0">
                  <p className="font-medium">{c.firstName} {c.lastName} {c.source === "LINKEDIN_CSV" && <Badge variant="outline" className="ml-1 font-normal">LinkedIn</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{[c.title, c.currentCompany].filter(Boolean).join(" · ")}{c.pastCompanies.length ? ` · formerly ${c.pastCompanies.join(", ")}` : ""}{c.schools.length ? ` · ${c.schools.join(", ")}` : ""}</p>
                </div>
                <div className="flex gap-1">
                  <ContactDialog contact={c} onSaved={() => router.refresh()} onDeleted={(id) => { if (selected === id) { setSelected(null); setDraft(null); } router.refresh(); }} />
                  <Button size="sm" variant={selected === c.id ? "default" : "outline"} onClick={() => { setSelected(c.id); setDraft(null); }} data-testid="select-contact">Reach out</Button>
                </div>
              </li>
            ))}
            {filtered.length === 0 && <li className="p-3 text-sm text-muted-foreground">No contacts match “{q}”.</li>}
          </ul>
        )}
        {drafts.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 text-xl">Recent drafts</h2>
            <ul className="space-y-2 text-sm">{drafts.map((d) => <li key={d.id} className="rounded-lg border bg-card p-3"><div className="flex justify-between gap-2"><span className="font-medium">{d.contact} · {KINDS.find((k) => k[0] === d.kind)?.[1]}{d.job ? ` · ${d.job}` : ""}</span><span className="text-xs text-muted-foreground">{d.sentAt ? "marked sent" : "draft"}</span></div><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground">{d.body}</p></li>)}</ul>
          </div>
        )}
      </div>
      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader><CardTitle className="text-base">Outreach</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!contact ? <p className="text-muted-foreground">Pick a contact to draft a message. Templates are personalized with your shared connection and the target role.</p> : (
            <>
              <p>To <strong>{contact.firstName} {contact.lastName}</strong>{contact.currentCompany ? ` at ${contact.currentCompany}` : ""}</p>
              <div><Label>Template</Label>
                <div className="mt-1 flex flex-wrap gap-1">{KINDS.map(([k, l]) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)} data-testid={`kind-${k}`}>{l}</Button>)}</div></div>
              <div><Label>Target role (optional)</Label>
                <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={jobId} onChange={(e) => setJobId(e.target.value)}><option value="">None</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></div>
              <Button disabled={pending} data-testid="draft-outreach" onClick={() => start(async () => { const r = await draftOutreachAction(contact.id, kind, jobId || null); if (r.ok) setDraft(r.data); else toast.error(r.error); })}>{pending ? "Drafting…" : "Draft message"}</Button>
              {draft && (
                <div className="space-y-2">
                  {draft.subject && <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />}
                  <Textarea rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} data-testid="outreach-body" />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(`${draft.subject ? draft.subject + "\n\n" : ""}${draft.body}`); toast.success("Copied"); }}>Copy</Button>
                    <Button size="sm" data-testid="mark-sent" onClick={() => start(async () => { const r = await markOutreachSentAction(draft.id, draft.body); if (r.ok) { toast.success("Marked as sent"); router.refresh(); } else toast.error(r.error); })}>Copy and mark sent</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Foothold does not send messages. Paste it into LinkedIn or email yourself.</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ImportResult { inserted: number; updated: number; unchanged: number; skipped: number; total: number }

function ImportDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true); setError(null); setResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as Partial<ImportResult> & { error?: string };
      if (!res.ok) { const msg = j.error ?? "Import failed"; setError(msg); toast.error(msg); return; }
      const r: ImportResult = { inserted: j.inserted ?? 0, updated: j.updated ?? 0, unchanged: j.unchanged ?? 0, skipped: j.skipped ?? 0, total: j.total ?? 0 };
      setResult(r);
      if (r.inserted + r.updated === 0) toast.warning(r.total === 0 ? "That file has no contact rows." : "Nothing new: every contact in that file is already here.");
      else toast.success(`Imported ${r.inserted} new contact${r.inserted === 1 ? "" : "s"}${r.updated ? `, updated ${r.updated}` : ""}`);
      onDone();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = ""; // picking the same file again re-fires onChange
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setResult(null); setError(null); } }}>
      <DialogTrigger asChild><Button variant="outline" data-testid="import-contacts">Import LinkedIn CSV</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import connections</DialogTitle>
          <DialogDescription>Upload the <code>Connections.csv</code> from your LinkedIn data export (columns First Name, Last Name, Company, Position). We store name, company, title, email and profile URL, nothing else.</DialogDescription>
        </DialogHeader>
        <Input ref={inputRef} type="file" accept=".csv,text/csv" data-testid="contacts-file" disabled={busy} aria-invalid={error ? true : undefined} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        {busy && <p className="text-sm text-muted-foreground">Importing…</p>}
        {error && <p className="text-sm text-destructive" role="alert" data-testid="import-error">{error}</p>}
        {result && (
          <p className="text-sm" data-testid="import-result">
            Imported {result.inserted} new, updated {result.updated}.{result.unchanged ? ` ${result.unchanged} already up to date.` : ""}{result.skipped ? ` Skipped ${result.skipped} row${result.skipped === 1 ? "" : "s"} without a name.` : ""}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant={result ? "default" : "outline"} onClick={() => setOpen(false)} data-testid="import-done">{result ? "Done" : "Cancel"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({ contact, onSaved, onDeleted }: { contact?: ContactRow; onSaved: () => void; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [c, setC] = useState<ContactRow>(contact ?? { id: "", firstName: "", lastName: "", email: null, currentCompany: null, title: null, schools: [], pastCompanies: [], linkedinUrl: null, notes: null, source: "MANUAL" });
  const [pending, start] = useTransition();
  const set = (k: keyof ContactRow, v: unknown) => setC((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant={contact ? "ghost" : "default"} data-testid={contact ? "edit-contact" : "add-contact"}>{contact ? "Edit" : "Add contact"}</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle></DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveContactAction({ ...c, id: c.id || undefined }); if (r.ok) { setOpen(false); onSaved(); toast.success("Saved"); } else toast.error(r.error); }); }}>
          <div><Label>First name</Label><Input className="mt-1" value={c.firstName} onChange={(e) => set("firstName", e.target.value)} required data-testid="contact-first" /></div>
          <div><Label>Last name</Label><Input className="mt-1" value={c.lastName} onChange={(e) => set("lastName", e.target.value)} data-testid="contact-last" /></div>
          <div><Label>Current company</Label><Input className="mt-1" value={c.currentCompany ?? ""} onChange={(e) => set("currentCompany", e.target.value || null)} data-testid="contact-company" /></div>
          <div><Label>Title</Label><Input className="mt-1" value={c.title ?? ""} onChange={(e) => set("title", e.target.value || null)} /></div>
          <div><Label>Email</Label><Input className="mt-1" value={c.email ?? ""} onChange={(e) => set("email", e.target.value || null)} /></div>
          <div><Label>LinkedIn URL</Label><Input className="mt-1" value={c.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value || null)} /></div>
          <div className="sm:col-span-2"><Label>Past employers</Label><div className="mt-1"><TagInput value={c.pastCompanies} onChange={(v) => set("pastCompanies", v)} placeholder="Company, Enter" /></div></div>
          <div className="sm:col-span-2"><Label>Schools</Label><div className="mt-1"><TagInput value={c.schools} onChange={(v) => set("schools", v)} placeholder="School, Enter" testId="contact-schools" /></div></div>
          <div className="sm:col-span-2"><Label>Notes</Label><Textarea className="mt-1" rows={2} value={c.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></div>
          <div className="flex justify-between sm:col-span-2">
            {contact ? <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)} data-testid="delete-contact">Delete</Button> : <span />}
            <Button type="submit" disabled={pending} data-testid="save-contact">Save</Button>
          </div>
        </form>
        {contact && (
          <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this contact?" description={`${contact.firstName} ${contact.lastName} and any outreach drafts to them are removed. This cannot be undone.`} confirmLabel="Delete"
            onConfirm={async () => { const r = await deleteContactAction(contact.id); if (!r.ok) { toast.error(r.error); return; } toast.success("Contact deleted"); setOpen(false); onDeleted(contact.id); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
