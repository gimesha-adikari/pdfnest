"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusSquare, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";

type CustomPdfFile = File & {
    originalPassword?: string;
};

interface InsertBlankToolProps {
    baseFile: File | null;
    currentPageIndex: number;
    totalPages: number;
    onInsertedFile: (file: File) => Promise<void>;
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function InsertBlankTool({
                                            baseFile,
                                            currentPageIndex,
                                            totalPages,
                                            onInsertedFile,
                                        }: InsertBlankToolProps) {
    const { requireAuth } = useAuth();

    const [insertAt, setInsertAt] = useState<"start" | "end" | "after">("end");
    const [targetPage, setTargetPage] = useState<number>(1);
    const [numPages, setNumPages] = useState<number>(1);

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const fileExtractedSize = useMemo(() => {
        if (!baseFile) return "0.00";
        return formatMB(baseFile.size);
    }, [baseFile]);

    useEffect(() => {
        if (!baseFile) {
            setInsertAt("end");
            setTargetPage(1);
            setNumPages(1);
            setSuccess(false);
            setIsProcessing(false);
            return;
        }

        setSuccess(false);
        setTargetPage(Math.max(1, Number.isFinite(currentPageIndex) ? currentPageIndex + 1 : 1));
    }, [baseFile, currentPageIndex]);

    const handleInsertProcessing = () => {
        if (!baseFile) return;

        const validFile = baseFile as CustomPdfFile;

        if (numPages > 10) {
            notify("You can insert a maximum of 10 blank pages at one time.","warning");
            return;
        }

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("insertAt", insertAt);
                formData.append("count", String(numPages));

                if (insertAt === "after") {
                    formData.append("targetPage", String(targetPage));
                }

                if (validFile.originalPassword) {
                    formData.append("file_password", validFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/insert-blank", formData);

                const outputFile = new File(
                    [responseBlob],
                    `${validFile.name.replace(/\.pdf$/i, "")}-with-blank.pdf`,
                    { type: "application/pdf" }
                );

                await onInsertedFile(outputFile);
                setSuccess(true);
                notify("Blank pages loaded into Studio.","success");
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

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col col-span-full">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <PlusSquare size={16} className="text-indigo-500" />
                            Insert Blank Pages
                        </h3>

                        <div className="mt-5 grid gap-4 lg:grid-cols-2">
                            <div className="space-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted">
                                        Insert Strategy
                                    </label>
                                    <select
                                        value={insertAt}
                                        onChange={(e) => setInsertAt(e.target.value as "start" | "end" | "after")}
                                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5
                                        text-sm font-medium text-foreground outline-none transition
                                        focus:border-indigo-500"
                                    >
                                        <option value="start">At the absolute beginning</option>
                                        <option value="end">At the absolute end</option>
                                        <option value="after">After a specific page</option>
                                    </select>
                                </div>

                                {insertAt === "after" && (
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold uppercase text-muted">
                                            Insert After Page Number
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={totalPages || 1}
                                            value={targetPage}
                                            onChange={(e) =>
                                                setTargetPage(
                                                    Math.max(
                                                        1,
                                                        Math.min(
                                                            totalPages || 1,
                                                            parseInt(e.target.value, 10) || 1
                                                        )
                                                    )
                                                )
                                            }
                                            className="w-full rounded-xl border border-border bg-background px-4 py-2.5
                                            text-sm font-medium text-foreground outline-none transition
                                            focus:border-indigo-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setTargetPage(
                                                    Math.max(
                                                        1,
                                                        Number.isFinite(currentPageIndex)
                                                            ? currentPageIndex + 1
                                                            : 1
                                                    )
                                                )
                                            }
                                            className="w-fit rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs font-semibold text-indigo-500 transition hover:bg-indigo-500/10"
                                        >
                                            Use Current ({Number.isFinite(currentPageIndex) ? currentPageIndex + 1 : 1})
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold uppercase text-muted">
                                        Number of Blank Sheets to Add (Max 10)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={numPages}
                                        onChange={(e) =>
                                            setNumPages(
                                                Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1))
                                            )
                                        }
                                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5
                                        text-sm font-medium text-foreground outline-none transition
                                        focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-border p-4">
                                        <p className="text-sm text-muted">Current page</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">
                                            {Number.isFinite(currentPageIndex) ? currentPageIndex + 1 : 1}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-border p-4">
                                        <p className="text-sm text-muted">Total pages</p>
                                        <p className="mt-1 text-xl font-bold text-indigo-500">{totalPages}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border p-4">
                                        <p className="text-sm text-muted">Blank pages</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">{numPages}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border p-4">
                                        <p className="text-sm text-muted">Source size</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">
                                            {fileExtractedSize} MB
                                        </p>
                                    </div>
                                </div>

                                {success && (
                                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                                        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={16} />
                                        <div className="text-xs">
                                            <p className="font-semibold">Blank pages inserted successfully!</p>
                                            <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                                The updated document has been loaded back into Studio.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleInsertProcessing}
                                    disabled={isProcessing}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl
                                    bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition
                                    hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isProcessing
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <PlusSquare size={16} />}
                                    Insert Blank Pages
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
