import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import * as markupFind from "../../lib/markupFind";
import * as markupSelection from "../../lib/markupSelection";

const require = createRequire(import.meta.url);
const componentRoot = process.env.MARKUP_PREVIEW_SOURCE_ROOT || ".";
const componentPath = path.resolve(componentRoot, "components/tools/MarkupPdfPreview.tsx");
const source = fs.readFileSync(componentPath, "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
});

type SyntheticPdfTextItem = {
    str: string;
    dir: string;
    transform: number[];
    width: number;
    height: number;
    fontName: string;
    hasEOL: boolean;
};

function textItem(str: string): SyntheticPdfTextItem {
    return { str, dir: "ltr", transform: [1, 0, 0, 1, 72, 700], width: str.length * 8, height: 12, fontName: "F1", hasEOL: false };
}

let activeItems: SyntheticPdfTextItem[] = [];

class SyntheticTextLayer {
    constructor(private readonly options: { textContentSource: { items: SyntheticPdfTextItem[] }; container: HTMLElement }) {}

    async render(): Promise<void> {
        this.options.container.replaceChildren();
        for (const item of this.options.textContentSource.items) {
            const span = document.createElement("span");
            span.textContent = item.str;
            this.options.container.append(span);
        }
    }

    cancel(): void {}
}

const pdfjsMock = {
    GlobalWorkerOptions: { workerSrc: "" },
    TextLayer: SyntheticTextLayer,
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
                getViewport: () => ({ width: 612, height: 792, rotation: 0 }),
                getTextContent: async () => ({ items: activeItems }),
                getOperatorList: async () => ({ fnArray: [] }),
                cleanup() {},
            }),
            async destroy() {},
        }),
        async destroy() {},
    }),
};

const loaded = { exports: {} };
const iconMock = new Proxy({}, { get: () => () => null });
new Function("require", "module", "exports", outputText)(
    (name: string) => {
        if (name === "pdfjs-dist") return pdfjsMock;
        if (name === "@/lib/markupFind") return markupFind;
        if (name === "@/lib/markupSelection") return markupSelection;
        if (name === "@/lib/preview/usePreview") return { usePreview: () => ({ src: null, isLoading: false, error: null, metadata: { pageCount: 1 }, retry() {} }) };
        if (name === "lucide-react") return iconMock;
        if (name.startsWith("@/")) throw new Error(`Unexpected application dependency: ${name}`);
        return require(name);
    },
    loaded,
    loaded.exports,
);

const MarkupPdfPreview = (loaded.exports as { default: React.ComponentType<Record<string, unknown>> }).default;

async function renderPreview(items: SyntheticPdfTextItem[], props: Record<string, unknown>) {
    activeItems = items;
    document.body.innerHTML = '<div id="root"></div>';
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const file = {
        name: "synthetic-text-sequence.pdf",
        type: "application/pdf",
        arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
    } as File;

    await act(async () => {
        root.render(React.createElement(MarkupPdfPreview, { file, ...props }));
        for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    });

    return { root, layer: document.querySelector('[data-testid="markup-pdf-text-layer"]') as HTMLElement | null };
}

async function main(): Promise<void> {
    const jsdomPackage = "jsdom";
    const { JSDOM } = await import(jsdomPackage);
    const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/highlight-pdf-v2/workspace" });
    Object.assign(globalThis, {
        window: dom.window,
        document: dom.window.document,
        HTMLElement: dom.window.HTMLElement,
        Node: dom.window.Node,
        IS_REACT_ACT_ENVIRONMENT: true,
    });

    const findStates: Array<{ count: number; activeIndex: number; current: { text: string; source: string } | null }> = [];
    const previewStates: Array<{ status: string; pageHasSelectableText: boolean; pageHasScannedContent: boolean }> = [];
    const rendered = await renderPreview(
        [textItem("PLATEN"), textItem(" "), textItem("PDF")],
        {
            findQuery: "PLATEN PDF",
            onFindStateChange: (state: (typeof findStates)[number]) => findStates.push(state),
            onStateChange: (state: (typeof previewStates)[number]) => previewStates.push(state),
        },
    );

    assert.ok(rendered.layer, "the mounted PDF preview renders its native text layer");
    const spans = Array.from(rendered.layer!.children) as HTMLElement[];
    assert.deepEqual(spans.map((span) => ({
        index: span.dataset.textItemIndex,
        text: span.textContent,
        matched: span.dataset.findMatch === "true",
    })), [
        { index: "0", text: "PLATEN", matched: true },
        { index: "1", text: " ", matched: true },
        { index: "2", text: "PDF", matched: true },
    ], "the actual preview must map every PDF.js item to its rendered span and highlight both phrase segments");
    assert.deepEqual(
        spans.filter((span) => span.dataset.findMatch === "true" && Boolean(span.textContent?.trim())).map((span) => span.textContent),
        ["PLATEN", "PDF"],
        "the Find geometry range must include both visible text segments, not stop at the whitespace span",
    );
    assert.ok(spans[0].style.backgroundColor, "the first visible phrase segment keeps the active-match highlight");
    assert.ok(spans[2].style.backgroundColor, "the second visible phrase segment receives the active-match highlight");
    assert.equal(rendered.layer!.getAttribute("aria-label"), "Selectable PDF text");
    assert.equal(rendered.layer!.style.pointerEvents, "auto", "native text selection remains enabled for ordinary PDF text");
    assert.deepEqual(findStates.at(-1), {
        count: 1,
        activeIndex: 0,
        current: { text: "PLATEN PDF", page: 1, source: "native" },
    });
    assert.equal(previewStates.at(-1)?.pageHasSelectableText, true);
    await act(async () => rendered.root.unmount());

    const whitespaceStates: Array<{ status: string; pageHasSelectableText: boolean; pageHasScannedContent: boolean }> = [];
    const whitespaceOnly = await renderPreview([textItem(" "), textItem("\t")], {
        onStateChange: (state: (typeof whitespaceStates)[number]) => whitespaceStates.push(state),
    });
    assert.ok(whitespaceOnly.layer, "whitespace-only PDF text content still renders its text layer");
    assert.equal(whitespaceOnly.layer!.getAttribute("aria-label"), null, "whitespace-only content must not be exposed as selectable text");
    assert.equal(whitespaceOnly.layer!.style.pointerEvents, "none", "whitespace-only content must not enable native selection");
    assert.equal(whitespaceStates.at(-1)?.pageHasSelectableText, false);
    assert.equal(whitespaceStates.at(-1)?.pageHasScannedContent, true);
    await act(async () => whitespaceOnly.root.unmount());
    dom.window.close();

    console.log("PASS: mounted MarkupPdfPreview aligns synthetic PDF.js text items and rendered spans, highlights both phrase segments, preserves native selection, and rejects whitespace-only text as selectable");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
