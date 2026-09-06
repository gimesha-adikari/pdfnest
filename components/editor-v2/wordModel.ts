/**
 * Word-level editing model for the shared Editor V2 core.
 *
 * Anchored to the IMMUTABLE BASELINE:
 * - Baseline element text + baseline word IDs + baseline word spans + word replacements
 * - Derived current element draft generated deterministically
 * - Repeated words remain stable via unique word IDs and sequential baseline offsets
 * - Words remain a frontend view model; the owning element remains the durable compile unit.
 */

import type { CSSProperties } from "react";
import type { EditorElement, EditorWordGeometry } from "./model";

// ---------------------------------------------------------------------------
// Baseline Word Span — computed once from immutable baseline text
// ---------------------------------------------------------------------------

export interface BaselineWordSpan {
  wordId: string;
  originalText: string;
  start: number;
  end: number;
}

/**
 * Compute immutable character spans for each word from the baseline text.
 * Walks left-to-right using an advancing cursor so repeated words
 * (e.g. "the ... the") cleanly receive distinct, sequential spans.
 */
export function computeBaselineWordSpans(
  baselineText: string,
  words: EditorWordGeometry[],
): Map<string, BaselineWordSpan> {
  const spans = new Map<string, BaselineWordSpan>();
  let cursor = 0;

  for (const word of words) {
    const wordText = word.text;
    if (!wordText) {
      spans.set(word.id, { wordId: word.id, originalText: "", start: -1, end: -1 });
      continue;
    }

    const index = baselineText.indexOf(wordText, cursor);
    if (index >= 0) {
      spans.set(word.id, {
        wordId: word.id,
        originalText: wordText,
        start: index,
        end: index + wordText.length,
      });
      cursor = index + wordText.length;
    } else {
      // Case-insensitive fallback from cursor
      const lowerText = baselineText.toLowerCase();
      const lowerWord = wordText.toLowerCase();
      const fallbackIndex = lowerText.indexOf(lowerWord, cursor);
      if (fallbackIndex >= 0) {
        spans.set(word.id, {
          wordId: word.id,
          originalText: wordText,
          start: fallbackIndex,
          end: fallbackIndex + wordText.length,
        });
        cursor = fallbackIndex + wordText.length;
      } else {
        spans.set(word.id, { wordId: word.id, originalText: wordText, start: -1, end: -1 });
      }
    }
  }

  return spans;
}

// ---------------------------------------------------------------------------
// Draft Reconstruction from Baseline Spans + Word Replacements
// ---------------------------------------------------------------------------

export interface ReconstructedDraftResult {
  text: string;
  wordOffsets: Map<string, { start: number; end: number }>;
}

/**
 * Reconstruct the element draft text deterministically from:
 * baselineText + baseline words + baseline spans + word replacements.
 *
 * Never searches the mutated draft string!
 * Copies all non-word characters (spaces, punctuation, symbols) verbatim
 * from the baseline, and splices in word replacements at their exact positions.
 * Records exact start and end offsets in the reconstructed text for every word.
 */
export function reconstructDraftFromReplacements(
  baselineText: string,
  words: EditorWordGeometry[],
  spans: Map<string, BaselineWordSpan>,
  replacements: Record<string, string>,
): ReconstructedDraftResult {
  // Sort words by baseline start offset
  const sortedWords = [...words]
    .filter((w) => {
      const s = spans.get(w.id);
      return s && s.start >= 0;
    })
    .sort((a, b) => {
      const sa = spans.get(a.id)!;
      const sb = spans.get(b.id)!;
      return sa.start - sb.start;
    });

  let reconstructed = "";
  let baselineCursor = 0;
  const wordOffsets = new Map<string, { start: number; end: number }>();

  for (const word of sortedWords) {
    const span = spans.get(word.id)!;

    // Copy intermediate text (whitespace, punctuation) between previous word and this word
    if (span.start > baselineCursor) {
      reconstructed += baselineText.slice(baselineCursor, span.start);
    }

    const hasReplacement = Object.prototype.hasOwnProperty.call(replacements, word.id);
    const draftText = hasReplacement ? replacements[word.id] : word.text;

    if (draftText === "") {
      // Empty word (deleted): omit word text
      // Consume one trailing space from baseline if present to avoid orphan double space
      if (span.end < baselineText.length && /\s/.test(baselineText[span.end])) {
        baselineCursor = span.end + 1;
      } else if (span.start > 0 && reconstructed.endsWith(" ")) {
        // Or strip one preceding space
        reconstructed = reconstructed.slice(0, -1);
        baselineCursor = span.end;
      } else {
        baselineCursor = span.end;
      }
      wordOffsets.set(word.id, { start: -1, end: -1 });
    } else {
      const start = reconstructed.length;
      reconstructed += draftText;
      const end = reconstructed.length;
      wordOffsets.set(word.id, { start, end });
      baselineCursor = span.end;
    }
  }

  // Copy any remaining baseline text after the last word
  if (baselineCursor < baselineText.length) {
    reconstructed += baselineText.slice(baselineCursor);
  }

  return { text: reconstructed, wordOffsets };
}

