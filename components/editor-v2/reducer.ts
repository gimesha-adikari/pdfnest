import { EditorElement, EditorElementStyle, EditorLayout } from "./model";
import { computeBaselineWordSpans, reconstructDraftFromReplacements } from "./wordModel";

export const EDITOR_HISTORY_LIMIT = 100;

interface TextRange { start: number; end: number; text: string; }
interface ElementDraft {
  text: string;
  style?: EditorElementStyle;
  range?: TextRange;
  wordReplacements?: Record<string, string>;
}
interface ElementPatch { pageIndex: number; elementId: string; before: ElementDraft; after: ElementDraft; }
export type EditorOperation = { kind: "edit"; patch: ElementPatch } | { kind: "reset"; patches: ElementPatch[] };

export interface EditorState {
  baseline: EditorLayout;
  layout: EditorLayout;
  undo: EditorOperation[];
  redo: EditorOperation[];
  revision: number;
  dirtyKeys: Set<string>;
  wordReplacements: Record<string, Record<string, string>>;
  /** Current inline word drafts are canonical for compile, but commit as one undo operation on blur/Enter. */
  pendingWordEdits: Record<string, ElementDraft>;
}

export type EditorAction =
  | { type: "EDIT_TEXT"; pageIndex: number; elementId: string; text: string }
  | { type: "EDIT_WORD_DRAFT"; pageIndex: number; elementId: string; wordId: string; text: string }
  | { type: "EDIT_WORD"; pageIndex: number; elementId: string; wordId: string; text: string }
  | { type: "CANCEL_WORD"; pageIndex: number; elementId: string }
  | { type: "EDIT_STYLE"; pageIndex: number; elementId: string; patch: Partial<EditorElementStyle>; range?: TextRange }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" };

const cloneLayout = (layout: EditorLayout): EditorLayout => structuredClone(layout);
const keyFor = (pageIndex: number, elementId: string) => `${pageIndex}:${elementId}`;

const draftOf = (element: EditorElement, wordReplacements?: Record<string, string>): ElementDraft => ({
  text: element.text,
  style: structuredClone(element.style),
  range: element.selection_start === undefined ? undefined : { start: element.selection_start, end: element.selection_end ?? element.selection_start, text: element.target_substring ?? "" },
  wordReplacements: wordReplacements && Object.keys(wordReplacements).length > 0 ? { ...wordReplacements } : undefined,
});

const sameDraft = (a?: ElementDraft, b?: ElementDraft) => Boolean(
  a && b &&
  a.text === b.text &&
  JSON.stringify(a.style ?? null) === JSON.stringify(b.style ?? null) &&
  JSON.stringify(a.range ?? null) === JSON.stringify(b.range ?? null) &&
  JSON.stringify(a.wordReplacements ?? null) === JSON.stringify(b.wordReplacements ?? null),
);

export function createEditorState(baseline: EditorLayout): EditorState {
  return {
    baseline: cloneLayout(baseline),
    layout: cloneLayout(baseline),
    undo: [],
    redo: [],
    revision: 0,
    dirtyKeys: new Set(),
    wordReplacements: {},
    pendingWordEdits: {},
  };
}

function findElement(layout: EditorLayout, pageIndex: number, elementId: string) {
  return layout.pages[pageIndex]?.elements.find((element) => element.id === elementId);
}

function applyElementPatch(layout: EditorLayout, patch: ElementPatch, forward: boolean): EditorLayout {
  const page = layout.pages[patch.pageIndex];
  const index = page?.elements.findIndex((element) => element.id === patch.elementId) ?? -1;
  if (!page || index < 0) return layout;
  const draft = forward ? patch.after : patch.before;
  const next = { ...layout, pages: [...layout.pages] };
  const nextPage = { ...page, elements: [...page.elements] };
  const element = { ...nextPage.elements[index], text: draft.text, style: structuredClone(draft.style) };
  element.selection_start = draft.range?.start;
  element.selection_end = draft.range?.end;
  element.target_substring = draft.range?.text;
  nextPage.elements[index] = element;
  next.pages[patch.pageIndex] = nextPage;
  return next;
}

function applyOperation(layout: EditorLayout, operation: EditorOperation, forward: boolean) {
  const patches = operation.kind === "edit" ? [operation.patch] : operation.patches;
  return patches.reduce((next, patch) => applyElementPatch(next, patch, forward), layout);
}

