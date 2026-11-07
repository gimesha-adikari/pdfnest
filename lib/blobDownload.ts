export const BLOB_DOWNLOAD_URL_REVOKE_DELAY_MS = 1_000;

export interface BlobDownloadAnchor {
    href: string;
    download: string;
    click(): void;
}

export interface BlobDownloadEnvironment {
    createObjectURL(blob: Blob): string;
    revokeObjectURL(url: string): void;
    createAnchor(): BlobDownloadAnchor;
    appendAnchor(anchor: BlobDownloadAnchor): void;
    removeAnchor(anchor: BlobDownloadAnchor): void;
    schedule(callback: () => void, delayMs: number): unknown;
}

const browserEnvironment: BlobDownloadEnvironment = {
    createObjectURL: (blob) => window.URL.createObjectURL(blob),
    revokeObjectURL: (url) => window.URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    appendAnchor: (anchor) => document.body.appendChild(anchor as HTMLAnchorElement),
    removeAnchor: (anchor) => anchor && document.body.removeChild(anchor as HTMLAnchorElement),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
};

/**
 * Starts a browser download and keeps its object URL alive long enough for the
 * browser's download manager to consume it before releasing the URL.
 */
export function triggerBlobDownload(
    blob: Blob,
    fileName: string,
    environment: BlobDownloadEnvironment = browserEnvironment,
): void {
    const url = environment.createObjectURL(blob);
    const anchor = environment.createAnchor();
    anchor.href = url;
    anchor.download = fileName;

    let appended = false;
    try {
        environment.appendAnchor(anchor);
        appended = true;
        anchor.click();
    } finally {
        if (appended) environment.removeAnchor(anchor);
        environment.schedule(
            () => environment.revokeObjectURL(url),
            BLOB_DOWNLOAD_URL_REVOKE_DELAY_MS,
        );
    }
}
