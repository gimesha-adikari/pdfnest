"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";

export interface StudioExportResult {
    blob: Blob;
    fileName: string;
    mimeType: string;
}

export interface StudioExportProps {
    file: File;
    onExportedFile?: (result: StudioExportResult) => void | Promise<void>;
}

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function PdfExport({ file, onExportedFile }: StudioExportProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const handleExport = async () => {
        try {
            setIsProcessing(true);
            setMessage(null);

            const result: StudioExportResult = {
                blob: file,
                fileName: file.name.replace(/\.pdf$/i, "") + "-exported.pdf",
                mimeType: file.type || "application/pdf",
            };

            if (onExportedFile) {
                await onExportedFile(result);
            } else {
                downloadBlob(result.blob, result.fileName);
            }

            setMessage("PDF export ready.");
        } catch (err) {
            console.error(err);
            setMessage("Export failed.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-4">
                <div>
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">PDF</p>
                    <p className="mt-1 text-xs text-[color:var(--muted)]">
                        Download the edited document as a PDF.
                    </p>
                </div>
                <FileText size={32} className="text-indigo-500" />
            </div>

            <button
                type="button"
                onClick={handleExport}
                disabled={isProcessing}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Download size={16} />
                {isProcessing ? "Exporting..." : "Export PDF"}
            </button>

            {message && <p className="text-xs text-[color:var(--muted)]">{message}</p>}
        </div>
    );
}