// ---------------------------------------------------------------------------
// EditableWord View Model
// ---------------------------------------------------------------------------

export interface EditableWord {
  /** Canonical word ID from OCR projection. */
  id: string;
  /** Owning element ID (durable compile unit). */
  elementId: string;
  /** Original word text from the baseline. */
  originalText: string;
  /** Current draft text (may differ after edits). */
  draftText: string;
  /** Word geometry in page-point coordinates. */
  rect: { x: number; y: number; width: number; height: number };
  /** 0-based ordering index within the element. */
  order: number;
  /** Character offset of this word's start in the element text. -1 if unmapped/deleted. */
  startOffset: number;
  /** Character offset of this word's end (exclusive) in the element text. -1 if unmapped/deleted. */
  endOffset: number;
  /** True when current draft text differs from baseline word text. */
  isDirty: boolean;
  /** True when word was emptied (deleted). */
  isDeleted: boolean;
  /** Word confidence from OCR, if available. */
  confidence?: number;
}

/** Check if a word has uncommitted or committed changes relative to baseline. */
export function isWordDirty(word: EditableWord): boolean {
  return word.isDirty;
}

/** Get the current draft text for a word. */
export function getWordDraft(word: EditableWord): string {
  return word.draftText;
}

/** Get a word's replacement text from the replacement map if present. */
export function getWordReplacement(
  replacements: Record<string, string> | undefined,
  wordId: string,
): string | undefined {
  return replacements?.[wordId];
}

/**
 * Derive the EditableWord view models for an element.
 * Anchored to the baseline element and word replacements map.
 */
export function deriveEditableWords(
  element: EditorElement,
  baselineElement?: EditorElement,
  wordReplacements?: Record<string, string>,
): EditableWord[] {
  const words = baselineElement?.word_geometry ?? element.word_geometry;
  if (!words || words.length === 0) return [];

  const baselineText = baselineElement?.original_text ?? baselineElement?.text ?? element.original_text ?? element.text;
  const spans = computeBaselineWordSpans(baselineText, words);
  const replacements = wordReplacements ?? {};

  const { wordOffsets } = reconstructDraftFromReplacements(
    baselineText,
    words,
    spans,
    replacements,
  );

  return words.map((word, index) => {
    const hasReplacement = Object.prototype.hasOwnProperty.call(replacements, word.id);
    const draftText = hasReplacement ? replacements[word.id] : word.text;
    const offsets = wordOffsets.get(word.id) ?? { start: -1, end: -1 };
    const isDirty = hasReplacement && replacements[word.id] !== word.text;
    const isDeleted = isDirty && draftText === "";

    return {
      id: word.id,
      elementId: element.id,
      originalText: word.text,
      draftText,
      rect: { x: word.x, y: word.y, width: word.width, height: word.height },
      order: index,
      startOffset: offsets.start,
      endOffset: offsets.end,
      isDirty,
      isDeleted,
      confidence: element.confidence,
    };
  });
}

// ---------------------------------------------------------------------------
// Backward-compatible single-element helpers
// ---------------------------------------------------------------------------

/**
 * Find word character spans in element text.
 * If baselineText is supplied, uses anchor spans; otherwise falls back to substring matching.
 */
export function findWordOffsets(
  elementText: string,
  words: EditorWordGeometry[],
): Map<string, { start: number; end: number }> {
  const spans = computeBaselineWordSpans(elementText, words);
  const result = new Map<string, { start: number; end: number }>();
  for (const [id, span] of spans) {
    result.set(id, { start: span.start, end: span.end });
  }
  return result;
}

export function replaceWordInElementText(
  elementText: string,
  wordId: string,
  newWordText: string,
  words: EditorWordGeometry[],
): string | null {
  const spans = computeBaselineWordSpans(elementText, words);
  const replacements = { [wordId]: newWordText };
  const { text } = reconstructDraftFromReplacements(elementText, words, spans, replacements);
  return text;
}

export function replaceMultipleWordsInElementText(
  elementText: string,
  wordEdits: Map<string, string>,
  words: EditorWordGeometry[],
): string | null {
  const spans = computeBaselineWordSpans(elementText, words);
  const replacements: Record<string, string> = {};
  for (const [k, v] of wordEdits) {
    replacements[k] = v;
  }
  const { text } = reconstructDraftFromReplacements(elementText, words, spans, replacements);
  return text;
}

