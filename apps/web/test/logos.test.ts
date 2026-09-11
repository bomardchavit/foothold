import { describe, it, expect } from "vitest";
import { sniffImage, logoContentType } from "@/lib/logos/sniff";
import { generatedMark, markInitials, nameHash, GENERATED_SUFFIX } from "@/lib/logos/mark";
import { iconLinks, isPlaceholderDomain, isGeneratedLogo } from "@/lib/logos/resolve";

function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
function jpeg(w: number, h: number): Buffer {
  // SOI, APP0 (length 16), SOF0 (length 17: precision + height + width + 3 components)
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
  const sof = Buffer.alloc(19); sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8; sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7); sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]);
}
function ico(entries: Array<[number, number]>): Buffer {
  const b = Buffer.alloc(6 + 16 * entries.length);
  b.writeUInt16LE(0, 0); b.writeUInt16LE(1, 2); b.writeUInt16LE(entries.length, 4);
  entries.forEach(([w, h], i) => { b[6 + i * 16] = w === 256 ? 0 : w; b[7 + i * 16] = h === 256 ? 0 : h; });
  return b;
}
function webpVp8x(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0); b.writeUInt32LE(22, 4); b.write("WEBP", 8); b.write("VP8X", 12); b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3);
  return b;
}

describe("image header sniffer", () => {
  it("reads PNG, JPEG, GIF, ICO and WebP dimensions from the bytes", () => {
    expect(sniffImage(png(1200, 630))).toMatchObject({ format: "png", type: "image/png", width: 1200, height: 630 });
    expect(sniffImage(jpeg(180, 180))).toMatchObject({ format: "jpg", type: "image/jpeg", width: 180, height: 180 });
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.from([64, 0, 32, 0]), Buffer.alloc(6)]);
    expect(sniffImage(gif)).toMatchObject({ format: "gif", width: 64, height: 32 });
    expect(sniffImage(ico([[16, 16], [256, 256], [32, 32]]))).toMatchObject({ format: "ico", type: "image/x-icon", width: 256, height: 256 });
    expect(sniffImage(webpVp8x(96, 96))).toMatchObject({ format: "webp", width: 96, height: 96 });
  });
  it("recognises SVG with a prolog and takes viewBox when width/height are missing", () => {
    expect(sniffImage(Buffer.from('<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle r="4"/></svg>'))).toMatchObject({ format: "svg", type: "image/svg+xml", width: 48, height: 48 });
    expect(sniffImage(Buffer.from('<svg width="120px" height="30" xmlns="http://www.w3.org/2000/svg"></svg>'))).toMatchObject({ format: "svg", width: 120, height: 30 });
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'))).toMatchObject({ format: "svg", width: null, height: null });
  });
  it("rejects non-images and names the content type from bytes, not the key", () => {
    expect(sniffImage(Buffer.from("<html><body>404</body></html>"))).toBeNull();
    expect(sniffImage(Buffer.alloc(4))).toBeNull();
    expect(logoContentType("logos/x.ico", png(99, 96))).toBe("image/png");
    expect(logoContentType("logos/x.bin", Buffer.from("not an image at all"))).toBe("application/octet-stream");
    expect(logoContentType("logos/x.svg", Buffer.from("plain text that is not svg"))).toBe("image/svg+xml");
  });
});

describe("generated company mark", () => {
  it("is deterministic and uses the same name-hash hue table as the client tile", () => {
    const a = generatedMark("Figma"), b = generatedMark("Figma");
    expect(a).toBe(b);
    expect(a.startsWith("<svg")).toBe(true);
    expect(a).toContain('viewBox="0 0 128 128"');
    const hues = [40, 250, 85, 330, 180, 20, 300, 140];
    const hue = hues[nameHash("Figma") % hues.length];
    expect(a).toContain(`oklch(0.93 0.05 ${hue})`);
    expect(a).toContain(`oklch(0.35 0.1 ${hue})`);
    expect(a).toContain(">F<");
    expect(generatedMark("Two Sigma")).toContain(">TS<");
    expect(generatedMark("Meridian Financial")).not.toBe(a);
  });
  it("escapes names and never produces empty initials", () => {
    expect(markInitials("Ben & Jerry's")).toBe("BJ");
    expect(markInitials("   ")).toBe("•");
    expect(generatedMark('A "quoted" <co>')).not.toContain('<co>');
    expect(generatedMark('A "quoted" <co>')).toContain("&lt;co&gt;");
  });
  it("knows generated keys and placeholder domains", () => {
    expect(isGeneratedLogo(`logos/abc${GENERATED_SUFFIX}`)).toBe(true);
    expect(isGeneratedLogo("logos/abc.png")).toBe(false);
    expect(isPlaceholderDomain("nimbusdata.example.com")).toBe(true);
    expect(isPlaceholderDomain(null)).toBe(true);
    expect(isPlaceholderDomain("figma.com")).toBe(false);
  });
});

describe("site icon candidates", () => {
  it("prefers apple-touch-icon, keeps sized icons, drops og:image and data: URLs", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://cdn.example.net/share-1200x630.png">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
      <link rel="apple-touch-icon" sizes="180x180" href="https://static.example.net/app/icon-180.png">
      <link rel="icon" href="/icon.svg" type="image/svg+xml">
    </head></html>`;
    const urls = iconLinks(html, new URL("https://example.net/"));
    expect(urls[0]).toBe("https://static.example.net/app/icon-180.png");
    expect(urls).toContain("https://example.net/icon.svg");
    expect(urls).toContain("https://example.net/favicon-32.png");
    expect(urls.some((u) => u.includes("share-1200x630"))).toBe(false);
    expect(urls.some((u) => u.startsWith("data:"))).toBe(false);
  });
});
