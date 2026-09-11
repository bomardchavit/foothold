/**
 * Deterministic generated company mark: the last link of the logo chain, so a company never has an empty tile.
 * Colours use the same name-hash → hue table as the client initials tile (components/jobs/workspace/company-logo.tsx)
 * so a generated mark and the client fallback look identical.
 */
const HUES = [40, 250, 85, 330, 180, 20, 300, 140];
export const GENERATED_SUFFIX = ".gen.svg";

export function nameHash(name: string): number { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
export function markInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return letters || "•";
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 128×128 SVG: rounded tile, one accent shape in a second hue, 1–2 serif initials. Same input ⇒ same bytes. */
export function generatedMark(name: string): string {
  const h = nameHash(name);
  const hue = HUES[h % HUES.length];
  const accentHue = HUES[(h + 3) % HUES.length];
  const bg = `oklch(0.93 0.05 ${hue})`;
  const fg = `oklch(0.35 0.1 ${hue})`;
  const accentFill = `oklch(0.8 0.1 ${accentHue})`;
  const accent = (h >> 3) % 2 === 0
    ? `<rect x="86" y="-14" width="56" height="56" rx="8" transform="rotate(45 114 14)" style="fill:${accentFill}"/>`
    : `<path d="M128 0 v64 A64 64 0 0 0 64 0 Z" style="fill:${accentFill}"/>`;
  const initials = markInitials(name);
  const size = initials.length > 1 ? 52 : 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${esc(name)}">` +
    `<rect width="128" height="128" rx="24" style="fill:${bg}"/>` +
    `<clipPath id="t"><rect width="128" height="128" rx="24"/></clipPath><g clip-path="url(#t)">${accent}</g>` +
    `<text x="64" y="64" dy="0.36em" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700" style="fill:${fg}">${esc(initials)}</text>` +
    `</svg>`;
}
