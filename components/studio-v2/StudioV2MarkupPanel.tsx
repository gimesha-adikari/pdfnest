"use client";

import React from "react";
import { Loader2, Trash2, X } from "lucide-react";
import {
  StudioJobDTO,
  StudioMarkupAction,
  StudioMarkupBox,
} from "@/lib/studio-v2/api";

interface StudioV2MarkupPanelProps {
  action: StudioMarkupAction;
  boxes: StudioMarkupBox[];
  job: StudioJobDTO | null;
  error: string | null;
  disabled?: boolean;
  onActionChange: (action: StudioMarkupAction) => void;
  onClear: () => void;
  onRemoveBox: (boxId: string) => void;
  onApply: () => void;
  onCancel: () => void;
  onCancelJob: () => void;
}

const actionLabels: Record<StudioMarkupAction, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "Strikeout",
};

const actionColors: Record<StudioMarkupAction, string> = {
  highlight: "#FFFF00",
  underline: "#FF4D4D",
  strikeout: "#FF0000",
};

function isTerminal(job: StudioJobDTO | null) {
  return Boolean(job && ["succeeded", "failed", "cancelled"].includes(job.status));
}

export const StudioV2MarkupPanel: React.FC<StudioV2MarkupPanelProps> = ({
  action,
  boxes,
  job,
  error,
  disabled = false,
  onActionChange,
  onClear,
  onRemoveBox,
  onApply,
  onCancel,
  onCancelJob,
}) => {
  const busy = Boolean(job && !isTerminal(job));
  const canApply = boxes.length > 0 && !busy && !disabled;

  return (
    <section className="space-y-3 rounded border border-violet-400/30 bg-violet-500/5 p-3" aria-label="Markup tools">
      <div>
        <h3 className="text-xs font-semibold text-[#F5F7FA]">Markup</h3>
        <p className="mt-1 text-[10px] leading-4 text-[#9AA1AD]">
          Choose a tool, then drag over text on any page. Regions use the page&apos;s native PDF coordinates.
        </p>
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
                ? "border-violet-400 bg-violet-500/20 text-white"
                : "border-[#3b3742] text-[#D8DCE3] hover:border-violet-400"
            }`}
          >
            <span className="mx-auto mb-1 block h-1.5 w-6 rounded" style={{ backgroundColor: actionColors[candidate] }} />
            {actionLabels[candidate]}
          </button>
        ))}
      </div>

      <div className="rounded border border-[#292D35] bg-[#14171C] p-2 text-[10px] text-[#D8DCE3]" aria-live="polite">
        <div className="flex items-center justify-between">
          <span>{boxes.length} region{boxes.length === 1 ? "" : "s"} selected</span>
          <button type="button" onClick={onClear} disabled={boxes.length === 0 || busy} className="text-[#9AA1AD] hover:text-white disabled:opacity-40" aria-label="Clear markup regions">
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
