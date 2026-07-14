"use client";

import {useEffect, useMemo, useState} from "react";
import {useAuth} from "@/context/AuthContext";
import {uploadAndDownloadFile} from "@/lib/api";
import {handleClientError} from "@/lib/errorHandler";
import {notify} from "@/lib/notify";
import {AlertCircle, CopyPlus, Layers3, ShieldCheck, Sparkles,} from "lucide-react";

type CustomPdfFile = File & {
    originalPassword?: string;
};

interface DuplicatePagesToolProps {
    baseFile: File | null;
    currentPageIndex: number;
    totalPages: number;
    onDuplicatedFile: (file: File) => Promise<void>;
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function DuplicatePagesTool({
                                               baseFile,
                                               currentPageIndex,
                                               totalPages,
                                               onDuplicatedFile,
                                           }: DuplicatePagesToolProps) {
    const {requireAuth} = useAuth();

    const [pageSelection, setPageSelection] = useState<string>("1");
    const [numCopies, setNumCopies] = useState<number>(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const fileSizeMB = useMemo(() => {
        if (!baseFile) return "0.00";
        return formatMB(baseFile.size);
    }, [baseFile]);

    const validationError = useMemo(() => {
        if (!pageSelection.trim() || totalPages === 0) return null;

        const segments = pageSelection.split(",");
        for (const segment of segments) {
            const clean = segment.trim();
            if (!clean) continue;

            if (clean.includes("-")) {
                const [rawStart, rawEnd] = clean.split("-");
                const start = parseInt(rawStart, 10);
                const end = parseInt(rawEnd, 10);

                if (
                    Number.isNaN(start) ||
                    Number.isNaN(end) ||
                    start > totalPages ||
                    end > totalPages ||
                    start < 1 ||
                    end < 1 ||
                    start > end
                ) {
                    return `Range "${clean}" falls outside available document boundaries (Pages 1-${totalPages})`;
                }
            } else {
                const pageNum = parseInt(clean, 10);
                if (Number.isNaN(pageNum) || pageNum > totalPages || pageNum < 1) {
                    return `Page index "${clean}" is invalid or exceeds document limit (${totalPages})`;
                }
            }
        }

        return null;
    }, [pageSelection, totalPages]);

    useEffect(() => {
        if (!baseFile) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPageSelection("1");
            setNumCopies(1);
            setSuccess(false);
            setIsProcessing(false);
            return;
        }

        setSuccess(false);
        setPageSelection((prev) => (prev.trim() ? prev : "1"));
    }, [baseFile]);

    const applyPreset = (type: "current" | "all" | "even" | "odd") => {
        if (totalPages === 0) return;

        const currentPageNumber =
            Number.isFinite(currentPageIndex) ? currentPageIndex + 1 : 1;

        if (type === "current") {
            setPageSelection(String(currentPageNumber));
            return;
        }

        if (type === "all") {
            if (typeof totalPages === "number" && totalPages > 0) {
                setPageSelection(`1-${totalPages}`);
            }
            return;
        }

        if (type === "even") {
            const evens: number[] = [];
            for (let i = 2; i <= totalPages; i += 2) evens.push(i);
            setPageSelection(evens.join(", ") || "2");
            return;
        }

        const odds: number[] = [];
        for (let i = 1; i <= totalPages; i += 2) odds.push(i);
        setPageSelection(odds.join(", ") || "1");
    };

    function getSelectedPageCount(selection: string): number {
        let count = 0;

        for (const part of selection.split(",")) {
            const item = part.trim();
            if (!item) continue;

            if (item.includes("-")) {
                const [start, end] = item.split("-").map(Number);
                if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
                    count += end - start + 1;
                }
            } else {
                if (!Number.isNaN(Number(item))) {
                    count++;
                }
            }
        }

        return count;
    }

