"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INDUSTRIES, SENIORITY_LABELS, WORK_AUTH_LABELS, COMPANY_SIZE_LABELS, type Preferences, SENIORITY_VALUES, WORK_AUTH_VALUES, COMPANY_SIZE_VALUES, REMOTE_PREF_VALUES } from "@foothold/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagInput } from "@/components/profile/tag-input";
import { FieldError, scrollToFirstError, toErrorMap, type ErrorMap } from "@/components/profile/form-errors";
import { savePreferencesAction, completeOnboardingAction } from "@/app/actions/profile";
import type { PreferenceSuggestions } from "./suggest";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { toast } from "sonner";

const ROLE_SUGGESTIONS = ["Software Engineer", "Backend Engineer", "Frontend Engineer", "Full-Stack Engineer", "Data Scientist", "Data Analyst", "Data Engineer", "Machine Learning Engineer", "Product Manager", "Product Designer", "DevOps Engineer", "Site Reliability Engineer", "Security Engineer", "iOS Engineer", "Android Engineer", "Engineering Manager", "Technical Program Manager", "UX Researcher", "Growth Marketing Manager", "Business Analyst", "Financial Analyst", "Solutions Engineer", "Customer Success Manager"];
const LOCATION_SUGGESTIONS = ["Remote", "San Francisco, CA", "New York, NY", "Seattle, WA", "Austin, TX", "Boston, MA", "Chicago, IL", "Los Angeles, CA", "Denver, CO", "Washington, DC", "Atlanta, GA"];
const REMOTE_LABELS: Record<(typeof REMOTE_PREF_VALUES)[number], string> = { REMOTE: "Remote only", HYBRID: "Hybrid", ONSITE: "On-site", ANY: "Any" };

/** Empty preferences are prefilled from the parsed résumé so the step is never blank after an upload. */
function seed(initial: Preferences, s: PreferenceSuggestions | null | undefined): { prefs: Preferences; seeded: boolean } {
  if (!s) return { prefs: initial, seeded: false };
  const prefs = { ...initial };
  let seeded = false;
  if (!prefs.targetRoles.length && s.targetRoles.length) { prefs.targetRoles = s.targetRoles; seeded = true; }
  if (!prefs.locations.length && s.locations.length) { prefs.locations = s.locations; seeded = true; }
  if (prefs.seniority === "UNKNOWN" && s.seniority !== "UNKNOWN") { prefs.seniority = s.seniority; seeded = true; }
  return { prefs, seeded };
}

