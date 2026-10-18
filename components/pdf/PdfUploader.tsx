"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { UploadCloud, Lock, Loader2 } from "lucide-react";
import PasswordField from "@/components/ui/PasswordField";
import { inspectPdf, prepareEncryptedPdf } from "@/lib/pdf/localPreparation";
import { ExecutionError } from "@/lib/execution/types";

interface PdfUploaderProps {
    onFilesAccepted: (files: File[]) => void;
    title?: string;
    description?: string;
    accept?: string;
    multiple?: boolean;
    bypassEncryptionCheck?: boolean;
}

interface UploadQueue {
    remaining: File[];
    processed: File[];
    controller: AbortController;
}

export default function PdfUploader({
                                        onFilesAccepted,
                                        title = "Select or Drop Files Here",
                                        description = "Supports standard documents configuration formats",
                                        accept = "*/*",
                                        multiple = false,
                                        bypassEncryptionCheck = false,
                                    }: PdfUploaderProps) {
    const [queue, setQueue] = useState<UploadQueue | null>(null);
    const [password, setPassword] = useState("");
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const active = useRef<AbortController | null>(null);
    const submitting = useRef(false);
    const [isInspecting, setIsInspecting] = useState(false);
    useEffect(() => () => {
        active.current?.abort();
        active.current = null;
    }, []);

    // Consume the original queue in order, pausing at each protected document.
    const advance = useCallback(async (pending: UploadQueue) => {
        const { controller } = pending;
        const remaining = [...pending.remaining];
        const processed = [...pending.processed];
        while (remaining.length && !controller.signal.aborted) {
            const file = remaining[0];
            if (file.type === "application/pdf" && !bypassEncryptionCheck && await inspectPdf(file, controller.signal)) {
                if (active.current === controller) setQueue({ remaining, processed, controller });
                return;
            }
            processed.push(file);
            remaining.shift();
        }
        if (active.current !== controller || controller.signal.aborted) return;
        active.current = null;
        setQueue(null);
        onFilesAccepted(processed);
    }, [bypassEncryptionCheck, onFilesAccepted]);

    const handleFiles = useCallback(async (files: File[]) => {
        if (!files.length || active.current) return;
        const controller = new AbortController();
        active.current = controller;
        setIsInspecting(true);
        setError(null);
        setPassword("");
        try {
            await advance({ remaining: files, processed: [], controller });
        } catch (error) {
            if (active.current === controller && !controller.signal.aborted) {
                active.current = null;
                setError(error instanceof ExecutionError ? error.message : "Local PDF preparation failed. Please retry.");
            }
        } finally {
            if (!controller.signal.aborted) setIsInspecting(false);
        }
    }, [advance]);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || []);
            handleFiles(files);
            e.target.value = "";
        },
        [handleFiles]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            const files = Array.from(e.dataTransfer.files || []);
            handleFiles(files);
        },
        [handleFiles]
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
        },
        []
    );
    const handleUnlock = useCallback(async () => {
        if (!queue || !password || submitting.current || queue.controller.signal.aborted) return;
        const { controller } = queue;
        submitting.current = true;
        setIsUnlocking(true);
        setError(null);
        try {
            const unlocked = await prepareEncryptedPdf(queue.remaining[0], password, controller.signal);
            if (active.current !== controller) return;
            setPassword("");
            await advance({ ...queue, remaining: queue.remaining.slice(1), processed: [...queue.processed, unlocked] });
        } catch (error) {
            if (active.current === controller && !controller.signal.aborted) {
                setPassword("");
                setError(error instanceof ExecutionError ? error.message : "Local decryption failed. Please retry or cancel.");
            }
        } finally {
            if (!controller.signal.aborted) {
                submitting.current = false;
                setIsUnlocking(false);
            }
        }
    }, [queue, password, advance]);

    const handleCancelUnlock = useCallback(() => {
        active.current?.abort();
        active.current = null;
        submitting.current = false;
        setQueue(null);
        setPassword("");
        setError(null);
        setIsUnlocking(false);
        setIsInspecting(false);
    }, []);

    const activeLockedFile = queue?.remaining[0];

    if (activeLockedFile) {
        return (
            <div className="flex flex-col items-center justify-center p-8 sm:p-10 w-full h-full border border-dashed border-rose-500/40 bg-rose-500/5 rounded-xl select-none">
                <div className="p-3.5 rounded-lg bg-rose-500/10 text-rose-500 mb-4">
                    <Lock size={22} />
                </div>

                <p className="text-sm font-semibold text-[var(--foreground)] text-center mb-1">
                    Protected Document Detected
                </p>

                <p className="text-xs text-[var(--muted)] text-center mb-4 max-w-sm">
                    &quot;{activeLockedFile.name}&quot; is encrypted. Provide the password to decrypt it locally in your browser.
                </p>

                <div className="w-full max-w-xs flex flex-col gap-2.5 pointer-events-auto">
                    <PasswordField
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter PDF Password"
                        autoComplete="off"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none text-center shadow-sm"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && password && !isUnlocking) {
                                handleUnlock();
                            }
                        }}
                    />

                    {error && (
                        <span role="alert" className="text-[11px] text-rose-500 text-center font-mono font-semibold">
                            {error}
                        </span>
                    )}

                    <div className="flex justify-center gap-2 mt-1">
                        <button
                            type="button"
                            onClick={handleCancelUnlock}
                            className="px-3 py-1.5 text-xs font-mono text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                        >
                            Cancel All
                        </button>
                        <button
                            type="button"
                            onClick={handleUnlock}
                            disabled={isUnlocking || !password}
                            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent)] rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            {isUnlocking ? (
                                <>
                                    <Loader2 className="animate-spin" size={13} />
                                    Unlocking...
                                </>
                            ) : (
                                "Unlock & Continue"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="relative border border-dashed rounded-xl transition-all outline-none border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-hover)] overflow-hidden group shadow-sm"
        >
            {error && <p role="alert" className="p-3 text-sm text-rose-500">{error}</p>}
            {isInspecting && <div className="relative z-30 p-3 text-center text-sm" role="status">
                Checking PDF locally… <button type="button" onClick={handleCancelUnlock}>Cancel All</button>
            </div>}
            <input
                disabled={isInspecting}
                aria-label={title}
                type="file"
                accept={accept}
                multiple={multiple}
                onChange={handleChange}
                className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
            />

            <div className="flex flex-col items-center justify-center py-14 px-6 w-full h-full select-none pointer-events-none text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--accent)] mb-4 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent-subtle)] transition-colors">
                    <UploadCloud size={22} />
                </div>

                <p className="text-sm font-semibold text-[var(--foreground)] mb-1 group-hover:text-[var(--accent)] transition-colors">
                    {title}
                </p>

                <p className="text-xs text-[var(--muted)] max-w-sm">
                    {description}
                </p>
            </div>
        </div>
    );
}
