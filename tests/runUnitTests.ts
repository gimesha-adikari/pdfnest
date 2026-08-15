/**
 * Runs every self-contained unit test script in tests/unit sequentially.
 *
 * Run: npm run test:unit
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const UNIT_DIR = path.resolve(__dirname, "unit");

// Execution suites export a runner instead of running on import; tests/runHybridTests.ts drives them.
const EXCLUDED = new Set([
    "hybridExecution.test.ts",
    "mergeExecution.test.ts",
    "watermarkExecution.test.ts",
    "wave1Execution.test.ts",
    "pageNumbersExecution.test.ts",
    "addTextExecution.test.ts",
]);

function main() {
    const files = fs
        .readdirSync(UNIT_DIR)
        .filter((file) => file.endsWith(".test.ts") && !EXCLUDED.has(file))
        .sort();

    const failed: string[] = [];

    for (const file of files) {
        console.log(`\n=== ${file} ===`);
        const result = spawnSync("npx", ["tsx", path.join(UNIT_DIR, file)], {
            stdio: "inherit",
            cwd: path.resolve(__dirname, ".."),
        });

        if (result.status !== 0) failed.push(file);
    }

    console.log(`\n=== UNIT SUITE: ${files.length - failed.length}/${files.length} files passed ===`);

    if (failed.length > 0) {
        console.error(`Failed files:\n${failed.map((f) => `  - ${f}`).join("\n")}`);
        process.exit(1);
    }
}

main();
