import React, { useState } from "react";
import { CanonicalAnalysisResult, ComponentDescription, Evidence } from "../../../types/analyzer";
import { Boxes, Layers, Server, Code, Database, Cpu } from "lucide-react";
import EvidenceExplorer from "./EvidenceExplorer";

interface ArchitectureExplorerProps {
    result: CanonicalAnalysisResult;
}

export default function ArchitectureExplorer({ result }: ArchitectureExplorerProps) {
    const [selectedComponent, setSelectedComponent] = useState<ComponentDescription | null>(null);

    const archComponents = result.intelligence?.architecture || [];
    const graphEntities = result.graph?.entities || [];
    const summary = result.ai || result.architectureSummary;

    // 1. If deterministic architecture intelligence exists, build tiers from it
    let tiers: { name: string; items: ComponentDescription[]; icon: React.ReactNode }[] = [];

    if (archComponents.length > 0) {
        const tierMap: Record<string, ComponentDescription[]> = {
            Frontend: [],
            API: [],
            Queue: [],
            Worker: [],
            Storage: [],
            Database: [],
            Deployment: [],
        };

        archComponents.forEach(ac => {
            const rawEntityId = ac.entityId || (ac as unknown as { EntityID?: string }).EntityID || "";
            const ent = graphEntities.find(e => e.id === rawEntityId);
            const name = ent ? ent.name : rawEntityId ? rawEntityId.replace(/^[^:]+:/, "") : "Unknown Component";
            const factIds = (ac.evidence || []).map(e => e.id).filter(Boolean);
            const tier = ac.tier || (ac as unknown as { Tier?: string }).Tier || "API";
            const confidence = ac.confidence || (ac as unknown as { Confidence?: string }).Confidence || "CONFIRMED";
            const comp: ComponentDescription = {
                name,
                role: `${tier} Component (${confidence})`,
                factIds,
            };
            if (tierMap[tier]) {
                tierMap[tier].push(comp);
            } else {
                tierMap[tier] = [comp];
            }
        });

        const tierIcons: Record<string, React.ReactNode> = {
            Frontend: <Layers size={16} />,
            API: <Server size={16} />,
            Queue: <Cpu size={16} />,
            Worker: <Cpu size={16} />,
            Storage: <Database size={16} />,
            Database: <Database size={16} />,
            Deployment: <Boxes size={16} />,
        };

        tiers = Object.entries(tierMap)
            .filter(([_, items]) => items.length > 0)
            .map(([tierName, items]) => ({
                name: tierName,
                items,
                icon: tierIcons[tierName] || <Boxes size={16} />,
            }));
    } else if (graphEntities.length > 0) {
        // Build tiers from graph entity kinds
        const routes = graphEntities.filter(e => e.kind === "route").map(e => ({ name: e.name, role: "API Route Endpoint", factIds: (e.evidence || []).map(ev => ev.id) }));
        const services = graphEntities.filter(e => e.kind === "service" || e.kind === "symbol").map(e => ({ name: e.name, role: "Service / Symbol", factIds: (e.evidence || []).map(ev => ev.id) }));
        const storage = graphEntities.filter(e => e.kind === "storage" || e.kind === "model").map(e => ({ name: e.name, role: "Storage / Data Model", factIds: (e.evidence || []).map(ev => ev.id) }));
        const configs = graphEntities.filter(e => e.kind === "config").map(e => ({ name: e.name, role: "Configuration", factIds: (e.evidence || []).map(ev => ev.id) }));

        if (routes.length > 0) tiers.push({ name: "API & Routes", items: routes.slice(0, 10), icon: <Server size={16} /> });
        if (services.length > 0) tiers.push({ name: "Services & Logic", items: services.slice(0, 10), icon: <Cpu size={16} /> });
        if (storage.length > 0) tiers.push({ name: "Data & Models", items: storage.slice(0, 10), icon: <Database size={16} /> });
        if (configs.length > 0) tiers.push({ name: "Config & Environment", items: configs.slice(0, 10), icon: <Boxes size={16} /> });
    } else if (summary && summary.keyComponents) {
        const keyComponents = summary.keyComponents;
        const frontend = keyComponents.filter(c => c.role.toLowerCase().includes("frontend") || c.role.toLowerCase().includes("ui") || c.role.toLowerCase().includes("client"));
        const api = keyComponents.filter(c => c.role.toLowerCase().includes("api") || c.role.toLowerCase().includes("gateway") || c.role.toLowerCase().includes("controller"));
        const worker = keyComponents.filter(c => c.role.toLowerCase().includes("worker") || c.role.toLowerCase().includes("queue") || c.role.toLowerCase().includes("job"));
        const storage = keyComponents.filter(c => c.role.toLowerCase().includes("database") || c.role.toLowerCase().includes("storage") || c.role.toLowerCase().includes("cache") || c.role.toLowerCase().includes("repository"));
        const classifiedIds = new Set([...frontend, ...api, ...worker, ...storage].map(c => c.name));
        const others = keyComponents.filter(c => !classifiedIds.has(c.name));

        tiers = [
            { name: "Presentation / UI", items: frontend, icon: <Layers size={16} /> },
            { name: "API / Gateway", items: api, icon: <Server size={16} /> },
            { name: "Workers / Queues", items: worker, icon: <Cpu size={16} /> },
            { name: "Data / Storage", items: storage, icon: <Database size={16} /> },
            { name: "Other Services", items: others, icon: <Boxes size={16} /> }
        ].filter(tier => tier.items.length > 0);
    }

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
                {((summary && summary.dataFlow && summary.dataFlow.length > 0) || (result.intelligence?.flow && result.intelligence.flow.length > 0)) && (
                    <div className="lg:w-80 shrink-0 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 flex flex-col h-full">
                        <h3 className="text-base font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-4 mb-4">
                            Data & Request Flow
                        </h3>
                        <div className="flex-1 overflow-y-auto space-y-4">
                            {summary?.dataFlow && summary.dataFlow.length > 0 ? (
                                summary.dataFlow.map((flow) => (
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
                                ))
                            ) : (
                                (result.intelligence?.flow || []).slice(0, 5).flatMap(f => f.steps).map((step, idx) => (
                                    <div key={idx} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[10px] font-bold text-[var(--primary)]">
                                                {idx + 1}
                                            </div>
                                            <div className="w-px h-full bg-[color:var(--border)] mt-2" />
                                        </div>
                                        <div className="pb-4 pt-0.5">
                                            <p className="text-xs font-semibold text-[color:var(--foreground)]">
                                                {step.action}: {step.targetId.replace(/^[^:]+:/, "")}
                                            </p>
                                            <p className="text-[10px] text-[color:var(--muted-foreground)]">
                                                From: {step.entityId.replace(/^[^:]+:/, "")} ({step.confidence})
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
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
