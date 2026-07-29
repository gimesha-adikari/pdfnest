"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ShieldCheck,
    Loader2,
    RefreshCw,
    Cpu,
    Languages,
    ChevronDown,
    Check,
} from "lucide-react";
import { getBaseUrl, uploadAndDownloadFile } from "@/lib/api";
import { handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import { PdfProgressTracker } from "@/components/pdf/PdfProgressTracker";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { getOCRLanguages, type OCRLanguage } from "@/lib/ocr";

const AUTO_LANGUAGE: OCRLanguage = { code: "auto", name: "Auto detect" };

export default function PdfToTextWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [taskId, setTaskId] = useState<string>("");

    const [languages, setLanguages] = useState<OCRLanguage[]>([
        AUTO_LANGUAGE,
        { code: "eng", name: "English" },
    ]);
    const [defaultLang, setDefaultLang] = useState("auto");
    const [lang, setLang] = useState("auto");
    const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);
    const [isLanguageOpen, setIsLanguageOpen] = useState(false);
    const [languageSearch, setLanguageSearch] = useState("");

    const languagePickerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                setIsLoadingLanguages(true);
                const data = await getOCRLanguages();

                if (cancelled) return;

                const nextLanguages = data.languages?.length
                    ? data.languages
                    : [{ code: "eng", name: "English" }];

                const nextLanguagesWithAuto = [
                    AUTO_LANGUAGE,
                    ...nextLanguages.filter((item) => item.code !== "auto"),
                ];

                setLanguages(nextLanguagesWithAuto);
                setDefaultLang("auto");
                setLang("auto");
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setLanguages([
                        AUTO_LANGUAGE,
                        { code: "eng", name: "English" },
                    ]);
                    setDefaultLang("auto");
                    setLang("auto");
                }
            } finally {
                if (!cancelled) setIsLoadingLanguages(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const onMouseDown = (event: MouseEvent) => {
            if (!languagePickerRef.current) return;
            if (!languagePickerRef.current.contains(event.target as Node)) {
                setIsLanguageOpen(false);
                setLanguageSearch("");
            }
        };

        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, []);

    const selectedLanguage = useMemo(() => {
        return (
            languages.find((item) => item.code === lang) ?? {
                code: lang,
                name: lang,
            }
        );
    }, [lang, languages]);

    const filteredLanguages = useMemo(() => {
        const q = languageSearch.trim().toLowerCase();
        if (!q) return languages;

        return languages.filter(
            (item) =>
                item.name.toLowerCase().includes(q) ||
                item.code.toLowerCase().includes(q)
        );
    }, [languageSearch, languages]);

    const handleOcrExtraction = async () => {
        requireAuth(async () => {
            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);
                setTaskId("");

                const formData = new FormData();
                formData.append("file", file);

                if ((file as any).originalPassword) {
                    formData.append("file_password", (file as any).originalPassword);
                }

                formData.append("lang", lang.trim() || defaultLang || "auto");

                const responseBlob = await uploadAndDownloadFile(
                    "/api/ocr/extract-text-async",
                    formData
                );

                const jsonText = await responseBlob.text();
                const data = JSON.parse(jsonText);

                if (data.taskId) {
                    setTaskId(data.taskId);
                } else {
                    throw new Error(data.error || "Failed to acquire task queue tracker.");
                }
            } catch (err) {
                console.error(err);
                handleClientError(err);
                setIsProcessing(false);
                setTaskId("");
            }
        });
    };

    const handleTaskComplete = async (downloadUrl: string) => {
        try {
            const response = await fetch(`${getBaseUrl()}${downloadUrl}`);
            if (!response.ok) {
                throw new Error("Could not download compiled plaintext payload.");
            }

            const responseBlob = await response.blob();
            const txtDownloadName = `${file?.name.replace(/\.pdf$/i, "")}-extracted-text.txt`;

            setDownloadData({
                blob: responseBlob,
                fileName: txtDownloadName,
            });

            setSuccess(true);
            setIsProcessing(false);
            setTaskId("");
            router.push(`/${toolId}/download`);
        } catch (err) {
            console.error(err);
            notify("Failed to cache processed plain text asset locally.", "error");
            setIsProcessing(false);
        }
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="PDF OCR Text Extractor"
                description="Convert scanned PDFs, image-only files, and documents into fully searchable, editable plain-text files seamlessly."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-5 space-y-6">
                        <PdfFileInfo
                            file={file}
                            onClear={() => {
                                setFile(null);
                                setSuccess(false);
                                router.push(`/${toolId}`);
                            }}
                        />

                        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4">
                            <div className="flex items-center gap-2 mb-3 text-[color:var(--foreground)]">
                                <Languages size={14} className="text-indigo-500" />
                                <h4 className="text-sm font-bold">OCR language</h4>
                            </div>

                            <div ref={languagePickerRef} className="relative">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsLanguageOpen((prev) => !prev);
                                        setLanguageSearch("");
                                    }}
                                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2.5 text-left text-sm font-medium text-[color:var(--foreground)] outline-none transition hover:border-indigo-500 focus:border-indigo-500"
                                    aria-expanded={isLanguageOpen}
                                    aria-haspopup="listbox"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate font-semibold">
                                            {selectedLanguage.name}
                                        </div>
                                        <div className="truncate text-[11px] text-[color:var(--muted)]">
                                            {selectedLanguage.code}
                                        </div>
                                    </div>
                                    <ChevronDown
                                        size={16}
                                        className={`shrink-0 transition ${isLanguageOpen ? "rotate-180" : ""}`}
                                    />
                                </button>

                                {isLanguageOpen && (
                                    <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full rounded-2xl border border-[color:var(--border)] bg-[var(--card)] shadow-2xl">
                                        <div className="border-b border-[color:var(--border)] p-3">
                                            <div className="relative">
                                                <input
                                                    value={languageSearch}
                                                    onChange={(e) => setLanguageSearch(e.target.value)}
                                                    placeholder="Search language..."
                                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] py-2 pl-3 pr-3 text-sm outline-none focus:border-indigo-500"
                                                    autoComplete="off"
                                                />
                                            </div>
                                        </div>

                                        <div className="max-h-72 overflow-y-auto p-2">
                                            {isLoadingLanguages ? (
                                                <div className="px-3 py-4 text-sm text-[color:var(--muted)]">
                                                    Loading languages...
                                                </div>
                                            ) : filteredLanguages.length === 0 ? (
                                                <div className="px-3 py-4 text-sm text-[color:var(--muted)]">
                                                    No languages match your search.
                                                </div>
                                            ) : (
                                                filteredLanguages.map((item) => {
                                                    const active = item.code === lang;

                                                    return (
                                                        <button
                                                            key={item.code}
                                                            type="button"
                                                            onClick={() => {
                                                                setLang(item.code);
                                                                setIsLanguageOpen(false);
                                                                setLanguageSearch("");
                                                            }}
                                                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition ${
                                                                active
                                                                    ? "bg-indigo-500/10 text-[color:var(--foreground)]"
                                                                    : "hover:bg-[color:var(--background)]"
                                                            }`}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="truncate text-sm font-medium">
                                                                    {item.name}
                                                                </div>
                                                                <div className="truncate text-[11px] text-[color:var(--muted)]">
                                                                    {item.code}
                                                                </div>
                                                            </div>
                                                            {active && (
                                                                <Check size={14} className="shrink-0 text-indigo-500" />
                                                            )}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {lang === "auto" && (
                                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-100">
                                    <strong>Tip:</strong> Auto detect works well for documents with unknown or multiple languages, but it may not always choose the most accurate language pack. If you know the document's primary language, selecting it manually will usually produce better OCR results.
                                </div>
                            )}

                            <p className="mt-2 text-[11px] leading-5 text-[color:var(--muted)]">
                                Choose the OCR language pack before extracting text.
                            </p>
                        </div>

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Text extracted successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The document image array was parsed successfully and your editable text file has been downloaded.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="w-full space-y-4">
                            <PdfActionButton
                                text="Extract Text Layer (OCR)"
                                loadingText="Initializing OCR engine..."
                                loading={isProcessing && !taskId}
                                disabled={!file || isLoadingLanguages}
                                onClick={handleOcrExtraction}
                            />

                            {!isProcessing && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFile(null);
                                        setSuccess(false);
                                        router.push(`/${toolId}`);
                                    }}
                                    className="w-full py-2.5 rounded-xl border border-[color:var(--border)] bg-[var(--card)] text-xs font-bold text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:border-[color:var(--muted)] transition flex items-center justify-center gap-1.5"
                                >
                                    <RefreshCw size={12} /> Reset and Upload Another Document
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-7 flex flex-col items-center justify-center bg-[color:var(--background)]/30 border border-dashed border-[color:var(--border)] rounded-2xl p-8 text-center min-h-[260px] relative overflow-hidden">
                        {isProcessing && taskId ? (
                            <div className="w-full flex flex-col items-center justify-center space-y-4">
                                <p className="text-sm font-bold text-[color:var(--foreground)]">
                                    Analyzing Typography Shapes...
                                </p>
                                <PdfProgressTracker taskId={taskId} onComplete={handleTaskComplete} />
                            </div>
                        ) : isProcessing ? (
                            <div className="space-y-3 flex flex-col items-center justify-center text-[color:var(--muted)] animate-pulse">
                                <Loader2 className="animate-spin text-indigo-500 mb-1" size={32} />
                                <p className="text-sm font-bold text-[color:var(--foreground)]">
                                    Uploading Document Data Stream...
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4 text-[color:var(--muted)] flex flex-col items-center">
                                <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500">
                                    <Cpu size={32} />
                                </div>
                                <div>
                                    <h4 className="text-md font-bold text-[color:var(--foreground)]">
                                        Ready for Character Matrix Scan
                                    </h4>
                                    <p className="text-xs mt-1 max-w-sm">
                                        Clicking extract will execute a system subprocess to turn flat pixels into readable words, numbers, and paragraphs.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}