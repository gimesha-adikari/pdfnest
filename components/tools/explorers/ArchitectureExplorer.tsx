import React, { useState } from "react";
import { CanonicalAnalysisResult, ComponentDescription, Evidence } from "../../../types/analyzer";
import { Boxes, Layers, Server, Code, Database, Cpu } from "lucide-react";
import EvidenceExplorer from "./EvidenceExplorer";

interface ArchitectureExplorerProps {
    result: CanonicalAnalysisResult;
}

export default function ArchitectureExplorer({ result }: ArchitectureExplorerProps) {
    const summary = result.architectureSummary;
    const [selectedComponent, setSelectedComponent] = useState<ComponentDescription | null>(null);

    if (!summary) {
        return (
            <div className="flex items-center justify-center p-8 border border-[color:var(--border)] rounded-2xl bg-[var(--background)]">
                <p className="text-sm text-[color:var(--muted-foreground)]">No architecture summary available.</p>
            </div>
        );
    }

    const keyComponents = summary.keyComponents || [];
    
    // Attempt to roughly classify tiers based on role text (simple heuristic)
    const frontend = keyComponents.filter(c => c.role.toLowerCase().includes("frontend") || c.role.toLowerCase().includes("ui") || c.role.toLowerCase().includes("client"));
    const api = keyComponents.filter(c => c.role.toLowerCase().includes("api") || c.role.toLowerCase().includes("gateway") || c.role.toLowerCase().includes("controller"));
    const worker = keyComponents.filter(c => c.role.toLowerCase().includes("worker") || c.role.toLowerCase().includes("queue") || c.role.toLowerCase().includes("job"));
    const storage = keyComponents.filter(c => c.role.toLowerCase().includes("database") || c.role.toLowerCase().includes("storage") || c.role.toLowerCase().includes("cache") || c.role.toLowerCase().includes("repository"));
    
    // Everything else
    const classifiedIds = new Set([...frontend, ...api, ...worker, ...storage].map(c => c.name));
    const others = keyComponents.filter(c => !classifiedIds.has(c.name));

    const tiers = [
        { name: "Presentation / UI", items: frontend, icon: <Layers size={16} /> },
        { name: "API / Gateway", items: api, icon: <Server size={16} /> },
        { name: "Workers / Queues", items: worker, icon: <Cpu size={16} /> },
        { name: "Data / Storage", items: storage, icon: <Database size={16} /> },
        { name: "Other Services", items: others, icon: <Boxes size={16} /> }
    ].filter(tier => tier.items.length > 0);

    const handleComponentClick = (comp: ComponentDescription) => {
        setSelectedComponent(comp);
    };

    // Helper to fetch evidence for the selected component
    const getEvidenceForComponent = (comp: ComponentDescription): Evidence[] => {
        if (!comp.factIds || !result.evidence) return [];
        return result.evidence.filter(ev => comp.factIds!.includes(ev.id));
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Topology Visualization (Left/Top) */}
                <div className="flex-1 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-6 space-y-8 overflow-x-auto">
                    <div className="flex items-center gap-2 mb-4 border-b border-[color:var(--border)] pb-4">
                        <Boxes size={20} className="text-[var(--primary)]" />
                        <h3 className="text-base font-bold text-[color:var(--foreground)]">System Topology</h3>
                    </div>

                    {tiers.length === 0 ? (
                        <div className="text-sm text-[color:var(--muted-foreground)] py-8 text-center">
                            Could not auto-classify component tiers.
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-8 sm:gap-4 justify-between min-w-[600px]">
                            {tiers.map((tier, idx) => (
                                <div key={tier.name} className="flex-1 flex flex-col gap-3 relative">
                                    {/* Arrow connecting to next tier */}
                                    {idx < tiers.length - 1 && (
                                        <div className="hidden sm:block absolute top-1/2 -right-3 w-6 h-px bg-[color:var(--border)] -translate-y-1/2 z-0" />
                                    )}
                                    
                                    <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)] mb-2">
                                        {tier.icon}
                                        {tier.name}
                                    </div>
                                    
                                    <div className="flex flex-col gap-3 z-10">
                                        {tier.items.map(comp => (
                                            <button
                                                key={comp.name}
                                                type="button"
                                                onClick={() => handleComponentClick(comp)}
                                                className={`text-left rounded-xl border p-3 transition-all hover:shadow-md ${
                                                    selectedComponent?.name === comp.name
                                                        ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm ring-1 ring-[var(--primary)]/20"
                                                        : "border-[color:var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/50"
                                                }`}
                                            >
                                                <div className="font-bold text-sm text-[color:var(--foreground)] truncate">
                                                    {comp.name}
                                                </div>
                                                <div className="text-[10px] text-[color:var(--muted-foreground)] mt-1 line-clamp-2">
                                                    {comp.role}
                                                </div>
                                                {comp.factIds && comp.factIds.length > 0 && (
                                                    <div className="mt-2 inline-flex items-center gap-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-semibold text-[color:var(--muted-foreground)]">
                                                        <Code size={10} />
                                                        {comp.factIds.length} facts
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Data Flow (Right/Bottom) */}
                {summary.dataFlow && summary.dataFlow.length > 0 && (
                    <div className="lg:w-80 shrink-0 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 flex flex-col h-full">
                        <h3 className="text-base font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-4 mb-4">
                            Data Flow
                        </h3>
                        <div className="flex-1 overflow-y-auto space-y-4">
                            {summary.dataFlow.map((flow) => (
                                <div key={flow.step} className="flex gap-3">
                                    <div className="flex flex-col items-center">
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[10px] font-bold text-[var(--primary)]">
                                            {flow.step}
                                        </div>
                                        <div className="w-px h-full bg-[color:var(--border)] mt-2" />
                                    </div>
                                    <div className="pb-4 pt-0.5">
                                        <p className="text-xs text-[color:var(--foreground)] leading-relaxed">
                                            {flow.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Evidence Modal Integration */}
            {selectedComponent && (
                <EvidenceExplorer
                    isOpen={!!selectedComponent}
                    onClose={() => setSelectedComponent(null)}
                    title={selectedComponent.name}
                    evidenceList={getEvidenceForComponent(selectedComponent)}
                />
            )}
        </div>
    );
}
