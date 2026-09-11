"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProfileEdit } from "@foothold/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveProfileAction } from "@/app/actions/profile";
import { TagInput } from "@/components/profile/tag-input";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { toast } from "sonner";

type Exp = ProfileEdit["experiences"][number];
type Edu = ProfileEdit["educations"][number];
type Proj = ProfileEdit["projects"][number];

export function ProfileEditor({ initial, nextHref, compact = false }: { initial: ProfileEdit; nextHref?: string; compact?: boolean }) {
  const [p, setP] = useState<ProfileEdit>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof ProfileEdit>(k: K, v: ProfileEdit[K]) => setP((x) => ({ ...x, [k]: v }));
  const upExp = (i: number, patch: Partial<Exp>) => set("experiences", p.experiences.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const upEdu = (i: number, patch: Partial<Edu>) => set("educations", p.educations.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const upProj = (i: number, patch: Partial<Proj>) => set("projects", p.projects.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  function submit() {
    start(async () => {
      const r = await saveProfileAction(p);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Profile saved");
      trackClient(EVENTS.onboarding_step_completed, { step: "review" });
      if (nextHref) router.push(nextHref); else router.refresh();
    });
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="profile-editor">
      <Card>
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={p.fullName} onChange={(v) => set("fullName", v)} testId="full-name" />
          <Field label="Email" value={p.email} onChange={(v) => set("email", v)} type="email" />
          <Field label="Phone" value={p.phone} onChange={(v) => set("phone", v)} />
          <Field label="Location" value={p.location} onChange={(v) => set("location", v)} placeholder="City, ST" />
          <Field label="LinkedIn" value={p.linkedinUrl} onChange={(v) => set("linkedinUrl", v)} />
          <Field label="GitHub" value={p.githubUrl} onChange={(v) => set("githubUrl", v)} />
          <Field label="Website" value={p.websiteUrl} onChange={(v) => set("websiteUrl", v)} />
          <Field label="Headline" value={p.headline} onChange={(v) => set("headline", v)} placeholder="e.g. Backend engineer, payments" />
          <div className="sm:col-span-2">
            <Label>Summary</Label>
            <Textarea className="mt-1" rows={3} value={p.summary ?? ""} onChange={(e) => set("summary", e.target.value || null)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>Experience</CardTitle><Button type="button" size="sm" variant="outline" onClick={() => set("experiences", [...p.experiences, { company: "", title: "", location: null, startDate: null, endDate: null, isCurrent: false, bullets: [{ text: "" }] }])}>Add role</Button></CardHeader>
        <CardContent className="space-y-6">
          {p.experiences.length === 0 && <p className="text-sm text-muted-foreground">No roles yet. Add your most recent job first.</p>}
          {p.experiences.map((e, i) => (
            <div key={e.id ?? i} className="rounded-lg border p-4" data-testid="experience-item">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" value={e.title} onChange={(v) => upExp(i, { title: v ?? "" })} testId="experience-title" />
                <Field label="Company" value={e.company} onChange={(v) => upExp(i, { company: v ?? "" })} testId="experience-company" />
                <Field label="Location" value={e.location} onChange={(v) => upExp(i, { location: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start (YYYY-MM)" value={e.startDate} onChange={(v) => upExp(i, { startDate: v })} placeholder="2022-06" />
                  <Field label="End (YYYY-MM)" value={e.isCurrent ? "" : e.endDate} onChange={(v) => upExp(i, { endDate: v })} placeholder="2024-01" disabled={e.isCurrent} />
                </div>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={e.isCurrent} onCheckedChange={(v) => upExp(i, { isCurrent: Boolean(v) })} /> I currently work here</label>
              </div>
              <div className="mt-3 space-y-2">
                <Label>Bullets</Label>
                {e.bullets.map((b, j) => (
                  <div key={b.id ?? j} className="flex gap-2">
                    <Textarea rows={2} value={b.text} onChange={(ev) => upExp(i, { bullets: e.bullets.map((x, k) => (k === j ? { ...x, text: ev.target.value } : x)) })} className="min-h-0" data-testid="bullet-text" />
                    <Button type="button" variant="ghost" size="sm" aria-label="Remove bullet" onClick={() => upExp(i, { bullets: e.bullets.filter((_, k) => k !== j) })}>×</Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => upExp(i, { bullets: [...e.bullets, { text: "" }] })}>Add bullet</Button>
              </div>
              <div className="mt-2 text-right"><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => set("experiences", p.experiences.filter((_, k) => k !== i))}>Remove role</Button></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>Education</CardTitle><Button type="button" size="sm" variant="outline" onClick={() => set("educations", [...p.educations, { school: "", degree: null, field: null, startDate: null, endDate: null, gpa: null }])}>Add school</Button></CardHeader>
        <CardContent className="space-y-4">
          {p.educations.map((e, i) => (
            <div key={e.id ?? i} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3" data-testid="education-item">
              <Field label="School" value={e.school} onChange={(v) => upEdu(i, { school: v ?? "" })} />
              <Field label="Degree" value={e.degree} onChange={(v) => upEdu(i, { degree: v })} placeholder="B.S." />
              <Field label="Field" value={e.field} onChange={(v) => upEdu(i, { field: v })} placeholder="Computer Science" />
              <Field label="Start" value={e.startDate} onChange={(v) => upEdu(i, { startDate: v })} placeholder="2016-08" />
              <Field label="End" value={e.endDate} onChange={(v) => upEdu(i, { endDate: v })} placeholder="2020-05" />
              <Field label="GPA" value={e.gpa} onChange={(v) => upEdu(i, { gpa: v })} />
              <div className="sm:col-span-3 text-right"><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => set("educations", p.educations.filter((_, k) => k !== i))}>Remove</Button></div>
            </div>
          ))}
        </CardContent>
      </Card>

      {!compact && (
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Projects</CardTitle><Button type="button" size="sm" variant="outline" onClick={() => set("projects", [...p.projects, { name: "", url: null, description: null, bullets: [] }])}>Add project</Button></CardHeader>
          <CardContent className="space-y-4">
            {p.projects.map((pr, i) => (
              <div key={pr.id ?? i} className="rounded-lg border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" value={pr.name} onChange={(v) => upProj(i, { name: v ?? "" })} />
                  <Field label="URL" value={pr.url} onChange={(v) => upProj(i, { url: v })} />
                  <div className="sm:col-span-2"><Field label="Description / technologies" value={pr.description} onChange={(v) => upProj(i, { description: v })} /></div>
                </div>
                <div className="mt-3 space-y-2">
                  {pr.bullets.map((b, j) => (
                    <div key={b.id ?? j} className="flex gap-2">
                      <Textarea rows={2} value={b.text} onChange={(ev) => upProj(i, { bullets: pr.bullets.map((x, k) => (k === j ? { ...x, text: ev.target.value } : x)) })} className="min-h-0" />
                      <Button type="button" variant="ghost" size="sm" aria-label="Remove bullet" onClick={() => upProj(i, { bullets: pr.bullets.filter((_, k) => k !== j) })}>×</Button>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" onClick={() => upProj(i, { bullets: [...pr.bullets, { text: "" }] })}>Add bullet</Button>
                </div>
                <div className="mt-2 text-right"><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => set("projects", p.projects.filter((_, k) => k !== i))}>Remove project</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Skills</CardTitle></CardHeader>
        <CardContent>
          <TagInput value={p.skills} onChange={(v) => set("skills", v)} placeholder="Type a skill and press Enter (e.g. PostgreSQL)" testId="skills-input" />
          <p className="mt-2 text-xs text-muted-foreground">{p.skills.length} skills. Only skills listed here (or evidenced in your bullets) count toward matches.</p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" size="lg" disabled={pending} data-testid="save-profile">{pending ? "Saving…" : nextHref ? "Save and continue" : "Save changes"}</Button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, disabled, testId }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; type?: string; placeholder?: string; disabled?: boolean; testId?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="mt-1" type={type} value={value ?? ""} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} data-testid={testId} />
    </div>
  );
}
