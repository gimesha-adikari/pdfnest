/**
 * Canonical Analysis Result Normalization Boundary
 * 
 * Normalizes raw API / worker / stored payloads into the strictly typed
 * CanonicalAnalysisResult shape required by all frontend components and report generators.
 */

import type {
    CanonicalAnalysisResult,
    RepositoryInfo,
    AnalysisMetrics,
    TechnologyItem,
    DependencyItem,
    ApiRouteItem,
    EnvironmentBlock,
    EnvironmentVariable,
    SetupCommand,
    Evidence,
    GraphMetrics,
    IntelligenceAnalysis,
    ArchitectureComponent,
    ExecutionFlow,
    ImpactAnalysis,
    HotspotScore,
    SecurityFinding,
    TestIntelligence,
    ConfigRuntimeIntelligence,
    ConfigUsage,
    RuntimeDeploymentInfo,
    Scorecard,
    ArchitectureSummary,
    EpistemicConfidence,
} from "../../types/analyzer";

function normalizeString(val: unknown, fallback: string = ""): string {
    if (typeof val === "string") return val;
    if (val != null) return String(val);
    return fallback;
}

function normalizeNumber(val: unknown, fallback: number = 0): number {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string") {
        const n = parseFloat(val);
        if (!isNaN(n)) return n;
    }
    return fallback;
}

function normalizeBoolean(val: unknown, fallback: boolean = false): boolean {
    if (typeof val === "boolean") return val;
    if (val === "true" || val === 1) return true;
    if (val === "false" || val === 0) return false;
    return fallback;
}

function normalizeArray<T>(val: unknown, itemNormalizer: (item: unknown, index: number) => T | null): T[] {
    if (!Array.isArray(val)) return [];
    const out: T[] = [];
    for (let i = 0; i < val.length; i++) {
        const item = itemNormalizer(val[i], i);
        if (item !== null) {
            out.push(item);
        }
    }
    return out;
}

function normalizeConfidence(val: unknown): EpistemicConfidence {
    const s = normalizeString(val, "CONFIRMED").toUpperCase();
    if (s === "STRONGLY_INFERRED" || s === "WEAKLY_INFERRED" || s === "CONFIRMED") {
        return s as EpistemicConfidence;
    }
    return "CONFIRMED";
}

export function normalizeEvidence(raw: unknown): Evidence | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const id = normalizeString(r.id || r.ID, "");
    if (!id) return null;

    return {
        id,
        sourceType: normalizeString(r.sourceType || r.SourceType, "source"),
        filePath: normalizeString(r.filePath || r.FilePath, ""),
        lineStart: r.lineStart != null ? normalizeNumber(r.lineStart, 0) : (r.LineStart != null ? normalizeNumber(r.LineStart, 0) : null),
        lineEnd: r.lineEnd != null ? normalizeNumber(r.lineEnd, 0) : (r.LineEnd != null ? normalizeNumber(r.LineEnd, 0) : null),
        symbol: r.symbol != null ? normalizeString(r.symbol) : (r.Symbol != null ? normalizeString(r.Symbol) : null),
        detector: normalizeString(r.detector || r.Detector, "detector"),
        confidence: normalizeConfidence(r.confidence || r.Confidence),
        description: normalizeString(r.description || r.Description, ""),
    };
}

export function normalizeHotspotScore(raw: unknown, idx: number): HotspotScore {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const entityId = normalizeString(r.entityId || r.EntityID, `hotspot:${idx + 1}`);

    return {
        entityId,
        fanIn: normalizeNumber(r.fanIn ?? r.FanIn, 0),
        fanOut: normalizeNumber(r.fanOut ?? r.FanOut, 0),
        centrality: normalizeNumber(r.centrality ?? r.Centrality, 0),
        complexity: normalizeNumber(r.complexity ?? r.Complexity, 0),
        isTested: normalizeBoolean(r.isTested ?? r.IsTested, false),
        hotspotMetric: normalizeNumber(r.hotspotMetric ?? r.HotspotMetric, 0),
    };
}

