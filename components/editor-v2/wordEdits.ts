import type { EditorLayout } from "./model";
import type { EditorState } from "./reducer";
import { computeBaselineWordSpans, reconstructDraftFromReplacements } from "./wordModel";

export const WORD_EDIT_PROTOCOL = "platen_word_edits.v1" as const;
export const MAX_WORD_EDIT_OPERATIONS = 1000;
export const MAX_WORD_REPLACEMENT_SCALARS = 4096;

export interface WordEditOperation {
  page_num: number;
  element_id: string;
  word_id: string;
  expected_original_text: string;
  replacement_text: string;
  style_override: null;
  fit_policy: "preserve_neighbors";
}

export interface WordEditRequest {
  edit_protocol: typeof WORD_EDIT_PROTOCOL;
  source_tracker: string;
  extraction_job_id: string;
  baseline_digest: string;
  edits: WordEditOperation[];
}

export interface PreparedWordEditIdentity {
  source: File;
  revision: number;
  requestSignature: string;
}

export function canReusePreparedWordEdit(
  prepared: PreparedWordEditIdentity | null,
  source: File,
  revision: number,
  requestSignature: string,
): boolean {
  return Boolean(prepared && prepared.source === source && prepared.revision === revision && prepared.requestSignature === requestSignature);
}

export function isCurrentWordEditPreparation(
  expected: Pick<PreparedWordEditIdentity, "source" | "revision">,
  current: Pick<PreparedWordEditIdentity, "source" | "revision">,
  operationIsCurrent: boolean,
): boolean {
  return operationIsCurrent && expected.source === current.source && expected.revision === current.revision;
}

export type EditorCompileIntent =
  | { kind: "layout"; layout: EditorLayout }
  | { kind: "word_edits"; request: WordEditRequest }
  | { kind: "error"; code: "MIXED_WORD_AND_LAYOUT_EDITS" | "WORD_EDIT_PROTOCOL_UNAVAILABLE" | "INVALID_WORD_EDIT_STATE"; message: string };

function scalarCount(value: string): number | null {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return null;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return null;
    }
    count += 1;
  }
  return count;
}

function sameStyle(left: unknown, right: unknown): boolean {
  if (!left || typeof left !== "object") return !right || Object.keys(right as object).length === 0;
  if (!right || typeof right !== "object") return Object.keys(left as object).length === 0;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
}

function parseElementKey(key: string): { pageIndex: number; elementId: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const pageIndex = Number(key.slice(0, separator));
  const elementId = key.slice(separator + 1);
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || !elementId) return null;
  return { pageIndex, elementId };
}

function isOnlyWordDraft(state: EditorState, key: string, replacements: Record<string, string>): boolean {
  const parsed = parseElementKey(key);
  if (!parsed) return false;
  const baselinePage = state.baseline.pages[parsed.pageIndex];
  const currentPage = state.layout.pages[parsed.pageIndex];
  const baselineMatches = baselinePage?.elements.filter((element) => element.id === parsed.elementId) ?? [];
  const currentMatches = currentPage?.elements.filter((element) => element.id === parsed.elementId) ?? [];
  if (baselineMatches.length !== 1 || currentMatches.length !== 1) return false;
  const baselineElement = baselineMatches[0];
  const currentElement = currentMatches[0];
  if (!sameStyle(baselineElement.style, currentElement.style)) return false;
  if (baselineElement.selection_start !== currentElement.selection_start ||
      baselineElement.selection_end !== currentElement.selection_end ||
      baselineElement.target_substring !== currentElement.target_substring) return false;
  if (!baselineElement.word_geometry?.length) return false;
  // The reducer and serializer use the same immutable baseline span algorithm.
  // Recompute from baseline data, never from the modified line text.
  const wordIds = new Set(baselineElement.word_geometry.map((word) => word.id));
  if (wordIds.size !== baselineElement.word_geometry.length) return false;
  const baselineText = baselineElement.original_text ?? baselineElement.text;
  const reconstructed = reconstructDraftFromReplacements(
    baselineText,
    baselineElement.word_geometry,
    computeBaselineWordSpans(baselineText, baselineElement.word_geometry),
    replacements,
  );
  return reconstructed.text === currentElement.text;
}

function fail(code: Extract<EditorCompileIntent, { kind: "error" }>['code'], message: string): EditorCompileIntent {
  return { kind: "error", code, message };
}

