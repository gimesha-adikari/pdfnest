/**
 * Authoritative Canonical Data Models for PDFNest Repository Analyzer
 * Matching docs/schema/canonical-analysis-result.schema.json & Phase 2/5 Backend Contracts
 */

export type SourceType = "git" | "zip" | "local_folder";

export type ConfidenceLevel = "confirmed" | "probable" | "possible" | "not_detected";

export type TechnologyCategory =
    | "language"
    | "framework"
    | "database"
    | "cache"
    | "infrastructure"
    | "testing"
    | "build_tool";

export type RuleType =
    | "manifest_dep"
    | "config_file"
    | "source_import"
    | "docker_image"
    | "env_var"
    | "file_presence";

export interface EvidenceItem {
    filePath: string;
    ruleType: RuleType;
    detail: string;
    lineNumber?: number | null;
    snippet?: string | null;
}

export interface TechnologyItem {
    id: string;
    name: string;
    category: TechnologyCategory;
    version?: string | null;
    confidence: ConfidenceLevel;
    evidence: EvidenceItem[];
    negativeAssertionsPassed?: string[];
}

export interface DependencyItem {
    name: string;
    version: string;
    manager: string;
    license?: string | null;
    isDev: boolean;
}

export interface DependenciesBlock {
    runtime: DependencyItem[];
    development: DependencyItem[];
}

export interface ApiRouteItem {
    method: string;
    path: string;
    sourceFile: string;
    lineNumber?: number | null;
    inferredHandler?: string | null;
    authRequired: boolean;
}

export type EnvVarType = "string" | "number" | "boolean" | "url" | "secret";

export interface EnvironmentVariable {
    name: string;
    required: boolean;
    defaultValue?: string | null;
    inferredType: EnvVarType;
    source: string;
    references: string[];
}

export interface EnvironmentBlock {
    variables: EnvironmentVariable[];
}

export interface SetupCommand {
    label: string;
    cmd: string;
}

export interface SetupInfo {
    prerequisites: string[];
    installCommands: SetupCommand[];
    runCommands: SetupCommand[];
    buildCommands: SetupCommand[];
}

export interface TestingInfo {
    frameworks: string[];
    testCommands: string[];
    testDirectories: string[];
    testFileCount: number;
}

export interface DeploymentCIWorkflow {
    name: string;
    path: string;
    triggers: string[];
}

export interface DeploymentInfo {
    dockerAvailable: boolean;
    dockerfilePaths: string[];
    composePaths: string[];
    ciWorkflows: DeploymentCIWorkflow[];
    targetPlatforms: string[];
}

export interface LanguageMetric {
    name: string;
    percentage: number;
    fileCount: number;
    bytes: number;
}

export interface AnalysisMetrics {
    totalFiles: number;
    includedFiles: number;
    excludedFiles: number;
    totalBytes: number;
    linesOfCode: number;
    languages: LanguageMetric[];
}

export interface RepositoryInfo {
    name: string;
    sourceType: SourceType;
    url?: string | null;
    defaultBranch?: string | null;
    commitHash?: string | null;
}

export interface Provenance {
    engine: string;
    engineVersion: string;
    rulesVersion: string;
    schemaVersion: string;
    durationMs: number;
    rulesEvaluatedCount: number;
    complexityTier: string;
    complexityScore: number;
    sourceArtifactSha256: string;
    scopeHash: string;
}

export interface ComponentDescription {
    name: string;
    role: string;
    factIds?: string[];
}

export interface DataFlowStep {
    step: number;
    description: string;
    factIds?: string[];
}

export interface RiskItem {
    category: string;
    description: string;
    factIds?: string[];
}

export interface ArchitectureSummary {
    protocolVersion: string;
    taskId: string;
    summary: string;
    architecturePattern?: string;
    keyComponents?: ComponentDescription[];
    dataFlow?: DataFlowStep[];
    risks?: RiskItem[];
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
}

export type EpistemicConfidence = "CONFIRMED" | "STRONGLY_INFERRED" | "WEAKLY_INFERRED";