export function normalizeSecurityFinding(raw: unknown): SecurityFinding | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    return {
        ruleId: normalizeString(r.ruleId || r.RuleID, "SEC"),
        title: normalizeString(r.title || r.Title, "Security Finding"),
        description: normalizeString(r.description || r.Description, ""),
        severity: (normalizeString(r.severity || r.Severity, "MEDIUM").toUpperCase() as "HIGH" | "MEDIUM" | "LOW"),
        confidence: normalizeConfidence(r.confidence || r.Confidence),
        entityId: normalizeString(r.entityId || r.EntityID, ""),
        evidence: normalizeArray(r.evidence || r.Evidence, (ev) => normalizeEvidence(ev)),
        remediation: normalizeString(r.remediation || r.Remediation, ""),
    };
}

export function normalizeArchitectureComponent(raw: unknown): ArchitectureComponent | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const entityId = normalizeString(r.entityId || r.EntityID, "");
    if (!entityId) return null;

    return {
        entityId,
        tier: normalizeString(r.tier || r.Tier, "API") as any,
        confidence: normalizeConfidence(r.confidence || r.Confidence),
        evidence: normalizeArray(r.evidence || r.Evidence, (ev) => normalizeEvidence(ev)),
    };
}

export function normalizeExecutionFlow(raw: unknown): ExecutionFlow | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const id = normalizeString(r.id || r.ID, "");

    const steps = normalizeArray(r.steps || r.Steps, (stepRaw) => {
        if (!stepRaw || typeof stepRaw !== "object") return null;
        const s = stepRaw as Record<string, unknown>;
        return {
            entityId: normalizeString(s.entityId || s.EntityID, ""),
            action: normalizeString(s.action || s.Action, "Executes"),
            targetId: normalizeString(s.targetId || s.TargetID, ""),
            confidence: normalizeConfidence(s.confidence || s.Confidence),
        };
    });

    return { id, steps };
}

export function normalizeTestIntelligence(raw: unknown): TestIntelligence {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

    const mappings = normalizeArray(r.mappings || r.Mappings, (mRaw) => {
        if (!mRaw || typeof mRaw !== "object") return null;
        const m = mRaw as Record<string, unknown>;
        return {
            entityId: normalizeString(m.entityId || m.EntityID, ""),
            entityName: normalizeString(m.entityName || m.EntityName, ""),
            testFiles: normalizeArray(m.testFiles || m.TestFiles, (tf) => normalizeString(tf)),
        };
    });

    const untestedComponents = normalizeArray(r.untestedComponents || r.UntestedComponents, (ucRaw) => {
        if (!ucRaw || typeof ucRaw !== "object") return null;
        const uc = ucRaw as Record<string, unknown>;
        return {
            entityId: normalizeString(uc.entityId || uc.EntityID, ""),
            name: normalizeString(uc.name || uc.Name, ""),
            kind: normalizeString(uc.kind || uc.Kind, "file") as any,
            fanIn: normalizeNumber(uc.fanIn ?? uc.FanIn, 0),
        };
    });

    return { mappings, untestedComponents };
}

export function normalizeScorecard(raw: unknown): Scorecard | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    const components = normalizeArray(r.components || r.Components, (compRaw) => {
        if (!compRaw || typeof compRaw !== "object") return null;
        const c = compRaw as Record<string, unknown>;
        return {
            component: normalizeString(c.component || c.Component, ""),
            score: normalizeNumber(c.score ?? c.Score, 0),
            grade: normalizeString(c.grade || c.Grade, "B"),
            rationale: normalizeString(c.rationale || c.Rationale, ""),
        };
    });

    const recommendations = normalizeArray(r.recommendations || r.Recommendations, (recRaw) => {
        if (!recRaw || typeof recRaw !== "object") return null;
        const rec = recRaw as Record<string, unknown>;
        return {
            title: normalizeString(rec.title || rec.Title, ""),
            description: normalizeString(rec.description || rec.Description, ""),
            priority: normalizeString(rec.priority || rec.Priority, "medium").toLowerCase(),
            targetNodeId: rec.targetNodeId != null ? normalizeString(rec.targetNodeId) : (rec.TargetNodeID != null ? normalizeString(rec.TargetNodeID) : undefined),
        };
    });

    return {
        overallScore: normalizeNumber(r.overallScore ?? r.OverallScore, 0),
        overallGrade: normalizeString(r.overallGrade || r.OverallGrade, "B"),
        components,
        recommendations,
    };
}

