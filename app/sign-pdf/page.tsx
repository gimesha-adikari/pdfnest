"use client";

import { useState, useRef, useEffect } from "react";
import { PenTool, ShieldCheck, FileText, Loader2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { notify } from "@/lib/notify";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import SignaturePad from "@/components/pdf/SignaturePad";
import DraggableSignature from "@/components/pdf/DraggableSignature";
import {useAuth} from "@/context/AuthContext";

type Stamp = { id: number; page: number; x: number; y: number; w: number; h: number };

export default function SignPdfPage() {
    const { requireAuth } = useAuth();

    const [file, setFile] = useState<File | null>(null);
    const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1); // Tracks the actual PDF length
    const [pagePreviewUrl, setPagePreviewUrl] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const previewContainerRef = useRef<HTMLDivElement>(null);

    const [stamps, setStamps] = useState<Stamp[]>([]);

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (signatureBlob) {
            const url = URL.createObjectURL(signatureBlob);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSignatureUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setSignatureUrl(null);
            setStamps([]);
        }
    }, [signatureBlob]);

    const fetchPreview = async (targetFile: File, pageNum: number) => {
        try {
            setIsPreviewLoading(true);
            const formData = new FormData();
            formData.append("file", targetFile);
            formData.append("page", pageNum.toString());

            const previewBlob = await uploadAndDownloadFile("/api/conversion/preview/page", formData);
            setPagePreviewUrl(URL.createObjectURL(previewBlob));
        } catch (err) {
            notify("Could not load preview for page " + pageNum);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handleFileUpload = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const selectedFile = acceptedFiles[0];

        setFile(selectedFile);
        setCurrentPage(1);
        setStamps([]);
        setSuccess(false);

        try {
            const pdfjs = await import("pdfjs-dist");
            pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
            const arrayBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            setTotalPages(pdfDoc.numPages);
        } catch (err) {
            console.warn("Could not read PDF page count", err);
            setTotalPages(999);
        }

        await fetchPreview(selectedFile, 1);
    };

    const handlePageChange = async (newPage: number) => {
        if (newPage < 1 || newPage > totalPages || !file) return;
        setCurrentPage(newPage);
        await fetchPreview(file, newPage);
    };

    const handleAddStamp = () => {
        if (!signatureUrl) return;
        // Add a new stamp to the current page at position 50,50
        setStamps([...stamps, { id: Date.now(), page: currentPage, x: 50, y: 50, w: 150, h: 50 }]);
    };

    const updateStampPosition = (id: number, x: number, y: number, w: number, h: number) => {
        setStamps(prevStamps => prevStamps.map(s => s.id === id ? { ...s, x, y, w, h } : s));
    };

    const removeStamp = (id: number) => {
        setStamps(prevStamps => prevStamps.filter(s => s.id !== id));
    };

    const handleSignDocument = async () => {
        requireAuth(async () => {

            if (!file || !signatureBlob || stamps.length === 0) {
                notify("Please place at least one signature on the document.");
                return;
            }

            try {
                setIsProcessing(true);
                setSuccess(false);

                const container = previewContainerRef.current;
                if (!container) throw new Error("Preview container lost");

                const PDF_WIDTH_POINTS = 595;
                const scaleFactor = PDF_WIDTH_POINTS / container.clientWidth;

                const backendStamps = stamps.map(stamp => {
                    const finalX = stamp.x * scaleFactor;
                    const flippedY = container.clientHeight - stamp.y - stamp.h;
                    const finalY = flippedY * scaleFactor;

                    return {
                        page: stamp.page,
                        x: Math.round(finalX),
                        y: Math.round(finalY)
                    };
                });

                const formData = new FormData();
                formData.append("file", file);
                formData.append("signature", new File([signatureBlob], "signature.png", {type: "image/png"}));
                formData.append("stamps", JSON.stringify(backendStamps)); // Send array to Go

                const responseBlob = await uploadAndDownloadFile("/api/structure/sign", formData);

                const downloadUrl = window.URL.createObjectURL(responseBlob);
                const link = document.createElement("a");
                link.href = downloadUrl;
                link.download = `signed_${file.name}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(downloadUrl);

                setSuccess(true);
            } catch (err: any) {
                notify(err.message || "Failed to sign document");
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const currentPageStamps = stamps.filter(s => s.page === currentPage);

    return (
        <PdfToolLayout>
            <PdfToolHero title="e-Sign PDF Document" description="Place your signature on any page." icon={<PenTool size={32} className="text-indigo-500" />} />

            <div className="mt-12 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                <div className="lg:col-span-5 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-6">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)]">1. Create Signature</h2>
                    <SignaturePad onSignatureChange={setSignatureBlob} />

                    <hr className="border-[color:var(--border)]" />

                    <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)]">2. Upload Document</h2>
                    {!file ? (
                        <PdfUploader onFilesAccepted={handleFileUpload} title="Upload Document" description="PDF file to sign" multiple={false} accept=".pdf" />
                    ) : (
                        <div className="space-y-4">
                            <PdfFileInfo file={file} onClear={() => { setFile(null); setPagePreviewUrl(null); setStamps([]); }} />

                            {success && (
                                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                    <ShieldCheck className="text-emerald-500 shrink-0" size={18} />
                                    <p className="text-xs font-semibold mt-0.5">Signed successfully!</p>
                                </div>
                            )}

                            <PdfActionButton
                                text={`Stamp ${stamps.length} Signature${stamps.length !== 1 ? 's' : ''}`}
                                loadingText="Applying signatures..."
                                loading={isProcessing}
                                disabled={isProcessing || !file || !signatureBlob || stamps.length === 0}
                                onClick={handleSignDocument}
                            />
                        </div>
                    )}
                </div>

                <div className="lg:col-span-7 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg min-h-[600px] flex flex-col">

                    <div className="flex items-center justify-between mb-4 bg-[color:var(--background)] p-2 rounded-xl border border-[color:var(--border)]">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={!file || currentPage <= 1}
                                className="p-1.5 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span className="text-sm font-bold text-[color:var(--muted)] px-2">
                                Page {currentPage} of {totalPages === 999 ? "?" : totalPages}
                            </span>
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={!file || currentPage >= totalPages}
                                className="p-1.5 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        {file && signatureUrl && (
                            <button onClick={handleAddStamp} className="flex items-center gap-2 text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                                <Plus size={14} /> Add Signature to Page {currentPage}
                            </button>
                        )}
                    </div>

                    <div className="flex-1 relative w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] overflow-hidden flex items-center justify-center p-4">
                        {!file && !isPreviewLoading && (
                            <div className="text-center space-y-2 text-[color:var(--muted)]">
                                <FileText size={40} className="mx-auto stroke-[1.5]" />
                                <p className="text-xs font-medium">Upload a document to view the staging area.</p>
                            </div>
                        )}

                        {isPreviewLoading && (
                            <div className="absolute inset-0 bg-[color:var(--card)]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="animate-spin text-indigo-500" size={32} />
                                <p className="text-xs font-semibold text-[color:var(--muted)]">Loading Page {currentPage}...</p>
                            </div>
                        )}

                        {pagePreviewUrl && (
                            <div ref={previewContainerRef} className="relative shadow-2xl border border-neutral-700/50">
                                <img src={pagePreviewUrl} alt={`Page ${currentPage}`} className="max-w-full max-h-[700px] object-contain pointer-events-none" />

                                {currentPageStamps.map((stamp) => (
                                    <DraggableSignature
                                        key={stamp.id}
                                        signatureUrl={signatureUrl!}
                                        containerRef={previewContainerRef}
                                        initialX={stamp.x}
                                        initialY={stamp.y}
                                        onPositionChange={(x, y, w, h) => updateStampPosition(stamp.id, x, y, w, h)}
                                        onRemove={() => removeStamp(stamp.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </PdfToolLayout>
    );
}