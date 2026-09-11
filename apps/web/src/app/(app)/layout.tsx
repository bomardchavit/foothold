import { requireUser } from "@/lib/session";
import { getFullProfile } from "@/lib/profile/service";
import { TopNav } from "@/components/layout/top-nav";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { CopilotProvider } from "@/components/copilot/copilot-context";
import { CopilotDock } from "@/components/copilot/copilot-dock";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await getFullProfile(user.id);
  const onboarded = Boolean(profile?.onboardingCompletedAt);
  return (
    <PostHogProvider userId={user.id} email={user.email}>
      <CopilotProvider enabled={onboarded}>
        <div className="flex min-h-screen flex-col">
          <TopNav user={user} onboarded={onboarded} />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 sm:px-6">{children}</main>
          {onboarded && <CopilotDock />}
        </div>
      </CopilotProvider>
    </PostHogProvider>
  );
}
