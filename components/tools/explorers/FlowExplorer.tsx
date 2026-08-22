import React, { useState } from "react";
import { CanonicalAnalysisResult, DataFlowStep, Evidence, EpistemicConfidence } from "../../../types/analyzer";
import { ShieldCheck, ShieldAlert, ShieldQuestion, ArrowRight, Activity, GitCommit } from "lucide-react";
import EvidenceExplorer from "./EvidenceExplorer";

interface FlowExplorerProps {
    result: CanonicalAnalysisResult;
}

export default function FlowExplorer({ result }: FlowExplorerProps) {
    const [selectedStep, setSelectedStep] = useState<DataFlowStep | null>(null);

    // Prefer deterministic intelligence flows, falling back to AI summary flows
    const intelFlows = result.intelligence?.flow || [];
    const aiFlows = (result.ai || result.architectureSummary)?.dataFlow || [];

    const displaySteps: DataFlowStep[] = [];

    if (intelFlows.length > 0) {
        let stepCounter = 1;
        intelFlows.forEach((f) => {
            f.steps.forEach((st) => {
                const entityId = st.entityId || (st as unknown as { EntityID?: string }).EntityID || "";
                const targetId = st.targetId || (st as unknown as { TargetID?: string }).TargetID || "";
                const action = st.action || (st as unknown as { Action?: string }).Action || "Executes";
                const srcName = entityId ? entityId.replace(/^[^:]+:/, "") : "Unknown Source";
                const tgtName = targetId ? targetId.replace(/^[^:]+:/, "") : "Unknown Target";

                displaySteps.push({
                    step: stepCounter++,
                    description: `${action}: ${srcName} → ${tgtName}`,
                    factIds: [entityId, targetId].filter(Boolean),
                });
            });
        });
    } else if (aiFlows.length > 0) {
        displaySteps.push(...aiFlows);
    }

    if (displaySteps.length === 0) {
        return (
            <div className="flex items-center justify-center p-8 border border-[color:var(--border)] rounded-2xl bg-[var(--background)]">
                <p className="text-sm text-[color:var(--muted-foreground)]">No execution flows available for this repository.</p>
            </div>
        );
    }

    const getEvidenceForStep = (step: DataFlowStep): Evidence[] => {
        if (!step.factIds || !result.evidence) return [];
        return result.evidence.filter(ev => step.factIds!.includes(ev.id));
    };

    const getStepConfidence = (step: DataFlowStep): EpistemicConfidence | null => {
        const evs = getEvidenceForStep(step);
        if (evs.length === 0) return null;
        if (evs.some(e => e.confidence === "WEAKLY_INFERRED")) return "WEAKLY_INFERRED";
        if (evs.some(e => e.confidence === "STRONGLY_INFERRED")) return "STRONGLY_INFERRED";
        return "CONFIRMED";
    };

    const renderConfidenceTag = (confidence: EpistemicConfidence | null) => {
        if (!confidence) return null;
        
        switch (confidence) {
            case "CONFIRMED":
                return (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck size={12} /> CONFIRMED
                    </span>
                );
            case "STRONGLY_INFERRED":
                return (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        <ShieldAlert size={12} /> STRONGLY INFERRED
                    </span>
                );
            case "WEAKLY_INFERRED":
                return (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                        <ShieldQuestion size={12} /> WEAKLY INFERRED
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-6">
                <div className="flex items-center gap-2 border-b border-[color:var(--border)] pb-4">
                    <Activity size={20} className="text-[var(--primary)]" />
                    <h3 className="text-base font-bold text-[color:var(--foreground)]">Execution Flow</h3>
                </div>

                <div className="relative space-y-0 before:absolute before:inset-y-0 before:left-[19px] before:w-0.5 before:bg-[color:var(--border)]">
                    {displaySteps.map((flow, index) => {
                        const isLast = index === displaySteps.length - 1;
                        return (
                            <div key={flow.step} className="relative flex items-start gap-6 pb-6">
                                {/* Timeline Node */}
                                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--background)] border-2 border-[var(--primary)] text-[var(--primary)] font-bold text-sm shadow-sm">
                                    {flow.step}
                                </div>
                                
                                {/* Step Content */}
                                <div 
                                    className="flex-1 rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-4 transition-colors hover:border-[var(--primary)]/50 cursor-pointer shadow-sm group"
                                    onClick={() => setSelectedStep(flow)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <p className="text-sm font-medium text-[color:var(--foreground)] leading-relaxed group-hover:text-[var(--primary)] transition-colors">
                                            {flow.description}
                                        </p>
                                        <div className="shrink-0 flex flex-col items-end gap-2">
                                            {renderConfidenceTag(getStepConfidence(flow))}
                                            {flow.factIds && flow.factIds.length > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-[color:var(--muted-foreground)] font-semibold">
                                                    <GitCommit size={12} /> {flow.factIds.length} facts
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {selectedStep && (
                <EvidenceExplorer
                    isOpen={!!selectedStep}
                    onClose={() => setSelectedStep(null)}
                    title={`Step ${selectedStep.step} Evidence`}
                    evidenceList={getEvidenceForStep(selectedStep)}
                />
            )}
        </div>
    );
}
