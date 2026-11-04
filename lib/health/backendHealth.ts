import { getBaseUrl } from "@/lib/api";

export type BackendStatus = "online" | "degraded" | "offline" | "checking" | "unknown";
export type ProbeState = "unknown" | "healthy" | "unhealthy" | "ready" | "not_ready";

export interface BackendHealthState {
    status: BackendStatus;
    /** Backend-dependent execution is allowed only after readiness is confirmed. */
    isAvailable: boolean;
    /** Whether an HTTP response from the backend host was received. */
    networkReachable: boolean | null;
    /** Process liveness from /api/health. */
    liveness: "unknown" | "healthy" | "unhealthy";
    /** Required Backend dependencies from /api/ready (currently PostgreSQL and Redis). */
    readiness: "unknown" | "ready" | "not_ready";
    /** No public browser-safe Worker readiness probe is currently exposed. */
    workerReadiness: "unknown";
    lastChecked: number | null;
    error: string | null;
}

type HealthListener = (state: BackendHealthState) => void;

class BackendHealthTracker {
    private status: BackendStatus = "unknown";
    private networkReachable: boolean | null = null;
    private liveness: BackendHealthState["liveness"] = "unknown";
    private readiness: BackendHealthState["readiness"] = "unknown";
    private lastChecked: number | null = null;
    private lastError: string | null = null;
    private consecutiveTransportFailures = 0;
    private listeners: Set<HealthListener> = new Set();
    private inFlightCheck: Promise<boolean> | null = null;
    private cooldownMs = 15000;
    private recoveryCooldownMs = 60000;
    private listenersInitialized = false;

    constructor() {
        if (typeof window !== "undefined") this.initBrowserListeners();
    }

    private initBrowserListeners() {
        if (this.listenersInitialized || typeof window === "undefined") return;
        this.listenersInitialized = true;

        window.addEventListener("online", () => void this.checkHealth(true));
        window.addEventListener("offline", () => {
            this.consecutiveTransportFailures = Math.max(2, this.consecutiveTransportFailures + 1);
            this.networkReachable = false;
            this.liveness = "unknown";
            this.readiness = "unknown";
            this.setState("offline", "Browser network connection is offline");
        });
    }

    public getState(): BackendHealthState {
        return {
            status: this.status,
            isAvailable: this.status === "online" && this.readiness === "ready",
            networkReachable: this.networkReachable,
            liveness: this.liveness,
            readiness: this.readiness,
            workerReadiness: "unknown",
            lastChecked: this.lastChecked,
            error: this.lastError,
        };
    }

    public subscribe(listener: HealthListener): () => void {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }

    private notify() {
        const state = this.getState();
        this.listeners.forEach((listener) => {
            try { listener(state); } catch (e) { console.error("[BackendHealth] Error in listener:", e); }
        });
    }

    public setState(status: BackendStatus, error: string | null = null) {
        const changed = this.status !== status || this.lastError !== error;
        this.status = status;
        this.lastError = error;
        this.lastChecked = Date.now();
        if (changed) this.notify();
    }

    public markOffline(reason?: string) {
        this.networkReachable = false;
        this.liveness = "unknown";
        this.readiness = "unknown";
        this.consecutiveTransportFailures = Math.max(2, this.consecutiveTransportFailures + 1);
        this.setState("offline", reason || "Backend service unreachable");
    }

    /**
     * API responses can prove that the host answered, but cannot prove dependency
     * readiness. Only the paired health/readiness probes can authorize execution.
     */
    public markOnline() {
        this.networkReachable = true;
        if (this.liveness === "healthy" && this.readiness === "ready") {
            this.consecutiveTransportFailures = 0;
            this.setState("online", null);
        } else {
            this.notify();
        }
    }

    /** Navigation and foregrounding are low-frequency recovery signals. */
    public maybeRecover(): Promise<boolean> {
        if (this.status === "online") return Promise.resolve(true);
        if (this.lastChecked && Date.now() - this.lastChecked < this.recoveryCooldownMs) return Promise.resolve(false);
        return this.checkHealth(true);
    }

    /**
     * Verify process liveness and dependency readiness. A transient transport
     * failure leaves the UI in a checking state once; repeated failures are shown
     * as offline. The cooldown and in-flight promise prevent polling storms.
     */
    public async checkHealth(force = false): Promise<boolean> {
        if (typeof window === "undefined") return false;
        if (!force && this.lastChecked && Date.now() - this.lastChecked < this.cooldownMs) return this.getState().isAvailable;
        if (this.inFlightCheck) return this.inFlightCheck;

        const runCheck = async (): Promise<boolean> => {
            if (this.status === "unknown" || this.status === "offline" || this.status === "degraded") {
                this.status = "checking";
                this.notify();
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const headers = { Accept: "application/json" };
            const base = getBaseUrl();
            try {
                const [livenessResponse, readinessResponse] = await Promise.all([
                    fetch(`${base}/api/health`, { method: "GET", headers, signal: controller.signal, cache: "no-store" }),
                    fetch(`${base}/api/ready`, { method: "GET", headers, signal: controller.signal, cache: "no-store" }),
                ]);
                clearTimeout(timeoutId);
                this.networkReachable = true;
                this.liveness = livenessResponse.ok ? "healthy" : "unhealthy";
                this.readiness = "not_ready";

                if (livenessResponse.ok && readinessResponse.ok) {
                    let readinessBody: unknown = null;
                    try { readinessBody = await readinessResponse.json(); } catch { /* A malformed readiness response fails closed. */ }
                    if (readinessBody && typeof readinessBody === "object" && "ready" in readinessBody && readinessBody.ready === true) {
                        this.readiness = "ready";
                        this.consecutiveTransportFailures = 0;
                        this.setState("online", null);
                        return true;
                    }
                }

                this.consecutiveTransportFailures = 0;
                const detail = !livenessResponse.ok
                    ? `Liveness probe failed (HTTP ${livenessResponse.status})`
                    : !readinessResponse.ok
                        ? `Required backend dependencies are not ready (HTTP ${readinessResponse.status})`
                        : "Readiness probe did not confirm required dependencies";
                this.setState("degraded", detail);
                return false;
            } catch (err: unknown) {
                clearTimeout(timeoutId);
                this.networkReachable = false;
                this.liveness = "unknown";
                this.readiness = "unknown";
                this.consecutiveTransportFailures++;
                const isObjectError = typeof err === "object" && err !== null;
                const errorName = err instanceof Error
                    ? err.name
                    : isObjectError && "name" in err
                        ? String(err.name)
                        : "";
                const errorMessage = err instanceof Error
                    ? err.message
                    : isObjectError && "message" in err
                        ? String(err.message)
                        : "Network error connecting to backend";
                const errorMsg = errorName === "AbortError" ? "Health check timed out" : errorMessage;
                this.setState(this.consecutiveTransportFailures >= 2 ? "offline" : "checking", errorMsg);
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
