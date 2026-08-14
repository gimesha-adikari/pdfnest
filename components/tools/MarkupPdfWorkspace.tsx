"use client";

import { useRouter } from "next/navigation";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import MarkupAnalysisPanel from "@/components/markup/MarkupAnalysisPanel";
import MarkupCanvasStage from "@/components/markup/MarkupCanvasStage";
import MarkupHistoryControls from "@/components/markup/MarkupHistoryControls";
import MarkupJobProgress from "@/components/markup/MarkupJobProgress";
import MarkupModeFields from "@/components/markup/MarkupModeFields";
import MarkupSelectionRow from "@/components/markup/MarkupSelectionRow";
import MarkupSuccessBanner from "@/components/markup/MarkupSuccessBanner";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { useMarkupEditor } from "@/hooks/useMarkupEditor";
import { MARKUP_TOOLS } from "@/lib/markup/config";
import type { MarkupKind } from "@/lib/markup/types";

/**
 * Standalone tool page shared by the highlight, underline and strikeout
 * workspaces: draw boxes, queue the markup job and route to the download step.
 */
export default function MarkupPdfWorkspace({ kind }: { kind: MarkupKind }) {
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const editor = useMarkupEditor({
        kind,
        file,
        successNotice: MARKUP_TOOLS[kind].workspaceSuccessNotice,
        onComplete: async ({ file: processedFile, blob, fileName }) => {
            setDownloadData({ blob, fileName });
            router.push(`/${toolId}/download`);
            setFile?.(processedFile);
        },
    });

    const { config } = editor;
    const Icon = config.icon;

    if (!file) return null;

    return (
        <>
            <PdfToolHero title={config.heroTitle} description={config.heroDescription} />

            <div className="mt-12 w-full rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-12">
                    <div className="space-y-6 lg:col-span-5">
                        <PdfFileInfo
                            file={file}
                            onClear={() => {
                                setFile(null);
                                router.push(`/${toolId}`);
                            }}
                        />

                        <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/50 p-5">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="flex items-center gap-2 text-sm font-semibold">
                                    <Icon size={16} className="text-indigo-500" />
                                    {config.configurationTitle}
                                </h3>

                                <MarkupHistoryControls
                                    canUndo={editor.canUndo}
                                    canRedo={editor.canRedo}
                                    onUndo={editor.undo}
                                    onRedo={editor.redo}
                                />
                            </div>

                            <MarkupModeFields
                                config={config}
                                mode={editor.mode}
                                onModeChange={editor.setMode}
                                canUseSmartMode={editor.canUseSmartMode}
                                selectedColor={editor.selectedColor}
                                onColorChange={editor.setSelectedColor}
                                className="grid gap-3"
                            />

                            <MarkupAnalysisPanel editor={editor} />

                            {editor.activeId && (
                                <MarkupSelectionRow
                                    label={config.selectedBoxLabel}
                                    onDelete={editor.deleteActiveBox}
                                />
                            )}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-2xl border border-[color:var(--border)] bg-transparent p-4">
                                    <p className="text-sm text-[color:var(--muted)]">Source document size</p>
                                    <p className="mt-1 text-xl font-bold text-[color:var(--foreground)]">
                                        {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-[color:var(--border)] bg-transparent p-4">
                                    <p className="text-sm text-[color:var(--muted)]">Total Sheets</p>
                                    <p className="mt-1 text-xl font-bold text-indigo-500">
                                        {editor.totalPages} Pages
                                    </p>
                                </div>
                            </div>

                            <MarkupJobProgress editor={editor} />

                            <PdfActionButton
                                text={config.saveLabel}
                                loadingText={config.savingLabel}
                                loading={editor.isProcessing}
                                disabled={
                                    editor.isProcessing ||
                                    editor.isRenderingCanvas ||
                                    editor.boxes.length === 0
                                }
                                onClick={editor.submit}
                            />
                        </div>
                    </div>

                    <div className="relative flex w-full flex-col rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/30 p-6 lg:col-span-7">
                        <MarkupCanvasStage
                            editor={editor}
                            stageClassName="flex flex-col items-center justify-center overflow-hidden"
                        />

                        {editor.success && (
                            <MarkupSuccessBanner
                                title={config.successTitle}
                                description={config.workspaceSuccessDescription}
                                className="mt-6 w-full"
                            />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
