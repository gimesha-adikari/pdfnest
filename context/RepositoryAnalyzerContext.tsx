"use client";

import React, { createContext, useContext, useState, useMemo, type ReactNode } from "react";

export interface ManifestEvidence {
    packages: string[];
    hasDockerfile: boolean;
    hasGithubActions: boolean;
    hasPrisma: boolean;
    hasCompose: boolean;
}

export type RepositorySource =
    | {
          type: "git";
          url: string;
          repositoryName: string;
          provider?: string;
          sourceId: string;
      }
    | {
          type: "local";
          repositoryName: string;
          files: File[];
          fileCount: number;
          relativePaths: string[];
          manifestEvidence: ManifestEvidence;
          sourceId: string;
      }
    | {
          type: "zip";
          repositoryName: string;
          file: File;
          size: number;
          sourceId: string;
      };

export const ALL_REPORTS = [
    {
        id: "Project Structure",
        title: "Project Structure",
        description: "Understand how the repository is organized.",
    },
    {
        id: "Technology Stack",
        title: "Technology Stack",
        description: "Identify languages, frameworks, databases, and infrastructure.",
    },
    {
        id: "Dependencies",
        title: "Dependencies",
        description: "See the packages and libraries used by the project.",
    },
    {
        id: "Setup & Run Guide",
        title: "Setup & Run Guide",
        description: "Understand how to install, build, and run the project.",
    },
    {
        id: "Environment Configuration",
        title: "Environment Configuration",
        description: "Understand configuration files and required environment variables.",
    },
    {
        id: "API Overview",
        title: "API Overview",
        description: "Understand detected routes and service interfaces.",
    },
    {
        id: "Testing",
        title: "Testing",
        description: "Understand test frameworks and available test commands.",
    },
    {
        id: "Deployment",
        title: "Deployment",
        description: "Understand Docker, CI/CD, hosting, and deployment configuration.",
    },
] as const;

export const DEFAULT_SELECTED_REPORTS: string[] = [
    "Project Structure",
    "Technology Stack",
    "Dependencies",
    "Setup & Run Guide",
];

