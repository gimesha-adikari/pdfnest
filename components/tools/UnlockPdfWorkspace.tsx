"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Unlock, ShieldCheck, Lock, ShieldAlert } from "lucide-react";
import { handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function UnlockPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [password, setPassword] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!file) {
            setPassword("");
            setSuccess(false);
            setErrorMessage(null);
        }
    }, [file]);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const handleUnlockProcessing = async () => {
        requireAuth(async () => {
            if (!file || !password) return;

            try {
                setIsProcessing(true);
                setSuccess(false);
                setErrorMessage(null);

                const result = await ExecutionManager.run({
                    tool: "unlock",
                    files: [file],
                    params: { password },
                    mode: processingMode,
                    password,
                });

                setDownloadData({
                    blob: result.blob,
                    fileName: `${file.name.replace(/\.pdf$/i, "")}-unlocked.pdf`,
                });

                setSuccess(true);
                setPassword("");
                router.push(`/${toolId}/download`);
            } catch (err: any) {
                console.error(err);
                if (
                    err?.code === "DECRYPTION_AUTH_FAILED" ||
                    err?.message?.toLowerCase().includes("password") ||
                    err?.message?.toLowerCase().includes("auth")
                ) {
                    const msg = "Incorrect password. Please check the password and try again.";
                    setErrorMessage(msg);
                    notify(msg, "error");
                } else {
                    const genericMsg = err?.message || "Failed to unlock document. Please check the password.";
                    setErrorMessage(genericMsg);
                    handleClientError(err);
                }
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Unlock PDF"
                description="Strip protection limits, passwords, and security encryption blocks instantly from your documents using our specialized binary processing engine."
            />
            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="mt-4 space-y-6">
                    <PdfFileInfo
                        file={file}
                        onClear={() => {
                            setFile(null);
                            router.push(`/${toolId}`);
                        }}
                    />

                    <div className="rounded-2xl border border-[color:var(--border)] p-5">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-[color:var(--foreground)]">
                            <Unlock size={18} className="text-indigo-500" /> Security Access Verification
                        </h3>
                        <div className="mt-4">
                            <label className="text-sm font-medium text-[color:var(--muted)]">
                                Current Document Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (errorMessage) setErrorMessage(null);
                                }}
                                placeholder="Enter the password to decrypt the file"
                                className="mt-2 w-full rounded-xl border border-[color:var(--border)] bg-transparent p-3 text-sm outline-none transition focus:border-indigo-500 text-[color:var(--foreground)]"
                            />
                        </div>
                    </div>

                    {/* Processing Mode Selector */}
                    <div className="space-y-3">
                        <ProcessingModeSelector
                            mode={processingMode}
                            onChange={setProcessingMode}
                            disabled={isProcessing}
                        />

                        <div className="flex items-center gap-2 text-xs text-[color:var(--muted)] px-1">
                            <Lock size={12} className="text-emerald-500 shrink-0" />
                            <span>
                                {processingMode === "cloud"
                                    ? "Cloud Mode: File and password are processed securely on high-performance cloud servers."
                                    : "On-Device Privacy: Your password and document remain private on your computer and never leave your browser."}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--border)] p-4">
                        <p className="text-sm text-[color:var(--muted)]">Target document footprint</p>
                        <p className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">{fileExtractedSize} MB</p>
                    </div>

                    {errorMessage && (
                        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-900 dark:text-red-200 flex items-start gap-3">
                            <ShieldAlert className="text-red-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-sm font-semibold">Decryption Failed</p>
                                <p className="text-xs mt-0.5 text-red-800/80 dark:text-red-200/70">
                                    {errorMessage}
                                </p>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                            <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-sm font-semibold">Security restrictions dropped successfully!</p>
                                <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                    The unlocked binary configuration properties were validated and processed.
                                </p>
                            </div>
                        </div>
                    )}

                    <PdfActionButton
                        text="Remove Security and Unlock PDF"
                        loadingText="Executing Cipher Decryption..."
                        loading={isProcessing}
                        disabled={!password || isProcessing}
                        onClick={handleUnlockProcessing}
                    />
                </div>
            </div>
        </>
    );
}