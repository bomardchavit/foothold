"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveFilterAction, renameFilterAction, deleteFilterAction } from "@/app/actions/jobs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Saved { id: string; name: string; params: Record<string, string> }
const PARAM_LABELS: Record<string, string> = { loc: "", roles: "", seniority: "level", type: "type", work: "", posted: "posted", industry: "", years: "yrs", min: "fit", salary: "salary", h1b: "H1B", q: "" };

function describe(p: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(p)) { if (!v || k === "page" || k === "tab" || k === "hidden") continue; const lbl = PARAM_LABELS[k]; parts.push(lbl ? `${lbl} ${v.replace(/,/g, ", ")}` : v.replace(/,/g, ", ")); }
  return parts.join(" · ") || "All jobs";
}

export function RightRail({ user, savedFilters, currentParams, activeId }: { user: { name: string | null; email: string | null; image: string | null }; savedFilters: Saved[]; currentParams: Record<string, string | string[] | undefined>; activeId: string | null }) {
  const router = useRouter(); const path = usePathname();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const initials = (user.name ?? user.email ?? "?").split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  const current: Record<string, string> = {};
  for (const [k, v] of Object.entries(currentParams)) { const s = Array.isArray(v) ? v[0] : v; if (s && k !== "sf" && k !== "page") current[k] = s; }
  const save = () => start(async () => { const r = await saveFilterAction(name, current); if (r.ok) { setNaming(false); setName(""); toast.success("Filter saved"); router.push(`${path}?sf=${r.data.id}`); } else toast.error(r.error); });
  return (
    <aside className="sticky top-0 hidden h-screen w-[380px] shrink-0 border-l bg-card px-6 py-6 xl:block" data-testid="right-rail">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9"><AvatarImage src={user.image ?? undefined} alt="" /><AvatarFallback>{initials || "?"}</AvatarFallback></Avatar>
        <p className="truncate text-[15px] font-semibold">{user.name ?? user.email}</p>
        <span className="ml-auto rounded-full bg-muted px-3 py-1 text-xs font-medium">Free plan</span>
      </div>
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Your saved filters</h2>
        <button aria-label="Save current filters" onClick={() => setNaming(true)} data-testid="save-filter" className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"><Plus className="h-4 w-4" /></button>
      </div>
      {naming && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={describe(current).slice(0, 40)} data-testid="save-filter-name" />
          <Button type="submit" size="sm" disabled={pending || !name.trim()}>Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>Cancel</Button>
        </form>
      )}
      <ul className="mt-3 space-y-1" data-testid="saved-filters">
        {savedFilters.length === 0 && !naming && <li className="text-sm text-muted-foreground">Save a combination of filters to come back to it in one click.</li>}
        {savedFilters.map((s) => (
          <li key={s.id} className={cn("group flex items-center gap-2 rounded-md border-l-2 py-1.5 pl-3 pr-1", activeId === s.id ? "border-primary bg-accent/60" : "border-transparent hover:bg-accent/40")}>
            {editing === s.id ? (
              <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("n") as string; start(async () => { await renameFilterAction(s.id, v); setEditing(null); }); }}>
                <Input name="n" defaultValue={s.name} className="h-8" autoFocus /><button className="p-1" aria-label="Save name"><Check className="h-4 w-4" /></button><button type="button" className="p-1" aria-label="Cancel" onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
              </form>
            ) : (
              <>
                <button className="min-w-0 flex-1 text-left" onClick={() => router.push(`${path}?sf=${s.id}`)} data-testid="apply-saved-filter"><p className="truncate text-[15px]">{s.name}</p><p className="truncate text-xs text-muted-foreground">{describe(s.params)}</p></button>
                <button aria-label="Rename" className="p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100" onClick={() => setEditing(s.id)}><Pencil className="h-4 w-4" /></button>
                <button aria-label="Delete" className="p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100" onClick={() => start(async () => { await deleteFilterAction(s.id); if (activeId === s.id) router.push(path); })}><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
