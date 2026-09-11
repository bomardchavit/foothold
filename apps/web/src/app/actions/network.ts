"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeCompanyName } from "@foothold/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";
import { draftOutreach } from "@/lib/llm/tasks/outreach";
import type { OutreachKind } from "@prisma/client";

const ContactInput = z.object({
  id: z.string().optional(), firstName: z.string().min(1).max(80), lastName: z.string().max(80).default(""), email: z.string().max(200).nullable().optional(),
  currentCompany: z.string().max(160).nullable().optional(), title: z.string().max(160).nullable().optional(), schools: z.array(z.string().max(160)).default([]),
  pastCompanies: z.array(z.string().max(160)).default([]), linkedinUrl: z.string().max(300).nullable().optional(), notes: z.string().max(2000).nullable().optional(),
});
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function saveContactAction(input: unknown): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const p = ContactInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues.map((i) => i.message).join("; ") };
  const d = p.data;
  const data = { firstName: d.firstName, lastName: d.lastName, email: d.email ?? null, currentCompany: d.currentCompany ?? null, normalizedCompany: d.currentCompany ? normalizeCompanyName(d.currentCompany) : null, title: d.title ?? null, schools: d.schools, pastCompanies: d.pastCompanies, normalizedPastCompanies: d.pastCompanies.map(normalizeCompanyName), linkedinUrl: d.linkedinUrl ?? null, notes: d.notes ?? null };
  let id = d.id;
  if (id) { const r = await prisma.contact.updateMany({ where: { id, userId: user.id }, data }); if (!r.count) id = undefined; }
  if (!id) id = (await prisma.contact.create({ data: { ...data, userId: user.id, source: "MANUAL" } })).id;
  revalidatePath("/network");
  return { ok: true, data: { id } };
}

export async function deleteContactAction(id: string): Promise<Result> {
  const user = await requireUser();
  await prisma.contact.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/network");
  return { ok: true, data: undefined };
}

export async function draftOutreachAction(contactId: string, kind: OutreachKind, jobId: string | null): Promise<Result<{ id: string; subject: string | null; body: string }>> {
  const user = await requireUser();
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: user.id } });
  if (!contact) return { ok: false, error: "Contact not found" };
  const draft = await draftOutreach(user.id, contact, kind, jobId);
  const row = await prisma.outreachDraft.create({ data: { userId: user.id, contactId, jobId, kind, subject: draft.subject, body: draft.body } });
  revalidatePath("/network");
  return { ok: true, data: { id: row.id, subject: row.subject, body: row.body } };
}

export async function markOutreachSentAction(id: string, body: string): Promise<Result> {
  const user = await requireUser();
  const row = await prisma.outreachDraft.findFirst({ where: { id, userId: user.id } });
  if (!row) return { ok: false, error: "Not found" };
  await prisma.outreachDraft.update({ where: { id }, data: { body: body.slice(0, 5000), markedSentAt: new Date() } });
  track(user.id, EVENTS.outreach_sent, { kind: row.kind, contactId: row.contactId, jobId: row.jobId });
  revalidatePath("/network");
  return { ok: true, data: undefined };
}