export function normalizeConfigRuntimeIntelligence(raw: unknown): ConfigRuntimeIntelligence {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const rawUsages = (r.configUsages || r.ConfigUsages || {}) as Record<string, unknown>;
    const configUsages: Record<string, ConfigUsage> = {};

    Object.entries(rawUsages).forEach(([k, v]) => {
        if (v && typeof v === "object") {
            const u = v as Record<string, unknown>;
            configUsages[k] = {
                configId: normalizeString(u.configId || u.ConfigID, k),
                configName: normalizeString(u.configName || u.ConfigName, k),
                isSecret: normalizeBoolean(u.isSecret ?? u.IsSecret, false),
                isOptional: normalizeBoolean(u.isOptional ?? u.IsOptional, false),
                inDocs: normalizeBoolean(u.inDocs ?? u.InDocs, false),
                usedInCode: normalizeBoolean(u.usedInCode ?? u.UsedInCode, false),
                usageLocations: normalizeArray(u.usageLocations || u.UsageLocations, (loc) => normalizeString(loc)),
            };
        }
    });

    const rawRt = (r.runtime || r.Runtime || {}) as Record<string, unknown>;
    const runtime: RuntimeDeploymentInfo = {
        dockerfiles: normalizeArray(rawRt.dockerfiles || rawRt.Dockerfiles, (d) => normalizeString(d)),
        dockerCompose: normalizeArray(rawRt.dockerCompose || rawRt.DockerCompose, (dc) => normalizeString(dc)),
        ciWorkflows: normalizeArray(rawRt.ciWorkflows || rawRt.CIWorkflows, (ci) => normalizeString(ci)),
        startupCmds: normalizeArray(rawRt.startupCmds || rawRt.StartupCmds, (sc) => normalizeString(sc)),
        portMappings: normalizeArray(rawRt.portMappings || rawRt.PortMappings, (pm) => normalizeString(pm)),
    };

    return { configUsages, runtime };
}

export function normalizeGraphMetrics(raw: unknown): GraphMetrics | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    const entityCount = normalizeNumber(r.entityCount ?? r.EntityCount, 0);
    const edgeCount = normalizeNumber(r.edgeCount ?? r.EdgeCount, 0);
    const relationshipCounts = (r.relationshipCounts || r.RelationshipCounts || {}) as Record<string, number>;
    const evidenceCoveragePct = normalizeNumber(r.evidenceCoveragePct ?? r.EvidenceCoveragePct, 0);
    const confirmedEdgeCount = normalizeNumber(r.confirmedEdgeCount ?? r.ConfirmedEdgeCount, 0);
    const inferredEdgeCount = normalizeNumber(r.inferredEdgeCount ?? r.InferredEdgeCount, 0);
    const unresolvedReferences = normalizeNumber(r.unresolvedReferences ?? r.UnresolvedReferences, 0);
    const cycleCount = normalizeNumber(r.cycleCount ?? r.CycleCount, 0);
    const orphanEntityCount = normalizeNumber(r.orphanEntityCount ?? r.OrphanEntityCount, 0);
    const languageResolutionCoverage = (r.languageResolutionCoverage || r.LanguageResolutionCoverage || {}) as Record<string, string>;

    return {
        entityCount,
        edgeCount,
        relationshipCounts,
        evidenceCoveragePct,
        confirmedEdgeCount,
        inferredEdgeCount,
        unresolvedReferences,
        cycleCount,
        orphanEntityCount,
        languageResolutionCoverage,
        // Also provide PascalCase aliases for backward compatibility
        EntityCount: entityCount,
        EdgeCount: edgeCount,
        RelationshipCounts: relationshipCounts,
        EvidenceCoveragePct: evidenceCoveragePct,
        ConfirmedEdgeCount: confirmedEdgeCount,
        InferredEdgeCount: inferredEdgeCount,
        UnresolvedReferences: unresolvedReferences,
        CycleCount: cycleCount,
        OrphanEntityCount: orphanEntityCount,
        LanguageResolutionCoverage: languageResolutionCoverage,
    };
}

