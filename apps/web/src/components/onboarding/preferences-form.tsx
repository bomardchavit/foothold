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
import { savePreferencesAction, completeOnboardingAction } from "@/app/actions/profile";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";
import { toast } from "sonner";

const ROLE_SUGGESTIONS = ["Software Engineer", "Backend Engineer", "Frontend Engineer", "Full-Stack Engineer", "Data Scientist", "Data Analyst", "Data Engineer", "Machine Learning Engineer", "Product Manager", "Product Designer", "DevOps Engineer", "Site Reliability Engineer", "Security Engineer", "iOS Engineer", "Android Engineer", "Engineering Manager", "Technical Program Manager", "UX Researcher", "Growth Marketing Manager", "Business Analyst", "Financial Analyst", "Solutions Engineer", "Customer Success Manager"];
const LOCATION_SUGGESTIONS = ["Remote", "San Francisco, CA", "New York, NY", "Seattle, WA", "Austin, TX", "Boston, MA", "Chicago, IL", "Los Angeles, CA", "Denver, CO", "Washington, DC", "Atlanta, GA"];
const REMOTE_LABELS: Record<(typeof REMOTE_PREF_VALUES)[number], string> = { REMOTE: "Remote only", HYBRID: "Hybrid", ONSITE: "On-site", ANY: "Any" };

export function PreferencesForm({ initial, completeOnboarding = false }: { initial: Preferences; completeOnboarding?: boolean }) {
  const [p, setP] = useState<Preferences>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => setP((x) => ({ ...x, [k]: v }));
  const toggle = (k: "industries" | "companySizes", v: string) => {
    const arr = p[k] as string[];
    set(k, (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]) as never);
  };
  function submit() {
    start(async () => {
      const r = await savePreferencesAction(p);
      if (!r.ok) { toast.error(r.error); return; }
      trackClient(EVENTS.onboarding_step_completed, { step: "preferences" });
      if (completeOnboarding) {
        const c = await completeOnboardingAction();
        if (!c.ok) { toast.error(c.error); return; }
        router.push("/onboarding?step=done");
      } else { toast.success("Preferences saved. Recomputing matches…"); router.refresh(); }
    });
  }
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="preferences-form">
      <Card>
        <CardHeader><CardTitle>Roles and places</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <div><Label>Target roles</Label><div className="mt-1"><TagInput value={p.targetRoles} onChange={(v) => set("targetRoles", v)} suggestions={ROLE_SUGGESTIONS} placeholder="e.g. Backend Engineer" testId="target-roles" max={10} /></div></div>
          <div><Label>Locations</Label><div className="mt-1"><TagInput value={p.locations} onChange={(v) => set("locations", v)} suggestions={LOCATION_SUGGESTIONS} placeholder="City, ST or Remote" testId="locations" max={10} /></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Remote preference</Label>
              <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={p.remotePref} onChange={(e) => set("remotePref", e.target.value as Preferences["remotePref"])} data-testid="remote-pref">
                {REMOTE_PREF_VALUES.map((v) => <option key={v} value={v}>{REMOTE_LABELS[v]}</option>)}
              </select></div>
            <div><Label>Seniority you are targeting</Label>
              <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={p.seniority} onChange={(e) => set("seniority", e.target.value as Preferences["seniority"])} data-testid="seniority">
                {SENIORITY_VALUES.map((v) => <option key={v} value={v}>{SENIORITY_LABELS[v]}</option>)}
              </select></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Work authorization</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><Label>Status</Label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={p.workAuth} onChange={(e) => set("workAuth", e.target.value as Preferences["workAuth"])}>
              {WORK_AUTH_VALUES.map((v) => <option key={v} value={v}>{WORK_AUTH_LABELS[v]}</option>)}
            </select></div>
          <label className="flex items-center gap-3 self-end text-sm"><Switch checked={p.needsSponsorship} onCheckedChange={(v) => set("needsSponsorship", v)} data-testid="needs-sponsorship" /> I will need H-1B sponsorship</label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Compensation, industry, company size</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <div className="max-w-xs"><Label>Salary floor (USD / year)</Label><Input className="mt-1" type="number" min={0} step={5000} value={p.salaryFloor ?? ""} onChange={(e) => set("salaryFloor", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 120000" /></div>
          <div><Label>Industries (leave empty for any)</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INDUSTRIES.map((ind) => <label key={ind} className="flex items-center gap-2 text-sm"><Checkbox checked={p.industries.includes(ind)} onCheckedChange={() => toggle("industries", ind)} /> {ind}</label>)}
            </div></div>
          <div><Label>Company size (leave empty for any)</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COMPANY_SIZE_VALUES.map((v) => <label key={v} className="flex items-center gap-2 text-sm"><Checkbox checked={p.companySizes.includes(v)} onCheckedChange={() => toggle("companySizes", v)} /> {COMPANY_SIZE_LABELS[v]}</label>)}
            </div></div>
        </CardContent>
      </Card>
      <div className="flex justify-end"><Button type="submit" size="lg" disabled={pending} data-testid="save-preferences">{pending ? "Saving…" : completeOnboarding ? "Finish and see matches" : "Save preferences"}</Button></div>
    </form>
  );
}
