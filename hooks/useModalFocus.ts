"use client";

import { useEffect, useRef } from "react";

export function useModalFocus(open: boolean, onClose: () => void, paused = false) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        ref.current?.focus();
        return () => { if (previous?.isConnected) previous.focus(); };
    }, [open]);

    useEffect(() => {
        if (!open || paused) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
            } else if (event.key === "Tab" && ref.current) {
                const controls = [...ref.current.querySelectorAll<HTMLElement>(
                    ':is(button, input, select, textarea, a[href], [tabindex]):not(:disabled):not([tabindex="-1"])',
                )].filter(element => !element.hidden && !element.closest('[hidden], [aria-hidden="true"]'));
                const first = controls[0], last = controls[controls.length - 1];
                const active = document.activeElement;
                if (!first) { event.preventDefault(); ref.current.focus(); }
                else if (event.shiftKey && (active === first || active === ref.current || !ref.current.contains(active))) {
                    event.preventDefault(); last.focus();
                } else if (!event.shiftKey && (active === last || active === ref.current || !ref.current.contains(active))) {
                    event.preventDefault(); first.focus();
                }
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [open, paused, onClose]);
    return ref;
}
