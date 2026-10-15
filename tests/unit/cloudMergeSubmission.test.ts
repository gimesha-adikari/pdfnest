import assert from "node:assert/strict";
import axios from "axios";
import { CloudExecutor } from "@/lib/execution/CloudExecutor";
import {
    authorizeCloudProcessingInputs,
    getPdfInputPreparation,
    markPdfInputPreparation,
    setTransientOriginalPassword,
} from "@/lib/security/pdfInputPreparation";

function createPdf(name: string): File {
    return new File([`%PDF-1.7\n${name}`], name, { type: "application/pdf" });
}

async function main(): Promise<void> {
    const priorApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const priorPost = axios.post;
    const calls: Array<{ url: string; body: FormData }> = [];
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:3999";
    axios.post = (async (url: string, body: FormData) => {
        calls.push({ url, body });
        return {
            status: 200,
            data: new Blob(["%PDF-1.7\nsynthetic merge result"], { type: "application/pdf" }),
            headers: { "content-type": "application/pdf" },
        };
    }) as typeof axios.post;

    try {
        const protectedSource = createPdf("protected-source.pdf");
        setTransientOriginalPassword(protectedSource, "synthetic-source-password");
        markPdfInputPreparation(protectedSource, {
            sourceProtected: true,
            bytesState: "decrypted",
            preparedOn: "device",
            processingMode: "device",
            cloudSubmissionInitiated: false,
        });
        const plain = createPdf("plain.pdf");
        markPdfInputPreparation(plain, {
            sourceProtected: false,
            bytesState: "plain",
            preparedOn: "none",
            processingMode: "cloud",
            cloudSubmissionInitiated: false,
        });

        await assert.rejects(
            CloudExecutor.execute({
                tool: "merge",
                files: [protectedSource, plain],
                mode: "cloud",
            }),
            /explicit Cloud processing authorization/i,
            "protected-source Merge must fail before making its Cloud request without route-scoped consent",
        );
        assert.equal(calls.length, 0, "authorization rejection must happen before the request boundary");

        const unselectedBatchMember = createPdf("not-submitted.pdf");
        markPdfInputPreparation(unselectedBatchMember, {
            sourceProtected: true,
            bytesState: "decrypted",
            preparedOn: "device",
            processingMode: "device",
            cloudSubmissionInitiated: false,
        });
        Object.defineProperty(protectedSource, "initialBatch", {
            value: [protectedSource, unselectedBatchMember],
            configurable: true,
        });
        authorizeCloudProcessingInputs([protectedSource], "merge-pdf");
        assert.equal(
            getPdfInputPreparation(unselectedBatchMember)?.cloudProcessingAuthorizedForTool,
            undefined,
            "authorizing the current Merge input must not authorize a removed batch member",
        );
        await CloudExecutor.execute({
            tool: "merge",
            files: [protectedSource, plain],
            mode: "cloud",
            password: "synthetic-source-password",
            passwords: ["synthetic-source-password", "synthetic-other-password"],
            params: {
                password_0: "synthetic-source-password",
                password_1: "synthetic-other-password",
                file_password: "synthetic-source-password",
            },
        });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, "http://127.0.0.1:3999/api/structure/merge");
        assert.deepEqual(
            Array.from(calls[0].body.keys()),
            ["files", "files"],
            "Merge accepts prepared PDF files only; source-password fields are not part of its backend contract",
        );
        assert.equal((calls[0].body.getAll("files")[0] as File).name, "protected-source.pdf");
        assert.equal((calls[0].body.getAll("files")[1] as File).name, "plain.pdf");
        assert.equal(calls[0].body.has("password_0"), false);
        assert.equal(calls[0].body.has("password_1"), false);
        assert.equal(calls[0].body.has("file_password"), false);
        assert.equal(getPdfInputPreparation(protectedSource)?.cloudSubmissionInitiated, true);

        const ordinary = createPdf("ordinary.pdf");
        markPdfInputPreparation(ordinary, {
            sourceProtected: false,
            bytesState: "plain",
            preparedOn: "none",
            processingMode: "cloud",
            cloudSubmissionInitiated: false,
        });
        await CloudExecutor.execute({ tool: "merge", files: [ordinary, plain], mode: "cloud" });
        assert.equal(calls.length, 2, "ordinary all-plain Merge remains available without a consent marker");

        const mergedProtectedOutput = createPdf("merged-protected-output.pdf");
        markPdfInputPreparation(mergedProtectedOutput, {
            sourceProtected: true,
            bytesState: "plain",
            preparedOn: "device",
            processingMode: "device",
            cloudSubmissionInitiated: false,
            derivedFromProtectedInput: true,
        });
        await assert.rejects(
            CloudExecutor.execute({
                tool: "lock",
                files: [mergedProtectedOutput],
                mode: "cloud",
                params: { password: "synthetic-new-output-password" },
                cloudAuthorizationTool: "merge-output-lock",
            }),
            /explicit Cloud processing authorization/i,
            "Cloud output protection must have a separate scope from input Merge consent",
        );
        assert.equal(calls.length, 2, "missing output-lock consent blocks the request");
        authorizeCloudProcessingInputs([mergedProtectedOutput], "merge-output-lock");
        let outputLockRequestStarted = false;
        await CloudExecutor.execute({
            tool: "lock",
            files: [mergedProtectedOutput],
            mode: "cloud",
            params: { password: "synthetic-new-output-password" },
            cloudAuthorizationTool: "merge-output-lock",
            onCloudSubmissionInitiated: () => { outputLockRequestStarted = true; },
        });
        assert.equal(calls.length, 3);
        assert.equal(calls[2].url, "http://127.0.0.1:3999/api/security/lock");
        assert.deepEqual(Array.from(calls[2].body.keys()), ["file", "password"]);
        assert.equal(calls[2].body.get("password"), "synthetic-new-output-password");
        assert.equal(outputLockRequestStarted, true, "the callback runs at the request-start boundary");
    } finally {
        axios.post = priorPost;
        if (priorApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = priorApiUrl;
    }
}

void main();
