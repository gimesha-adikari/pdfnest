/**
 * SETTINGS-001 regression contract for wrong-current-password handling.
 *
 * This is intentionally source-backed because the page is a client component
 * and the repository's unit runner does not mount a browser DOM.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function main() {
    const root = process.cwd();
    const pageSource = fs.readFileSync(
        path.resolve(root, "app/(site)/dashboard/settings/page.tsx"),
        "utf8"
    );
    const apiSource = fs.readFileSync(path.resolve(root, "lib/api.ts"), "utf8");

    assert.match(
        apiSource,
        /endpoint === "\/user\/settings\/password"/,
        "password 401 responses must reach the settings form instead of the generic login redirect"
    );
    assert.match(
        pageSource,
        /passwordError/,
        "settings must retain a local password error state"
    );
    assert.match(
        pageSource,
        /role="alert"/,
        "the password error must expose an accessible alert"
    );
    assert.match(
        pageSource,
        /setPasswordError\(null\)/,
        "a new submission must clear only the previous error before it runs"
    );
    assert.match(
        pageSource,
        /catch \(err: unknown\)[\s\S]*setPasswordError/,
        "failed password requests must populate the visible error state"
    );
    assert.match(
        pageSource,
        /notify\("Password updated successfully!", "success"\)/,
        "the successful password path must remain present"
    );

    const { getPasswordUpdateErrorMessage } = await import(
        "../../lib/settingsPasswordError"
    );
    assert.equal(
        getPasswordUpdateErrorMessage(new Error("Incorrect current password")),
        "Current password is incorrect.",
        "wrong-current-password feedback must be clear and specific"
    );
    assert.equal(
        getPasswordUpdateErrorMessage(new Error("Network unavailable")),
        "Network unavailable",
        "non-authentication errors must remain actionable"
    );

    console.log("SETTINGS-001 wrong-password error contract passed.");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
