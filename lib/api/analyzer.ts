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
import { normalizeCanonicalAnalysisResult } from "@/lib/analyzer/normalize";

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
        return normalizeCanonicalAnalysisResult(resp.data);
    },

    /**
     * GET /api/v1/analyzer/tasks/:id
     */
    async getTaskStatus(taskId: string, signal?: AbortSignal): Promise<TaskStatusResponse> {
        const base = getBaseUrl();
        const resp = await client.get<TaskStatusResponse>(`${base}/api/v1/analyzer/tasks/${encodeURIComponent(taskId)}`, { signal, timeout: 15_000 });
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
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let polling = false;
        let failures = 0;
        const controller = new AbortController();

        const cleanup = () => {
            isClosed = true;
            controller.abort();
            if (ws) {
                try {
                    ws.close();
                } catch {
                    // Ignore close error
                }
                ws = null;
            }
            if (pollTimer) {
                clearTimeout(pollTimer);
                pollTimer = null;
            }
        };

        const startPollingFallback = () => {
            if (isClosed || polling) return;
            polling = true;
            if (ws) {
                ws.onclose = ws.onerror = ws.onmessage = null;
                ws.close();
                ws = null;
            }
            const poll = async () => {
                pollTimer = null;
                if (isClosed) return;
                try {
                    const status = await analyzerApi.getTaskStatus(taskId, controller.signal);
                    if (isClosed) return;
                    failures = 0;
                    onProgress(status);
                    if (status.status === "COMPLETED" || status.status === "FAILED") cleanup();
                } catch (error) {
                    if (isClosed) return;
                    failures += 1;
                    onError?.(error);
                    if (failures >= 5) cleanup();
                } finally {
                    if (!isClosed) pollTimer = setTimeout(poll, Math.min(8_000, 1_000 * 2 ** failures));
                }
            };
            pollTimer = setTimeout(poll, 1_000);
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
