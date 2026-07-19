"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tags, ShieldCheck, FileText, User, BookOpen, Loader2 } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";

export default function EditMetadataWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [title, setTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [subject, setSubject] = useState("");
    const [keywords, setKeywords] = useState("");

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingFile, setIsReadingFile] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!file) return;

        const loadMetadataFromBackend = async () => {
            setIsReadingFile(true);
            try {
                const formData = new FormData();
                formData.append("file", file);

                const responseBlob = await uploadAndDownloadFile("/api/structure/metadata/fetch", formData);
                const jsonText = await responseBlob.text();
                const properties: Record<string, string> = JSON.parse(jsonText);

                setTitle(properties["title"] || file.name.replace(/\.pdf$/i, ""));
                setAuthor(properties["author"] || "");
                setSubject(properties["subject"] || "");
                setKeywords(properties["keywords"] || "");
            } catch (err) {
                console.error(err);
                handleClientError(err);
                setTitle(file.name.replace(/\.pdf$/i, ""));
            } finally {
                setIsReadingFile(false);
            }
        };

        loadMetadataFromBackend();
    }, [file]);

    const handleMetadataUpdate = async () => {
        requireAuth(async () => {
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

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${file.name.replace(/\.pdf$/i, "")}-meta.pdf`
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
                title="Edit PDF Metadata"
                description="Modify hidden document properties like Title, Author, Subject, and SEO Keywords for better search indexing."
            />

            <div className="mt-12 rounded-3xl border border-border bg-[var(--card)] p-8 shadow-lg relative">
                <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-5 space-y-6">
                        <div className="flex flex-col gap-2">
                            <PdfFileInfo file={file} onClear={() => {
                                setFile(null);
                                router.push(`/${toolId}`);
                            }} />
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
                                disabled={isReadingFile}
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
            </div>
        </>
    );
}