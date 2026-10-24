import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { unzipSync } from "fflate";
import * as folderZipper from "../../lib/folderZipper";

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
const alerts: unknown[] = [];
globalThis.alert = (message: unknown) => { alerts.push(message); };
let release!: () => void;
const wait = new Promise<void>((resolve) => { release = resolve; });
let uploaded!: () => void;
const complete = new Promise<void>((resolve) => { uploaded = resolve; });
const mocks: Record<string, unknown> = {
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/app/(site)/[toolId]/ClientToolLayout": { useSharedTool: () => ({ toolId: "repository-analyzer", setFile() {} }) },
    "@/context/RepositoryAnalyzerContext": { useRepositoryAnalyzer: () => ({ reset() {}, createZipSession() { sessions++; }, createGitSession() {} }) },
    "@/lib/folderZipper": folderZipper,
    "@/lib/analyzerUploader": { uploadArchiveToStorage: async (blob: Blob) => {
        uploads++;
        assert.equal(reads, 1); assert.equal(secretReads, 0);
        assert.deepEqual(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer()))), ["repo/src/index.ts"]);
        uploaded();
        return { storageKey: "synthetic-key", repositoryName: "repo" };
    } },
};
const loaded = { exports: {} };
new Function("require", "module", "exports", outputText)((id: string) => id in mocks ? mocks[id] : require(id), loaded, loaded.exports);
const Selector = (loaded.exports as { default: React.ComponentType }).default;
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(React.createElement(Selector)));
const button = (label: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(label))!;
await act(async () => button("Local Directory").click());
assert.match(document.body.textContent!, /filtered repository archive is uploaded for cloud processing/);
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
await select([secret]);
await act(async () => button("Continue to Scoping").click());
assert.equal(uploads, 1, "no upload or fallback on filtering failure");
assert.equal(alerts.length, 1);
await act(async () => button("ZIP Archive").click());
assert.match(document.body.textContent!, /not sanitized in your browser/);
await act(async () => root.unmount());
dom.window.close();
console.log("PASS: mounted folder selector filters before upload, waits for bundling, rejects all-secret input and describes raw ZIP uploads");
