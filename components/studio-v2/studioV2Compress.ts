import type { StudioCompressionLevel, StudioCompressionMetrics } from "@/lib/studio-v2/api";

export type StudioCompressStatus = "idle" | "starting" | "running" | "succeeded" | "failed" | "cancelled";

export interface StudioCompressMetrics {
  inputBytes: number;
  outputBytes: number;
  savedBytes: number;
  reductionPercent: number;
  outputLargerPercent: number;
  outputLarger: boolean;
}

export interface StudioCompressState {
  status: StudioCompressStatus;
  level: StudioCompressionLevel;
  message: string | null;
  error: string | null;
  metrics: StudioCompressMetrics | null;
}

export function createStudioCompressState(level: StudioCompressionLevel = "medium"): StudioCompressState {
  return { status: "idle", level, message: null, error: null, metrics: null };
}

export function studioCompressionMetricsFromResponse(
  metrics: StudioCompressionMetrics | null | undefined,
): StudioCompressMetrics | null {
  if (!metrics) return null;
  const inputBytes = finiteNonNegative(metrics.input_bytes);
  const outputBytes = finiteNonNegative(metrics.output_bytes);
  const savedBytes = Math.max(inputBytes - outputBytes, 0);
  const reductionPercent = inputBytes > 0 ? (savedBytes / inputBytes) * 100 : 0;
  // A zero-byte input has no meaningful percentage denominator, so keep the
  // result in the safe no-reduction state instead of claiming a percentage.
  const outputLarger = inputBytes > 0 && outputBytes > inputBytes;
  const outputLargerPercent = inputBytes > 0 && outputLarger
    ? ((outputBytes - inputBytes) / inputBytes) * 100
    : 0;
  return { inputBytes, outputBytes, savedBytes, reductionPercent, outputLargerPercent, outputLarger };
}

export function formatStudioBytes(bytes: number): string {
  const safeBytes = finiteNonNegative(bytes);
  if (safeBytes < 1024) return `${Math.round(safeBytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = safeBytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex === 0 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

export function studioCompressionSummary(metrics: StudioCompressMetrics): string {
  if (metrics.outputLarger) return `Output is ${metrics.outputLargerPercent.toFixed(1)}% larger`;
  if (metrics.savedBytes === 0) return "No size reduction";
  return `Reduced by ${metrics.reductionPercent.toFixed(1)}%`;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
