"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioProject } from "@/lib/studio/project";
import { inspectPdfEncryption } from "@/lib/security/inspectPdfProtection";
import {
    authorizeRestoredStudioPreview,
    createRestoredStudioPreviewScope,
    revokeRestoredStudioPreview,
    revokeRestoredStudioPreviewIfUnreachable,
    type RestoredStudioPreviewScope,
} from "@/lib/security/restoredStudioPreviewAuthorization";

const PROTECTED_PROJECT_INPUT_MESSAGE =
    "Legacy Studio only accepts unprotected PDFs from project and recovery files. Open a password-free copy using a workflow you explicitly authorize. No document was submitted.";

export interface StudioPage {
    id: string;
    pageNumber: number;
}

export interface DocumentSnapshot {
    file: File;
    pages: StudioPage[];
    currentPageIndex: number;
    fingerprint: string;
}

export interface LoadFileResult {
    snapshot: DocumentSnapshot;
    past: DocumentSnapshot[];
    future: DocumentSnapshot[];
}

export interface PreparedStudioRestore {
    readonly operationId: number;
    readonly project: StudioProject;
    readonly previewScope: RestoredStudioPreviewScope;
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
    const operationGenerationRef = useRef(0);
    const pendingRestoreScopeRef = useRef<RestoredStudioPreviewScope | null>(null);
    const activeRestoreScopeRef = useRef<RestoredStudioPreviewScope | null>(null);
    const mountedRef = useRef(true);

    const invalidatePendingRestoreOperations = useCallback((): number => {
        operationGenerationRef.current += 1;
        const pendingScope = pendingRestoreScopeRef.current;
        if (pendingScope) revokeRestoredStudioPreview(pendingScope);
        pendingRestoreScopeRef.current = null;
        setIsScanning(false);
        return operationGenerationRef.current;
    }, []);

