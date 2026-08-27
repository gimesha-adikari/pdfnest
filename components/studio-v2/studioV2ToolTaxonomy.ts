import { ToolCategory } from "./types";

export type StudioV2InspectorSection =
  | "document"
  | "page"
  | "text"
  | "signature"
  | "metadata"
  | "geometry"
  | "crop"
  | "markup"
  | "layers";

/**
 * The right inspector is a category surface, not a registry of every Studio
 * operation. Keep this map pure so desktop, mobile, and deterministic tests
 * share one product taxonomy.
 */
export const STUDIO_V2_CATEGORY_SECTIONS: Record<ToolCategory, readonly StudioV2InspectorSection[]> = {
  pages: ["document", "geometry"],
  organize: ["page"],
  edit: ["text", "signature", "metadata", "geometry", "crop"],
  annotate: ["markup"],
  layers: ["layers"],
};

export function studioV2CategoryHasSection(
  category: ToolCategory,
  section: StudioV2InspectorSection,
): boolean {
  return STUDIO_V2_CATEGORY_SECTIONS[category].includes(section);
}
