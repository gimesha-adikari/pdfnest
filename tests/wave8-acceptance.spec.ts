import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const SAMPLE_PDF = path.resolve(process.cwd(), "tests/fixtures/sample.pdf");
const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAAQUlEQVR4nO3RsREAIAgDQHD/nXEEKdDG/zpFLokAAAAAAAAAAABgUvajVfdq/CKPe68XNehzCAAAAAAAAAAAwKwNL9QCBj9twPIAAAAASUVORK5CYII=";
const TEMP_SIG_PNG = "/tmp/wave8_test_sig.png";

test.beforeAll(() => {
    fs.writeFileSync(TEMP_SIG_PNG, Buffer.from(VALID_PNG_BASE64, "base64"));
});

test.describe("Wave 8 Browser Acceptance Tests — Sign PDF & Repair PDF", () => {
    test("1. Sign PDF — Upload signature image, stamp multi-page, execute in Device mode", async ({ page }) => {
        await page.goto("/sign-pdf");
        await page.waitForLoadState("networkidle");

        // 1. Upload sample PDF
        const fileInput = page.locator("input[type='file']").first();
        await fileInput.setInputFiles(SAMPLE_PDF);

        // 2. Wait for workspace to load
        await expect(page.locator("text=1. Create Signature")).toBeVisible({ timeout: 15000 });

        // 3. Switch to Upload tab and upload signature PNG
        const uploadTab = page.locator("button:has-text('Upload')");
        await uploadTab.click();

        const sigFileInput = page.locator("input[type='file'][accept*='image']");
        await sigFileInput.setInputFiles(TEMP_SIG_PNG);

        // 4. Add signature to Page 1
        const addSigBtn = page.locator("button:has-text('Add Signature to Page 1')");
        await expect(addSigBtn).toBeVisible({ timeout: 5000 });
        await addSigBtn.click();

        // 5. Navigate to Page 2 & add signature
        const nextBtn = page.locator("button:has(svg.lucide-chevron-right)");
        await nextBtn.click();
        await expect(page.locator("text=Page 2 of 3")).toBeVisible({ timeout: 5000 });

        const addSigBtnPage2 = page.locator("button:has-text('Add Signature to Page 2')");
        await expect(addSigBtnPage2).toBeVisible({ timeout: 5000 });
        await addSigBtnPage2.click();

        // 6. Select "Device" mode
        const deviceModeBtn = page.getByRole("button", { name: "Device", exact: true });
        if (await deviceModeBtn.isVisible()) {
            await deviceModeBtn.click();
        }

        // 7. Click stamp signatures button
        const actionBtn = page.locator("button:has-text('Stamp 2 Signatures')");
        await expect(actionBtn).toBeVisible();
        await actionBtn.click();

        // 8. Verify navigation to download page
        await page.waitForURL("**/sign-pdf/download**", { timeout: 15000 });
        await expect(page.locator("text=Task completed successfully!")).toBeVisible({ timeout: 10000 });
        await expect(page.locator("button:has-text('Download File')")).toBeVisible({ timeout: 10000 });
    });

    test("2. Repair PDF — Execute in Device mode via WASM", async ({ page }) => {
        await page.goto("/repair-pdf");
        await page.waitForLoadState("networkidle");

        // Upload PDF
        const fileInput = page.locator("input[type='file']").first();
        await fileInput.setInputFiles(SAMPLE_PDF);

        await expect(page.locator("text=Execution Mode Settings")).toBeVisible({ timeout: 15000 });

        // Select Device mode
        const deviceModeBtn = page.getByRole("button", { name: "Device", exact: true });
        if (await deviceModeBtn.isVisible()) {
            await deviceModeBtn.click();
        }

        // Click Repair
        const repairBtn = page.locator("button:has-text('Repair PDF Document')");
        await expect(repairBtn).toBeVisible();
        await repairBtn.click();

        // Verify download page navigation
        await page.waitForURL("**/repair-pdf/download**", { timeout: 15000 });
        await expect(page.locator("text=Task completed successfully!")).toBeVisible({ timeout: 10000 });
        await expect(page.locator("button:has-text('Download File')")).toBeVisible({ timeout: 10000 });
    });

    test("3. Offline Isolation Guarantee — Device mode transmits 0 bytes to backend", async ({ page }) => {
        let backendUploadAttempted = false;

        // Intercept and track any network requests to backend structure endpoints
        await page.route("**/api/structure/**", (route) => {
            backendUploadAttempted = true;
            route.abort("failed");
        });

        // Test Sign PDF in Device mode
        await page.goto("/sign-pdf");
        await page.waitForLoadState("networkidle");

        const fileInput = page.locator("input[type='file']").first();
        await fileInput.setInputFiles(SAMPLE_PDF);

        const uploadTab = page.locator("button:has-text('Upload')");
        await uploadTab.click();

        const sigFileInput = page.locator("input[type='file'][accept*='image']");
        await sigFileInput.setInputFiles(TEMP_SIG_PNG);

        const addSigBtn = page.locator("button:has-text('Add Signature to Page 1')");
        await expect(addSigBtn).toBeVisible({ timeout: 5000 });
        await addSigBtn.click();

        const deviceModeBtn = page.getByRole("button", { name: "Device", exact: true });
        if (await deviceModeBtn.isVisible()) {
            await deviceModeBtn.click();
        }

        const actionBtn = page.locator("button:has-text('Stamp 1 Signature')");
        await actionBtn.click();

        await page.waitForURL("**/sign-pdf/download**", { timeout: 15000 });
        await expect(page.locator("text=Task completed successfully!")).toBeVisible({ timeout: 10000 });
        expect(backendUploadAttempted).toBe(false);
    });
});
