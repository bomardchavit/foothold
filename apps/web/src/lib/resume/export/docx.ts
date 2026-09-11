import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { ResumeContent } from "@foothold/shared";

const RIGHT = 9000;
function heading(text: string) { return new Paragraph({ text: text.toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 }, border: { bottom: { style: "single", size: 6, color: "111111", space: 1 } } }); }
function rowLR(left: string, right: string, bold = true) {
  return new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { before: 100 }, children: [new TextRun({ text: left, bold }), new TextRun({ text: `\t${right}` })] });
}
const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 20 } });

/** ATS-safe DOCX: single column, real text, bullet paragraphs, no tables or text boxes. */
export async function renderResumeDocx(c: ResumeContent): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: c.header.fullName, bold: true, size: 36 })], alignment: AlignmentType.LEFT }),
    new Paragraph({ text: [c.header.email, c.header.phone, c.header.location, ...c.header.links].filter(Boolean).join("  |  "), spacing: { after: 120 } }),
  ];
  if (c.headline) children.push(new Paragraph({ children: [new TextRun({ text: c.headline, bold: true })] }));
  if (c.summary) children.push(heading("Summary"), new Paragraph({ text: c.summary }));
  if (c.experience.length) children.push(heading("Experience"));
  for (const e of c.experience) {
    children.push(rowLR(`${e.title}, ${e.company}`, e.dateRange));
    if (e.location) children.push(new Paragraph({ text: e.location }));
    for (const b of e.bullets) children.push(bullet(b.text));
  }
  if (c.projects.length) children.push(heading("Projects"));
  for (const p of c.projects) {
    children.push(rowLR(p.name, p.url ?? ""));
    if (p.description) children.push(new Paragraph({ text: p.description }));
    for (const b of p.bullets) children.push(bullet(b.text));
  }
  if (c.education.length) children.push(heading("Education"));
  for (const e of c.education) children.push(rowLR(`${e.school}${e.degree || e.field ? ` — ${[e.degree, e.field].filter(Boolean).join(", ")}` : ""}${e.gpa ? ` (GPA ${e.gpa})` : ""}`, e.dateRange, false));
  if (c.skills.length) children.push(heading("Skills"), new Paragraph({ text: c.skills.map((k) => k.name).join(", ") }));
  const doc = new Document({ styles: { default: { document: { run: { font: "Calibri", size: 21 } } } }, sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
