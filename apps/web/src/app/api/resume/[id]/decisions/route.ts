import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/session";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const body = z.object({ decisions: z.record(z.string(), z.boolean()) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const doc = await prisma.resumeDocument.findFirst({ where: { id, userId: user.id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const diff = (doc.diffJson as Record<string, unknown> | null) ?? {};
  await prisma.resumeDocument.update({ where: { id }, data: { diffJson: { ...diff, decisions: body.data.decisions } } });
  const accepted = Object.values(body.data.decisions).filter(Boolean).length;
  track(user.id, EVENTS.tailoring_diff_accepted, { documentId: id, accepted, rejected: Object.keys(body.data.decisions).length - accepted });
  return NextResponse.json({ ok: true });
}
