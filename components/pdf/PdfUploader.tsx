// file: /home/gimesha/My_Projects/next/pdfnest/components/pdf/PdfUploader.tsx
"use client";

import React, { useState, useCallback } from "react";
import { UploadCloud, Lock, Loader2 } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";

// Helper function to check if a PDF file is encrypted
const checkEncryption = async (file: File): Promise<boolean> => {
    try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        await loadingTask.promise;
        return false; // File is not locked
    } catch (error: any) {
        if (error.name === "PasswordException") {
            return true; // File is encrypted/locked
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
    bypassEncryptionCheck?: boolean; // Optional flag to completely skip interception
}

export default function PdfUploader({
                                        onFilesAccepted,
                                        title = "Select or Drop Files Here",
                                        description = "Supports standard documents configuration formats",
                                        accept = "*/*",
                                        multiple = false,
                                        bypassEncryptionCheck = false, // Defaults to false across all other tools
                                    }: PdfUploaderProps) {
    const [lockedFile, setLockedFile] = useState<File | null>(null);
    const [password, setPassword] = useState("");
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFiles = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;

            const targetFile = files[0];

            if (targetFile.type === "application/pdf" && !bypassEncryptionCheck) {
                try {
                    const isEncrypted = await checkEncryption(targetFile);
                    if (isEncrypted) {
                        setLockedFile(targetFile);
                        return;
                    }
                } catch (err) {
                    console.error("Encryption check failed:", err);
                }
            }

            onFilesAccepted(files);
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
        if (!lockedFile || !password) return;
        setIsUnlocking(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("file", lockedFile);
            formData.append("password", password);

            const decryptedBlob = await uploadAndDownloadFile("/api/security/unlock", formData);

            const unlockedFile = new File([decryptedBlob], lockedFile.name, {
                type: "application/pdf"
            });

            // 👇 Cache password as property directly onto the Javascript object instance frame safely
            (unlockedFile as any).originalPassword = password;

            setLockedFile(null);
            setPassword("");
            onFilesAccepted([unlockedFile]);
        } catch (err) {
            setError("Incorrect password or corrupted file.");
        } finally {
            setIsUnlocking(false);
        }
    }, [lockedFile, password, onFilesAccepted]);

    const handleCancelUnlock = useCallback(() => {
        setLockedFile(null);
        setPassword("");
        setError(null);
    }, []);

    if (lockedFile) {
        return (
            <div
                className="
                    flex
                    flex-col
                    items-center
                    justify-center
                    p-10
                    w-full
                    h-full
                    border-2
                    border-dashed
                    border-amber-500/40
                    bg-amber-500/5
                    rounded-2xl
                    select-none
                "
            >
                <div className="p-4 rounded-full bg-amber-500/10 text-amber-500 mb-4">
                    <Lock size={28} />
                </div>

                <p className="text-sm font-semibold text-[color:var(--foreground)] text-center mb-1">
                    Protected Document Detected
                </p>

                <p className="text-xs text-[color:var(--muted)] text-center mb-4 max-w-sm">
                    &quot;{lockedFile.name}&quot; is encrypted. Provide the document password to continue.
                </p>

                <div className="w-full max-w-xs flex flex-col gap-2 pointer-events-auto">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter PDF Password"
                        className="
                            w-full
                            rounded-xl
                            border
                            border-[color:var(--border)]
                            bg-[var(--background)]
                            px-4
                            py-2
                            text-sm
                            focus:border-amber-500
                            focus:outline-none
                            text-center
                        "
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
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleUnlock}
                            disabled={isUnlocking || !password}
                            className="
                                flex
                                items-center
                                gap-2
                                px-4
                                py-2
                                text-xs
                                font-medium
                                text-white
                                bg-amber-500
                                rounded-xl
                                hover:bg-amber-600
                                transition-colors
                                disabled:opacity-50
                                disabled:cursor-not-allowed
                            "
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

    // Default Dropzone UI
    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="
                relative
                border-2
                border-dashed
                rounded-2xl
                transition-all
                outline-none
                border-[color:var(--border)]
                bg-[var(--background)]/30
                hover:border-[color:var(--muted)]
                overflow-hidden
            "
        >
            <input
                type="file"
                accept={accept}
                multiple={multiple}
                onChange={handleChange}
                className="
                    absolute
                    inset-0
                    z-20
                    h-full
                    w-full
                    cursor-pointer
                    opacity-0
                "
            />

            <div
                className="
                    flex
                    flex-col
                    items-center
                    justify-center
                    p-10
                    w-full
                    h-full
                    select-none
                    pointer-events-none
                "
            >
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