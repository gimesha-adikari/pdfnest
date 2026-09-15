import assert from "node:assert/strict";
import { getBaseUrl, resolveDownloadUrl } from "../../lib/api";

const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;
process.env.NEXT_PUBLIC_API_URL = "https://api.platenpdf.com/";

try {
    assert.equal(
        getBaseUrl(),
        "https://api.platenpdf.com/",
        "the resolver must use the same configured base as the API client",
    );
    assert.equal(
        resolveDownloadUrl("https://api.platenpdf.com/api/v1/download/task-1?token=abc"),
        "https://api.platenpdf.com/api/v1/download/task-1?token=abc",
    );
    assert.equal(
        resolveDownloadUrl("/api/v1/download/task-1"),
        "https://api.platenpdf.com/api/v1/download/task-1",
    );
    assert.equal(
        resolveDownloadUrl("api/v1/download/task-1"),
        "https://api.platenpdf.com/api/v1/download/task-1",
    );

    assert.throws(
        () => resolveDownloadUrl("https://api.platenpdf.comhttps//api/v1/download/task-1"),
        /origin is not allowed|malformed/,
        "the historical duplicate-origin URL must not be fetched",
    );
    assert.throws(
        () => resolveDownloadUrl("https://other.example/download/task-1"),
        /origin is not allowed/,
        "artifact downloads must stay on the configured API origin",
    );
    assert.throws(
        () => resolveDownloadUrl("r2://private/object-key"),
        /configured API origin/,
        "storage references are not browser download URLs",
    );
    assert.throws(
        () => resolveDownloadUrl("javascript:alert(1)"),
        /configured API origin/,
        "unsupported protocols must be rejected",
    );
    assert.throws(
        () => resolveDownloadUrl("//other.example/download/task-1"),
        /configured API origin/,
        "scheme-relative URLs must not escape the API origin",
    );
    console.log("Download URL contract tests passed.");
} finally {
    if (previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = previousApiUrl;
}
