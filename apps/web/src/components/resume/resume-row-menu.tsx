"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/providers/confirm-dialog";
import { renameResumeAction, duplicateResumeAction, deleteResumeAction, deleteOlderVersionsAction } from "@/app/actions/resume";
import { toast } from "sonner";

/** Rename / Duplicate / Delete for one résumé row; "Delete older versions" appears when the job has several. */
export function ResumeRowMenu({ id, title, olderVersions, afterDelete }: { id: string; title: string; olderVersions: number; afterDelete?: () => void }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);
  const [confirm, setConfirm] = useState<"delete" | "older" | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} data-testid="resume-menu"><Ellipsis /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setName(title); setRenaming(true); }}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => start(async () => { const r = await duplicateResumeAction(id); if (r.ok) { toast.success("Copy created"); router.refresh(); } else toast.error(r.error); })}>Duplicate</DropdownMenuItem>
          {olderVersions > 0 && <DropdownMenuItem onSelect={() => setConfirm("older")}>Delete {olderVersions} older version{olderVersions === 1 ? "" : "s"}</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")} data-testid="resume-delete">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename résumé</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await renameResumeAction(id, name); if (r.ok) { setRenaming(false); toast.success("Renamed"); router.refresh(); } else toast.error(r.error); }); }}>
            <Label htmlFor={`rename-${id}`}>Name</Label>
            <Input id={`rename-${id}`} className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus data-testid="rename-input" />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !name.trim()}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm === "delete"} onOpenChange={(o) => !o && setConfirm(null)} title="Delete this résumé?"
        description={`“${title}” is removed. Applications that used it keep their status but lose the attachment. This cannot be undone.`} confirmLabel="Delete"
        onConfirm={async () => { const r = await deleteResumeAction(id); if (!r.ok) { toast.error(r.error); return; } toast.success("Résumé deleted"); afterDelete ? afterDelete() : router.refresh(); }}
      />
      <ConfirmDialog
        open={confirm === "older"} onOpenChange={(o) => !o && setConfirm(null)} title={`Delete ${olderVersions} older version${olderVersions === 1 ? "" : "s"}?`}
        description="Only the newest version for this role is kept. Applications attached to an older version are moved to it." confirmLabel="Delete older versions"
        onConfirm={async () => { const r = await deleteOlderVersionsAction(id); if (!r.ok) { toast.error(r.error); return; } toast.success(`Deleted ${r.data.deleted} older version${r.data.deleted === 1 ? "" : "s"}`); router.refresh(); }}
      />
    </>
  );
}
