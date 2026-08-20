"use client";

import React, { useState, useRef, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, FolderOpen, FileArchive, ArrowRight, Folder, File as FileIcon, CheckCircle2 } from "lucide-react";
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

    // 2. Local Directory State
    const folderInputRef = useRef<HTMLInputElement | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<{
        name: string;
        files: File[];
        samplePaths: string[];
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

    // Git submission handler
    const handleGitSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = gitUrl.trim();
        if (!trimmed) return;

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
        const folderName = firstRelativePath.split("/")[0] || "local-project";
        const samplePaths = filesArray
            .slice(0, 4)
            .map((f) => f.webkitRelativePath || f.name);

        setSelectedFolder({
            name: folderName,
            files: filesArray,
            samplePaths,
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
            {/* Source Mode Tabs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                    type="button"
                    onClick={() => setActiveTab("git")}
                    className={`flex items-center justify-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition-all ${
                        activeTab === "git"
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm"
                            : "border-[color:var(--border)] bg-[var(--card)] text-[color:var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <GitBranch size={18} />
                    <span>Git Repository</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("local")}
                    className={`flex items-center justify-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition-all ${
                        activeTab === "local"
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm"
                            : "border-[color:var(--border)] bg-[var(--card)] text-[color:var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <FolderOpen size={18} />
                    <span>Local Project</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("zip")}
                    className={`flex items-center justify-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition-all ${
                        activeTab === "zip"
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm"
                            : "border-[color:var(--border)] bg-[var(--card)] text-[color:var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <FileArchive size={18} />
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
                            Provide Git Repository URL
                        </h3>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                            Enter any public repository link from GitHub, GitLab, or Bitbucket.
                        </p>
                    </div>

                    <div className="relative flex items-center">
                        <GitBranch className="absolute left-4 text-[color:var(--muted-foreground)]" size={18} />
                        <input
                            type="url"
                            required
                            placeholder="https://github.com/user/project"
                            value={gitUrl}
                            onChange={(e) => setGitUrl(e.target.value)}
                            className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] py-3.5 pl-12 pr-4 text-sm font-medium text-[color:var(--foreground)] transition-colors focus:border-[var(--primary)] focus:outline-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!gitUrl.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <span>Continue with Repository</span>
                        <ArrowRight size={16} />
                    </button>
                </form>
            )}

            {/* Tab 2: Local Project Folder */}
            {activeTab === "local" && (
                <div className="space-y-6 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-sm">
                    <div className="space-y-2 text-center">
                        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <FolderOpen size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                            Select Local Project Directory
                        </h3>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                            Pick a local repository folder directly from your device. Files stay on your machine.
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
                        } as any)}
                    />

                    {!selectedFolder ? (
                        <div
                            onClick={() => folderInputRef.current?.click()}
                            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--border)] p-8 text-center transition hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/[0.02]"
                        >
                            <Folder className="mb-3 text-[color:var(--muted-foreground)]" size={36} />
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Click to select a project folder
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                                Choose the root directory of your project
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                                            <Folder size={20} />
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

                                {selectedFolder.samplePaths.length > 0 && (
                                    <div className="mt-4 rounded-xl bg-[var(--card)] p-3 text-xs font-mono text-[color:var(--muted-foreground)]">
                                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]">
                                            Sample paths:
                                        </p>
                                        <ul className="space-y-1">
                                            {selectedFolder.samplePaths.map((p, idx) => (
                                                <li key={idx} className="truncate">
                                                    • {p}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
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
                            <FileArchive size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                            Upload ZIP Archive
                        </h3>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                            Select a compressed .zip archive of the codebase.
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
                            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--border)] p-8 text-center transition hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/[0.02]"
                        >
                            <FileArchive className="mb-3 text-[color:var(--muted-foreground)]" size={36} />
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Click to select a .zip repository archive
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
                                        <FileIcon size={20} />
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
        </div>
    );
}
