import { expect, test } from "@playwright/test";

import {
    OCR_V2_DEVELOPMENT_TOOLS,
    OCR_V2_DEDICATED_TOOL_IDS,
} from "../../lib/ocrV2DevelopmentTools";

const EXPECTED_HUB_HREFS: Record<string, string> = {
    "ocr-text-v2": "/ocr-text-v2",
    "searchable-pdf-v2": "/searchable-pdf-v2",
    "document-extraction-v2": "/document-extraction-v2",
    "pdf-to-markdown-v2": "/pdf-to-markdown-v2",
    "highlight-pdf-v2": "/highlight-pdf-v2",
    "underline-pdf-v2": "/underline-pdf-v2",
    "strikeout-pdf-v2": "/strikeout-pdf-v2",
    "general-editor-ocr-v2": "/edit-pdf?ocr_v2=1",
    "pdf-to-word-ocr-fallback": "/pdf-to-word",
    "studio-v2": "/studio-v2",
};

const dedicatedSurfaces = OCR_V2_DEVELOPMENT_TOOLS.filter((surface) => surface.kind === "dedicated");

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("OCR V2 developing tools and public discovery", () => {
    test("lists every current OCR V2 development surface", async ({ page }) => {
        await page.goto("/developing-tools");

        await expect(page.getByTestId("developing-tools-page")).toBeVisible();
        await expect(page.getByRole("heading", { name: "OCR V2 developing tools" })).toBeVisible();
        await expect(page.locator('[data-testid^="developing-tool-"]')).toHaveCount(OCR_V2_DEVELOPMENT_TOOLS.length);

        for (const surface of OCR_V2_DEVELOPMENT_TOOLS) {
            const card = page.getByTestId(`developing-tool-${surface.id}`);
            await expect(card).toBeVisible();
            const expectedHref = EXPECTED_HUB_HREFS[surface.id];
            expect(expectedHref, `${surface.id} must have an explicit expected hub route`).toBeTruthy();
            await expect(card).toHaveAttribute("href", expectedHref);
            expect(surface.href).toBe(expectedHref);
        }

        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /nofollow/i);

        for (const normalPath of ["/", "/tools"]) {
            await page.goto(normalPath);
            await expect(page.locator('a[href="/developing-tools"]')).toHaveCount(0);
        }
    });

    test("hides dedicated V2 entries from public directory and search", async ({ page }) => {
        await page.goto("/tools");

        for (const toolId of OCR_V2_DEDICATED_TOOL_IDS) {
            await expect(page.locator(`a[href="/${toolId}"]`)).toHaveCount(0);
        }

        for (const publicHref of ["/highlight-pdf", "/underline-pdf", "/strikeout-pdf", "/image-to-searchable-pdf", "/pdf-to-markdown", "/pdf-to-text", "/pdf-to-word", "/edit-pdf", "/studio-v2"]) {
            await expect(page.locator(`a[href="${publicHref}"]`).first()).toBeAttached();
        }

        const directorySearch = page.getByPlaceholder("Search tools by name, action or category...");
        for (const surface of dedicatedSurfaces) {
            await directorySearch.fill(surface.title);
            await expect(page.getByText("No tools found")).toBeVisible();
            await expect(page.locator(`a[href="${EXPECTED_HUB_HREFS[surface.id]}"]`)).toHaveCount(0);
        }

        await page.goto("/");
        const headerSearch = page.getByPlaceholder("Search tools...");
        for (const surface of dedicatedSurfaces) {
            await headerSearch.fill(surface.title);
            await expect(page.locator(`a[href="${EXPECTED_HUB_HREFS[surface.id]}"]`)).toHaveCount(0);
        }

        const sitemapResponse = await page.request.get("/sitemap.xml");
        expect(sitemapResponse.status()).toBe(200);
        const sitemap = await sitemapResponse.text();
        expect(sitemap).not.toContain("/developing-tools");
        for (const surface of dedicatedSurfaces) {
            expect(sitemap).not.toContain(EXPECTED_HUB_HREFS[surface.id]);
        }
    });

    test("opens dedicated cards at base routes and keeps workspace routes functional", async ({ page }) => {
        for (const surface of dedicatedSurfaces) {
            await page.goto("/developing-tools");
            const expectedHref = EXPECTED_HUB_HREFS[surface.id];
            const card = page.getByTestId(`developing-tool-${surface.id}`);
            await expect(card).toHaveAttribute("href", expectedHref);
            await card.click();
            await expect(page).toHaveURL(new RegExp(`${escapeRegExp(expectedHref)}$`));
            expect(new URL(page.url()).pathname).toBe(expectedHref);
            expect(new URL(page.url()).pathname).not.toMatch(/\/workspace$/);
        }
    });

    test("keeps direct V2 routes, workspace routes, and shared development routes functional", async ({ page }) => {
        for (const surface of OCR_V2_DEVELOPMENT_TOOLS) {
            const expectedHref = EXPECTED_HUB_HREFS[surface.id];
            const response = await page.goto(expectedHref);
            expect(response?.status(), expectedHref).toBe(200);
            await expect(page).not.toHaveTitle(/404|not found/i);

            if (surface.kind === "dedicated") {
                await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
                await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /nofollow/i);
            }
        }

        for (const surface of dedicatedSurfaces) {
            const workspaceHref = `/${surface.id}/workspace`;
            const response = await page.goto(workspaceHref);
            expect(response?.status(), workspaceHref).toBe(200);
            await expect(page).not.toHaveTitle(/404|not found/i);
        }

        const sharedEditorResponse = await page.goto("/edit-pdf?ocr_v2=1");
        expect(sharedEditorResponse?.status()).toBe(200);
        await expect(page).not.toHaveTitle(/404|not found/i);

        const legacyEditorResponse = await page.goto("/edit-pdf");
        expect(legacyEditorResponse?.status()).toBe(200);
        await expect(page).not.toHaveTitle(/404|not found/i);
    });
});
