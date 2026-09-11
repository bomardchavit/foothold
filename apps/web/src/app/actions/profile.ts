"use server";
import { revalidatePath } from "next/cache";
import { ProfileEditSchema, PreferencesSchema } from "@foothold/shared";
import type { ZodError } from "zod";
import { requireUser } from "@/lib/session";
import { updateProfile, updatePreferences, completeOnboarding, ensureProfile, needsRematch } from "@/lib/profile/service";
import { enqueue, runJobNow } from "@/lib/queue";
import { env } from "@/lib/env";

/** One validation problem, addressed to a field path such as "experiences.0.startDate" so the form can highlight it. */
export interface FieldIssue { path: string; message: string }
export type ActionResult = { ok: true } | { ok: false; error: string; issues?: FieldIssue[] };

function issuesOf(err: ZodError): FieldIssue[] {
  return err.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}
const summary = (issues: FieldIssue[]) => (issues.length === 1 ? "Fix the highlighted field to continue." : `Fix the ${issues.length} highlighted fields to continue.`);

export async function saveProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ProfileEditSchema.safeParse(input);
  if (!parsed.success) { const issues = issuesOf(parsed.error); return { ok: false, error: summary(issues), issues }; }
  // A résumé without a name is unusable for autofill and exports, so the name is required even though the schema allows null.
  if (!parsed.data.fullName?.trim()) { const issues = [{ path: "fullName", message: "Enter your full name" }]; return { ok: false, error: summary(issues), issues }; }
  const profile = await updateProfile(user.id, { ...parsed.data, fullName: parsed.data.fullName.trim() });
  if (needsRematch(profile)) await enqueue("profile.embed", { profileId: profile.id });
  revalidatePath("/onboarding"); revalidatePath("/settings/profile"); revalidatePath("/feed");
  return { ok: true };
}

export async function savePreferencesAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = PreferencesSchema.safeParse(input);
  if (!parsed.success) { const issues = issuesOf(parsed.error); return { ok: false, error: summary(issues), issues }; }
  const profile = await updatePreferences(user.id, parsed.data);
  if (needsRematch(profile)) await enqueue("profile.embed", { profileId: profile.id });
  revalidatePath("/onboarding"); revalidatePath("/settings"); revalidatePath("/feed");
  return { ok: true };
}

export async function completeOnboardingAction(): Promise<ActionResult> {
  const user = await requireUser();
  const profile = await ensureProfile(user.id);
  if (!profile.targetRoles.length) return { ok: false, error: "Add at least one target role first.", issues: [{ path: "targetRoles", message: "Add at least one target role" }] };
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
