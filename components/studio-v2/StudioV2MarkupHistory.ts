import { StudioMarkupBox } from "@/lib/studio-v2/api";

export interface StudioV2MarkupHistoryState {
  past: StudioMarkupBox[][];
  present: StudioMarkupBox[];
  future: StudioMarkupBox[][];
}

export function createStudioV2MarkupHistory(boxes: StudioMarkupBox[] = []): StudioV2MarkupHistoryState {
  return { past: [], present: [...boxes], future: [] };
}

export function commitStudioV2MarkupEdit(
  state: StudioV2MarkupHistoryState,
  next: StudioMarkupBox[],
): StudioV2MarkupHistoryState {
  return {
    past: [...state.past, [...state.present]],
    present: [...next],
    future: [],
  };
}

export function undoStudioV2Markup(
  state: StudioV2MarkupHistoryState,
): StudioV2MarkupHistoryState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: [...previous],
    future: [[...state.present], ...state.future],
  };
}

export function redoStudioV2Markup(
  state: StudioV2MarkupHistoryState,
): StudioV2MarkupHistoryState {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    past: [...state.past, [...state.present]],
    present: [...next],
    future: state.future.slice(1),
  };
}

export function markupBoxesEqual(left: StudioMarkupBox[], right: StudioMarkupBox[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((box, index) => JSON.stringify(box) === JSON.stringify(right[index]));
}

export function isMarkupShortcutEditableTarget(tagName?: string, isContentEditable = false): boolean {
  return isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA";
}

export function getMarkupShortcutAction(key: string, shiftKey: boolean): "undo" | "redo" | null {
  const normalized = key.toLowerCase();
  if (normalized === "z" && shiftKey) return "redo";
  if (normalized === "y") return "redo";
  if (normalized === "z") return "undo";
  return null;
}
