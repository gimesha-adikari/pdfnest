import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import axios, { type InternalAxiosRequestConfig } from "axios";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { handleClientError } from "../../lib/errorHandler";
import { ExecutionError, type ExecutionOptions, type ExecutionResult } from "../../lib/execution/types";
import type { PreviewResource } from "../../lib/preview/types";
type Shared = ReturnType<typeof import("../../app/(site)/[toolId]/ClientToolLayout").useSharedTool>;
type ComponentModule = { default: React.ComponentType<React.PropsWithChildren>; useSharedTool: () => Shared };

// Run the actual TSX components, replacing only framework/services and visual
// wrappers. Deferred executions deliberately ignore abort to test late responses.
const require = createRequire(import.meta.url);
function loadComponent(relative: string, mocks: Record<string, unknown>) {
    const source = fs.readFileSync(path.resolve(process.env.CODE_OWNERSHIP_SOURCE_ROOT || ".", relative), "utf8");
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
    return loaded.exports as ComponentModule;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

async function main() {
    const name = "jsdom"; // Installed by the existing DOMPurify dependency.
    const { JSDOM } = await import(name);
    const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/code-to-pdf/workspace" });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document,
        HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const { createRoot } = await import("react-dom/client");
    const empty = () => null;
    const wrapper = ({ children }: React.PropsWithChildren) => children;
    const navigation: string[] = [];
    const router = { push: (url: string) => navigation.push(url), replace: (url: string) => navigation.push(url) };
    const tools = { getToolByHref: () => ({ title: "Code", accept: ".md" }), tools: [], isLoading: false };
    let currentToolId = "code-to-pdf";
    const framework = {
        "next/navigation": { useRouter: () => router, useParams: () => ({ toolId: currentToolId }) },
        "lucide-react": new Proxy({}, { get: () => empty }),
        "@/context/ToolContext": { useTools: () => tools },
    };
    const layout = loadComponent("app/(site)/[toolId]/ClientToolLayout.tsx", {
        ...framework,
        "@/components/SEO/ToolFAQ": { default: empty }, "@/components/SEO/ToolSchema": { default: empty },
        "@/lib/iconResolver": { resolveIcon: () => empty },
        "@/components/pdf/BackendOnlyToolGuard": { BackendOnlyToolGuard: wrapper },
        "@/context/RepositoryAnalyzerContext": { RepositoryAnalyzerProvider: wrapper },
        "@/lib/ocrV2DevelopmentTools": { getOcrV2DevelopmentRouteConfig: () => null },
        "@/lib/editPdfEngine": { resolveEditPdfEditorEngine: () => "legacy" },
    });
    const sharedImport = { "@/app/(site)/[toolId]/ClientToolLayout": layout };
    const notifications = loadComponent("components/ui/GlobalNotifications.tsx", framework).default;
    let shared: Shared;
    let modeChange: (mode: "auto" | "device" | "cloud") => void;
    let delayAuth = false;
    const authCallbacks: Array<() => void> = [];
    const requests: Array<{ options: ExecutionOptions } & ReturnType<typeof deferred<ExecutionResult>>> = [];
    const errors: unknown[] = [];
    const revoked: string[] = [];
    const previewRequests: Array<ReturnType<typeof deferred<PreviewResource>>> = [];
    const previewSignals: AbortSignal[] = [];
    let delayPreview = false;
    let previewSequence = 0;
    const fileInfo = loadComponent("components/pdf/PdfFileInfo.tsx", {}).default;
    const actionButton = loadComponent("components/pdf/PdfActionButton.tsx", {}).default;
    const workspace = loadComponent("components/tools/CodeToPdfWorkspace.tsx", {
        ...framework, ...sharedImport,
        "@/lib/execution/types": { ExecutionError },
        "@/lib/notify": { notify: empty },
        "@/lib/errorHandler": { handleClientError: (error: unknown) => { errors.push(error); handleClientError(error); } },
        "@/context/AuthContext": { useAuth: () => ({ requireAuth: (action: () => void) => {
            if (delayAuth) authCallbacks.push(action); else action();
        } }) },
        "@/components/pdf/PdfFileInfo": { default: fileInfo },
        "@/components/pdf/PdfActionButton": { default: actionButton },
        "@/components/pdf/PdfToolHero": { default: empty },
        "@/lib/execution/ExecutionManager": { ExecutionManager: { run: (options: ExecutionOptions) => {
            const request = { options, ...deferred<ExecutionResult>() }; requests.push(request); return request.promise;
        } } },
        "@/components/shared/ProcessingModeSelector": { ProcessingModeSelector: ({ onChange }: { onChange: typeof modeChange }) => { modeChange = onChange; return null; } },
        "@/lib/preview/ClientPdfRenderer": { ClientPdfRenderer: class {
            render(_request: unknown, signal: AbortSignal) {
                previewSignals.push(signal);
                const resource: PreviewResource = { type: "image-url", url: `blob:preview/${++previewSequence}`, revoke() { revoked.push(this.url!); } };
                if (delayPreview) { const request = deferred<PreviewResource>(); previewRequests.push(request); return request.promise; }
                return Promise.resolve(resource);
            }
        } },
    }).default;
    const download = loadComponent("app/(site)/[toolId]/download/page.tsx", {
        ...framework, ...sharedImport,
        "@/context/WorkflowContext": { useWorkflow: () => ({ setPendingTransfer: empty, clearTransfer: empty }) },
        "@/components/pdf/PdfToolLayout": { default: wrapper },
        "@/lib/toolSuggestions": { getSuggestedNextTools: () => [] },
        "@/components/tools/RepositoryAnalyzerDownload": { default: empty },
    }).default;
    const blobs: Blob[] = [];
    const downloadedNames: string[] = [];
    dom.window.URL.createObjectURL = (blob: Blob) => { blobs.push(blob); return "blob:download"; };
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = function () { downloadedNames.push(this.download); };
    function Probe() { shared = layout.useSharedTool(); return null; }
    let root: ReturnType<typeof createRoot>;
    let screen = workspace;
    let showNotifications = true;
    async function render() {
        await act(async () => root.render(React.createElement(layout.default, null,
            React.createElement(Probe), showNotifications ? React.createElement(notifications) : null, React.createElement(screen))));
    }
    async function start() {
        navigation.length = requests.length = errors.length = revoked.length = authCallbacks.length = previewRequests.length = blobs.length = downloadedNames.length = 0;
        previewSignals.length = 0;
        delayAuth = delayPreview = false; currentToolId = "code-to-pdf";
        screen = workspace; showNotifications = true;
        root = createRoot(document.getElementById("root")!);
        await render();
    }
    async function file(value: File) { await act(async () => shared.setFile(value)); }
    const A = new File(["const a = 1;"], "A.ts");
    const B = new File(["const b = 2;"], "B.ts");
    const save = () => Array.from(document.querySelectorAll("button")).find(button => /Save Code|Rendering Vector/.test(button.textContent || ""))!;
    async function clickSave() { await act(async () => save().click()); }
    async function succeed(index: number, value = "A") {
        await act(async () => requests[index].resolve({ blob: new Blob([`PDF:${value}`], { type: "application/pdf" }),
            fileName: `${value}.pdf`, executionMode: "cloud", fallbackOccurred: false }));
    }
    async function fail(index: number) {
        await act(async () => requests[index].reject(Object.assign(new Error("synthetic diagnostic /private/secret"),
            { status: 413, originalError: { status: 413, backend: { code: "CODE_SOURCE_TOO_LARGE", message: "/private/secret" } } })));
    }
    async function changeLayout(kind: "paper" | "top" | "bottom" | "left" | "right") {
        await act(async () => {
            const input = (kind === "paper" ? document.querySelector("select") : document.querySelectorAll("input")[["top", "bottom", "left", "right"].indexOf(kind)]) as HTMLInputElement;
            const prototype = kind === "paper" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, kind === "paper" ? "letter" : "0.8");
            input.dispatchEvent(new dom.window.Event(kind === "paper" ? "change" : "input", { bubbles: true }));
        });
    }
    const tests: Array<[string, () => Promise<void>]> = [
        ["a oversized B cannot publish A bytes as a successful conversion", async () => {
            await file(A); await succeed(0); await file(B); await fail(1);
            const saveEnabled = !save().disabled;
            await clickSave();
            if (process.env.CODE_OWNERSHIP_REPRODUCTION_TRACE) console.log(JSON.stringify({
                selectedFile: shared.file?.name, saveEnabled,
                previewVisible: Boolean(document.querySelector("img")),
                offeredFileName: shared.downloadData?.fileName,
                offeredBytes: await shared.downloadData?.blob.text(),
                successNavigation: navigation, errorCount: errors.length,
            }));
            assert.equal(saveEnabled, false);
            assert.deepEqual(navigation, []);
            assert.equal(shared.downloadData, null);
        }],
        ["valid A then oversized B clears output, preview and shared download; no false success", async () => {
            await file(A); await succeed(0); await clickSave();
            assert.equal(await shared.downloadData!.blob.text(), "PDF:A");
            navigation.length = 0;
            await file(B); await fail(1);
            assert.equal(save().disabled, true);
            assert.equal(shared.downloadData, null);
            assert.equal(document.querySelector("img"), null);
            await clickSave(); assert.deepEqual(navigation, []); assert.equal(errors.length, 1);
            assert.match(document.body.textContent!, /Code source too large/);
            assert.doesNotMatch(document.body.textContent!, /Billing|upgrade|subscription|credits|Create a free account/);
        }],
        ["pending A cannot overwrite B after B fails", async () => {
            await file(A); await file(B); await fail(1); await succeed(0);
            assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
            assert.equal(document.querySelector("img"), null); assert.equal(errors.length, 1);
            assert.equal(requests[0].options.signal?.aborted, true);
        }],
        ["late A failure cannot invalidate successful B or display an obsolete error", async () => {
            await file(A); await file(B); await succeed(1, "B"); await fail(0);
            assert.equal(errors.length, 0); assert.equal(save().disabled, false);
            await clickSave(); assert.equal(await shared.downloadData!.blob.text(), "PDF:B");
            assert.equal(shared.downloadData!.fileName, "B.pdf");
        }],
        ...(["paper", "top", "bottom", "left", "right", "mode"] as const).map(kind => [
            `${kind} change invalidates output and superseded work`, async () => {
                await file(A); await succeed(0); await clickSave(); navigation.length = 0;
                if (kind === "mode") await act(async () => modeChange("cloud")); else await changeLayout(kind);
                assert.equal(requests.length, 2, "one execution per input/configuration");
                assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
                assert.equal(requests[1].options.mode, kind === "mode" ? "cloud" : "auto");
                if (kind === "paper") assert.equal(requests[1].options.params!.paperSize, "letter");
                if (kind !== "paper" && kind !== "mode") assert.equal(requests[1].options.params![`margin${kind[0].toUpperCase()}${kind.slice(1)}`], 0.8);
                await fail(1); await clickSave(); assert.deepEqual(navigation, []);
            },
        ] as [string, () => Promise<void>]),
        ["authentication continuation rechecks file ownership", async () => {
            await file(A); await succeed(0); delayAuth = true; await clickSave();
            await file(B); await fail(1); await act(async () => authCallbacks[0]());
            assert.deepEqual(navigation, []); assert.equal(shared.downloadData, null);
        }],
        ["existing download disappears as soon as a new input begins", async () => {
            await file(A); await succeed(0); await clickSave(); screen = download; await render();
            assert.match(document.body.textContent!, /Task completed successfully/);
            await file(B);
            assert.doesNotMatch(document.body.textContent!, /Task completed successfully|Download File/);
            assert.equal(shared.downloadData, null);
        }],
        ["unowned Code download data cannot display success", async () => {
            await file(B); await fail(0);
            await act(async () => shared.setDownloadData({ blob: new Blob(["old"]), fileName: "B.pdf" }));
            screen = download; await render();
            assert.doesNotMatch(document.body.textContent!, /Task completed successfully|Download File/);
        }],
        ["late preview is released and cannot resurrect failed output", async () => {
            delayPreview = true; await file(A); await succeed(0); await file(B); await fail(1);
            await act(async () => previewRequests[0].resolve({ type: "image-url", url: "blob:late", revoke: () => revoked.push("blob:late") }));
            assert.equal(save().disabled, true); assert.equal(document.querySelector("img"), null);
            assert.ok(revoked.includes("blob:late"));
        }],
        ["valid output is not published until preview completes, and uses the same abort signal", async () => {
            delayPreview = true; await file(A); await succeed(0);
            assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
            assert.equal(previewSignals[0], requests[0].options.signal);
            await act(async () => previewRequests[0].resolve({ type: "image-url", url: "blob:ready", revoke: () => revoked.push("blob:ready") }));
            assert.equal(save().disabled, false);
            await clickSave(); screen = download; await render();
            assert.match(document.body.textContent!, /Task completed successfully/);
            const button = Array.from(document.querySelectorAll("button")).find(button => /Download File/.test(button.textContent || ""))!;
            await act(async () => button.click());
            assert.equal(await blobs.at(-1)!.text(), "PDF:A");
            assert.equal(downloadedNames.at(-1), "A.pdf");
            assert.ok(revoked.includes("blob:ready"));
        }],
        ["other tools keep their existing download contract", async () => {
            currentToolId = "rotate"; screen = download; await render();
            await act(async () => shared.setDownloadData({ blob: new Blob(["other"]), fileName: "other.pdf" }));
            assert.match(document.body.textContent!, /Task completed successfully/);
        }],
        ["older response cannot end the latest loading state", async () => {
            await file(A); await file(B); await succeed(0);
            assert.equal(save().disabled, true); assert.equal(document.querySelector("img"), null);
            await succeed(1, "B"); await clickSave();
            assert.equal(await shared.downloadData!.blob.text(), "PDF:B");
        }],
        ...(["paper", "top", "bottom", "left", "right", "mode"] as const).map(kind => [
            `${kind} change during pending execution rejects its late result`, async () => {
                await file(A);
                if (kind === "mode") await act(async () => modeChange("cloud")); else await changeLayout(kind);
                await fail(1); await succeed(0);
                assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
                assert.equal(requests[0].options.signal?.aborted, true);
                assert.equal(document.querySelector("img"), null);
            },
        ] as [string, () => Promise<void>]),
        ...(["paper", "top", "bottom", "left", "right", "mode"] as const).map(kind => [
            `authentication continuation rechecks ${kind} identity`, async () => {
                await file(A); await succeed(0); delayAuth = true; await clickSave();
                if (kind === "mode") await act(async () => modeChange("cloud")); else await changeLayout(kind);
                await fail(1); await act(async () => authCallbacks[0]());
                assert.deepEqual(navigation, []); assert.equal(shared.downloadData, null);
            },
        ] as [string, () => Promise<void>]),
        ["different uploads with identical filenames and metadata stay distinct", async () => {
            await file(new File(["#A"], "same.md", { lastModified: 1 }));
            await file(new File(["#B"], "same.md", { lastModified: 1 }));
            await fail(1); await succeed(0); assert.equal(save().disabled, true);
        }],
        ["returning to the same file cannot revive an earlier generation", async () => {
            await file(A); await file(B); await file(A); await fail(2); await succeed(0);
            assert.equal(save().disabled, true); assert.equal(document.querySelector("img"), null);
        }],
        ["preview failure clears PDF output instead of leaving Save enabled", async () => {
            delayPreview = true; await file(A); await succeed(0);
            await act(async () => previewRequests[0].reject(new Error("PDF preview failed")));
            assert.equal(save().disabled, true); await clickSave(); assert.deepEqual(navigation, []);
        }],
        ["an otherwise matching download with an obsolete generation is denied", async () => {
            await file(A); await succeed(0); await clickSave(); const old = shared.downloadData;
            await changeLayout("paper"); await fail(1);
            await act(async () => shared.setDownloadData(old)); screen = download; await render();
            assert.doesNotMatch(document.body.textContent!, /Task completed successfully|Download File/);
        }],
        ["unmount aborts execution and invalidates delayed auth actions", async () => {
            await file(A); await succeed(0); delayAuth = true; await clickSave();
            screen = empty; await render(); await act(async () => authCallbacks[0]());
            assert.equal(requests[0].options.signal?.aborted, true);
            assert.deepEqual(navigation, []); assert.equal(revoked.length, 1);
        }],
        ["a preview without a URL fails closed and releases its resource", async () => {
            delayPreview = true; await file(A); await succeed(0);
            await act(async () => previewRequests[0].resolve({ type: "image-url", revoke: () => revoked.push("empty") }));
            assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
            assert.match(document.body.textContent!, /Code conversion failed/); assert.ok(revoked.includes("empty"));
        }],
        ["only the deployed 413 and code pair selects oversized-input copy", async () => {
            await file(A); await act(async () => requests[0].reject(Object.assign(new Error("secret"),
                {status: 500, backend: {code: "CODE_SOURCE_TOO_LARGE", message: "secret"}})));
            assert.match(document.querySelector('[aria-label="Code conversion status"]')!.textContent!, /Code conversion failed/);
            assert.doesNotMatch(document.body.textContent!, /16 MiB|secret/);
        }],
        ["Remove during pending conversion aborts and ignores its late success", async () => {
            await file(A);
            await act(async () => Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Remove")!.click());
            await succeed(0);
            assert.equal(requests[0].options.signal?.aborted, true); assert.equal(shared.downloadData, null);
            assert.equal(shared.conversionGeneration, null); assert.equal(document.querySelector("img"), null);
        }],
        ["deployed HTTP 413 JSON-Blob travels through the real API and CloudExecutor", async () => {
            await act(async () => modeChange("cloud")); await file(B);
            // Source modules may load Axios through CommonJS while this .mts test
            // imports it through ESM. Patch both entry points to keep transport local.
            const commonJsAxios = require("axios") as typeof axios;
            const originalPost = axios.post;
            const originalCommonJsPost = commonJsAxios.post;
            const originalFetch = globalThis.fetch;
            globalThis.fetch = async () => { throw new Error("Fixture forbids network"); };
            const mockPost = (async (_url: string, form: FormData, config: InternalAxiosRequestConfig) => {
                assert.equal((form.get("file") as File).name, B.name);
                throw new axios.AxiosError("Request failed with status code 413", "ERR_BAD_REQUEST", config, null,
                    { status: 413, statusText: "Content Too Large", headers: { "content-type": "application/json" }, config,
                      data: new Blob([JSON.stringify({ code: "CODE_SOURCE_TOO_LARGE", message: "synthetic /private/secret" })], {type: "application/json"}) });
            }) as typeof axios.post;
            axios.post = mockPost;
            commonJsAxios.post = mockPost;
            try {
                let caught: unknown;
                try { await CloudExecutor.execute(requests[0].options); } catch (error) { caught = error; }
                assert.ok(caught instanceof ExecutionError); assert.equal(caught.status, 413);
                await act(async () => requests[0].reject(caught));
                assert.match(document.querySelector('[aria-label="Code conversion status"]')!.textContent!, /16 MiB/);
                assert.doesNotMatch(document.body.textContent!, /private|secret/);
                assert.equal(save().disabled, true);
            } finally { axios.post = originalPost; commonJsAxios.post = originalCommonJsPost; globalThis.fetch = originalFetch; }
        }],
        ["HTTP 413 copy persists after notifications disappear and successful retry clears it", async () => {
            await file(A); await succeed(0); await clickSave(); navigation.length = 0;
            await act(async () => modeChange("cloud")); await fail(1);
            const region = document.querySelector('[aria-label="Code conversion status"]')!;
            assert.ok(region); assert.match(region.textContent!, /16 MiB.*raw|raw.*16 MiB/);
            assert.equal(region.querySelector('[role="status"]')?.getAttribute("aria-live"), "polite");
            assert.equal(region.querySelector('[role="status"]')?.getAttribute("aria-atomic"), "true");
            assert.doesNotMatch(document.body.textContent!, /private|secret|diagnostic/);
            // The durable error must remain without a mounted global toast handler.
            showNotifications = false; await render();
            assert.match(region.textContent!, /16 MiB/);
            await file(B); assert.doesNotMatch(region.textContent!, /Code source too large/);
            assert.equal(save().disabled, true); await succeed(2, "B"); await clickSave();
            assert.equal(await shared.downloadData!.blob.text(), "PDF:B");
        }],
        ["rendering diagnostics stay out of the persistent status and optional toast", async () => {
            await file(A); await act(async () => requests[0].reject(new Error("/private/internal trace secret")));
            assert.match(document.body.textContent!, /Code conversion failed/);
            assert.doesNotMatch(document.body.textContent!, /private|internal|trace|secret/);
            assert.equal(save().disabled, true);
        }],
        ["hostile valid filename is rendered as text and cannot revive a previous PDF", async () => {
            await file(A); await succeed(0);
            const name = 'source.x"><img src=x onerror=alert(1)>';
            assert.equal(name.includes("/"), false);
            const hostile = new File(["// synthetic inert source"], name);
            await file(hostile); await fail(1);
            assert.ok(document.body.textContent!.includes(name));
            assert.equal(document.querySelector('img[onerror],script'), null);
            assert.equal(document.querySelector("img"), null); assert.equal(save().disabled, true);
            assert.equal(requests[1].options.files[0], hostile);
        }],
        ["Remove aborts execution, revokes the preview and clears staged data", async () => {
            await file(A); await succeed(0); await clickSave();
            await act(async () => Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Remove")!.click());
            assert.equal(shared.file, null); assert.equal(shared.downloadData, null);
            assert.equal(shared.conversionGeneration, null);
            assert.equal(requests[0].options.signal?.aborted, true); assert.equal(revoked.length, 1);
        }],
        ["ordinary unmount clears staged data and ownership", async () => {
            await file(A); await succeed(0);
            await act(async () => shared.setDownloadData({ blob: new Blob(["staged"]), fileName: "old.pdf", source: {file: A, generation: shared.conversionGeneration!} }));
            screen = empty; await render();
            assert.equal(shared.downloadData, null); assert.equal(shared.conversionGeneration, null);
            assert.equal(requests[0].options.signal?.aborted, true); assert.equal(revoked.length, 1);
        }],
        ["unmount during preview aborts shared work and releases a late resource", async () => {
            delayPreview = true; await file(A); await succeed(0); screen = empty; await render();
            assert.equal(previewSignals[0].aborted, true);
            await act(async () => previewRequests[0].resolve({ type: "image-url", url: "blob:after-unmount", revoke: () => revoked.push("blob:after-unmount") }));
            assert.ok(revoked.includes("blob:after-unmount")); assert.equal(shared.downloadData, null);
        }],
    ];
    let failed = 0;
    const previousConsoleError = console.error;
    console.error = (...args) => { if (!String(args[0]).startsWith("[CodeToPdfWorkspace]")) previousConsoleError(...args); };
    try {
        for (const [title, test] of tests) {
            await start();
            try { await test(); console.log(`PASS ${title}`); }
            catch (error) { failed++; console.log(`FAIL ${title}: ${(error as Error).message}`); }
            finally { await act(async () => root.unmount()); }
        }
    } finally { console.error = previousConsoleError; dom.window.close(); }
    console.log(`Code result ownership: ${tests.length - failed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
