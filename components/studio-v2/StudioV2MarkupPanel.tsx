"use client";

import React from "react";
import { Loader2, Redo2, Trash2, Undo2, X, ScanText, Sparkles } from "lucide-react";
import {
  StudioJobDTO,
  StudioMarkupAction,
  StudioMarkupBox,
  StudioMarkupMode,
  StudioMarkupAnalysis,
} from "@/lib/studio-v2/api";
import { StudioV2ColorPicker } from "./StudioV2ColorPicker";

interface StudioV2MarkupPanelProps {
  action: StudioMarkupAction;
  mode: StudioMarkupMode;
  boxes: StudioMarkupBox[];
  analysis: StudioMarkupAnalysis | null;
  analysisLoading?: boolean;
  analysisError?: string | null;
  job: StudioJobDTO | null;
  error: string | null;
  disabled?: boolean;
  onActionChange: (action: StudioMarkupAction) => void;
  onModeChange: (mode: StudioMarkupMode) => void;
  color: string;
  onColorChange: (color: string) => void;
  onClear: () => void;
  onRemoveBox: (boxId: string) => void;
  onApply: () => void;
  onCancel: () => void;
  onCancelJob: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

const actionLabels: Record<StudioMarkupAction, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "Strikeout",
};

const actionDefaultColors: Record<StudioMarkupAction, string> = {
  highlight: "#FFFF00",
  underline: "#FF4D4D",
  strikeout: "#FF0000",
};

function isTerminal(job: StudioJobDTO | null) {
  return Boolean(job && ["succeeded", "failed", "cancelled"].includes(job.status));
}

