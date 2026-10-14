import assert from "node:assert/strict";
import {
    verifyProtectedPdfBlob,
    type PdfJsRuntime,
} from "../../lib/security/verifyProtectedPdf";

type FakeDocument = {
    numPages: number;
    getPage: (pageNumber: number) => Promise<unknown>;
};

function taskFor(promise: Promise<FakeDocument>): { promise: Promise<FakeDocument>; destroy: () => Promise<void> } {
    return { promise, destroy: async () => undefined };
}

function passwordProtectedRuntime(expectedPassword: string): PdfJsRuntime {
    return {
        PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
        getDocument: ({ password }) => {
            if (password === undefined) {
                return taskFor(Promise.reject({ name: "PasswordException", code: 1 })) as never;
            }
            if (password === expectedPassword) {
                return taskFor(Promise.resolve({ numPages: 1, getPage: async () => ({ pageNumber: 1 }) })) as never;
            }
            return taskFor(Promise.reject({ name: "PasswordException", code: 2 })) as never;
        },
    };
}

async function main(): Promise<void> {
    const protectedRuntime = passwordProtectedRuntime("synthetic-password");
    await verifyProtectedPdfBlob(
        new Blob(["synthetic parser bytes"], { type: "application/pdf" }),
        "synthetic-password",
        undefined,
        protectedRuntime,
    );

    const plainRuntime: PdfJsRuntime = {
        PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
        getDocument: () => taskFor(Promise.resolve({ numPages: 1, getPage: async () => ({ pageNumber: 1 }) })) as never,
    };
    await assert.rejects(
        verifyProtectedPdfBlob(new Blob(["plain"]), "synthetic-password", undefined, plainRuntime),
        /password protection could not be verified/i,
        "a parser-openable document must not be accepted as protected",
    );

    const wrongPasswordRuntime: PdfJsRuntime = {
        PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
        getDocument: ({ password }) => {
            const code = password === undefined ? 1 : 2;
            return taskFor(Promise.reject({ name: "PasswordException", code })) as never;
        },
    };
    await assert.rejects(
        verifyProtectedPdfBlob(new Blob(["protected"]), "wrong-expected-password", undefined, wrongPasswordRuntime),
        /password protection could not be verified/i,
        "the expected user password must actually open the encrypted PDF",
    );

    let markValidationStarted!: () => void;
    const validationStarted = new Promise<void>((resolve) => { markValidationStarted = resolve; });
    let rejectPending!: (error: unknown) => void;
    let destroyCalls = 0;
    const pendingRuntime: PdfJsRuntime = {
        PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
        getDocument: () => {
            markValidationStarted();
            const promise = new Promise<FakeDocument>((_resolve, reject) => { rejectPending = reject; });
            return {
                promise,
                destroy: async () => {
                    destroyCalls += 1;
                    rejectPending(new Error("synthetic validation task destroyed"));
                },
            } as never;
        },
    };
    const controller = new AbortController();
    const pendingValidation = verifyProtectedPdfBlob(
        new Blob(["synthetic parser bytes"]),
        "synthetic-password",
        controller.signal,
        pendingRuntime,
    );
    await validationStarted;
    controller.abort();
    await assert.rejects(
        pendingValidation,
        (error: unknown) => (error as { code?: string }).code === "USER_CANCELLATION",
        "cancelling PDF.js validation must remain a cancellation",
    );
    assert.equal(destroyCalls, 1, "cancellation must destroy the active PDF.js loading task exactly once");
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
