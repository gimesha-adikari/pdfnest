import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { StudioV2Workspace } from "../../components/studio-v2/StudioV2Workspace";
import type { StudioVDMDTO, VDMPageDescriptorDTO } from "../../lib/studio-v2/api";
import type { DocumentInfo } from "../../components/studio-v2/types";

async function main() {
  const jsdomPackage = "jsdom";
  const { JSDOM } = await import(jsdomPackage) as { JSDOM: new (html: string, options?: object) => { window: Window & typeof globalThis; } };
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true, url: "http://localhost" });
  let visiblePageId = "p2";
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }) });
  const rect = (top: number, left: number, width: number, height: number) => ({ x: left, y: top, top, right: left + width, bottom: top + height, left, width, height, toJSON() { return this; } });
  Object.defineProperty(dom.window.HTMLElement.prototype, "getBoundingClientRect", {
    value(this: HTMLElement) {
      if (this.classList.contains("studio-v2-canvas")) return rect(0, 0, 300, 400);
      if (this.dataset.pageId) return this.dataset.pageId === visiblePageId ? rect(0, 0, 240, 400) : rect(500, 0, 240, 400);
      return rect(0, 0, 0, 0);
    },
    configurable: true,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", { value(this: HTMLElement) { visiblePageId = this.dataset.pageId ?? visiblePageId; }, configurable: true });
  class TestIntersectionObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Object.assign(globalThis, { IntersectionObserver: TestIntersectionObserver });

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const initialPages: VDMPageDescriptorDTO[] = ["p1", "p2", "p3", "p4"].map((pageId, index) => ({
    page_id: pageId,
    source_page_number: index + 1,
    is_blank: true,
    rotation: 0,
    overlays: [],
  }));
  const documentInfo: DocumentInfo = {
    id: "doc-1",
    name: "Studio selection fixture",
    version: "1",
    pageCount: initialPages.length,
    fileSize: "1 KB",
    saved: true,
    syncStatus: "saved",
  };
  let latestPages = initialPages;
  let latestSelectedPageId = "p2";
  let deleteTarget: string | undefined;
  let rejectNextMove = false;
  let pauseNextMove = false;
  let releasePausedMove: (() => void) | undefined;
  let replaceDocument: () => void = () => undefined;
  let removeP2: () => void = () => undefined;

  function Harness() {
    const [pages, setPages] = useState(initialPages);
    const [selectedPageId, setSelectedPageId] = useState("p2");
    const [document, setDocument] = useState(documentInfo);
    const [sessionId, setSessionId] = useState<string | null>(null);
    latestPages = pages;
    latestSelectedPageId = selectedPageId;
    const vdm: StudioVDMDTO = { document_id: document.id, page_count: pages.length, pages };
    replaceDocument = () => {
      setDocument({ ...documentInfo, id: "doc-2" });
      setSessionId("session-2");
      setPages(initialPages);
      setSelectedPageId("p2");
    };
    removeP2 = () => setPages((current) => current.filter((page) => page.page_id !== "p2"));
    return React.createElement(StudioV2Workspace, {
      document,
      sessionId,
      versionId: null,
      vdm,
      selectedPageId,
      activeTool: "organize",
      inspectorTab: "properties",
      history: [],
      zoomScale: 1,
      isPanning: false,
      onSelectTool() {},
      onSelectInspectorTab() {},
      onSelectPage: setSelectedPageId,
      onZoomIn() {},
      onZoomOut() {},
      onFitToScreen() {},
      onTogglePan() {},
      onMovePageEarlier: async () => {
        setPages((current) => {
          const reordered = [...current];
          const index = reordered.findIndex((page) => page.page_id === selectedPageId);
          [reordered[index], reordered[index - 1]] = [reordered[index - 1], reordered[index]];
          return reordered;
        });
        return true;
      },
      onMovePageLater: async () => {
        if (pauseNextMove) {
          pauseNextMove = false;
          return new Promise<boolean>((resolve) => { releasePausedMove = () => resolve(true); });
        }
        if (rejectNextMove) {
          rejectNextMove = false;
          return false;
        }
        setPages((current) => {
          const reordered = [...current];
          const index = reordered.findIndex((page) => page.page_id === selectedPageId);
          [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
          return reordered;
        });
        return true;
      },
      onDeletePage: (pageId: string) => { deleteTarget = pageId; },
    });
  }

  try {
    await act(async () => root.render(React.createElement(Harness)));
    const moveLater = [...document.querySelectorAll<HTMLButtonElement>(".studio-v2-context-bar button")]
      .find((button) => button.textContent?.trim() === "Move later");
    assert.ok(moveLater, "the real Studio context toolbar renders Move later");
    await act(async () => moveLater.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 220)));

    assert.deepEqual(latestPages.map((page) => page.page_id), ["p1", "p3", "p2", "p4"], "the mounted Studio callback reorders p2 downward");
    const selectedOptions = [...document.querySelectorAll<HTMLElement>('.studio-v2-wide-inspector .studio-v2-organize-grid [role="option"][aria-selected="true"]')];
    assert.equal(selectedOptions.length, 1);
    assert.equal(latestSelectedPageId, "p2");
    assert.match(selectedOptions[0].textContent ?? "", /Page 3/, "the real Inspector still selects p2 after it moves to page 3");

    const deleteButton = [...document.querySelectorAll<HTMLButtonElement>(".studio-v2-wide-inspector button")]
      .find((button) => button.textContent?.includes("Delete selected page"));
    assert.ok(deleteButton, "the real Studio Inspector renders its selected-page Delete action");
    await act(async () => deleteButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(typeof deleteTarget, "string", "Delete must receive a PageID rather than the click event");
    assert.equal(deleteTarget, "p2", "Delete receives the selected logical PageID after a downward reorder");

    const moveEarlier = [...document.querySelectorAll<HTMLButtonElement>(".studio-v2-context-bar button")]
      .find((button) => button.textContent?.trim() === "Move earlier");
    assert.ok(moveEarlier);
    await act(async () => moveEarlier.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 220)));
    assert.deepEqual(latestPages.map((page) => page.page_id), ["p1", "p2", "p3", "p4"]);
    assert.equal(latestSelectedPageId, "p2");
    assert.match(document.querySelector('.studio-v2-wide-inspector .studio-v2-organize-grid [aria-selected="true"]')?.textContent ?? "", /Page 2/, "upward reorder retains p2");

    rejectNextMove = true;
    await act(async () => moveLater.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    const canvas = document.querySelector<HTMLElement>(".studio-v2-canvas");
    assert.ok(canvas);
    await act(async () => {
      visiblePageId = "p3";
      canvas.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
    });
    assert.match(document.querySelector('.studio-v2-wide-inspector .studio-v2-organize-grid [aria-selected="true"]')?.textContent ?? "", /Page 3/, "manual scroll selection resumes after a rejected reorder");
    assert.equal(latestSelectedPageId, "p3");

    const selectP2 = [...document.querySelectorAll<HTMLButtonElement>('.studio-v2-wide-inspector .studio-v2-organize-grid [role="option"]')]
      .find((button) => button.textContent?.includes("Page 2"));
    assert.ok(selectP2);
    await act(async () => selectP2.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.match(document.querySelector('.studio-v2-wide-inspector .studio-v2-organize-grid [aria-selected="true"]')?.textContent ?? "", /Page 2/, "manual page selection remains functional");

    pauseNextMove = true;
    await act(async () => moveLater.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => replaceDocument());
    assert.equal(typeof releasePausedMove, "function");
    await act(async () => releasePausedMove?.());
    const replacementCanvas = document.querySelector<HTMLElement>(".studio-v2-canvas");
    assert.ok(replacementCanvas);
    await act(async () => {
      visiblePageId = "p3";
      replacementCanvas.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
    });
    assert.match(document.querySelector('.studio-v2-wide-inspector .studio-v2-organize-grid [aria-selected="true"]')?.textContent ?? "", /Page 3/, "a late reorder completion cannot keep the old document selection guard active");
    assert.equal(latestSelectedPageId, "p3");

    const selectReplacementP2 = [...document.querySelectorAll<HTMLButtonElement>('.studio-v2-wide-inspector .studio-v2-organize-grid [role="option"]')]
      .find((button) => button.textContent?.includes("Page 2"));
    assert.ok(selectReplacementP2);
    await act(async () => selectReplacementP2.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => removeP2());
    const targetMissingCanvas = document.querySelector<HTMLElement>(".studio-v2-canvas");
    assert.ok(targetMissingCanvas);
    await act(async () => {
      visiblePageId = "p3";
      targetMissingCanvas.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
    });
    assert.equal(latestSelectedPageId, "p3", "the visible page is selectable after its old pending target disappears");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
  console.log("Mounted Studio V2 components preserve PageID through reorder, Delete, failure recovery, document replacement, and target removal.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
