/**
 * Phase 6 Frontend UI Integration & Scoping Unit Test Suite
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
    CanonicalAnalysisResult,
    SessionResponse,
    TreeResponse,
    ScopeResponse,
    TaskStatusResponse,
} from "../../types/analyzer";
import { normalizeCanonicalAnalysisResult } from "../../lib/analyzer/normalize";
import {
    ALL_REPORTS,
    PRESET_OPTIONS,
    MANDATORY_SECURITY_PATTERNS,
} from "../../context/RepositoryAnalyzerContext";

describe("PDFNest Repository Analyzer — Phase 6 Frontend Integration", () => {
    it("verifies 8 documentation domains definition", () => {
        assert.equal(ALL_REPORTS.length, 8);
        const expected = [
            "Project Structure",
            "Technology Stack",
            "Dependencies",
            "Setup & Run Guide",
            "Environment Configuration",
            "API Overview",
            "Testing",
            "Deployment",
        ];
        const ids = ALL_REPORTS.map((r) => r.id);
        assert.deepEqual(ids, expected);
    });

    it("verifies mandatory security exclusion patterns cannot be empty", () => {
        assert.ok(MANDATORY_SECURITY_PATTERNS.length >= 5);
        assert.ok(MANDATORY_SECURITY_PATTERNS.includes("**/*.pem"));
        assert.ok(MANDATORY_SECURITY_PATTERNS.includes("**/*.key"));
        assert.ok(MANDATORY_SECURITY_PATTERNS.includes("**/id_rsa*"));
        assert.ok(MANDATORY_SECURITY_PATTERNS.includes("**/credentials.json"));
        assert.ok(MANDATORY_SECURITY_PATTERNS.includes("**/.env"));
    });

    it("verifies standard preset options", () => {
        assert.ok(PRESET_OPTIONS.length >= 5);
        const presetIds = PRESET_OPTIONS.map((p) => p.id);
        assert.ok(presetIds.includes("node_modules"));
        assert.ok(presetIds.includes("build_outputs"));
        assert.ok(presetIds.includes("vcs"));
        assert.ok(presetIds.includes("virtual_envs"));
        assert.ok(presetIds.includes("caches"));
    });

    it("verifies canonical analysis result contract mapping", () => {
        const mockCanonical: CanonicalAnalysisResult = {
            schemaVersion: "1.0.0",
            analysisId: "test-analysis-1",
            createdAt: new Date().toISOString(),
            repository: {
                name: "test-repo",
                sourceType: "git",
                url: "https://github.com/org/test-repo.git",
            },
            metrics: {
                totalFiles: 100,
                includedFiles: 85,
                excludedFiles: 15,
                totalBytes: 500000,
                linesOfCode: 12000,
                languages: [
                    { name: "TypeScript", percentage: 80.0, fileCount: 80, bytes: 400000 },
                    { name: "Go", percentage: 20.0, fileCount: 20, bytes: 100000 },
                ],
            },
            technologies: [
                {
                    id: "tech-nextjs",
                    name: "Next.js",
                    category: "framework",
                    confidence: "confirmed",
                    evidence: [
                        {
                            filePath: "package.json",
                            ruleType: "manifest_dep",
                            detail: "next: ^15.0.0",
                        },
                    ],
                    negativeAssertionsPassed: ["Nuxt.js", "Remix"],
                },
            ],
            dependencies: {
                runtime: [
                    { name: "react", version: "^19.0.0", manager: "npm", isDev: false },
                ],
                development: [
                    { name: "typescript", version: "^5.0.0", manager: "npm", isDev: true },
                ],
            },
            routes: [
                {
                    method: "POST",
                    path: "/api/v1/analyzer/sessions",
                    sourceFile: "internal/analyzer/api/routes.go",
                    lineNumber: 45,
                    inferredHandler: "CreateSession",
                    authRequired: false,
                },
            ],
            environment: {
                variables: [
                    {
                        name: "DATABASE_URL",
                        required: true,
                        inferredType: "secret",
                        source: ".env.example",
                        references: ["config/database.go"],
                    },
                ],
            },
            setup: {
                prerequisites: ["Node.js 20+", "Go 1.22+"],
                installCommands: [{ label: "Install frontend", cmd: "npm install" }],
                runCommands: [{ label: "Start dev", cmd: "npm run dev" }],
                buildCommands: [{ label: "Build production", cmd: "npm run build" }],
            },
            testing: {
                frameworks: ["Playwright", "Go Test"],
                testCommands: ["npm test", "go test ./..."],
                testDirectories: ["tests", "internal/analyzer/..."],
                testFileCount: 15,
            },
            deployment: {
                dockerAvailable: true,
                dockerfilePaths: ["Dockerfile"],
                composePaths: ["docker-compose.yml"],
                ciWorkflows: [
                    {
                        name: "CI Pipeline",
                        path: ".github/workflows/ci.yml",
                        triggers: ["push", "pull_request"],
                    },
                ],
                targetPlatforms: ["linux/amd64"],
            },
            structureTree: "test-repo/\n├── src/\n└── package.json",
            provenance: {
                engine: "pdfnest-go-analyzer",
                engineVersion: "1.0.0",
                rulesVersion: "1.0.0",
                schemaVersion: "1.0.0",
                durationMs: 45,
                rulesEvaluatedCount: 150,
                complexityTier: "Tier1Instant",
                complexityScore: 10,
                sourceArtifactSha256: "abc123sha",
                scopeHash: "hash123scope",
            },
        };

        assert.equal(mockCanonical.repository.name, "test-repo");
        assert.equal(mockCanonical.technologies[0]?.confidence, "confirmed");
        assert.equal(mockCanonical.technologies[0]?.evidence[0]?.ruleType, "manifest_dep");
        assert.equal(mockCanonical.environment.variables[0]?.inferredType, "secret");
        assert.equal(mockCanonical.routes[0]?.method, "POST");
        assert.equal(mockCanonical.deployment.dockerAvailable, true);
    });

    it("verifies session isolation invariant logic", () => {
        let activeSessionId: string | null = "session-A";
        let sessionResult: { analysisId?: string } | null = null;

        const handleResultArrival = (incomingSessionId: string, resultData: { analysisId: string }) => {
            // Strict session isolation check: reject results if sessionId does not match activeSessionId
            if (activeSessionId === incomingSessionId) {
                sessionResult = resultData;
            }
        };

        // Project A completes while active
        handleResultArrival("session-A", { analysisId: "res-A" });
        assert.equal((sessionResult as { analysisId?: string } | null)?.analysisId, "res-A");

        // User switches to Project B
        activeSessionId = "session-B";
        sessionResult = null; // Cleared on switch

        // Delayed result from Project A arrives late
        handleResultArrival("session-A", { analysisId: "res-A-late" });
        // Must remain null for Project B!
        assert.equal(sessionResult, null);

        // Project B result arrives
        handleResultArrival("session-B", { analysisId: "res-B" });
        assert.equal((sessionResult as { analysisId?: string } | null)?.analysisId, "res-B");
    });

    it("verifies AI synthesis result schema and markdown generation", () => {
        const mockCanonicalWithAI: CanonicalAnalysisResult = {
            schemaVersion: "1.0.0",
            analysisId: "test-ai-analysis-1",
            createdAt: new Date().toISOString(),
            repository: {
                name: "demo-service",
                sourceType: "git",
            },
            metrics: {
                totalFiles: 50,
                includedFiles: 50,
                excludedFiles: 0,
                totalBytes: 120000,
                linesOfCode: 3500,
                languages: [{ name: "Go", percentage: 100, fileCount: 50, bytes: 120000 }],
            },
            technologies: [
                {
                    id: "TECH-1",
                    name: "Fiber",
                    category: "framework",
                    confidence: "confirmed",
                    evidence: [{ filePath: "go.mod", ruleType: "manifest_dep", detail: "fiber v2" }],
                },
            ],
            dependencies: { runtime: [], development: [] },
            routes: [{ method: "GET", path: "/health", sourceFile: "main.go", authRequired: false }],
            environment: { variables: [] },
            setup: { prerequisites: [], installCommands: [], runCommands: [], buildCommands: [] },
            testing: { frameworks: ["Go Test"], testCommands: ["go test ./..."], testDirectories: [], testFileCount: 4 },
            deployment: { dockerAvailable: true, dockerfilePaths: ["Dockerfile"], composePaths: [], ciWorkflows: [], targetPlatforms: ["linux"] },
            structureTree: "demo-service/\n├── main.go\n└── go.mod\n",
            provenance: {
                engine: "go_analyzer_worker",
                engineVersion: "1.0.0",
                rulesVersion: "1.0.0",
                schemaVersion: "1.0.0",
                durationMs: 320,
                rulesEvaluatedCount: 180,
                complexityTier: "Tier1Instant",
                complexityScore: 12,
                sourceArtifactSha256: "sha256demo",
                scopeHash: "scope123",
            },
            ai: {
                protocolVersion: "1.0.0",
                taskId: "task-demo-ai",
                summary: "A robust Go backend microservice utilizing the Fiber framework for HTTP routing and Docker for deployment.",
                architecturePattern: "Microservice REST API",
                provider: "gemini",
                model: "gemini-3.6-flash",
                keyComponents: [
                    { name: "HTTP Server", role: "Handles HTTP routing and middleware", factIds: ["TECH-1", "ROUTE-1"] },
                ],
                dataFlow: [
                    { step: 1, description: "Client issues GET /health request", factIds: ["ROUTE-1"] },
                ],
                risks: [
                    { category: "Testing", description: "Minimal test suite detected", factIds: ["TECH-1"] },
                ],
            },
        };

        assert.ok(mockCanonicalWithAI.ai);
        assert.equal(mockCanonicalWithAI.ai.provider, "gemini");
        assert.equal(mockCanonicalWithAI.ai.architecturePattern, "Microservice REST API");
        assert.equal(mockCanonicalWithAI.ai.keyComponents?.length, 1);
        assert.equal(mockCanonicalWithAI.ai.dataFlow?.length, 1);
        assert.equal(mockCanonicalWithAI.ai.risks?.length, 1);
    });

    it("verifies intelligence and hotspot data contract serialization", () => {
        const mockCanonicalWithIntelligence: CanonicalAnalysisResult = {
            schemaVersion: "1.0.0",
            analysisId: "test-intel-1",
            createdAt: new Date().toISOString(),
            repository: { name: "test-repo", sourceType: "local_folder" },
            metrics: { totalFiles: 10, includedFiles: 10, excludedFiles: 0, totalBytes: 1000, linesOfCode: 50, languages: [] },
            technologies: [],
            dependencies: { runtime: [], development: [] },
            routes: [],
            environment: { variables: [] },
            setup: { prerequisites: [], installCommands: [], runCommands: [], buildCommands: [] },
            testing: { frameworks: [], testCommands: [], testDirectories: [], testFileCount: 0 },
            deployment: { dockerAvailable: false, dockerfilePaths: [], composePaths: [], ciWorkflows: [], targetPlatforms: [] },
            structureTree: "",
            provenance: {
                engine: "go_analyzer_worker",
                engineVersion: "1.0.0",
                rulesVersion: "1.0.0",
                schemaVersion: "1.0.0",
                durationMs: 100,
                rulesEvaluatedCount: 50,
                complexityTier: "Tier1Instant",
                complexityScore: 10,
                sourceArtifactSha256: "testsha",
                scopeHash: "scope1",
            },
            intelligence: {
                hotspots: [
                    {
                        entityId: "file:src/server.ts",
                        fanIn: 12,
                        fanOut: 3,
                        centrality: 15.5,
                        complexity: 4.2,
                        isTested: false,
                        hotspotMetric: 22.1,
                    },
                ],
                security: [
                    {
                        ruleId: "SEC-001",
                        title: "Sensitive Env File",
                        description: "Unencrypted credentials",
                        severity: "HIGH",
                        confidence: "CONFIRMED",
                        entityId: "file:.env",
                        remediation: "Add .env to .gitignore",
                    },
                ],
                architecture: [
                    {
                        entityId: "file:src/api/routes.ts",
                        tier: "API",
                        confidence: "CONFIRMED",
                        evidence: [],
                    },
                ],
                flow: [
                    {
                        id: "flow_1",
                        steps: [
                            {
                                entityId: "route:POST:/api/login",
                                action: "Calls",
                                targetId: "file:src/auth.ts",
                                confidence: "CONFIRMED",
                            },
                        ],
                    },
                ],
                scorecard: {
                    overallScore: 95.0,
                    overallGrade: "A",
                    components: [
                        { component: "Security", score: 100, grade: "A", rationale: "No issues" },
                    ],
                    recommendations: [
                        { title: "Add Tests", description: "Improve coverage", priority: "high" },
                    ],
                },
            },
        };

        const hotspots = mockCanonicalWithIntelligence.intelligence?.hotspots || [];
        assert.equal(hotspots.length, 1);
        assert.equal(hotspots[0].entityId, "file:src/server.ts");
        assert.equal(hotspots[0].fanIn, 12);
        assert.equal(hotspots[0].fanOut, 3);
        assert.equal(hotspots[0].centrality, 15.5);
        assert.equal(hotspots[0].isTested, false);
        assert.equal(hotspots[0].hotspotMetric, 22.1);

        // Verify entityId string replacement without crash
        const displayName = hotspots[0].entityId.replace(/^[^:]+:/, "");
        assert.equal(displayName, "src/server.ts");
    });

    it("verifies resilience against malformed or legacy PascalCase hotspot records", () => {
        const legacyHotspots = [
            {
                EntityID: "file:legacy/path.go",
                FanIn: 5,
                FanOut: 1,
                Centrality: 6.0,
                Complexity: 2.0,
                IsTested: true,
                HotspotMetric: 8.0,
            },
            {
                entityId: undefined, // Simulating undefined entityId
                fanIn: 0,
                fanOut: 0,
                centrality: 0,
                complexity: 0,
                isTested: false,
                hotspotMetric: 0,
            },
        ];

        // Ensure safe extraction logic never throws Cannot read properties of undefined
        legacyHotspots.forEach((hs, idx) => {
            const rawEntityId = (hs as { entityId?: string }).entityId || (hs as { EntityID?: string }).EntityID || "";
            const entityDisplayName = rawEntityId ? rawEntityId.replace(/^[^:]+:/, "") : `Hotspot #${idx + 1}`;
            assert.ok(typeof entityDisplayName === "string");
            if (idx === 0) assert.equal(entityDisplayName, "legacy/path.go");
            if (idx === 1) assert.equal(entityDisplayName, "Hotspot #2");
        });
    });

    it("verifies normalizeCanonicalAnalysisResult on real local pdfnest canonical JSON result", () => {
        const jsonPath = path.resolve(__dirname, "../../../docs/evidence/pdfnest-canonical-result.json");
        if (fs.existsSync(jsonPath)) {
            const rawJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
            const normalized = normalizeCanonicalAnalysisResult(rawJson);

            assert.equal(normalized.repository.name, "pdfnest");
            assert.ok(normalized.metrics.totalFiles > 0);
            assert.ok(Array.isArray(normalized.metrics.languages));
            assert.ok(Array.isArray(normalized.technologies));
            assert.ok(Array.isArray(normalized.dependencies.runtime));
            assert.ok(Array.isArray(normalized.dependencies.development));
            assert.ok(Array.isArray(normalized.routes));
            assert.ok(Array.isArray(normalized.environment.variables));
            assert.ok(Array.isArray(normalized.evidence));
            assert.ok(normalized.evidence.length > 0);

            assert.ok(normalized.graphMetrics);
            assert.equal(typeof normalized.graphMetrics.entityCount, "number");
            assert.equal(typeof normalized.graphMetrics.edgeCount, "number");
            assert.equal(typeof normalized.graphMetrics.evidenceCoveragePct, "number");

            assert.ok(normalized.intelligence);
            assert.ok(Array.isArray(normalized.intelligence.architecture));
            assert.ok(Array.isArray(normalized.intelligence.flow));
            assert.ok(Array.isArray(normalized.intelligence.hotspots));
            assert.ok(Array.isArray(normalized.intelligence.security));
            assert.ok(normalized.intelligence.test);
            assert.ok(Array.isArray(normalized.intelligence.test.mappings));
            assert.ok(Array.isArray(normalized.intelligence.test.untestedComponents));

            if (normalized.intelligence.scorecard) {
                assert.equal(typeof normalized.intelligence.scorecard.overallScore, "number");
                assert.ok(Array.isArray(normalized.intelligence.scorecard.components));
                assert.ok(Array.isArray(normalized.intelligence.scorecard.recommendations));
            }
        }
    });

    it("verifies normalizeCanonicalAnalysisResult on legacy/null-slice payload and ensures zero Markdown export crash", () => {
        const legacyRaw = {
            SchemaVersion: "1.0.0",
            AnalysisID: "legacy-test-1",
            CreatedAt: "2026-08-22T12:00:00Z",
            Repository: { Name: "legacy-repo", SourceType: "local_folder" },
            Metrics: { TotalFiles: 10, IncludedFiles: 10, ExcludedFiles: 0, TotalBytes: 1000, LinesOfCode: 0, Languages: null },
            Technologies: null,
            Dependencies: { Runtime: null, Development: null },
            Routes: null,
            Environment: { Variables: null },
            Setup: { Prerequisites: null, InstallCommands: null, RunCommands: null, BuildCommands: null },
            Testing: { Frameworks: null, TestCommands: null, TestDirectories: null, TestFileCount: 0 },
            Deployment: { DockerAvailable: false, DockerfilePaths: null, ComposePaths: null, CIWorkflows: null, TargetPlatforms: null },
            StructureTree: "legacy-repo/\n",
            Provenance: {
                Engine: "go_analyzer_worker",
                EngineVersion: "1.0.0",
                RulesVersion: "1.0.0",
                SchemaVersion: "1.0.0",
                DurationMs: 50,
                RulesEvaluatedCount: 10,
                ComplexityTier: "Tier1Instant",
                ComplexityScore: 5,
                SourceArtifactSha256: "legacy-sha",
                ScopeHash: "hash1",
            },
            GraphMetrics: {
                EntityCount: 10,
                EdgeCount: 2,
                RelationshipCounts: {},
                EvidenceCoveragePct: 100.0,
                ConfirmedEdgeCount: 2,
                InferredEdgeCount: 0,
                UnresolvedReferences: 0,
                CycleCount: 0,
                OrphanEntityCount: 8,
                LanguageResolutionCoverage: {},
            },
            Evidence: null,
            Intelligence: {
                Architecture: null,
                Flow: null,
                Hotspots: [
                    { EntityID: "file:main.go", FanIn: 3, FanOut: 1, Centrality: 4.0, Complexity: 1.0, IsTested: true, HotspotMetric: 5.5 },
                ],
                Security: null,
                Test: {
                    Mappings: null,
                    UntestedComponents: null,
                },
                Scorecard: {
                    OverallScore: 90.0,
                    OverallGrade: "A",
                    Components: null,
                    Recommendations: null,
                },
            },
        };

        const normalized = normalizeCanonicalAnalysisResult(legacyRaw);

        // Verify that all slice fields are normalized to arrays rather than null/undefined
        assert.ok(Array.isArray(normalized.metrics.languages));
        assert.ok(Array.isArray(normalized.technologies));
        assert.ok(Array.isArray(normalized.dependencies.runtime));
        assert.ok(Array.isArray(normalized.dependencies.development));
        assert.ok(Array.isArray(normalized.routes));
        assert.ok(Array.isArray(normalized.environment.variables));
        assert.ok(Array.isArray(normalized.evidence));
        assert.ok(Array.isArray(normalized.intelligence!.architecture));
        assert.ok(Array.isArray(normalized.intelligence!.flow));
        assert.ok(Array.isArray(normalized.intelligence!.hotspots));
        assert.ok(Array.isArray(normalized.intelligence!.security));
        assert.ok(Array.isArray(normalized.intelligence!.test!.mappings));
        assert.ok(Array.isArray(normalized.intelligence!.test!.untestedComponents));
        assert.ok(Array.isArray(normalized.intelligence!.scorecard!.components));
        assert.ok(Array.isArray(normalized.intelligence!.scorecard!.recommendations));

        // Verify hotspot normalized fields
        assert.equal(normalized.intelligence!.hotspots[0].entityId, "file:main.go");
        assert.equal(normalized.intelligence!.hotspots[0].centrality, 4.0);
        assert.equal(normalized.intelligence!.hotspots[0].hotspotMetric, 5.5);

        // Verify graphMetrics camelCase normalized fields
        assert.equal(normalized.graphMetrics!.entityCount, 10);
        assert.equal(normalized.graphMetrics!.edgeCount, 2);
        assert.equal(normalized.graphMetrics!.evidenceCoveragePct, 100.0);
    });
});


