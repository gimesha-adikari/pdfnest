"use client";

import { useMemo, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function LockPdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [password, setPassword] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        setFile(acceptedFiles[0]);
        setSuccess(false);
    };

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const handleLockProcessing = async () => {
        if (!file || !password) return;

        try {
            setIsProcessing(true);
            setSuccess(false);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("password", password);

            await uploadAndDownloadFile("/security/lock", formData, `${file.name.replace(/\.pdf$/i, "")}-locked.pdf`);

            setSuccess(true);
            setPassword("");
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : "Security operational transaction execution failure.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Protect PDF"
                description="Secure your documents by applying robust high-grade permissions encryption configurations via standard native server configurations."
            />
            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <PdfUploader
                    onFilesAccepted={onDrop}
                    title="Upload Target Document"
                    description="Drop your unsecured file element here to apply structural encryption filters"
                />
                {file && (
                    <div className="mt-8 space-y-6">
                        <PdfFileInfo file={file} />
                        <div className="rounded-2xl border border-[color:var(--border)] p-5">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Lock size={18} className="text-indigo-500" /> Apply Structural Cipher Restriction
                            </h3>
                            <div className="mt-4">
                                <label className="text-sm font-medium text-[color:var(--muted)]">
                                    Secure Access Password Configuration
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Configure strong access code strings"
                                    className="mt-2 w-full rounded-xl border border-[color:var(--border)] bg-transparent p-3 text-sm outline-none transition focus:border-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--border)] p-4">
                            <p className="text-sm text-[color:var(--muted)]">Target document footprint</p>
                            <p className="mt-1 text-2xl font-bold">{fileExtractedSize} MB</p>
                        </div>
                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                                <div>
                                    <p className="text-sm font-semibold">Security configuration execution success!</p>
                                    <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                        The newly protected document container has been compiled by the system engine and delivered successfully.
                                    </p>
                                </div>
                            </div>
                        )}
                        <PdfActionButton
                            text="Encrypt and Protect PDF"
                            loadingText="Executing Cipher Restriction Routine..."
                            loading={isProcessing}
                            disabled={!password}
                            onClick={handleLockProcessing}
                        />
                    </div>
                )}
            </div>
            <PdfFeatures />
        </PdfToolLayout>
    );
}