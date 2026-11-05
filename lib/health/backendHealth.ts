import { getBaseUrl } from "@/lib/api";

export type BackendStatus = "online" | "degraded" | "offline" | "checking" | "unknown";
export type ProbeState = "unknown" | "healthy" | "unhealthy" | "ready" | "not_ready";
export type WorkerReadiness = "unknown" | "checking" | "ready" | "not_ready";

export interface WorkerCapabilities {
    document_processing: boolean;
    ocr: boolean;
    office_to_pdf: boolean;
    pdf_to_office: boolean;
}

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
    /** Sanitized Worker readiness, obtained through the Backend's signed probe. */
    workerReadiness: WorkerReadiness;
    /** Capabilities may be null when the Backend cannot authenticate or reach Worker. */
    workerCapabilities: WorkerCapabilities | null;
    lastChecked: number | null;
    error: string | null;
}

type HealthListener = (state: BackendHealthState) => void;

class BackendHealthTracker {
    private status: BackendStatus = "unknown";
    private networkReachable: boolean | null = null;
    private liveness: BackendHealthState["liveness"] = "unknown";
    private readiness: BackendHealthState["readiness"] = "unknown";
    private workerReadiness: WorkerReadiness = "unknown";
    private workerCapabilities: WorkerCapabilities | null = null;
    private lastChecked: number | null = null;
    private lastError: string | null = null;
    private consecutiveTransportFailures = 0;
    private listeners: Set<HealthListener> = new Set();
    private inFlightCheck: Promise<boolean> | null = null;
    private cooldownMs = 15000;
    private recoveryCooldownMs = 60000;
    private listenersInitialized = false;
    private workerLastCheckedAt: number | null = null;
    private workerCooldownMs = 60_000;

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
            this.workerReadiness = "unknown";
            this.workerCapabilities = null;
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
            workerReadiness: this.workerReadiness,
            workerCapabilities: this.workerCapabilities,
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
        this.workerReadiness = "unknown";
        this.workerCapabilities = null;
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
        if (this.status === "online") {
            void this.checkWorkerHealth();
            return Promise.resolve(true);
        }
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
            void this.checkWorkerHealth();
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

    public checkWorkerHealth(force = false): Promise<void> {
        if (typeof window === "undefined") return Promise.resolve();
        if (!force && this.workerLastCheckedAt && Date.now() - this.workerLastCheckedAt < this.workerCooldownMs) {
            return this.workerProbeInFlight ?? Promise.resolve();
        }
        return this.refreshWorkerReadiness(getBaseUrl());
    }

    private workerProbeInFlight: Promise<void> | null = null;

    private refreshWorkerReadiness(base: string): Promise<void> {
        if (this.workerProbeInFlight) return this.workerProbeInFlight;
        this.workerLastCheckedAt = Date.now();
        const run = async () => {
            this.workerReadiness = "checking";
            this.workerCapabilities = null;
            this.notify();

            const controller = new AbortController();
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            try {
                timeoutId = setTimeout(() => controller.abort(), 3000);
                const response = await fetch(`${base}/api/health/worker`, {
                    method: "GET",
                    headers: { Accept: "application/json" },
                    signal: controller.signal,
                    cache: "no-store",
                });
                const body: unknown = await response.json();
                if (!body || typeof body !== "object" || !("status" in body) || !("capabilities" in body)) {
                    throw new Error("Invalid Worker readiness response");
                }
                const status = body.status;
                const capabilities = body.capabilities;
                if (
                    (status !== "ready" && status !== "not_ready") ||
                    !capabilities || typeof capabilities !== "object" ||
                    !("document_processing" in capabilities) || typeof capabilities.document_processing !== "boolean" ||
                    !("ocr" in capabilities) || typeof capabilities.ocr !== "boolean" ||
                    !("office_to_pdf" in capabilities) || typeof capabilities.office_to_pdf !== "boolean" ||
                    !("pdf_to_office" in capabilities) || typeof capabilities.pdf_to_office !== "boolean"
                ) {
                    throw new Error("Invalid Worker readiness response");
                }
                this.workerReadiness = status;
                this.workerCapabilities = {
                    document_processing: capabilities.document_processing,
                    ocr: capabilities.ocr,
                    office_to_pdf: capabilities.office_to_pdf,
                    pdf_to_office: capabilities.pdf_to_office,
                };
            } catch {
                // Transport and Backend-to-Worker authentication failures leave
                // Worker availability unknown without changing Backend status.
                this.workerReadiness = "unknown";
                this.workerCapabilities = null;
            } finally {
                if (timeoutId !== undefined) clearTimeout(timeoutId);
                this.notify();
                this.workerProbeInFlight = null;
            }
        };

        this.workerProbeInFlight = run();
        return this.workerProbeInFlight;
    }
}

export const backendHealth = new BackendHealthTracker();
