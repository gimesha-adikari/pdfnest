"use client";

import { useCallback, useEffect, useState } from "react";

export interface StudioPage {
    id: string;
    pageNumber: number;
}

interface DocumentSnapshot {
    file: File;
    pages: StudioPage[];
    currentPageIndex: number;
    fingerprint: string;
}

const MAX_HISTORY = 50;

function clonePages(pages: StudioPage[]): StudioPage[] {
    return pages.map((page) => ({ ...page }));
}

function getSnapshotFingerprint(
    file: File,
    pages: StudioPage[],
    currentPageIndex: number
) {
    return [
        file.name,
        file.size,
        file.lastModified,
        pages.length,
        currentPageIndex,
    ].join("|");
}

function appendSnapshot(
    stack: DocumentSnapshot[],
    snapshot: DocumentSnapshot
): DocumentSnapshot[] {
    const last = stack[stack.length - 1];

    if (last?.fingerprint === snapshot.fingerprint) {
        return stack;
    }

    const next = [...stack, snapshot];
    return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

export function useStudioDocument() {
    const [activeFile, setActiveFile] = useState<File | null>(null);
    const [pages, setPages] = useState<StudioPage[]>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);

    const [past, setPast] = useState<DocumentSnapshot[]>([]);
    const [future, setFuture] = useState<DocumentSnapshot[]>([]);

    const totalPages = pages.length;

    const captureSnapshot = useCallback((): DocumentSnapshot | null => {
        if (!activeFile) return null;

        return {
            file: activeFile,
            pages: clonePages(pages),
            currentPageIndex,
            fingerprint: getSnapshotFingerprint(activeFile, pages, currentPageIndex),
        };
    }, [activeFile, pages, currentPageIndex]);

    const restoreSnapshot = useCallback((snapshot: DocumentSnapshot) => {
        setActiveFile(snapshot.file);
        setPages(clonePages(snapshot.pages));
        setCurrentPageIndex(snapshot.currentPageIndex);
        setErrorMessage(null);
        setIsScanning(false);
    }, []);

    const scanPages = useCallback(async (file: Blob): Promise<StudioPage[]> => {
        const pdfjs = await import("pdfjs-dist");

        if (typeof window !== "undefined") {
            pdfjs.GlobalWorkerOptions.workerSrc =
                window.location.origin + "/pdf.worker.mjs";
        }

        const buffer = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buffer }).promise;

        return Array.from({ length: doc.numPages }, (_, i) => ({
            id: `studio-page-${crypto.randomUUID()}`,
            pageNumber: i + 1,
        }));
    }, []);

    const loadFile = useCallback(
        async (file: File, pushHistory: boolean): Promise<boolean> => {
            const snapshotBeforeChange = pushHistory ? captureSnapshot() : null;

            setErrorMessage(null);
            setIsScanning(true);

            try {
                const scanned = await scanPages(file);

                if (snapshotBeforeChange) {
                    setPast((prev) => appendSnapshot(prev, snapshotBeforeChange));
                }

                setFuture([]);
                setActiveFile(file);
                setPages(scanned);
                setCurrentPageIndex(0);

                return true;
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : "Failed to read PDF pages.";
                setErrorMessage(message);
                console.error(err);
                return false;
            } finally {
                setIsScanning(false);
            }
        },
        [captureSnapshot, scanPages]
    );

    const handleFilesAccepted = useCallback(
        async (files: File[]): Promise<boolean> => {
            if (!files.length) return false;
            return loadFile(files[0], !!activeFile);
        },
        [activeFile, loadFile]
    );

    const replaceCurrentDocument = useCallback(
        async (file: File): Promise<boolean> => {
            return loadFile(file, true);
        },
        [loadFile]
    );

    const movePage = useCallback(
        (direction: -1 | 1) => {
            setCurrentPageIndex((current) => {
                const next = current + direction;
                return Math.max(0, Math.min(totalPages - 1, next));
            });
        },
        [totalPages]
    );

    const undo = useCallback(() => {
        if (!past.length) return;

        const currentSnapshot = captureSnapshot();
        const previousSnapshot = past[past.length - 1];

        setPast((prev) => prev.slice(0, -1));

        if (currentSnapshot) {
            setFuture((prev) => appendSnapshot(prev, currentSnapshot));
        }

        restoreSnapshot(previousSnapshot);
    }, [appendSnapshot, captureSnapshot, past, restoreSnapshot]);

    const redo = useCallback(() => {
        if (!future.length) return;

        const currentSnapshot = captureSnapshot();
        const nextSnapshot = future[future.length - 1];

        setFuture((prev) => prev.slice(0, -1));

        if (currentSnapshot) {
            setPast((prev) => appendSnapshot(prev, currentSnapshot));
        }

        restoreSnapshot(nextSnapshot);
    }, [appendSnapshot, captureSnapshot, future, restoreSnapshot]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const isCmdOrCtrl = event.ctrlKey || event.metaKey;
            if (!isCmdOrCtrl) return;

            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable)
            ) {
                return;
            }

            const key = event.key.toLowerCase();

            if (key === "z" && !event.shiftKey) {
                event.preventDefault();
                undo();
                return;
            }

            if (key === "y" || (key === "z" && event.shiftKey)) {
                event.preventDefault();
                redo();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [redo, undo]);

    const resetDocument = useCallback(() => {
        setActiveFile(null);
        setPages([]);
        setCurrentPageIndex(0);
        setErrorMessage(null);
        setIsScanning(false);
        setPast([]);
        setFuture([]);
    }, []);

    return {
        activeFile,
        pages,
        totalPages,
        currentPageIndex,
        isScanning,
        errorMessage,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        setCurrentPageIndex,
        setErrorMessage,
        handleFilesAccepted,
        replaceCurrentDocument,
        movePage,
        undo,
        redo,
        resetDocument,
    };
}