"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const HUES = [40, 250, 85, 330, 180, 20, 300, 140];
export function tileStyle(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return { background: `oklch(0.93 0.05 ${HUES[h % HUES.length]})`, color: `oklch(0.35 0.1 ${HUES[h % HUES.length]})` }; }
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/**
 * Company logo tile. Without a logo source it is the initials tile from the first server paint (no request at all).
 * With one, the image loads invisibly over the tile and is revealed only once it has decoded, so a slow or missing
 * logo never shows the browser's broken-image glyph. Size via `size` (px) or via width/height classes.
 */
export function CompanyLogo({ companyId, name, size, hasLogo = false, className }: { companyId: string; name: string; size?: number; hasLogo?: boolean; className?: string }) {
  const [state, setState] = useState<"pending" | "loaded" | "failed">("pending");
  const ref = useRef<HTMLImageElement>(null);
  // An image that finished (or failed) before hydration never fires onLoad/onError again: read its state once on mount.
  useEffect(() => { const el = ref.current; if (el?.complete && el.naturalWidth > 0) setState("loaded"); }, []);
  const loaded = hasLogo && state === "loaded";
  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg font-bold", loaded ? "border bg-white" : "", className)}
      style={{ ...(loaded ? {} : tileStyle(name)), ...(size ? { width: size, height: size, fontSize: size * 0.32 } : {}) }}
      aria-hidden
    >
      {!loaded && initials(name)}
      {hasLogo && state !== "failed" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={ref} src={`/api/logo/${companyId}`} alt="" className={cn("absolute inset-0 m-auto h-[70%] w-[70%] object-contain transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")} onLoad={() => setState("loaded")} onError={() => setState("failed")} loading="lazy" decoding="async" />
      )}
    </div>
  );
}
