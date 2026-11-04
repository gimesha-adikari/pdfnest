import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { unzipSync } from "fflate";
import JSZip from "jszip";
import * as folderZipper from "../../lib/folderZipper";
import * as pdfInputPreparation from "../../lib/security/pdfInputPreparation";

const require = createRequire(import.meta.url);
const { outputText } = ts.transpileModule(fs.readFileSync("components/tools/RepositoryAnalyzerSourceSelector.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
});
const name = "jsdom";
const { JSDOM } = await import(name);
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/repository-analyzer" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.fetch = async () => { throw new Error("Unexpected network request in fixture"); };
let uploads = 0, reads = 0, secretReads = 0, sessions = 0;
let stagedFile: File | null = null;
const uploadPayloads: string[][] = [];
let blockNextUpload = false;
let uploadStarted!: () => void;
let uploadStartPromise = new Promise<void>((resolve) => { uploadStarted = resolve; });
const alerts: unknown[] = [];
globalThis.alert = (message: unknown) => { alerts.push(message); };
let release!: () => void;
const wait = new Promise<void>((resolve) => { release = resolve; });
let uploaded!: () => void;
let complete = new Promise<void>((resolve) => { uploaded = resolve; });
const mocks: Record<string, unknown> = {
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/app/(site)/[toolId]/ClientToolLayout": { useSharedTool: () => ({ toolId: "repository-analyzer", setFile(f: File | null) { stagedFile = f; } }) },
    "@/context/RepositoryAnalyzerContext": { useRepositoryAnalyzer: () => ({ reset() {}, createZipSession() { sessions++; }, createGitSession() {} }) },
    "@/lib/folderZipper": folderZipper,
    "@/lib/security/pdfInputPreparation": pdfInputPreparation,
    "@/lib/analyzerUploader": { uploadArchiveToStorage: async (blob: Blob, _name: string, _repo: string, signal?: AbortSignal) => {
        uploads++;
        assert.equal(secretReads, 0);
        const contents = unzipSync(new Uint8Array(await blob.arrayBuffer()));
        uploadPayloads.push(Object.keys(contents).sort());
        if (uploads === 1) {
            assert.equal(reads, 1);
            assert.deepEqual(uploadPayloads[0], ["repo/src/index.ts"]);
        }
        uploaded();
        if (blockNextUpload) {
            blockNextUpload = false;
            uploadStarted();
            await new Promise<void>((resolve, reject) => {
                if (!signal) { reject(new Error("Upload signal was not forwarded")); return; }
                signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
            });
        }
        return { storageKey: "synthetic-key", repositoryName: "repo" };
    } },
};
const loaded = { exports: {} };
new Function("require", "module", "exports", outputText)((id: string) => id === "@/lib/security/pdfInputPreparation" ? pdfInputPreparation : id in mocks ? mocks[id] : require(id), loaded, loaded.exports);
const Selector = (loaded.exports as { default: React.ComponentType }).default;
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(React.createElement(Selector)));
const button = (label: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(label))!;
await act(async () => button("Local Directory").click());
assert.match(document.body.textContent!, /selected folder is filtered on this device/);
const safe = new File(["source"], "index.ts");
Object.defineProperty(safe, "webkitRelativePath", { value: "repo/src/index.ts" });
safe.arrayBuffer = async () => { reads++; await wait; return new TextEncoder().encode("source").buffer; };
const secret = new File(["synthetic"], ".env");
Object.defineProperty(secret, "webkitRelativePath", { value: "repo/.env" });
secret.arrayBuffer = async () => { secretReads++; throw new Error("Secret bytes read"); };
const input = document.querySelector('input[type="file"]')!;
async function select(files: File[]) {
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
}
await select([safe, secret]);
await act(async () => button("Continue to Scoping").click());
assert.equal(uploads, 0, "no upload begins while bundling is incomplete");
await act(async () => { release(); await complete; });
assert.equal(uploads, 1); assert.equal(sessions, 1); assert.equal(secretReads, 0);
assert.ok(stagedFile, "synthetic placeholder file is staged");
assert.equal((stagedFile as File).type, "application/x-repository");
assert.equal((stagedFile as File).size, 0);
const prep = pdfInputPreparation.getPdfInputPreparation(stagedFile);
assert.equal(prep?.sourceProtected, false);
assert.equal(prep?.bytesState, "plain");
assert.equal(prep?.preparedOn, "device");
assert.equal(prep?.derivedFromProtectedInput, false);
assert.equal(prep?.transferredFromTool, false);
assert.equal(pdfInputPreparation.isSyntheticRepositoryPlaceholder(stagedFile), true);
await select([secret]);
await act(async () => button("Continue to Scoping").click());
assert.equal(uploads, 1, "no upload or fallback on filtering failure");
assert.equal(alerts.length, 1);
await act(async () => button("ZIP Archive").click());
assert.match(document.body.textContent!, /inspected and filtered on this device/);
const sourceZip = new JSZip();
sourceZip.file("repo/.gitignore", "secrets/\n");
sourceZip.file("repo/.env", "synthetic zip secret");
sourceZip.file("repo/secrets/token.txt", "synthetic zip token");
sourceZip.file("repo/src/index.ts", "safe zip source");
const zipFile = new File([await sourceZip.generateAsync({ type: "blob" })], "repo.zip");
const zipInput = document.querySelector('input[type="file"]')!;
await selectInto(zipInput, [zipFile]);
complete = new Promise<void>((resolve) => { uploaded = resolve; });
await act(async () => button("Continue to Scoping").click());
await act(async () => await complete);
assert.deepEqual(uploadPayloads[1], ["repo/.gitignore", "repo/src/index.ts"]);
assert.equal(sessions, 2);

// A user can abort an active upload. The signal reaches the outgoing transfer
// boundary, and no Analyzer session is created after the cancellation.
await act(async () => button("Local Directory").click());
const quick = new File(["source"], "quick.ts");
Object.defineProperty(quick, "webkitRelativePath", { value: "repo/src/quick.ts" });
await selectInto(document.querySelector('input[type="file"]')!, [quick]);
blockNextUpload = true;
uploadStartPromise = new Promise<void>((resolve) => { uploadStarted = resolve; });
const sessionsBeforeCancel = sessions;
await act(async () => button("Continue to Scoping").click());
await act(async () => await uploadStartPromise);
await act(async () => button("Cancel").click());
await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
assert.equal(sessions, sessionsBeforeCancel, "cancelled upload never creates a repository session");
await act(async () => root.unmount());
dom.window.close();
console.log("PASS: mounted folder and ZIP uploads sanitize before transfer, wait for bundling, reject all-secret input, and propagate cancellation");

async function selectInto(input: Element, files: File[]) {
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
}
