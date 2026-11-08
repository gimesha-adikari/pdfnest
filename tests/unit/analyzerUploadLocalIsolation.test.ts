import assert from "node:assert/strict";

async function run() {
    const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const originalFetch = globalThis.fetch;
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:8080";

    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const file = new File([zipBytes], "synthetic.zip", { type: "application/zip" });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        assert.ok(url.startsWith("http://127.0.0.1:8080/"), `unapproved upload destination: ${url}`);
        requests.push({ url, init });

        if (url === "http://127.0.0.1:8080/api/storage/r2/presign") {
            return new Response(JSON.stringify({ code: "LOCAL_ANALYZER_DIRECT_UPLOAD_REQUIRED" }), {
                status: 409,
                headers: { "Content-Type": "application/json" },
            });
        }
        if (url === "http://127.0.0.1:8080/api/v1/analyzer/upload") {
            return new Response(JSON.stringify({
                storageKey: "owned/synthetic/repository_analyzer/archive.zip",
                fileName: "synthetic.zip",
                sha256: "synthetic-digest",
                size: zipBytes.byteLength,
                repositoryName: "synthetic",
            }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            });
        }
        throw new Error("Unexpected local upload request.");
    }) as typeof fetch;

    try {
        const { uploadArchiveToStorage } = await import("../../lib/analyzerUploader");
        const result = await uploadArchiveToStorage(file, file.name, "synthetic");

        assert.deepEqual(requests.map((request) => request.url), [
            "http://127.0.0.1:8080/api/storage/r2/presign",
            "http://127.0.0.1:8080/api/v1/analyzer/upload",
        ]);
        assert.equal(requests[0].init?.method, "POST");
        assert.equal(requests[1].init?.method, "POST");
        assert.equal(requests[1].init?.credentials, "include");
        const multipart = requests[1].init?.body as FormData;
        const uploadedFile = multipart.get("file");
        assert.ok(uploadedFile instanceof Blob);
        assert.equal(uploadedFile.size, zipBytes.byteLength);
        assert.equal(result.storageKey, "owned/synthetic/repository_analyzer/archive.zip");

        requests.length = 0;
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
            () => uploadArchiveToStorage(file, file.name, "synthetic", controller.signal),
            (error: unknown) => error instanceof DOMException && error.name === "AbortError",
        );
        assert.equal(requests.length, 0, "cancelled local upload must not issue any request");

        console.log("Analyzer local upload stays on the configured Backend and preserves cancellation.");
    } finally {
        globalThis.fetch = originalFetch;
        if (previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = previousApiUrl;
    }
}

void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
