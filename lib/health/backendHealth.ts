import { getBaseUrl } from "@/lib/api";

export type BackendStatus = "online" | "offline" | "checking" | "unknown";

export interface BackendHealthState {
    status: BackendStatus;
    isAvailable: boolean;
    lastChecked: number | null;
    error: string | null;
}

type HealthListener = (state: BackendHealthState) => void;

class BackendHealthTracker {
    private status: BackendStatus = "unknown";
    private lastChecked: number | null = null;
    private lastError: string | null = null;
    private listeners: Set<HealthListener> = new Set();
    private inFlightCheck: Promise<boolean> | null = null;
    private cooldownMs = 15000; // 15s cooldown between automatic health checks
    private listenersInitialized = false;

    constructor() {
        if (typeof window !== "undefined") {
            this.initBrowserListeners();
        }
    }

    private initBrowserListeners() {
        if (this.listenersInitialized || typeof window === "undefined") return;
        this.listenersInitialized = true;

        window.addEventListener("online", () => {
            console.info("[BackendHealth] Browser online event detected. Checking backend...");
            void this.checkHealth(true);
        });

        window.addEventListener("offline", () => {
            console.warn("[BackendHealth] Browser offline event detected.");
            this.setState("offline", "Browser network connection is offline");
        });
    }

    public getState(): BackendHealthState {
        return {
            status: this.status,
            isAvailable: this.status === "online" || this.status === "unknown",
            lastChecked: this.lastChecked,
            error: this.lastError,
        };
    }

    public subscribe(listener: HealthListener): () => void {
        this.listeners.add(listener);
        listener(this.getState());
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notify() {
        const state = this.getState();
        this.listeners.forEach((listener) => {
            try {
                listener(state);
            } catch (e) {
                console.error("[BackendHealth] Error in listener:", e);
            }
        });
    }

    public setState(status: BackendStatus, error: string | null = null) {
        const changed = this.status !== status || this.lastError !== error;
        this.status = status;
        this.lastError = error;
        this.lastChecked = Date.now();
        if (changed) {
            this.notify();
        }
    }

    public markOffline(reason?: string) {
        this.setState("offline", reason || "Backend service unreachable");
    }

    public markOnline() {
        if (this.status !== "online") {
            this.setState("online", null);
        } else {
            this.lastChecked = Date.now();
        }
    }

    /**
     * Checks backend health via /api/health endpoint.
     * Deduplicates concurrent requests and respects cooldown to avoid request storms.
     * Never throws - returns boolean indicating whether backend is reachable.
     */
    public async checkHealth(force = false): Promise<boolean> {
        if (typeof window === "undefined") {
            return true;
        }

        // Respect cooldown unless forced
        if (!force && this.lastChecked && Date.now() - this.lastChecked < this.cooldownMs) {
            return this.status === "online";
        }

        // Return existing in-flight check if one is running
        if (this.inFlightCheck) {
            return this.inFlightCheck;
        }

        const runCheck = async (): Promise<boolean> => {
            const prevStatus = this.status;
            if (prevStatus === "unknown") {
                this.status = "checking";
                this.notify();
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            try {
                const url = `${getBaseUrl()}/api/health`;
                const response = await fetch(url, {
                    method: "GET",
                    headers: { Accept: "application/json" },
                    signal: controller.signal,
                    cache: "no-store",
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    this.setState("online", null);
                    return true;
                } else if (response.status >= 502 && response.status <= 504) {
                    this.setState("offline", `Service unavailable (HTTP ${response.status})`);
                    return false;
                } else {
                    // Other HTTP responses still mean the backend is reachable
                    this.setState("online", null);
                    return true;
                }
            } catch (err: any) {
                clearTimeout(timeoutId);
                const isAbort = err?.name === "AbortError";
                const errorMsg = isAbort ? "Health check timed out" : (err?.message || "Network error connecting to backend");
                this.setState("offline", errorMsg);
                return false;
            } finally {
                this.inFlightCheck = null;
            }
        };

        this.inFlightCheck = runCheck();
        return this.inFlightCheck;
    }
}

export const backendHealth = new BackendHealthTracker();
