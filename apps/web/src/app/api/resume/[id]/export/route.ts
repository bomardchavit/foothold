import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/session";
import { contentOf, decisionsOf } from "@/lib/resume/service";
import { resolveContent } from "@/lib/resume/build";
import { renderResumePdf } from "@/lib/resume/export/pdf";
import { renderResumeDocx } from "@/lib/resume/export/docx";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const groundedOnly = url.searchParams.get("grounded") === "1";
  const doc = await prisma.resumeDocument.findFirst({ where: { id, userId: user.id }, include: { job: { include: { company: true } } } });
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
  const content = resolveContent(contentOf(doc), decisionsOf(doc), groundedOnly);
  const buf = format === "pdf" ? await renderResumePdf(content) : await renderResumeDocx(content);
  const safe = (content.header.fullName || "resume").replace(/[^\w.-]+/g, "_");
  const suffix = doc.job ? `_${doc.job.company.name.replace(/[^\w.-]+/g, "_")}` : "";
  await prisma.resumeDocument.update({ where: { id }, data: { exportedAt: new Date() } });
  track(user.id, EVENTS.resume_exported, { documentId: id, kind: doc.kind.toLowerCase(), format, groundedOnly });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe}${suffix}.${format}"`,
    },
  });
}
