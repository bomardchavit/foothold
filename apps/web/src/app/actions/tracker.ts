"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";
import type { ApplicationStatus } from "@prisma/client";

const Status = z.enum(["SAVED", "APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED"]);
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** A résumé can only be attached to an application by the user who owns it. */
async function ownsResume(userId: string, resumeDocumentId: string): Promise<boolean> {
  return (await prisma.resumeDocument.count({ where: { id: resumeDocumentId, userId } })) === 1;
}

export async function saveJobAction(jobId: string, status: ApplicationStatus = "SAVED", resumeDocumentId?: string | null): Promise<Result<{ id: string; status: ApplicationStatus }>> {
  const user = await requireUser();
  const s = Status.safeParse(status);
  if (!s.success) return { ok: false, error: "Bad status" };
  if (typeof resumeDocumentId === "string" && !(await ownsResume(user.id, resumeDocumentId))) return { ok: false, error: "Résumé not found" };
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return { ok: false, error: "Job not found" };
  const existing = await prisma.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId } } });
  if (existing) return setStatusAction(existing.id, s.data, resumeDocumentId);
  const app = await prisma.application.create({
    data: { userId: user.id, jobId, status: s.data, resumeDocumentId: resumeDocumentId ?? null, appliedAt: s.data === "APPLIED" ? new Date() : null, events: { create: { toStatus: s.data } } },
  });
  track(user.id, EVENTS.application_status_changed, { applicationId: app.id, jobId, from: null, to: s.data });
  revalidatePath("/tracker"); revalidatePath(`/jobs/${jobId}`);
  return { ok: true, data: { id: app.id, status: s.data } };
}

/**
 * Move an application to a status. Re-selecting the current status (or only attaching a résumé) is not a
 * status change, so it writes no timeline event and emits no analytics.
 */
export async function setStatusAction(applicationId: string, status: ApplicationStatus, resumeDocumentId?: string | null, note?: string): Promise<Result<{ id: string; status: ApplicationStatus }>> {
  const user = await requireUser();
  const s = Status.safeParse(status);
  if (!s.success) return { ok: false, error: "Bad status" };
  if (typeof resumeDocumentId === "string" && !(await ownsResume(user.id, resumeDocumentId))) return { ok: false, error: "Résumé not found" };
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId: user.id } });
  if (!app) return { ok: false, error: "Not found" };
  if (s.data === app.status) {
    if (resumeDocumentId !== undefined && resumeDocumentId !== app.resumeDocumentId) await prisma.application.update({ where: { id: app.id }, data: { resumeDocumentId } });
    revalidatePath("/tracker");
    return { ok: true, data: { id: app.id, status: app.status } };
  }
  await prisma.$transaction([
    prisma.application.update({ where: { id: app.id }, data: { status: s.data, resumeDocumentId: resumeDocumentId === undefined ? undefined : resumeDocumentId, appliedAt: s.data === "APPLIED" && !app.appliedAt ? new Date() : undefined } }),
    prisma.applicationEvent.create({ data: { applicationId: app.id, fromStatus: app.status, toStatus: s.data, note: note ?? null } }),
  ]);
  track(user.id, EVENTS.application_status_changed, { applicationId: app.id, jobId: app.jobId, from: app.status, to: s.data });
  revalidatePath("/tracker"); revalidatePath(`/jobs/${app.jobId}`);
  return { ok: true, data: { id: app.id, status: s.data } };
}

/** Record which résumé was (or will be) sent for an application. Never touches the status or the timeline. */
export async function attachResumeAction(applicationId: string, resumeDocumentId: string | null): Promise<Result<{ id: string; status: ApplicationStatus; resumeDocumentId: string | null }>> {
  const user = await requireUser();
  if (resumeDocumentId && !(await ownsResume(user.id, resumeDocumentId))) return { ok: false, error: "Résumé not found" };
  const r = await prisma.application.updateMany({ where: { id: applicationId, userId: user.id }, data: { resumeDocumentId } });
  if (!r.count) return { ok: false, error: "Not found" };
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { id: true, status: true, resumeDocumentId: true, jobId: true } });
  revalidatePath("/tracker"); revalidatePath(`/jobs/${app.jobId}`);
  return { ok: true, data: { id: app.id, status: app.status, resumeDocumentId: app.resumeDocumentId } };
}

export async function addNoteAction(applicationId: string, body: string): Promise<Result> {
  const user = await requireUser();
  const text = z.string().min(1).max(2000).safeParse(body.trim());
  if (!text.success) return { ok: false, error: "Note is empty or too long" };
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId: user.id }, select: { id: true } });
  if (!app) return { ok: false, error: "Not found" };
  await prisma.applicationNote.create({ data: { applicationId, body: text.data } });
  revalidatePath("/tracker");
  return { ok: true, data: undefined };
}

export async function deleteApplicationAction(applicationId: string): Promise<Result> {
  const user = await requireUser();
  const r = await prisma.application.deleteMany({ where: { id: applicationId, userId: user.id } });
  if (!r.count) return { ok: false, error: "This application was already removed." };
  revalidatePath("/tracker");
  return { ok: true, data: undefined };
}
