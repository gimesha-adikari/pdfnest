"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import PdfExport from "./PdfExport";
import WordExport from "./WordExport";

interface ExportDialogProps {
    open: boolean;
    file: File | null;
    onClose: () => void;
    onExportedFile?: (result: {
        blob: Blob;
        fileName: string;
        mimeType: string;
    }) => void | Promise<void>;
}

type ExportFormat = "pdf" | "docx";

export default function ExportDialog({
                                         open,
                                         file,
                                         onClose,
                                         onExportedFile,
                                     }: ExportDialogProps) {
    const [format, setFormat] = useState<ExportFormat>("pdf");

    if (!open || !file) return null;

    return (
        <>
            <div
                className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <div className="w-full max-w-xl rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-2xl">
                    <div className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-5">
                        <div>
                            <h2 className="text-xl font-bold">Export Document</h2>
                            <p className="mt-1 text-sm text-[color:var(--muted)]">
                                Choose an export format.
                            </p>
                        </div>

                        <button
                            onClick={onClose}
                            className="rounded-xl p-2 transition hover:bg-[color:var(--background)]"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="p-6">
                        <div className="mb-5">
                            <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                Export type
                            </label>
                            <div className="relative mt-2">
                                <select
                                    value={format}
                                    onChange={(e) => setFormat(e.target.value as ExportFormat)}
                                    className="w-full appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-3 pr-10 text-sm font-medium text-[color:var(--foreground)] outline-none transition focus:border-indigo-500"
                                >
                                    <option value="pdf">PDF</option>
                                    <option value="docx">Word (.docx)</option>
                                </select>
                                <ChevronDown
                                    size={16}
                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
                                />
                            </div>
                        </div>

                        {format === "pdf" ? (
                            <PdfExport file={file} onExportedFile={onExportedFile} />
                        ) : (
                            <WordExport file={file} onExportedFile={onExportedFile} />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}