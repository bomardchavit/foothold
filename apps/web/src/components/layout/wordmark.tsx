import Link from "next/link";
import { cn } from "@/lib/utils";

export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2", className)} aria-label="Foothold home">
      <span aria-hidden className="relative inline-block h-6 w-6">
        <span className="absolute bottom-0 left-0 h-2.5 w-6 rounded-sm bg-primary" />
        <span className="absolute bottom-2.5 left-1.5 h-2.5 w-4.5 rounded-sm bg-primary/70" />
        <span className="absolute bottom-5 left-3 h-1 w-3 rounded-sm bg-primary/40" />
      </span>
      <span className="font-heading text-xl tracking-tight">Foothold</span>
    </Link>
  );
}
