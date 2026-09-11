"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCopilot } from "./copilot-context";
import { CitationText, type ContextLine } from "./citation-text";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

interface Msg { id: string; role: "user" | "assistant"; content: string; grounding?: GroundingReport; pending?: boolean }
export interface GroundingReport { status: "GROUNDED" | "PARTIAL" | "REJECTED" | "NA"; flagged: Array<{ sentence: string; reason: string }>; retried: boolean; mode: string }

const PROMPTS = (hasJob: boolean) => hasJob
  ? ["Why do I match this role?", "What are my gaps?", "Draft a cover letter", "Prep me for an interview at this company", "Should I apply?"]
  : ["What kinds of roles fit my profile best?", "What skills should I add next?", "Summarize my strengths"];

export function CopilotDock() {
  const c = useCopilot();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [lines, setLines] = useState<Record<string, ContextLine>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const jobRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // new job context → new conversation
  useEffect(() => {
    const id = c.job?.id ?? null;
    if (jobRef.current !== id) { jobRef.current = id; setMessages([]); setConversationId(null); setLines({}); }
  }, [c.job?.id]);

  useEffect(() => {
    if (!c.isOpen) return;
    const p = c.consumePrompt();
    if (p) void send(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.isOpen, c.pendingPrompt]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: q };
    const draft: Msg = { id: `a-${Date.now()}`, role: "assistant", content: "", pending: true };
    setMessages((m) => [...m, userMsg, draft]);
    trackClient(EVENTS.copilot_asked, { jobId: c.job?.id ?? null, prompt: q.slice(0, 80) });
    try {
      const res = await fetch("/api/copilot/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, jobId: c.job?.id ?? null, conversationId }) });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { type: string; [k: string]: unknown };
          if (ev.type === "context") { setLines(ev.lines as Record<string, ContextLine>); setConversationId(ev.conversationId as string); }
          else if (ev.type === "delta") { acc += ev.text as string; setMessages((m) => m.map((x) => (x.id === draft.id ? { ...x, content: acc } : x))); }
          else if (ev.type === "replace") { acc = ev.text as string; setMessages((m) => m.map((x) => (x.id === draft.id ? { ...x, content: acc } : x))); }
          else if (ev.type === "grounding") { setMessages((m) => m.map((x) => (x.id === draft.id ? { ...x, grounding: ev.report as GroundingReport } : x))); }
          else if (ev.type === "error") { acc += `\n\n${ev.message as string}`; setMessages((m) => m.map((x) => (x.id === draft.id ? { ...x, content: acc } : x))); }
        }
      }
      setMessages((m) => m.map((x) => (x.id === draft.id ? { ...x, pending: false } : x)));
    } catch (e) {
      setMessages((m) => m.map((x) => (x.id === draft.id ? { ...x, pending: false, content: `Something went wrong: ${e instanceof Error ? e.message : String(e)}` } : x)));
    } finally { setBusy(false); }
  }

  return (
    <>
      {!c.isOpen && (
        <button onClick={() => c.open()} className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm shadow-lg transition hover:shadow-xl" aria-label="Open Belay copilot">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" /> Belay
        </button>
      )}
      <Sheet open={c.isOpen} onOpenChange={(o) => (o ? c.open() : c.close())}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" data-testid="copilot-panel">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex items-center gap-2 font-heading text-xl"><span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" /> Belay</SheetTitle>
            <SheetDescription className="text-xs">
              {c.job ? <>Context: <Badge variant="secondary">{c.job.title} · {c.job.company}</Badge></> : "Context: your profile. Open a job to talk about a specific role."} Every claim about you cites a line from your profile or the posting.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-5" ref={scrollRef as never}>
            <div className="space-y-4 py-4" data-testid="copilot-messages">
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Try one of these:</p>
                  <div className="flex flex-wrap gap-2">
                    {PROMPTS(Boolean(c.job)).map((p) => <Button key={p} size="sm" variant="outline" onClick={() => send(p)} data-testid="copilot-prompt">{p}</Button>)}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn("text-sm", m.role === "user" ? "ml-8 rounded-lg bg-accent px-3 py-2" : "")} data-role={m.role}>
                  {m.role === "assistant" ? (
                    <div className="space-y-2">
                      <CitationText text={m.content} lines={lines} flagged={m.grounding?.flagged ?? []} pending={m.pending} />
                      {m.grounding && <GroundingBanner report={m.grounding} />}
                    </div>
                  ) : m.content}
                </div>
              ))}
            </div>
          </ScrollArea>
          <form className="border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={c.job ? "Ask about this role…" : "Ask about your search…"} rows={2} className="resize-none" data-testid="copilot-input"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
              <Button type="submit" size="sm" disabled={busy || !input.trim()} data-testid="copilot-send">{busy ? "Thinking…" : "Send"}</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function GroundingBanner({ report }: { report: GroundingReport }) {
  if (report.status === "GROUNDED") return <p className="text-[11px] text-muted-foreground" data-testid="grounding-status">Grounded: every claim about you cites your profile{report.retried ? " (after one retry)" : ""}.</p>;
  if (report.status === "NA") return null;
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs", report.status === "REJECTED" ? "border-destructive/40 bg-destructive/10" : "border-ochre/60 bg-accent")} data-testid="grounding-status">
      <p className="font-medium">{report.status === "REJECTED" ? "Part of this answer could not be grounded in your profile." : "Some sentences are not backed by a citation."}</p>
      <ul className="mt-1 list-disc pl-4 text-muted-foreground">{report.flagged.slice(0, 4).map((f, i) => <li key={i}>{f.reason}: “{f.sentence.slice(0, 90)}{f.sentence.length > 90 ? "…" : ""}”</li>)}</ul>
    </div>
  );
}