export function resolveEditorCompileIntent(state: EditorState, sourceTracker: string): EditorCompileIntent {
  const activeEntries = Object.entries(state.wordReplacements)
    .filter(([, replacements]) => Object.keys(replacements).length > 0);
  if (activeEntries.length === 0) return { kind: "layout", layout: state.layout };

  const baseline = state.baseline;
  if (!baseline.word_edit_protocols?.includes(WORD_EDIT_PROTOCOL) ||
      !baseline.word_edit_baseline ||
      !/^sha256:[0-9a-f]{64}$/.test(baseline.word_edit_baseline.digest) ||
      !baseline.word_edit_baseline.extraction_job_id ||
      !sourceTracker) {
    return fail("WORD_EDIT_PROTOCOL_UNAVAILABLE", "This extraction does not have a valid word-edit baseline. Re-extract the PDF before submitting word edits.");
  }

  const operationCount = activeEntries.reduce((sum, [, replacements]) => sum + Object.keys(replacements).length, 0);
  if (operationCount > MAX_WORD_EDIT_OPERATIONS) {
    return fail("INVALID_WORD_EDIT_STATE", "This word-edit request exceeds the supported operation limit.");
  }

  const activeKeys = new Set(activeEntries.map(([key]) => key));
  for (const dirtyKey of state.dirtyKeys) {
    if (!activeKeys.has(dirtyKey)) {
      return fail("MIXED_WORD_AND_LAYOUT_EDITS", "Selected-word edits cannot be submitted with whole-line or style edits. Finish or reset the other edits first.");
    }
  }

  for (const [key, replacements] of activeEntries) {
    if (!isOnlyWordDraft(state, key, replacements)) {
      return fail("MIXED_WORD_AND_LAYOUT_EDITS", "Selected-word edits cannot be submitted with whole-line or style edits. Finish or reset the other edits first.");
    }
  }

  const edits: WordEditOperation[] = [];
  const pageNumbers = new Set<number>();
  const seenTargets = new Set<string>();
  for (let pageIndex = 0; pageIndex < baseline.pages.length; pageIndex += 1) {
    const page = baseline.pages[pageIndex];
    if (!Number.isInteger(page.page_num) || page.page_num < 1 || pageNumbers.has(page.page_num)) {
      return fail("INVALID_WORD_EDIT_STATE", "The extraction baseline has ambiguous page identities. Re-extract the PDF before editing.");
    }
    pageNumbers.add(page.page_num);
    for (const element of page.elements) {
      const key = `${pageIndex}:${element.id}`;
      const replacements = state.wordReplacements[key];
      if (!replacements) continue;
      if (!element.word_geometry?.length) {
        return fail("INVALID_WORD_EDIT_STATE", "A selected word no longer resolves in the extraction baseline.");
      }
      const counts = new Map<string, number>();
      for (const word of element.word_geometry) counts.set(word.id, (counts.get(word.id) ?? 0) + 1);
      for (const word of element.word_geometry) {
        if (!Object.prototype.hasOwnProperty.call(replacements, word.id)) continue;
        const replacementText = replacements[word.id];
        if (replacementText === word.text) continue;
        const replacementLength = scalarCount(replacementText);
        const expectedLength = scalarCount(word.text);
        if (!word.id || word.id.length > 256 || (counts.get(word.id) ?? 0) !== 1 ||
            typeof replacementText !== "string" || replacementLength === null || expectedLength === null ||
            expectedLength === 0 || expectedLength > MAX_WORD_REPLACEMENT_SCALARS ||
            replacementLength > MAX_WORD_REPLACEMENT_SCALARS) {
          return fail("INVALID_WORD_EDIT_STATE", "A selected word contains an invalid identity or unsupported text value.");
        }
        const targetKey = `${page.page_num}\u0000${element.id}\u0000${word.id}`;
        if (seenTargets.has(targetKey)) return fail("INVALID_WORD_EDIT_STATE", "The extraction baseline contains duplicate word identities.");
        seenTargets.add(targetKey);
        edits.push({
          page_num: page.page_num,
          element_id: element.id,
          word_id: word.id,
          expected_original_text: word.text,
          replacement_text: replacementText,
          style_override: null,
          fit_policy: "preserve_neighbors",
        });
      }
      if (Object.keys(replacements).some((wordId) => !element.word_geometry?.some((word) => word.id === wordId))) {
        return fail("INVALID_WORD_EDIT_STATE", "A selected word no longer resolves in the extraction baseline.");
      }
    }
  }

  if (edits.length === 0) return { kind: "layout", layout: state.layout };
  return {
    kind: "word_edits",
    request: {
      edit_protocol: WORD_EDIT_PROTOCOL,
      source_tracker: sourceTracker,
      extraction_job_id: baseline.word_edit_baseline.extraction_job_id,
      baseline_digest: baseline.word_edit_baseline.digest,
      edits,
    },
  };
}
