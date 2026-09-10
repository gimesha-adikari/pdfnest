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
    <div className="md:hidden fixed inset-0 z-[70] flex items-end bg-black/45" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="max-h-[min(76vh,680px)] w-full rounded-t-2xl border-t border-[#3b3742] bg-[#14171C] shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200" role="dialog" aria-modal="true" aria-label={`${title} context`} onMouseDown={(event) => event.stopPropagation()}>
      {/* Draggable Handle Pill */}
      <div className="flex justify-center pt-2.5 pb-1">
        <div className="w-8 h-1 bg-[#3b3742] rounded-full" />
      </div>

      {/* Sheet Header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-[#292D35]">
        <h3 className="font-mono text-xs font-semibold text-[#F5F7FA] uppercase tracking-wider">
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

      <div className="min-h-0 flex-1 overflow-hidden" data-testid="studio-mobile-category-panel">{children}</div>
      </section>
    </div>
  );
};
