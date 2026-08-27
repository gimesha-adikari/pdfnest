"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getStudioV2PopoverPosition, StudioV2PopoverPosition } from "./studioV2PopoverPosition";

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
  const [position, setPosition] = useState<StudioV2PopoverPosition | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = popoverRef.current?.getBoundingClientRect().height ?? 0;
    setPosition(getStudioV2PopoverPosition({
      triggerRect: rect,
      popoverWidth: width,
      popoverHeight: panelHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
  }, [triggerRef, width]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (closeOnOutsidePointerDown && !popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        onClose();
        triggerRef.current?.focus();
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
    const resizeObserver = typeof ResizeObserver === "undefined" || !popoverRef.current
      ? null
      : new ResizeObserver(updatePosition);
    resizeObserver?.observe(popoverRef.current as HTMLDivElement);

    const focusTarget = popoverRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    focusTarget?.focus();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
    };
  }, [open, onClose, triggerRef, updatePosition, closeOnOutsidePointerDown]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={label}
      style={{
        position: "fixed",
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: position?.width ?? width,
        visibility: position ? "visible" : "hidden",
      }}
      className={`fixed z-[70] max-h-[calc(100vh-24px)] overflow-y-auto rounded-lg border border-[var(--studio-border-active)] bg-[var(--studio-surface)] p-3 text-[var(--studio-text)] shadow-2xl outline-none ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
