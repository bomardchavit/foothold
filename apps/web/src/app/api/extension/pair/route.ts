import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, json, options } from "@/lib/extension/auth";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

export const OPTIONS = options;
export async function POST(req: Request) {
  const body = z.object({ code: z.string().min(4).max(12) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "Enter the pairing code" }, 400);
  const row = await prisma.extensionPairingCode.findUnique({ where: { code: body.data.code.trim().toUpperCase() }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return json({ error: "Code is invalid or expired. Generate a new one in Settings → Extension." }, 400);
  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.extensionToken.create({ data: { userId: row.userId, tokenHash: hashToken(token) } }),
    prisma.extensionPairingCode.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
  track(row.userId, EVENTS.extension_paired, {});
  return json({ token, email: row.user.email });
}
