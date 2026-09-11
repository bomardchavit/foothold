import { requireOnboarded } from "@/lib/session";
import { profileToEdit } from "@/lib/profile/forms";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { UploadStep } from "@/components/onboarding/upload-step";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function SettingsProfilePage() {
  const { profile } = await requireOnboarded();
  return (
    <div className="space-y-8">
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Replace with a new résumé upload</summary>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">Replaces experience, education, projects and skills. Preferences stay.</p>
        <UploadStep hasExisting redirectTo="/settings/profile" />
      </details>
      <ProfileEditor initial={profileToEdit(profile)} />
    </div>
  );
}
