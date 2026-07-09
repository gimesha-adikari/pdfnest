"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, ShieldCheck, Loader2, FileText } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/layout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function RotatePdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [pageCount, setPageCount] = useState<number>(0);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [pageRotations, setPageRotations] = useState<Record<number, number>>({});

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
    const [success, setSuccess] = useState(false);

    const generateThumbnails =
        useCallback(
            async (pdf: any, totalPages: number) => {
        setIsGeneratingPreviews(true);
        const loadedThumbnails: string[] = [];

        try {
            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.3 });

                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext("2d");

                if (ctx) {
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const imgData = canvas.toDataURL("image/jpeg", 0.6);
                    loadedThumbnails.push(imgData);

                    setThumbnails([...loadedThumbnails]);
                }

                canvas.width = 0;
                canvas.height = 0;
                canvas.remove();
            }
        } catch (error) {
            console.error("Page preview compilation failed:", error);
        } finally {
            setIsGeneratingPreviews(false);
        }
    }, []);

    useEffect(() => {
        if (!file) {
            setPageCount(0);
            setThumbnails([]);
            setPageRotations({});
            return;
        }

        const parsePdfGeometry = async () => {
            setSuccess(false);
            setPageRotations({});
            setThumbnails([]);
            setIsReadingTotal(true);

            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);

                const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
                const totalPages = pdf.numPages;
                setPageCount(totalPages);
                setIsReadingTotal(false);

                generateThumbnails(pdf, totalPages);
            } catch (error) {
                console.error(error);
                notify("Could not read the structural metadata of this document.");
                setIsReadingTotal(false);
            }
        };

        parsePdfGeometry();
    }, [file, generateThumbnails]);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const rotatePageClockwise = (pageNum: number) => {
        setPageRotations((prev) => {
            const currentRotation = prev[pageNum] || 0;
            const nextRotation = (currentRotation + 90) % 360;
            return {
                ...prev,
                [pageNum]: nextRotation,
            };
        });
    };

    const rotateAllClockwise = () => {
        setPageRotations((prev) => {
            const updated: Record<number, number> = {};
            for (let i = 1; i <= pageCount; i++) {
                const currentRotation = prev[i] || 0;
                updated[i] = (currentRotation + 90) % 360;
            }
            return updated;
        });
    };

    const clearAllRotations = () => {
        setPageRotations({});
    };

    const handleRotateProcessing = async () => {
        requireAuth(async () => {
            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const groupedRotations: Record<string, number> = {};
                Object.entries(pageRotations).forEach(([pageStr, degrees]) => {
                    if (degrees > 0) {
                        if (!groupedRotations[pageStr]) {
                            groupedRotations[pageStr] = degrees;
                        }
                    }
                });

                const formData = new FormData();
                formData.append("file", file);
                formData.append("rotations", JSON.stringify(groupedRotations));

                if ((file as any).originalPassword) {
                    formData.append("file_password", (file as any).originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/rotate", formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${file.name.replace(/\.pdf$/i, "")}-rotated.pdf`
                });

                setSuccess(true);
                setPageRotations({});
                router.push(`/${toolId}/download`);
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Rotate PDF"
                description="Rotate individual pages or the entire document layout visually before applying native adjustments on the server."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="space-y-6">
                    <PdfFileInfo file={file} onClear={() => {
                        setFile(null);
                        router.push(`/${toolId}`);
                    }} />

                    <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <RotateCw size={18} className="text-indigo-500" />
                                Visual Rotation Interface
                            </h3>
                            {pageCount > 0 && !isReadingTotal && (
                                <div className="flex gap-3 text-sm">
                                    <button onClick={rotateAllClockwise} className="text-indigo-500 hover:text-indigo-600 font-medium transition">Rotate All 90°</button>
                                    <button onClick={clearAllRotations} className="text-[color:var(--muted)] hover:text-red-500 font-medium transition">Reset</button>
                                </div>
                            )}
                        </div>

                        {isReadingTotal ? (
                            <div className="flex flex-col justify-center items-center py-12 text-[color:var(--muted)]">
                                <Loader2 size={32} className="animate-spin mb-4 text-indigo-500" />
                                <p>Parsing document geometry grids...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[500px] overflow-y-auto p-2">
                                {Array.from({ length: pageCount }).map((_, idx) => {
                                    const pageNum = idx + 1;
                                    const rotation = pageRotations[pageNum] || 0;
                                    const thumbnailSrc = thumbnails[idx];

                                    return (
                                        <div
                                            key={pageNum}
                                            className="flex flex-col items-center bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-2 relative shadow-sm transition hover:shadow-md"
                                        >
                                            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white rounded-md text-[10px] font-bold px-1.5 py-0.5 z-10">
                                                Pg {pageNum}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => rotatePageClockwise(pageNum)}
                                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white shadow-md transition z-10"
                                            >
                                                <RotateCw size={12} />
                                            </button>

                                            <div className="w-full aspect-[1/1.4] flex items-center justify-center overflow-hidden rounded-lg bg-[color:var(--background)] mt-6 mb-2">
                                                <div
                                                    style={{ transform: `rotate(${rotation}deg)` }}
                                                    className="w-full h-full transition-transform duration-200 ease-out"
                                                >
                                                    {thumbnailSrc ? (
                                                        <img
                                                            src={thumbnailSrc}
                                                            alt={`Page ${pageNum}`}
                                                            className="w-full h-full object-cover rounded-md"
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center w-full h-full text-[color:var(--muted)] opacity-50">
                                                            <FileText size={24} className="mb-2" />
                                                            <Loader2 size={14} className="animate-spin mt-1" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {rotation > 0 && (
                                                <div className="text-[10px] font-mono text-indigo-500 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md mt-1">
                                                    +{rotation}°
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                            <p className="text-sm text-[color:var(--muted)]">Source document size</p>
                            <p className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">{fileExtractedSize} MB</p>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                            <p className="text-sm text-[color:var(--muted)]">Total Adjusted Pages</p>
                            <p className="mt-1 text-2xl font-bold text-indigo-500">
                                {Object.values(pageRotations).filter(deg => deg > 0).length} / {pageCount}
                            </p>
                        </div>
                    </div>

                    {success && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                            <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-sm font-semibold">Page rotation adjustments successful!</p>
                                <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                    The requested rotation matrix values were processed on the server and updated.
                                </p>
                            </div>
                        </div>
                    )}

                    <PdfActionButton
                        text="Apply Rotation Matrices"
                        loadingText="Processing Vector Orientations on Backend Node..."
                        loading={isProcessing}
                        disabled={Object.values(pageRotations).filter(deg => deg > 0).length === 0 || isGeneratingPreviews}
                        onClick={handleRotateProcessing}
                    />
                </div>
            </div>
        </>
    );
}