"use client";

import React, { ReactNode, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Redo2, RotateCcw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { clampPageIndex, clampZoom, EditorElementStyle, EditorLayout, editorKeyboardIntent, editorMatches, fitWidthZoom } from "./model";
import { createEditorState, editorReducer } from "./reducer";

export interface SharedEditorProps {
  baseline: EditorLayout;
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

export function SharedEditor({ baseline, renderPageVisual, onCompile, compiling = false, compileLabel = "Compile", showPageSidebar = false, onDirtyChange }: SharedEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, baseline, createEditorState);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(baseline.pages[0]?.elements[0]?.id ?? null);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string }>();
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
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
  const selected = page?.elements.find((element) => element.id === selectedId) ?? null;
  const matches = useMemo(() => editorMatches(state.layout, query), [state.layout, query]);
  const dirty = state.dirtyKeys.size > 0;

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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelectedId(null); return; }
      const intent = editorKeyboardIntent(event);
      if (intent === "UNDO" || intent === "REDO") { event.preventDefault(); dispatch({ type: intent }); }
      else if (selected && intent) {
        event.preventDefault();
        const field = intent === "BOLD" ? "bold" : intent === "ITALIC" ? "italic" : "underline";
        dispatch({ type: "EDIT_STYLE", pageIndex, elementId: selected.id, patch: { [field]: !selected.style?.[field] }, range: selection });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageIndex, selected, selection]);

  const changePage = (index: number) => {
    const next = clampPageIndex(index, state.layout.pages.length);
    setPageIndex(next);
    setSelectedId(state.layout.pages[next]?.elements[0]?.id ?? null);
    setSelection(undefined);
  };
  const goMatch = (delta: number) => {
    if (!matches.length) return;
    const next = (matchIndex + delta + matches.length) % matches.length;
    const match = matches[next];
    const element = state.layout.pages[match.pageIndex]?.elements.find((candidate) => candidate.id === match.elementId);
    setMatchIndex(next); setPageIndex(match.pageIndex); setSelectedId(match.elementId); setSelection({ start: match.start, end: match.end, text: element?.text.slice(match.start, match.end) ?? "" });
  };
  const changeQuery = (value: string) => {
    setQuery(value); setMatchIndex(0);
    const first = editorMatches(state.layout, value)[0];
    if (!first) return;
    const element = state.layout.pages[first.pageIndex]?.elements.find((candidate) => candidate.id === first.elementId);
    setPageIndex(first.pageIndex); setSelectedId(first.elementId); setSelection({ start: first.start, end: first.end, text: element?.text.slice(first.start, first.end) ?? "" });
  };
  const editStyle = (patch: Partial<EditorElementStyle>) => selected && dispatch({ type: "EDIT_STYLE", pageIndex, elementId: selected.id, patch, range: selected.text === (selected.original_text ?? selected.text) ? selection : undefined });

  return <div className={`grid min-h-0 flex-1 gap-4 overflow-hidden ${showPageSidebar ? "lg:grid-cols-[180px_minmax(0,1fr)_270px]" : "lg:grid-cols-[minmax(0,1fr)_270px]"}`} data-testid="shared-editor-v2">
    {showPageSidebar && <aside className="min-h-0 overflow-y-auto rounded-xl border border-current/15 p-3">
      <h2 className="mb-3 text-xs font-semibold">Pages</h2>
      {state.layout.pages.map((candidate, index) => <button type="button" key={candidate.page_num} onClick={() => changePage(index)} className={`mb-2 w-full rounded border p-2 text-left text-xs ${index === pageIndex ? "border-violet-500 bg-violet-500/15" : "border-current/15"}`}>Page {candidate.page_num}<span className="block opacity-60">{candidate.elements.length} elements</span></button>)}
    </aside>}
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-current/15">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-current/15 p-2 text-xs">
        <div className="flex items-center gap-2"><button aria-label="Undo" disabled={!state.undo.length} onClick={() => dispatch({ type: "UNDO" })}><Undo2 size={16}/></button><button aria-label="Redo" disabled={!state.redo.length} onClick={() => dispatch({ type: "REDO" })}><Redo2 size={16}/></button><button aria-label="Reset editor" disabled={!dirty} onClick={() => dispatch({ type: "RESET" })}><RotateCcw size={16}/></button></div>
        <div className="flex items-center gap-2"><button aria-label="Zoom out" onClick={() => setZoom((value) => clampZoom(value - .25))}><ZoomOut size={16}/></button><select aria-label="Zoom percentage" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{presets.map((value) => <option value={value} key={value}>{Math.round(value * 100)}%</option>)}</select><button aria-label="Zoom in" onClick={() => setZoom((value) => clampZoom(value + .25))}><ZoomIn size={16}/></button><button aria-label="Fit width" onClick={() => setZoom(fitWidthZoom(viewportRef.current?.clientWidth ?? 0, page?.width ?? 0))}><Maximize2 size={16}/></button></div>
        <div className="flex items-center gap-2"><button aria-label="Previous page" disabled={pageIndex === 0} onClick={() => changePage(pageIndex - 1)}><ChevronLeft size={16}/></button><span>Page {pageIndex + 1} of {state.layout.pages.length}</span><button aria-label="Next page" disabled={pageIndex >= state.layout.pages.length - 1} onClick={() => changePage(pageIndex + 1)}><ChevronRight size={16}/></button></div>
      </div>
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto p-6">
        {page && <div className="relative mx-auto overflow-hidden bg-white shadow-2xl" style={{ width: page.width * zoom, height: page.height * zoom }}>
          <div className="absolute inset-0">{renderPageVisual(pageIndex, visualContext)}</div>
          <div className="absolute inset-0">{page.elements.map((element) => {
            const currentMatch = matches[matchIndex]?.elementId === element.id && matches[matchIndex]?.pageIndex === pageIndex;
            return <textarea key={element.id} aria-label={`Edit text ${element.text}`} value={element.text}
              onFocus={() => { setSelectedId(element.id); setSelection(undefined); }}
              onChange={(event) => dispatch({ type: "EDIT_TEXT", pageIndex, elementId: element.id, text: event.target.value })}
              onSelect={(event) => { const input = event.currentTarget; const start = input.selectionStart ?? 0; const end = input.selectionEnd ?? 0; setSelection(end > start ? { start, end, text: input.value.slice(start, end) } : undefined); }}
              className={`absolute resize-none overflow-hidden border-2 px-0 outline-none ${selectedId === element.id ? "border-violet-600 bg-white/90" : currentMatch ? "border-amber-500 bg-amber-200/30" : "border-transparent bg-transparent hover:border-violet-300"}`}
              style={{ left: element.x * zoom, top: element.y * zoom, width: Math.max(2, element.width * zoom), height: Math.max(2, element.height * zoom), fontSize: (element.style?.fontSize ?? element.size) * zoom, fontFamily: element.style?.fontFamily === "original" ? element.font : element.style?.fontFamily ?? element.font, fontWeight: element.style?.bold ? "bold" : "normal", fontStyle: element.style?.italic ? "italic" : "normal", color: selectedId === element.id ? element.style?.color ?? element.text_color ?? "#000" : "transparent", backgroundColor: element.style?.background ?? "transparent", textDecoration: [element.style?.underline && "underline", element.style?.strikethrough && "line-through"].filter(Boolean).join(" ") }}/>
          })}</div>
        </div>}
      </div>
    </section>
    <aside className="min-h-0 overflow-y-auto rounded-xl border border-current/15 p-3 text-xs">
      <label>Search<input data-testid="editor-v2-search" value={query} onChange={(event) => changeQuery(event.target.value)} className="mt-1 w-full rounded border border-current/20 bg-transparent p-2"/></label>
      <div className="my-2" data-testid="editor-v2-search-count">{matches.length} matches{matches.length ? ` · ${matchIndex + 1} of ${matches.length}` : ""}</div>
      <div className="mb-4 flex gap-2"><button disabled={!matches.length} onClick={() => goMatch(-1)}>Previous match</button><button disabled={!matches.length} onClick={() => goMatch(1)}>Next match</button></div>
      {selected && <><label>Text<textarea value={selected.text} onChange={(event) => dispatch({ type: "EDIT_TEXT", pageIndex, elementId: selected.id, text: event.target.value })} rows={4} className="mt-1 w-full rounded border border-current/20 bg-transparent p-2"/></label>
        <div className="mt-3 grid grid-cols-2 gap-2"><select aria-label="Font family" value={selected.style?.fontFamily ?? "original"} onChange={(event) => editStyle({ fontFamily: event.target.value as EditorElementStyle["fontFamily"] })}><option value="original">Original</option><option value="helv">Helvetica</option><option value="tiro">Times</option><option value="cour">Courier</option></select><input aria-label="Font size" type="number" min={6} max={72} value={selected.style?.fontSize ?? selected.size} onChange={(event) => editStyle({ fontSize: Math.min(72, Math.max(6, Number(event.target.value))) })}/><button onClick={() => editStyle({ bold: !selected.style?.bold })}>Bold</button><button onClick={() => editStyle({ italic: !selected.style?.italic })}>Italic</button><button onClick={() => editStyle({ underline: !selected.style?.underline })}>Underline</button><button onClick={() => editStyle({ strikethrough: !selected.style?.strikethrough })}>Strikeout</button><label>Text color<input type="color" value={selected.style?.color ?? selected.text_color ?? "#000000"} onChange={(event) => editStyle({ color: event.target.value })}/></label><label>Highlight<input type="color" value={selected.style?.background ?? "#fef08a"} onChange={(event) => editStyle({ background: event.target.value })}/></label></div></>}
      <button type="button" disabled={!dirty || compiling} onClick={() => void onCompile(state.layout)} className="mt-5 w-full rounded bg-violet-600 px-3 py-2 font-semibold text-white disabled:opacity-40">{compiling ? "Compiling…" : compileLabel}</button>
    </aside>
  </div>;
}
