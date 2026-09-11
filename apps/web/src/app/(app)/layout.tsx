import { requireUser } from "@/lib/session";
import { getFullProfile } from "@/lib/profile/service";
import { Sidebar } from "@/components/layout/sidebar";
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
        <div className="flex min-h-screen bg-background">
          <Sidebar user={user} onboarded={onboarded} />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="flex-1 pb-20">{children}</main>
          </div>
          {onboarded && <CopilotDock />}
        </div>
      </CopilotProvider>
    </PostHogProvider>
  );
}
