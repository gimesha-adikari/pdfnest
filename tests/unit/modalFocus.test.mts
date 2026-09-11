import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { useModalFocus } from "../../hooks/useModalFocus";

async function main() {
    const name = "jsdom";
    const { JSDOM } = await import(name) as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };
    const dom = new JSDOM('<button id="previous">Open account</button><div id="root"></div>');
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    let parentCloses = 0, childCloses = 0;
    function Child({ open, close }: { open: boolean; close: () => void }) {
        const ref = useModalFocus(open, close);
        return open ? React.createElement("div", { ref, id: "child", tabIndex: -1, role: "dialog" },
            React.createElement("button", { id: "child-close", onClick: close }, "Close consent")) : null;
    }
    function Parent({ open }: { open: boolean }) {
        const [child, setChild] = useState(false);
        const ref = useModalFocus(open, () => { parentCloses++; }, child);
        return React.createElement(React.Fragment, null,
            open ? React.createElement("div", { ref, id: "parent", tabIndex: -1, role: "dialog" },
                React.createElement("button", { id: "first" }, "Close account"),
                React.createElement("input", { id: "email" }),
                React.createElement("button", { id: "last", onClick: () => setChild(true) }, "Consent")) : null,
            React.createElement(Child, { open: open && child, close: () => { childCloses++; setChild(false); } }));
    }
    const key = async (value: string, shiftKey = false) => act(async () => {
        document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }));
    });
    document.getElementById("previous")!.focus();
    try {
        await act(async () => root.render(React.createElement(Parent, { open: true })));
        assert.equal(document.activeElement?.id, "parent");
        await key("Tab"); assert.equal(document.activeElement?.id, "first");
        await key("Tab", true); assert.equal(document.activeElement?.id, "last");
        await key("Tab"); assert.equal(document.activeElement?.id, "first");
        document.getElementById("last")!.focus();
        await act(async () => document.getElementById("last")!.click());
        assert.equal(document.activeElement?.id, "child");
        await key("Escape"); assert.equal(childCloses, 1); assert.equal(parentCloses, 0);
        assert.equal(document.activeElement?.id, "last");
        await key("Escape"); assert.equal(parentCloses, 1);
        await act(async () => root.render(React.createElement(Parent, { open: false })));
        assert.equal(document.activeElement?.id, "previous");
        await key("Escape"); assert.equal(parentCloses, 1, "closed dialog removes its handler");
    } finally { await act(async () => root.unmount()); dom.window.close(); }
    console.log("Modal focus, nested Escape isolation, Tab containment and cleanup passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
