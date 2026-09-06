import { EditorElement, EditorElementStyle, EditorLayout } from "./model";

export const EDITOR_HISTORY_LIMIT = 100;

interface TextRange { start: number; end: number; text: string; }
interface ElementDraft { text: string; style?: EditorElementStyle; range?: TextRange; }
interface ElementPatch { pageIndex: number; elementId: string; before: ElementDraft; after: ElementDraft; }
export type EditorOperation = { kind: "edit"; patch: ElementPatch } | { kind: "reset"; patches: ElementPatch[] };
export interface EditorState { baseline: EditorLayout; layout: EditorLayout; undo: EditorOperation[]; redo: EditorOperation[]; revision: number; dirtyKeys: Set<string>; }
export type EditorAction = { type: "EDIT_TEXT"; pageIndex: number; elementId: string; text: string } | { type: "EDIT_STYLE"; pageIndex: number; elementId: string; patch: Partial<EditorElementStyle>; range?: TextRange } | { type: "UNDO" } | { type: "REDO" } | { type: "RESET" };

const cloneLayout = (layout: EditorLayout): EditorLayout => structuredClone(layout);
const keyFor = (pageIndex: number, elementId: string) => `${pageIndex}:${elementId}`;
const draftOf = (element: EditorElement): ElementDraft => ({
  text: element.text,
  style: structuredClone(element.style),
  range: element.selection_start === undefined ? undefined : { start: element.selection_start, end: element.selection_end ?? element.selection_start, text: element.target_substring ?? "" },
});
const sameDraft = (a?: ElementDraft, b?: ElementDraft) => Boolean(a && b && a.text === b.text && JSON.stringify(a.style ?? null) === JSON.stringify(b.style ?? null) && JSON.stringify(a.range ?? null) === JSON.stringify(b.range ?? null));

export function createEditorState(baseline: EditorLayout): EditorState {
  return { baseline: cloneLayout(baseline), layout: cloneLayout(baseline), undo: [], redo: [], revision: 0, dirtyKeys: new Set() };
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
    return { ...state, layout, undo: state.undo.slice(0, -1), redo: [operation, ...state.redo], revision: state.revision + 1, dirtyKeys: dirtyAfter(state, layout, operation) };
  }
  if (action.type === "REDO") {
    const operation = state.redo[0];
    if (!operation) return state;
    const layout = applyOperation(state.layout, operation, true);
    return { ...state, layout, undo: bounded(state.undo, operation), redo: state.redo.slice(1), revision: state.revision + 1, dirtyKeys: dirtyAfter(state, layout, operation) };
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
      if (current && baseline) patches.push({ pageIndex, elementId, before: draftOf(current), after: draftOf(baseline) });
    }
    const operation: EditorOperation = { kind: "reset", patches };
    const layout = applyOperation(state.layout, operation, true);
    return { ...state, layout, undo: bounded(state.undo, operation), redo: [], revision: state.revision + 1, dirtyKeys: new Set() };
  }

  const element = findElement(state.layout, action.pageIndex, action.elementId);
  if (!element) return state;
  const before = draftOf(element);
  const after: ElementDraft = action.type === "EDIT_TEXT"
    ? { ...before, text: action.text }
    : { ...before, style: { ...before.style, ...action.patch }, range: action.range };
  if (sameDraft(before, after)) return state;
  const operation: EditorOperation = { kind: "edit", patch: { pageIndex: action.pageIndex, elementId: action.elementId, before, after } };
  const layout = applyOperation(state.layout, operation, true);
  return { ...state, layout, undo: bounded(state.undo, operation), redo: [], revision: state.revision + 1, dirtyKeys: dirtyAfter(state, layout, operation) };
}
