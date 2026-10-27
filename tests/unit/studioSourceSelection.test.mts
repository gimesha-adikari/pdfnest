import assert from "node:assert/strict";
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import axios, { AxiosError } from "axios";
import { loadStudioSourceModule } from "../helpers/loadStudioSourceModule";
import * as admission from "../../lib/studio-v2/sourceAdmission";
import * as preparation from "../../lib/security/pdfInputPreparation";
import * as guard from "../../components/studio-v2/studioV2SubmissionGuard";
import { ExecutionError } from "../../lib/execution/types";
import { StudioV2Canvas } from "../../components/studio-v2/StudioV2Canvas";
import * as tiles from "../../lib/studio-v2/tileClient";
import * as popover from "../../components/studio-v2/StudioV2Popover";
import * as toolbar from "../../components/studio-v2/studioV2ToolbarState";
import * as mergeQueue from "../../components/studio-v2/studioV2MergeQueue";
import * as splitSelector from "../../components/studio-v2/StudioV2SplitSelector";
import * as compressPanel from "../../components/studio-v2/StudioV2CompressPanel";
import * as pageSelection from "../../components/studio-v2/studioV2PageSelection";

type API = typeof import("../../lib/studio-v2/api");
type Uploader = typeof import("../../components/pdf/PdfUploader");
type Entry = typeof import("../../components/studio-v2/StudioV2Entry");
type SessionHook = typeof import("../../hooks/studio-v2/useStudioSession");

