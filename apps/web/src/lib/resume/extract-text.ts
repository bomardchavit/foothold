import { getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

/** Rebuild lines from PDF glyph positions so section headers and bullets survive extraction. */
async function pdfToText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows: Array<{ y: number; items: Array<{ x: number; w: number; str: string }> }> = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const y = item.transform[5] as number;
      const x = item.transform[4] as number;
      const row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
      const entry = { x, w: item.width as number, str: item.str };
      if (row) row.items.push(entry); else rows.push({ y, items: [entry] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let cursor: number | null = null;
      for (const it of row.items) {
        if (cursor != null) {
          const gap = it.x - cursor;
          if (gap > 14) line += "   "; else if (gap > 1.5 && !line.endsWith(" ") && !it.str.startsWith(" ")) line += " ";
        }
        line += it.str;
        cursor = it.x + it.w;
      }
      out.push(line.replace(/\s+$/, ""));
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractResumeText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return pdfToText(new Uint8Array(buffer));
  if (mimeType.includes("wordprocessingml") || lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  if (mimeType.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) return buffer.toString("utf8");
  throw new Error("Unsupported file type. Upload a PDF or DOCX.");
}
