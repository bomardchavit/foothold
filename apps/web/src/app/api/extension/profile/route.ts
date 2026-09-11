import { prisma } from "@/lib/db";
import { getFullProfile, toAutofillProfile } from "@/lib/profile/service";
import { extensionUser, json, options } from "@/lib/extension/auth";
import { env } from "@/lib/env";

export const OPTIONS = options;
export async function GET(req: Request) {
  const user = await extensionUser(req);
  if (!user) return json({ error: "Not paired" }, 401);
  const profile = await getFullProfile(user.id);
  if (!profile) return json({ error: "No profile yet" }, 404);
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const doc = (jobId ? await prisma.resumeDocument.findFirst({ where: { userId: user.id, jobId }, orderBy: { createdAt: "desc" } }) : null)
    ?? await prisma.resumeDocument.findFirst({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { createdAt: "desc" }] });
  const resume = doc ? { fileName: `${(profile.fullName ?? "resume").replace(/[^\w.-]+/g, "_")}.pdf`, url: `${env.appUrl}/api/extension/resume?doc=${doc.id}`, documentId: doc.id } : null;
  return json({ profile: toAutofillProfile(profile, resume), email: user.email });
}
