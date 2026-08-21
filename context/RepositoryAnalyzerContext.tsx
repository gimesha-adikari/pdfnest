"use client";

import React, { createContext, useContext, useState, useMemo, type ReactNode } from "react";

export type RepositorySource =
    | {
          type: "git";
          url: string;
      }
    | {
          type: "local";
          name: string;
          files: File[];
      }
    | {
          type: "zip";
          name: string;
          file: File;
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

export interface MockProjectSummary {
    name: string;
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
}

interface RepositoryAnalyzerContextType {
    source: RepositorySource | null;
    selectedReports: string[];
    mockProject: MockProjectSummary;
    isGenerating: boolean;
    setSource: (source: RepositorySource | null) => void;
    clearSource: () => void;
    toggleReport: (reportId: string) => void;
    selectAllReports: () => void;
    clearReports: () => void;
    setIsGenerating: (generating: boolean) => void;
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

export function RepositoryAnalyzerProvider({ children }: { children: ReactNode }) {
    const [source, setSource] = useState<RepositorySource | null>(null);
    const [selectedReports, setSelectedReports] = useState<string[]>(DEFAULT_SELECTED_REPORTS);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);

    // Derive display name from source if available
    const projectName = useMemo(() => {
        if (!source) return "platen";
        if (source.type === "git") {
            const parts = source.url.replace(/\/+$/, "").split("/");
            const lastPart = parts[parts.length - 1] || "repository";
            return lastPart.replace(/\.git$/i, "") || "repository";
        }
        if (source.type === "local") {
            return source.name || "local-project";
        }
        if (source.type === "zip") {
            return source.name || "zip-repository";
        }
        return "platen";
    }, [source]);

    const mockProject: MockProjectSummary = useMemo(() => ({
        name: projectName,
        languages: ["TypeScript", "Go", "CSS"],
        frameworks: ["Next.js", "React"],
        database: ["PostgreSQL"],
        infrastructure: ["Docker", "GitHub Actions"],
        stats: {
            files: "1,248 Files",
            directories: "184 Directories",
            linesOfCode: "182,491 Lines of Code",
            packageManagers: "2 Package Managers",
        },
    }), [projectName]);

    const clearSource = () => {
        setSource(null);
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
        setSource(null);
        setSelectedReports(DEFAULT_SELECTED_REPORTS);
        setIsGenerating(false);
    };

    return (
        <RepositoryAnalyzerContext.Provider
            value={{
                source,
                selectedReports,
                mockProject,
                isGenerating,
                setSource,
                clearSource,
                toggleReport,
                selectAllReports,
                clearReports,
                setIsGenerating,
                reset,
            }}
        >
            {children}
        </RepositoryAnalyzerContext.Provider>
    );
}
