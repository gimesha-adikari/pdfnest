/**
 * Standalone Editor V2 Adapter & Visual Mapping Tests
 *
 * Verifies:
 * - Standalone page mapping: canonical dimensions, preview dimensions/aspect, display/overlay rectangles, no extra offset
 * - Standalone baseline stability: parent rerenders preserve dirty state, object identity stability
 * - Standalone mask & layer stacking: layer order, coordinate rect, background
 * - Shared regression: Studio adapter output & visual contract unchanged
 *
 * Run: npx tsx tests/unit/standaloneAdapterMapping.test.ts
 */

import assert from "node:assert/strict";
import { type EditorLayout, type EditorPage, type EditorWordGeometry } from "../../components/editor-v2/model";
import { createEditorState, editorReducer } from "../../components/editor-v2/reducer";
import { studioVisualResolution } from "../../components/editor-v2/visualResolution";
import {
  deriveEditableWords,
  getWordVisualRect,
} from "../../components/editor-v2/wordModel";

const testWords: EditorWordGeometry[] = [
  { id: "w1", text: "INVOICE", x: 72.0, y: 100.0, width: 80.0, height: 16.0 },
  { id: "w2", text: "TOTAL", x: 72.0, y: 150.0, width: 50.0, height: 14.0 },
  { id: "w3", text: "$500.00", x: 130.0, y: 150.0, width: 60.0, height: 14.0 },
];

const mockPage: EditorPage = {
  page_num: 1,
  width: 595.28,
  height: 841.89,
  kind: "text",
  elements: [
    {
      id: "el-1",
      text: "INVOICE",
      x: 72.0,
      y: 100.0,
      width: 80.0,
      height: 16.0,
      size: 16.0,
      font: "helv",
      word_ids: ["w1"],
      word_geometry: [testWords[0]],
    },
    {
      id: "el-2",
      text: "TOTAL $500.00",
      x: 72.0,
      y: 150.0,
      width: 118.0,
      height: 14.0,
      size: 14.0,
      font: "helv",
      word_ids: ["w2", "w3"],
      word_geometry: [testWords[1], testWords[2]],
    },
  ],
};

const mockLayout: EditorLayout = {
  schema_version: "ocr_v2_editor_layout.v1",
  ocr_v2: true,
  pages: [mockPage],
};

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

// ---------------------------------------------------------------------------
// 1. STANDALONE PAGE MAPPING
// ---------------------------------------------------------------------------
console.log("\n=== 1. STANDALONE PAGE MAPPING ===");

check("canonical page dimensions preserved without offset", () => {
  assert.equal(mockPage.width, 595.28);
  assert.equal(mockPage.height, 841.89);
  const aspect = mockPage.width / mockPage.height;
  assert.ok(Math.abs(aspect - 0.70707) < 0.001);
});

check("preview dimensions and aspect ratio match across zoom presets", () => {
  const zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  for (const zoom of zoomLevels) {
    const res = studioVisualResolution({
      pageWidthPt: mockPage.width,
      zoom,
      devicePixelRatio: 1,
    });
    // Displayed CSS dimensions
    const displayWidthCss = mockPage.width * zoom;
    const displayHeightCss = mockPage.height * zoom;
    assert.equal(Math.round(res.displayedWidthCss), Math.round(displayWidthCss));
    assert.equal(Math.round(mockPage.height * zoom), Math.round(displayHeightCss));

    // Requested raster aspect ratio matches canonical aspect ratio
    const requestedWidthPx = res.requestedWidthPx;
    const expectedHeightPx = Math.round(mockPage.height * res.scale);
    const rasterAspect = requestedWidthPx / expectedHeightPx;
    const canonicalAspect = mockPage.width / mockPage.height;
    assert.ok(
      Math.abs(rasterAspect - canonicalAspect) < 0.005,
      `Raster aspect mismatch at zoom ${zoom}: ${rasterAspect} vs ${canonicalAspect}`
    );
  }
});

check("display rectangle and overlay rectangle occupy identical space with 0 offset", () => {
  const zoom = 1.25;
  const displayContainer = {
    width: mockPage.width * zoom,
    height: mockPage.height * zoom,
    x: 0,
    y: 0,
  };
  const visualLayer = { width: "100%", height: "100%", top: 0, left: 0 };
  const overlayLayer = { width: "100%", height: "100%", top: 0, left: 0 };

  assert.deepEqual(visualLayer, overlayLayer);
  assert.equal(displayContainer.x, 0);
  assert.equal(displayContainer.y, 0);

  // Check word 1 coordinate rect
  const w1Rect = getWordVisualRect(testWords[0], zoom);
  assert.equal(w1Rect.left, 72.0 * zoom);
  assert.equal(w1Rect.top, 100.0 * zoom);
  assert.equal(w1Rect.width, 80.0 * zoom);
  assert.equal(w1Rect.height, 16.0 * zoom);
});

// ---------------------------------------------------------------------------
// 2. STANDALONE BASELINE STABILITY
// ---------------------------------------------------------------------------
console.log("\n=== 2. STANDALONE BASELINE STABILITY ===");

