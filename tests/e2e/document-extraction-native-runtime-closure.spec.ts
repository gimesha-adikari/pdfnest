import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { authenticateProUser, getE2EApiBaseUrl } from "../helpers/auth";

const FIXTURE = path.resolve(__dirname, "../fixtures/normal_text.pdf");
const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/document-extraction-native-runtime-closure-01/authenticated-focused");

async function waitForStructuredJob(page: Page, jobId: string) {
    const statuses: string[] = [];
    let job: { status: string; result_available: boolean; error?: { code: string } } | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const response = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/document-extraction-v2/jobs/${jobId}`);
        expect([200, 429]).toContain(response.status());
        if (response.status() === 429) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            continue;
        }
        job = await response.json();
        if (statuses[statuses.length - 1] !== job!.status) statuses.push(job!.status);
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job!.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(job).not.toBeNull();
    return { job: job!, statuses };
}

test("authenticated Document Extraction V2 native runtime closure", async ({ page }) => {
    const auth = await authenticateProUser(page);
    const capabilitiesPromise = page.waitForResponse((response) => response.url().endsWith("/api/v2/ocr/structured/capabilities"));
    await page.goto("/document-extraction-v2/workspace");
    await expect(page.getByRole("heading", { name: "Extract Data from PDF" })).toBeVisible();
    const capabilitiesResponse = await capabilitiesPromise;
    expect(capabilitiesResponse.status()).toBe(200);
    const capabilities = await capabilitiesResponse.json() as { languages: Array<{ code: string; name: string }> };
    expect(capabilities.languages.map((item) => item.code)).toEqual(["eng", "sin", "tam"]);
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    await expect(page.getByText("normal_text.pdf", { exact: true })).toBeVisible();

    const postPromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/document-extraction-v2/jobs"));
    await page.getByRole("button", { name: "Extract data" }).click();
    const post = await postPromise;
    expect(post.status()).toBe(202);
    const created = await post.json() as { job_id: string; status: string; profile: string };
    expect(created.profile).toBe("DOCUMENT_EXTRACTION_V2");
    const statuses: string[] = [];
    const apiBase = getE2EApiBaseUrl();
    let job: { status: string; result_available: boolean; progress: { total_pages: number; completed_pages: number } } | null = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await page.request.get(`${apiBase}/v2/ocr/document-extraction-v2/jobs/${created.job_id}`);
        expect(response.status()).toBe(200);
        job = await response.json();
        if (statuses[statuses.length - 1] !== job!.status) statuses.push(job!.status);
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job!.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(job?.status).toBe("SUCCEEDED");
    expect(job?.result_available).toBe(true);
    expect(job?.progress.total_pages).toBe(3);
    expect(job?.progress.completed_pages).toBe(3);
    const resultResponse = await page.request.get(`${apiBase}/v2/ocr/document-extraction-v2/jobs/${created.job_id}/result`);
    expect(resultResponse.status()).toBe(200);
    const result = await resultResponse.json() as { schema_version: string; pages: Array<{ processing_source: string; status: string }>; validation: { valid: boolean } };
    expect(result.schema_version).toBe("ocr_v2_structured_document.v1");
    expect(result.pages).toHaveLength(3);
    expect(result.pages.every((item) => item.processing_source === "NATIVE_EXTRACTION" && item.status === "SUCCESS")).toBe(true);
    expect(result.validation.valid).toBe(true);
    await expect(page.getByRole("heading", { name: "Your structured document result" })).toBeVisible();

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, "authenticated-native.json"), `${JSON.stringify({
        auth_mode: auth.authMode,
        pro_entitlement: auth.proEntitlement,
        capabilities_http: capabilitiesResponse.status(),
        capability_codes: capabilities.languages.map((item) => item.code),
        post_http: post.status(),
        job_id: created.job_id,
        statuses,
        result_http: resultResponse.status(),
        schema_version: result.schema_version,
        page_count: result.pages.length,
        processing_sources: [...new Set(result.pages.map((item) => item.processing_source))],
        validation_valid: result.validation.valid,
        owner: "authenticated test user",
        full_text_persisted: false,
    }, null, 2)}\n`, "utf8");
});

test("authenticated Document Extraction language picker supports search and explicit selection", async ({ page }) => {
    await authenticateProUser(page);
    await page.goto("/document-extraction-v2/workspace");
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    const picker = page.getByRole("combobox", { name: "OCR language" });
    await expect(picker).toHaveText("Detect automatically");
    await picker.click();
    const search = page.getByRole("searchbox", { name: "Search languages" });
    await search.fill("Sinhala");
    await expect(page.getByRole("option", { name: "Sinhala", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "Sinhala", exact: true }).click();
    await search.fill("English");
    await expect(page.getByRole("option", { name: "English", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove Sinhala" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove English" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveAttribute("aria-expanded", "false");
});

test("guest Document Extraction explicit language submission succeeds", async ({ page }) => {
    await page.goto("/document-extraction-v2/workspace");
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    const picker = page.getByRole("combobox", { name: "OCR language" });
    await picker.click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await page.getByRole("option", { name: "Sinhala", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(picker).toContainText("English");
    await expect(picker).toContainText("Sinhala");

    const postPromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/document-extraction-v2/jobs"));
    await page.getByRole("button", { name: "Extract data" }).click();
    const post = await postPromise;
    expect(post.status()).toBe(202);
    const created = await post.json() as { job_id: string };
    const durable = await waitForStructuredJob(page, created.job_id);
    expect(durable.job.status).toBe("SUCCEEDED");
    expect(durable.job.result_available).toBe(true);
    const result = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/document-extraction-v2/jobs/${created.job_id}/result`);
    expect(result.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Your structured document result" })).toBeVisible();
});

