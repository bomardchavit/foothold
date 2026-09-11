import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { createTailoredResume } from "@/lib/resume/service";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const body = z.object({ jobId: z.string() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  try {
    const doc = await createTailoredResume(user.id, body.data.jobId);
    return NextResponse.json({ id: doc.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Tailoring failed" }, { status: 500 });
  }
}
