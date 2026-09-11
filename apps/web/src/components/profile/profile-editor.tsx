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
import { FieldError, scrollToFirstError, toErrorMap, type ErrorMap } from "@/components/profile/form-errors";
import { toast } from "sonner";

type Exp = ProfileEdit["experiences"][number];
type Edu = ProfileEdit["educations"][number];
type Proj = ProfileEdit["projects"][number];

export function ProfileEditor({ initial, nextHref, compact = false }: { initial: ProfileEdit; nextHref?: string; compact?: boolean }) {
  const [p, setP] = useState<ProfileEdit>(initial);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  /** Clears the error for a path (and for the whole item when a sub-field changes) as soon as the person edits it. */
  const clear = (path: string) => setErrors((e) => { if (!e[path]) return e; const n = { ...e }; delete n[path]; return n; });
  const err = (path: string) => errors[path];
  const set = <K extends keyof ProfileEdit>(k: K, v: ProfileEdit[K]) => setP((x) => ({ ...x, [k]: v }));
  const upExp = (i: number, patch: Partial<Exp>) => set("experiences", p.experiences.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const upEdu = (i: number, patch: Partial<Edu>) => set("educations", p.educations.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const upProj = (i: number, patch: Partial<Proj>) => set("projects", p.projects.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  function submit() {
    start(async () => {
      const r = await saveProfileAction(p);
      if (!r.ok) { const map = toErrorMap(r.issues); setErrors(map); toast.error(r.error); requestAnimationFrame(() => scrollToFirstError(map)); return; }
      setErrors({});
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
          <Field label="Full name" path="fullName" error={err("fullName")} value={p.fullName} onChange={(v) => { clear("fullName"); set("fullName", v); }} testId="full-name" />
          <Field label="Email" path="email" error={err("email")} value={p.email} onChange={(v) => { clear("email"); set("email", v); }} type="email" />
          <Field label="Phone" path="phone" error={err("phone")} value={p.phone} onChange={(v) => { clear("phone"); set("phone", v); }} />
          <Field label="Location" path="location" error={err("location")} value={p.location} onChange={(v) => { clear("location"); set("location", v); }} placeholder="City, ST" />
          <Field label="LinkedIn" path="linkedinUrl" error={err("linkedinUrl")} value={p.linkedinUrl} onChange={(v) => { clear("linkedinUrl"); set("linkedinUrl", v); }} />
          <Field label="GitHub" path="githubUrl" error={err("githubUrl")} value={p.githubUrl} onChange={(v) => { clear("githubUrl"); set("githubUrl", v); }} />
          <Field label="Website" path="websiteUrl" error={err("websiteUrl")} value={p.websiteUrl} onChange={(v) => { clear("websiteUrl"); set("websiteUrl", v); }} />
          <Field label="Headline" path="headline" error={err("headline")} value={p.headline} onChange={(v) => { clear("headline"); set("headline", v); }} placeholder="e.g. Backend engineer, payments" />
          <div className="sm:col-span-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea id="summary" className="mt-1" rows={3} value={p.summary ?? ""} onChange={(e) => set("summary", e.target.value || null)} />
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
                <Field label="Title" path={`experiences.${i}.title`} error={err(`experiences.${i}.title`)} value={e.title} onChange={(v) => { clear(`experiences.${i}.title`); upExp(i, { title: v ?? "" }); }} testId="experience-title" />
                <Field label="Company" path={`experiences.${i}.company`} error={err(`experiences.${i}.company`)} value={e.company} onChange={(v) => { clear(`experiences.${i}.company`); upExp(i, { company: v ?? "" }); }} testId="experience-company" />
                <Field label="Location" path={`experiences.${i}.location`} error={err(`experiences.${i}.location`)} value={e.location} onChange={(v) => { clear(`experiences.${i}.location`); upExp(i, { location: v }); }} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start (YYYY-MM)" path={`experiences.${i}.startDate`} error={err(`experiences.${i}.startDate`)} value={e.startDate} onChange={(v) => { clear(`experiences.${i}.startDate`); upExp(i, { startDate: v }); }} placeholder="2022-06" />
                  <Field label="End (YYYY-MM)" path={`experiences.${i}.endDate`} error={err(`experiences.${i}.endDate`)} value={e.isCurrent ? "" : e.endDate} onChange={(v) => { clear(`experiences.${i}.endDate`); upExp(i, { endDate: v }); }} placeholder="2024-01" disabled={e.isCurrent} />
                </div>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={e.isCurrent} onCheckedChange={(v) => upExp(i, { isCurrent: Boolean(v) })} /> I currently work here</label>
              </div>
              <div className="mt-3 space-y-2">
                <Label>Bullets</Label>
                {e.bullets.map((b, j) => (
                  <div key={b.id ?? j} className="flex gap-2" data-field={`experiences.${i}.bullets.${j}.text`}>
                    <div className="min-w-0 flex-1"><Textarea rows={2} value={b.text} aria-invalid={Boolean(err(`experiences.${i}.bullets.${j}.text`)) || undefined} onChange={(ev) => { clear(`experiences.${i}.bullets.${j}.text`); upExp(i, { bullets: e.bullets.map((x, k) => (k === j ? { ...x, text: ev.target.value } : x)) }); }} className="min-h-0" data-testid="bullet-text" /><FieldError id={`err-exp-${i}-b-${j}`} message={err(`experiences.${i}.bullets.${j}.text`)} /></div>
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
              <Field label="School" path={`educations.${i}.school`} error={err(`educations.${i}.school`)} value={e.school} onChange={(v) => { clear(`educations.${i}.school`); upEdu(i, { school: v ?? "" }); }} />
              <Field label="Degree" path={`educations.${i}.degree`} error={err(`educations.${i}.degree`)} value={e.degree} onChange={(v) => { clear(`educations.${i}.degree`); upEdu(i, { degree: v }); }} placeholder="B.S." />
              <Field label="Field" path={`educations.${i}.field`} error={err(`educations.${i}.field`)} value={e.field} onChange={(v) => { clear(`educations.${i}.field`); upEdu(i, { field: v }); }} placeholder="Computer Science" />
              <Field label="Start" path={`educations.${i}.startDate`} error={err(`educations.${i}.startDate`)} value={e.startDate} onChange={(v) => { clear(`educations.${i}.startDate`); upEdu(i, { startDate: v }); }} placeholder="2016-08" />
              <Field label="End" path={`educations.${i}.endDate`} error={err(`educations.${i}.endDate`)} value={e.endDate} onChange={(v) => { clear(`educations.${i}.endDate`); upEdu(i, { endDate: v }); }} placeholder="2020-05" />
              <Field label="GPA" path={`educations.${i}.gpa`} error={err(`educations.${i}.gpa`)} value={e.gpa} onChange={(v) => { clear(`educations.${i}.gpa`); upEdu(i, { gpa: v }); }} />
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
                  <Field label="Name" path={`projects.${i}.name`} error={err(`projects.${i}.name`)} value={pr.name} onChange={(v) => { clear(`projects.${i}.name`); upProj(i, { name: v ?? "" }); }} />
                  <Field label="URL" path={`projects.${i}.url`} error={err(`projects.${i}.url`)} value={pr.url} onChange={(v) => { clear(`projects.${i}.url`); upProj(i, { url: v }); }} />
                  <div className="sm:col-span-2"><Field label="Description / technologies" path={`projects.${i}.description`} error={err(`projects.${i}.description`)} value={pr.description} onChange={(v) => { clear(`projects.${i}.description`); upProj(i, { description: v }); }} /></div>
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
        <CardContent data-field="skills">
          <TagInput value={p.skills} onChange={(v) => { clear("skills"); set("skills", v); }} placeholder="Type a skill and press Enter (e.g. PostgreSQL)" testId="skills-input" />
          <FieldError id="err-skills" message={err("skills")} />
          <p className="mt-2 text-xs text-muted-foreground">{p.skills.length} skills. Only skills listed here (or evidenced in your bullets) count toward matches.</p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" size="lg" disabled={pending} data-testid="save-profile">{pending ? "Saving…" : nextHref ? "Save and continue" : "Save changes"}</Button>
      </div>
    </form>
  );
}

function Field({ label, path, error, value, onChange, type = "text", placeholder, disabled, testId }: { label: string; path: string; error?: string; value: string | null | undefined; onChange: (v: string | null) => void; type?: string; placeholder?: string; disabled?: boolean; testId?: string }) {
  const id = `f-${path.replace(/\W+/g, "-")}`;
  return (
    <div data-field={path}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="mt-1" type={type} value={value ?? ""} placeholder={placeholder} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.value || null)} data-testid={testId} />
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}
