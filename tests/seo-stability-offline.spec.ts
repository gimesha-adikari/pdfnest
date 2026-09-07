import { test, expect, type Page } from "@playwright/test";

const formerlyOrphanedRoutes = [
    "/image-to-searchable-pdf",
    "/word-to-pdf",
    "/excel-to-pdf",
    "/powerpoint-to-pdf",
    "/url-to-pdf",
    "/pdf-to-powerpoint",
    "/grayscale-pdf",
];

async function toolLinks(page: Page, selector: string) {
    return new Set(
        await page.locator(selector).evaluateAll((links) =>
            links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href))
        )
    );
}

function rawInternalLinks(html: string) {
    return new Set(
        Array.from(html.matchAll(/href="(\/[^"]*)"/g), (match) => match[1])
    );
}

async function simulateHealthyBackend(page: Page) {
    await page.route("**/api/health", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "healthy" }),
        })
    );
}

async function simulateHealth503(page: Page) {
    // Keep the app in its degraded execution state: a successful CMS/auth
    // response would correctly mark the backend online again.
    await page.route("**/api/health", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) })
    );
    await page.route("**/api/auth/**", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) })
    );
    await page.route("**/api/site-content/**", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) })
    );
}

async function captureEditPdf(page: Page) {
    const response = await page.goto("/edit-pdf");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("backend-unavailable-execution-panel")).toBeVisible();

    return {
        title: await page.title(),
        description: await page.locator('meta[name="description"]').getAttribute("content"),
        canonical: await page.locator('link[rel="canonical"]').getAttribute("href"),
        robots: await page.locator('meta[name="robots"]').getAttribute("content"),
        h1: await page.locator("h1").first().textContent(),
        faqHeading: await page.getByRole("heading", { name: "Frequently Asked Questions" }).textContent(),
        schema: await page.locator('script[type="application/ld+json"]').first().textContent(),
        rawHtml: await response?.text(),
    };
}

test.describe("public discovery stays stable when backend health is unavailable", () => {
    test("503 health check preserves the complete homepage and directory tool URL sets", async ({ browser }) => {
        const healthyContext = await browser.newContext();
        const healthy = await healthyContext.newPage();
        await simulateHealthyBackend(healthy);
        const healthyHomeResponse = await healthy.goto("/");
        await healthy.waitForLoadState("networkidle");
        const healthyHomeLinks = await toolLinks(healthy, "main a[href^='/']");
        const healthyHomeRawLinks = rawInternalLinks(await healthyHomeResponse!.text());
        const healthyDirectoryResponse = await healthy.goto("/tools");
        await healthy.waitForLoadState("networkidle");
        const healthyDirectoryLinks = await toolLinks(healthy, "main a[href^='/']");
        const healthyDirectoryRawLinks = rawInternalLinks(await healthyDirectoryResponse!.text());

        const offlineContext = await browser.newContext();
        const offline = await offlineContext.newPage();
        await simulateHealth503(offline);
        const offlineHomeResponse = await offline.goto("/");
        await expect(offline.locator("#backend-status-banner")).toBeVisible();
        const offlineHomeLinks = await toolLinks(offline, "main a[href^='/']");
        const offlineHomeRawLinks = rawInternalLinks(await offlineHomeResponse!.text());
        const offlineDirectoryResponse = await offline.goto("/tools");
        await expect(offline.locator("#backend-status-banner")).toBeVisible();
        const offlineDirectoryLinks = await toolLinks(offline, "main a[href^='/']");
        const offlineDirectoryRawLinks = rawInternalLinks(await offlineDirectoryResponse!.text());

        expect(offlineHomeLinks).toEqual(healthyHomeLinks);
        expect(offlineDirectoryLinks).toEqual(healthyDirectoryLinks);
        expect(offlineHomeRawLinks).toEqual(healthyHomeRawLinks);
        expect(offlineDirectoryRawLinks).toEqual(healthyDirectoryRawLinks);

        for (const href of formerlyOrphanedRoutes) {
            expect(offlineHomeLinks.has(href), `${href} must remain linked from the homepage`).toBe(true);
            expect(offlineDirectoryLinks.has(href), `${href} must remain linked from /tools`).toBe(true);
            expect(offlineHomeRawLinks.has(href), `${href} must remain in homepage SSR HTML`).toBe(true);
            expect(offlineDirectoryRawLinks.has(href), `${href} must remain in /tools SSR HTML`).toBe(true);
        }

        await healthyContext.close();
        await offlineContext.close();
    });

    test("503 health check changes only the Edit PDF execution panel, not SEO content", async ({ browser }) => {
        const healthyContext = await browser.newContext();
        const healthy = await healthyContext.newPage();
        await simulateHealthyBackend(healthy);
        await healthy.goto("/edit-pdf");
        await healthy.waitForLoadState("networkidle");
        const healthyCapture = {
            title: await healthy.title(),
            description: await healthy.locator('meta[name="description"]').getAttribute("content"),
            canonical: await healthy.locator('link[rel="canonical"]').getAttribute("href"),
            robots: await healthy.locator('meta[name="robots"]').getAttribute("content"),
            h1: await healthy.locator("h1").first().textContent(),
            faqHeading: await healthy.getByRole("heading", { name: "Frequently Asked Questions" }).textContent(),
            schema: await healthy.locator('script[type="application/ld+json"]').first().textContent(),
        };
        await expect(healthy.getByTestId("backend-unavailable-execution-panel")).toHaveCount(0);

        const offlineContext = await browser.newContext();
        const offline = await offlineContext.newPage();
        await simulateHealth503(offline);
        const offlineCapture = await captureEditPdf(offline);

        expect(offlineCapture).toMatchObject(healthyCapture);
        expect(offlineCapture.rawHtml).toContain(healthyCapture.h1 ?? "");
        expect(offlineCapture.rawHtml).toContain("Frequently Asked Questions");
        expect(offlineCapture.rawHtml).toContain("SoftwareApplication");
        await expect(offline.getByTestId("backend-unavailable-execution-panel")).toContainText("Service Temporarily Unavailable");
        await expect(offline.locator("input[type='file']")).toHaveCount(0);

        await healthyContext.close();
        await offlineContext.close();
    });

    test("offline-capable Crop PDF remains executable when the health check returns 503", async ({ page }) => {
        await simulateHealth503(page);
        await page.goto("/crop-pdf");
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByTestId("backend-unavailable-execution-panel")).toHaveCount(0);
        await expect(page.locator("input[type='file']")).toBeVisible();
    });

    test("a user retry restores a backend-only execution surface without changing public content", async ({ page }) => {
        let healthy = false;
        await page.route("**/api/health", (route) =>
            route.fulfill({
                status: healthy ? 200 : 503,
                contentType: "application/json",
                body: JSON.stringify(healthy ? { status: "healthy" } : { error: "unavailable" }),
            })
        );
        await page.route("**/api/auth/**", (route) =>
            route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) })
        );
        await page.route("**/api/site-content/**", (route) =>
            route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) })
        );

        await page.goto("/word-to-pdf");
        const h1 = await page.locator("h1").first().textContent();
        await expect(page.getByTestId("backend-unavailable-execution-panel")).toBeVisible();

        healthy = true;
        await page.getByRole("button", { name: "Retry Connection" }).click();

        await expect(page.getByTestId("backend-unavailable-execution-panel")).toHaveCount(0);
        await expect(page.locator("input[type='file']")).toBeVisible();
        await expect(page.locator("h1").first()).toHaveText(h1 ?? "");
    });
});
