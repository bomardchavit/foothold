"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Confirmation step for destructive actions (remove an application, delete a contact, revoke a token).
 * `onConfirm` may be async; the dialog stays open and disabled until it settles, then closes.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Remove", cancelLabel = "Cancel", onConfirm, testId }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void | Promise<void>; testId?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent showCloseButton={false} data-testid={testId ?? "confirm-dialog"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button type="button" variant="destructive" disabled={busy} data-testid="confirm-action" onClick={async () => { setBusy(true); try { await onConfirm(); onOpenChange(false); } finally { setBusy(false); } }}>{busy ? "Working…" : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
