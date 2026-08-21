"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
    GitBranch,
    FolderTree,
    Cpu,
    Boxes,
    Terminal,
    KeyRound,
    Network,
    TestTube2,
    Rocket,
    Loader2,
    Check,
    ArrowLeft,
    CheckSquare,
    Square,
    Layers,
    FileCode2,
    Folder,
    PackageCheck,
    ArrowRight,
    Filter,
    Plus,
    X,
    ChevronDown,
    ChevronUp,
    FileCheck,
    FileX,
    Eye,
} from "lucide-react";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import {
    useRepositoryAnalyzer,
    ALL_REPORTS,
} from "@/context/RepositoryAnalyzerContext";

export default function RepositoryAnalyzerWorkspace() {
    const router = useRouter();
    const { toolId, setFile } = useSharedTool();
    const {
        source,
        exclusions,
        selectedReports,
        mockProject,
        isGenerating,
        setIsGenerating,
        addExclusion,
        removeExclusion,
        toggleReport,
        selectAllReports,
        clearReports,
        reset,
    } = useRepositoryAnalyzer();

    const [loadingLocal, setLoadingLocal] = useState(false);
    const [customPattern, setCustomPattern] = useState("");
    const [isAddingPattern, setIsAddingPattern] = useState(false);
    const [showFilePreview, setShowFilePreview] = useState(false);
    const [showAllPreviewFiles, setShowAllPreviewFiles] = useState(false);

    // Empty state guard if accessed directly without source
    if (!source) {
        return (
            <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--primary)]/10 text-[var(--primary)]">
                    <GitBranch size={32} />
                </div>
                <h3 className="mt-6 text-xl font-bold text-[color:var(--foreground)]">
                    No repository selected
                </h3>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                    Please provide a Git repository URL, local project directory, or ZIP archive to begin analysis.
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setFile(null);
                        reset();
                        router.push(`/${toolId}`);
                    }}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-105"
                >
                    <ArrowLeft size={16} />
                    Choose Repository
                </button>
            </div>
        );
    }

    const reportIcons: Record<string, React.ReactNode> = {
        "Project Structure": <FolderTree size={20} className="text-blue-500" />,
        "Technology Stack": <Cpu size={20} className="text-indigo-500" />,
        "Dependencies": <Boxes size={20} className="text-emerald-500" />,
        "Setup & Run Guide": <Terminal size={20} className="text-amber-500" />,
        "Environment Configuration": <KeyRound size={20} className="text-purple-500" />,
        "API Overview": <Network size={20} className="text-cyan-500" />,
        "Testing": <TestTube2 size={20} className="text-rose-500" />,
        "Deployment": <Rocket size={20} className="text-orange-500" />,
    };

    const handleAddPattern = (e: React.FormEvent) => {
        e.preventDefault();
        if (!customPattern.trim()) return;
        addExclusion(customPattern.trim());
        setCustomPattern("");
        setIsAddingPattern(false);
    };

    const handleGenerate = () => {
        if (selectedReports.length === 0) return;

        setLoadingLocal(true);
        setIsGenerating(true);

        // UI-only simulation: wait ~1000ms before moving to download page
        setTimeout(() => {
            setLoadingLocal(false);
            setIsGenerating(false);
            router.push(`/${toolId}/download`);
        }, 1000);
    };

    const displayedIncludedFiles = showAllPreviewFiles
        ? mockProject.scope.sampleIncluded
        : mockProject.scope.sampleIncluded.slice(0, 3);

    const displayedExcludedFiles = showAllPreviewFiles
        ? mockProject.scope.sampleExcluded
        : mockProject.scope.sampleExcluded.slice(0, 3);

    return (
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
            {/* 1. Step Progress Bar (1 Source -> 2 Analyze -> 3 Export) */}
            <div className="flex items-center justify-center">
                <nav aria-label="Progress" className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--card)] px-4 py-1.5 text-xs font-semibold">
                    <span className="text-[color:var(--muted-foreground)]">1 Source</span>
                    <span className="text-[color:var(--border)]">/</span>
                    <span className="flex items-center gap-1 text-[var(--primary)] font-bold">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] text-white">2</span>
                        Analyze
                    </span>
                    <span className="text-[color:var(--border)]">/</span>
                    <span className="text-[color:var(--muted-foreground)]">3 Export</span>
                </nav>
            </div>

            {/* 2. Repository Identity & Header */}
            <div className="relative overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <GitBranch size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-[color:var(--foreground)]">
                                    {mockProject.name}
                                </h1>
                                <span className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)]">
                                    Mock analysis
                                </span>
                            </div>
                            <p className="text-xs text-[color:var(--muted-foreground)] truncate max-w-md">
                                {source.type === "git"
                                    ? `${source.provider || "Git"} • ${source.url}`
                                    : source.type === "local"
                                    ? `Local Project Directory • ${mockProject.scope.totalFiles.toLocaleString()} files scanned`
                                    : `ZIP Repository Archive • ${source.file.name}`}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setFile(null);
                            reset();
                            router.push(`/${toolId}`);
                        }}
                        className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-[color:var(--muted-foreground)] transition hover:text-[color:var(--foreground)] sm:self-center"
                    >
                        <ArrowLeft size={13} />
                        Change source
                    </button>
                </div>
            </div>

            {/* 3. Analysis Scope & Exclusions Section */}
            <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6 space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[color:var(--border)] pb-4">
                    <div className="flex items-center gap-2.5">
                        <Filter size={18} className="text-[var(--primary)]" />
                        <div>
                            <h2 className="text-sm font-bold text-[color:var(--foreground)]">
                                Analysis Scope
                            </h2>
                            <p className="text-xs text-[color:var(--muted-foreground)]">
                                Configure which files and directory trees are included in documentation generation
                            </p>
                        </div>
                    </div>

                    <div className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-[color:var(--foreground)]">
                        <span className="text-emerald-500 font-bold">{mockProject.scope.includedFiles.toLocaleString()} included</span>
                        <span className="text-[color:var(--border)]">•</span>
                        <span className="text-[color:var(--muted-foreground)]">{mockProject.scope.excludedFiles.toLocaleString()} excluded</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {/* Included Files Summary */}
                    <div className="space-y-2.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                            Included in Analysis
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-600">
                                <Check size={12} strokeWidth={3} />
                                Source files
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-600">
                                <Check size={12} strokeWidth={3} />
                                Configuration files
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-600">
                                <Check size={12} strokeWidth={3} />
                                Documentation
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-600">
                                <Check size={12} strokeWidth={3} />
                                Package manifests
                            </span>
                        </div>
                    </div>

                    {/* Active Exclusions */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                                Active Exclusions ({exclusions.length})
                            </span>
                            {!isAddingPattern && (
                                <button
                                    type="button"
                                    onClick={() => setIsAddingPattern(true)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] hover:underline"
                                >
                                    <Plus size={12} />
                                    Add exclusion
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {exclusions.map((pat) => (
                                <span
                                    key={pat}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-2.5 py-1 text-xs font-mono text-[color:var(--foreground)]"
                                >
                                    <span>{pat}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeExclusion(pat)}
                                        aria-label={`Remove exclusion ${pat}`}
                                        className="text-[color:var(--muted-foreground)] hover:text-rose-500"
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                        </div>

                        {/* Add Pattern Input Box */}
                        {isAddingPattern && (
                            <form onSubmit={handleAddPattern} className="flex items-center gap-2 pt-1">
                                <input
                                    type="text"
                                    placeholder="e.g. temp/**, *.log"
                                    value={customPattern}
                                    onChange={(e) => setCustomPattern(e.target.value)}
                                    className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 text-xs font-mono text-[color:var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    className="rounded-xl bg-[var(--primary)] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-105"
                                >
                                    Add
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddingPattern(false);
                                        setCustomPattern("");
                                    }}
                                    className="rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                                >
                                    Cancel
                                </button>
                            </form>
                        )}
                    </div>
                </div>

                {/* Expandable File Preview Drawer */}
                <div className="border-t border-[color:var(--border)] pt-3">
                    <button
                        type="button"
                        onClick={() => setShowFilePreview(!showFilePreview)}
                        className="flex w-full items-center justify-between text-xs font-semibold text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                    >
                        <span className="flex items-center gap-1.5">
                            <Eye size={14} className="text-[var(--primary)]" />
                            <span>Preview scoped files</span>
                        </span>
                        {showFilePreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {showFilePreview && (
                        <div className="mt-3 space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-4 text-xs font-mono">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {/* Included Samples */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1 font-bold text-emerald-600">
                                        <FileCheck size={13} />
                                        <span>Included Samples</span>
                                    </div>
                                    <ul className="space-y-1 text-[11px] text-[color:var(--muted-foreground)]">
                                        {displayedIncludedFiles.length > 0 ? (
                                            displayedIncludedFiles.map((p, idx) => (
                                                <li key={idx} className="truncate">
                                                    ✓ {p}
                                                </li>
                                            ))
                                        ) : (
                                            <li>(no included files match)</li>
                                        )}
                                    </ul>
                                </div>

                                {/* Excluded Samples */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1 font-bold text-rose-500">
                                        <FileX size={13} />
                                        <span>Excluded Samples</span>
                                    </div>
                                    <ul className="space-y-1 text-[11px] text-[color:var(--muted-foreground)]">
                                        {displayedExcludedFiles.length > 0 ? (
                                            displayedExcludedFiles.map((p, idx) => (
                                                <li key={idx} className="truncate text-[color:var(--muted-foreground)]/80">
                                                    × {p}
                                                </li>
                                            ))
                                        ) : (
                                            <li>(no files excluded)</li>
                                        )}
                                    </ul>
                                </div>
                            </div>

                            {mockProject.scope.sampleIncluded.length > 3 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllPreviewFiles(!showAllPreviewFiles)}
                                    className="text-[11px] font-sans font-semibold text-[var(--primary)] hover:underline"
                                >
                                    {showAllPreviewFiles ? "Show fewer" : "Show more"}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Repository Summary & Detected Technologies */}
            <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6 space-y-4">
                <h2 className="text-sm font-bold text-[color:var(--foreground)]">
                    Detected Technical Metadata
                </h2>

                {/* Statistics Row */}
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-3 sm:grid-cols-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--foreground)]">
                        <FileCode2 size={15} className="text-[var(--primary)] shrink-0" />
                        <span>{mockProject.stats.files}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--foreground)]">
                        <Folder size={15} className="text-amber-500 shrink-0" />
                        <span>{mockProject.stats.directories}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--foreground)]">
                        <Layers size={15} className="text-indigo-500 shrink-0" />
                        <span>{mockProject.stats.linesOfCode}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--foreground)]">
                        <PackageCheck size={15} className="text-emerald-500 shrink-0" />
                        <span>{mockProject.stats.packageManagers}</span>
                    </div>
                </div>

                {/* Technology Groups */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[color:var(--muted-foreground)]">Languages:</span>
                        <div className="flex flex-wrap gap-1">
                            {mockProject.languages.map((lang) => (
                                <span
                                    key={lang}
                                    className={`rounded-md border px-2 py-0.5 font-medium text-[11px] ${
                                        lang === "Not detected"
                                            ? "border-dashed border-[color:var(--border)] text-[color:var(--muted-foreground)] italic"
                                            : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--foreground)]"
                                    }`}
                                >
                                    {lang}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[color:var(--muted-foreground)]">Frameworks:</span>
                        <div className="flex flex-wrap gap-1">
                            {mockProject.frameworks.map((fw) => (
                                <span
                                    key={fw}
                                    className={`rounded-md border px-2 py-0.5 font-medium text-[11px] ${
                                        fw === "Not detected"
                                            ? "border-dashed border-[color:var(--border)] text-[color:var(--muted-foreground)] italic"
                                            : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--foreground)]"
                                    }`}
                                >
                                    {fw}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[color:var(--muted-foreground)]">Database:</span>
                        <div className="flex flex-wrap gap-1">
                            {mockProject.database.map((db) => (
                                <span
                                    key={db}
                                    className={`rounded-md border px-2 py-0.5 font-medium text-[11px] ${
                                        db === "Not detected"
                                            ? "border-dashed border-[color:var(--border)] text-[color:var(--muted-foreground)] italic"
                                            : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--foreground)]"
                                    }`}
                                >
                                    {db}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[color:var(--muted-foreground)]">Infrastructure:</span>
                        <div className="flex flex-wrap gap-1">
                            {mockProject.infrastructure.map((inf) => (
                                <span
                                    key={inf}
                                    className={`rounded-md border px-2 py-0.5 font-medium text-[11px] ${
                                        inf === "Not detected"
                                            ? "border-dashed border-[color:var(--border)] text-[color:var(--muted-foreground)] italic"
                                            : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--foreground)]"
                                    }`}
                                >
                                    {inf}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. Documentation Section Selection */}
            <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-[color:var(--foreground)]">
                            Documentation to generate
                        </h2>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                            {selectedReports.length} of {ALL_REPORTS.length} sections selected
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={selectAllReports}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded"
                        >
                            <CheckSquare size={13} />
                            Select all
                        </button>
                        <span className="text-[color:var(--border)]">|</span>
                        <button
                            type="button"
                            onClick={clearReports}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded"
                        >
                            <Square size={13} />
                            Clear
                        </button>
                    </div>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    {ALL_REPORTS.map((report) => {
                        const isSelected = selectedReports.includes(report.id);
                        return (
                            <div
                                key={report.id}
                                role="checkbox"
                                aria-checked={isSelected}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        toggleReport(report.id);
                                    }
                                }}
                                onClick={() => toggleReport(report.id)}
                                className={`group relative cursor-pointer rounded-2xl border p-4.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                                    isSelected
                                        ? "border-[var(--primary)] bg-[var(--primary)]/[0.04] shadow-sm ring-1 ring-[var(--primary)]"
                                        : "border-[color:var(--border)] bg-[var(--card)] hover:border-[color:var(--border)]/80 hover:bg-[color:var(--background)]"
                                }`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--background)] border border-[color:var(--border)]">
                                        {reportIcons[report.id] || <GitBranch size={16} />}
                                    </div>
                                    <div
                                        className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
                                            isSelected
                                                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                                                : "border-[color:var(--border)] bg-[color:var(--background)] group-hover:border-[var(--primary)]/40"
                                        }`}
                                    >
                                        {isSelected && <Check size={12} strokeWidth={3} />}
                                    </div>
                                </div>

                                <div className="mt-3.5 space-y-1">
                                    <h3 className="text-sm font-bold text-[color:var(--foreground)]">
                                        {report.title}
                                    </h3>
                                    <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)] line-clamp-2">
                                        {report.description}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 6. Bottom Generate Button */}
            <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
                <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={selectedReports.length === 0 || loadingLocal || isGenerating}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[260px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]"
                >
                    {loadingLocal || isGenerating ? (
                        <>
                            <Loader2 className="animate-spin" size={18} />
                            <span>Preparing documentation...</span>
                        </>
                    ) : (
                        <>
                            <span>Generate Documentation</span>
                            <ArrowRight size={16} />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
