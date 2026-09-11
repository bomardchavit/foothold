"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
export function Pagination({ page, pageSize, count }: { page: number; pageSize: number; count: number }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  const go = (p: number) => { const n = new URLSearchParams(sp.toString()); n.set("page", String(p)); router.push(`${path}?${n}`); };
  return (
    <div className="mt-6 flex items-center justify-center gap-3 text-sm">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</Button>
      <span className="text-muted-foreground">Page {page} of {pages}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go(page + 1)}>Next</Button>
    </div>
  );
}
