"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useSyncExternalStore,
    type ReactNode,
} from "react";

export type WorkflowTransfer = {
    blob: Blob;
    fileName: string;
    mimeType: string;
    sourceToolHref: string;
    targetToolHref: string;
    createdAt: number;
};

type WorkflowTransferInput = Omit<WorkflowTransfer, "createdAt">;

type WorkflowContextValue = {
    pendingTransfer: WorkflowTransfer | null;
    setPendingTransfer: (transfer: WorkflowTransferInput | null) => void;
    consumeTransfer: () => WorkflowTransfer | null;
    clearTransfer: () => void;
};

const listeners = new Set<() => void>();

const store: {
    pendingTransfer: WorkflowTransfer | null;
} = {
    pendingTransfer: null,
};

function emitChange() {
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot() {
    return store.pendingTransfer;
}

function debugLog(...args: unknown[]) {
    if (process.env.NODE_ENV !== "production") {
        console.log("[Workflow]", ...args);
    }
}

const WorkflowContext = createContext<WorkflowContextValue | undefined>(undefined);

export function WorkflowProvider({ children }: { children: ReactNode }) {
    const pendingTransfer = useSyncExternalStore(
        subscribe,
        getSnapshot,
        () => null
    );

    const setPendingTransfer = useCallback((transfer: WorkflowTransferInput | null) => {
        store.pendingTransfer = transfer
            ? { ...transfer, createdAt: Date.now() }
            : null;

        debugLog("setPendingTransfer", store.pendingTransfer);
        emitChange();
    }, []);

    const consumeTransfer = useCallback(() => {
        const current = store.pendingTransfer;
        debugLog("consumeTransfer", current);
        store.pendingTransfer = null;
        emitChange();
        return current;
    }, []);

    const clearTransfer = useCallback(() => {
        debugLog("clearTransfer");
        store.pendingTransfer = null;
        emitChange();
    }, []);

    const value = useMemo<WorkflowContextValue>(
        () => ({
            pendingTransfer,
            setPendingTransfer,
            consumeTransfer,
            clearTransfer,
        }),
        [pendingTransfer, setPendingTransfer, consumeTransfer, clearTransfer]
    );

    return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
    const ctx = useContext(WorkflowContext);
    if (!ctx) throw new Error("useWorkflow must be used within WorkflowProvider");
    return ctx;
}