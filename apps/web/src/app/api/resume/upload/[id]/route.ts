import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const u = await prisma.resumeUpload.findFirst({ where: { id, userId: user.id }, select: { id: true, fileName: true, status: true, error: true, parsedJson: true, createdAt: true } });
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = u.parsedJson as (Record<string, unknown> & { _mode?: string }) | null;
  return NextResponse.json({ id: u.id, fileName: u.fileName, status: u.status, error: u.error, mode: parsed?._mode ?? null, summary: parsed ? { experience: (parsed.experience as unknown[])?.length ?? 0, education: (parsed.education as unknown[])?.length ?? 0, skills: (parsed.skills as unknown[])?.length ?? 0 } : null });
}
