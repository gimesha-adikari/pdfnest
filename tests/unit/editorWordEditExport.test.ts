import assert from "node:assert/strict";
import { canReusePreparedWordEdit, isCurrentWordEditPreparation } from "../../components/editor-v2/wordEdits";
import { verifyWordEditArtifact } from "../../lib/editorJobs";

const bytes = new TextEncoder().encode("%PDF-1.7\nsmall-worker-pdf-bytes\n%%EOF\n");
const digest = async (value: Uint8Array) => {
  const input = value.slice().buffer as ArrayBuffer;
  const result = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", input));
  return Array.from(result, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

async function main() {
  const sourceFile = {} as File;
  const otherSourceFile = {} as File;
  const preparedIdentity = { source: sourceFile, revision: 4, requestSignature: "final-request" };
  assert.equal(canReusePreparedWordEdit(preparedIdentity, sourceFile, 4, "final-request"), true);
  assert.equal(canReusePreparedWordEdit(preparedIdentity, sourceFile, 5, "final-request"), false);
  assert.equal(canReusePreparedWordEdit(preparedIdentity, otherSourceFile, 4, "final-request"), false);
  assert.equal(canReusePreparedWordEdit(preparedIdentity, sourceFile, 4, "changed-request"), false);
  assert.equal(isCurrentWordEditPreparation({ source: sourceFile, revision: 4 }, { source: sourceFile, revision: 4 }, true), true);
  assert.equal(isCurrentWordEditPreparation({ source: sourceFile, revision: 4 }, { source: sourceFile, revision: 5 }, true), false);
  assert.equal(isCurrentWordEditPreparation({ source: sourceFile, revision: 4 }, { source: otherSourceFile, revision: 4 }, true), false);
  assert.equal(isCurrentWordEditPreparation({ source: sourceFile, revision: 4 }, { source: sourceFile, revision: 4 }, false), false);

  const artifactSha = await digest(bytes);
  const metadata = {
    compiler_protocol: "platen_word_edits.v1",
    artifact_sha256: artifactSha,
    page_count: 13,
  };

  const verified = await verifyWordEditArtifact(new Blob([bytes]), metadata, 13);
  assert.equal(verified.artifactSha256, artifactSha);
  assert.equal(verified.pageCount, 13);

  await assert.rejects(
    verifyWordEditArtifact(new Blob([bytes]), { ...metadata, artifact_sha256: "0".repeat(64) }, 13),
    /do not match/,
  );
  await assert.rejects(
    verifyWordEditArtifact(new Blob([bytes]), { ...metadata, compiler_protocol: "legacy" }, 13),
    /validated word-edit protocol/,
  );
  await assert.rejects(
    verifyWordEditArtifact(new Blob([bytes]), metadata, 12),
    /page count/,
  );
  await assert.rejects(
    verifyWordEditArtifact(new Blob(["not a pdf"]), metadata, 13),
    /not a PDF/,
  );

  console.log("Word edit artifact verification tests passed.");
}

void main();