export function normalizeIntelligenceAnalysis(raw: unknown): IntelligenceAnalysis | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    const architecture = r.architecture || r.Architecture ? normalizeArray(r.architecture || r.Architecture, (comp) => normalizeArchitectureComponent(comp)) : [];
    const flow = r.flow || r.Flow ? normalizeArray(r.flow || r.Flow, (fl) => normalizeExecutionFlow(fl)) : [];
    const hotspots = r.hotspots || r.Hotspots ? normalizeArray(r.hotspots || r.Hotspots, (hs, i) => normalizeHotspotScore(hs, i)) : [];
    const security = r.security || r.Security ? normalizeArray(r.security || r.Security, (sec) => normalizeSecurityFinding(sec)) : [];

    const rawImpact = (r.impact || r.Impact || {}) as Record<string, unknown>;
    const impact: Record<string, ImpactAnalysis> = {};
    Object.entries(rawImpact).forEach(([k, v]) => {
        if (v && typeof v === "object") {
            const imp = v as Record<string, unknown>;
            impact[k] = {
                entityId: normalizeString(imp.entityId || imp.EntityID, k),
                directDependents: normalizeNumber(imp.directDependents ?? imp.DirectDependents, 0),
                indirectDependents: normalizeNumber(imp.indirectDependents ?? imp.IndirectDependents, 0),
                forwardDependencies: normalizeNumber(imp.forwardDependencies ?? imp.ForwardDependencies, 0),
                affectedRoutes: normalizeNumber(imp.affectedRoutes ?? imp.AffectedRoutes, 0),
                affectedServices: normalizeNumber(imp.affectedServices ?? imp.AffectedServices, 0),
                affectedTests: normalizeNumber(imp.affectedTests ?? imp.AffectedTests, 0),
                riskScore: (normalizeString(imp.riskScore || imp.RiskScore, "LOW").toUpperCase() as any),
            };
        }
    });

    const test = r.test || r.Test ? normalizeTestIntelligence(r.test || r.Test) : { mappings: [], untestedComponents: [] };
    const config = r.config || r.Config ? normalizeConfigRuntimeIntelligence(r.config || r.Config) : null;
    const scorecard = r.scorecard || r.Scorecard ? normalizeScorecard(r.scorecard || r.Scorecard) : null;

    return {
        architecture,
        flow,
        impact,
        hotspots,
        security,
        test,
        config: config || undefined,
        scorecard: scorecard || undefined,
    };
}

/**
 * Authoritative CanonicalAnalysisResult normalizer.
 */