export function PreferencesForm({ initial, completeOnboarding = false, suggestions = null }: { initial: Preferences; completeOnboarding?: boolean; suggestions?: PreferenceSuggestions | null }) {
  const [{ prefs: seeded, seeded: wasSeeded }] = useState(() => seed(initial, suggestions));
  const [p, setP] = useState<Preferences>(seeded);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => { setP((x) => ({ ...x, [k]: v })); if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; }); };
  const toggle = (k: "industries" | "companySizes", v: string) => {
    const arr = p[k] as string[];
    set(k, (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]) as never);
  };
  const roleChips = (suggestions?.targetRoles ?? []).filter((r) => !p.targetRoles.some((x) => x.toLowerCase() === r.toLowerCase()));
  function fail(error: string, issues?: Parameters<typeof toErrorMap>[0]) {
    const map = toErrorMap(issues);
    setErrors(map);
    toast.error(error);
    requestAnimationFrame(() => scrollToFirstError(map));
  }
  function submit() {
    if (!p.targetRoles.length) { fail("Pick at least one target role.", [{ path: "targetRoles", message: "Add at least one target role, for example the title of your last job" }]); return; }
    start(async () => {
      const r = await savePreferencesAction(p);
      if (!r.ok) { fail(r.error, r.issues); return; }
      setErrors({});
      trackClient(EVENTS.onboarding_step_completed, { step: "preferences" });
      if (completeOnboarding) {
        const c = await completeOnboardingAction();
        if (!c.ok) { fail(c.error, c.issues); return; }
        router.push("/onboarding?step=done");
      } else { toast.success("Preferences saved. Recomputing matches…"); router.refresh(); }
    });
  }
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="preferences-form" noValidate>
      <Card>
        <CardHeader><CardTitle>Roles and places</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <div data-field="targetRoles">
            <Label htmlFor="pref-roles">Target roles</Label>
            <div className="mt-1"><TagInput id="pref-roles" value={p.targetRoles} onChange={(v) => set("targetRoles", v)} suggestions={ROLE_SUGGESTIONS} placeholder="e.g. Backend Engineer" testId="target-roles" max={10} invalid={Boolean(errors.targetRoles)} describedBy={errors.targetRoles ? "err-targetRoles" : undefined} /></div>
            <FieldError id="err-targetRoles" message={errors.targetRoles} />
            {roleChips.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="role-suggestions">
                <span>From your résumé:</span>
                {roleChips.map((r) => <button key={r} type="button" className="rounded-full border px-2 py-0.5 text-xs text-foreground hover:bg-accent" onClick={() => set("targetRoles", [...p.targetRoles, r])}>+ {r}</button>)}
              </div>
            )}
            {wasSeeded && <p className="mt-2 text-xs text-muted-foreground" data-testid="seeded-hint">Prefilled from your résumé. Remove anything that is off and add the roles you actually want next.</p>}
          </div>
          <div data-field="locations">
            <Label htmlFor="pref-locations">Locations</Label>
            <div className="mt-1"><TagInput id="pref-locations" value={p.locations} onChange={(v) => set("locations", v)} suggestions={LOCATION_SUGGESTIONS} placeholder="City, ST or Remote" testId="locations" max={10} invalid={Boolean(errors.locations)} describedBy={errors.locations ? "err-locations" : undefined} /></div>
            <FieldError id="err-locations" message={errors.locations} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="remotePref"><Label htmlFor="pref-remote">Remote preference</Label>
              <select id="pref-remote" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={p.remotePref} onChange={(e) => set("remotePref", e.target.value as Preferences["remotePref"])} data-testid="remote-pref">
                {REMOTE_PREF_VALUES.map((v) => <option key={v} value={v}>{REMOTE_LABELS[v]}</option>)}
              </select></div>
            <div data-field="seniority"><Label htmlFor="pref-seniority">Seniority you are targeting</Label>
              <select id="pref-seniority" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={p.seniority} onChange={(e) => set("seniority", e.target.value as Preferences["seniority"])} data-testid="seniority">
                {SENIORITY_VALUES.map((v) => <option key={v} value={v}>{SENIORITY_LABELS[v]}</option>)}
              </select></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Work authorization</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div data-field="workAuth"><Label htmlFor="pref-auth">Status</Label>
            <select id="pref-auth" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={p.workAuth} onChange={(e) => set("workAuth", e.target.value as Preferences["workAuth"])}>
              {WORK_AUTH_VALUES.map((v) => <option key={v} value={v}>{WORK_AUTH_LABELS[v]}</option>)}
            </select></div>
          <label className="flex items-center gap-3 self-end text-sm"><Switch checked={p.needsSponsorship} onCheckedChange={(v) => set("needsSponsorship", v)} data-testid="needs-sponsorship" /> I will need H-1B sponsorship</label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Compensation, industry, company size</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <div className="max-w-xs" data-field="salaryFloor"><Label htmlFor="pref-salary">Salary floor (USD / year)</Label><Input id="pref-salary" className="mt-1" type="number" min={0} step={5000} value={p.salaryFloor ?? ""} onChange={(e) => set("salaryFloor", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 120000" aria-invalid={errors.salaryFloor ? true : undefined} /><FieldError id="err-salaryFloor" message={errors.salaryFloor} /></div>
          <div data-field="industries"><Label>Industries (leave empty for any)</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INDUSTRIES.map((ind) => <label key={ind} className="flex items-center gap-2 text-sm"><Checkbox checked={p.industries.includes(ind)} onCheckedChange={() => toggle("industries", ind)} /> {ind}</label>)}
            </div><FieldError id="err-industries" message={errors.industries} /></div>
          <div data-field="companySizes"><Label>Company size (leave empty for any)</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COMPANY_SIZE_VALUES.map((v) => <label key={v} className="flex items-center gap-2 text-sm"><Checkbox checked={p.companySizes.includes(v)} onCheckedChange={() => toggle("companySizes", v)} /> {COMPANY_SIZE_LABELS[v]}</label>)}
            </div></div>
        </CardContent>
      </Card>
      <div className="flex justify-end"><Button type="submit" size="lg" disabled={pending} data-testid="save-preferences">{pending ? "Saving…" : completeOnboarding ? "Finish and see matches" : "Save preferences"}</Button></div>
    </form>
  );
}
