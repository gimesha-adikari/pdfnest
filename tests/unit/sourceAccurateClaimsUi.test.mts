import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as registry from "../../lib/toolsData";
import * as retention from "../../lib/fileRetentionCopy";
import * as constants from "../../lib/constants";
import * as aboutCount from "../../lib/aboutToolCount";
import { fallbackHomeContent } from "../../lib/contentHome";
import { fallbackSubscribeContent } from "../../lib/contentSubscribe";
import * as siteUrl from "../../lib/siteUrl";
import * as developmentTools from "../../lib/ocrV2DevelopmentTools";

const require = createRequire(import.meta.url);
function load<T>(file: string, mocks: Record<string, unknown>): T {
    const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const loaded = { exports: {} };
    new Function("require", "module", "exports", outputText)((name: string) => {
        if (name in mocks) return mocks[name];
        if (name.startsWith("@/") || name.startsWith("next/")) throw new Error(`Unmocked import: ${name}`);
        return require(name);
    }, loaded, loaded.exports);
    return loaded.exports as T;
}
const empty = () => null;
const component = <P extends object>(value: React.ComponentType<P>) => ({ __esModule: true, default: value });
let network = 0;
globalThis.fetch = async () => { network++; throw new Error("Network is forbidden in F-18 copy tests"); };
const staleTool = {
    title: "PDF to PowerPoint", href: "/pdf-to-powerpoint", category: "convert",
    description: "Fully editable text and graphics", seoDescription: "Fully editable slides",
    faq: [{ question: "Can I edit?", answer: "Everything is editable" }], features: ["Editable text boxes"],
};
const api = { fetchJson: async (path: string) => {
    if (path === "/site-content/tools") return [staleTool];
    if (path === "/site-content/about") return {
        SecurityTitle: "Security & Privacy Guarantee", SecurityDescription: "No uploaded document content is permanently stored.",
        HighlightsJson: JSON.stringify([{ title: "Privacy First", description: "Files are never stored permanently." }]),
    };
    if (path === "/site-content/subscribe") return {
        securityTags: "Secure transfers,No permanent storage,Automatic cleanup,Custom safe tag",
        faqsJson: JSON.stringify([{ q: "Are my files stored?", a: "No. Files are automatically deleted after processing." }, { q: "Unrelated question", a: "Unchanged answer" }]),
    };
    if (path === "/site-content/home") return {};
    throw new Error(`Unexpected API fixture: ${path}`);
} };
const normalization = load<typeof import("../../lib/server/tools")>("lib/server/tools.ts", {
    "@/lib/api": api, "@/lib/toolsData": registry, "@/lib/ocrV2DevelopmentTools": developmentTools,
});
const tool = (await normalization.getToolBySlug("/pdf-to-powerpoint"))!;
const seo = load<typeof import("../../lib/seo")>("lib/seo.ts", {
    "./server/tools": normalization, "./siteUrl": siteUrl, "./ocrV2DevelopmentTools": developmentTools,
});
const metadata = await seo.getToolMetadata("/pdf-to-powerpoint");
assert.match(String(metadata.description), /image-based/);
assert.equal(metadata.description, tool.seoDescription);
assert.equal(metadata.openGraph!.description, tool.seoDescription);
assert.equal(metadata.twitter!.description, tool.seoDescription);
assert.match(String(metadata.alternates!.canonical), /\/pdf-to-powerpoint$/);
const tools = { useTools: () => ({ tools: registry.NAV_TOOLS_FALLBACK, totalCount: registry.TOTAL_TOOL_COUNT, getToolByHref: () => tool }) };
const common = {
    "@/lib/fileRetentionCopy": retention, "@/lib/constants": constants, "@/lib/api": api,
    "@/lib/toolsData": registry, "@/lib/aboutToolCount": aboutCount, "@/context/ToolContext": tools,
    "@/lib/contentHome": { fallbackHomeContent }, "@/lib/contentSubscribe": { fallbackSubscribeContent },
    "@/lib/billingPolicyUi": { canStartPurchase: () => false }, "@/lib/paddle": { openPaddleTransactionOverlay: () => { throw new Error("No checkout permitted"); } },
    "@/lib/notify": { notify: empty, notifyBackendError: empty },
    "@/context/AuthContext": { useAuth: () => ({ billingPolicy: { mode: "normal" }, isLoggedIn: false, isGuest: true }) },
    "next/link": component(({ children, href }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href }, children)),
    "next/navigation": { useRouter: () => ({ replace: empty }) },
    "lucide-react": new Proxy({}, { get: () => empty }),
    "@/components/ui/Logo": component(empty), "@/components/ToolCard": component(empty),
    "@/components/subscription/PlanButtons": component(empty),
    "@/components/ui/EmailButton": { EmailButton: empty },
    "@/components/legal/ContactCard": component(empty),
    "@/lib/siteUrl": siteUrl,
};
const name = "jsdom";
const { JSDOM } = await import(name);
function textOf(html: string): string {
    const page = new JSDOM(html);
    const text = page.window.document.body.textContent!;
    page.window.close();
    return text;
}
const pages = ["app/(site)/privacy/page.tsx", "app/(site)/terms/page.tsx", "app/(site)/security/page.tsx"];
const banned = /30\s*minutes|purged immediately|permanently deleted within|deleted after processing|never stored permanently|no permanent storage|not? uploaded document content is permanently stored/i;
for (const file of pages) {
    const page = load<{ default: React.ComponentType; metadata: { title: string; description: string } }>(file, common);
    const html = renderToStaticMarkup(React.createElement(page.default));
    assert.match(html, /<main/);
    assert.ok(page.metadata.title); assert.ok(page.metadata.description);
    for (const paragraph of [retention.FILE_RETENTION_COPY.processing, retention.FILE_RETENTION_COPY.exports, retention.FILE_RETENTION_COPY.cleanup]) {
        assert.ok(textOf(html).includes(paragraph), `${file} must present the shared lifecycle explanation`);
    }
    assert.doesNotMatch(html, banned, file);
    if (file.includes("privacy")) {
        assert.match(html, /You may delete your account at any time/);
        assert.match(html, /remove or anonymize personal information/);
        assert.match(html, /legal, security, fraud prevention/);
        assert.match(html, /rights to access, correct, or delete your personal/);
    }
}
const Home = load<{ default: React.ComponentType }>("app/(site)/Home.tsx", common).default;
const Footer = load<{ default: React.ComponentType }>("components/Footer.tsx", common).default;
const About = load<{ default: React.ComponentType }>("app/(site)/about/page.tsx", common).default;
const Subscribe = load<{ default: React.ComponentType }>("app/(site)/subscribe/page.tsx", common).default;
const Features = load<{ default: React.ComponentType }>("components/pdf/PdfFeatures.tsx", common).default;
for (const Page of [Home, Footer, About, Subscribe, Features]) {
    const html = renderToStaticMarkup(React.createElement(Page));
    assert.doesNotMatch(html, banned);
    assert.ok(html.includes(retention.FILE_RETENTION_COPY.summary));
}
let target: string | undefined;
const Workspace = load<{ default: React.ComponentType }>("components/tools/PdfToPowerPointWorkspace.tsx", {
    ...common,
    "@/components/pdf/OfficeConverter": component(({ targetFormat, description }: { targetFormat: string; description: string }) => {
        target = targetFormat; return React.createElement("p", null, description);
    }),
}).default;
const workspace = renderToStaticMarkup(React.createElement(Workspace));
assert.equal(target, "pptx");
assert.match(workspace, /one slide-sized image per PDF page/);
assert.match(workspace, /not individually editable/);
const Schema = load<{ default: React.ComponentType<{ toolHref: string }> }>("components/SEO/ToolSchema.tsx", common).default;
const schemaHtml = renderToStaticMarkup(React.createElement(Schema, { toolHref: tool.href }));
const schema = JSON.parse(schemaHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]);
assert.equal(schema["@context"], "https://schema.org");
assert.equal(schema["@type"], "SoftwareApplication");
assert.equal(schema.description, tool.description);
assert.deepEqual(schema.featureList, tool.features);
assert.match(schema.url, /\/pdf-to-powerpoint$/);
const FAQ = load<{ default: React.ComponentType<{ toolHref: string }> }>("components/SEO/ToolFAQ.tsx", common).default;
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/pdf-to-powerpoint" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(React.createElement(FAQ, { toolHref: tool.href })));
const buttons = document.querySelectorAll("button");
assert.equal(buttons.length, 2);
await act(async () => buttons[0].click());
assert.match(document.body.textContent!, /not individually editable/);
assert.match(document.body.textContent!, /rearrange the slides and add new text/);
await act(async () => buttons[1].click());
assert.match(document.body.textContent!, /one slide per PDF page/);
// Mount the actual pages: retained CMS copy must not resurrect old guarantees.
for (const Page of [About, Subscribe]) {
    await act(async () => root.render(React.createElement(Page)));
    assert.doesNotMatch(document.body.textContent!, banned);
    assert.ok(document.body.textContent!.includes(retention.FILE_RETENTION_COPY.summary));
}
assert.match(document.body.textContent!, /Custom safe tag/);
assert.match(document.body.textContent!, /Unchanged answer/);
await act(async () => root.unmount()); dom.window.close();
assert.equal(network, 0, "copy, metadata and schema tests must not contact any service");
const settings = fs.readFileSync("app/(site)/dashboard/settings/page.tsx", "utf8");
assert.doesNotMatch(settings, /All your uploaded documents,[\s\S]{0,100}permanently removed/);
assert.match(settings, /account deletion does not confirm physical erasure/);
console.log("PASS: public pages, retained CMS copy, real PPT workspace/FAQ, metadata and JSON-LD; rights preserved; zero network requests");
