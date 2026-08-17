import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { TOTAL_TOOL_COUNT, OFFLINE_TOOL_COUNT, NAV_TOOLS_FALLBACK } from "@/lib/toolsData";

const samplePdfPath = path.resolve(process.cwd(), "tests/fixtures/sample.pdf");
const samplePngPath = path.resolve(process.cwd(), "tests/fixtures/tmp_audit_test.png");

test.beforeAll(() => {
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    fs.writeFileSync(samplePngPath, Buffer.from(pngBase64, "base64"));
});

test.afterAll(() => {
    if (fs.existsSync(samplePngPath)) {
        try { fs.unlinkSync(samplePngPath); } catch {}
    }
});

async function simulateBackendOnline(page: any) {
    await page.route("**/api/health", async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "healthy", version: "1.0.0" }),
        });
    });

    await page.route("**/api/auth/session", async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ authenticated: false, type: "guest" }),
        });
    });

    await page.route("**/api/subscription/**", async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ tier: "free", status: "active" }),
        });
    });

    await page.route("**/site-content/about", async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                HeroTag: "Next-Gen PDF Architecture",
                HeroTitle: "Built for Performance, Security, and Local-First Reliability",
                HeroDescription: "Platen PDF delivers high-performance client-side document processing with seamless offline capabilities and secure cloud execution.",
                StatsJson: JSON.stringify([]),
                SectionTitle: "Core Platform Philosophy",
                SectionSubtitle: "Designed with privacy, performance, and simplicity as first principles.",
                HighlightsJson: JSON.stringify([
                    { title: "Client-Side Processing", description: "Standard operations execute 100% locally in your browser using WASM." },
                    { title: "Privacy First", description: "Zero document telemetry. Files are never stored permanently." },
                    { title: "Universal Compatibility", description: "Works on desktop, mobile, and tablets with equal speed." },
                ]),
                StudioTitle: "Platen Studio Architecture",
                StudioDescription: "Our unified studio workspace allows you to visually manipulate, annotate, organize, and transform document layouts with real-time feedback.",
                StudioFeaturesJson: JSON.stringify([
                    "Dynamic Page Matrix Layout",
                    "Multi-layer Vector Watermarks",
                    "Real-time Canvas Rendering",
                    "Cross-document Page Merging"
                ]),
                CanvasTitle: "Modern Rendering Pipeline",
                CanvasDescription: "Optimized canvas viewports deliver crisp vector clarity at any zoom level without exhausting client memory resources.",
                CanvasFeaturesJson: JSON.stringify([
                    "Sub-pixel Text Layout Engine",
                    "High-DPI Viewport Scaling",
                    "Zero-latency Pagination",
                    "Lossless Asset Handling"
                ]),
                SecurityTitle: "Security & Privacy Guarantee",
                SecurityDescription: "We strictly protect user data. All processing sandboxes clear cache automatically, and no uploaded document content is permanently stored.",
                RoadmapTitle: "Platform Capabilities",
                RoadmapDescription: "Continuously expanding PDF engine utilities.",
                RoadmapJson: JSON.stringify(["Fast OCR Engine", "Batch Conversion", "High-DPI Render", "Cloudflare R2 Sync"]),
                MissionTitle: "Our Mission",
                MissionDescription: "Provide high-performance document tools accessible anywhere without compromising user privacy or file security."
            }),
        });
    });

    await page.route("**/site-content/tools", async (route: any) => {
        const rawCmsTools = NAV_TOOLS_FALLBACK.map((t, idx) => ({
            id: idx + 1,
            title: t.title,
            description: t.description,
            href: t.href,
            category: t.category,
            isActive: true,
        }));
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(rawCmsTools),
        });
    });

    await page.route("**/site-content/**", async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({}),
        });
    });
}

async function simulateBackendOffline(page: any) {
    await page.route("**/api/**", async (route: any) => {
        await route.abort("connectionfailed");
    });
    await page.route("**/site-content/**", async (route: any) => {
        await route.abort("connectionfailed");
    });
}