    const handleDuplicateProcessing = () => {
        if (!baseFile) return;

        if (!pageSelection.trim()) {
            notify("Please provide the page number(s) you wish to duplicate.", "info");
            return;
        }

        if (validationError) {
            notify(validationError,"error");
            return;
        }

        const selectedPageCount = getSelectedPageCount(pageSelection);

        if (selectedPageCount > 50) {
            notify("You can duplicate a maximum of 50 pages at one time.", "warning");
            return;
        }

        if (numCopies > 10) {
            notify("Maximum allowed copies per page is 10.", "warning");
            return;
        }

        const validFile = baseFile as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("pages", pageSelection.trim());
                formData.append("copies", String(numCopies));

                if (validFile.originalPassword) {
                    formData.append("file_password", validFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/duplicate", formData);

                const duplicatedFile = new File([responseBlob], `${validFile.name.replace(/\.pdf$/i, "")}-duplicated.pdf`, {
                    type: "application/pdf",
                });

                await onDuplicatedFile(duplicatedFile);
                setSuccess(true);
                notify("Duplicated pages loaded into Studio.", "success");
            } catch (err) {
                console.error(err);
                handleClientError(err);
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

    const currentPageNumber =
        typeof currentPageIndex === "number" ? currentPageIndex + 1 : 1;

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col col-span-full">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <CopyPlus size={16} className="text-indigo-500"/>
                            Duplicate Pages
                        </h3>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => applyPreset("current")}
                                className="flex items-center gap-1 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold text-indigo-500 transition hover:bg-indigo-500/20"
                            >
                                <Sparkles size={10}/>
                                Current Page ({currentPageNumber})
                            </button>
                            <button
                                type="button"
                                onClick={() => applyPreset("all")}
                                disabled={totalPages === 0}
                                className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-semibold text-muted transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                All Pages
                            </button>
                            <button
                                type="button"
                                onClick={() => applyPreset("even")}
                                disabled={totalPages === 0}
                                className="
                                rounded-lg
                                border
                                border-border
                                px-2.5 py-1
                                text-[10px]
                                font-semibold
                                text-muted
                                transition
                                hover:bg-background
                                disabled:cursor-not-allowed
                                disabled:opacity-40"
                            >
                                Evens
                            </button>
                            <button
                                type="button"
                                onClick={() => applyPreset("odd")}
                                disabled={totalPages === 0}
                                className="
                                rounded-lg
                                border
                                border-border
                                px-2.5
                                py-1
                                text-[10px]
                                font-semibold
                                text-muted
                                transition
                                hover:bg-background
                                disabled:cursor-not-allowed
                                disabled:opacity-40"
                            >
                                Odds
                            </button>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted">
                                Target Page Numbers
                            </label>
                            <input
                                type="text"
                                value={pageSelection}
                                onChange={(e) => setPageSelection(e.target.value)}
                                placeholder="e.g. 1, 3, 5-7"
                                className={`
                                w-full 
                                rounded-xl 
                                border 
                                bg-background 
                                px-4 py-2.5 
                                text-sm 
                                font-medium 
                                text-foreground 
                                outline-none 
                                transition 
                                focus:border-indigo-500 
                                ${validationError 
                                    ? "border-red-500/50" 
                                    : "border-border" +
                                    ""}`}
                            />
                            {validationError ? (
                                <span
                                    className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-red-500 animate-pulse">
                                    <AlertCircle size={12}/>
                                    {validationError}
                                </span>
                            ) : (
                                <span className="text-[10px] text-muted">
                                    Use commas for separate pages and hyphens for ranges. Maximum 50 selected pages.
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted">
                                Number of Copies per Page (Max 10)
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={50}
                                value={numCopies}
                                onChange={(e) =>
                                    setNumCopies(
                                        Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1))
                                    )
                                }
                                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none transition focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-border p-4">
                            <p className="text-sm text-muted">Document size</p>
                            <p className="mt-1 text-xl font-bold text-foreground">{fileSizeMB} MB</p>
                        </div>
                        <div className="rounded-2xl border border-border p-4">
                            <p className="text-sm text-muted">Pages</p>
                            <p className="mt-1 text-xl font-bold text-indigo-500">{totalPages}</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleDuplicateProcessing}
                        disabled={isProcessing || !!validationError}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isProcessing ? <Layers3 size={16} className="animate-spin"/> : <CopyPlus size={16}/>}
                        Duplicate pages into current document
                    </button>

                    {success && (
                        <div
                            className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-500"/>
                            <div className="text-xs">
                                <p className="font-semibold">Duplication successful!</p>
                                <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                    The duplicated document has been loaded back into Studio.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
