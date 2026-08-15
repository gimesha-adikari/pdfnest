"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, Loader2, FileText } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { FileWithPassword } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";

import { usePreview } from "@/lib/preview/usePreview";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";

const STYLISTIC_FONTS = [
    { id: "Helvetica", name: "Sans-Serif Modern (Helvetica)", cssClass: "font-sans font-bold" },
    { id: "Times-Roman", name: "Classic Editorial (Times Roman)", cssClass: "font-serif font-medium" },
    { id: "Courier", name: "Monospace Tech (Courier)", cssClass: "font-mono font-normal" }
];

export default function PageNumbersWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [fontFamily, setFontFamily] = useState<string>("Helvetica");
    const [fontSize, setFontSize] = useState<number>(12);
    const [position, setPosition] = useState<string>("bc");
    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");

    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const preview = usePreview({
        file,
        page: 1,
        scale: 0.4,
        mode: "thumbnail",
        renderer: "client",
    });

    const handleNumberingProcessing = async () => {
        requireAuth(async () => {
            if (!file) return;

            setIsProcessing(true);
            setError(null);

            try {
                const response = await ExecutionManager.run({
                    tool: "add_page_numbers",
                    files: [file],
                    params: {
                        fontFamily,
                        fontSize,
                        position,
                    },
                    mode: processingMode,
                    password: (file as FileWithPassword).originalPassword,
                });

                setDownloadData({
                    blob: response.blob,
                    fileName: `numbered_${file.name}`,
                });

                router.push(`/${toolId}/download`);

            } catch (err) {
                console.error(err);
                setError(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Configure Page Numbers"
                description="Embed automatic sequential pagination elements across your document frames with absolute typeface alignment control."
                icon={<Hash size={32} className="text-blue-500" />}
            />

            <div className="mx-auto max-w-5xl px-4 py-8">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 lg:col-span-7">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Stylistic Typeface Profiles</h3>

                        <div className="mt-4 space-y-3">
                            {STYLISTIC_FONTS.map((font) => (
                                <button
                                    key={font.id}
                                    onClick={() => setFontFamily(font.id)}
                                    className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                                        fontFamily === font.id
                                            ? "border-blue-500 bg-blue-500/5 text-blue-600 dark:bg-blue-500/10"
                                            : "border-gray-100 bg-gray-50/50 text-gray-700 hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                                    }`}
                                >
                                    <span className={font.cssClass}>{font.name}</span>
                                    {fontFamily === font.id && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                </button>
                            ))}
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Font Scale (Points)</label>
                                <input type="number" min={6} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:text-zinc-100" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Vector Coordinates</label>
                                <select value={position} onChange={(e) => setPosition(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                                    <option value="bc">Bottom Center (Standard)</option>
                                    <option value="bl">Bottom Left</option>
                                    <option value="br">Bottom Right</option>
                                    <option value="tc">Top Center</option>
                                    <option value="tl">Top Left</option>
                                    <option value="tr">Top Right</option>
                                </select>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-50/50 p-3 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</div>
                        )}

                        <div className="w-full mt-6">
                            <PdfActionButton
                                text="Insert Sequence Tracking"
                                loadingText="Compiling Vector Pages on Server..."
                                loading={isProcessing}
                                disabled={!file}
                                onClick={handleNumberingProcessing}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 p-6 dark:border-zinc-800/50 dark:bg-zinc-900/20 lg:col-span-5 space-y-6">
                        <div className="w-full">
                            <PdfFileInfo file={file} onClear={() => { setFile(null); router.push(`/${toolId}`); }} />
                        </div>

                        <div className="w-full">
                            <ProcessingModeSelector
                                mode={processingMode}
                                onChange={setProcessingMode}
                                disabled={isProcessing}
                            />
                        </div>

                        <div className="relative my-auto flex h-64 w-full items-center justify-center rounded-xl bg-white/50 p-4 shadow-inner dark:bg-zinc-900/50">
                            {preview.isLoading ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="animate-spin text-blue-500" size={24} />
                                    <span className="text-xs text-gray-400">Rasterizing structural layers...</span>
                                </div>
                            ) : preview.src ? (
                                <div className="relative shadow-lg border border-gray-200/60 dark:border-zinc-800">
                                    <img src={preview.src} alt="Document Preview Frame" className="max-h-56 object-contain" />
                                    <div className={`absolute inset-x-0 p-2 text-[10px] font-bold text-blue-600 flex ${position.startsWith('t') ? 'top-0' : 'bottom-0'} ${position.endsWith('l') ? 'justify-start pl-4' : position.endsWith('r') ? 'justify-end pr-4' : 'justify-center'}`}>
                                        <span className="bg-blue-100 px-1 rounded shadow-sm border border-blue-300 animate-pulse">Page 1</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                    <FileText size={32} strokeWidth={1.5} />
                                    <span className="text-xs">No active preview grid structural context</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
