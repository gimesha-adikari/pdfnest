"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import { Rnd } from "react-rnd";
import {ChevronLeft, ChevronRight, Loader2, PenTool, Plus, ShieldCheck} from "lucide-react";
import {useAuth} from "@/context/AuthContext";
import {uploadAndDownloadFile} from "@/lib/api";
import {notify} from "@/lib/notify";
import {getFriendlyErrorMessage} from "@/lib/errorHandler";
import SignaturePad from "@/components/pdf/SignaturePad";
import {DraggableSignaturePlaceholder} from "@/components/pdf/DraggableSignaturePlaceholder";

interface PageDimensions {
    width: number;
    height: number;
}

type Stamp = {
    id: number;
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
};

interface PdfJsPage {
    rotate: number;
    getViewport: (options: { scale: number; rotation?: number }) => { width: number; height: number };
    render: (options: {
        canvasContext: CanvasRenderingContext2D;
        viewport: unknown;
        canvas?: HTMLCanvasElement;
    }) => { promise: Promise<void>; cancel: () => void };
}

interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

interface SignPdfToolProps {
    baseFile: File | null;
    onSignedFile: (file: File) => Promise<void>;
}

async function loadPdfJs() {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
    return pdfjs;
}

export default function SignPdfTool({baseFile, onSignedFile}: SignPdfToolProps) {
    const {requireAuth} = useAuth();

    const [pageDimensions, setPageDimensions] = useState<Record<number, PageDimensions>>({});
    const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [pagePreviewUrl, setPagePreviewUrl] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [stamps, setStamps] = useState<Stamp[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const previewContainerRef = useRef<HTMLDivElement>(null);
    const previewUrlRef = useRef<string | null>(null);
    const pdfDocumentRef = useRef<PdfJsDocument | null>(null);

    const currentPageStamps = useMemo(
        () => stamps.filter((s) => s.page === currentPage),
        [stamps, currentPage]
    );

    const cleanupPreviewUrl = useCallback(() => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
    }, []);

    const setPreviewBlob = useCallback(
        (blob: Blob) => {
            cleanupPreviewUrl();
            const url = URL.createObjectURL(blob);
            previewUrlRef.current = url;
            setPagePreviewUrl(url);
        },
        [cleanupPreviewUrl]
    );

    useEffect(() => {
        return () => {
            cleanupPreviewUrl();
            if (signatureUrl) URL.revokeObjectURL(signatureUrl);
        };
    }, [cleanupPreviewUrl, signatureUrl]);

    useEffect(() => {
        if (!signatureBlob) {
            setSignatureUrl(null);
            setStamps([]);
            return;
        }

        const url = URL.createObjectURL(signatureBlob);
        setSignatureUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [signatureBlob]);

    const fetchPreview = useCallback(async (targetFile: File, pageNum: number) => {
        try {
            setIsPreviewLoading(true);
            const formData = new FormData();
            formData.append("file", targetFile);
            formData.append("page", pageNum.toString());

            const previewBlob = await uploadAndDownloadFile("/api/conversion/preview/page", formData);
            setPreviewBlob(previewBlob);
        } catch (err) {
            console.error(err);
            notify(`Could not load preview for page ${pageNum}`);
        } finally {
            setIsPreviewLoading(false);
        }
    }, [setPreviewBlob]);

    useEffect(() => {
        if (!baseFile) {
            setCurrentPage(1);
            setTotalPages(1);
            setPagePreviewUrl(null);
            setStamps([]);
            setPageDimensions({});
            setSuccess(false);
            setError(null);
            pdfDocumentRef.current = null;
            cleanupPreviewUrl();
            return;
        }

        let cancelled = false;

        const loadDocument = async () => {
            try {
                setSuccess(false);
                setError(null);
                setStamps([]);
                setCurrentPage(1);
                setIsPreviewLoading(true);

                const pdfjs = await loadPdfJs();
                const arrayBuffer = await baseFile.arrayBuffer();
                const pdfDoc = await pdfjs.getDocument({data: arrayBuffer}).promise;
                pdfDocumentRef.current = pdfDoc as unknown as PdfJsDocument;

                if (cancelled) return;

                setTotalPages(pdfDoc.numPages);

                const dims: Record<number, PageDimensions> = {};
                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const viewport = page.getViewport({scale: 1});
                    dims[i] = {width: viewport.width, height: viewport.height};
                }

                if (!cancelled) {
                    setPageDimensions(dims);
                }

                await fetchPreview(baseFile, 1);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setError(getFriendlyErrorMessage(err));
                    setTotalPages(999);
                    notify("Could not read PDF pages.");
                }
            } finally {
                if (!cancelled) {
                    setIsPreviewLoading(false);
                }
            }
        };

        void loadDocument();

        return () => {
            cancelled = true;
        };
    }, [baseFile, fetchPreview, cleanupPreviewUrl]);

    const handlePageChange = async (newPage: number) => {
        if (!baseFile) return;
        if (newPage < 1 || newPage > totalPages) return;

        setCurrentPage(newPage);
        await fetchPreview(baseFile, newPage);
    };


    const handleAddStamp = () => {
        if (!signatureUrl) return;

        const page = previewContainerRef.current;

        const x = page
            ? page.clientWidth / 2 - 75
            : 50;

        const y = page
            ? page.clientHeight / 2 - 25
            : 50;

        setStamps(prev => [
            ...prev,
            {
                id: Date.now(),
                page: currentPage,
                x,
                y,
                w: 150,
                h: 50,
            },
        ]);
    };

    const updateStampPosition = (
        id: number,
        x: number,
        y: number,
        w: number,
        h: number,
    ) => {
        setStamps(prev =>
            prev.map(s => {
                if (s.id !== id) return s;

                if (
                    s.x === x &&
                    s.y === y &&
                    s.w === w &&
                    s.h === h
                ) {
                    return s;
                }

                return {
                    ...s,
                    x,
                    y,
                    w,
                    h,
                };
            }),
        );
    };

    const removeStamp = (id: number) => {
        setStamps((prev) => prev.filter((s) => s.id !== id));
    };

    const handleSignDocument = () => {
        requireAuth(async () => {
            if (!baseFile || !signatureBlob || stamps.length === 0) {
                notify("Please place at least one signature on the document.");
                return;
            }

            try {
                setIsProcessing(true);
                setSuccess(false);
                setError(null);

                const container = previewContainerRef.current;
                if (!container) throw new Error("Preview container lost");

                const img = container.querySelector("img");
                if (!img) throw new Error("Preview image missing");

                const rect = img.getBoundingClientRect();

                const backendStamps = stamps.map((stamp) => {
                    const pageDim = pageDimensions[stamp.page];
                    if (!pageDim) {
                        throw new Error(`Missing dimensions for page ${stamp.page}`);
                    }

                    const scaleX = pageDim.width / rect.width;
                    const scaleY = pageDim.height / rect.height;

                    return {
                        page: stamp.page,
                        x: stamp.x * scaleX,
                        y: stamp.y * scaleY,
                        width: stamp.w * scaleX,
                        height: stamp.h * scaleY,
                    };
                });

                const formData = new FormData();
                formData.append("file", baseFile);
                formData.append("signature", new File([signatureBlob], "signature.png", {type: "image/png"}));
                formData.append("stamps", JSON.stringify(backendStamps));

                const responseBlob = await uploadAndDownloadFile("/api/structure/sign", formData);
                const signedFile = new File([responseBlob], `signed_${baseFile.name}`, {type: "application/pdf"});

                await onSignedFile(signedFile);
                setSuccess(true);
                notify("Signed PDF loaded into Studio.");
            } catch (err: any) {
                console.error(err);
                setError(err?.message || getFriendlyErrorMessage(err));
                notify(err?.message || "Failed to sign document");
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8 text-[color:var(--muted)]">
                <p>Select or upload a document in Studio first.</p>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-5">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-5">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]">
                            <PenTool size={16} className="text-indigo-500"/>
                            Signature Settings
                        </h3>

                        <div className="space-y-3">
                            <p className="text-xs text-[color:var(--muted)]">
                                Create a signature, then place it on the current page preview.
                            </p>

                            <div
                                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-4">
                                <div className="flex items-center justify-between">
                                    <span
                                        className="text-sm font-semibold text-[color:var(--foreground)]">Current page</span>
                                    <span
                                        className="text-sm font-bold text-indigo-500">{currentPage} / {totalPages === 999 ? "?" : totalPages}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                    <span className="text-sm text-[color:var(--muted)]">Placed stamps</span>
                                    <span
                                        className="text-sm font-semibold text-[color:var(--foreground)]">{stamps.length}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">1.
                                Create Signature</h2>
                            <div
                                className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-2">
                                {/* SignaturePad from your existing components can be dropped in here */}
                                <div
                                    className="rounded-xl border border-dashed border-[color:var(--border)] p-4 text-xs text-[color:var(--muted)]">
                                    <SignaturePad onSignatureChange={setSignatureBlob}/>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div
                                className="rounded-2xl border border-red-500/20 bg-red-50/50 p-4 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div
                                className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-500"/>
                                <div className="text-xs">
                                    <p className="font-semibold">Signed successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The signed PDF has been loaded back into Studio.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleSignDocument}
                            disabled={isProcessing || !signatureBlob || stamps.length === 0}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>}
                            Stamp {stamps.length} Signature{stamps.length !== 1 ? "s" : ""}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col lg:col-span-7">
                <div
                    className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/30 p-4">
                    <div
                        className="mb-4 flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-sm font-bold text-[color:var(--foreground)]">
                        <span className="flex items-center gap-2">
                            <PenTool size={16} className="text-indigo-500"/>
                            Signature Preview
                        </span>

                        <div
                            className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono text-xs text-[color:var(--muted)] select-none">
                            <button
                                type="button"
                                disabled={currentPage <= 1 || isPreviewLoading}
                                onClick={() => handlePageChange(currentPage - 1)}
                                className="transition hover:text-[color:var(--foreground)] disabled:opacity-20"
                            >
                                <ChevronLeft size={14}/>
                            </button>
                            <span>
                                Page {currentPage} of {totalPages === 999 ? "?" : totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={currentPage >= totalPages || isPreviewLoading}
                                onClick={() => handlePageChange(currentPage + 1)}
                                className="transition hover:text-[color:var(--foreground)] disabled:opacity-20"
                            >
                                <ChevronRight size={14}/>
                            </button>
                        </div>
                    </div>

                    <div
                        className="relative flex-1 overflow-auto rounded-xl border border-[color:var(--border)] bg-gray-500/5 dark:bg-black/20">
                        <div className="flex min-h-full min-w-full items-start justify-center p-6">
                            {isPreviewLoading && (
                                <div
                                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-[color:var(--background)]/40 backdrop-blur-sm">
                                    <Loader2 className="animate-spin text-indigo-500" size={32}/>
                                    <p className="text-xs font-semibold text-[color:var(--muted)]">Loading
                                        Page {currentPage}...</p>
                                </div>
                            )}

                            {pagePreviewUrl && (
                                <div
                                    ref={previewContainerRef}
                                    className="relative inline-block shadow-2xl border border-neutral-700/50"
                                >
                                    <img
                                        src={pagePreviewUrl}
                                        alt={`Page ${currentPage}`}
                                        draggable={false}
                                        className="block max-w-full h-auto select-none pointer-events-none"
                                    />

                                    {currentPageStamps.map((stamp) => (
                                        <DraggableSignaturePlaceholder
                                            key={stamp.id}
                                            signatureUrl={signatureUrl!}
                                            initialX={stamp.x}
                                            initialY={stamp.y}
                                            initialWidth={stamp.w}
                                            initialHeight={stamp.h}
                                            onPositionChange={(x,y,w,h)=>
                                                updateStampPosition(stamp.id,x,y,w,h)
                                            }
                                            onRemove={() => removeStamp(stamp.id)}
                                        />
                                    ))}
                                </div>
                            )}

                            {!pagePreviewUrl && !isPreviewLoading && (
                                <div className="flex flex-col items-center gap-2 text-[color:var(--muted)]">
                                    <PenTool size={34}/>
                                    <p className="text-sm font-medium">No page preview loaded.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={handleAddStamp}
                            disabled={!signatureUrl}
                            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Plus size={14}/> Add Signature to Page {currentPage}
                        </button>

                        <span className="text-xs text-[color:var(--muted)]">
                            Drag and reposition the signature on the preview.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

