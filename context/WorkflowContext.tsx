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
    provenance: {
        derivedFromProtectedInput: boolean;
        cloudTransmissionOccurred: boolean;
    };
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

        emitChange();
    }, []);

    const consumeTransfer = useCallback(() => {
        const current = store.pendingTransfer;
        store.pendingTransfer = null;
        emitChange();
        return current;
    }, []);

    const clearTransfer = useCallback(() => {
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