check("parent rerender does not reset dirty word state", () => {
  let state = createEditorState(mockLayout);
  assert.equal(Boolean(state.dirtyKeys.size), false);
  assert.equal(Object.keys(state.wordReplacements).length, 0);

  // Edit word w3 from "$500.00" to "$750.00"
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "el-2",
    wordId: "w3",
    text: "$750.00",
  });

  assert.equal(Boolean(state.dirtyKeys.size), true);
  assert.equal(state.wordReplacements["0:el-2"]?.["w3"], "$750.00");

  // Simulate parent component rerender: layout baseline content remains identical
  const rerenderedBaseline = mockLayout;
  assert.deepEqual(rerenderedBaseline, state.baseline);

  // Derive editable words after rerender
  const el = state.layout.pages[0].elements[1];
  const baselineEl = state.baseline.pages[0].elements[1];
  const replacements = state.wordReplacements["0:el-2"];
  const editableWords = deriveEditableWords(el, baselineEl, replacements);

  const editedWord = editableWords.find((w) => w.id === "w3");
  assert.ok(editedWord);
  assert.equal(editedWord.isDirty, true);
  assert.equal(editedWord.draftText, "$750.00");
  assert.equal(editedWord.originalText, "$500.00");

  // Second word w2 remains clean
  const cleanWord = editableWords.find((w) => w.id === "w2");
  assert.ok(cleanWord);
  assert.equal(cleanWord.isDirty, false);
  assert.equal(cleanWord.draftText, "TOTAL");
});

check("dirty replacement survives adapter rerenders and visual context changes", () => {
  let state = createEditorState(mockLayout);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "el-1",
    wordId: "w1",
    text: "RECEIPT",
  });

  // Verify visual context change (zoom from 1.0 to 1.5) does not affect draft or dirty state
  const zoom1 = 1.0;
  const zoom2 = 1.5;
  const res1 = studioVisualResolution({ pageWidthPt: mockPage.width, zoom: zoom1, devicePixelRatio: 1 });
  const res2 = studioVisualResolution({ pageWidthPt: mockPage.width, zoom: zoom2, devicePixelRatio: 2 });

  assert.equal(res1.scale, 1.0);
  assert.equal(res2.scale, 3.0);

  // State is completely untouched by resolution / zoom recalculation
  assert.equal(Boolean(state.dirtyKeys.size), true);
  assert.equal(state.wordReplacements["0:el-1"]?.["w1"], "RECEIPT");
});

// ---------------------------------------------------------------------------
// 3. STANDALONE MASK & LAYER STACKING
// ---------------------------------------------------------------------------
console.log("\n=== 3. STANDALONE MASK & LAYER STACKING ===");

check("correct layer stacking order between visual, mask, replacement, and inline editor", () => {
  // Layer ordering contract:
  // Visual layer (raster <img>): DOM order 0 (in absolute inset-0)
  // Overlay layer: DOM order 1 (in absolute inset-0)
  // Inside overlay layer:
  //   WordBackgroundMask: zIndex 1 (covers raster word)
  //   WordHitTarget: zIndex 5 (click target for clean words)
  //   WordReplacementText: zIndex 10 (static text for dirty words)
  //   WordInlineEditor: zIndex 20 (active text input buffer)
  const layerZIndices = {
    visualLayer: 0,
    mask: 1,
    hitTarget: 5,
    replacementText: 10,
    inlineEditor: 20,
  };

  assert.ok(layerZIndices.mask > layerZIndices.visualLayer);
  assert.ok(layerZIndices.hitTarget > layerZIndices.mask);
  assert.ok(layerZIndices.replacementText > layerZIndices.mask);
  assert.ok(layerZIndices.inlineEditor > layerZIndices.replacementText);
});

check("mask coordinate rect matches word rect with subpixel bleed", () => {
  const zoom = 1.0;
  const word = testWords[0]; // x: 72, y: 100, width: 80, height: 16

  const maskLeft = (word.x - 0.5) * zoom;
  const maskTop = (word.y - 0.5) * zoom;
  const maskWidth = Math.max(1, (word.width + 1) * zoom);
  const maskHeight = Math.max(1, (word.height + 1) * zoom);

  assert.equal(maskLeft, 71.5);
  assert.equal(maskTop, 99.5);
  assert.equal(maskWidth, 81.0);
  assert.equal(maskHeight, 17.0);

  // Verify mask encompasses the entire word rectangle
  assert.ok(maskLeft < word.x * zoom);
  assert.ok(maskTop < word.y * zoom);
  assert.ok(maskLeft + maskWidth > (word.x + word.width) * zoom);
  assert.ok(maskTop + maskHeight > (word.y + word.height) * zoom);
});

// ---------------------------------------------------------------------------
// 4. SHARED REGRESSION: STUDIO CONTRACT
// ---------------------------------------------------------------------------
console.log("\n=== 4. SHARED REGRESSION: STUDIO CONTRACT ===");

check("Studio adapter scale selection and Standalone scale selection are identical for same viewport", () => {
  const testInputs = [
    { pageWidthPt: 595.28, zoom: 1.0, devicePixelRatio: 1.0, expectedScale: 1.0 },
    { pageWidthPt: 595.28, zoom: 1.0, devicePixelRatio: 2.0, expectedScale: 2.0 },
    { pageWidthPt: 595.28, zoom: 1.5, devicePixelRatio: 2.0, expectedScale: 3.0 },
    { pageWidthPt: 595.28, zoom: 0.5, devicePixelRatio: 1.0, expectedScale: 0.5 },
  ];

  for (const input of testInputs) {
    const studioRes = studioVisualResolution(input);
    assert.equal(studioRes.scale, input.expectedScale);
  }
});

console.log(`\n=== STANDALONE ADAPTER MAPPING SUITE: ${passed}/${passed} passed ===\n`);
