"use server";
import { revalidatePath } from "next/cache";
import { ProfileEditSchema, PreferencesSchema } from "@foothold/shared";
import { requireUser } from "@/lib/session";
import { updateProfile, updatePreferences, completeOnboarding, ensureProfile, needsRematch } from "@/lib/profile/service";
import { enqueue, runJobNow } from "@/lib/queue";
import { env } from "@/lib/env";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ProfileEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const profile = await updateProfile(user.id, parsed.data);
  if (needsRematch(profile)) await enqueue("profile.embed", { profileId: profile.id });
  revalidatePath("/onboarding"); revalidatePath("/settings/profile"); revalidatePath("/feed");
  return { ok: true };
}

export async function savePreferencesAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = PreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const profile = await updatePreferences(user.id, parsed.data);
  if (needsRematch(profile)) await enqueue("profile.embed", { profileId: profile.id });
  revalidatePath("/onboarding"); revalidatePath("/settings"); revalidatePath("/feed");
  return { ok: true };
}

export async function completeOnboardingAction(): Promise<ActionResult> {
  const user = await requireUser();
  const profile = await ensureProfile(user.id);
  if (!profile.targetRoles.length) return { ok: false, error: "Add at least one target role first." };
  const done = await completeOnboarding(user.id);
  // First matches should be waiting on the feed: compute synchronously in inline mode.
  if (env.jobsMode === "inline") await runJobNow("profile.embed", { profileId: done.id });
  else await enqueue("profile.embed", { profileId: done.id });
  revalidatePath("/feed");
  return { ok: true };
}

export async function startBlankProfileAction(): Promise<ActionResult> {
  const user = await requireUser();
  await ensureProfile(user.id);
  return { ok: true };
}
