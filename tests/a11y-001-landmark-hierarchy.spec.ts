import { expect, test } from "@playwright/test";

const PUBLIC_ROUTES = [
    "/",
    "/about",
    "/tools",
    "/pricing",
    "/privacy",
    "/acceptable-use",
    "/contact",
    "/cookies",
    "/refund",
    "/security",
    "/terms",
    "/subscribe",
    "/developing-tools",
] as const;

const REPRESENTATIVE_ROUTES = ["/", "/about", "/tools", "/contact", "/subscribe", "/terms"] as const;

for (const route of PUBLIC_ROUTES) {
    test(`A11Y-001: ${route} exposes one non-nested main landmark`, async ({ page }) => {
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });

        expect(response, `${route} should return a document response`).not.toBeNull();
        expect(response?.status(), `${route} should render successfully`).toBe(200);

        const landmarkCounts = await page.evaluate(() => ({
            mainCount: document.querySelectorAll("main").length,
            nestedMainCount: document.querySelectorAll("main main").length,
        }));

        expect(landmarkCounts, `${route} landmark topology`).toEqual({
            mainCount: 1,
            nestedMainCount: 0,
        });
    });
}

for (const route of REPRESENTATIVE_ROUTES) {
    test(`A11Y-001: ${route} preserves the public shell around the page main`, async ({ page }) => {
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });

        expect(response?.status(), `${route} should render successfully`).toBe(200);

        const shell = await page.evaluate(() => {
            const headers = Array.from(document.querySelectorAll("header"));
            const footers = Array.from(document.querySelectorAll("footer"));

            return {
                hasMain: document.querySelector("main") !== null,
                hasVisibleContent: document.body.innerText.trim().length > 0,
                headerOutsideMain: headers.some((header) => !header.closest("main")),
                footerOutsideMain: footers.length > 0 && footers.every((footer) => !footer.closest("main")),
            };
        });

        expect(shell, `${route} shell placement`).toEqual({
            hasMain: true,
            hasVisibleContent: true,
            headerOutsideMain: true,
            footerOutsideMain: true,
        });
    });
}
