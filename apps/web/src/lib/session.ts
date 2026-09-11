import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getFullProfile, type FullProfile } from "./profile/service";

export interface SessionUser { id: string; email: string | null; name: string | null; image: string | null }

export async function currentUser(): Promise<SessionUser | null> {
  const s = await auth();
  if (!s?.user?.id) return null;
  return { id: s.user.id, email: s.user.email ?? null, name: s.user.name ?? null, image: s.user.image ?? null };
}
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}
export async function requireOnboarded(): Promise<{ user: SessionUser; profile: FullProfile }> {
  const user = await requireUser();
  const profile = await getFullProfile(user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  return { user, profile };
}
/** For route handlers: returns 401 JSON when signed out. */
export async function apiUser(): Promise<SessionUser | Response> {
  const u = await currentUser();
  return u ?? Response.json({ error: "Sign in required" }, { status: 401 });
}
