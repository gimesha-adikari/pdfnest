import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { canReusePreparedWordEdit, isCurrentWordEditPreparation } from "../../components/editor-v2/wordEdits";
import { wordEditFailureMessage } from "../../components/editor-v2/wordEditErrors";
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
  let currentSource = source;
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
  let extractSubmissions = 0;
  let failNextCompile = false;
  let delayedCompileId: string | null = null;
  let delayNextCompile = false;
  const delayedCompletion: { resolve?: (job: Record<string, unknown>) => void } = {};
  let parentRerender: (() => void) | null = null;
  let languageControlProps: { onChange: (value: { mode: string; languages: string[] }) => void } | null = null;
  let activeRevision = 7;
  const revisionNotifications: number[] = [];
  let editorProps: {
    wordEditMode?: string;
    onCompileWordEdits?: (value: typeof request, revision: number) => void;
    onRevisionChange?: (revision: number) => void;
    renderPageVisual?: (index: number, visual: { zoom: number; devicePixelRatio: number }) => React.ReactNode;
  } = {};
  let compileSubmissions = 0;
  let downloads = 0;

  const component = load("components/tools/EditPdfWorkspace.tsx", {
    "next/navigation": { useRouter: () => ({ replace: (url: string) => navigations.push(url) }) },
    "lucide-react": new Proxy({}, { get: () => empty }),
    "@/context/AuthContext": { useAuth: () => ({ requireAuth: (action: () => void) => action() }) },
    "@/app/(site)/[toolId]/ClientToolLayout": {
      useSharedTool: () => ({
        file: currentSource,
        toolId: "edit-pdf",
        editPdfEngine: editorEngine,
        setDownloadData: (value: typeof downloadData) => { downloadData = value; },
      }),
    },
    "@/lib/editPdfEngine": { resolveEditPdfEditorEngine: () => "v2" },
    "@/components/pdf/PdfToolHero": { default: empty },
    "@/components/studio/ui/JobProgressCard": { default: empty },
    "@/components/editor-v2/SharedEditor": {
      SharedEditor: (props: typeof editorProps) => {
        editorProps = props;
        return React.createElement("div", { "data-testid": "source-page-preview" },
          props.renderPageVisual?.(0, { zoom: 1, devicePixelRatio: 1 }));
      },
    },
    "@/components/editor-v2/model": { DEFAULT_EDITOR_LANGUAGE: { mode: "EXPLICIT", languages: ["eng"] } },
    "@/components/editor-v2/wordEdits": {
      canReusePreparedWordEdit,
      isCurrentWordEditPreparation,
    },
    "@/components/editor-v2/wordEditErrors": { wordEditFailureMessage },
    "@/components/editor-v2/visualResolution": { studioVisualResolution: () => ({ scale: 1 }) },
    "@/components/editor-v2/EditorLanguageControl": {
      EditorLanguageControl: (props: NonNullable<typeof languageControlProps>) => { languageControlProps = props; return null; },
    },
    "@/lib/notify": { notify: empty },
    "@/lib/errorHandler": { handleClientError: empty },
    "@/lib/preview/usePreviews": {
      usePreviews: (requests: typeof previewRequests) => {
        previewRequests.push(...requests);
        return requests.map((request) => request.file === source
          ? { src: "", isLoading: false, error: { code: "PREVIEW_FAILED", message: "source page render rejected" } }
          : { src: "data:image/png;base64,cHJldmlldw==", isLoading: false, error: null });
      },
    },
    "@/lib/preview/types": { getPreviewFileIdentity: (file: File) => `${file.name}:${file.size}` },
    "@/lib/api": { captureCloudPdfOutputRestoration: () => async (blob: Blob) => blob },
    "@/lib/editorJobs": {
      submitEditorExtract: async () => { extractSubmissions += 1; return { job_id: `extract-${extractSubmissions}`, source_tracker: `owned/source-${extractSubmissions}.pdf` }; },
      waitForEditorJob: async (id: string) => {
        if (id.startsWith("extract-")) return { id, status: "succeeded", result: layout };
        if (id === delayedCompileId) return await new Promise((resolve) => { delayedCompletion.resolve = resolve; });
        if (failNextCompile) { failNextCompile = false; return { id, status: "failed", error_code: "WORD_EDIT_COMPILATION_NOT_IMPLEMENTED", error: "Word compilation is unsupported." }; }
        return { id, status: "succeeded", result: workerResult };
      },
      submitEditorCompile: async () => {
        compileSubmissions += 1;
        const jobId = `word-compile-${compileSubmissions}`;
        if (delayNextCompile) { delayedCompileId = jobId; delayNextCompile = false; }
        return { job_id: jobId };
      },
      downloadEditorJob: async () => { downloads += 1; return candidateBlob; },
      verifyWordEditArtifact,
    },
  }).default;

  function Parent() {
    const [revision, setRevision] = React.useState(0);
    parentRerender = () => setRevision((value) => value + 1);
    return React.createElement("div", { "data-parent-revision": revision }, React.createElement(component));
  }

  const root = createRoot(document.getElementById("root")!);
  await act(async () => { root.render(React.createElement(Parent)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  assert.match(document.querySelector('[data-testid="source-page-preview"]')?.textContent ?? "", /Source page preview failed: source page render rejected/);
  assert.equal(editorProps.wordEditMode, "operations");
  assert.equal(typeof editorProps.onCompileWordEdits, "function");
  assert.equal(extractSubmissions, 1, "the initial source identity should submit one extraction");
  await act(async () => {
    revisionNotifications.push(7);
    editorProps.onRevisionChange?.(7);
    editorProps.onCompileWordEdits?.(request, 7);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    const deadline = Date.now() + 2_000;
    while (!previewRequests.some((preview) => preview.file !== source) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });

  assert.equal(compileSubmissions, 1);
  assert.equal(downloads, 1);
  assert.ok(previewRequests.length >= 1, `prepared candidate should be sent to the existing preview hook; alerts: ${[...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent).join(" | ")}`);
  const previewRequest = [...previewRequests].reverse().find((preview) => preview.file !== source);
  if (!previewRequest) throw new Error("candidate preview request was not captured");
  assert.equal(previewRequest.renderer, "server");
  assert.equal(previewRequest.page, 1);
  assert.equal(previewRequest.file.name, "edited_source.pdf");
  assert.deepEqual(Buffer.from(await previewRequest.file.arrayBuffer()), candidateBytes);

  const downloadButton = [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("Download verified PDF"));
  assert.ok(downloadButton, "prepared candidate should expose its verified download action");
  assert.equal((downloadButton as HTMLButtonElement).disabled, false, "download is enabled after the compiled candidate preview renders");

  const revisionCountAfterPrepare = revisionNotifications.length;
  await act(async () => { parentRerender?.(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.ok(document.querySelector('img[alt="Verified compiled PDF page 1"]'), "a normal parent rerender keeps the verified candidate preview visible");
  assert.equal((downloadButton as HTMLButtonElement).disabled, false, "a normal parent rerender keeps verified download enabled");
  assert.equal(extractSubmissions, 1, "a normal parent rerender does not restart extraction");
  assert.equal(revisionNotifications.length, revisionCountAfterPrepare, "preview completion and a parent rerender do not invent an editor revision");

  await act(async () => { (downloadButton as HTMLButtonElement).click(); });
  const finalDownloadData = currentDownloadData();
  if (!finalDownloadData) throw new Error("verified candidate was not published for download");
  assert.equal(finalDownloadData.blob, candidateBlob, "download must reuse the same verified Blob used to create the preview File");
  assert.deepEqual(Buffer.from(await finalDownloadData.blob.arrayBuffer()), candidateBytes);
  await act(async () => { (downloadButton as HTMLButtonElement).click(); });
  assert.equal(currentDownloadData()?.blob, finalDownloadData.blob, "repeated download actions reuse the same candidate bytes");
  assert.deepEqual(navigations, ["/edit-pdf/download", "/edit-pdf/download"]);

  const backToEditing = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Back to editing");
  assert.ok(backToEditing, "the prepared candidate provides an explicit return to editing action");
  await act(async () => { (backToEditing as HTMLButtonElement).click(); });
  assert.ok(document.querySelector('section[aria-label="Verified compiled PDF preview"]')?.className.includes("hidden"), "Back to editing hides the preview without discarding the prepared candidate");

  await act(async () => {
    editorProps.onCompileWordEdits?.(request, 7);
    await Promise.resolve();
  });
  assert.equal(compileSubmissions, 1, "preparing the unchanged operation snapshot reuses the verified candidate");
  assert.equal(downloads, 1, "candidate reuse does not download or charge twice");
  assert.ok(document.querySelector('img[alt="Verified compiled PDF page 1"]'), "reusing the candidate restores its verified preview");

  await act(async () => {
    revisionNotifications.push(8);
    editorProps.onRevisionChange?.(8);
  });
  assert.equal(document.querySelector('section[aria-label="Verified compiled PDF preview"]'), null, "a genuine editor revision invalidates the old candidate");
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /edits changed/i);

  const changedSource = new File(["source bytes"], "source-v2.pdf", { type: "application/pdf" });
  preparation.authorizeCloudProcessingInputs([changedSource], "edit-pdf");
  currentSource = changedSource;
  downloadData = null;
  await act(async () => { parentRerender?.(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(extractSubmissions, 2, "a changed source File identity starts a fresh extraction");
  assert.equal(document.querySelector('section[aria-label="Verified compiled PDF preview"]'), null, "a changed source identity discards the previous candidate");

  const sourceChangedRequest = { ...request, source_tracker: "owned/source-2.pdf" };
  await act(async () => { editorProps.onCompileWordEdits?.(sourceChangedRequest, 0); await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.ok(document.querySelector('img[alt="Verified compiled PDF page 1"]'), "a candidate can be prepared for the newly extracted source");
  assert.equal(compileSubmissions, 2);

  await act(async () => { languageControlProps?.onChange({ mode: "EXPLICIT", languages: ["sin"] }); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(extractSubmissions, 3, "a language change starts a fresh extraction");
  assert.equal(document.querySelector('section[aria-label="Verified compiled PDF preview"]'), null, "language re-extraction invalidates the prior candidate");

  activeRevision = 0;
  failNextCompile = true;
  await act(async () => { editorProps.onCompileWordEdits?.(request, activeRevision); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(document.querySelector('section[aria-label="Verified compiled PDF preview"]'), null, "a failed worker compile creates no preview candidate");
  assert.equal([...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Download verified PDF")), false, "a failed worker compile exposes no verified download action");
  assert.equal(currentDownloadData(), null, "a failed worker compile leaves no shared downloadable artifact");
  assert.ok(document.querySelector('[role="alert"]'), "a failed worker compile reports its refusal");

  activeRevision = 1;
  delayedCompileId = null;
  delayNextCompile = true;
  await act(async () => { editorProps.onRevisionChange?.(activeRevision); editorProps.onCompileWordEdits?.(request, activeRevision); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.ok(delayedCompileId, "the stale-response case reaches its deliberately delayed worker result");
  const finishOldJob = delayedCompletion.resolve;
  assert.ok(finishOldJob);
  activeRevision = 2;
  await act(async () => {
    editorProps.onRevisionChange?.(activeRevision);
    finishOldJob?.({ id: delayedCompileId, status: "succeeded", result: workerResult });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(document.querySelector('section[aria-label="Verified compiled PDF preview"]'), null, "an older successful worker response cannot publish after its edit revision is stale");
  await act(async () => { editorProps.onCompileWordEdits?.(request, activeRevision); await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.ok(document.querySelector('img[alt="Verified compiled PDF page 1"]'), "a fresh preparation after the stale response can publish a current candidate");

  await act(async () => root.unmount());
  console.log("Word edit candidate lifecycle and preview/download parity tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
