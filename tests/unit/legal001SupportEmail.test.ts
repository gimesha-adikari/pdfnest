/**
 * LEGAL-001 deterministic source contract.
 *
 * The public legal pages must expose the real Platen PDF support address in
 * both the visible link text and the mailto href.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const legalPages = [
    {
        route: "/acceptable-use",
        file: "app/(site)/acceptable-use/page.tsx",
    },
    {
        route: "/cookies",
        file: "app/(site)/cookies/page.tsx",
    },
] as const;

const expectedAddress = "support@platenpdf.com";
const expectedMailto = `mailto:${expectedAddress}`;

for (const page of legalPages) {
    const source = fs.readFileSync(path.resolve(process.cwd(), page.file), "utf8");

    assert.doesNotMatch(
        source,
        /support@yourdomain\.com/,
        `${page.route} must not retain the placeholder support address`
    );
    assert.equal(
        source.match(new RegExp(expectedAddress.replace(".", "\\."), "g"))?.length,
        2,
        `${page.route} must contain the expected address in the href and visible text`
    );
    assert.match(
        source,
        new RegExp(`href=["']${expectedMailto.replace(".", "\\.")}["']`),
        `${page.route} must use the exact expected mailto href`
    );
    assert.doesNotMatch(source, /support@@platenpdf\.com|support@platenpdf\.com\.com/);
}

console.log("LEGAL-001 support email contract passed.");
