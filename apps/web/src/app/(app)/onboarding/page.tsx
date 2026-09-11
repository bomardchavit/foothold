import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getFullProfile } from "@/lib/profile/service";
import { UploadStep } from "@/components/onboarding/upload-step";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { PreferencesForm } from "@/components/onboarding/preferences-form";
import { profileToEdit, profileToPreferences } from "@/lib/profile/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Set up your profile" };
const STEPS = ["upload", "review", "preferences", "done"] as const;
type Step = (typeof STEPS)[number];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const user = await requireUser();
  const profile = await getFullProfile(user.id);
  const sp = await searchParams;
  const hasResume = Boolean(profile && (profile.experiences.length || profile.skills.length || profile.educations.length));
  let step: Step = (STEPS as readonly string[]).includes(sp.step ?? "") ? (sp.step as Step) : hasResume ? "review" : "upload";
  if (step !== "upload" && !profile) step = "upload";
  if (step === "done" && !profile?.onboardingCompletedAt) step = "preferences";
  const idx = STEPS.indexOf(step);
  return (
    <div className="mx-auto max-w-4xl">
      <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Progress">
        {[["upload", "Upload résumé"], ["review", "Review profile"], ["preferences", "Preferences"], ["done", "Matches"]].map(([k, label], i) => (
          <li key={k} className={cn("flex items-center gap-2", i === idx ? "font-medium text-foreground" : i < idx ? "text-primary" : "text-muted-foreground")}>
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs", i === idx ? "border-primary bg-primary text-primary-foreground" : i < idx ? "border-primary text-primary" : "")}>{i + 1}</span>{label}
          </li>
        ))}
      </ol>
      {step === "upload" && (
        <section>
          <h1 className="text-3xl">Start with your résumé</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Upload a PDF or DOCX. We turn it into a structured profile you can edit: contact details, experience, education, projects, skills. Nothing is sent anywhere except the parser.</p>
          <div className="mt-6"><UploadStep hasExisting={hasResume} /></div>
        </section>
      )}
      {step === "review" && profile && (
        <section>
          <h1 className="text-3xl">Check what we parsed</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Fix anything the parser got wrong. Every bullet here is the source of truth for matching, the copilot, and tailored résumés.</p>
          <div className="mt-6"><ProfileEditor initial={profileToEdit(profile)} nextHref="/onboarding?step=preferences" /></div>
        </section>
      )}
      {step === "preferences" && profile && (
        <section>
          <h1 className="text-3xl">What are you looking for?</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">These drive the seniority, industry, and location parts of your fit score, and the sponsorship signal.</p>
          <div className="mt-6"><PreferencesForm initial={profileToPreferences(profile)} completeOnboarding /></div>
        </section>
      )}
      {step === "done" && (
        <section className="rounded-2xl border bg-card p-8">
          <h1 className="text-3xl">Your profile is ready</h1>
          <p className="mt-2 text-muted-foreground">We are scoring every open role against it. Your first matches should be waiting.</p>
          <div className="mt-6 flex gap-3">
            <Button asChild size="lg"><Link href="/feed" data-testid="go-to-feed">See my matches</Link></Button>
            <Button asChild variant="outline" size="lg"><Link href="/settings/profile">Edit profile</Link></Button>
          </div>
        </section>
      )}
    </div>
  );
}
