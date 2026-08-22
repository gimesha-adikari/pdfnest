import React from "react";
import { CanonicalAnalysisResult, RiskItem } from "../../../types/analyzer";
import { AlertTriangle, TrendingUp, CheckCircle, Flame } from "lucide-react";

interface HotspotExplorerProps {
    result: CanonicalAnalysisResult;
}

export default function HotspotExplorer({ result }: HotspotExplorerProps) {
    const risks = result.architectureSummary?.risks || [];

    if (risks.length === 0) {
        return (
            <div className="flex items-center justify-center p-8 border border-[color:var(--border)] rounded-2xl bg-[var(--background)]">
                <p className="text-sm text-[color:var(--muted-foreground)]">No architectural risks or hotspots identified.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-6">
                <div className="flex items-center gap-2 border-b border-[color:var(--border)] pb-4">
                    <Flame size={20} className="text-rose-500" />
                    <h3 className="text-base font-bold text-[color:var(--foreground)]">Engineering Hotspots & Scorecard</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Hotspots</span>
                        <span className="text-2xl font-extrabold text-rose-700 dark:text-rose-300">{risks.length}</span>
                    </div>
                </div>

                <div className="space-y-4">
                    {risks.map((risk, index) => (
                        <div key={index} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-[color:var(--border)] bg-[var(--background)] shadow-sm">
                            <div className="flex items-start gap-3 flex-1">
                                <div className="mt-0.5">
                                    {risk.category.toLowerCase().includes("security") ? (
                                        <AlertTriangle size={18} className="text-rose-500" />
                                    ) : risk.category.toLowerCase().includes("performance") ? (
                                        <TrendingUp size={18} className="text-amber-500" />
                                    ) : (
                                        <CheckCircle size={18} className="text-blue-500" />
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-[color:var(--foreground)] capitalize">{risk.category}</h4>
                                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)] leading-relaxed">{risk.description}</p>
                                </div>
                            </div>
                            {risk.factIds && risk.factIds.length > 0 && (
                                <div className="sm:self-center shrink-0">
                                    <span className="inline-flex items-center gap-1 rounded bg-[var(--primary)]/10 px-2 py-1 text-[10px] font-bold text-[var(--primary)]">
                                        {risk.factIds.length} Evidence Facts
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
