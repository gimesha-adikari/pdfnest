"use client";

import React, { useState, useEffect } from "react";
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
    ArrowRight,
    Filter,
    Plus,
    X,
    Lock,
    AlertCircle,
    Sparkles,
    ShieldCheck,
} from "lucide-react";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import {
    useRepositoryAnalyzer,
    ALL_REPORTS,
    PRESET_OPTIONS,
    MANDATORY_SECURITY_PATTERNS,
} from "@/context/RepositoryAnalyzerContext";
import FlowExplorer from "./explorers/FlowExplorer";
import ImpactExplorer from "./explorers/ImpactExplorer";
import HotspotExplorer from "./explorers/HotspotExplorer";

export default function RepositoryAnalyzerWorkspace() {
    const router = useRouter();
    const { toolId, setFile } = useSharedTool();
    const {
        sessionId,
        source,
        tree,
        scope,
        customPatterns,
        enabledPresets,
        forceIncludes,
        selectedDomains,
        progress,
        result,
        isAnalyzing,
        error,
        enableAi,
        setEnableAi,
        toggleEnableAi,
        togglePreset,
        addCustomPattern,
        removeCustomPattern,
        addForceInclude,
        removeForceInclude,
        toggleDomain,
        selectAllDomains,
        clearDomains,
        startAnalysis,
        reset,
    } = useRepositoryAnalyzer();

    const [customPatternInput, setCustomPatternInput] = useState("");
    const [forceIncludeInput, setForceIncludeInput] = useState("");
    const [isAddingPattern, setIsAddingPattern] = useState(false);
    const [isAddingForce, setIsAddingForce] = useState(false);
    const [activeExplorerTab, setActiveExplorerTab] = useState<"flow" | "impact" | "hotspot">("hotspot");

    // Auto-navigate to download page once analysis completes
    useEffect(() => {
        if (progress?.status === "COMPLETED" && result) {
            router.push(`/${toolId}/download`);
        }
    }, [progress?.status, result, router, toolId]);

    // Empty state guard if accessed directly without source or session
    if (!source || !sessionId) {
        return (
            <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--primary)]/10 text-[var(--primary)]">
                    <GitBranch size={32} />
                </div>
                <h3 className="mt-6 text-xl font-bold text-[color:var(--foreground)]">
                    No active analyzer session
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

    const handleAddPattern = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customPatternInput.trim()) return;
        await addCustomPattern(customPatternInput.trim());
        setCustomPatternInput("");
        setIsAddingPattern(false);
    };

    const handleAddForce = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!forceIncludeInput.trim()) return;
        await addForceInclude(forceIncludeInput.trim());
        setForceIncludeInput("");
        setIsAddingForce(false);
    };

    const totalFiles = tree?.totalFiles || 0;
    const includedFiles = tree?.includedFiles || 0;
    const excludedFiles = tree?.excludedFiles || 0;

    return (
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
            {/* 1. Step Progress Bar (1 Source -> 2 Scoping -> 3 Result) */}
            <div className="flex items-center justify-center">
                <nav aria-label="Progress" className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--card)] px-4 py-1.5 text-xs font-semibold">
                    <span className="text-[color:var(--muted-foreground)]">1 Source</span>
                    <span className="text-[color:var(--border)]">/</span>
                    <span className="flex items-center gap-1 text-[var(--primary)] font-bold">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] text-white">2</span>
                        Scoping & Analysis
                    </span>
                    <span className="text-[color:var(--border)]">/</span>
                    <span className="text-[color:var(--muted-foreground)]">3 Documentation</span>
                </nav>
            </div>

            {/* 2. Repository Identity Card */}
            <div className="flex flex-col gap-4 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                        <GitBranch size={24} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-[color:var(--foreground)] sm:text-xl">
                                {source.name}
                            </h2>
                            <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--primary)] uppercase">
                                {source.type}
                            </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[color:var(--muted-foreground)]">
                            {source.url || source.storageKey || "Local Source"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            setFile(null);
                            reset();
                            router.push(`/${toolId}`);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs font-semibold text-[color:var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[color:var(--foreground)]"
                    >
                        <ArrowLeft size={14} />
                        Change Source
                    </button>
                </div>
            </div>

            {/* Error Banner with Retry Action */}
            {error && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 shadow-sm animate-in fade-in duration-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                                    Analysis Could Not Complete
                                </h4>
                                <p className="text-xs text-rose-700 dark:text-rose-300">
                                    {error}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={startAnalysis}
                            disabled={isAnalyzing || selectedDomains.length === 0}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                        >
                            Retry Analysis
                        </button>
                    </div>
                </div>
            )}


            {/* 3. Scoping & Analysis Grid */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {/* Left Column: Scope & Exclusion Controls (2 cols) */}
                <div className="space-y-6 lg:col-span-2">
                    {/* Presets & Custom Exclusions */}
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-6">
                        <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-4">
                            <div className="flex items-center gap-2">
                                <Filter size={18} className="text-[var(--primary)]" />
                                <h3 className="text-base font-bold text-[color:var(--foreground)]">
                                    Exclusion Hierarchy & Scope
                                </h3>
                            </div>
                            <span className="text-xs text-[color:var(--muted-foreground)]">
                                5-Tier Deterministic Precedence
                            </span>
                        </div>

                        {/* Mandatory Security Rules (Tier 1) */}
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                                <Lock size={14} />
                                <span>Mandatory Security Exclusions (Non-overridable)</span>
                            </div>
                            <p className="text-[11px] text-[color:var(--muted-foreground)]">
                                Private certificates, keys, SSH credentials, and production secret env files are permanently excluded to protect sensitive data.
                            </p>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {MANDATORY_SECURITY_PATTERNS.slice(0, 5).map((p) => (
                                    <span
                                        key={p}
                                        className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-amber-700 dark:text-amber-300"
                                    >
                                        <Lock size={10} />
                                        {p}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Standard Presets (Tier 5) */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                                Standard Presets
                            </h4>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {PRESET_OPTIONS.map((preset) => {
                                    const isChecked = enabledPresets.includes(preset.id);
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => togglePreset(preset.id)}
                                            className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                                                isChecked
                                                    ? "border-[var(--primary)]/40 bg-[var(--primary)]/5 text-[color:var(--foreground)]"
                                                    : "border-[color:var(--border)] bg-[var(--background)] text-[color:var(--muted-foreground)] hover:border-[color:var(--border)]/80"
                                            }`}
                                        >
                                            <span className="text-xs font-semibold">{preset.label}</span>
                                            <div
                                                className={`flex h-4 w-4 items-center justify-center rounded ${
                                                    isChecked
                                                        ? "bg-[var(--primary)] text-white"
                                                        : "border border-[color:var(--border)]"
                                                }`}
                                            >
                                                {isChecked && <Check size={12} />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Custom Exclusion Patterns (Tier 3) */}
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                                    Custom Exclusion Patterns
                                </h4>
                                {!isAddingPattern && (
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingPattern(true)}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                                    >
                                        <Plus size={14} />
                                        Add Pattern
                                    </button>
                                )}
                            </div>

                            {isAddingPattern && (
                                <form onSubmit={handleAddPattern} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={customPatternInput}
                                        onChange={(e) => setCustomPatternInput(e.target.value)}
                                        placeholder="e.g. *.log, temp/**, docs/archive/**"
                                        className="flex-1 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[color:var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white hover:brightness-105"
                                    >
                                        Add
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAddingPattern(false);
                                            setCustomPatternInput("");
                                        }}
                                        className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--muted-foreground)]"
                                    >
                                        Cancel
                                    </button>
                                </form>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {customPatterns.length === 0 ? (
                                    <p className="text-xs text-[color:var(--muted-foreground)] italic">
                                        No custom exclusion patterns configured.
                                    </p>
                                ) : (
                                    customPatterns.map((pat) => (
                                        <span
                                            key={pat}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs font-mono font-medium text-[color:var(--foreground)]"
                                        >
                                            {pat}
                                            <button
                                                type="button"
                                                onClick={() => removeCustomPattern(pat)}
                                                className="text-[color:var(--muted-foreground)] hover:text-red-500"
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Force Includes (Tier 2) */}
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                                    Force Includes (Overrides Presets)
                                </h4>
                                {!isAddingForce && (
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingForce(true)}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                                    >
                                        <Plus size={14} />
                                        Force Include File
                                    </button>
                                )}
                            </div>

                            {isAddingForce && (
                                <form onSubmit={handleAddForce} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={forceIncludeInput}
                                        onChange={(e) => setForceIncludeInput(e.target.value)}
                                        placeholder="e.g. dist/bundle.js, vendor/custom.go"
                                        className="flex-1 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[color:var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white hover:brightness-105"
                                    >
                                        Include
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAddingForce(false);
                                            setForceIncludeInput("");
                                        }}
                                        className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--muted-foreground)]"
                                    >
                                        Cancel
                                    </button>
                                </form>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {forceIncludes.length === 0 ? (
                                    <p className="text-xs text-[color:var(--muted-foreground)] italic">
                                        No force-included files configured.
                                    </p>
                                ) : (
                                    forceIncludes.map((pat) => (
                                        <span
                                            key={pat}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-mono font-medium text-blue-600 dark:text-blue-400"
                                        >
                                            {pat}
                                            <button
                                                type="button"
                                                onClick={() => removeForceInclude(pat)}
                                                className="text-blue-500 hover:text-red-500"
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Target Documentation Domains (8 Domains) */}
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-4">
                            <div>
                                <h3 className="text-base font-bold text-[color:var(--foreground)]">
                                    Target Documentation Domains
                                </h3>
                                <p className="text-xs text-[color:var(--muted-foreground)]">
                                    Select which domains to extract and document
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={selectAllDomains}
                                    className="text-xs font-semibold text-[var(--primary)] hover:underline"
                                >
                                    Select All
                                </button>
                                <span className="text-[color:var(--border)]">•</span>
                                <button
                                    type="button"
                                    onClick={clearDomains}
                                    className="text-xs font-semibold text-[color:var(--muted-foreground)] hover:underline"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {ALL_REPORTS.map((report) => {
                                const isSelected = selectedDomains.includes(report.id);
                                return (
                                    <button
                                        key={report.id}
                                        type="button"
                                        onClick={() => toggleDomain(report.id)}
                                        className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                                            isSelected
                                                ? "border-[var(--primary)]/40 bg-[var(--primary)]/5 text-[color:var(--foreground)] shadow-xs"
                                                : "border-[color:var(--border)] bg-[var(--background)] text-[color:var(--muted-foreground)] opacity-70 hover:opacity-100"
                                        }`}
                                    >
                                        <div className="mt-0.5">{reportIcons[report.id]}</div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold">{report.title}</h4>
                                                {isSelected ? (
                                                    <CheckSquare size={16} className="text-[var(--primary)]" />
                                                ) : (
                                                    <Square size={16} className="text-[color:var(--muted-foreground)]" />
                                                )}
                                            </div>
                                            <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                                                {report.description}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Column: Scoping Metrics & Analysis Launcher (1 col) */}
                <div className="space-y-6">
                    {/* Scoping Summary Card */}
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-5">
                        <h3 className="text-base font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-3">
                            Scoping Summary
                        </h3>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                                    Total
                                </p>
                                <p className="mt-1 text-lg font-extrabold text-[color:var(--foreground)]">
                                    {totalFiles > 0 ? totalFiles : "—"}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                    Included
                                </p>
                                <p className="mt-1 text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                                    {includedFiles > 0 ? includedFiles : "—"}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                    Excluded
                                </p>
                                <p className="mt-1 text-lg font-extrabold text-rose-600 dark:text-rose-400">
                                    {excludedFiles > 0 ? excludedFiles : "—"}
                                </p>
                            </div>
                        </div>

                        {scope?.scopeHash && (
                            <div className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-3 space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                                    Scope Hash
                                </p>
                                <p className="font-mono text-[11px] text-[color:var(--foreground)] truncate">
                                    {scope.scopeHash}
                                </p>
                            </div>
                        )}

                        {/* AI Architecture Synthesis Consent Card */}
                        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/[0.04] p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                        <Sparkles size={16} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-[color:var(--foreground)]">
                                            AI Architecture Synthesis
                                        </p>
                                        <p className="text-[10px] text-[color:var(--muted-foreground)]">
                                            Powered by Google Gemini
                                        </p>
                                    </div>
                                </div>
                                <label className="relative inline-flex cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        checked={enableAi}
                                        onChange={toggleEnableAi}
                                        className="peer sr-only"
                                    />
                                    <div className="peer h-5 w-9 rounded-full bg-gray-300 dark:bg-gray-700 after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-violet-600 peer-checked:after:translate-x-full peer-focus:outline-hidden" />
                                </label>
                            </div>

                            <p className="text-[11px] leading-relaxed text-[color:var(--muted-foreground)]">
                                {enableAi
                                    ? "Enabled: Sends only sanitized metadata and deterministic fact projections (never raw source code or secrets) to Gemini to generate high-level architectural explanations."
                                    : "Disabled (Default): Analysis runs purely deterministically using local AST parsers and graph engines without external AI calls."}
                            </p>

                            {enableAi && (
                                <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-md">
                                    <ShieldCheck size={12} />
                                    <span>Closed-World Grounding • Fact-ID Whitelisted</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 pt-2">
                            <button
                                type="button"
                                onClick={startAnalysis}
                                disabled={isAnalyzing || selectedDomains.length === 0}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Analyzing Repository...
                                    </>
                                ) : (
                                    <>
                                        Start Full Analysis
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                            <p className="text-center text-[11px] text-[color:var(--muted-foreground)]">
                                Pure static analysis. Zero code or script execution.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Live Progress Modal / Overlay during Analysis */}
            {isAnalyzing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                                <Loader2 size={20} className="animate-spin" />
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-[color:var(--foreground)]">
                                    Analyzing Repository
                                </h4>
                                <p className="text-xs text-[color:var(--muted-foreground)]">
                                    {progress?.status || "QUEUED"}
                                </p>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                                <span className="text-[color:var(--foreground)]">
                                    {progress?.stageMessage || "Initializing analysis pipeline..."}
                                </span>
                                <span className="text-[var(--primary)] font-bold">
                                    {progress?.progressPercent || 0}%
                                </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--accent)]">
                                <div
                                    className="h-full bg-[var(--primary)] transition-all duration-300 ease-out"
                                    style={{ width: `${progress?.progressPercent || 5}%` }}
                                />
                            </div>
                        </div>

                        <p className="text-[11px] text-[color:var(--muted-foreground)] text-center">
                            Scanning manifests, extracting AST facts, and validating technology evidence.
                        </p>
                    </div>
                </div>
            )}

            {/* 5. Deep Intelligence Explorers (Wave 2) */}
            {result && (
                <div className="space-y-6 pt-8 border-t border-[color:var(--border)]">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-[color:var(--foreground)]">Intelligence Explorers</h3>
                            <p className="text-sm text-[color:var(--muted-foreground)]">Explore architectural insights, dependencies, and hotspots.</p>
                        </div>
                        <div className="flex bg-[var(--card)] border border-[color:var(--border)] rounded-lg p-1">
                            <button
                                onClick={() => setActiveExplorerTab("hotspot")}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeExplorerTab === "hotspot" ? "bg-[var(--primary)] text-white shadow" : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"}`}
                            >
                                Hotspots
                            </button>
                            <button
                                onClick={() => setActiveExplorerTab("flow")}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeExplorerTab === "flow" ? "bg-[var(--primary)] text-white shadow" : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"}`}
                            >
                                Execution Flow
                            </button>
                            <button
                                onClick={() => setActiveExplorerTab("impact")}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeExplorerTab === "impact" ? "bg-[var(--primary)] text-white shadow" : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"}`}
                            >
                                Blast Radius
                            </button>
                        </div>
                    </div>

                    <div className="mt-6">
                        {activeExplorerTab === "hotspot" && <HotspotExplorer result={result} />}
                        {activeExplorerTab === "flow" && <FlowExplorer result={result} />}
                        {activeExplorerTab === "impact" && <ImpactExplorer result={result} />}
                    </div>
                </div>
            )}
        </div>
    );
}
