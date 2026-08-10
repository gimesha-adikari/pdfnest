"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, FileArchive, RefreshCw, Image as ImageIcon } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { handleClientError } from "@/lib/errorHandler";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";

type ImageTypeOption = {
    value: "jpg" | "png" | "pnggray" | "pngmono";
    label: string;
    description: string;
};

const IMAGE_TYPE_OPTIONS: ImageTypeOption[] = [
    {
        value: "jpg",
        label: "JPEG",
        description: "Smaller file size, good for photos and general documents",
    },
    {
        value: "png",
        label: "PNG",
        description: "Lossless full-color images",
    },
    {
        value: "pnggray",
        label: "Grayscale PNG",
        description: "Smaller than full color, useful for text-heavy pages",
    },
    {
        value: "pngmono",
        label: "Monochrome PNG",
        description: "Black-and-white output for crisp text and compact files",
    },
];

export default function PdfToImagesWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [imageType, setImageType] = useState<ImageTypeOption["value"]>("jpg");

    const selectedOption =
        IMAGE_TYPE_OPTIONS.find((option) => option.value === imageType) ?? IMAGE_TYPE_OPTIONS[0];

    const resetTool = () => {
        setFile(null);
        setSuccess(false);
        setImageType("jpg");
        router.push(`/${toolId}`);
    };

    const handleUniversalConversion = async () => {
        requireAuth(async () => {
            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);
                formData.append("image_type", imageType);

                if ((file as any).originalPassword) {
                    formData.append("file_password", (file as any).originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/conversion/pdf-to-images", formData);

                const zipDownloadName = `${file.name.replace(/\.pdf$/i, "")}-${imageType}-images.zip`;

                setDownloadData({
                    blob: responseBlob,
                    fileName: zipDownloadName,
                });

                setSuccess(true);
                router.push(`/${toolId}/download`);
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Convert PDF to Images"
                description="Extract every page of your PDF into high-resolution images. Choose the output type before you convert."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-5 space-y-6">
                        <PdfFileInfo
                            file={file}
                            onClear={() => {
                                resetTool();
                            }}
                        />

                        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-[color:var(--foreground)]">
                                <ImageIcon size={16} className="text-indigo-500" />
                                <h4 className="text-sm font-bold">Image type</h4>
                            </div>

                            <label className="block">
                                <span className="sr-only">Choose image type</span>
                                <select
                                    value={imageType}
                                    onChange={(e) => setImageType(e.target.value as ImageTypeOption["value"])}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[color:var(--foreground)] outline-none transition focus:border-indigo-500"
                                >
                                    {IMAGE_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <p className="text-xs leading-5 text-[color:var(--muted)]">
                                {selectedOption.description}
                            </p>
                        </div>

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">ZIP file downloaded successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        All pages were extracted as {selectedOption.label} images inside one archive.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="w-full space-y-4">
                            <PdfActionButton
                                text={`Extract as ${selectedOption.label}`}
                                loadingText={`Processing as ${selectedOption.label}...`}
                                loading={isProcessing}
                                disabled={!file || isProcessing}
                                onClick={handleUniversalConversion}
                            />

                            {!isProcessing && (
                                <button
                                    type="button"
                                    onClick={resetTool}
                                    className="w-full py-2.5 rounded-xl border border-[color:var(--border)] bg-[var(--card)] text-xs font-bold text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:border-[color:var(--muted)] transition flex items-center justify-center gap-1.5"
                                >
                                    <RefreshCw size={12} /> Reset and Upload Another Document
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-7 flex flex-col items-center justify-center bg-[color:var(--background)]/30 border border-dashed border-[color:var(--border)] rounded-2xl p-8 text-center min-h-[260px] relative overflow-hidden">
                        {isProcessing ? (
                            <div className="space-y-3 flex flex-col items-center justify-center text-[color:var(--muted)] animate-pulse">
                                <Loader2 className="animate-spin text-indigo-500 mb-1" size={32} />
                                <p className="text-sm font-bold text-[color:var(--foreground)]">
                                    Rasterizing Pages as {selectedOption.label}...
                                </p>
                                <p className="text-xs max-w-xs">
                                    File layers are safely being flattened into individual image files inside a ZIP container.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4 text-[color:var(--muted)] flex flex-col items-center">
                                <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500">
                                    <FileArchive size={32} />
                                </div>
                                <div>
                                    <h4 className="text-md font-bold text-[color:var(--foreground)]">
                                        Ready for Extraction
                                    </h4>
                                    <p className="text-xs mt-1 max-w-sm">
                                        Choose the image type, then extract the PDF pages into a downloadable ZIP archive.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
