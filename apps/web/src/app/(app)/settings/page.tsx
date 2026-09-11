import { requireOnboarded } from "@/lib/session";
import { profileToPreferences } from "@/lib/profile/forms";
import { PreferencesForm } from "@/components/onboarding/preferences-form";
import { AccountPanel } from "@/components/settings/account-panel";
import { llmMode } from "@/lib/llm/client";
import { embeddingProvider } from "@/lib/embeddings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Settings are for finished profiles; a user mid-onboarding is sent back to the guided flow.
  const { user, profile } = await requireOnboarded();
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-1 text-xl">Job preferences</h2>
        <p className="mb-4 text-sm text-muted-foreground">Saving recomputes your matches.</p>
        <PreferencesForm initial={profileToPreferences(profile)} />
      </section>
      <AccountPanel email={user.email} llmMode={llmMode()} embeddings={embeddingProvider()} onboarded />
    </div>
  );
}
