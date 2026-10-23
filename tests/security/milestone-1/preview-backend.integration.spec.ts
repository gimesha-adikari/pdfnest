import { test, expect, type BrowserContext, type Page, type Request } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    requireExplicitLoopbackOrigin,
    requireRevision,
} from "./previewIntegrationTarget";

const appOrigin = requireExplicitLoopbackOrigin(
    process.env.PLATEN_M1_PREVIEW_APP_ORIGIN,
    "PLATEN_M1_PREVIEW_APP_ORIGIN",
);
const backendOrigin = requireExplicitLoopbackOrigin(
    process.env.PLATEN_M1_PREVIEW_BACKEND_ORIGIN,
    "PLATEN_M1_PREVIEW_BACKEND_ORIGIN",
);
const workerOrigin = requireExplicitLoopbackOrigin(
    process.env.PLATEN_M1_PREVIEW_WORKER_ORIGIN,
    "PLATEN_M1_PREVIEW_WORKER_ORIGIN",
);
const backendRevision = requireRevision(
    process.env.PLATEN_M1_BACKEND_REVISION,
    "PLATEN_M1_BACKEND_REVISION",
);
const workerRevision = requireRevision(
    process.env.PLATEN_M1_WORKER_REVISION,
    "PLATEN_M1_WORKER_REVISION",
);

function requireTaskPath(value: string | undefined, name: string): string {
    if (!value) throw new Error(`${name} is required for the real-backend preview integration suite.`);
    const resolved = path.resolve(value);
    const tmpRoot = path.resolve(os.tmpdir());
    if (!resolved.startsWith(`${tmpRoot}${path.sep}`)) {
        throw new Error(`${name} must point inside the system temporary directory.`);
    }
    return resolved;
}

const fixtureDirectory = requireTaskPath(process.env.PLATEN_M1_FIXTURE_DIR, "PLATEN_M1_FIXTURE_DIR");
const workerSessionDirectory = requireTaskPath(
    process.env.PLATEN_M1_WORKER_SESSION_DIR,
    "PLATEN_M1_WORKER_SESSION_DIR",
);
const evidenceDirectory = requireTaskPath(
    process.env.PLATEN_M1_PREVIEW_EVIDENCE_DIR,
    "PLATEN_M1_PREVIEW_EVIDENCE_DIR",
);

const plainPdf = readFileSync(path.join(fixtureDirectory, "plain-two-pages.pdf"));
const scannedPdf = readFileSync(path.join(fixtureDirectory, "scanned-image-only.pdf"));
const futurePdf = readFileSync(path.join(fixtureDirectory, "plain-preview-future.pdf"));
const plainProject = readFileSync(path.join(fixtureDirectory, "legacy-studio-preview-history.pns"));
const invalidPageProject = readFileSync(path.join(fixtureDirectory, "legacy-studio-preview-invalid-page.pns"));

type RequestEvidence = {
    method: string;
    path: string;
    query: string;
    request: Request;
    status?: number;
    contentType?: string;
    requestBody?: Buffer;
    responseBody?: Buffer;
    sessionId?: string;
    pageCount?: number;
};

type NetworkEvidence = {
    events: RequestEvidence[];
    blockedOrigins: Set<string>;
    directWorkerRequests: number;
    responseTasks: Promise<void>[];
    responseErrors: string[];
};

function requestFilename(body: Buffer | undefined): string | null {
    if (!body) return null;
    const match = body.toString("latin1").match(/name="file";\s*filename="([^"]+)"/);
    return match?.[1] ?? null;
}

function previewUploads(evidence: NetworkEvidence): RequestEvidence[] {
    return evidence.events.filter((event) =>
        event.method === "POST" && event.path === "/api/conversion/preview/session"
    );
}

function unrelatedProcessingPosts(evidence: NetworkEvidence): RequestEvidence[] {
    return evidence.events.filter((event) =>
        event.method === "POST" && event.path.startsWith("/api/") &&
        event.path !== "/api/conversion/preview/session"
    );
}

function assertIsolatedBrowserRequests(evidence: NetworkEvidence): void {
    expect(evidence.directWorkerRequests).toBe(0);
    for (const origin of evidence.blockedOrigins) {
        expect(origin).not.toMatch(/(^|\.)platenpdf\.com$/i);
    }
}

