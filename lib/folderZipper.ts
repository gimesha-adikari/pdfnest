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
    ".svn",
    ".hg",
    ".ssh",
    ".aws",
    ".gnupg",
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

export const MAX_FOLDER_FILES = 25000;
export const MAX_FOLDER_UNCOMPRESSED_BYTES = 250 * 1024 * 1024; // 250 MB

// Mirrors the Analyzer's mandatory credential exclusions. This is filename
// filtering, not a claim that arbitrary source code contains no secrets.
export function isPathExcluded(relativePath: string): boolean {
    const parts = sanitizeRelativePath(relativePath).toLowerCase().split("/");
    if (parts.slice(0, -1).some((part) => EXCLUDED_DIRS.has(part))) return true;
    const filename = parts[parts.length - 1];
    const safeEnv = [".env.example", ".env.sample", ".env.template", ".env.dist", ".env.defaults",
        "env.example", "env.sample", "env.template"].some((suffix) => filename.endsWith(suffix));
    if (!safeEnv && (filename === ".env" || filename.startsWith(".env."))) return true;
    return /\.(pem|key|p12|pfx|exe|dll|so|dylib)$/.test(filename)
        || /^(id_rsa|id_dsa|id_ed25519|id_ecdsa)/.test(filename)
        || ["credentials.json", "credentials", ".netrc", "_netrc", ".npmrc", ".pypirc",
            ".git-credentials", ".ds_store", "thumbs.db", "npm-debug.log", "yarn-error.log"].includes(filename);
}

export function sanitizeRelativePath(raw: string): string {
    const normalized = raw.replace(/\\/g, "/");
    const segments = normalized.split("/");
    if (!raw || /^[a-z]:/i.test(normalized) || normalized.startsWith("/")
        || /[\x00-\x1f\x7f]/.test(raw)
        || segments.some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
        throw new Error("Unsafe repository relative path.");
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
    const folderName = sanitizeRelativePath(firstRel).split("/")[0];

    // 1. Filter and validate files
    const validFiles: { file: File; cleanPath: string }[] = [];
    let totalUncompressedBytes = 0;
    const seenPaths = new Set<string>();

    for (const file of files) {
        const relPath = file.webkitRelativePath || file.name;
        const cleanPath = sanitizeRelativePath(relPath);
        if (isPathExcluded(cleanPath)) {
            continue;
        }

        if (seenPaths.has(cleanPath)) {
            throw new Error("Duplicate repository relative path.");
        }
        seenPaths.add(cleanPath);
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
