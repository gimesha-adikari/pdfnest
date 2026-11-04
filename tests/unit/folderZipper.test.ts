import { isPathExcluded, sanitizeRelativePath, bundleDirectoryToZip, sanitizeZipArchive } from "../../lib/folderZipper";
import assert from "node:assert";
import { unzipSync, strFromU8 } from "fflate";
import JSZip from "jszip";

function repositoryFile(path: string, value: string): File {
    const file = new File([value], path.split("/").at(-1)!);
    Object.defineProperty(file, "webkitRelativePath", { value: path });
    return file;
}

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

    let excludedReads = 0;
    const ignoredFiles = [
        repositoryFile("repo/debug.log", "synthetic log secret"),
        repositoryFile("repo/secrets/token.txt", "synthetic token"),
        repositoryFile("repo/src/app.local", "synthetic local secret"),
        repositoryFile("repo/custom/private.json", "synthetic user exclusion"),
        repositoryFile("repo/.env", "synthetic environment secret"),
    ];
    let ignoredControlReads = 0;
    const ignoredByGitControl = repositoryFile("repo/blocked/.gitignore", "must not be read");
    ignoredByGitControl.arrayBuffer = async () => { ignoredControlReads++; throw new Error("Ignored control file was read"); };
    const ignoredByUserControl = repositoryFile("repo/custom/.gitignore", "must not be read");
    ignoredByUserControl.arrayBuffer = async () => { ignoredControlReads++; throw new Error("Excluded control file was read"); };
    for (const file of ignoredFiles) {
        file.arrayBuffer = async () => { excludedReads++; throw new Error("Excluded bytes were read"); };
    }
    const nestedFiles = [
        repositoryFile("repo/.gitignore", "*.log\n!keep.log\nsecrets/\nblocked/\n"),
        repositoryFile("repo/src/.gitignore", "*.local\n!example.local\n"),
        repositoryFile("repo/keep.log", "allowed log"),
        repositoryFile("repo/src/example.local", "allowed exception"),
        repositoryFile("repo/src/code.ts", "safe source"),
        ignoredByGitControl,
        ignoredByUserControl,
        ...ignoredFiles,
    ];
    const nestedBundle = await bundleDirectoryToZip(nestedFiles, undefined, { excludedPaths: ["custom/"] });
    assert.equal(excludedReads, 0, "ignored, secret, and user-excluded file bytes are not read");
    assert.equal(ignoredControlReads, 0, "nested ignored or user-excluded .gitignore files are not read as control data");
    const nestedContents = unzipSync(new Uint8Array(await nestedBundle.zipBlob.arrayBuffer()));
    assert.deepEqual(Object.keys(nestedContents).sort(), [
        "repo/.gitignore", "repo/keep.log", "repo/src/.gitignore", "repo/src/code.ts", "repo/src/example.local",
    ]);
    assert.equal(strFromU8(nestedContents["repo/keep.log"]), "allowed log");
    assert.equal(strFromU8(nestedContents["repo/src/example.local"]), "allowed exception");

    let scopedReads = 0;
    const scopedSafe = repositoryFile("repo/src/safe.ts", "safe");
    scopedSafe.arrayBuffer = async () => { scopedReads++; return new TextEncoder().encode("safe").buffer; };
    const escaped = repositoryFile("other/private.ts", "must not be read");
    escaped.arrayBuffer = async () => { throw new Error("Out-of-scope bytes were read"); };
    await assert.rejects(bundleDirectoryToZip([scopedSafe, escaped]), /selected root/);
    assert.equal(scopedReads, 0, "complete scope validation precedes file reads");
    await assert.rejects(bundleDirectoryToZip([scopedSafe], undefined, { excludedPaths: ["../outside"] }), /relative, deny-only/);

    const sourceZip = new JSZip();
    sourceZip.file("repo/.gitignore", "secrets/\nblocked/\n*.log\n!keep.log\n");
    sourceZip.file("repo/secrets/key.txt", "synthetic key");
    sourceZip.file("repo/blocked/.gitignore", "synthetic ignored rule file");
    sourceZip.file("repo/custom/.gitignore", "synthetic user excluded rule file");
    sourceZip.file("repo/private.log", "synthetic log");
    sourceZip.file("repo/keep.log", "safe retained log");
    sourceZip.file("repo/src/main.ts", "safe source");
    const sourceZipFile = new File([await sourceZip.generateAsync({ type: "blob" })], "repo.zip");
    const originalLoad = JSZip.loadAsync.bind(JSZip);
    let zipSecretReads = 0;
    let zipIgnoredControlReads = 0;
    Object.defineProperty(JSZip, "loadAsync", {
        configurable: true,
        value: async (input: Parameters<typeof JSZip.loadAsync>[0], options?: Parameters<typeof JSZip.loadAsync>[1]) => {
            const archive = await originalLoad(input, options);
            const excluded = archive.file("repo/secrets/key.txt")! as unknown as { internalStream: () => never };
            excluded.internalStream = () => { zipSecretReads++; throw new Error("Excluded ZIP entry was decompressed"); };
            for (const path of ["repo/blocked/.gitignore", "repo/custom/.gitignore"]) {
                const control = archive.file(path)! as unknown as { internalStream: () => never };
                control.internalStream = () => { zipIgnoredControlReads++; throw new Error("Ignored ZIP control file was decompressed"); };
            }
            return archive;
        },
    });
    try {
        const sanitizedZip = await sanitizeZipArchive(sourceZipFile, { excludedPaths: ["src/**", "custom/"] });
        assert.equal(zipSecretReads, 0, "excluded ZIP member is never decompressed");
        assert.equal(zipIgnoredControlReads, 0, "ignored or user-excluded ZIP .gitignore members are not decompressed");
        const sanitizedContents = unzipSync(new Uint8Array(await sanitizedZip.zipBlob.arrayBuffer()));
        assert.deepEqual(Object.keys(sanitizedContents).sort(), ["repo/.gitignore", "repo/keep.log"]);
        assert.equal(strFromU8(sanitizedContents["repo/keep.log"]), "safe retained log");
    } finally {
        Object.defineProperty(JSZip, "loadAsync", { configurable: true, value: originalLoad });
    }

    const malformedZip = new JSZip();
    malformedZip.file("../outside-secret.txt", "synthetic traversal payload");
    const malformedZipFile = new File([await malformedZip.generateAsync({ type: "blob" })], "malformed.zip");
    await assert.rejects(sanitizeZipArchive(malformedZipFile), /Unsafe repository relative path/);

    const cancel = new AbortController();
    cancel.abort();
    let cancelledZipReads = 0;
    const cancelledZip = new File(["zip"], "cancelled.zip");
    cancelledZip.arrayBuffer = async () => { cancelledZipReads++; return new ArrayBuffer(0); };
    await assert.rejects(sanitizeZipArchive(cancelledZip, { signal: cancel.signal }), { name: "AbortError" });
    assert.equal(cancelledZipReads, 0, "cancelled ZIP is not read or uploaded");

    console.log("=== ALL FOLDER ZIPPER UNIT TESTS PASSED 100% ===");
}

runTests().catch((err) => {
    console.error("Folder zipper test failure:", err);
    process.exit(1);
});
