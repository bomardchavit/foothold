import { prisma } from "@/lib/db";
import { extensionUser, CORS_HEADERS, json, options } from "@/lib/extension/auth";
import { contentOf, decisionsOf } from "@/lib/resume/service";
import { resolveContent } from "@/lib/resume/build";
import { renderResumePdf } from "@/lib/resume/export/pdf";

export const runtime = "nodejs";
export const OPTIONS = options;
export async function GET(req: Request) {
  const user = await extensionUser(req);
  if (!user) return json({ error: "Not paired" }, 401);
  const id = new URL(req.url).searchParams.get("doc");
  const doc = id ? await prisma.resumeDocument.findFirst({ where: { id, userId: user.id } }) : null;
  if (!doc) return json({ error: "Not found" }, 404);
  const pdf = await renderResumePdf(resolveContent(contentOf(doc), decisionsOf(doc), false));
  return new Response(new Uint8Array(pdf), { headers: { ...CORS_HEADERS, "Content-Type": "application/pdf" } });
}
