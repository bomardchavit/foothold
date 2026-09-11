"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function hideJobAction(jobId: string, hide: boolean): Promise<Result> {
  const user = await requireUser();
  if (hide) await prisma.hiddenJob.upsert({ where: { userId_jobId: { userId: user.id, jobId } }, create: { userId: user.id, jobId }, update: {} });
  else await prisma.hiddenJob.deleteMany({ where: { userId: user.id, jobId } });
  revalidatePath("/jobs");
  return { ok: true, data: undefined };
}

export async function likeJobAction(jobId: string, like: boolean): Promise<Result<{ status: string | null }>> {
  const user = await requireUser();
  const existing = await prisma.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId } } });
  if (like) {
    if (existing) return { ok: true, data: { status: existing.status } };
    const app = await prisma.application.create({ data: { userId: user.id, jobId, status: "SAVED", events: { create: { toStatus: "SAVED" } } } });
    track(user.id, EVENTS.application_status_changed, { applicationId: app.id, jobId, from: null, to: "SAVED" });
  } else if (existing && existing.status === "SAVED") {
    await prisma.application.delete({ where: { id: existing.id } });
  } else if (existing) {
    return { ok: false, error: `This job is already ${existing.status.toLowerCase()} in your tracker.` };
  }
  revalidatePath("/jobs"); revalidatePath("/tracker");
  return { ok: true, data: { status: like ? "SAVED" : null } };
}

const Params = z.record(z.string(), z.string());
export async function saveFilterAction(name: string, params: Record<string, string>): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const n = name.trim().slice(0, 60);
  if (!n) return { ok: false, error: "Give the filter a name" };
  const p = Params.safeParse(params);
  if (!p.success) return { ok: false, error: "Bad filter" };
  const count = await prisma.savedFilter.count({ where: { userId: user.id } });
  const row = await prisma.savedFilter.create({ data: { userId: user.id, name: n, paramsJson: p.data, order: count } });
  revalidatePath("/jobs");
  return { ok: true, data: { id: row.id } };
}
export async function renameFilterAction(id: string, name: string): Promise<Result> {
  const user = await requireUser();
  await prisma.savedFilter.updateMany({ where: { id, userId: user.id }, data: { name: name.trim().slice(0, 60) || "Untitled" } });
  revalidatePath("/jobs");
  return { ok: true, data: undefined };
}
export async function deleteFilterAction(id: string): Promise<Result> {
  const user = await requireUser();
  await prisma.savedFilter.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/jobs");
  return { ok: true, data: undefined };
}
