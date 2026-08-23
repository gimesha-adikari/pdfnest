"use client";

import React, { useState, useRef, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
    GitBranch,
    Folder,
    Archive,
    ArrowRight,
    CheckCircle2,
    AlertCircle,
    Sparkles,
    Loader2,
} from "lucide-react";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { useRepositoryAnalyzer } from "@/context/RepositoryAnalyzerContext";
import { uploadArchiveToStorage } from "@/lib/analyzerUploader";
import { bundleDirectoryToZip } from "@/lib/folderZipper";

type SourceTab = "git" | "local" | "zip";

export default function RepositoryAnalyzerSourceSelector() {
    const router = useRouter();
    const { toolId, setFile } = useSharedTool();
    const { createGitSession, createZipSession, reset } = useRepositoryAnalyzer();

    const [activeTab, setActiveTab] = useState<SourceTab>("git");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bundlingProgress, setBundlingProgress] = useState<string | null>(null);

    // 1. Git URL State
    const [gitUrl, setGitUrl] = useState("");
    const [gitUrlError, setGitUrlError] = useState<string | null>(null);

    // 2. Local Directory State
    const folderInputRef = useRef<HTMLInputElement | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<{
        name: string;
        files: File[];
        folderTreeLines: string[];
    } | null>(null);

    // 3. ZIP File State
    const zipInputRef = useRef<HTMLInputElement | null>(null);
    const [selectedZip, setSelectedZip] = useState<File | null>(null);

    // Format file sizes
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    // Extract repository name and provider from URL
    const parseGitDetails = (url: string) => {
        try {
            const parsed = new URL(url);
            const pathParts = parsed.pathname.split("/").filter(Boolean);
            const repoName = pathParts[pathParts.length - 1]?.replace(/\.git$/i, "") || "repository";
            let provider = "Git";
            if (parsed.hostname.includes("github.com")) provider = "GitHub";
            else if (parsed.hostname.includes("gitlab.com")) provider = "GitLab";
            else if (parsed.hostname.includes("bitbucket.org")) provider = "Bitbucket";
            return { repoName, provider };
        } catch {
            return { repoName: "repository", provider: "Git" };
        }
    };

    // Validate Git URL client-side
    const validateGitUrl = (url: string): boolean => {
        const trimmed = url.trim();
        if (!trimmed) {
            setGitUrlError("Please enter a repository URL.");
            return false;
        }
        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol.toLowerCase() !== "https:") {
                setGitUrlError("Repository URL must use secure HTTPS protocol.");
                return false;
            }
            if (!parsed.hostname.includes(".")) {
                setGitUrlError("Please enter a valid domain address.");
                return false;
            }
            setGitUrlError(null);
            return true;
        } catch {
            setGitUrlError("Please enter a valid URL (e.g. https://github.com/user/project).");
            return false;
        }
    };

    // Git submission handler
    const handleGitSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = gitUrl.trim();
        if (!validateGitUrl(trimmed)) return;

        const { repoName } = parseGitDetails(trimmed);
        setIsSubmitting(true);
        setGitUrlError(null);

        try {
            await createGitSession(trimmed, repoName);
            const virtualFile = new File([], repoName, {
                type: "application/x-repository",
            });
            setFile(virtualFile);
            router.push(`/${toolId}/workspace`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to initialize repository session.";
            setGitUrlError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Local folder selection handler
    const handleFolderChange = (e: ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;

        const filesArray = Array.from(fileList);
        const relativePaths = filesArray.map((f) => f.webkitRelativePath || f.name);
        const firstRelativePath = relativePaths[0] || "";
        const folderName = firstRelativePath.split("/")[0] || "my-project";

        const discoveredDirs = new Set<string>();
        const discoveredRootFiles: string[] = [];

        relativePaths.forEach((rel) => {
            const parts = rel.split("/");
            if (parts.length > 2) {
                discoveredDirs.add(parts[1]);
            } else if (parts.length === 2) {
                discoveredRootFiles.push(parts[1]);
            }
        });

        const treeLines: string[] = [`${folderName}/`];
        const dirList = Array.from(discoveredDirs).slice(0, 3);
        dirList.forEach((dir) => {
            treeLines.push(`├── ${dir}/`);
        });
        const fileSample = discoveredRootFiles.slice(0, 2);
        fileSample.forEach((f, idx) => {
            const isLast = idx === fileSample.length - 1 && dirList.length === 0;
            treeLines.push(`${isLast ? "└──" : "├──"} ${f}`);
        });

        if (treeLines.length <= 1) {
            treeLines.push("├── src/", "├── package.json", "└── README.md");
        }

        setSelectedFolder({
            name: folderName,
            files: filesArray,
            folderTreeLines: treeLines,
        });
    };

    const handleLocalSubmit = async () => {
        if (!selectedFolder) return;
        setIsSubmitting(true);
        setBundlingProgress("Preparing directory files...");

        try {
            // 1. Bundle directory to ZIP client-side with relative paths
            const { zipBlob, folderName } = await bundleDirectoryToZip(
                selectedFolder.files,
                (percent, currentFile) => {
                    setBundlingProgress(`${currentFile} (${percent}%)`);
                }
            );

            setBundlingProgress("Uploading repository archive...");

            // 2. Upload archive atomically to authoritative storage
            const uploadRes = await uploadArchiveToStorage(
                zipBlob,
                `${folderName}.zip`,
                folderName
            );

            // 3. Create Analyzer Session with verified canonical storageKey
            await createZipSession(uploadRes.storageKey, uploadRes.repositoryName);

            const virtualFile = new File([], uploadRes.repositoryName, {
                type: "application/x-repository",
            });
            setFile(virtualFile);
            router.push(`/${toolId}/workspace`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to bundle or upload folder.";
            alert(msg);
        } finally {
            setIsSubmitting(false);
            setBundlingProgress(null);
        }
    };

    // ZIP selection handler
    const handleZipChange = (e: ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        const zipFile = fileList[0];
        if (zipFile) {
            setSelectedZip(zipFile);
        }
    };

    const handleZipSubmit = async () => {
        if (!selectedZip) return;
        setIsSubmitting(true);
        const cleanName = selectedZip.name.replace(/\.zip$/i, "") || "repository";

        try {
            // 1. Upload ZIP atomically to authoritative storage
            const uploadRes = await uploadArchiveToStorage(selectedZip, selectedZip.name, cleanName);

            // 2. Create Session with verified canonical storageKey
            await createZipSession(uploadRes.storageKey, uploadRes.repositoryName);

            const virtualFile = new File([], uploadRes.repositoryName, {
                type: "application/x-repository",
            });
            setFile(virtualFile);
            router.push(`/${toolId}/workspace`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to upload or initialize ZIP session.";
            alert(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
            {/* Header */}
            <div className="text-center space-y-3">
                <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1b1b] px-3.5 py-1 font-mono text-xs text-[#d2bbff]">
                    <Sparkles size={13} />
                    DEVELOPER ARCHITECTURE ENGINE
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Repository Architecture Analyzer
                </h1>
                <p className="mx-auto max-w-2xl text-xs sm:text-sm text-[#a1a1aa] leading-relaxed">
                    Inspect project structures, dependencies, tech stacks, environment requirements, and API routes with zero build execution.
                </p>
            </div>

            {/* Source Selection Tabs */}
            <div className="rounded-xl border border-white/10 bg-[#121212] p-6 shadow-sm sm:p-8">
                <div className="flex border-b border-white/10 pb-4">
                    <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab("git");
                                reset();
                            }}
                            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-mono text-xs transition ${
                                activeTab === "git"
                                    ? "bg-[#7c3aed] text-white shadow-sm font-semibold"
                                    : "text-[#a1a1aa] hover:bg-[#1c1b1b] hover:text-white"
                            }`}
                        >
                            <GitBranch size={15} />
                            Git URL
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab("local");
                                reset();
                            }}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                                activeTab === "local"
                                    ? "bg-[var(--primary)] text-white shadow-sm"
                                    : "text-[color:var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[color:var(--foreground)]"
                            }`}
                        >
                            <Folder size={16} />
                            Local Directory
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab("zip");
                                reset();
                            }}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                                activeTab === "zip"
                                    ? "bg-[var(--primary)] text-white shadow-sm"
                                    : "text-[color:var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[color:var(--foreground)]"
                            }`}
                        >
                            <Archive size={16} />
                            ZIP Archive
                        </button>
                    </div>
                </div>

                {/* Tab 1: Git URL */}
                {activeTab === "git" && (
                    <form onSubmit={handleGitSubmit} className="mt-6 space-y-5">
                        <div className="space-y-2">
                            <label htmlFor="git-url-input" className="block text-sm font-semibold text-[color:var(--foreground)]">
                                Remote Git Repository HTTPS URL
                            </label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[color:var(--muted-foreground)]">
                                    <GitBranch size={18} />
                                </div>
                                <input
                                    id="git-url-input"
                                    type="url"
                                    value={gitUrl}
                                    onChange={(e) => {
                                        setGitUrl(e.target.value);
                                        if (gitUrlError) setGitUrlError(null);
                                    }}
                                    placeholder="https://github.com/facebook/react.git"
                                    className={`w-full rounded-2xl border bg-[var(--background)] py-3 pl-11 pr-4 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]/60 focus:outline-none focus:ring-2 ${
                                        gitUrlError
                                            ? "border-red-500 focus:ring-red-500/20"
                                            : "border-[color:var(--border)] focus:border-[var(--primary)] focus:ring-[var(--primary)]/20"
                                    }`}
                                />
                            </div>
                            {gitUrlError ? (
                                <p className="flex items-center gap-1.5 text-xs text-red-500">
                                    <AlertCircle size={14} />
                                    {gitUrlError}
                                </p>
                            ) : (
                                <p className="text-xs text-[color:var(--muted-foreground)]">
                                    Public GitHub, GitLab, and Bitbucket repositories supported via secure HTTPS shallow clones.
                                </p>
                            )}
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                type="submit"
                                disabled={isSubmitting || !gitUrl.trim()}
                                className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Validating & Initializing...
                                    </>
                                ) : (
                                    <>
                                        Continue to Scoping
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}

                {/* Tab 2: Local Directory */}
                {activeTab === "local" && (
                    <div className="mt-6 space-y-5">
                        <input
                            ref={folderInputRef}
                            type="file"
                            // @ts-expect-error - webkitdirectory is standard in Chromium/Gecko/WebKit
                            webkitdirectory=""
                            directory=""
                            multiple
                            onChange={handleFolderChange}
                            className="hidden"
                        />

                        {!selectedFolder ? (
                            <button
                                type="button"
                                onClick={() => folderInputRef.current?.click()}
                                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--border)] bg-[var(--background)]/50 p-8 text-center transition hover:border-[var(--primary)] hover:bg-[var(--primary)]/5"
                            >
                                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                                    <Folder size={24} />
                                </div>
                                <h3 className="mt-4 text-sm font-semibold text-[color:var(--foreground)]">
                                    Select local project folder
                                </h3>
                                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                                    Files are scanned locally without executing build scripts
                                </p>
                            </button>
                        ) : (
                            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                                            <CheckCircle2 size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-[color:var(--foreground)]">
                                                {selectedFolder.name}
                                            </h4>
                                            <p className="text-xs text-[color:var(--muted-foreground)]">
                                                {selectedFolder.files.length} files detected
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => folderInputRef.current?.click()}
                                        className="text-xs font-semibold text-[var(--primary)] hover:underline"
                                    >
                                        Change Folder
                                    </button>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={handleLocalSubmit}
                                        disabled={isSubmitting}
                                        className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                {bundlingProgress || "Initializing..."}
                                            </>
                                        ) : (
                                            <>
                                                Continue to Scoping
                                                <ArrowRight size={16} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab 3: ZIP Archive */}
                {activeTab === "zip" && (
                    <div className="mt-6 space-y-5">
                        <input
                            ref={zipInputRef}
                            type="file"
                            accept=".zip,application/zip"
                            onChange={handleZipChange}
                            className="hidden"
                        />

                        {!selectedZip ? (
                            <button
                                type="button"
                                onClick={() => zipInputRef.current?.click()}
                                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--border)] bg-[var(--background)]/50 p-8 text-center transition hover:border-[var(--primary)] hover:bg-[var(--primary)]/5"
                            >
                                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                                    <Archive size={24} />
                                </div>
                                <h3 className="mt-4 text-sm font-semibold text-[color:var(--foreground)]">
                                    Select repository ZIP archive
                                </h3>
                                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                                    Max archive size: 250 MB
                                </p>
                            </button>
                        ) : (
                            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                                            <CheckCircle2 size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-[color:var(--foreground)]">
                                                {selectedZip.name}
                                            </h4>
                                            <p className="text-xs text-[color:var(--muted-foreground)]">
                                                {formatFileSize(selectedZip.size)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => zipInputRef.current?.click()}
                                        className="text-xs font-semibold text-[var(--primary)] hover:underline"
                                    >
                                        Change File
                                    </button>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={handleZipSubmit}
                                        disabled={isSubmitting}
                                        className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Uploading & Initializing...
                                            </>
                                        ) : (
                                            <>
                                                Continue to Scoping
                                                <ArrowRight size={16} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
