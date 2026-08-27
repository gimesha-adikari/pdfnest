import type { StudioAssetDTO, StudioMergeParameters } from "@/lib/studio-v2/api";

export type StudioMergeQueueItem = {
  id: string;
  kind: "current_document" | "uploaded_asset";
  name: string;
  asset?: StudioAssetDTO;
  status?: "uploading" | "ready" | "error";
  error?: string;
};

export const CURRENT_DOCUMENT_QUEUE_ID = "current-document";

export function createMergeQueue(): StudioMergeQueueItem[] {
  return [{ id: CURRENT_DOCUMENT_QUEUE_ID, kind: "current_document", name: "Current document", status: "ready" }];
}

export function addMergeQueueItem(queue: StudioMergeQueueItem[], asset: StudioAssetDTO, name: string): StudioMergeQueueItem[] {
  return [...queue, { id: asset.id, kind: "uploaded_asset", name, asset, status: "ready" }];
}

export function removeMergeQueueItem(queue: StudioMergeQueueItem[], id: string): StudioMergeQueueItem[] {
  if (id === CURRENT_DOCUMENT_QUEUE_ID) return queue;
  return queue.filter((item) => item.id !== id);
}

export function moveMergeQueueItem(queue: StudioMergeQueueItem[], id: string, direction: -1 | 1): StudioMergeQueueItem[] {
  const index = queue.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= queue.length) return queue;
  const next = [...queue];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function serializeMergeQueue(queue: StudioMergeQueueItem[]): StudioMergeParameters | null {
  const currentIndex = queue.findIndex((item) => item.kind === "current_document");
  const assets = queue.filter((item) => item.kind === "uploaded_asset");
  if (currentIndex < 0 || assets.length === 0 || assets.some((item) => item.status !== "ready" || !item.asset)) return null;
  return { source_asset_ids: assets.map((item) => item.asset!.id), current_document_position: currentIndex };
}
