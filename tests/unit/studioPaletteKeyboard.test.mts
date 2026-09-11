import assert from "node:assert/strict";
import React, { act } from "react";
import { StudioV2CommandPalette } from "../../components/studio-v2/StudioV2CommandPalette";

async function main() {
  // jsdom is already installed by the application's DOMPurify dependency.
  const moduleName = "jsdom";
  const { JSDOM } = await import(moduleName) as { JSDOM: new (html: string) => { window: Window & typeof globalThis; } };
  const dom = new JSDOM('<button id="previous">Previous</button><div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let rotations = 0, closes = 0;
  const render = (enabled: boolean, open = true) => root.render(React.createElement(StudioV2CommandPalette, { isOpen: open, onClose: () => { closes++; }, canRotatePage: enabled, onRotatePage: () => { rotations++; } }));
  document.getElementById("previous")!.focus();
  try {
    await act(async () => { render(false); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    const input = document.querySelector("input")!;
    const key = async (target: Element, key: string, shiftKey = false) => { await act(async () => { target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })); }); };
    for (let i = 0; i < 7; i++) await key(input, "ArrowDown");
    await key(input, "Enter");
    assert.equal(rotations, 0, "disabled Rotate cannot be dispatched by Enter");
    assert.equal(closes, 0);
    assert.equal(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal"), "true");
    await act(async () => { render(true); });
    const close = document.querySelector<HTMLButtonElement>('[aria-label="Close command palette"]')!;
    close.focus(); await key(close, "Enter");
    assert.equal(rotations, 0, "Enter on Close must not run the highlighted command");
    input.focus(); await key(input, "Enter"); assert.equal(rotations, 1);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")].filter(button => button.closest('[role="dialog"]'));
    const last = buttons[buttons.length - 1]; last.focus(); await key(last, "Tab"); assert.ok(document.activeElement === close, "Tab wraps to Close");
    await key(close, "Tab", true); assert.ok(document.activeElement === last, "Shift+Tab wraps to the last action");
    await act(async () => { render(true, false); });
    assert.equal(document.activeElement?.id, "previous");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
  console.log("Studio palette honors disabled actions, focused controls, modal semantics and focus restoration.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
