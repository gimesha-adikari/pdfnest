/** ADMIN-002 regression contract for the admin users table on narrow screens. */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function main() {
    const source = fs.readFileSync(
        path.resolve(process.cwd(), "app/(site)/admin/page.tsx"),
        "utf8"
    );

    assert.ok(
        source.includes('className="overflow-x-auto"'),
        "the users table must be contained by a horizontal scroll wrapper"
    );
    assert.ok(
        source.includes('<table className="min-w-[760px] w-full text-left text-sm">'),
        "the table must retain enough layout width for all columns and actions"
    );
    assert.ok(source.includes('activeTab === "users"'));
    assert.ok(source.includes("handleInspectUser"));
    assert.match(
        source,
        /Operations & Analytics/,
        "the operations column must remain part of the desktop table"
    );

    console.log("ADMIN-002 responsive users-table contract passed.");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
