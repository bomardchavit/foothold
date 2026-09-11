import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { createBaseResume } from "@/lib/resume/service";
export async function POST() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const doc = await createBaseResume(user.id);
  return NextResponse.json({ id: doc.id });
}
