import { Fragment } from "react";

type Block = { kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] };

const BULLET = /^\s*(?:[-*•▪◦●·]|\d+[.)])\s+/;
/** A short line that ends with a colon, or a short Title Case / ALL CAPS line without end punctuation, reads as a heading. */
function isHeading(line: string): boolean {
  if (line.length > 80) return false;
  if (/:$/.test(line)) return true;
  if (/[.!?,;]$/.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > 8) return false;
  const caps = words.filter((w) => /^[A-Z]/.test(w) || /^(?:&|and|of|the|to|for|a|in|on|at|with|you|we|our|your)$/i.test(w)).length;
  return caps === words.length && /^[A-Z]/.test(line);
}

/** Turns the plain-text posting into headings, paragraphs and bullet lists so it reads like the original page, not a text dump. */
export function parsePosting(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flushPara = () => { if (para.length) { out.push({ kind: "p", text: para.join(" ") }); para = []; } };
  const flushList = () => { if (list?.length) out.push({ kind: "ul", items: list }); list = null; };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    if (BULLET.test(line)) { flushPara(); (list ??= []).push(line.replace(BULLET, "")); continue; }
    if (isHeading(line)) { flushPara(); flushList(); out.push({ kind: "h", text: line.replace(/:$/, "") }); continue; }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out;
}

export function PostingBody({ text }: { text: string }) {
  const blocks = parsePosting(text);
  return (
    <div className="text-[15px] leading-relaxed" data-testid="job-description">
      {blocks.map((b, i) => (
        <Fragment key={i}>
          {b.kind === "h" && <h3 className="mt-5 text-[15px] font-semibold first:mt-0" style={{ fontFamily: "inherit" }}>{b.text}</h3>}
          {b.kind === "p" && <p className="mt-2 first:mt-0">{b.text}</p>}
          {b.kind === "ul" && <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>}
        </Fragment>
      ))}
    </div>
  );
}
