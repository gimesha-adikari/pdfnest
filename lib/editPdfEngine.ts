export type EditPdfEditorEngine = "v2" | "legacy";

/**
 * Authoritative resolver for the Standalone PDF Editor engine.
 *
 * Precedence & Resolution Rules:
 * - Explicit "legacy" (case-insensitive, trimmed) -> "legacy" rollback
 * - Everything else (undefined, null, empty string, whitespace, "v2", etc.) -> "v2"
 *
 * V2 is the default engine under all circumstances unless explicitly set to "legacy".
 */
export function resolveEditPdfEditorEngine(
  raw?: string | null
): EditPdfEditorEngine {
  const configured = raw?.trim().toLowerCase();
  return configured === "legacy" ? "legacy" : "v2";
}
