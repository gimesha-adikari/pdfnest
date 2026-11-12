export function wordEditFailureMessage(
  errorCode: string | null | undefined,
  fallback: string | null | undefined
): string {
  const messages: Record<string, string> = {
    BACKGROUND_COLORED_OVERLAP: "This word overlaps a stamp or colored mark. The edit was refused; choose a word on a clear background.",
    BACKGROUND_RULE_OVERLAP: "A table border or drawn line crosses this word. The edit was refused to preserve that line.",
    BACKGROUND_UNCERTAIN: "The paper around this word could not be repaired confidently. No PDF was produced.",
    TARGET_NOT_IMAGE_BACKED: "This word is not on a qualified scanned image. Use whole-line editing or choose a supported word.",
    UNSUPPORTED_PAGE_GEOMETRY: "This page has rotation or cropping that this word-edit workflow does not support.",
    UNSUPPORTED_WORD_GEOMETRY: "The selected word geometry could not be verified against the source page.",
    AMBIGUOUS_TARGET_REPRESENTATION: "This word overlaps multiple page layers. The edit was refused because its visible source is ambiguous.",
    VISIBLE_TEXT_LAYER_CONFLICT: "Visible PDF text overlaps this scanned word. The edit was refused to avoid changing conflicting content.",
    TEXT_LAYER_CONFLICT: "An overlapping text layer does not match the selected OCR word. The edit was refused.",
    HIDDEN_OCR_AMBIGUOUS: "More than one hidden OCR target overlaps this word. The edit was refused.",
    HIDDEN_OCR_ALIGNMENT_UNCERTAIN: "The hidden OCR text does not align closely enough with this word to edit safely.",
    HIDDEN_OCR_NEIGHBOR_OVERLAP: "The hidden OCR target overlaps neighboring text. Re-extract or choose a different word.",
    HIDDEN_OCR_TEXT_MISMATCH: "The hidden text does not exactly match the selected word. Re-extract before editing this PDF.",
    NATIVE_TARGET_NOT_FOUND: "Selectable text for this word could not be matched to the trusted extraction.",
    NATIVE_TARGET_AMBIGUOUS: "More than one selectable word overlaps this selection. Choose a less ambiguous target.",
    NATIVE_SOURCE_TEXT_IDENTITY_MISMATCH: "The PDF text differs from the selected word. Re-extract the document before editing.",
    NATIVE_SOURCE_GLYPHS_UNRESOLVED: "The selected glyphs could not be separated safely from nearby text.",
    NATIVE_SOURCE_TEXT_UNSUPPORTED: "This native text uses a script that this word-edit path has not qualified.",
    NATIVE_GLYPH_CLUSTER_UNSUPPORTED: "This word contains a ligature or combined glyph that cannot yet be edited safely.",
    NATIVE_STYLE_SPANS_UNSUPPORTED: "The selected word uses multiple font styles. This edit was refused to preserve its glyphs.",
    NATIVE_TEXT_RENDERING_UNSUPPORTED: "This text uses a rendering mode or direction that this word-edit path does not support.",
    NATIVE_FONT_UNSUPPORTED: "The original font cannot be reused safely for this replacement.",
    NATIVE_FONT_GLYPH_UNSUPPORTED: "The original font cannot render one or more replacement characters.",
    NATIVE_GLYPH_OVERLAP: "The selected glyphs overlap neighboring text. The edit was refused.",
    NATIVE_REPLACEMENT_COLLISION: "The replacement would collide with nearby text. Shorten it or choose whole-line editing.",
    NATIVE_IMAGE_OVERLAP: "An image overlaps this selectable word. The edit was refused to protect the image.",
    NATIVE_GRAPHICS_OVERLAP: "A line or graphic crosses this selectable word. The edit was refused to preserve it.",
    NATIVE_ANNOTATION_OVERLAP: "A form or annotation overlaps this word. The edit was refused to preserve it.",
    TEXT_READING_ORDER_UNSUPPORTED: "This target cannot be replaced without changing text reading order. Choose a supported word position.",
    REPLACEMENT_RENDER_UNSUPPORTED: "The replacement could not be rendered safely. No PDF was produced.",
    UNSUPPORTED_REPLACEMENT_TEXT: "This replacement uses text outside the currently supported English character set.",
    REPLACEMENT_DOES_NOT_FIT: "The replacement text does not fit in verified free space without moving neighboring content.",
    WORD_EDIT_TARGET_COLLISION: "The requested word edits overlap. Separate the selections and prepare the export again.",
    CANDIDATE_VALIDATION_FAILED: "The compiled PDF did not pass the localized-change checks. No downloadable file is available.",
    SOURCE_BASELINE_MISMATCH: "The source PDF changed after extraction. Reopen the PDF and extract its layout again.",
    WORD_EDIT_BASELINE_MISMATCH: "The selected word no longer matches the trusted extraction. Re-extract the source PDF.",
    WORD_EDIT_COMPILATION_NOT_IMPLEMENTED: "The worker does not have the Phase 3 word compiler. No PDF was produced.",
  };

  return (
    (errorCode && messages[errorCode]) ||
    fallback ||
    "The selected-word edit could not be prepared safely. No downloadable PDF is available."
  );
}
