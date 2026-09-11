import { requireUser } from "@/lib/session";
import { getFullProfile } from "@/lib/profile/service";
import { Sidebar } from "@/components/layout/sidebar";
import { Wordmark } from "@/components/layout/wordmark";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { CopilotProvider } from "@/components/copilot/copilot-context";
import { CopilotDock } from "@/components/copilot/copilot-dock";
import { signOutAction } from "@/app/actions/auth";

const SKIP = <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background focus:shadow-lg">Skip to content</a>;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await getFullProfile(user.id);
  const onboarded = Boolean(profile?.onboardingCompletedAt);
  if (!onboarded) {
    // A brand-new account gets a focused wizard: wordmark and sign-out only, no disabled nav, promo card or copilot competing with the one action on screen.
    return (
      <PostHogProvider userId={user.id} email={user.email}>
        <CopilotProvider enabled={false}>
          <div className="min-h-screen bg-background">
            {SKIP}
            <header className="flex h-14 items-center justify-between border-b border-border/70 px-4 sm:px-6" data-testid="onboarding-shell">
              <Wordmark href="/onboarding" />
              <form action={signOutAction}><button className="focus-ring rounded-sm text-sm text-muted-strong underline-offset-2 hover:underline">Sign out</button></form>
            </header>
            <main id="main" tabIndex={-1} className="pb-20 outline-none">{children}</main>
          </div>
        </CopilotProvider>
      </PostHogProvider>
    );
  }
  return (
    <PostHogProvider userId={user.id} email={user.email}>
      <CopilotProvider enabled>
        <div className="flex min-h-screen bg-background">
          {SKIP}
          <Sidebar user={user} onboarded={onboarded} />
          {/* pt-14 clears the fixed mobile top bar; the sidebar is in-flow from lg up */}
          <div className="flex min-w-0 flex-1 flex-col pt-14 lg:pt-0">
            <main id="main" tabIndex={-1} className="flex-1 pb-20 outline-none">{children}</main>
          </div>
          <CopilotDock />
        </div>
      </CopilotProvider>
    </PostHogProvider>
  );
}
