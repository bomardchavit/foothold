"use client";
import { Fragment } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ContextLine { id: string; kind: "P" | "J" | "M"; text: string; label: string }
const CITE_RX = /\[((?:P|J|M)\d+)(?:,\s*(?:P|J|M)\d+)*\]/g;

/** Renders assistant text with [P12]-style citations as chips; flagged sentences get an amber underline. */
export function CitationText({ text, lines, flagged, pending }: { text: string; lines: Record<string, ContextLine>; flagged: Array<{ sentence: string; reason: string }>; pending?: boolean }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-2 leading-relaxed", pending && "after:ml-0.5 after:inline-block after:h-3 after:w-1.5 after:animate-pulse after:bg-primary/60 after:align-middle after:content-['']")} data-testid="citation-text">
      {paragraphs.map((para, pi) => (
        <p key={pi} className="whitespace-pre-wrap">{renderPara(para, lines, flagged)}</p>
      ))}
    </div>
  );
}

function renderPara(para: string, lines: Record<string, ContextLine>, flagged: Array<{ sentence: string; reason: string }>) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const rx = new RegExp(CITE_RX.source, "g");
  while ((m = rx.exec(para))) {
    if (m.index > last) out.push(<Fragment key={`t${last}`}>{flagSpan(para.slice(last, m.index), flagged)}</Fragment>);
    const ids = m[0].slice(1, -1).split(/,\s*/);
    out.push(
      <span key={`c${m.index}`} className="mx-0.5 inline-flex gap-0.5 align-baseline">
        {ids.map((id) => {
          const line = lines[id];
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <span className={cn("inline-block rounded px-1 text-[10px] font-medium leading-4", line ? (line.kind === "P" ? "bg-primary/15 text-primary" : line.kind === "J" ? "bg-slate/15 text-slate" : "bg-plum/15 text-plum") : "bg-destructive/15 text-destructive line-through")} data-testid="citation-chip">{id}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs"><span className="font-medium">{line?.label ?? "Unknown citation"}</span>{line ? `: ${line.text}` : " (this line does not exist)"}</TooltipContent>
            </Tooltip>
          );
        })}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < para.length) out.push(<Fragment key={`t${last}`}>{flagSpan(para.slice(last), flagged)}</Fragment>);
  return out;
}

function flagSpan(text: string, flagged: Array<{ sentence: string; reason: string }>) {
  const hit = flagged.find((f) => f.sentence && text.includes(f.sentence.slice(0, Math.min(40, f.sentence.length))));
  if (!hit) return text;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="underline decoration-ochre decoration-wavy underline-offset-2" data-testid="ungrounded">{text}</span></TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{hit.reason}</TooltipContent>
    </Tooltip>
  );
}