export interface Evidence {
    id: string;
    sourceType: string;
    filePath: string;
    lineStart?: number | null;
    lineEnd?: number | null;
    symbol?: string | null;
    detector: string;
    confidence: EpistemicConfidence;
    description: string;
}

export type StructureNodeType = "directory" | "file";

export interface StructureNode {
    path: string;
    name: string;
    type: StructureNodeType;
    size?: number | null;
    category?: string | null;
    language?: string | null;
    children?: StructureNode[] | null;
}

export interface ProjectStructure {
    rootName: string;
    root: StructureNode;
    totalFiles: number;
    totalDirs: number;
}

export interface CanonicalAnalysisResult {
    schemaVersion: string;
    analysisId: string;
    createdAt: string;
    repository: RepositoryInfo;
    metrics: AnalysisMetrics;
    technologies: TechnologyItem[];
    dependencies: DependenciesBlock;
    routes: ApiRouteItem[];
    environment: EnvironmentBlock;
    setup: SetupInfo;
    testing: TestingInfo;
    deployment: DeploymentInfo;
    structureTree: string;
    structure?: ProjectStructure | null;
    graph?: SerializedGraph | null;
    graphMetrics?: GraphMetrics | null;
    evidence?: Evidence[] | null;
    provenance: Provenance;
    intelligence?: IntelligenceAnalysis | null;
    ai?: ArchitectureSummary | null;
    architectureSummary?: ArchitectureSummary | null;
}

// API DTOs
export interface AnalyzeRequest {
    selectedDomains?: string[];
    deepAst?: boolean;
    enableAi?: boolean;
}

export interface CreateSessionRequest {
    sourceType: SourceType;
    gitUrl?: string;
    storageKey?: string;
    repositoryName?: string;
}

export interface SessionResponse {
    sessionId: string;
    sourceType: SourceType;
    gitUrl?: string;
    storageKey?: string;
    repositoryName: string;
    status: string;
    currentTaskId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface UpdateScopeRequest {
    customPatterns?: string[];
    enabledPresets?: string[];
    forceIncludes?: string[];
    gitignoreRules?: string[];
    selectedDomains?: string[];
}

export interface ScopeResponse {
    customPatterns: string[];
    enabledPresets: string[];
    forceIncludes: string[];
    gitignoreRules: string[];
    selectedDomains: string[];
    scopeHash: string;
}

export interface TreeNodeDTO {
    path: string;
    size: number;
    category: string;
    language?: string;
    isExcluded: boolean;
    reason?: string;
    isDirectory: boolean;
    isMandatory?: boolean;
    isForceIncluded?: boolean;
}

export interface TreeResponse {
    sessionId: string;
    totalFiles: number;
    includedFiles: number;
    excludedFiles: number;
    scopeHash: string;
    files: TreeNodeDTO[];
}

export type TaskStatus =
    | "QUEUED"
    | "ACQUIRING"
    | "INVENTORY"
    | "ANALYZING"
    | "FINALIZING"
    | "COMPLETED"
    | "FAILED";

export interface TaskStatusResponse {
    taskId: string;
    sessionId: string;
    status: TaskStatus;
    progressPercent: number;
    stageMessage: string;
    errorMessage?: string;
    updatedAt: string;
}

export interface AnalyzeResponse {
    taskId: string;
    sessionId: string;
    status: string;
    message: string;
}

export type EntityKind =
    | "file"
    | "directory"
    | "symbol"
    | "package"
    | "route"
    | "model"
    | "config"
    | "test"
    | "service"
    | "queue"
    | "storage"
    | "deployment";

export interface GraphEntity {
    id: string;
    kind: EntityKind;
    name: string;
    path: string;
    properties?: Record<string, any>;
    evidence?: Evidence[];
}

export type RelationType =
    | "defines"
    | "exports"
    | "imports"
    | "implements"
    | "exposes"
    | "calls"
    | "consumes"
    | "depends_on"
    | "configures"
    | "tests"
    | "persists_to"
    | "publishes_to"
    | "consumes_from"
    | "deploys";

export type RelationshipKind = "direct" | "inferred";

export interface RelationshipProvenance {
    kind: RelationshipKind;
    detector: string;
    evidenceIds?: string[];
    derivedFrom?: string[];
}

export interface GraphEdge {
    id: string;
    sourceId: string;
    targetId: string;
    type: RelationType;
    confidence: EpistemicConfidence;
    provenance: RelationshipProvenance;
    evidence?: Evidence[];
    properties?: Record<string, string>;
}

export interface SerializedGraph {
    entities: GraphEntity[];
    edges: GraphEdge[];
}

export interface GraphMetrics {
    entityCount: number;
    edgeCount: number;
    relationshipCounts: Record<string, number>;
    evidenceCoveragePct: number;
    confirmedEdgeCount: number;
    inferredEdgeCount: number;
    unresolvedReferences: number;
    cycleCount: number;
    orphanEntityCount: number;
    languageResolutionCoverage: Record<string, string>;

