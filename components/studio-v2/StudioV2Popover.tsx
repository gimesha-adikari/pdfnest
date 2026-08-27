"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface StudioV2PopoverProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  label: string;
  width?: number;
  children: React.ReactNode;
  className?: string;
  closeOnOutsidePointerDown?: boolean;
}

interface Position {
  top: number;
  left: number;
}

function getPosition(trigger: HTMLElement, width: number): Position {
  const rect = trigger.getBoundingClientRect();
  const gap = 8;
  const margin = 12;
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const estimatedHeight = 440;
  const left = Math.min(
    Math.max(margin, rect.right - width),
    Math.max(margin, viewportWidth - width - margin),
  );
  const below = rect.bottom + gap;
  const top = below + estimatedHeight <= viewportHeight - margin
    ? below
    : Math.max(margin, rect.top - estimatedHeight - gap);
  return { top, left };
}

export function StudioV2Popover({
  open,
  onClose,
  triggerRef,
  label,
  width = 320,
  children,
  className = "",
  closeOnOutsidePointerDown = true,
}: StudioV2PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ top: 56, left: 12 });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger) setPosition(getPosition(trigger, width));
  }, [triggerRef, width]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (closeOnOutsidePointerDown && !popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const focusTarget = popoverRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    focusTarget?.focus();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, onClose, triggerRef, updatePosition, closeOnOutsidePointerDown]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={label}
      style={{ top: position.top, left: position.left, width }}
      className={`fixed z-[70] max-h-[calc(100vh-24px)] overflow-y-auto rounded-lg border border-[var(--studio-border-active)] bg-[var(--studio-surface)] p-3 text-[var(--studio-text)] shadow-2xl outline-none ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
