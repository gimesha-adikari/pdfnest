import { test, expect } from "@playwright/test";

test.describe("Wave 9A: Code to PDF Real Browser Acceptance & Offline Isolation Suite", () => {
    test("1. Device Mode: Converts TypeScript file locally with 0 backend network upload and renders preview", async ({
        page,
    }) => {
        let backendConvertCallCount = 0;
        let cdnCallCount = 0;

        await page.route("**/api/conversion/code-to-pdf**", async (route) => {
            backendConvertCallCount++;
            await route.continue();
        });

        await page.route("**/cdnjs.cloudflare.com/**", async (route) => {
            cdnCallCount++;
            await route.continue();
        });

        await page.goto("/code-to-pdf");
        await page.waitForLoadState("networkidle");

        // Staging sample code file
        const sampleCode = `
import express from "express";
const app = express();
const PORT = 3000;

app.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: Date.now() });
});

app.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
});
`;

        const fileInput = page.locator("input[type='file']");
        await fileInput.setInputFiles({
            name: "server.ts",
            mimeType: "text/typescript",
            buffer: Buffer.from(sampleCode),
        });

        // Verify Workspace Elements
        await expect(page.locator("text=Format Script Layout Metrics")).toBeVisible({ timeout: 10000 });

        // Select Device Mode
        const deviceButton = page.locator("button:has-text('Device')");
        if (await deviceButton.isVisible()) {
            await deviceButton.click();
        }

        // Verify Live Preview rendered via ClientPdfRenderer
        const previewImg = page.locator("img[alt='Code Layout Document Snapshot Mirror']");
        await expect(previewImg).toBeVisible({ timeout: 15000 });

        // Click Save Button
        const saveButton = page.getByRole("button", { name: "Save Code Highlight PDF" });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        // Must redirect to download screen
        await expect(page).toHaveURL(/\/code-to-pdf\/download/, { timeout: 15000 });
        await expect(page.getByText("Task completed successfully!")).toBeVisible();

        // 0 backend convert requests in Device mode!
        expect(backendConvertCallCount).toBe(0);
        // 0 external CDN requests!
        expect(cdnCallCount).toBe(0);
    });

    test("2. Zero Network Leakage during full Device mode execution", async ({ page, context }) => {
        let multipartUploadCount = 0;

        await page.route("**/api/**", async (route) => {
            const req = route.request();
            if (req.method() === "POST" && req.postData()?.includes("form-data")) {
                multipartUploadCount++;
            }
            await route.continue();
        });

        await page.goto("/code-to-pdf");
        await page.waitForLoadState("networkidle");

        const pyCode = `
def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

if __name__ == "__main__":
    print([fibonacci(i) for i in range(10)])
`;

        const fileInput = page.locator("input[type='file']");
        await fileInput.setInputFiles({
            name: "fib.py",
            mimeType: "text/x-python",
            buffer: Buffer.from(pyCode),
        });

        await expect(page.locator("text=Format Script Layout Metrics")).toBeVisible({ timeout: 10000 });

        const deviceButton = page.locator("button:has-text('Device')");
        if (await deviceButton.isVisible()) {
            await deviceButton.click();
        }

        // Wait for preview to settle
        const previewImg = page.locator("img[alt='Code Layout Document Snapshot Mirror']");
        await expect(previewImg).toBeVisible({ timeout: 15000 });

        const saveButton = page.getByRole("button", { name: "Save Code Highlight PDF" });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page).toHaveURL(/\/code-to-pdf\/download/, { timeout: 15000 });

        // Absolute guarantee: 0 multipart payloads sent to backend
        expect(multipartUploadCount).toBe(0);
    });

    test("3. Auto Mode Fallback: Non-Latin script with Cloud HTTP 429 quota response displays friendly business error", async ({
        page,
    }) => {
        let cloudAttemptCount = 0;

        await page.route("**/api/conversion/code-to-pdf**", async (route) => {
            cloudAttemptCount++;
            // Return structured HTTP 429 matching backend BillingError
            await route.fulfill({
                status: 429,
                contentType: "application/json",
                body: JSON.stringify({
                    code: "HOURLY_LIMIT_REACHED",
                    title: "Usage limit reached",
                    message: "You've reached your 3-hour usage limit.",
                    description: "Please wait until your usage window resets or upgrade your plan.",
                    window: "3h",
                    upgradeRecommended: true,
                }),
            });
        });

        await page.goto("/code-to-pdf");
        await page.waitForLoadState("networkidle");

        // Non-Latin source code triggers UNSUPPORTED_CLIENT_OP -> Auto Mode Cloud Fallback
        const sinhalaScript = `
// සිංහල සටහන
export function greet() {
    return "ආයුබෝවන්";
}
`;

        const fileInput = page.locator("input[type='file']");
        await fileInput.setInputFiles({
            name: "sinhala.ts",
            mimeType: "text/typescript",
            buffer: Buffer.from(sinhalaScript),
        });

        await expect(page.locator("text=Format Script Layout Metrics")).toBeVisible({ timeout: 10000 });

        // Verify the toast displays the backend's friendly error message rather than generic CLOUD_UNAVAILABLE
        await expect(page.locator("text=You've reached your 3-hour usage limit.").first()).toBeVisible();

        // Must NOT display generic "Cloud processing is currently unavailable"
        await expect(page.locator("text=Cloud processing is currently unavailable")).toHaveCount(0);
        await expect(page.locator("text=Local processing could not complete")).toHaveCount(0);

        // Attempted Cloud fallback
        expect(cloudAttemptCount).toBeGreaterThanOrEqual(1);
    });
});

