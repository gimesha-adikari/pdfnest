import axios from "axios";
import { uploadAndDownloadFile } from "../../../lib/api";

async function main(): Promise<void> {
    const originalPost = axios.post;
    const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const processingBlob = new Blob(["PLATEN_M1_SYNTHETIC_UNPROTECTED_RESULT"], {
        type: "application/pdf",
    });
    const source = new File(["PLATEN_M1_SYNTHETIC_ALPHA"], "protected-alpha.pdf", {
        type: "application/pdf",
    }) as File & { originalPassword: string };
    source.originalPassword = "platen-m1-user-alpha";
    const formData = new FormData();
    formData.append("file", source);

    let processingCalls = 0;
    let lockCalls = 0;
    const progress: number[] = [];
    let returnedBlob: Blob | undefined;
    let rejected = false;

    process.env.NEXT_PUBLIC_API_URL = "https://m1-fixture.invalid";
    axios.post = (async (url: string) => {
        if (url.endsWith("/api/security/lock")) {
            lockCalls += 1;
            throw Object.assign(new Error("Injected synthetic re-lock failure"), {
                code: "ERR_NETWORK",
                response: { status: 503 },
            });
        }

        processingCalls += 1;
        return {
            data: processingBlob,
            headers: { "content-type": "application/pdf" },
            status: 200,
            statusText: "OK",
            config: {},
        } as never;
    }) as typeof axios.post;

    try {
        returnedBlob = await uploadAndDownloadFile(
            "/api/structure/rotate",
            formData,
            (percentage) => progress.push(percentage),
        );
    } catch {
        rejected = true;
    } finally {
        axios.post = originalPost;
        if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }

    const failures: string[] = [];
    const check = (name: string, condition: boolean, detail: string) => {
        if (condition) console.log(`PASS ${name}`);
        else {
            failures.push(name);
            console.error(`FAIL ${name}: ${detail}`);
        }
    };

    check("processing request was isolated and stubbed", processingCalls === 1, `observed ${processingCalls} processing call(s)`);
    check("re-lock failure was injected", lockCalls === 1, `observed ${lockCalls} lock call(s)`);
    check("re-lock failure rejects instead of returning a PDF Blob", rejected && returnedBlob === undefined, "uploadAndDownloadFile resolved with a result Blob");
    check("completion progress is withheld until protection is restored", !progress.includes(100), `progress events were ${progress.join(", ")}`);

    if (failures.length > 0) {
        console.error(`\n${failures.length} F-02 invariant(s) fail on the current baseline: ${failures.join(", ")}`);
        process.exitCode = 1;
    } else {
        console.log("\nAll F-02 re-lock failure invariants passed.");
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
