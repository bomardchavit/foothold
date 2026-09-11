"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

const HUES = [40, 250, 85, 330, 180, 20, 300, 140];
export function tileStyle(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return { background: `oklch(0.93 0.05 ${HUES[h % HUES.length]})`, color: `oklch(0.35 0.1 ${HUES[h % HUES.length]})` }; }
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** Company logo fetched from the company's own site (or a public favicon service), with an initials tile as fallback. */
export function CompanyLogo({ companyId, name, size = 80, className }: { companyId: string; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={cn("flex shrink-0 items-center justify-center rounded-lg font-bold", className)} style={{ ...tileStyle(name), width: size, height: size, fontSize: size * 0.32 }} aria-hidden>{initials(name)}</div>;
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/logo/${companyId}`} alt="" width={size} height={size} className="h-[70%] w-[70%] object-contain" onError={() => setFailed(true)} loading="lazy" />
    </div>
  );
}
