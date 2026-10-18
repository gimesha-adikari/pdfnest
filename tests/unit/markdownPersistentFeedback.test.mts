import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionError, type ExecutionOptions, type ExecutionResult, type ProcessingMode } from "../../lib/execution/types";
import { prepareMarkdown } from "../../lib/execution/document/markdownPolicy";
import { handleClientError } from "../../lib/errorHandler";
import type { PreviewResource } from "../../lib/preview/types";

type Shared = ReturnType<typeof import("../../app/(site)/[toolId]/ClientToolLayout").useSharedTool>;
type ComponentModule = { default: React.ComponentType<React.PropsWithChildren> };
type LayoutModule = ComponentModule & { useSharedTool: () => Shared };

// Follow the accepted mounted-component harness: execute the actual component,
// provider, notifications, API and CloudExecutor; defer only HTTP/preview/auth.
// Synthetic result bytes establish ownership, not real PDF structural validity.
const require = createRequire(import.meta.url);
function loadModule<T>(relative: string, mocks: Record<string, unknown>): T {
    const source = fs.readFileSync(path.resolve(".", relative), "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } });
    const loaded = { exports: {} };
    new Function("require", "module", "exports", outputText)(
        (name: string) => {
            if (!(name in mocks)) return require(name);
            const mock = mocks[name];
            return mock && typeof mock === "object" && Object.hasOwn(mock, "default")
                ? { ...mock, __esModule: true } : mock;
        }, loaded, loaded.exports,
    );
    return loaded.exports as T;
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

const policyCopy = "External image URLs and local file paths are not supported. Embed PNG or JPEG images directly in your Markdown document.";
const policy = { code: "MARKDOWN_RESOURCE_FORBIDDEN", message: "synthetic server detail /private/internal-file https://internal.invalid trace: secret diagnostic" };

async function main() {
    const packageName = "jsdom"; // Existing DOMPurify dependency; no installation.
    const { JSDOM } = await import(packageName);
    const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/markdown-to-pdf/workspace" });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document,
        HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const { createRoot } = await import("react-dom/client");
    const empty = () => null;
    const wrapper = ({ children }: React.PropsWithChildren) => children;
    const navigation: string[] = [];
    const router = { push: (url: string) => navigation.push(url), replace: (url: string) => navigation.push(url) };
    const tools = { getToolByHref: () => ({ title: "Markdown", accept: ".md" }), tools: [], isLoading: false };
    const framework = {
        "next/navigation": { useRouter: () => router, useParams: () => ({ toolId: "markdown-to-pdf" }) },
        "lucide-react": new Proxy({}, { get: () => empty }),
        "@/context/ToolContext": { useTools: () => tools },
    };
    const layout = loadModule<LayoutModule>("app/(site)/[toolId]/ClientToolLayout.tsx", {
        ...framework,
        "@/components/SEO/ToolFAQ": { default: empty }, "@/components/SEO/ToolSchema": { default: empty },
        "@/lib/iconResolver": { resolveIcon: () => empty },
        "@/components/pdf/BackendOnlyToolGuard": { BackendOnlyToolGuard: wrapper },
        "@/context/RepositoryAnalyzerContext": { RepositoryAnalyzerProvider: wrapper },
        "@/lib/ocrV2DevelopmentTools": { getOcrV2DevelopmentRouteConfig: () => null },
        "@/lib/editPdfEngine": { resolveEditPdfEditorEngine: () => "legacy" },
    });
    const notifications = loadModule<ComponentModule>("components/ui/GlobalNotifications.tsx", framework).default;
    // Preserve the original P5 HTTP/Blob fixture: bypass only the new admission
    // check when explicitly testing a backend response. P12 cases enable the
    // actual parsed policy so local rejection traverses the same mounted UI.
    let realPolicy = false;
    const manager = loadModule<{ ExecutionManager: { run: (options: ExecutionOptions) => Promise<ExecutionResult> } }>("lib/execution/ExecutionManager.ts", {
        "./document/markdownPolicy": { prepareMarkdown: (file: File, signal?: AbortSignal) => realPolicy ? prepareMarkdown(file, signal) : Promise.resolve() },
        "./ClientExecutor": { ClientExecutor: { isSupported: () => false, execute: () => { throw new Error("Unexpected device execution"); } } },
        "./CloudExecutor": { CloudExecutor },
        "./ExecutionSafetyGate": { ExecutionSafetyGate: { evaluate: () => ({ eligible: false, reason: "fixture" }) } },
        "./flags": { isClientExecutionEnabled: () => true },
        "./telemetry": { extractFileMetrics: () => ({ fileSizeMB: 0, fileCount: 1 }), telemetry: { record: () => {} } },
        "../notify": { notifyHybridFallback: () => {} }, "./types": { ExecutionError },
    });
    const requests: Array<{ url: string; form: FormData; config: InternalAxiosRequestConfig } & ReturnType<typeof deferred<AxiosResponse<Blob>>>> = [];
    const originalPost = axios.post;
    const originalFetch = globalThis.fetch;
    axios.post = ((url: string, form: FormData, config: InternalAxiosRequestConfig) => {
        const request = { url, form, config, ...deferred<AxiosResponse<Blob>>() };
        requests.push(request); return request.promise;
    }) as typeof axios.post;
    globalThis.fetch = async () => { throw new Error("P5 fixture forbids network fetch"); };
    let shared: Shared;
    let modeChange: (mode: ProcessingMode) => void;
    let delayAuth = false;
    let showNotifications = true;
    let delayPreview = false;
    const authCallbacks: Array<() => void> = [];
    const errors: unknown[] = [];
    const executionErrors: unknown[] = [];
    const executions: ExecutionOptions[] = [];
    let injectedFailure: Error | null = null;
    const previewRequests: Array<ReturnType<typeof deferred<PreviewResource>>> = [];
    const revoked: string[] = [];
    let previewSequence = 0;
    let fakeNow = 0;
    let timerSequence = 0;
    const timers = new Map<number, { due: number; callback: () => void }>();
    dom.window.setTimeout = (callback: () => void, delay = 0) => {
        const id = ++timerSequence; timers.set(id, { due: fakeNow + delay, callback }); return id;
    };
    dom.window.clearTimeout = (id: number) => { timers.delete(id); };
    async function advance(ms: number) {
        fakeNow += ms;
        await act(async () => {
            for (const [id, timer] of [...timers]) if (timer.due <= fakeNow) { timers.delete(id); timer.callback(); }
        });
    }
    const actionButton = loadModule<ComponentModule>("components/pdf/PdfActionButton.tsx", {}).default;
    const workspace = loadModule<ComponentModule>("components/tools/MarkdownToPdfWorkspace.tsx", {
        ...framework,
        "@/lib/execution/types": { ExecutionError },
        "@/app/(site)/[toolId]/ClientToolLayout": layout,
        "@/lib/errorHandler": { handleClientError: (error: unknown) => { errors.push(error); return handleClientError(error); } },
        "@/context/AuthContext": { useAuth: () => ({ requireAuth: (action: () => void) => {
            if (delayAuth) authCallbacks.push(action); else action();
        } }) },
        "@/components/pdf/PdfFileInfo": { default: ({ file, onClear }: { file: File; onClear: () => void }) => React.createElement("button", { onClick: onClear }, file.name) },
        "@/components/pdf/PdfActionButton": { default: actionButton },
        "@/components/pdf/PdfToolHero": { default: empty },
        "@/lib/execution/ExecutionManager": { ExecutionManager: { run: (options: ExecutionOptions) => {
            executions.push(options);
            if (injectedFailure) return Promise.reject(injectedFailure);
            return manager.ExecutionManager.run(options).catch(error => { executionErrors.push(error); throw error; });
        } } },
        "@/components/shared/ProcessingModeSelector": { ProcessingModeSelector: ({ onChange }: { onChange: typeof modeChange }) => { modeChange = onChange; return null; } },
        "@/lib/preview/ClientPdfRenderer": { ClientPdfRenderer: class {
            render() {
                if (delayPreview) { const request = deferred<PreviewResource>(); previewRequests.push(request); return request.promise; }
                const url = `blob:preview/${++previewSequence}`;
                return Promise.resolve({ type: "image-url", url, revoke: () => revoked.push(url) });
            }
        } },
    }).default;
    function Probe() { shared = layout.useSharedTool(); return null; }
    let root: ReturnType<typeof createRoot>;
    let screen = workspace;
    async function render() {
        await act(async () => root.render(React.createElement(layout.default, null,
            React.createElement(Probe), showNotifications ? React.createElement(notifications) : null, React.createElement(screen))));
    }
    async function start() {
        navigation.length = requests.length = errors.length = executionErrors.length = authCallbacks.length = executions.length = previewRequests.length = revoked.length = 0;
        delayAuth = delayPreview = realPolicy = false; injectedFailure = null;
        showNotifications = true; fakeNow = 0; timers.clear();
        screen = workspace; root = createRoot(document.getElementById("root")!); await render();
    }
    async function file(value: File) { await act(async () => shared.setFile(value)); }
    const A = new File(["# Valid A"], "A.md");
    const B = new File(["![Local image](../image.png)"], "B.md");
    const C = new File(["![Remote image](https://example.invalid/image.png)"], "C.md");
    const save = () => Array.from(document.querySelectorAll("button")).find(button => /Save Markdown|Rendering Vector/.test(button.textContent || ""))!;
    async function clickSave() { await act(async () => save().click()); }
    async function remove() { await act(async () => Array.from(document.querySelectorAll("button")).find(button => button.textContent === shared.file?.name)!.click()); }
    const region = () => document.querySelector('[aria-label="Markdown conversion status"]');
    const inlineText = () => region()?.textContent || "";
    const toasts = () => document.querySelectorAll('[role="status"][aria-live="assertive"]');
    function assertPolicy() {
        assert.ok(region(), "workspace has a named conversion-status region");
        assert.match(inlineText(), /Markdown resource blocked/);
        assert.ok(inlineText().includes(policyCopy));
        assert.doesNotMatch(inlineText(), /\/private|internal\.invalid|diagnostic|stack|subscription|upgrade|credits|billing/i);
        const status = region()!.querySelector('[role="status"]');
        assert.equal(status?.getAttribute("aria-live"), "polite");
        assert.equal(status?.getAttribute("aria-atomic"), "true");
        assert.equal(region()!.querySelector('[role="alert"],[aria-live="assertive"]'), null);
        assert.equal(save().disabled, true);
        assert.equal(shared.downloadData, null);
    }
    function assertPending() {
        assert.ok(region(), "pending status has the same named region");
        assert.equal(region()!.querySelector('[role="status"]')?.getAttribute("aria-live"), "polite");
        assert.match(inlineText(), /Formatting Vector Markdown Layout|Rendering|Converting/i);
        assert.doesNotMatch(inlineText(), /Markdown resource blocked|Markdown conversion failed/);
        assert.equal(save().disabled, true);
    }
    async function rejectHTTP(index: number, payload: unknown = policy) {
        const request = requests[index];
        const body = payload instanceof Blob ? payload : new Blob([JSON.stringify(payload)], { type: "application/json" });
        const error = new axios.AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", request.config, null,
            { status: 400, statusText: "Bad Request", data: body, headers: { "content-type": "application/json" }, config: request.config });
        await act(async () => request.reject(error));
    }
    async function succeed(index: number, bytes = "PDF:A") {
        await act(async () => requests[index].resolve({ status: 200, statusText: "OK", data: new Blob([bytes], { type: "application/pdf" }),
            headers: { "content-type": "application/pdf" }, config: requests[index].config }));
    }
    async function change(kind: "file" | "mode" | "paper" | "margin") {
        if (kind === "file") return file(A);
        if (kind === "mode") return act(async () => modeChange("cloud"));
        await act(async () => {
            const input = document.querySelector(kind === "paper" ? "select" : "input") as HTMLInputElement;
            const prototype = kind === "paper" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, kind === "paper" ? "letter" : "0.8");
            input.dispatchEvent(new dom.window.Event(kind === "paper" ? "change" : "input", { bubbles: true }));
        });
    }
    const tests: Array<[string, () => Promise<void>]> = [
        ["valid A reaches ready preview with matching output bytes and filename in one execution", async () => {
            await file(A); assertPending(); await succeed(0);
            assert.match(inlineText(), /PDF preview ready/);
            assert.equal(save().disabled, false); await clickSave();
            assert.equal(await shared.downloadData!.blob.text(), "PDF:A");
            assert.equal(shared.downloadData!.fileName, "converted_A.pdf");
            assert.deepEqual(navigation, ["/markdown-to-pdf/download"]); assert.equal(executions.length, 1);
        }],
        ["actual Axios JSON-Blob 400 persists safely after the policy toast expires at 7000ms", async () => {
            await file(B); assert.equal(requests[0].config.responseType, "blob");
            assert.equal(await (requests[0].form.get("file") as File).text(), "![Local image](../image.png)");
            await rejectHTTP(0); assertPolicy(); assert.equal(toasts().length, 1); assert.equal(errors.length, 1);
            const error = executionErrors[0] as ExecutionError & { originalError: { backend: { code: string } } };
            assert.equal(error.code, "CLOUD_FAILURE"); assert.equal(error.status, 400); assert.equal(error.originalError.backend.code, policy.code);
            assert.equal(error.billing, undefined);
            assert.doesNotMatch(document.body.textContent!, /\/private|internal\.invalid|diagnostic/);
            await advance(6999); assertPolicy(); assert.equal(toasts().length, 1);
            await advance(1); assertPolicy(); assert.equal(toasts().length, 0);
            assert.equal(executions.length, 1, "failure and timer renders must not repeat conversion");
        }],
        ["missing global notification handler cannot hide the persistent failure", async () => {
            showNotifications = false; await render(); await file(B); await rejectHTTP(0);
            assertPolicy(); assert.equal(toasts().length, 0); await advance(7001); assertPolicy();
            showNotifications = true; await render(); assertPolicy(); assert.equal(toasts().length, 0);
            assert.equal(executions.length, 1);
        }],
        ["notification-provider unmount cannot remove the workspace explanation", async () => {
            await file(B); await rejectHTTP(0); showNotifications = false; await render();
            assertPolicy(); assert.equal(toasts().length, 0); assert.equal(timers.size, 0);
        }],
        ["valid A then forbidden relative B discards all A bytes while retaining B's error", async () => {
            await file(A); await succeed(0); await clickSave(); assert.equal(await shared.downloadData!.blob.text(), "PDF:A"); navigation.length = 0;
            await file(B); assertPending(); assert.equal(shared.downloadData, null); await rejectHTTP(1); await advance(7000); assertPolicy();
            assert.equal(document.querySelector("img"), null); await clickSave(); assert.deepEqual(navigation, []);
        }],
        ["forbidden remote C has persistent policy feedback without billing or successful output", async () => {
            await file(C); await rejectHTTP(0); assertPolicy();
            assert.doesNotMatch(document.body.textContent!, /Billing|upgrade|subscription|credits|Create a free account/);
            await clickSave(); assert.deepEqual(navigation, []); assert.equal(executions.length, 1);
        }],
        ["pending processing beyond seven seconds is distinct from a terminal failure", async () => {
            await file(B); await advance(7001); assertPending(); assert.equal(errors.length, 0);
            await rejectHTTP(0); assertPolicy();
            assert.doesNotMatch(save().textContent!, /Rendering Vector/);
        }],
        ...(["file", "mode", "paper", "margin"] as const).map(kind => [
            `${kind} change immediately clears prior error and starts exactly one replacement generation`, async () => {
                await file(B); await rejectHTTP(0); assertPolicy(); await change(kind); assertPending();
                assert.equal(executions.length, 2); assert.equal(requests[0].config.signal?.aborted, true);
                assert.equal(shared.downloadData, null); await succeed(1, "PDF:replacement");
                assert.doesNotMatch(inlineText(), /Markdown resource blocked/); assert.match(inlineText(), /PDF preview ready/);
                assert.equal(save().disabled, false); assert.equal(executions.length, 2);
            },
        ] as [string, () => Promise<void>]),
        ["late obsolete error cannot replace current pending processing", async () => {
            await file(A); await file(B); await rejectHTTP(0); assertPending(); assert.equal(errors.length, 0);
            await rejectHTTP(1); assertPolicy(); assert.equal(errors.length, 1);
        }],
        ["late obsolete success cannot replace the current persistent policy failure", async () => {
            await file(A); await file(B); await rejectHTTP(1); await succeed(0); assertPolicy();
            assert.equal(document.querySelector("img"), null); await clickSave(); assert.deepEqual(navigation, []);
        }],
        ["late obsolete error cannot replace a newer successful preview", async () => {
            await file(B); await file(A); await succeed(1); await rejectHTTP(0);
            assert.match(inlineText(), /PDF preview ready/); assert.doesNotMatch(inlineText(), /blocked|failed/);
            assert.equal(errors.length, 0); assert.equal(save().disabled, false);
        }],
        ["supersession during Blob decoding cannot publish the old failure", async () => {
            await file(A); const reading = deferred<string>(); const body = new Blob([JSON.stringify(policy)], { type: "application/json" });
            body.text = () => reading.promise; await rejectHTTP(0, body); assert.equal(errors.length, 0);
            await file(B); await act(async () => reading.resolve(JSON.stringify(policy))); assertPending(); assert.equal(errors.length, 0);
            await rejectHTTP(1); assertPolicy();
        }],
        ["Remove clears failure and reupload starts fresh even with the same File object", async () => {
            await file(B); await rejectHTTP(0); assertPolicy(); await remove();
            assert.equal(shared.file, null); assert.equal(region(), null); assert.equal(shared.downloadData, null);
            assert.deepEqual(navigation, ["/markdown-to-pdf"]); await file(B); assertPending();
            await rejectHTTP(1); assertPolicy(); assert.equal(executions.length, 2);
        }],
        ["Remove aborts pending work and suppresses its late policy failure", async () => {
            await file(B); await remove(); assert.equal(requests[0].config.signal?.aborted, true);
            await rejectHTTP(0); assert.equal(region(), null); assert.equal(errors.length, 0);
            await file(A); assertPending(); await succeed(1); assert.match(inlineText(), /PDF preview ready/);
        }],
        ["unmount suppresses pending errors and remount starts a new generation", async () => {
            await file(B); screen = empty; await render(); assert.equal(requests[0].config.signal?.aborted, true);
            await rejectHTTP(0); assert.equal(errors.length, 0); assert.equal(region(), null);
            screen = workspace; await render(); assertPending(); await rejectHTTP(1); assertPolicy();
        }],
        ["transport cancellation cannot restore old policy feedback", async () => {
            await file(B); await rejectHTTP(0); await file(A);
            await act(async () => requests[1].reject(new axios.CanceledError("synthetic cancellation")));
            assert.doesNotMatch(inlineText(), /Markdown resource blocked/);
            assert.match(inlineText(), /Markdown conversion cancel[el]ed|Markdown conversion canceled/);
            assert.equal(save().disabled, true);
            assert.equal(shared.downloadData, null);
        }],
        ["delayed authentication cannot publish A after B's persistent failure", async () => {
            await file(A); await succeed(0); delayAuth = true; await clickSave();
            await file(B); await rejectHTTP(1); await act(async () => authCallbacks[0]()); assertPolicy();
            assert.deepEqual(navigation, []); assert.equal(shared.downloadData, null);
        }],
        ["late preview is revoked and cannot erase the newer failure", async () => {
            delayPreview = true; await file(A); await succeed(0); await file(B); await rejectHTTP(1);
            await act(async () => previewRequests[0].resolve({ type: "image-url", url: "blob:obsolete", revoke: () => revoked.push("blob:obsolete") }));
            assertPolicy(); assert.ok(revoked.includes("blob:obsolete")); assert.equal(document.querySelector("img"), null);
        }],
        ["generic conversion failures retain static safe feedback without raw diagnostics", async () => {
            await file(A); await rejectHTTP(0, { code: "MARKDOWN_CONVERSION_FAILED", message: policy.message });
            assert.match(inlineText(), /Markdown conversion failed/);
            assert.doesNotMatch(inlineText(), /\/private|internal\.invalid|diagnostic|stack/);
            await advance(7000); assert.match(inlineText(), /Markdown conversion failed/);
            assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
        }],
        ["preview failure retains safe feedback and never publishes the received bytes", async () => {
            delayPreview = true; await file(A); await succeed(0);
            await act(async () => previewRequests[0].reject(new Error(policy.message)));
            assert.match(inlineText(), /Markdown conversion failed/); assert.doesNotMatch(inlineText(), /\/private|diagnostic/);
            await clickSave(); assert.equal(shared.downloadData, null); assert.deepEqual(navigation, []);
        }],
        ["A to B to A keeps the first A failure obsolete", async () => {
            await file(A); await file(B); await file(A); await rejectHTTP(0); await rejectHTTP(1); assertPending();
            assert.equal(errors.length, 0); await rejectHTTP(2); assertPolicy(); assert.equal(errors.length, 1);
        }],
        ...(["auto", "device", "cloud"] as const).flatMap(mode => ([B, C].map(input => [
            `parsed local policy rejects ${input.name} in ${mode} before any HTTP or fallback`, async () => {
                realPolicy = true;
                await act(async () => modeChange(mode));
                await file(input); assertPolicy();
                assert.equal(requests.length, 0, "policy admission precedes every venue route");
                assert.equal(executions.length, 1);
                assert.equal(errors.length, 1);
                assert.ok(executionErrors[0] instanceof ExecutionError);
                assert.equal((executionErrors[0] as ExecutionError).code, "MARKDOWN_RESOURCE_FORBIDDEN");
                assert.equal(toasts().length, 1);
                await advance(7000); assertPolicy(); assert.equal(toasts().length, 0);
                await clickSave(); assert.deepEqual(navigation, []);
                assert.equal(executions.length, 1, "inline error and toast expiry must not execute again");
            },
        ] as [string, () => Promise<void>]))),
        ["real local policy persists without a notification handler and never publishes A's result", async () => {
            realPolicy = true; await file(A); await succeed(0); await clickSave();
            assert.equal(await shared.downloadData!.blob.text(), "PDF:A"); navigation.length = 0;
            showNotifications = false; await render(); await file(B); assertPolicy();
            assert.equal(requests.length, 1, "forbidden B never adds an HTTP request");
            assert.equal(document.querySelector("img"), null);
            await advance(8000); assertPolicy(); assert.equal(toasts().length, 0);
            await clickSave(); assert.deepEqual(navigation, []);
        }],
        ["new valid input clears actual local policy failure and reaches a current downloadable result", async () => {
            realPolicy = true; await file(C); assertPolicy(); await file(A); assertPending();
            await succeed(0, "PDF:current-valid"); assert.match(inlineText(), /PDF preview ready/);
            assert.doesNotMatch(inlineText(), /Markdown resource blocked/); await clickSave();
            assert.equal(await shared.downloadData!.blob.text(), "PDF:current-valid");
            assert.equal(shared.downloadData!.fileName, "converted_A.pdf");
            assert.equal(requests.length, 1); assert.equal(executions.length, 2);
        }],
        ["Remove and reupload start fresh parsed-policy generations without retaining successful bytes", async () => {
            realPolicy = true; await file(B); assertPolicy(); await remove();
            assert.equal(region(), null); assert.equal(shared.downloadData, null);
            assert.deepEqual(navigation, ["/markdown-to-pdf"]);
            await file(A); assertPending(); await succeed(0); assert.equal(save().disabled, false);
            await remove(); await file(B); assertPolicy(); assert.equal(document.querySelector("img"), null);
            assert.equal(requests.length, 1); assert.equal(executions.length, 3);
        }],
        ["superseded Markdown source read cannot publish output or replace a current local policy error", async () => {
            realPolicy = true; const reading = deferred<string>();
            const slow = new File(["# Slow prior file"], "slow.md"); slow.text = () => reading.promise;
            await file(slow); assertPending(); await file(B); assertPolicy();
            await act(async () => reading.resolve("# Slow prior file")); assertPolicy();
            assert.equal(executions[0].signal?.aborted, true);
            assert.equal(requests.length, 0); assert.equal(errors.length, 1);
        }],
        ["unmount cancels the actual Markdown source read and cannot publish a late failure", async () => {
            realPolicy = true; const reading = deferred<string>();
            const slow = new File(["# Slow file"], "slow.md"); slow.text = () => reading.promise;
            await file(slow); assertPending(); screen = empty; await render();
            assert.equal(executions[0].signal?.aborted, true);
            await act(async () => reading.resolve("![x](../image.png)"));
            assert.equal(region(), null); assert.equal(errors.length, 0); assert.equal(requests.length, 0);
        }],
        ["delayed authentication cannot publish A after a real local policy rejection", async () => {
            realPolicy = true; await file(A); await succeed(0); delayAuth = true; await clickSave();
            await file(B); assertPolicy(); await act(async () => authCallbacks[0]());
            assertPolicy(); assert.deepEqual(navigation, []); assert.equal(requests.length, 1);
        }],
        ["an arbitrary top-level policy code cannot impersonate a typed trusted local failure", async () => {
            injectedFailure = Object.assign(new Error(policy.message), { code: policy.code });
            await file(A);
            assert.match(inlineText(), /Markdown conversion failed/);
            assert.doesNotMatch(inlineText(), /Markdown resource blocked|\/private|internal\.invalid|diagnostic/);
            assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
            assert.equal(requests.length, 0);
        }],
    ];
    let failed = 0;
    const originalConsoleError = console.error;
    console.error = (...args) => { if (!String(args[0]).startsWith("[MarkdownToPdfWorkspace]")) originalConsoleError(...args); };
    try {
        for (const [title, test] of tests) {
            await start();
            try { await test(); console.log(`PASS ${title}`); }
            catch (error) { failed++; console.log(`FAIL ${title}: ${(error as Error).message}`); }
            finally { await act(async () => root.unmount()); }
        }
    } finally {
        console.error = originalConsoleError; axios.post = originalPost; globalThis.fetch = originalFetch; dom.window.close();
    }
    console.log(`Markdown persistent feedback: ${tests.length - failed}/${tests.length} passed; ${failed} failed; 0 skipped.`);
    process.exitCode = failed ? 1 : 0;
}
void main();
