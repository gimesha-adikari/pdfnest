import type { VDMPageDescriptorDTO } from "@/lib/studio-v2/api";
import type { ToolCategory } from "./types";

/** Presentation-only helpers. They deliberately never create document state. */
export function nextStudioMobileSheetOpen(tool: ToolCategory): boolean {
  return tool === "annotate";
}

export function shouldDismissStudioMobileSheet(intent: "more" | "command" | "page-navigator" | "editor"): boolean {
  // These are mutually exclusive full-context surfaces; keeping this pure lets
  // every trigger share the same non-stacking rule.
  return intent === "more" || intent === "command" || intent === "page-navigator" || intent === "editor";
}

export function normalizeStudioCommandQuery(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s/_\-.,:;!?()[\]{}]+/g, "");
}

export function studioPageContext(
  pages: readonly VDMPageDescriptorDTO[],
  selectedPageId: string | null | undefined,
): { selectedIndex: number; label: string } {
  const selectedIndex = selectedPageId
    ? pages.findIndex((page) => page.page_id === selectedPageId)
    : -1;
  const current = selectedIndex >= 0 ? selectedIndex + 1 : pages.length ? 1 : 0;
  return { selectedIndex, label: `Page ${current} of ${pages.length}` };
}
