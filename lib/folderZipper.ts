import { zip, type AsyncZippable } from "fflate";

export interface FolderBundleResult {
    zipBlob: Blob;
    fileCount: number;
    totalBytes: number;
    folderName: string;
}

const EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".venv",
    "__pycache__",
    ".turbo",
    ".cache",
    ".output",
    "target",
    "vendor",
]);

const EXCLUDED_FILES = new Set([
    ".DS_Store",
    "Thumbs.db",
    "npm-debug.log",
    "yarn-error.log",
]);

export const MAX_FOLDER_FILES = 25000;
export const MAX_FOLDER_UNCOMPRESSED_BYTES = 250 * 1024 * 1024; // 250 MB

export function isPathExcluded(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = normalized.split("/");

    for (let i = 0; i < parts.length - 1; i++) {
        if (EXCLUDED_DIRS.has(parts[i])) {
            return true;
        }
    }

    const filename = parts[parts.length - 1];
    if (EXCLUDED_FILES.has(filename)) {
        return true;
    }

    return false;
}

export function sanitizeRelativePath(raw: string): string {
    const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    const segments = normalized.split("/").filter((s) => s.length > 0 && s !== ".");

    if (segments.some((s) => s === "..")) {
        throw new Error(`Unsafe directory traversal in relative path: ${raw}`);
    }

    return segments.join("/");
}

export async function bundleDirectoryToZip(
    files: File[],
    onProgress?: (percent: number, currentFile: string) => void
): Promise<FolderBundleResult> {
    if (!files || files.length === 0) {
        throw new Error("No files selected in directory.");
    }

    // Determine root folder name
    const firstRel = files[0].webkitRelativePath || files[0].name;
    const folderName = firstRel.replace(/\\/g, "/").split("/")[0] || "repository";

    // 1. Filter and validate files
    const validFiles: { file: File; cleanPath: string }[] = [];
    let totalUncompressedBytes = 0;

    for (const file of files) {
        const relPath = file.webkitRelativePath || file.name;
        if (isPathExcluded(relPath)) {
            continue;
        }

        const cleanPath = sanitizeRelativePath(relPath);
        validFiles.push({ file, cleanPath });
        totalUncompressedBytes += file.size;

        if (validFiles.length > MAX_FOLDER_FILES) {
            throw new Error(`Directory exceeds maximum allowed file count (${MAX_FOLDER_FILES.toLocaleString()} files).`);
        }

        if (totalUncompressedBytes > MAX_FOLDER_UNCOMPRESSED_BYTES) {
            throw new Error(`Directory uncompressed size exceeds maximum allowed limit of 250MB.`);
        }
    }

    if (validFiles.length === 0) {
        throw new Error("No valid source files found in directory after applying standard exclusions.");
    }

    // 2. Build zippable tree
    const zippable: AsyncZippable = {};
    const totalCount = validFiles.length;

    for (let i = 0; i < totalCount; i++) {
        const item = validFiles[i];
        if (onProgress && (i % 20 === 0 || i === totalCount - 1)) {
            const percent = Math.round(((i + 1) / totalCount) * 50); // first 50% is reading
            onProgress(percent, item.cleanPath);
        }

        const arrayBuffer = await item.file.arrayBuffer();
        zippable[item.cleanPath] = new Uint8Array(arrayBuffer);
    }

    // 3. Perform compression
    if (onProgress) {
        onProgress(60, "Compressing archive...");
    }

    const zipData: Uint8Array = await new Promise((resolve, reject) => {
        zip(zippable, { level: 6 }, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });

    if (onProgress) {
        onProgress(100, "Archive ready");
    }

    const zipBlob = new Blob([zipData.buffer as ArrayBuffer], { type: "application/zip" });

    return {
        zipBlob,
        fileCount: validFiles.length,
        totalBytes: totalUncompressedBytes,
        folderName,
    };
}
