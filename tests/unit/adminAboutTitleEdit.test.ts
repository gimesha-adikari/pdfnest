/** Admin About regression for editing an existing highlight title safely. */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function main() {
    const root = process.cwd();
    const componentSource = fs.readFileSync(
        path.resolve(root, "components/admin/AboutPageContexts.tsx"),
        "utf8"
    );

    assert.match(
        componentSource,
        /updateAboutHighlightTitle\(\s*aboutData\.HighlightsJson[\s\S]*idx[\s\S]*e\.target\.value/,
        "existing About highlights must expose a title editor bound to the selected item"
    );

    const { updateAboutHighlightTitle } = await import(
        "../../lib/adminAboutContentPayload"
    );
    const initialHighlights = JSON.stringify([
        {
            title: "37+ PDF Tools",
            description: "Keep this description",
            icon_type: "file",
        },
        {
            title: "Virtual Document Studio",
            description: "Keep the second description",
            icon_type: "layers",
        },
    ]);

    const updatedHighlights = JSON.parse(
        updateAboutHighlightTitle(initialHighlights, 0, "PDF Tools")
    );

    assert.deepEqual(updatedHighlights, [
        {
            title: "PDF Tools",
            description: "Keep this description",
            icon_type: "file",
        },
        {
            title: "Virtual Document Studio",
            description: "Keep the second description",
            icon_type: "layers",
        },
    ]);

    console.log("Admin About existing-title edit contract passed.");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
