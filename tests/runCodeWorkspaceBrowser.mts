// One browser, one context, one page. Run inside the resource-bounded validation
// wrapper; the loopback fixture is built before Chromium starts.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import pdfLib from "pdf-lib";

const server = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tests/serveCodeWorkspaceHarness.mts"], {stdio: ["ignore", "pipe", "pipe"]});
let serverErrors = "";
server.stderr.on("data", data => { serverErrors = (serverErrors + data).slice(-16_384); });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
    const fixture = await new Promise<{origin: string; directory: string; hostileName: string}>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error(`Fixture startup timed out: ${serverErrors}`)), 30_000);
        server.once("exit", code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${serverErrors}`)); });
        server.stdout.on("data", data => {
            output += data;
            for (const line of output.split("\n")) {
                try { const ready = JSON.parse(line); if (ready.origin) { clearTimeout(timer); resolve(ready); return; } } catch { /* Wait for the ready line. */ }
            }
        });
    });
    browser = await chromium.launch({channel: "chromium", headless: true, args: ["--disable-gpu", "--renderer-process-limit=1"]});
    const context = await browser.newContext({acceptDownloads: true});
    const forbidden: string[] = [];
    await context.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith(fixture.origin + "/")) return route.continue();
        forbidden.push(url); return route.abort();
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("dialog", dialog => { pageErrors.push(`Unexpected ${dialog.type()}`); void dialog.dismiss(); });
    page.setDefaultTimeout(15_000);
    await page.goto(fixture.origin);
    const source = page.locator("#source");
    const status = page.getByRole("region", {name: "Code conversion status"});
    const save = page.getByRole("button", {name: "Save Code Highlight PDF"});
    const ready = async () => { await expect(status).toContainText("PDF preview ready."); await expect(save).toBeEnabled(); };
    const observations = async () => (await context.request.get(fixture.origin + "/observations")).json();

    await source.setInputFiles(path.join(fixture.directory, "A.ts")); await ready();
    assert.equal((await observations()).posts, 0, "Auto uses the real local Code executor");
    await save.click();
    await expect(page.getByText("Task completed successfully!", {exact: true})).toBeVisible();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", {name: "Download File", exact: true}).click();
    const download = await downloading;
    const downloadedPath = (await download.path())!;
    const pdf = await pdfLib.PDFDocument.load(await readFile(downloadedPath));
    assert.equal(pdf.getPageCount(), 1);
    assert.match(execFileSync("pdftotext", [downloadedPath, "-"], {encoding: "utf8", timeout: 5_000}), /const synthetic = 42/);
    console.log("PASS actual local Code PDF preview, owned download, PDF page count and extracted text");

    await page.getByRole("button", {name: "Workspace", exact: true}).click(); await ready();
    await page.getByRole("button", {name: "Cloud", exact: true}).click(); await ready();
    await source.setInputFiles(path.join(fixture.directory, "oversized.ts"));
    await expect(status).toContainText("Code source too large"); await expect(status).toContainText("16 MiB");
    await expect(save).toBeDisabled(); await expect(status.locator("img")).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.codeHarness.snapshot()).then(value => (value as {staged: boolean}).staged), false);
    await page.waitForTimeout(8_000); // Verify durable copy after the optional toast expires.
    await expect(status).toContainText("16 MiB");
    assert.doesNotMatch(await page.locator("body").innerText(), /private\/fixture|synthetic diagnostic/);
    console.log("PASS Cloud 413 persists after toast expiry; prior preview and Save remain unavailable");

    assert.equal(fixture.hostileName.includes("/"), false);
    await source.setInputFiles(path.join(fixture.directory, fixture.hostileName)); await ready();
    assert.ok((await page.locator("body").innerText()).includes(fixture.hostileName));
    await expect(page.locator("img[onerror]")).toHaveCount(0);
    const wire = await observations();
    console.log("MULTIPART", JSON.stringify({fileObjectName: fixture.hostileName, observed: wire.observations.at(-1)}));
    console.log("PASS valid Linux hostile filename remains text; a fresh successful generation clears the error");

    const beforeDevice = wire.posts;
    await page.getByRole("button", {name: "Device", exact: true}).click(); await ready();
    assert.equal((await observations()).posts, beforeDevice, "explicit Device never uploads");
    await page.getByRole("button", {name: "Auto", exact: true}).click(); await ready();
    assert.equal((await observations()).posts, beforeDevice);
    console.log("PASS explicit Device and eligible Auto remain local, without introducing a fallback");
    assert.deepEqual(forbidden, []); assert.deepEqual(pageErrors, []);
    await context.close();
    console.log("Browser regression: 4 passed, 0 failed; loopback requests only");
} finally {
    await browser?.close();
    if (server.exitCode === null) { const exited = once(server, "exit"); server.kill("SIGTERM"); await exited; }
}
