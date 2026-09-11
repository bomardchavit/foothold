"use server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { JobSourceKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { runJobNow } from "@/lib/queue";
import { sendDigestToUser } from "@/lib/digest/send";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** RFC 4648 base32 alphabet: no 0/1/8-lookalike ambiguity beyond O/I, which the pairing endpoint normalises. */
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_TTL_MS = 10 * 60_000;

/** 8 base32 characters from 40 random bits (about 1.1e12 possibilities), valid for 10 minutes, single use. */
function newPairingCode(): string {
  const bytes = randomBytes(5);
  let bits = 0, acc = 0, out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { out += CODE_ALPHABET[(acc >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.slice(0, PAIRING_CODE_LENGTH);
}

export async function createPairingCodeAction(): Promise<Result<{ code: string; expiresAt: string }>> {
  const user = await requireUser();
  const code = newPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
  // One live code per user: generating a new one retires any unused earlier codes.
  await prisma.$transaction([
    prisma.extensionPairingCode.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.extensionPairingCode.create({ data: { userId: user.id, code, expiresAt } }),
  ]);
  return { ok: true, data: { code, expiresAt: expiresAt.toISOString() } };
}

export async function revokeTokenAction(id: string): Promise<Result> {
  const user = await requireUser();
  const r = await prisma.extensionToken.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!r.count) return { ok: false, error: "That extension is already unpaired." };
  revalidatePath("/settings/extension");
  return { ok: true, data: undefined };
}

export async function toggleSourceAction(id: string, enabled: boolean): Promise<Result> {
  await requireUser();
  await prisma.jobSource.update({ where: { id }, data: { enabled } });
  revalidatePath("/settings/sources");
  return { ok: true, data: undefined };
}

export async function runSourceAction(id: string): Promise<Result<{ fetched: number; inserted: number; updated: number; errors: number }>> {
  await requireUser();
  try {
    const { ingestSourceJob } = await import("@/lib/ingest/run");
    const r = await ingestSourceJob({ sourceId: id });
    revalidatePath("/settings/sources"); revalidatePath("/feed");
    return { ok: true, data: r ?? { fetched: 0, inserted: 0, updated: 0, errors: 0 } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Ingestion failed" }; }
}

export async function addSourceAction(input: { kind: JobSourceKind; slug: string; name: string }): Promise<Result> {
  await requireUser();
  const p = z.object({ kind: z.enum(["GREENHOUSE", "LEVER", "ASHBY", "ADZUNA", "USAJOBS", "CAREERS", "SMARTRECRUITERS", "WORKABLE", "WORKDAY"]), slug: z.string().min(1).max(300), name: z.string().max(100) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Enter a valid board slug" };
  await prisma.jobSource.upsert({ where: { kind_slug: { kind: p.data.kind, slug: p.data.slug.trim() } }, create: { kind: p.data.kind, slug: p.data.slug.trim(), name: p.data.name.trim() || null, enabled: true }, update: { enabled: true, name: p.data.name.trim() || undefined } });
  revalidatePath("/settings/sources");
  return { ok: true, data: undefined };
}

export async function bootstrapUsAction(limit?: number): Promise<Result<{ started: boolean }>> {
  await requireUser();
  const { after } = await import("next/server");
  const { bootstrapUsCompanies } = await import("@/lib/ingest/run");
  after(async () => { await bootstrapUsCompanies({ limit }); });
  return { ok: true, data: { started: true } };
}

export async function refreshLogosAction(): Promise<Result<{ resolved: number }>> {
  await requireUser();
  const { resolveMissingLogos } = await import("@/lib/logos/resolve");
  const resolved = await resolveMissingLogos(100);
  revalidatePath("/jobs");
  return { ok: true, data: { resolved } };
}

export async function refreshH1bAction(): Promise<Result<{ companies: number }>> {
  await requireUser();
  const { refreshAllCompanySignals } = await import("@/lib/h1b/signal");
  const n = await refreshAllCompanySignals();
  return { ok: true, data: { companies: n } };
}

export async function sendTestDigestAction(): Promise<Result<{ sent: boolean }>> {
  const user = await requireUser();
  const sent = await sendDigestToUser(user.id);
  return { ok: true, data: { sent } };
}

export async function recomputeMatchesAction(): Promise<Result> {
  const user = await requireUser();
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return { ok: false, error: "No profile" };
  await runJobNow("profile.embed", { profileId: profile.id });
  revalidatePath("/feed");
  return { ok: true, data: undefined };
}

export async function deleteAccountAction(confirmEmail: string): Promise<Result> {
  const user = await requireUser();
  if (!user.email || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) return { ok: false, error: "Type your email exactly to confirm." };
  await prisma.user.delete({ where: { id: user.id } }); // cascades: profile, uploads, documents, applications, contacts, drafts, tokens
  await signOut({ redirectTo: "/" });
  return { ok: true, data: undefined };
}
