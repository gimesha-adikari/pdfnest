"use client";

import { useMemo, useState } from "react";
import { Tags, ShieldCheck, FileText, User, BookOpen, Key, Loader2 } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";

export default function MetadataPage() {
    const [file, setFile] = useState<File | null>(null);

    // Metadata state fields
    const [title, setTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [subject, setSubject] = useState("");
    const [keywords, setKeywords] = useState("");

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingFile, setIsReadingFile] = useState(false);
    const [success, setSuccess] = useState(false);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];

        setFile(uploadedFile);
        setSuccess(false);
        setIsReadingFile(true);

        // Set a fallback title just in case the PDF has no title metadata
        setTitle(uploadedFile.name.replace(/\.pdf$/i, ""));
        setAuthor("");
        setSubject("");
        setKeywords("");

        try {
            // Reuse the PDF.js library already installed for your previewers
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

            const arrayBuffer = await uploadedFile.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);

            const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

            // Extract the internal dictionary properties
            const metaData = await pdf.getMetadata();

            if (metaData && metaData.info) {
                const info = metaData.info as any;

                // Populate state if the properties exist inside the document
                if (info.Title) setTitle(info.Title);
                if (info.Author) setAuthor(info.Author);
                if (info.Subject) setSubject(info.Subject);
                if (info.Keywords) setKeywords(info.Keywords);
            }
        } catch (error) {
            console.error("Metadata extraction failed:", error);
            // We don't alert the user here because the tool still works perfectly
            // even if the frontend fails to pre-fill the existing data.
        } finally {
            setIsReadingFile(false);
        }
    };

    const handleMetadataUpdate = async () => {
        if (!file) return;

        try {
            setIsProcessing(true);
            setSuccess(false);

            const formData = new FormData();
            formData.append("file", file);

            // Append only if the user typed something
            if (title.trim()) formData.append("title", title.trim());
            if (author.trim()) formData.append("author", author.trim());
            if (subject.trim()) formData.append("subject", subject.trim());
            if (keywords.trim()) formData.append("keywords", keywords.trim());

            await uploadAndDownloadFile("/structure/update-metadata", formData, `${file.name.replace(/\.pdf$/i, "")}-meta.pdf`);

            setSuccess(true);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : "Failed to update PDF properties.");
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

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <PdfUploader
                    onFilesAccepted={onDrop}
                    title="Upload PDF Document"
                    description="Drop file here to access internal document property dictionaries"
                />

                {file && (
                    <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-5 space-y-6">
                            <PdfFileInfo file={file} />

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
                                    disabled={!file || isReadingFile || (!title && !author && !subject && !keywords)}
                                    onClick={handleMetadataUpdate}
                                />
                            </div>
                        </div>

                        <div className="lg:col-span-7 flex flex-col justify-start bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative">

                            {/* Optional Loading Overlay while extracting data */}
                            {isReadingFile && (
                                <div className="absolute inset-0 z-10 bg-[color:var(--background)]/50 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center text-[color:var(--muted)]">
                                    <Loader2 className="animate-spin mb-3 text-indigo-500" size={28} />
                                    <p className="text-sm font-medium">Scanning dictionary...</p>
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
                                        <Key size={12} /> Search Keywords (Comma separated)
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