/**
 * Image header sniffer: format + pixel size from the first bytes, independent of the Content-Type header
 * (CDNs serve PNG bytes as image/x-icon and share banners as icons). Pure; unit-tested in test/logos.test.ts.
 */
export type ImageFormat = "png" | "jpg" | "gif" | "webp" | "ico" | "svg";
export interface ImageInfo { format: ImageFormat; type: string; ext: string; width: number | null; height: number | null }

export const IMAGE_TYPES: Record<ImageFormat, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", svg: "image/svg+xml" };
const info = (format: ImageFormat, width: number | null, height: number | null): ImageInfo => ({ format, type: IMAGE_TYPES[format], ext: format, width, height });

function jpegSize(b: Buffer): [number, number] | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

function webpSize(b: Buffer): [number, number] | null {
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8X" && b.length >= 30) return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8 " && b.length >= 30) return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L" && b.length >= 25) { const bits = b.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]; }
  return null;
}

function icoSize(b: Buffer): [number, number] | null {
  const count = b.readUInt16LE(4);
  let best: [number, number] | null = null;
  for (let n = 0; n < count && 6 + n * 16 + 16 <= b.length; n++) {
    const off = 6 + n * 16;
    const w = b[off] || 256, h = b[off + 1] || 256;
    if (!best || w * h > best[0] * best[1]) best = [w, h];
  }
  return best;
}

function svgSize(text: string): [number | null, number | null] {
  const open = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const dim = (attr: string): number | null => {
    const v = new RegExp(`\\b${attr}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, "i").exec(open)?.[1];
    return v ? Number(v) || null : null;
  };
  const w = dim("width"), h = dim("height");
  if (w && h) return [w, h];
  const vb = /\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(open);
  if (vb) return [Number(vb[1]) || null, Number(vb[2]) || null];
  return [w, h];
}

export function sniffImage(buf: Buffer | Uint8Array): ImageInfo | null {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return b.length >= 24 ? info("png", b.readUInt32BE(16), b.readUInt32BE(20)) : info("png", null, null);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) { const s = jpegSize(b); return info("jpg", s?.[0] ?? null, s?.[1] ?? null); }
  if (b.toString("latin1", 0, 6) === "GIF87a" || b.toString("latin1", 0, 6) === "GIF89a") return info("gif", b.readUInt16LE(6), b.readUInt16LE(8));
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") { const s = webpSize(b); return info("webp", s?.[0] ?? null, s?.[1] ?? null); }
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && b.readUInt16LE(4) > 0) { const s = icoSize(b); return info("ico", s?.[0] ?? null, s?.[1] ?? null); }
  const head = b.toString("utf8", 0, Math.min(b.length, 2048)).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg\b/i.test(head)) { const [w, h] = svgSize(head); return info("svg", w, h); }
  return null;
}

/** Content type for a stored logo: sniffed from the bytes, with the key's extension only as a fallback. */
export function logoContentType(key: string, bytes: Buffer): string {
  const sniffed = sniffImage(bytes)?.type;
  if (sniffed) return sniffed;
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return (IMAGE_TYPES as Record<string, string>)[ext] ?? (ext === "jpeg" ? IMAGE_TYPES.jpg : "application/octet-stream");
}
