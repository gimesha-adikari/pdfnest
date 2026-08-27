import assert from "node:assert/strict";
import { addMergeQueueItem, createMergeQueue, moveMergeQueueItem, removeMergeQueueItem, serializeMergeQueue } from "@/components/studio-v2/studioV2MergeQueue";

const asset = (id: string, name = `${id}.pdf`) => ({ id, document_id: "doc", asset_type: "merge_source", byte_size: 1, mime_type: "application/pdf" });

let queue = createMergeQueue();
assert.equal(queue[0].kind, "current_document");
queue = addMergeQueueItem(queue, asset("A"), "A.pdf");
queue = addMergeQueueItem(queue, asset("A-2"), "A.pdf");
queue = addMergeQueueItem(queue, asset("B"), "B.pdf");
assert.equal(queue.filter((item) => item.name === "A.pdf").length, 2, "duplicate names remain separate items");
queue = moveMergeQueueItem(queue, "B", -1);
queue = moveMergeQueueItem(queue, "B", -1);
queue = moveMergeQueueItem(queue, "current-document", 1);
assert.deepEqual(serializeMergeQueue(queue), { source_asset_ids: ["B", "A", "A-2"], current_document_position: 1 });
assert.equal(removeMergeQueueItem(queue, "current-document").length, queue.length, "current document cannot be removed");
assert.equal(removeMergeQueueItem(queue, "A").some((item) => item.id === "A"), false);
assert.equal(serializeMergeQueue(createMergeQueue()), null, "current-only queue cannot apply");
assert.equal(serializeMergeQueue([{ ...queue[0], id: "pending", kind: "uploaded_asset", status: "uploading" }]), null);
assert.deepEqual(createMergeQueue().map((item) => item.kind), ["current_document"]);
console.log("Studio V2 merge queue tests passed: ordering, stable IDs, removal, reset, and pending validation.");
