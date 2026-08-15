import { chromium } from "@playwright/test";
import path from "path";

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on("console", (msg) => {
        console.log(`[BROWSER ${msg.type()}]:`, msg.text());
    });
    page.on("pageerror", (err) => console.log(`[PAGE ERROR]:`, err));

    await page.goto("http://localhost:3000/highlight-pdf");
    await page.waitForLoadState("networkidle");

    const samplePdfPath = path.resolve(__dirname, "../tests/fixtures/normal_text.pdf");
    await page.locator("input[type='file']").first().setInputFiles(samplePdfPath);

    await page.waitForURL("**/highlight-pdf/workspace**");
    console.log("On workspace page. Waiting 3s...");
    await page.waitForTimeout(3000);

    const textContent = await page.textContent("body");
    console.log("Body has '3 Pages':", textContent?.includes("3 Pages"));
    console.log("Body has '0 Pages':", textContent?.includes("0 Pages"));
    console.log("Body has error banner:", textContent?.includes("Could not render document preview"));

    await browser.close();
}

main().catch(console.error);
