import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import * as sessionState from "../../context/authSessionState";
import * as preparation from "../../lib/security/pdfInputPreparation";
import * as executionTypes from "../../lib/execution/types";
import * as flags from "../../lib/execution/flags";
import * as telemetry from "../../lib/execution/telemetry";
import type { ExecutionOptions } from "../../lib/execution/types";

// Mount the real provider, shared layout, mode selector and workspace. Only
// display-only leaves and the actual execution transports are substituted.
const require = createRequire(import.meta.url);
const mocks: Record<string, unknown> = {};
function load<T>(file: string): T {
    const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const loaded = { exports: {} };
    new Function("require", "module", "exports", outputText)((name: string) =>
        name in mocks ? mocks[name] : require(name), loaded, loaded.exports);
    return loaded.exports as T;
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(yes => { resolve = yes; });
    return { promise, resolve };
}
const jsdom = "jsdom";
const { JSDOM } = await import(jsdom);
const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:3000/compress-pdf/workspace" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.fetch = async () => { throw new Error("Unexpected network request in privacy fixture"); };
const { createRoot } = await import("react-dom/client");
const empty = () => null;
const interop = (value: object) => ({ ...value, __esModule: true });
const sessions: Array<ReturnType<typeof deferred<sessionState.SessionResponse>>> = [];
let pathname = "/compress-pdf/workspace";
let currentToolId = "compress-pdf";
const executionCalls: ExecutionOptions[] = [];
const result = new Blob(["synthetic local output"]);
const cloudExecute = async (options: ExecutionOptions) => {
    executionCalls.push(options);
    preparation.markCloudSubmissionInitiated(options.files);
    return result;
};
const clientExecute = async (options: ExecutionOptions) => { executionCalls.push(options); return result; };
const getToolByHref = () => ({ title: "Compress", href: "/compress-pdf" });
Object.assign(mocks, {
    "@/lib/api": { fetchJson: (path: string) => {
        assert.equal(path, "/auth/session");
        const request = deferred<sessionState.SessionResponse>(); sessions.push(request); return request.promise;
    } },
    "./authSessionState": sessionState,
    "@/lib/security/pdfInputPreparation": preparation,
    "./pdfInputPreparation": preparation,
    "next/navigation": { useParams: () => ({ toolId: currentToolId }), usePathname: () => pathname,
        useRouter: () => ({ push: () => {} }), notFound: () => { throw new Error("Unexpected route"); } },
    "lucide-react": new Proxy({}, { get: () => empty }),
    "@/context/BackendHealthContext": { useBackendHealth: () => ({ status: "online" }) },
    "@/context/ToolContext": { useTools: () => ({ getToolByHref, isLoading: false }) },
    "@/components/SEO/ToolFAQ": interop({ default: empty }),
    "@/components/SEO/ToolSchema": interop({ default: empty }),
    "@/lib/iconResolver": { resolveIcon: () => empty },
    "@/components/pdf/BackendOnlyToolGuard": { BackendOnlyToolGuard: ({ children }: React.PropsWithChildren) => children },
    "@/context/RepositoryAnalyzerContext": { RepositoryAnalyzerProvider: ({ children }: React.PropsWithChildren) => children },
    "@/lib/ocrV2DevelopmentTools": { getOcrV2DevelopmentRouteConfig: () => undefined },
    "@/lib/editPdfEngine": { resolveEditPdfEditorEngine: () => "legacy" },
    "@/lib/errorHandler": { handleClientError: (error: unknown) => { throw error; } },
    "@/lib/notify": { notify: () => {} },
    "./ClientExecutor": { ClientExecutor: { isSupported: () => true, execute: clientExecute } },
    "./CloudExecutor": { CloudExecutor: { execute: cloudExecute } },
    "./document/markdownPolicy": { prepareMarkdown: () => { throw new Error("Unexpected Markdown"); } },
    "./ExecutionSafetyGate": { ExecutionSafetyGate: { evaluate: () => ({ eligible: true }) } },
    "./flags": flags, "./telemetry": telemetry, "./types": executionTypes,
    "../notify": { notifyHybridFallback: () => {} },
    "@/components/pdf/PdfFileInfo": interop({ default: empty }),
    "@/components/pdf/PdfActionButton": interop({ default: ({ text, onClick, disabled }: { text: string; onClick: () => void; disabled?: boolean }) =>
        React.createElement("button", { onClick, disabled }, text) }),
    "@/components/pdf/PdfProgressTracker": { PdfProgressTracker: empty },
    "@/components/pdf/PdfToolHero": interop({ default: empty }),
    "@/components/pdf/PdfUploader": interop({ default: empty }),
    "next/link": interop({ default: ({ children }: React.PropsWithChildren) => children }),
});
mocks["@/lib/execution/ExecutionManager"] = load("lib/execution/ExecutionManager.ts");
const auth = load<{ AuthProvider: React.ComponentType<React.PropsWithChildren> }>("context/AuthContext.tsx");
mocks["@/context/AuthContext"] = auth;
type Shared = { file: File | null; setFile: (file: File | null) => void };
const layout = load<{ default: React.ComponentType<React.PropsWithChildren>; useSharedTool: () => Shared }>("app/(site)/[toolId]/ClientToolLayout.tsx");
mocks["@/app/(site)/[toolId]/ClientToolLayout"] = layout;
mocks["@/components/shared/ProcessingModeSelector"] = load("components/shared/ProcessingModeSelector.tsx");
const operations = load<{ usePdfOutputOperation: (file: File | null, tool: string, clear: () => void) => (() => { signal: AbortSignal } | null) }>("lib/security/usePdfOutputOperation.ts");
mocks["@/lib/security/usePdfOutputOperation"] = operations;
const Workspace = load<{ default: React.ComponentType }>("components/tools/CompressPdfWorkspace.tsx").default;
const ImagesWorkspace = load<{ default: React.ComponentType }>("components/tools/ImagesToPdfWorkspace.tsx").default;
mocks["@/components/ui/PasswordField"] = interop(load("components/ui/PasswordField.tsx"));
const UnlockWorkspace = load<{ default: React.ComponentType }>("components/tools/UnlockPdfWorkspace.tsx").default;
let CurrentWorkspace = Workspace;
let shared!: Shared;
let beginAfterUnmount!: ReturnType<typeof operations.usePdfOutputOperation>;
function Probe() {
    shared = layout.useSharedTool();
    beginAfterUnmount = operations.usePdfOutputOperation(shared.file, "compress-pdf", () => {});
    return null;
}
const root = createRoot(document.getElementById("root")!);
let generation = 0;
async function render(showWorkspace = true) {
    await act(async () => root.render(React.createElement(auth.AuthProvider, { key: generation },
        React.createElement(layout.default, null, React.createElement(Probe), showWorkspace ? React.createElement(CurrentWorkspace) : null))));
}
async function click(text: string | RegExp) {
    const button = [...document.querySelectorAll("button")].find(button => typeof text === "string"
        ? button.textContent?.trim() === text : text.test(button.textContent?.trim() || ""));
    assert.ok(button, `Missing button ${text}`);
    assert.equal(button.disabled, false);
    await act(async () => button.click());
}
const guest: sessionState.SessionResponse = { type: "guest", authenticated: true, guest: { id: "synthetic", trust: 1 } };
function source() {
    const file = new File(["%PDF-synthetic"], "private.pdf", { type: "application/pdf" });
    preparation.markPdfInputPreparation(file, { sourceProtected: false, bytesState: "plain", preparedOn: "none", processingMode: "cloud", cloudSubmissionInitiated: false });
    return file;
}
async function start() {
    generation++; pathname = "/compress-pdf/workspace"; executionCalls.length = 0;
    await render();
    const file = source(); await act(async () => shared.setFile(file));
    await click("Cloud");
    await click("Optimize and Compress PDF");
    assert.equal(executionCalls.length, 0, "authentication response is still delayed");
    return file;
}
async function release() { await act(async () => sessions.at(-1)!.resolve(guest)); }
try {
    const file = await start();
    await click("Device"); await release();
    assert.equal(executionCalls.length, 0, "an earlier Cloud action must not run after Device selection");
    assert.equal(preparation.hasCloudSubmissionInitiated(file), false);
    await click("Optimize and Compress PDF");
    assert.equal(executionCalls.length, 1); assert.equal(executionCalls[0].mode, "device");
    console.log("PASS delayed Cloud action discarded on Device selection; fresh Device action remains local");

    for (const change of ["replace", "remove", "navigate", "unmount"] as const) {
        await start();
        if (change === "replace" || change === "remove") await act(async () => shared.setFile(change === "replace" ? source() : null));
        if (change === "navigate") { pathname = "/compress-pdf/download"; await render(); }
        if (change === "unmount") await render(false);
        await release();
        assert.equal(executionCalls.length, 0, `stale Cloud action after ${change}`);
        console.log(`PASS delayed Cloud action discarded after ${change}`);
    }
    await start(); await release();
    assert.equal(executionCalls.length, 1); assert.equal(executionCalls[0].mode, "cloud");
    console.log("PASS unchanged explicit Cloud action still runs");

    // This workspace owns an independent multi-file queue: removing one image
    // must invalidate the callback even while the shared first File stays put.
    for (const change of ["Remove Image", "Move Later"]) {
        generation++; currentToolId = "images-to-pdf"; pathname = "/images-to-pdf/workspace";
        CurrentWorkspace = ImagesWorkspace; executionCalls.length = 0;
        await render();
        const first: File & { initialBatch?: File[] } = source();
        const second = source(); first.initialBatch = [first, second];
        await act(async () => shared.setFile(first));
        await click("Cloud"); await click(/^Compile /);
        await act(async () => (document.querySelector(`button[title="${change}"]`) as HTMLButtonElement).click());
        await release();
        assert.equal(executionCalls.length, 0, `delayed upload must not use the queue before ${change}`);
        await click(/^Compile /);
        assert.deepEqual(executionCalls[0].files, change === "Remove Image" ? [second] : [second, first]);
        console.log(`PASS changed image queue cancels deferred upload after ${change}; fresh submission uses current files`);
    }

    for (const nextPassword of ["", "different-synthetic-password"]) {
        generation++; currentToolId = "unlock-pdf"; pathname = "/unlock-pdf/workspace";
        CurrentWorkspace = UnlockWorkspace; executionCalls.length = 0;
        await render(); await act(async () => shared.setFile(source()));
        const input = document.querySelector('input[type="password"]')!;
        async function enter(value: string) {
            await act(async () => {
                Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
                input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
            });
        }
        await enter("synthetic-old-password");
        await click("Cloud"); await click("Remove Security and Unlock PDF");
        await enter(nextPassword); await release();
        assert.equal(executionCalls.length, 0, "editing a password must revoke the delayed action containing the old password");
        if (nextPassword) {
            await click("Remove Security and Unlock PDF");
            assert.equal(executionCalls[0].password, nextPassword);
        }
        console.log(`PASS ${nextPassword ? "replacement" : "cleared"} password discards deferred secret submission`);
    }
    const staleBegin = beginAfterUnmount;
    await act(async () => root.unmount());
    assert.equal(staleBegin(), null, "an unmounted output hook cannot acquire a new operation");
    console.log("PASS unmounted output callback cannot start fresh work");
} finally {
    dom.window.close();
}
