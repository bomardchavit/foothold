"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";
import type { ApplicationStatus } from "@prisma/client";

const STATUSES = ["SAVED", "APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED"] as const;
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function saveJobAction(jobId: string, status: ApplicationStatus = "SAVED", resumeDocumentId?: string | null): Promise<Result<{ id: string; status: ApplicationStatus }>> {
  const user = await requireUser();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return { ok: false, error: "Job not found" };
  const existing = await prisma.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId } } });
  if (existing) {
    if (existing.status === status) return { ok: true, data: { id: existing.id, status } };
    return setStatusAction(existing.id, status, resumeDocumentId);
  }
  const app = await prisma.application.create({
    data: { userId: user.id, jobId, status, resumeDocumentId: resumeDocumentId ?? null, appliedAt: status === "APPLIED" ? new Date() : null, events: { create: { toStatus: status } } },
  });
  track(user.id, EVENTS.application_status_changed, { applicationId: app.id, jobId, from: null, to: status });
  revalidatePath("/tracker"); revalidatePath(`/jobs/${jobId}`);
  return { ok: true, data: { id: app.id, status } };
}

export async function setStatusAction(applicationId: string, status: ApplicationStatus, resumeDocumentId?: string | null, note?: string): Promise<Result<{ id: string; status: ApplicationStatus }>> {
  const user = await requireUser();
  if (!(STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Bad status" };
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId: user.id } });
  if (!app) return { ok: false, error: "Not found" };
  await prisma.$transaction([
    prisma.application.update({ where: { id: app.id }, data: { status, resumeDocumentId: resumeDocumentId === undefined ? undefined : resumeDocumentId, appliedAt: status === "APPLIED" && !app.appliedAt ? new Date() : undefined } }),
    prisma.applicationEvent.create({ data: { applicationId: app.id, fromStatus: app.status, toStatus: status, note: note ?? null } }),
  ]);
  track(user.id, EVENTS.application_status_changed, { applicationId: app.id, jobId: app.jobId, from: app.status, to: status });
  revalidatePath("/tracker"); revalidatePath(`/jobs/${app.jobId}`);
  return { ok: true, data: { id: app.id, status } };
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
  await prisma.application.deleteMany({ where: { id: applicationId, userId: user.id } });
  revalidatePath("/tracker");
  return { ok: true, data: undefined };
}
