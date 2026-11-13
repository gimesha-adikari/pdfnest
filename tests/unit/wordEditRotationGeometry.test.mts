import assert from "node:assert/strict";
import React, { act } from "react";
import type { EditorLayout } from "../../components/editor-v2/model";

type RotationCase = {
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  word: { x: number; y: number; width: number; height: number };
  expected: { left: number; top: number; width: number; height: number };
};

const cases: RotationCase[] = [
  { rotation: 0, pageWidth: 595, pageHeight: 842, word: { x: 130, y: 212.8, width: 55.104, height: 21.984 }, expected: { left: 130, top: 212.8, width: 55.104, height: 21.984 } },
  { rotation: 90, pageWidth: 842, pageHeight: 595, word: { x: 130, y: 212.8, width: 55.104, height: 21.984 }, expected: { left: 607.216, top: 130, width: 21.984, height: 55.104 } },
  { rotation: 180, pageWidth: 595, pageHeight: 842, word: { x: 130, y: 212.8, width: 55.104, height: 21.984 }, expected: { left: 409.896, top: 607.216, width: 55.104, height: 21.984 } },
  { rotation: 270, pageWidth: 842, pageHeight: 595, word: { x: 130, y: 212.8, width: 55.104, height: 21.984 }, expected: { left: 212.8, top: 409.896, width: 21.984, height: 55.104 } },
  { rotation: 0, pageWidth: 495, pageHeight: 700, word: { x: 80, y: 132.8, width: 55.104, height: 21.984 }, expected: { left: 80, top: 132.8, width: 55.104, height: 21.984 } },
  { rotation: 90, pageWidth: 700, pageHeight: 495, word: { x: 80, y: 132.8, width: 55.104, height: 21.984 }, expected: { left: 545.216, top: 80, width: 21.984, height: 55.104 } },
  { rotation: 180, pageWidth: 495, pageHeight: 700, word: { x: 80, y: 132.8, width: 55.104, height: 21.984 }, expected: { left: 359.896, top: 545.216, width: 55.104, height: 21.984 } },
  { rotation: 270, pageWidth: 700, pageHeight: 495, word: { x: 80, y: 132.8, width: 55.104, height: 21.984 }, expected: { left: 132.8, top: 359.896, width: 21.984, height: 55.104 } },
];

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
  dom.window.HTMLCanvasElement.prototype.getContext = (() => ({ measureText: (text: string) => ({ width: text.length * 8 }) })) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;
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
  const rootElement = document.getElementById("root")!;
  const root = createRoot(rootElement);

  for (const [index, testCase] of cases.entries()) {
    const baseline = {
      schema_version: "ocr_v2_editor_layout.v1",
      pages: [{
        page_num: 1,
        width: testCase.pageWidth,
        height: testCase.pageHeight,
        rotation: testCase.rotation,
        source: "NATIVE_EXTRACTION",
        kind: "text",
        elements: [{
          id: `line-${index}`,
          text: "Ministry",
          original_text: "Ministry",
          x: testCase.word.x,
          y: testCase.word.y,
          width: testCase.word.width,
          height: testCase.word.height,
          size: 16,
          font: "helv",
          word_geometry: [{ id: `word-${index}`, text: "Ministry", ...testCase.word }],
        }],
      }],
    } as unknown as EditorLayout;

    await act(async () => {
      root.render(React.createElement(SharedEditor, {
        key: index,
        baseline,
        renderPageVisual: () => null,
        onCompile: () => undefined,
        wordEditMode: "operations",
        wordEditSourceTracker: "owned/test/native.pdf",
      }));
    });
    const hitTarget = document.querySelector<HTMLElement>(`[data-testid="word-hit-target"][data-word-id="word-${index}"]`);
    assert.ok(hitTarget, `rotation ${testCase.rotation} target remains selectable`);
    const actual = {
      left: parseFloat(hitTarget.style.left),
      top: parseFloat(hitTarget.style.top),
      width: parseFloat(hitTarget.style.width),
      height: parseFloat(hitTarget.style.height),
    };
    assert.deepEqual(actual, testCase.expected, `rotation ${testCase.rotation} CropBox position is in the visible page frame`);
    await act(async () => {
      hitTarget.click();
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    const inlineEditor = document.querySelector<HTMLInputElement>(`[data-testid="word-inline-editor"][data-word-id="word-${index}"]`);
    assert.ok(inlineEditor, `rotation ${testCase.rotation} target opens the inline editor`);
    assert.equal(parseFloat(inlineEditor.style.width), testCase.word.width, "rotated text keeps its canonical width for fit validation");
    assert.equal(inlineEditor.style.transform, testCase.rotation ? `rotate(${testCase.rotation}deg)` : "");
  }

  await act(async () => { root.unmount(); });
  dom.window.close();
  console.log("Mounted word-edit overlays use visible coordinates for all rotations and CropBox sizes.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
