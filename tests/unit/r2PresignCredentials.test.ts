import assert from "node:assert/strict";
import { uploadFilesToR2 } from "@/lib/r2";

type CredentialCase = {
    name: string;
    flags: Record<string, unknown>;
    expected: boolean;
};

const cases: CredentialCase[] = [
    { name: "snake true", flags: { with_credentials: true }, expected: true },
    { name: "snake false", flags: { with_credentials: false }, expected: false },
    { name: "camel true", flags: { withCredentials: true }, expected: true },
    { name: "camel false", flags: { withCredentials: false }, expected: false },
    { name: "missing flags", flags: {}, expected: false },
    { name: "camel false overrides snake true", flags: { withCredentials: false, with_credentials: true }, expected: false },
    { name: "camel true overrides snake false", flags: { withCredentials: true, with_credentials: false }, expected: true },
    { name: "both false", flags: { withCredentials: false, with_credentials: false }, expected: false },
    { name: "both true", flags: { withCredentials: true, with_credentials: true }, expected: true },
    { name: "snake string is not permission", flags: { with_credentials: "false" }, expected: false },
    { name: "camel string is not permission or a missing value", flags: { withCredentials: "false", with_credentials: true }, expected: false },
];

type SentUpload = {
    method: string;
    url: string;
    credentials: boolean;
    body: File;
};

const uploads: SentUpload[] = [];

class MockXMLHttpRequest {
    status = 204;
    responseText = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private credentialFlag = false;
    private method = "";
    private url = "";

    get withCredentials(): boolean { return this.credentialFlag; }
    set withCredentials(value: boolean) {
        // XMLHttpRequest's Web IDL boolean property coerces assigned values.
        this.credentialFlag = Boolean(value);
    }

    open(method: string, url: string, async: boolean): void {
        assert.equal(async, true);
        this.method = method;
        this.url = url;
    }

    setRequestHeader(): void {}
    abort(): void { this.onabort?.(); }

    send(body: File): void {
        uploads.push({ method: this.method, url: this.url, credentials: this.withCredentials, body });
        this.onload?.();
    }
}

async function main(): Promise<void> {
    const originalFetch = globalThis.fetch;
    const originalApi = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://upload.invalid";
    const originalXHR = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest");
    const endpoint = "https://presign.invalid/api/storage/r2/presign";
    const uploadUrl = "https://upload.invalid/local-ocr-image";
    const file = new File(["small synthetic image"], "synthetic.png", { type: "image/png" });
    let flags: Record<string, unknown> = {};
    let presignCalls = 0;

    globalThis.fetch = async (input, init) => {
        presignCalls += 1;
        assert.equal(String(input), endpoint);
        assert.equal(init?.method, "POST");
        assert.equal(init?.credentials, "include", "presign authentication remains independent of upload credentials");
        return new Response(JSON.stringify({ files: [{
            name: file.name,
            size: file.size,
            type: file.type,
            key: "owned/synthetic/input.png",
            uploadUrl,
            method: "PUT",
            ...flags,
        }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: MockXMLHttpRequest });

    try {
        for (const test of cases) {
            flags = test.flags;
            const before = uploads.length;
            const normalized = await uploadFilesToR2([file], {
                purpose: "image_to_text_pdf",
                prefix: "synthetic",
                endpoint,
            });
            assert.equal(normalized[0].withCredentials, test.expected, `${test.name}: normalized flag`);
            assert.equal(uploads.length, before + 1, `${test.name}: exactly one upload`);
            assert.deepEqual(uploads[before], {
                method: "PUT", url: uploadUrl, credentials: test.expected, body: file,
            }, `${test.name}: actual XHR send uses normalized credentials`);
        }
        assert.equal(presignCalls, cases.length);
        console.log(`PASS: ${cases.length} presign credential cases and mocked XHR uploads; no network requests`);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = originalApi;
        if (originalXHR) Object.defineProperty(globalThis, "XMLHttpRequest", originalXHR);
        else Reflect.deleteProperty(globalThis, "XMLHttpRequest");
    }
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
