"use client";

import type { ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  confirmDisabled?: boolean;
  /** A failure from the last attempt, shown inline so the dialog can be retried. */
  error?: string | null;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, tone = "danger", loading = false, confirmDisabled = false, error }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title={title}>
      <div className="space-y-3 text-sm text-muted">{children}</div>
      {error && <Alert tone="error">{error}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant={tone} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>{confirmLabel}</Button>
      </ModalActions>
    </Modal>
  );
}
