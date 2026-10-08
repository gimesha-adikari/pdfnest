import assert from "node:assert/strict";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionError } from "../../lib/execution/types";

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

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_MERGE = "true";
        cloudCalls = 0;
        localCalls = 0;
        await assert.rejects(
            ExecutionManager.run({ tool: "word_to_pdf", files: [file], mode: "device" }),
            (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP"
        );
        assert.equal(cloudCalls, 0, "unsupported local tool in Device mode must not invoke CloudExecutor");
        assert.equal(localCalls, 0, "unsupported local tool must not invoke ClientExecutor");

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "true";
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

        ClientExecutor.execute = async () => {
            localCalls += 1;
            throw new ExecutionError("CLIENT_FAILURE", "Synthetic Auto-mode local failure.");
        };
        cloudCalls = 0;
        localCalls = 0;
        const autoResult = await ExecutionManager.run({ tool: "rotate", files: [file], mode: "auto" });
        assert.equal(autoResult.executionMode, "cloud", "Auto mode retains cloud fallback after local failure");
        assert.equal(cloudCalls, 1, "Auto mode invokes CloudExecutor once after local failure");

        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "false";
        cloudCalls = 0;
        const cloudResult = await ExecutionManager.run({ tool: "rotate", files: [file], mode: "cloud" });
        assert.equal(cloudResult.executionMode, "cloud", "explicit Cloud mode remains available when client flag is disabled");
        assert.equal(cloudCalls, 1, "explicit Cloud mode invokes CloudExecutor once");

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