function logNetworkSummary(scenario: string, evidence: NetworkEvidence): void {
    const requests = evidence.events.map((event, index) => ({
        order: index + 1,
        method: event.method,
        path: event.path.replace(/\/session\/[a-f0-9]{32}/i, "/session/:id"),
        query: event.query || undefined,
        status: event.status,
        contentType: event.contentType,
        fileName: event.method === "POST" ? requestFilename(event.requestBody) : undefined,
    }));
    console.info(`[M1-S1-04] ${JSON.stringify({
        scenario,
        backendRevision,
        workerRevision,
        requests,
        blockedOrigins: [...evidence.blockedOrigins].sort(),
        directWorkerRequests: evidence.directWorkerRequests,
    })}`);
}

async function settleNetworkEvidence(evidence: NetworkEvidence): Promise<void> {
    let observed = -1;
    while (observed !== evidence.responseTasks.length) {
        observed = evidence.responseTasks.length;
        await Promise.all(evidence.responseTasks);
    }
    expect(evidence.responseErrors).toEqual([]);
}

async function installNetworkBoundary(page: Page): Promise<NetworkEvidence> {
    const evidence: NetworkEvidence = {
        events: [],
        blockedOrigins: new Set(),
        directWorkerRequests: 0,
        responseTasks: [],
        responseErrors: [],
    };
    const byRequest = new WeakMap<Request, RequestEvidence>();

    await page.context().route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === workerOrigin) {
            evidence.directWorkerRequests += 1;
            evidence.blockedOrigins.add(url.origin);
            await route.abort("blockedbyclient");
            return;
        }

        if (url.origin !== appOrigin && url.origin !== backendOrigin) {
            evidence.blockedOrigins.add(url.origin);
            await route.abort("blockedbyclient");
            return;
        }

        if (url.origin === backendOrigin && url.pathname.startsWith("/api/")) {
            const event: RequestEvidence = {
                method: request.method(),
                path: url.pathname,
                query: url.search,
                request,
                requestBody: request.method() === "POST" ? request.postDataBuffer() ?? Buffer.alloc(0) : undefined,
            };
            evidence.events.push(event);
            byRequest.set(request, event);
        }

        await route.continue();
    });

    page.on("response", (response) => {
        const task = (async () => {
            const event = byRequest.get(response.request());
            if (!event) return;
            const status = response.status();
            event.contentType = response.headers()["content-type"] ?? "";
            if (event.method === "POST" && event.path === "/api/conversion/preview/session" && status >= 200 && status < 300) {
                const payload: unknown = await response.json();
                if (payload && typeof payload === "object") {
                    const record = payload as Record<string, unknown>;
                    if (typeof record.session_id === "string") event.sessionId = record.session_id;
                    if (typeof record.page_count === "number") event.pageCount = record.page_count;
                }
            } else if (event.path.includes("/api/conversion/preview/session/") && status === 200) {
                const contentType = event.contentType.toLowerCase();
                if (contentType.startsWith("image/jpeg")) event.responseBody = await response.body();
            }
            event.status = status;
        })().catch((error: unknown) => {
            evidence.responseErrors.push(error instanceof Error ? error.name : "unknown response capture error");
        });
        evidence.responseTasks.push(task);
    });

    return evidence;
}

async function assertBackendReady(): Promise<void> {
    const [backendResponse, workerResponse] = await Promise.all([
        fetch(`${backendOrigin}/api/health`, { signal: AbortSignal.timeout(5_000) }),
        fetch(`${workerOrigin}/health`, { signal: AbortSignal.timeout(5_000) }),
    ]);
    expect(backendResponse.status, `backend revision ${backendRevision} health`).toBe(200);
    expect(workerResponse.status, `worker revision ${workerRevision} health`).toBe(200);
    const workerHealth: unknown = await workerResponse.json();
    expect(workerHealth).toMatchObject({ status: "ok" });
}

async function openStudio(page: Page): Promise<NetworkEvidence> {
    const evidence = await installNetworkBoundary(page);
    await page.goto(`${appOrigin}/studio`);
    await expect.poll(() => evidence.events.some((event) =>
        event.path === "/api/health" && event.status === 200
    )).toBe(true);
    assertIsolatedBrowserRequests(evidence);
    return evidence;
}

