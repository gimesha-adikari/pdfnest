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
    AlertTriangle,
    Lock,
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
import { useAsyncTask } from "@/hooks/useAsyncTask";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";

const AUTO_LANGUAGE: OCRLanguage = { code: "auto", name: "Auto detect" };

export default function PdfToTextWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessingLocal, setIsProcessingLocal] = useState(false);
    const [localProgress, setLocalProgress] = useState(0);
    const [isLocalCancelling, setIsLocalCancelling] = useState(false);
    const [localStatus, setLocalStatus] = useState<string | null>(null);
    const localAbortControllerRef = useRef<AbortController | null>(null);
    const [success, setSuccess] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");
    const [deviceOcrWarning, setDeviceOcrWarning] = useState<string | null>(null);

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
        return () => {
            if (localAbortControllerRef.current) {
                localAbortControllerRef.current.abort();
                localAbortControllerRef.current = null;
            }
        };
    }, []);

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
                // Expected when offline; gracefully fall back to default languages
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

    const handleTaskComplete = async (downloadUrl: string) => {
        try {
            // The durable task contract may return either a backend-relative
            // path or the absolute authenticated download URL built by
            // useAsyncTask. Do not concatenate the base twice.
            const resolvedDownloadUrl = /^https?:\/\//i.test(downloadUrl)
                ? downloadUrl
                : `${getBaseUrl()}${downloadUrl}`;
            const response = await fetch(resolvedDownloadUrl, {
                credentials: "include",
            });
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
            setIsProcessingLocal(false);
            router.push(`/${toolId}/download`);
        } catch (err) {
            console.error(err);
            notify("Failed to cache processed plain text asset locally.", "error");
            setIsProcessingLocal(false);
        }
    };

    const {
        taskId,
        status: taskStatus,
        progress,
        error: taskError,
        isSubmitting,
        isCancelling,
        canRestart,
        submitTask,
        cancelTask,
        restartTask,
        resetTask,
        registerSubmission,
    } = useAsyncTask("pdf-to-text", handleTaskComplete);

    const isProcessing = isProcessingLocal || isSubmitting || taskStatus === "PENDING" || taskStatus === "PROCESSING";

    const triggerCloudOcrTask = async (targetFile: File, password?: string, selectedLang: string = "eng") => {
        const submitFn = async () => {
            const formData = new FormData();
            formData.append("file", targetFile);

            if (password) {
                formData.append("file_password", password);
            }

            formData.append("lang", selectedLang);

            const responseBlob = await uploadAndDownloadFile(
                "/api/ocr/extract-text-async",
                formData
            );

            const jsonText = await responseBlob.text();
            const data = JSON.parse(jsonText);

            if (data.taskId) {
                return data.taskId;
            } else {
                throw new Error(data.error || "Failed to acquire task queue tracker.");
            }
        };

        registerSubmission(submitFn);

        const formData = new FormData();
        formData.append("file", targetFile);
        if (password) {
            formData.append("file_password", password);
        }
        formData.append("lang", selectedLang);

        await submitTask("/api/ocr/extract-text-async", formData, submitFn);
    };

    const handleCancelLocal = () => {
        if (localAbortControllerRef.current) {
            setIsLocalCancelling(true);
            localAbortControllerRef.current.abort();
            localAbortControllerRef.current = null;
            setIsProcessingLocal(false);
            setLocalStatus("CANCELLED");
        }
    };

    const handleClearOrReset = () => {
        if (localAbortControllerRef.current) {
            localAbortControllerRef.current.abort();
            localAbortControllerRef.current = null;
        }
        resetTask();
        setIsProcessingLocal(false);
        setIsLocalCancelling(false);
        setLocalStatus(null);
        setLocalProgress(0);
        setFile(null);
        setSuccess(false);
        setDeviceOcrWarning(null);
        router.push(`/${toolId}`);
    };

    const handleTextExtraction = async () => {
        requireAuth(async () => {
            if (!file) return;

            const controller = new AbortController();
            localAbortControllerRef.current = controller;

            try {
                setIsProcessingLocal(true);
                setIsLocalCancelling(false);
                setLocalStatus("PROCESSING");
                setLocalProgress(0);
                setSuccess(false);
                setDeviceOcrWarning(null);

                const targetFile = file;
                const password = (file as any).originalPassword;
                const selectedLang = lang.trim() || defaultLang || "auto";

                // Explicit Cloud Mode: Directly initiate the cloud OCR task
                if (processingMode === "cloud") {
                    setIsProcessingLocal(false);
                    setLocalStatus(null);
                    await triggerCloudOcrTask(targetFile, password, selectedLang);
                    return;
                }

                // Auto or Device mode: Attempt local extraction via ExecutionManager
                try {
                    const result = await ExecutionManager.run({
                        tool: "pdf_to_text",
                        files: [targetFile],
                        params: { lang: selectedLang, mode: processingMode },
                        mode: processingMode,
                        password,
                        allowFallback: false,
                        signal: controller.signal,
                        onProgress: (pct) => {
                            if (!controller.signal.aborted) {
                                setLocalProgress(pct);
                            }
                        },
                    });

                    if (controller.signal.aborted) {
                        return;
                    }

                    // Check if result has scanned pages warning in Device mode
                    const hasScanned = (result.blob as any)?.hasScannedPages;
                    if (hasScanned && processingMode === "device") {
                        const scannedPages = (result.blob as any)?.scannedPages || [];
                        setDeviceOcrWarning(
                            `Device Mode: ${scannedPages.length} image-only page(s) contain no selectable text layer. Full OCR character extraction requires Cloud processing.`
                        );
                    }

                    const txtDownloadName = `${targetFile.name.replace(/\.pdf$/i, "")}-extracted-text.txt`;
                    setDownloadData({
                        blob: result.blob,
                        fileName: txtDownloadName,
                    });

                    setSuccess(true);
                    setLocalStatus("COMPLETED");
                    setLocalProgress(100);
                    router.push(`/${toolId}/download`);
                } catch (clientErr: any) {
                    if (
                        controller.signal.aborted ||
                        clientErr?.code === "USER_CANCELLATION" ||
                        clientErr?.name === "AbortError"
                    ) {
                        setLocalStatus("CANCELLED");
                        return;
                    }

                    // In Auto mode, if local extraction detected scanned pages requiring OCR, fall back to Cloud OCR task
                    if (processingMode === "auto" && clientErr?.code === "UNSUPPORTED_CLIENT_OP") {
                        setIsProcessingLocal(false);
                        setLocalStatus(null);
                        await triggerCloudOcrTask(targetFile, password, selectedLang);
                        return;
                    }
                    throw clientErr;
                }
            } catch (err: any) {
                if (
                    controller.signal.aborted ||
                    err?.code === "USER_CANCELLATION" ||
                    err?.name === "AbortError"
                ) {
                    setLocalStatus("CANCELLED");
                    return;
                }
                console.error(err);
                handleClientError(err);
            } finally {
                localAbortControllerRef.current = null;
                setIsProcessingLocal(false);
                setIsLocalCancelling(false);
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="PDF to Text & OCR Extractor"
                description="Extract native vector text layers directly on this device or convert scanned image-only PDF pages into searchable plain text."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-5 space-y-6">
                        <PdfFileInfo
                            file={file}
                            onClear={handleClearOrReset}
                        />

                        {/* Processing Mode Selector */}
                        <div className="space-y-3">
                            <ProcessingModeSelector
                                mode={processingMode}
                                onChange={(m) => {
                                    setProcessingMode(m);
                                    setDeviceOcrWarning(null);
                                }}
                                disabled={isProcessing}
                            />

                            <div className="flex items-center gap-2 text-xs text-[color:var(--muted)] px-1">
                                <Lock size={12} className="text-emerald-500 shrink-0" />
                                <span>
                                    {processingMode === "cloud"
                                        ? "Cloud Mode: Full document and scanned pages processed via server-side OCR engine."
                                        : processingMode === "device"
                                        ? "Device Mode: Text layer extracted 100% on this device. Never leaves your browser."
                                        : "Auto Mode: Fast on-device extraction for text PDFs; Cloud OCR fallback for scanned pages."}
                                </span>
                            </div>
                        </div>

                        {/* OCR Language Selector (Relevant for Cloud / Scanned Fallback) */}
                        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4">
                            <div className="flex items-center gap-2 mb-3 text-[color:var(--foreground)]">
                                <Languages size={14} className="text-indigo-500" />
                                <h4 className="text-sm font-bold">OCR language (for scanned pages)</h4>
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

                            <p className="mt-2 text-[11px] leading-5 text-[color:var(--muted)]">
                                Used when server-side OCR is needed for image-only pages.
                            </p>
                        </div>

                        {deviceOcrWarning && (
                            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200 flex items-start gap-3">
                                <AlertTriangle className="text-amber-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Partial Text Extracted</p>
                                    <p className="mt-0.5 text-amber-800/80 dark:text-amber-200/70">
                                        {deviceOcrWarning}
                                    </p>
                                </div>
                            </div>
                        )}

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Text extracted successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The document text layer was parsed successfully and your plaintext file is ready.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="w-full space-y-4">
                            <PdfActionButton
                                text={processingMode === "cloud" ? "Extract Text via Cloud OCR" : "Extract Text"}
                                loadingText="Extracting text layers..."
                                loading={isProcessing && !taskId}
                                disabled={!file || isProcessing}
                                onClick={handleTextExtraction}
                            />

                            {!isProcessing && (
                                <button
                                    type="button"
                                    onClick={handleClearOrReset}
                                    className="w-full py-2.5 rounded-xl border border-[color:var(--border)] bg-[var(--card)] text-xs font-bold text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:border-[color:var(--muted)] transition flex items-center justify-center gap-1.5"
                                >
                                    <RefreshCw size={12} /> Reset and Upload Another Document
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-7 flex flex-col items-center justify-center bg-[color:var(--background)]/30 border border-dashed border-[color:var(--border)] rounded-2xl p-8 text-center min-h-[260px] relative overflow-hidden">
                        {taskId || taskStatus ? (
                            <div className="w-full flex flex-col items-center justify-center space-y-4">
                                <PdfProgressTracker
                                    taskId={taskId}
                                    status={taskStatus || undefined}
                                    progress={progress}
                                    error={taskError}
                                    isCancelling={isCancelling}
                                    canRestart={canRestart}
                                    onCancel={cancelTask}
                                    onRestart={restartTask}
                                    onReupload={handleClearOrReset}
                                    onComplete={handleTaskComplete}
                                />
                            </div>
                        ) : isProcessingLocal || localStatus ? (
                            <div className="w-full flex flex-col items-center justify-center space-y-4">
                                <PdfProgressTracker
                                    taskId=""
                                    status={
                                        isLocalCancelling
                                            ? "CANCELLED"
                                            : localStatus === "CANCELLED"
                                            ? "CANCELLED"
                                            : localStatus === "COMPLETED"
                                            ? "COMPLETED"
                                            : "PROCESSING"
                                    }
                                    progress={localProgress}
                                    error={localStatus === "CANCELLED" ? "Text extraction was cancelled." : undefined}
                                    isCancelling={isLocalCancelling}
                                    canRestart={localStatus === "CANCELLED"}
                                    onCancel={handleCancelLocal}
                                    onRestart={() => {
                                        setLocalStatus(null);
                                        setLocalProgress(0);
                                        handleTextExtraction();
                                    }}
                                    onReupload={handleClearOrReset}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4 text-[color:var(--muted)] flex flex-col items-center">
                                <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500">
                                    <Cpu size={32} />
                                </div>
                                <div>
                                    <h4 className="text-md font-bold text-[color:var(--foreground)]">
                                        Ready for Text Extraction
                                    </h4>
                                    <p className="text-xs mt-1 max-w-sm">
                                        Extract selectable vector text directly on your device, or run server-side OCR on scanned documents.
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
