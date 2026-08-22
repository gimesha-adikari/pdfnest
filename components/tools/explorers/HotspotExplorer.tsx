import React from "react";
import { CanonicalAnalysisResult, RiskItem } from "../../../types/analyzer";
import { AlertTriangle, TrendingUp, CheckCircle, Flame, ShieldAlert, Award, ArrowUpRight } from "lucide-react";

interface HotspotExplorerProps {
    result: CanonicalAnalysisResult;
}

export default function HotspotExplorer({ result }: HotspotExplorerProps) {
    const scorecard = result.intelligence?.scorecard;
    const hotspots = result.intelligence?.hotspots || [];
    const security = result.intelligence?.security || [];
    const aiRisks = (result.ai || result.architectureSummary)?.risks || [];

    const hasData = scorecard || hotspots.length > 0 || security.length > 0 || aiRisks.length > 0;

    if (!hasData) {
        return (
            <div className="flex items-center justify-center p-8 border border-[color:var(--border)] rounded-2xl bg-[var(--background)]">
                <p className="text-sm text-[color:var(--muted-foreground)]">No architectural hotspots or security findings identified for this repository.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* 1. Scorecard Summary */}
            {scorecard && (
                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-4">
                        <div className="flex items-center gap-2">
                            <Award size={20} className="text-emerald-500" />
                            <h3 className="text-base font-bold text-[color:var(--foreground)]">Architecture Quality Scorecard</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-[color:var(--muted-foreground)]">Overall Score:</span>
                            <span className="text-xl font-black text-[var(--primary)]">{scorecard.overallScore.toFixed(0)}/100</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-black uppercase ${
                                scorecard.overallGrade === "A" ? "bg-emerald-500/10 text-emerald-600" :
                                scorecard.overallGrade === "B" ? "bg-blue-500/10 text-blue-600" :
                                scorecard.overallGrade === "C" ? "bg-amber-500/10 text-amber-600" :
                                "bg-rose-500/10 text-rose-600"
                            }`}>
                                Grade {scorecard.overallGrade}
                            </span>
                        </div>
                    </div>

                    {/* Component Scores */}
                    {scorecard.components && scorecard.components.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            {scorecard.components.map((comp, idx) => (
                                <div key={idx} className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-3 flex flex-col gap-1">
                                    <div className="flex items-center justify-between text-xs font-bold text-[color:var(--foreground)]">
                                        <span>{comp.component}</span>
                                        <span className="text-[10px] uppercase font-extrabold">{comp.grade}</span>
                                    </div>
                                    <div className="text-lg font-extrabold text-[var(--primary)]">{comp.score.toFixed(0)}%</div>
                                    <p className="text-[10px] text-[color:var(--muted-foreground)] line-clamp-2">{comp.rationale}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Actionable Recommendations */}
                    {scorecard.recommendations && scorecard.recommendations.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">Prioritized Recommendations</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {scorecard.recommendations.map((rec, idx) => (
                                    <div key={idx} className="p-3 rounded-xl border border-[color:var(--border)] bg-[var(--background)] flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-[color:var(--foreground)]">{rec.title}</span>
                                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                                                rec.priority === "high" ? "bg-rose-500/10 text-rose-600" :
                                                rec.priority === "medium" ? "bg-amber-500/10 text-amber-600" :
                                                "bg-blue-500/10 text-blue-600"
                                            }`}>{rec.priority}</span>
                                        </div>
                                        <p className="text-[11px] text-[color:var(--muted-foreground)]">{rec.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 2. Security Findings */}
            {security.length > 0 && (
                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[color:var(--border)] pb-4">
                        <ShieldAlert size={20} className="text-rose-500" />
                        <h3 className="text-base font-bold text-[color:var(--foreground)]">Security Intelligence Findings ({security.length})</h3>
                    </div>
                    <div className="space-y-3">
                        {security.map((sec, idx) => {
                            const title = sec.title || (sec as unknown as { Title?: string }).Title || "Security Finding";
                            const ruleId = sec.ruleId || (sec as unknown as { RuleID?: string }).RuleID || "SEC";
                            const severity = sec.severity || (sec as unknown as { Severity?: string }).Severity || "MEDIUM";
                            const description = sec.description || (sec as unknown as { Description?: string }).Description || "";
                            const remediation = sec.remediation || (sec as unknown as { Remediation?: string }).Remediation || "";

                            return (
                                <div key={idx} className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-[color:var(--foreground)]">{title}</span>
                                            <span className="text-[9px] font-mono text-[color:var(--muted-foreground)]">[{ruleId}]</span>
                                        </div>
                                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300">
                                            {severity}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[color:var(--muted-foreground)]">{description}</p>
                                    {remediation && (
                                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">💡 Remediation: {remediation}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 3. Ranked Engineering Hotspots */}
            {hotspots.length > 0 && (
                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[color:var(--border)] pb-4">
                        <Flame size={20} className="text-amber-500" />
                        <h3 className="text-base font-bold text-[color:var(--foreground)]">Ranked Engineering Hotspots ({hotspots.length})</h3>
                    </div>
                    <div className="space-y-3">
                        {hotspots.map((hs, idx) => {
                            const rawEntityId = hs.entityId || (hs as unknown as { EntityID?: string }).EntityID || "";
                            const entityDisplayName = rawEntityId ? rawEntityId.replace(/^[^:]+:/, "") : `Hotspot #${idx + 1}`;
                            const fanIn = hs.fanIn ?? (hs as unknown as { FanIn?: number }).FanIn ?? 0;
                            const fanOut = hs.fanOut ?? (hs as unknown as { FanOut?: number }).FanOut ?? 0;
                            const centrality = hs.centrality ?? (hs as unknown as { Centrality?: number }).Centrality ?? 0;
                            const isTested = hs.isTested ?? (hs as unknown as { IsTested?: boolean }).IsTested ?? false;
                            const hotspotMetric = hs.hotspotMetric ?? (hs as unknown as { HotspotMetric?: number }).HotspotMetric ?? 0;

                            return (
                                <div key={idx} className="p-4 rounded-xl border border-[color:var(--border)] bg-[var(--background)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-mono text-xs font-bold text-[color:var(--foreground)]">
                                            {entityDisplayName}
                                        </span>
                                        <div className="flex items-center gap-3 text-[10px] text-[color:var(--muted-foreground)]">
                                            <span>Fan-In: <strong>{fanIn}</strong></span>
                                            <span>Fan-Out: <strong>{fanOut}</strong></span>
                                            <span>Centrality: <strong>{typeof centrality === "number" ? centrality.toFixed(2) : centrality}</strong></span>
                                            <span>Tested: <strong className={isTested ? "text-emerald-500" : "text-rose-500"}>{isTested ? "YES" : "NO"}</strong></span>
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2">
                                        <span className="text-[10px] text-[color:var(--muted-foreground)]">Hotspot Metric</span>
                                        <span className="text-sm font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                                            {typeof hotspotMetric === "number" ? hotspotMetric.toFixed(1) : hotspotMetric}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 4. AI Identified Risks (if available) */}
            {aiRisks.length > 0 && hotspots.length === 0 && (
                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[color:var(--border)] pb-4">
                        <Flame size={20} className="text-rose-500" />
                        <h3 className="text-base font-bold text-[color:var(--foreground)]">Architectural Considerations & Risks</h3>
                    </div>
                    <div className="space-y-3">
                        {aiRisks.map((risk, index) => (
                            <div key={index} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-[color:var(--border)] bg-[var(--background)] shadow-sm">
                                <div className="flex items-start gap-3 flex-1">
                                    <div className="mt-0.5">
                                        <AlertTriangle size={18} className="text-amber-500" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-[color:var(--foreground)] capitalize">{risk.category}</h4>
                                        <p className="mt-1 text-xs text-[color:var(--muted-foreground)] leading-relaxed">{risk.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