async function waitForUploadCount(page: Page, evidence: NetworkEvidence, count: number): Promise<void> {
    await expect.poll(() => previewUploads(evidence).filter((event) => event.status !== undefined).length).toBe(count);
    await expect(page.getByRole("img", { name: /Preview page \d+/ })).toBeVisible();
    await expect.poll(() => page.getByRole("img", { name: /Preview page \d+/ }).evaluate((image) =>
        (image as HTMLImageElement).naturalWidth
    )).toBeGreaterThan(0);
}

function successfulUploads(evidence: NetworkEvidence): RequestEvidence[] {
    return previewUploads(evidence).filter((event) => event.status === 200);
}

function assertUploadedPdf(event: RequestEvidence, fileName: string, expectedBytes: Buffer): string {
    expect(event.status).toBe(200);
    expect(requestFilename(event.requestBody)).toBe(fileName);
    expect(event.requestBody?.indexOf(expectedBytes) ?? -1).toBeGreaterThanOrEqual(0);
    expect(event.sessionId).toMatch(/^[a-f0-9]{32}$/i);
    expect(event.pageCount).toBeGreaterThan(0);
    return event.sessionId!;
}

function assertWorkerReceived(sessionId: string, expectedBytes: Buffer): void {
    const sourcePath = path.join(workerSessionDirectory, sessionId, "source.pdf");
    const received = readFileSync(sourcePath);
    expect(createHash("sha256").update(received).digest("hex"))
        .toBe(createHash("sha256").update(expectedBytes).digest("hex"));
}

