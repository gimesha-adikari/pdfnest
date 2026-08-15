/**
 * Unit tests for lib/taskStorage.ts
 *
 * Run: npx tsx tests/unit/taskStorage.test.ts
 */

import assert from "assert";

const STORAGE_KEY = "pdfnest:async-tasks";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

class MemoryStorage {
    private store = new Map<string, string>();

    getItem(key: string): string | null {
        return this.store.has(key) ? this.store.get(key)! : null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }
}

const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = { localStorage: storage };

import {
    addStoredTask,
    getStoredTasks,
    removeStoredTask,
    StoredAsyncTask,
    updateStoredTask,
} from "../../lib/taskStorage";

function reset(raw?: string) {
    storage.clear();
    if (raw !== undefined) storage.setItem(STORAGE_KEY, raw);
}

function readRaw(): StoredAsyncTask[] {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
}

const tests: Array<[string, () => void]> = [
    ["getStoredTasks returns empty list when nothing is stored", () => {
        reset();
        assert.deepEqual(getStoredTasks(), []);
    }],

    ["getStoredTasks tolerates malformed JSON", () => {
        reset("{not-json");
        assert.deepEqual(getStoredTasks(), []);
    }],

    ["getStoredTasks tolerates a non-array payload", () => {
        reset(JSON.stringify({ taskId: "a" }));
        assert.deepEqual(getStoredTasks(), []);
    }],

    ["getStoredTasks drops entries without a string taskId", () => {
        reset(JSON.stringify([
            { taskId: "keep", tool: "merge", createdAt: Date.now() },
            { tool: "split", createdAt: Date.now() },
            null,
            { taskId: 42, tool: "split", createdAt: Date.now() },
        ]));

        const tasks = getStoredTasks();
        assert.deepEqual(tasks.map((t) => t.taskId), ["keep"]);
    }],

    ["getStoredTasks drops expired entries and rewrites storage", () => {
        const now = Date.now();
        reset(JSON.stringify([
            { taskId: "fresh", tool: "merge", createdAt: now },
            { taskId: "stale", tool: "merge", createdAt: now - MAX_AGE_MS - 1 },
            { taskId: "missing-createdAt", tool: "merge" },
        ]));

        const tasks = getStoredTasks();
        assert.deepEqual(tasks.map((t) => t.taskId), ["fresh"]);
        assert.deepEqual(readRaw().map((t) => t.taskId), ["fresh"], "expired entries are pruned from storage");
    }],

    ["getStoredTasks leaves storage untouched when every entry is valid", () => {
        const payload = JSON.stringify([{ taskId: "a", tool: "merge", createdAt: Date.now() }]);
        reset(payload);

        getStoredTasks();
        assert.equal(storage.getItem(STORAGE_KEY), payload);
    }],

    ["addStoredTask prepends the newest task", () => {
        reset();
        addStoredTask("first", "merge");
        addStoredTask("second", "split", "running");

        const tasks = getStoredTasks();
        assert.deepEqual(tasks.map((t) => t.taskId), ["second", "first"]);
        assert.equal(tasks[0].tool, "split");
        assert.equal(tasks[0].status, "running");
        assert.equal(typeof tasks[0].createdAt, "number");
    }],

    ["addStoredTask de-duplicates an existing taskId", () => {
        reset();
        addStoredTask("dup", "merge", "queued");
        addStoredTask("other", "split");
        addStoredTask("dup", "merge", "running");

        const tasks = getStoredTasks();
        assert.deepEqual(tasks.map((t) => t.taskId), ["dup", "other"]);
        assert.equal(tasks[0].status, "running");
    }],

    ["addStoredTask keeps at most 10 tasks", () => {
        reset();
        for (let i = 0; i < 14; i += 1) addStoredTask(`task-${i}`, "merge");

        const tasks = getStoredTasks();
        assert.equal(tasks.length, 10);
        assert.equal(tasks[0].taskId, "task-13", "newest task is retained");
        assert.equal(tasks[9].taskId, "task-4", "oldest tasks are evicted");
    }],

    ["addStoredTask ignores an empty taskId", () => {
        reset();
        addStoredTask("", "merge");
        assert.deepEqual(getStoredTasks(), []);
    }],

    ["updateStoredTask patches only the matching task", () => {
        reset();
        addStoredTask("a", "merge", "queued");
        addStoredTask("b", "split", "queued");

        updateStoredTask("a", { status: "failed", error: "boom" });

        const tasks = getStoredTasks();
        const a = tasks.find((t) => t.taskId === "a")!;
        const b = tasks.find((t) => t.taskId === "b")!;
        assert.equal(a.status, "failed");
        assert.equal(a.error, "boom");
        assert.equal(a.tool, "merge", "unrelated fields are preserved");
        assert.equal(b.status, "queued");
        assert.equal(b.error, undefined);
    }],

    ["updateStoredTask is a no-op for an unknown taskId", () => {
        reset();
        addStoredTask("a", "merge", "queued");

        updateStoredTask("missing", { status: "done" });

        assert.deepEqual(getStoredTasks().map((t) => t.status), ["queued"]);
    }],

    ["removeStoredTask deletes only the requested task", () => {
        reset();
        addStoredTask("a", "merge");
        addStoredTask("b", "split");

        removeStoredTask("a");

        assert.deepEqual(getStoredTasks().map((t) => t.taskId), ["b"]);
    }],

    ["removeStoredTask ignores unknown and empty ids", () => {
        reset();
        addStoredTask("a", "merge");

        removeStoredTask("missing");
        removeStoredTask("");

        assert.deepEqual(getStoredTasks().map((t) => t.taskId), ["a"]);
    }],

    ["writes survive a storage backend that throws", () => {
        reset();
        const throwing = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        };
        (globalThis as unknown as { window: unknown }).window = { localStorage: throwing };

        try {
            assert.deepEqual(getStoredTasks(), []);
            addStoredTask("a", "merge");
            updateStoredTask("a", { status: "done" });
            removeStoredTask("a");
        } finally {
            (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
        }
    }],
];

function runTests(): void {
    console.log("Running taskStorage tests...");
    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            fn();
            passed += 1;
            console.log(`  PASS  ${name}`);
        } catch (e) {
            failed += 1;
            console.error(`  FAIL  ${name}`);
            console.error(`        ${(e as Error).message}`);
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
