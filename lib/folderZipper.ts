import ignore, { type Ignore } from "ignore";
import JSZip from "jszip";
import { zip, type AsyncZippable } from "fflate";

export interface FolderBundleResult {
    zipBlob: Blob;
    fileCount: number;
    totalBytes: number;
    folderName: string;
}

export interface RepositoryBundleOptions {
    excludedPaths?: string[];
    signal?: AbortSignal;
}

type RepositoryFile = {
    archivePath: string;
    relativePath: string;
    size: number;
    read: () => Promise<Uint8Array>;
};

type IgnoreRule = { base: string; matcher: Ignore };
interface ZipInternalStream {
    on(event: "data", callback: (chunk: Uint8Array) => void): ZipInternalStream;
    on(event: "error", callback: (error: Error) => void): ZipInternalStream;
    on(event: "end", callback: () => void): ZipInternalStream;
    pause(): void;
    resume(): void;
}

interface ZipInternalFile extends JSZip.JSZipObject {
    _data?: { uncompressedSize?: number; compressedSize?: number };
    internalStream?: (type: string) => ZipInternalStream;
}

const EXCLUDED_DIRS = new Set([
    "node_modules", ".git", ".svn", ".hg", ".ssh", ".aws", ".gnupg", ".next", "dist", "build",
    ".venv", "__pycache__", ".turbo", ".cache", ".output", "target", "vendor",
]);

export const MAX_FOLDER_FILES = 25_000;
export const MAX_FOLDER_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
export const MAX_FOLDER_COMPRESSED_BYTES = 250 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 50_000;
export const MAX_GITIGNORE_BYTES = 64 * 1024;

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

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException("Repository upload cancelled", "AbortError");
}

function rootAndRelativePath(archivePath: string, selectedRoot: string): string {
    if (!selectedRoot) return archivePath;
    if (archivePath === selectedRoot || !archivePath.startsWith(`${selectedRoot}/`)) {
        throw new Error("Repository file escaped the selected root.");
    }
    return archivePath.slice(selectedRoot.length + 1);
}

function makeUserMatcher(patterns: string[] = []): Ignore {
    const safePatterns = patterns.map((raw) => raw.trim()).filter(Boolean);
    for (const pattern of safePatterns) {
        const normalized = pattern.replace(/\\/g, "/");
        if (pattern.startsWith("!") || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)
            || /[\x00-\x1f\x7f]/.test(pattern)
            || normalized.split("/").some((part) => part === ".." || part === ".")) {
            throw new Error("Additional exclusions must be relative, deny-only path patterns.");
        }
    }
    try {
        return ignore().add(safePatterns);
    } catch {
        throw new Error("Additional repository exclusions could not be parsed safely.");
    }
}

function gitignoreText(bytes: Uint8Array, fileName: string): string {
    if (bytes.byteLength > MAX_GITIGNORE_BYTES) {
        throw new Error(`The ${fileName} file exceeds the ${MAX_GITIGNORE_BYTES}-byte ignore-rule limit.`);
    }
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        throw new Error(`The ${fileName} file is not valid UTF-8.`);
    }
}

function addIgnoreRules(rules: Map<string, Ignore>, relativePath: string, text: string): void {
    const base = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "";
    let matcher = rules.get(base);
    if (!matcher) {
        matcher = ignore();
        rules.set(base, matcher);
    }
    try {
        matcher.add(text);
    } catch {
        throw new Error(`Ignore rules in ${relativePath} could not be parsed safely.`);
    }
}

function emptyIgnoreRules(): Map<string, Ignore> {
    return new Map([["", ignore()]]);
}

function relativeFromBase(path: string, base: string): string | null {
    if (!base) return path;
    if (path === base || path.startsWith(`${base}/`)) return path.slice(base.length + 1);
    return null;
}

function applyIgnore(matcher: Ignore, path: string, directory: boolean, current: boolean): boolean {
    const result = matcher.test(directory ? `${path.replace(/\/$/, "")}/` : path);
    if (result.ignored) return true;
    if (result.unignored) return false;
    return current;
}

