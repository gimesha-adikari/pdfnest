import axios from "axios";
import { getBaseUrl } from "@/lib/api";
import type {
    CreateSessionRequest,
    SessionResponse,
    UpdateScopeRequest,
    ScopeResponse,
    TreeResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    CanonicalAnalysisResult,
    TaskStatusResponse,
} from "@/types/analyzer";

const client = axios.create({
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

export const analyzerApi = {
    /**
     * POST /api/v1/analyzer/sessions
     */
    async createSession(data: CreateSessionRequest): Promise<SessionResponse> {
        const base = getBaseUrl();
        const resp = await client.post<SessionResponse>(`${base}/api/v1/analyzer/sessions`, data);
        return resp.data;
    },

    /**
     * GET /api/v1/analyzer/sessions/:id
     */
    async getSession(sessionId: string): Promise<SessionResponse> {
        const base = getBaseUrl();
        const resp = await client.get<SessionResponse>(`${base}/api/v1/analyzer/sessions/${encodeURIComponent(sessionId)}`);
        return resp.data;
    },

    /**
     * GET /api/v1/analyzer/sessions/:id/tree
     */
    async getTree(sessionId: string): Promise<TreeResponse> {
        const base = getBaseUrl();
        const resp = await client.get<TreeResponse>(`${base}/api/v1/analyzer/sessions/${encodeURIComponent(sessionId)}/tree`);
        return resp.data;
    },

    /**
     * PUT /api/v1/analyzer/sessions/:id/scope
     */
    async updateScope(sessionId: string, data: UpdateScopeRequest): Promise<ScopeResponse> {
        const base = getBaseUrl();
        const resp = await client.put<ScopeResponse>(`${base}/api/v1/analyzer/sessions/${encodeURIComponent(sessionId)}/scope`, data);
        return resp.data;
    },

    /**
     * POST /api/v1/analyzer/sessions/:id/analyze
     */
    async analyzeSession(sessionId: string, data?: AnalyzeRequest): Promise<AnalyzeResponse> {
        const base = getBaseUrl();
        const resp = await client.post<AnalyzeResponse>(`${base}/api/v1/analyzer/sessions/${encodeURIComponent(sessionId)}/analyze`, data || {});
        return resp.data;
    },

    /**
     * GET /api/v1/analyzer/sessions/:id/result
     */
    async getResult(sessionId: string): Promise<CanonicalAnalysisResult> {
        const base = getBaseUrl();
        const resp = await client.get<CanonicalAnalysisResult>(`${base}/api/v1/analyzer/sessions/${encodeURIComponent(sessionId)}/result`);
        return resp.data;
    },

    /**
     * GET /api/v1/analyzer/tasks/:id
     */
    async getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
        const base = getBaseUrl();
        const resp = await client.get<TaskStatusResponse>(`${base}/api/v1/analyzer/tasks/${encodeURIComponent(taskId)}`);
        return resp.data;
    },

    /**
     * WebSocket real-time progress subscription with HTTP polling fallback
     */
    subscribeProgress(
        taskId: string,
        onProgress: (progress: TaskStatusResponse) => void,
        onError?: (err: unknown) => void
    ): () => void {
        let isClosed = false;
        let ws: WebSocket | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;

        const cleanup = () => {
            isClosed = true;
            if (ws) {
                try {
                    ws.close();
                } catch {
                    // Ignore close error
                }
                ws = null;
            }
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        };

        const startPollingFallback = () => {
            if (isClosed || pollTimer) return;
            pollTimer = setInterval(async () => {
                if (isClosed) return;
                try {
                    const status = await analyzerApi.getTaskStatus(taskId);
                    onProgress(status);
                    if (status.status === "COMPLETED" || status.status === "FAILED") {
                        cleanup();
                    }
                } catch (e) {
                    if (onError) onError(e);
                }
            }, 1000);
        };

        try {
            const base = getBaseUrl();
            const wsUrl = base.replace(/^http/, "ws") + `/api/v1/analyzer/tasks/${encodeURIComponent(taskId)}/progress`;
            ws = new WebSocket(wsUrl);

            ws.onmessage = (event) => {
                if (isClosed) return;
                try {
                    const parsed: TaskStatusResponse = JSON.parse(event.data);
                    onProgress(parsed);
                    if (parsed.status === "COMPLETED" || parsed.status === "FAILED") {
                        cleanup();
                    }
                } catch (e) {
                    if (onError) onError(e);
                }
            };

            ws.onerror = () => {
                if (!isClosed) {
                    startPollingFallback();
                }
            };

            ws.onclose = () => {
                if (!isClosed) {
                    startPollingFallback();
                }
            };
        } catch {
            startPollingFallback();
        }

        return cleanup;
    },
};
