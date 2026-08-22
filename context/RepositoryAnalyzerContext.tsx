"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    type ReactNode,
} from "react";
import { analyzerApi } from "@/lib/api/analyzer";
import type {
    CanonicalAnalysisResult,
    SessionResponse,
    TreeResponse,
    ScopeResponse,
    TaskStatusResponse,
    TechnologyItem,
    SourceType,
} from "@/types/analyzer";

export const ALL_REPORTS = [
    {
        id: "Project Structure",
        title: "Project Structure",
        description: "Understand how the repository is organized and language distributions.",
    },
    {
        id: "Technology Stack",
        title: "Technology Stack",
        description: "Identify languages, frameworks, databases, caches, and infrastructure with evidence.",
    },
    {
        id: "Dependencies",
        title: "Dependencies",
        description: "Review runtime and development packages extracted from manifests.",
    },
    {
        id: "Setup & Run Guide",
        title: "Setup & Run Guide",
        description: "Step-by-step installation, build, and execution commands.",
    },
    {
        id: "Environment Configuration",
        title: "Environment Configuration",
        description: "Document configuration keys, inferred types, and requirements.",
    },
    {
        id: "API Overview",
        title: "API Overview",
        description: "Inspect detected HTTP endpoints, methods, and inferred handlers.",
    },
    {
        id: "Testing",
        title: "Testing",
        description: "Review test frameworks, runners, directories, and test suites.",
    },
    {
        id: "Deployment",
        title: "Deployment",
        description: "Inspect Dockerfiles, Compose setups, and CI/CD pipelines.",
    },
] as const;

export const DEFAULT_SELECTED_REPORTS: string[] = [
    "Project Structure",
    "Technology Stack",
    "Dependencies",
    "Setup & Run Guide",
    "Environment Configuration",
    "API Overview",
    "Testing",
    "Deployment",
];

export const PRESET_OPTIONS = [
    { id: "node_modules", label: "Node Modules (node_modules/**)", default: true },
    { id: "build_outputs", label: "Build Outputs (.next/**, dist/**, build/**)", default: true },
    { id: "vcs", label: "Version Control (.git/**, .svn/**)", default: true },
    { id: "virtual_envs", label: "Python Virtual Envs (venv/**, .venv/**)", default: true },
    { id: "caches", label: "Caches & Temporary (__pycache__/**, .turbo/**)", default: true },
    { id: "vendor", label: "Vendor Folders (vendor/**, target/**)", default: true },
];

export const MANDATORY_SECURITY_PATTERNS = [
    "**/*.pem",
    "**/*.key",
    "**/id_rsa*",
    "**/id_dsa*",
    "**/id_ed25519*",
    "**/credentials.json",
    "**/.env",
    "**/.env.local",
    "**/.env.production",
];

export interface RepositorySource {
    type: SourceType;
    url?: string;
    storageKey?: string;
    name: string;
    sessionId?: string;
}

interface RepositoryAnalyzerContextType {
    // Current Session (Strict Isolation)
    sessionId: string | null;
    session: SessionResponse | null;
    source: RepositorySource | null;

    // Scoping & Inventory
    tree: TreeResponse | null;
    scope: ScopeResponse | null;
    customPatterns: string[];
    enabledPresets: string[];
    forceIncludes: string[];
    selectedDomains: string[];

    // Analysis & Progress
    taskId: string | null;
    progress: TaskStatusResponse | null;
    result: CanonicalAnalysisResult | null;
    isAnalyzing: boolean;
    isLoading: boolean;
    error: string | null;
    enableAi: boolean;

    // Evidence Modal State
    evidenceModalTech: TechnologyItem | null;

