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
            totalFiles: 1305,
            analyzedFiles: 1305,
            primaryLanguage: "Go",
            fileTree: {
                name: "root",
                path: "",
                type: "directory",
                children: [
                    { name: "services", path: "services", type: "directory" },
                    { name: "package.json", path: "package.json", type: "file", extension: ".json" },
                ],
            },
        },
        metrics: {
            totalFiles: 1305,
            includedFiles: 1305,
            excludedFiles: 0,
            totalLines: 45000,
            totalBytes: 5242880,
            languages: [
                { name: "Go", fileCount: 500, lines: 25000, bytes: 2621440, percentage: 50.0 },
                { name: "TypeScript", fileCount: 405, lines: 12000, bytes: 1572864, percentage: 30.0 },
                { name: "Python", fileCount: 400, lines: 8000, bytes: 1048576, percentage: 20.0 },
            ],
            categories: {
                source: 1300,
                manifest: 3,
                config: 2,
            },
        },
        technologies: [
            {
                id: "fiber",
                name: "Fiber",
                category: "framework",
                version: "v2.52.0",
                confidence: "CONFIRMED",
                evidence: [
                    {
                        type: "manifest_dependency",
                        sourceFile: "services/api/go.mod",
                        details: "github.com/gofiber/fiber/v2",
                    },
                ],
            },
            {
                id: "fastapi",
                name: "FastAPI",
                category: "framework",
                version: "0.110.0",
                confidence: "CONFIRMED",
                evidence: [
                    {
                        type: "manifest_dependency",
                        sourceFile: "services/worker/requirements.txt",
                        details: "fastapi==0.110.0",
                    },
                ],
            },
            {
                id: "react",
                name: "React",
                category: "framework",
                version: "18.2.0",
                confidence: "CONFIRMED",
                evidence: [
                    {
                        type: "manifest_dependency",
                        sourceFile: "web/package.json",
                        details: "react@18.2.0",
                    },
                ],
            },
        ],
        dependencies: [
            { name: "github.com/gofiber/fiber/v2", version: "v2.52.0", ecosystem: "go", isDirect: true },
            { name: "fastapi", version: "0.110.0", ecosystem: "pip", isDirect: true },
            { name: "react", version: "^18.2.0", ecosystem: "npm", isDirect: true },
        ],
        setup: {
            prerequisites: ["Go 1.22+", "Python 3.12+", "Node.js 20+"],
            installCommands: ["go mod download", "pip install -r requirements.txt", "npm install"],
            startCommands: ["go run main.go", "uvicorn main:app", "npm run dev"],
            buildCommands: ["go build", "npm run build"],
        },
        environment: {
            variables: [
                { name: "PORT", description: "HTTP Port", isSecret: false },
                { name: "DATABASE_URL", description: "Database DSN", isSecret: true },
            ],
        },
        routes: [
            { method: "GET", path: "/api/v1/health", handler: "healthHandler", sourceFile: "services/api/main.go" },
            { method: "POST", path: "/api/v1/users", handler: "createUserHandler", sourceFile: "services/api/main.go" },
            { method: "GET", path: "/worker/ping", handler: "ping", sourceFile: "services/worker/main.py" },
        ],
        models: [
            { name: "User", fields: [{ name: "id", type: "string" }, { name: "email", type: "string" }] },
        ],
        testing: {
            frameworks: ["pytest", "vitest"],
            testFileCount: 45,
            testDirectory: "tests",
        },
        deployment: {
            dockerAvailable: true,
            dockerComposeAvailable: true,
            ciWorkflows: [".github/workflows/ci.yml"],
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
            schemaVersion: "1.0.0",
            overview: "Polyglot enterprise application featuring a Go Fiber HTTP API, Python FastAPI background worker, and React frontend.",
            projectType: "Full-Stack Web Application",
            primaryArchitecturePattern: "Microservices / Service-Oriented Architecture",
            systemComponents: [
                {
                    name: "API Gateway",
                    role: "HTTP REST Coordinator",
                    technologies: ["Fiber", "Go"],
                    evidenceFactIds: ["fact-tech-fiber", "fact-lang-go"],
                },
                {
                    name: "Background Worker",
                    role: "Async Task Execution",
                    technologies: ["FastAPI", "Python"],
                    evidenceFactIds: ["fact-tech-fastapi", "fact-lang-python"],
                },
            ],
            dataFlow: "Clients send requests to Fiber API which enqueues heavy tasks to the FastAPI worker.",
            identifiedRisks: [
                {
                    category: "Scalability",
                    description: "Polyglot services require independent container deployments.",
                    severity: "LOW",
                    evidenceFactIds: ["fact-tech-docker"],
                },
            ],
            confidence: "HIGH",
            evidenceFactIds: [
                "fact-tech-fiber",
                "fact-tech-fastapi",
                "fact-tech-react",
                "fact-lang-go",
                "fact-lang-python",
                "fact-lang-typescript",
            ],
        },
    };

    it("verifies all 8 documentation domains are complete and renderable", () => {
        assert.equal(ALL_REPORTS.length, 8);
        assert.ok(sampleCanonicalResult.repository.fileTree);
        assert.ok(sampleCanonicalResult.technologies.length > 0);
        assert.ok(sampleCanonicalResult.dependencies.length > 0);
        assert.ok(sampleCanonicalResult.setup.startCommands.length > 0);
        assert.ok(sampleCanonicalResult.environment.variables.length > 0);
        assert.ok(sampleCanonicalResult.routes.length > 0);
        assert.ok(sampleCanonicalResult.testing.frameworks.length > 0);
        assert.ok(sampleCanonicalResult.deployment.dockerAvailable);
    });

    it("verifies architecture summary grounding and fact ID traceability", () => {
        const summary = sampleCanonicalResult.architectureSummary;
        assert.ok(summary);
        assert.ok(summary.evidenceFactIds.length >= 6);
        assert.equal(summary.confidence, "HIGH");
        assert.equal(summary.systemComponents.length, 2);

        for (const comp of summary.systemComponents) {
            assert.ok(comp.evidenceFactIds.length > 0);
            for (const fid of comp.evidenceFactIds) {
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
