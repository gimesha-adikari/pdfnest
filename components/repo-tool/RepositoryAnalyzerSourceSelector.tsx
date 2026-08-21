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
    Info,
    FolderTree,
    Sparkles,
} from "lucide-react";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { useRepositoryAnalyzer } from "@/context/RepositoryAnalyzerContext";

type SourceTab = "git" | "local" | "zip";

export default function RepositoryAnalyzerSourceSelector() {
    const router = useRouter();
    const { toolId, setFile } = useSharedTool();
    const { setSource } = useRepositoryAnalyzer();

    const [activeTab, setActiveTab] = useState<SourceTab>("git");

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

    // Validate Git URL client-side
    const validateGitUrl = (url: string): boolean => {
        const trimmed = url.trim();
        if (!trimmed) {
            setGitUrlError("Please enter a repository URL.");
            return false;
        }
        try {
            const parsed = new URL(trimmed);
            if (!["http:", "https:"].includes(parsed.protocol)) {
                setGitUrlError("Please enter a valid HTTP or HTTPS URL.");
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
    const handleGitSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = gitUrl.trim();
        if (!validateGitUrl(trimmed)) return;

        setSource({
            type: "git",
            url: trimmed,
        });

        // Set minimal virtual file marker for shared routing
        const virtualFile = new File([], "git-repository", {
            type: "application/x-repository",
        });
        setFile(virtualFile);
        router.push(`/${toolId}/workspace`);
    };

    // Local folder selection handler
    const handleFolderChange = (e: ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;

        const filesArray = Array.from(fileList);
        const firstRelativePath = filesArray[0]?.webkitRelativePath || "";
        const folderName = firstRelativePath.split("/")[0] || "my-project";

        // Generate a visual folder tree preview snippet
        const discoveredDirs = new Set<string>();
        const discoveredRootFiles: string[] = [];

        filesArray.forEach((file) => {
            const parts = (file.webkitRelativePath || file.name).split("/");
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
            treeLines.push("├── src/", "├── components/", "├── package.json", "└── README.md");
        }

        setSelectedFolder({
            name: folderName,
            files: filesArray,
            folderTreeLines: treeLines,
        });
    };

    const handleLocalSubmit = () => {
        if (!selectedFolder) return;

        setSource({
            type: "local",
            name: selectedFolder.name,
            files: selectedFolder.files,
        });

        // Set minimal virtual file marker for shared routing
        const virtualFile = new File([], selectedFolder.name, {
            type: "application/x-repository",
        });
        setFile(virtualFile);
        router.push(`/${toolId}/workspace`);
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

    const handleZipSubmit = () => {
        if (!selectedZip) return;

        const cleanName = selectedZip.name.replace(/\.zip$/i, "");
        setSource({
            type: "zip",
            name: cleanName,
            file: selectedZip,
        });

        // Set minimal virtual file marker for shared routing
        const virtualFile = new File([], selectedZip.name, {
            type: "application/x-repository",
        });
        setFile(virtualFile);
        router.push(`/${toolId}/workspace`);
    };

    return (
        <div className="mx-auto max-w-3xl space-y-8">
            {/* Header Hierarchy */}
            <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--card)] px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                    <Sparkles size={13} className="text-[var(--primary)]" />
                    <span>Developer Studio</span>
                </div>

                <h1 className="text-3xl font-black tracking-tight text-[color:var(--foreground)] sm:text-4xl">
                    Turn a codebase into useful documentation.
                </h1>

                <p className="mx-auto max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                    Add a Git repository, local project, or ZIP archive and choose what you want to understand about the project.
                </p>
            </div>

            {/* Source Mode Tabs */}
            <div
                role="tablist"
                aria-label="Repository Source Options"
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "git"}
                    onClick={() => setActiveTab("git")}
                    className={`flex items-center justify-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                        activeTab === "git"
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm"
                            : "border-[color:var(--border)] bg-[var(--card)] text-[color:var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <GitBranch size={18} className="shrink-0" />
                    <span>Git Repository</span>
                </button>

                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "local"}
                    onClick={() => setActiveTab("local")}
                    className={`flex items-center justify-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                        activeTab === "local"
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm"
                            : "border-[color:var(--border)] bg-[var(--card)] text-[color:var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <Folder size={18} className="shrink-0" />
                    <span>Local Project</span>
                </button>

                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "zip"}
                    onClick={() => setActiveTab("zip")}
                    className={`flex items-center justify-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                        activeTab === "zip"
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm"
                            : "border-[color:var(--border)] bg-[var(--card)] text-[color:var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <Archive size={18} className="shrink-0" />
                    <span>ZIP Archive</span>
                </button>
            </div>

            {/* Tab 1: Git Repository URL */}
            {activeTab === "git" && (
                <form
                    onSubmit={handleGitSubmit}
                    className="space-y-6 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-sm"
                >
                    <div className="space-y-2 text-center">
                        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <GitBranch size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                            Git Repository
                        </h3>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                            Analyze a repository from its URL.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="relative flex items-center">
                            <GitBranch className="absolute left-4 text-[color:var(--muted-foreground)]" size={18} />
                            <input
                                type="url"
                                required
                                aria-label="Git repository URL"
                                placeholder="https://github.com/user/project"
                                value={gitUrl}
                                onChange={(e) => {
                                    setGitUrl(e.target.value);
                                    if (gitUrlError) setGitUrlError(null);
                                }}
                                className={`w-full rounded-2xl border bg-[color:var(--background)] py-3.5 pl-12 pr-4 text-sm font-medium text-[color:var(--foreground)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                                    gitUrlError
                                        ? "border-rose-500 focus:border-rose-500"
                                        : "border-[color:var(--border)] focus:border-[var(--primary)]"
                                }`}
                            />
                        </div>

                        {gitUrlError && (
                            <p className="flex items-center gap-1.5 px-1 text-xs text-rose-500">
                                <AlertCircle size={13} />
                                <span>{gitUrlError}</span>
                            </p>
                        )}
                    </div>

                    {/* Subtle Platform Indicators */}
                    <div className="flex items-center justify-center gap-2 pt-1">
                        <span className="text-[11px] text-[color:var(--muted-foreground)]">Supports public repositories:</span>
                        <span className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)]">
                            GitHub
                        </span>
                        <span className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)]">
                            GitLab
                        </span>
                        <span className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)]">
                            Bitbucket
                        </span>
                    </div>

                    <button
                        type="submit"
                        disabled={!gitUrl.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <span>Continue</span>
                        <ArrowRight size={16} />
                    </button>
                </form>
            )}

            {/* Tab 2: Local Project Folder */}
            {activeTab === "local" && (
                <div className="space-y-6 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-sm">
                    <div className="space-y-2 text-center">
                        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <Folder size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                            Local Project
                        </h3>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                            Select a project folder from your computer.
                        </p>
                    </div>

                    <input
                        ref={folderInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFolderChange}
                        {...({
                            webkitdirectory: "",
                            directory: "",
                            multiple: true,
                        } as Record<string, string | boolean>)}
                    />

                    {!selectedFolder ? (
                        <div
                            onClick={() => folderInputRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    folderInputRef.current?.click();
                                }
                            }}
                            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--border)] p-8 text-center transition hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        >
                            <Folder className="mb-3 text-[color:var(--muted-foreground)]" size={36} />
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Choose Folder
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                                Select the root folder of your project
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                                            <CheckCircle2 size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-[color:var(--foreground)]">
                                                {selectedFolder.name}
                                            </h4>
                                            <p className="text-xs text-[color:var(--muted-foreground)]">
                                                {selectedFolder.files.length.toLocaleString()} files detected
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

                                {/* Folder Tree Preview Snippet */}
                                <div className="rounded-xl border border-[color:var(--border)] bg-[var(--card)] p-4 font-mono text-xs text-[color:var(--foreground)]">
                                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--muted-foreground)]">
                                        <FolderTree size={14} className="text-[var(--primary)]" />
                                        <span>Detected Folder Structure</span>
                                    </div>
                                    <pre className="overflow-x-auto leading-relaxed text-[color:var(--muted-foreground)]">
                                        {selectedFolder.folderTreeLines.join("\n")}
                                    </pre>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleLocalSubmit}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105"
                            >
                                <span>Continue with Project</span>
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Tab 3: ZIP Archive */}
            {activeTab === "zip" && (
                <div className="space-y-6 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-sm">
                    <div className="space-y-2 text-center">
                        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <Archive size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                            ZIP Archive
                        </h3>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                            Analyze a project packaged as a ZIP file.
                        </p>
                    </div>

                    <input
                        ref={zipInputRef}
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={handleZipChange}
                    />

                    {!selectedZip ? (
                        <div
                            onClick={() => zipInputRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    zipInputRef.current?.click();
                                }
                            }}
                            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--border)] p-8 text-center transition hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        >
                            <Archive className="mb-3 text-[color:var(--muted-foreground)]" size={36} />
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Choose ZIP
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                                Supports repository exports (.zip)
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                                        <CheckCircle2 size={20} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-[color:var(--foreground)]">
                                            {selectedZip.name}
                                        </h4>
                                        <p className="text-xs text-[color:var(--muted-foreground)]">
                                            {formatFileSize(selectedZip.size)} • Ready for analysis
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => zipInputRef.current?.click()}
                                    className="text-xs font-semibold text-[var(--primary)] hover:underline"
                                >
                                    Change ZIP
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={handleZipSubmit}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105"
                            >
                                <span>Continue with Archive</span>
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Privacy / Processing Message */}
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[var(--card)]/50 px-4 py-3 text-center text-xs text-[color:var(--muted-foreground)]">
                <Info size={15} className="shrink-0 text-indigo-500" />
                <span>UI preview — no repository is uploaded or analyzed in this version.</span>
            </div>
        </div>
    );
}
