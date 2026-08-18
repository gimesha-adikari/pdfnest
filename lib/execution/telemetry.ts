"use client";

/**
 * Hybrid Execution Telemetry Subsystem
 *
 * Captures non-sensitive execution metrics (latencies, modes, fallback events, error codes)
 * while strictly preserving document privacy. Never logs file contents, filenames, passwords,
 * tokens, or personal metadata.
 *
 * Guarantees zero-impact execution: telemetry failures are silently swallowed so PDF
 * operations are never disrupted by analytics issues.
 */

export type TelemetryCategory =
    | "client_success"          // Direct client execution succeeded
    | "fallback_success"        // Client failed, transparent cloud fallback succeeded
    | "direct_cloud_success"    // Direct cloud mode or backend-only tool succeeded
    | "cloud_failure"           // Cloud execution failed (direct or fallback)
    | "client_failure"          // Device mode client execution failed without fallback
    | "safety_rejection"        // SafetyGate rejected device execution
    | "feature_flag_disabled";  // Client execution disabled via feature flag

export interface HybridExecutionEvent {
    toolId: string;
    requestedMode: "auto" | "device" | "cloud";
    actualMode?: "client" | "cloud";
    category: TelemetryCategory;
    durationMs: number;
    success: boolean;
    fallbackOccurred: boolean;
    fallbackReason?: string;
    errorCode?: string;
    safetyRejectionReason?: string;
    featureFlagDisabled: boolean;
    fileSizeMB: number;
    fileCount: number;
    timestamp: number;
}

export interface TelemetrySink {
    record(event: HybridExecutionEvent): void | Promise<void>;
}

/**
 * In-memory buffer sink for development logging, testing, and debugging.
 */
export class BufferTelemetrySink implements TelemetrySink {
    private events: HybridExecutionEvent[] = [];
    private maxCapacity: number;

    constructor(maxCapacity = 100) {
        this.maxCapacity = maxCapacity;
    }

    record(event: HybridExecutionEvent): void {
        if (this.events.length >= this.maxCapacity) {
            this.events.shift();
        }
        this.events.push(event);
    }

    getEvents(): HybridExecutionEvent[] {
        return [...this.events];
    }

    getLastEvent(): HybridExecutionEvent | undefined {
        return this.events[this.events.length - 1];
    }

    clear(): void {
        this.events = [];
    }
}

/**
 * Structured console sink for development logs.
 */
export class ConsoleTelemetrySink implements TelemetrySink {
    record(event: HybridExecutionEvent): void {
        if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG_TELEMETRY === "true") {
            console.debug(`[Telemetry] ${event.toolId} (${event.category}) - ${event.durationMs.toFixed(1)}ms`, {
                mode: `${event.requestedMode} -> ${event.actualMode || "none"}`,
                success: event.success,
                fallback: event.fallbackOccurred,
                reason: event.fallbackReason || event.safetyRejectionReason || event.errorCode,
            });
        }
    }
}

export class HybridTelemetryEngine {
    private sinks: TelemetrySink[] = [];
    private bufferSink: BufferTelemetrySink = new BufferTelemetrySink();

    constructor() {
        this.sinks.push(this.bufferSink);
        this.sinks.push(new ConsoleTelemetrySink());
    }

    public addSink(sink: TelemetrySink): void {
        this.sinks.push(sink);
    }

    public removeSink(sink: TelemetrySink): void {
        this.sinks = this.sinks.filter((s) => s !== sink);
    }

    public getBufferSink(): BufferTelemetrySink {
        return this.bufferSink;
    }

    public clearEvents(): void {
        this.bufferSink.clear();
    }

    public getEvents(): HybridExecutionEvent[] {
        return this.bufferSink.getEvents();
    }

    public getLastEvent(): HybridExecutionEvent | undefined {
        return this.bufferSink.getLastEvent();
    }

    /**
     * Safely records an execution telemetry event.
     * Guaranteed never to throw or disrupt caller logic.
     */
    public record(event: HybridExecutionEvent): void {
        try {
            // Sanitize event to strictly guarantee no privacy leak
            const sanitized: HybridExecutionEvent = {
                toolId: String(event.toolId || "unknown"),
                requestedMode: event.requestedMode || "auto",
                actualMode: event.actualMode,
                category: event.category,
                durationMs: Number(Math.max(0, event.durationMs).toFixed(2)),
                success: Boolean(event.success),
                fallbackOccurred: Boolean(event.fallbackOccurred),
                fallbackReason: event.fallbackReason ? String(event.fallbackReason).substring(0, 300) : undefined,
                errorCode: event.errorCode ? String(event.errorCode) : undefined,
                safetyRejectionReason: event.safetyRejectionReason ? String(event.safetyRejectionReason).substring(0, 300) : undefined,
                featureFlagDisabled: Boolean(event.featureFlagDisabled),
                fileSizeMB: Number(Math.max(0, event.fileSizeMB).toFixed(2)),
                fileCount: Math.max(0, Math.floor(event.fileCount)),
                timestamp: event.timestamp || Date.now(),
            };

            for (const sink of this.sinks) {
                try {
                    const res = sink.record(sanitized);
                    if (res && typeof (res as Promise<void>).catch === "function") {
                        (res as Promise<void>).catch(() => {});
                    }
                } catch {
                    // Ignore individual sink error silently
                }
            }
        } catch {
            // Ignore engine error silently
        }
    }
}

export const telemetry = new HybridTelemetryEngine();

/**
 * Utility helper to extract non-sensitive file metrics.
 * Explicitly ignores file names and contents.
 */
export function extractFileMetrics(files: File[]): { fileSizeMB: number; fileCount: number } {
    if (!files || files.length === 0) {
        return { fileSizeMB: 0, fileCount: 0 };
    }
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    return {
        fileSizeMB: Number((totalBytes / (1024 * 1024)).toFixed(2)),
        fileCount: files.length,
    };
}
