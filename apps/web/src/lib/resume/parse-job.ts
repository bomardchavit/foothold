import { prisma } from "../db";
import { getFile } from "../storage";
import { extractResumeText } from "./extract-text";
import { parseResume } from "../llm/tasks/parseResume";
import { applyParsedResume } from "../profile/service";

export async function parseResumeJob({ uploadId, userId }: { uploadId: string; userId: string }) {
  const upload = await prisma.resumeUpload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.userId !== userId) return;
  await prisma.resumeUpload.update({ where: { id: uploadId }, data: { status: "PROCESSING", error: null } });
  try {
    const buf = await getFile(upload.storageKey);
    const rawText = await extractResumeText(buf, upload.mimeType, upload.fileName);
    if (rawText.trim().length < 40) throw new Error("Could not read any text from this file. If it is a scanned image, export a text-based PDF.");
    const { parsed, mode } = await parseResume(rawText, userId);
    await applyParsedResume(userId, parsed);
    await prisma.resumeUpload.update({ where: { id: uploadId }, data: { rawText, parsedJson: { ...parsed, _mode: mode } as object, status: "DONE" } });
  } catch (e) {
    await prisma.resumeUpload.update({ where: { id: uploadId }, data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) } });
    throw e;
  }
}
