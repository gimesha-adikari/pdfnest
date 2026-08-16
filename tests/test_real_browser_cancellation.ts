import { chromium, Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const BACKEND_URL = "http://localhost:8080";
const FRONTEND_URL = "http://localhost:3000";
const PDF_PATH = path.resolve(process.cwd(), "tests/fixtures/cancellation-real.pdf");

interface TimelineEvent {
    step: string;
    timestamp: string;
    details?: any;
}

interface NetworkEvent {
    url: string;
    method: string;
    requestTime: string;
    status?: number;
    responseTime?: string;
    postData?: string;
    responseBody?: string;
}

function getTesseractProcesses() {
    try {
        const output = execSync("ps -eo pid,ppid,pgid,%cpu,%mem,stat,cmd", { encoding: "utf-8" });
        const procs: any[] = [];
        for (const line of output.split("\n")) {
            if (line.includes("tesseract") && !line.includes("grep") && !line.includes("defunct") && !line.includes("python")) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 7) {
                    procs.push({
                        pid: parts[0],
                        ppid: parts[1],
                        pgid: parts[2],
                        cpu: parts[3],
                        mem: parts[4],
                        stat: parts[5],
                        cmd: parts.slice(6).join(" "),
                    });
                }
            }
        }
        return procs;
    } catch {
        return [];
    }
}

function getProcessTree(): string {
    try {
        return execSync("pstree -ap", { encoding: "utf-8" });
    } catch (e: any) {
        return e.message;
    }
}

function getTmpSnapshot(): string[] {
    try {
        const out = execSync("find /tmp -maxdepth 3 2>/dev/null", { encoding: "utf-8" });
        return out.split("\n").filter(Boolean).sort();
    } catch {
        return [];
    }
}

