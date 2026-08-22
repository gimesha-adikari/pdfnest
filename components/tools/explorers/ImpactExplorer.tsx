import React, { useState, useMemo } from "react";
import { CanonicalAnalysisResult, GraphEntity, GraphEdge } from "../../../types/analyzer";
import { Target, Layers, ArrowRight, ShieldAlert, GitCommit, FileCode, CheckCircle2 } from "lucide-react";
import EvidenceExplorer from "./EvidenceExplorer";

interface ImpactExplorerProps {
    result: CanonicalAnalysisResult;
}

export default function ImpactExplorer({ result }: ImpactExplorerProps) {
    const [selectedId, setSelectedId] = useState<string>("");

    const graph = result.graph;
    const entities = graph?.entities || [];
    const edges = graph?.edges || [];

    // Filter to selectable entities
    const selectableEntities = useMemo(() => {
        return entities.filter(e => ["file", "symbol", "route", "service"].includes(e.kind)).sort((a, b) => a.name.localeCompare(b.name));
    }, [entities]);

    const impactData = useMemo(() => {
        if (!selectedId) return null;

        // Build adjacency list for "impacted by" (reversed dependencies)
        // If A imports B, A is impacted by B. So edge A -> B means B impacts A.
        // We want to find who is impacted by selectedId.
        const impacts = new Map<string, Set<string>>();
        const directDependencies = new Set([
            "imports", "calls", "consumes", "depends_on", "implements", "tests"
        ]);

        edges.forEach(edge => {
            if (directDependencies.has(edge.type)) {
                // edge.sourceId depends on edge.targetId
                // So edge.targetId impacts edge.sourceId
                if (!impacts.has(edge.targetId)) impacts.set(edge.targetId, new Set());
                impacts.get(edge.targetId)!.add(edge.sourceId);
            }
        });

        const direct = new Set<string>();
        const transitive = new Set<string>();
        
        // BFS to find all impacted
        const queue = [selectedId];
        const visited = new Set<string>([selectedId]);
        let depth = 0;

        while (queue.length > 0) {
            const size = queue.length;
            for (let i = 0; i < size; i++) {
                const current = queue.shift()!;
                const impacted = impacts.get(current) || new Set();
                
                impacted.forEach(imp => {
                    if (!visited.has(imp)) {
                        visited.add(imp);
                        queue.push(imp);
                        if (depth === 0) {
                            direct.add(imp);
                        } else {
                            transitive.add(imp);
                        }
                    }
                });
            }
            depth++;
        }

        const directEntities = Array.from(direct).map(id => entities.find(e => e.id === id)).filter(Boolean) as GraphEntity[];
        const transitiveEntities = Array.from(transitive).map(id => entities.find(e => e.id === id)).filter(Boolean) as GraphEntity[];
        
        const affectedRoutes = directEntities.concat(transitiveEntities).filter(e => e.kind === "route");
        const testCoverage = directEntities.concat(transitiveEntities).filter(e => e.kind === "test");

        return { direct: directEntities, transitive: transitiveEntities, affectedRoutes, testCoverage };
    }, [selectedId, edges, entities]);

    if (!graph) {
        return (
            <div className="flex items-center justify-center p-8 border border-[color:var(--border)] rounded-2xl bg-[var(--background)]">
                <p className="text-sm text-[color:var(--muted-foreground)]">No graph data available for impact analysis.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[color:var(--border)] pb-4">
                    <div className="flex items-center gap-2">
                        <Target size={20} className="text-[var(--primary)]" />
                        <h3 className="text-base font-bold text-[color:var(--foreground)]">Blast Radius Analysis</h3>
                    </div>
                    
                    <select
                        value={selectedId}
                        onChange={(e) => setSelectedId(e.target.value)}
                        className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)] focus:border-[var(--primary)] focus:outline-none min-w-[300px]"
                    >
                        <option value="">Select an entity to analyze...</option>
                        {selectableEntities.map(e => (
                            <option key={e.id} value={e.id}>
                                {e.kind.toUpperCase()}: {e.name}
                            </option>
                        ))}
                    </select>
                </div>

                {!selectedId ? (
                    <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">
                        Select a file, symbol, or route to compute its impact blast radius.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Direct Dependents</span>
                            <span className="text-2xl font-extrabold text-amber-700 dark:text-amber-300">{impactData?.direct.length || 0}</span>
                        </div>
                        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Transitive Impact</span>
                            <span className="text-2xl font-extrabold text-rose-700 dark:text-rose-300">{impactData?.transitive.length || 0}</span>
                        </div>
                        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Affected Routes</span>
                            <span className="text-2xl font-extrabold text-purple-700 dark:text-purple-300">{impactData?.affectedRoutes.length || 0}</span>
                        </div>
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Test Coverage</span>
                            <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">{impactData?.testCoverage.length || 0}</span>
                        </div>
                    </div>
                )}

                {selectedId && impactData && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-[color:var(--foreground)] flex items-center gap-2">
                                <Layers size={16} className="text-amber-500" />
                                Direct Impact
                            </h4>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {impactData.direct.length === 0 ? (
                                    <p className="text-xs text-[color:var(--muted-foreground)] italic">No direct dependents found.</p>
                                ) : (
                                    impactData.direct.map(e => (
                                        <div key={e.id} className="rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-3">
                                            <div className="text-xs font-bold text-[color:var(--foreground)] truncate">{e.name}</div>
                                            <div className="text-[10px] text-[color:var(--muted-foreground)] mt-0.5 capitalize">{e.kind} • {e.path}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-[color:var(--foreground)] flex items-center gap-2">
                                <ShieldAlert size={16} className="text-rose-500" />
                                Transitive Blast Radius
                            </h4>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {impactData.transitive.length === 0 ? (
                                    <p className="text-xs text-[color:var(--muted-foreground)] italic">No transitive dependents found.</p>
                                ) : (
                                    impactData.transitive.map(e => (
                                        <div key={e.id} className="rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-3 opacity-80">
                                            <div className="text-xs font-bold text-[color:var(--foreground)] truncate">{e.name}</div>
                                            <div className="text-[10px] text-[color:var(--muted-foreground)] mt-0.5 capitalize">{e.kind} • {e.path}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
