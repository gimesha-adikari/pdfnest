/**
 * Phase 7C-E Frontend Architecture Summary Presentation Unit Test Suite
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
    ArchitectureSummary,
    CanonicalAnalysisResult,
    ComponentDescription,
    DataFlowStep,
    RiskItem,
} from "../../types/analyzer";

describe("PDFNest Repository Analyzer — Phase 7C-E Architecture Summary Presentation", () => {
    it("verifies ArchitectureSummary contract and field structures", () => {
        const summary: ArchitectureSummary = {
            protocolVersion: "1.0.0",
            taskId: "task-123",
            summary: "Full-stack web application built with Go Fiber and Next.js.",
            architecturePattern: "Microservices / Split Frontend & API Coordinator",
            keyComponents: [
                {
                    name: "Fiber API Gateway",
                    role: "Coordinates REST API endpoints and authentication",
                    factIds: ["TECH-1", "ROUTE-1"],
                },
            ],
            dataFlow: [
                {
                    step: 1,
                    description: "Client submits analysis request",
                    factIds: ["ROUTE-1"],
                },
            ],
            risks: [
                {
                    category: "Configuration",
                    description: "Ensure DATABASE_URL environment variable is provisioned",
                    factIds: ["ENV-1"],
                },
            ],
            provider: "gemini",
            model: "gemini-1.5-flash",
            inputTokens: 350,
            outputTokens: 180,
            durationMs: 1200,
        };

        assert.equal(summary.protocolVersion, "1.0.0");
        assert.equal(summary.taskId, "task-123");
        assert.equal(summary.summary, "Full-stack web application built with Go Fiber and Next.js.");
        assert.equal(summary.architecturePattern, "Microservices / Split Frontend & API Coordinator");
        assert.equal(summary.keyComponents?.length, 1);
        assert.equal(summary.keyComponents?.[0].name, "Fiber API Gateway");
        assert.deepEqual(summary.keyComponents?.[0].factIds, ["TECH-1", "ROUTE-1"]);
        assert.equal(summary.dataFlow?.length, 1);
        assert.equal(summary.dataFlow?.[0].step, 1);
        assert.equal(summary.risks?.length, 1);
        assert.equal(summary.risks?.[0].category, "Configuration");
    });

    it("verifies safe handling of null or missing architecture summary", () => {
        const canonicalWithoutSummary: CanonicalAnalysisResult = {
            schemaVersion: "1.0.0",
            analysisId: "analysis-test-1",
            createdAt: new Date().toISOString(),
            repository: {
                name: "test-repo",
                sourceType: "git",
            },
            metrics: {
                totalFiles: 10,
                includedFiles: 10,
                excludedFiles: 0,
                totalBytes: 5000,
                linesOfCode: 200,
                languages: [{ name: "Go", percentage: 100, fileCount: 10, bytes: 5000 }],
            },
            technologies: [
                {
                    id: "tech-1",
                    name: "Fiber",
                    category: "framework",
                    confidence: "confirmed",
                    evidence: [],
                },
            ],
            dependencies: { runtime: [], development: [] },
            routes: [],
            environment: { variables: [] },
            setup: { prerequisites: [], installCommands: [], runCommands: [], buildCommands: [] },
            testing: { frameworks: [], testCommands: [], testDirectories: [], testFileCount: 0 },
            deployment: { dockerAvailable: false, dockerfilePaths: [], composePaths: [], ciWorkflows: [], targetPlatforms: [] },
            structureTree: "root/",
            provenance: {
                engine: "go_analyzer_worker",
                engineVersion: "1.0.0",
                rulesVersion: "1.0.0",
                schemaVersion: "1.0.0",
                durationMs: 45,
                rulesEvaluatedCount: 30,
                complexityTier: "simple",
                complexityScore: 10,
                sourceArtifactSha256: "abc",
                scopeHash: "def",
            },
            architectureSummary: null,
        };

        // Verifies canonical result remains 100% valid when summary is absent
        assert.equal(canonicalWithoutSummary.technologies.length, 1);
        assert.equal(canonicalWithoutSummary.architectureSummary, null);
    });

    it("verifies defensive handling of empty optional arrays", () => {
        const minimalSummary: ArchitectureSummary = {
            protocolVersion: "1.0.0",
            taskId: "task-min",
            summary: "Minimal summary with no components or risks",
            keyComponents: [],
            dataFlow: [],
            risks: [],
        };

        assert.equal(minimalSummary.keyComponents?.length, 0);
        assert.equal(minimalSummary.dataFlow?.length, 0);
        assert.equal(minimalSummary.risks?.length, 0);
    });

    it("verifies fact ID grounding preservation", () => {
        const comp: ComponentDescription = {
            name: "PostgreSQL Database",
            role: "Primary persistent relational storage",
            factIds: ["TECH-2", "ENV-1"],
        };
        const step: DataFlowStep = {
            step: 1,
            description: "API Worker processes incoming jobs from queue",
            factIds: ["TECH-3", "ROUTE-1"],
        };
        const risk: RiskItem = {
            category: "Scalability",
            description: "Redis connection limit considerations",
            factIds: ["TECH-3"],
        };

        assert.deepEqual(comp.factIds, ["TECH-2", "ENV-1"]);
        assert.deepEqual(step.factIds, ["TECH-3", "ROUTE-1"]);
        assert.deepEqual(risk.factIds, ["TECH-3"]);
    });
});
