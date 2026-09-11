import { requireUser } from "@/lib/session";
import { ensureProfile } from "@/lib/profile/service";
import { profileToPreferences } from "@/lib/profile/forms";
import { PreferencesForm } from "@/components/onboarding/preferences-form";
import { AccountPanel } from "@/components/settings/account-panel";
import { llmMode } from "@/lib/llm/client";
import { embeddingProvider } from "@/lib/embeddings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await ensureProfile(user.id);
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-1 text-xl">Job preferences</h2>
        <p className="mb-4 text-sm text-muted-foreground">Saving recomputes your matches.</p>
        <PreferencesForm initial={profileToPreferences(profile)} />
      </section>
      <AccountPanel email={user.email} llmMode={llmMode()} embeddings={embeddingProvider()} onboarded={Boolean(profile.onboardingCompletedAt)} />
    </div>
  );
}
