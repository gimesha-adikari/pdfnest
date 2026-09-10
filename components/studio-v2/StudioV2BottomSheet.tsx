"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface StudioV2BottomSheetProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const StudioV2BottomSheet: React.FC<StudioV2BottomSheetProps> = ({
  isOpen,
  title,
  onClose,
  children,
}) => {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [])]
          .filter((element) => !element.hidden && element.getClientRects().length > 0);
        if (focusable.length === 0) return;
        const current = document.activeElement as HTMLElement | null;
        const index = focusable.indexOf(current as HTMLElement);
        if (event.shiftKey && (index <= 0 || !current)) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!event.shiftKey && index === focusable.length - 1) {
          event.preventDefault();
          focusable[0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="studio-v2-sheet-layer" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="studio-v2-sheet" role="dialog" aria-modal="true" aria-label={`${title} context`} onMouseDown={(event) => event.stopPropagation()}>
      {/* Draggable Handle Pill */}
      <div className="studio-v2-sheet-handle">
        <div />
      </div>

      {/* Sheet Header */}
      <div className="studio-v2-sheet-header">
        <h3>
          {title}
        </h3>
        <button
          onClick={onClose}
          className="text-[#9AA1AD] hover:text-white p-1 rounded"
          aria-label="Close bottom sheet"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="studio-v2-sheet-body" data-testid="studio-mobile-category-panel">{children}</div>
      </section>
    </div>
  );
};
