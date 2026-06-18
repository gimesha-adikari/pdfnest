"use client";

import { useState, useRef, useEffect } from "react";
import { FileEdit, Download, Loader2, RefreshCw } from "lucide-react";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfUploader from "@/components/pdf/PdfUploader";
import { notify } from "@/lib/notify";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface LayoutElement {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    font: string;
    bg_color?: string;
    text_color?: string;
}

interface PageData {
    page_num: number;
    width: number;
    height: number;
    elements: LayoutElement[];
}

export default function PrecisionEditPdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [pages, setPages] = useState<PageData[]>([]);
    const [sourceTracker, setSourceTracker] = useState<string>("");

    const [isExtracting, setIsExtracting] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];
        setFile(uploadedFile);
        setIsExtracting(true);
        setPages([]);
        setPdfDocument(null);

        try {
            const formData = new FormData();
            formData.append("file", uploadedFile);

            const response = await fetch("http://localhost:8080/api/edit/extract", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) throw new Error("Failed extraction call.");
            const data = await response.json();

            if (data.pages) {
                setPages(data.pages);
                setSourceTracker(data.source_tracker);

                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
                const arrayBuffer = await uploadedFile.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

                setPdfDocument(pdf);
                notify("Document layout mapped successfully.");
            } else {
                throw new Error(data.error || "Malformed response payload.");
            }
        } catch (e) {
            console.error(e);
            notify("Failed to parse structural layout grids.");
            setFile(null);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleInputChange = (pageIdx: number, elementIdx: number, val: string) => {
        setPages(prev => {
            const copy = [...prev];
            copy[pageIdx].elements[elementIdx].text = val;
            return copy;
        });
    };

    const handleCompileSubmit = async () => {
        if (!file || pages.length === 0) return;
        setIsCompiling(true);

        try {
            const response = await fetch("http://localhost:8080/api/edit/compile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pages, source_tracker: sourceTracker }),
            });

            if (!response.ok) throw new Error("Compilation rejected.");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `edited_${file.name}`;
            document.body.appendChild(link);
            link.click();
            link.remove();

            notify("Success! Patched PDF document downloaded.");
        } catch (e) {
            console.error(e);
            notify("Compilation failure occurred.");
        } finally {
            setIsCompiling(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero title="Precision PDF Layout Editor" description="Modify text elements inline while preserving original formatting matrix loops perfectly." />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                {!file && !isExtracting && (
                    <PdfUploader onFilesAccepted={onDrop} title="Upload Document" description="Select a file to parse precise coordinate text overlays" multiple={false} accept=".pdf" />
                )}

                {isExtracting && (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                        <Loader2 className="animate-spin mb-4" size={32} />
                        <p>Deconstructing text lines and tracking alignment grids across all pages...</p>
                    </div>
                )}

                {file && !isExtracting && pdfDocument && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between border-b pb-4">
                            <h3 className="font-semibold flex items-center gap-2"><FileEdit size={18} className="text-indigo-500"/> Workspace Canvas: {file.name}</h3>
                            <button onClick={() => { setFile(null); setPages([]); setPdfDocument(null); }} className="text-sm text-red-500 hover:underline flex items-center gap-1"><RefreshCw size={13} /> Reset Workspace</button>
                        </div>

                        <div className="bg-zinc-200 dark:bg-zinc-950 p-8 rounded-2xl flex flex-col items-center gap-12 max-h-[800px] overflow-y-auto shadow-inner border">
                            {pages.map((page, pageIdx) => (
                                <PdfPageCanvasItem
                                    key={page.page_num}
                                    page={page}
                                    pageIdx={pageIdx}
                                    pdfDocument={pdfDocument}
                                    handleInputChange={handleInputChange}
                                />
                            ))}
                        </div>

                        <button onClick={handleCompileSubmit} disabled={isCompiling || pages.length === 0} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition">
                            {isCompiling ? <><Loader2 className="animate-spin" /> Assembling Layers Across All Pages...</> : <><Download /> Export Precision Vector Document Changes</>}
                        </button>
                    </div>
                )}
            </div>
        </PdfToolLayout>
    );
}

interface PageItemProps {
    page: PageData;
    pageIdx: number;
    pdfDocument: PDFDocumentProxy;
    handleInputChange: (pageIdx: number, elementIdx: number, val: string) => void;
}

// FIXED: Corrected 'func' keyword declaration to 'function' to build type scope signatures properly
function PdfPageCanvasItem({ page, pageIdx, pdfDocument, handleInputChange }: PageItemProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isRendered, setIsRendered] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function drawPageInstance() {
            if (!pdfDocument || !canvasRef.current) return;
            try {
                const pdfPage = await pdfDocument.getPage(page.page_num);
                if (!isMounted || !canvasRef.current) return;

                const canvas = canvasRef.current;
                const context = canvas.getContext("2d");
                if (!context) return;

                const viewport = pdfPage.getViewport({ scale: 1.0 });

                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;

                await pdfPage.render({
                    canvasContext: context,
                    canvas: canvas,
                    viewport: viewport
                }).promise;

                if (isMounted) setIsRendered(true);
            } catch (err) {
                console.error(`Page ${page.page_num} render thread failed:`, err);
            }
        }

        drawPageInstance();
        return () => { isMounted = false; };
    }, [pdfDocument, page.page_num]);

    return (
        <div
            className="relative bg-white shadow-xl border rounded select-none mx-auto flex-shrink-0"
            style={{
                width: `${page.width}px`,
                height: `${page.height}px`,
                marginBottom: "24px"
            }}
        >
            <span className="absolute -left-20 top-2 text-xs font-bold text-zinc-500 bg-white shadow-sm border border-zinc-200 px-2 py-1 rounded z-20">
                Page {page.page_num}
            </span>

            <canvas ref={canvasRef} className="absolute top-0 left-0 z-0 rounded" />

            <div className={`absolute top-0 left-0 w-full h-full z-10 pointer-events-none transition-opacity duration-300 ${isRendered ? 'opacity-100' : 'opacity-0'}`}>
                {page.elements.map((element: LayoutElement, elementIdx: number) => {
                    const elementBg = element.bg_color || "#ffffff";
                    const elementText = element.text_color || "#000000";

                    return (
                        <input
                            key={elementIdx}
                            type="text"
                            value={element.text}
                            onChange={(e) => handleInputChange(pageIdx, elementIdx, e.target.value)}
                            className="absolute bg-transparent outline-none font-sans px-1 pointer-events-auto rounded focus:z-20 text-[10px]"
                            style={{
                                left: `${element.x}px`,
                                top: `${element.y}px`,
                                width: `${element.width + 2}px`,
                                height: `${element.height + 1}px`,
                                fontSize: `${element.size}px`,
                                lineHeight: 1,
                                backgroundColor: elementBg,
                                color: elementText,
                                border: "none",
                                outline: "none",
                                boxShadow: "none"
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}