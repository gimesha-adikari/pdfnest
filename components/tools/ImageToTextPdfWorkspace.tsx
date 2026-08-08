"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
    ShieldCheck,
    Trash2,
    ArrowUp,
    ArrowDown,
    UploadCloud,
    FileType,
    Loader2,
    Image as ImageIcon,
    SlidersHorizontal,
    Languages,
    Search,
    ChevronDown,
    Check,
} from "lucide-react";
import { getBaseUrl } from "@/lib/api";
import { handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import { PdfProgressTracker } from "@/components/pdf/PdfProgressTracker";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { getOCRLanguages, type OCRLanguage } from "@/lib/ocr";
import {
    createStoragePrefix,
    createUploadSessionId,
    uploadFilesToR2,
} from "@/lib/r2";

interface ExtendedFile extends File {
    initialBatch?: File[];
    targetUrl?: string;
}

interface ImageItem {
    id: string;
    file: File;
    previewUrl: string;
}

type SortMode = "none" | "name-asc" | "name-desc" | "size-asc" | "size-desc";

const AUTO_LANGUAGE: OCRLanguage = { code: "auto", name: "Auto detect" };

const RECOMMENDED_LANGUAGE_CODES = [
    "auto",
    "eng",
    "sin",
    "tam",
    "hin",
    "spa",
    "fra",
    "deu",
    "por",
    "ita",
    "jpn",
    "kor",
    "ara",
    "chi_sim",
    "chi_tra",
    "rus",
    "vie",
    "tha",
    "ukr",
];

const OCR_JOB_ENDPOINT = `${getBaseUrl()}/api/ocr/jobs`;

function isSupportedImage(file: File) {
    const type = file.type.toLowerCase();
    return (
        type.startsWith("image/jpeg") ||
        type.startsWith("image/jpg") ||
        type.startsWith("image/png") ||
        type.startsWith("image/webp")
    );
}

function createImageItem(file: File): ImageItem {
    return {
        id: Math.random().toString(36).substring(2, 10),
        file,
        previewUrl: URL.createObjectURL(file),
    };
}

function revokeImageItems(items: ImageItem[]) {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
}

function compareByName(a: ImageItem, b: ImageItem) {
    return a.file.name.localeCompare(b.file.name, undefined, {
        numeric: true,
        sensitivity: "base",
    });
}

function compareBySize(a: ImageItem, b: ImageItem) {
    return a.file.size - b.file.size;
}

function sortItems(items: ImageItem[], mode: SortMode) {
    const next = [...items];

    switch (mode) {
        case "name-asc":
            next.sort(compareByName);
            break;
        case "name-desc":
            next.sort((a, b) => compareByName(b, a));
            break;
        case "size-asc":
            next.sort(compareBySize);
            break;
        case "size-desc":
            next.sort((a, b) => compareBySize(b, a));
            break;
        case "none":
        default:
            break;
    }

    return next;
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageToTextPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [images, setImages] = useState<ImageItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [taskId, setTaskId] = useState<string>("");
    const [sortMode, setSortMode] = useState<SortMode>("none");

    const [languages, setLanguages] = useState<OCRLanguage[]>([
        AUTO_LANGUAGE,
        { code: "eng", name: "English" },
    ]);
    const [defaultLang, setDefaultLang] = useState("auto");
    const [lang, setLang] = useState("auto");
    const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);
    const [isLanguageOpen, setIsLanguageOpen] = useState(false);
    const [languageSearch, setLanguageSearch] = useState("");

    const addMoreInputRef = useRef<HTMLInputElement | null>(null);
    const hydratedSourceRef = useRef<string>("");
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

    useEffect(() => {
        if (!file) {
            setImages((prev) => {
                revokeImageItems(prev);
                return [];
            });
            hydratedSourceRef.current = "";
            setSuccess(false);
            setTaskId("");
            setSortMode("none");
            setLang(defaultLang);
            return;
        }

        const extendedFile = file as ExtendedFile;
        const sourceFiles =
            extendedFile.initialBatch && extendedFile.initialBatch.length > 0
                ? extendedFile.initialBatch
                : [file];

        const sourceKey = `${file.name}-${file.size}-${sourceFiles.length}`;

        if (hydratedSourceRef.current === sourceKey) return;

        const nextImages = sourceFiles.filter(isSupportedImage).map(createImageItem);

        if (nextImages.length === 0) {
            notify("Please select JPG, PNG, or WebP images from the main upload page.", "warning");
            hydratedSourceRef.current = sourceKey;
            return;
        }

        setImages((prev) => {
            revokeImageItems(prev);
            return nextImages;
        });

        setSuccess(false);
        setTaskId("");
        hydratedSourceRef.current = sourceKey;
    }, [file, defaultLang]);

    useEffect(() => {
        return () => {
            revokeImageItems(images);
        };
    }, [images]);

    const selectedLanguage = useMemo(() => {
        return (
            languages.find((item) => item.code === lang) ?? {
                code: lang,
                name: lang,
            }
        );
    }, [lang, languages]);

    const recommendedLanguages = useMemo(() => {
        const byCode = new Map(languages.map((item) => [item.code, item]));
        return RECOMMENDED_LANGUAGE_CODES.map((code) => byCode.get(code)).filter(
            (item): item is OCRLanguage => Boolean(item)
        );
    }, [languages]);

    const otherLanguages = useMemo(() => {
        const recommendedSet = new Set(RECOMMENDED_LANGUAGE_CODES);
        return [...languages]
            .filter((item) => !recommendedSet.has(item.code))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }, [languages]);

    const filteredRecommended = useMemo(() => {
        const q = languageSearch.trim().toLowerCase();
        if (!q) return recommendedLanguages;

        return recommendedLanguages.filter(
            (item) =>
                item.name.toLowerCase().includes(q) ||
                item.code.toLowerCase().includes(q)
        );
    }, [languageSearch, recommendedLanguages]);

    const filteredOtherLanguages = useMemo(() => {
        const q = languageSearch.trim().toLowerCase();
        if (!q) return otherLanguages;

        return otherLanguages.filter(
            (item) =>
                item.name.toLowerCase().includes(q) ||
                item.code.toLowerCase().includes(q)
        );
    }, [languageSearch, otherLanguages]);

    const clearAll = () => {
        setImages((prev) => {
            revokeImageItems(prev);
            return [];
        });
        setFile(null);
        setSuccess(false);
        setTaskId("");
        setSortMode("none");
        setLang(defaultLang);
        hydratedSourceRef.current = "";
        router.push(`/${toolId}`);
    };

    const appendFiles = (incoming: File[]) => {
        if (!incoming || incoming.length === 0) return;

        const validFiles = incoming.filter(isSupportedImage);

        if (validFiles.length === 0) {
            notify("Please upload JPG, PNG, or WebP images.", "warning");
            return;
        }

        const newItems = validFiles.map(createImageItem);
        setImages((prev) => [...prev, ...newItems]);
        setSuccess(false);
    };

    const handleCompactDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const dropped = Array.from(e.dataTransfer.files || []);
        appendFiles(dropped);
    };

    const handleCompactInput = (e: ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files || []);
        appendFiles(selected);
        e.target.value = "";
    };

    const removeImage = (id: string) => {
        setImages((prev) => {
            const target = prev.find((item) => item.id === id);
            if (target) URL.revokeObjectURL(target.previewUrl);

            const updated = prev.filter((item) => item.id !== id);

            if (updated.length === 0) {
                setSuccess(false);
                setTaskId("");
            }

            return updated;
        });
    };

    const moveImage = (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= images.length) return;

        setImages((prev) => {
            const updated = [...prev];
            const temp = updated[index];
            updated[index] = updated[targetIndex];
            updated[targetIndex] = temp;
            return updated;
        });
        setSortMode("none");
    };

    const applySort = (mode: SortMode) => {
        setImages((prev) => sortItems(prev, mode));
        setSortMode(mode);
    };

    const pickLanguage = (code: string) => {
        setLang(code);
        setIsLanguageOpen(false);
        setLanguageSearch("");
    };

    const handleConversion = async () => {
        requireAuth(async () => {
            if (images.length === 0) return;

            try {
                setIsProcessing(true);
                setSuccess(false);
                setTaskId("");

                const imageFiles = images.map((item) => item.file);
                const nextLang = lang.trim() || defaultLang || "auto";

                const sessionId = createUploadSessionId();
                const prefix = createStoragePrefix({
                    toolId,
                    purpose: "image_to_text_pdf",
                    sessionId,
                });

                const uploaded = await uploadFilesToR2(imageFiles, {
                    purpose: "image_to_text_pdf",
                    prefix,
                    credentials: "include",
                });

                const jobResponse = await fetch(OCR_JOB_ENDPOINT, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        tool: "image_to_text_pdf",
                        lang: nextLang,
                        sessionId,
                        files: uploaded.map((item) => ({
                            key: item.key,
                            name: item.name,
                            size: item.size,
                            type: item.type,
                        })),
                    }),
                });

                if (!jobResponse.ok) {
                    const text = await jobResponse.text().catch(() => "");
                    throw new Error(text || `Failed to create OCR job (${jobResponse.status}).`);
                }

                const jobData = await jobResponse.json().catch(() => ({}));
                const nextTaskId =
                    jobData.taskId || jobData.jobId || jobData.id || jobData.task_id;

                if (!nextTaskId) {
                    throw new Error("The OCR job response did not include a task id.");
                }

                setTaskId(nextTaskId);
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
            const response = await fetch(`${getBaseUrl()}${downloadUrl}`, {
                credentials: "include",
            });
            if (!response.ok) throw new Error("Could not download compiled async file payload.");

            const responseBlob = await response.blob();

            setDownloadData({
                blob: responseBlob,
                fileName: "ocr-extracted-text.pdf",
            });

            setSuccess(true);
            setIsProcessing(false);
            setTaskId("");
            router.push(`/${toolId}/download`);
        } catch (err) {
            console.error(err);
            handleClientError(err);
            setIsProcessing(false);
        }
    };

    const canProcess = images.length > 0 && !isProcessing;

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Image to Searchable PDF"
                description="Convert one or more scanned images into a searchable PDF while preserving the original layout, colors, logos, and design."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-5 space-y-6">
                        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-[color:var(--foreground)]">
                                <ImageIcon size={16} className="text-indigo-500" />
                                <h4 className="text-sm font-bold">Add more images</h4>
                            </div>

                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleCompactDrop}
                                className="rounded-xl border border-dashed border-[color:var(--border)] bg-[var(--card)]/70 p-4"
                            >
                                <p className="text-xs text-[color:var(--muted)]">
                                    Drop extra JPG, PNG, or WebP files here, or choose them from your device.
                                </p>

                                <div className="mt-3 flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => addMoreInputRef.current?.click()}
                                        className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:brightness-105"
                                    >
                                        <UploadCloud size={14} />
                                        Add images
                                    </button>

                                    <input
                                        ref={addMoreInputRef}
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleCompactInput}
                                    />

                                    <span className="text-[11px] text-[color:var(--muted)]">
                                        You can keep adding files after the main upload.
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-[color:var(--border)] bg-[var(--card)] p-3">
                                <div className="flex items-center gap-2 mb-3 text-[color:var(--foreground)]">
                                    <SlidersHorizontal size={14} className="text-indigo-500" />
                                    <h4 className="text-sm font-bold">Sort images</h4>
                                </div>

                                <select
                                    value={sortMode}
                                    onChange={(e) => applySort(e.target.value as SortMode)}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium text-[color:var(--foreground)] outline-none transition focus:border-indigo-500"
                                >
                                    <option value="none">No sorting</option>
                                    <option value="name-asc">Name A → Z</option>
                                    <option value="name-desc">Name Z → A</option>
                                    <option value="size-asc">Size small → large</option>
                                    <option value="size-desc">Size large → small</option>
                                </select>

                                <p className="mt-2 text-[11px] leading-5 text-[color:var(--muted)]">
                                    Sorting changes the order used to build the searchable PDF.
                                </p>
                            </div>

                            <div className="rounded-xl border border-[color:var(--border)] bg-[var(--card)] p-3">
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
                                                    <Search
                                                        size={14}
                                                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
                                                    />
                                                    <input
                                                        value={languageSearch}
                                                        onChange={(e) => setLanguageSearch(e.target.value)}
                                                        placeholder="Search language..."
                                                        className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
                                                        autoComplete="off"
                                                    />
                                                </div>
                                            </div>

                                            <div className="max-h-72 overflow-y-auto p-2">
                                                {!languageSearch.trim() && filteredRecommended.length > 0 && (
                                                    <div className="mb-2">
                                                        <div className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                                            Recommended
                                                        </div>
                                                        <div className="space-y-1">
                                                            {filteredRecommended.map((item) => {
                                                                const active = item.code === lang;
                                                                return (
                                                                    <button
                                                                        key={item.code}
                                                                        type="button"
                                                                        onClick={() => pickLanguage(item.code)}
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
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                <div>
                                                    <div className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                                        All languages
                                                    </div>

                                                    <div className="space-y-1">
                                                        {filteredOtherLanguages.length === 0 &&
                                                        filteredRecommended.length === 0 ? (
                                                            <div className="px-3 py-4 text-sm text-[color:var(--muted)]">
                                                                No languages match your search.
                                                            </div>
                                                        ) : (
                                                            filteredOtherLanguages.map((item) => {
                                                                const active = item.code === lang;
                                                                return (
                                                                    <button
                                                                        key={item.code}
                                                                        type="button"
                                                                        onClick={() => pickLanguage(item.code)}
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
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {lang === "auto" && (
                                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-100">
                                        <strong>Tip:</strong> Auto detect works well for documents with unknown or multiple languages, but it may not always choose the best language pack. If you know the document's primary language, selecting it manually will usually produce more accurate OCR results.
                                    </div>
                                )}

                                <p className="mt-2 text-[11px] leading-5 text-[color:var(--muted)]">
                                    Choose the OCR language pack for this document. Multiple languages can be configured on the worker.
                                </p>
                            </div>
                        </div>

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Searchable PDF Created!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The images were combined in order and processed into one searchable PDF.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="w-full space-y-4">
                            {isProcessing && taskId ? (
                                <div className="flex flex-col items-center justify-center space-y-3 py-4 border rounded-xl border-dashed">
                                    <Loader2 className="animate-spin text-indigo-500" size={24} />
                                    <p className="text-xs font-mono text-muted-foreground animate-pulse">
                                        Tracking task: {taskId}
                                    </p>
                                    <PdfProgressTracker taskId={taskId} onComplete={handleTaskComplete} />
                                </div>
                            ) : (
                                <PdfActionButton
                                    text="Create Searchable PDF"
                                    loadingText="Uploading to R2 and creating job..."
                                    loading={isProcessing}
                                    disabled={!canProcess}
                                    onClick={handleConversion}
                                />
                            )}

                            <button
                                type="button"
                                onClick={clearAll}
                                className="w-full py-2.5 rounded-xl border border-[color:var(--border)] bg-[var(--card)] text-xs font-bold text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:border-[color:var(--muted)] transition flex items-center justify-center gap-1.5"
                            >
                                Clear and go back
                            </button>
                        </div>
                    </div>

                    <div className="lg:col-span-7 space-y-4">
                        <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-2">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                <FileType size={16} className="text-indigo-500" />
                                Selected Images ({images.length})
                            </h3>
                        </div>

                        {images.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--background)]/30 min-h-[320px] text-center p-8">
                                <div className="p-4 rounded-full mb-4 bg-[color:var(--background)] text-[color:var(--muted)]">
                                    <UploadCloud size={32} />
                                </div>
                                <h4 className="text-base font-bold text-[color:var(--foreground)]">No images selected</h4>
                                <p className="mt-2 text-sm text-[color:var(--muted)] max-w-sm">
                                    Use the shared upload page to choose the first image batch, then add more images here if needed.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {images.map((img, index) => (
                                    <div
                                        key={img.id}
                                        className="relative group rounded-xl border border-[color:var(--border)] bg-[var(--card)] p-2 flex flex-col justify-between overflow-hidden shadow-sm transition hover:border-[color:var(--muted)]"
                                    >
                                        <div className="aspect-[3/4] relative w-full rounded-lg bg-[color:var(--border)]/30 overflow-hidden flex items-center justify-center">
                                            <img
                                                src={img.previewUrl}
                                                alt={`Selected image ${index + 1}`}
                                                className="w-full h-full object-cover"
                                            />

                                            <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                                                {index + 1}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => removeImage(img.id)}
                                                className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-red-500 text-white opacity-0 group-hover:opacity-100 transition z-10"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>

                                        <div className="mt-2 px-1">
                                            <p className="text-[10px] truncate font-mono text-[color:var(--muted)]">
                                                {img.file.name}
                                            </p>
                                            <p className="text-[10px] text-[color:var(--muted)] mt-0.5">
                                                {formatBytes(img.file.size)}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-[color:var(--border)]/60 justify-end">
                                            <button
                                                type="button"
                                                disabled={index === 0}
                                                onClick={() => moveImage(index, "up")}
                                                className="p-1 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--card)] disabled:opacity-30 text-[color:var(--foreground)]"
                                                aria-label="Move image up"
                                            >
                                                <ArrowUp size={10} />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={index === images.length - 1}
                                                onClick={() => moveImage(index, "down")}
                                                className="p-1 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--card)] disabled:opacity-30 text-[color:var(--foreground)]"
                                                aria-label="Move image down"
                                            >
                                                <ArrowDown size={10} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}