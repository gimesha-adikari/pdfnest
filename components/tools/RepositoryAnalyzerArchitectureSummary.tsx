"use client";

import React from "react";
import {
    Sparkles,
    Layers,
    GitCommit,
    Workflow,
    AlertTriangle,
    ShieldCheck,
} from "lucide-react";
import type { ArchitectureSummary } from "@/types/analyzer";

interface ArchitectureSummaryProps {
    summary?: ArchitectureSummary | null;
}

export default function RepositoryAnalyzerArchitectureSummary({ summary }: ArchitectureSummaryProps) {
    if (!summary || !summary.summary) {
        return null;
    }

    const keyComponents = summary.keyComponents ?? [];
    const dataFlow = summary.dataFlow ?? [];
    const risks = summary.risks ?? [];

    return (
        <section
            aria-labelledby="ai-architecture-summary-heading"
            className="rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.04] via-transparent to-purple-500/[0.04] p-6 shadow-sm backdrop-blur-sm sm:p-8"
        >
            {/* Header / Disclosure Badge */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h3
                            id="ai-architecture-summary-heading"
                            className="text-lg font-bold text-[color:var(--foreground)]"
                        >
                            AI Architecture Summary
                        </h3>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                            AI-assisted interpretation synthesized from verified repository facts.
                        </p>
                    </div>
                </div>

                <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                    <ShieldCheck size={13} className="text-violet-500" />
                    <span>AI-Generated • Fact-Grounded</span>
                </div>
            </div>

            {/* Main Executive Summary */}
            <div className="mt-5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/60 p-5 text-sm leading-relaxed text-[color:var(--foreground)]">
                <p>{summary.summary}</p>
            </div>

            {/* Architecture Pattern */}
            {summary.architecturePattern && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[color:var(--muted-foreground)]">
                        Identified Architecture Pattern:
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-2.5 py-1 font-medium text-[color:var(--foreground)] shadow-xs">
                        <Layers size={13} className="text-violet-500" />
                        {summary.architecturePattern}
                    </span>
                </div>
            )}

            {/* Key Components Grid */}
            {keyComponents.length > 0 && (
                <div className="mt-6">
                    <h4 className="flex items-center gap-2 text-xs font-bold tracking-wider text-[color:var(--muted-foreground)] uppercase">
                        <Layers size={14} className="text-violet-500" />
                        Key Architectural Components
                    </h4>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {keyComponents.map((comp, idx) => (
                            <div
                                key={`${comp.name}-${idx}`}
                                className="flex flex-col justify-between rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/80 p-4 shadow-xs"
                            >
                                <div>
                                    <div className="font-bold text-sm text-[color:var(--foreground)]">
                                        {comp.name}
                                    </div>
                                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)] leading-normal">
                                        {comp.role}
                                    </p>
                                </div>
                                {comp.factIds && comp.factIds.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1 border-t border-[color:var(--border)]/60 pt-2">
                                        {comp.factIds.map((id) => (
                                            <span
                                                key={id}
                                                className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-violet-700 dark:text-violet-300"
                                            >
                                                {id}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Data Flow Workflow */}
            {dataFlow.length > 0 && (
                <div className="mt-6">
                    <h4 className="flex items-center gap-2 text-xs font-bold tracking-wider text-[color:var(--muted-foreground)] uppercase">
                        <Workflow size={14} className="text-violet-500" />
                        Data &amp; Execution Flow
                    </h4>
                    <div className="mt-3 space-y-2">
                        {dataFlow.map((step, idx) => (
                            <div
                                key={idx}
                                className="flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/70 p-3.5 text-xs text-[color:var(--foreground)]"
                            >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/10 font-bold text-[10px] text-violet-600 dark:text-violet-400">
                                    {step.step || idx + 1}
                                </span>
                                <div className="flex-1">
                                    <p className="leading-relaxed">{step.description}</p>
                                    {step.factIds && step.factIds.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {step.factIds.map((id) => (
                                                <span
                                                    key={id}
                                                    className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-mono text-violet-700 dark:text-violet-300"
                                                >
                                                    {id}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Considerations & Risks */}
            {risks.length > 0 && (
                <div className="mt-6">
                    <h4 className="flex items-center gap-2 text-xs font-bold tracking-wider text-[color:var(--muted-foreground)] uppercase">
                        <AlertTriangle size={14} className="text-amber-500" />
                        Architectural Considerations
                    </h4>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {risks.map((risk, idx) => (
                            <div
                                key={idx}
                                className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-3.5 text-xs text-[color:var(--foreground)]"
                            >
                                <div className="font-semibold text-amber-700 dark:text-amber-400">
                                    {risk.category}
                                </div>
                                <p className="mt-1 text-[color:var(--muted-foreground)] leading-normal">
                                    {risk.description}
                                </p>
                                {risk.factIds && risk.factIds.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {risk.factIds.map((id) => (
                                            <span
                                                key={id}
                                                className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-amber-700 dark:text-amber-400"
                                            >
                                                {id}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
