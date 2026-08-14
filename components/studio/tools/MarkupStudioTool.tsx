"use client";

import { Loader2 } from "lucide-react";
import MarkupAnalysisPanel from "@/components/markup/MarkupAnalysisPanel";
import MarkupCanvasStage from "@/components/markup/MarkupCanvasStage";
import MarkupHistoryControls from "@/components/markup/MarkupHistoryControls";
import MarkupJobProgress from "@/components/markup/MarkupJobProgress";
import MarkupModeFields from "@/components/markup/MarkupModeFields";
import MarkupSelectionRow from "@/components/markup/MarkupSelectionRow";
import MarkupSuccessBanner from "@/components/markup/MarkupSuccessBanner";
import { useMarkupEditor } from "@/hooks/useMarkupEditor";
import { MARKUP_TOOLS } from "@/lib/markup/config";
import type { MarkupKind } from "@/lib/markup/types";

interface MarkupStudioToolProps {
    kind: MarkupKind;
    baseFile: File | null;
    onProcessedFile: (file: File) => Promise<void>;
}

/**
 * Studio panel shared by the highlight, underline and strikeout tools: draw
 * boxes on the page, submit the markup job and hand the result back to Studio.
 */
export default function MarkupStudioTool({ kind, baseFile, onProcessedFile }: MarkupStudioToolProps) {
    const editor = useMarkupEditor({
        kind,
        file: baseFile,
        successNotice: MARKUP_TOOLS[kind].studioSuccessNotice,
        onComplete: ({ file }) => onProcessedFile(file),
    });

    const { config } = editor;
    const Icon = config.icon;

    if (!baseFile) return null;

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-5">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="space-y-5 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]">
                            <Icon size={16} className="text-indigo-500" />
                            {config.configurationTitle}
                        </h3>

                        <div className="flex items-center justify-between gap-3">
                            <MarkupHistoryControls
                                canUndo={editor.canUndo}
                                canRedo={editor.canRedo}
                                onUndo={editor.undo}
                                onRedo={editor.redo}
                            />
                            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/40 px-3 py-2 text-xs font-medium text-[color:var(--muted)]">
                                Page {editor.currentPage} / {editor.totalPages || "?"}
                            </div>
                        </div>

                        <MarkupModeFields
                            config={config}
                            mode={editor.mode}
                            onModeChange={editor.setMode}
                            canUseSmartMode={editor.canUseSmartMode}
                            selectedColor={editor.selectedColor}
                            onColorChange={editor.setSelectedColor}
                            className="space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-4"
                        />

                        <MarkupAnalysisPanel editor={editor} />

                        {editor.activeId && (
                            <MarkupSelectionRow label={config.selectedBoxLabel} onDelete={editor.deleteActiveBox} />
                        )}

                        {editor.success && (
                            <MarkupSuccessBanner
                                title={config.successTitle}
                                description={config.studioSuccessDescription}
                            />
                        )}

                        <MarkupJobProgress editor={editor} />

                        <button
                            type="button"
                            onClick={editor.submit}
                            disabled={editor.isProcessing || editor.isRenderingCanvas || editor.boxes.length === 0}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {editor.isProcessing ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Icon size={16} />
                            )}
                            {config.saveLabel}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col lg:col-span-7">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/30 p-4">
                    <MarkupCanvasStage
                        editor={editor}
                        stageClassName="flex items-start justify-start overflow-auto"
                    />
                </div>
            </div>
        </div>
    );
}
