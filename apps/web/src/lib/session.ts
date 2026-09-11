import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getFullProfile, type FullProfile } from "./profile/service";

export interface SessionUser { id: string; email: string | null; name: string | null; image: string | null }

/** Per-request memo: the app layout and every page ask for the same user, so decode the session once. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const s = await auth();
  if (!s?.user?.id) return null;
  return { id: s.user.id, email: s.user.email ?? null, name: s.user.name ?? null, image: s.user.image ?? null };
});

/**
 * Per-request memo around getFullProfile (five joined queries). The layout and the page share one result;
 * server actions run in their own request, so a mutation never sees a stale copy.
 */
export const sessionProfile = cache(async (userId: string): Promise<FullProfile | null> => getFullProfile(userId));

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}
export async function requireOnboarded(): Promise<{ user: SessionUser; profile: FullProfile }> {
  const user = await requireUser();
  const profile = await sessionProfile(user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  return { user, profile };
}
/** For route handlers: returns 401 JSON when signed out. */
export async function apiUser(): Promise<SessionUser | Response> {
  const u = await currentUser();
  return u ?? Response.json({ error: "Sign in required" }, { status: 401 });
}
