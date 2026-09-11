import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";

// Keep ESM-only DOM dependencies outside tsx's CommonJS loader. esbuild is
// supplied by the existing tsx toolchain; native Node loads external packages.
export function runEsmUnitTest(file: string): number | null {
    const directory = mkdtempSync(path.join(__dirname, ".unit-esm-"));
    try {
        const output = path.join(directory, "test.mjs");
        buildSync({ entryPoints: [file], outfile: output, bundle: true,
            platform: "node", format: "esm", packages: "external" });
        const result = spawnSync(process.execPath, [output], {
            stdio: "inherit", cwd: path.resolve(__dirname, ".."), timeout: 120_000,
        });
        if (result.error) console.error(result.error);
        return result.status;
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