async function runRealBrowserCancellationTest() {
    console.log("==================================================================");
    console.log("  REAL USER BROWSER TEST — PDF -> TEXT CANCELLATION FORENSICS     ");
    console.log("==================================================================");

    const timeline: TimelineEvent[] = [];
    const networkEvents: NetworkEvent[] = [];
    const logEvent = (step: string, details?: any) => {
        const ts = new Date().toISOString();
        timeline.push({ step, timestamp: ts, details });
        console.log(`[${ts}] [FORENSIC] ${step}`, details ? JSON.stringify(details) : "");
    };

    // 1. Initial process & environment discovery
    const backendPids = execSync("pgrep -f 'pdfnest-backend' || true", { encoding: "utf-8" }).trim().split("\n");
    const workerPids = execSync("pgrep -f 'uvicorn app.main:app' || true", { encoding: "utf-8" }).trim().split("\n");
    console.log(`Backend PIDs: ${backendPids.join(", ")}, Worker PIDs: ${workerPids.join(", ")}`);

    const tmpBefore = getTmpSnapshot();

    // 2. Launch real Chromium
    console.log("Launching real Chromium...");
    const browser = await chromium.launch({
        headless: true, // Run headless Chromium via Playwright
    });

    const context = await browser.newContext();

    // Perform login to ensure Plus tier subscription authorization for 141-page PDF
    const loginResp = await context.request.post(`${BACKEND_URL}/api/auth/login`, {
        data: {
            email: "gimeshaadikari23@gmail.com",
            password: "1234",
        },
    });
    console.log("Login HTTP status:", loginResp.status());

    const page = await context.newPage();

    // Capture all network events
    let capturedTaskId: string | null = null;
    let mainExtractionUrl: string | null = null;

    page.on("request", (req) => {
        const url = req.url();
        if (url.includes("/api/ocr/") || url.includes("/api/v1/tasks")) {
            const netEv: NetworkEvent = {
                url,
                method: req.method(),
                requestTime: new Date().toISOString(),
                postData: req.postData()?.substring(0, 300),
            };
            networkEvents.push(netEv);
            logEvent(`Network Request: ${req.method()} ${url}`);
            if (url.includes("/extract-text")) {
                mainExtractionUrl = url;
            }
        }
    });

    page.on("response", async (res) => {
        const url = res.url();
        if (url.includes("/api/ocr/") || url.includes("/api/v1/tasks")) {
            let bodyText = "";
            try {
                bodyText = await res.text();
            } catch {}
            logEvent(`Network Response: ${res.status()} ${url}`, {
                status: res.status(),
                bodySnippet: bodyText.substring(0, 200),
            });

            try {
                const data = JSON.parse(bodyText);
                if (data.taskId && !capturedTaskId) {
                    capturedTaskId = data.taskId;
                    logEvent(`Task ID Created: ${capturedTaskId}`, { taskId: capturedTaskId });
                }
                if (data.id && !capturedTaskId) {
                    capturedTaskId = data.id;
                    logEvent(`Task ID Detected: ${capturedTaskId}`, { taskId: capturedTaskId });
                }
            } catch {}
        }
    });

    // 3. Navigate to /pdf-to-text
    logEvent("Navigating to http://localhost:3000/pdf-to-text");
    await page.goto(`${FRONTEND_URL}/pdf-to-text`);
    await page.waitForLoadState("networkidle");

    // 4. Upload tests/fixtures/cancellation-real.pdf
    logEvent("Uploading cancellation-real.pdf fixture via file input control");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(PDF_PATH);

    // Wait for workspace page
    await page.waitForURL(/\/pdf-to-text\/workspace/, { timeout: 10000 });
    logEvent("Reached /pdf-to-text/workspace");

    // Ensure the extract button is visible
    const extractBtn = page.getByRole("button", { name: "Extract Text", exact: true });
    await extractBtn.waitFor({ state: "visible", timeout: 10000 });
    logEvent("Extract Text button is visible and ready");

    // 5. Click Extract Text
    logEvent("Browser user clicks 'Extract Text' button");
    await extractBtn.click();

    // 6. Monitor for active OCR / Tesseract execution
    logEvent("Waiting for real OCR/Tesseract subprocesses to spawn...");
    let preCancelTessProcs: any[] = [];
    let ocrActive = false;

    for (let attempt = 0; attempt < 80; attempt++) {
        await page.waitForTimeout(250);
        const procs = getTesseractProcesses();
        if (procs.length > 0) {
            preCancelTessProcs = procs;
            ocrActive = true;
            logEvent("Real Tesseract process(es) actively executing", procs);
            break;
        }
    }

    if (!ocrActive) {
        console.error("FATAL: Tesseract process was not detected during execution!");
    }

    const pstreeBefore = getProcessTree();

    // 7. Find visible Cancel button in the real browser UI
    const cancelBtn = page.getByRole("button", { name: /Cancel/i });
    await cancelBtn.waitFor({ state: "visible", timeout: 10000 });
    logEvent("Cancel button became visible and interactive in real UI");

    // Small delay to ensure heavy OCR load is underway across cores
    await page.waitForTimeout(400);

    // 8. User clicks Cancel in real UI
    logEvent("User clicks real Cancel button in browser UI");
    const tCancelClicked = Date.now();
    await cancelBtn.click();

    // 9. Sample high-frequency CPU and process metrics at specific intervals (+0.25s, +0.5s, +0.75s, +1s, +2s, +5s, +10s)
    const intervals = [250, 500, 750, 1000, 2000, 5000, 10000];
    const cpuSamples: any[] = [];

    for (const targetMs of intervals) {
        const now = Date.now();
        const sleepNeeded = targetMs - (now - tCancelClicked);
        if (sleepNeeded > 0) {
            await page.waitForTimeout(sleepNeeded);
        }

        const elapsed = (Date.now() - tCancelClicked) / 1000;
        const currentProcs = getTesseractProcesses();
        const totalCpu = currentProcs.reduce((acc, p) => acc + parseFloat(p.cpu || "0"), 0);

        cpuSamples.push({
            interval: `+${elapsed.toFixed(2)}s`,
            elapsedMs: Date.now() - tCancelClicked,
            activeCount: currentProcs.length,
            pids: currentProcs.map((p) => p.pid),
            totalCpuPercent: totalCpu,
        });

        logEvent(`CPU Sample at +${elapsed.toFixed(2)}s: Active Tesseract = ${currentProcs.length}, Total CPU = ${totalCpu.toFixed(1)}%`);
    }

    const pstreeAfter = getProcessTree();
    const tmpAfter = getTmpSnapshot();

    // Check UI final state
    const isCancelledVisible = await page.getByText("Task cancelled").isVisible().catch(() => false);
    logEvent(`UI Final Cancellation State Visible: ${isCancelledVisible}`);

    // Clean up browser
    await browser.close();

    // Audit temporary files
    const tmpDiff = tmpAfter.filter((f) => !tmpBefore.includes(f) && (f.includes("pdfnest") || f.includes("tess") || f.includes("extracted-text")));

    const report = {
        pdfFixture: "pdfnest/tests/fixtures/cancellation-real.pdf",
        pageCount: 141,
        fileSizeMb: (fs.statSync(PDF_PATH).size / (1024 * 1024)).toFixed(2),
        capturedTaskId,
        mainExtractionUrl,
        preCancelTesseract: preCancelTessProcs,
        cpuSamples,
        tmpDiff,
        pstreeBefore,
        pstreeAfter,
        timeline,
        networkEvents,
    };

    fs.writeFileSync("/tmp/real_browser_cancellation_audit.json", JSON.stringify(report, null, 2));
    console.log("\nSaved real browser cancellation audit report to /tmp/real_browser_cancellation_audit.json\n");

    console.log("==================================================================");
    console.log("                  FORENSIC SUMMARY RESULTS                        ");
    console.log("==================================================================");
    console.log(`Task ID: ${capturedTaskId}`);
    console.log(`Extraction Endpoint Used: ${mainExtractionUrl}`);
    console.log(`Pre-Cancel Active Tesseract Processes: ${preCancelTessProcs.length}`);
    console.log(`Tesseract Processes at +0.25s: ${cpuSamples[0]?.activeCount} (CPU: ${cpuSamples[0]?.totalCpuPercent}%)`);
    console.log(`Tesseract Processes at +0.50s: ${cpuSamples[1]?.activeCount} (CPU: ${cpuSamples[1]?.totalCpuPercent}%)`);
    console.log(`Tesseract Processes at +1.00s: ${cpuSamples[3]?.activeCount} (CPU: ${cpuSamples[3]?.totalCpuPercent}%)`);
    console.log(`Tesseract Processes at +2.00s: ${cpuSamples[4]?.activeCount} (CPU: ${cpuSamples[4]?.totalCpuPercent}%)`);
    console.log(`Leaked Temp Files: ${tmpDiff.length}`);
    console.log("==================================================================\n");
}

runRealBrowserCancellationTest().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