export const StudioV2MarkupPanel: React.FC<StudioV2MarkupPanelProps> = ({
  action,
  mode,
  boxes,
  analysis,
  analysisLoading = false,
  analysisError = null,
  job,
  error,
  disabled = false,
  onActionChange,
  onModeChange,
  color,
  onColorChange,
  onClear,
  onRemoveBox,
  onApply,
  onCancel,
  onCancelJob,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const busy = Boolean(job && !isTerminal(job));
  const canApply = boxes.length > 0 && !busy && !disabled;

  return (
    <section className="space-y-3 rounded border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] p-3" aria-label="Markup tools">
      <div>
        <h3 className="text-xs font-semibold text-[#F5F7FA]">Markup</h3>
        <p className="mt-1 text-[10px] leading-4 text-[#9AA1AD]">
          Choose Highlight, Underline, or Strikeout, then drag a region on the canvas. Smart uses native text first and OCR only when needed.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-3 gap-1" role="group" aria-label="Markup mode">
          {(["smart", "manual", "ocr"] as StudioMarkupMode[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => onModeChange(candidate)}
              disabled={busy || disabled}
              aria-pressed={mode === candidate}
              data-testid={`studio-markup-mode-${candidate}`}
              className={`rounded border px-1 py-2 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === candidate
                  ? "border-[var(--studio-border-active)] bg-[var(--studio-cta)]/15 text-white"
                  : "border-[var(--studio-border)] text-[#D8DCE3] hover:border-[var(--studio-border-hover)]"
              }`}
            >{candidate === "smart" ? "Smart" : candidate === "manual" ? "Manual" : "OCR"}</button>
          ))}
        </div>
        <div className="flex items-center gap-1" aria-label="Pending markup history">
          <button type="button" onClick={onUndo} disabled={!canUndo || busy || disabled} title="Undo pending markup (Ctrl+Z)" data-testid="studio-markup-undo" className="rounded p-1.5 text-[#D8DCE3] hover:bg-[#292D35] disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onRedo} disabled={!canRedo || busy || disabled} title="Redo pending markup (Ctrl+Y)" data-testid="studio-markup-redo" className="rounded p-1.5 text-[#D8DCE3] hover:bg-[#292D35] disabled:opacity-30"><Redo2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Markup action">
        {(Object.keys(actionLabels) as StudioMarkupAction[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => onActionChange(candidate)}
            disabled={busy || disabled}
            aria-pressed={action === candidate}
            data-testid={`studio-markup-action-${candidate}`}
            className={`rounded border px-1 py-2 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              action === candidate
                ? "border-[var(--studio-border-active)] bg-[var(--studio-cta)]/15 text-white"
                : "border-[var(--studio-border)] text-[#D8DCE3] hover:border-[var(--studio-border-hover)]"
            }`}
          >
            <span className="mx-auto mb-1 block h-1.5 w-6 rounded" style={{ backgroundColor: candidate === action ? color : actionDefaultColors[candidate] }} />
            {actionLabels[candidate]}
          </button>
        ))}
      </div>

      <StudioV2ColorPicker value={color} onChange={onColorChange} label={`${actionLabels[action]} color`} disabled={busy || disabled} testId="studio-markup-color" />

      <div className="rounded border border-[#292D35] bg-[#14171C] p-2 text-[10px] text-[#D8DCE3]" data-testid="studio-markup-guidance" aria-live="polite">
        <div className="flex items-start gap-2">
          {mode === "ocr" ? <ScanText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" /> : <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />}
          <span>{mode === "manual" ? "Manual marks the exact rectangle you draw." : mode === "ocr" ? "OCR explicitly analyzes the selected page region, including scanned content." : "Smart snaps to native PDF text first and falls back to OCR for scanned or textless regions."}</span>
        </div>
        {analysisLoading && <div className="mt-1 text-[#9AA1AD]">Checking page structure…</div>}
        {analysisError && <div className="mt-1 text-amber-200">Page analysis unavailable; Smart will still use its worker text-first fallback.</div>}
        {analysis && boxes.length > 0 && (() => {
          const page = analysis.pages.find((candidate) => candidate.page === boxes[boxes.length - 1].page);
          if (!page) return null;
          return <div className="mt-1 text-[#9AA1AD]">Page {page.page}: {page.kind === "scanned" ? "scanned content; Smart will use OCR" : page.kind === "mixed" ? "mixed content; Smart prefers native text" : page.kind === "text" ? "selectable text detected" : `${page.kind} page`}</div>;
        })()}
      </div>

      <div className="rounded border border-[#292D35] bg-[#14171C] p-2 text-[10px] text-[#D8DCE3]" aria-live="polite">
        <div className="flex items-center justify-between">
          <span>{boxes.length} region{boxes.length === 1 ? "" : "s"} selected</span>
          <button type="button" onClick={onClear} disabled={boxes.length === 0 || busy} className="text-[#9AA1AD] hover:text-white disabled:opacity-40" aria-label="Clear markup regions" data-testid="studio-markup-clear">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {boxes.length > 0 && (
          <div className="mt-2 max-h-20 space-y-1 overflow-y-auto border-t border-[#292D35] pt-2">
            {boxes.map((box, index) => (
              <div key={box.id} className="flex items-center justify-between gap-2 font-mono text-[9px] text-[#9AA1AD]" data-testid={`studio-markup-region-${index + 1}`}>
                <span className="truncate">Page {box.page}: {Math.round(box.x)},{Math.round(box.y)} {Math.round(box.width)}×{Math.round(box.height)}</span>
                <button type="button" onClick={() => onRemoveBox(box.id)} disabled={busy} aria-label={`Remove markup region ${index + 1}`} className="shrink-0 text-[#9AA1AD] hover:text-white disabled:opacity-40">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {job && (
        <div className={`rounded border px-2 py-2 text-[10px] ${job.status === "failed" ? "border-red-800/80 bg-red-950/30 text-red-200" : "border-[#3b3742] bg-[#14171C] text-[#D8DCE3]"}`} data-testid="studio-markup-job-status" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <span>{job.status === "succeeded" ? "Markup applied" : job.status === "cancelled" ? "Markup cancelled" : job.status === "failed" ? "Markup failed" : `Markup ${job.status}`}</span>
            {!isTerminal(job) && <button type="button" onClick={onCancelJob} className="text-[#d2bbff] hover:text-white" data-testid="studio-markup-cancel">Cancel</button>}
          </div>
          {job.status !== "succeeded" && job.status !== "failed" && job.status !== "cancelled" && <div className="mt-1 text-[#9AA1AD]">{job.progress}%{job.message ? ` · ${job.message}` : ""}</div>}
          {job.error && <div className="mt-1 text-red-200">{job.error}</div>}
        </div>
      )}
      {error && <p className="text-[10px] text-red-200" role="status">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="flex-1 rounded border border-[#3b3742] px-2 py-2 text-[11px] text-[#D8DCE3] hover:border-white/40 disabled:opacity-40">Cancel</button>
        <button type="button" onClick={onApply} disabled={!canApply} data-testid="studio-markup-apply" className="flex-[2] rounded border border-violet-400/70 px-2 py-2 text-[11px] text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? <><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Applying…</> : `Apply ${actionLabels[action]}`}
        </button>
      </div>
    </section>
  );
};