export function normalizeCanonicalAnalysisResult(raw: unknown): CanonicalAnalysisResult {
    if (!raw || typeof raw !== "object") {
        throw new Error("Invalid CanonicalAnalysisResult: payload must be a non-null object");
    }

    const r = raw as Record<string, unknown>;

    const schemaVersion = normalizeString(r.schemaVersion || r.SchemaVersion, "1.0.0");
    const analysisId = normalizeString(r.analysisId || r.AnalysisID, "unknown-analysis");
    const createdAt = normalizeString(r.createdAt || r.CreatedAt, new Date().toISOString());

    const repoRaw = (r.repository || r.Repository || {}) as Record<string, unknown>;
    const repository: RepositoryInfo = {
        name: normalizeString(repoRaw.name || repoRaw.Name, "unnamed-repository"),
        sourceType: (normalizeString(repoRaw.sourceType || repoRaw.SourceType, "local_folder") as any),
        url: repoRaw.url ? normalizeString(repoRaw.url) : null,
        defaultBranch: repoRaw.defaultBranch ? normalizeString(repoRaw.defaultBranch) : null,
        commitHash: repoRaw.commitHash ? normalizeString(repoRaw.commitHash) : null,
    };

    const metricsRaw = (r.metrics || r.Metrics || {}) as Record<string, unknown>;
    const metrics: AnalysisMetrics = {
        totalFiles: normalizeNumber(metricsRaw.totalFiles ?? metricsRaw.TotalFiles, 0),
        includedFiles: normalizeNumber(metricsRaw.includedFiles ?? metricsRaw.IncludedFiles, 0),
        excludedFiles: normalizeNumber(metricsRaw.excludedFiles ?? metricsRaw.ExcludedFiles, 0),
        totalBytes: normalizeNumber(metricsRaw.totalBytes ?? metricsRaw.TotalBytes, 0),
        linesOfCode: normalizeNumber(metricsRaw.linesOfCode ?? metricsRaw.LinesOfCode, 0),
        languages: normalizeArray(metricsRaw.languages || metricsRaw.Languages, (lRaw) => {
            if (!lRaw || typeof lRaw !== "object") return null;
            const l = lRaw as Record<string, unknown>;
            return {
                name: normalizeString(l.name || l.Name, ""),
                percentage: normalizeNumber(l.percentage ?? l.Percentage, 0),
                fileCount: normalizeNumber(l.fileCount ?? l.FileCount, 0),
                bytes: normalizeNumber(l.bytes ?? l.Bytes, 0),
            };
        }),
    };

    const technologies: TechnologyItem[] = normalizeArray(r.technologies || r.Technologies, (tRaw) => {
        if (!tRaw || typeof tRaw !== "object") return null;
        const t = tRaw as Record<string, unknown>;
        return {
            id: normalizeString(t.id || t.ID, ""),
            name: normalizeString(t.name || t.Name, ""),
            category: normalizeString(t.category || t.Category, "framework") as any,
            version: t.version ? normalizeString(t.version) : undefined,
            confidence: normalizeConfidence(t.confidence || t.Confidence).toLowerCase() as any,
            evidence: normalizeArray(t.evidence || t.Evidence, (ev) => {
                if (!ev || typeof ev !== "object") return null;
                const e = ev as Record<string, unknown>;
                return {
                    filePath: normalizeString(e.filePath || e.FilePath, ""),
                    ruleType: normalizeString(e.ruleType || e.RuleType, "manifest_dep") as any,
                    detail: normalizeString(e.detail || e.Detail, ""),
                    lineNumber: e.lineNumber != null ? normalizeNumber(e.lineNumber) : null,
                    snippet: e.snippet != null ? normalizeString(e.snippet) : null,
                };
            }),
            negativeAssertionsPassed: normalizeArray(t.negativeAssertionsPassed || t.NegativeAssertionsPassed, (neg) => normalizeString(neg)),
        };
    });

    const depsRaw = (r.dependencies || r.Dependencies || {}) as Record<string, unknown>;
    const normalizeDep = (dRaw: unknown): DependencyItem | null => {
        if (!dRaw || typeof dRaw !== "object") return null;
        const d = dRaw as Record<string, unknown>;
        return {
            name: normalizeString(d.name || d.Name, ""),
            version: normalizeString(d.version || d.Version, ""),
            manager: normalizeString(d.manager || d.Manager, "npm"),
            isDev: normalizeBoolean(d.isDev ?? d.IsDev, false),
        };
    };

    const dependencies = {
        runtime: normalizeArray(depsRaw.runtime || depsRaw.Runtime, normalizeDep),
        development: normalizeArray(depsRaw.development || depsRaw.Development, normalizeDep),
    };

    const routes: ApiRouteItem[] = normalizeArray(r.routes || r.Routes, (rRaw) => {
        if (!rRaw || typeof rRaw !== "object") return null;
        const rt = rRaw as Record<string, unknown>;
        return {
            method: normalizeString(rt.method || rt.Method, "GET"),
            path: normalizeString(rt.path || rt.Path, "/"),
            sourceFile: normalizeString(rt.sourceFile || rt.SourceFile, ""),
            lineNumber: rt.lineNumber != null ? normalizeNumber(rt.lineNumber) : (rt.LineNumber != null ? normalizeNumber(rt.LineNumber) : undefined),
            inferredHandler: rt.inferredHandler ? normalizeString(rt.inferredHandler) : (rt.InferredHandler ? normalizeString(rt.InferredHandler) : undefined),
            authRequired: normalizeBoolean(rt.authRequired ?? rt.AuthRequired, false),
        };
    });

    const envRaw = (r.environment || r.Environment || {}) as Record<string, unknown>;
    const environment: EnvironmentBlock = {
        variables: normalizeArray(envRaw.variables || envRaw.Variables, (vRaw) => {
            if (!vRaw || typeof vRaw !== "object") return null;
            const v = vRaw as Record<string, unknown>;
            return {
                name: normalizeString(v.name || v.Name, ""),
                required: normalizeBoolean(v.required ?? v.Required, false),
                inferredType: normalizeString(v.inferredType || v.InferredType, "string") as any,
                source: normalizeString(v.source || v.Source, ""),
                references: normalizeArray(v.references || v.References, (ref) => normalizeString(ref)),
            };
        }),
    };

    const setupRaw = (r.setup || r.Setup || {}) as Record<string, unknown>;
    const normalizeCmd = (cRaw: unknown): SetupCommand | null => {
        if (!cRaw || typeof cRaw !== "object") return null;
        const c = cRaw as Record<string, unknown>;
        return {
            label: normalizeString(c.label || c.Label, ""),
            cmd: normalizeString(c.cmd || c.Cmd, ""),
        };
    };

    const setup = {
        prerequisites: normalizeArray(setupRaw.prerequisites || setupRaw.Prerequisites, (p) => normalizeString(p)),
        installCommands: normalizeArray(setupRaw.installCommands || setupRaw.InstallCommands, normalizeCmd),
        runCommands: normalizeArray(setupRaw.runCommands || setupRaw.RunCommands, normalizeCmd),
        buildCommands: normalizeArray(setupRaw.buildCommands || setupRaw.BuildCommands, normalizeCmd),
    };

    const testRaw = (r.testing || r.Testing || {}) as Record<string, unknown>;
    const testing = {
        frameworks: normalizeArray(testRaw.frameworks || testRaw.Frameworks, (f) => normalizeString(f)),
        testCommands: normalizeArray(testRaw.testCommands || testRaw.TestCommands, (tc) => normalizeString(tc)),
        testDirectories: normalizeArray(testRaw.testDirectories || testRaw.TestDirectories, (td) => normalizeString(td)),
        testFileCount: normalizeNumber(testRaw.testFileCount ?? testRaw.TestFileCount, 0),
    };

    const deployRaw = (r.deployment || r.Deployment || {}) as Record<string, unknown>;
    const deployment = {
        dockerAvailable: normalizeBoolean(deployRaw.dockerAvailable ?? deployRaw.DockerAvailable, false),
        dockerfilePaths: normalizeArray(deployRaw.dockerfilePaths || deployRaw.DockerfilePaths, (df) => normalizeString(df)),
        composePaths: normalizeArray(deployRaw.composePaths || deployRaw.ComposePaths, (cp) => normalizeString(cp)),
        ciWorkflows: normalizeArray(deployRaw.ciWorkflows || deployRaw.CIWorkflows, (wRaw) => {
            if (!wRaw || typeof wRaw !== "object") return null;
            const w = wRaw as Record<string, unknown>;
            return {
                name: normalizeString(w.name || w.Name, ""),
                path: normalizeString(w.path || w.Path, ""),
                triggers: normalizeArray(w.triggers || w.Triggers, (tr) => normalizeString(tr)),
            };
        }),
        targetPlatforms: normalizeArray(deployRaw.targetPlatforms || deployRaw.TargetPlatforms, (tp) => normalizeString(tp)),
    };

    const provRaw = (r.provenance || r.Provenance || {}) as Record<string, unknown>;
    const provenance = {
        engine: normalizeString(provRaw.engine || provRaw.Engine, "platen_analyzer_engine"),
        engineVersion: normalizeString(provRaw.engineVersion || provRaw.EngineVersion, "2.0.0"),
        rulesVersion: normalizeString(provRaw.rulesVersion || provRaw.RulesVersion, "1.0.0"),
        schemaVersion: normalizeString(provRaw.schemaVersion || provRaw.SchemaVersion, "1.0.0"),
        durationMs: normalizeNumber(provRaw.durationMs ?? provRaw.DurationMs, 0),
        rulesEvaluatedCount: normalizeNumber(provRaw.rulesEvaluatedCount ?? provRaw.RulesEvaluatedCount, 0),
        complexityTier: normalizeString(provRaw.complexityTier || provRaw.ComplexityTier, "Tier1Instant"),
        complexityScore: normalizeNumber(provRaw.complexityScore ?? provRaw.ComplexityScore, 0),
        sourceArtifactSha256: normalizeString(provRaw.sourceArtifactSha256 || provRaw.SourceArtifactSha256, ""),
        scopeHash: normalizeString(provRaw.scopeHash || provRaw.ScopeHash, ""),
    };

    const evidence = normalizeArray(r.evidence || r.Evidence, (ev) => normalizeEvidence(ev));

    const graphRaw = (r.graph || r.Graph || null) as Record<string, unknown> | null;
    let graph = null;
    if (graphRaw && typeof graphRaw === "object") {
        graph = {
            entities: normalizeArray(graphRaw.entities || graphRaw.Entities, (eRaw) => {
                if (!eRaw || typeof eRaw !== "object") return null;
                const e = eRaw as Record<string, unknown>;
                return {
                    id: normalizeString(e.id || e.ID, ""),
                    kind: normalizeString(e.kind || e.Kind, "file") as any,
                    name: normalizeString(e.name || e.Name, ""),
                    path: normalizeString(e.path || e.Path, ""),
                    properties: (e.properties || e.Properties || {}) as Record<string, any>,
                    evidence: normalizeArray(e.evidence || e.Evidence, (ev) => normalizeEvidence(ev)),
                };
            }),
            edges: normalizeArray(graphRaw.edges || graphRaw.Edges, (edRaw) => {
                if (!edRaw || typeof edRaw !== "object") return null;
                const ed = edRaw as Record<string, unknown>;
                const prov = (ed.provenance || ed.Provenance || {}) as Record<string, unknown>;
                return {
                    id: normalizeString(ed.id || ed.ID, ""),
                    sourceId: normalizeString(ed.sourceId || ed.SourceID, ""),
                    targetId: normalizeString(ed.targetId || ed.TargetID, ""),
                    type: normalizeString(ed.type || ed.Type, "depends_on") as any,
                    confidence: normalizeConfidence(ed.confidence || ed.Confidence),
                    provenance: {
                        kind: normalizeString(prov.kind || prov.Kind, "direct") as any,
                        detector: normalizeString(prov.detector || prov.Detector, "graph_builder"),
                        evidenceIds: normalizeArray(prov.evidenceIds || prov.EvidenceIDs, (eid) => normalizeString(eid)),
                        derivedFrom: normalizeArray(prov.derivedFrom || prov.DerivedFrom, (df) => normalizeString(df)),
                    },
                    evidence: normalizeArray(ed.evidence || ed.Evidence, (ev) => normalizeEvidence(ev)),
                    properties: (ed.properties || ed.Properties || {}) as Record<string, string>,
                };
            }),
        };
    }

    const graphMetrics = normalizeGraphMetrics(r.graphMetrics || r.GraphMetrics);
    const intelligence = normalizeIntelligenceAnalysis(r.intelligence || r.Intelligence);

    const ai = (r.ai || r.AI || r.architectureSummary || r.ArchitectureSummary || null) as ArchitectureSummary | null;

    return {
        schemaVersion,
        analysisId,
        createdAt,
        repository,
        metrics,
        technologies,
        dependencies,
        routes,
        environment,
        setup,
        testing,
        deployment,
        structureTree: normalizeString(r.structureTree || r.StructureTree, ""),
        structure: (r.structure || r.Structure || null) as any,
        graph,
        graphMetrics,
        evidence,
        provenance,
        intelligence,
        ai,
        architectureSummary: ai,
    };
}
