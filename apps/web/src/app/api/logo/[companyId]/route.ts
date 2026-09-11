import { after } from "next/server";
import { prisma } from "@/lib/db";
import { readLogo, resolveCompanyLogo, isGeneratedLogo } from "@/lib/logos/resolve";
import { generatedMark } from "@/lib/logos/mark";

/**
 * Company logo. Serves the stored icon (content type sniffed from the bytes, strong ETag, week-long cache). When no logo
 * is stored yet the deterministic SVG mark is rendered inline (200, never 404 or a third-party redirect) and the resolver
 * chain is scheduled after the response, so the next request gets the stored key.
 */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, logoKey: true, logoFetchedAt: true } });
  if (!c) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  if (c.logoKey) {
    const logo = await readLogo(c.logoKey);
    if (logo) {
      const etag = `"${c.logoKey}:${c.logoFetchedAt?.getTime() ?? 0}"`;
      const cache = isGeneratedLogo(c.logoKey) ? "public, max-age=86400, stale-while-revalidate=86400" : "public, max-age=604800, stale-while-revalidate=86400, immutable";
      if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
      return new Response(new Uint8Array(logo.bytes), { headers: { "Content-Type": logo.type, "Cache-Control": cache, ETag: etag, "X-Content-Type-Options": "nosniff" } });
    }
  }
  after(async () => { await resolveCompanyLogo(companyId).catch((e) => console.warn("[logos] resolve failed", companyId, e instanceof Error ? e.message : e)); });
  return new Response(generatedMark(c.name), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