export function deleteWordInElementText(
  elementText: string,
  wordId: string,
  words: EditorWordGeometry[],
): string | null {
  const spans = computeBaselineWordSpans(elementText, words);
  const replacements = { [wordId]: "" };
  const { text } = reconstructDraftFromReplacements(elementText, words, spans, replacements);
  return text;
}

// ---------------------------------------------------------------------------
// Typography & Positioning Helpers (One Coordinate Plane)
// ---------------------------------------------------------------------------

/**
 * Map PDF/OCR font names to real standard CSS font families.
 * Ensures Tiro/Times, Helv/Helvetica, Cour/Courier render as intended.
 */
export function editorFontToCss(font?: string): string {
  switch (font?.toLowerCase()) {
    case "tiro":
    case "times":
      return "'Times New Roman', Times, serif";
    case "helv":
    case "helvetica":
      return "Helvetica, Arial, sans-serif";
    case "cour":
    case "courier":
      return "'Courier New', Courier, monospace";
    default:
      return font || "inherit";
  }
}

export interface WordVisualRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Common geometry calculator. Guarantees word hitboxes, masks,
 * static dirty replacement text, and active word editor share
 * the exact same coordinate plane.
 */
export function getWordVisualRect(
  rect: { x: number; y: number; width: number; height: number },
  zoom: number,
  widthOverride?: number,
): WordVisualRect {
  return {
    left: rect.x * zoom,
    top: rect.y * zoom,
    width: widthOverride !== undefined ? widthOverride : Math.max(2, rect.width * zoom),
    height: Math.max(2, rect.height * zoom),
  };
}

/**
 * Shared typography styling helper.
 * Both WordReplacementText and WordInlineEditor consume this exact style
 * so text does not jump when selected or deselected.
 */
export function getWordTypographyStyles(
  element: EditorElement,
  zoom: number,
  textColorOverride?: string,
): CSSProperties {
  const fontSize = (element.style?.fontSize ?? element.size) * zoom;
  const rawFont = element.style?.fontFamily === "original"
    ? element.font
    : (element.style?.fontFamily ?? element.font);
  const fontFamily = editorFontToCss(rawFont);

  return {
    fontFamily,
    fontSize: `${fontSize}px`,
    fontWeight: element.style?.bold ? "bold" : "normal",
    fontStyle: element.style?.italic ? "italic" : "normal",
    color: textColorOverride ?? element.style?.color ?? element.text_color ?? "#000000",
    textDecoration: [
      element.style?.underline && "underline",
      element.style?.strikethrough && "line-through",
    ].filter(Boolean).join(" ") || "none",
    lineHeight: 1,
    letterSpacing: "normal",
  };
}

// ---------------------------------------------------------------------------
// Text Measurement & Width Overflow Policy
// ---------------------------------------------------------------------------

let measureCanvasContext: CanvasRenderingContext2D | null = null;

export function measureTextWidth(
  text: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: string = "normal",
  fontStyle: string = "normal",
): number {
  if (typeof document === "undefined") {
    // Fallback in non-DOM test environments
    return text.length * fontSizePx * 0.55;
  }
  if (!measureCanvasContext) {
    const canvas = document.createElement("canvas");
    measureCanvasContext = canvas.getContext("2d");
  }
  if (measureCanvasContext) {
    measureCanvasContext.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;
    return measureCanvasContext.measureText(text).width;
  }
  return text.length * fontSizePx * 0.55;
}

export type WordWidthClassification = "fits" | "bounded-expand" | "overflow";
const BOUNDED_EXPAND_RATIO = 1.5;

export function classifyWordWidth(
  originalWidth: number,
  replacementText: string,
  originalText: string,
): WordWidthClassification {
  if (!originalText || !replacementText) return "fits";
  const charRatio = replacementText.length / Math.max(1, originalText.length);
  const estimatedWidth = originalWidth * charRatio;
  if (estimatedWidth <= originalWidth * 1.05) return "fits";
  if (estimatedWidth <= originalWidth * BOUNDED_EXPAND_RATIO) return "bounded-expand";
  return "overflow";
}

export function wordEditorWidth(
  originalWidth: number,
  replacementText: string,
  originalText: string,
  zoom: number,
  fontFamily?: string,
  fontSizePx?: number,
  fontWeight?: string,
  fontStyle?: string,
): number {
  const base = Math.max(2, originalWidth * zoom);
  if (!replacementText || replacementText === originalText) return base;

  let measured: number;
  if (fontFamily && fontSizePx) {
    measured = measureTextWidth(replacementText, fontFamily, fontSizePx, fontWeight, fontStyle);
  } else {
    const charRatio = replacementText.length / Math.max(1, originalText.length);
    measured = base * charRatio;
  }

  if (measured <= base) return base;
  const maxAllowed = base * BOUNDED_EXPAND_RATIO;
  return Math.min(measured + 4, maxAllowed);
}
