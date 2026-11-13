import assert from "node:assert/strict";
import React from "react";
import { act } from "react";
import type { EditorLayout } from "../../components/editor-v2/model";

async function main() {
  const jsdomModule = "jsdom";
  const { JSDOM } = await import(jsdomModule);
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/edit-pdf/workspace" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.HTMLCanvasElement.prototype.getContext = (() => ({
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  dom.window.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number;
  dom.window.cancelAnimationFrame = (id: number) => clearTimeout(id);
  Object.assign(globalThis, {
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  });

  const [{ SharedEditor }, { createRoot }] = await Promise.all([
    import("../../components/editor-v2/SharedEditor"),
    import("react-dom/client"),
  ]);
  const baseline: EditorLayout = {
    schema_version: "ocr_v2_editor_layout.v1",
    word_edit_protocols: ["platen_word_edits.v1"],
    word_edit_baseline: {
      extraction_job_id: "extract-blur-test",
      digest: `sha256:${"a".repeat(64)}`,
      source_sha256: "b".repeat(64),
      engine_fingerprint: `sha256:${"c".repeat(64)}`,
      algorithm_version: "general_editor_word_baseline.v1",
    },
    pages: [{
      page_num: 1,
      width: 595,
      height: 842,
      kind: "text",
      elements: [{
        id: "line-1",
        text: "Ministry of Education",
        original_text: "Ministry of Education",
        x: 20,
        y: 30,
        width: 180,
        height: 18,
        size: 12,
        font: "helv",
        word_geometry: [
          { id: "word-ministry", text: "Ministry", x: 20, y: 30, width: 50, height: 18 },
          { id: "word-of", text: "of", x: 75, y: 30, width: 12, height: 18 },
          { id: "word-education", text: "Education", x: 92, y: 30, width: 60, height: 18 },
        ],
      }],
    }],
  };

  const revisionEvents: number[] = [];
  const compileEvents: Array<{ revision: number; replacement: string }> = [];
  let currentRevision = -1;
  let candidateRevision: number | null = null;
  function Parent() {
    return React.createElement(SharedEditor, {
        baseline,
        renderPageVisual: () => null,
        onCompile: () => { throw new Error("word mode must not fall back to full-layout compile"); },
        wordEditMode: "operations",
        wordEditSourceTracker: "owned/test/source.pdf",
        compileLabel: "Prepare export",
        onCompileWordEdits: (request, revision) => {
          compileEvents.push({ revision, replacement: request.edits[0]?.replacement_text ?? "" });
          candidateRevision = revision;
          if (candidateRevision !== currentRevision) candidateRevision = null;
        },
        onRevisionChange: (revision) => {
          revisionEvents.push(revision);
          currentRevision = revision;
          if (candidateRevision !== null && candidateRevision !== revision) candidateRevision = null;
        },
      });
  }

  const root = createRoot(document.getElementById("root")!);
  await act(async () => { root.render(React.createElement(Parent)); });
  await act(async () => { document.querySelector<HTMLElement>('[data-testid="word-hit-target"][data-word-id="word-ministry"]')!.click(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  const input = document.querySelector<HTMLInputElement>('[data-testid="word-inline-editor"]');
  assert.ok(input, "selecting the word opens the real inline editor");

  const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    input.focus();
    input.select();
    valueSetter.call(input, "hello");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.equal(document.querySelector('[data-testid="active-word-draft"]')?.textContent, "hello");
  const draftRevision = currentRevision;

  const prepareButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Prepare export"));
  assert.ok(prepareButton, "the mounted editor exposes Prepare export");
  await act(async () => {
    // A browser click first transfers focus (committing the inline input on
    // blur), then dispatches click to Prepare export.
    prepareButton.focus();
    prepareButton.click();
  });

  assert.deepEqual(compileEvents, [{ revision: draftRevision, replacement: "hello" }]);
  assert.deepEqual(revisionEvents, [0, draftRevision], "the Prepare blur adds no unrelated revision notification");
  assert.equal(currentRevision, draftRevision, "blur history commit preserves the revision used by the Prepare event");
  assert.equal(candidateRevision, draftRevision, "a candidate prepared from the current draft is not invalidated by its blur commit");

  await act(async () => { root.unmount(); });
  dom.window.close();
  console.log("Mounted SharedEditor prepare-on-blur candidate revision regression passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