async function assertRenderedJpeg(evidence: NetworkEvidence, sessionId: string, ordinal: number): Promise<void> {
    const pagePath = `/api/conversion/preview/session/${sessionId}/page/1`;
    await expect.poll(() => evidence.events.some((candidate) =>
        candidate.method === "GET" &&
        candidate.path === pagePath &&
        candidate.status === 200 &&
        Boolean(candidate.responseBody)
    )).toBe(true);
    const event = evidence.events.find((candidate) =>
        candidate.method === "GET" &&
        candidate.path === pagePath &&
        candidate.status === 200
    );
    expect(event, `page response for local session ${ordinal}`).toBeDefined();
    expect(event?.query).toBe("?scale=2");
    expect(event?.contentType?.toLowerCase()).toMatch(/^image\/jpeg/);
    expect(event?.responseBody?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    const sessionCreateOrder = evidence.events.findIndex((candidate) => candidate.sessionId === sessionId);
    const pageRequestOrder = evidence.events.indexOf(event!);
    expect(sessionCreateOrder).toBeGreaterThanOrEqual(0);
    expect(pageRequestOrder).toBeGreaterThan(sessionCreateOrder);

    const jpegPath = path.join(evidenceDirectory, `preview-page-${ordinal}.jpg`);
    writeFileSync(jpegPath, event!.responseBody!);
    const dimensions = execFileSync("python3", [
        "-c",
        "from PIL import Image; import json,sys; image=Image.open(sys.argv[1]); image.verify(); image=Image.open(sys.argv[1]); print(json.dumps({'width': image.width, 'height': image.height, 'format': image.format}))",
        jpegPath,
    ], { encoding: "utf8" }).trim();
    const decoded = JSON.parse(dimensions) as { width: number; height: number; format: string };
    expect(decoded.format).toBe("JPEG");
    expect(decoded.width).toBeGreaterThan(0);
    expect(decoded.height).toBeGreaterThan(0);
}

async function deleteSessions(page: Page, evidence: NetworkEvidence): Promise<void> {
    if (page.isClosed()) return;
    const ids = [...new Set(successfulUploads(evidence).flatMap((event) => event.sessionId ? [event.sessionId] : []))];
    if (!ids.length) return;
    const deletions = await page.evaluate(async ({ apiOrigin, sessionIds }) => {
        return Promise.all(sessionIds.map(async (sessionId) => {
            const response = await fetch(
                `${apiOrigin}/api/conversion/preview/session/${encodeURIComponent(sessionId)}`,
                { method: "DELETE", credentials: "include" },
            );
            return { sessionId, status: response.status };
        }));
    }, { apiOrigin: backendOrigin, sessionIds: ids });
    for (const deletion of deletions) {
        expect(deletion.status, "preview session DELETE must succeed for its owning guest").toBe(204);
    }
    await expect.poll(() => ids.every((sessionId) =>
        !existsSync(path.join(workerSessionDirectory, sessionId))
    )).toBe(true);
    await settleNetworkEvidence(evidence);
}

async function sessionPageStatus(page: Page, sessionId: string): Promise<number> {
    return page.evaluate(async ({ apiOrigin, id }) => {
        const response = await fetch(
            `${apiOrigin}/api/conversion/preview/session/${encodeURIComponent(id)}/page/1?scale=2`,
            { credentials: "include" },
        );
        return response.status;
    }, { apiOrigin: backendOrigin, id: sessionId });
}

async function sessionDeleteStatus(page: Page, sessionId: string): Promise<number> {
    return page.evaluate(async ({ apiOrigin, id }) => {
        const response = await fetch(
            `${apiOrigin}/api/conversion/preview/session/${encodeURIComponent(id)}`,
            { method: "DELETE", credentials: "include" },
        );
        return response.status;
    }, { apiOrigin: backendOrigin, id: sessionId });
}

test.describe("REAL BACKEND + REAL PREVIEW WORKER — restored Studio preview", () => {
    test.beforeAll(async () => {
        await assertBackendReady();
        mkdirSync(evidenceDirectory, { recursive: true });
    });

    test("declining restored-project authorization sends no restored PDF and preserves the active document", async ({ page }) => {
        const evidence = await openStudio(page);
        try {
            await page.locator('input[type="file"]').first().setInputFiles({
                name: "ordinary-before-restore.pdf",
                mimeType: "application/pdf",
                buffer: plainPdf,
            });
            await waitForUploadCount(page, evidence, 1);
            const beforeRestore = successfulUploads(evidence).length;

            await page.getByRole("complementary").locator('input[type="file"]').first().setInputFiles({
                name: "restored-history.pns",
                mimeType: "application/x-pdfnest-project",
                buffer: plainProject,
            });
            const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
            await expect(consent).toBeVisible();
            await expect.poll(() => successfulUploads(evidence).length).toBe(beforeRestore);

            await consent.getByRole("button", { name: "Cancel" }).click();
            await expect(consent).toHaveCount(0);
            await expect(page.getByRole("complementary").getByText("ordinary-before-restore.pdf", { exact: true })).toBeVisible();
            expect(successfulUploads(evidence)).toHaveLength(beforeRestore);
            expect(unrelatedProcessingPosts(evidence)).toEqual([]);
            assertIsolatedBrowserRequests(evidence);
        } finally {
            await deleteSessions(page, evidence);
            logNetworkSummary("declined authorization retains active file", evidence);
        }
    });

    test("authorized current, past, and future snapshots reach the real worker; replacement and Undo retain identity-scoped preview", async ({ page }) => {
        const evidence = await openStudio(page);
        try {
            await page.locator('input[type="file"]').first().setInputFiles({
                name: "distinct-preview-history.pns",
                mimeType: "application/x-pdfnest-project",
                buffer: plainProject,
            });
            const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
            await expect(consent).toBeVisible();
            expect(previewUploads(evidence)).toHaveLength(0);
            await consent.getByRole("button", { name: "Authorize Cloud preview" }).click();

            await waitForUploadCount(page, evidence, 1);
            expect(previewUploads(evidence)[0].status).toBe(200);
            const currentSession = assertUploadedPdf(successfulUploads(evidence)[0], "plain-two-pages.pdf", plainPdf);
            assertWorkerReceived(currentSession, plainPdf);
            await assertRenderedJpeg(evidence, currentSession, 1);

            await page.keyboard.press("Control+z");
            await expect(page.getByRole("complementary").getByText("scanned-image-only.pdf", { exact: true })).toBeVisible();
            await waitForUploadCount(page, evidence, 2);
            const pastSession = assertUploadedPdf(successfulUploads(evidence)[1], "scanned-image-only.pdf", scannedPdf);
            assertWorkerReceived(pastSession, scannedPdf);
            await assertRenderedJpeg(evidence, pastSession, 2);

            await page.keyboard.press("Control+y");
            await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true })).toBeVisible();
            await expect(page.getByRole("img", { name: "Preview page 1" })).toBeVisible();
            await page.keyboard.press("Control+y");
            await expect(page.getByRole("complementary").getByText("plain-preview-future.pdf", { exact: true })).toBeVisible();
            await waitForUploadCount(page, evidence, 3);
            const futureSession = assertUploadedPdf(successfulUploads(evidence)[2], "plain-preview-future.pdf", futurePdf);
            assertWorkerReceived(futureSession, futurePdf);
            await assertRenderedJpeg(evidence, futureSession, 3);

            await page.getByRole("complementary").locator('input[type="file"]').first().setInputFiles({
                name: "ordinary-replacement.pdf",
                mimeType: "application/pdf",
                buffer: plainPdf,
            });
            await expect(page.getByRole("complementary").getByText("ordinary-replacement.pdf", { exact: true })).toBeVisible();
            await waitForUploadCount(page, evidence, 4);
            const replacement = assertUploadedPdf(successfulUploads(evidence)[3], "ordinary-replacement.pdf", plainPdf);
            assertWorkerReceived(replacement, plainPdf);
            await assertRenderedJpeg(evidence, replacement, 4);

            await page.keyboard.press("Control+z");
            await expect(page.getByRole("complementary").getByText("plain-preview-future.pdf", { exact: true })).toBeVisible();
            await expect(page.getByRole("img", { name: "Preview page 1" })).toBeVisible();
            await page.keyboard.press("Control+z");
            await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true })).toBeVisible();
            await expect(page.getByRole("img", { name: "Preview page 1" })).toBeVisible();
            await expect(page.getByRole("dialog", { name: /Authorize Cloud preview/i })).toHaveCount(0);

            const uploads = successfulUploads(evidence);
            expect(uploads).toHaveLength(4);
            expect(uploads.map((event) => requestFilename(event.requestBody))).toEqual([
                "plain-two-pages.pdf",
                "scanned-image-only.pdf",
                "plain-preview-future.pdf",
                "ordinary-replacement.pdf",
            ]);
            const renderedSessionIds = evidence.events
                .filter((event) => event.method === "GET" && /\/page\/\d+$/.test(event.path))
                .map((event) => event.path.match(/\/session\/([a-f0-9]{32})\/page\//i)?.[1])
                .filter((id): id is string => Boolean(id));
            expect(new Set(renderedSessionIds)).toEqual(new Set([currentSession, pastSession, futureSession, replacement]));
            expect(unrelatedProcessingPosts(evidence)).toEqual([]);
            expect(evidence.events.filter((event) => event.path === "/api/security/unlock")).toHaveLength(0);
            assertIsolatedBrowserRequests(evidence);
        } finally {
            await deleteSessions(page, evidence);
            logNetworkSummary("authorized current/past/future, replacement and Undo", evidence);
        }
    });

    test("same project bytes imported as a new File require fresh consent; another identity cannot fetch its session", async ({ page, browser }) => {
        const evidence = await openStudio(page);
        let outsiderContext: BrowserContext | undefined;
        let outsiderEvidence: NetworkEvidence | undefined;
        try {
            await page.locator('input[type="file"]').first().setInputFiles({
                name: "first-project.pns",
                mimeType: "application/x-pdfnest-project",
                buffer: plainProject,
            });
            const firstConsent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
            await expect(firstConsent).toBeVisible();
            expect(previewUploads(evidence)).toHaveLength(0);
            await firstConsent.getByRole("button", { name: "Authorize Cloud preview" }).click();
            await waitForUploadCount(page, evidence, 1);
            const sessionId = assertUploadedPdf(successfulUploads(evidence)[0], "plain-two-pages.pdf", plainPdf);
            assertWorkerReceived(sessionId, plainPdf);

            outsiderContext = await browser.newContext({ serviceWorkers: "block" });
            const outsider = await outsiderContext.newPage();
            outsiderEvidence = await installNetworkBoundary(outsider);
            await outsider.goto(`${appOrigin}/studio`);
            const denied = await outsider.evaluate(async ({ apiOrigin, id }) => {
                const response = await fetch(
                    `${apiOrigin}/api/conversion/preview/session/${id}/page/1?scale=2`,
                    { credentials: "include" },
                );
                return { status: response.status, body: await response.json() };
            }, { apiOrigin: backendOrigin, id: sessionId });
            expect(denied.status).toBe(403);
            expect(denied.body).toMatchObject({ code: "PREVIEW_SESSION_FORBIDDEN" });
            expect(outsiderEvidence.events.filter((event) => event.path.includes("/api/conversion/preview/session/")).map((event) => event.status)).toContain(403);
            assertIsolatedBrowserRequests(outsiderEvidence);

            const uploadCount = successfulUploads(evidence).length;
            await page.getByRole("complementary").locator('input[type="file"]').first().setInputFiles({
                name: "same-payload-new-project.pns",
                mimeType: "application/x-pdfnest-project",
                buffer: plainProject,
            });
            const secondConsent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
            await expect(secondConsent).toBeVisible();
            expect(successfulUploads(evidence)).toHaveLength(uploadCount);
            await secondConsent.getByRole("button", { name: "Cancel" }).click();
            await expect(page.getByRole("dialog", { name: /Authorize Cloud preview/i })).toHaveCount(0);
            expect(successfulUploads(evidence)).toHaveLength(uploadCount);
            expect(unrelatedProcessingPosts(evidence)).toEqual([]);
            assertIsolatedBrowserRequests(evidence);
        } finally {
            if (outsiderEvidence) await settleNetworkEvidence(outsiderEvidence);
            await outsiderContext?.close();
            await deleteSessions(page, evidence);
            logNetworkSummary("fresh project consent and owner-isolated session", evidence);
            if (outsiderEvidence) logNetworkSummary("cross-identity page request", outsiderEvidence);
        }
    });

    test("identical PDFs from separate guests keep independent sessions and deletion", async ({ page, browser }) => {
        const evidenceA = await openStudio(page);
        let guestBContext: BrowserContext | undefined;
        let pageB: Page | undefined;
        let evidenceB: NetworkEvidence | undefined;
        try {
            await page.locator('input[type="file"]').first().setInputFiles({
                name: "guest-a-preview.pdf",
                mimeType: "application/pdf",
                buffer: plainPdf,
            });
            await waitForUploadCount(page, evidenceA, 1);
            const sessionA = assertUploadedPdf(successfulUploads(evidenceA)[0], "guest-a-preview.pdf", plainPdf);
            assertWorkerReceived(sessionA, plainPdf);
            await assertRenderedJpeg(evidenceA, sessionA, 5);

            await page.getByRole("complementary").locator('input[type="file"]').first().setInputFiles({
                name: "guest-a-same-content-again.pdf",
                mimeType: "application/pdf",
                buffer: plainPdf,
            });
            await waitForUploadCount(page, evidenceA, 2);
            const sameIdentitySession = assertUploadedPdf(successfulUploads(evidenceA)[1], "guest-a-same-content-again.pdf", plainPdf);

            guestBContext = await browser.newContext({ serviceWorkers: "block" });
            pageB = await guestBContext.newPage();
            evidenceB = await openStudio(pageB);
            await pageB.locator('input[type="file"]').first().setInputFiles({
                name: "guest-b-preview.pdf",
                mimeType: "application/pdf",
                buffer: plainPdf,
            });
            await waitForUploadCount(pageB, evidenceB, 1);
            const sessionB = assertUploadedPdf(successfulUploads(evidenceB)[0], "guest-b-preview.pdf", plainPdf);
            assertWorkerReceived(sessionB, plainPdf);
            await assertRenderedJpeg(evidenceB, sessionB, 6);

            const aOwnAfterB = await sessionPageStatus(page, sessionA);
            const bOwnAfterA = await sessionPageStatus(pageB, sessionB);
            const aCrossPage = await sessionPageStatus(page, sessionB);
            const bCrossPage = await sessionPageStatus(pageB, sessionA);
            const aCrossDelete = await sessionDeleteStatus(page, sessionB);
            const bCrossDelete = await sessionDeleteStatus(pageB, sessionA);
            const deleteA = await sessionDeleteStatus(page, sessionA);
            const bAfterDeleteA = await sessionPageStatus(pageB, sessionB);
            const deleteB = await sessionDeleteStatus(pageB, sessionB);

            await page.locator('input[type="file"]').first().setInputFiles({
                name: "guest-a-preview-after-delete.pdf",
                mimeType: "application/pdf",
                buffer: plainPdf,
            });
            await waitForUploadCount(page, evidenceA, 3);
            const sessionA2 = assertUploadedPdf(successfulUploads(evidenceA)[2], "guest-a-preview-after-delete.pdf", plainPdf);
            assertWorkerReceived(sessionA2, plainPdf);

            await pageB.getByRole("complementary").locator('input[type="file"]').first().setInputFiles({
                name: "guest-b-preview-after-delete.pdf",
                mimeType: "application/pdf",
                buffer: plainPdf,
            });
            await waitForUploadCount(pageB, evidenceB, 2);
            const sessionB2 = assertUploadedPdf(successfulUploads(evidenceB)[1], "guest-b-preview-after-delete.pdf", plainPdf);
            assertWorkerReceived(sessionB2, plainPdf);

            const deleteB2 = await sessionDeleteStatus(pageB, sessionB2);
            const aAfterDeleteB = await sessionPageStatus(page, sessionA2);
            const deleteA2 = await sessionDeleteStatus(page, sessionA2);

            console.info(`[M1-S1-04R] ${JSON.stringify({
                scenario: "two guest identities upload identical PDF bytes",
                sessionIdsDistinct: sessionA !== sessionB,
                sameIdentitySessionReused: sessionA === sameIdentitySession,
                statuses: {
                    aOwnAfterB, bOwnAfterA, aCrossPage, bCrossPage,
                    aCrossDelete, bCrossDelete, deleteA, bAfterDeleteA,
                    deleteB, deleteB2, aAfterDeleteB, deleteA2,
                },
                workerStorageCleaned: [sessionA, sessionB, sessionA2, sessionB2].map((id) => !existsSync(path.join(workerSessionDirectory, id))),
            })}`);

            expect(sessionA).not.toBe(sessionB);
            expect(sameIdentitySession).toBe(sessionA);
            expect(aOwnAfterB).toBe(200);
            expect(bOwnAfterA).toBe(200);
            expect(aCrossPage).toBe(403);
            expect(bCrossPage).toBe(403);
            expect(aCrossDelete).toBe(403);
            expect(bCrossDelete).toBe(403);
            expect(deleteA).toBe(204);
            expect(bAfterDeleteA).toBe(200);
            expect(deleteB).toBe(204);
            expect(deleteB2).toBe(204);
            expect(aAfterDeleteB).toBe(200);
            expect(deleteA2).toBe(204);
            for (const sessionId of [sessionA, sessionB, sessionA2, sessionB2]) {
                expect(existsSync(path.join(workerSessionDirectory, sessionId))).toBe(false);
            }
            expect(unrelatedProcessingPosts(evidenceA)).toEqual([]);
            expect(unrelatedProcessingPosts(evidenceB!)).toEqual([]);
            assertIsolatedBrowserRequests(evidenceA);
            assertIsolatedBrowserRequests(evidenceB!);
        } finally {
            await Promise.all([
                deleteSessions(page, evidenceA),
                pageB && evidenceB ? deleteSessions(pageB, evidenceB) : Promise.resolve(),
            ]);
            await guestBContext?.close();
            logNetworkSummary("guest A identical-content session and ownership requests", evidenceA);
            if (evidenceB) logNetworkSummary("guest B identical-content session and ownership requests", evidenceB);
        }
    });

    test("real worker page rejection is shown without fabricating a successful preview", async ({ page }) => {
        const evidence = await openStudio(page);
        try {
            await page.locator('input[type="file"]').first().setInputFiles({
                name: "out-of-range-preview-metadata.pns",
                mimeType: "application/x-pdfnest-project",
                buffer: invalidPageProject,
            });
            const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
            await expect(consent).toBeVisible();
            expect(previewUploads(evidence)).toHaveLength(0);
            await consent.getByRole("button", { name: "Authorize Cloud preview" }).click();

            await expect.poll(() => evidence.events.some((event) =>
                event.method === "GET" && event.path.endsWith("/page/3") && event.status === 400
            )).toBe(true);
            await expect(page.getByText(/requested page number is invalid for this document/i)).toBeVisible();
            await expect(page.getByText("Preview will appear here.")).toBeVisible();
            await expect(page.getByRole("img", { name: "Preview page 3" })).toHaveCount(0);

            const upload = successfulUploads(evidence)[0];
            expect(upload).toBeDefined();
            const sessionId = assertUploadedPdf(upload, "plain-two-pages.pdf", plainPdf);
            assertWorkerReceived(sessionId, plainPdf);
            expect(unrelatedProcessingPosts(evidence)).toEqual([]);
            assertIsolatedBrowserRequests(evidence);
        } finally {
            await deleteSessions(page, evidence);
            logNetworkSummary("real worker rejects invalid page metadata", evidence);
        }
    });
});