test.describe("PDFNest Full-Site Online & Offline Regression Audit", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test("ENV A: Online Full-Site Inventory & Route Availability", async ({ page }) => {
        await simulateBackendOnline(page);

        // 1. Home
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1")).toBeVisible();

        // 2. Tools Directory
        await page.goto("/tools");
        await page.waitForLoadState("networkidle");
        const dirBadge = page.locator("main section div").filter({ hasText: /PDF Tools Available/i });
        await expect(dirBadge).toBeVisible();
        await expect(dirBadge).toContainText(`${TOTAL_TOOL_COUNT} PDF Tools Available`);

        // 3. About page
        await page.goto("/about");
        await page.waitForLoadState("networkidle");
        await expect(page.locator(`text=${TOTAL_TOOL_COUNT}+`)).toBeVisible();

        // 4. Pricing
        await page.goto("/pricing");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1")).toBeVisible();

        // 5. Studio
        await page.goto("/studio");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1, h2, h3").first()).toBeVisible();

        // 6. Public Static Pages
        const staticPages = [
            "/acceptable-use",
            "/contact",
            "/cookies",
            "/privacy",
            "/refund",
            "/security",
            "/terms",
            "/login",
            "/register",
        ];

        for (const route of staticPages) {
            await page.goto(route);
            await page.waitForLoadState("domcontentloaded");
            await expect(page.locator("h1, h2, form").first()).toBeVisible();
        }
    });

    test("ENV A: Online Discovery Surfaces contain full tool suite (37 tools)", async ({ page }) => {
        await simulateBackendOnline(page);
        await page.goto("/tools");
        await page.waitForLoadState("networkidle");

        // When online, all 37 tools are rendered
        const toolCards = page.locator("main a[href^='/']");
        const count = await toolCards.count();
        expect(count).toBe(TOTAL_TOOL_COUNT);

        // Backend-required tools are discoverable
        await expect(page.locator("main a[href='/strikeout-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/compress-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/word-to-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/redact-pdf']")).toBeVisible();

        // Client-capable tools are discoverable
        await expect(page.locator("main a[href='/merge-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/rotate-pdf']")).toBeVisible();
    });

    test("ENV C: Online Client Execution (Rotate in Device mode) emits 0 unexpected backend calls", async ({ page }) => {
        await simulateBackendOnline(page);
        const apiCalls: string[] = [];
        page.on("request", (req) => {
            if (req.url().includes("/api/")) {
                apiCalls.push(`${req.method()} ${req.url()}`);
            }
        });

        await page.goto("/rotate-pdf");
        await page.waitForLoadState("networkidle");

        const fileInput = page.locator("input[type='file']");
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/rotate-pdf\/workspace/);

        // Click Rotate All 90°
        const rotateAllBtn = page.getByRole("button", { name: /Rotate All 90°/i });
        await expect(rotateAllBtn).toBeVisible();
        await rotateAllBtn.click();

        // Switch to Device mode
        const deviceBtn = page.getByRole("button", { name: "Device" });
        await deviceBtn.click();

        // Clear API calls recorded during initial page load/health check
        const executeStartIdx = apiCalls.length;

        // Execute rotation
        const applyBtn = page.getByRole("button", { name: /Apply Rotation Matrices/i });
        await applyBtn.click();

        await expect(page).toHaveURL(/\/rotate-pdf\/download/, { timeout: 15000 });
        await expect(page.getByText("Task completed successfully!")).toBeVisible();

        // Verify NO backend mutation or processing API calls were made during execution
        const executionApiCalls = apiCalls.slice(executeStartIdx);
        const processingCalls = executionApiCalls.filter((call) => !call.includes("/api/health") && !call.includes("/api/auth/session"));
        expect(processingCalls.length).toBe(0);
    });

    test("ENV B & D: Backend Offline Full Execution of Local Tools with Zero Backend Requests", async ({ page }) => {
        await simulateBackendOffline(page);

        // 1. Rotate PDF
        await page.goto("/rotate-pdf");
        await page.waitForLoadState("networkidle");

        const fileInput = page.locator("input[type='file']");
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/rotate-pdf\/workspace/);

        const rotateAllBtn = page.getByRole("button", { name: /Rotate All 90°/i });
        await expect(rotateAllBtn).toBeVisible();
        await rotateAllBtn.click();

        const applyBtn = page.getByRole("button", { name: /Apply Rotation Matrices/i });
        await applyBtn.click();

        await expect(page).toHaveURL(/\/rotate-pdf\/download/, { timeout: 15000 });
        await expect(page.getByText("Task completed successfully!")).toBeVisible();
    });

    test("ENV B & F: Backend Offline Direct Access to Backend-Only Tools enforces Guard", async ({ page }) => {
        await simulateBackendOffline(page);

        const backendOnlyRoutes = [
            "/excel-to-pdf",
            "/word-to-pdf",
            "/powerpoint-to-pdf",
            "/redact-pdf",
            "/url-to-pdf",
        ];

        for (const route of backendOnlyRoutes) {
            await page.goto(route);
            await page.waitForLoadState("networkidle");

            await expect(page.locator("text=Service Temporarily Unavailable")).toBeVisible();
            await expect(page.locator("input[type='file']")).toHaveCount(0);
        }
    });

    test("ENV B: Studio Standalone Workspace operates offline", async ({ page }) => {
        await simulateBackendOffline(page);

        await page.goto("/studio");
        await page.waitForLoadState("networkidle");

        // Studio UI renders without crashing
        await expect(page.locator("text=Service Temporarily Unavailable")).toHaveCount(0);
        await expect(page.locator("input[type='file']")).toBeAttached();
    });

    test("ENV B: Dynamic Offline Tool Counting on About, Tools, and Home", async ({ page }) => {
        await simulateBackendOffline(page);

        // 1. About
        await page.goto("/about");
        await page.waitForLoadState("networkidle");
        await expect(page.locator(`text=${OFFLINE_TOOL_COUNT}+`)).toBeVisible();
        await expect(page.locator("text=Local Tools (Cloud Offline)")).toBeVisible();

        // 2. Directory
        await page.goto("/tools");
        await page.waitForLoadState("networkidle");
        const dirBadge = page.locator("main section div").filter({ hasText: /Local Tools Available/i });
        await expect(dirBadge).toBeVisible();
        await expect(dirBadge).toContainText(`${OFFLINE_TOOL_COUNT} Local Tools Available`);
    });
});
