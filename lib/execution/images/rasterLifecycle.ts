export class RasterStageTimeoutError extends Error {
    readonly stage: string;
    constructor(stage: string) {
        super(`Rasterization stage timed out: ${stage}`);
        this.name = "RasterStageTimeoutError";
        this.stage = stage;
    }
}

export const MAX_RASTER_AXIS = 4096;
export const MAX_RASTER_PAGE_PIXELS = 4_000_000;

export function validateRasterGeometry(width: number, height: number, remainingPixels: number): number {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error("PDF page has invalid raster dimensions.");
    }
    const pixels = Math.ceil(width) * Math.ceil(height);
    if (
        width > MAX_RASTER_AXIS || height > MAX_RASTER_AXIS ||
        pixels > MAX_RASTER_PAGE_PIXELS || pixels > remainingPixels
    ) {
        throw new Error("PDF page exceeds the Device image raster limits.");
    }
    return pixels;
}

export async function awaitRasterStage<T>(
    operation: PromiseLike<T>,
    stage: string,
    options: { timeoutMs?: number; signal?: AbortSignal; onCancel?: () => void } = {},
): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new RangeError("Raster stage timeout must be a finite positive duration.");
    }

    const signal = options.signal;
    if (signal?.aborted) throw abortError();

    return await new Promise<T>((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
            cancel();
            finish(() => reject(new RasterStageTimeoutError(stage)));
        }, timeoutMs);

        const cleanup = () => {
            if (timeout !== undefined) clearTimeout(timeout);
            signal?.removeEventListener("abort", handleAbort);
        };
        const finish = (complete: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            complete();
        };
        const cancel = () => {
            try { options.onCancel?.(); } catch { /* Preserve the original timeout or cancellation. */ }
        };
        const handleAbort = () => {
            cancel();
            finish(() => reject(abortError()));
        };

        signal?.addEventListener("abort", handleAbort, { once: true });
        Promise.resolve(operation).then(
            (value) => finish(() => resolve(value)),
            (error) => finish(() => reject(error)),
        );
    });
}

function abortError(): DOMException {
    return new DOMException("Rasterization was cancelled.", "AbortError");
}
