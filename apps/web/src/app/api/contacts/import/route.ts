import { NextResponse } from "next/server";
import Papa from "papaparse";
import { normalizeCompanyName } from "@foothold/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/session";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;
const CHUNK = 500;
const EXPECTED = "Expected columns First Name, Last Name, Company, Position (a LinkedIn Connections.csv export).";

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const clean = (v: string | undefined) => (v ?? "").trim();
type Row = Omit<Prisma.ContactUncheckedCreateInput, "userId" | "source">;

/**
 * LinkedIn "Connections.csv" export (First Name, Last Name, URL, Email Address, Company, Position, Connected On)
 * or any CSV with similar headers. Existing contacts are loaded once and matched in memory; inserts go in
 * batches, and only rows whose data actually changed are updated, so a 20k-row export is a handful of queries.
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is larger than 10 MB. Export only your connections from LinkedIn and try again." }, { status: 413 });
  let text = await file.text();
  // LinkedIn prefixes the file with a "Notes:" preamble; skip to the header row.
  const idx = text.search(/^"?First Name"?,/m);
  if (idx > 0) text = text.slice(idx);
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: key });
  const headers = parsed.meta.fields ?? [];
  if (!headers.some((h) => ["firstname", "first", "lastname", "last", "name"].includes(h))) return NextResponse.json({ error: `No name column found. ${EXPECTED}` }, { status: 400 });
  if (parsed.data.length > MAX_ROWS) return NextResponse.json({ error: `That file has more than ${MAX_ROWS.toLocaleString()} rows. Split it and import the parts one at a time.` }, { status: 413 });

  const rows = new Map<string, Row>();
  let skipped = 0;
  for (const r of parsed.data) {
    let firstName = clean(r.firstname ?? r.first);
    let lastName = clean(r.lastname ?? r.last);
    if (!firstName && !lastName && r.name) { const parts = clean(r.name).split(/\s+/); firstName = parts[0] ?? ""; lastName = parts.slice(1).join(" "); }
    if (!firstName && !lastName) { skipped++; continue; }
    const company = clean(r.company ?? r.currentcompany ?? r.organization) || null;
    const connectedOn = r.connectedon ? new Date(r.connectedon) : null;
    const row: Row = {
      firstName: firstName || "?", lastName, email: clean(r.emailaddress ?? r.email) || null, currentCompany: company, normalizedCompany: company ? normalizeCompanyName(company) : null,
      title: clean(r.position ?? r.title) || null, linkedinUrl: clean(r.url ?? r.linkedin) || null, connectedOn: connectedOn && !isNaN(connectedOn.getTime()) ? connectedOn : null,
    };
    rows.set(matchKey(row), row); // the same person twice in one file counts once
  }

  const existing = await prisma.contact.findMany({ where: { userId: user.id }, select: { id: true, firstName: true, lastName: true, email: true, currentCompany: true, title: true, linkedinUrl: true, connectedOn: true } });
  const byUrl = new Map<string, (typeof existing)[number]>();
  const byName = new Map<string, (typeof existing)[number]>();
  for (const c of existing) {
    if (c.linkedinUrl) byUrl.set(c.linkedinUrl.toLowerCase(), c);
    byName.set(nameKey(c.firstName, c.lastName, c.currentCompany), c);
  }

  const creates: Prisma.ContactCreateManyInput[] = [];
  const updates: Array<{ id: string; data: Row }> = [];
  let unchanged = 0;
  for (const row of rows.values()) {
    const hit = (row.linkedinUrl && byUrl.get(row.linkedinUrl.toLowerCase())) || byName.get(nameKey(row.firstName, row.lastName, row.currentCompany ?? null));
    if (!hit) { creates.push({ ...row, userId: user.id, source: "LINKEDIN_CSV" }); continue; }
    const same = hit.email === row.email && hit.currentCompany === row.currentCompany && hit.title === row.title && hit.linkedinUrl === row.linkedinUrl && (hit.connectedOn?.getTime() ?? null) === (row.connectedOn instanceof Date ? row.connectedOn.getTime() : null) && hit.firstName === row.firstName && hit.lastName === row.lastName;
    if (same) unchanged++; else updates.push({ id: hit.id, data: row });
  }
  for (let i = 0; i < creates.length; i += CHUNK) await prisma.contact.createMany({ data: creates.slice(i, i + CHUNK), skipDuplicates: true });
  for (let i = 0; i < updates.length; i += CHUNK) await prisma.$transaction(updates.slice(i, i + CHUNK).map((u) => prisma.contact.update({ where: { id: u.id }, data: { ...u.data, source: "LINKEDIN_CSV" } })));

  track(user.id, EVENTS.contacts_imported, { inserted: creates.length, updated: updates.length });
  return NextResponse.json({ inserted: creates.length, updated: updates.length, unchanged, skipped, total: parsed.data.length });
}

const nameKey = (first: string, last: string, company: string | null) => `${first}|${last}|${company ?? ""}`.toLowerCase();
const matchKey = (r: Row) => (r.linkedinUrl ? `url:${r.linkedinUrl.toLowerCase()}` : `name:${nameKey(r.firstName, r.lastName, r.currentCompany ?? null)}`);
