import assert from "node:assert/strict";
import axios from "axios";
import { PDFDocument } from "pdf-lib";
import { uploadAndDownloadFile } from "../../lib/api";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

async function main(): Promise<void> {
    const originalPost = axios.post;
    const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const plainPdfDocument = await PDFDocument.create();
    plainPdfDocument.addPage([300, 400]);
    const plainPdf = new Blob([toArrayBuffer(await plainPdfDocument.save({ useObjectStreams: false }))], {
        type: "application/pdf",
    });
    const processingPdf = new Blob(["synthetic plaintext result"], { type: "application/pdf" });
    const source = new File(["synthetic protected input"], "protected.pdf", {
        type: "application/pdf",
    }) as File & { originalPassword: string };
    source.originalPassword = "synthetic-user-password";

    process.env.NEXT_PUBLIC_API_URL = "https://m1-fixture.invalid";

    try {
        const rejectRestoration = async (
            label: string,
            lockResponse: () => Promise<unknown>,
            processingBlob: Blob = processingPdf,
            outputKind?: "pdf" | "non-pdf",
        ) => {
            const progress: number[] = [];
            let lockCalls = 0;
            const formData = new FormData();
            formData.append("file", source);
            axios.post = (async (url: string) => {
                if (url.endsWith("/api/security/lock")) {
                    lockCalls += 1;
                    return lockResponse();
                }
                return {
                    data: processingBlob,
                    headers: { "content-type": processingBlob.type },
                    status: 200,
                    statusText: "OK",
                    config: {},
                } as never;
            }) as typeof axios.post;

            await assert.rejects(
                uploadAndDownloadFile(
                    "/api/structure/rotate",
                    formData,
                    (value) => progress.push(value),
                    undefined,
                    outputKind,
                ),
                (error: unknown) => {
                    assert.match(String((error as Error).message), /password protection could not be restored/i);
                    assert.notEqual((error as { status?: number }).status, 200, `${label} must not expose HTTP success as an error status`);
                    return true;
                },
                `${label} must not return the intermediate PDF`,
            );
            assert.equal(lockCalls, 1, `${label} should issue one restoration request`);
            assert.equal(progress.includes(100), false, `${label} must withhold completion`);
        };

        await rejectRestoration("lock network failure", async () => {
            throw Object.assign(new Error("synthetic lock transport failure"), { code: "ERR_NETWORK" });
        });
        await rejectRestoration("lock HTTP failure", async () => ({
            data: new Blob(["synthetic error"], { type: "application/pdf" }),
            headers: { "content-type": "application/pdf" },
            status: 503,
            statusText: "Service Unavailable",
            config: {},
        }));
        await rejectRestoration("plaintext HTTP 200 lock response", async () => ({
            data: plainPdf,
            headers: { "content-type": "application/pdf" },
            status: 200,
            statusText: "OK",
            config: {},
        }));
        await rejectRestoration("generic-content-type PDF response still requires restoration", async () => ({
            data: plainPdf,
            headers: { "content-type": "application/pdf" },
            status: 200,
            statusText: "OK",
            config: {},
        }), new Blob([plainPdf], { type: "application/octet-stream" }));
        await rejectRestoration("missing-content-type PDF response still requires restoration", async () => ({
            data: plainPdf,
            headers: {},
            status: 200,
            statusText: "OK",
            config: {},
        }), new Blob([plainPdf]));
        await rejectRestoration("PDF bytes with a misleading JSON content type still require restoration", async () => ({
            data: plainPdf,
            headers: { "content-type": "application/pdf" },
            status: 200,
            statusText: "OK",
            config: {},
        }), new Blob([await plainPdf.arrayBuffer()], { type: "application/json" }));
        await rejectRestoration("known PDF output contract rejects an error body without a PDF signature", async () => ({
            data: plainPdf,
            headers: { "content-type": "application/pdf" },
            status: 200,
            statusText: "OK",
            config: {},
        }), new Blob(["synthetic backend error"], { type: "application/json" }), "pdf");
        await rejectRestoration("malformed PDF lock response", async () => ({
            data: new Blob(["%PDF-1.7\nmalformed synthetic bytes"], { type: "application/pdf" }),
            headers: { "content-type": "application/pdf" },
            status: 200,
            statusText: "OK",
            config: {},
        }));
        await rejectRestoration("unexpected lock response content type", async () => ({
            data: new Blob(["{\"ok\":true}"], { type: "application/json" }),
            headers: { "content-type": "application/json" },
            status: 200,
            statusText: "OK",
            config: {},
        }));

        const cancelledAfterProcessing = new AbortController();
        let lockCallsAfterProcessingCancellation = 0;
        axios.post = (async (url: string) => {
            if (url.endsWith("/api/security/lock")) lockCallsAfterProcessingCancellation += 1;
            cancelledAfterProcessing.abort();
            return {
                data: processingPdf,
                headers: { "content-type": "application/pdf" },
                status: 200,
                statusText: "OK",
                config: {},
            } as never;
        }) as typeof axios.post;
        const cancelledFormData = new FormData();
        cancelledFormData.append("file", source);
        await assert.rejects(
            uploadAndDownloadFile("/api/structure/rotate", cancelledFormData, undefined, cancelledAfterProcessing.signal),
            (error: unknown) => (error as { code?: string }).code === "USER_CANCELLATION",
        );
        assert.equal(lockCallsAfterProcessingCancellation, 0, "cancellation before restoration must prevent a lock upload");

        const duringLock = new AbortController();
        let announceLockStarted!: () => void;
        const lockStarted = new Promise<void>((resolve) => { announceLockStarted = resolve; });
        let lockSignal: AbortSignal | undefined;
        axios.post = (async (url: string, _data: unknown, config: { signal?: AbortSignal }) => {
            if (!url.endsWith("/api/security/lock")) {
                return {
                    data: processingPdf,
                    headers: { "content-type": "application/pdf" },
                    status: 200,
                    statusText: "OK",
                    config: {},
                } as never;
            }
            lockSignal = config.signal;
            announceLockStarted();
            return new Promise((_resolve, reject) => {
                config.signal?.addEventListener("abort", () => {
                    reject(Object.assign(new Error("synthetic cancellation"), {
                        name: "CanceledError",
                        code: "ERR_CANCELED",
                    }));
                }, { once: true });
            });
        }) as typeof axios.post;
        const duringLockFormData = new FormData();
        duringLockFormData.append("file", source);
        const pendingLock = uploadAndDownloadFile(
            "/api/structure/rotate",
            duringLockFormData,
            undefined,
            duringLock.signal,
        );
        await lockStarted;
        duringLock.abort();
        await assert.rejects(
            pendingLock,
            (error: unknown) => (error as { code?: string }).code === "USER_CANCELLATION",
        );
        assert.equal(lockSignal, duringLock.signal, "the restoration request must share the operation signal");

        const verifyNoRestoration = async (
            endpoint: string,
            output: Blob,
            input: File,
            outputKind?: "pdf" | "non-pdf",
        ) => {
            let lockCalls = 0;
            const formData = new FormData();
            formData.append("file", input);
            axios.post = (async (url: string) => {
                if (url.endsWith("/api/security/lock")) lockCalls += 1;
                return {
                    data: output,
                    headers: { "content-type": output.type },
                    status: 200,
                    statusText: "OK",
                    config: {},
                } as never;
            }) as typeof axios.post;
            const result = await uploadAndDownloadFile(endpoint, formData, undefined, undefined, outputKind);
            assert.equal(result, output);
            const expectedLockCalls = endpoint.split("?", 1)[0].replace(/\/+$/, "") === "/api/security/lock" ? 1 : 0;
            assert.equal(lockCalls, expectedLockCalls, `${endpoint} must not issue a duplicate or irrelevant lock request`);
        };

        const plainSource = new File(["plain source"], "plain.pdf", { type: "application/pdf" });
        await verifyNoRestoration("/api/structure/rotate", plainPdf, plainSource);
        await verifyNoRestoration(
            "/api/conversion/pdf-to-word",
            new Blob(["synthetic docx export"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
            source,
            "non-pdf",
        );
        await verifyNoRestoration(
            "/api/conversion/pdf-to-word",
            new Blob(["synthetic binary export"], { type: "application/octet-stream" }),
            source,
        );
        await verifyNoRestoration("/api/security/unlock", plainPdf, source);
        await verifyNoRestoration("/api/security/lock", plainPdf, source);
    } finally {
        axios.post = originalPost;
        if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
