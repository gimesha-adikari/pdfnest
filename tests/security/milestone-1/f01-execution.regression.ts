import { ClientExecutor } from "../../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../../lib/execution/ExecutionManager";
import { ExecutionError } from "../../../lib/execution/types";

type Attempt = { result?: unknown; error?: unknown };

async function capture(action: () => Promise<unknown>): Promise<Attempt> {
    try {
        return { result: await action() };
    } catch (error) {
        return { error };
    }
}

function matchesExecutionError(attempt: Attempt, code: string): boolean {
    return attempt.error instanceof ExecutionError && attempt.error.code === code;
}

async function main(): Promise<void> {
    const originalClientExecute = ClientExecutor.execute;
    const originalCloudExecute = CloudExecutor.execute;
    const envNames = [
        "NEXT_PUBLIC_HYBRID_ENABLE_ALL",
        "NEXT_PUBLIC_HYBRID_ENABLE_ROTATE",
    ] as const;
    const originalEnv = new Map(envNames.map((name) => [name, process.env[name]]));
    const file = new File(["%PDF-1.7\nPLATEN_M1_SYNTHETIC_ALPHA"], "synthetic-alpha.pdf", {
        type: "application/pdf",
    });
    const resultBlob = new Blob(["synthetic-result"], { type: "application/pdf" });
    const failures: string[] = [];
    let cloudCalls = 0;
    let clientCalls = 0;
    let clientBehavior: "success" | "unsupported" | "failure" = "success";

    const check = (name: string, condition: boolean, detail: string) => {
        if (condition) {
            console.log(`PASS ${name}`);
        } else {
            failures.push(name);
            console.error(`FAIL ${name}: ${detail}`);
        }
    };

    const setFlag = (name: typeof envNames[number], value: string | undefined) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    };

    ClientExecutor.execute = async () => {
        clientCalls += 1;
        if (clientBehavior === "unsupported") {
            throw new ExecutionError("UNSUPPORTED_CLIENT_OP", "Synthetic encrypted input limitation.");
        }
        if (clientBehavior === "failure") {
            throw new ExecutionError("CLIENT_FAILURE", "Synthetic client engine failure.");
        }
        return resultBlob;
    };
    CloudExecutor.execute = async () => {
        cloudCalls += 1;
        return resultBlob;
    };

    try {
        setFlag("NEXT_PUBLIC_HYBRID_ENABLE_ALL", "true");
        setFlag("NEXT_PUBLIC_HYBRID_ENABLE_ROTATE", "true");

        cloudCalls = 0;
        clientCalls = 0;
        const unsupportedDevice = await capture(() => ExecutionManager.run({
            tool: "word_to_pdf",
            files: [file],
            mode: "device",
        }));
        check(
            "unsupported Device operation fails without Cloud",
            matchesExecutionError(unsupportedDevice, "UNSUPPORTED_CLIENT_OP") && cloudCalls === 0 && clientCalls === 0,
            `expected local rejection and zero Cloud calls; got ${cloudCalls} Cloud call(s)`,
        );

        setFlag("NEXT_PUBLIC_HYBRID_ENABLE_ROTATE", "false");
        cloudCalls = 0;
        clientCalls = 0;
        const disabledDevice = await capture(() => ExecutionManager.run({
            tool: "rotate",
            files: [file],
            mode: "device",
        }));
        check(
            "disabled client feature flag fails Device mode closed",
            matchesExecutionError(disabledDevice, "UNSUPPORTED_CLIENT_OP") && cloudCalls === 0 && clientCalls === 0,
            `expected local rejection and zero Cloud calls; got ${cloudCalls} Cloud call(s)`,
        );

        setFlag("NEXT_PUBLIC_HYBRID_ENABLE_ROTATE", "true");
        const protectedFile = new File(["%PDF-1.7\nPLATEN_M1_SYNTHETIC_ALPHA"], "protected-alpha.pdf", {
            type: "application/pdf",
        }) as File & { originalPassword: string };
        protectedFile.originalPassword = "platen-m1-user-alpha";
        clientBehavior = "unsupported";
        cloudCalls = 0;
        clientCalls = 0;
        const protectedDevice = await capture(() => ExecutionManager.run({
            tool: "rotate",
            files: [protectedFile],
            mode: "device",
            password: protectedFile.originalPassword,
        }));
        check(
            "password-related local limitation does not trigger Device Cloud fallback",
            matchesExecutionError(protectedDevice, "UNSUPPORTED_CLIENT_OP") && cloudCalls === 0 && clientCalls === 1,
            `expected one local attempt, a local rejection, and zero Cloud calls; got ${cloudCalls} Cloud call(s)`,
        );

        clientBehavior = "failure";
        cloudCalls = 0;
        clientCalls = 0;
        const deviceFailure = await capture(() => ExecutionManager.run({
            tool: "rotate",
            files: [file],
            mode: "device",
            allowFallback: true,
        }));
        check(
            "Device engine failure remains local even when allowFallback is true",
            matchesExecutionError(deviceFailure, "CLIENT_FAILURE") && cloudCalls === 0 && clientCalls === 1,
            `expected one local attempt and zero Cloud calls; got ${cloudCalls} Cloud call(s)`,
        );

        cloudCalls = 0;
        clientCalls = 0;
        const tooLarge = { name: "synthetic-large.pdf", size: 26 * 1024 * 1024 } as File;
        const safetyRejectedDevice = await capture(() => ExecutionManager.run({
            tool: "rotate",
            files: [tooLarge],
            mode: "device",
        }));
        check(
            "Device safety rejection fails locally without Cloud",
            matchesExecutionError(safetyRejectedDevice, "SAFETY_REJECTION") && cloudCalls === 0 && clientCalls === 0,
            `expected safety rejection and zero Cloud calls; got ${cloudCalls} Cloud call(s)`,
        );

        clientBehavior = "failure";
        cloudCalls = 0;
        clientCalls = 0;
        const autoFallback = await capture(() => ExecutionManager.run({
            tool: "rotate",
            files: [file],
            mode: "auto",
        }));
        check(
            "Auto retains its permitted Cloud fallback",
            Boolean(autoFallback.result) && cloudCalls === 1 && clientCalls === 1,
            `expected one local attempt and one Cloud call; got ${clientCalls} local and ${cloudCalls} Cloud`,
        );

        clientBehavior = "success";
        cloudCalls = 0;
        const explicitCloud = await capture(() => ExecutionManager.run({
            tool: "rotate",
            files: [file],
            mode: "cloud",
        }));
        check(
            "explicit Cloud remains available",
            Boolean(explicitCloud.result) && cloudCalls === 1,
            `expected one Cloud call; got ${cloudCalls}`,
        );
    } finally {
        ClientExecutor.execute = originalClientExecute;
        CloudExecutor.execute = originalCloudExecute;
        for (const name of envNames) setFlag(name, originalEnv.get(name));
    }

    if (failures.length > 0) {
        console.error(`\n${failures.length} F-01 invariant(s) failed on the current branch: ${failures.join(", ")}`);
        process.exitCode = 1;
    } else {
        console.log("\nAll F-01 execution invariants passed.");
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
