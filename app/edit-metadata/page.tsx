"use client";

import { useState } from "react";
import { Tags, ShieldCheck, FileText, User, BookOpen, Key, Loader2, Lock } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";

export default function MetadataPage() {
    const [file, setFile] = useState<File | null>(null);

    // Form value input states
    const [title, setTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [subject, setSubject] = useState("");
    const [keywords, setKeywords] = useState("");

    // Password orchestration states
    const [password, setPassword] = useState("");
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingFile, setIsReadingFile] = useState(false);
    const [success, setSuccess] = useState(false);

    // Pulls properties dynamically from the Go microservice
    const loadMetadataFromBackend = async (targetFile: File, userPassword = "") => {
        setIsReadingFile(true);
        try {
            const formData = new FormData();
            formData.append("file", targetFile);
            if (userPassword) {
                formData.append("password", userPassword);
            }

            const response = await fetch("http://localhost:8080/api/structure/metadata/fetch", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error("Failed to process file keys.");
            }

            const properties: Record<string, string> = await response.json();

            // Map lower-case normalized keys from backend properties payload
            setTitle(properties["title"] || targetFile.name.replace(/\.pdf$/i, ""));
            setAuthor(properties["author"] || "");
            setSubject(properties["subject"] || "");
            setKeywords(properties["keywords"] || "");

            if (userPassword) setPassword(userPassword);
            setShowPasswordModal(false);
        } catch (err) {
            console.error(err);
            alert("Could not load current document information attributes safely.");
        } finally {
            setIsReadingFile(false);
        }
    };

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];

        setFile(uploadedFile);
        setSuccess(false);
        setPassword("");

        setTitle(uploadedFile.name.replace(/\.pdf$/i, ""));
        setAuthor("");
        setSubject("");
        setKeywords("");

        try {
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

            const arrayBuffer = await uploadedFile.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);

            const loadingTask = pdfjsLib.getDocument({
                data: typedArray,
                disableWorker: false,
                isEvalSupported: false
            });

            await loadingTask.promise;
            await loadingTask.destroy();

            // File is open, pull metadata automatically
            await loadMetadataFromBackend(uploadedFile);
        } catch (error: any) {
            if (error.name === "PasswordException") {
                setShowPasswordModal(true);
            } else {
                console.error("Scanning routine failure:", error);
            }
        }
    };

    const handlePasswordUnlockSubmit = async () => {
        if (!file || !password) return;
        await loadMetadataFromBackend(file, password);
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

            if (password) {
                formData.append("password", password);
            }

            await uploadAndDownloadFile(
                "/structure/update-metadata",
                formData,
                `${file.name.replace(/\.pdf$/i, "")}-meta.pdf`
            );

            setSuccess(true);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : "Failed to save modified options.");
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
                <PdfUploader
                    onFilesAccepted={onDrop}
                    title="Upload PDF Document"
                    description="Drop file here to access internal document property dictionaries"
                />

                {showPasswordModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
                            <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-3">
                                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                                    <Lock size={20} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-[color:var(--foreground)]">Password Protected</h4>
                                    <p className="text-xs text-[color:var(--muted)]">Please provide the password to read and override metadata block tables.</p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter File Password"
                                    className="w-full px-4 py-3 bg-[var(--background)] border border-[color:var(--border)] rounded-xl text-sm outline-none focus:border-indigo-500 font-medium transition text-[color:var(--foreground)]"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && password) handlePasswordUnlockSubmit();
                                    }}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => {
                                        setFile(null);
                                        setPassword("");
                                        setShowPasswordModal(false);
                                    }}
                                    className="px-4 py-2 text-xs font-semibold text-[color:var(--muted)] hover:text-[color:var(--foreground)] transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePasswordUnlockSubmit}
                                    disabled={!password || isReadingFile}
                                    className="px-4 py-2 bg-indigo-500 text-white text-xs font-semibold rounded-xl hover:bg-indigo-600 transition disabled:opacity-50 flex items-center gap-1"
                                >
                                    {isReadingFile && <Loader2 className="animate-spin" size={12} />}
                                    Unlock & Extract
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {file && (
                    <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-5 space-y-6">
                            <PdfFileInfo file={file} />

                            {password && (
                                <div className="flex items-center gap-2 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-3 py-2 rounded-xl w-fit font-medium">
                                    <Key size={12} /> Decryption sequence configuration mounted.
                                </div>
                            )}

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