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
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background focus:shadow-lg">Skip to content</a>
          <Sidebar user={user} onboarded={onboarded} />
          {/* pt-14 clears the fixed mobile top bar; the sidebar is in-flow from lg up */}
          <div className="flex min-w-0 flex-1 flex-col pt-14 lg:pt-0">
            <main id="main" tabIndex={-1} className="flex-1 pb-20 outline-none">{children}</main>
          </div>
          {onboarded && <CopilotDock />}
        </div>
      </CopilotProvider>
    </PostHogProvider>
  );
}
