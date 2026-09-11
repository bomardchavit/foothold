import { z } from "zod";
import { createHash } from "node:crypto";
import { normalizeCompanyName, normalizeText } from "@foothold/shared";
import { prisma } from "@/lib/db";
import { extensionUser, json, options } from "@/lib/extension/auth";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

export const OPTIONS = options;
const Body = z.object({ url: z.string().url(), title: z.string().max(200).optional(), company: z.string().max(200).optional(), ats: z.string().max(40).optional(), status: z.enum(["SAVED", "APPLIED"]).default("APPLIED"), resumeDocumentId: z.string().nullable().optional(), filled: z.number().int().optional() });

/** Records an application from the extension: matches an existing job by apply URL, or creates a MANUAL job from the page. */
export async function POST(req: Request) {
  const user = await extensionUser(req);
  if (!user) return json({ error: "Not paired" }, 401);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "Bad request" }, 400);
  const { url, title, company, ats, status } = body.data;
  // A résumé may only be recorded against an application by the user who owns it.
  const resumeDocumentId = body.data.resumeDocumentId ?? null;
  if (resumeDocumentId && (await prisma.resumeDocument.count({ where: { id: resumeDocumentId, userId: user.id } })) !== 1) return json({ error: "Résumé not found" }, 400);
  const u = new URL(url);
  const base = `${u.origin}${u.pathname}`.replace(/\/(apply|application)\/?$/, "");
  let job = await prisma.job.findFirst({ where: { OR: [{ applyUrl: { startsWith: base } }, { applyUrl: { startsWith: url.split("?")[0] } }] } });
  if (!job) {
    const source = await prisma.jobSource.upsert({ where: { kind_slug: { kind: "MANUAL", slug: "extension" } }, create: { kind: "MANUAL", slug: "extension", name: "Added from the extension", enabled: false }, update: {} });
    const companyName = company?.trim() || u.hostname.split(".").slice(-2, -1)[0] || "Unknown company";
    const normalizedName = normalizeCompanyName(companyName) || normalizeText(companyName);
    const comp = await prisma.company.upsert({ where: { normalizedName }, create: { name: companyName, normalizedName }, update: {} });
    const jobTitle = title?.trim() || "Application";
    job = await prisma.job.create({ data: { sourceId: source.id, externalId: createHash("sha1").update(base).digest("hex"), companyId: comp.id, title: jobTitle, normalizedTitle: normalizeText(jobTitle), description: `Tracked from ${ats ?? "an"} application page: ${url}`, applyUrl: url, contentHash: createHash("sha1").update(url).digest("hex"), parseStatus: "DONE", rawJson: { ats, trackedFrom: url } } });
  }
  const existing = await prisma.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId: job.id } } });
  const app = existing
    ? await prisma.application.update({ where: { id: existing.id }, data: { status, resumeDocumentId: resumeDocumentId ?? existing.resumeDocumentId, appliedAt: status === "APPLIED" && !existing.appliedAt ? new Date() : undefined, source: "EXTENSION", events: existing.status !== status ? { create: { fromStatus: existing.status, toStatus: status } } : undefined } })
    : await prisma.application.create({ data: { userId: user.id, jobId: job.id, status, resumeDocumentId, appliedAt: status === "APPLIED" ? new Date() : null, source: "EXTENSION", events: { create: { toStatus: status } } } });
  track(user.id, EVENTS.application_status_changed, { applicationId: app.id, jobId: job.id, from: existing?.status ?? null, to: status, source: "extension" });
  if (body.data.filled != null) track(user.id, EVENTS.extension_autofill_used, { ats, filled: body.data.filled });
  return json({ applicationId: app.id, jobId: job.id, status: app.status });
}
