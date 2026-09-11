import { prisma } from "@/lib/db";
import { readLogo } from "@/lib/logos/resolve";

/** Company logo: stored icon fetched from the company's own site; falls back to Google's public favicon service when only the domain is known. */
export async function GET(_req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { logoKey: true, domain: true } });
  if (!c) return new Response(null, { status: 404 });
  if (c.logoKey) {
    const logo = await readLogo(c.logoKey);
    if (logo) return new Response(new Uint8Array(logo.bytes), { headers: { "Content-Type": logo.type, "Cache-Control": "public, max-age=86400" } });
  }
  if (c.domain && !/(^|\.)example\.(com|org|net)$/i.test(c.domain)) return Response.redirect(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=128`, 302);
  return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
}
