"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface StudioV2DialogProps {
  open: boolean;
  title: string;
  labelledBy?: string;
  onClose: () => void;
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLButtonElement | null>;
}

export const StudioV2Dialog: React.FC<StudioV2DialogProps> = ({
  open,
  title,
  labelledBy,
  onClose,
  children,
  initialFocusRef,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = labelledBy ?? `studio-dialog-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTarget = initialFocusRef?.current;
    (focusTarget ?? dialogRef.current?.querySelector<HTMLElement>("button, [href], input, textarea, select"))?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [initialFocusRef, onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-xl border border-[var(--studio-border)] bg-[#14171C] p-5 text-[#F5F7FA] shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#9AA1AD] hover:bg-[#20242B] hover:text-white" aria-label={`Close ${title}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

interface StudioV2ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  destructive?: boolean;
  error?: string | null;
}

export const StudioV2ConfirmDialog: React.FC<StudioV2ConfirmDialogProps> = ({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmDisabled = false,
  cancelDisabled = false,
  destructive = false,
  error = null,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <StudioV2Dialog open={open} title={title} onClose={onCancel} initialFocusRef={cancelRef}>
      <p className="mt-3 text-xs leading-5 text-[#B7BDC8]">{description}</p>
      {error && <p role="alert" className="mt-3 rounded border border-red-800/70 bg-red-950/30 p-2 text-xs text-red-200">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={cancelDisabled} className="rounded border border-[var(--studio-border)] px-3 py-2 text-xs text-[#D8DCE3] hover:bg-[#20242B] disabled:cursor-not-allowed disabled:opacity-50">{cancelLabel}</button>
        <button type="button" onClick={onConfirm} disabled={confirmDisabled} className={`rounded px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${destructive ? "bg-red-700 hover:bg-red-600" : "studio-v2-primary"}`}>{confirmLabel}</button>
      </div>
    </StudioV2Dialog>
  );
};
