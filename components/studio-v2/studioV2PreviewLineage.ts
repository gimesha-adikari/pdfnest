import type {
  StudioOperationDTO,
  StudioVersionDTO,
  VDMPageDescriptorDTO,
} from "@/lib/studio-v2/api";

export interface StudioPreviewLineageInput {
  activeVersion: StudioVersionDTO | null | undefined;
  versions: readonly StudioVersionDTO[];
  operations: readonly StudioOperationDTO[];
  pages: readonly VDMPageDescriptorDTO[];
}

// These operations can change page order, page identity, or a document-wide
// visual layer. When their older metadata is incomplete, using the active
// version for every page is the safe preview choice.
const CONSERVATIVE_OPERATION_NAMES = new Set([
  "delete_pages",
  "reorder_pages",
  "duplicate_pages",
  "insert_blank_pages",
  "update_page_numbering",
  "add_watermark",
  "delete_overlay",
  "merge",
  "split",
  "compress",
  "grayscale",
  "repair",
  "redact",
  "editor_compile",
]);

function activeVersionMap(
  activeVersion: StudioVersionDTO,
  versions: readonly StudioVersionDTO[],
): Map<string, StudioVersionDTO> {
  const map = new Map(versions.map((version) => [version.id, version]));
  map.set(activeVersion.id, activeVersion);
  return map;
}

function allPagesAtVersion(pages: readonly VDMPageDescriptorDTO[], versionId: string): Record<string, string> {
  return Object.fromEntries(pages.map((page) => [page.page_id, versionId]));
}

/**
 * Resolve the newest safe ancestor version that can render each unchanged
 * page. Missing impact metadata deliberately falls back to the active
 * version, keeping old histories correct at the cost of extra renders.
 */
export function buildStudioPreviewVersionByPageId({
  activeVersion,
  versions,
  operations,
  pages,
}: StudioPreviewLineageInput): Record<string, string> {
  if (!activeVersion || pages.length === 0) return {};

  const versionsById = activeVersionMap(activeVersion, versions);
  const operationsByVersion = new Map(operations.map((operation) => [operation.version_id, operation]));
  const pageIds = new Set(pages.map((page) => page.page_id));
  const resolved: Record<string, string> = {};
  let version: StudioVersionDTO | undefined = activeVersion;
  let rootVersionId = activeVersion.id;

  // A history response without the active operation metadata is not safe to
  // interpret. This is also the initial render while history is loading.
  if (activeVersion.parent_version_id && !operationsByVersion.has(activeVersion.id)) {
    return allPagesAtVersion(pages, activeVersion.id);
  }

  while (version) {
    rootVersionId = version.id;
    const operation = operationsByVersion.get(version.id);
    if (operation) {
      const operationName = operation.operation_name.toLowerCase();
      const isUnscopedMarkup = operationName.startsWith("markup_")
        && (!operation.target_page_ids || operation.target_page_ids.length === 0);
      if (CONSERVATIVE_OPERATION_NAMES.has(operationName) || isUnscopedMarkup) {
        return allPagesAtVersion(pages, activeVersion.id);
      }

      const targetPageIds = operation.target_page_ids;
      if (!targetPageIds || targetPageIds.length === 0) {
        return allPagesAtVersion(pages, activeVersion.id);
      }
      for (const pageId of targetPageIds) {
        if (pageIds.has(pageId) && !resolved[pageId]) resolved[pageId] = version.id;
      }
    }

    const parentId = version.parent_version_id;
    if (!parentId) break;
    const parent = versionsById.get(parentId);
    if (!parent) return allPagesAtVersion(pages, activeVersion.id);
    version = parent;
  }

  for (const page of pages) {
    if (!resolved[page.page_id]) resolved[page.page_id] = rootVersionId;
  }
  return resolved;
}
