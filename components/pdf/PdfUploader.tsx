"use client";
import React, { useState, useCallback } from "react";
import { UploadCloud, Lock, Loader2 } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
const checkEncryption = async (file: File): Promise<boolean> => {
    let loadingTask: any = null;
    let pdfDoc: any = null;
    try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

        const arrayBuffer = await file.arrayBuffer();
        loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        pdfDoc = await loadingTask.promise;
        return false;
    } catch (error: any) {
        if (error.name === "InvalidPDFException" || error.message.includes("Invalid Root")) {
            console.warn("File appears corrupted, skipping encryption check.");
            return false;
        }

        if (error.name === "PasswordException") {
            return true;
        }
        throw error;
    } finally {
        if (pdfDoc && typeof pdfDoc.destroy === "function") {
            try { pdfDoc.destroy(); } catch {}
        }
        if (loadingTask && typeof loadingTask.destroy === "function") {
            try { loadingTask.destroy(); } catch {}
        }
    }
};

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
    const handleFiles = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;

            const remaining: File[] = [];
            const processed: File[] = [];

            for (const currentFile of files) {
                if (currentFile.type === "application/pdf" && !bypassEncryptionCheck) {
                    try {
                        const isEncrypted = await checkEncryption(currentFile);
                        if (isEncrypted) {
                            remaining.push(currentFile);
                            continue;
                        }
                    } catch (err) {
                        console.error("Encryption check failed:", err);
                    }
                }
                processed.push(currentFile);
            }

            if (remaining.length === 0) {
                onFilesAccepted(processed);
            } else {
                setQueue({ remaining, processed });
                setError(null);
                setPassword("");
            }
        },
        [onFilesAccepted, bypassEncryptionCheck]
    );

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
        if (!queue || queue.remaining.length === 0 || !password) return;
        setIsUnlocking(true);
        setError(null);

        const currentLockedFile = queue.remaining[0];

        try {
            const formData = new FormData();
            formData.append("file", currentLockedFile);
            formData.append("password", password);

            const decryptedBlob = await uploadAndDownloadFile("/api/security/unlock", formData);

            const unlockedFile = new File([decryptedBlob], currentLockedFile.name, {
                type: "application/pdf"
            });

            (unlockedFile as any).originalPassword = password;

            const nextProcessed = [...queue.processed, unlockedFile];
            const nextRemaining = queue.remaining.slice(1);

            setPassword("");
            if (nextRemaining.length === 0) {
                onFilesAccepted(nextProcessed);
                setQueue(null);
            } else {
                setQueue({ remaining: nextRemaining, processed: nextProcessed });
            }
        } catch (err) {
            setError("Incorrect password or corrupted file.");
        } finally {
            setIsUnlocking(false);
        }
    }, [queue, password, onFilesAccepted]);

    const handleCancelUnlock = useCallback(() => {
        setQueue(null);
        setPassword("");
        setError(null);
    }, []);

    const activeLockedFile = queue?.remaining[0];

    if (activeLockedFile) {
        return (
            <div className="flex flex-col items-center justify-center p-8 sm:p-10 w-full h-full border border-dashed border-rose-500/40 bg-rose-500/5 rounded-xl select-none">
                <div className="p-3.5 rounded-lg bg-rose-500/10 text-rose-500 mb-4">
                    <Lock size={22} />
                </div>

                <p className="text-sm font-semibold text-[var(--foreground)] text-center mb-1">
                    Protected Document Detected {queue.remaining.length > 1 && `(1 of ${queue.remaining.length})`}
                </p>

                <p className="text-xs text-[var(--muted)] text-center mb-4 max-w-sm">
                    &quot;{activeLockedFile.name}&quot; is encrypted. Provide the document password to continue.
                </p>

                <div className="w-full max-w-xs flex flex-col gap-2.5 pointer-events-auto">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter PDF Password"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none text-center shadow-sm"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && password && !isUnlocking) {
                                handleUnlock();
                            }
                        }}
                    />

                    {error && (
                        <span className="text-[11px] text-rose-500 text-center font-mono font-semibold">
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
            <input
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
