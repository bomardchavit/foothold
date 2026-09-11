import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, json, options } from "@/lib/extension/auth";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

export const OPTIONS = options;

/**
 * This endpoint is unauthenticated by design (the extension has no session yet), so guessing is throttled
 * per client address: 10 attempts per 10 minutes. Codes are 8 base32 characters (about 1.1e12 possibilities),
 * expire after 10 minutes and are single use.
 */
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") ?? "unknown").trim();
}
function throttled(key: string): boolean {
  const now = Date.now();
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
  const row = attempts.get(key);
  if (!row || row.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  row.count++;
  return row.count > MAX_ATTEMPTS;
}
/** Users type codes by hand: accept lowercase, spaces and dashes, and the usual O/0 and I/1 mix-ups. */
const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "").replace(/0/g, "O").replace(/1/g, "I");

export async function POST(req: Request) {
  const key = clientKey(req);
  if (throttled(key)) return json({ error: "Too many attempts. Wait a few minutes, then generate a fresh code in Settings → Chrome extension." }, 429);
  const body = z.object({ code: z.string().min(4).max(16) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "Enter the pairing code" }, 400);
  const row = await prisma.extensionPairingCode.findUnique({ where: { code: normalizeCode(body.data.code) }, include: { user: { select: { id: true, email: true } } } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return json({ error: "Code is invalid or expired. Generate a new one in Settings → Chrome extension." }, 400);
  const token = randomBytes(32).toString("hex");
  // Mark the code used first: a concurrent request with the same code loses the race instead of minting a second token.
  const claimed = await prisma.extensionPairingCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) return json({ error: "Code is invalid or expired. Generate a new one in Settings → Chrome extension." }, 400);
  await prisma.extensionToken.create({ data: { userId: row.userId, tokenHash: hashToken(token) } });
  attempts.delete(key);
  track(row.userId, EVENTS.extension_paired, {});
  return json({ token, email: row.user.email });
}
