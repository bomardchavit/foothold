import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/session";
import { putFile } from "@/lib/storage";
import { enqueue } from "@/lib/queue";

export const runtime = "nodejs";
const MAX = 8 * 1024 * 1024;
const OK_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown"]);

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "File is larger than 8 MB" }, { status: 413 });
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const type = file.type || (ext === "pdf" ? "application/pdf" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === "txt" ? "text/plain" : "");
  if (!OK_TYPES.has(type) && !["pdf", "docx", "txt", "md"].includes(ext)) return NextResponse.json({ error: "Upload a PDF, DOCX, or TXT file" }, { status: 415 });
  const buf = Buffer.from(await file.arrayBuffer());
  const upload = await prisma.resumeUpload.create({ data: { userId: user.id, fileName: file.name, mimeType: type || "application/octet-stream", storageKey: "pending" } });
  const key = `resumes/${user.id}/${upload.id}.${ext || "bin"}`;
  await putFile(key, buf);
  await prisma.resumeUpload.update({ where: { id: upload.id }, data: { storageKey: key } });
  await enqueue("resume.parse", { uploadId: upload.id, userId: user.id });
  return NextResponse.json({ id: upload.id, status: "PENDING" });
}

export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const uploads = await prisma.resumeUpload.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, fileName: true, status: true, createdAt: true, error: true } });
  return NextResponse.json({ uploads });
}
