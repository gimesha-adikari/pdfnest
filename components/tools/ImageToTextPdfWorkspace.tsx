"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Trash2, ArrowUp, ArrowDown, UploadCloud, FileType } from "lucide-react";
import {getBaseUrl, uploadAndDownloadFile} from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import { PdfProgressTracker } from "@/components/pdf/PdfProgressTracker";
import PdfToolHero from "@/components/pdf/PdfToolHero";

interface ImageItem {
    id: string;
    file: File;
    previewUrl: string;
}

export default function ImageToTextPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [images, setImages] = useState<ImageItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [taskId, setTaskId] = useState<string>("");

    // Ingest the context file dropped on the initial screen uploader component automatically
    useEffect(() => {
        if (file && images.length === 0) {
            const type = file.type.toLowerCase();
            const isValidImage = type.startsWith("image/jpeg") ||
                type.startsWith("image/jpg") ||
                type.startsWith("image/png") ||
                type.startsWith("image/webp");

            if (isValidImage) {
                setImages([{
                    id: Math.random().toString(36).substring(2, 9),
                    file,
                    previewUrl: URL.createObjectURL(file),
                }]);
            }
        }
    }, [file]);

    useEffect(() => {
        return () => {
            images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
        };
    }, [images]);

    const processFiles = (files: File[]) => {
        if (!files || files.length === 0) return;

        const visualFiles = files.filter((file) => {
            const type = file.type.toLowerCase();
            return (
                type.startsWith("image/jpeg") ||
                type.startsWith("image/jpg") ||
                type.startsWith("image/png") ||
                type.startsWith("image/webp")
            );
        });

        if (visualFiles.length === 0) {
            notify("Please upload valid graphic files (JPG, PNG, WebP).","warning");
            return;
        }

        const newItems: ImageItem[] = visualFiles.map((file) => ({
            id: Math.random().toString(36).substring(2, 9),
            file,
            previewUrl: URL.createObjectURL(file),
        }));

        setImages((prev) => [...prev, ...newItems]);
        setSuccess(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(Array.from(e.target.files));
        }
        e.target.value = "";
    };

    const removeImage = (id: string, url: string) => {
        URL.revokeObjectURL(url);
        const updated = images.filter((img) => img.id !== id);
        setImages(updated);
        if (updated.length === 0) {
            setFile(null);
            router.push(`/${toolId}`);
        }
    };

    const moveImage = (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= images.length) return;

        const updatedImages = [...images];
        const temp = updatedImages[index];
        updatedImages[index] = updatedImages[targetIndex];
        updatedImages[targetIndex] = temp;
        setImages(updatedImages);
    };

    const handleConversion = async () => {
        requireAuth(async () => {
            if (images.length === 0) return;

            try {
                setIsProcessing(true);
                setSuccess(false);
                setTaskId("");

                const formData = new FormData();
                images.forEach((item) => {
                    formData.append("images", item.file);
                });

                const responseBlob = await uploadAndDownloadFile("/api/ocr/to-text-pdf-async", formData);
                const jsonText = await responseBlob.text();
                const data = JSON.parse(jsonText);

                if (data.taskId) {
                    setTaskId(data.taskId);
                } else {
                    throw new Error(data.error || "Failed to acquire task queue tracker.");
                }
            } catch (err) {
                console.error(err);
                handleClientError(err);
                setIsProcessing(false);
                setTaskId("");
            }
        });
    };

    const handleTaskComplete = async (downloadUrl: string) => {
        try {
            const response = await fetch(`${getBaseUrl()}${downloadUrl}`);
            if (!response.ok) throw new Error("Could not download compiled async file payload.");

            const responseBlob = await response.blob();

            setDownloadData({
                blob: responseBlob,
                fileName: "ocr-extracted-text.pdf"
            });

            setSuccess(true);
            setIsProcessing(false);
            setTaskId("");

            router.push(`/${toolId}/download`);
        } catch (err) {
            console.error(err);
            notify("Failed to cache processed tracking asset locally.", "error");
            setIsProcessing(false);
        }
    };

    return (
        <>
            <PdfToolHero
                title="Image to Searchable PDF"
                description="Convert scanned images into searchable PDFs while preserving the original layout, colors, logos, and design."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`relative flex flex-col items-center justify-center w-full p-10 border-2 border-dashed rounded-2xl transition-all ${
                        isDragging
                            ? "border-indigo-500 bg-indigo-500/10"
                            : "border-[color:var(--border)] hover:border-indigo-400 hover:bg-[color:var(--background)]/50"
                    }`}
                >
                    <input
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        multiple
                        accept="image/*"
                        onChange={handleFileInput}
                    />
                    <div className="flex flex-col items-center pointer-events-none">
                        <div className="p-4 rounded-full mb-4 bg-[color:var(--background)] text-[color:var(--muted)]">
                            <UploadCloud size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">Upload Additional Document Snapshots</h3>
                        <p className="mt-2 text-sm text-[color:var(--muted)] text-center max-w-sm">
                            Drop images with text contents here. The system will preserve the original image while adding a hidden searchable text layer.
                        </p>
                    </div>
                </div>

                {images.length > 0 && (
                    <div className="mt-8 space-y-6">
                        <div className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-2">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                <FileType size={16} className="text-indigo-500" /> Target Conversion Grid ({images.length})
                            </h3>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {images.map((img, index) => (
                                <div key={img.id} className="relative group rounded-xl border border-[color:var(--border)] bg-[var(--card)] p-2 flex flex-col justify-between overflow-hidden shadow-sm transition hover:border-[color:var(--muted)]">
                                    <div className="aspect-[3/4] relative w-full rounded-lg bg-[color:var(--border)]/30 overflow-hidden flex items-center justify-center">
                                        <img src={img.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                        <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                                            Page {index + 1}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeImage(img.id, img.previewUrl)}
                                            className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-red-500 text-white opacity-0 group-hover:opacity-100 transition z-10"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    <p className="text-[10px] truncate mt-2 font-mono text-[color:var(--muted)] px-1">{img.file.name}</p>
                                    <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-[color:var(--border)]/60 justify-end">
                                        <button type="button" disabled={index === 0} onClick={() => moveImage(index, "up")} className="p-1 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--card)] disabled:opacity-30 text-[color:var(--foreground)]">
                                            <ArrowUp size={10} />
                                        </button>
                                        <button type="button" disabled={index === images.length - 1} onClick={() => moveImage(index, "down")} className="p-1 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--card)] disabled:opacity-30 text-[color:var(--foreground)]">
                                            <ArrowDown size={10} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Searchable PDF Created!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">The original layout has been preserved and a hidden OCR text layer has been added for search and copy/paste support.</p>
                                </div>
                            </div>
                        )}

                        <div className="w-full mt-6">
                            {isProcessing && taskId ? (
                                <div className="flex flex-col items-center justify-center space-y-3 py-4 border rounded-xl border-dashed">
                                    <p className="text-xs font-mono text-muted-foreground animate-pulse">Tracking instance: {taskId}</p>
                                    <PdfProgressTracker taskId={taskId} onComplete={handleTaskComplete} />
                                </div>
                            ) : (
                                <PdfActionButton
                                    text="Create Searchable PDF"
                                    loadingText="Initializing remote tracking engine..."
                                    loading={isProcessing}
                                    disabled={images.length === 0}
                                    onClick={handleConversion}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}