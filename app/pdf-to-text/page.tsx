"use client";

import { useState } from "react";
import { ShieldCheck, Loader2, RefreshCw, Cpu } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import { PdfProgressTracker } from "@/components/pdf/PdfProgressTracker";

export default function OcrPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [taskId, setTaskId] = useState<string>("");

    const onDrop = (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        setFile(acceptedFiles[0]);
        setSuccess(false);
    };

    const handleOcrExtraction = async () => {
        if (!file) return;

        try {
            setIsProcessing(true);
            setSuccess(false);
            setTaskId("");

            const formData = new FormData();
            formData.append("file", file);

            if ((file as any).originalPassword) {
                formData.append("file_password", (file as any).originalPassword);
            }

            const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
            const response = await fetch(`${baseApiUrl}/api/ocr/extract-text-async`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) throw new Error("Could not initialize extraction tracking subprocess node.");

            const data = await response.json();
            setTaskId(data.taskId);
        } catch (err) {
            console.error(err);
            notify(getFriendlyErrorMessage(err));
            setIsProcessing(false);
        }
    };

    const handleTaskComplete = (downloadUrl: string) => {
        const txtDownloadName = `${file?.name.replace(/\.pdf$/i, "")}-extracted-text.txt`;
        const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

        const link = document.createElement("a");
        link.href = `${baseApiUrl}${downloadUrl}`;
        link.download = txtDownloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setSuccess(true);
        setIsProcessing(false);
        setTaskId("");
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="PDF OCR Text Extractor"
                description="Convert scanned PDFs, image-only files, and documents into fully searchable, editable plain-text files seamlessly."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                {!file && (
                    <PdfUploader
                        onFilesAccepted={onDrop}
                        title="Upload Scanned Document"
                        description="Drop your PDF here to run the Optical Character Recognition scanning matrix"
                        multiple={false}
                        accept=".pdf"
                    />
                )}

                {file && (
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-5 space-y-6">
                            <PdfFileInfo file={file} />

                            {success && (
                                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                    <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                    <div className="text-xs">
                                        <p className="font-semibold">Text extracted successfully!</p>
                                        <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                            The document image array was parsed successfully and your editable text file has been downloaded.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="w-full space-y-4">
                                <PdfActionButton
                                    text="Extract Text Layer (OCR)"
                                    loadingText="Initializing transaction token node..."
                                    loading={isProcessing && !taskId}
                                    disabled={!file}
                                    onClick={handleOcrExtraction}
                                />

                                {!isProcessing && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFile(null);
                                            setSuccess(false);
                                        }}
                                        className="w-full py-2.5 rounded-xl border border-[color:var(--border)] bg-[var(--card)] text-xs font-bold text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:border-[color:var(--muted)] transition flex items-center justify-center gap-1.5"
                                    >
                                        <RefreshCw size={12} /> Reset and Upload Another Document
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="lg:col-span-7 flex flex-col items-center justify-center bg-[color:var(--background)]/30 border border-dashed border-[color:var(--border)] rounded-2xl p-8 text-center min-h-[260px] relative overflow-hidden">
                            {isProcessing && taskId ? (
                                <div className="w-full flex flex-col items-center justify-center space-y-4">
                                    <p className="text-sm font-bold text-[color:var(--foreground)]">Analyzing Typography Shapes...</p>
                                    <PdfProgressTracker taskId={taskId} onComplete={handleTaskComplete} />
                                </div>
                            ) : isProcessing ? (
                                <div className="space-y-3 flex flex-col items-center justify-center text-[color:var(--muted)] animate-pulse">
                                    <Loader2 className="animate-spin text-indigo-500 mb-1" size={32} />
                                    <p className="text-sm font-bold text-[color:var(--foreground)]">Uploading Document Data Stream...</p>
                                </div>
                            ) : (
                                <div className="space-y-4 text-[color:var(--muted)] flex flex-col items-center">
                                    <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500">
                                        <Cpu size={32} />
                                    </div>
                                    <div>
                                        <h4 className="text-md font-bold text-[color:var(--foreground)]">Ready for Character Matrix Scan</h4>
                                        <p className="text-xs mt-1 max-w-sm">
                                            Clicking extract will execute a system subprocess to turn flat pixels into readable words, numbers, and paragraphs.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}