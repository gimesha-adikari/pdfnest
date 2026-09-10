"use client";

import React, { ReactNode, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Redo2, RotateCcw, Undo2, ZoomIn, ZoomOut, Type, Search } from "lucide-react";
import { clampPageIndex, clampZoom, EditorElement, EditorElementStyle, EditorLayout, editorKeyboardIntent, editorMatches, fitWidthZoom } from "./model";
import { createEditorState, editorReducer } from "./reducer";
import {
  deriveEditableWords,
  type EditableWord,
  getWordTypographyStyles,
  wordEditorWidth,
} from "./wordModel";

export interface SharedEditorProps {
  baseline: EditorLayout;
  initialPageIndex?: number;
  renderPageVisual: (pageIndex: number, context: EditorVisualContext) => ReactNode;
  onCompile: (layout: EditorLayout) => void | Promise<void>;
  compiling?: boolean;
  compileLabel?: string;
  showPageSidebar?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export interface EditorVisualContext {
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  displayedWidthCss: number;
  displayedHeightCss: number;
}

const presets = [.5, .75, 1, 1.25, 1.5, 2];

// ---------------------------------------------------------------------------
// WordBackgroundMask — covers the raster word while dirty or active
// ---------------------------------------------------------------------------

function WordBackgroundMask({ word, zoom }: { word: EditableWord; zoom: number }) {
  // A tiny 0.5pt subpixel expansion cleanly masks raster antialiasing
  const left = (word.rect.x - 0.5) * zoom;
  const top = (word.rect.y - 0.5) * zoom;
  const width = Math.max(1, (word.rect.width + 1) * zoom);
  const height = Math.max(1, (word.rect.height + 1) * zoom);

  return (
    <div
      aria-hidden
      data-testid="word-background-mask"
      className="pointer-events-none absolute"
      style={{
        left,
        top,
        width,
        height,
        backgroundColor: "#ffffff",
        zIndex: 1,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// WordReplacementText — static replacement text for dirty, non-active words
// ---------------------------------------------------------------------------

function WordReplacementText({
  word,
  element,
  zoom,
  isMatch,
  onClick,
}: {
  word: EditableWord;
  element: EditorElement;
  zoom: number;
  isMatch: boolean;
  onClick: () => void;
}) {
  const typography = getWordTypographyStyles(element, zoom);
  const width = Math.max(2, word.rect.width * zoom);
  const height = Math.max(2, word.rect.height * zoom);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="word-replacement-text"
      data-word-id={word.id}
      aria-label={`Edited word ${word.draftText}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className={`absolute flex items-center cursor-pointer ${
        isMatch ? "outline outline-1 outline-amber-500 bg-amber-200/20" : ""
      }`}
      style={{
        left: word.rect.x * zoom,
        top: word.rect.y * zoom,
        minWidth: width,
        height,
        margin: 0,
        padding: 0,
        border: "none",
        boxSizing: "border-box",
        zIndex: 5,
        pointerEvents: "auto",
        userSelect: "none",
        whiteSpace: "nowrap",
        ...typography,
      }}
    >
      {word.draftText}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WordHitTarget — invisible click target for clean words (or deleted words)
// ---------------------------------------------------------------------------

function WordHitTarget({
  word,
  zoom,
  isMatch,
  onClick,
}: {
  word: EditableWord;
  zoom: number;
  isMatch: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={`Edit word ${word.draftText || word.originalText}`}
      data-testid="word-hit-target"
      data-word-id={word.id}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute cursor-pointer border border-transparent ${
        isMatch
          ? "border-amber-500 bg-amber-200/20"
          : "hover:border-dashed hover:border-violet-300"
      }`}
      style={{
        left: word.rect.x * zoom,
        top: word.rect.y * zoom,
        width: Math.max(2, word.rect.width * zoom),
        height: Math.max(2, word.rect.height * zoom),
        zIndex: 5,
        pointerEvents: "auto",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// WordInlineEditor — transient local edit buffer, single commit on blur/Enter
// ---------------------------------------------------------------------------

function WordInlineEditor({
  word,
  element,
  zoom,
  onCommit,
  onCancel,
}: {
  word: EditableWord;
  element: EditorElement;
  zoom: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [buffer, setBuffer] = useState(word.draftText);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const typography = getWordTypographyStyles(element, zoom);
  const width = wordEditorWidth(
    word.rect.width,
    buffer,
    word.originalText,
    zoom,
    typeof typography.fontFamily === "string" ? typography.fontFamily : undefined,
    parseFloat(String(typography.fontSize)),
    String(typography.fontWeight),
    String(typography.fontStyle),
  );

  const handleCommit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(buffer);
  };

  const handleCancel = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      aria-label={`Editing word ${word.originalText}`}
      data-testid="word-inline-editor"
      data-word-id={word.id}
      value={buffer}
      onChange={(e) => setBuffer(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          handleCommit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          handleCancel();
        } else {
          e.stopPropagation();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: word.rect.x * zoom,
        top: word.rect.y * zoom,
        width,
        height: Math.max(2, word.rect.height * zoom),
        margin: 0,
        padding: 0,
        border: "none",
        outline: "2px solid #7c3aed",
        outlineOffset: "1px",
        boxSizing: "border-box",
        background: "#ffffff",
        zIndex: 20,
        pointerEvents: "auto",
        userSelect: "text",
        textOverflow: "ellipsis",
        overflow: "hidden",
        ...typography,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// SharedEditor — main component
// ---------------------------------------------------------------------------

export function SharedEditor({
  baseline,
  initialPageIndex,
  renderPageVisual,
  onCompile,
  compiling = false,
  compileLabel = "Compile",
  showPageSidebar = false,
  onDirtyChange,
}: SharedEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, baseline, createEditorState);
  const resolvedInitialPageIndex = clampPageIndex(initialPageIndex ?? 0, baseline.pages.length);
  const [pageIndex, setPageIndex] = useState(resolvedInitialPageIndex);
  const [selectedId, setSelectedId] = useState<string | null>(baseline.pages[resolvedInitialPageIndex]?.elements[0]?.id ?? null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string }>();
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);

  const devicePixelRatio = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.devicePixelRatio || 1,
    () => 1,
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const page = state.layout.pages[pageIndex];
  const baselinePage = state.baseline.pages[pageIndex];
  const selected = page?.elements.find((element) => element.id === selectedId) ?? null;
  const matches = useMemo(() => editorMatches(state.layout, query), [state.layout, query]);
  const dirty = state.dirtyKeys.size > 0;

  // Derive editable words for the currently selected element
  const selectedWords = useMemo(() => {
    if (!selected || !baselinePage) return [];
    const baselineElement = baselinePage.elements.find((e) => e.id === selected.id);
    const replacements = state.wordReplacements[`${pageIndex}:${selected.id}`];
    return deriveEditableWords(selected, baselineElement, replacements);
  }, [baselinePage, pageIndex, selected, state.wordReplacements]);

  const activeWord = useMemo(
    () => selectedWords.find((w) => w.id === selectedWordId) ?? null,
    [selectedWords, selectedWordId],
  );

  // Search match word IDs
  const matchingWordIds = useMemo(() => {
    const ids = new Set<string>();
    if (!query.trim() || !matches.length) return ids;
    const currentMatch = matches[matchIndex];
    if (!currentMatch) return ids;
    const matchElement = state.layout.pages[currentMatch.pageIndex]?.elements.find(
      (e) => e.id === currentMatch.elementId,
    );
    const matchBaselineElement = state.baseline.pages[currentMatch.pageIndex]?.elements.find(
      (e) => e.id === currentMatch.elementId,
    );
    if (!matchElement?.word_geometry?.length) return ids;
    const replacements = state.wordReplacements[`${currentMatch.pageIndex}:${matchElement.id}`];
    const derived = deriveEditableWords(matchElement, matchBaselineElement, replacements);

    for (const word of derived) {
      if (word.startOffset < 0 || word.isDeleted) continue;
      if (word.startOffset < currentMatch.end && word.endOffset > currentMatch.start) {
        ids.add(word.id);
      }
    }
    return ids;
  }, [matches, matchIndex, query, state.baseline.pages, state.layout.pages, state.wordReplacements]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const updateSize = () => {
      const next = { width: node.clientWidth, height: node.clientHeight };
      setViewportSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    updateSize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateSize);
    observer?.observe(node);
    window.addEventListener("resize", updateSize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", updateSize); };
  }, []);

  const visualContext = useMemo<EditorVisualContext>(() => ({
    zoom,
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    devicePixelRatio,
    displayedWidthCss: (page?.width ?? 0) * zoom,
    displayedHeightCss: (page?.height ?? 0) * zoom,
  }), [devicePixelRatio, page?.height, page?.width, viewportSize.height, viewportSize.width, zoom]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Don't intercept if an input or textarea is actively focused
      const target = event.target as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (event.key === "Escape") {
        if (selectedWordId) {
          setSelectedWordId(null);
        } else {
          setSelectedId(null);
        }
        return;
      }

      if (isInput) return;

      const intent = editorKeyboardIntent(event);
      if (intent === "UNDO" || intent === "REDO") {
        event.preventDefault();
        dispatch({ type: intent });
      } else if (selected && intent) {
        event.preventDefault();
        const field = intent === "BOLD" ? "bold" : intent === "ITALIC" ? "italic" : "underline";
        const wordRange = activeWord && activeWord.startOffset >= 0
          ? { start: activeWord.startOffset, end: activeWord.endOffset, text: activeWord.draftText }
          : selection;
        dispatch({ type: "EDIT_STYLE", pageIndex, elementId: selected.id, patch: { [field]: !selected.style?.[field] }, range: wordRange });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageIndex, selected, selection, selectedWordId, activeWord]);

  const changePage = (index: number) => {
    const next = clampPageIndex(index, state.layout.pages.length);
    setPageIndex(next);
    setSelectedId(state.layout.pages[next]?.elements[0]?.id ?? null);
    setSelectedWordId(null);
    setSelection(undefined);
  };

  const goMatch = (delta: number) => {
    if (!matches.length) return;
    const next = (matchIndex + delta + matches.length) % matches.length;
    const match = matches[next];
    const element = state.layout.pages[match.pageIndex]?.elements.find((candidate) => candidate.id === match.elementId);
    setMatchIndex(next);
    setPageIndex(match.pageIndex);
    setSelectedId(match.elementId);
    setSelectedWordId(null);
    setSelection({ start: match.start, end: match.end, text: element?.text.slice(match.start, match.end) ?? "" });
  };

  const changeQuery = (value: string) => {
    setQuery(value);
    setMatchIndex(0);
    const first = editorMatches(state.layout, value)[0];
    if (!first) return;
    const element = state.layout.pages[first.pageIndex]?.elements.find((candidate) => candidate.id === first.elementId);
    setPageIndex(first.pageIndex);
    setSelectedId(first.elementId);
    setSelectedWordId(null);
    setSelection({ start: first.start, end: first.end, text: element?.text.slice(first.start, first.end) ?? "" });
  };

  const editStyle = (patch: Partial<EditorElementStyle>) => {
    if (!selected) return;
    const wordRange = activeWord && activeWord.startOffset >= 0
      ? { start: activeWord.startOffset, end: activeWord.endOffset, text: activeWord.draftText }
      : (selected.text === (selected.original_text ?? selected.text) ? selection : undefined);
    dispatch({ type: "EDIT_STYLE", pageIndex, elementId: selected.id, patch, range: wordRange });
  };

  const selectWord = useCallback((elementId: string, wordId: string) => {
    setSelectedId(elementId);
    setSelectedWordId(wordId);
    setSelection(undefined);
  }, []);

  const commitWord = useCallback((elementId: string, wordId: string, text: string) => {
    dispatch({ type: "EDIT_WORD", pageIndex, elementId, wordId, text });
  }, [pageIndex]);

  const cancelWord = useCallback(() => {
    setSelectedWordId(null);
  }, []);

  const hasWordGeometry = useCallback((element: EditorElement) => {
    return Boolean(element.word_geometry?.length);
  }, []);

  // Render element overlay — word-level or legacy line-level
  const renderElementOverlay = useCallback((element: EditorElement) => {
    const isSelected = selectedId === element.id;
    const currentMatch = matches[matchIndex]?.elementId === element.id && matches[matchIndex]?.pageIndex === pageIndex;

    if (hasWordGeometry(element)) {
      const baselineEl = baselinePage?.elements.find((e) => e.id === element.id);
      const replacements = state.wordReplacements[`${pageIndex}:${element.id}`];
      const words = deriveEditableWords(element, baselineEl, replacements);

      return (
        <div key={element.id} data-testid="word-overlay-container" data-element-id={element.id}>
          {words.map((word) => {
            const isActive = selectedWordId === word.id;
            const isMatch = matchingWordIds.has(word.id);
            const needsMask = word.isDirty || isActive;

            return (
              <React.Fragment key={word.id}>
                {/* 1. Mask: active word OR any dirty word (even deselected) */}
                {needsMask && <WordBackgroundMask word={word} zoom={zoom} />}

                {/* 2. Active editing: WordInlineEditor */}
                {isActive && (
                  <WordInlineEditor
                    word={word}
                    element={element}
                    zoom={zoom}
                    onCommit={(newText) => commitWord(element.id, word.id, newText)}
                    onCancel={cancelWord}
                  />
                )}

                {/* 3. Dirty, non-active, non-deleted word: persistent static replacement text */}
                {!isActive && word.isDirty && !word.isDeleted && (
                  <WordReplacementText
                    word={word}
                    element={element}
                    zoom={zoom}
                    isMatch={isMatch}
                    onClick={() => selectWord(element.id, word.id)}
                  />
                )}

                {/* 4. Clean word (or deleted word): invisible hit target for clicking */}
                {!isActive && (!word.isDirty || word.isDeleted) && (
                  <WordHitTarget
                    word={word}
                    zoom={zoom}
                    isMatch={isMatch}
                    onClick={() => selectWord(element.id, word.id)}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      );
    }

    // Elements WITHOUT word_geometry → legacy element-level textarea
    return (
      <textarea
        key={element.id}
        aria-label={`Edit text ${element.text}`}
        value={element.text}
        onFocus={() => { setSelectedId(element.id); setSelectedWordId(null); setSelection(undefined); }}
        onChange={(event) => dispatch({ type: "EDIT_TEXT", pageIndex, elementId: element.id, text: event.target.value })}
        onSelect={(event) => { const input = event.currentTarget; const start = input.selectionStart ?? 0; const end = input.selectionEnd ?? 0; setSelection(end > start ? { start, end, text: input.value.slice(start, end) } : undefined); }}
        className={`absolute resize-none overflow-hidden border-2 px-0 outline-none ${isSelected ? "border-violet-600 bg-white/90" : currentMatch ? "border-amber-500 bg-amber-200/30" : "border-transparent bg-transparent hover:border-violet-300"}`}
        style={{
          left: element.x * zoom,
          top: element.y * zoom,
          width: Math.max(2, element.width * zoom),
          height: Math.max(2, element.height * zoom),
          fontSize: (element.style?.fontSize ?? element.size) * zoom,
          fontFamily: element.style?.fontFamily === "original" ? element.font : element.style?.fontFamily ?? element.font,
          fontWeight: element.style?.bold ? "bold" : "normal",
          fontStyle: element.style?.italic ? "italic" : "normal",
          color: isSelected ? element.style?.color ?? element.text_color ?? "#000" : "transparent",
          backgroundColor: element.style?.background ?? "transparent",
          textDecoration: [element.style?.underline && "underline", element.style?.strikethrough && "line-through"].filter(Boolean).join(" "),
        }}
      />
    );
  }, [
    baselinePage,
    cancelWord,
    commitWord,
    hasWordGeometry,
    matchIndex,
    matches,
    matchingWordIds,
    pageIndex,
    selectWord,
    selectedId,
    selectedWordId,
    state.wordReplacements,
    zoom,
  ]);

  const handlePageClick = useCallback(() => {
    if (selectedWordId) setSelectedWordId(null);
  }, [selectedWordId]);

  return (
    <div className={`studio-v2-shared-editor grid min-h-0 flex-1 gap-4 overflow-hidden ${showPageSidebar ? "lg:grid-cols-[180px_minmax(0,1fr)_270px]" : "lg:grid-cols-[minmax(0,1fr)_270px]"}`} data-testid="shared-editor-v2">
      {showPageSidebar && (
        <aside className="studio-v2-editor-page-rail min-h-0 overflow-y-auto rounded-xl border border-current/15 p-3">
          <h2 className="mb-3 text-xs font-semibold">Pages</h2>
          {state.layout.pages.map((candidate, index) => (
            <button
              type="button"
              key={candidate.page_num}
              onClick={() => changePage(index)}
              className={`studio-v2-editor-page-row mb-2 w-full rounded border p-2 text-left text-xs ${index === pageIndex ? "selected border-violet-500 bg-violet-500/15" : "border-current/15"}`}
            >
              <span className="studio-v2-editor-page-number">{String(candidate.page_num).padStart(2, "0")}</span>
              <span className="studio-v2-editor-page-copy">Page {candidate.page_num}<small>{candidate.elements.length} elements{candidate.is_ocr ? " · OCR" : ""}</small></span>
            </button>
          ))}
        </aside>
      )}
      <section className="studio-v2-editor-canvas-column flex min-h-0 flex-col overflow-hidden rounded-xl border border-current/15">
        <div className="studio-v2-editor-toolbar flex flex-wrap items-center justify-between gap-2 border-b border-current/15 p-2 text-xs">
          <div className="flex items-center gap-2">
            <button aria-label="Undo" disabled={!state.undo.length} onClick={() => dispatch({ type: "UNDO" })}><Undo2 size={16}/></button>
            <button aria-label="Redo" disabled={!state.redo.length} onClick={() => dispatch({ type: "REDO" })}><Redo2 size={16}/></button>
            <button aria-label="Reset editor" disabled={!dirty} onClick={() => dispatch({ type: "RESET" })}><RotateCcw size={16}/></button>
          </div>
          <div className="studio-v2-editor-toolbar-group studio-v2-editor-toolbar-context">
            <button type="button" aria-label="Text style" onClick={() => document.querySelector<HTMLElement>('[data-testid="editor-v2-properties"]')?.scrollIntoView({ block: "nearest" })}><Type size={15}/>Text style</button>
            <button type="button" aria-label="Find in editor" onClick={() => searchInputRef.current?.focus()}><Search size={15}/>Find</button>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Zoom out" onClick={() => setZoom((value) => clampZoom(value - .25))}><ZoomOut size={16}/></button>
            <select aria-label="Zoom percentage" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
              {presets.map((value) => <option value={value} key={value}>{Math.round(value * 100)}%</option>)}
            </select>
            <button aria-label="Zoom in" onClick={() => setZoom((value) => clampZoom(value + .25))}><ZoomIn size={16}/></button>
            <button aria-label="Fit width" onClick={() => setZoom(fitWidthZoom(viewportRef.current?.clientWidth ?? 0, page?.width ?? 0))}><Maximize2 size={16}/></button>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Previous page" disabled={pageIndex === 0} onClick={() => changePage(pageIndex - 1)}><ChevronLeft size={16}/></button>
            <span>Page {pageIndex + 1} of {state.layout.pages.length}</span>
            <button aria-label="Next page" disabled={pageIndex >= state.layout.pages.length - 1} onClick={() => changePage(pageIndex + 1)}><ChevronRight size={16}/></button>
          </div>
        </div>
        <div ref={viewportRef} className="studio-v2-editor-canvas-scroll min-h-0 flex-1 overflow-auto p-6">
          {page && (
            <div
              className="studio-v2-editor-page-frame relative mx-auto overflow-hidden bg-white shadow-2xl"
              style={{ width: page.width * zoom, height: page.height * zoom }}
              onClick={handlePageClick}
            >
              <div className="absolute inset-0">{renderPageVisual(pageIndex, visualContext)}</div>
              <div className="absolute inset-0" data-testid="editor-overlay-layer">
                {page.elements.map(renderElementOverlay)}
              </div>
            </div>
          )}
        </div>
      </section>
      <aside className="studio-v2-editor-properties min-h-0 overflow-y-auto rounded-xl border border-current/15 p-3 text-xs" data-testid="editor-v2-properties">
        <div className="studio-v2-editor-properties-heading"><strong>Selection</strong><small>{selected ? "Text object" : "Select text on the page"}</small></div>
        <label>
          Search
          <input
            ref={searchInputRef}
            data-testid="editor-v2-search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            className="mt-1 w-full rounded border border-current/20 bg-transparent p-2"
          />
        </label>
        <div className="my-2" data-testid="editor-v2-search-count">
          {matches.length} matches{matches.length ? ` · ${matchIndex + 1} of ${matches.length}` : ""}
        </div>
        <div className="mb-4 flex gap-2">
          <button disabled={!matches.length} onClick={() => goMatch(-1)}>Previous match</button>
          <button disabled={!matches.length} onClick={() => goMatch(1)}>Next match</button>
        </div>
        {selected && (
          <>
            <label>
              Text
              <textarea
                value={selected.text}
                onChange={(event) => dispatch({ type: "EDIT_TEXT", pageIndex, elementId: selected.id, text: event.target.value })}
                rows={4}
                className="mt-1 w-full rounded border border-current/20 bg-transparent p-2"
              />
            </label>
            {activeWord && (
              <div className="mt-2 rounded border border-violet-500/30 bg-violet-500/10 p-2">
                <span className="font-semibold">Word:</span> <span data-testid="active-word-label">{activeWord.originalText}</span> → <span data-testid="active-word-draft">{activeWord.draftText}</span>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                aria-label="Font family"
                value={selected.style?.fontFamily ?? "original"}
                onChange={(event) => editStyle({ fontFamily: event.target.value as EditorElementStyle["fontFamily"] })}
              >
                <option value="original">Original</option>
                <option value="helv">Helvetica</option>
                <option value="tiro">Times</option>
                <option value="cour">Courier</option>
              </select>
              <input
                aria-label="Font size"
                type="number"
                min={6}
                max={72}
                value={selected.style?.fontSize ?? selected.size}
                onChange={(event) => editStyle({ fontSize: Math.min(72, Math.max(6, Number(event.target.value))) })}
              />
              <button onClick={() => editStyle({ bold: !selected.style?.bold })}>Bold</button>
              <button onClick={() => editStyle({ italic: !selected.style?.italic })}>Italic</button>
              <button onClick={() => editStyle({ underline: !selected.style?.underline })}>Underline</button>
              <button onClick={() => editStyle({ strikethrough: !selected.style?.strikethrough })}>Strikeout</button>
              <label>
                Text color
                <input
                  type="color"
                  value={selected.style?.color ?? selected.text_color ?? "#000000"}
                  onChange={(event) => editStyle({ color: event.target.value })}
                />
              </label>
              <label>
                Highlight
                <input
                  type="color"
                  value={selected.style?.background ?? "#fef08a"}
                  onChange={(event) => editStyle({ background: event.target.value })}
                />
              </label>
            </div>
          </>
        )}
        <button
          type="button"
          disabled={!dirty || compiling}
          onClick={() => void onCompile(state.layout)}
          className="mt-5 w-full rounded bg-violet-600 px-3 py-2 font-semibold text-white disabled:opacity-40"
        >
          {compiling ? "Compiling…" : compileLabel}
        </button>
      </aside>
    </div>
  );
}