export const DEFAULT_EXCLUSIONS: string[] = [
    "node_modules/**",
    ".git/**",
    ".next/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "venv/**",
    ".venv/**",
    "env/**",
    ".env/**",
    "__pycache__/**",
    ".pytest_cache/**",
    "site-packages/**",
    ".cache/**",
    "vendor/**",
    "target/**",
    ".turbo/**",
];

export interface MockProjectSummary {
    sourceId: string;
    name: string;
    sourceType: "git" | "local" | "zip";
    languages: string[];
    frameworks: string[];
    database: string[];
    infrastructure: string[];
    stats: {
        files: string;
        directories: string;
        linesOfCode: string;
        packageManagers: string;
    };
    scope: {
        totalFiles: number;
        includedFiles: number;
        excludedFiles: number;
        sampleIncluded: string[];
        sampleExcluded: string[];
    };
    structureTree: string;
    setupCommands: { label: string; cmd: string }[];
}

interface RepositoryAnalyzerContextType {
    source: RepositorySource | null;
    exclusions: string[];
    selectedReports: string[];
    mockProject: MockProjectSummary;
    isGenerating: boolean;
    activePreviewSection: string | null;
    setSource: (source: RepositorySource | null) => void;
    clearSource: () => void;
    addExclusion: (pattern: string) => void;
    removeExclusion: (pattern: string) => void;
    resetExclusions: () => void;
    toggleReport: (reportId: string) => void;
    selectAllReports: () => void;
    clearReports: () => void;
    setIsGenerating: (generating: boolean) => void;
    setActivePreviewSection: (sectionId: string | null) => void;
    reset: () => void;
}

const RepositoryAnalyzerContext = createContext<RepositoryAnalyzerContextType | undefined>(undefined);

export function useRepositoryAnalyzer() {
    const context = useContext(RepositoryAnalyzerContext);
    if (!context) {
        throw new Error("useRepositoryAnalyzer must be used within a RepositoryAnalyzerProvider");
    }
    return context;
}

// Matches a relative path against an exclusion pattern
export function isPathExcluded(path: string, exclusions: string[]): boolean {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    const segments = normalized.split("/").filter(Boolean);

    for (const rawPat of exclusions) {
        const pat = rawPat.trim().replace(/\\/g, "/").toLowerCase();
        if (!pat) continue;

        const cleanPat = pat.replace(/\/\*\*?$/, "").replace(/\/\*$/, "");

        // Extension match e.g. *.log
        if (cleanPat.startsWith("*.")) {
            const ext = cleanPat.substring(1);
            if (normalized.endsWith(ext)) return true;
            continue;
        }

        // Folder name match in any path segment (e.g. node_modules, .git, venv, .next, dist, build, coverage)
        if (segments.includes(cleanPat)) {
            return true;
        }

        // Prefix match e.g. "dist/" or "build/"
        if (normalized.startsWith(cleanPat + "/") || normalized === cleanPat) {
            return true;
        }
    }
    return false;
}

// Builds an ASCII tree from a set of relative file paths
function buildTreeFromPaths(rootName: string, paths: string[]): string {
    if (paths.length === 0) {
        return `${rootName}/\n└── (empty or all files excluded)`;
    }

    const treeMap: Record<string, Set<string>> = {};
    const rootFiles: string[] = [];

    paths.forEach((p) => {
        const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
        // If the path starts with root folder name, skip root part
        const cleanParts = parts[0]?.toLowerCase() === rootName.toLowerCase() ? parts.slice(1) : parts;
        if (cleanParts.length === 0) return;

        if (cleanParts.length === 1) {
            rootFiles.push(cleanParts[0]);
        } else {
            const dir = cleanParts[0];
            if (!treeMap[dir]) treeMap[dir] = new Set();
            if (cleanParts.length === 2) {
                treeMap[dir].add(cleanParts[1]);
            } else {
                treeMap[dir].add(cleanParts[1] + "/");
            }
        }
    });

    const lines: string[] = [`${rootName}/`];
    const dirs = Object.keys(treeMap).slice(0, 5);

    dirs.forEach((dir, dIdx) => {
        const isLastDir = dIdx === dirs.length - 1 && rootFiles.length === 0;
        lines.push(`${isLastDir ? "└──" : "├──"} ${dir}/`);
        const subItems = Array.from(treeMap[dir]).slice(0, 3);
        subItems.forEach((sub, sIdx) => {
            const isLastSub = sIdx === subItems.length - 1;
            lines.push(`│   ${isLastSub ? "└──" : "├──"} ${sub}`);
        });
    });

    const displayFiles = rootFiles.slice(0, 4);
    displayFiles.forEach((file, fIdx) => {
        const isLast = fIdx === displayFiles.length - 1;
        lines.push(`${isLast ? "└──" : "├──"} ${file}`);
    });

    if (lines.length <= 1) {
        lines.push("├── src/", "├── package.json", "└── README.md");
    }

    return lines.join("\n");
}

// Pure function: builds completely isolated mock analysis state strictly for the given source and exclusions
export function createMockAnalysis(source: RepositorySource | null, exclusions: string[]): MockProjectSummary {
    if (!source) {
        return {
            sourceId: "empty",
            name: "repository",
            sourceType: "git",
            languages: ["Not detected"],
            frameworks: ["Not detected"],
            database: ["Not detected"],
            infrastructure: ["Not detected"],
            stats: {
                files: "0 Files",
                directories: "0 Directories",
                linesOfCode: "0 Lines of Code",
                packageManagers: "0 Package Managers",
            },
            scope: {
                totalFiles: 0,
                includedFiles: 0,
                excludedFiles: 0,
                sampleIncluded: [],
                sampleExcluded: [],
            },
            structureTree: "repository/\n└── (no files)",
            setupCommands: [],
        };
    }

    const name = source.repositoryName || "project";
    const sourceId = source.sourceId;

    // 1. LOCAL PROJECT SOURCE — DETECT ONLY FROM CURRENT SOURCE
    if (source.type === "local") {
        const allPaths = source.relativePaths || [];
        const totalCount = allPaths.length || source.files.length || 0;

        const includedPaths: string[] = [];
        const excludedPaths: string[] = [];

        allPaths.forEach((p) => {
            if (isPathExcluded(p, exclusions)) {
                excludedPaths.push(p);
            } else {
                includedPaths.push(p);
            }
        });

        const manifestEvidence = source.manifestEvidence || {
            packages: [],
            hasDockerfile: false,
            hasGithubActions: false,
            hasPrisma: false,
            hasCompose: false,
        };

        const manifestPackages = new Set<string>(
            manifestEvidence.packages.map((pkg) => pkg.toLowerCase())
        );

        // Language detection strictly based on included file extensions
        const langSet = new Set<string>();
        let hasTS = false;
        let hasJS = false;
        let hasGo = false;
        let hasPython = false;
        let hasRust = false;
        let hasCSS = false;
        let hasHTML = false;
        let hasJava = false;
        let hasCpp = false;
        let hasRuby = false;
        let hasPHP = false;

        includedPaths.forEach((p) => {
            const lower = p.toLowerCase();
            const lastDot = lower.lastIndexOf(".");
            const ext = lastDot !== -1 ? lower.substring(lastDot) : "";
            const fileName = lower.split("/").pop() || "";

            if (ext === ".ts" || ext === ".tsx") hasTS = true;
            else if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") hasJS = true;
            else if (ext === ".go") hasGo = true;
            else if (ext === ".py") hasPython = true;
            else if (ext === ".rs") hasRust = true;
            else if (ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".less") hasCSS = true;
            else if (ext === ".html" || ext === ".htm") hasHTML = true;
            else if (ext === ".java") hasJava = true;
            else if (ext === ".c" || ext === ".cpp" || ext === ".cc" || ext === ".h" || ext === ".hpp") hasCpp = true;
            else if (ext === ".rb") hasRuby = true;
            else if (ext === ".php") hasPHP = true;

            // Also check root manifests
            if (fileName === "package.json" || fileName === "tsconfig.json") {
                if (fileName === "tsconfig.json") hasTS = true;
                else hasJS = true;
            } else if (fileName === "go.mod" || fileName === "go.sum") {
                hasGo = true;
            } else if (fileName === "requirements.txt" || fileName === "pyproject.toml" || fileName === "pipfile") {
                hasPython = true;
            } else if (fileName === "cargo.toml" || fileName === "cargo.lock") {
                hasRust = true;
            }
        });

        if (hasTS) langSet.add("TypeScript");
        if (hasJS && !hasTS) langSet.add("JavaScript");
        if (hasPython) langSet.add("Python");
        if (hasGo) langSet.add("Go");
        if (hasRust) langSet.add("Rust");
        if (hasCSS) langSet.add("CSS");
        if (hasHTML && langSet.size === 0) langSet.add("HTML");
        if (hasJava) langSet.add("Java");
        if (hasCpp) langSet.add("C++");
        if (hasRuby) langSet.add("Ruby");
        if (hasPHP) langSet.add("PHP");

        const languages = langSet.size > 0 ? Array.from(langSet) : ["Not detected"];

        // Framework detection strictly based on manifests or exact config files
        const frameworkSet = new Set<string>();
        let hasNext = false;
        let hasReact = false;

        includedPaths.forEach((p) => {
            const lower = p.toLowerCase();
            const fileName = lower.split("/").pop() || "";
            const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";

            if (
                fileName === "next.config.js" ||
                fileName === "next.config.ts" ||
                fileName === "next.config.mjs" ||
                fileName === "next.config.cjs" ||
                lower.includes("/app/layout.") ||
                lower.includes("/pages/_app.")
            ) {
                hasNext = true;
                hasReact = true;
            } else if (ext === ".tsx" || ext === ".jsx") {
                hasReact = true;
            }

            if (fileName === "vue.config.js" || fileName === "vue.config.ts" || ext === ".vue") {
                frameworkSet.add("Vue");
            }
            if (fileName === "svelte.config.js" || fileName === "svelte.config.ts" || ext === ".svelte") {
                frameworkSet.add("Svelte");
            }
            if (fileName.startsWith("tailwind.config.")) {
                frameworkSet.add("Tailwind CSS");
            }
            if (fileName.startsWith("vite.config.")) {
                frameworkSet.add("Vite");
            }
            if (fileName === "manage.py") {
                frameworkSet.add("Django");
            }
        });

        // Check manifest packages for exact framework names
        if (manifestPackages.has("next")) {
            hasNext = true;
            hasReact = true;
        }
        if (manifestPackages.has("react")) {
            hasReact = true;
        }
        if (manifestPackages.has("express")) {
            frameworkSet.add("Express");
        }
        if (manifestPackages.has("fastapi")) {
            frameworkSet.add("FastAPI");
        }
        if (manifestPackages.has("django")) {
            frameworkSet.add("Django");
        }
        if (manifestPackages.has("flask")) {
            frameworkSet.add("Flask");
        }
        if (manifestPackages.has("gin") || manifestPackages.has("github.com/gin-gonic/gin")) {
            frameworkSet.add("Gin");
        }
        if (manifestPackages.has("tailwindcss")) {
            frameworkSet.add("Tailwind CSS");
        }

        if (hasNext) frameworkSet.add("Next.js");
        if (hasReact) frameworkSet.add("React");

        const frameworks = frameworkSet.size > 0 ? Array.from(frameworkSet) : ["Not detected"];

        // Database detection strictly based on manifests or exact database config/files
        const dbSet = new Set<string>();

        includedPaths.forEach((p) => {
            const lower = p.toLowerCase();
            const fileName = lower.split("/").pop() || "";
            const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";

            if (fileName === "schema.prisma" || lower.endsWith("/prisma/schema.prisma")) {
                dbSet.add("Prisma");
            }
            if (ext === ".sqlite" || ext === ".sqlite3" || fileName === "sqlite.db" || fileName === "db.sqlite3") {
                dbSet.add("SQLite");
            }
            if (fileName === "redis.conf" || fileName === "dump.rdb") {
                dbSet.add("Redis");
            }
            if (fileName === "postgres.sql" || fileName === "postgresql.conf" || fileName === "pg_hba.conf") {
                dbSet.add("PostgreSQL");
            }
            if (fileName === "my.cnf" || fileName === "mysql.sql") {
                dbSet.add("MySQL");
            }
        });

        // Check manifest packages for exact database packages
        if (manifestPackages.has("redis") || manifestPackages.has("ioredis")) {
            dbSet.add("Redis");
        }
        if (manifestPackages.has("pg") || manifestPackages.has("postgres") || manifestPackages.has("psycopg2") || manifestPackages.has("asyncpg")) {
            dbSet.add("PostgreSQL");
        }
        if (manifestPackages.has("sqlite3") || manifestPackages.has("better-sqlite3") || manifestPackages.has("aiosqlite")) {
            dbSet.add("SQLite");
        }
        if (manifestPackages.has("mysql") || manifestPackages.has("mysql2") || manifestPackages.has("pymysql")) {
            dbSet.add("MySQL");
        }
        if (manifestPackages.has("mongoose") || manifestPackages.has("mongodb") || manifestPackages.has("pymongo")) {
            dbSet.add("MongoDB");
        }
        if (manifestPackages.has("prisma") || manifestPackages.has("@prisma/client") || manifestEvidence.hasPrisma) {
            dbSet.add("Prisma");
        }

        const database = dbSet.size > 0 ? Array.from(dbSet) : ["Not detected"];

        // Infrastructure detection strictly based on Docker/CI/CD files
        const infraSet = new Set<string>();

        includedPaths.forEach((p) => {
            const lower = p.toLowerCase();
            const segments = lower.split("/").filter(Boolean);
            const fileName = segments[segments.length - 1] || "";
            const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";

            if (
                fileName === "dockerfile" ||
                fileName === "docker-compose.yml" ||
                fileName === "docker-compose.yaml" ||
                fileName === "compose.yaml" ||
                fileName === "compose.yml" ||
                fileName === ".dockerignore"
            ) {
                infraSet.add("Docker");
            }
            if (segments.includes(".github") && segments.includes("workflows") && (ext === ".yml" || ext === ".yaml")) {
                infraSet.add("GitHub Actions");
            }
            if (fileName === ".gitlab-ci.yml") {
                infraSet.add("GitLab CI");
            }
            if ((segments.includes("k8s") || segments.includes("kubernetes")) && (ext === ".yml" || ext === ".yaml")) {
                infraSet.add("Kubernetes");
            }
            if (ext === ".tf" || ext === ".tfvars") {
                infraSet.add("Terraform");
            }
        });

        if (manifestEvidence.hasDockerfile || manifestEvidence.hasCompose) {
            infraSet.add("Docker");
        }
        if (manifestEvidence.hasGithubActions) {
            infraSet.add("GitHub Actions");
        }

        const infrastructure = infraSet.size > 0 ? Array.from(infraSet) : ["Not detected"];

        // Package Managers
        const pmSet = new Set<string>();
        includedPaths.forEach((p) => {
            const lower = p.toLowerCase();
            const fileName = lower.split("/").pop() || "";

            if (fileName === "pnpm-lock.yaml") pmSet.add("pnpm");
            else if (fileName === "yarn.lock") pmSet.add("yarn");
            else if (fileName === "bun.lockb" || fileName === "bun.lock") pmSet.add("bun");
            else if (fileName === "package-lock.json" || fileName === "package.json") pmSet.add("npm");
            if (fileName === "go.sum" || fileName === "go.mod") pmSet.add("go mod");
            if (fileName === "cargo.lock" || fileName === "cargo.toml") pmSet.add("cargo");
            if (fileName === "poetry.lock" || fileName === "pipfile.lock" || fileName === "requirements.txt") pmSet.add("pip");
        });
        const pmCount = Math.max(pmSet.size, 1);

        // Directories count
        const dirSet = new Set<string>();
        includedPaths.forEach((p) => {
            const parts = p.split("/");
            if (parts.length > 1) {
                dirSet.add(parts.slice(0, -1).join("/"));
            }
        });

        const includedCount = includedPaths.length;
        const excludedCount = excludedPaths.length;
        const estLoc = Math.max(includedCount * 142, 250);

        const tree = buildTreeFromPaths(name, includedPaths);

        // Setup commands based on detected package managers / languages
        const setupCommands: { label: string; cmd: string }[] = [];
        if (pmSet.has("pnpm")) {
            setupCommands.push({ label: "Install dependencies", cmd: "pnpm install" });
            setupCommands.push({ label: "Start dev server", cmd: "pnpm dev" });
        } else if (pmSet.has("yarn")) {
            setupCommands.push({ label: "Install dependencies", cmd: "yarn install" });
            setupCommands.push({ label: "Start dev server", cmd: "yarn dev" });
        } else if (pmSet.has("cargo") || hasRust) {
            setupCommands.push({ label: "Build project", cmd: "cargo build" });
            setupCommands.push({ label: "Run application", cmd: "cargo run" });
        } else if (pmSet.has("go mod") || hasGo) {
            setupCommands.push({ label: "Download Go modules", cmd: "go mod download" });
            setupCommands.push({ label: "Start Go service", cmd: "go run main.go" });
        } else if (hasPython) {
            setupCommands.push({ label: "Install Python dependencies", cmd: "pip install -r requirements.txt" });
            setupCommands.push({ label: "Run application", cmd: "python app.py" });
        } else {
            setupCommands.push({ label: "Install dependencies", cmd: "npm install" });
            setupCommands.push({ label: "Start development server", cmd: "npm run dev" });
        }

        return {
            sourceId,
            name,
            sourceType: "local",
            languages,
            frameworks,
            database,
            infrastructure,
            stats: {
                files: `${includedCount.toLocaleString()} Files`,
                directories: `${Math.max(dirSet.size, 1).toLocaleString()} Directories`,
                linesOfCode: `${estLoc.toLocaleString()} Lines of Code`,
                packageManagers: `${pmCount} Package ${pmCount === 1 ? "Manager" : "Managers"}`,
            },
            scope: {
                totalFiles: totalCount,
                includedFiles: includedCount,
                excludedFiles: excludedCount,
                sampleIncluded: includedPaths.slice(0, 5),
                sampleExcluded: excludedPaths.slice(0, 5),
            },
            structureTree: tree,
            setupCommands,
        };
    }

    // 2. GIT OR ZIP SOURCE
    const isZip = source.type === "zip";
    const simulatedTotal = isZip ? Math.max(Math.round(source.size / 4500), 24) : 48;
    const simulatedExcluded = Math.round(simulatedTotal * 0.28);
    const simulatedIncluded = simulatedTotal - simulatedExcluded;

    const sampleIncluded = [
        `src/app/page.tsx`,
        `src/components/Header.tsx`,
        `src/lib/utils.ts`,
        `package.json`,
        `README.md`,
    ];

    const sampleExcluded = [
        `node_modules/react/...`,
        `.git/objects/...`,
        `.next/static/...`,
        `dist/bundle.js`,
    ];

    const tree = `${name}/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── Header.tsx
│   └── Card.tsx
├── lib/
│   └── utils.ts
├── public/
│   └── favicon.ico
├── package.json
├── tsconfig.json
└── README.md`;

    return {
        sourceId,
        name,
        sourceType: isZip ? "zip" : "git",
        languages: ["TypeScript", "CSS", "HTML"],
        frameworks: ["Next.js", "React", "Tailwind CSS"],
        database: ["Not detected"],
        infrastructure: ["Not detected"],
        stats: {
            files: `${simulatedIncluded.toLocaleString()} Files`,
            directories: `8 Directories`,
            linesOfCode: `${(simulatedIncluded * 135).toLocaleString()} Lines of Code`,
            packageManagers: "1 Package Manager",
        },
        scope: {
            totalFiles: simulatedTotal,
            includedFiles: simulatedIncluded,
            excludedFiles: simulatedExcluded,
            sampleIncluded,
            sampleExcluded,
        },
        structureTree: tree,
        setupCommands: [
            { label: "Install dependencies", cmd: "npm install" },
            { label: "Start dev server", cmd: "npm run dev" },
            { label: "Build production bundle", cmd: "npm run build" },
        ],
    };
}

export function RepositoryAnalyzerProvider({ children }: { children: ReactNode }) {
    const [source, setSourceState] = useState<RepositorySource | null>(null);
    const [exclusions, setExclusions] = useState<string[]>(DEFAULT_EXCLUSIONS);
    const [selectedReports, setSelectedReports] = useState<string[]>(DEFAULT_SELECTED_REPORTS);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [activePreviewSection, setActivePreviewSection] = useState<string | null>(null);

    // Completely replace mockProject atomically based solely on the current source and exclusions
    const mockProject = useMemo(() => {
        return createMockAnalysis(source, exclusions);
    }, [source, exclusions]);

    // Atomic replacement when a new source is provided
    const setSource = (nextSource: RepositorySource | null) => {
        if (!nextSource) {
            setSourceState(null);
            setExclusions(DEFAULT_EXCLUSIONS);
            setSelectedReports(DEFAULT_SELECTED_REPORTS);
            setIsGenerating(false);
            setActivePreviewSection(null);
            return;
        }

        // Set the new source, reset exclusions to default, reset report selections and UI modal state
        setSourceState(nextSource);
        setExclusions(DEFAULT_EXCLUSIONS);
        setSelectedReports(DEFAULT_SELECTED_REPORTS);
        setIsGenerating(false);
        setActivePreviewSection(null);
    };

    const clearSource = () => {
        setSourceState(null);
        setExclusions(DEFAULT_EXCLUSIONS);
        setSelectedReports(DEFAULT_SELECTED_REPORTS);
        setIsGenerating(false);
        setActivePreviewSection(null);
    };

    const addExclusion = (pattern: string) => {
        const trimmed = pattern.trim();
        if (!trimmed) return;
        if (!exclusions.includes(trimmed)) {
            setExclusions((prev) => [...prev, trimmed]);
        }
    };

    const removeExclusion = (pattern: string) => {
        setExclusions((prev) => prev.filter((p) => p !== pattern));
    };

    const resetExclusions = () => {
        setExclusions(DEFAULT_EXCLUSIONS);
    };

    const toggleReport = (reportId: string) => {
        setSelectedReports((prev) =>
            prev.includes(reportId)
                ? prev.filter((id) => id !== reportId)
                : [...prev, reportId]
        );
    };

    const selectAllReports = () => {
        setSelectedReports(ALL_REPORTS.map((r) => r.id));
    };

    const clearReports = () => {
        setSelectedReports([]);
    };

    const reset = () => {
        setSourceState(null);
        setExclusions(DEFAULT_EXCLUSIONS);
        setSelectedReports(DEFAULT_SELECTED_REPORTS);
        setIsGenerating(false);
        setActivePreviewSection(null);
    };

    return (
        <RepositoryAnalyzerContext.Provider
            value={{
                source,
                exclusions,
                selectedReports,
                mockProject,
                isGenerating,
                activePreviewSection,
                setSource,
                clearSource,
                addExclusion,
                removeExclusion,
                resetExclusions,
                toggleReport,
                selectAllReports,
                clearReports,
                setIsGenerating,
                setActivePreviewSection,
                reset,
            }}
        >
            {children}
        </RepositoryAnalyzerContext.Provider>
    );
}
