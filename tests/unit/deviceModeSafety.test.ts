import assert from "node:assert/strict";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionError } from "../../lib/execution/types";
import { telemetry } from "../../lib/execution/telemetry";

async function runTests() {
    const originalClientExecute = ClientExecutor.execute;
    const originalCloudExecute = CloudExecutor.execute;
    const originalRotateFlag = process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE;
    const originalMergeFlag = process.env.NEXT_PUBLIC_HYBRID_ENABLE_MERGE;
    const originalGlobalFlag = process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL;

    let localCalls = 0;
    let cloudCalls = 0;
    const file = new File([new Uint8Array([1, 2, 3])], "synthetic.pdf", { type: "application/pdf" });

    ClientExecutor.execute = async () => {
        localCalls += 1;
        return new Blob(["device-result"], { type: "application/pdf" });
    };
    CloudExecutor.execute = async () => {
        cloudCalls += 1;
        return new Blob(["cloud-result"], { type: "application/pdf" });
    };

    const restoreEnv = (name: string, value: string | undefined) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    };

    try {
        telemetry.clearEvents();
        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL = "true";
        process.env.NEXT_PUBLIC_HYBRID_ENABLE_MERGE = "false";
        cloudCalls = 0;
        localCalls = 0;
        await assert.rejects(
            ExecutionManager.run({
                tool: "merge",
                files: [file],
                mode: "device",
                allowFallback: true,
            }),
            (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP"
        );
        assert.equal(cloudCalls, 0, "disabled Device feature flag must not invoke CloudExecutor");
        assert.equal(localCalls, 0, "disabled Device feature flag must not invoke ClientExecutor");
        const disabledEvent = telemetry.getLastEvent();
        assert.equal(disabledEvent?.requestedMode, "device");
        assert.equal(disabledEvent?.actualMode, undefined, "disabled Device mode must not be reported as Cloud execution");
        assert.equal(disabledEvent?.success, false);
        assert.equal(disabledEvent?.fallbackOccurred, false);

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_MERGE = "true";
        cloudCalls = 0;
        localCalls = 0;
        await assert.rejects(
            ExecutionManager.run({ tool: "word_to_pdf", files: [file], mode: "device", allowFallback: true }),
            (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP"
        );
        assert.equal(cloudCalls, 0, "unsupported local tool in Device mode must not invoke CloudExecutor");
        assert.equal(localCalls, 0, "unsupported local tool must not invoke ClientExecutor");
        const unsupportedEvent = telemetry.getLastEvent();
        assert.equal(unsupportedEvent?.requestedMode, "device");
        assert.equal(unsupportedEvent?.actualMode, undefined, "unsupported Device mode must not be reported as Cloud execution");
        assert.equal(unsupportedEvent?.success, false);
        assert.equal(unsupportedEvent?.fallbackOccurred, false);

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "true";
        cloudCalls = 0;
        localCalls = 0;
        telemetry.clearEvents();
        const deviceResult = await ExecutionManager.run({ tool: "rotate", files: [file], mode: "device" });
        assert.equal(deviceResult.executionMode, "client", "successful Device processing reports client execution");
        assert.equal(deviceResult.fallbackOccurred, false, "successful Device processing reports no fallback");
        assert.equal(cloudCalls, 0, "successful Device processing must not invoke CloudExecutor");
        assert.equal(localCalls, 1, "successful Device processing invokes ClientExecutor once");
        const deviceSuccessEvent = telemetry.getLastEvent();
        assert.equal(deviceSuccessEvent?.requestedMode, "device");
        assert.equal(deviceSuccessEvent?.actualMode, "client");
        assert.equal(deviceSuccessEvent?.category, "client_success");
        assert.equal(deviceSuccessEvent?.success, true);
        assert.equal(deviceSuccessEvent?.fallbackOccurred, false);

        const passwordProtectedFile = new File([new Uint8Array([1, 2, 3])], "locked.pdf", {
            type: "application/pdf",
        }) as File & { originalPassword: string };
        passwordProtectedFile.originalPassword = "synthetic-password";
        ClientExecutor.execute = async () => {
            localCalls += 1;
            throw new ExecutionError("UNSUPPORTED_CLIENT_OP", "Password requires server processing.");
        };
        cloudCalls = 0;
        localCalls = 0;
        await assert.rejects(
            ExecutionManager.run({ tool: "rotate", files: [passwordProtectedFile], mode: "device" }),
            (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP"
        );
        assert.equal(cloudCalls, 0, "password-protected Device operation must not invoke CloudExecutor");
        assert.equal(localCalls, 1, "password-protected Device operation should report the local limitation");

        ClientExecutor.execute = async () => {
            localCalls += 1;
            throw new ExecutionError("CLIENT_FAILURE", "Synthetic local engine failure.");
        };
        cloudCalls = 0;
        localCalls = 0;
        await assert.rejects(
            ExecutionManager.run({ tool: "rotate", files: [file], mode: "device", allowFallback: true }),
            (error: unknown) => error instanceof ExecutionError && error.code === "CLIENT_FAILURE"
        );
        assert.equal(cloudCalls, 0, "Device engine failure must not invoke CloudExecutor even when allowFallback is true");
        assert.equal(localCalls, 1, "Device mode attempts local execution once before returning its failure");
        const deviceFailureEvent = telemetry.getLastEvent();
        assert.equal(deviceFailureEvent?.requestedMode, "device");
        assert.equal(deviceFailureEvent?.actualMode, "client");
        assert.equal(deviceFailureEvent?.category, "client_failure");
        assert.equal(deviceFailureEvent?.success, false);
        assert.equal(deviceFailureEvent?.fallbackOccurred, false);
        assert.equal(deviceFailureEvent?.errorCode, "CLIENT_FAILURE");

        const oversizedFile = { name: "synthetic-large.pdf", size: 26 * 1024 * 1024 } as File;
        cloudCalls = 0;
        localCalls = 0;
        telemetry.clearEvents();
        await assert.rejects(
            ExecutionManager.run({ tool: "rotate", files: [oversizedFile], mode: "device" }),
            (error: unknown) => error instanceof ExecutionError && error.code === "SAFETY_REJECTION"
        );
        assert.equal(cloudCalls, 0, "Device safety rejection must not invoke CloudExecutor");
        assert.equal(localCalls, 0, "Device safety rejection must not invoke ClientExecutor");
        const safetyRejectionEvent = telemetry.getLastEvent();
        assert.equal(safetyRejectionEvent?.requestedMode, "device");
        assert.equal(safetyRejectionEvent?.actualMode, undefined, "Device safety rejection must not be reported as Cloud execution");
        assert.equal(safetyRejectionEvent?.category, "safety_rejection");
        assert.equal(safetyRejectionEvent?.success, false);
        assert.equal(safetyRejectionEvent?.fallbackOccurred, false);
        assert.equal(safetyRejectionEvent?.errorCode, "SAFETY_REJECTION");

        ClientExecutor.execute = async () => {
            localCalls += 1;
            throw new ExecutionError("USER_CANCELLATION", "Synthetic Device cancellation.");
        };
        cloudCalls = 0;
        localCalls = 0;
        telemetry.clearEvents();
        await assert.rejects(
            ExecutionManager.run({ tool: "rotate", files: [file], mode: "device", allowFallback: true }),
            (error: unknown) => error instanceof ExecutionError && error.code === "USER_CANCELLATION"
        );
        assert.equal(cloudCalls, 0, "Device cancellation must not invoke CloudExecutor");
        assert.equal(localCalls, 1, "Device cancellation is returned after its one local attempt");
        assert.equal(telemetry.getLastEvent()?.errorCode, "USER_CANCELLATION");
        assert.equal(telemetry.getLastEvent()?.fallbackOccurred, false);

        const abortedDeviceSignal = new AbortController();
        abortedDeviceSignal.abort();
        cloudCalls = 0;
        localCalls = 0;
        await assert.rejects(
            ExecutionManager.run({ tool: "rotate", files: [file], mode: "device", signal: abortedDeviceSignal.signal }),
            (error: unknown) => error instanceof ExecutionError && error.code === "USER_CANCELLATION"
        );
        assert.equal(cloudCalls, 0, "pre-aborted Device execution must not invoke CloudExecutor");
        assert.equal(localCalls, 0, "pre-aborted Device execution does not invoke ClientExecutor");

        ClientExecutor.execute = async () => {
            localCalls += 1;
            throw new ExecutionError("CLIENT_FAILURE", "Synthetic Auto-mode local failure.");
        };
        cloudCalls = 0;
        localCalls = 0;
        telemetry.clearEvents();
        const autoResult = await ExecutionManager.run({ tool: "rotate", files: [file], mode: "auto" });
        assert.equal(autoResult.executionMode, "cloud", "Auto mode retains cloud fallback after local failure");
        assert.equal(cloudCalls, 1, "Auto mode invokes CloudExecutor once after local failure");
        assert.equal(autoResult.fallbackOccurred, true, "permitted Auto fallback remains visible in the result");
        assert.equal(telemetry.getLastEvent()?.actualMode, "cloud");
        assert.equal(telemetry.getLastEvent()?.fallbackOccurred, true);

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "true";
        ClientExecutor.execute = async () => {
            localCalls += 1;
            return new Blob(["device-result"], { type: "application/pdf" });
        };
        cloudCalls = 0;
        localCalls = 0;
        const autoClientResult = await ExecutionManager.run({ tool: "rotate", files: [file], mode: "auto" });
        assert.equal(autoClientResult.executionMode, "client", "Auto mode keeps supported successful local execution");
        assert.equal(autoClientResult.fallbackOccurred, false);
        assert.equal(cloudCalls, 0, "successful Auto client execution must not invoke CloudExecutor");
        assert.equal(localCalls, 1, "successful Auto client execution invokes ClientExecutor once");

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "false";
        cloudCalls = 0;
        localCalls = 0;
        const autoDisabledResult = await ExecutionManager.run({ tool: "rotate", files: [file], mode: "auto" });
        assert.equal(autoDisabledResult.executionMode, "cloud", "Auto preserves Cloud routing when a client flag is disabled");
        assert.equal(autoDisabledResult.fallbackOccurred, true);
        assert.equal(cloudCalls, 1, "Auto invokes CloudExecutor once when the client flag is disabled");
        assert.equal(localCalls, 0, "Auto does not invoke ClientExecutor when the client flag is disabled");

        cloudCalls = 0;
        localCalls = 0;
        const autoUnsupportedResult = await ExecutionManager.run({ tool: "word_to_pdf", files: [file], mode: "auto" });
        assert.equal(autoUnsupportedResult.executionMode, "cloud", "Auto preserves Cloud routing for unsupported client tools");
        assert.equal(autoUnsupportedResult.fallbackOccurred, false, "unsupported Auto tools retain direct Cloud routing semantics");
        assert.equal(cloudCalls, 1, "Auto invokes CloudExecutor once for an unsupported client tool");
        assert.equal(localCalls, 0, "unsupported Auto tools do not invoke ClientExecutor");

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "true";
        const autoExcludedCodes = ["INVALID_INPUT", "DECRYPTION_AUTH_FAILED", "USER_CANCELLATION"] as const;
        for (const code of autoExcludedCodes) {
            ClientExecutor.execute = async () => {
                localCalls += 1;
                throw new ExecutionError(code, `Synthetic Auto ${code} rejection.`);
            };
            cloudCalls = 0;
            localCalls = 0;
            telemetry.clearEvents();
            await assert.rejects(
                ExecutionManager.run({ tool: "rotate", files: [file], mode: "auto" }),
                (error: unknown) => error instanceof ExecutionError && error.code === code
            );
            assert.equal(cloudCalls, 0, `Auto ${code} must not invoke CloudExecutor`);
            assert.equal(localCalls, 1, `Auto ${code} is returned after one local attempt`);
            const autoExcludedEvent = telemetry.getLastEvent();
            assert.equal(autoExcludedEvent?.requestedMode, "auto");
            assert.equal(autoExcludedEvent?.actualMode, "client");
            assert.equal(autoExcludedEvent?.success, false);
            assert.equal(autoExcludedEvent?.fallbackOccurred, false);
            assert.equal(autoExcludedEvent?.errorCode, code);
        }

        ClientExecutor.execute = async () => {
            localCalls += 1;
            throw new ExecutionError("CLIENT_FAILURE", "Synthetic non-fallback Auto failure.");
        };
        cloudCalls = 0;
        localCalls = 0;
        await assert.rejects(
            ExecutionManager.run({ tool: "rotate", files: [file], mode: "auto", allowFallback: false }),
            (error: unknown) => error instanceof ExecutionError && error.code === "CLIENT_FAILURE"
        );
        assert.equal(cloudCalls, 0, "allowFallback false prevents discretionary Auto fallback");
        assert.equal(localCalls, 1, "Auto attempts local execution once when fallback is disabled");

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "false";
        ClientExecutor.execute = async () => {
            localCalls += 1;
            throw new Error("Cloud mode must not execute ClientExecutor.");
        };
        cloudCalls = 0;
        localCalls = 0;
        const cloudResult = await ExecutionManager.run({ tool: "rotate", files: [file], mode: "cloud" });
        assert.equal(cloudResult.executionMode, "cloud", "explicit Cloud mode remains available when client flag is disabled");
        assert.equal(cloudCalls, 1, "explicit Cloud mode invokes CloudExecutor once");
        assert.equal(localCalls, 0, "explicit Cloud mode does not invoke ClientExecutor");

        CloudExecutor.execute = async () => {
            cloudCalls += 1;
            throw new ExecutionError("CLOUD_UNAVAILABLE", "Synthetic offline cloud service.");
        };
        cloudCalls = 0;
        await assert.rejects(
            ExecutionManager.run({ tool: "rotate", files: [file], mode: "cloud" }),
            (error: unknown) =>
                error instanceof ExecutionError &&
                error.code === "CLOUD_UNAVAILABLE" &&
                error.message.includes("Cloud processing is currently unavailable")
        );
        assert.equal(cloudCalls, 1, "explicit Cloud preserves its existing unavailable-service error mapping");
        assert.equal(localCalls, 0, "Cloud error handling does not retry on ClientExecutor");

        console.log("Device-mode safety and execution-mode regression tests passed.");
    } finally {
        ClientExecutor.execute = originalClientExecute;
        CloudExecutor.execute = originalCloudExecute;
        restoreEnv("NEXT_PUBLIC_HYBRID_ENABLE_ROTATE", originalRotateFlag);
        restoreEnv("NEXT_PUBLIC_HYBRID_ENABLE_MERGE", originalMergeFlag);
        restoreEnv("NEXT_PUBLIC_HYBRID_ENABLE_ALL", originalGlobalFlag);
    }
}

runTests().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
