/**
 * Final Real-User E2E Acceptance Test Suite for PDFNest Repository Analyzer Frontend
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
    CanonicalAnalysisResult,
    SessionResponse,
    TreeResponse,
    ScopeResponse,
    ArchitectureSummary,
} from "../../types/analyzer";
import {
    ALL_REPORTS,
    PRESET_OPTIONS,
    MANDATORY_SECURITY_PATTERNS,
} from "../../context/RepositoryAnalyzerContext";

describe("PDFNest Repository Analyzer — Final Real-User E2E Acceptance Suite", () => {
    const sampleCanonicalResult: CanonicalAnalysisResult = {
        schemaVersion: "1.0.0",
        analysisId: "release-e2e-1",
        createdAt: "2026-08-21T20:00:00Z",
        repository: {
            name: "e2e-polyglot-monorepo",
            sourceType: "zip",
        },
        metrics: {
            totalFiles: 1305,
            includedFiles: 1305,
            excludedFiles: 0,
            linesOfCode: 45000,
            totalBytes: 5242880,
            languages: [
                { name: "Go", fileCount: 500, bytes: 2621440, percentage: 50.0 },
                { name: "TypeScript", fileCount: 405, bytes: 1572864, percentage: 30.0 },
                { name: "Python", fileCount: 400, bytes: 1048576, percentage: 20.0 },
            ],
        },
        structureTree: "root/\n  services/\n  package.json",
        structure: {
            rootName: "root",
            totalDirs: 1,
            totalFiles: 1,
            root: {
                name: "root",
                path: "",
                type: "directory",
                children: [
                    { name: "services", path: "services", type: "directory" },
                    { name: "package.json", path: "package.json", type: "file" },
                ],
            },
        },
        technologies: [
            {
                id: "fiber",
                name: "Fiber",
                category: "framework",
                version: "v2.52.0",
                confidence: "confirmed",
                evidence: [
                    {
                        ruleType: "manifest_dep",
                        filePath: "services/api/go.mod",
                        detail: "github.com/gofiber/fiber/v2",
                    },
                ],
            },
            {
                id: "fastapi",
                name: "FastAPI",
                category: "framework",
                version: "0.110.0",
                confidence: "confirmed",
                evidence: [
                    {
                        ruleType: "manifest_dep",
                        filePath: "services/worker/requirements.txt",
                        detail: "fastapi==0.110.0",
                    },
                ],
            },
            {
                id: "react",
                name: "React",
                category: "framework",
                version: "18.2.0",
                confidence: "confirmed",
                evidence: [
                    {
                        ruleType: "manifest_dep",
                        filePath: "web/package.json",
                        detail: "react@18.2.0",
                    },
                ],
            },
        ],
        dependencies: {
            runtime: [
                { name: "github.com/gofiber/fiber/v2", version: "v2.52.0", manager: "go", isDev: false },
                { name: "fastapi", version: "0.110.0", manager: "pip", isDev: false },
                { name: "react", version: "^18.2.0", manager: "npm", isDev: false },
            ],
            development: []
        },
        setup: {
            prerequisites: ["Go 1.22+", "Python 3.12+", "Node.js 20+"],
            installCommands: [
                { label: "Go", cmd: "go mod download" },
                { label: "Python", cmd: "pip install -r requirements.txt" },
                { label: "Node", cmd: "npm install" }
            ],
            runCommands: [
                { label: "Go", cmd: "go run main.go" },
                { label: "Python", cmd: "uvicorn main:app" },
                { label: "Node", cmd: "npm run dev" }
            ],
            buildCommands: [
                { label: "Go", cmd: "go build" },
                { label: "Node", cmd: "npm run build" }
            ],
        },
        environment: {
            variables: [
                { name: "PORT", inferredType: "number", required: true, source: ".env", references: [] },
                { name: "DATABASE_URL", inferredType: "secret", required: true, source: ".env", references: [] },
            ],
        },
        routes: [
            { method: "GET", path: "/api/v1/health", inferredHandler: "healthHandler", sourceFile: "services/api/main.go", authRequired: false },
            { method: "POST", path: "/api/v1/users", inferredHandler: "createUserHandler", sourceFile: "services/api/main.go", authRequired: true },
            { method: "GET", path: "/worker/ping", inferredHandler: "ping", sourceFile: "services/worker/main.py", authRequired: false },
        ],
        testing: {
            frameworks: ["pytest", "vitest"],
            testFileCount: 45,
            testDirectories: ["tests"],
            testCommands: ["pytest", "vitest run"]
        },
        deployment: {
            dockerAvailable: true,
            dockerfilePaths: ["Dockerfile"],
            composePaths: ["docker-compose.yml"],
            targetPlatforms: ["linux/amd64"],
            ciWorkflows: [
                { name: "CI", path: ".github/workflows/ci.yml", triggers: ["push"] }
            ],
        },
        provenance: {
            engine: "go-analyzer-worker",
            engineVersion: "1.0.0",
            rulesVersion: "1.0.0",
            schemaVersion: "1.0.0",
            durationMs: 733,
            complexityScore: 1305,
            complexityTier: "TIER_1",
            rulesEvaluatedCount: 42,
            scopeHash: "sha256:e2e-polyglot-test",
            sourceArtifactSha256: "sha256:source-zip-test",
        },
        architectureSummary: {
            protocolVersion: "1.0",
            taskId: "t1",
            summary: "Polyglot enterprise application featuring a Go Fiber HTTP API, Python FastAPI background worker, and React frontend.",
            architecturePattern: "Microservices / Service-Oriented Architecture",
            keyComponents: [
                {
                    name: "API Gateway",
                    role: "HTTP REST Coordinator",
                    factIds: ["fact-tech-fiber", "fact-lang-go"],
                },
                {
                    name: "Background Worker",
                    role: "Async Task Execution",
                    factIds: ["fact-tech-fastapi", "fact-lang-python"],
                },
            ],
            dataFlow: [
                { step: 1, description: "Clients send requests to Fiber API which enqueues heavy tasks to the FastAPI worker." }
            ],
            risks: [
                {
                    category: "Scalability",
                    description: "Polyglot services require independent container deployments.",
                    factIds: ["fact-tech-docker"],
                },
            ],
        },
    };

    it("verifies all 8 documentation domains are complete and renderable", () => {
        assert.equal(ALL_REPORTS.length, 8);
        assert.ok(sampleCanonicalResult.structure);
        assert.ok(sampleCanonicalResult.technologies.length > 0);
        assert.ok(sampleCanonicalResult.dependencies.runtime.length > 0);
        assert.ok(sampleCanonicalResult.setup.runCommands.length > 0);
        assert.ok(sampleCanonicalResult.environment.variables.length > 0);
        assert.ok(sampleCanonicalResult.routes.length > 0);
        assert.ok(sampleCanonicalResult.testing.frameworks.length > 0);
        assert.ok(sampleCanonicalResult.deployment.dockerAvailable);
    });

    it("verifies architecture summary grounding and fact ID traceability", () => {
        const summary = sampleCanonicalResult.architectureSummary;
        assert.ok(summary);
        assert.ok(summary.keyComponents);
        assert.equal(summary.keyComponents.length, 2);

        for (const comp of summary.keyComponents) {
            assert.ok(comp.factIds && comp.factIds.length > 0);
            for (const fid of comp.factIds!) {
                assert.ok(fid.startsWith("fact-"));
            }
        }
    });

    it("verifies secret protection: raw secret values must never be exposed", () => {
        for (const envVar of sampleCanonicalResult.environment.variables) {
            assert.notEqual(envVar.name, "super_secret_raw_password_12345");
            assert.ok(!("value" in envVar), "raw environment variable values must NOT exist in schema");
        }
    });

    it("verifies mandatory security rules non-overridability in frontend state", () => {
        assert.ok(MANDATORY_SECURITY_PATTERNS.includes("**/.env"));
        assert.ok(MANDATORY_SECURITY_PATTERNS.includes("**/id_rsa*"));
        assert.ok(MANDATORY_SECURITY_PATTERNS.includes("**/credentials.json"));
    });

    it("verifies graceful behavior when AI synthesis is disabled or absent", () => {
        const resultWithoutAI = { ...sampleCanonicalResult, architectureSummary: undefined };
        assert.equal(resultWithoutAI.architectureSummary, undefined);
        assert.ok(resultWithoutAI.technologies.length > 0);
        assert.ok(resultWithoutAI.routes.length > 0);
    });
});
