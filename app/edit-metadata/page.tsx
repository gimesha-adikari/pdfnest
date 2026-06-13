"use client";

import { useState } from "react";
import { Tags, ShieldCheck, FileText, User, BookOpen, Loader2, X } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import { notify } from "@/lib/notify";

export default function MetadataPage() {
    const [file, setFile] = useState<File | null>(null);

    const [title, setTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [subject, setSubject] = useState("");
    const [keywords, setKeywords] = useState("");

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingFile, setIsReadingFile] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleClearFile = () => {
        setFile(null);
        setSuccess(false);
        setTitle("");
        setAuthor("");
        setSubject("");
        setKeywords("");
    };

    const loadMetadataFromBackend = async (targetFile: File) => {
        setIsReadingFile(true);
        try {
            const formData = new FormData();
            formData.append("file", targetFile);

            const responseBlob = await uploadAndDownloadFile("/api/structure/metadata/fetch", formData);

            const jsonText = await responseBlob.text();
            const properties: Record<string, string> = JSON.parse(jsonText);

            setTitle(properties["title"] || targetFile.name.replace(/\.pdf$/i, ""));
            setAuthor(properties["author"] || "");
            setSubject(properties["subject"] || "");
            setKeywords(properties["keywords"] || "");
        } catch (err) {
            console.error(err);
            notify(getFriendlyErrorMessage(err));
        } finally {
            setIsReadingFile(false);
        }
    };

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];

        setFile(uploadedFile);
        setSuccess(false);

        setTitle(uploadedFile.name.replace(/\.pdf$/i, ""));
        setAuthor("");
        setSubject("");
        setKeywords("");

        await loadMetadataFromBackend(uploadedFile);
    };

    const handleMetadataUpdate = async () => {
        if (!file) return;

        try {
            setIsProcessing(true);
            setSuccess(false);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("title", title.trim());
            formData.append("author", author.trim());
            formData.append("subject", subject.trim());
            formData.append("keywords", keywords.trim());

            const responseBlob = await uploadAndDownloadFile(
                "/api/structure/update-metadata",
                formData
            );

            const downloadUrl = window.URL.createObjectURL(responseBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `${file.name.replace(/\.pdf$/i, "")}-meta.pdf`;
            document.body.appendChild(link);
            link.click();

            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

            setSuccess(true);
        } catch (err) {
            console.error(err);
            notify(getFriendlyErrorMessage(err));
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Edit PDF Metadata"
                description="Modify hidden document properties like Title, Author, Subject, and SEO Keywords for better search indexing."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg relative">
                {!file && (
                    <PdfUploader
                        onFilesAccepted={onDrop}
                        title="Upload PDF Document"
                        description="Drop file here to access internal document property dictionaries"
                        multiple={false}
                        accept=".pdf"
                    />
                )}

                {file && (
                    <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-5 space-y-6">
                            <div className="flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={handleClearFile}
                                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-xs font-bold text-red-500 transition-colors"
                                >
                                    <X size={14} /> Remove and Change Document
                                </button>
                                <PdfFileInfo file={file} />
                            </div>

                            {success && (
                                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                    <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                    <div className="text-xs">
                                        <p className="font-semibold">Metadata dictionary updated!</p>
                                        <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">The hidden file properties were successfully modified without altering page content.</p>
                                    </div>
                                </div>
                            )}

                            <div className="w-full">
                                <PdfActionButton
                                    text="Update Document Properties"
                                    loadingText="Writing Metadata to File..."
                                    loading={isProcessing}
                                    disabled={!file || isReadingFile}
                                    onClick={handleMetadataUpdate}
                                />
                            </div>
                        </div>

                        <div className="lg:col-span-7 flex flex-col justify-start bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative">
                            {isReadingFile && (
                                <div className="absolute inset-0 z-10 bg-[color:var(--background)]/50 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center text-[color:var(--muted)]">
                                    <Loader2 className="animate-spin mb-3 text-indigo-500" size={28} />
                                    <p className="text-sm font-medium">Scanning dictionary values from server payload...</p>
                                </div>
                            )}

                            <div className="w-full flex items-center justify-between mb-6 border-b border-[color:var(--border)] pb-3 text-[color:var(--foreground)] text-sm font-bold">
                                <span className="flex items-center gap-2"><Tags size={16} className="text-indigo-500" /> Information Dictionary Editor</span>
                            </div>

                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                        <FileText size={12} /> Document Title
                                    </label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g., Q3 Financial Report"
                                        className="w-full px-4 py-3 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm outline-none focus:border-indigo-500 font-medium transition text-[color:var(--foreground)]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                        <User size={12} /> Author / Creator
                                    </label>
                                    <input
                                        type="text"
                                        value={author}
                                        onChange={(e) => setAuthor(e.target.value)}
                                        placeholder="e.g., Jane Doe, Acme Corp"
                                        className="w-full px-4 py-3 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm outline-none focus:border-indigo-500 font-medium transition text-[color:var(--foreground)]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                        <BookOpen size={12} /> Subject Matter
                                    </label>
                                    <input
                                        type="text"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        placeholder="e.g., Quarterly Earnings Summary"
                                        className="w-full px-4 py-3 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm outline-none focus:border-indigo-500 font-medium transition text-[color:var(--foreground)]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                        <Tags size={12} /> Search Keywords (Comma separated)
                                    </label>
                                    <input
                                        type="text"
                                        value={keywords}
                                        onChange={(e) => setKeywords(e.target.value)}
                                        placeholder="finance, Q3, report, earnings"
                                        className="w-full px-4 py-3 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm outline-none focus:border-indigo-500 font-medium transition text-[color:var(--foreground)]"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}