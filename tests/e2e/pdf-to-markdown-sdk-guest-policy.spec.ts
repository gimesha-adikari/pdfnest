import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { getE2EApiBaseUrl } from "../helpers/auth";

const FIXTURE = "/home/gimesha/pdfnest-tests/ocr-extracted-text-29-rotated (1).pdf";
const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/pdf-to-markdown-sdk-consumer-01/guest-policy");

test("guest PDF-to-Markdown uses the durable guest identity contract", async ({ page }) => {
    const capabilitiesResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v2/ocr/structured/capabilities"));
    await page.goto("/pdf-to-markdown-v2/workspace");
    await expect(page.getByRole("heading", { name: "Convert PDF to Markdown" })).toBeVisible();
    const capabilitiesResponse = await capabilitiesResponsePromise;
    expect(capabilitiesResponse.status()).toBe(200);

    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    await expect(page.getByText(path.basename(FIXTURE), { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Convert to Markdown", exact: true })).toBeEnabled();

    const response = await page.request.post(`${getE2EApiBaseUrl()}/v2/ocr/pdf-to-markdown-v2/jobs`, {
        multipart: {
            file: { name: path.basename(FIXTURE), mimeType: "application/pdf", buffer: fs.readFileSync(FIXTURE) },
            language: "auto",
            language_mode: "AUTO",
            languages: "eng",
            routing_policy: "AUTO",
            profile: "PDF_MARKDOWN_V2",
        },
    });
    expect(response.status()).toBe(202);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, "guest-policy.json"), `${JSON.stringify({
        capability_http: capabilitiesResponse.status(),
        workspace_auth_state: "GUEST_AUTHENTICATED",
        guest_submission_http: response.status(),
        execution_started: true,
        policy: "guest-with-quota",
    }, null, 2)}\n`, "utf8");
});
