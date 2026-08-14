/**
 * Unit tests for lib/errorHandler.ts
 *
 * Run: npx tsx tests/unit/errorHandler.test.ts
 */

import assert from "assert";

type ToastPayloadLike = {
    id: string;
    type: string;
    message: string;
    title?: string;
    description?: string;
};

let toasts: ToastPayloadLike[] = [];

(globalThis as unknown as { window: unknown }).window = {
    __GLOBAL_NOTIFY__: (toast: ToastPayloadLike) => toasts.push(toast),
    __PLATEN_SESSION__: { tier: "free" },
    location: { href: "" },
};

import type { BackendError, ClientError } from "../../lib/api";
import { getFriendlyErrorMessage, handleClientError } from "../../lib/errorHandler";

function reset() {
    toasts = [];
}

function backendErrorAsError(payload: Partial<BackendError>): Error {
    return new Error(JSON.stringify(payload));
}

function clientErrorWithBilling(billing: BackendError): ClientError {
    const err = new Error("wrapped message") as ClientError;
    err.billing = billing;
    return err;
}

const tests: Array<[string, () => void]> = [
    ["getFriendlyErrorMessage handles null and undefined", () => {
        assert.equal(getFriendlyErrorMessage(null), "Something went wrong.");
        assert.equal(getFriendlyErrorMessage(undefined), "Something went wrong.");
    }],

    ["getFriendlyErrorMessage prefers the billing message", () => {
        const err = clientErrorWithBilling({ code: "DAILY_LIMIT_REACHED", message: "Daily limit hit" });
        assert.equal(getFriendlyErrorMessage(err), "Daily limit hit");
    }],

    ["getFriendlyErrorMessage maps known backend codes to friendly copy", () => {
        const cases: Array<[string, string]> = [
            [
                "COMPRESSION_ENGINE_FAILED",
                "The optimization processor encountered an issue resizing this PDF. Ensure the file is not corrupted.",
            ],
            ["RASTERIZATION_FAILED", "The OCR engine could not read this document. Try a higher quality scan."],
            ["OCR_EXTRACTION_FAILED", "The OCR engine could not read this document. Try a higher quality scan."],
            ["DECRYPTION_AUTH_FAILED", "Incorrect PDF password."],
            ["DECRYPTION_METADATA_FAILED", "Incorrect PDF password."],
            ["INVALID_MULTIPART_FORM", "File upload failed. Please upload the file again."],
            ["INSUFFICIENT_FILES", "Please select at least two PDF files to merge."],
        ];

        for (const [code, expected] of cases) {
            const message = getFriendlyErrorMessage(
                backendErrorAsError({ code, message: "raw backend message" })
            );
            assert.equal(message, expected, `mapping for ${code}`);
        }
    }],

    ["getFriendlyErrorMessage falls back to the backend message for unknown codes", () => {
        const message = getFriendlyErrorMessage(
            backendErrorAsError({ code: "SOMETHING_NEW", message: "Backend said no" })
        );
        assert.equal(message, "Backend said no");
    }],

    ["getFriendlyErrorMessage falls back to generic copy for an unknown code without a message", () => {
        const message = getFriendlyErrorMessage(backendErrorAsError({ code: "SOMETHING_NEW", message: "" }));
        assert.equal(message, "Unexpected server error.");
    }],

    ["getFriendlyErrorMessage returns the raw message for plain errors", () => {
        assert.equal(getFriendlyErrorMessage(new Error("Network transport failure.")), "Network transport failure.");
    }],

    ["getFriendlyErrorMessage returns the raw message when the JSON payload is malformed", () => {
        assert.equal(getFriendlyErrorMessage(new Error('{"code":')), '{"code":');
    }],

    ["getFriendlyErrorMessage reports a connection problem for non-Error values", () => {
        assert.equal(getFriendlyErrorMessage("just a string"), "Unable to connect to PDFNest.");
        assert.equal(getFriendlyErrorMessage({ status: 500 }), "Unable to connect to PDFNest.");
    }],

    ["handleClientError notifies with the friendly message and returns it", () => {
        reset();

        const returned = handleClientError(
            backendErrorAsError({ code: "DECRYPTION_AUTH_FAILED", message: "raw" })
        );

        assert.equal(returned, "Incorrect PDF password.");
        assert.equal(toasts.length, 1);
        assert.equal(toasts[0].message, "Incorrect PDF password.");
        assert.equal(toasts[0].type, "error");
    }],

    ["handleClientError routes billing errors through the billing toast", () => {
        reset();

        const returned = handleClientError(
            clientErrorWithBilling({
                code: "DAILY_LIMIT_REACHED",
                message: "Daily limit hit",
                upgradeRecommended: true,
            })
        );

        assert.equal(returned, "Daily limit hit");
        assert.equal(toasts.length, 1);
        assert.equal(toasts[0].message, "Daily limit hit");
        assert.equal(toasts[0].title, "Daily limit reached", "billing toast carries the derived title");
        assert.ok(toasts[0].description, "billing toast carries a description");
    }],

    ["handleClientError notifies for non-Error values too", () => {
        reset();

        const returned = handleClientError("just a string");

        assert.equal(returned, "Unable to connect to PDFNest.");
        assert.equal(toasts.length, 1);
        assert.equal(toasts[0].message, "Unable to connect to PDFNest.");
    }],

    ["handleClientError throws on nullish input (known gap: no nullish guard)", () => {
        reset();

        assert.throws(() => handleClientError(undefined));
        assert.throws(() => handleClientError(null));
    }],
];

function runTests(): void {
    console.log("Running errorHandler tests...");
    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            fn();
            passed += 1;
            console.log(`  PASS  ${name}`);
        } catch (e) {
            failed += 1;
            console.error(`  FAIL  ${name}`);
            console.error(`        ${(e as Error).message}`);
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