function bounded(items: EditorOperation[], operation: EditorOperation): EditorOperation[] {
  const next = [...items, operation];
  return next.length > EDITOR_HISTORY_LIMIT ? next.slice(-EDITOR_HISTORY_LIMIT) : next;
}

function dirtyAfter(state: EditorState, layout: EditorLayout, operation: EditorOperation): Set<string> {
  const patches = operation.kind === "edit" ? [operation.patch] : operation.patches;
  const dirty = new Set(state.dirtyKeys);
  for (const patch of patches) {
    const current = findElement(layout, patch.pageIndex, patch.elementId);
    const baseline = findElement(state.baseline, patch.pageIndex, patch.elementId);
    if (current && baseline && sameDraft(draftOf(current), draftOf(baseline))) dirty.delete(keyFor(patch.pageIndex, patch.elementId));
    else dirty.add(keyFor(patch.pageIndex, patch.elementId));
  }
  return dirty;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "UNDO") {
    const operation = state.undo.at(-1);
    if (!operation) return state;
    const layout = applyOperation(state.layout, operation, false);

    const nextWordReplacements = { ...state.wordReplacements };
    const patches = operation.kind === "edit" ? [operation.patch] : operation.patches;
    for (const patch of patches) {
      const key = keyFor(patch.pageIndex, patch.elementId);
      if (patch.before.wordReplacements && Object.keys(patch.before.wordReplacements).length > 0) {
        nextWordReplacements[key] = { ...patch.before.wordReplacements };
      } else {
        delete nextWordReplacements[key];
      }
    }

    return {
      ...state,
      layout,
      undo: state.undo.slice(0, -1),
      redo: [operation, ...state.redo],
      revision: state.revision + 1,
      dirtyKeys: dirtyAfter(state, layout, operation),
      wordReplacements: nextWordReplacements,
    };
  }

  if (action.type === "REDO") {
    const operation = state.redo[0];
    if (!operation) return state;
    const layout = applyOperation(state.layout, operation, true);

    const nextWordReplacements = { ...state.wordReplacements };
    const patches = operation.kind === "edit" ? [operation.patch] : operation.patches;
    for (const patch of patches) {
      const key = keyFor(patch.pageIndex, patch.elementId);
      if (patch.after.wordReplacements && Object.keys(patch.after.wordReplacements).length > 0) {
        nextWordReplacements[key] = { ...patch.after.wordReplacements };
      } else {
        delete nextWordReplacements[key];
      }
    }

    return {
      ...state,
      layout,
      undo: bounded(state.undo, operation),
      redo: state.redo.slice(1),
      revision: state.revision + 1,
      dirtyKeys: dirtyAfter(state, layout, operation),
      wordReplacements: nextWordReplacements,
    };
  }

  if (action.type === "RESET") {
    if (!state.dirtyKeys.size) return state;
    const patches: ElementPatch[] = [];
    for (const key of state.dirtyKeys) {
      const separator = key.indexOf(":");
      const pageIndex = Number(key.slice(0, separator));
      const elementId = key.slice(separator + 1);
      const current = findElement(state.layout, pageIndex, elementId);
      const baseline = findElement(state.baseline, pageIndex, elementId);
      if (current && baseline) {
        patches.push({
          pageIndex,
          elementId,
          before: draftOf(current, state.wordReplacements[key]),
          after: draftOf(baseline),
        });
      }
    }
    const operation: EditorOperation = { kind: "reset", patches };
    const layout = applyOperation(state.layout, operation, true);
    return {
      ...state,
      layout,
      undo: bounded(state.undo, operation),
      redo: [],
      revision: state.revision + 1,
      dirtyKeys: new Set(),
      wordReplacements: {},
      pendingWordEdits: {},
    };
  }

  const currentElement = findElement(state.layout, action.pageIndex, action.elementId);
  if (!currentElement) return state;

  const key = keyFor(action.pageIndex, action.elementId);

  if (action.type === "CANCEL_WORD") {
    const pending = state.pendingWordEdits[key];
    if (!pending) return state;

    const current = draftOf(currentElement, state.wordReplacements[key]);
    const patch: ElementPatch = {
      pageIndex: action.pageIndex,
      elementId: action.elementId,
      before: current,
      after: pending,
    };
    const layout = applyElementPatch(state.layout, patch, true);
    const nextWordReplacements = { ...state.wordReplacements };
    if (pending.wordReplacements && Object.keys(pending.wordReplacements).length > 0) {
      nextWordReplacements[key] = { ...pending.wordReplacements };
    } else {
      delete nextWordReplacements[key];
    }
    const nextPendingWordEdits = { ...state.pendingWordEdits };
    delete nextPendingWordEdits[key];

    return {
      ...state,
      layout,
      revision: state.revision + 1,
      dirtyKeys: dirtyAfter(state, layout, { kind: "edit", patch }),
      wordReplacements: nextWordReplacements,
      pendingWordEdits: nextPendingWordEdits,
    };
  }

  if (action.type === "EDIT_WORD_DRAFT" || action.type === "EDIT_WORD") {
    const baselineElement = findElement(state.baseline, action.pageIndex, action.elementId);
    if (!baselineElement || !baselineElement.word_geometry?.length) return state;

    const prevReplacements = state.wordReplacements[key] ?? {};
    const nextReplacements = { ...prevReplacements };

    const baselineWord = baselineElement.word_geometry.find((w) => w.id === action.wordId);
    if (!baselineWord) return state;

    if (action.text === baselineWord.text) {
      delete nextReplacements[action.wordId];
    } else {
      nextReplacements[action.wordId] = action.text;
    }

    const baselineText = baselineElement.original_text ?? baselineElement.text;
    const spans = computeBaselineWordSpans(baselineText, baselineElement.word_geometry);
    const { text: reconstructedText } = reconstructDraftFromReplacements(
      baselineText,
      baselineElement.word_geometry,
      spans,
      nextReplacements,
    );

    const currentDraft = draftOf(currentElement, prevReplacements);
    const before = state.pendingWordEdits[key] ?? currentDraft;
    const after: ElementDraft = {
      ...currentDraft,
      text: reconstructedText,
      wordReplacements: Object.keys(nextReplacements).length > 0 ? nextReplacements : undefined,
    };

    if (action.type === "EDIT_WORD_DRAFT" && sameDraft(currentDraft, after)) return state;

    if (action.type === "EDIT_WORD" && sameDraft(before, after)) {
      if (state.pendingWordEdits[key]) {
        const nextPendingWordEdits = { ...state.pendingWordEdits };
        delete nextPendingWordEdits[key];
        return { ...state, pendingWordEdits: nextPendingWordEdits };
      }
      return state;
    }

    const operation: EditorOperation = {
      kind: "edit",
      patch: { pageIndex: action.pageIndex, elementId: action.elementId, before, after },
    };
    const layout = applyOperation(state.layout, operation, true);

    const nextWordReplacements = { ...state.wordReplacements };
    if (Object.keys(nextReplacements).length > 0) {
      nextWordReplacements[key] = nextReplacements;
    } else {
      delete nextWordReplacements[key];
    }

    const nextPendingWordEdits = { ...state.pendingWordEdits };
    if (action.type === "EDIT_WORD_DRAFT") {
      nextPendingWordEdits[key] = before;
    } else {
      delete nextPendingWordEdits[key];
    }

    return {
      ...state,
      layout,
      undo: action.type === "EDIT_WORD_DRAFT" ? state.undo : bounded(state.undo, operation),
      redo: action.type === "EDIT_WORD_DRAFT" ? state.redo : [],
      revision: state.revision + 1,
      dirtyKeys: dirtyAfter(state, layout, operation),
      wordReplacements: nextWordReplacements,
      pendingWordEdits: nextPendingWordEdits,
    };
  }

  // Handle EDIT_TEXT or EDIT_STYLE
  const prevReplacements = state.wordReplacements[key];
  const before = draftOf(currentElement, prevReplacements);
  const after: ElementDraft = action.type === "EDIT_TEXT"
    ? { ...before, text: action.text, wordReplacements: undefined }
    : { ...before, style: { ...before.style, ...action.patch }, range: action.range };

  if (sameDraft(before, after)) return state;

  const operation: EditorOperation = {
    kind: "edit",
    patch: { pageIndex: action.pageIndex, elementId: action.elementId, before, after },
  };
  const layout = applyOperation(state.layout, operation, true);

  const nextWordReplacements = { ...state.wordReplacements };
  if (action.type === "EDIT_TEXT") {
    delete nextWordReplacements[key];
  }

  return {
    ...state,
    layout,
    undo: bounded(state.undo, operation),
    redo: [],
    revision: state.revision + 1,
    dirtyKeys: dirtyAfter(state, layout, operation),
    wordReplacements: nextWordReplacements,
    pendingWordEdits: state.pendingWordEdits,
  };
}
