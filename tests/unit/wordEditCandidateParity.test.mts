import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { canReusePreparedWordEdit, isCurrentWordEditPreparation } from "../../components/editor-v2/wordEdits";
import { verifyWordEditArtifact } from "../../lib/editorJobs";
import { usePdfOutputOperation } from "../../lib/security/usePdfOutputOperation";
import * as preparation from "../../lib/security/pdfInputPreparation";

const require = createRequire(import.meta.url);

function load(relative: string, mocks: Record<string, unknown>) {
  const root = path.resolve(process.env.F02_SOURCE_ROOT || ".");
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
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

async function main() {
  process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:9";
  globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
  const jsdomModule = "jsdom";
  const { JSDOM } = await import(jsdomModule);
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/edit-pdf/workspace" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const { createRoot } = await import("react-dom/client");
  const empty = () => null;
  const source = new File(["source bytes"], "source.pdf", { type: "application/pdf" });
  preparation.authorizeCloudProcessingInputs([source], "edit-pdf");
  const candidateBytes = Buffer.from("%PDF-1.7\nverified prepared candidate\n%%EOF\n", "utf8");
  const candidateBlob = new Blob([candidateBytes], { type: "application/pdf" });
  const artifactSha256 = createHash("sha256").update(candidateBytes).digest("hex");
  const sourceSha256 = "a".repeat(64);
  const baselineDigest = `sha256:${"b".repeat(64)}`;
  const layout = {
    pages: [{ page_num: 1, width: 595, height: 842, elements: [] }],
    word_edit_protocols: ["platen_word_edits.v1"],
    word_edit_baseline: {
      extraction_job_id: "extract-1",
      source_sha256: sourceSha256,
      digest: baselineDigest,
    },
  };
  const request = {
    edit_protocol: "platen_word_edits.v1",
    source_tracker: "owned/source.pdf",
    extraction_job_id: "extract-1",
    baseline_digest: baselineDigest,
    edits: [{
      page_num: 1,
      element_id: "line-1",
      word_id: "word-1",
      expected_original_text: "Ministry",
      replacement_text: "hello",
      style_override: null,
      fit_policy: "preserve_neighbors",
    }],
  };
  const workerResult = {
    compiler_protocol: "platen_word_edits.v1",
    artifact_sha256: artifactSha256,
    page_count: 1,
    source_sha256: sourceSha256,
    baseline_digest: baselineDigest,
    validated_operation_count: 1,
  };

  let editorEngine: "legacy" | "v2" = "v2";
  let downloadData: { blob: Blob; fileName: string } | null = null;
  const currentDownloadData = () => downloadData;
  const navigations: string[] = [];
  const previewRequests: Array<{ file: File; page: number; renderer: string }> = [];
  let editorProps: {
    wordEditMode?: string;
    onCompileWordEdits?: (value: typeof request, revision: number) => void;
    onRevisionChange?: (revision: number) => void;
  } = {};
  let compileSubmissions = 0;
  let downloads = 0;

  const component = load("components/tools/EditPdfWorkspace.tsx", {
    "next/navigation": { useRouter: () => ({ replace: (url: string) => navigations.push(url) }) },
    "lucide-react": new Proxy({}, { get: () => empty }),
    "@/context/AuthContext": { useAuth: () => ({ requireAuth: (action: () => void) => action() }) },
    "@/app/(site)/[toolId]/ClientToolLayout": {
      useSharedTool: () => ({
        file: source,
        toolId: "edit-pdf",
        editPdfEngine: editorEngine,
        setDownloadData: (value: typeof downloadData) => { downloadData = value; },
      }),
    },
    "@/lib/editPdfEngine": { resolveEditPdfEditorEngine: () => "v2" },
    "@/components/pdf/PdfToolHero": { default: empty },
    "@/components/studio/ui/JobProgressCard": { default: empty },
    "@/components/editor-v2/SharedEditor": {
      SharedEditor: (props: typeof editorProps) => { editorProps = props; return null; },
    },
    "@/components/editor-v2/model": { DEFAULT_EDITOR_LANGUAGE: { mode: "EXPLICIT", languages: ["eng"] } },
    "@/components/editor-v2/wordEdits": {
      canReusePreparedWordEdit,
      isCurrentWordEditPreparation,
    },
    "@/components/editor-v2/visualResolution": { studioVisualResolution: () => ({ scale: 1 }) },
    "@/components/editor-v2/EditorLanguageControl": { EditorLanguageControl: empty },
    "@/lib/notify": { notify: empty },
    "@/lib/errorHandler": { handleClientError: empty },
    "@/lib/preview/usePreviews": {
      usePreviews: (requests: typeof previewRequests) => {
        previewRequests.push(...requests);
        return requests.map(() => ({ src: "data:image/png;base64,cHJldmlldw==" }));
      },
    },
    "@/lib/preview/types": { getPreviewFileIdentity: (file: File) => `${file.name}:${file.size}` },
    "@/lib/api": { captureCloudPdfOutputRestoration: () => async (blob: Blob) => blob },
    "@/lib/editorJobs": {
      submitEditorExtract: async () => ({ job_id: "extract-1", source_tracker: "owned/source.pdf" }),
      waitForEditorJob: async (id: string) => id === "extract-1"
        ? { id, status: "succeeded", result: layout }
        : { id, status: "succeeded", result: workerResult },
      submitEditorCompile: async () => { compileSubmissions += 1; return { job_id: "word-compile-1" }; },
      downloadEditorJob: async () => { downloads += 1; return candidateBlob; },
      verifyWordEditArtifact,
    },
  }).default;

  const root = createRoot(document.getElementById("root")!);
  await act(async () => { root.render(React.createElement(component)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  assert.equal(editorProps.wordEditMode, "operations");
  assert.equal(typeof editorProps.onCompileWordEdits, "function");
  await act(async () => {
    editorProps.onRevisionChange?.(7);
    editorProps.onCompileWordEdits?.(request, 7);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  assert.equal(compileSubmissions, 1);
  assert.equal(downloads, 1);
  assert.ok(previewRequests.length >= 1, "prepared candidate should be sent to the existing preview hook");
  const previewRequest = previewRequests.at(-1);
  if (!previewRequest) throw new Error("candidate preview request was not captured");
  assert.equal(previewRequest.renderer, "server");
  assert.equal(previewRequest.page, 1);
  assert.equal(previewRequest.file.name, "edited_source.pdf");
  assert.deepEqual(Buffer.from(await previewRequest.file.arrayBuffer()), candidateBytes);

  const downloadButton = [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("Download verified PDF"));
  assert.ok(downloadButton, "prepared candidate should expose its verified download action");
  assert.equal((downloadButton as HTMLButtonElement).disabled, false, "download is enabled after the compiled candidate preview renders");
  await act(async () => { (downloadButton as HTMLButtonElement).click(); });
  const finalDownloadData = currentDownloadData();
  if (!finalDownloadData) throw new Error("verified candidate was not published for download");
  assert.equal(finalDownloadData.blob, candidateBlob, "download must reuse the same verified Blob used to create the preview File");
  assert.deepEqual(Buffer.from(await finalDownloadData.blob.arrayBuffer()), candidateBytes);
  assert.deepEqual(navigations, ["/edit-pdf/download"]);

  await act(async () => {
    editorProps.onCompileWordEdits?.(request, 7);
    await Promise.resolve();
  });
  assert.equal(compileSubmissions, 1, "preparing the unchanged operation snapshot reuses the verified candidate");
  assert.equal(downloads, 1, "candidate reuse does not download or charge twice");

  await act(async () => root.unmount());
  console.log("Word edit candidate preview and download parity tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
