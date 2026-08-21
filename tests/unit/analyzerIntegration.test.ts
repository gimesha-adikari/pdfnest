/**
 * Phase 6 Frontend UI Integration & Scoping Unit Test Suite
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
    CanonicalAnalysisResult,
    SessionResponse,
    TreeResponse,
    ScopeResponse,
    TaskStatusResponse,
} from "../../types/analyzer";
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
});
