"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, FileWarning, Loader2, MousePointer2, ScanText } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, TextLayer } from "pdfjs-dist";

import type { OcrMarkupPreview, OcrMarkupPreviewPage } from "@/lib/ocrMarkupPreview";
import { findTextItemMatches, findWordMatches, type MarkupFindMatch } from "@/lib/markupFind";
import {
    MARKUP_COORDINATE_SPACE,
    clientRectsToMarkupSelectionRects,
    normalizeMarkupSelectionText,
    selectedWordElements,
    wordRectsToMarkupSelectionRects,
    type MarkupSelectionGeometry,
} from "@/lib/markupSelection";
import { usePreview } from "@/lib/preview/usePreview";
import type { PreviewError } from "@/lib/preview/types";

export interface MarkupTextSelection {
    text: string;
    page: number;
    source: "native" | "ocr";
    geometry?: MarkupSelectionGeometry;
}

export interface MarkupFindState {
    count: number;
    activeIndex: number;
    current: MarkupTextSelection | null;
}

export interface MarkupPreviewState {
    status: "idle" | "loading" | "ready" | "error";
    page: number;
    pageCount: number;
    pageHasSelectableText: boolean;
    pageHasScannedContent: boolean;
}

type PdfDocumentWithCleanup = PDFDocumentProxy & {
    cleanup?: () => void;
    destroy?: () => Promise<void>;
};

type PdfTextItem = {
    str: string;
    dir: string;
    transform: number[];
    width: number;
    height: number;
    fontName: string;
    hasEOL: boolean;
};

interface MarkupPdfPreviewProps {
    file: File | null;
    ocrPreview?: OcrMarkupPreview | null;
    ocrPreviewStatus?: "idle" | "loading" | "ready" | "error";
    ocrPreviewError?: string | null;
    findQuery?: string;
    activeFindOccurrence?: number;
    onTextSelected?: (selection: MarkupTextSelection) => void;
    onFindStateChange?: (state: MarkupFindState) => void;
    onStateChange?: (state: MarkupPreviewState) => void;
    /** Result previews use the same processed page viewer without selection controls. */
    readOnly?: boolean;
    /** Allows source and result viewers to expose distinct semantic test hooks. */
    testIdPrefix?: string;
}

function previewErrorMessage(error: unknown): string {
    const name = typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name || "")
        : "";
    const message = error instanceof Error ? error.message : String(error || "");
    const normalized = message.toLowerCase();

    if (name === "PasswordException" || normalized.includes("password") || normalized.includes("encrypted")) {
        return "This PDF is password-protected. Unlock it before selecting text.";
    }
    if (name === "InvalidPDFException" || normalized.includes("invalid") || normalized.includes("unexpected response")) {
        return "This PDF could not be read. Choose a valid, uncorrupted PDF.";
    }
    return "We couldn't render the PDF preview. You can try another PDF.";
}

function serverPreviewErrorMessage(error: PreviewError | null): string | null {
    if (!error) return null;
    if (error.status === 401 || error.status === 403) return "This preview is no longer available. Choose the PDF again to continue.";
    if (error.status === 404) return "This preview has expired. Try loading the PDF again.";
    if (error.status === 400) return "This PDF could not be prepared for preview. Choose a valid, uncorrupted PDF.";
    return "We couldn't prepare the page preview. Try again or choose another PDF.";
}

function clearElement(element: HTMLElement | null): void {
    if (element) element.replaceChildren();
}

function hasImageOperators(pdfjsLib: typeof import("pdfjs-dist"), operatorList: { fnArray?: number[] } | null): boolean {
    if (!operatorList?.fnArray) return false;
    const ops = (pdfjsLib as typeof pdfjsLib & { OPS?: Record<string, number> }).OPS || {};
    const imageOps = new Set(Object.entries(ops).filter(([name]) => name.startsWith("paintImage")).map(([, value]) => value));
    return operatorList.fnArray.some((operator) => imageOps.has(operator));
}

