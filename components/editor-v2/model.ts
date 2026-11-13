export type EditorLanguageCode = "eng" | "sin" | "tam";
export type EditorLanguageMode = "AUTO" | "EXPLICIT";
export interface EditorLanguageChoice { mode: EditorLanguageMode; languages: EditorLanguageCode[]; }
export const DEFAULT_EDITOR_LANGUAGE: EditorLanguageChoice = { mode: "AUTO", languages: ["eng", "sin", "tam"] };
export interface EditorElementStyle { fontFamily?: "original" | "helv" | "tiro" | "cour"; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; color?: string; background?: string; }
export interface EditorWordGeometry { id: string; text: string; x: number; y: number; width: number; height: number; }
export interface EditorElement { id: string; text: string; original_text?: string; target_substring?: string; selection_start?: number; selection_end?: number; x: number; y: number; width: number; height: number; size: number; font: string; bg_color?: string; text_color?: string; transparent_bg?: boolean; style?: EditorElementStyle; ocr_v2?: boolean; source?: string; provenance?: string[]; word_ids?: string[]; word_geometry?: EditorWordGeometry[]; reading_order?: string[]; confidence?: number; }
export interface EditorPage { page_num: number; width: number; height: number; rotation?: number; kind: "text" | "mixed" | "scanned" | "blank"; is_ocr?: boolean; elements: EditorElement[]; has_selectable_text?: boolean; word_count?: number; text_block_count?: number; image_block_count?: number; source?: string; provenance?: string[]; reading_order?: string[]; capabilities?: string[]; }
export interface EditorWordEditBaseline { extraction_job_id: string; digest: string; source_sha256: string; engine_fingerprint: string; algorithm_version: string; }
export interface EditorLayout { schema_version?: "ocr_v2_editor_layout.v1" | string; ocr_v2?: boolean; success?: boolean; pages: EditorPage[]; source?: Record<string, unknown>; language_mode?: EditorLanguageMode; languages?: EditorLanguageCode[]; source_tracker?: string; upright_tracker?: string; word_edit_protocols?: string[]; word_edit_baseline?: EditorWordEditBaseline; }
export interface EditorRect { x: number; y: number; width: number; height: number; }
/** Map canonical native PDF word boxes to the rotated visible CropBox frame. */
export function visibleNativeWordRect(rect: EditorRect, page: Pick<EditorPage, "width" | "height" | "rotation" | "source">): EditorRect {
  if (page.source !== "NATIVE_EXTRACTION") return rect;
  const rotation = ((page.rotation ?? 0) % 360 + 360) % 360;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  switch (rotation) {
    case 0: return rect;
    case 90: return { x: page.width - bottom, y: rect.x, width: rect.height, height: rect.width };
    case 180: return { x: page.width - right, y: page.height - bottom, width: rect.width, height: rect.height };
    case 270: return { x: rect.y, y: page.height - right, width: rect.height, height: rect.width };
    default: return rect;
  }
}
export interface EditorMatch { pageIndex: number; elementId: string; start: number; end: number; }
export function editorMatches(layout: EditorLayout, query: string): EditorMatch[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  return layout.pages.flatMap((page, pageIndex) => page.elements.flatMap((element) => {
    const text = element.text.toLocaleLowerCase();
    const matches: EditorMatch[] = [];
    for (let start = text.indexOf(q); start >= 0; start = text.indexOf(q, start + Math.max(1, q.length))) matches.push({ pageIndex, elementId: element.id, start, end: start + q.length });
    return matches;
  }));
}
export function clampZoom(value: number): number { return Math.min(2, Math.max(.5, Math.round(value * 100) / 100)); }
export function fitWidthZoom(containerWidth: number, pageWidth: number, gutter = 64): number { return containerWidth <= gutter || pageWidth <= 0 ? 1 : clampZoom((containerWidth - gutter) / pageWidth); }
export function clampPageIndex(index: number, pageCount: number): number { return Math.max(0, Math.min(Math.max(0, pageCount - 1), index)); }
export type EditorKeyboardIntent = "UNDO" | "REDO" | "BOLD" | "ITALIC" | "UNDERLINE" | null;
export function editorKeyboardIntent(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">): EditorKeyboardIntent {
  if (!event.ctrlKey && !event.metaKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "REDO" : "UNDO";
  if (key === "y") return "REDO";
  if (key === "b") return "BOLD";
  if (key === "i") return "ITALIC";
  if (key === "u") return "UNDERLINE";
  return null;
}
