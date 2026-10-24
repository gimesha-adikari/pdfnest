import assert from "node:assert/strict";
import fs from "node:fs";
import { OcrAwareMarkupError, isMarkupCapacityRejection, safeOcrAwareMarkupMessage } from "@/lib/ocrAwareMarkupV2";

async function main() {
    assert.ok(fs.existsSync("lib/markupActivity.ts"), "preview and submission need a shared synchronous activity guard");
    const { MarkupActivityGate, markupPreviewKey } = await import("@/lib/markupActivity");
    const gate = new MarkupActivityGate();
    const preview = gate.begin("preview");
    assert.ok(preview);
    assert.equal(gate.begin("submission"), null, "pending preview blocks submit even before React rerenders");
    assert.equal(gate.begin("preview"), null, "page/language change cannot overlap another preview");
    assert.equal(gate.finish(preview), true);
    const submission = gate.begin("submission");
    assert.ok(submission);
    assert.equal(gate.begin("submission"), null, "double clicks cannot create duplicate jobs");
    assert.equal(gate.begin("preview"), null, "no preview may start during final processing");
    assert.equal(gate.finish(preview), false, "late preview completion cannot release newer submission");
    assert.equal(gate.owns(submission), true);
    assert.equal(gate.finish(submission), true);
    assert.ok(gate.begin("submission"), "known rejected submission can be explicitly retried after release");
    const a = new File(["a"], "same.pdf", { type: "application/pdf", lastModified: 1 });
    const b = new File(["b"], "same.pdf", { type: "application/pdf", lastModified: 1 });
    assert.equal(markupPreviewKey(a, "eng", 1), markupPreviewKey(a, "eng", 1));
    assert.notEqual(markupPreviewKey(a, "eng", 1), markupPreviewKey(b, "eng", 1), "same metadata cannot identify another file");
    assert.notEqual(markupPreviewKey(a, "eng", 1), markupPreviewKey(a, "sin", 1));
    assert.notEqual(markupPreviewKey(a, "eng", 1), markupPreviewKey(a, "eng", 2));
    for (const code of ["SERVER_BUSY", "GLOBAL_CAPACITY_EXHAUSTED", "IDENTITY_CAPACITY_EXHAUSTED"]) {
        assert.match(safeOcrAwareMarkupMessage(code), /try again/i);
        assert.match(safeOcrAwareMarkupMessage(code), /selection/i);
    }
    assert.equal(isMarkupCapacityRejection(new OcrAwareMarkupError("SERVER_BUSY", "", 429)), true);
    assert.equal(isMarkupCapacityRejection(new OcrAwareMarkupError("QUOTA_EXCEEDED", "", 429)), false);
    assert.equal(isMarkupCapacityRejection(new OcrAwareMarkupError("SERVER_BUSY", "", 500)), false);
    const source = fs.readFileSync("components/tools/OcrAwareMarkupV2Workspace.tsx", "utf8");
    assert.match(source, /\.begin\("submission"\)/);
    assert.match(source, /\.begin\("preview"\)/);
    assert.match(source, /isPreviewProcessing/);
    console.log("PASS: markup serialization, duplicate/stale ownership, exact file identity and capacity retry");
}
void main();
