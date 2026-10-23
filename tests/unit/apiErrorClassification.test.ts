import assert from "node:assert/strict";
import axios from "axios";
import { uploadAndDownloadFile, fetchJson, fetchBlob, type ClientError } from "../../lib/api";
import { handleClientError } from "../../lib/errorHandler";
import { ExecutionError } from "../../lib/execution/types";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { notifyBackendError, type ToastPayload } from "../../lib/notify";

const toasts: ToastPayload[] = [];
Object.assign(globalThis, { window: {
    __GLOBAL_NOTIFY__: (toast: ToastPayload) => toasts.push(toast),
    __PLATEN_SESSION__: { type: "guest", tier: "guest" }, location: { pathname: "/markdown-to-pdf", search: "" },
} });

async function rejected(payload: unknown): Promise<ClientError> {
    axios.post = (async () => { throw Object.assign(new Error("HTTP 400"), {
        isAxiosError: true, config: { url: "/api/conversion/markdown-to-pdf" },
        response: { status: 400, data: payload, headers: { "content-type": "application/json" } },
    }); }) as typeof axios.post;
    const form = new FormData();
    form.append("file", new File(["![Local image](../image.png)"], "synthetic.md"));
    try { await uploadAndDownloadFile("/api/conversion/markdown-to-pdf", form); }
    catch (error) { return error as ClientError; }
    throw new Error("mocked request must reject");
}

async function main() {
    const originalPost = axios.post;
    const originalFetch = globalThis.fetch;
    let passed = 0;
    try {
        const policy = { code: "MARKDOWN_RESOURCE_FORBIDDEN", message: "markdown resource policy violation: remote and filesystem resources are forbidden" };
        for (const payload of [policy, JSON.stringify(policy), new Blob([JSON.stringify(policy)], { type: "application/json" })]) {
            const error = await rejected(payload);
            assert.equal(error.billing, undefined, "resource policy is not a billing failure");
            assert.equal((error as ClientError & { backend?: typeof policy }).backend?.code, policy.code);
            toasts.length = 0;
            handleClientError(new ExecutionError("CLOUD_FAILURE", error.message, error));
            assert.equal(toasts.length, 1);
            assert.equal(toasts[0].title, "Markdown resource blocked");
            assert.equal(toasts[0].message, policy.message);
            assert.doesNotMatch(JSON.stringify(toasts[0]), /upgrade|subscription|credits|account/i);
            assert.equal(toasts[0].action, undefined);
            passed++;
        }
        // Also protect callers that already carry the legacy billing property.
        toasts.length = 0;
        notifyBackendError(policy);
        assert.equal(toasts[0].title, "Markdown resource blocked");
        assert.equal(toasts[0].action, undefined); passed++;

        for (const code of ["HOURLY_LIMIT_REACHED", "DAILY_LIMIT_REACHED", "MONTHLY_LIMIT_REACHED", "CREDITS_EXHAUSTED", "SUBSCRIPTION_REQUIRED", "BILLING_ERROR", "PURCHASES_DISABLED", "BILLING_POLICY_UNAVAILABLE"]) {
            const error = await rejected({ code, message: "Billing contract preserved" });
            assert.equal(error.billing?.code, code);
            toasts.length = 0; handleClientError(error);
            if (code === "DAILY_LIMIT_REACHED") {
                assert.equal(toasts[0].title, "Daily limit reached");
                assert.equal(toasts.at(-1)!.action?.label, "Create free account");
            }
            if (code === "PURCHASES_DISABLED") assert.equal(toasts[0].action, undefined);
            passed++;
        }
        const generic = await rejected({ code: "MARKDOWN_CONVERSION_FAILED", message: "Conversion failed" });
        assert.equal(generic.billing, undefined);
        toasts.length = 0; handleClientError(new ExecutionError("CLOUD_FAILURE", generic.message, generic));
        assert.equal(toasts[0].message, "Conversion failed");
        assert.equal(toasts[0].description, undefined); passed++;
        for (const adapter of [fetchJson, fetchBlob]) {
            for (const code of ["MARKDOWN_RESOURCE_FORBIDDEN", "DAILY_LIMIT_REACHED"]) {
                globalThis.fetch = async () => new Response(JSON.stringify({ code, message: "Mocked error" }), {
                    status: 400, headers: { "Content-Type": "application/json" },
                });
                await assert.rejects(adapter("/conversion/markdown-to-pdf"), (error: ClientError) => {
                    assert.equal(error.backend?.code, code);
                    assert.equal(error.billing?.code, code === "DAILY_LIMIT_REACHED" ? code : undefined);
                    return true;
                });
                passed++;
            }
        }
        await rejected(policy); // Set the Axios response used by the real cloud adapter.
        await assert.rejects(CloudExecutor.execute({ tool: "markdown-to-pdf", mode: "cloud",
            // Isolate the server contract using admitted source; image policy
            // admission is separately tested before normal routing reaches HTTP.
            files: [new File(["# Synthetic server policy response"], "B.md")] }), (error: ExecutionError) => {
            assert.equal(error.code, "CLOUD_FAILURE");
            toasts.length = 0; handleClientError(error);
            assert.equal(toasts[0].title, "Markdown resource blocked");
            assert.equal(error.billing, undefined);
            return true;
        }); passed++;
        console.log(`API error classification: ${passed} passed, 0 failed (all HTTP responses mocked)`);
    } finally { axios.post = originalPost; globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
