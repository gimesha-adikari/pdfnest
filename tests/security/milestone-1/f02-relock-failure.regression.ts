import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import { uploadAndDownloadFile } from "../../../lib/api";

const FIXTURE_DIRECTORY = process.env.PLATEN_M1_FIXTURE_DIR || path.join(os.tmpdir(), "platen-m1-security-fixtures");
const USER_PASSWORD = "platen-m1-user-alpha";

type MockResponse = {
    data: Blob;
    headers: Record<string, string>;
    status: number;
    statusText: string;
    config: Record<string, never>;
};

type LockResult = MockResponse | Error;

function makeProtectedInput(): File & { originalPassword: string } {
    const file = new File(["synthetic original protected input"], "protected-alpha.pdf", {
        type: "application/pdf",
    }) as File & { originalPassword: string };
    file.originalPassword = USER_PASSWORD;
    return file;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

function makeResponse(bytes: Buffer, contentType = "application/pdf", status = 200): MockResponse {
    return {
        data: new Blob([toArrayBuffer(bytes)], { type: contentType }),
        headers: contentType ? { "content-type": contentType } : {},
        status,
        statusText: status === 200 ? "OK" : "Synthetic failure",
        config: {},
    };
}

async function runCase(
    name: string,
    processingBytes: Buffer,
    lockResult: LockResult,
    expectedSuccess: boolean,
    processingContentType = "application/pdf",
): Promise<void> {
    const originalPost = axios.post;
    const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const source = makeProtectedInput();
    const formData = new FormData();
    formData.append("file", source);
    const progress: number[] = [];
    let processingCalls = 0;
    let lockCalls = 0;
    let returnedBlob: Blob | undefined;
    let rejected = false;

    process.env.NEXT_PUBLIC_API_URL = "https://m1-fixture.invalid";
    axios.post = (async (url: string) => {
        if (url.endsWith("/api/security/lock")) {
            lockCalls += 1;
            if (lockResult instanceof Error) throw lockResult;
            return lockResult as never;
        }

        processingCalls += 1;
        return makeResponse(processingBytes, processingContentType) as never;
    }) as typeof axios.post;

    try {
        try {
            returnedBlob = await uploadAndDownloadFile(
                "/api/structure/rotate",
                formData,
                (percentage) => progress.push(percentage),
            );
        } catch {
            rejected = true;
        }

        assert.equal(processingCalls, 1, `${name}: one isolated processing request`);
        assert.equal(lockCalls, 1, `${name}: one restoration request`);
        if (expectedSuccess) {
            assert.equal(rejected, false, `${name}: valid encrypted output should be returned`);
            assert.ok(returnedBlob, `${name}: verified result is required`);
            assert.equal(progress.at(-1), 100, `${name}: completion follows validation`);
            assert.equal(progress.filter((value) => value === 100).length, 1, `${name}: completion is reported once`);
        } else {
            assert.equal(rejected, true, `${name}: invalid restoration must reject`);
            assert.equal(returnedBlob, undefined, `${name}: no intermediate or invalid PDF may escape`);
            assert.equal(progress.includes(100), false, `${name}: completion must remain withheld`);
        }
        console.log(`PASS ${name}`);

        if (name === "AES-128 lock output is independently verified before return") {
            const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "platen-m1-f02-output-"));
            const returnedPath = path.join(temporaryDirectory, "verified-result.pdf");
            try {
                writeFileSync(returnedPath, Buffer.from(await returnedBlob!.arrayBuffer()));
                execFileSync("qpdf", [`--password=${USER_PASSWORD}`, "--check", returnedPath], { stdio: "pipe" });
                const details = execFileSync("qpdf", [
                    `--password=${USER_PASSWORD}`,
                    "--show-encryption",
                    returnedPath,
                ], { encoding: "utf8" });
                assert.match(details, /stream encryption method: AESv2\b/);
                console.log("PASS qpdf independently confirms the returned result uses AES-128 encryption");
            } finally {
                rmSync(temporaryDirectory, { recursive: true, force: true });
            }
        }
    } finally {
        axios.post = originalPost;
        if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
}

async function main(): Promise<void> {
    const processingBytes = readFileSync(path.join(FIXTURE_DIRECTORY, "plain-two-pages.pdf"));
    const validLockedBytes = readFileSync(path.join(FIXTURE_DIRECTORY, "protected-lock-output-aes128.pdf"));
    const wrongPasswordBytes = readFileSync(path.join(FIXTURE_DIRECTORY, "protected-beta.pdf"));
    const malformedBytes = readFileSync(path.join(FIXTURE_DIRECTORY, "malformed.pdf"));

    await runCase(
        "failed /api/security/lock request rejects without returning the processing Blob",
        processingBytes,
        Object.assign(new Error("Injected synthetic re-lock network failure"), {
            code: "ERR_NETWORK",
            response: { status: 503 },
        }),
        false,
    );
    await runCase(
        "HTTP 503 from /api/security/lock rejects",
        processingBytes,
        makeResponse(validLockedBytes, "application/pdf", 503),
        false,
    );
    await runCase(
        "HTTP 200 plaintext PDF is rejected",
        processingBytes,
        makeResponse(processingBytes),
        false,
    );
    await runCase(
        "PDF response with application/octet-stream still requires restoration",
        processingBytes,
        makeResponse(processingBytes),
        false,
        "application/octet-stream",
    );
    await runCase(
        "PDF response without a media type still requires restoration",
        processingBytes,
        makeResponse(processingBytes),
        false,
        "",
    );
    await runCase(
        "malformed lock response is rejected",
        processingBytes,
        makeResponse(malformedBytes),
        false,
    );
    await runCase(
        "unexpected lock response content is rejected",
        processingBytes,
        makeResponse(Buffer.from("{\"ok\":true}"), "application/json"),
        false,
    );
    await runCase(
        "PDF encrypted under another user password is rejected",
        processingBytes,
        makeResponse(wrongPasswordBytes),
        false,
    );
    await runCase(
        "AES-128 lock output is independently verified before return",
        processingBytes,
        makeResponse(validLockedBytes),
        true,
    );
    await runCase(
        "AES-128 lock output remains verifiable with a generic media type",
        processingBytes,
        makeResponse(validLockedBytes, "application/octet-stream"),
        true,
    );

    console.log("\nAll F-02 restoration invariants passed.");
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
