import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { usePdfOutputOperation } from "../../lib/security/usePdfOutputOperation";
import * as preparation from "../../lib/security/pdfInputPreparation";
const require = createRequire(import.meta.url);
function load(relative: string, mocks: Record<string, unknown>) {
    const source = fs.readFileSync(path.resolve(process.env.F02_SOURCE_ROOT || ".", relative), "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    const loaded = { exports: {} };
    new Function("require", "module", "exports", outputText)((name: string) => {
        if (name === "@/lib/security/pdfInputPreparation") return preparation;
        if (name === "@/lib/security/usePdfOutputOperation") return { usePdfOutputOperation };
        if (name in mocks) {
            const value = mocks[name];
            return value && typeof value === "object" && Object.hasOwn(value, "default") ? { ...value, __esModule: true } : value;
        }
        if (name.startsWith("@/")) throw new Error(`Unmocked application dependency: ${name}`);
        return require(name);
    }, loaded, loaded.exports);
    return loaded.exports as { default: React.ComponentType };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((yes) => { resolve = yes; });
    return { promise, resolve };
}
async function main() {
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:9";
    globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
    const jsdom = "jsdom";
    const { JSDOM } = await import(jsdom);
    const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/edit-pdf/workspace" });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const { createRoot } = await import("react-dom/client");
    const empty = () => null;
    const source = new File(["prepared input"], "secret.pdf", { type: "application/pdf" });
    preparation.setTransientOriginalPassword(source, "synthetic-secret");
    preparation.markPdfInputPreparation(source, { sourceProtected: true, bytesState: "decrypted", preparedOn: "device", processingMode: "cloud", cloudSubmissionInitiated: false });
    preparation.authorizeCloudProcessingInputs([source], "edit-pdf");
    let file: File | null = source;
    let published: { blob: Blob; provenance?: preparation.PdfResultProvenance } | null = { blob: new Blob(["earlier plaintext success"]) };
    const currentResult = (): { blob: Blob; provenance?: preparation.PdfResultProvenance } | null => published;
    let compile!: (draft: object) => void;
    let submissions = 0;
    const navigations: string[] = [];
    const output = new Blob(["plain compiled result"], { type: "application/pdf" });
    const protectedOutput = new Blob(["verified by real helper tests"], { type: "application/pdf" });
    let failRestoration = true;
    let download = async () => output;
    let delayedAuth: (() => void) | undefined;
    let deferAuth = false;
    let capturedSignal: AbortSignal | undefined;
    const component = load("components/tools/EditPdfWorkspace.tsx", {
        "next/navigation": { useRouter: () => ({ replace: (url: string) => navigations.push(url) }) },
        "lucide-react": new Proxy({}, { get: () => empty }),
        "@/context/AuthContext": { useAuth: () => ({ requireAuth: (action: () => void) => { if (deferAuth) delayedAuth = action; else action(); } }) },
        "@/app/(site)/[toolId]/ClientToolLayout": { useSharedTool: () => ({ file, toolId: "edit-pdf", setDownloadData: (value: typeof published) => { published = value; } }) },
        "@/lib/editPdfEngine": { resolveEditPdfEditorEngine: () => "legacy" },
        "@/components/pdf/PdfToolHero": { default: empty },
        "@/components/studio/ui/JobProgressCard": { default: empty },
        "@/components/editor-v2/SharedEditor": { SharedEditor: ({ onCompile }: { onCompile: typeof compile }) => { compile = onCompile; return null; } },
        "@/components/editor-v2/model": { DEFAULT_EDITOR_LANGUAGE: { mode: "EXPLICIT", languages: ["eng"] } },
        "@/components/editor-v2/visualResolution": { studioVisualResolution: () => ({ scale: 1 }) },
        "@/components/editor-v2/EditorLanguageControl": { EditorLanguageControl: empty },
        "@/lib/notify": { notify: empty },
        "@/lib/errorHandler": { handleClientError: empty },
        "@/lib/preview/usePreviews": { usePreviews: () => [] },
        "@/lib/api": { captureCloudPdfOutputRestoration: (input: File) => async (_blob: Blob, signal: AbortSignal) => {
            assert.equal(input, source); capturedSignal = signal;
            if (failRestoration) throw new Error("Protection verification failed");
            return protectedOutput;
        } },
        "@/lib/editorJobs": {
            submitEditorExtract: async () => ({ job_id: "extract", source_tracker: "owned-source" }),
            waitForEditorJob: async (id: string) => id === "extract" ? { status: "succeeded", result: { pages: [] } } : { id, status: "succeeded" },
            submitEditorCompile: async () => { submissions++; return { job_id: "compile" }; },
            downloadEditorJob: () => download(),
        },
    }).default;
    const root = createRoot(document.getElementById("root")!);
    const render = () => act(async () => root.render(React.createElement(component)));
    await render();
    await act(async () => compile({ pages: [] }));
    assert.equal(published, null, "a later failed protection operation must remove the earlier plaintext result");
    assert.equal(navigations.length, 0, "failed restoration cannot navigate to download success");
    failRestoration = false;
    await act(async () => compile({ pages: [] }));
    assert.equal(currentResult()?.blob, protectedOutput);
    const provenance = currentResult()?.provenance;
    assert.equal(provenance?.cloudSubmissionInitiated, true, "result provenance includes this operation's first Cloud submission");
    assert.equal(preparation.createTransferredPdfPreparation(provenance!).cloudSubmissionInitiated, true, "transfer cannot erase Cloud history");
    assert.equal(navigations.length, 1);
    assert.equal(capturedSignal?.aborted, false);
    const pending = deferred<Blob>(); download = () => pending.promise;
    await act(async () => { compile({ pages: [] }); compile({ pages: [] }); });
    assert.equal(submissions, 3, "overlapping compilation must be single flight");
    assert.equal(published, null);
    file = new File(["replacement"], "secret.pdf", { type: "application/pdf" });
    await render();
    await act(async () => pending.resolve(output));
    assert.equal(published, null, "late result for replaced input must not publish");
    assert.equal(navigations.length, 1);
    file = source; await render();
    deferAuth = true;
    await act(async () => compile({ pages: [] }));
    file = null; await render();
    await act(async () => delayedAuth?.());
    assert.equal(submissions, 3, "deferred authorization cannot start work for a removed input");
    file = source; deferAuth = false; await render();
    const unmountPending = deferred<Blob>(); download = () => unmountPending.promise;
    await act(async () => compile({ pages: [] }));
    await act(async () => root.unmount());
    await act(async () => unmountPending.resolve(output));
    assert.equal(published, null);
    assert.equal(navigations.length, 1);
    console.log("PASS: mounted editor verified-publication callback, failed-restoration stale download, overlapping submits, input replacement/removal, deferred auth and unmount");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
