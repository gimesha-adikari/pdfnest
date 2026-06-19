"use client";

import { useState } from "react";
import { FileText, ShieldCheck, Loader2, Eye } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import { notify } from "@/lib/notify";
import {useAuth} from "@/context/AuthContext";

export default function OfficeToPdfPage() {
    const { requireAuth } = useAuth();

    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [finalBlob, setFinalBlob] = useState<Blob | null>(null);

    const [uploadProgress, setUploadProgress] = useState(0);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const selectedFile = acceptedFiles[0];
        setFile(selectedFile);
        setSuccess(false);
        setPreviewUrl(null);
        setFinalBlob(null);

        await generateLiveOfficePreview(selectedFile);
    };

    const generateLiveOfficePreview = async (targetFile: File) => {
        try {
            setIsPreviewLoading(true);
            setUploadProgress(0);

            const formData = new FormData();
            formData.append("file", targetFile);

            const pdfBlob = await uploadAndDownloadFile("/api/conversion/office-to-pdf", formData, (progress) => {
                setUploadProgress(progress);
            });
            setFinalBlob(pdfBlob);

            const previewFormData = new FormData();
            previewFormData.append("file", new File([pdfBlob], "office_snap.pdf", { type: "application/pdf" }));

            const imageBlob = await uploadAndDownloadFile("/api/conversion/preview/page", previewFormData);

            if (previewUrl) window.URL.revokeObjectURL(previewUrl);
            setPreviewUrl(window.URL.createObjectURL(imageBlob));
        } catch (err) {
            console.error(err);
            notify("Could not compute document page preview vectors.");
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handleFinalDownload = () => {
        requireAuth(async () => {

            if (!finalBlob || !file) return;
            setIsProcessing(true);
            const downloadUrl = window.URL.createObjectURL(finalBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            link.download = `${baseName}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
            setSuccess(true);
            setIsProcessing(false);
        });
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Office to PDF Converter"
                description="Instantly convert Word documents, spreadsheets, and presentation scripts into stylized portrait PDFs with instant preview balances."
                icon={<FileText size={32} className="text-orange-500" />}
            />

            <div className="mx-auto max-w-7xl px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    <div className="lg:col-span-5 space-y-6 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">1. Stage Document</h2>
                        <PdfUploader onFilesAccepted={onDrop} title="Upload Office Asset" description=".docx, .xlsx, .pptx files" multiple={false} accept=".docx,.doc,.xlsx,.xls,.pptx,.ppt" />

                        {file && (
                            <div className="space-y-5 pt-2 animate-in fade-in duration-200">
                                <PdfFileInfo file={file} onClear={() => { setFile(null); setPreviewUrl(null); setFinalBlob(null); setSuccess(false); }} />

                                {success && (
                                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                        <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                                        <p className="text-xs font-semibold">Document conversion completed cleanly.</p>
                                    </div>
                                )}

                                {isPreviewLoading && uploadProgress > 0 && (
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-[color:var(--muted)]">
                                            <span>{uploadProgress === 90 ? "Invoking Office Processing..." : "Uploading Stream Content"}</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-[color:var(--background)] rounded-full overflow-hidden border border-[color:var(--border)]">
                                            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    </div>
                                )}

                                <PdfActionButton text="Save PDF Document" loadingText="Locking Binary Tracks..." loading={isProcessing} disabled={isProcessing || !finalBlob} onClick={handleFinalDownload} />
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-7 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                            <Eye size={16} />
                            <span>2. Real-Time Document Layout</span>
                        </h2>

                        <div className="relative w-full aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] overflow-hidden flex items-center justify-center p-4">
                            {isPreviewLoading && (
                                <div className="absolute inset-0 bg-[color:var(--card)]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                                    <p className="text-xs font-semibold text-[color:var(--muted)]">
                                        {uploadProgress < 90 ? `Streaming Document Tracks (${uploadProgress}%)` : "Invoking Server-Side Office Subprocesses..."}
                                    </p>
                                </div>
                            )}

                            {previewUrl ? (
                                <div className="w-full h-full flex items-center justify-center overflow-auto shadow-inner bg-neutral-900 rounded-xl p-2">
                                    <img src={previewUrl} alt="Office Document Layout Preview" className="max-w-full max-h-full object-contain rounded-md border border-neutral-700/50 shadow-2xl" />
                                </div>
                            ) : (
                                <div className="text-center p-8 space-y-2">
                                    <FileText size={40} className="mx-auto text-[color:var(--border)] stroke-[1.5]" />
                                    <p className="text-xs font-medium text-[color:var(--muted)] max-w-xs mx-auto"> Staging area empty. Drop a Word file, slide deck, or sheet layout template into the upload workspace panel. </p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
            <PdfFeatures />
        </PdfToolLayout>
    );
}