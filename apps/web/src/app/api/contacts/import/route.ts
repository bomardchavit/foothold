import { NextResponse } from "next/server";
import Papa from "papaparse";
import { normalizeCompanyName } from "@foothold/shared";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/session";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** LinkedIn "Connections.csv" export (First Name, Last Name, URL, Email Address, Company, Position, Connected On) or any CSV with similar headers. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  let text = await file.text();
  // LinkedIn prefixes the file with a "Notes:" preamble; skip to the header row.
  const idx = text.search(/^"?First Name"?,/m);
  if (idx > 0) text = text.slice(idx);
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: key });
  let inserted = 0, updated = 0;
  for (const r of parsed.data) {
    const firstName = (r.firstname ?? r.first ?? "").trim();
    const lastName = (r.lastname ?? r.last ?? "").trim();
    if (!firstName && !lastName) continue;
    const company = (r.company ?? r.currentcompany ?? r.organization ?? "").trim() || null;
    const data = { firstName: firstName || "?", lastName, email: (r.emailaddress ?? r.email ?? "").trim() || null, currentCompany: company, normalizedCompany: company ? normalizeCompanyName(company) : null, title: (r.position ?? r.title ?? "").trim() || null, linkedinUrl: (r.url ?? r.linkedin ?? "").trim() || null, connectedOn: r.connectedon ? new Date(r.connectedon) : null };
    if (data.connectedOn && isNaN(data.connectedOn.getTime())) data.connectedOn = null;
    const existing = await prisma.contact.findFirst({ where: { userId: user.id, firstName: data.firstName, lastName: data.lastName, OR: [{ linkedinUrl: data.linkedinUrl ?? "__none__" }, { currentCompany: company }] } });
    if (existing) { await prisma.contact.update({ where: { id: existing.id }, data: { ...data, source: "LINKEDIN_CSV" } }); updated++; }
    else { await prisma.contact.create({ data: { ...data, userId: user.id, source: "LINKEDIN_CSV" } }); inserted++; }
  }
  track(user.id, EVENTS.contacts_imported, { inserted, updated });
  return NextResponse.json({ inserted, updated, total: parsed.data.length });
}