    // Actions
    setEnableAi: (enable: boolean) => void;
    toggleEnableAi: () => void;
    createGitSession: (url: string, repoName?: string) => Promise<string>;
    createZipSession: (storageKey: string, repoName?: string) => Promise<string>;
    loadSession: (sessionId: string) => Promise<void>;
    updateScope: (overrides?: {
        customPatterns?: string[];
        enabledPresets?: string[];
        forceIncludes?: string[];
        selectedDomains?: string[];
    }) => Promise<void>;
    togglePreset: (presetId: string) => Promise<void>;
    addCustomPattern: (pattern: string) => Promise<void>;
    removeCustomPattern: (pattern: string) => Promise<void>;
    addForceInclude: (pattern: string) => Promise<void>;
    removeForceInclude: (pattern: string) => Promise<void>;
    toggleDomain: (domain: string) => Promise<void>;
    selectAllDomains: () => Promise<void>;
    clearDomains: () => Promise<void>;
    startAnalysis: () => Promise<void>;
    reset: () => void;
    openEvidenceModal: (tech: TechnologyItem) => void;
    closeEvidenceModal: () => void;
}

function extractErrorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === "object") {
        const ax = err as { response?: { data?: { code?: string; message?: string } }; message?: string };
        if (ax.response?.data?.message) {
            const code = ax.response.data.code;
            return code ? `[${code}] ${ax.response.data.message}` : ax.response.data.message;
        }
        if (ax.message) return ax.message;
    }
    return fallback;
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
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [session, setSession] = useState<SessionResponse | null>(null);
    const [source, setSource] = useState<RepositorySource | null>(null);

    const [tree, setTree] = useState<TreeResponse | null>(null);
    const [scope, setScope] = useState<ScopeResponse | null>(null);
    const [customPatterns, setCustomPatterns] = useState<string[]>([]);
    const [enabledPresets, setEnabledPresets] = useState<string[]>(PRESET_OPTIONS.map((p) => p.id));
    const [forceIncludes, setForceIncludes] = useState<string[]>([]);
    const [selectedDomains, setSelectedDomains] = useState<string[]>(DEFAULT_SELECTED_REPORTS);

    const [taskId, setTaskId] = useState<string | null>(null);
    const [progress, setProgress] = useState<TaskStatusResponse | null>(null);
    const [result, setResult] = useState<CanonicalAnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [enableAi, setEnableAi] = useState<boolean>(false);

    const [evidenceModalTech, setEvidenceModalTech] = useState<TechnologyItem | null>(null);

    const unsubscribeWsRef = useRef<(() => void) | null>(null);
    const activeSessionRef = useRef<string | null>(null);

    const toggleEnableAi = useCallback(() => {
        setEnableAi((prev) => !prev);
    }, []);

    // Hard Session Reset helper
    const reset = useCallback(() => {
        if (unsubscribeWsRef.current) {
            unsubscribeWsRef.current();
            unsubscribeWsRef.current = null;
        }
        activeSessionRef.current = null;
        setSessionId(null);
        setSession(null);
        setSource(null);
        setTree(null);
        setScope(null);
        setCustomPatterns([]);
        setEnabledPresets(PRESET_OPTIONS.map((p) => p.id));
        setForceIncludes([]);
        setSelectedDomains(DEFAULT_SELECTED_REPORTS);
        setTaskId(null);
        setProgress(null);
        setResult(null);
        setIsAnalyzing(false);
        setIsLoading(false);
        setError(null);
        setEnableAi(false);
        setEvidenceModalTech(null);
    }, []);

    // Subscribe to real-time WebSocket progress
    const subscribeToTaskProgress = (sid: string, tid: string) => {
        if (unsubscribeWsRef.current) {
            unsubscribeWsRef.current();
        }

        unsubscribeWsRef.current = analyzerApi.subscribeProgress(
            tid,
            async (p) => {
                if (activeSessionRef.current !== sid) return; // Stale guard
                setProgress(p);

                if (p.status === "COMPLETED") {
                    setIsAnalyzing(false);
                    try {
                        const canon = await analyzerApi.getResult(sid);
                        if (activeSessionRef.current === sid) {
                            setResult(canon);
                        }
                    } catch (err: unknown) {
                        if (activeSessionRef.current === sid) {
                            setError(extractErrorMessage(err, "Failed to load analysis result"));
                        }
                    }
                } else if (p.status === "FAILED") {
                    setIsAnalyzing(false);
                    setError(p.errorMessage || "Analysis task failed");
                }
            },
            () => {
                // WebSocket error handled by polling fallback
            }
        );
    };

    // Load full session state from backend
    const loadSession = useCallback(async (sid: string) => {
        setIsLoading(true);
        setError(null);
        try {
            activeSessionRef.current = sid;
            setSessionId(sid);

            const sessionData = await analyzerApi.getSession(sid);
            if (activeSessionRef.current !== sid) return; // Stale session guard

            setSession(sessionData);
            setSource({
                type: sessionData.sourceType,
                url: sessionData.gitUrl,
                storageKey: sessionData.storageKey,
                name: sessionData.repositoryName,
                sessionId: sessionData.sessionId,
            });

            // Load Tree
            try {
                const treeData = await analyzerApi.getTree(sid);
                if (activeSessionRef.current === sid) {
                    setTree(treeData);
                }
            } catch {
                // Tree may be empty before scan
            }

            // If task already exists, check status and subscribe
            if (sessionData.currentTaskId) {
                setTaskId(sessionData.currentTaskId);
                try {
                    const status = await analyzerApi.getTaskStatus(sessionData.currentTaskId);
                    if (activeSessionRef.current === sid) {
                        setProgress(status);
                        if (status.status === "COMPLETED") {
                            const res = await analyzerApi.getResult(sid);
                            if (activeSessionRef.current === sid) {
                                setResult(res);
                            }
                        } else if (status.status !== "FAILED") {
                            setIsAnalyzing(true);
                            subscribeToTaskProgress(sid, sessionData.currentTaskId);
                        }
                    }
                } catch {
                    // Task progress check error
                }
            }
        } catch (e: unknown) {
            if (activeSessionRef.current === sid) {
                setError(extractErrorMessage(e, "Failed to load session"));
            }
        } finally {
            if (activeSessionRef.current === sid) {
                setIsLoading(false);
            }
        }
    }, []);

    // Create Git Session
    const createGitSession = async (url: string, repoName?: string): Promise<string> => {
        reset();
        setIsLoading(true);
        setError(null);
        try {
            const res = await analyzerApi.createSession({
                sourceType: "git",
                gitUrl: url,
                repositoryName: repoName,
            });
            await loadSession(res.sessionId);
            return res.sessionId;
        } catch (e: unknown) {
            const msg = extractErrorMessage(e, "Failed to create Git session");
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    // Create ZIP Session
    const createZipSession = async (storageKey: string, repoName?: string): Promise<string> => {
        reset();
        setIsLoading(true);
        setError(null);
        try {
            const res = await analyzerApi.createSession({
                sourceType: "zip",
                storageKey: storageKey,
                repositoryName: repoName,
            });
            await loadSession(res.sessionId);
            return res.sessionId;
        } catch (e: unknown) {
            const msg = extractErrorMessage(e, "Failed to create ZIP session");
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    // Update Scope
    const updateScope = async (overrides?: {
        customPatterns?: string[];
        enabledPresets?: string[];
        forceIncludes?: string[];
        selectedDomains?: string[];
    }) => {
        if (!sessionId) return;
        const newCustom = overrides?.customPatterns ?? customPatterns;
        const newPresets = overrides?.enabledPresets ?? enabledPresets;
        const newForce = overrides?.forceIncludes ?? forceIncludes;
        const newDomains = overrides?.selectedDomains ?? selectedDomains;

        try {
            const resp = await analyzerApi.updateScope(sessionId, {
                customPatterns: newCustom,
                enabledPresets: newPresets,
                forceIncludes: newForce,
                selectedDomains: newDomains,
            });
            setScope(resp);
            setCustomPatterns(resp.customPatterns);
            setEnabledPresets(resp.enabledPresets);
            setForceIncludes(resp.forceIncludes);
            setSelectedDomains(resp.selectedDomains);
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Failed to update scope"));
        }
    };

    const togglePreset = async (presetId: string) => {
        const next = enabledPresets.includes(presetId)
            ? enabledPresets.filter((p) => p !== presetId)
            : [...enabledPresets, presetId];
        setEnabledPresets(next);
        await updateScope({ enabledPresets: next });
    };

    const addCustomPattern = async (pattern: string) => {
        const trimmed = pattern.trim();
        if (!trimmed || customPatterns.includes(trimmed)) return;
        const next = [...customPatterns, trimmed];
        setCustomPatterns(next);
        await updateScope({ customPatterns: next });
    };

    const removeCustomPattern = async (pattern: string) => {
        const next = customPatterns.filter((p) => p !== pattern);
        setCustomPatterns(next);
        await updateScope({ customPatterns: next });
    };

    const addForceInclude = async (pattern: string) => {
        const trimmed = pattern.trim();
        if (!trimmed || forceIncludes.includes(trimmed)) return;
        const next = [...forceIncludes, trimmed];
        setForceIncludes(next);
        await updateScope({ forceIncludes: next });
    };

    const removeForceInclude = async (pattern: string) => {
        const next = forceIncludes.filter((p) => p !== pattern);
        setForceIncludes(next);
        await updateScope({ forceIncludes: next });
    };

    const toggleDomain = async (domain: string) => {
        const next = selectedDomains.includes(domain)
            ? selectedDomains.filter((d) => d !== domain)
            : [...selectedDomains, domain];
        setSelectedDomains(next);
        await updateScope({ selectedDomains: next });
    };

    const selectAllDomains = async () => {
        setSelectedDomains(ALL_REPORTS.map((r) => r.id));
        await updateScope({ selectedDomains: ALL_REPORTS.map((r) => r.id) });
    };

    const clearDomains = async () => {
        setSelectedDomains([]);
        await updateScope({ selectedDomains: [] });
    };

    // Start Analysis
    const startAnalysis = async () => {
        if (!sessionId) return;
        setIsAnalyzing(true);
        setError(null);
        setProgress(null);
        setResult(null);

        try {
            const resp = await analyzerApi.analyzeSession(sessionId, {
                selectedDomains: selectedDomains,
                enableAi: enableAi,
            });
            setTaskId(resp.taskId);
            subscribeToTaskProgress(sessionId, resp.taskId);
        } catch (e: unknown) {
            setIsAnalyzing(false);
            setError(extractErrorMessage(e, "Failed to start repository analysis"));
        }
    };

    const openEvidenceModal = (tech: TechnologyItem) => {
        setEvidenceModalTech(tech);
    };

    const closeEvidenceModal = () => {
        setEvidenceModalTech(null);
    };

    return (
        <RepositoryAnalyzerContext.Provider
            value={{
                sessionId,
                session,
                source,
                tree,
                scope,
                customPatterns,
                enabledPresets,
                forceIncludes,
                selectedDomains,
                taskId,
                progress,
                result,
                isAnalyzing,
                isLoading,
                error,
                enableAi,
                evidenceModalTech,
                setEnableAi,
                toggleEnableAi,
                createGitSession,
                createZipSession,
                loadSession,
                updateScope,
                togglePreset,
                addCustomPattern,
                removeCustomPattern,
                addForceInclude,
                removeForceInclude,
                toggleDomain,
                selectAllDomains,
                clearDomains,
                startAnalysis,
                reset,
                openEvidenceModal,
                closeEvidenceModal,
            }}
        >
            {children}
        </RepositoryAnalyzerContext.Provider>
    );
}