function isGitIgnored(relativePath: string, rules: Map<string, Ignore>): boolean {
    const components = relativePath.split("/");
    const active: IgnoreRule[] = [{ base: "", matcher: rules.get("")! }];
    let ignored = false;

    for (let index = 0; index < components.length - 1; index++) {
        const directory = components.slice(0, index + 1).join("/");
        for (const rule of active) {
            const local = relativeFromBase(directory, rule.base);
            if (local !== null) ignored = applyIgnore(rule.matcher, local, true, ignored);
        }
        // Git cannot re-include a child if one of its parent directories is
        // still excluded. A nested .gitignore in that directory is not active.
        if (ignored) return true;
        const nested = rules.get(directory);
        if (nested) active.push({ base: directory, matcher: nested });
    }

    for (const rule of active) {
        const local = relativeFromBase(relativePath, rule.base);
        if (local !== null && local !== "") ignored = applyIgnore(rule.matcher, local, false, ignored);
    }
    return ignored;
}

function makeBundle(files: Array<{ path: string; bytes: Uint8Array }>, folderName: string, onProgress?: (percent: number, path: string) => void): Promise<FolderBundleResult> {
    const zippable: AsyncZippable = {};
    let totalBytes = 0;
    for (const file of files) {
        if (Object.prototype.hasOwnProperty.call(zippable, file.path)) {
            throw new Error("Duplicate repository relative path.");
        }
        zippable[file.path] = file.bytes;
        totalBytes += file.bytes.byteLength;
    }
    if (files.length === 0) throw new Error("No valid source files found in repository after applying exclusions.");
    return new Promise((resolve, reject) => {
        onProgress?.(60, "Compressing archive...");
        zip(zippable, { level: 6 }, (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            onProgress?.(100, "Archive ready");
            resolve({
                zipBlob: new Blob([data.buffer as ArrayBuffer], { type: "application/zip" }),
                fileCount: files.length,
                totalBytes,
                folderName,
            });
        });
    });
}

export async function bundleDirectoryToZip(
    files: File[],
    onProgress?: (percent: number, currentFile: string) => void,
    options: RepositoryBundleOptions = {},
): Promise<FolderBundleResult> {
    throwIfAborted(options.signal);
    if (!files || files.length === 0) throw new Error("No files selected in directory.");

    const safe = files.map((file) => {
        const rawPath = file.webkitRelativePath || file.name;
        const cleanPath = sanitizeRelativePath(rawPath);
        return { file, cleanPath };
    });
    const hasDirectoryRoot = safe.some(({ file }) => Boolean(file.webkitRelativePath));
    const folderName = hasDirectoryRoot ? safe[0].cleanPath.split("/")[0] : "repository";
    const selectedRoot = hasDirectoryRoot ? folderName : "";
    const seen = new Set<string>();
    const metadata: RepositoryFile[] = safe.map(({ file, cleanPath }) => {
        if (hasDirectoryRoot && !file.webkitRelativePath) throw new Error("Repository file escaped the selected root.");
        if (hasDirectoryRoot && cleanPath.split("/")[0] !== selectedRoot) throw new Error("Repository file escaped the selected root.");
        if (seen.has(cleanPath)) throw new Error("Duplicate repository relative path.");
        seen.add(cleanPath);
        const relativePath = rootAndRelativePath(cleanPath, selectedRoot);
        return {
            archivePath: cleanPath,
            relativePath,
            size: file.size,
            read: async () => new Uint8Array(await file.arrayBuffer()),
        };
    });

    const controlFiles = new Map<string, Uint8Array>();
    const rules = emptyIgnoreRules();
    const userRules = makeUserMatcher(options.excludedPaths);
    const controlItems = metadata
        .filter((item) => item.relativePath === ".gitignore" || item.relativePath.endsWith("/.gitignore"))
        .sort((a, b) => a.relativePath.split("/").length - b.relativePath.split("/").length || a.relativePath.localeCompare(b.relativePath));
    for (const item of controlItems) {
        throwIfAborted(options.signal);
        // Apply already-known ancestor rules and explicit user/mandatory
        // exclusions before reading a nested ignore control file.
        if (isPathExcluded(item.archivePath) || userRules.ignores(item.relativePath) || isGitIgnored(item.relativePath, rules)) {
            continue;
        }
        if (!Number.isSafeInteger(item.size) || item.size < 0 || item.size > MAX_GITIGNORE_BYTES) {
            throw new Error(`The ${item.relativePath} file exceeds the ${MAX_GITIGNORE_BYTES}-byte ignore-rule limit.`);
        }
        const bytes = await item.read();
        const text = gitignoreText(bytes, item.relativePath);
        controlFiles.set(item.relativePath, bytes);
        addIgnoreRules(rules, item.relativePath, text);
    }

    const included: RepositoryFile[] = [];
    let projectedBytes = 0;
    for (const item of metadata) {
        if (isPathExcluded(item.archivePath) || userRules.ignores(item.relativePath) || isGitIgnored(item.relativePath, rules)) continue;
        if (!Number.isSafeInteger(item.size) || item.size < 0) throw new Error("Repository file has invalid size metadata.");
        included.push(item);
        projectedBytes += item.size;
        if (included.length > MAX_FOLDER_FILES) {
            throw new Error(`Directory exceeds maximum allowed file count (${MAX_FOLDER_FILES.toLocaleString()} files).`);
        }
        if (projectedBytes > MAX_FOLDER_UNCOMPRESSED_BYTES) {
            throw new Error("Directory uncompressed size exceeds maximum allowed limit of 250MB.");
        }
    }
    if (included.length === 0) throw new Error("No valid source files found in directory after applying exclusions.");

    const bundleFiles: Array<{ path: string; bytes: Uint8Array }> = [];
    let readBytes = 0;
    for (const [index, item] of included.entries()) {
        throwIfAborted(options.signal);
        if (onProgress && (index % 20 === 0 || index === included.length - 1)) {
            onProgress(Math.round(((index + 1) / included.length) * 50), item.archivePath);
        }
        const bytes = controlFiles.has(item.relativePath)
            ? controlFiles.get(item.relativePath)!
            : await item.read();
        throwIfAborted(options.signal);
        if (bytes.byteLength !== item.size) throw new Error("Repository file changed while it was being prepared.");
        readBytes += bytes.byteLength;
        if (readBytes > MAX_FOLDER_UNCOMPRESSED_BYTES) throw new Error("Directory uncompressed size exceeds maximum allowed limit of 250MB.");
        bundleFiles.push({ path: item.archivePath, bytes });
    }
    throwIfAborted(options.signal);
    return makeBundle(bundleFiles, folderName, onProgress);
}

