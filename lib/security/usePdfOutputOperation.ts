"use client";

import { useLayoutEffect, useRef } from "react";
import { capturePdfResultProvenance } from "./pdfInputPreparation";

/** The same exact-file/generation guard used by Lock/Rotate, for queued outputs. */
export function usePdfOutputOperation(file: File | null, toolId: string, clearResult: () => void) {
    const currentFile = useRef(file);
    const active = useRef<AbortController | null>(null);
    useLayoutEffect(() => {
        currentFile.current = file;
        active.current?.abort();
        active.current = null;
        return () => {
            currentFile.current = null;
            active.current?.abort();
            active.current = null;
        };
    }, [file]);
    return () => {
        if (!file || currentFile.current !== file || active.current) return null;
        const controller = new AbortController();
        active.current = controller;
        clearResult();
        return {
            file,
            // Capture after processing has recorded venue and transmission history.
            provenance: () => capturePdfResultProvenance([file], toolId),
            signal: controller.signal,
            isCurrent: () => active.current === controller && currentFile.current === file && !controller.signal.aborted,
            finish: () => { if (active.current === controller) active.current = null; },
        };
    };
}
