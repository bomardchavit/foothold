import { createHash } from "node:crypto";
import { prisma } from "../db";

export const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function extensionUser(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const row = await prisma.extensionToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, email: true } } } });
  if (!row || row.revokedAt) return null;
  await prisma.extensionToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return row.user;
}
export const options = () => new Response(null, { status: 204, headers: CORS_HEADERS });
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS_HEADERS });
