import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { telemetry } from "../../lib/execution/telemetry";
import { ExecutionError, type ExecutionOptions } from "../../lib/execution/types";
import {
    hasCloudSubmissionInitiated,
    markCloudSubmissionInitiated,
    markPdfInputPreparation,
} from "../../lib/security/pdfInputPreparation";

async function main() {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]);
    const file = new File([new Uint8Array(await pdf.save())], "synthetic.pdf", { type: "application/pdf" });
    const originalClient = ClientExecutor.execute;
    const originalCloud = CloudExecutor.execute;
    const flagKeys = ["NEXT_PUBLIC_HYBRID_ENABLE_ALL", "NEXT_PUBLIC_HYBRID_ENABLE_ROTATE"];
    const savedFlags = flagKeys.map(key => process.env[key]);
    let cloudCalls = 0, clientCalls = 0, passed = 0, failed = 0;
    const cloudBlob = new Blob(["synthetic cloud boundary"]);
    let cloudOptions: ExecutionOptions | undefined;
    CloudExecutor.execute = async options => {
        cloudCalls++;
        cloudOptions = options;
        return cloudBlob;
    };

    async function test(name: string, run: () => Promise<void>) {
        cloudCalls = 0;
        clientCalls = 0;
        cloudOptions = undefined;
        telemetry.clearEvents();
        for (const key of flagKeys) delete process.env[key];
        ClientExecutor.execute = async options => { clientCalls++; return originalClient.call(ClientExecutor, options); };
        try { await run(); passed++; console.log(`PASS ${name}`); }
        catch (error) { failed++; console.error(`FAIL ${name}`, error); }
    }

    async function rejectsLocally(options: ExecutionOptions, code: ExecutionError["code"], expectedClientCalls: number) {
        try {
            await assert.rejects(ExecutionManager.run(options), (error: unknown) => error instanceof ExecutionError && error.code === code);
        } finally {
            assert.equal(cloudCalls, 0, "explicit Device must never invoke CloudExecutor");
        }
        assert.equal(clientCalls, expectedClientCalls);
        const event = telemetry.getLastEvent();
        assert.equal(event?.success, false);
        assert.equal(event?.fallbackOccurred, false);
        assert.notEqual(event?.actualMode, "cloud");
    }

    try {
        // A permissive/default fallback option must never override explicit venue choice.
        for (const allowFallback of [undefined, true, false]) {
            const options: ExecutionOptions = { tool: "rotate", files: [file], mode: "device", allowFallback };
            await test(`Device unsupported tool, allowFallback=${allowFallback}`, async () => {
                await rejectsLocally({ ...options, tool: "word_to_pdf" }, "UNSUPPORTED_CLIENT_OP", 0);
            });
            for (const flag of flagKeys) await test(`Device ${flag}=false, allowFallback=${allowFallback}`, async () => {
                process.env[flag] = "false";
                await rejectsLocally(options, "UNSUPPORTED_CLIENT_OP", 0);
                assert.equal(telemetry.getLastEvent()?.featureFlagDisabled, true);
            });
            await test(`Device real local engine failure, allowFallback=${allowFallback}`, async () => {
                const malformed = new File(["%PDF-invalid"], "broken.pdf", { type: "application/pdf" });
                await rejectsLocally({ ...options, files: [malformed] }, "CLIENT_FAILURE", 1);
            });
            for (const passwordSource of ["option", "file"] as const) await test(`Device protected ${passwordSource}, allowFallback=${allowFallback}`, async () => {
                const protectedFile: File & { originalPassword?: string } = new File([file], "protected-synthetic.pdf", { type: "application/pdf" });
                if (passwordSource === "file") protectedFile.originalPassword = "synthetic-password";
                await rejectsLocally({ ...options, files: [protectedFile], password: passwordSource === "option" ? "synthetic-password" : undefined }, "UNSUPPORTED_CLIENT_OP", 1);
            });
            await test(`Device real safety rejection, allowFallback=${allowFallback}`, async () => {
                const oversized = new File([new Uint8Array(26 * 1024 * 1024)], "large-synthetic.pdf");
                await rejectsLocally({ ...options, files: [oversized] }, "SAFETY_REJECTION", 0);
            });
        }
        await test("Device successful local PDF operation returns valid rotated artifact", async () => {
            const result = await ExecutionManager.run({ tool: "rotate", files: [file], mode: "device", params: { rotations: { "1": 90 } } });
            assert.equal(result.executionMode, "client");
            assert.equal(result.fallbackOccurred, false);
            assert.equal(cloudCalls, 0);
            const output = await PDFDocument.load(await result.blob.arrayBuffer());
            assert.equal(output.getPageCount(), 1);
            assert.equal(output.getPage(0).getRotation().angle, 90);
        });
        await test("Device wraps unexpected local errors without Cloud", async () => {
            ClientExecutor.execute = async () => { clientCalls++; throw new Error("synthetic engine crash"); };
            await rejectsLocally({ tool: "rotate", files: [file], mode: "device" }, "CLIENT_FAILURE", 1);
        });
        await test("Device refuses an input after Cloud submission was initiated", async () => {
            const transmitted = new File([file], "cloud-transmitted.pdf", { type: "application/pdf" });
            markPdfInputPreparation(transmitted, {
                sourceProtected: true,
                bytesState: "decrypted",
                preparedOn: "device",
                processingMode: "device",
                cloudSubmissionInitiated: false,
            });
            markCloudSubmissionInitiated([transmitted]);
            await rejectsLocally({ tool: "rotate", files: [transmitted], mode: "device", allowFallback: true }, "UNSUPPORTED_CLIENT_OP", 0);
            assert.equal(hasCloudSubmissionInitiated(transmitted), true);
        });
        await test("Device cancellation remains local even when fallback is permitted", async () => {
            ClientExecutor.execute = async () => { clientCalls++; throw new ExecutionError("USER_CANCELLATION", "synthetic cancellation"); };
            await rejectsLocally({ tool: "rotate", files: [file], mode: "device", allowFallback: true }, "USER_CANCELLATION", 1);
        });
        await test("pre-aborted Device execution makes no executor request", async () => {
            const controller = new AbortController();
            controller.abort();
            await rejectsLocally({ tool: "rotate", files: [file], mode: "device", signal: controller.signal }, "USER_CANCELLATION", 0);
        });
        for (const route of ["unsupported", "global-disabled", "tool-disabled", "engine-error", "protected", "safety-rejected"] as const) {
            await test(`Auto retains Cloud route: ${route}`, async () => {
                const options: ExecutionOptions = { tool: route === "unsupported" ? "word_to_pdf" : "rotate", files: [file], mode: "auto" };
                if (route === "global-disabled") process.env[flagKeys[0]] = "false";
                if (route === "tool-disabled") process.env[flagKeys[1]] = "false";
                if (route === "engine-error") ClientExecutor.execute = async () => { clientCalls++; throw new Error("synthetic engine crash"); };
                if (route === "protected") options.password = "synthetic-password";
                if (route === "safety-rejected") options.files = [new File([new Uint8Array(26 * 1024 * 1024)], "large-synthetic.pdf")];
                const result = await ExecutionManager.run(options);
                assert.equal(result.executionMode, "cloud");
                assert.equal(result.blob, cloudBlob);
                assert.equal(cloudCalls, 1);
                assert.equal(cloudOptions, options, "preserve the existing cloud execution contract");
                assert.equal(result.fallbackOccurred, route !== "unsupported");
                assert.equal(clientCalls, route === "engine-error" || route === "protected" ? 1 : 0);
                if (route === "safety-rejected") assert.equal(hasCloudSubmissionInitiated(options.files), false, "a mocked executor that starts no request cannot claim transmission");
            });
        }
        for (const code of ["INVALID_INPUT", "DECRYPTION_AUTH_FAILED", "USER_CANCELLATION"] as const) await test(`Auto does not fall back after ${code}`, async () => {
            ClientExecutor.execute = async () => { clientCalls++; throw new ExecutionError(code, `synthetic ${code}`); };
            await assert.rejects(
                ExecutionManager.run({ tool: "rotate", files: [file], mode: "auto", allowFallback: true }),
                (error: unknown) => error instanceof ExecutionError && error.code === code
            );
            assert.equal(cloudCalls, 0);
            assert.equal(clientCalls, 1);
            assert.equal(telemetry.getLastEvent()?.fallbackOccurred, false);
            assert.equal(telemetry.getLastEvent()?.errorCode, code);
        });
        await test("Auto allowFallback=false retains local failure", async () => {
            ClientExecutor.execute = async () => { throw new ExecutionError("CLIENT_FAILURE", "synthetic failure"); };
            await assert.rejects(ExecutionManager.run({ tool: "rotate", files: [file], mode: "auto", allowFallback: false }), (error: unknown) => error instanceof ExecutionError && error.code === "CLIENT_FAILURE");
            assert.equal(cloudCalls, 0);
        });
        for (const tool of ["rotate", "word_to_pdf"]) await test(`Cloud remains explicit with disabled flags: ${tool}`, async () => {
            process.env[flagKeys[0]] = "false";
            const options: ExecutionOptions = { tool, files: [file], mode: "cloud", allowFallback: false };
            const result = await ExecutionManager.run(options);
            assert.equal(result.executionMode, "cloud");
            assert.equal(result.fallbackOccurred, false);
            assert.equal(result.blob, cloudBlob);
            assert.equal(cloudOptions, options);
            assert.equal(cloudCalls, 1);
            assert.equal(clientCalls, 0);
        });
    } finally {
        ClientExecutor.execute = originalClient;
        CloudExecutor.execute = originalCloud;
        flagKeys.forEach((key, index) => {
            if (savedFlags[index] === undefined) delete process.env[key];
            else process.env[key] = savedFlags[index];
        });
    }
    console.log(`Device privacy: ${passed} passed, ${failed} failed, 0 skipped.`);
    process.exitCode = failed ? 1 : 0;
}

void main();
