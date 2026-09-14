import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.NEXT_PUBLIC_API_URL = "http://api.test";

async function run() {
    const { fetchBlob } = await import("../../lib/api");

    let seenURL = "";
    let seenInit: RequestInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        seenURL = String(input);
        seenInit = init;
        return new Response(new Blob(["{\"exported\":true}"]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }) as typeof fetch;

    try {
        const blob = await fetchBlob("/user/settings/export");
        assert.equal(seenURL, "http://api.test/api/user/settings/export");
        assert.equal(seenInit?.credentials, "include");
        assert.equal(await blob.text(), "{\"exported\":true}");
    } finally {
        globalThis.fetch = originalFetch;
    }

    const settingsSource = fs.readFileSync(
        path.resolve(process.cwd(), "app/(site)/dashboard/settings/page.tsx"),
        "utf8",
    );
    assert.match(settingsSource, /fetchBlob\("\/user\/settings\/export"\)/);
    assert.doesNotMatch(settingsSource, /fetch\(["']\/api\/user\/settings\/export/);

    console.log("Account export uses the configured backend API boundary.");
}

void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
