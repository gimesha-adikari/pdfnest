import assert from "node:assert/strict";
import { test } from "node:test";
import {
    BLOB_DOWNLOAD_URL_REVOKE_DELAY_MS,
    triggerBlobDownload,
    type BlobDownloadAnchor,
    type BlobDownloadEnvironment,
} from "../../lib/blobDownload";

test("blob downloads retain their URL until the browser has time to consume it", () => {
    const events: string[] = [];
    let scheduledCleanup: (() => void) | undefined;
    let scheduledDelay = 0;
    const anchor: BlobDownloadAnchor = {
        href: "",
        download: "",
        click: () => events.push("click"),
    };
    const environment: BlobDownloadEnvironment = {
        createObjectURL: () => {
            events.push("create");
            return "blob:synthetic-download";
        },
        revokeObjectURL: (url) => {
            assert.equal(url, "blob:synthetic-download");
            events.push("revoke");
        },
        createAnchor: () => anchor,
        appendAnchor: (value) => {
            assert.equal(value, anchor);
            events.push("append");
        },
        removeAnchor: (value) => {
            assert.equal(value, anchor);
            events.push("remove");
        },
        schedule: (callback, delayMs) => {
            scheduledCleanup = callback;
            scheduledDelay = delayMs;
        },
    };

    triggerBlobDownload(new Blob(["synthetic markdown"]), "result.md", environment);

    assert.equal(anchor.download, "result.md");
    assert.equal(anchor.href, "blob:synthetic-download");
    assert.deepEqual(events, ["create", "append", "click", "remove"]);
    assert.equal(scheduledDelay, BLOB_DOWNLOAD_URL_REVOKE_DELAY_MS);
    assert.ok(scheduledCleanup, "cleanup is scheduled after the download click");

    scheduledCleanup();
    assert.deepEqual(events, ["create", "append", "click", "remove", "revoke"]);
});