    const isOperationCurrent = useCallback((operationId: number): boolean => (
        mountedRef.current && operationGenerationRef.current === operationId
    ), []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            operationGenerationRef.current += 1;
            if (pendingRestoreScopeRef.current) {
                revokeRestoredStudioPreview(pendingRestoreScopeRef.current);
                pendingRestoreScopeRef.current = null;
            }
            if (activeRestoreScopeRef.current) {
                revokeRestoredStudioPreview(activeRestoreScopeRef.current);
                activeRestoreScopeRef.current = null;
            }
        };
    }, []);

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

    const reconcileActiveRestoreScope = useCallback((reachableSnapshots: readonly DocumentSnapshot[]) => {
        const activeScope = activeRestoreScopeRef.current;
        if (!activeScope) return;

        if (revokeRestoredStudioPreviewIfUnreachable(
            activeScope,
            reachableSnapshots.map((snapshot) => snapshot.file),
        )) {
            activeRestoreScopeRef.current = null;
        }
    }, []);

    const prepareProjectRestore = useCallback(async (
        project: StudioProject,
        requestedOperationId?: number,
    ): Promise<PreparedStudioRestore | null> => {
        const operationId = requestedOperationId ?? invalidatePendingRestoreOperations();
        if (!isOperationCurrent(operationId)) return null;

        const snapshots = [project.current, ...project.past, ...project.future];
        const inspectedFiles = new Set<File>();
        const previewScope = createRestoredStudioPreviewScope(snapshots.map((snapshot) => snapshot.file));
        pendingRestoreScopeRef.current = previewScope;

        try {
            for (const snapshot of snapshots) {
                if (inspectedFiles.has(snapshot.file)) continue;
                inspectedFiles.add(snapshot.file);

                let encrypted: boolean;
                try {
                    encrypted = await inspectPdfEncryption(snapshot.file);
                } catch {
                    throw new Error("A PDF in this Studio project could not be verified as unprotected. No document was submitted.");
                }

                if (!isOperationCurrent(operationId)) {
                    revokeRestoredStudioPreview(previewScope);
                    return null;
                }
                if (encrypted) throw new Error(PROTECTED_PROJECT_INPUT_MESSAGE);
            }

            if (!isOperationCurrent(operationId) || pendingRestoreScopeRef.current !== previewScope) {
                revokeRestoredStudioPreview(previewScope);
                return null;
            }

            return Object.freeze({ operationId, project, previewScope });
        } catch (error) {
            revokeRestoredStudioPreview(previewScope);
            if (pendingRestoreScopeRef.current === previewScope) pendingRestoreScopeRef.current = null;
            throw error;
        }
    }, [invalidatePendingRestoreOperations, isOperationCurrent]);

    const activatePreparedRestore = useCallback((prepared: PreparedStudioRestore): boolean => {
        if (
            !isOperationCurrent(prepared.operationId) ||
            pendingRestoreScopeRef.current !== prepared.previewScope
        ) {
            revokeRestoredStudioPreview(prepared.previewScope);
            return false;
        }

        authorizeRestoredStudioPreview(prepared.previewScope);
        if (activeRestoreScopeRef.current && activeRestoreScopeRef.current !== prepared.previewScope) {
            revokeRestoredStudioPreview(activeRestoreScopeRef.current);
        }
        activeRestoreScopeRef.current = prepared.previewScope;
        pendingRestoreScopeRef.current = null;

        const { project } = prepared;

        setActiveFile(project.current.file);
        setPages(clonePages(project.current.pages));
        setCurrentPageIndex(project.current.currentPageIndex);
        setPast(project.past.map((s) => ({
            file: s.file,
            pages: clonePages(s.pages),
            currentPageIndex: s.currentPageIndex,
            fingerprint: s.fingerprint,
        })));
        setFuture(project.future.map((s) => ({
            file: s.file,
            pages: clonePages(s.pages),
            currentPageIndex: s.currentPageIndex,
            fingerprint: s.fingerprint,
        })));
        setErrorMessage(null);
        setIsScanning(false);
        return true;
    }, [isOperationCurrent]);

    const cancelPreparedRestore = useCallback((prepared: PreparedStudioRestore): void => {
        revokeRestoredStudioPreview(prepared.previewScope);
        if (pendingRestoreScopeRef.current !== prepared.previewScope) return;
        pendingRestoreScopeRef.current = null;
        if (operationGenerationRef.current === prepared.operationId) {
            operationGenerationRef.current += 1;
        }
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
        async (
            file: File,
            pushHistory: boolean
        ): Promise<LoadFileResult | null> => {
            const operationId = invalidatePendingRestoreOperations();
            const snapshotBeforeChange = pushHistory ? captureSnapshot() : null;

            setErrorMessage(null);
            setIsScanning(true);

            try {
                const scanned = await scanPages(file);

                if (!isOperationCurrent(operationId)) return null;

                const nextPast = snapshotBeforeChange
                    ? appendSnapshot(past, snapshotBeforeChange)
                    : past;

                const nextFuture: DocumentSnapshot[] = [];

                const snapshot: DocumentSnapshot = {
                    file,
                    pages: clonePages(scanned),
                    currentPageIndex: 0,
                    fingerprint: getSnapshotFingerprint(file, scanned, 0),
                };

                reconcileActiveRestoreScope([snapshot, ...nextPast, ...nextFuture]);

                setPast(nextPast);
                setFuture(nextFuture);
                setActiveFile(file);
                setPages(snapshot.pages);
                setCurrentPageIndex(snapshot.currentPageIndex);

                return {
                    snapshot,
                    past: nextPast,
                    future: nextFuture,
                };
            } catch (err: unknown) {
                if (!isOperationCurrent(operationId)) return null;
                const message =
                    err instanceof Error ? err.message : "Failed to read PDF pages.";
                setErrorMessage(message);
                console.error(err);
                return null;
            } finally {
                if (isOperationCurrent(operationId)) setIsScanning(false);
            }
        },
        [captureSnapshot, invalidatePendingRestoreOperations, isOperationCurrent, reconcileActiveRestoreScope, scanPages, past]
    );

    const handleFilesAccepted = useCallback(
        async (files: File[]): Promise<LoadFileResult | null> => {
            if (!files.length) return null;
            return loadFile(files[0], !!activeFile);
        },
        [activeFile, loadFile]
    );

    const replaceCurrentDocument = useCallback(
        async (file: File): Promise<LoadFileResult | null> => {
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
        invalidatePendingRestoreOperations();

        const currentSnapshot = captureSnapshot();
        const previousSnapshot = past[past.length - 1];
        const nextPast = past.slice(0, -1);
        const nextFuture = currentSnapshot
            ? appendSnapshot(future, currentSnapshot)
            : future;

        reconcileActiveRestoreScope([previousSnapshot, ...nextPast, ...nextFuture]);
        setPast(nextPast);
        setFuture(nextFuture);

        restoreSnapshot(previousSnapshot);
    }, [captureSnapshot, future, invalidatePendingRestoreOperations, past, reconcileActiveRestoreScope, restoreSnapshot]);

    const redo = useCallback(() => {
        if (!future.length) return;
        invalidatePendingRestoreOperations();

        const currentSnapshot = captureSnapshot();
        const nextSnapshot = future[future.length - 1];
        const nextFuture = future.slice(0, -1);
        const nextPast = currentSnapshot
            ? appendSnapshot(past, currentSnapshot)
            : past;

        reconcileActiveRestoreScope([nextSnapshot, ...nextPast, ...nextFuture]);
        setFuture(nextFuture);
        setPast(nextPast);

        restoreSnapshot(nextSnapshot);
    }, [captureSnapshot, future, invalidatePendingRestoreOperations, past, reconcileActiveRestoreScope, restoreSnapshot]);

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
        invalidatePendingRestoreOperations();
        if (activeRestoreScopeRef.current) {
            revokeRestoredStudioPreview(activeRestoreScopeRef.current);
            activeRestoreScopeRef.current = null;
        }
        setActiveFile(null);
        setPages([]);
        setCurrentPageIndex(0);
        setErrorMessage(null);
        setIsScanning(false);
        setPast([]);
        setFuture([]);
    }, [invalidatePendingRestoreOperations]);

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
        captureSnapshot,
        prepareProjectRestore,
        activatePreparedRestore,
        cancelPreparedRestore,
        beginRestoreOperation: invalidatePendingRestoreOperations,
        isOperationCurrent,
        past,
        future,
    };
}
