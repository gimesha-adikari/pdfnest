import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { handleClientError } from "../../lib/errorHandler";
import type { ExecutionOptions, ExecutionResult } from "../../lib/execution/types";
import type { PreviewResource } from "../../lib/preview/types";
type Shared = ReturnType<typeof import("../../app/(site)/[toolId]/ClientToolLayout").useSharedTool>;
type ComponentModule = { default: React.ComponentType<React.PropsWithChildren>; useSharedTool: () => Shared };

// Run the actual TSX components, replacing only framework/services and visual
// wrappers. Deferred executions deliberately ignore abort to test late responses.
const require = createRequire(import.meta.url);
function loadComponent(relative: string, mocks: Record<string, unknown>) {
    const source = fs.readFileSync(path.resolve(process.env.M25R_SOURCE_ROOT || ".", relative), "utf8");
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

const embeddedImages = {
    "png": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUq7jEwMDAxMDAwMDAAAAQVgFssahfxgAAAABJRU5ErkJggg==",
    "jpeg": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDGooor7U+RP//Z"
};

async function main() {
    const name = "jsdom"; // Installed by the existing DOMPurify dependency.
    const { JSDOM } = await import(name);
    const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/markdown-to-pdf/workspace" });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document,
        HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const { createRoot } = await import("react-dom/client");
    const empty = () => null;
    const wrapper = ({ children }: React.PropsWithChildren) => children;
    const navigation: string[] = [];
    const router = { push: (url: string) => navigation.push(url), replace: (url: string) => navigation.push(url) };
    const tools = { getToolByHref: () => ({ title: "Markdown", accept: ".md" }), tools: [], isLoading: false };
    let currentToolId = "markdown-to-pdf";
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
    let delayPreview = false;
    let previewSequence = 0;
    const actionButton = loadComponent("components/pdf/PdfActionButton.tsx", {}).default;
    const workspace = loadComponent("components/tools/MarkdownToPdfWorkspace.tsx", {
        ...framework, ...sharedImport,
        "@/lib/notify": { notify: empty },
        "@/lib/errorHandler": { handleClientError: (error: unknown) => { errors.push(error); handleClientError(error); } },
        "@/context/AuthContext": { useAuth: () => ({ requireAuth: (action: () => void) => {
            if (delayAuth) authCallbacks.push(action); else action();
        } }) },
        "@/components/pdf/PdfFileInfo": { default: ({ file, onClear }: { file: File; onClear: () => void }) => React.createElement("button", { onClick: onClear }, file.name) },
        "@/components/pdf/PdfActionButton": { default: actionButton },
        "@/components/pdf/PdfToolHero": { default: empty },
        "@/lib/execution/ExecutionManager": { ExecutionManager: { run: (options: ExecutionOptions) => {
            const request = { options, ...deferred<ExecutionResult>() }; requests.push(request); return request.promise;
        } } },
        "@/components/shared/ProcessingModeSelector": { ProcessingModeSelector: ({ onChange }: { onChange: typeof modeChange }) => { modeChange = onChange; return null; } },
        "@/lib/preview/ClientPdfRenderer": { ClientPdfRenderer: class {
            render() {
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
    async function render() {
        await act(async () => root.render(React.createElement(layout.default, null,
            React.createElement(Probe), React.createElement(notifications), React.createElement(screen))));
    }
    async function start() {
        navigation.length = requests.length = errors.length = revoked.length = authCallbacks.length = previewRequests.length = blobs.length = downloadedNames.length = 0;
        delayAuth = delayPreview = false; currentToolId = "markdown-to-pdf";
        screen = workspace;
        root = createRoot(document.getElementById("root")!);
        await render();
    }
    async function file(value: File) { await act(async () => shared.setFile(value)); }
    const A = new File(["# Valid A"], "A.md");
    const B = new File(["![Local image](../image.png)"], "B.md");
    const save = () => Array.from(document.querySelectorAll("button")).find(button => /Save Markdown|Rendering Vector/.test(button.textContent || ""))!;
    async function clickSave() { await act(async () => save().click()); }
    async function succeed(index: number, value = "A") {
        await act(async () => requests[index].resolve({ blob: new Blob([`PDF:${value}`], { type: "application/pdf" }),
            fileName: `${value}.pdf`, executionMode: "cloud", fallbackOccurred: false }));
    }
    async function fail(index: number) {
        await act(async () => requests[index].reject(Object.assign(new Error("markdown resource policy violation"),
            { backend: { code: "MARKDOWN_RESOURCE_FORBIDDEN", message: "markdown resource policy violation" } })));
    }
    async function changeLayout(kind: "paper" | "margin") {
        await act(async () => {
            const input = document.querySelector(kind === "paper" ? "select" : "input") as HTMLInputElement;
            const prototype = kind === "paper" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, kind === "paper" ? "letter" : "0.8");
            input.dispatchEvent(new dom.window.Event(kind === "paper" ? "change" : "input", { bubbles: true }));
        });
    }
    const tests: Array<[string, () => Promise<void>]> = [
        ["a rejected B cannot publish A bytes as a successful conversion", async () => {
            await file(A); await succeed(0); await file(B); await fail(1);
            const saveEnabled = !save().disabled;
            await clickSave();
            if (process.env.M25R_REPRODUCTION_TRACE) console.log(JSON.stringify({
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
        ["valid A then forbidden B clears output, preview and shared download; no false success", async () => {
            await file(A); await succeed(0); await clickSave();
            assert.equal(await shared.downloadData!.blob.text(), "PDF:A");
            navigation.length = 0;
            await file(B); await fail(1);
            assert.equal(save().disabled, true);
            assert.equal(shared.downloadData, null);
            assert.equal(document.querySelector("img"), null);
            await clickSave(); assert.deepEqual(navigation, []); assert.equal(errors.length, 1);
            assert.match(document.body.textContent!, /Markdown resource blocked/);
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
        ...(["paper", "margin", "mode"] as const).map(kind => [
            `${kind} change invalidates output and superseded work`, async () => {
                await file(A); await succeed(0); await clickSave(); navigation.length = 0;
                if (kind === "mode") await act(async () => modeChange("cloud")); else await changeLayout(kind);
                assert.equal(requests.length, 2, "one execution per input/configuration");
                assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
                assert.equal(requests[1].options.mode, kind === "mode" ? "cloud" : "auto");
                if (kind === "paper") assert.equal(requests[1].options.params!.paperSize, "letter");
                if (kind === "margin") assert.equal(requests[1].options.params!.marginTop, 0.8);
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
        ["unowned Markdown download data cannot display success", async () => {
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
        ...(["png", "jpeg"] as const).map(format => [
            `embedded ${format} payload reaches download with matching result bytes and filename`, async () => {
                const current = new File([`![image](${embeddedImages[format]})`], `${format}.md`);
                await file(current);
                assert.equal(requests[0].options.files[0], current);
                assert.equal(save().disabled, true); await succeed(0, format); assert.equal(save().disabled, false);
                await clickSave(); screen = download; await render();
                const button = Array.from(document.querySelectorAll("button")).find(button => /Download File/.test(button.textContent || ""))!;
                await act(async () => button.click());
                assert.equal(await blobs.at(-1)!.text(), `PDF:${format}`); assert.equal(downloadedNames.at(-1), `${format}.pdf`);
                assert.equal(requests.length, 1, "saving/downloading does not submit another conversion");
            },
        ] as [string, () => Promise<void>]),
        ["other tools keep their existing download contract", async () => {
            currentToolId = "code-to-pdf"; screen = download; await render();
            await act(async () => shared.setDownloadData({ blob: new Blob(["other"]), fileName: "other.pdf" }));
            assert.match(document.body.textContent!, /Task completed successfully/);
        }],
        ["older response cannot end the latest loading state", async () => {
            await file(A); await file(B); await succeed(0);
            assert.equal(save().disabled, true); assert.equal(document.querySelector("img"), null);
            await succeed(1, "B"); await clickSave();
            assert.equal(await shared.downloadData!.blob.text(), "PDF:B");
        }],
        ...(["paper", "margin", "mode"] as const).map(kind => [
            `${kind} change during pending execution rejects its late result`, async () => {
                await file(A);
                if (kind === "mode") await act(async () => modeChange("cloud")); else await changeLayout(kind);
                await fail(1); await succeed(0);
                assert.equal(save().disabled, true); assert.equal(shared.downloadData, null);
                assert.equal(requests[0].options.signal?.aborted, true);
                assert.equal(document.querySelector("img"), null);
            },
        ] as [string, () => Promise<void>]),
        ...(["paper", "margin", "mode"] as const).map(kind => [
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
    ];
    let failed = 0;
    const previousConsoleError = console.error;
    console.error = (...args) => { if (!String(args[0]).startsWith("[MarkdownToPdfWorkspace]")) previousConsoleError(...args); };
    try {
        for (const [title, test] of tests) {
            await start();
            try { await test(); console.log(`PASS ${title}`); }
            catch (error) { failed++; console.log(`FAIL ${title}: ${(error as Error).message}`); }
            finally { await act(async () => root.unmount()); }
        }
    } finally { console.error = previousConsoleError; dom.window.close(); }
    console.log(`Markdown result ownership: ${tests.length - failed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