function isZipSymlink(file: JSZip.JSZipObject): boolean {
    const raw = file.unixPermissions;
    const mode = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 8) : 0;
    return Number.isFinite(mode) && (mode & 0o170000) === 0o120000;
}

async function readZipEntryBounded(file: ZipInternalFile, maxBytes: number): Promise<Uint8Array> {
    if (!file.internalStream) throw new Error("ZIP entry cannot be streamed safely.");
    const stream = file.internalStream("uint8array");
    return await new Promise<Uint8Array>((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        let total = 0;
        let settled = false;
        stream.on("data", (chunk: Uint8Array) => {
            if (settled) return;
            total += chunk.byteLength;
            if (total > maxBytes) {
                settled = true;
                stream.pause();
                reject(new Error("ZIP entry exceeds the permitted uncompressed size."));
                return;
            }
            chunks.push(chunk);
        });
        stream.on("error", (error: Error) => {
            if (settled) return;
            settled = true;
            reject(error);
        });
        stream.on("end", () => {
            if (settled) return;
            settled = true;
            const output = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
                output.set(chunk, offset);
                offset += chunk.byteLength;
            }
            resolve(output);
        });
        stream.resume();
    });
}

export async function sanitizeZipArchive(
    file: File,
    options: RepositoryBundleOptions = {},
): Promise<FolderBundleResult> {
    throwIfAborted(options.signal);
    if (file.size <= 0 || file.size > MAX_FOLDER_COMPRESSED_BYTES) {
        throw new Error("ZIP archive exceeds the maximum allowed compressed size of 250MB.");
    }
    const zipBytes = await file.arrayBuffer();
    throwIfAborted(options.signal);
    let archive: JSZip;
    try {
        archive = await JSZip.loadAsync(zipBytes, { checkCRC32: false, createFolders: false });
    } catch {
        throw new Error("The selected file is not a valid ZIP archive.");
    }
    const entries = Object.values(archive.files);
    if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("ZIP archive contains too many entries.");

    const validated = entries.map((entry) => {
        if (isZipSymlink(entry)) throw new Error("ZIP symbolic links are not permitted.");
        const raw = entry.unsafeOriginalName || entry.name;
        if (raw.includes("\\")) throw new Error("Unsafe repository relative path.");
        const withoutDirectorySlash = entry.dir && raw.endsWith("/") ? raw.slice(0, -1) : raw;
        const cleanPath = sanitizeRelativePath(withoutDirectorySlash);
        const zipFile = entry as ZipInternalFile;
        const declaredSize = entry.dir ? 0 : zipFile._data?.uncompressedSize;
        if (!entry.dir && (!Number.isSafeInteger(declaredSize) || (declaredSize as number) < 0)) {
            throw new Error("ZIP entry has invalid size metadata.");
        }
        return { entry, cleanPath, size: declaredSize as number };
    });
    const files = validated.filter((item) => !item.entry.dir);
    const firstParts = files[0]?.cleanPath.split("/") ?? [];
    const selectedRoot = firstParts.length > 1 && files.every((item) => item.cleanPath.split("/")[0] === firstParts[0])
        ? firstParts[0]
        : "";
    const relative = (path: string) => rootAndRelativePath(path, selectedRoot);
    const ignoreBytes = new Map<string, Uint8Array>();
    const rules = emptyIgnoreRules();
    const userRules = makeUserMatcher(options.excludedPaths);
    const controlItems = files
        .filter((item) => {
            const relativePath = relative(item.cleanPath);
            return relativePath === ".gitignore" || relativePath.endsWith("/.gitignore");
        })
        .sort((a, b) => relative(a.cleanPath).split("/").length - relative(b.cleanPath).split("/").length || relative(a.cleanPath).localeCompare(relative(b.cleanPath)));
    for (const item of controlItems) {
        throwIfAborted(options.signal);
        const relativePath = relative(item.cleanPath);
        if (isPathExcluded(item.cleanPath) || userRules.ignores(relativePath) || isGitIgnored(relativePath, rules)) {
            continue;
        }
        if (item.size > MAX_GITIGNORE_BYTES) throw new Error(`The ${relativePath} file exceeds the ${MAX_GITIGNORE_BYTES}-byte ignore-rule limit.`);
        const bytes = await readZipEntryBounded(item.entry as ZipInternalFile, MAX_GITIGNORE_BYTES);
        const text = gitignoreText(bytes, relativePath);
        ignoreBytes.set(relativePath, bytes);
        addIgnoreRules(rules, relativePath, text);
    }

    const included = files.filter((item) => {
        const relativePath = relative(item.cleanPath);
        return !isPathExcluded(item.cleanPath)
            && !userRules.ignores(relativePath)
            && !isGitIgnored(relativePath, rules);
    });
    if (included.length === 0) throw new Error("No valid source files found in ZIP after applying exclusions.");
    if (included.length > MAX_FOLDER_FILES) throw new Error(`Directory exceeds maximum allowed file count (${MAX_FOLDER_FILES.toLocaleString()} files).`);

    let projectedBytes = 0;
    for (const item of included) {
        projectedBytes += item.size;
        if (projectedBytes > MAX_FOLDER_UNCOMPRESSED_BYTES) throw new Error("Directory uncompressed size exceeds maximum allowed limit of 250MB.");
    }

    const bundleFiles: Array<{ path: string; bytes: Uint8Array }> = [];
    for (const item of included) {
        throwIfAborted(options.signal);
        const controlBytes = ignoreBytes.get(relative(item.cleanPath));
        const bytes = controlBytes === undefined
            ? await readZipEntryBounded(item.entry as ZipInternalFile, Math.min(item.size, MAX_FOLDER_UNCOMPRESSED_BYTES - bundleFiles.reduce((sum, row) => sum + row.bytes.byteLength, 0)))
            : controlBytes;
        if (bytes.byteLength !== item.size) throw new Error("ZIP entry size does not match its directory metadata.");
        bundleFiles.push({ path: item.cleanPath, bytes });
    }
    throwIfAborted(options.signal);
    return makeBundle(bundleFiles, selectedRoot || file.name.replace(/\.zip$/i, "") || "repository");
}
