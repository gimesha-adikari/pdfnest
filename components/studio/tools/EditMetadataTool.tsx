"use client";

import { useEffect, useState } from "react";
import { BookOpen, FileText, Loader2, ShieldCheck, Tags, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";

type CustomPdfFile = File & {
    originalPassword?: string;
};

interface EditMetadataToolProps {
    baseFile: File | null;
    onMetadataUpdated: (file: File) => Promise<void>;
}

export default function EditMetadataTool({
                                                   baseFile,
                                                   onMetadataUpdated,
                                               }: EditMetadataToolProps) {
    const { requireAuth } = useAuth();

    const [title, setTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [subject, setSubject] = useState("");
    const [keywords, setKeywords] = useState("");

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingFile, setIsReadingFile] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!baseFile) {
            setTitle("");
            setAuthor("");
            setSubject("");
            setKeywords("");
            setSuccess(false);
            setIsProcessing(false);
            setIsReadingFile(false);
            return;
        }

        let cancelled = false;

        const loadMetadataFromBackend = async () => {
            try {
                setIsReadingFile(true);

                const formData = new FormData();
                formData.append("file", baseFile);

                const responseBlob = await uploadAndDownloadFile("/api/structure/metadata/fetch", formData);
                const jsonText = await responseBlob.text();
                const properties: Record<string, string> = JSON.parse(jsonText);

                if (cancelled) return;

                setTitle(properties["title"] || baseFile.name.replace(/\.pdf$/i, ""));
                setAuthor(properties["author"] || "");
                setSubject(properties["subject"] || "");
                setKeywords(properties["keywords"] || "");
            } catch (err) {
                if (cancelled) return;
                console.error(err);
                handleClientError(err);
                setTitle(baseFile.name.replace(/\.pdf$/i, ""));
            } finally {
                if (!cancelled) {
                    setIsReadingFile(false);
                }
            }
        };

        void loadMetadataFromBackend();

        return () => {
            cancelled = true;
        };
    }, [baseFile]);

    const handleMetadataUpdate = () => {
        requireAuth(async () => {
            if (!baseFile) return;

            const validFile = baseFile as CustomPdfFile;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("title", title.trim());
                formData.append("author", author.trim());
                formData.append("subject", subject.trim());
                formData.append("keywords", keywords.trim());

                if (validFile.originalPassword) {
                    formData.append("file_password", validFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/update-metadata", formData);

                const updatedFile = new File(
                    [responseBlob],
                    `${validFile.name.replace(/\.pdf$/i, "")}-meta.pdf`,
                    { type: "application/pdf" }
                );

                await onMetadataUpdated(updatedFile);
                setSuccess(true);
                notify("Metadata loaded into Studio.","success");
            } catch (err) {
                if (err != null){
                    console.error(err);
                    handleClientError(err);
                }
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8 text-muted">
                <p>Select or upload a document in Studio first.</p>
            </div>
        );
    }

    const fileSizeMB = (baseFile.size / 1024 / 1024).toFixed(2);

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-12">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Tags size={16} className="text-indigo-500" />
                            Edit Metadata
                        </h3>

                        <p className="mt-2 text-xs text-muted">
                            Update hidden document properties like title, author, subject, and keywords.
                        </p>

                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-border p-4">
                                <p className="text-sm text-muted">Document size</p>
                                <p className="mt-1 text-xl font-bold text-foreground">{fileSizeMB} MB</p>
                            </div>
                            <div className="rounded-2xl border border-border p-4">
                                <p className="text-sm text-muted">Status</p>
                                <p className="mt-1 text-xl font-bold text-indigo-500">
                                    {isReadingFile ? "Reading" : "Ready"}
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 space-y-4">
                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                                    <FileText size={12} /> Document Title
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g., Q3 Financial Report"
                                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                                    <User size={12} /> Author / Creator
                                </label>
                                <input
                                    type="text"
                                    value={author}
                                    onChange={(e) => setAuthor(e.target.value)}
                                    placeholder="e.g., Jane Doe, Acme Corp"
                                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                                    <BookOpen size={12} /> Subject Matter
                                </label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="e.g., Quarterly Earnings Summary"
                                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                                    <Tags size={12} /> Search Keywords (Comma separated)
                                </label>
                                <input
                                    type="text"
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                    placeholder="finance, q3, report, earnings"
                                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        {isReadingFile && (
                            <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-(--background)/40 p-3 text-xs text-muted">
                                <Loader2 size={14} className="animate-spin text-indigo-500" />
                                Reading metadata from the current document...
                            </div>
                        )}

                        {success && (
                            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                                <div className="text-xs">
                                    <p className="font-semibold">Metadata updated successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The updated document has been loaded back into Studio.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleMetadataUpdate}
                            disabled={isProcessing || isReadingFile}
                            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Tags size={16} />}
                            Update Document Properties
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
