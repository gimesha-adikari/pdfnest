import { isPathExcluded, sanitizeRelativePath, bundleDirectoryToZip } from "../../lib/folderZipper";
import assert from "node:assert";
import { unzipSync, strFromU8 } from "fflate";

async function runTests() {
    const secrets = [".env", ".env.production", "nested/.env.local", "cert.pem", "private.KEY",
        "id_rsa", "nested/id_ed25519", "credentials.json", ".aws/credentials", ".npmrc", ".svn/entries"];
    for (const name of secrets) assert.equal(isPathExcluded(`repo/${name}`), true, name);
    for (const name of [".env.example", ".env.sample", ".env.template", "nested/.env.defaults", "package.json", "src/main.ts", "tsconfig.json"]) {
        assert.equal(isPathExcluded(`repo/${name}`), false, name);
    }
    for (const name of ["../secret", "a/../b", "/abs", "C:\\secret", "a//b", "a/./b", "a/secret\0", "\\\\host/share"]) {
        assert.throws(() => sanitizeRelativePath(name), /Unsafe/, name);
    }
    let secretReads = 0;
    const unsafeFiles = secrets.map((name) => {
        const file = new File(["harmless synthetic secret"], name);
        Object.defineProperty(file, "webkitRelativePath", { value: `repo/${name}` });
        file.arrayBuffer = async () => { secretReads++; throw new Error("Excluded bytes read"); };
        return file;
    });
    const safeFile = new File(["safe template"], ".env.example");
    Object.defineProperty(safeFile, "webkitRelativePath", { value: "repo/.env.example" });
    const safeBundle = await bundleDirectoryToZip([...unsafeFiles, safeFile]);
    assert.equal(secretReads, 0);
    const contents = unzipSync(new Uint8Array(await safeBundle.zipBlob.arrayBuffer()));
    assert.deepEqual(Object.keys(contents), ["repo/.env.example"]);
    assert.equal(strFromU8(contents["repo/.env.example"]), "safe template");
    await assert.rejects(bundleDirectoryToZip(unsafeFiles), /No valid source/);
    let safeReads = 0;
    safeFile.arrayBuffer = async () => { safeReads++; return new ArrayBuffer(0); };
    const traversal = new File(["unused"], "../unsafe");
    await assert.rejects(bundleDirectoryToZip([safeFile, traversal]), /Unsafe/);
    assert.equal(safeReads, 0, "complete validation precedes any byte reads");
    const tooBig = new File([], "large.ts");
    Object.defineProperty(tooBig, "size", { value: 250 * 1024 * 1024 + 1 });
    await assert.rejects(bundleDirectoryToZip([tooBig]), /250MB/);
    await assert.rejects(bundleDirectoryToZip(Array.from({length: 25001}, (_, i) => new File([], `${i}.ts`))), /file count/);

    console.log("=== RUNNING FOLDER ZIPPER UNIT TESTS ===");

    // Test 1: Exclusion Rules
    assert.strictEqual(isPathExcluded("node_modules/express/index.js"), true, "node_modules must be excluded");
    assert.strictEqual(isPathExcluded(".git/HEAD"), true, ".git must be excluded");
    assert.strictEqual(isPathExcluded(".next/server/pages.js"), true, ".next must be excluded");
    assert.strictEqual(isPathExcluded(".venv/bin/python"), true, ".venv must be excluded");
    assert.strictEqual(isPathExcluded("src/.DS_Store"), true, ".DS_Store must be excluded");
    assert.strictEqual(isPathExcluded("src/components/Header.tsx"), false, "valid source files must not be excluded");
    assert.strictEqual(isPathExcluded("package.json"), false, "root package.json must not be excluded");
    console.log("✓ Test 1: Path exclusion filters passed.");

    // Test 2: Path Sanitization & Traversal Protection
    assert.strictEqual(sanitizeRelativePath("src/index.ts"), "src/index.ts");
    assert.throws(() => sanitizeRelativePath("/src/index.ts"));
    assert.strictEqual(sanitizeRelativePath("src\\components\\Button.tsx"), "src/components/Button.tsx");

    let traversalDetected = false;
    try {
        sanitizeRelativePath("../secret/passwords.txt");
    } catch {
        traversalDetected = true;
    }
    assert.strictEqual(traversalDetected, true, "Path traversal with .. must be rejected");
    console.log("✓ Test 2: Path sanitization and traversal prevention passed.");

    // Test 3: Client-Side Bundling
    const mockFiles: File[] = [
        new File(["console.log('hello');"], "index.ts", { type: "text/plain" }),
        new File(['{"name": "test-repo"}'], "package.json", { type: "application/json" }),
        new File(["junk"], "node_modules/dummy.js", { type: "text/plain" }),
    ];

    // Assign webkitRelativePath
    Object.defineProperty(mockFiles[0], "webkitRelativePath", { value: "my-project/src/index.ts" });
    Object.defineProperty(mockFiles[1], "webkitRelativePath", { value: "my-project/package.json" });
    Object.defineProperty(mockFiles[2], "webkitRelativePath", { value: "my-project/node_modules/dummy.js" });

    let progressCalls = 0;
    const result = await bundleDirectoryToZip(mockFiles, (percent) => {
        progressCalls++;
        assert.ok(percent >= 0 && percent <= 100);
    });

    assert.strictEqual(result.folderName, "my-project");
    assert.strictEqual(result.fileCount, 2, "node_modules file must be excluded from bundle");
    assert.ok(result.zipBlob.size > 0, "ZIP blob must not be empty");
    assert.strictEqual(result.zipBlob.type, "application/zip");
    assert.ok(progressCalls > 0, "Progress callback must be invoked");
    console.log("✓ Test 3: In-memory folder bundling and filtering passed.");

    console.log("=== ALL FOLDER ZIPPER UNIT TESTS PASSED 100% ===");
}

runTests().catch((err) => {
    console.error("Folder zipper test failure:", err);
    process.exit(1);
});
