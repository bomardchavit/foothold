"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function TagInput({ value, onChange, placeholder, suggestions = [], testId, max = 150, id, invalid = false, describedBy }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[]; testId?: string; max?: number; id?: string; invalid?: boolean; describedBy?: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const next = [...value];
    for (const it of items) if (!next.some((x) => x.toLowerCase() === it.toLowerCase()) && next.length < max) next.push(it);
    onChange(next);
    setDraft("");
  };
  const filtered = suggestions.filter((s) => draft && s.toLowerCase().includes(draft.toLowerCase()) && !value.includes(s)).slice(0, 6);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-0.5 text-xs" data-testid="tag" data-value={v}>
            {v}<button type="button" aria-label={`Remove ${v}`} className="text-muted-foreground hover:text-foreground" onClick={() => onChange(value.filter((x) => x !== v))}>×</button>
          </span>
        ))}
      </div>
      <Input id={id} className={cn("mt-2")} value={draft} placeholder={placeholder} data-testid={testId} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }}
        onBlur={() => draft && add(draft)} />
      {filtered.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {filtered.map((s) => <button type="button" key={s} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent" onClick={() => add(s)}>{s}</button>)}
        </div>
      )}
    </div>
  );
}
