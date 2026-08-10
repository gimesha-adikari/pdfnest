export interface StoredAsyncTask {
    taskId: string;
    tool: string;
    createdAt: number;
    status?: string;
    error?: string;
}

const STORAGE_KEY = "pdfnest:async-tasks";
const MAX_TASKS = 10;
// Stored tasks only support short-lived recovery after navigation or refresh.
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function getStoredTasks(): StoredAsyncTask[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: StoredAsyncTask[] = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        const now = Date.now();
        const valid = parsed.filter(
            (t) => t && typeof t.taskId === "string" && now - (t.createdAt || 0) < MAX_AGE_MS
        );
        if (valid.length !== parsed.length) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        }
        return valid;
    } catch {
        return [];
    }
}

export function addStoredTask(taskId: string, tool: string, status?: string, error?: string): void {
    if (typeof window === "undefined" || !taskId) return;
    try {
        const current = getStoredTasks();
        const filtered = current.filter((t) => t.taskId !== taskId);
        const updated = [{ taskId, tool, createdAt: Date.now(), status, error }, ...filtered].slice(0, MAX_TASKS);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
    }
}

export function updateStoredTask(taskId: string, updates: { status?: string; error?: string }): void {
    if (typeof window === "undefined" || !taskId) return;
    try {
        const current = getStoredTasks();
        const updated = current.map((t) => {
            if (t.taskId === taskId) {
                return { ...t, ...updates };
            }
            return t;
        });
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
    }
}

export function removeStoredTask(taskId: string): void {
    if (typeof window === "undefined" || !taskId) return;
    try {
        const current = getStoredTasks();
        const updated = current.filter((t) => t.taskId !== taskId);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
    }
}