async function main() {
  const { StudioV2Header } = loadStudioSourceModule<typeof import("../../components/studio-v2/StudioV2Header")>("components/studio-v2/StudioV2Header.tsx", {
    "./StudioV2Popover": popover,
    "./studioV2SubmissionGuard": guard,
    "./studioV2ToolbarState": toolbar,
    "./studioV2MergeQueue": mergeQueue,
    "./StudioV2SplitSelector": splitSelector,
    "./StudioV2CompressPanel": compressPanel,
    "./studioV2PageSelection": pageSelection,
    "@/lib/studio-v2/sourceAdmission": admission,
    "@/components/ui/Logo": { default: () => null },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Studio mounted fixture forbids network"); };
  let posts = 0, inspections = 0, preparations = 0;
  let rejectUpload = false;
  let pendingReply: Promise<{ data: typeof reply }> | null = null;
  const reply = { session: { id: "session" }, document: { id: "document" }, active_version: { id: "version" }, vdm: { pages: [], page_count: 0 } };
  const api = loadStudioSourceModule<API>("lib/studio-v2/api.ts", {
    axios: { default: { ...axios, create: () => ({
      post: async () => {
        posts++;
        if (rejectUpload) throw new AxiosError("internal /private/path", "ERR_BAD_RESPONSE", undefined, undefined,
          { status: 413, statusText: "Too Large", data: { code: "STUDIO_SOURCE_TOO_LARGE", error: "/private/storage/key" }, headers: {}, config: { headers: new axios.AxiosHeaders() } });
        return pendingReply ?? { data: reply };
      },
      get: async () => ({ data: { versions: [], operations: [] } }),
    }) } },
    "./sourceAdmission": admission,
    "@/lib/security/pdfInputPreparation": preparation,
  });
  const uploader = loadStudioSourceModule<Uploader>("components/pdf/PdfUploader.tsx", {
    "@/lib/api": { uploadAndDownloadFile: () => { throw new Error("Unexpected unlock request"); } },
    "@/lib/execution/ExecutionManager": { ExecutionManager: { run: () => { preparations++; throw new Error("Unexpected preparation"); } } },
    "@/lib/execution/types": { ExecutionError },
    "@/lib/pdf/localPreparation": { isPdfCandidate: async () => true, inspectPdf: async () => { inspections++; return false; } },
    "@/lib/security/pdfInputPreparation": preparation,
    "@/components/ui/PasswordField": { default: () => null },
  });
  const { StudioV2Entry } = loadStudioSourceModule<Entry>("components/studio-v2/StudioV2Entry.tsx", {
    "@/components/pdf/PdfUploader": uploader,
    "@/lib/studio-v2/sourceAdmission": admission,
  });
  const { useStudioSession } = loadStudioSourceModule<SessionHook>("hooks/studio-v2/useStudioSession.ts", {
    "@/lib/studio-v2/api": api,
    "@/components/studio-v2/studioV2SubmissionGuard": guard,
  });
  let sessionState!: ReturnType<typeof useStudioSession>;
  function Harness() {
    sessionState = useStudioSession();
    return React.createElement(StudioV2Entry, { isCreating: sessionState.lifecycle === "creating", error: sessionState.error,
      onUpload: sessionState.createSessionFromUpload, onFilesSelected: sessionState.enterStudio });
  }
  const initialHTML = renderToString(React.createElement(Harness));
  assert.match(initialHTML, /PDF source files up to 50 MiB/);
  assert.doesNotMatch(initialHTML, /role="alert"|role="dialog"/);
  const moduleName = "jsdom";
  const { JSDOM } = await import(moduleName);
  const dom = new JSDOM(`<div id="root">${initialHTML}</div>`, { url: "http://127.0.0.1/studio-v2", pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const { hydrateRoot } = await import("react-dom/client");
  const hydrationErrors: unknown[] = [];
  const root = hydrateRoot(document.getElementById("root")!, React.createElement(Harness), { onRecoverableError: error => hydrationErrors.push(error) });
  const file = (size: number) => {
    const result = new File(["%PDF-synthetic"], "synthetic.pdf", { type: "application/pdf" });
    Object.defineProperty(result, "size", { value: size });
    result.arrayBuffer = async () => { throw new Error("Selection must not read source bytes"); };
    return result;
  };
  async function select(selected: File, drop = false) {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    assert.ok(input, "file picker must remain available");
    await act(async () => {
      if (drop) {
        const event = new dom.window.Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: { files: [selected] } });
        input.parentElement!.dispatchEvent(event);
      } else {
        Object.defineProperty(input, "files", { configurable: true, value: [selected] });
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      }
    });
  }
  async function button(label: string) {
    const target = [...document.querySelectorAll("button")].find(item => item.textContent?.includes(label));
    assert.ok(target, `Missing button: ${label}`);
    await act(async () => target.click());
  }
  try {
    await act(async () => { await Promise.resolve(); });
    assert.deepEqual(hydrationErrors, []);
    for (const drop of [false, true]) {
      const rejected = file(admission.MAX_STUDIO_PDF_SOURCE_BYTES + 1);
      await select(rejected, drop);
      assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /50 MiB/);
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(posts, 0);
      assert.equal(inspections + preparations, 0);
      assert.equal(preparation.hasCloudSubmissionInitiated(rejected), false);
      assert.equal(sessionState.lifecycle, "entry");
      const accepted = file(admission.MAX_STUDIO_PDF_SOURCE_BYTES - Number(!drop));
      await select(accepted, drop);
      assert.equal(document.querySelector('[role="alert"]'), null, "valid replacement clears local error");
      assert.match(document.querySelector('[role="dialog"]')?.textContent ?? "", /Cloud upload authorization/);
      assert.equal(posts, 0, "size acceptance does not authorize submission");
      assert.equal(preparation.hasCloudSubmissionInitiated(accepted), false);
      await button("Cancel upload");
      assert.equal(posts, 0);
    }
    const rejectedByBackend = file(32);
    rejectUpload = true;
    await select(rejectedByBackend);
    await button("Authorize Cloud upload");
    assert.equal(posts, 1);
    assert.equal(preparation.hasCloudSubmissionInitiated(rejectedByBackend), true);
    assert.equal(sessionState.lifecycle, "entry", "rejected upload must return to a usable picker");
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /50 MiB/);
    assert.doesNotMatch(document.body.textContent ?? "", /private\/|never uploaded|not uploaded/);
    rejectUpload = false;
    const valid = file(32);
    await select(valid);
    assert.equal(document.querySelector('[role="alert"]'), null);
    await button("Authorize Cloud upload");
    assert.equal(posts, 2);
    assert.equal(sessionState.lifecycle, "ready");
    assert.equal(preparation.hasCloudSubmissionInitiated(valid), true);

    // Late completion after returning to entry cannot revive the cancelled session.
    await act(async()=>root.render(React.createElement(Harness,{key:"late"})));
    let finish!: (result:{data:typeof reply})=>void;
    pendingReply = new Promise(resolve=>{finish=resolve;});
    const lateFile=file(32);
    await select(lateFile);await button("Authorize Cloud upload");
    assert.equal(sessionState.lifecycle,"creating");
    await act(async()=>sessionState.enterStudio());
    await act(async()=>{finish({data:reply});await Promise.resolve();});
    assert.equal(sessionState.lifecycle,"entry");assert.equal(sessionState.session,null);
    assert.equal(preparation.hasCloudSubmissionInitiated(lateFile),true);
    pendingReply=null;

    // The opt-in shared uploader leaves other tools unrestricted.
    let unrelatedAccepted = 0;
    await act(async () => root.render(React.createElement(uploader.default, { bypassEncryptionCheck: true,
      protectedFileHandling: "cloud-session-consent", onFilesAccepted: () => { unrelatedAccepted++; } })));
    await select(file(admission.MAX_STUDIO_PDF_SOURCE_BYTES + 1));
    assert.ok(document.querySelector('[role="dialog"]'));
    await button("Authorize Cloud upload");
    assert.equal(unrelatedAccepted, 1);

    // Real secondary-upload component: reject the entire selection before any
    // queue insertion, busy state or caller-side upload, then allow replacement.
    const pages: [] = [];
    let secondary = 0;
    await act(async () => root.render(React.createElement(StudioV2Header, {
      document: { id: "document", name: "Synthetic", version: "1", pageCount: 1, fileSize: "1 KB", saved: true, syncStatus: "saved" }, pages,
      onUploadMergeAsset: async () => { secondary++; return { id: "asset", document_id: "document", asset_type: "merge_source", byte_size: 16, mime_type: "application/pdf" }; },
    })));
    const mergeButton = document.querySelector<HTMLButtonElement>('[aria-label="Merge and Split PDF"]')!;
    await act(async () => mergeButton.click());
    const input = document.querySelector<HTMLInputElement>('[aria-label="Secondary PDF"]')!;
    assert.ok(input);
    const selectMerge = async (files: File[]) => {
      Object.defineProperty(input, "files", { configurable: true, value: files });
      await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
    };
    await selectMerge([file(32), file(admission.MAX_STUDIO_PDF_SOURCE_BYTES + 1)]);
    assert.equal(secondary, 0);
    assert.equal(input.disabled, false);
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /50 MiB/);
    assert.equal(document.querySelectorAll('[data-testid^="studio-merge-queue-item-"]').length, 1);
    await selectMerge([file(admission.MAX_STUDIO_PDF_SOURCE_BYTES)]);
    assert.equal(secondary, 1);
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(input.disabled, false);
    // Mount the real preview component and its real HTTP error-code parser.
    Object.assign(globalThis,{IntersectionObserver:class { observe(){} disconnect(){} unobserve(){} }});
    const timers:Array<()=>void>=[];
    const originalSetTimeout=dom.window.setTimeout.bind(dom.window);
    dom.window.setTimeout=((handler:TimerHandler,delay?:number)=>{
      if(delay===80 && typeof handler==="function") {timers.push(()=>handler());return 999;}
      return originalSetTimeout(handler,delay);
    }) as typeof dom.window.setTimeout;
    let previewTooLarge=true;
    globalThis.fetch=async (input)=>{
      assert.match(String(input),/^http:\/\/(localhost|127\.0\.0\.1)/);
      return previewTooLarge ? new Response(JSON.stringify({code:"PREVIEW_SOURCE_TOO_LARGE",error:"/private/worker"}),{status:413}) : new Response(new Blob(["synthetic tile"]),{status:200});
    };
    await act(async()=>root.render(React.createElement(StudioV2Canvas,{
      sessionId:"preview-session",versionId:"preview-version",selectedPageId:"p1",zoomScale:1,isPanning:false,
      vdm:{document_id:"doc",page_count:1,pages:[{page_id:"p1",source_page_number:1,is_blank:false,rotation:0,overlays:[],dimensions:{width:100,height:100}}]},
      onZoomIn(){},onZoomOut(){},onFitToScreen(){},onTogglePan(){},
    })));
    assert.ok(timers.length);
    await act(async()=>{timers.shift()?.();await Promise.resolve();});
    assert.match(document.querySelector('[role="alert"]')?.textContent??"",/preview processing limit/);
    assert.doesNotMatch(document.body.textContent??"",/50 MiB|private\/worker/);
    previewTooLarge=false;
    await button("Retry");
    assert.equal(document.querySelector('[role="alert"]'),null);
    assert.ok(document.querySelector('img[src^="blob:"]'));
    tiles.globalTileCache.clear();
    console.log("Studio mounted selection tests passed: SSR/hydration, picker/drop, consent/cancel, backend failure/retry, unchanged shared uploader and secondary import.");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.fetch = originalFetch;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
