import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadEditorJobs() {
  const source = fs.readFileSync(path.resolve("lib/editorJobs.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const loaded = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", outputText)(
    (name: string) => {
      if (name === "@/lib/api") return { getBaseUrl: () => "http://127.0.0.1:8080" };
      if (name === "@/lib/security/pdfInputPreparation") return { markCloudSubmissionInitiated: () => undefined };
      if (name === "@/lib/abortableDelay") return { abortableDelay: async () => undefined };
      return require(name);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports as { downloadEditorJob: (jobId: string) => Promise<Blob> };
}

async function main() {
  const module = loadEditorJobs();
  const bytes = Buffer.from("%PDF-1.7\nstreamed worker artifact\n%%EOF\n", "utf8");
  let blobRead = false;
  let arrayBufferRead = false;
  let requestedUrl = "";
  let requestCredentials: RequestCredentials | undefined;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestCredentials = init?.credentials;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      text: async () => "",
      blob: async () => {
        blobRead = true;
        // Reproduces the browser's observed Blob body-read failure on the
        // 24 MB verified scan artifact while the response bytes remain readable.
        throw new TypeError("Failed to fetch");
      },
      arrayBuffer: async () => {
        arrayBufferRead = true;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const result = await module.downloadEditorJob("large-scan-job");
    assert.equal(requestedUrl, "http://127.0.0.1:8080/api/edit/jobs/large-scan-job/download");
    assert.equal(requestCredentials, "include");
    assert.equal(blobRead, false, "download should not use the failing Response.blob() path");
    assert.equal(arrayBufferRead, true, "download should consume the response bytes directly");
    assert.equal(result.type, "application/pdf");
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