test("guest Document Extraction AUTO submission remains owner-scoped", async ({ browser, page }) => {
    const capabilitiesPromise = page.waitForResponse((response) => response.url().endsWith("/api/v2/ocr/structured/capabilities"));
    await page.goto("/document-extraction-v2/workspace");
    const capabilitiesResponse = await capabilitiesPromise;
    expect(capabilitiesResponse.status()).toBe(200);
    const capabilities = await capabilitiesResponse.json() as { languages: Array<{ code: string; name: string }> };
    expect(capabilities.languages.map((item) => item.code)).toEqual(["eng", "sin", "tam"]);
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    await expect(page.getByRole("combobox", { name: "OCR language" })).toHaveText("Detect automatically");
    await page.getByRole("combobox", { name: "OCR language" }).click();
    await expect(page.getByRole("option", { name: "Detect automatically Recommended" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("option", { name: "English" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Sinhala" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Tamil" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox", { name: "OCR language" })).toHaveAttribute("aria-expanded", "false");

    const postPromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/document-extraction-v2/jobs"));
    await page.getByRole("button", { name: "Extract data" }).click();
    const post = await postPromise;
    expect(post.status()).toBe(202);
    const created = await post.json() as { job_id: string; status: string; profile: string };
    const own = await waitForStructuredJob(page, created.job_id);
    expect(own.job.status).toBe("SUCCEEDED");
    expect(own.job.result_available).toBe(true);
    const result = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/document-extraction-v2/jobs/${created.job_id}/result`);
    expect(result.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Your structured document result" })).toBeVisible();

    let crossGuestStatus = -1;
    let crossResultStatus = -1;
    const otherContext = await browser.newContext({ userAgent: "pdfnest-closure-guest-b" });
    try {
        const otherPage = await otherContext.newPage();
        await otherPage.goto("/document-extraction-v2/workspace");
        await expect(otherPage.getByRole("heading", { name: "Extract Data from PDF" })).toBeVisible();
        await otherPage.waitForFunction(() => Boolean(window.__PLATEN_SESSION__), undefined, { timeout: 10_000 });
        const otherSession = await otherPage.evaluate(() => window.__PLATEN_SESSION__ || null);
        expect(otherSession?.type).toBe("guest");
        const otherGuestId = await otherPage.evaluate(() => (window as Window & { __PLATEN_SESSION__?: { guestId?: string } }).__PLATEN_SESSION__?.guestId);
        const ownGuestId = await page.evaluate(() => (window as Window & { __PLATEN_SESSION__?: { guestId?: string } }).__PLATEN_SESSION__?.guestId);
        expect(otherGuestId).not.toBe(ownGuestId);
        const crossGuest = await otherPage.request.get(`${getE2EApiBaseUrl()}/v2/ocr/document-extraction-v2/jobs/${created.job_id}`);
        expect([403, 404]).toContain(crossGuest.status());
        const crossResult = await otherPage.request.get(`${getE2EApiBaseUrl()}/v2/ocr/document-extraction-v2/jobs/${created.job_id}/result`);
        expect([403, 404]).toContain(crossResult.status());
        crossGuestStatus = crossGuest.status();
        crossResultStatus = crossResult.status();
    } finally {
        await otherContext.close();
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, "guest-auto-owner-isolation.json"), `${JSON.stringify({
        capability_http: capabilitiesResponse.status(),
        capability_codes: capabilities.languages.map((item) => item.code),
        guest_session_type: "guest",
        auto_default: true,
        post_http: post.status(),
        job_id: created.job_id,
        statuses: own.statuses,
        own_result_http: result.status(),
        cross_guest_status: crossGuestStatus,
        cross_guest_result_status: crossResultStatus,
        full_text_persisted: false,
    }, null, 2)}\n`, "utf8");
});
