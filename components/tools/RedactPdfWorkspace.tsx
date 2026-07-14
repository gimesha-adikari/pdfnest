"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {ShieldAlert, Type, MousePointerSquareDashed, Trash2, Loader2} from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/layout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { notify } from "@/lib/notify";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface DrawnBox {
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export default function RedactPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [isReading, setIsReading] = useState<boolean>(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);

    const [mode, setMode] = useState<"text" | "draw">("text");
    const [keywords, setKeywords] = useState<string>("");
    const [drawnBoxes, setDrawnBoxes] = useState<DrawnBox[]>([]);

    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [currentBox, setCurrentBox] = useState<DrawnBox | null>(null);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRefs = useRef<HTMLCanvasElement[]>([]);

    useEffect(() => {
        if (!file) {
            setPdfDoc(null);
            setTotalPages(0);
            return;
        }

        const readPdfLayers = async () => {
            setIsReading(true);
            canvasRefs.current = [];
            setDrawnBoxes([]);

            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

                setPdfDoc(pdf);
                setTotalPages(pdf.numPages);
            } catch (error) {
                console.error(error);
                notify("Failed to load PDF layers cleanly.","error");
            } finally {
                setIsReading(false);
            }
        };

        readPdfLayers();
    }, [file]);

    const drawPageContents = useCallback(async (pageNum: number) => {
        if (!pdfDoc) return;
        try {
            const page = await pdfDoc.getPage(pageNum);
            const canvas = canvasRefs.current[pageNum - 1];
            if (!canvas || !containerRef.current) return;

            const context = canvas.getContext("2d");
            if (!context) return;

            const unscaledViewport = page.getViewport({ scale: 1.0 });
            const targetWidth = containerRef.current.clientWidth - 48;
            const dynamicScale = targetWidth / unscaledViewport.width;

            const dpr = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale: dynamicScale });

            canvas.width = viewport.width * dpr;
            canvas.height = viewport.height * dpr;
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            context.scale(dpr, dpr);

            await page.render({
                canvas,
                canvasContext: context,
                viewport,
            }).promise;

            const pageBoxes = drawnBoxes.filter(b => b.page === pageNum);
            pageBoxes.forEach(box => {
                context.fillStyle = "rgba(0, 0, 0, 0.9)";
                context.fillRect(
                    box.x * viewport.width,
                    box.y * viewport.height,
                    box.width * viewport.width,
                    box.height * viewport.height
                );
            });

            if (currentBox && currentBox.page === pageNum) {
                context.fillStyle = "rgba(99, 102, 241, 0.4)";
                context.strokeStyle = "#6366f1";
                context.lineWidth = 2;
                context.fillRect(
                    currentBox.x * viewport.width,
                    currentBox.y * viewport.height,
                    currentBox.width * viewport.width,
                    currentBox.height * viewport.height
                );
                context.strokeRect(
                    currentBox.x * viewport.width,
                    currentBox.y * viewport.height,
                    currentBox.width * viewport.width,
                    currentBox.height * viewport.height
                );
            }

        } catch (e) {}
    }, [pdfDoc, drawnBoxes, currentBox]);

    useEffect(() => {
        if (!pdfDoc) return;
        for (let i = 1; i <= totalPages; i++) {
            drawPageContents(i);
        }
    }, [pdfDoc, totalPages, drawnBoxes, currentBox, drawPageContents]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, pageNum: number) => {
        if (mode !== "draw") return;
        const canvas = canvasRefs.current[pageNum - 1];
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setIsDrawing(true);
        setStartPos({ x: mouseX, y: mouseY });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>, pageNum: number) => {
        if (!isDrawing || mode !== "draw") return;
        const canvas = canvasRefs.current[pageNum - 1];
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

        const x = Math.min(startPos.x, currentX) / rect.width;
        const y = Math.min(startPos.y, currentY) / rect.height;
        const width = Math.abs(startPos.x - currentX) / rect.width;
        const height = Math.abs(startPos.y - currentY) / rect.height;

        setCurrentBox({
            id: "temp",
            page: pageNum,
            x, y, width, height
        });
    };

    const handleMouseUp = (pageNum: number) => {
        if (!isDrawing || mode !== "draw") return;
        setIsDrawing(false);

        if (currentBox && currentBox.width > 0.01 && currentBox.height > 0.01) {
            setDrawnBoxes(prev => [...prev, { ...currentBox, id: crypto.randomUUID() }]);
        }
        setCurrentBox(null);
    };

    const removeBox = (id: string) => {
        setDrawnBoxes(prev => prev.filter(b => b.id !== id));
    };

    const handleRedactionSubmit = async () => {
        requireAuth(async () => {
            if (!file) return;
            setIsProcessing(true);

            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("keywords", keywords.trim());
                formData.append("boxes", JSON.stringify(drawnBoxes));

                const responseBlob = await uploadAndDownloadFile("/api/security/redact-text", formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: `redacted_${file.name}`
                });

                notify("All text matches and manual drawn areas completely scrubbed!","success");
                router.push(`/${toolId}/download`);
            } catch (error) {
                console.error(error);
                notify("Redaction processing pipeline failed.","error");
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Sanitize & Redact PDF Text"
                description="Search matching text variables or draw boxes manually to securely scrub file coordinates."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                {isReading ? (
                    <div className="flex flex-col items-center justify-center p-12 gap-3 text-zinc-400 animate-pulse">
                        <Loader2 className="animate-spin text-indigo-500" size={32} />
                        <p className="text-xs font-semibold">Parsing structural canvas layers...</p>
                    </div>
                ) : pdfDoc && (
                    <div className="space-y-6">
                        <PdfFileInfo file={file} onClear={() => {
                            setFile(null);
                            router.push(`/${toolId}`);
                        }} />

                        <div className="grid gap-6 lg:grid-cols-12">
                            {/* Side Controls Panel */}
                            <div className="lg:col-span-4 space-y-4 rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50 h-fit">
                                <h4 className="font-semibold text-md flex items-center gap-2">
                                    <ShieldAlert size={18} className="text-amber-500" />
                                    Redaction Controls
                                </h4>

                                <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1">
                                    <button
                                        onClick={() => setMode("text")}
                                        className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition ${mode === "text" ? "bg-white shadow dark:bg-zinc-700 text-[color:var(--foreground)]" : "text-zinc-500"}`}
                                    >
                                        <Type size={14} /> Text Search
                                    </button>
                                    <button
                                        onClick={() => setMode("draw")}
                                        className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition ${mode === "draw" ? "bg-white shadow dark:bg-zinc-700 text-[color:var(--foreground)]" : "text-zinc-500"}`}
                                    >
                                        <MousePointerSquareDashed size={14} /> Draw Areas
                                    </button>
                                </div>

                                {mode === "text" ? (
                                    <div>
                                        <label className="text-xs font-medium text-[color:var(--muted)]">Target Keywords (Comma Separated)</label>
                                        <textarea
                                            value={keywords}
                                            onChange={(e) => setKeywords(e.target.value)}
                                            placeholder="e.g. Passport, John Doe"
                                            className="mt-1.5 w-full h-24 text-sm rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3 text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-xs text-zinc-500">Click and drag directly over any section on the document preview to mark custom blackout blocks.</p>
                                        {drawnBoxes.length > 0 && (
                                            <div className="border-t pt-2 max-h-40 overflow-y-auto space-y-1">
                                                <span className="text-xs font-bold block mb-1">Marked Zones:</span>
                                                {drawnBoxes.map((box, idx) => (
                                                    <div key={box.id} className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg text-xs text-[color:var(--foreground)]">
                                                        <span>Area {idx + 1} (Page {box.page})</span>
                                                        <button onClick={() => removeBox(box.id)} className="text-red-500 hover:text-red-700">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* View Panel Display Component */}
                            <div className="lg:col-span-8 flex flex-col gap-6 p-6 border rounded-2xl bg-zinc-900/5 max-h-[700px] overflow-y-auto overflow-x-hidden w-full" ref={containerRef}>
                                {Array.from({ length: totalPages }, (_, i) => (
                                    <div key={i} className="relative shadow-md flex flex-col items-center select-none w-full">
                                        <canvas
                                            ref={(el) => { if (el) canvasRefs.current[i] = el; }}
                                            onMouseDown={(e) => handleMouseDown(e, i + 1)}
                                            onMouseMove={(e) => handleMouseMove(e, i + 1)}
                                            onMouseUp={() => handleMouseUp(i + 1)}
                                            className={`rounded-lg bg-white max-w-full h-auto shadow-sm ${mode === "draw" ? "cursor-crosshair" : ""}`}
                                        />
                                        <span className="text-[10px] text-zinc-400 mt-1">Page {i + 1}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <PdfActionButton
                            text="Execute Secure Binary Redaction"
                            loadingText="Purging document contents..."
                            loading={isProcessing}
                            disabled={!keywords.trim() && drawnBoxes.length === 0}
                            onClick={handleRedactionSubmit}
                        />
                    </div>
                )}
            </div>
        </>
    );
}