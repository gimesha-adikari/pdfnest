"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { uploadAndDownloadFile } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/[toolId]/layout";
import PdfFileList from "@/components/pdf/PdfFileList";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfToolHero from "@/components/pdf/PdfToolHero";

export default function MergePdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [files, setFiles] = useState<File[]>([]);
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
    const [isMerging, setIsMerging] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
    const [fileMeta, setFileMeta] = useState<Record<string, { originalPassword?: string }>>({});

    // Automatically ingest the initial full files collection matrix
    useEffect(() => {
        if (file && files.length === 0) {
            const batch = (file as any).initialBatch as File[];
            if (batch && batch.length > 0) {
                addFiles(batch);
            } else {
                addFiles([file]);
            }
        }
    }, [file]);

    const generateFileThumbnail = async (targetFile: File) => {
        try {
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

            const arrayBuffer = await targetFile.arrayBuffer();
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
                    await page.render({
                        canvas,
                        canvasContext: ctx,
                        viewport,
                    }).promise;

                    const imgData = canvas.toDataURL("image/jpeg", 0.5);
                    const fileKey = `${targetFile.name}-${targetFile.size}-${targetFile.lastModified}`;

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
        const validFiles = newFiles.filter(item => {
            if (item.size > MAX_FILE_SIZE) {
                notify(`${item.name} exceeds 50MB limit`);
                return false;
            }
            return true;
        });

        // Precompute matching incoming unique files clear of functional context loops
        const incomingUniqueFiles = validFiles.filter(item =>
            !files.some(p => p.name === item.name && p.size === item.size && p.lastModified === item.lastModified)
        );

        if (incomingUniqueFiles.length === 0) return;

        setFiles((prev) => {
            const combined = [...prev, ...incomingUniqueFiles];
            return combined.filter((item, index, self) =>
                    index === self.findIndex((f) =>
                        f.name === item.name &&
                        f.size === item.size &&
                        f.lastModified === item.lastModified
                    )
            );
        });

        setIsGeneratingPreviews(true);
        for (const target of incomingUniqueFiles) {
            await generateFileThumbnail(target);
        }
        setIsGeneratingPreviews(false);
    };

    const removeFile = (indexToRemove: number) => {
        const updated = files.filter((_, index) => index !== indexToRemove);
        setFiles(updated);
        if (updated.length === 0) {
            setFile(null);
            router.push(`/${toolId}`);
        }
    };

    const clearFiles = () => {
        setFiles([]);
        setThumbnails({});
        setFile(null);
        router.push(`/${toolId}`);
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
        requireAuth(async () => {
            if (files.length < 2) {
                notify("Please select at least 2 PDF files.");
                return;
            }

            try {
                setIsMerging(true);
                const formData = new FormData();

                files.forEach((item, index) => {
                    formData.append("files", item);

                    const fileKey = `${item.name}-${item.size}-${item.lastModified}`;
                    const password = fileMeta[fileKey]?.originalPassword;

                    if (password) {
                        formData.append(`password_${index}`, password);
                    }
                });

                const responseBlob = await uploadAndDownloadFile("/api/structure/merge", formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: "merged-document.pdf"
                });

                router.push(`/${toolId}/download`);
            } catch (error) {
                console.error(error);
                notify(`Failed to merge PDFs.\n\n${getFriendlyErrorMessage(error)}`);
            } finally {
                setIsMerging(false);
            }
        });
    };

    const totalSizeMB = (files.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024).toFixed(2);

    if (files.length === 0) return null;

    return (
        <>
            <PdfToolHero
                title="Merge PDF"
                description="Combine multiple PDF files into a single document."
            />
            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <PdfUploader
                    onFilesAccepted={addFiles}
                    title="Upload Additional PDFs"
                    description="Select multiple PDFs to merge"
                    multiple={true}
                    accept=".pdf"
                />

                <div className="mt-8">
                    <h3 className="text-md font-semibold text-[color:var(--muted)] mb-4">Document Queue Layout Sequence</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                        {files.map((item, idx) => {
                            const fileKey = `${item.name}-${item.size}-${item.lastModified}`;
                            const thumbSrc = thumbnails[fileKey];

                            return (
                                <div key={fileKey} className="relative group border border-[color:var(--border)] bg-[color:var(--background)] p-2 rounded-2xl flex flex-col items-center justify-between aspect-[1/1.3] overflow-hidden shadow-sm">
                                    <div className="w-full flex-1 flex items-center justify-center overflow-hidden rounded-lg bg-[color:var(--card)] relative">
                                        {thumbSrc ? (
                                            <img src={thumbSrc} alt={item.name} className="w-full h-full object-cover" />
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
                                        <p className="text-xs font-semibold truncate max-w-full px-1 text-[color:var(--foreground)]">{item.name}</p>
                                        <p className="text-[10px] text-[color:var(--muted)]">{(item.size / 1024 / 1024).toFixed(2)} MB</p>
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
            </div>
        </>
    );
}