"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
const ITEMS = [["/settings", "Preferences"], ["/settings/profile", "Profile"], ["/settings/extension", "Chrome extension"], ["/settings/sources", "Job sources"]];
export function SettingsNav() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b" aria-label="Settings">
      {ITEMS.map(([href, label]) => <Link key={href} href={href} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", path === href ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>)}
    </nav>
  );
}
