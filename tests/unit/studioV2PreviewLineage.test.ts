import assert from "node:assert/strict";

import type { StudioOperationDTO, StudioVersionDTO, VDMPageDescriptorDTO } from "../../lib/studio-v2/api";
import { buildStudioPreviewVersionByPageId } from "../../components/studio-v2/studioV2PreviewLineage";

function version(id: string, parent_version_id: string | null): StudioVersionDTO {
  return {
    id,
    document_id: "document",
    parent_version_id,
    preferred_child_id: null,
    version_number: Number(id.slice(1)),
    status: "ready",
    operation_type: id === "v1" ? "initial" : "markup_highlight",
    is_materialized: id !== "v1",
    created_at: "2026-09-09T00:00:00Z",
  };
}

function operation(version_id: string, operation_name: string, target_page_ids?: string[]): StudioOperationDTO {
  return {
    id: `operation-${version_id}`,
    document_id: "document",
    version_id,
    idempotency_key: `key-${version_id}`,
    operation_name,
    parameters: {},
    target_page_ids,
    created_at: "2026-09-09T00:00:00Z",
  };
}

const pages: VDMPageDescriptorDTO[] = [
  { page_id: "p1", source_page_number: 1, is_blank: false, rotation: 0, overlays: [] },
  { page_id: "p2", source_page_number: 2, is_blank: false, rotation: 0, overlays: [] },
  { page_id: "p3", source_page_number: 3, is_blank: false, rotation: 0, overlays: [] },
];

const active = version("v3", "v2");
assert.deepEqual(buildStudioPreviewVersionByPageId({
  activeVersion: active,
  versions: [version("v1", null), version("v2", "v1"), active],
  operations: [operation("v2", "markup_highlight", ["p1"]), operation("v3", "markup_underline", ["p2"])],
  pages,
}), { p1: "v2", p2: "v3", p3: "v1" });

const samePageActive = version("v2", "v1");
assert.deepEqual(buildStudioPreviewVersionByPageId({
  activeVersion: samePageActive,
  versions: [version("v1", null), samePageActive],
  operations: [operation("v2", "markup_strikeout", ["p1"])],
  pages,
}), { p1: "v2", p2: "v1", p3: "v1" });

assert.deepEqual(buildStudioPreviewVersionByPageId({
  activeVersion: samePageActive,
  versions: [version("v1", null), samePageActive],
  operations: [operation("v2", "markup_highlight")],
  pages,
}), { p1: "v2", p2: "v2", p3: "v2" });

assert.deepEqual(buildStudioPreviewVersionByPageId({
  activeVersion: samePageActive,
  versions: [version("v1", null), samePageActive],
  operations: [operation("v2", "reorder_pages", ["p1", "p2", "p3"])],
  pages,
}), { p1: "v2", p2: "v2", p3: "v2" });

console.log("Studio V2 preview lineage tests passed.");
