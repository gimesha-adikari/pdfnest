"use client";

import React from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import type { StudioCompressionLevel } from "@/lib/studio-v2/api";
import {
  formatStudioBytes,
  studioCompressionSummary,
  type StudioCompressMetrics,
  type StudioCompressStatus,
} from "./studioV2Compress";

interface StudioV2CompressPanelProps {
  level: StudioCompressionLevel;
  onLevelChange?: (level: StudioCompressionLevel) => void;
  status: StudioCompressStatus;
  statusMessage: string | null;
  metrics: StudioCompressMetrics | null;
  error: string | null;
  disabled?: boolean;
  onCompress?: () => void;
  onClose?: () => void;
}

export function StudioV2CompressPanel({
  level,
  onLevelChange,
  status,
  statusMessage,
  metrics,
  error,
  disabled = false,
  onCompress,
  onClose,
}: StudioV2CompressPanelProps) {
  const running = status === "starting" || status === "running";
  const canApply = !disabled && !running;

  return (
    <div data-testid="studio-compress-panel">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold">Compress current document</div>
          <p className="mt-1 text-[11px] leading-4 text-[var(--studio-muted)]">
            Creates a new immutable Studio version using the selected profile.
          </p>
        </div>
        <button type="button" onClick={onClose} className="studio-v2-focus rounded p-1 text-[var(--studio-muted)] hover:text-[var(--studio-text)]" aria-label="Close Compress">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <label htmlFor="studio-compression-level" className="sr-only">Compression level</label>
      <select
        id="studio-compression-level"
        aria-label="Compression level"
        value={level}
        onChange={(event) => onLevelChange?.(event.target.value as StudioCompressionLevel)}
        disabled={disabled || running}
        className="studio-v2-focus mb-3 w-full rounded border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] px-2 py-2 text-xs text-[var(--studio-text)] disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="studio-compression-level"
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>

      <div className="mb-3 rounded border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] px-2.5 py-2 text-[11px]" aria-live="polite" data-testid="studio-compress-status">
        {running && <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin text-[var(--studio-accent)]" aria-hidden="true" />}
        {status === "succeeded" && <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />}
        {status === "failed" && <AlertCircle className="mr-1.5 inline h-3.5 w-3.5 text-red-300" aria-hidden="true" />}
        <span>{statusMessage || (status === "idle" ? "Ready" : status)}</span>
      </div>

      {error && <div className="mb-3 rounded border border-red-900/70 bg-red-950/40 px-2.5 py-2 text-[11px] text-red-100" role="alert" data-testid="studio-compress-error">{error}</div>}

      {metrics && (
        <div className="mb-3 space-y-1.5 rounded border border-emerald-900/60 bg-emerald-950/20 px-2.5 py-2 text-[11px]" data-testid="studio-compress-metrics">
          <div className="font-medium text-emerald-100">{studioCompressionSummary(metrics)}</div>
          <div className="flex justify-between gap-3"><span className="text-[var(--studio-muted)]">Input</span><span data-testid="studio-compress-input-bytes">{formatStudioBytes(metrics.inputBytes)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--studio-muted)]">Output</span><span data-testid="studio-compress-output-bytes">{formatStudioBytes(metrics.outputBytes)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--studio-muted)]">Saved</span><span data-testid="studio-compress-saved-bytes">{formatStudioBytes(metrics.savedBytes)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[var(--studio-muted)]">Reduction</span><span data-testid="studio-compress-reduction-percent">{metrics.reductionPercent.toFixed(1)}%</span></div>
        </div>
      )}

      <button type="button" onClick={onCompress} disabled={!canApply} className="studio-v2-focus studio-v2-primary w-full rounded px-2.5 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label={status === "failed" ? "Retry Compress" : "Apply Compress"}>
        {running && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {status === "failed" ? "Retry Compress" : "Apply Compress"}
      </button>
      {running && <p className="mt-2 text-[10px] leading-4 text-[var(--studio-muted)]">This request has no reliable server-side cancel operation; closing this panel only hides the status.</p>}
    </div>
  );
}
