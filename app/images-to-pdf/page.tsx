"use client";

import { useState } from "react";
import { Image as ImageIcon, Loader2, FileImage, ShieldCheck } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import {useAuth} from "@/context/AuthContext";

export default function ImagesToPdfPage() {
    const { requireAuth } = useAuth();

    const [images, setImages] = useState<File[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleFilesSelection = (acceptedFiles: File[]) => {
        setImages((prev) => [...prev, ...acceptedFiles]);
        setSuccess(false);
    };

    const removeImageElement = (indexToRemove: number) => {
        setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    };

    const handleCompilePdf = async () => {
        requireAuth(async () => {

            if (images.length === 0) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                images.forEach((img) => {
                    formData.append("images", img);
                });

                const responseBlob = await uploadAndDownloadFile(
                    "/api/conversion/to-pdf",
                    formData
                );

                const downloadUrl = window.URL.createObjectURL(responseBlob);
                const link = document.createElement("a");
                link.href = downloadUrl;
                link.download = "compiled-images.pdf";
                document.body.appendChild(link);
                link.click();

                document.body.removeChild(link);
                window.URL.revokeObjectURL(downloadUrl);

                setSuccess(true);
                setImages([]);
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Convert Images to PDF"
                description="Package multiple high-resolution graphics, photos, or documents into a single optimized vector PDF."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <PdfUploader
                    onFilesAccepted={handleFilesSelection}
                    title="Upload Graphic Attachments"
                    description="Drop PNG, JPEG, or WebP images here to package them into sequence matrices"
                    multiple={true}
                    accept="image/*"
                />

                {images.length > 0 && (
                    <div className="mt-8 space-y-6">
                        <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-2">
                            <h3 className="text-sm font-bold flex items-center gap-2 text-[color:var(--foreground)]">
                                <ImageIcon size={16} className="text-indigo-500" /> Compiled Queue ({images.length})
                            </h3>
                            <button
                                type="button"
                                onClick={() => setImages([])}
                                className="text-xs text-red-500 hover:underline font-medium"
                            >
                                Clear All
                            </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {images.map((img, index) => {
                                const localPreviewUrl = URL.createObjectURL(img);
                                return (
                                    <div
                                        key={`${img.name}-${index}`}
                                        className="group relative border border-[color:var(--border)] rounded-xl overflow-hidden aspect-square bg-[color:var(--background)] shadow-sm hover:border-[color:var(--muted)] transition"
                                    >
                                        <img
                                            src={localPreviewUrl}
                                            alt={img.name}
                                            className="w-full h-full object-cover"
                                            onLoad={() => URL.revokeObjectURL(localPreviewUrl)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeImageElement(index)}
                                            className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full p-1 text-xs opacity-0 group-hover:opacity-100 transition shadow-md hover:bg-red-600"
                                        >
                                            ✕
                                        </button>
                                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[10px] text-white truncate font-medium">
                                            {img.name}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Document Conversion Finished!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">Your image package has been transformed into a fully organized PDF download stream.</p>
                                </div>
                            </div>
                        )}

                        <div className="w-full pt-4">
                            <PdfActionButton
                                text={`Compile ${images.length} Image${images.length > 1 ? "s" : ""} into PDF`}
                                loadingText="Processing Image Matrix Conversion..."
                                loading={isProcessing}
                                disabled={images.length === 0}
                                onClick={handleCompilePdf}
                            />
                        </div>
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}