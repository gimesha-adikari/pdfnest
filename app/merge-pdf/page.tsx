"use client";

import { useState } from "react";
import { Loader2, FileText } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getFriendlyErrorMessage } from "@/lib/errorHandler"; // Safely mapped your uniform decoder
import { uploadAndDownloadFile } from "@/lib/apiClient";
import { notify } from "@/lib/notify";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFileList from "@/components/pdf/PdfFileList";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfUploader from "@/components/pdf/PdfUploader";

export default function MergePdfPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
    const [isMerging, setIsMerging] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);

    const generateFileThumbnail = async (file: File) => {
        try {
            // OPTIMIZATION: On-demand import prevents Next hydration drops or document-undefined crashes
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

            const arrayBuffer = await file.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

            if (pdf.numPages > 0) {
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 0.2 });

                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext("2d");

                if (ctx) {
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const imgData = canvas.toDataURL("image/jpeg", 0.5);

                    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
                    setThumbnails(prev => ({
                        ...prev,
                        [fileKey]: imgData
                    }));
                }

                canvas.width = 0;
                canvas.height = 0;
                canvas.remove();
            }
        } catch (error) {
            console.error("Failed to generate file preview:", error);
        }
    };

    const addFiles = async (newFiles: File[]) => {
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        const validFiles = newFiles.filter(file => {
            if (file.size > MAX_FILE_SIZE) {
                notify(`${file.name} exceeds 50MB limit`);
                return false;
            }
            return true;
        });

        const incomingUniqueFiles: File[] = [];

        setFiles((prev) => {
            const combined = [...prev, ...validFiles];
            const unique = combined.filter((file, index, self) => {
                const isFirst = index === self.findIndex((f) =>
                    f.name === file.name &&
                    f.size === file.size &&
                    f.lastModified === file.lastModified
                );

                if (isFirst && !prev.some(p => p.name === file.name && p.size === file.size && p.lastModified === file.lastModified)) {
                    incomingUniqueFiles.push(file);
                }
                return isFirst;
            });
            return unique;
        });

        setIsGeneratingPreviews(true);
        for (const file of incomingUniqueFiles) {
            await generateFileThumbnail(file);
        }
        setIsGeneratingPreviews(false);
    };

    const onDrop = (acceptedFiles: File[]) => addFiles(acceptedFiles);

    const removeFile = (indexToRemove: number) => {
        setFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
    };

    const clearFiles = () => {
        setFiles([]);
        setThumbnails({});
    };

    const moveUp = (index: number) => {
        if (index === 0) return;
        const updated = [...files];
        [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
        setFiles(updated);
    };

    const moveDown = (index: number) => {
        if (index === files.length - 1) return;
        const updated = [...files];
        [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
        setFiles(updated);
    };

    const mergePdfs = async () => {
        if (files.length < 2) {
            notify("Please select at least 2 PDF files.");
            return;
        }

        try {
            setIsMerging(true);
            const formData = new FormData();

            files.forEach((file, index) => {
                formData.append("files", file);

                if ((file as any).originalPassword) {
                    formData.append(`password_${index}`, (file as any).originalPassword);
                }
            });

            const responseBlob = await uploadAndDownloadFile("/api/structure/merge", formData);

            const downloadUrl = window.URL.createObjectURL(responseBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = "merged-document.pdf";
            document.body.appendChild(link);
            link.click();

            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

        } catch (error) {
            console.error(error);
            // OPTIMIZATION: Decodes JSON exception metrics matching backend structures perfectly
            notify(`Failed to merge PDFs.\n\n${getFriendlyErrorMessage(error)}`);
        } finally {
            setIsMerging(false);
        }
    };

    const totalSizeMB = (files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2);

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Merge PDF"
                description="Combine multiple PDF files into a single document."
            />
            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <PdfUploader
                    onFilesAccepted={onDrop}
                    title="Upload PDFs"
                    description="Select multiple PDFs to merge"
                    multiple={true}
                    accept=".pdf"
                />

                {files.length > 0 && (
                    <>
                        <div className="mt-8">
                            <h3 className="text-md font-semibold text-[color:var(--muted)] mb-4">Document Queue Layout Sequence</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                                {files.map((file, idx) => {
                                    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
                                    const thumbSrc = thumbnails[fileKey];

                                    return (
                                        <div key={fileKey} className="relative group border border-[color:var(--border)] bg-[color:var(--background)] p-2 rounded-2xl flex flex-col items-center justify-between aspect-[1/1.3] overflow-hidden shadow-sm">
                                            <div className="w-full flex-1 flex items-center justify-center overflow-hidden rounded-lg bg-[color:var(--card)] relative">
                                                {thumbSrc ? (
                                                    <img src={thumbSrc} alt={file.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center text-[color:var(--muted)] opacity-50">
                                                        <FileText size={28} className="mb-1" />
                                                        <Loader2 size={14} className="animate-spin" />
                                                    </div>
                                                )}
                                                <div className="absolute top-2 left-2 bg-indigo-500 text-white rounded-lg text-[10px] font-bold px-2 py-0.5 shadow">
                                                    #{idx + 1}
                                                </div>
                                            </div>
                                            <div className="w-full mt-2 text-center">
                                                <p className="text-xs font-semibold truncate max-w-full px-1 text-[color:var(--foreground)]">{file.name}</p>
                                                <p className="text-[10px] text-[color:var(--muted)]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <PdfFileList
                            files={files}
                            totalSizeMB={totalSizeMB}
                            onMoveUp={moveUp}
                            onMoveDown={moveDown}
                            onRemove={removeFile}
                            onClear={clearFiles}
                        />
                        <PdfActionButton
                            text={`Merge ${files.length} PDFs`}
                            loadingText="Merging PDFs on Server..."
                            loading={isMerging}
                            onClick={mergePdfs}
                        />
                    </>
                )}
            </div>
            <PdfFeatures />
        </PdfToolLayout>
    );
}