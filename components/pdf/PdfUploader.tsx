"use client";

import React, { useState, useCallback } from "react";
import { UploadCloud, Lock, Loader2 } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";

const checkEncryption = async (file: File): Promise<boolean> => {
    try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        await loadingTask.promise;
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
            <div className="flex flex-col items-center justify-center p-10 w-full h-full border-2 border-dashed border-amber-500/40 bg-amber-500/5 rounded-2xl select-none">
                <div className="p-4 rounded-full bg-amber-500/10 text-amber-500 mb-4">
                    <Lock size={28} />
                </div>

                <p className="text-sm font-semibold text-[color:var(--foreground)] text-center mb-1">
                    Protected Document Detected {queue.remaining.length > 1 && `(1 of ${queue.remaining.length})`}
                </p>

                <p className="text-xs text-[color:var(--muted)] text-center mb-4 max-w-sm">
                    &quot;{activeLockedFile.name}&quot; is encrypted. Provide the document password to continue.
                </p>

                <div className="w-full max-w-xs flex flex-col gap-2 pointer-events-auto">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter PDF Password"
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-2 text-sm focus:border-amber-500 focus:outline-none text-center"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && password && !isUnlocking) {
                                handleUnlock();
                            }
                        }}
                    />

                    {error && (
                        <span className="text-xs text-red-500 text-center font-medium">
                            {error}
                        </span>
                    )}

                    <div className="flex justify-center gap-3 mt-2">
                        <button
                            type="button"
                            onClick={handleCancelUnlock}
                            className="px-4 py-2 text-xs font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)] transition-colors"
                        >
                            Cancel All
                        </button>
                        <button
                            type="button"
                            onClick={handleUnlock}
                            disabled={isUnlocking || !password}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isUnlocking ? (
                                <>
                                    <Loader2 className="animate-spin" size={14} />
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
            className="relative border-2 border-dashed rounded-2xl transition-all outline-none border-[color:var(--border)] bg-[var(--background)]/30 hover:border-[color:var(--muted)] overflow-hidden"
        >
            <input
                type="file"
                accept={accept}
                multiple={multiple}
                onChange={handleChange}
                className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
            />

            <div className="flex flex-col items-center justify-center p-10 w-full h-full select-none pointer-events-none">
                <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500 mb-4">
                    <UploadCloud size={28} />
                </div>

                <p className="text-sm font-semibold text-[color:var(--foreground)] text-center mb-1">
                    {title}
                </p>

                <p className="text-xs text-[color:var(--muted)] text-center">
                    {description}
                </p>
            </div>
        </div>
    );
}