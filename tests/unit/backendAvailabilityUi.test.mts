import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { renderToString, renderToStaticMarkup } from "react-dom/server";

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
function deferred() {
    let resolve!: (response: Response) => void;
    return { promise: new Promise<Response>(yes => { resolve = yes; }), resolve: (value: Response) => resolve(value) };
}
const requests: ReturnType<typeof deferred>[] = [];
globalThis.fetch = async (input) => {
    assert.equal(String(input), "http://127.0.0.1:9/api/health", "no document or hosted request permitted");
    const request = deferred(); requests.push(request); return request.promise;
};
const tracker = load<{ backendHealth: typeof import("../../lib/health/backendHealth").backendHealth }>(
    "lib/health/backendHealth.ts", { "@/lib/api": { getBaseUrl: () => "http://127.0.0.1:9" } },
);
const health = load<typeof import("../../context/BackendHealthContext")>("context/BackendHealthContext.tsx", {
    "@/lib/health/backendHealth": tracker, "next/navigation": { usePathname: () => "/pdf-to-word" },
});
const guard = load<{
    BackendOnlyToolGuard: React.ComponentType<React.PropsWithChildren<{ toolPolicy?: import("../../lib/execution/types").ToolPolicy }>>;
    useBackendOnlyToolAvailability: typeof import("../../components/pdf/BackendOnlyToolGuard").useBackendOnlyToolAvailability;
}>("components/pdf/BackendOnlyToolGuard.tsx", {
    "@/context/BackendHealthContext": health,
});
const empty = () => null;
const common = {
    "@/context/BackendHealthContext": health,
    "next/link": { __esModule: true, default: ({ children, href }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href }, children) },
    "lucide-react": new Proxy({}, { get: () => empty }),
};
const Notice = load<{ default: React.ComponentType }>("components/pdf/BackendUnavailableNotice.tsx", common).default;
const Banner = load<{ default: React.ComponentType }>("components/ui/BackendStatusBanner.tsx", common).default;
const developmentTools = load<typeof import("../../lib/ocrV2DevelopmentTools")>("lib/ocrV2DevelopmentTools.ts", {});
const registry = load<typeof import("../../lib/toolsData")>("lib/toolsData.ts", { "@/lib/ocrV2DevelopmentTools": developmentTools });
const api = { fetchJson: () => { throw new Error("Unexpected catalog network request"); } };
const normalization = load<typeof import("../../lib/server/tools")>("lib/server/tools.ts", {
    "@/lib/api": api, "@/lib/toolsData": registry, "@/lib/ocrV2DevelopmentTools": developmentTools,
});
const catalog = load<{
    ToolProvider: React.ComponentType<React.PropsWithChildren<{ initialTools: typeof registry.NAV_TOOLS_FALLBACK }>>;
    useTools: typeof import("../../context/ToolContext").useTools;
}>("context/ToolContext.tsx", {
    "@/lib/api": api, "@/lib/toolsData": registry, "@/lib/server/tools": normalization, "@/context/BackendHealthContext": health,
});
const cloudTool = registry.NAV_TOOLS_FALLBACK.find(tool => !registry.isToolAvailableOffline(tool))!;
const localTool = registry.NAV_TOOLS_FALLBACK.find(tool => registry.isToolAvailableOffline(tool))!;
assert.ok(cloudTool); assert.ok(localTool);
function CatalogProbe() {
    const tools = catalog.useTools();
    return React.createElement(React.Fragment, null,
        React.createElement("button", { id: "catalog-cloud", disabled: !tools.isToolExecutable(cloudTool) }, "Cloud catalog tool"),
        React.createElement("button", { id: "catalog-local", disabled: !tools.isToolExecutable(localTool) }, "Local catalog tool"),
    );
}
let submissions = 0;
function Surface() {
    const { isExecutable } = guard.useBackendOnlyToolAvailability();
    return isExecutable ? React.createElement("button", { id: "submit", onClick: () => submissions++ }, "Process") : React.createElement(Notice);
}
function App() {
    return React.createElement(health.BackendHealthProvider, null,
        React.createElement(Banner),
        React.createElement(catalog.ToolProvider, { initialTools: registry.NAV_TOOLS_FALLBACK }, React.createElement(CatalogProbe)),
        React.createElement(guard.BackendOnlyToolGuard, { toolPolicy: "BACKEND_ONLY" }, React.createElement(Surface)),
        React.createElement(guard.BackendOnlyToolGuard, { toolPolicy: "CLIENT_PREFERRED" }, React.createElement(LocalSurface)),
    );
}
function LocalSurface() {
    const { isExecutable } = guard.useBackendOnlyToolAvailability();
    return React.createElement("button", { id: "local", disabled: !isExecutable }, "Local tool");
}
assert.equal(await tracker.backendHealth.checkHealth(), false, "SSR cannot grant cloud availability");
const ssr = renderToString(React.createElement(App));
assert.match(ssr, /Checking service availability/);
assert.doesNotMatch(ssr, /Service Temporarily Unavailable|id="submit"|backend-status-banner/);
assert.equal(requests.length, 0, "SSR must not probe the backend");
const name = "jsdom";
const { JSDOM } = await import(name);
const dom = new JSDOM(`<div id="root">${ssr}</div>`, { url: "http://localhost:3000/pdf-to-word" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { hydrateRoot } = await import("react-dom/client");
const hydrationErrors: unknown[] = [];
let root!: ReturnType<typeof hydrateRoot>;
await act(async () => { root = hydrateRoot(document.getElementById("root")!, React.createElement(App), { onRecoverableError: error => hydrationErrors.push(error) }); });
assert.equal(requests.length, 1);
assert.equal(tracker.backendHealth.getState().status, "checking");
assert.match(document.body.textContent!, /Checking service availability/);
assert.doesNotMatch(document.body.textContent!, /Service Temporarily Unavailable/);
assert.equal(document.getElementById("submit"), null, "pending must not expose cloud submission");
assert.equal(document.getElementById("backend-status-banner"), null, "banner remains offline-only");
assert.equal((document.getElementById("local") as HTMLButtonElement).disabled, false);
assert.equal(submissions, 0);
assert.equal((document.getElementById("catalog-cloud") as HTMLButtonElement).disabled, true);
assert.equal((document.getElementById("catalog-local") as HTMLButtonElement).disabled, false);
await act(async () => requests[0].resolve(new Response("ok", { status: 200 })));
assert.ok(document.getElementById("submit"));
assert.equal((document.getElementById("catalog-cloud") as HTMLButtonElement).disabled, false);
assert.doesNotMatch(document.body.textContent!, /Checking service availability|Service Temporarily Unavailable/);
await act(async () => tracker.backendHealth.markOffline("Synthetic outage"));
assert.equal((document.getElementById("catalog-cloud") as HTMLButtonElement).disabled, true);
assert.equal((document.getElementById("catalog-local") as HTMLButtonElement).disabled, false);
assert.match(document.body.textContent!, /Service Temporarily Unavailable/);
assert.ok(document.getElementById("backend-status-banner"));
assert.equal(document.getElementById("submit"), null);
assert.equal((document.getElementById("local") as HTMLButtonElement).disabled, false);
await act(async () => (Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Retry Connection")!).click());
assert.equal(requests.length, 2, "one explicit retry, no polling");
await act(async () => requests[1].resolve(new Response("ok", { status: 200 })));
assert.ok(document.getElementById("submit"));
assert.equal((document.getElementById("catalog-cloud") as HTMLButtonElement).disabled, false);
assert.equal(document.querySelector('[data-testid="backend-unavailable-execution-panel"]'), null);
assert.equal(document.getElementById("backend-status-banner"), null);
assert.equal(hydrationErrors.length, 0);
assert.equal(renderToString(React.createElement(App)), ssr, "initial SSR stays stable even after a browser health result");
await act(async () => root.unmount());
// Remounting with a cached browser result hydrates the same pending SSR snapshot,
// then uses that result without another health request.
document.getElementById("root")!.innerHTML = ssr;
await act(async () => { root = hydrateRoot(document.getElementById("root")!, React.createElement(App), { onRecoverableError: error => hydrationErrors.push(error) }); });
assert.ok(document.getElementById("submit"));
assert.equal(requests.length, 2);
assert.equal(hydrationErrors.length, 0);
await act(async () => root.unmount());
// An unwrapped component must not manufacture a healthy backend.
function Unwrapped() { return React.createElement("span", null, health.useBackendHealth().status); }
assert.equal(renderToStaticMarkup(React.createElement(Unwrapped)), "<span>unknown</span>");
const Footer = load<{ default: React.ComponentType }>("components/Footer.tsx", {
    ...common, "@/context/AuthContext": { useAuth: () => ({ billingPolicy: {} }) },
    "@/components/ui/Logo": { __esModule: true, default: empty },
}).default;
const Contact = load<{ default: React.ComponentType }>("components/contact/ContactForm.tsx", { ...common, "@/lib/api": { submitContactTicket: () => { throw new Error("Unexpected submission"); } } }).default;
for (const status of ["unknown", "checking", "online", "offline"] as const) {
    tracker.backendHealth.setState(status);
    for (const Component of [Footer, Contact]) {
        const text = renderToStaticMarkup(React.createElement(Component));
        assert.doesNotMatch(text, /all systems operational|services are operating normally|zero-trust sandbox ready|animate-pulse/i);
        assert.match(text, /not a live service monitor/i);
    }
}
dom.window.close();
console.log("PASS: actual provider/guard/notice/banner hydration, pending exclusion, local availability, recovery and truthful static copy");