export default function MarkupPdfPreview({
    file,
    ocrPreview,
    ocrPreviewStatus = "idle",
    ocrPreviewError = null,
    findQuery = "",
    activeFindOccurrence = 0,
    onTextSelected,
    onFindStateChange,
    onStateChange,
    readOnly = false,
    testIdPrefix = "markup-pdf",
}: MarkupPdfPreviewProps) {
    const [pdfDocument, setPdfDocument] = useState<PdfDocumentWithCleanup | null>(null);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(0);
    const [isLoadingDocument, setIsLoadingDocument] = useState(false);
    const [isRenderingPage, setIsRenderingPage] = useState(false);
    const [pageHasSelectableText, setPageHasSelectableText] = useState(false);
    const [pageHasScannedContent, setPageHasScannedContent] = useState(false);
    const [pageText, setPageText] = useState("");
    const [nativeTextItems, setNativeTextItems] = useState<PdfTextItem[]>([]);
    const [textLayerVersion, setTextLayerVersion] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const pageFrameRef = useRef<HTMLDivElement | null>(null);
    const textLayerRef = useRef<HTMLDivElement | null>(null);
    const ocrLayerRef = useRef<HTMLDivElement | null>(null);
    const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
    const pdfDocumentRef = useRef<PdfDocumentWithCleanup | null>(null);
    const textLayerInstanceRef = useRef<TextLayer | null>(null);
    const nativePageGeometryRef = useRef({ width: 0, height: 0, rotation: 0, cropBox: null as number[] | null });

    const serverPreview = usePreview({
        file,
        page,
        mode: "page",
        renderer: "server",
        scale: 2,
        enabled: Boolean(file),
    });

    const currentOcrPage = ocrPreview?.pages.find((item) => item.page_number === page) || null;
    const selectionEnabled = !readOnly;
    const useOcrSelection = selectionEnabled && Boolean(currentOcrPage?.selection_mode === "ocr" && currentOcrPage.words.length > 0);
    const ocrFindMatches = useMemo(
        () => findWordMatches(currentOcrPage?.words || [], findQuery),
        [currentOcrPage?.words, findQuery],
    );
    const nativeFindMatches = useMemo(
        () => findTextItemMatches(nativeTextItems, findQuery),
        [findQuery, nativeTextItems],
    );
    const findMatches = useOcrSelection ? ocrFindMatches : nativeFindMatches;
    const activeFindIndex = findMatches.length > 0
        ? Math.min(Math.max(0, activeFindOccurrence), findMatches.length - 1)
        : -1;
    const activeFindMatch = activeFindIndex >= 0 ? findMatches[activeFindIndex] : null;
    const backendPreviewError = serverPreviewErrorMessage(serverPreview.error);
    const previewFailure = error || backendPreviewError;
    const effectivePageCount = serverPreview.metadata?.pageCount || pageCount;
    const canRetryServerPreview = Boolean(serverPreview.error && ![400, 401, 403].includes(serverPreview.error.status || 0));

    const testId = (suffix: string) => `${testIdPrefix}-${suffix}`;

    useEffect(() => {
        onStateChange?.({
            status: !file ? "idle" : previewFailure ? "error" : isLoadingDocument || isRenderingPage || serverPreview.isLoading ? "loading" : "ready",
            page,
            pageCount: effectivePageCount,
            pageHasSelectableText,
            pageHasScannedContent,
        });
    }, [effectivePageCount, file, isLoadingDocument, isRenderingPage, onStateChange, page, pageHasScannedContent, pageHasSelectableText, previewFailure, serverPreview.isLoading]);

    useEffect(() => {
        let cancelled = false;

        const destroy = () => {
            try { textLayerInstanceRef.current?.cancel?.(); } catch { /* best effort */ }
            textLayerInstanceRef.current = null;
            try { loadingTaskRef.current?.destroy?.(); } catch { /* best effort */ }
            loadingTaskRef.current = null;
            try { pdfDocumentRef.current?.destroy?.(); } catch { /* best effort */ }
            pdfDocumentRef.current = null;
            clearElement(textLayerRef.current);
        };

        destroy();
        // The file prop is the external document selection; reset the preview when it changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPdfDocument(null);
        setPage(1);
        setPageCount(0);
        setPageHasSelectableText(false);
        setPageHasScannedContent(false);
        setPageText("");
        setNativeTextItems([]);
        setError(null);

        if (!file) return () => { cancelled = true; destroy(); };

        const load = async () => {
            setIsLoadingDocument(true);
            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
                const bytes = new Uint8Array((await file.arrayBuffer()).slice(0));
                const loadingTask = pdfjsLib.getDocument({ data: bytes });
                loadingTaskRef.current = loadingTask;
                const documentProxy = await loadingTask.promise;

                if (cancelled) {
                    try { await (documentProxy as PdfDocumentWithCleanup).destroy?.(); } catch { /* best effort */ }
                    return;
                }

                loadingTaskRef.current = null;
                pdfDocumentRef.current = documentProxy;
                setPdfDocument(documentProxy);
                setPageCount(documentProxy.numPages);
                setPage(1);
            } catch (cause) {
                if (!cancelled) {
                    setError(previewErrorMessage(cause));
                    setPdfDocument(null);
                    setPageCount(0);
                }
            } finally {
                if (!cancelled) setIsLoadingDocument(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
            destroy();
        };
    }, [file]);

    useEffect(() => {
        if (!pdfDocument || !pageFrameRef.current || !textLayerRef.current) return;

        let cancelled = false;
        let pageProxy: PDFPageProxy | null = null;
        let textLayer: TextLayer | null = null;
        let resizeObserver: ResizeObserver | null = null;
        const frame = pageFrameRef.current;
        const textLayerElement = textLayerRef.current;

        const render = async () => {
            setIsRenderingPage(true);
            setError(null);
            setPageHasSelectableText(false);
            setPageHasScannedContent(false);
            setPageText("");
            clearElement(textLayerElement);
            try {
                pageProxy = await pdfDocument.getPage(page);
                if (cancelled) return;

                const pdfjsLib = await import("pdfjs-dist");
                // PDF.js is used only for native text geometry and page classification.
                // The visible page is always the backend-rendered image below.
                const viewport = pageProxy.getViewport({ scale: 1 });
                nativePageGeometryRef.current = {
                    width: viewport.width,
                    height: viewport.height,
                    rotation: viewport.rotation,
                    cropBox: [0, 0, viewport.width, viewport.height],
                };
                frame.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
                const textContent = await pageProxy.getTextContent();
                const textItems = textContent.items
                    .filter((item): item is PdfTextItem => "str" in item && typeof item.str === "string" && Boolean(item.str.trim()));
                const text = textItems.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
                let imageContent = false;
                try {
                    imageContent = hasImageOperators(pdfjsLib, await pageProxy.getOperatorList());
                } catch {
                    // PDF.js may omit the operator list for unusual documents; text-layer state still works.
                }
                setPageText(text);
                setNativeTextItems(textItems);
                setPageHasSelectableText(textItems.length > 0);
                setPageHasScannedContent(imageContent || textItems.length === 0);

                textLayerElement.style.position = "absolute";
                textLayerElement.style.inset = "0";
                textLayerElement.style.overflow = "hidden";
                textLayerElement.style.lineHeight = "1";
                textLayerElement.style.letterSpacing = "normal";
                textLayerElement.style.wordSpacing = "normal";
                textLayerElement.style.transformOrigin = "0 0";
                textLayerElement.style.zIndex = "2";
                textLayerElement.style.pointerEvents = selectionEnabled && textItems.length > 0 ? "auto" : "none";

                if (!pdfjsLib.TextLayer) throw new Error("PDF text selection is unavailable");
                textLayer = new pdfjsLib.TextLayer({
                    textContentSource: textContent,
                    container: textLayerElement,
                    viewport,
                });
                textLayerInstanceRef.current = textLayer;
                await textLayer.render();
                if (cancelled) return;

                const resizeTextLayer = () => {
                    const scaleToFrame = frame.clientWidth > 0 ? frame.clientWidth / viewport.width : 1;
                    textLayerElement.style.width = `${viewport.width}px`;
                    textLayerElement.style.height = `${viewport.height}px`;
                    textLayerElement.style.transform = `scale(${scaleToFrame})`;
                };
                resizeTextLayer();
                if (typeof ResizeObserver !== "undefined") {
                    resizeObserver = new ResizeObserver(resizeTextLayer);
                    resizeObserver.observe(frame);
                }

                let textItemIndex = 0;
                for (const child of Array.from(textLayerElement.children) as HTMLElement[]) {
                    child.style.position = "absolute";
                    child.style.whiteSpace = "pre";
                    child.style.color = "transparent";
                    child.style.fontSize = "var(--font-height)";
                    child.style.transformOrigin = "0% 0%";
                    child.style.transform = "rotate(var(--rotate)) scaleX(var(--scale-x))";
                    child.style.userSelect = "text";
                    child.style.cursor = "text";
                    if (textItemIndex < textItems.length) {
                        child.dataset.textItemIndex = String(textItemIndex);
                        textItemIndex += 1;
                    }
                }
                setTextLayerVersion((version) => version + 1);
            } catch (cause) {
                if (!cancelled) setError(previewErrorMessage(cause));
            } finally {
                if (!cancelled) setIsRenderingPage(false);
            }
        };

        void render();
        return () => {
            cancelled = true;
            resizeObserver?.disconnect();
            try { textLayer?.cancel?.(); } catch { /* best effort */ }
            if (textLayerInstanceRef.current === textLayer) textLayerInstanceRef.current = null;
            try { pageProxy?.cleanup?.(); } catch { /* best effort */ }
            clearElement(textLayerElement);
        };
    }, [page, pdfDocument, selectionEnabled]);

    useEffect(() => {
        const root = textLayerRef.current;
        if (!root) return;

        const matchedByItem = new Map<number, number>();
        nativeFindMatches.forEach((match, occurrence) => {
            for (let index = match.startIndex; index <= match.endIndex; index += 1) {
                if (!matchedByItem.has(index)) matchedByItem.set(index, occurrence);
            }
        });

        for (const child of Array.from(root.children) as HTMLElement[]) {
            const itemIndex = Number(child.dataset.textItemIndex);
            const occurrence = Number.isInteger(itemIndex) ? matchedByItem.get(itemIndex) : undefined;
            if (occurrence === undefined) {
                delete child.dataset.findMatch;
                child.style.backgroundColor = "";
                child.style.outline = "";
                child.style.outlineOffset = "";
                continue;
            }
            child.dataset.findMatch = "true";
            child.style.backgroundColor = occurrence === activeFindIndex ? "rgba(250, 204, 21, 0.42)" : "rgba(59, 130, 246, 0.22)";
            child.style.outline = occurrence === activeFindIndex ? "2px solid rgba(217, 119, 6, 0.85)" : "1px solid rgba(37, 99, 235, 0.6)";
            child.style.outlineOffset = "1px";
        }
    }, [activeFindIndex, nativeFindMatches, textLayerVersion]);

    useEffect(() => {
        const current = activeFindMatch
            ? {
                text: activeFindMatch.text,
                page,
                source: useOcrSelection ? "ocr" as const : "native" as const,
            }
            : null;
        onFindStateChange?.({ count: findMatches.length, activeIndex: activeFindIndex, current });
    }, [activeFindIndex, activeFindMatch, findMatches.length, onFindStateChange, page, useOcrSelection]);

    useEffect(() => {
        if (!textLayerRef.current) return;
        textLayerRef.current.style.pointerEvents = !selectionEnabled || useOcrSelection ? "none" : pageHasSelectableText ? "auto" : "none";
    }, [pageHasSelectableText, selectionEnabled, useOcrSelection]);

    useEffect(() => {
        const captureSelection = () => {
            if (!selectionEnabled || !onTextSelected) return;
            const selection = window.getSelection();
            const source = useOcrSelection ? "ocr" as const : "native" as const;
            const root = source === "ocr" ? ocrLayerRef.current : textLayerRef.current;
            if (!selection || selection.isCollapsed || !root || !selection.anchorNode || !selection.focusNode) return;
            if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return;
            const text = normalizeMarkupSelectionText(selection.toString());
            if (!text || !pageFrameRef.current) return;

            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (!range) return;
            const pageGeometry = source === "ocr" && currentOcrPage
                ? {
                    width: currentOcrPage.width,
                    height: currentOcrPage.height,
                    rotation: currentOcrPage.rotation,
                    cropBox: currentOcrPage.crop_box || null,
                    coordinateSpace: currentOcrPage.coordinate_space,
                }
                : {
                    width: nativePageGeometryRef.current.width,
                    height: nativePageGeometryRef.current.height,
                    rotation: nativePageGeometryRef.current.rotation,
                    cropBox: nativePageGeometryRef.current.cropBox,
                    coordinateSpace: MARKUP_COORDINATE_SPACE,
                };
            if (pageGeometry.width <= 0 || pageGeometry.height <= 0) return;

            const frame = pageFrameRef.current.getBoundingClientRect();
            const rangeRects = clientRectsToMarkupSelectionRects(
                Array.from(range.getClientRects()),
                frame,
                pageGeometry.width,
                pageGeometry.height,
            );
            const selectedElements = source === "ocr" ? selectedWordElements(root, range) : [];
            const wordIds = selectedElements
                .map((element) => element.dataset.wordId)
                .filter((value): value is string => Boolean(value));
            const rects = source === "ocr" && currentOcrPage && wordIds.length > 0
                ? wordRectsToMarkupSelectionRects(currentOcrPage.words, wordIds, pageGeometry.width, pageGeometry.height)
                : rangeRects;
            if (rects.length === 0) return;

            onTextSelected({
                text,
                page,
                source,
                geometry: {
                    page,
                    source,
                    coordinate_space: pageGeometry.coordinateSpace,
                    page_width: pageGeometry.width,
                    page_height: pageGeometry.height,
                    rotation: pageGeometry.rotation,
                    crop_box: pageGeometry.cropBox,
                    word_ids: [...new Set(wordIds)],
                    rects,
                    text,
                },
            });
        };

        let pointerSelectionActive = false;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            const root = useOcrSelection ? ocrLayerRef.current : textLayerRef.current;
            pointerSelectionActive = Boolean(root && target instanceof Node && root.contains(target));
        };
        const handlePointerUp = () => {
            if (!pointerSelectionActive) return;
            pointerSelectionActive = false;
            captureSelection();
        };
        const handleSelectionChange = () => {
            if (!pointerSelectionActive) captureSelection();
        };

        document.addEventListener("pointerdown", handlePointerDown, true);
        document.addEventListener("pointerup", handlePointerUp, true);
        document.addEventListener("selectionchange", handleSelectionChange);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
            document.removeEventListener("pointerup", handlePointerUp, true);
            document.removeEventListener("selectionchange", handleSelectionChange);
        };
    }, [currentOcrPage, onTextSelected, page, selectionEnabled, useOcrSelection]);

    const goToPage = (nextPage: number) => {
        if (nextPage === page) return;
        setPageHasSelectableText(false);
        setPageHasScannedContent(false);
        setPageText("");
        setNativeTextItems([]);
        setPage(nextPage);
    };
    const previousPage = () => goToPage(Math.max(1, page - 1));
    const nextPage = () => goToPage(Math.min(effectivePageCount, page + 1));

    if (!file) {
        return (
            <div data-testid={testId("preview")} className="flex min-h-[28rem] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] p-6 text-center text-sm text-[var(--muted)]">
                <div>
                    <MousePointer2 className="mx-auto mb-3" size={28} />
                    <p className="font-semibold text-[var(--foreground)]">Your PDF preview will appear here.</p>
                    <p className="mt-1">Choose a PDF to review it and select text before applying a mark.</p>
                </div>
            </div>
        );
    }

    const hasOcrPage = Boolean(currentOcrPage);
    const hasOcrWords = useOcrSelection;
    const guidance = hasOcrWords
        ? "Select text in the preview to use it as your mark target."
        : pageHasSelectableText
            ? "Drag across text in the preview to use it as your mark target."
            : pageHasScannedContent && ocrPreviewStatus === "loading"
                ? "Preparing selectable text for this image-based page…"
                : pageHasScannedContent && ocrPreviewStatus === "ready" && hasOcrPage
                    ? "No selectable text was found on this page. Use Find text or choose another language."
                : pageHasScannedContent
                    ? ocrPreviewError || "Selectable text is unavailable on this image-based page. Use Find text below instead."
                    : "Drag across text in the preview when selectable text is available.";

    return (
        <section data-testid={testId("preview")} aria-label={readOnly ? "Processed PDF result preview" : "PDF preview"} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">Preview your PDF</p>
                    <p className="text-xs text-[var(--muted)]">Select text in the page when selectable text is available.</p>
                </div>
                {effectivePageCount > 0 && (
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]">
                        <button type="button" onClick={previousPage} disabled={page <= 1 || isRenderingPage || serverPreview.isLoading} aria-label="Previous PDF page" className="rounded-lg p-1.5 hover:bg-[var(--surface-hover)] disabled:opacity-40">
                            <ChevronLeft size={16} />
                        </button>
                        <span data-testid={testId("page-indicator")}>Page {page} of {effectivePageCount}</span>
                        <button type="button" onClick={nextPage} disabled={page >= effectivePageCount || isRenderingPage || serverPreview.isLoading} aria-label="Next PDF page" className="rounded-lg p-1.5 hover:bg-[var(--surface-hover)] disabled:opacity-40">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            <div className="relative flex min-h-[28rem] items-center justify-center overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 sm:p-5">
                {isLoadingDocument && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-secondary)]/90 text-sm text-[var(--muted)]">
                        <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Loading preview…</span>
                    </div>
                )}
                {serverPreview.isLoading && !isLoadingDocument && !previewFailure && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-secondary)]/65 text-sm text-[var(--muted)]">
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 shadow dark:bg-zinc-900/90"><Loader2 className="animate-spin" size={16} /> Preparing page preview…</span>
                    </div>
                )}
                {previewFailure && (
                    <div role="alert" data-testid={testId("preview-error")} className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--surface-secondary)]/95 p-6 text-center text-sm text-red-700 dark:text-red-300">
                        <FileWarning size={28} />
                        <p className="font-semibold">Preview unavailable</p>
                        <p className="max-w-sm text-xs">{previewFailure}</p>
                        {canRetryServerPreview && <button type="button" data-testid={testId("preview-retry")} onClick={() => { setError(null); serverPreview.retry(); }} className="mt-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]">Try again</button>}
                    </div>
                )}
                {!previewFailure && pdfDocument && (
                    <div ref={pageFrameRef} className="relative w-full max-w-[52rem] overflow-hidden rounded-lg bg-white shadow-xl" data-testid={testId("page")}>
                        {serverPreview.src && <>
                            {/* Backend returns an owner-scoped blob URL; next/image cannot optimize this response. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={serverPreview.src} alt={`Processed PDF page ${page}`} data-testid={testId("backend-preview-image")} className="relative z-[1] block h-auto w-full select-none" draggable={false} onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth > 0 && image.naturalHeight > 0 && pageFrameRef.current) pageFrameRef.current.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`; }} />
                        </>}
                        <div ref={textLayerRef} data-testid={testId("text-layer")} aria-label={selectionEnabled && pageHasSelectableText ? "Selectable PDF text" : undefined} />
                        {useOcrSelection && currentOcrPage && (
                            <OcrWordSelectionLayer key={`${currentOcrPage.page_id}-${currentOcrPage.page_number}`} layerRef={ocrLayerRef} page={currentOcrPage} findMatches={ocrFindMatches} activeFindOccurrence={activeFindIndex} />
                        )}
                        {pageHasScannedContent && ocrPreviewStatus === "loading" && (
                            <div className="pointer-events-none absolute inset-x-3 top-3 z-[4] flex justify-center">
                                <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/75 px-3 py-1.5 text-xs font-medium text-white shadow"><Loader2 className="animate-spin" size={13} /> Preparing selectable text</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!readOnly && !isLoadingDocument && !previewFailure && pdfDocument && (
                <div role="status" aria-live="polite" className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]" data-testid={testId("selection-guidance")}>
                    {hasOcrWords || (!pageHasSelectableText && pageHasScannedContent) ? <ScanText className="mt-0.5 shrink-0 text-amber-600" size={15} /> : <MousePointer2 className="mt-0.5 shrink-0 text-[var(--primary)]" size={15} />}
                    <p>{guidance}</p>
                </div>
            )}
            {pageText && <span className="sr-only" data-testid={testId("page-text")}>{pageText}</span>}
        </section>
    );
}

interface OcrWordSelectionLayerProps {
    layerRef: RefObject<HTMLDivElement | null>;
    page: OcrMarkupPreviewPage;
    findMatches: MarkupFindMatch[];
    activeFindOccurrence: number;
}

function OcrWordSelectionLayer({ layerRef, page, findMatches, activeFindOccurrence }: OcrWordSelectionLayerProps) {
    const [displayScale, setDisplayScale] = useState(1);

    useEffect(() => {
        const layer = layerRef.current;
        if (!layer) return;
        const updateScale = () => {
            const width = layer.getBoundingClientRect().width;
            if (width > 0 && page.width > 0) setDisplayScale(width / page.width);
        };
        updateScale();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(updateScale);
        observer.observe(layer);
        return () => observer.disconnect();
    }, [layerRef, page.width]);

    return (
        <div ref={layerRef} className="absolute inset-0 z-[3] select-text" data-testid="markup-pdf-ocr-layer" aria-label="Selectable scanned text" style={{ userSelect: "text", WebkitUserSelect: "text", pointerEvents: "auto", touchAction: "auto" }}>
            {page.words.map((word, index) => {
                const left = Math.max(0, Math.min(100, (word.x / page.width) * 100));
                const top = Math.max(0, Math.min(100, (word.y / page.height) * 100));
                const width = Math.max(0, Math.min(100 - left, (word.width / page.width) * 100));
                const height = Math.max(0, Math.min(100 - top, (word.height / page.height) * 100));
                const fontSize = Math.max(1, Math.min(word.height * displayScale * 0.75, word.width * displayScale / Math.max(1, word.text.length * 0.8)));
                const lineHeight = Math.max(1, word.height * displayScale);
                const matchingOccurrences = findMatches
                    .map((match, occurrence) => ({ match, occurrence }))
                    .filter(({ match }) => index >= match.startIndex && index <= match.endIndex);
                const findOccurrence = matchingOccurrences[0]?.occurrence;
                const isFindMatch = findOccurrence !== undefined;
                const isActiveFindMatch = isFindMatch && findOccurrence === activeFindOccurrence;
                return (
                    <span
                        key={word.id}
                        aria-label={isFindMatch ? `Find match. ${word.text}` : undefined}
                        data-testid="markup-pdf-ocr-word"
                        data-word-id={word.id}
                        data-word-index={index}
                        data-find-match={isFindMatch ? "true" : undefined}
                        className="absolute block overflow-visible rounded-sm"
                        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, background: isActiveFindMatch ? "rgba(250, 204, 21, 0.42)" : isFindMatch ? "rgba(59, 130, 246, 0.22)" : "transparent", boxShadow: isActiveFindMatch ? "inset 0 0 0 2px rgba(217, 119, 6, 0.9)" : isFindMatch ? "inset 0 0 0 1px rgba(37, 99, 235, 0.65)" : undefined, color: "transparent", WebkitTextFillColor: "transparent", fontFamily: "Arial, sans-serif", fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px`, whiteSpace: "pre", userSelect: "text", WebkitUserSelect: "text", cursor: "text", pointerEvents: "auto" }}
                    >{word.text}{"\u00a0\u00a0"}</span>
                );
            })}
        </div>
    );
}
