import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts", "preflight-local-api-origin.mjs");

function runPreflight(args, { apiOrigin, chunks = {} } = {}) {
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "platen-origin-preflight-"));
    const staticRoot = path.join(temporaryRoot, "static", "chunks");
    mkdirSync(staticRoot, { recursive: true });
    for (const [name, contents] of Object.entries(chunks)) {
        writeFileSync(path.join(staticRoot, name), contents);
    }
    const env = {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        // Keep Next's dotenv loader from filling an intentionally missing
        // value from the developer's .env.local during this test.
        NEXT_PUBLIC_API_URL: apiOrigin ?? "",
    };
    const result = spawnSync(process.execPath, [scriptPath, ...args, "--dist-dir", temporaryRoot], {
        cwd: repoRoot,
        env,
        encoding: "utf8",
    });
    return { ...result, temporaryRoot };
}

function withPreflight(args, options, assertion) {
    const result = runPreflight(args, options);
    try {
        assertion(result);
    } finally {
        rmSync(result.temporaryRoot, { recursive: true, force: true });
    }
}

test("development preflight accepts an explicit loopback Backend origin", () => {
    withPreflight(["--dev"], { apiOrigin: "http://127.0.0.1:8080" }, (result) => {
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });
});

test("development preflight rejects the production Backend origin", () => {
    withPreflight(["--dev"], { apiOrigin: "https://api.platenpdf.com" }, (result) => {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /loopback|local API/i);
    });
});

test("development preflight rejects a missing API origin", () => {
    withPreflight(["--dev"], {}, (result) => {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /NEXT_PUBLIC_API_URL/i);
    });
});

test("start preflight accepts a local bundle compiled for the configured Backend", () => {
    withPreflight(["--start"], {
        apiOrigin: "http://127.0.0.1:8080",
        chunks: { "app.js": 'const api="http://127.0.0.1:8080";' },
    }, (result) => {
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });
});

test("local start preflight rejects a build configured for a remote Backend", () => {
    withPreflight(["--start", "--local"], {
        apiOrigin: "https://api.platenpdf.com",
        chunks: { "app.js": 'const api="https://api.platenpdf.com";' },
    }, (result) => {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /loopback local API origin/i);
    });
});

test("start preflight rejects a mixed or stale client chunk containing the production API", () => {
    withPreflight(["--start"], {
        apiOrigin: "http://127.0.0.1:8080",
        chunks: {
            "app.js": 'const api="http://127.0.0.1:8080";',
            "old.js": 'const fallback="https://api.platenpdf.com";',
        },
    }, (result) => {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /production API|unapproved origin/i);
    });
});

test("start preflight rejects direct R2 destinations in a local browser bundle", () => {
    withPreflight(["--start"], {
        apiOrigin: "http://127.0.0.1:8080",
        chunks: {
            "app.js": 'const api="http://127.0.0.1:8080";const upload="https://bucket.r2.cloudflarestorage.com";',
        },
    }, (result) => {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /R2|storage origin/i);
    });
});

test("start preflight rejects a bundle compiled for a different API origin", () => {
    withPreflight(["--start"], {
        apiOrigin: "http://127.0.0.1:8080",
        chunks: { "app.js": 'const api="http://localhost:8080";' },
    }, (result) => {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /does not match|not found/i);
    });
});

test("start preflight retains configured production API behavior", () => {
    withPreflight(["--start"], {
        apiOrigin: "https://api.platenpdf.com",
        chunks: { "app.js": 'const api="https://api.platenpdf.com";' },
    }, (result) => {
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });
});
