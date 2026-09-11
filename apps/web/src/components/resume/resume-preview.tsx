import type { ResumeContent } from "@foothold/shared";
import { cn } from "@/lib/utils";

/** HTML twin of the PDF layout: single column, plain text. */
export function ResumePreview({ content: c, highlight = false }: { content: ResumeContent; highlight?: boolean }) {
  const mark = (kind: string, grounded: boolean) => highlight && kind !== "unchanged" ? (grounded ? "bg-primary/10" : "bg-ochre/25") : "";
  const contact = [c.header.email, c.header.phone, c.header.location, ...c.header.links].filter(Boolean).join("  |  ");
  return (
    <div className="rounded-xl border bg-white p-8 text-[13px] leading-snug text-neutral-900 shadow-sm dark:bg-neutral-100" data-testid="resume-preview" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      <h2 className="text-xl font-bold" style={{ fontFamily: "inherit" }}>{c.header.fullName}</h2>
      {contact && <p className="text-[11px] text-neutral-700">{contact}</p>}
      {c.headline && <p className="mt-1 font-semibold">{c.headline}</p>}
      {c.summary && <><Section>Summary</Section><p>{c.summary}</p></>}
      {c.experience.length > 0 && <Section>Experience</Section>}
      {c.experience.map((e) => (
        <div key={e.experienceId} className="mt-2">
          <div className="flex justify-between gap-3"><span className="font-semibold">{e.title}, {e.company}</span><span className="text-neutral-700">{e.dateRange}</span></div>
          {e.location && <p className="text-neutral-700">{e.location}</p>}
          <ul className="ml-4 list-disc">{e.bullets.map((b) => <li key={b.bulletId} className={cn("mt-0.5 rounded px-0.5", mark(b.changeKind, b.grounded))} data-kind={b.changeKind}>{b.text}</li>)}</ul>
        </div>
      ))}
      {c.projects.length > 0 && <Section>Projects</Section>}
      {c.projects.map((p) => (
        <div key={p.projectId} className="mt-2">
          <div className="flex justify-between gap-3"><span className="font-semibold">{p.name}</span>{p.url && <span className="text-neutral-700">{p.url}</span>}</div>
          {p.description && <p className="text-neutral-700">{p.description}</p>}
          <ul className="ml-4 list-disc">{p.bullets.map((b) => <li key={b.bulletId} className={cn("mt-0.5 rounded px-0.5", mark(b.changeKind, b.grounded))}>{b.text}</li>)}</ul>
        </div>
      ))}
      {c.education.length > 0 && <Section>Education</Section>}
      {c.education.map((e, i) => (
        <div key={i} className="mt-1 flex justify-between gap-3"><span><span className="font-semibold">{e.school}</span>{(e.degree || e.field) && ` — ${[e.degree, e.field].filter(Boolean).join(", ")}`}{e.gpa && ` (GPA ${e.gpa})`}</span><span className="text-neutral-700">{e.dateRange}</span></div>
      ))}
      {c.skills.length > 0 && <><Section>Skills</Section><p>{c.skills.map((s, i) => <span key={s.name} className={cn("rounded px-0.5", mark(s.changeKind, s.grounded))}>{s.name}{i < c.skills.length - 1 ? ", " : ""}</span>)}</p></>}
    </div>
  );
}
function Section({ children }: { children: React.ReactNode }) { return <h3 className="mt-4 border-b border-neutral-900 pb-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ fontFamily: "inherit" }}>{children}</h3>; }