    // Backward compatibility aliases
    EntityCount?: number;
    EdgeCount?: number;
    RelationshipCounts?: Record<string, number>;
    EvidenceCoveragePct?: number;
    ConfirmedEdgeCount?: number;
    InferredEdgeCount?: number;
    UnresolvedReferences?: number;
    CycleCount?: number;
    OrphanEntityCount?: number;
    LanguageResolutionCoverage?: Record<string, string>;
}

// Deep Intelligence Engines Models
export type ComponentTier =
    | "Frontend"
    | "API"
    | "Queue"
    | "Worker"
    | "Storage"
    | "Database"
    | "Deployment";

export interface ArchitectureComponent {
    entityId: string;
    tier: ComponentTier;
    confidence: EpistemicConfidence;
    evidence?: Evidence[];
}

export interface FlowStep {
    entityId: string;
    action: string;
    targetId: string;
    confidence: EpistemicConfidence;
}

export interface ExecutionFlow {
    id: string;
    steps: FlowStep[];
}

export type RiskScore = "HIGH" | "MEDIUM" | "LOW";

export interface ImpactAnalysis {
    entityId: string;
    directDependents: number;
    indirectDependents: number;
    forwardDependencies: number;
    affectedRoutes: number;
    affectedServices: number;
    affectedTests: number;
    riskScore: RiskScore;
}

export interface HotspotScore {
    entityId: string;
    fanIn: number;
    fanOut: number;
    centrality: number;
    complexity: number;
    isTested: boolean;
    hotspotMetric: number;
}

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface SecurityFinding {
    ruleId: string;
    title: string;
    description: string;
    severity: Severity;
    confidence: EpistemicConfidence;
    entityId: string;
    evidence?: Evidence[];
    remediation: string;
}

export interface UntestedComponent {
    entityId: string;
    name: string;
    kind: EntityKind;
    fanIn: number;
}

export interface TestMapping {
    entityId: string;
    entityName: string;
    testFiles: string[];
}

export interface TestIntelligence {
    mappings: TestMapping[];
    untestedComponents: UntestedComponent[];
}

export interface ConfigUsage {
    configId: string;
    configName: string;
    isSecret: boolean;
    isOptional: boolean;
    inDocs: boolean;
    usedInCode: boolean;
    usageLocations: string[];
}

export interface RuntimeDeploymentInfo {
    dockerfiles: string[];
    dockerCompose: string[];
    ciWorkflows: string[];
    startupCmds: string[];
    portMappings: string[];
}

export interface ConfigRuntimeIntelligence {
    configUsages: Record<string, ConfigUsage>;
    runtime: RuntimeDeploymentInfo;
}

export interface ScorecardRecommendation {
    title: string;
    description: string;
    priority: string;
    targetNodeId?: string;
}

export interface ScorecardQualityScore {
    component: string;
    score: number;
    grade: string;
    rationale: string;
}

export interface Scorecard {
    overallScore: number;
    overallGrade: string;
    components: ScorecardQualityScore[];
    recommendations: ScorecardRecommendation[];
}

export interface IntelligenceAnalysis {
    architecture?: ArchitectureComponent[];
    flow?: ExecutionFlow[];
    impact?: Record<string, ImpactAnalysis>;
    hotspots?: HotspotScore[];
    security?: SecurityFinding[];
    test?: TestIntelligence;
    config?: ConfigRuntimeIntelligence;
    scorecard?: Scorecard;
}

